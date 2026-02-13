import axios, { AxiosError } from 'axios';
import { parseStringPromise } from 'xml2js';
import CircuitBreaker from 'opossum';
import { logger } from './logger';
import { OpenAI } from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { wrapServiceCall } from './circuitBreaker';
import { storage } from './storage';
import Anthropic from '@anthropic-ai/sdk';

const BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
const EMAIL = 'support@elxr.ai';
const TOOL = 'elxr-ai-platform';
const NCBI_API_KEY = process.env.NCBI_API_KEY || null; // Optional: increases rate limit from 3 to 10 req/sec
const CACHE_NAMESPACE = 'pubmed-cache';
const CACHE_INDEX = 'ask-elxr';
const CACHE_EXPIRY_DAYS = 7;

const OFFLINE_MODE = process.env.OFFLINE_MODE?.toLowerCase() === 'true';

// Log API key status on startup
if (NCBI_API_KEY) {
  logger.info({ service: 'pubmed' }, 'NCBI API key configured - using 10 req/sec rate limit');
} else {
  logger.info({ service: 'pubmed' }, 'No NCBI API key - using 3 req/sec rate limit (set NCBI_API_KEY to increase)');
}

export interface PubMedArticle {
  pmid: string;
  title: string;
  abstract?: string;
  authors: string[];
  journal: string;
  pubDate: string;
  doi?: string;
  keywords?: string[];
}

export interface PubMedSummary {
  mainFindings: string[];
  commonThemes: string[];
  controversies: string[];
  relevance: string;
  synthesisText: string;
}

interface SearchResult {
  pmids: string[];
  count: number;
}

class SharedRateLimiter {
  private queue: Array<() => void> = [];
  private processing = false;
  private readonly minDelay: number;
  private lastExecutionTime = 0;

  constructor(requestsPerSecond: number) {
    this.minDelay = 1000 / requestsPerSecond;
  }

  async throttle(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const timeSinceLastExecution = now - this.lastExecutionTime;
      
      if (timeSinceLastExecution < this.minDelay) {
        const delayNeeded = this.minDelay - timeSinceLastExecution;
        await new Promise(resolve => setTimeout(resolve, delayNeeded));
      }

      const next = this.queue.shift();
      if (next) {
        this.lastExecutionTime = Date.now();
        next();
      }
    }

    this.processing = false;
  }
}

// Rate limit: 10 req/sec with API key, 3 req/sec without
const sharedRateLimiter = new SharedRateLimiter(NCBI_API_KEY ? 10 : 3);

let openaiClient: OpenAI | null = null;
let pineconeClient: Pinecone | null = null;
let anthropicClient: Anthropic | null = null;

if (process.env.OPENAI_API_KEY) {
  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
} else {
  logger.warn({ service: 'pubmed' }, 'OPENAI_API_KEY not set - PubMed caching will be disabled');
}

if (process.env.PINECONE_API_KEY) {
  pineconeClient = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
} else {
  logger.warn({ service: 'pubmed' }, 'PINECONE_API_KEY not set - PubMed caching will be disabled');
}

if (process.env.ANTHROPIC_API_KEY) {
  anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
} else {
  logger.warn({ service: 'pubmed' }, 'ANTHROPIC_API_KEY not set - PubMed summarization will be disabled');
}

const embeddingBreaker = wrapServiceCall(
  async (text: string) => {
    if (!openaiClient) {
      throw new Error('OpenAI client not initialized');
    }
    return await openaiClient.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
  },
  'openai-embeddings',
  { timeout: 30000, errorThresholdPercentage: 50 }
);

const claudeSummarizationBreaker = wrapServiceCall(
  async (params: any) => {
    if (!anthropicClient) {
      throw new Error('Anthropic client not initialized');
    }
    return await anthropicClient.messages.create(params);
  },
  'claude-pubmed-summarization',
  { timeout: 60000, errorThresholdPercentage: 50 }
);

