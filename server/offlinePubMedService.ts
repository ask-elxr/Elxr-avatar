import { createReadStream } from 'fs';
import { createGunzip } from 'zlib';
import { parseStringPromise } from 'xml2js';
import XmlStream from 'node-xml-stream';
import { OpenAI } from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { logger } from './logger';
import { wrapServiceCall } from './circuitBreaker';
import type { PubMedArticle } from './pubmedService';

const OFFLINE_NAMESPACE = 'pubmed-offline';
const CACHE_INDEX = 'ask-elxr';
const BATCH_SIZE = 100;

let openaiClient: OpenAI | null = null;
let pineconeClient: Pinecone | null = null;

if (process.env.OPENAI_API_KEY) {
  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
} else {
  logger.warn({ service: 'offline-pubmed' }, 'OPENAI_API_KEY not set - offline PubMed disabled');
}

if (process.env.PINECONE_API_KEY) {
  pineconeClient = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
} else {
  logger.warn({ service: 'offline-pubmed' }, 'PINECONE_API_KEY not set - offline PubMed disabled');
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
  'openai-embeddings-offline',
  { timeout: 30000, errorThresholdPercentage: 50 }
);

interface ParsedArticle {
  pmid: string;
  title: string;
  abstract?: string;
  authors: string[];
  journal: string;
  year: string;
  keywords?: string[];
}

export interface ImportProgress {
  fileName: string;
  totalArticles: number;
  processedArticles: number;
  successCount: number;
  errorCount: number;
  startTime: number;
  lastProcessedPMID?: string;
}

export async function streamParseXMLFile(
  filePath: string,
  onArticle: (article: any) => Promise<void>
): Promise<number> {
  logger.info({ service: 'offline-pubmed', operation: 'streamParseXML', filePath }, 'Starting streaming XML parse');
  
  return new Promise((resolve, reject) => {
    const gunzip = createGunzip();
    const readStream = createReadStream(filePath);
    const parser = new XmlStream();
    
    let articleCount = 0;
    let currentArticle: any = null;
    let elementStack: any[] = [];
    let inArticle = false;
    let pendingCallbacks = 0;
    let streamEnded = false;
    
    const checkComplete = () => {
      if (streamEnded && pendingCallbacks === 0) {
        logger.info(
          { service: 'offline-pubmed', operation: 'streamParseXML', articleCount },
          'Streaming XML parse complete'
        );
        resolve(articleCount);
      }
    };
    
    parser.on('opentag', (name: string, attrs: any) => {
      if (name === 'PubmedArticle') {
        inArticle = true;
        currentArticle = {};
        elementStack = [currentArticle];
        return;
      }
      
      if (inArticle) {
        const parent = elementStack[elementStack.length - 1];
        const newElement: any = {};
        
        if (parent[name]) {
          if (!Array.isArray(parent[name])) {
            parent[name] = [parent[name]];
          }
          parent[name].push(newElement);
        } else {
          parent[name] = newElement;
        }
        
        elementStack.push(newElement);
      }
    });
    
    parser.on('closetag', (name: string) => {
      if (name === 'PubmedArticle' && inArticle) {
        inArticle = false;
        pendingCallbacks++;
        
        onArticle(currentArticle)
          .then(() => {
            articleCount++;
            currentArticle = null;
            elementStack = [];
          })
          .catch((error) => {
            logger.error({ error: error.message, articleCount }, 'Error processing article');
          })
          .finally(() => {
            pendingCallbacks--;
            checkComplete();
          });
        return;
      }
      
      if (inArticle && elementStack.length > 1) {
        elementStack.pop();
      }
    });
    
    parser.on('text', (text: string) => {
      if (inArticle && text.trim() && elementStack.length > 0) {
        const current = elementStack[elementStack.length - 1];
        const trimmedText = text.trim();
        
        if (typeof current === 'object' && Object.keys(current).length === 0) {
          const parent = elementStack[elementStack.length - 2];
          if (parent) {
            for (const key in parent) {
              if (parent[key] === current) {
                parent[key] = trimmedText;
                break;
              } else if (Array.isArray(parent[key])) {
                const index = parent[key].indexOf(current);
                if (index !== -1) {
                  parent[key][index] = trimmedText;
                  break;
                }
              }
            }
          }
        }
      }
    });
    
    parser.on('error', (error: Error) => {
      logger.error({ error: error.message }, 'XML stream parse error');
      reject(error);
    });
    
    gunzip.on('error', (error: Error) => {
      logger.error({ error: error.message }, 'Gunzip error');
      reject(error);
    });
    
    readStream.on('error', (error: Error) => {
      logger.error({ error: error.message }, 'Read stream error');
      reject(error);
    });
    
    readStream.on('end', () => {
      streamEnded = true;
      checkComplete();
    });
    
    readStream.pipe(gunzip).pipe(parser);
  });
}

