// In-memory cache for embeddings and search results to reduce latency
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

interface SessionRagContext {
  knowledgeContext: string;
  memoryContext: string;
  conversationHistory: Array<{ message: string; isUser: boolean }>;
  lastQuery: string;
}

class LatencyCache {
  private embeddings = new Map<string, CacheEntry<number[]>>();
  private searchResults = new Map<string, CacheEntry<any[]>>();
  private contextCache = new Map<string, CacheEntry<string>>();
  private pineconeQueryCache = new Map<string, CacheEntry<any[]>>();
  private sessionRagCache = new Map<string, CacheEntry<SessionRagContext>>();
  
  // Persistent metrics counters (no side effects)
  private pineconeHits = 0;
  private pineconeMisses = 0;
  
  // Cache embeddings for 1 hour
  private readonly EMBEDDING_TTL = 60 * 60 * 1000;
  // Cache search results for 10 minutes 
  private readonly SEARCH_TTL = 10 * 60 * 1000;
  // Cache context for 5 minutes
  private readonly CONTEXT_TTL = 5 * 60 * 1000;
  // Cache Pinecone queries for 45 seconds (fast follow-ups)
  private readonly PINECONE_QUERY_TTL = 45 * 1000;
  // Cache session RAG context for 10 minutes (async retrieval pattern)
  private readonly SESSION_RAG_TTL = 10 * 60 * 1000;
  
  // Maximum cache sizes to prevent memory overflow (reduced for stability)
  private readonly MAX_EMBEDDINGS = 100;
  private readonly MAX_SEARCH_RESULTS = 50;
  private readonly MAX_CONTEXT_CACHE = 25;
  private readonly MAX_PINECONE_QUERIES = 100;
  private readonly MAX_SESSION_RAG = 200;

