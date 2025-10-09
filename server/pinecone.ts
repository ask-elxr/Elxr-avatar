import { Pinecone } from '@pinecone-database/pinecone';

export enum PineconeIndexName {
  AVATAR_CHAT = 'avatar-chat-knowledge',
  ASK_ELXR = 'ask-elxr'
}

class PineconeService {
  private client: Pinecone;
  private defaultIndexName: PineconeIndexName = PineconeIndexName.AVATAR_CHAT;

  constructor() {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
      throw new Error('PINECONE_API_KEY environment variable is required');
    }

    this.client = new Pinecone({
      apiKey: apiKey,
    });
  }

  async initializeIndex(indexName: PineconeIndexName = this.defaultIndexName) {
    try {
      // Check if index exists
      const indexes = await this.client.listIndexes();
      const indexExists = indexes.indexes?.some(index => index.name === indexName);

      if (!indexExists) {
        // Create index if it doesn't exist
        await this.client.createIndex({
          name: indexName,
          dimension: 1536, // OpenAI embeddings dimension
          metric: 'cosine',
          spec: {
            serverless: {
              cloud: 'aws',
              region: 'us-east-1'
            }
          }
        });
        console.log(`Created Pinecone index: ${indexName}, waiting for it to be ready...`);
        
        // Wait for index to be ready (serverless indexes need time to provision)
        let ready = false;
        let attempts = 0;
        const maxAttempts = 30; // 30 attempts with 2s intervals = 1 minute max wait
        
        while (!ready && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
          attempts++;
          
          try {
            const indexDescription = await this.client.describeIndex(indexName);
            if (indexDescription.status?.ready) {
              ready = true;
              console.log(`Pinecone index ${indexName} is ready after ${attempts * 2}s`);
            }
          } catch (error) {
            // Index might not be describable yet, continue waiting
            console.debug(`Waiting for index ${indexName} to be ready (attempt ${attempts}/${maxAttempts})`);
          }
        }
        
        if (!ready) {
          throw new Error(`Pinecone index ${indexName} did not become ready within expected time`);
        }
      }

      return this.client.index(indexName);
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

  async storeConversation(id: string, text: string, embedding: number[], metadata: any = {}, namespace?: string, indexName: PineconeIndexName = this.defaultIndexName) {
    try {
      const index = await this.initializeIndex(indexName);
      
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

      console.log(`Stored conversation in Pinecone index "${indexName}" namespace "${targetNamespace}" with ID: ${id}`);
    } catch (error) {
      console.error('Error storing conversation in Pinecone:', error);
      throw error;
    }
  }

  async searchSimilarConversations(embedding: number[], topK: number = 5, namespace?: string | string[], indexName: PineconeIndexName = this.defaultIndexName) {
    try {
      const index = await this.initializeIndex(indexName);
      
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

  async deleteConversation(id: string, namespace?: string, indexName: PineconeIndexName = this.defaultIndexName) {
    try {
      const index = await this.initializeIndex(indexName);
      const targetNamespace = namespace || 'default';
      
      await index.namespace(targetNamespace).deleteOne(id);
      console.log(`Deleted conversation from Pinecone index "${indexName}" namespace "${targetNamespace}" with ID: ${id}`);
    } catch (error) {
      console.error('Error deleting conversation from Pinecone:', error);
      throw error;
    }
  }

  async getStats(indexName: PineconeIndexName = this.defaultIndexName) {
    try {
      const index = await this.initializeIndex(indexName);
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