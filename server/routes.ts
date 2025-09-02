import type { Express } from "express";
import { createServer, type Server } from "http";
import { pineconeService } from "./pinecone.js";
import { insertConversationSchema } from "../shared/schema.js";

export async function registerRoutes(app: Express): Promise<Server> {
  // HeyGen API token endpoint
  app.post("/api/heygen/token", async (req, res) => {
    try {
      const apiKey = process.env.HEYGEN_API_KEY || process.env.VITE_HEYGEN_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ 
          error: "HeyGen API key not configured. Please set HEYGEN_API_KEY environment variable." 
        });
      }

      const response = await fetch('https://api.heygen.com/v1/streaming.create_token', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('HeyGen API error:', response.status, errorText);
        return res.status(response.status).json({ 
          error: `HeyGen API error: ${response.statusText}` 
        });
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Error creating HeyGen token:', error);
      res.status(500).json({ 
        error: "Failed to create HeyGen access token" 
      });
    }
  });

  // Pinecone conversation endpoints
  app.post("/api/conversations", async (req, res) => {
    try {
      const validatedData = insertConversationSchema.parse(req.body);
      
      // Store in Pinecone if embedding is provided
      if (validatedData.embedding) {
        const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        await pineconeService.storeConversation(
          conversationId,
          validatedData.text,
          validatedData.embedding as number[],
          validatedData.metadata || {}
        );

        res.json({ 
          success: true, 
          id: conversationId,
          message: "Conversation stored successfully" 
        });
      } else {
        res.status(400).json({ 
          error: "Embedding is required to store conversation" 
        });
      }
    } catch (error) {
      console.error('Error storing conversation:', error);
      res.status(500).json({ 
        error: "Failed to store conversation" 
      });
    }
  });

  app.post("/api/conversations/search", async (req, res) => {
    try {
      const { embedding, topK = 5 } = req.body;
      
      if (!embedding || !Array.isArray(embedding)) {
        return res.status(400).json({ 
          error: "Valid embedding array is required" 
        });
      }

      const results = await pineconeService.searchSimilarConversations(embedding, topK);
      
      res.json({ 
        success: true, 
        results: results.map(match => ({
          id: match.id,
          score: match.score,
          text: match.metadata?.text,
          metadata: match.metadata
        }))
      });
    } catch (error) {
      console.error('Error searching conversations:', error);
      res.status(500).json({ 
        error: "Failed to search conversations" 
      });
    }
  });

  app.delete("/api/conversations/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      await pineconeService.deleteConversation(id);
      
      res.json({ 
        success: true, 
        message: "Conversation deleted successfully" 
      });
    } catch (error) {
      console.error('Error deleting conversation:', error);
      res.status(500).json({ 
        error: "Failed to delete conversation" 
      });
    }
  });

  app.get("/api/pinecone/stats", async (req, res) => {
    try {
      const stats = await pineconeService.getStats();
      res.json({ success: true, stats });
    } catch (error) {
      console.error('Error getting Pinecone stats:', error);
      res.status(500).json({ 
        error: "Failed to get Pinecone stats" 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