async function generateEmbedding(text: string): Promise<number[]> {
  const log = logger.child({
    service: 'pubmed',
    operation: 'generateEmbedding',
    textLength: text.length
  });

  try {
    log.debug('Generating embedding for PubMed cache');
    const startTime = Date.now();
    
    const response = await embeddingBreaker.execute(text);
    const embedding = response.data[0].embedding;
    const duration = Date.now() - startTime;
    
    log.debug({ dimensions: embedding.length, duration }, 'Embedding generated successfully');
    
    storage.logApiCall({
      serviceName: 'openai',
      endpoint: 'embeddings.create',
      userId: null,
      responseTimeMs: duration,
    }).catch((error) => {
      log.error({ error: error.message }, 'Failed to log API call');
    });
    
    return embedding;
  } catch (error: any) {
    log.error({ error: error.message }, 'Error generating embedding');
    throw error;
  }
}

async function checkCache(query: string): Promise<{ articles: PubMedArticle[]; totalCount: number; summary?: PubMedSummary | null; queryEmbedding?: number[] } | null> {
  const log = logger.child({ service: 'pubmed', operation: 'checkCache' });

  if (!openaiClient || !pineconeClient) {
    log.debug('Caching not available - missing OpenAI or Pinecone client');
    return null;
  }

  try {
    log.info({ query }, 'Checking PubMed cache for query');
    
    const queryEmbedding = await generateEmbedding(query);
    const index = pineconeClient.index(CACHE_INDEX);
    
    const searchResults = await index.namespace(CACHE_NAMESPACE).query({
      vector: queryEmbedding,
      topK: 1,
      includeMetadata: true,
    });

    if (searchResults.matches && searchResults.matches.length > 0) {
      const match = searchResults.matches[0];
      
      if (match.score && match.score > 0.95) {
        const metadata = match.metadata as any;
        const cachedTimestamp = new Date(metadata.timestamp);
        const now = new Date();
        const ageInDays = (now.getTime() - cachedTimestamp.getTime()) / (1000 * 60 * 60 * 24);

        if (ageInDays <= CACHE_EXPIRY_DAYS) {
          log.info(
            { 
              query, 
              cacheHit: true, 
              similarity: match.score,
              ageInDays: ageInDays.toFixed(2),
              cachedQuery: metadata.query 
            },
            'PubMed cache HIT - returning cached results'
          );

          const articles: PubMedArticle[] = JSON.parse(metadata.articles);
          const totalCount = metadata.totalCount || articles.length;
          const summary = metadata.summary ? JSON.parse(metadata.summary) : null;

          return { articles, totalCount, summary, queryEmbedding };
        } else {
          log.info(
            { query, cacheExpired: true, ageInDays: ageInDays.toFixed(2) },
            'Cached results expired - returning embedding for reuse'
          );
          return { articles: [], totalCount: 0, queryEmbedding };
        }
      } else {
        log.debug(
          { query, similarity: match.score },
          'Cache similarity too low - returning embedding for reuse'
        );
        return { articles: [], totalCount: 0, queryEmbedding };
      }
    } else {
      log.info({ query }, 'PubMed cache MISS - returning embedding for reuse');
      return { articles: [], totalCount: 0, queryEmbedding };
    }

    return null;
  } catch (error: any) {
    log.error({ error: error.message }, 'Error checking PubMed cache');
    return null;
  }
}

async function cacheResults(
  query: string,
  articles: PubMedArticle[],
  totalCount: number,
  queryEmbedding?: number[],
  summary?: PubMedSummary | null
): Promise<void> {
  const log = logger.child({ service: 'pubmed', operation: 'cacheResults' });

  if (!openaiClient || !pineconeClient) {
    log.debug('Caching not available - missing OpenAI or Pinecone client');
    return;
  }

  try {
    log.info({ query, articleCount: articles.length, totalCount }, 'Caching PubMed results');
    
    const embedding = queryEmbedding || await generateEmbedding(query);
    if (queryEmbedding) {
      log.debug('Reusing query embedding from cache check - saving OpenAI API call');
    }
    const index = pineconeClient.index(CACHE_INDEX);
    
    const cacheId = `pubmed_${Buffer.from(query).toString('base64').substring(0, 50)}_${Date.now()}`;
    
    const metadata: any = {
      query,
      articles: JSON.stringify(articles),
      totalCount,
      timestamp: new Date().toISOString(),
      source: 'pubmed',
      resultCount: articles.length,
    };

    if (summary) {
      metadata.summary = JSON.stringify(summary);
    }

    await index.namespace(CACHE_NAMESPACE).upsert([
      {
        id: cacheId,
        values: embedding,
        metadata,
      },
    ]);

    log.info({ query, cacheId, articleCount: articles.length }, 'PubMed results cached successfully');
  } catch (error: any) {
    log.error({ error: error.message }, 'Error caching PubMed results');
  }
}

