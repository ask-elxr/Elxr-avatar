import { Memory } from 'mem0ai/oss';
import { Pinecone } from '@pinecone-database/pinecone';
import { logger } from './logger';
import { wrapServiceCall } from './circuitBreaker';

interface MemoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface MemoryMetadata {
  category?: string;
  avatarId?: string;
  sessionId?: string;
  [key: string]: any;
}

interface MemorySearchResult {
  id: string;
  memory: string;
  score: number;
  metadata?: MemoryMetadata;
  created_at?: string;
  updated_at?: string;
}

class MemoryService {
  private memory: Memory | null = null;
  private pineconeClient: Pinecone | null = null;
  private isInitialized = false;
  private readonly indexName = 'ask-elxr';

  constructor() {
    this.initialize();
  }

  private async initialize() {
    try {
      const apiKey = process.env.PINECONE_API_KEY;
      const openaiKey = process.env.OPENAI_API_KEY;
      const mem0ApiKey = process.env.MEM0_API_KEY;

      if (!apiKey || !openaiKey) {
        logger.warn('Pinecone or OpenAI API key not found. Memory service will not be available.');
        return;
      }

      if (!mem0ApiKey) {
        logger.warn('MEM0_API_KEY not found. Memory service will not be available.');
        return;
      }

      this.pineconeClient = new Pinecone({ apiKey });

      this.memory = new Memory({
        version: 'v1.1',
        
        embedder: {
          provider: 'openai',
          config: {
            apiKey: openaiKey,
            model: 'text-embedding-3-small'
          }
        },
        
        vectorStore: {
          provider: 'pinecone',
          config: {
            indexName: this.indexName,
            dimension: 1536,
            metric: 'cosine',
            cloud: 'aws',
            region: 'us-east-1'
          }
        },
        
        llm: {
          provider: 'openai',
          config: {
            apiKey: openaiKey,
            model: 'gpt-4o-mini',
            temperature: 0.2,
            maxTokens: 1500
          }
        },
        
        historyDbPath: './data/memory.db'
      });

      this.isInitialized = true;
      logger.info('Memory service initialized successfully with Pinecone');
    } catch (error) {
      logger.error('Failed to initialize Memory service:', error);
      this.isInitialized = false;
    }
  }

  isAvailable(): boolean {
    return this.isInitialized && this.memory !== null;
  }

