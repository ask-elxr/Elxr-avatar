import MemoryClient, { Message, MemoryOptions } from 'mem0ai';

class Mem0Service {
  private client: MemoryClient | null = null;
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.MEM0_API_KEY;
    
    if (!this.apiKey) {
      console.warn('MEM0_API_KEY not configured - Memory features will be unavailable');
    } else {
      try {
        this.client = new MemoryClient({ apiKey: this.apiKey });
        console.log('Mem0 service initialized successfully');
      } catch (error) {
        console.error('Failed to initialize Mem0 client:', error);
      }
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async addMemory(messages: Message[], userId: string, metadata?: Record<string, any>) {
    if (!this.isAvailable()) {
      console.warn('Mem0 service not available - skipping memory storage');
      return null;
    }

    try {
      const options: MemoryOptions = {
        user_id: userId,
        ...(metadata && { metadata })
      };
      
      const result = await this.client!.add(messages, options);
      console.log(`Memory added for user ${userId}:`, result);
      return result;
    } catch (error) {
      console.error('Error adding memory to Mem0:', error);
      throw error;
    }
  }

  async searchMemories(query: string, userId: string) {
    if (!this.isAvailable()) {
      console.warn('Mem0 service not available - skipping memory search');
      return [];
    }

    try {
      const filters = {
        AND: [
          {
            user_id: userId
          }
        ]
      };
      
      const memories = await this.client!.search(query, {
        version: "v2",
        filters
      });
      
      console.log(`Found ${memories?.length || 0} memories for user ${userId}`);
      return memories || [];
    } catch (error) {
      console.error('Error searching memories from Mem0:', error);
      throw error;
    }
  }

  async getAllMemories(userId: string, page: number = 1, pageSize: number = 50) {
    if (!this.isAvailable()) {
      console.warn('Mem0 service not available - skipping memory retrieval');
      return null;
    }

    try {
      const filters = {
        AND: [
          {
            user_id: userId
          }
        ]
      };
      
      const result = await this.client!.getAll({
        version: "v2",
        filters,
        page,
        page_size: pageSize
      });
      
      console.log(`Retrieved all memories for user ${userId}`);
      return result;
    } catch (error) {
      console.error('Error getting all memories from Mem0:', error);
      throw error;
    }
  }
}

export const mem0Service = new Mem0Service();
