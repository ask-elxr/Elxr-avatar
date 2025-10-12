// Mem0 service for long-term memory management
// API Documentation: https://docs.mem0.ai/

interface Mem0Memory {
  id: string;
  memory: string;
  user_id: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface Mem0SearchResult {
  id: string;
  memory: string;
  user_id: string;
  score: number;
}

class Mem0Service {
  private apiKey: string;
  private baseUrl: string = "https://api.mem0.ai/v1";

  constructor() {
    const apiKey = process.env.MEM0_API_KEY;
    if (!apiKey) {
      throw new Error('MEM0_API_KEY environment variable is required');
    }
    this.apiKey = apiKey;
  }

  // Add a memory for a user
  async addMemory(userId: string, message: string, metadata?: Record<string, any>): Promise<Mem0Memory> {
    try {
      const response = await fetch(`${this.baseUrl}/memories`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: message
            }
          ],
          user_id: userId,
          metadata: metadata || {}
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Mem0 addMemory API error:', response.status, errorText);
        throw new Error(`Mem0 API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error adding memory to Mem0:', error);
      throw error;
    }
  }

  // Search memories for a user
  async searchMemories(userId: string, query: string, limit: number = 5): Promise<Mem0SearchResult[]> {
    try {
      const response = await fetch(`${this.baseUrl}/memories/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          user_id: userId,
          limit
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Mem0 searchMemories API error:', response.status, errorText);
        throw new Error(`Mem0 API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.results || [];
    } catch (error) {
      console.error('Error searching memories in Mem0:', error);
      throw error;
    }
  }

  // Get all memories for a user
  async getUserMemories(userId: string): Promise<Mem0Memory[]> {
    try {
      const response = await fetch(`${this.baseUrl}/memories?user_id=${userId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Mem0 getUserMemories API error:', response.status, errorText);
        throw new Error(`Mem0 API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.results || [];
    } catch (error) {
      console.error('Error getting user memories from Mem0:', error);
      throw error;
    }
  }

  // Delete a specific memory
  async deleteMemory(memoryId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/memories/${memoryId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Mem0 deleteMemory API error:', response.status, errorText);
        throw new Error(`Mem0 API error: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error deleting memory from Mem0:', error);
      throw error;
    }
  }

  // Delete all memories for a user
  async deleteUserMemories(userId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/memories?user_id=${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Mem0 deleteUserMemories API error:', response.status, errorText);
        throw new Error(`Mem0 API error: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error deleting user memories from Mem0:', error);
      throw error;
    }
  }
}

export const mem0Service = new Mem0Service();