export function extractArticleFromXML(xmlArticle: any): ParsedArticle | null {
  try {
    const medlineCitation = xmlArticle.MedlineCitation;
    if (!medlineCitation) {
      return null;
    }

    const pmid = medlineCitation.PMID?._?.toString() || medlineCitation.PMID?.toString();
    if (!pmid) {
      return null;
    }

    const article = medlineCitation.Article;
    if (!article) {
      return null;
    }

    const title = article.ArticleTitle || '';
    
    let abstract = '';
    if (article.Abstract?.AbstractText) {
      const abstractText = article.Abstract.AbstractText;
      if (typeof abstractText === 'string') {
        abstract = abstractText;
      } else if (Array.isArray(abstractText)) {
        abstract = abstractText.map((a: any) => {
          if (typeof a === 'string') return a;
          if (a._ && typeof a._ === 'string') return a._;
          return '';
        }).filter(Boolean).join(' ');
      } else if (abstractText._ && typeof abstractText._ === 'string') {
        abstract = abstractText._;
      }
    }

    const authors: string[] = [];
    if (article.AuthorList?.Author) {
      const authorList = Array.isArray(article.AuthorList.Author) 
        ? article.AuthorList.Author 
        : [article.AuthorList.Author];
      
      for (const author of authorList) {
        if (author.LastName && author.ForeName) {
          authors.push(`${author.LastName} ${author.ForeName}`);
        } else if (author.CollectiveName) {
          authors.push(author.CollectiveName);
        }
      }
    }

    const journal = article.Journal?.Title || article.Journal?.ISOAbbreviation || '';
    
    const year = article.Journal?.JournalIssue?.PubDate?.Year || 
                 medlineCitation.DateCompleted?.Year || 
                 medlineCitation.DateRevised?.Year || 
                 '';

    const keywords: string[] = [];
    if (medlineCitation.KeywordList?.Keyword) {
      const keywordList = Array.isArray(medlineCitation.KeywordList.Keyword)
        ? medlineCitation.KeywordList.Keyword
        : [medlineCitation.KeywordList.Keyword];
      
      for (const kw of keywordList) {
        if (typeof kw === 'string') {
          keywords.push(kw);
        } else if (kw._ && typeof kw._ === 'string') {
          keywords.push(kw._);
        }
      }
    }

    return {
      pmid,
      title,
      abstract,
      authors,
      journal,
      year,
      keywords: keywords.length > 0 ? keywords : undefined,
    };
  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack }, 'Error extracting article from XML');
    return null;
  }
}

async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await embeddingBreaker.execute(text);
    return response.data[0].embedding;
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error generating embedding');
    throw error;
  }
}

export async function storeBatchInPinecone(
  articles: ParsedArticle[],
  progress: ImportProgress
): Promise<{ success: number; errors: number }> {
  if (!pineconeClient) {
    throw new Error('Pinecone client not initialized');
  }

  const index = pineconeClient.index(CACHE_INDEX);
  const vectors: any[] = [];
  let successCount = 0;
  let errorCount = 0;

  logger.info(
    { service: 'offline-pubmed', operation: 'storeBatch', batchSize: articles.length },
    'Processing batch for Pinecone storage'
  );

  for (const article of articles) {
    try {
      const searchableText = `${article.title} ${article.abstract || ''} ${article.keywords?.join(' ') || ''}`.trim();
      
      if (!searchableText) {
        logger.warn({ pmid: article.pmid }, 'Skipping article with no searchable text');
        errorCount++;
        continue;
      }

      const embedding = await generateEmbedding(searchableText);

      const vectorId = `offline_${article.pmid}_${Date.now()}`;
      
      vectors.push({
        id: vectorId,
        values: embedding,
        metadata: {
          pmid: article.pmid,
          title: article.title,
          abstract: article.abstract || '',
          authors: article.authors.join(', '),
          journal: article.journal,
          year: article.year,
          keywords: article.keywords?.join(', ') || '',
          source: 'offline-dump',
          importedAt: new Date().toISOString(),
        },
      });

      successCount++;
      progress.lastProcessedPMID = article.pmid;

      if (vectors.length >= BATCH_SIZE) {
        await index.namespace(OFFLINE_NAMESPACE).upsert(vectors);
        logger.debug(
          { service: 'offline-pubmed', operation: 'storeBatch', count: vectors.length },
          'Batch upserted to Pinecone'
        );
        vectors.length = 0;
      }
    } catch (error: any) {
      logger.error(
        { error: error.message, pmid: article.pmid },
        'Error processing article for Pinecone'
      );
      errorCount++;
    }
  }

  if (vectors.length > 0) {
    await index.namespace(OFFLINE_NAMESPACE).upsert(vectors);
    logger.debug(
      { service: 'offline-pubmed', operation: 'storeBatch', count: vectors.length },
      'Final batch upserted to Pinecone'
    );
  }

  logger.info(
    { service: 'offline-pubmed', operation: 'storeBatch', successCount, errorCount },
    'Batch processing complete'
  );

  return { success: successCount, errors: errorCount };
}

