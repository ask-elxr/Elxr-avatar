// Mem0 service for long-term memory management
// API Documentation: https://docs.mem0.ai/
import Anthropic from '@anthropic-ai/sdk';

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
  metadata?: Record<string, any>;
}

type MemoryType = 'preference' | 'bio' | 'task' | 'goal' | 'health' | 'relationship' | 'skip';

interface ExtractedFact {
  fact: string;
  type: MemoryType;
  confidence: number;
}

class Mem0Service {
  private apiKey: string;
  private baseUrl: string = "https://api.mem0.ai/v1";
  private anthropic: Anthropic | null = null;

  constructor() {
    this.apiKey = process.env.MEM0_API_KEY || '';
    if (!this.apiKey) {
      console.warn('⚠️  MEM0_API_KEY not set - Memory service will not be available');
    }
    try {
      this.anthropic = new Anthropic();
    } catch {
      console.warn('⚠️  Anthropic not configured for memory extraction');
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  // Extract structured facts from a message using Claude
  private async extractFacts(userMessage: string, assistantResponse?: string): Promise<ExtractedFact[]> {
    if (!this.anthropic) return [];
    
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 500,
        system: `You extract memorable facts from conversations. Only extract concrete, reusable information.

EXTRACT these types:
- preference: User likes/dislikes, habits, preferences (e.g., "prefers morning workouts", "doesn't eat gluten")
- bio: Personal info - name, age, job, location, family (e.g., "works as a software engineer", "has 2 kids")
- goal: Goals, aspirations, targets (e.g., "wants to lose 20 pounds", "training for marathon")
- health: Health conditions, medications, symptoms (e.g., "has type 2 diabetes", "takes metformin")
- task: Specific tasks or commitments mentioned (e.g., "needs to call doctor Monday")
- relationship: People mentioned and their relationship (e.g., "wife named Sarah", "boss is demanding")

SKIP (return type: "skip"):
- Greetings, small talk ("hi", "how are you", "thanks")
- Questions without factual content
- Vague statements without specifics
- Emotional expressions without context

Return JSON array: [{"fact": "concise fact", "type": "type", "confidence": 0.0-1.0}]
Only include facts with confidence >= 0.7. Return [] if nothing worth remembering.`,
        messages: [{
          role: 'user',
          content: `Extract facts from this conversation:
User: ${userMessage}
${assistantResponse ? `Assistant: ${assistantResponse}` : ''}

Return only valid JSON array.`
        }]
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const facts = JSON.parse(jsonMatch[0]) as ExtractedFact[];
        return facts.filter(f => f.type !== 'skip' && f.confidence >= 0.7);
      }
      return [];
    } catch (error) {
      console.error('Error extracting facts:', error);
      return [];
    }
  }

  // Check for duplicate memories before adding
  private async isDuplicate(userId: string, newFact: string): Promise<boolean> {
    try {
      const existing = await this.searchMemories(userId, newFact, 3);
      for (const mem of existing) {
        if (mem.score > 0.85) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  // Add a memory with smart extraction and deduplication
  async addMemory(userId: string, message: string, metadata?: Record<string, any>): Promise<Mem0Memory | null> {
    try {
      // Extract structured facts from the message
      const facts = await this.extractFacts(message);
      
      if (facts.length === 0) {
        console.log('📝 No memorable facts extracted, skipping memory storage');
        return null;
      }

      let storedMemory: Mem0Memory | null = null;

      for (const fact of facts) {
        // Check for duplicates
        const isDup = await this.isDuplicate(userId, fact.fact);
        if (isDup) {
          console.log(`📝 Skipping duplicate memory: ${fact.fact.substring(0, 50)}...`);
          continue;
        }

        const response = await fetch(`${this.baseUrl}/memories`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: fact.fact }],
            user_id: userId,
            metadata: {
              ...metadata,
              type: fact.type,
              confidence: fact.confidence,
              extracted_at: new Date().toISOString(),
            }
          }),
        });

        if (response.ok) {
          storedMemory = await response.json();
          console.log(`📝 Stored ${fact.type} memory: ${fact.fact.substring(0, 50)}...`);
        }
      }

      return storedMemory;
    } catch (error) {
      console.error('Error adding memory to Mem0:', error);
      throw error;
    }
  }

  // Add memory from a full conversation turn (user + assistant)
  async addConversationMemory(userId: string, userMessage: string, assistantResponse: string, metadata?: Record<string, any>): Promise<Mem0Memory | null> {
    try {
      const facts = await this.extractFacts(userMessage, assistantResponse);
      
      if (facts.length === 0) {
        return null;
      }

      let storedMemory: Mem0Memory | null = null;

      for (const fact of facts) {
        const isDup = await this.isDuplicate(userId, fact.fact);
        if (isDup) continue;

        const response = await fetch(`${this.baseUrl}/memories`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: fact.fact }],
            user_id: userId,
            metadata: {
              ...metadata,
              type: fact.type,
              confidence: fact.confidence,
              extracted_at: new Date().toISOString(),
            }
          }),
        });

        if (response.ok) {
          storedMemory = await response.json();
          console.log(`📝 Stored ${fact.type} memory from conversation: ${fact.fact.substring(0, 50)}...`);
        }
      }

      return storedMemory;
    } catch (error) {
      console.error('Error adding conversation memory:', error);
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
