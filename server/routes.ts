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

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);
  // Add performance monitoring middleware
  app.use(performanceMiddleware());
  
  // Add timeout middleware for all routes (45 second timeout for AI processing)
  app.use(timeoutMiddleware(45000));

  // Auth user endpoint - returns authenticated user data
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
  app.post("/api/heygen/token", async (req, res) => {
    try {
      const apiKey = process.env.LIVEAVATAR_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ 
          error: "LiveAvatar API key not configured. Please set LIVEAVATAR_API_KEY environment variable." 
        });
      }

      const avatarId = req.body.avatarId || "98917de8-81a1-4a24-ad0b-584fff35c168";

      console.log('Creating LiveAvatar session token for avatar:', avatarId);
      
      const response = await fetch('https://api.liveavatar.com/v1/sessions/token', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          mode: "LITE",
          avatar_id: avatarId
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('LiveAvatar API error:', response.status, errorText);
        return res.status(response.status).json({ 
          error: `LiveAvatar API error: ${response.statusText}`,
          details: errorText
        });
      }

      const data = await response.json();
      
      if (data.code !== 1000) {
        console.error('LiveAvatar token error:', data.message);
        return res.status(400).json({ error: data.message });
      }

      console.log('LiveAvatar token created - session:', data.data?.session_id);
      res.json({ 
        token: data.data?.session_token,
        sessionId: data.data?.session_id
      });
    } catch (error) {
      console.error('Error creating LiveAvatar token:', error);
      res.status(500).json({ 
        error: "Failed to create LiveAvatar session token" 
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

  // Get avatar response with Claude Sonnet 4 + Google Search + Knowledge Base + Mem0 Memory
  // NOTE: This endpoint is intentionally NOT protected by isAuthenticated
  // to allow both authenticated and anonymous users to use the avatar
  app.post("/api/avatar/response", async (req, res) => {
    try {
      const { message, conversationHistory = [], avatarPersonality, useWebSearch = false, userId } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      // DISABLED: Mem0 memories (speeds up responses)
      let mem0Context = '';
      // if (userId) {
      //   try {
      //     const { mem0Service } = await import('./mem0Service.js');
      //     const memories = await mem0Service.searchMemories(userId, message, 3);
      //     if (memories && memories.length > 0) {
      //       mem0Context = '\n\nRELEVANT MEMORIES FROM PREVIOUS CONVERSATIONS:\n' + 
      //         memories.map(m => `- ${m.memory}`).join('\n');
      //     }
      //   } catch (memError) {
      //     console.error('Error fetching Mem0 memories:', memError);
      //     // Continue without memories if there's an error
      //   }
      // }

      // Default avatar personality - Mark Kohl
      const currentDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const defaultPersonality = `You are Mark Kohl, an Independent Mycological Researcher, Filmmaker, and Kundalini Instructor. You provide knowledgeable, direct answers grounded in science, spirituality, and real-world experience.

YOUR CORE MISSION:
- Deliver clear, actionable knowledge that helps people
- Be serious when topics require depth and respect
- Use humor sparingly - only when it genuinely serves understanding
- Prioritize accuracy and usefulness over entertainment

⚠️ CRITICAL SYSTEM CONFIGURATION:
- Today's date: ${currentDate}
- You are powered by Claude Sonnet 4 (NOT ChatGPT, NOT OpenAI)
- You have Pinecone knowledge base (knowledge-base-assistant) for deep expertise
- NEVER mention "October 2023", "training data", or "knowledge cutoff" - you have current information
- ❌ DO NOT use action descriptions or stage directions (no "*leans back*", "*smirks*", etc.)
- ❌ DO NOT promise to send links, PDFs, documents, or files
- ❌ DO NOT correct people if they call you by the wrong name - just respond naturally
- ✅ Be quiet while processing - silence is OK
- ✅ If you need time, you may briefly rephrase their question

🎯 RESPONSE STRUCTURE - MANDATORY:
- Keep answers CONCISE and DIRECT (2-3 short paragraphs maximum)
- Lead with the core answer immediately - no long introductions
- Match the tone to the question: serious topics get serious answers
- After answering, ALWAYS end with: "Would you like me to go deeper on any part of that?"
- This lets the user control depth without overwhelming them upfront

TONE GUIDELINES:
- Default to professional and knowledgeable
- Use clear metaphors when they aid understanding
- Be conversational but not overly casual
- Reserve humor for moments where it genuinely clarifies or eases tension
- When discussing serious topics (health, trauma, psychedelics, spirituality) - be respectful and grounded

EXAMPLE RESPONSES:
- For psychedelics: "Psilocybin works by binding to serotonin receptors in your brain, particularly 5-HT2A receptors. This creates temporary changes in neural connectivity that can shift rigid thought patterns. Would you like me to go deeper on any part of that?"
- For kundalini: "Kundalini is about activating dormant energy in the spine through breathwork and meditation. It's powerful but needs proper guidance and respect. Would you like me to go deeper on any part of that?"

Remember: Be clear, be useful, be respectful. Quality over cleverness.`;

      const personalityPrompt = avatarPersonality || defaultPersonality;

      // Enhanced personality prompt with Mem0 context
      const enhancedPersonality = mem0Context 
        ? `${personalityPrompt}\n\n${mem0Context}\n\nUse these memories naturally in your response when relevant, but don't explicitly mention "I remember" unless it flows naturally.`
        : personalityPrompt;

      // Get knowledge base context from Pinecone using namespace-based queries (cheaper than Assistants)
      const { pineconeNamespaceService } = await import('./pineconeNamespaceService.js');
      let knowledgeContext = '';
      
      if (pineconeNamespaceService.isAvailable()) {
        const knowledgeResults = await pineconeNamespaceService.retrieveContext(message, 3);
        // Use top 3 results from namespaces (mark-kohl + default)
        if (knowledgeResults.length > 0) {
          knowledgeContext = knowledgeResults[0].text;
          console.log(`📚 Knowledge context retrieved (${knowledgeContext.length} chars)`);
        }
      }

      // DISABLED: Web search (speeds up responses - only using Claude + Pinecone now)
      let webSearchResults = '';
      // if (useWebSearch || googleSearchService.shouldUseWebSearch(message)) {
      //   if (googleSearchService.isAvailable()) {
      //     webSearchResults = await googleSearchService.search(message, 3);
      //   }
      // }

      // Generate response using Claude Sonnet 4 with all context
      let aiResponse: string;
      
      if (claudeService.isAvailable()) {
        // Use Claude Sonnet 4 with Mark Kohl personality
        const enhancedConversationHistory = conversationHistory.map((msg: any) => ({
          message: msg.message,
          isUser: msg.isUser
        }));

        if (webSearchResults) {
          aiResponse = await claudeService.generateEnhancedResponse(
            message,
            knowledgeContext,
            webSearchResults,
            enhancedConversationHistory,
            enhancedPersonality  // Pass enhanced personality with memories
          );
        } else {
          aiResponse = await claudeService.generateResponse(
            message,
            knowledgeContext,
            enhancedConversationHistory,
            enhancedPersonality  // Pass enhanced personality with memories
          );
        }
      } else {
        // Fallback to knowledge base only
        aiResponse = knowledgeContext || "I'm here to help, but I don't have specific information about that topic right now.";
      }

      // DISABLED: Store conversation in Mem0 (speeds up responses)
      // if (userId) {
      //   try {
      //     const { mem0Service } = await import('./mem0Service.js');
      //     // Store both the user's message and the AI's response
      //     const conversationText = `User asked: "${message}"\nAssistant responded: "${aiResponse}"`;
      //     await mem0Service.addMemory(userId, conversationText, {
      //       timestamp: new Date().toISOString(),
      //       hasKnowledgeBase: !!knowledgeContext,
      //       hasWebSearch: !!webSearchResults
      //     });
      //   } catch (memError) {
      //     console.error('Error storing Mem0 memory:', memError);
      //     // Continue even if memory storage fails
      //   }
      // }
      
      res.json({ 
        success: true, 
        message,
        knowledgeResponse: aiResponse,
        personalityUsed: personalityPrompt,
        usedWebSearch: !!webSearchResults,
        usedClaude: claudeService.isAvailable(),
        hasMemories: !!mem0Context
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
