interface GoogleSearchResult {
  title: string;
  link: string;
  snippet: string;
}

interface GoogleSearchResponse {
  items?: GoogleSearchResult[];
  searchInformation?: {
    totalResults: string;
    searchTime: number;
  };
}

export class GoogleSearchService {
  private apiKey: string;
  private searchEngineId: string;

  constructor() {
    // Get Google API credentials from environment variables
    this.apiKey = process.env.GOOGLE_SEARCH_API_KEY || '';
    this.searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID || process.env.GOOGLE_SEARCH_CX || '';
    
    if (!this.apiKey) {
      console.warn('GOOGLE_SEARCH_API_KEY not found - Google Search features will be disabled');
    }
    if (!this.searchEngineId) {
      console.warn('GOOGLE_SEARCH_ENGINE_ID or GOOGLE_SEARCH_CX not found - Google Search features will be disabled');
    }
  }

  // Check if Google Search is available
  isAvailable(): boolean {
    return !!(this.apiKey && this.searchEngineId);
  }

  // Search Google and return formatted results
  async search(query: string, maxResults: number = 5): Promise<string> {
    if (!this.isAvailable()) {
      console.warn('Google Search not available - missing API credentials');
      return '';
    }

    try {
      const searchUrl = new URL('https://www.googleapis.com/customsearch/v1');
      searchUrl.searchParams.set('key', this.apiKey);
      searchUrl.searchParams.set('cx', this.searchEngineId);
      searchUrl.searchParams.set('q', query);
      searchUrl.searchParams.set('num', Math.min(maxResults, 10).toString());

      console.log(`Attempting Google search for: "${query}"`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      const response = await fetch(searchUrl.toString(), {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Google Search API error:', response.status, response.statusText);
        console.error('Error details:', errorText);
        
        // Check if it's a quota/billing issue
        if (response.status === 403) {
          return `[Search temporarily unavailable - API quota exceeded. Please check your Google Cloud billing and quota settings.]`;
        } else if (response.status === 400) {
          return `[Search configuration error - Please verify your Google Custom Search Engine ID is correct.]`;
        }
        
        return `[Web search temporarily unavailable due to API error]`;
      }

      const data: GoogleSearchResponse = await response.json();
      
      if (!data.items || data.items.length === 0) {
        return `[No recent web results found for: "${query}"]`;
      }

      // Format results for context
      let formattedResults = `Recent web search results for "${query}":\n\n`;
      
      data.items.slice(0, maxResults).forEach((item, index) => {
        formattedResults += `${index + 1}. ${item.title}\n`;
        formattedResults += `   ${item.snippet}\n`;
        formattedResults += `   Source: ${item.link}\n\n`;
      });

      console.log(`Google search successful: Found ${data.items.length} results`);
      return formattedResults;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('Google Search timeout');
        return `[Web search timed out - please try again]`;
      }
      console.error('Google Search error:', error);
      return `[Web search temporarily unavailable]`;
    }
  }

  // Quick search for recent information
  async quickSearch(query: string): Promise<string> {
    return this.search(query, 3);
  }

  // Search for current events or time-sensitive information
  async searchCurrentEvents(query: string): Promise<string> {
    const timeBasedQuery = `${query} 2024 2025 recent news`;
    return this.search(timeBasedQuery, 4);
  }

  // Check if query might benefit from web search
  shouldUseWebSearch(query: string): boolean {
    const webSearchKeywords = [
      'current', 'recent', 'latest', 'news', 'today', 'this year', '2024', '2025',
      'update', 'happening', 'now', 'live', 'breaking', 'price', 'stock',
      'weather', 'forecast', 'schedule', 'events', 'when is', 'what happened'
    ];

    const lowerQuery = query.toLowerCase();
    return webSearchKeywords.some(keyword => lowerQuery.includes(keyword));
  }
}

export const googleSearchService = new GoogleSearchService();