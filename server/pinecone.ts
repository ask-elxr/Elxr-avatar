import { Pinecone } from '@pinecone-database/pinecone';

class PineconeService {
  private client: Pinecone;
  private indexName: string = 'avatar-chat';

  constructor() {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
      throw new Error('PINECONE_API_KEY environment variable is required');
    }

    this.client = new Pinecone({
      apiKey: apiKey,
    });
  }

  async initializeIndex() {
    try {
      // Check if index exists
      const indexes = await this.client.listIndexes();
      const indexExists = indexes.indexes?.some(index => index.name === this.indexName);

      if (!indexExists) {
        // Create index if it doesn't exist
        await this.client.createIndex({
          name: this.indexName,
          dimension: 1536, // OpenAI embeddings dimension
          metric: 'cosine',
          spec: {
            serverless: {
              cloud: 'aws',
              region: 'us-east-1'
            }
          }
        });
        console.log(`Created Pinecone index: ${this.indexName}`);
      }

      return this.client.index(this.indexName);
    } catch (error) {
      console.error('Error initializing Pinecone index:', error);
      throw error;
    }
  }

  async storeConversation(id: string, text: string, embedding: number[], metadata: any = {}) {
    try {
      const index = await this.initializeIndex();
      
      await index.upsert([
        {
          id,
          values: embedding,
          metadata: {
            text,
            timestamp: new Date().toISOString(),
            ...metadata
          }
        }
      ]);

      console.log(`Stored conversation in Pinecone with ID: ${id}`);
    } catch (error) {
      console.error('Error storing conversation in Pinecone:', error);
      throw error;
    }
  }

  async searchSimilarConversations(embedding: number[], topK: number = 5) {
    try {
      const index = await this.initializeIndex();
      
      const queryResponse = await index.query({
        vector: embedding,
        topK,
        includeMetadata: true,
        includeValues: false
      });

      return queryResponse.matches || [];
    } catch (error) {
      console.error('Error searching similar conversations:', error);
      throw error;
    }
  }

  async deleteConversation(id: string) {
    try {
      const index = await this.initializeIndex();
      
      await index.deleteOne(id);
      console.log(`Deleted conversation from Pinecone with ID: ${id}`);
    } catch (error) {
      console.error('Error deleting conversation from Pinecone:', error);
      throw error;
    }
  }

  async getStats() {
    try {
      const index = await this.initializeIndex();
      const stats = await index.describeIndexStats();
      return stats;
    } catch (error) {
      console.error('Error getting Pinecone stats:', error);
      throw error;
    }
  }
}

export const pineconeService = new PineconeService();