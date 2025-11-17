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

      if (!apiKey || !openaiKey) {
        logger.warn({ service: 'mem0' }, 'Pinecone or OpenAI API key not found. Memory service will not be available.');
        return;
      }

      this.pineconeClient = new Pinecone({ apiKey });

      // Use simplified in-memory configuration for now
      // Full Pinecone integration can be enabled when needed
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
          provider: 'memory',
          config: {
            collectionName: 'user-memories',
            dimension: 1536
          }
        },
        
        llm: {
          provider: 'openai',
          config: {
            apiKey: openaiKey,
            model: 'gpt-4o-mini'
          }
        },
        
        historyDbPath: './data/memory.db'
      });

      this.isInitialized = true;
      logger.info({ service: 'mem0' }, 'Memory service initialized successfully (in-memory mode)');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error({ 
        service: 'mem0', 
        error: errorMessage,
        stack: errorStack
      }, 'Failed to initialize Memory service');
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
        'mem0-add',
        {
          timeout: 30000,
          errorThresholdPercentage: 50,
          resetTimeout: 30000
        }
      );

      const result = await addMemoryWithBreaker.execute(messages, userId, metadata);
      
      logger.info({
        service: 'mem0',
        userId,
        metadata,
        messageCount: Array.isArray(messages) ? messages.length : 1
      }, `Added memory for user ${userId}`);

      return { success: true, memories: Array.isArray(result) ? result : [result] as any };
    } catch (error) {
      logger.error({ service: 'mem0', error }, 'Failed to add memory');
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
        'mem0-search',
        {
          timeout: 30000,
          errorThresholdPercentage: 50,
          resetTimeout: 30000
        }
      );

      const results = await searchMemoryWithBreaker.execute(query, userId, options);
      const memoriesArray = Array.isArray(results) ? results : (results ? [results] : []);
      
      logger.info({
        service: 'mem0',
        userId,
        query,
        resultCount: memoriesArray.length
      }, `Searched memories for user ${userId}`);

      return { success: true, memories: memoriesArray as MemorySearchResult[] };
    } catch (error) {
      logger.error({ service: 'mem0', error }, 'Failed to search memories');
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
        'mem0-get-all',
        {
          timeout: 30000,
          errorThresholdPercentage: 50,
          resetTimeout: 30000
        }
      );

      const memories = await getAllWithBreaker.execute(userId);
      const memoriesArray = Array.isArray(memories) ? memories : (memories ? [memories] : []);
      
      logger.info({
        service: 'mem0',
        userId,
        count: memoriesArray.length
      }, `Retrieved all memories for user ${userId}`);

      return { success: true, memories: memoriesArray as MemorySearchResult[] };
    } catch (error) {
      logger.error({ service: 'mem0', error }, 'Failed to get all memories');
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
          return await this.memory!.update(mid, d);
        },
        'mem0-update',
        {
          timeout: 30000,
          errorThresholdPercentage: 50,
          resetTimeout: 30000
        }
      );

      await updateWithBreaker.execute(memoryId, data);
      
      logger.info({ service: 'mem0', memoryId }, `Updated memory ${memoryId}`);
      return { success: true };
    } catch (error) {
      logger.error({ service: 'mem0', error }, 'Failed to update memory');
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
        'mem0-delete',
        {
          timeout: 30000,
          errorThresholdPercentage: 50,
          resetTimeout: 30000
        }
      );

      await deleteWithBreaker.execute(memoryId);
      
      logger.info({ service: 'mem0', memoryId }, `Deleted memory ${memoryId}`);
      return { success: true };
    } catch (error) {
      logger.error({ service: 'mem0', error }, 'Failed to delete memory');
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
        'mem0-delete-all',
        {
          timeout: 30000,
          errorThresholdPercentage: 50,
          resetTimeout: 30000
        }
      );

      await deleteAllWithBreaker.execute(userId);
      
      logger.info({ service: 'mem0', userId }, `Deleted all memories for user ${userId}`);
      return { success: true };
    } catch (error) {
      logger.error({ service: 'mem0', error }, 'Failed to delete all memories');
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
        'mem0-history',
        {
          timeout: 30000,
          errorThresholdPercentage: 50,
          resetTimeout: 30000
        }
      );

      const history = await historyWithBreaker.execute(memoryId);
      
      return { success: true, history: history || [] };
    } catch (error) {
      logger.error({ service: 'mem0', error }, 'Failed to get memory history');
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
      logger.warn({ service: 'mem0' }, 'Memory service reset - all memories cleared');
      return { success: true };
    } catch (error) {
      logger.error({ service: 'mem0', error }, 'Failed to reset memory service');
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
}

export const memoryService = new MemoryService();
export type { MemoryMessage, MemoryMetadata, MemorySearchResult };
