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
    // Set the Google API key directly for now
    this.apiKey = 'AIzaSyBORVWZbxxGlpm7mBeKOgYaJaeJhkKmWYQ';
    this.searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID || '';
    
    if (!this.searchEngineId) {
      console.warn('GOOGLE_SEARCH_ENGINE_ID not found - Google Search features will be limited');
    }
  }

  // Check if Google Search is available
  isAvailable(): boolean {
    return !!(this.apiKey && this.searchEngineId);
  }

  // Search Google and return formatted results
  async search(query: string, maxResults: number = 5): Promise<string> {
    if (!this.isAvailable()) {
      console.warn('Google Search not available - missing Search Engine ID');
      return '';
    }

    try {
      const searchUrl = new URL('https://www.googleapis.com/customsearch/v1');
      searchUrl.searchParams.set('key', this.apiKey);
      searchUrl.searchParams.set('cx', this.searchEngineId);
      searchUrl.searchParams.set('q', query);
      searchUrl.searchParams.set('num', Math.min(maxResults, 10).toString());

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(searchUrl.toString(), {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error('Google Search API error:', response.status, response.statusText);
        return '';
      }

      const data: GoogleSearchResponse = await response.json();
      
      if (!data.items || data.items.length === 0) {
        return `No recent web results found for: ${query}`;
      }

      // Format results for context
      let formattedResults = `Recent web search results for "${query}":\n\n`;
      
      data.items.slice(0, maxResults).forEach((item, index) => {
        formattedResults += `${index + 1}. ${item.title}\n`;
        formattedResults += `   ${item.snippet}\n`;
        formattedResults += `   Source: ${item.link}\n\n`;
      });

      return formattedResults;
    } catch (error) {
      console.error('Google Search error:', error);
      return '';
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