  async addMemory(
    messages: MemoryMessage | MemoryMessage[] | string,
    userId: string,
    metadata?: MemoryMetadata
  ): Promise<{ success: boolean; memories?: any[]; error?: string }> {
    if (!this.isAvailable()) {
      return { success: false, error: 'Memory service not available' };
    }

    try {
      const addMemoryWithBreaker = wrapServiceCall(
        async (msgs: any, uid: string, meta?: any) => {
          return await this.memory!.add(msgs, { 
            userId: uid,
            metadata: meta 
          });
        },
        {
          name: 'mem0-add',
          timeout: 30000,
          errorThresholdPercentage: 50,
          resetTimeout: 30000
        }
      );

      const result = await addMemoryWithBreaker(messages, userId, metadata);
      
      logger.info(`Added memory for user ${userId}`, {
        userId,
        metadata,
        messageCount: Array.isArray(messages) ? messages.length : 1
      });

      return { success: true, memories: result };
    } catch (error) {
      logger.error('Failed to add memory:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async searchMemories(
    query: string,
    userId: string,
    options?: {
      limit?: number;
      namespace?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<{ success: boolean; memories?: MemorySearchResult[]; error?: string }> {
    if (!this.isAvailable()) {
      return { success: false, error: 'Memory service not available' };
    }

    try {
      const searchMemoryWithBreaker = wrapServiceCall(
        async (q: string, uid: string, opts?: any) => {
          return await this.memory!.search(q, {
            userId: uid,
            limit: opts?.limit || 5,
            ...opts
          });
        },
        {
          name: 'mem0-search',
          timeout: 30000,
          errorThresholdPercentage: 50,
          resetTimeout: 30000
        }
      );

      const results = await searchMemoryWithBreaker(query, userId, options);
      
      logger.info(`Searched memories for user ${userId}`, {
        userId,
        query,
        resultCount: results?.length || 0
      });

      return { success: true, memories: results || [] };
    } catch (error) {
      logger.error('Failed to search memories:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async getAllMemories(
    userId: string
  ): Promise<{ success: boolean; memories?: MemorySearchResult[]; error?: string }> {
    if (!this.isAvailable()) {
      return { success: false, error: 'Memory service not available' };
    }

    try {
      const getAllWithBreaker = wrapServiceCall(
        async (uid: string) => {
          return await this.memory!.getAll({ userId: uid });
        },
        {
          name: 'mem0-get-all',
          timeout: 30000,
          errorThresholdPercentage: 50,
          resetTimeout: 30000
        }
      );

      const memories = await getAllWithBreaker(userId);
      
      logger.info(`Retrieved all memories for user ${userId}`, {
        userId,
        count: memories?.length || 0
      });

      return { success: true, memories: memories || [] };
    } catch (error) {
      logger.error('Failed to get all memories:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async updateMemory(
    memoryId: string,
    data: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.isAvailable()) {
      return { success: false, error: 'Memory service not available' };
    }

    try {
      const updateWithBreaker = wrapServiceCall(
        async (mid: string, d: string) => {
          return await this.memory!.update(mid, { data: d });
        },
        {
          name: 'mem0-update',
          timeout: 30000,
          errorThresholdPercentage: 50,
          resetTimeout: 30000
        }
      );

      await updateWithBreaker(memoryId, data);
      
      logger.info(`Updated memory ${memoryId}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to update memory:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async deleteMemory(
    memoryId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.isAvailable()) {
      return { success: false, error: 'Memory service not available' };
    }

    try {
      const deleteWithBreaker = wrapServiceCall(
        async (mid: string) => {
          return await this.memory!.delete(mid);
        },
        {
          name: 'mem0-delete',
          timeout: 30000,
          errorThresholdPercentage: 50,
          resetTimeout: 30000
        }
      );

      await deleteWithBreaker(memoryId);
      
      logger.info(`Deleted memory ${memoryId}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete memory:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async deleteAllMemories(
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.isAvailable()) {
      return { success: false, error: 'Memory service not available' };
    }

    try {
      const deleteAllWithBreaker = wrapServiceCall(
        async (uid: string) => {
          return await this.memory!.deleteAll({ userId: uid });
        },
        {
          name: 'mem0-delete-all',
          timeout: 30000,
          errorThresholdPercentage: 50,
          resetTimeout: 30000
        }
      );

      await deleteAllWithBreaker(userId);
      
      logger.info(`Deleted all memories for user ${userId}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete all memories:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async getMemoryHistory(
    memoryId: string
  ): Promise<{ success: boolean; history?: any[]; error?: string }> {
    if (!this.isAvailable()) {
      return { success: false, error: 'Memory service not available' };
    }

    try {
      const historyWithBreaker = wrapServiceCall(
        async (mid: string) => {
          return await this.memory!.history(mid);
        },
        {
          name: 'mem0-history',
          timeout: 30000,
          errorThresholdPercentage: 50,
          resetTimeout: 30000
        }
      );

      const history = await historyWithBreaker(memoryId);
      
      return { success: true, history: history || [] };
    } catch (error) {
      logger.error('Failed to get memory history:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async reset(): Promise<{ success: boolean; error?: string }> {
    if (!this.isAvailable()) {
      return { success: false, error: 'Memory service not available' };
    }

    try {
      await this.memory!.reset();
      logger.warn('Memory service reset - all memories cleared');
      return { success: true };
    } catch (error) {
      logger.error('Failed to reset memory service:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
}

export const memoryService = new MemoryService();
export type { MemoryMessage, MemoryMetadata, MemorySearchResult };