async function searchPubMedInternal(query: string, maxResults = 20): Promise<SearchResult> {
  const url = `${BASE_URL}esearch.fcgi`;
  const params: Record<string, string> = {
    db: 'pubmed',
    term: query,
    retmode: 'xml',
    retmax: maxResults.toString(),
    email: EMAIL,
    tool: TOOL,
  };
  
  // Add API key if configured (increases rate limit from 3 to 10 req/sec)
  if (NCBI_API_KEY) {
    params.api_key = NCBI_API_KEY;
  }

  logger.info(
    { service: 'pubmed', operation: 'search', query, maxResults },
    'Searching PubMed'
  );

  await sharedRateLimiter.throttle();

  try {
    const response = await axios.get(url, { 
      params,
      timeout: 30000,
    });
    
    const result = await parseStringPromise(response.data, {
      explicitArray: false,
      mergeAttrs: true,
    });

    const pmids: string[] = result.eSearchResult?.IdList?.Id || [];
    const pmidsArray = Array.isArray(pmids) ? pmids : [pmids];
    const count = parseInt(result.eSearchResult?.Count || '0');

    logger.info(
      { service: 'pubmed', operation: 'search', foundCount: pmidsArray.length, totalCount: count },
      'PubMed search completed'
    );

    return {
      pmids: pmidsArray.filter(Boolean),
      count,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error(
        { 
          service: 'pubmed', 
          operation: 'search', 
          error: error.message,
          status: error.response?.status,
        },
        'PubMed search failed'
      );
    }
    throw error;
  }
}

async function fetchArticleDetailsInternal(pmids: string[]): Promise<PubMedArticle[]> {
  if (pmids.length === 0) {
    return [];
  }

  const url = `${BASE_URL}efetch.fcgi`;
  const params: Record<string, string> = {
    db: 'pubmed',
    id: pmids.join(','),
    retmode: 'xml',
    rettype: 'abstract',
    email: EMAIL,
    tool: TOOL,
  };
  
  // Add API key if configured (increases rate limit from 3 to 10 req/sec)
  if (NCBI_API_KEY) {
    params.api_key = NCBI_API_KEY;
  }

  logger.info(
    { service: 'pubmed', operation: 'fetch', pmidCount: pmids.length },
    'Fetching PubMed article details'
  );

  await sharedRateLimiter.throttle();

  try {
    const response = await axios.get(url, { 
      params,
      timeout: 30000,
    });
    
    const result = await parseStringPromise(response.data, {
      explicitArray: false,
      mergeAttrs: true,
    });

    const articles = result.PubmedArticleSet?.PubmedArticle || [];
    const articlesArray = Array.isArray(articles) ? articles : [articles];

    const parsedArticles = articlesArray.map(parseArticle).filter(Boolean) as PubMedArticle[];

    logger.info(
      { service: 'pubmed', operation: 'fetch', parsedCount: parsedArticles.length },
      'PubMed articles fetched and parsed'
    );

    return parsedArticles;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error(
        { 
          service: 'pubmed', 
          operation: 'fetch', 
          error: error.message,
          status: error.response?.status,
        },
        'PubMed fetch failed'
      );
    }
    throw error;
  }
}

