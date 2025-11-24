import { Pinecone } from '@pinecone-database/pinecone';

export enum PineconeIndexName {
  AVATAR_CHAT = 'avatar-chat-knowledge',
  ASK_ELXR = 'ask-elxr'
}

class PineconeService {
  private client?: Pinecone;
  private apiKey: string;
  private defaultIndexName: PineconeIndexName = PineconeIndexName.AVATAR_CHAT;

  constructor() {
    this.apiKey = process.env.PINECONE_API_KEY || '';
    if (!this.apiKey) {
      console.warn('⚠️  PINECONE_API_KEY not set - Pinecone service will not be available');
      return;
    }

    this.client = new Pinecone({
      apiKey: this.apiKey,
    });
  }

  isAvailable(): boolean {
    return !!this.apiKey && !!this.client;
  }

  async initializeIndex(indexName: PineconeIndexName = this.defaultIndexName) {
    if (!this.client) {
      throw new Error('Pinecone client not initialized - check PINECONE_API_KEY');
    }

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
    if (!this.client) {
      throw new Error('Pinecone client not initialized - check PINECONE_API_KEY');
    }

    try {
      const response = await this.client.listIndexes();
      return response.indexes || [];
    } catch (error) {
      console.error('Error listing Pinecone indexes:', error);
      throw error;
    }
  }

  async migrateNamespace(
    sourceNamespace: string, 
    targetNamespace: string, 
    indexName: PineconeIndexName = this.defaultIndexName,
    deleteSource: boolean = false
  ) {
    if (!this.client) {
      throw new Error('Pinecone client not initialized - check PINECONE_API_KEY');
    }

    try {
      console.log(`Starting migration from "${sourceNamespace}" to "${targetNamespace}" in index "${indexName}"`);
      
      const index = await this.initializeIndex(indexName);
      const sourceNs = index.namespace(sourceNamespace);
      const targetNs = index.namespace(targetNamespace);

      let migratedCount = 0;
      let paginationToken: string | undefined = undefined;
      const batchSize = 100;

      // List all vector IDs in the source namespace using pagination
      do {
        const listResponse = await sourceNs.listPaginated({
          limit: batchSize,
          paginationToken
        });

        if (listResponse.vectors && listResponse.vectors.length > 0) {
          const vectorIds = listResponse.vectors.map(v => v.id).filter((id): id is string => id !== undefined);
          
          // Fetch the full vectors with metadata and values
          const fetchResponse = await sourceNs.fetch(vectorIds);
          
          if (fetchResponse.records) {
            // Prepare vectors for upsert, filtering out any records missing values
            const vectorsToUpsert = Object.entries(fetchResponse.records)
              .filter(([_, record]) => record.values && record.values.length > 0)
              .map(([id, record]) => ({
                id,
                values: record.values,
                metadata: record.metadata
              }));

            const skippedCount = vectorIds.length - vectorsToUpsert.length;
            if (skippedCount > 0) {
              console.warn(`Skipped ${skippedCount} vectors with missing values`);
            }

            if (vectorsToUpsert.length > 0) {
              // Upsert to target namespace
              await targetNs.upsert(vectorsToUpsert);
              migratedCount += vectorsToUpsert.length;
              
              console.log(`Migrated ${vectorsToUpsert.length} vectors (total: ${migratedCount})`);

              // Delete from source if requested (only delete IDs that were actually upserted)
              if (deleteSource) {
                const upsertedIds = vectorsToUpsert.map(v => v.id);
                await sourceNs.deleteMany({ ids: upsertedIds });
                console.log(`Deleted ${upsertedIds.length} vectors from source namespace`);
              }
            }
          }
        }

        paginationToken = listResponse.pagination?.next;
      } while (paginationToken);

      console.log(`Migration complete: ${migratedCount} vectors migrated from "${sourceNamespace}" to "${targetNamespace}"`);
      
      return {
        success: true,
        migratedCount,
        sourceNamespace,
        targetNamespace,
        deletedSource: deleteSource
      };
    } catch (error) {
      console.error(`Error migrating namespace from "${sourceNamespace}" to "${targetNamespace}":`, error);
      throw error;
    }
  }
}

export const pineconeService = new PineconeService();