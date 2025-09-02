// In-memory cache for embeddings and search results to reduce latency
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class LatencyCache {
  private embeddings = new Map<string, CacheEntry<number[]>>();
  private searchResults = new Map<string, CacheEntry<any[]>>();
  private contextCache = new Map<string, CacheEntry<string>>();
  
  // Cache embeddings for 1 hour
  private readonly EMBEDDING_TTL = 60 * 60 * 1000;
  // Cache search results for 10 minutes 
  private readonly SEARCH_TTL = 10 * 60 * 1000;
  // Cache context for 5 minutes
  private readonly CONTEXT_TTL = 5 * 60 * 1000;
  
  // Maximum cache sizes to prevent memory overflow
  private readonly MAX_EMBEDDINGS = 1000;
  private readonly MAX_SEARCH_RESULTS = 500;
  private readonly MAX_CONTEXT_CACHE = 200;

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
      totalEntries: this.embeddings.size + this.searchResults.size + this.contextCache.size,
      limits: {
        maxEmbeddings: this.MAX_EMBEDDINGS,
        maxSearchResults: this.MAX_SEARCH_RESULTS,
        maxContextCache: this.MAX_CONTEXT_CACHE
      }
    };
  }
}

export const latencyCache = new LatencyCache();

// Cleanup expired entries every 5 minutes
setInterval(() => {
  latencyCache.cleanup();
}, 5 * 60 * 1000);