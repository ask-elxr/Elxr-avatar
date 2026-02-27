import { logger } from './logger.js';
import { wrapServiceCall } from './circuitBreaker.js';
import { v4 as uuidv4 } from 'uuid';

export enum MemoryType {
  SUMMARY = 'summary',
  NOTE = 'note',
  PREFERENCE = 'preference'
}

export interface MemoryRecord {
  id: string;
  userId: string;
  type: MemoryType;
  content: string;
  metadata: {
    avatarId?: string;
    sessionId?: string;
    category?: string;
    tags?: string[];
    [key: string]: any;
  };
  createdAt: number;
  updatedAt: number;
}

export interface MemorySearchResult {
  id: string;
  content: string;
  type: MemoryType;
  userId: string;
  metadata: Record<string, any>;
  score: number;
  createdAt: number;
}

interface MemoryResponse {
  success: boolean;
  memories?: MemorySearchResult[];
  memory?: MemoryRecord;
  count?: number;
  error?: string;
}

class MemoryService {
  private apiKey: string = '';
  private baseUrl: string = "https://api.mem0.ai/v1";
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    try {
      this.apiKey = process.env.MEM0_API_KEY || '';

      if (!this.apiKey) {
        logger.warn(
          { service: 'memory' },
          'MEM0_API_KEY not found. Memory service will not be available.',
        );
        return;
      }

      this.isInitialized = true;
      logger.info(
        { service: 'memory' },
        '🧠 Memory service initialized successfully with Mem0 API',
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        {
          service: 'memory',
          error: errorMessage,
        },
        'Failed to initialize Memory service',
      );
      this.isInitialized = false;
    }
  }

  isAvailable(): boolean {
    return this.isInitialized && !!this.apiKey;
  }

  async addMemory(
    content: string,
    userId: string,
    type: MemoryType,
    metadata: Record<string, any> = {},
  ): Promise<MemoryResponse> {
    try {
      if (!this.isAvailable()) {
        return { success: false, error: 'Memory service not available' };
      }

      const now = Date.now();
      const recordId = uuidv4();

      const addMemoryWithBreaker = wrapServiceCall(
        async () => {
          const response = await fetch(`${this.baseUrl}/memories/`, {
            method: 'POST',
            headers: {
              'Authorization': `Token ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messages: [
                {
                  role: "user",
                  content: content
                }
              ],
              user_id: userId,
              metadata: {
                ...metadata,
                type,
                createdAt: now,
                updatedAt: now,
              }
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Mem0 API error ${response.status}: ${errorText}`);
          }

          return await response.json();
        },
        'mem0-add',
        {
          timeout: 30000,
          errorThresholdPercentage: 50,
          resetTimeout: 30000,
        },
      );

      const result = await addMemoryWithBreaker.execute();

      const record: MemoryRecord = {
        id: result.id || recordId,
        userId,
        type,
        content,
        metadata,
        createdAt: now,
        updatedAt: now,
      };

      logger.info(
        {
          service: 'memory',
          userId,
          type,
          recordId: record.id,
          contentPreview: content.substring(0, 100),
        },
        `🧠 Memory added via Mem0: ${type} for user ${userId}`,
      );

      return { success: true, memory: record };
    } catch (error) {
      logger.error({ service: 'memory', error }, 'Failed to add memory to Mem0');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add memory',
      };
    }
  }

  async searchMemories(
    query: string,
    userId: string,
    options: {
      limit?: number;
      type?: MemoryType;
      minScore?: number;
    } = {},
  ): Promise<MemoryResponse> {
    try {
      if (!this.isAvailable()) {
        logger.warn({ service: 'memory', userId, query: query.substring(0, 50) }, 'Memory service not available for search');
        return { success: false, error: 'Memory service not available' };
      }

      const { limit = 10, minScore = 0.4 } = options;

      const searchMemoriesWithBreaker = wrapServiceCall(
        async () => {
          const response = await fetch(`${this.baseUrl}/memories/search/`, {
            method: 'POST',
            headers: {
              'Authorization': `Token ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query,
              user_id: userId,
              limit,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Mem0 API error ${response.status}: ${errorText}`);
          }

          return await response.json();
        },
        'mem0-search',
        {
          timeout: 30000,
          errorThresholdPercentage: 50,
          resetTimeout: 30000,
        },
      );

      const result = await searchMemoriesWithBreaker.execute();
      const rawResults = result.results || result || [];

      const memories: MemorySearchResult[] = rawResults
        .filter((match: any) => !minScore || (match.score && match.score >= minScore))
        .map((match: any) => ({
          id: match.id || uuidv4(),
          content: match.memory || match.content || '',
          type: (match.metadata?.type as MemoryType) || MemoryType.NOTE,
          userId: match.user_id || userId,
          metadata: match.metadata || {},
          score: match.score || 0,
          createdAt: match.metadata?.createdAt || Date.now(),
        }));

      logger.info(
        {
          service: 'memory',
          userId,
          query: query.substring(0, 100),
          rawCount: rawResults.length,
          filteredCount: memories.length,
          minScoreThreshold: minScore,
        },
        `🧠 Mem0 search: ${memories.length}/${rawResults.length} results above ${minScore} threshold`,
      );

      return { success: true, memories };
    } catch (error) {
      logger.error({ service: 'memory', error }, 'Failed to search memories in Mem0');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to search memories',
      };
    }
  }

  async getAllMemories(userId: string, type?: MemoryType): Promise<MemoryResponse> {
    try {
      if (!this.isAvailable()) {
        return { success: false, error: 'Memory service not available' };
      }

      const getAllMemoriesWithBreaker = wrapServiceCall(
        async () => {
          const response = await fetch(`${this.baseUrl}/memories/?user_id=${encodeURIComponent(userId)}`, {
            method: 'GET',
            headers: {
              'Authorization': `Token ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Mem0 API error ${response.status}: ${errorText}`);
          }

          return await response.json();
        },
        'mem0-getall',
        {
          timeout: 30000,
          errorThresholdPercentage: 50,
          resetTimeout: 30000,
        },
      );

      const result = await getAllMemoriesWithBreaker.execute();
      const rawResults = result.results || result || [];

      let memories: MemorySearchResult[] = rawResults.map((match: any) => ({
        id: match.id || uuidv4(),
        content: match.memory || match.content || '',
        type: (match.metadata?.type as MemoryType) || MemoryType.NOTE,
        userId: match.user_id || userId,
        metadata: match.metadata || {},
        score: 1.0,
        createdAt: match.metadata?.createdAt || new Date(match.created_at || Date.now()).getTime(),
      }));

      if (type) {
        memories = memories.filter(m => m.type === type);
      }

      memories.sort((a, b) => b.createdAt - a.createdAt);

      logger.info(
        {
          service: 'memory',
          userId,
          count: memories.length,
        },
        `🧠 Retrieved all memories for user ${userId} from Mem0`,
      );

      return { success: true, memories, count: memories.length };
    } catch (error) {
      logger.error({ service: 'memory', error }, 'Failed to get all memories from Mem0');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get all memories',
      };
    }
  }

  async updateMemory(
    memoryId: string,
    userId: string,
    content: string,
    metadata: Record<string, any> = {},
  ): Promise<MemoryResponse> {
    try {
      if (!this.isAvailable()) {
        return { success: false, error: 'Memory service not available' };
      }

      const now = Date.now();

      const updateMemoryWithBreaker = wrapServiceCall(
        async () => {
          const response = await fetch(`${this.baseUrl}/memories/${memoryId}/`, {
            method: 'PUT',
            headers: {
              'Authorization': `Token ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: content,
              metadata: {
                ...metadata,
                updatedAt: now,
              }
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Mem0 API error ${response.status}: ${errorText}`);
          }

          return await response.json();
        },
        'mem0-update',
        {
          timeout: 30000,
          errorThresholdPercentage: 50,
          resetTimeout: 30000,
        },
      );

      await updateMemoryWithBreaker.execute();

      logger.info(
        {
          service: 'memory',
          userId,
          memoryId,
        },
        `🧠 Updated memory ${memoryId} for user ${userId} in Mem0`,
      );

      return { success: true };
    } catch (error) {
      logger.error({ service: 'memory', error }, 'Failed to update memory in Mem0');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update memory',
      };
    }
  }

  async deleteMemory(memoryId: string, userId: string): Promise<MemoryResponse> {
    try {
      if (!this.isAvailable()) {
        return { success: false, error: 'Memory service not available' };
      }

      const deleteMemoryWithBreaker = wrapServiceCall(
        async () => {
          const response = await fetch(`${this.baseUrl}/memories/${memoryId}/`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Token ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Mem0 API error ${response.status}: ${errorText}`);
          }
        },
        'mem0-delete',
        {
          timeout: 30000,
          errorThresholdPercentage: 50,
          resetTimeout: 30000,
        },
      );

      await deleteMemoryWithBreaker.execute();

      logger.info(
        {
          service: 'memory',
          userId,
          memoryId,
        },
        `🧠 Deleted memory ${memoryId} for user ${userId} from Mem0`,
      );

      return { success: true };
    } catch (error) {
      logger.error({ service: 'memory', error }, 'Failed to delete memory from Mem0');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete memory',
      };
    }
  }

  async deleteAllMemories(userId: string): Promise<MemoryResponse> {
    try {
      if (!this.isAvailable()) {
        return { success: false, error: 'Memory service not available' };
      }

      const deleteAllMemoriesWithBreaker = wrapServiceCall(
        async () => {
          const response = await fetch(`${this.baseUrl}/memories/?user_id=${encodeURIComponent(userId)}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Token ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Mem0 API error ${response.status}: ${errorText}`);
          }
        },
        'mem0-deleteall',
        {
          timeout: 30000,
          errorThresholdPercentage: 50,
          resetTimeout: 30000,
        },
      );

      await deleteAllMemoriesWithBreaker.execute();

      logger.info(
        {
          service: 'memory',
          userId,
        },
        `🧠 Deleted all memories for user ${userId} from Mem0`,
      );

      return { success: true };
    } catch (error) {
      logger.error({ service: 'memory', error }, 'Failed to delete all memories from Mem0');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete all memories',
      };
    }
  }

  async generateConversationSummary(
    messages: Array<{ role: string; content: string }>,
    userId: string,
    sessionMetadata: Record<string, any> = {},
  ): Promise<MemoryResponse> {
    try {
      if (!this.isAvailable()) {
        return { success: false, error: 'Memory service not available' };
      }

      if (!userId || typeof userId !== 'string') {
        return { success: false, error: 'Valid userId is required' };
      }

      const conversationText = messages
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');

      const summary = `Conversation summary:\n${conversationText.substring(0, 500)}${conversationText.length > 500 ? '...' : ''}`;

      return await this.addMemory(summary, userId, MemoryType.SUMMARY, {
        ...sessionMetadata,
        messageCount: messages.length,
        generatedAt: Date.now(),
      });
    } catch (error) {
      logger.error({ service: 'memory', error }, 'Failed to generate conversation summary');
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to generate conversation summary',
      };
    }
  }
}

export const memoryService = new MemoryService();