  private isExpired<T>(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  // Embedding cache
  setEmbedding(text: string, embedding: number[]): void {
    const key = this.hashText(text);
    
    // Check if we need to clean up to prevent memory overflow
    if (this.embeddings.size >= this.MAX_EMBEDDINGS) {
      this.cleanupOldest(this.embeddings, Math.floor(this.MAX_EMBEDDINGS / 2));
    }
    
    this.embeddings.set(key, {
      data: embedding,
      timestamp: Date.now(),
      ttl: this.EMBEDDING_TTL
    });
  }

  getEmbedding(text: string): number[] | null {
    const key = this.hashText(text);
    const entry = this.embeddings.get(key);
    
    if (!entry || this.isExpired(entry)) {
      if (entry) this.embeddings.delete(key);
      return null;
    }
    
    return entry.data;
  }

  // Search results cache
  setSearchResults(query: string, results: any[]): void {
    const key = this.hashText(query);
    
    // Check if we need to clean up to prevent memory overflow
    if (this.searchResults.size >= this.MAX_SEARCH_RESULTS) {
      this.cleanupOldest(this.searchResults, Math.floor(this.MAX_SEARCH_RESULTS / 2));
    }
    
    this.searchResults.set(key, {
      data: results,
      timestamp: Date.now(),
      ttl: this.SEARCH_TTL
    });
  }

  getSearchResults(query: string): any[] | null {
    const key = this.hashText(query);
    const entry = this.searchResults.get(key);
    
    if (!entry || this.isExpired(entry)) {
      if (entry) this.searchResults.delete(key);
      return null;
    }
    
    return entry.data;
  }

  // Context cache
  setContext(query: string, context: string): void {
    const key = this.hashText(query);
    
    // Check if we need to clean up to prevent memory overflow
    if (this.contextCache.size >= this.MAX_CONTEXT_CACHE) {
      this.cleanupOldest(this.contextCache, Math.floor(this.MAX_CONTEXT_CACHE / 2));
    }
    
    this.contextCache.set(key, {
      data: context,
      timestamp: Date.now(),
      ttl: this.CONTEXT_TTL
    });
  }

  getContext(query: string): string | null {
    const key = this.hashText(query);
    const entry = this.contextCache.get(key);
    
    if (!entry || this.isExpired(entry)) {
      if (entry) this.contextCache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  // Pinecone query cache with normalized keys (deduplicate + sort for canonical keys)
  private normalizePineconeKey(query: string, namespaces: string[], topK: number): string {
    const normalizedQuery = query.toLowerCase().trim();
    // Deduplicate and sort namespaces for canonical cache key
    const canonicalNamespaces = Array.from(new Set(namespaces)).sort().join(',');
    const composite = `${normalizedQuery}|${canonicalNamespaces}|${topK}`;
    return this.hashText(composite);
  }

  setPineconeQuery(query: string, namespaces: string[], topK: number, results: any[]): void {
    const key = this.normalizePineconeKey(query, namespaces, topK);
    
    // Check if we need to clean up to prevent memory overflow
    if (this.pineconeQueryCache.size >= this.MAX_PINECONE_QUERIES) {
      this.cleanupOldest(this.pineconeQueryCache, Math.floor(this.MAX_PINECONE_QUERIES / 2));
    }
    
    this.pineconeQueryCache.set(key, {
      data: results,
      timestamp: Date.now(),
      ttl: this.PINECONE_QUERY_TTL
    });
  }

  getPineconeQuery(query: string, namespaces: string[], topK: number): any[] | null {
    const key = this.normalizePineconeKey(query, namespaces, topK);
    const entry = this.pineconeQueryCache.get(key);
    
    if (!entry || this.isExpired(entry)) {
      if (entry) this.pineconeQueryCache.delete(key);
      this.pineconeMisses++;
      return null;
    }
    
    this.pineconeHits++;
    return entry.data;
  }

  // Invalidate all Pinecone query cache (call on document ingest)
  invalidatePineconeCache(): void {
    this.pineconeQueryCache.clear();
    console.log('💾 Pinecone cache invalidated');
  }
  
  // Reset metrics counters
  resetMetrics(): void {
    this.pineconeHits = 0;
    this.pineconeMisses = 0;
  }

  // Session RAG context cache - for async retrieval pattern
  // Key format: userId:avatarId
  setSessionRagContext(userId: string, avatarId: string, context: SessionRagContext): void {
    const key = `${userId}:${avatarId}`;
    
    if (this.sessionRagCache.size >= this.MAX_SESSION_RAG) {
      this.cleanupOldest(this.sessionRagCache, Math.floor(this.MAX_SESSION_RAG / 2));
    }
    
    this.sessionRagCache.set(key, {
      data: context,
      timestamp: Date.now(),
      ttl: this.SESSION_RAG_TTL
    });
  }

  getSessionRagContext(userId: string, avatarId: string): SessionRagContext | null {
    const key = `${userId}:${avatarId}`;
    const entry = this.sessionRagCache.get(key);
    
    if (!entry || this.isExpired(entry)) {
      if (entry) this.sessionRagCache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  clearSessionRagContext(userId: string, avatarId: string): void {
    const key = `${userId}:${avatarId}`;
    this.sessionRagCache.delete(key);
  }

  // Simple hash function for cache keys
  private hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  // Cleanup expired entries periodically
  cleanup(): void {
    Array.from(this.embeddings.entries()).forEach(([key, entry]) => {
      if (this.isExpired(entry)) {
        this.embeddings.delete(key);
      }
    });
    
    Array.from(this.searchResults.entries()).forEach(([key, entry]) => {
      if (this.isExpired(entry)) {
        this.searchResults.delete(key);
      }
    });
    
    Array.from(this.contextCache.entries()).forEach(([key, entry]) => {
      if (this.isExpired(entry)) {
        this.contextCache.delete(key);
      }
    });
    
    Array.from(this.pineconeQueryCache.entries()).forEach(([key, entry]) => {
      if (this.isExpired(entry)) {
        this.pineconeQueryCache.delete(key);
      }
    });
    
    Array.from(this.sessionRagCache.entries()).forEach(([key, entry]) => {
      if (this.isExpired(entry)) {
        this.sessionRagCache.delete(key);
      }
    });
  }

  // Clean up oldest entries from a cache when it gets too large
  private cleanupOldest<T>(cache: Map<string, CacheEntry<T>>, keepCount: number): void {
    const entries = Array.from(cache.entries()).sort(([, a], [, b]) => a.timestamp - b.timestamp);
    const toRemove = entries.slice(0, entries.length - keepCount);
    
    for (const [key] of toRemove) {
      cache.delete(key);
    }
  }

  // Get cache stats
  getStats() {
    return {
      embeddings: this.embeddings.size,
      searchResults: this.searchResults.size,
      contextCache: this.contextCache.size,
      pineconeQueries: this.pineconeQueryCache.size,
      sessionRagCache: this.sessionRagCache.size,
      totalEntries: this.embeddings.size + this.searchResults.size + this.contextCache.size + this.pineconeQueryCache.size + this.sessionRagCache.size,
      limits: {
        maxEmbeddings: this.MAX_EMBEDDINGS,
        maxSearchResults: this.MAX_SEARCH_RESULTS,
        maxContextCache: this.MAX_CONTEXT_CACHE,
        maxPineconeQueries: this.MAX_PINECONE_QUERIES,
        maxSessionRag: this.MAX_SESSION_RAG
      }
    };
  }
  
  // Get cache hit metrics for monitoring (read-only accessor)
  getCacheMetrics() {
    const total = this.pineconeHits + this.pineconeMisses;
    return {
      pineconeHits: this.pineconeHits,
      pineconeMisses: this.pineconeMisses,
      totalRequests: total,
      hitRate: total > 0 ? (this.pineconeHits / total) : 0,
      cacheSize: this.pineconeQueryCache.size
    };
  }
}

export const latencyCache = new LatencyCache();

// Cleanup expired entries every 2 minutes and force garbage collection
setInterval(() => {
  try {
    latencyCache.cleanup();
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  } catch (error) {
    console.error('Error during cache cleanup:', error);
  }
}, 2 * 60 * 1000);