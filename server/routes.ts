import type { Express } from "express";
import { createServer, type Server } from "http";
import { pineconeService, PineconeIndexName } from "./pinecone.js";
import { documentProcessor } from "./documentProcessor.js";
import { ObjectStorageService } from "./objectStorage.js";
import { insertConversationSchema, insertDocumentSchema } from "../shared/schema.js";
import multer from "multer";
import * as fs from "fs";
import * as path from "path";
import { timeoutMiddleware, performanceMiddleware, rateLimitMiddleware } from "./performance.js";
import { claudeService } from "./claudeService.js";
import { googleSearchService } from "./googleSearchService.js";
import { setupAuth, isAuthenticated } from "./replitAuth.js";
import { storage } from "./storage.js";
import { mem0Service } from "./mem0Service.js";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);
  // Add performance monitoring middleware
  app.use(performanceMiddleware());
  
  // Add timeout middleware for all routes (30 second timeout for AI processing)
  app.use(timeoutMiddleware(30000));

  // Auth routes
  app.get('/api/auth/user', async (req: any, res) => {
    try {
      // If not authenticated or no user/claims, return null (not an error - this is expected for demo users)
      if (!req.isAuthenticated() || !req.user?.claims?.sub) {
        return res.json(null);
      }

      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // If user not found in DB, return null
      if (!user) {
        return res.json(null);
      }
      
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
  // HeyGen API token endpoint for Streaming SDK
  app.post("/api/heygen/token", async (req, res) => {
    try {
      const apiKey = process.env.HEYGEN_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ 
          error: "HeyGen API key not configured. Please set HEYGEN_API_KEY environment variable." 
        });
      }

      console.log('Creating HeyGen access token...');
      
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
          error: `HeyGen API error: ${response.statusText}`,
          details: errorText
        });
      }

      const data = await response.json();
      console.log('HeyGen token created successfully');
      
      // Return the token in the expected format
      res.json({ 
        token: data.data?.token || data.token,
        ...data 
      });
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
      const { indexName } = req.body;
      
      // Validate indexName if provided
      if (indexName && !Object.values(PineconeIndexName).includes(indexName)) {
        return res.status(400).json({ 
          error: "Invalid index name",
          validIndexes: Object.values(PineconeIndexName)
        });
      }
      
      const targetIndex = indexName as PineconeIndexName | undefined;
      const validatedData = insertConversationSchema.parse(req.body);
      
      // Store in Pinecone if embedding is provided
      if (validatedData.embedding) {
        const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        await pineconeService.storeConversation(
          conversationId,
          validatedData.text,
          validatedData.embedding as number[],
          validatedData.metadata || {},
          undefined, // namespace
          targetIndex
        );

        res.json({ 
          success: true, 
          id: conversationId,
          message: "Conversation stored successfully",
          indexName: targetIndex || PineconeIndexName.AVATAR_CHAT
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
      const { embedding, topK = 5, indexName } = req.body;
      
      if (!embedding || !Array.isArray(embedding)) {
        return res.status(400).json({ 
          error: "Valid embedding array is required" 
        });
      }

      // Validate indexName if provided
      if (indexName && !Object.values(PineconeIndexName).includes(indexName)) {
        return res.status(400).json({ 
          error: "Invalid index name",
          validIndexes: Object.values(PineconeIndexName)
        });
      }
      
      const targetIndex = indexName as PineconeIndexName | undefined;

      const results = await pineconeService.searchSimilarConversations(embedding, topK, undefined, targetIndex);
      
      res.json({ 
        success: true, 
        results: results.map(match => ({
          id: match.id,
          score: match.score,
          text: match.metadata?.text,
          metadata: match.metadata
        })),
        indexName: targetIndex || PineconeIndexName.AVATAR_CHAT
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
      const indexName = req.query.indexName as string | undefined;
      
      // Validate indexName if provided
      if (indexName && !Object.values(PineconeIndexName).includes(indexName as PineconeIndexName)) {
        return res.status(400).json({ 
          error: "Invalid index name",
          validIndexes: Object.values(PineconeIndexName)
        });
      }
      
      const targetIndex = indexName as PineconeIndexName | undefined;
      
      await pineconeService.deleteConversation(id, undefined, targetIndex);
      
      res.json({ 
        success: true, 
        message: "Conversation deleted successfully",
        indexName: targetIndex || PineconeIndexName.AVATAR_CHAT
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
      const indexName = req.query.indexName as string | undefined;
      
      // Validate indexName if provided
      if (indexName && !Object.values(PineconeIndexName).includes(indexName as PineconeIndexName)) {
        return res.status(400).json({ 
          error: "Invalid index name",
          validIndexes: Object.values(PineconeIndexName)
        });
      }
      
      const targetIndex = indexName as PineconeIndexName | undefined;
      
      const stats = await pineconeService.getStats(targetIndex);
      res.json({ 
        success: true, 
        stats,
        indexName: targetIndex || PineconeIndexName.AVATAR_CHAT
      });
    } catch (error) {
      console.error('Error getting Pinecone stats:', error);
      res.status(500).json({ 
        error: "Failed to get Pinecone stats" 
      });
    }
  });

  // Test endpoint to list available indexes
  app.get("/api/pinecone/indexes", async (req, res) => {
    try {
      const indexes = await pineconeService.listIndexes();
      res.json({ success: true, indexes });
    } catch (error) {
      console.error('Error listing Pinecone indexes:', error);
      res.status(500).json({ 
        error: "Failed to list Pinecone indexes",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get all available avatars
  app.get("/api/avatars", async (req, res) => {
    try {
      const { getAllAvatars } = await import('@shared/avatarConfig');
      const avatars = getAllAvatars();
      
      // Return avatar info without full personality prompts
      const avatarList = avatars.map(avatar => ({
        id: avatar.id,
        name: avatar.name,
        description: avatar.description,
        heygenAvatarId: avatar.heygenAvatarId,
        demoMinutes: avatar.demoMinutes
      }));
      
      res.json({ success: true, avatars: avatarList });
    } catch (error) {
      console.error('Error getting avatars:', error);
      res.status(500).json({ error: "Failed to get avatars" });
    }
  });

  // Get avatar response with Claude Sonnet 4 + Google Search + Knowledge Base + Mem0 Memory
  app.post("/api/avatar/response", async (req: any, res) => {
    try {
      const { message, conversationHistory = [], avatarId = 'mark-kohl', useWebSearch = true } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Check if user is authenticated for Mem0 long-term memory
      const userId = req.isAuthenticated() && req.user?.claims?.sub ? req.user.claims.sub : null;
      let userMemories = '';
      
      // Retrieve relevant memories for authenticated users
      if (userId && mem0Service.isAvailable()) {
        try {
          const memories = await mem0Service.searchMemories(userId, message, 5);
          if (memories.length > 0) {
            userMemories = `\n\nRELEVANT USER MEMORIES:\n${memories.map(m => `- ${m.memory}`).join('\n')}`;
          }
        } catch (error) {
          console.error('[Mem0] Error retrieving memories:', error);
          // Continue without memories if there's an error
        }
      }

      // Get avatar configuration
      const { getAvatar, DEFAULT_AVATAR } = await import('@shared/avatarConfig');
      const avatarConfig = getAvatar(avatarId) || getAvatar(DEFAULT_AVATAR)!;
      
      // Prepare personality with current date
      const currentDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const personalityPrompt = avatarConfig.personality.replace('{{CURRENT_DATE}}', currentDate);

      // Get knowledge base context using avatar's specific assistants
      const { pineconeAssistant } = await import('./mcpAssistant.js');
      let knowledgeContext = '';
      
      if (pineconeAssistant.isAvailable()) {
        const knowledgeResults = await pineconeAssistant.retrieveContext(
          message, 
          3,
          avatarConfig.pineconeAssistants
        );
        knowledgeContext = knowledgeResults.length > 0 ? knowledgeResults[0].text : '';
      }

      // Get web search results if requested or if query seems time-sensitive
      let webSearchResults = '';
      if (useWebSearch || googleSearchService.shouldUseWebSearch(message)) {
        if (googleSearchService.isAvailable()) {
          webSearchResults = await googleSearchService.search(message, 3);
        }
      }

      // Generate response using Claude Sonnet 4 with all context (including memories)
      let aiResponse: string;
      
      if (claudeService.isAvailable()) {
        // Combine knowledge context with user memories for authenticated users
        const enhancedKnowledgeContext = knowledgeContext + userMemories;
        
        const enhancedConversationHistory = conversationHistory.map((msg: any) => ({
          message: msg.message,
          isUser: msg.isUser
        }));

        if (webSearchResults) {
          aiResponse = await claudeService.generateEnhancedResponse(
            message,
            enhancedKnowledgeContext,  // Include memories in context
            webSearchResults,
            enhancedConversationHistory,
            personalityPrompt
          );
        } else {
          aiResponse = await claudeService.generateResponse(
            message,
            enhancedKnowledgeContext,  // Include memories in context
            enhancedConversationHistory,
            personalityPrompt
          );
        }
      } else {
        // Fallback to knowledge base only
        aiResponse = knowledgeContext || "I'm here to help, but I don't have specific information about that topic right now.";
      }
      
      // Store conversation in Mem0 for authenticated users
      if (userId && mem0Service.isAvailable()) {
        try {
          // Store user message
          await mem0Service.createMemory(userId, {
            role: 'user',
            content: message
          });
          // Store avatar response
          await mem0Service.createMemory(userId, {
            role: 'assistant',
            content: aiResponse
          });
        } catch (error) {
          console.error('[Mem0] Error storing conversation:', error);
          // Continue even if memory storage fails
        }
      }
      
      res.json({ 
        success: true, 
        message,
        knowledgeResponse: aiResponse,
        personalityUsed: personalityPrompt,
        usedWebSearch: !!webSearchResults,
        usedClaude: claudeService.isAvailable(),
        hasLongTermMemory: !!userId && mem0Service.isAvailable()
      });
    } catch (error) {
      console.error('Error getting avatar response:', error);
      if (!res.headersSent) {
        res.status(500).json({ 
          error: "Failed to get avatar response",
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  });

  // Test Pinecone Assistant connection
  app.post("/api/assistant/test", async (req, res) => {
    try {
      const { query = "test query" } = req.body;
      
      // Import here to avoid circular dependency issues
      const { pineconeAssistant } = await import('./mcpAssistant.js');
      
      if (!pineconeAssistant.isAvailable()) {
        return res.status(400).json({ 
          error: "Pinecone Assistant not available - check API key configuration" 
        });
      }

      const results = await pineconeAssistant.retrieveContext(query, 3);
      
      res.json({ 
        success: true, 
        query,
        results,
        message: "Pinecone Assistant connection successful"
      });
    } catch (error) {
      console.error('Error testing assistant connection:', error);
      res.status(500).json({ 
        error: "Failed to connect to Pinecone Assistant",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Configure multer for file uploads
  const upload = multer({ dest: 'uploads/' });
  const objectStorageService = new ObjectStorageService();

  // Document upload and processing endpoints (protected)
  app.post("/api/documents/upload", isAuthenticated, upload.single('document'), async (req: any, res) => {
    const userId = req.user.claims.sub;
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
        'text/plain',
        'audio/mp3',
        'audio/mpeg',
        'audio/wav',
        'audio/m4a',
        'audio/webm',
        'audio/mp4'
      ];

      if (!allowedTypes.includes(mimetype)) {
        fs.unlinkSync(tempPath); // Clean up temp file
        return res.status(400).json({ 
          error: "Unsupported file type. Supported types: PDF, DOCX, TXT, MP3, WAV, M4A, WebM" 
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

        // Get category from form data
        const category = req.body.category || null;
        
        // Process document in background with better error handling and resource cleanup
        documentProcessor.processDocument(tempPath, mimetype, documentId, {
          filename: originalname,
          fileSize: size,
          category,
          uploadedAt: new Date().toISOString(),
          userId
        }).then((result) => {
          console.log(`Document processing completed for ${documentId}:`, result);
        }).catch((error) => {
          console.error(`Document processing failed for ${documentId}:`, error);
          // Clean up temp file on processing error
          try {
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          } catch (cleanupError) {
            console.error('Error cleaning up temp file:', cleanupError);
          }
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
          status: "completed",
          message: "Document uploaded successfully",
          userId
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

  // Get user's documents
  app.get("/api/documents/user", async (req: any, res) => {
    try {
      const userId = "test-user";
      // For now, return upload history from Pinecone stats
      // In a full implementation, you'd query a documents table
      const stats = await pineconeService.getStats();
      res.json({
        success: true,
        userId,
        stats: stats,
        message: "User documents retrieved successfully"
      });
    } catch (error) {
      console.error('Error fetching user documents:', error);
      res.status(500).json({ 
        error: "Failed to fetch user documents" 
      });
    }
  });

  // Get all documents for knowledge base management
  app.get("/api/documents", async (req: any, res) => {
    try {
      const documents = await storage.getAllDocuments();
      res.json(documents);
    } catch (error) {
      console.error('Error fetching documents:', error);
      res.status(500).json({ 
        error: "Failed to fetch documents" 
      });
    }
  });

  // Delete a document
  app.delete("/api/documents/:id", async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = "test-user";
      
      // Get the document to check ownership
      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      // Check if user owns the document (in a production system you'd implement proper access control)
      if (document.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      await storage.deleteDocument(id);
      res.json({ success: true, message: "Document deleted successfully" });
    } catch (error) {
      console.error('Error deleting document:', error);
      res.status(500).json({ 
        error: "Failed to delete document" 
      });
    }
  });

  // Get all users for admin purposes
  app.get("/api/admin/users", async (req: any, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ 
        error: "Failed to fetch users" 
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
  app.post("/api/chat/context", rateLimitMiddleware(20, 60000), async (req, res) => {
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

  // URL content processing endpoint
  app.post("/api/documents/url", async (req, res) => {
    try {
      const { url, category = null } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      // Fetch and process URL content
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(400).json({ error: "Failed to fetch URL content" });
      }

      const html = await response.text();
      // Simple text extraction (in a real app, you'd use a proper HTML parser)
      let textContent = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      
      const documentId = `url_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Process the extracted text with size limits
      if (textContent.length > 500000) { // Limit to 500KB
        textContent = textContent.substring(0, 500000);
        console.warn(`URL content truncated to 500KB for ${documentId}`);
      }
      
      // Create temporary file with extracted content
      const tempFilePath = `/tmp/${documentId}.txt`;
      fs.writeFileSync(tempFilePath, textContent);
      
      // Process the extracted text
      documentProcessor.processDocument(tempFilePath, "text/plain", documentId, {
        url,
        category,
        type: 'url_content',
        extractedAt: new Date().toISOString()
      }).then((result) => {
        console.log(`URL processing completed for ${documentId}:`, result);
        // Clean up temp file
        try {
          fs.unlinkSync(tempFilePath);
        } catch (cleanupError) {
          console.error('Error cleaning up temp file:', cleanupError);
        }
      }).catch((error) => {
        console.error(`URL processing failed for ${documentId}:`, error);
        // Clean up temp file on error too
        try { 
          fs.unlinkSync(tempFilePath); 
        } catch (cleanupError) {
          console.error('Error cleaning up temp file:', cleanupError);
        }
      });

      res.json({
        success: true,
        documentId,
        filename: new URL(url).hostname,
        fileType: 'text/html',
        fileSize: textContent.length,
        status: "completed",
        message: "URL content extracted and processing started"
      });

    } catch (error) {
      console.error('URL processing error:', error);
      res.status(500).json({ 
        error: "Failed to process URL" 
      });
    }
  });

  // Text content processing endpoint
  app.post("/api/documents/text", async (req, res) => {
    try {
      const { text, title = 'Custom Text Input', category = null } = req.body;
      
      if (!text) {
        return res.status(400).json({ error: "Text content is required" });
      }

      const documentId = `text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Limit text size to prevent memory issues
      let limitedText = text;
      if (text.length > 500000) { // Limit to 500KB
        limitedText = text.substring(0, 500000);
        console.warn(`Text content truncated to 500KB for ${documentId}`);
      }
      
      // Create temporary file with text content
      const tempFilePath = `/tmp/${documentId}.txt`;
      fs.writeFileSync(tempFilePath, limitedText);

      // Process the text
      documentProcessor.processDocument(tempFilePath, "text/plain", documentId, {
        title,
        category,
        type: 'document_chunk',
        createdAt: new Date().toISOString()
      }).then((result) => {
        console.log(`Text processing completed for ${documentId}:`, result);
        // Clean up temp file
        fs.unlinkSync(tempFilePath);
      }).catch((error) => {
        console.error(`Text processing failed for ${documentId}:`, error);
        // Clean up temp file on error too
        try { fs.unlinkSync(tempFilePath); } catch {}
      });

      res.json({
        success: true,
        documentId,
        filename: title,
        fileType: 'text/plain',
        fileSize: text.length,
        status: "completed",
        message: "Text content processing started"
      });

    } catch (error) {
      console.error('Text processing error:', error);
      res.status(500).json({ 
        error: "Failed to process text content" 
      });
    }
  });

  // Audio transcription and processing endpoint
  app.post("/api/documents/dictation", upload.single('audio'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Audio file is required" });
      }

      const documentId = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const category = req.body.category || null;
      
      // Transcribe audio using OpenAI Whisper
      const transcribedText = await documentProcessor.extractTextFromFile(req.file.path, req.file.mimetype);
      
      // Create temporary file with transcribed content
      const tempFilePath = `/tmp/${documentId}.txt`;
      fs.writeFileSync(tempFilePath, transcribedText);

      // Process the transcribed text
      documentProcessor.processDocument(tempFilePath, "text/plain", documentId, {
        originalFilename: req.file.originalname,
        category,
        type: 'audio_transcription',
        audioFileSize: req.file.size,
        transcribedAt: new Date().toISOString()
      }).then((result) => {
        console.log(`Audio transcription processing completed for ${documentId}:`, result);
        // Clean up temp files
        fs.unlinkSync(tempFilePath);
        fs.unlinkSync(req.file!.path);
      }).catch((error) => {
        console.error(`Audio transcription processing failed for ${documentId}:`, error);
        // Clean up temp files on error too
        try { fs.unlinkSync(tempFilePath); } catch {}
        try { fs.unlinkSync(req.file!.path); } catch {}
      });

      res.json({
        success: true,
        documentId,
        filename: `Audio Recording - ${new Date().toLocaleString()}`,
        fileType: 'audio/wav',
        fileSize: req.file.size,
        status: "completed",
        message: "Audio transcription and processing started"
      });

    } catch (error) {
      console.error('Audio processing error:', error);
      if (req.file?.path) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      res.status(500).json({ 
        error: "Failed to process audio recording" 
      });
    }
  });

  // Enhanced AI chat endpoint with Claude Sonnet and Google Search
  app.post("/api/chat/enhanced", rateLimitMiddleware(30, 60000), async (req, res) => {
    try {
      const { 
        message, 
        conversationHistory = [], 
        useWebSearch = false,
        maxTokens = 2000 
      } = req.body;
      
      if (!message) {
        return res.status(400).json({ 
          error: "Message is required" 
        });
      }

      // Get conversation context from knowledge base
      const context = await documentProcessor.getConversationContext(message, maxTokens);
      
      let webSearchResults = '';
      
      // Use Google Search for current information if requested or if query seems time-sensitive
      if (useWebSearch || googleSearchService.shouldUseWebSearch(message)) {
        if (googleSearchService.isAvailable()) {
          webSearchResults = await googleSearchService.search(message, 4);
        } else {
          console.warn('Google Search requested but not available');
        }
      }

      let aiResponse: string;
      
      // Use Claude Sonnet if available, otherwise fallback to basic context response
      if (claudeService.isAvailable()) {
        if (webSearchResults) {
          aiResponse = await claudeService.generateEnhancedResponse(
            message, 
            context, 
            webSearchResults, 
            conversationHistory
          );
        } else {
          aiResponse = await claudeService.generateResponse(
            message, 
            context, 
            conversationHistory
          );
        }
      } else {
        // Fallback response when Claude is not available
        const contextInfo = context ? `Based on the knowledge base: ${context.substring(0, 500)}...` : '';
        const webInfo = webSearchResults ? `\n\nCurrent information: ${webSearchResults.substring(0, 300)}...` : '';
        aiResponse = `${contextInfo}${webInfo}\n\nI can provide information from the knowledge base${webSearchResults ? ' and current web results' : ''}, but for advanced AI conversation capabilities, Claude Sonnet integration is needed.`;
      }

      // Store conversation in Pinecone if it has good context
      try {
        if (context) {
          const embedding = await documentProcessor.generateEmbedding(message);
          const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          await pineconeService.storeConversation(
            conversationId,
            `Q: ${message}\nA: ${aiResponse}`,
            embedding,
            {
              type: 'chat_enhanced',
              hasWebSearch: !!webSearchResults,
              timestamp: new Date().toISOString()
            }
          );
        }
      } catch (storeError) {
        console.error('Error storing conversation:', storeError);
        // Don't fail the request if storage fails
      }

      res.json({
        success: true,
        message: aiResponse,
        metadata: {
          hasContext: !!context,
          hasWebSearch: !!webSearchResults,
          claudeAvailable: claudeService.isAvailable(),
          googleSearchAvailable: googleSearchService.isAvailable(),
          contextLength: context.length,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Enhanced chat error:', error);
      res.status(500).json({ 
        error: "Failed to process enhanced chat request" 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
