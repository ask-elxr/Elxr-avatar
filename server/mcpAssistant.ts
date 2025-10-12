import { Pinecone } from '@pinecone-database/pinecone';

class PineconeAssistantAPI {
  private client?: Pinecone;
  private assistantNames: string[];
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.PINECONE_API_KEY || '';
    // Use only knowledge-base-assistant for faster responses
    this.assistantNames = ['knowledge-base-assistant'];
    
    if (!this.apiKey) {
      console.warn('PINECONE_API_KEY not found - Assistant API will not be available');
    } else {
      this.client = new Pinecone({
        apiKey: this.apiKey
      });
    }
  }

  async retrieveContext(query: string, maxResults: number = 5): Promise<any[]> {
    if (!this.apiKey || !this.client) {
      throw new Error('Pinecone API key not configured');
    }

    try {
      const allResults: any[] = [];

      // Query assistant(s) for knowledge retrieval
      const assistantPromises = this.assistantNames.map(async (assistantName) => {
        try {
          console.log(`🔍 Querying Pinecone Assistant: ${assistantName}`);
          
          const assistant = this.client!.Assistant(assistantName);
          
          const response = await assistant.chat({
            messages: [
              {
                role: 'user',
                content: query
              }
            ]
          });

          console.log(`✅ Successfully connected to ${assistantName}`);
          
          return {
            text: response.message?.content || 'No response content',
            score: 1.0,
            metadata: { 
              source: assistantName,
              citations: response.citations || [],
              usage: response.usage || {}
            }
          };
        } catch (error) {
          console.error(`Error querying ${assistantName}:`, error);
          return null; // Don't fail if one assistant has issues
        }
      });

      // Wait for all assistant queries to complete
      const results = await Promise.all(assistantPromises);
      
      // Combine results from assistant(s)
      const validResults = results.filter(r => r !== null);
      
      if (validResults.length === 0) {
        throw new Error('No results from Pinecone Assistant');
      }

      // If we have multiple results, combine them intelligently
      if (validResults.length > 1) {
        const combinedText = validResults
          .map((r, i) => `[From ${r!.metadata.source}]\n${r!.text}`)
          .join('\n\n---\n\n');
        
        return [{
          text: combinedText,
          score: 1.0,
          metadata: {
            sources: validResults.map(r => r!.metadata.source),
            allCitations: validResults.flatMap(r => r!.metadata.citations),
            combinedUsage: validResults.reduce((acc, r) => ({
              ...acc,
              ...r!.metadata.usage
            }), {})
          }
        }];
      }

      return validResults as any[];
      
    } catch (error) {
      console.error('Error retrieving context from Pinecone Assistants:', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.retrieveContext('test query', 1);
      return true;
    } catch (error) {
      console.error('Assistant connection test failed:', error);
      return false;
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }
}

export const pineconeAssistant = new PineconeAssistantAPI();