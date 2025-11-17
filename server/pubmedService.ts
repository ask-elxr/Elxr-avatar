import axios, { AxiosError } from 'axios';
import { parseStringPromise } from 'xml2js';
import CircuitBreaker from 'opossum';
import { logger } from './logger';

const BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
const EMAIL = 'support@elxr.ai';
const TOOL = 'elxr-ai-platform';

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

const sharedRateLimiter = new SharedRateLimiter(3);

async function searchPubMedInternal(query: string, maxResults = 20): Promise<SearchResult> {
  const url = `${BASE_URL}esearch.fcgi`;
  const params = {
    db: 'pubmed',
    term: query,
    retmode: 'xml',
    retmax: maxResults.toString(),
    email: EMAIL,
    tool: TOOL,
  };

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
  const params = {
    db: 'pubmed',
    id: pmids.join(','),
    retmode: 'xml',
    rettype: 'abstract',
    email: EMAIL,
    tool: TOOL,
  };

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

export async function searchAndFetchPubMed(
  query: string,
  maxResults = 10
): Promise<{ articles: PubMedArticle[]; formattedText: string; totalCount: number }> {
  logger.info(
    { service: 'pubmed', operation: 'searchAndFetch', query, maxResults },
    'Starting PubMed search and fetch'
  );

  const searchResult = await searchPubMed(query, maxResults);
  
  if (searchResult.pmids.length === 0) {
    return {
      articles: [],
      formattedText: 'No PubMed articles found for this query.',
      totalCount: 0,
    };
  }

  const articles = await fetchArticleDetails(searchResult.pmids);
  const formattedText = formatPubMedResults(articles);

  logger.info(
    { 
      service: 'pubmed', 
      operation: 'searchAndFetch', 
      retrievedCount: articles.length,
      totalCount: searchResult.count,
    },
    'PubMed search and fetch completed'
  );

  return {
    articles,
    formattedText,
    totalCount: searchResult.count,
  };
}

export const isAvailable = (): boolean => {
  return !searchCircuitBreaker.opened && !fetchCircuitBreaker.opened;
};
