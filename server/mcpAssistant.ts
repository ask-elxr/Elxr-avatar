import { Pinecone } from '@pinecone-database/pinecone';

class PineconeAssistantAPI {
  private client?: Pinecone;
  private assistantName: string;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.PINECONE_API_KEY || '';
    this.assistantName = 'knowledge-base-assistant';
    
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
      console.log(`🔍 Querying Pinecone Assistant: ${this.assistantName}`);

      // Use the exact pattern from your working project
      const assistant = this.client.Assistant(this.assistantName);
      
      const response = await assistant.chat({
        messages: [
          {
            role: 'user',
            content: query
          }
        ]
      });

      console.log('✅ Successfully connected to Pinecone Assistant');
      
      // Format the response to match the expected format
      return [{
        text: response.message?.content || 'No response content',
        score: 1.0,
        metadata: { 
          source: 'knowledge-base-assistant',
          citations: response.citations || [],
          usage: response.usage || {}
        }
      }];
      
    } catch (error) {
      console.error('Error retrieving context from Pinecone Assistant:', error);
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