function parseArticle(article: any): PubMedArticle | null {
  try {
    const medlineCitation = article.MedlineCitation;
    const pubmedData = article.PubmedData;

    const pmid = medlineCitation?.PMID?._ || medlineCitation?.PMID || '';
    
    const title = medlineCitation?.Article?.ArticleTitle || 'No title';
    
    const abstractText = medlineCitation?.Article?.Abstract?.AbstractText;
    let abstract: string | undefined;
    
    if (abstractText) {
      if (Array.isArray(abstractText)) {
        abstract = abstractText.map(a => {
          if (typeof a === 'string') return a;
          if (a.Label) return `${a.Label}: ${a._ || ''}`;
          return a._ || a;
        }).join(' ');
      } else if (typeof abstractText === 'object') {
        abstract = abstractText._ || abstractText;
      } else {
        abstract = abstractText;
      }
    }

    const authorList = medlineCitation?.Article?.AuthorList?.Author || [];
    const authorsArray = Array.isArray(authorList) ? authorList : [authorList];
    const authors = authorsArray
      .map((author: any) => {
        const lastName = author.LastName || '';
        const initials = author.Initials || '';
        const foreName = author.ForeName || '';
        
        if (lastName && foreName) {
          return `${foreName} ${lastName}`;
        } else if (lastName && initials) {
          return `${lastName} ${initials}`;
        } else if (author.CollectiveName) {
          return author.CollectiveName;
        }
        return '';
      })
      .filter(Boolean);

    const journal = medlineCitation?.Article?.Journal?.Title || 
                   medlineCitation?.Article?.Journal?.ISOAbbreviation || '';

    const pubDate = medlineCitation?.Article?.Journal?.JournalIssue?.PubDate;
    const year = pubDate?.Year || '';
    const month = pubDate?.Month || '';
    const day = pubDate?.Day || '';
    const formattedDate = [year, month, day].filter(Boolean).join('-');

    const articleIdList = pubmedData?.ArticleIdList?.ArticleId || [];
    const articleIdsArray = Array.isArray(articleIdList) ? articleIdList : [articleIdList];
    const doiObj = articleIdsArray.find((id: any) => id.IdType === 'doi');
    const doi = doiObj?._ || doiObj || undefined;

    const keywordList = medlineCitation?.KeywordList?.Keyword || [];
    const keywordsArray = Array.isArray(keywordList) ? keywordList : [keywordList];
    const keywords = keywordsArray
      .map((kw: any) => (typeof kw === 'string' ? kw : kw._ || ''))
      .filter(Boolean);

    return {
      pmid,
      title,
      abstract,
      authors,
      journal,
      pubDate: formattedDate,
      doi,
      keywords: keywords.length > 0 ? keywords : undefined,
    };
  } catch (error) {
    logger.error(
      { service: 'pubmed', operation: 'parseArticle', error },
      'Failed to parse article'
    );
    return null;
  }
}

const searchCircuitBreaker = new CircuitBreaker(searchPubMedInternal, {
  timeout: 35000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  name: 'pubmed-search',
});

const fetchCircuitBreaker = new CircuitBreaker(fetchArticleDetailsInternal, {
  timeout: 35000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  name: 'pubmed-fetch',
});

searchCircuitBreaker.on('open', () => {
  logger.error({ service: 'pubmed', operation: 'search', breakerState: 'open' }, 'Circuit breaker OPENED for PubMed search - requests will be rejected');
});

searchCircuitBreaker.on('halfOpen', () => {
  logger.warn({ service: 'pubmed', operation: 'search', breakerState: 'half-open' }, 'Circuit breaker HALF-OPEN for PubMed search - testing recovery');
});

searchCircuitBreaker.on('close', () => {
  logger.info({ service: 'pubmed', operation: 'search', breakerState: 'closed' }, 'Circuit breaker CLOSED for PubMed search - service recovered');
});

fetchCircuitBreaker.on('open', () => {
  logger.error({ service: 'pubmed', operation: 'fetch', breakerState: 'open' }, 'Circuit breaker OPENED for PubMed fetch - requests will be rejected');
});

fetchCircuitBreaker.on('halfOpen', () => {
  logger.warn({ service: 'pubmed', operation: 'fetch', breakerState: 'half-open' }, 'Circuit breaker HALF-OPEN for PubMed fetch - testing recovery');
});

fetchCircuitBreaker.on('close', () => {
  logger.info({ service: 'pubmed', operation: 'fetch', breakerState: 'closed' }, 'Circuit breaker CLOSED for PubMed fetch - service recovered');
});

