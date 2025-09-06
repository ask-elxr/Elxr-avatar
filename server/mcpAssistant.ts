import { Pinecone } from '@pinecone-database/pinecone';

class PineconeAssistantAPI {
  private pinecone?: Pinecone;
  private assistantName: string;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.PINECONE_API_KEY || '';
    this.assistantName = 'knowledge-base-assistant';
    
    if (!this.apiKey) {
      console.warn('PINECONE_API_KEY not found - Assistant API will not be available');
    } else {
      this.pinecone = new Pinecone({
        apiKey: this.apiKey
      });
    }
  }

  async retrieveContext(query: string, maxResults: number = 5): Promise<any[]> {
    if (!this.apiKey || !this.pinecone) {
      throw new Error('Pinecone API key not configured');
    }

    try {
      console.log(`🔍 Querying Pinecone Assistant: ${this.assistantName}`);

      // Try different methods to access the assistant
      try {
        // Method 1: Try assistants.query if it exists
        const response = await (this.pinecone as any).assistants.query({
          assistant: this.assistantName,
          query: query
        });
        
        console.log('✅ Successfully connected to Pinecone Assistant via assistants.query');
        return this.formatResponse(response);
      } catch (error1) {
        console.log('Method 1 failed, trying inference API...');
        
        try {
          // Method 2: Try inference API with assistant model
          const response = await (this.pinecone as any).inference.chat({
            model: this.assistantName,
            messages: [{ role: 'user', content: query }]
          });
          
          console.log('✅ Successfully connected to Pinecone Assistant via inference');
          return this.formatResponse(response);
        } catch (error2) {
          console.log('Method 2 failed, trying direct HTTP call...');
          
          // Method 3: Direct HTTP call to assistant endpoint
          const response = await fetch(`https://api.pinecone.io/assistant/chat/completions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: this.assistantName,
              messages: [{ role: 'user', content: query }]
            })
          });

          if (response.ok) {
            const data = await response.json();
            console.log('✅ Successfully connected to Pinecone Assistant via HTTP');
            return this.formatResponse(data);
          }
          
          throw new Error('All connection methods failed');
        }
      }
      
    } catch (error) {
      console.error('Error retrieving context from Pinecone Assistant:', error);
      throw error;
    }
  }

  private formatResponse(response: any): any[] {
    // Handle different response formats
    if (response.choices && response.choices.length > 0) {
      const assistantResponse = response.choices[0].message?.content || '';
      return [{
        text: assistantResponse,
        score: 1.0,
        metadata: { source: 'knowledge-base-assistant' }
      }];
    }
    
    if (response.results && Array.isArray(response.results)) {
      return response.results.map((result: any) => ({
        text: result.content || result.text || '',
        score: result.score || 1.0,
        metadata: result.metadata || { source: 'knowledge-base-assistant' }
      }));
    }
    
    return [{
      text: JSON.stringify(response),
      score: 1.0,
      metadata: { source: 'knowledge-base-assistant' }
    }];
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