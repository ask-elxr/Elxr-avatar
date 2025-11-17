import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { logger } from './logger.js';
import { wrapServiceCall } from './circuitBreaker.js';
import { v4 as uuidv4 } from 'uuid';

// Memory types
export enum MemoryType {
  SUMMARY = 'summary',
  NOTE = 'note',
  PREFERENCE = 'preference'
}

// Memory record stored in Pinecone
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

// Search result from Pinecone
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
  private pineconeClient: Pinecone | null = null;
  private openaiClient: OpenAI | null = null;
  private isInitialized = false;
  private readonly indexName = 'ask-elxr';
  private readonly memoryNamespacePrefix = 'memory-';

  constructor() {
    this.initialize();
  }

  private async initialize() {
    try {
      const apiKey = process.env.PINECONE_API_KEY;
      const openaiKey = process.env.OPENAI_API_KEY;

      if (!apiKey || !openaiKey) {
        logger.warn(
          { service: 'memory' },
          'Pinecone or OpenAI API key not found. Memory service will not be available.',
        );
        return;
      }

      this.pineconeClient = new Pinecone({ apiKey });
      this.openaiClient = new OpenAI({ apiKey: openaiKey });

      this.isInitialized = true;
      logger.info(
        { service: 'memory' },
        'Memory service initialized successfully with Pinecone persistence',
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error(
        {
          service: 'memory',
          error: errorMessage,
          stack: errorStack,
        },
        'Failed to initialize Memory service',
      );
      this.isInitialized = false;
    }
  }

  isAvailable(): boolean {
    return this.isInitialized && this.pineconeClient !== null && this.openaiClient !== null;
  }

  private getUserNamespace(userId: string): string {
    return `${this.memoryNamespacePrefix}${userId}`;
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    const generateEmbeddingWithBreaker = wrapServiceCall(
      async (content: string) => {
        const response = await this.openaiClient!.embeddings.create({
          model: 'text-embedding-3-small',
          input: content,
        });
        return response.data[0].embedding;
      },
      'openai-embeddings',
      {
        timeout: 30000,
        errorThresholdPercentage: 50,
        resetTimeout: 30000,
      },
    );

    return await generateEmbeddingWithBreaker.execute(text);
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

      const recordId = uuidv4();
      const now = Date.now();

      // Generate embedding for the content
      const embedding = await this.generateEmbedding(content);

      const record: MemoryRecord = {
        id: recordId,
        userId,
        type,
        content,
        metadata,
        createdAt: now,
        updatedAt: now,
      };

      // Store in Pinecone
      const index = this.pineconeClient!.index(this.indexName);
      const namespace = this.getUserNamespace(userId);

      await index.namespace(namespace).upsert([
        {
          id: recordId,
          values: embedding,
          metadata: {
            userId,
            type,
            content,
            ...metadata,
            createdAt: now,
            updatedAt: now,
          },
        },
      ]);

      logger.info(
        {
          service: 'memory',
          userId,
          type,
          recordId,
        },
        `Added ${type} memory for user ${userId}`,
      );

      return { success: true, memory: record };
    } catch (error) {
      logger.error({ service: 'memory', error }, 'Failed to add memory');
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
        return { success: false, error: 'Memory service not available' };
      }

      const { limit = 10, type, minScore = 0.7 } = options;

      // Generate embedding for query
      const embedding = await this.generateEmbedding(query);

      // Search in Pinecone
      const index = this.pineconeClient!.index(this.indexName);
      const namespace = this.getUserNamespace(userId);

      const filter: Record<string, any> = { userId };
      if (type) {
        filter.type = type;
      }

      const queryResponse = await index.namespace(namespace).query({
        vector: embedding,
        topK: limit,
        filter,
        includeMetadata: true,
      });

      const memories: MemorySearchResult[] = queryResponse.matches
        .filter((match) => match.score && match.score >= minScore)
        .map((match) => ({
          id: match.id,
          content: (match.metadata?.content as string) || '',
          type: (match.metadata?.type as MemoryType) || MemoryType.NOTE,
          userId: (match.metadata?.userId as string) || userId,
          metadata: match.metadata || {},
          score: match.score || 0,
          createdAt: (match.metadata?.createdAt as number) || Date.now(),
        }));

      logger.info(
        {
          service: 'memory',
          userId,
          query,
          resultCount: memories.length,
        },
        `Searched memories for user ${userId}`,
      );

      return { success: true, memories };
    } catch (error) {
      logger.error({ service: 'memory', error }, 'Failed to search memories');
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

      // Create a broad query vector (average of all dimensions)
      const broadVector = new Array(1536).fill(0.1);

      const index = this.pineconeClient!.index(this.indexName);
      const namespace = this.getUserNamespace(userId);

      const filter: Record<string, any> = { userId };
      if (type) {
        filter.type = type;
      }

      const queryResponse = await index.namespace(namespace).query({
        vector: broadVector,
        topK: 1000, // Get all memories
        filter,
        includeMetadata: true,
      });

      const memories: MemorySearchResult[] = queryResponse.matches.map((match) => ({
        id: match.id,
        content: (match.metadata?.content as string) || '',
        type: (match.metadata?.type as MemoryType) || MemoryType.NOTE,
        userId: (match.metadata?.userId as string) || userId,
        metadata: match.metadata || {},
        score: match.score || 0,
        createdAt: (match.metadata?.createdAt as number) || Date.now(),
      }));

      // Sort by creation date (newest first)
      memories.sort((a, b) => b.createdAt - a.createdAt);

      logger.info(
        {
          service: 'memory',
          userId,
          count: memories.length,
        },
        `Retrieved all memories for user ${userId}`,
      );

      return { success: true, memories, count: memories.length };
    } catch (error) {
      logger.error({ service: 'memory', error }, 'Failed to get all memories');
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

      // Generate new embedding
      const embedding = await this.generateEmbedding(content);

      // Update in Pinecone
      const index = this.pineconeClient!.index(this.indexName);
      const namespace = this.getUserNamespace(userId);

      await index.namespace(namespace).upsert([
        {
          id: memoryId,
          values: embedding,
          metadata: {
            ...metadata,
            content,
            updatedAt: now,
          },
        },
      ]);

      logger.info(
        {
          service: 'memory',
          userId,
          memoryId,
        },
        `Updated memory ${memoryId} for user ${userId}`,
      );

      return { success: true };
    } catch (error) {
      logger.error({ service: 'memory', error }, 'Failed to update memory');
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

      const index = this.pineconeClient!.index(this.indexName);
      const namespace = this.getUserNamespace(userId);

      await index.namespace(namespace).deleteOne(memoryId);

      logger.info(
        {
          service: 'memory',
          userId,
          memoryId,
        },
        `Deleted memory ${memoryId} for user ${userId}`,
      );

      return { success: true };
    } catch (error) {
      logger.error({ service: 'memory', error }, 'Failed to delete memory');
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

      const index = this.pineconeClient!.index(this.indexName);
      const namespace = this.getUserNamespace(userId);

      // Delete the entire namespace
      await index.namespace(namespace).deleteAll();

      logger.info(
        {
          service: 'memory',
          userId,
        },
        `Deleted all memories for user ${userId}`,
      );

      return { success: true };
    } catch (error) {
      logger.error({ service: 'memory', error }, 'Failed to delete all memories');
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

      // Use OpenAI to generate a summary
      const conversationText = messages
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');

      const completion = await this.openaiClient!.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful assistant that creates concise summaries of conversations. Focus on key topics, user preferences mentioned, and important insights. Keep it under 200 words.',
          },
          {
            role: 'user',
            content: `Please summarize this conversation:\n\n${conversationText}`,
          },
        ],
        temperature: 0.3,
      });

      const summary = completion.choices[0]?.message?.content || '';

      // Store as a summary memory
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
