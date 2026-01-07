import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { latencyCache } from './cache';
import { wrapServiceCall } from './circuitBreaker';
import { logger } from './logger';
import { metrics } from './metrics';
import { storage } from './storage';

// Namespace-based Pinecone service - cheaper than Assistants API
class PineconeNamespaceService {
  private client?: Pinecone;
  private openai?: OpenAI;
  private apiKey: string;
  private indexName: string;
  private namespaces: string[];
  private queryBreaker: any;
  private embeddingBreaker: any;

  constructor() {
    this.apiKey = process.env.PINECONE_API_KEY || '';
    this.indexName = 'ask-elxr'; // Use ask-elxr index where data is stored
    this.namespaces = ['mark-kohl', 'default']; // Query Mark's namespace + general
    
    if (!this.apiKey) {
      logger.warn({ service: 'pinecone' }, 'PINECONE_API_KEY not found - Namespace service will not be available');
      return;
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      logger.warn({ service: 'openai' }, 'OPENAI_API_KEY not found - Cannot generate embeddings');
      return;
    }
    
    this.client = new Pinecone({ apiKey: this.apiKey });
    this.openai = new OpenAI({ apiKey: openaiKey });

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

    this.queryBreaker = wrapServiceCall(
      async (namespace: string, queryParams: any) => {
        if (!this.client) {
          throw new Error('Pinecone client not initialized');
        }
        const index = this.client.index(this.indexName);
        return await index.namespace(namespace).query(queryParams);
      },
      'pinecone',
      { timeout: 10000, errorThresholdPercentage: 50 }
    );
  }

  // Helper to normalize namespace names - keep UPPERCASE to match Pinecone storage
  private normalizeNamespace(namespace: string): string {
    return namespace.toUpperCase()
      .replace(/[^A-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  async retrieveContext(query: string, topK: number = 3, customNamespaces?: string[]): Promise<any[]> {
    if (!this.apiKey || !this.client || !this.openai) {
      throw new Error('Pinecone or OpenAI not configured');
    }

    // Normalize and deduplicate namespaces (ADDICTION -> addiction, MARK_KOHL -> mark-kohl)
    const rawNamespaces = customNamespaces || this.namespaces;
    const normalizedNamespaces = rawNamespaces.map(ns => this.normalizeNamespace(ns));
    const namespacesToQuery = Array.from(new Set(normalizedNamespaces)).sort();

    const log = logger.child({
      service: 'pinecone',
      operation: 'retrieveContext',
      queryLength: query.length,
      topK,
      rawNamespaces: rawNamespaces,
      normalizedNamespaces: namespacesToQuery,
      rawCount: rawNamespaces.length,
      deduplicatedCount: namespacesToQuery.length
    });

    try {
      // Check cache first (using deduplicated & sorted namespaces)
      const cachedResults = latencyCache.getPineconeQuery(query, namespacesToQuery, topK);
      if (cachedResults) {
        log.debug({ cacheHit: true }, `Cache HIT for query: "${query.substring(0, 50)}..."`);
        metrics.recordPineconeCacheHit();
        return cachedResults;
      }
      
      log.debug({ cacheMiss: true }, `Cache MISS for query: "${query.substring(0, 50)}..."`);
      metrics.recordPineconeCacheMiss();

      // Generate embedding for the query using OpenAI
      log.debug('Generating embedding for query');
      const embeddingStartTime = Date.now();
      const embeddingResponse = await this.embeddingBreaker.execute({
        model: 'text-embedding-ada-002',
        input: query,
      });
      
      const embedding = embeddingResponse.data[0].embedding;
      const embeddingDuration = Date.now() - embeddingStartTime;
      log.debug({ dimensions: embedding.length }, 'Embedding generated successfully');

      // Log OpenAI embedding API call
      storage.logApiCall({
        serviceName: 'openai',
        endpoint: 'embeddings.create',
        userId: null,
        responseTimeMs: embeddingDuration,
      }).catch((error) => {
        log.error({ error: error.message }, 'Failed to log API call');
      });

      // Query across all namespaces in parallel and combine results
      log.debug(`Querying ${namespacesToQuery.length} namespaces in parallel`);
      
      const namespaceQueries = namespacesToQuery.map(async (namespace) => {
        try {
          log.debug({ namespace }, `Querying namespace: ${namespace}`);
          
          const queryStartTime = Date.now();
          const queryResponse = await this.queryBreaker.execute(namespace, {
            vector: embedding,
            topK: topK,
            includeMetadata: true,
          });
          const queryDuration = Date.now() - queryStartTime;

          // Log Pinecone query API call
          storage.logApiCall({
            serviceName: 'pinecone',
            endpoint: `index.namespace(${namespace}).query`,
            userId: null,
            responseTimeMs: queryDuration,
          }).catch((error) => {
            log.error({ error: error.message }, 'Failed to log API call');
          });

          if (queryResponse.matches && queryResponse.matches.length > 0) {
            log.debug({ namespace, count: queryResponse.matches.length }, 
              `Found ${queryResponse.matches.length} results in ${namespace}`);
            
            // Extract text from metadata and format results
            const results = [];
            for (const match of queryResponse.matches) {
              if (match.metadata && match.metadata.text) {
                results.push({
                  text: match.metadata.text as string,
                  score: match.score || 0,
                  metadata: {
                    namespace: namespace,
                    ...match.metadata
                  }
                });
              }
            }
            return results;
          } else {
            log.debug({ namespace }, `No results in ${namespace}`);
            return [];
          }
        } catch (error: any) {
          log.error({ namespace, error: error.message }, `Error querying namespace ${namespace}`);
          return [];
        }
      });

      // Wait for all queries to complete in parallel
      const namespaceResults = await Promise.all(namespaceQueries);
      
      // Flatten all results into single array
      const allResults = namespaceResults.flat();

      if (allResults.length === 0) {
        log.info('No results from any namespace');
        return [];
      }

      // Sort all results by score (highest first)
      allResults.sort((a, b) => (b.score || 0) - (a.score || 0));
      
      // Take top results
      const topResults = allResults.slice(0, topK);
      
      // Combine text from top results
      const combinedText = topResults
        .map((r, i) => `[Result ${i + 1} from ${r.metadata.namespace}]\n${r.text}`)
        .join('\n\n---\n\n');

      log.info({ 
        totalResults: allResults.length, 
        topResults: topResults.length,
        combinedLength: combinedText.length 
      }, `Retrieved ${topResults.length} results from Pinecone`);

      const results = [{
        text: combinedText,
        score: topResults[0]?.score || 0,
        metadata: {
          namespaces: namespacesToQuery,
          totalResults: allResults.length,
          topResults: topResults.length
        }
      }];
      
      // Cache the results for future queries
      latencyCache.setPineconeQuery(query, namespacesToQuery, topK, results);
      log.debug({ queryPrefix: query.substring(0, 50) }, 'Cached results for query');
      
      return results;
      
    } catch (error: any) {
      log.error({ error: error.message, stack: error.stack }, 'Error retrieving context from Pinecone');
      throw error;
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey && !!this.client && !!this.openai;
  }

  // Configure which namespaces to query
  setNamespaces(namespaces: string[]) {
    this.namespaces = namespaces;
  }

  // Configure which index to use
  setIndex(indexName: string) {
    this.indexName = indexName;
  }
}

export const pineconeNamespaceService = new PineconeNamespaceService();
