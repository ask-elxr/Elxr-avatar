import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { wrapServiceCall } from './circuitBreaker';
import { logger } from './logger';
import { storage } from './storage';

interface WikipediaSummary {
  title: string;
  extract: string;
  description?: string;
  thumbnail?: {
    source: string;
  };
}

class WikipediaService {
  private pineconeClient?: Pinecone;
  private openai?: OpenAI;
  private pineconeApiKey: string;
  private openaiApiKey: string;
  private indexName: string;
  private embeddingBreaker: any;

  constructor() {
    this.pineconeApiKey = process.env.PINECONE_API_KEY || '';
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
    this.indexName = 'ask-elxr'; // Use ask-elxr index for Wikipedia articles
    
    if (!this.pineconeApiKey) {
      logger.warn({ service: 'wikipedia' }, 'PINECONE_API_KEY not found - Wikipedia service will not be available');
      return;
    }

    if (!this.openaiApiKey) {
      logger.warn({ service: 'wikipedia' }, 'OPENAI_API_KEY not found - Cannot generate embeddings');
      return;
    }
    
    this.pineconeClient = new Pinecone({ apiKey: this.pineconeApiKey });
    this.openai = new OpenAI({ apiKey: this.openaiApiKey });

    // Wrap OpenAI embeddings call with circuit breaker
    this.embeddingBreaker = wrapServiceCall(
      async (params: any) => {
        if (!this.openai) {
          throw new Error('OpenAI client not initialized');
        }
        return await this.openai.embeddings.create(params);
      },
      'openai-embeddings',
      { timeout: 15000, errorThresholdPercentage: 50 }
    );
  }

  isAvailable(): boolean {
    return !!this.pineconeApiKey && !!this.openaiApiKey && !!this.pineconeClient && !!this.openai;
  }

