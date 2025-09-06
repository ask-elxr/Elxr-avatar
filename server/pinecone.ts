import { Pinecone } from '@pinecone-database/pinecone';

class PineconeService {
  private client: Pinecone;
  private indexName: string = 'avatar-chat-knowledge';

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

  // Helper function to normalize category names for use as namespaces
  private normalizeNamespace(category: string | null): string {
    if (!category) return 'default';
    
    // Convert to lowercase and replace special characters and spaces with hyphens
    return category.toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  async storeConversation(id: string, text: string, embedding: number[], metadata: any = {}, namespace?: string) {
    try {
      const index = await this.initializeIndex();
      
      // Use category as namespace if provided in metadata
      const targetNamespace = namespace || this.normalizeNamespace(metadata.category);
      
      await index.namespace(targetNamespace).upsert([
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

      console.log(`Stored conversation in Pinecone namespace "${targetNamespace}" with ID: ${id}`);
    } catch (error) {
      console.error('Error storing conversation in Pinecone:', error);
      throw error;
    }
  }

  async searchSimilarConversations(embedding: number[], topK: number = 5, namespace?: string | string[]) {
    try {
      const index = await this.initializeIndex();
      
      // If specific namespace(s) provided, search those; otherwise search default namespace
      const namespaces = Array.isArray(namespace) ? namespace : (namespace ? [namespace] : ['default']);
      
      // Search across all specified namespaces and combine results
      const allResults: any[] = [];
      
      for (const ns of namespaces) {
        try {
          const queryResponse = await index.namespace(ns).query({
            vector: embedding,
            topK,
            includeMetadata: true,
            includeValues: false
          });
          
          if (queryResponse.matches) {
            allResults.push(...queryResponse.matches);
          }
        } catch (error) {
          console.warn(`Error searching namespace "${ns}":`, error);
          // Continue with other namespaces even if one fails
        }
      }
      
      // Sort all results by score and return top K
      return allResults
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, topK);

    } catch (error) {
      console.error('Error searching similar conversations:', error);
      throw error;
    }
  }

  async deleteConversation(id: string, namespace?: string) {
    try {
      const index = await this.initializeIndex();
      const targetNamespace = namespace || 'default';
      
      await index.namespace(targetNamespace).deleteOne(id);
      console.log(`Deleted conversation from Pinecone namespace "${targetNamespace}" with ID: ${id}`);
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

  async listIndexes() {
    try {
      const response = await this.client.listIndexes();
      return response.indexes || [];
    } catch (error) {
      console.error('Error listing Pinecone indexes:', error);
      throw error;
    }
  }
}

export const pineconeService = new PineconeService();