export async function searchOfflinePubMed(
  query: string,
  maxResults = 10
): Promise<PubMedArticle[]> {
  if (!openaiClient || !pineconeClient) {
    throw new Error('OpenAI or Pinecone client not initialized');
  }

  logger.info(
    { service: 'offline-pubmed', operation: 'search', query, maxResults },
    'Searching offline PubMed database'
  );

  const embedding = await generateEmbedding(query);
  
  const index = pineconeClient.index(CACHE_INDEX);
  const queryResponse = await index.namespace(OFFLINE_NAMESPACE).query({
    vector: embedding,
    topK: maxResults,
    includeMetadata: true,
  });

  const articles: PubMedArticle[] = queryResponse.matches
    .filter((match) => match.metadata)
    .map((match) => {
      const meta = match.metadata!;
      return {
        pmid: meta.pmid as string,
        title: meta.title as string,
        abstract: meta.abstract as string,
        authors: (meta.authors as string).split(', ').filter(Boolean),
        journal: meta.journal as string,
        pubDate: meta.year as string,
        keywords: meta.keywords ? (meta.keywords as string).split(', ').filter(Boolean) : undefined,
      };
    });

  logger.info(
    { service: 'offline-pubmed', operation: 'search', resultCount: articles.length },
    'Offline PubMed search complete'
  );

  return articles;
}

export async function getOfflineStats(): Promise<{
  totalArticles: number;
  namespace: string;
}> {
  if (!pineconeClient) {
    throw new Error('Pinecone client not initialized');
  }

  try {
    logger.info(
      { service: 'offline-pubmed', operation: 'getStats' },
      'Getting offline PubMed database statistics'
    );

    const index = pineconeClient.index(CACHE_INDEX);
    const stats = await index.describeIndexStats();

    const namespaceStats = stats.namespaces?.[OFFLINE_NAMESPACE];
    const totalArticles = namespaceStats?.recordCount || 0;

    logger.info(
      { service: 'offline-pubmed', operation: 'getStats', totalArticles },
      'Offline PubMed stats retrieved'
    );

    return {
      totalArticles,
      namespace: OFFLINE_NAMESPACE,
    };
  } catch (error: any) {
    logger.error(
      { service: 'offline-pubmed', operation: 'getStats', error: error.message },
      'Failed to get offline PubMed stats'
    );
    throw error;
  }
}

export async function clearOfflineDatabase(): Promise<void> {
  if (!pineconeClient) {
    throw new Error('Pinecone client not initialized');
  }

  try {
    logger.warn(
      { service: 'offline-pubmed', operation: 'clearDatabase' },
      'Clearing offline PubMed database'
    );

    const index = pineconeClient.index(CACHE_INDEX);
    await index.namespace(OFFLINE_NAMESPACE).deleteAll();

    logger.info(
      { service: 'offline-pubmed', operation: 'clearDatabase' },
      'Offline PubMed database cleared successfully'
    );
  } catch (error: any) {
    logger.error(
      { service: 'offline-pubmed', operation: 'clearDatabase', error: error.message },
      'Failed to clear offline PubMed database'
    );
    throw error;
  }
}

export async function importPubMedDump(filePath: string): Promise<void> {
  const fileName = filePath.split('/').pop() || 'unknown';
  
  logger.info(
    { service: 'offline-pubmed', operation: 'importDump', filePath, fileName },
    'Starting PubMed dump import'
  );

  try {
    const progress: ImportProgress = {
      fileName,
      totalArticles: 0,
      processedArticles: 0,
      successCount: 0,
      errorCount: 0,
      startTime: Date.now(),
    };

    const articleBatch: any[] = [];
    const BATCH_SIZE = 1000;

    // Process articles in batches as they're parsed
    const onArticle = async (article: any) => {
      articleBatch.push(article);
      progress.processedArticles++;
      
      if (articleBatch.length >= BATCH_SIZE) {
        const batchToStore = [...articleBatch];
        articleBatch.length = 0; // Clear the batch
        
        const result = await storeBatchInPinecone(batchToStore, progress);
        progress.successCount += result.success;
        progress.errorCount += result.errors;
        
        logger.info(
          {
            service: 'offline-pubmed',
            operation: 'importDump',
            processed: progress.processedArticles,
            success: progress.successCount,
            errors: progress.errorCount,
            batchSuccess: result.success,
            batchErrors: result.errors,
          },
          'Batch import progress'
        );
      }
    };

    // Use the streaming parser to process the dump file
    const totalParsed = await streamParseXMLFile(filePath, onArticle);
    progress.totalArticles = totalParsed;

    // Store remaining articles in the final batch
    if (articleBatch.length > 0) {
      const result = await storeBatchInPinecone(articleBatch, progress);
      progress.successCount += result.success;
      progress.errorCount += result.errors;
    }

    const durationMs = Date.now() - progress.startTime;

    logger.info(
      {
        service: 'offline-pubmed',
        operation: 'importDump',
        totalParsed: progress.totalArticles,
        successCount: progress.successCount,
        errorCount: progress.errorCount,
        durationMs,
      },
      'PubMed dump import completed'
    );
  } catch (error: any) {
    logger.error(
      { service: 'offline-pubmed', operation: 'importDump', error: error.message },
      'PubMed dump import failed'
    );
    throw error;
  }
}