export async function searchPubMed(query: string, maxResults = 20): Promise<SearchResult> {
  return searchCircuitBreaker.fire(query, maxResults);
}

export async function fetchArticleDetails(pmids: string[]): Promise<PubMedArticle[]> {
  const batchSize = 200;
  const results: PubMedArticle[] = [];

  for (let i = 0; i < pmids.length; i += batchSize) {
    const batch = pmids.slice(i, i + batchSize);
    const articles = await fetchCircuitBreaker.fire(batch);
    results.push(...articles);
  }

  return results;
}

export function formatPubMedResults(articles: PubMedArticle[]): string {
  if (articles.length === 0) {
    return 'No PubMed articles found.';
  }

  const formattedArticles = articles.map((article, index) => {
    const parts: string[] = [
      `\n[${index + 1}] PMID: ${article.pmid}`,
      `Title: ${article.title}`,
      `Authors: ${article.authors.slice(0, 5).join(', ')}${article.authors.length > 5 ? ', et al.' : ''}`,
      `Journal: ${article.journal} (${article.pubDate})`,
    ];

    if (article.doi) {
      parts.push(`DOI: ${article.doi}`);
    }

    if (article.keywords && article.keywords.length > 0) {
      parts.push(`Keywords: ${article.keywords.join(', ')}`);
    }

    if (article.abstract) {
      const truncatedAbstract = article.abstract.length > 500
        ? article.abstract.substring(0, 500) + '...'
        : article.abstract;
      parts.push(`Abstract: ${truncatedAbstract}`);
    }

    return parts.join('\n');
  });

  return formattedArticles.join('\n\n---');
}

export async function summarizeResults(
  articles: PubMedArticle[],
  userQuery: string
): Promise<PubMedSummary | null> {
  const log = logger.child({
    service: 'pubmed',
    operation: 'summarizeResults',
    articleCount: articles.length,
    queryLength: userQuery.length
  });

  if (!anthropicClient) {
    log.warn('Anthropic client not available - summarization disabled');
    return null;
  }

  if (articles.length === 0) {
    log.warn('No articles to summarize');
    return null;
  }

  try {
    log.info('Starting PubMed results summarization');
    const startTime = Date.now();

    const articlesForClaude = articles.map(article => ({
      pmid: article.pmid,
      title: article.title,
      abstract: article.abstract || 'No abstract available',
      authors: article.authors.slice(0, 3).join(', '),
      journal: article.journal,
      year: article.pubDate.split('-')[0] || article.pubDate,
      keywords: article.keywords?.join(', ') || 'None'
    }));

    const systemPrompt = `You are a medical research analyst tasked with synthesizing findings from multiple PubMed articles. Your goal is to provide a clear, structured summary that identifies key patterns, themes, and insights across the research.`;

    const userPrompt = `Analyze the following ${articles.length} PubMed articles related to the query: "${userQuery}"

Articles:
${articlesForClaude.map((article, idx) => `
[${idx + 1}] PMID: ${article.pmid}
Title: ${article.title}
Authors: ${article.authors}
Journal: ${article.journal} (${article.year})
Keywords: ${article.keywords}
Abstract: ${article.abstract}
`).join('\n---\n')}

Please provide a comprehensive summary with the following structure:

1. MAIN FINDINGS: List 3-5 key findings that emerge across these studies. Be specific and cite PMIDs.

2. COMMON THEMES: Identify 2-4 recurring themes, patterns, or methodologies across the research.

3. CONTROVERSIES OR DIFFERENCES: Note any conflicting results, methodological differences, or areas of debate between studies. If none exist, state "No major controversies identified."

4. RELEVANCE TO QUERY: Explain how these findings directly address the original question: "${userQuery}"

5. SYNTHESIS: Provide a 2-3 paragraph synthesis that integrates the findings into a coherent narrative.

Format your response as valid JSON with this exact structure:
{
  "mainFindings": ["finding 1 (PMID: xxx)", "finding 2 (PMID: xxx)", ...],
  "commonThemes": ["theme 1", "theme 2", ...],
  "controversies": ["controversy 1" or "No major controversies identified"],
  "relevance": "explanation of relevance to query",
  "synthesisText": "2-3 paragraph synthesis"
}`;

    const response = await claudeSummarizationBreaker.execute({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ],
      system: systemPrompt
    });

    const duration = Date.now() - startTime;

    storage.logApiCall({
      serviceName: 'claude',
      endpoint: 'messages.create',
      userId: null,
      responseTimeMs: duration,
    }).catch((error) => {
      log.error({ error: error.message }, 'Failed to log API call');
    });

    const content = response.content[0];
    if (content && content.type === 'text') {
      const textContent = content.text;
      
      log.debug({ responsePreview: textContent.substring(0, 200) }, 'Claude response preview');
      
      const jsonMatch = textContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const summary: PubMedSummary = JSON.parse(jsonMatch[0]);
          
          log.info({ 
            duration, 
            articleCount: articles.length,
            mainFindingsCount: summary.mainFindings?.length || 0,
            themesCount: summary.commonThemes?.length || 0,
            controversiesCount: summary.controversies?.length || 0,
            hasRelevance: !!summary.relevance,
            hasSynthesis: !!summary.synthesisText
          }, 'PubMed summarization completed successfully');
          
          log.debug({ summaryStructure: Object.keys(summary) }, 'Summary structure');
          
          return summary;
        } catch (parseError: any) {
          log.error({ 
            error: parseError.message, 
            jsonPreview: jsonMatch[0].substring(0, 500)
          }, 'Failed to parse JSON from Claude response');
          return null;
        }
      } else {
        log.error({ textPreview: textContent.substring(0, 500) }, 'Failed to extract JSON from Claude response');
        return null;
      }
    }

    log.error('Invalid response format from Claude');
    return null;
  } catch (error: any) {
    log.error({ error: error.message, stack: error.stack }, 'Error summarizing PubMed results');
    return null;
  }
}