  /**
   * Fetch Wikipedia article summary from REST API
   */
  async fetchWikipediaArticle(title: string): Promise<WikipediaSummary> {
    const log = logger.child({
      service: 'wikipedia',
      operation: 'fetchArticle',
      title
    });

    try {
      const encodedTitle = encodeURIComponent(title);
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodedTitle}`;
      
      log.debug({ url }, 'Fetching Wikipedia article');
      
      const response = await fetch(url);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Wikipedia article not found: ${title}`);
        }
        throw new Error(`Wikipedia API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      log.info({ title: data.title, extractLength: data.extract?.length }, 'Wikipedia article fetched successfully');
      
      return {
        title: data.title,
        extract: data.extract,
        description: data.description,
        thumbnail: data.thumbnail
      };
    } catch (error: any) {
      log.error({ error: error.message }, 'Error fetching Wikipedia article');
      throw error;
    }
  }

  /**
   * Generate embedding for text using OpenAI
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const log = logger.child({
      service: 'openai',
      operation: 'generateEmbedding',
      textLength: text.length
    });

    try {
      log.debug('Generating embedding via OpenAI');
      const startTime = Date.now();
      
      const response = await this.embeddingBreaker.execute({
        model: 'text-embedding-3-small',
        input: text,
      });

      const embedding = response.data[0].embedding;
      const duration = Date.now() - startTime;
      
      log.debug({ dimensions: embedding.length, duration }, 'Embedding generated successfully');
      
      // Log OpenAI API call
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

  /**
   * Store Wikipedia article in Pinecone namespace
   */
  async storeInPinecone(
    articleId: string,
    text: string,
    embedding: number[],
    namespace: string,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    const log = logger.child({
      service: 'pinecone',
      operation: 'storeArticle',
      namespace,
      articleId
    });

    if (!this.pineconeClient) {
      throw new Error('Pinecone client not initialized');
    }

    try {
      const index = this.pineconeClient.index(this.indexName);
      const startTime = Date.now();
      
      await index.namespace(namespace).upsert([
        {
          id: articleId,
          values: embedding,
          metadata: {
            text,
            source: 'wikipedia',
            timestamp: new Date().toISOString(),
            ...metadata
          }
        }
      ]);

      const duration = Date.now() - startTime;
      
      log.info({ duration }, `Stored article in Pinecone namespace "${namespace}"`);
      
      // Log Pinecone API call
      storage.logApiCall({
        serviceName: 'pinecone',
        endpoint: `index.namespace(${namespace}).upsert`,
        userId: null,
        responseTimeMs: duration,
      }).catch((error) => {
        log.error({ error: error.message }, 'Failed to log API call');
      });
      
    } catch (error: any) {
      log.error({ error: error.message }, 'Error storing article in Pinecone');
      throw error;
    }
  }

  /**
   * Search Wikipedia and return summary of the most relevant article
   * Used for avatar responses to provide Wikipedia context
   */
  async searchAndSummarize(query: string): Promise<string | null> {
    const log = logger.child({
      service: 'wikipedia',
      operation: 'searchAndSummarize',
      query
    });

    if (!this.isAvailable()) {
      log.warn('Wikipedia service not available');
      return null;
    }

    try {
      log.debug('Searching Wikipedia');
      const startTime = Date.now();

      // Step 1: Search Wikipedia for relevant articles
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json&origin=*`;
      const searchResponse = await fetch(searchUrl);
      
      if (!searchResponse.ok) {
        log.error({ status: searchResponse.status }, 'Wikipedia search API error');
        return null;
      }

      const searchData = await searchResponse.json();
      const searchResults = searchData.query?.search || [];
      
      if (searchResults.length === 0) {
        log.debug('No Wikipedia search results found');
        return null;
      }

      // Step 2: Get summaries for top results
      const summaries: string[] = [];
      for (const result of searchResults.slice(0, 2)) {
        try {
          const article = await this.fetchWikipediaArticle(result.title);
          if (article.extract && article.extract.length > 50) {
            summaries.push(`**${article.title}**: ${article.extract}`);
          }
        } catch (error) {
          log.debug({ title: result.title }, 'Could not fetch article summary');
        }
      }

      const duration = Date.now() - startTime;
      
      if (summaries.length === 0) {
        log.debug({ duration }, 'No usable Wikipedia summaries found');
        return null;
      }

      const result = summaries.join('\n\n');
      log.info({ 
        duration, 
        articlesFound: summaries.length,
        resultLength: result.length 
      }, 'Wikipedia search completed');

      // Log API call
      storage.logApiCall({
        serviceName: 'wikipedia',
        endpoint: 'searchAndSummarize',
        userId: null,
        responseTimeMs: duration,
      }).catch((error) => {
        log.error({ error: error.message }, 'Failed to log API call');
      });

      return result;
    } catch (error: any) {
      log.error({ error: error.message }, 'Error searching Wikipedia');
      return null;
    }
  }

  /**
   * Sync Wikipedia article to Pinecone namespace
   * This is the main method that orchestrates fetching, embedding, and storing
   */
  async syncArticleToNamespace(
    title: string,
    namespace: string,
    additionalMetadata: Record<string, any> = {}
  ): Promise<{ success: boolean; articleId: string; message: string }> {
    const log = logger.child({
      service: 'wikipedia',
      operation: 'syncArticle',
      title,
      namespace
    });

    if (!this.isAvailable()) {
      throw new Error('Wikipedia service not available - check PINECONE_API_KEY and OPENAI_API_KEY');
    }

    try {
      log.info('Starting Wikipedia article sync');
      
      // Step 1: Fetch Wikipedia article
      const article = await this.fetchWikipediaArticle(title);
      
      if (!article.extract || article.extract.trim().length === 0) {
        throw new Error('Wikipedia article has no content');
      }

      // Step 2: Generate embedding
      const embedding = await this.generateEmbedding(article.extract);
      
      // Step 3: Create article ID
      const articleId = `wiki_${title.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
      
      // Step 4: Store in Pinecone
      await this.storeInPinecone(
        articleId,
        article.extract,
        embedding,
        namespace,
        {
          title: article.title,
          description: article.description,
          thumbnailUrl: article.thumbnail?.source,
          ...additionalMetadata
        }
      );

      const message = `Successfully synced Wikipedia article "${article.title}" to namespace "${namespace}"`;
      log.info({ articleId }, message);
      
      return {
        success: true,
        articleId,
        message
      };
      
    } catch (error: any) {
      const errorMessage = `Failed to sync Wikipedia article: ${error.message}`;
      log.error({ error: error.message, stack: error.stack }, errorMessage);
      
      return {
        success: false,
        articleId: '',
        message: errorMessage
      };
    }
  }

  /**
   * Sync multiple Wikipedia articles to a namespace
   */
  async syncMultipleArticles(
    titles: string[],
    namespace: string,
    additionalMetadata: Record<string, any> = {}
  ): Promise<{ total: number; successful: number; failed: number; results: any[] }> {
    const log = logger.child({
      service: 'wikipedia',
      operation: 'syncMultipleArticles',
      namespace,
      count: titles.length
    });

    log.info(`Starting sync of ${titles.length} articles to namespace "${namespace}"`);
    
    const results = [];
    let successful = 0;
    let failed = 0;

    for (const title of titles) {
      try {
        const result = await this.syncArticleToNamespace(title, namespace, additionalMetadata);
        results.push(result);
        
        if (result.success) {
          successful++;
        } else {
          failed++;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error: any) {
        log.error({ title, error: error.message }, `Failed to sync article: ${title}`);
        results.push({
          success: false,
          articleId: '',
          message: `Error syncing ${title}: ${error.message}`
        });
        failed++;
      }
    }

    log.info({ successful, failed, total: titles.length }, 'Completed syncing multiple articles');
    
    return {
      total: titles.length,
      successful,
      failed,
      results
    };
  }
}

export const wikipediaService = new WikipediaService();
