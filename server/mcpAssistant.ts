class PineconeAssistantAPI {
  private apiKey: string;
  private assistantHost: string;
  private assistantName: string;

  constructor() {
    this.apiKey = process.env.PINECONE_API_KEY || '';
    this.assistantHost = 'https://prod-1-data.ke.pinecone.io';
    this.assistantName = 'knowledge-base-assistant';
    
    if (!this.apiKey) {
      console.warn('PINECONE_API_KEY not found - Assistant API will not be available');
    }
  }

  async retrieveContext(query: string, maxResults: number = 5): Promise<any[]> {
    if (!this.apiKey) {
      throw new Error('Pinecone API key not configured');
    }

    try {
      // Try different API endpoints that might work with your assistant
      const endpoints = [
        `/mcp/assistants/${this.assistantName}/query`,
        `/assistants/${this.assistantName}/query`,
        `/v1/assistants/${this.assistantName}/query`
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(`${this.assistantHost}${endpoint}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              query: query,
              topK: maxResults,
              includeMetadata: true
            })
          });

          if (response.ok) {
            const data = await response.json();
            console.log(`Successfully connected to ${endpoint}`);
            
            // Transform the response to match expected format
            if (data.matches || data.results) {
              return (data.matches || data.results).map((match: any) => ({
                text: match.metadata?.text || match.text || '',
                score: match.score || 0,
                metadata: match.metadata || {}
              }));
            }
            
            return [];
          }
        } catch (error) {
          console.log(`Endpoint ${endpoint} failed:`, error);
          continue; // Try next endpoint
        }
      }

      throw new Error('All assistant API endpoints failed');
      
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