export async function searchAndFetchPubMed(
  query: string,
  maxResults = 10,
  generateSummary = false
): Promise<{ articles: PubMedArticle[]; formattedText: string; totalCount: number; summary?: PubMedSummary | null; fromCache?: boolean }> {
  logger.info(
    { service: 'pubmed', operation: 'searchAndFetch', query, maxResults, generateSummary },
    'Starting PubMed search and fetch'
  );

  const cachedResult = await checkCache(query);
  
  if (cachedResult && cachedResult.articles.length > 0) {
    const limitedArticles = cachedResult.articles.slice(0, maxResults);
    const formattedText = formatPubMedResults(limitedArticles);
    
    logger.info(
      { 
        service: 'pubmed', 
        operation: 'searchAndFetch', 
        retrievedCount: limitedArticles.length,
        totalCount: cachedResult.totalCount,
        hasSummary: !!cachedResult.summary,
        fromCache: true
      },
      'Returned cached PubMed results'
    );
    
    return {
      articles: limitedArticles,
      formattedText,
      totalCount: cachedResult.totalCount,
      summary: cachedResult.summary,
      fromCache: true,
    };
  }

  const queryEmbedding = cachedResult?.queryEmbedding;

  const searchResult = await searchPubMed(query, maxResults);
  
  if (searchResult.pmids.length === 0) {
    return {
      articles: [],
      formattedText: 'No PubMed articles found for this query.',
      totalCount: 0,
      summary: null,
      fromCache: false,
    };
  }

  const articles = await fetchArticleDetails(searchResult.pmids);
  const formattedText = formatPubMedResults(articles);

  let summary: PubMedSummary | null = null;
  if (generateSummary && articles.length > 0) {
    summary = await summarizeResults(articles, query);
  }

  await cacheResults(query, articles, searchResult.count, queryEmbedding, summary);

  logger.info(
    { 
      service: 'pubmed', 
      operation: 'searchAndFetch', 
      retrievedCount: articles.length,
      totalCount: searchResult.count,
      hasSummary: !!summary,
      fromCache: false
    },
    'PubMed search and fetch completed - results cached'
  );

  return {
    articles,
    formattedText,
    totalCount: searchResult.count,
    summary,
    fromCache: false,
  };
}

