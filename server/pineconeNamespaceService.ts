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

  // Normalize namespace names to lowercase-kebab to match actual Pinecone storage
  // e.g. "MARK_KOHL" -> "mark-kohl", "ADDICTION" -> "addiction", "willie-gault" -> "willie-gault"
  private normalizeNamespace(namespace: string): string {
    return namespace.toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  async retrieveContext(query: string, topK: number = 3, customNamespaces?: string[]): Promise<any[]> {
    if (!this.apiKey || !this.client || !this.openai) {
      throw new Error('Pinecone or OpenAI not configured');
    }

    // Normalize and deduplicate namespaces (MARK_KOHL -> mark-kohl, ADDICTION -> addiction)
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

      const QUERY_EMBEDDING_MODEL = 'text-embedding-3-small';

      log.debug('Generating embedding for query');
      const embeddingStartTime = Date.now();
      const embeddingResponse = await this.embeddingBreaker.execute({
        model: QUERY_EMBEDDING_MODEL,
        input: query,
      });
      
      const embedding = embeddingResponse.data[0].embedding;
      const embeddingDuration = Date.now() - embeddingStartTime;

      if (embedding.length !== 1536) {
        throw new Error(`Embedding dimension mismatch: expected 1536, got ${embedding.length} from model ${QUERY_EMBEDDING_MODEL}`);
      }

      log.debug({ dimensions: embedding.length, model: QUERY_EMBEDDING_MODEL }, 'Embedding generated successfully');

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

      allResults.sort((a, b) => (b.score || 0) - (a.score || 0));
      
      const topResults = allResults.slice(0, topK);

      const namespaceCounts: Record<string, number> = {};
      topResults.forEach(r => {
        const ns = r.metadata?.namespace || 'unknown';
        namespaceCounts[ns] = (namespaceCounts[ns] || 0) + 1;
      });
      
      log.info({ 
        totalResults: allResults.length, 
        topResults: topResults.length,
        namespaceSources: namespaceCounts,
        topScores: topResults.slice(0, 3).map(r => ({ ns: r.metadata?.namespace, score: r.score?.toFixed(3) }))
      }, `RAG: ${topResults.length} results from ${Object.keys(namespaceCounts).join(', ')}`);
      
      latencyCache.setPineconeQuery(query, namespacesToQuery, topK, topResults);
      log.debug({ queryPrefix: query.substring(0, 50) }, 'Cached results for query');
      
      return topResults;
      
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
