import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

// Namespace-based Pinecone service - cheaper than Assistants API
class PineconeNamespaceService {
  private client?: Pinecone;
  private openai?: OpenAI;
  private apiKey: string;
  private indexName: string;
  private namespaces: string[];

  constructor() {
    this.apiKey = process.env.PINECONE_API_KEY || '';
    this.indexName = 'ask-elxr'; // Use ask-elxr index
    this.namespaces = ['mark-kohl', 'default']; // Query Mark's namespace + general
    
    if (!this.apiKey) {
      console.warn('PINECONE_API_KEY not found - Namespace service will not be available');
      return;
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      console.warn('OPENAI_API_KEY not found - Cannot generate embeddings');
      return;
    }
    
    this.client = new Pinecone({ apiKey: this.apiKey });
    this.openai = new OpenAI({ apiKey: openaiKey });
  }

  async retrieveContext(query: string, topK: number = 3): Promise<any[]> {
    if (!this.apiKey || !this.client || !this.openai) {
      throw new Error('Pinecone or OpenAI not configured');
    }

    try {
      // Generate embedding for the query using OpenAI
      console.log(`🔍 Generating embedding for query: "${query}"`);
      const embeddingResponse = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: query,
      });
      
      const embedding = embeddingResponse.data[0].embedding;
      console.log(`✅ Embedding generated (${embedding.length} dimensions)`);

      // Get the index
      const index = this.client.index(this.indexName);
      
      // Query across all namespaces and combine results
      const allResults: any[] = [];
      
      for (const namespace of this.namespaces) {
        try {
          console.log(`🔍 Querying namespace: ${namespace}`);
          
          const queryResponse = await index.namespace(namespace).query({
            vector: embedding,
            topK: topK,
            includeMetadata: true,
          });

          if (queryResponse.matches && queryResponse.matches.length > 0) {
            console.log(`✅ Found ${queryResponse.matches.length} results in ${namespace}`);
            
            // Extract text from metadata and format results
            for (const match of queryResponse.matches) {
              if (match.metadata && match.metadata.text) {
                allResults.push({
                  text: match.metadata.text as string,
                  score: match.score || 0,
                  metadata: {
                    namespace: namespace,
                    ...match.metadata
                  }
                });
              }
            }
          } else {
            console.log(`📭 No results in ${namespace}`);
          }
        } catch (error) {
          console.error(`Error querying namespace ${namespace}:`, error);
          // Continue with other namespaces
        }
      }

      if (allResults.length === 0) {
        console.log('📭 No results from any namespace');
        return [];
      }

      // Sort all results by score (highest first)
      allResults.sort((a, b) => (b.score || 0) - (a.score || 0));
      
      // Take top results
      const topResults = allResults.slice(0, topK);
      
      // Combine text from top results
      const combinedText = topResults
        .map((r, i) => `[Result ${i + 1} from ${r.metadata.namespace}]\n${r.text}`)
        .join('\n\n---\n\n');

      console.log(`📚 Total results: ${allResults.length}, returning top ${topResults.length}`);
      console.log(`📝 Combined context length: ${combinedText.length} chars`);

      return [{
        text: combinedText,
        score: topResults[0]?.score || 0,
        metadata: {
          namespaces: this.namespaces,
          totalResults: allResults.length,
          topResults: topResults.length
        }
      }];
      
    } catch (error) {
      console.error('Error retrieving context from Pinecone:', error);
      throw error;
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey && !!this.client && !!this.openai;
  }

  // Configure which namespaces to query
  setNamespaces(namespaces: string[]) {
    this.namespaces = namespaces;
  }

  // Configure which index to use
  setIndex(indexName: string) {
    this.indexName = indexName;
  }
}

export const pineconeNamespaceService = new PineconeNamespaceService();
