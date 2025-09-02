import type { Express } from "express";
import { createServer, type Server } from "http";

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

  const httpServer = createServer(app);
  return httpServer;
}