export const isAvailable = (): boolean => {
  return !searchCircuitBreaker.opened && !fetchCircuitBreaker.opened;
};

export async function searchHybrid(
  query: string,
  maxResults = 10,
  generateSummary = false
): Promise<{ articles: PubMedArticle[]; formattedText: string; totalCount: number; summary?: PubMedSummary | null; fromCache?: boolean; source?: string }> {
  logger.info(
    { service: 'pubmed', operation: 'searchHybrid', query, maxResults, offlineMode: OFFLINE_MODE },
    'Starting hybrid PubMed search'
  );

  const offlineArticles: PubMedArticle[] = [];
  const onlineArticles: PubMedArticle[] = [];
  let offlineCount = 0;
  let onlineCount = 0;
  let fromCache = false;
  let summary: PubMedSummary | null = null;

  try {
    const { searchOfflinePubMed } = await import('./offlinePubMedService.js');
    const offlineResults = await searchOfflinePubMed(query, maxResults * 2);
    
    offlineArticles.push(...offlineResults);
    offlineCount = offlineResults.length;
    
    logger.info(
      { service: 'pubmed', operation: 'searchHybrid', offlineCount },
      'Offline search completed'
    );
  } catch (error: any) {
    logger.warn(
      { service: 'pubmed', operation: 'searchHybrid', error: error.message },
      'Offline search failed or unavailable'
    );
  }

  if (!OFFLINE_MODE) {
    try {
      const onlineResults = await searchAndFetchPubMed(query, maxResults, false);
      
      onlineArticles.push(...onlineResults.articles);
      onlineCount = onlineResults.totalCount;
      fromCache = onlineResults.fromCache || false;
      
      if (generateSummary && onlineResults.summary) {
        summary = onlineResults.summary;
      }
      
      logger.info(
        { service: 'pubmed', operation: 'searchHybrid', onlineCount, fromCache },
        'Online search completed'
      );
    } catch (error: any) {
      logger.warn(
        { service: 'pubmed', operation: 'searchHybrid', error: error.message },
        'Online search failed'
      );
    }
  } else {
    logger.info(
      { service: 'pubmed', operation: 'searchHybrid' },
      'Online search skipped (OFFLINE_MODE enabled)'
    );
  }

  const pmidMap = new Map<string, PubMedArticle>();
  
  for (const article of onlineArticles) {
    pmidMap.set(article.pmid, article);
  }
  
  for (const article of offlineArticles) {
    if (!pmidMap.has(article.pmid)) {
      pmidMap.set(article.pmid, article);
    }
  }

  const parseYear = (dateStr: string): number => {
    const yearMatch = dateStr.match(/(\d{4})/);
    return yearMatch ? parseInt(yearMatch[1], 10) : 0;
  };

  let combinedArticles = Array.from(pmidMap.values());
  
  combinedArticles.sort((a, b) => {
    const yearA = parseYear(a.pubDate);
    const yearB = parseYear(b.pubDate);
    return yearB - yearA;
  });

  combinedArticles = combinedArticles.slice(0, maxResults);

  if (generateSummary && !summary && combinedArticles.length > 0) {
    summary = await summarizeResults(combinedArticles, query);
  }

  const formattedText = formatPubMedResults(combinedArticles);
  
  const sourceInfo = OFFLINE_MODE 
    ? 'offline database only' 
    : offlineCount > 0 && onlineCount > 0
      ? `hybrid (${offlineCount} offline + ${onlineCount} online, ${pmidMap.size - combinedArticles.length} duplicates removed)`
      : offlineCount > 0
        ? 'offline database only'
        : 'online API only';

  logger.info(
    { 
      service: 'pubmed', 
      operation: 'searchHybrid',
      offlineCount,
      onlineCount,
      totalUnique: pmidMap.size,
      returned: combinedArticles.length,
      source: sourceInfo,
      hasSummary: !!summary
    },
    'Hybrid search completed'
  );

  return {
    articles: combinedArticles,
    formattedText,
    totalCount: pmidMap.size,
    summary,
    fromCache: fromCache && offlineCount === 0,
    source: sourceInfo,
  };
}
