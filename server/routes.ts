import type { Express } from "express";
import { createServer, type Server } from "http";
import { pineconeService } from "./pinecone.js";
import { documentProcessor } from "./documentProcessor.js";
import { ObjectStorageService } from "./objectStorage.js";
import { insertConversationSchema, insertDocumentSchema } from "../shared/schema.js";
import multer from "multer";
import * as fs from "fs";
import * as path from "path";

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

  // Configure multer for file uploads
  const upload = multer({ dest: 'uploads/' });
  const objectStorageService = new ObjectStorageService();

  // Document upload and processing endpoints
  app.post("/api/documents/upload", upload.single('document'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { originalname, mimetype, size, path: tempPath } = req.file;
      const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Validate file type
      const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain'
      ];

      if (!allowedTypes.includes(mimetype)) {
        fs.unlinkSync(tempPath); // Clean up temp file
        return res.status(400).json({ 
          error: "Unsupported file type. Supported types: PDF, DOCX, TXT" 
        });
      }

      // Get upload URL from object storage
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      
      // Read file and upload to object storage
      const fileBuffer = fs.readFileSync(tempPath);
      
      try {
        const uploadResponse = await fetch(uploadURL, {
          method: 'PUT',
          body: fileBuffer,
          headers: {
            'Content-Type': mimetype,
          },
        });

        if (!uploadResponse.ok) {
          throw new Error(`Upload failed: ${uploadResponse.statusText}`);
        }

        // Get the object path from the upload URL
        const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

        // Process document in background
        documentProcessor.processDocument(tempPath, mimetype, documentId, {
          filename: originalname,
          fileSize: size,
          uploadedAt: new Date().toISOString()
        }).then((result) => {
          console.log(`Document processing completed for ${documentId}:`, result);
        }).catch((error) => {
          console.error(`Document processing failed for ${documentId}:`, error);
        });

        // Clean up temp file
        fs.unlinkSync(tempPath);

        res.json({
          success: true,
          documentId,
          filename: originalname,
          fileType: mimetype,
          fileSize: size,
          objectPath,
          status: "processing",
          message: "Document uploaded and processing started"
        });

      } catch (uploadError) {
        console.error('Object storage upload error:', uploadError);
        fs.unlinkSync(tempPath);
        return res.status(500).json({ 
          error: "Failed to upload to object storage" 
        });
      }

    } catch (error) {
      console.error('Document upload error:', error);
      if (req.file?.path) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ 
        error: "Failed to upload document" 
      });
    }
  });

  // Search documents for RAG
  app.post("/api/documents/search", async (req, res) => {
    try {
      const { query, maxResults = 5 } = req.body;
      
      if (!query) {
        return res.status(400).json({ 
          error: "Query is required" 
        });
      }

      const results = await documentProcessor.searchDocuments(query, maxResults);
      
      res.json({
        success: true,
        query,
        results: results.map(result => ({
          text: result.text,
          score: result.score,
          documentId: result.documentId,
          metadata: result.metadata
        }))
      });
    } catch (error) {
      console.error('Document search error:', error);
      res.status(500).json({ 
        error: "Failed to search documents" 
      });
    }
  });

  // Get conversation context for RAG
  app.post("/api/chat/context", async (req, res) => {
    try {
      const { query, maxTokens = 2000 } = req.body;
      
      if (!query) {
        return res.status(400).json({ 
          error: "Query is required" 
        });
      }

      const context = await documentProcessor.getConversationContext(query, maxTokens);
      
      res.json({
        success: true,
        query,
        context,
        length: context.length
      });
    } catch (error) {
      console.error('Context retrieval error:', error);
      res.status(500).json({ 
        error: "Failed to get conversation context" 
      });
    }
  });

  // Session management endpoints
  app.post("/api/sessions", async (req, res) => {
    try {
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ 
          error: "User ID is required" 
        });
      }

      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      res.json({
        success: true,
        sessionId,
        userId,
        conversationHistory: [],
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Session creation error:', error);
      res.status(500).json({ 
        error: "Failed to create session" 
      });
    }
  });

  app.post("/api/sessions/:sessionId/messages", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { message, isUser = true } = req.body;
      
      if (!message) {
        return res.status(400).json({ 
          error: "Message is required" 
        });
      }

      // If this is a user message, get RAG context
      let context = '';
      if (isUser) {
        context = await documentProcessor.getConversationContext(message);
      }

      const messageEntry = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        message,
        isUser,
        context: isUser ? context : undefined,
        timestamp: new Date().toISOString()
      };

      res.json({
        success: true,
        sessionId,
        message: messageEntry,
        context: isUser ? context : undefined
      });
    } catch (error) {
      console.error('Message processing error:', error);
      res.status(500).json({ 
        error: "Failed to process message" 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
