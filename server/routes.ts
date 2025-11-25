import type { Express } from "express";
import { createServer, type Server } from "http";
import { pineconeService, PineconeIndexName } from "./pinecone.js";
import { documentProcessor } from "./documentProcessor.js";
import { ObjectStorageService } from "./objectStorage.js";
import {
  insertConversationSchema,
  insertDocumentSchema,
  insertAvatarProfileSchema,
  updateAvatarProfileSchema,
  insertKnowledgeBaseSourceSchema,
  updateKnowledgeBaseSourceSchema,
} from "../shared/schema.js";
import multer from "multer";
import * as fs from "fs";
import * as path from "path";
import {
  timeoutMiddleware,
  performanceMiddleware,
  rateLimitMiddleware,
} from "./performance.js";
import { claudeService } from "./claudeService.js";
import { googleSearchService } from "./googleSearchService.js";
import { elevenlabsService } from "./elevenlabsService.js";
import { wikipediaService } from "./wikipediaService.js";
import { setupAuth, isAuthenticated } from "./replitAuth.js";
import { storage } from "./storage.js";
import { latencyCache } from "./cache.js";
import { metrics } from "./metrics.js";
import { logger } from "./logger.js";
import { wrapServiceCall } from "./circuitBreaker.js";
import { getAvatarById } from "../config/avatars.config.js";
import { multiAssistantService } from "./multiAssistantService.js";
import { sessionManager } from "./sessionManager.js";
import { heygenCreditService } from "./heygenCreditService.js";
import { memoryService, MemoryType } from "./memoryService.js";
import * as pubmedService from "./pubmedService.js";
import { googleDriveService } from "./googleDriveService.js";

export async function registerRoutes(app: Express): Promise<Server> {
  // Create circuit breaker for HeyGen API
  const heygenTokenBreaker = wrapServiceCall(
    async (apiKey: string) => {
      const response = await fetch(
        "https://api.heygen.com/v1/streaming.create_token",
        {
          method: "POST",
          headers: {
            "X-Api-Key": apiKey,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        
        // Log detailed error information
        logger.error({
          service: 'heygen',
          operation: 'create_token',
          httpStatus: response.status,
          statusText: response.statusText,
          errorBody: errorText,
          url: response.url,
        }, 'HeyGen API request failed');

        throw new Error(
          `HeyGen API error: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      return await response.json();
    },
    "heygen",
    { timeout: 10000, errorThresholdPercentage: 50 },
  );

  // Auth middleware
  await setupAuth(app);

  // HTTP metrics middleware - record all requests
  app.use((req, res, next) => {
    const startTime = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - startTime;
      const route = req.route?.path || req.path || "unknown";
      metrics.recordHttpRequest(req.method, route, res.statusCode, duration);
    });

    next();
  });

  // Add performance monitoring middleware
  app.use(performanceMiddleware());

  // Add timeout middleware for all routes (45 second timeout for AI processing)
  app.use(timeoutMiddleware(45000));

  // Auth user endpoint - returns authenticated user data
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
  // GET HeyGen credit usage endpoint
  app.get("/api/heygen/credits", async (req: any, res) => {
    const log = logger.child({ service: "heygen-credit", operation: "getCredits" });

    try {
      const userId = req.user?.claims?.sub;
      const stats = await heygenCreditService.getCreditStats(userId);
      
      log.info({ userId, stats }, "Credit stats retrieved");
      
      res.json(stats);
    } catch (error: any) {
      log.error({ error: error.message }, "Error getting credit stats");
      res.status(500).json({ error: "Failed to retrieve credit stats" });
    }
  });

  // HeyGen API token endpoint for Streaming SDK with rate limiting (15 requests per user per minute for conversation flow)
  app.post("/api/heygen/token", rateLimitMiddleware(15, 60000), async (req, res) => {
    const log = logger.child({ service: "heygen", operation: "createToken" });

    try {
      const { userId, avatarId } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      // Check HeyGen credit balance before proceeding
      const creditCheck = await heygenCreditService.checkCreditBalance();
      if (!creditCheck.allowed) {
        log.error({
          userId,
          reason: creditCheck.reason,
          balance: creditCheck.balance,
        }, "HeyGen credit limit exceeded");
        return res.status(402).json({
          error: "Payment Required",
          message: creditCheck.reason,
          balance: creditCheck.balance,
        });
      }

      const sessionCheck = sessionManager.canStartSession(userId);
      if (!sessionCheck.allowed) {
        log.warn({
          userId,
          reason: sessionCheck.reason,
          currentCount: sessionCheck.currentCount,
        }, "Session limit reached");
        return res.status(429).json({
          error: sessionCheck.reason,
          currentCount: sessionCheck.currentCount,
        });
      }

      if (avatarId) {
        const switchCheck = sessionManager.canSwitchAvatar(userId, avatarId);
        if (!switchCheck.allowed) {
          log.warn({
            userId,
            avatarId,
            reason: switchCheck.reason,
            remainingCooldownMs: switchCheck.remainingCooldownMs,
          }, "Avatar switch cooldown active");
          return res.status(429).json({
            error: switchCheck.reason,
            remainingCooldownMs: switchCheck.remainingCooldownMs,
          });
        }
      }

      const apiKey = process.env.HEYGEN_API_KEY;

      if (!apiKey) {
        log.error("HeyGen API key not configured");
        return res.status(500).json({
          error:
            "HeyGen API key not configured. Please set HEYGEN_API_KEY environment variable.",
        });
      }

      log.debug("Creating HeyGen access token");

      const startTime = Date.now();
      let tokenData;
      let successful = true;

      try {
        tokenData = await heygenTokenBreaker.execute(apiKey);
      } catch (error: any) {
        successful = false;
        throw error;
      } finally {
        const duration = Date.now() - startTime;

        // Log credit usage (1 credit per token generation)
        await heygenCreditService.logCreditUsage(userId, 'token_generation', 1, successful);

        if (successful) {
          storage.logApiCall({
            serviceName: 'heygen',
            endpoint: 'streaming.create_token',
            userId: null,
            responseTimeMs: duration,
          }).catch((error) => {
            log.error({ error: error.message }, 'Failed to log API call');
          });
        }
      }

      log.info("HeyGen token created successfully");

      res.json({
        token: tokenData.data?.token || tokenData.token,
        ...tokenData,
      });
    } catch (error: any) {
      log.error({
        errorMessage: error.message,
        errorStack: error.stack,
        errorName: error.name,
        fullError: error.toString(),
      }, "Error creating HeyGen token");
      res.status(500).json({
        error: "Failed to create HeyGen access token",
      });
    }
  });

  // Combined audio endpoint: Get Claude response + convert to ElevenLabs audio
  app.post("/api/audio", async (req: any, res) => {
    const log = logger.child({ service: "audio-chat", operation: "processMessage" });

    try {
      const { message, avatarId = "mark-kohl" } = req.body;

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Get userId from authenticated session if available, or allow temp_ prefixed IDs
      let userId = req.user?.claims?.sub || null;
      if (!userId && req.body.userId?.startsWith('temp_')) {
        userId = req.body.userId;
      }

      // Update session activity to prevent premature cleanup
      if (userId) {
        sessionManager.updateActivityByUserId(userId);
      }

      // Get memory toggle preference from request
      const { memoryEnabled = false } = req.body;

      // Get avatar configuration
      const avatarConfig = getAvatarById(avatarId);
      if (!avatarConfig) {
        return res.status(404).json({ error: "Avatar not found" });
      }

      if (!avatarConfig.elevenlabsVoiceId) {
        log.error({ avatarId }, "Avatar missing ElevenLabs voice ID");
        return res.status(400).json({ error: "Avatar not configured for audio mode" });
      }

      log.info({ avatarId, messageLength: message.length }, "Processing audio chat message");

      // Retrieve relevant memories if memory is enabled
      let memoryContext = "";
      if (memoryEnabled && userId && memoryService.isAvailable()) {
        try {
          const memoryResult = await memoryService.searchMemories(message, userId, { limit: 5 });
          if (memoryResult.success && memoryResult.memories && memoryResult.memories.length > 0) {
            memoryContext =
              "\n\nRELEVANT MEMORIES FROM PREVIOUS CONVERSATIONS:\n" +
              memoryResult.memories.map((m) => `- ${m.content}`).join("\n");
            log.info({ userId, memoryCount: memoryResult.memories.length }, 'Retrieved relevant memories for audio conversation');
          }
        } catch (memError) {
          log.error({ error: memError }, "Error fetching memories");
          // Continue without memories if there's an error
        }
      }

      // Step 1: Get Claude response with knowledge base context
      const currentDate = new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      
      const personalityWithDate = `${avatarConfig.personalityPrompt.replace(/- Today's date:.*/, `- Today's date: ${currentDate}`)}`
        .replace(/⚠️ CRITICAL SYSTEM CONFIGURATION:/, `⚠️ CRITICAL SYSTEM CONFIGURATION:\n- Today's date: ${currentDate}`);

      // Enhanced personality prompt with memory context
      const enhancedPersonality = memoryContext
        ? `${personalityWithDate}\n\n${memoryContext}\n\nUse these memories naturally in your response when relevant, but don't explicitly mention "I remember" unless it flows naturally.`
        : personalityWithDate;

      // Get knowledge base context
      const { pineconeNamespaceService } = await import("./pineconeNamespaceService.js");
      let knowledgeContext = "";
      let allNamespaces = [...avatarConfig.pineconeNamespaces];
      
      if (userId && !userId.startsWith('temp_')) {
        try {
          const userSources = await storage.listKnowledgeSources(userId);
          const activeSourceNamespaces = userSources
            .filter(source => source.status === 'active' && (source.itemsCount || 0) > 0)
            .map(source => source.pineconeNamespace);
          allNamespaces = [...allNamespaces, ...activeSourceNamespaces];
        } catch (error) {
          log.warn({ error }, 'Error fetching user knowledge sources');
        }
      }

      if (pineconeNamespaceService.isAvailable() && allNamespaces.length > 0) {
        const knowledgeResults = await pineconeNamespaceService.retrieveContext(
          message,
          3,
          allNamespaces,
        );
        if (knowledgeResults.length > 0) {
          knowledgeContext = knowledgeResults[0].text;
          log.debug({ contextLength: knowledgeContext.length, namespaces: allNamespaces.length }, "Knowledge context retrieved");
        }
      }

      // Generate Claude response with enhanced personality
      const claudeResponseResult = await claudeService.generateEnhancedResponse(
        message,
        knowledgeContext,
        "", // webSearchResults (empty for audio mode)
        [], // conversationHistory (no history for audio mode currently)
        enhancedPersonality, // customSystemPrompt - Use enhanced personality with memories
      );

      const responseText = typeof claudeResponseResult === 'string' 
        ? claudeResponseResult 
        : ((claudeResponseResult as any)?.text || "");
      
      if (!responseText) {
        log.error({ claudeResponseResult }, "Claude response was empty");
        return res.status(500).json({ error: "No response generated from AI" });
      }
      
      log.info({ responseLength: responseText.length }, "Claude response generated");

      // Log API call
      storage.logApiCall({
        serviceName: 'claude',
        endpoint: 'messages',
        userId: userId || null,
        responseTimeMs: 0,
      }).catch((error) => {
        log.error({ error: error.message }, 'Failed to log Claude API call');
      });

      // Step 2: Convert to ElevenLabs audio
      if (!elevenlabsService.isAvailable()) {
        log.error("ElevenLabs service not available");
        return res.status(500).json({
          error: "ElevenLabs API key not configured. Please set ELEVENLABS_API_KEY environment variable.",
        });
      }

      log.debug({ textLength: responseText.length, voiceId: avatarConfig.elevenlabsVoiceId }, "Generating TTS audio");
      const audioBuffer = await elevenlabsService.generateSpeech(responseText, avatarConfig.elevenlabsVoiceId);

      log.info({ audioSize: audioBuffer.length }, "Audio generated successfully");

      // Log API call
      storage.logApiCall({
        serviceName: 'elevenlabs',
        endpoint: 'text-to-speech',
        userId: userId || null,
        responseTimeMs: 0,
      }).catch((error) => {
        log.error({ error: error.message }, 'Failed to log ElevenLabs API call');
      });

      // Store conversation in memory if enabled
      if (memoryEnabled && userId && memoryService.isAvailable()) {
        try {
          const conversationText = `User asked: "${message}"\nAssistant responded: "${responseText}"`;
          const memoryResult = await memoryService.addMemory(
            conversationText,
            userId,
            MemoryType.NOTE,
            {
              timestamp: new Date().toISOString(),
              hasKnowledgeBase: !!knowledgeContext,
              avatarId,
              audioOnly: true,
            }
          );
          if (memoryResult.success) {
            log.info({ userId, memory: memoryResult.memory?.id }, 'Stored audio conversation in memory');
          }
        } catch (memError) {
          log.error({ error: memError }, 'Error storing memory');
          // Continue even if memory storage fails
        }
      }

      // Return audio
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", audioBuffer.length.toString());
      res.send(audioBuffer);

    } catch (error: any) {
      log.error({ error: error.message, stack: error.stack }, "Error processing audio chat");
      res.status(500).json({
        error: "Failed to process audio message",
      });
    }
  });

  // ElevenLabs TTS endpoint for audio-only mode
  app.post("/api/elevenlabs/tts", async (req, res) => {
    const log = logger.child({ service: "elevenlabs", operation: "generateSpeech" });

    try {
      const { text, avatarId = "mark-kohl" } = req.body;

      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }

      if (!elevenlabsService.isAvailable()) {
        log.error("ElevenLabs service not available");
        return res.status(500).json({
          error: "ElevenLabs API key not configured. Please set ELEVENLABS_API_KEY environment variable.",
        });
      }

      const avatarConfig = getAvatarById(avatarId);
      if (!avatarConfig || !avatarConfig.elevenlabsVoiceId) {
        log.error({ avatarId }, "Avatar not found or missing ElevenLabs voice ID");
        return res.status(400).json({ error: "Invalid avatar or missing voice configuration" });
      }

      log.debug({ textLength: text.length, voiceId: avatarConfig.elevenlabsVoiceId }, "Generating TTS audio");

      const audioBuffer = await elevenlabsService.generateSpeech(text, avatarConfig.elevenlabsVoiceId);

      log.info({ audioSize: audioBuffer.length }, "TTS audio generated successfully");

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", audioBuffer.length.toString());
      res.send(audioBuffer);
    } catch (error: any) {
      log.error({ error: error.message }, "Error generating TTS audio");
      res.status(500).json({
        error: "Failed to generate TTS audio",
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
          validIndexes: Object.values(PineconeIndexName),
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
          targetIndex,
        );

        res.json({
          success: true,
          id: conversationId,
          message: "Conversation stored successfully",
          indexName: targetIndex || PineconeIndexName.AVATAR_CHAT,
        });
      } else {
        res.status(400).json({
          error: "Embedding is required to store conversation",
        });
      }
    } catch (error) {
      console.error("Error storing conversation:", error);
      res.status(500).json({
        error: "Failed to store conversation",
      });
    }
  });

  app.post("/api/conversations/search", async (req, res) => {
    try {
      const { embedding, topK = 5, indexName } = req.body;

      if (!embedding || !Array.isArray(embedding)) {
        return res.status(400).json({
          error: "Valid embedding array is required",
        });
      }

      // Validate indexName if provided
      if (indexName && !Object.values(PineconeIndexName).includes(indexName)) {
        return res.status(400).json({
          error: "Invalid index name",
          validIndexes: Object.values(PineconeIndexName),
        });
      }

      const targetIndex = indexName as PineconeIndexName | undefined;

      const results = await pineconeService.searchSimilarConversations(
        embedding,
        topK,
        undefined,
        targetIndex,
      );

      res.json({
        success: true,
        results: results.map((match) => ({
          id: match.id,
          score: match.score,
          text: match.metadata?.text,
          metadata: match.metadata,
        })),
        indexName: targetIndex || PineconeIndexName.AVATAR_CHAT,
      });
    } catch (error) {
      console.error("Error searching conversations:", error);
      res.status(500).json({
        error: "Failed to search conversations",
      });
    }
  });

  app.delete("/api/conversations/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const indexName = req.query.indexName as string | undefined;

      // Validate indexName if provided
      if (
        indexName &&
        !Object.values(PineconeIndexName).includes(
          indexName as PineconeIndexName,
        )
      ) {
        return res.status(400).json({
          error: "Invalid index name",
          validIndexes: Object.values(PineconeIndexName),
        });
      }

      const targetIndex = indexName as PineconeIndexName | undefined;

      await pineconeService.deleteConversation(id, undefined, targetIndex);

      res.json({
        success: true,
        message: "Conversation deleted successfully",
        indexName: targetIndex || PineconeIndexName.AVATAR_CHAT,
      });
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({
        error: "Failed to delete conversation",
      });
    }
  });

  // Get conversation history (no auth required to support temp_ users)
  app.get("/api/conversations/history/:userId/:avatarId", async (req, res) => {
    try {
      const { userId, avatarId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;

      if (!userId || !avatarId) {
        return res.status(400).json({
          error: "userId and avatarId are required",
        });
      }

      const history = await storage.getConversationHistory(userId, avatarId, limit);

      res.json({
        success: true,
        conversations: history,
      });
    } catch (error) {
      console.error("Error fetching conversation history:", error);
      res.status(500).json({
        error: "Failed to fetch conversation history",
      });
    }
  });

  // Memory API routes
  app.post("/api/memory/add", async (req: any, res) => {
    const log = logger.child({ service: "memory", operation: "add" });
    try {
      const { content, userId, type, metadata } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      if (!content) {
        return res.status(400).json({ error: "content is required" });
      }

      if (!type) {
        return res.status(400).json({ error: "type is required (summary, note, preference)" });
      }

      if (!memoryService.isAvailable()) {
        return res.status(503).json({ error: "Memory service not available" });
      }

      const result = await memoryService.addMemory(content, userId, type, metadata || {});

      if (!result.success) {
        log.error({ error: result.error }, "Failed to add memory");
        return res.status(500).json({ error: result.error });
      }

      log.info({ userId, type }, "Memory added successfully");
      res.json(result);
    } catch (error: any) {
      log.error({ error: error.message }, "Error adding memory");
      res.status(500).json({ error: "Failed to add memory" });
    }
  });

  app.post("/api/memory/search", async (req: any, res) => {
    const log = logger.child({ service: "memory", operation: "search" });
    try {
      const { query, userId, limit, type, minScore } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      if (!query) {
        return res.status(400).json({ error: "query is required" });
      }

      if (!memoryService.isAvailable()) {
        return res.status(503).json({ error: "Memory service not available" });
      }

      const result = await memoryService.searchMemories(query, userId, {
        limit,
        type,
        minScore,
      });

      if (!result.success) {
        log.error({ error: result.error }, "Failed to search memories");
        return res.status(500).json({ error: result.error });
      }

      log.info({ userId, resultCount: result.memories?.length || 0 }, "Memories searched successfully");
      res.json(result);
    } catch (error: any) {
      log.error({ error: error.message }, "Error searching memories");
      res.status(500).json({ error: "Failed to search memories" });
    }
  });

  app.get("/api/memory/all", async (req: any, res) => {
    const log = logger.child({ service: "memory", operation: "getAll" });
    try {
      const userId = req.query.userId as string;
      const type = req.query.type as string | undefined;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      if (!memoryService.isAvailable()) {
        return res.status(503).json({ error: "Memory service not available" });
      }

      const result = await memoryService.getAllMemories(userId, type as any);

      if (!result.success) {
        log.error({ error: result.error }, "Failed to get all memories");
        return res.status(500).json({ error: result.error });
      }

      log.info({ userId, count: result.count || 0 }, "All memories retrieved successfully");
      res.json(result);
    } catch (error: any) {
      log.error({ error: error.message }, "Error getting all memories");
      res.status(500).json({ error: "Failed to get all memories" });
    }
  });

  app.put("/api/memory/:id", async (req: any, res) => {
    const log = logger.child({ service: "memory", operation: "update" });
    try {
      const { id } = req.params;
      const { userId, content, metadata } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      if (!content) {
        return res.status(400).json({ error: "content is required" });
      }

      if (!memoryService.isAvailable()) {
        return res.status(503).json({ error: "Memory service not available" });
      }

      const result = await memoryService.updateMemory(id, userId, content, metadata || {});

      if (!result.success) {
        log.error({ error: result.error, memoryId: id }, "Failed to update memory");
        return res.status(500).json({ error: result.error });
      }

      log.info({ memoryId: id }, "Memory updated successfully");
      res.json(result);
    } catch (error: any) {
      log.error({ error: error.message }, "Error updating memory");
      res.status(500).json({ error: "Failed to update memory" });
    }
  });

  app.delete("/api/memory/:id", async (req: any, res) => {
    const log = logger.child({ service: "memory", operation: "delete" });
    try {
      const { id } = req.params;
      
      // Get userId from authenticated session if available, or allow temp_ prefixed IDs
      let userId = req.user?.claims?.sub || null;
      if (!userId && req.body.userId?.startsWith('temp_')) {
        userId = req.body.userId;
      }

      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      if (!memoryService.isAvailable()) {
        return res.status(503).json({ error: "Memory service not available" });
      }

      // The deleteMemory function scopes deletion to the user's namespace
      // This prevents cross-user deletion even if someone knows the memory ID
      const result = await memoryService.deleteMemory(id, userId);

      if (!result.success) {
        log.error({ error: result.error, memoryId: id }, "Failed to delete memory");
        return res.status(500).json({ error: result.error });
      }

      log.info({ memoryId: id, userId }, "Memory deleted successfully");
      res.json(result);
    } catch (error: any) {
      log.error({ error: error.message }, "Error deleting memory");
      res.status(500).json({ error: "Failed to delete memory" });
    }
  });

  app.delete("/api/memory/all/:userId", async (req: any, res) => {
    const log = logger.child({ service: "memory", operation: "deleteAll" });
    try {
      const { userId } = req.params;

      if (!memoryService.isAvailable()) {
        return res.status(503).json({ error: "Memory service not available" });
      }

      const result = await memoryService.deleteAllMemories(userId);

      if (!result.success) {
        log.error({ error: result.error, userId }, "Failed to delete all memories");
        return res.status(500).json({ error: result.error });
      }

      log.info({ userId }, "All memories deleted successfully");
      res.json(result);
    } catch (error: any) {
      log.error({ error: error.message }, "Error deleting all memories");
      res.status(500).json({ error: "Failed to delete all memories" });
    }
  });

  app.post("/api/memory/summarize", async (req: any, res) => {
    const log = logger.child({ service: "memory", operation: "summarize" });
    try {
      const { messages, userId, metadata } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "messages array is required" });
      }

      if (!memoryService.isAvailable()) {
        return res.status(503).json({ error: "Memory service not available" });
      }

      const result = await memoryService.generateConversationSummary(messages, userId, metadata || {});

      if (!result.success) {
        log.error({ error: result.error }, "Failed to generate conversation summary");
        return res.status(500).json({ error: result.error });
      }

      log.info({ userId }, "Conversation summary generated successfully");
      res.json(result);
    } catch (error: any) {
      log.error({ error: error.message }, "Error generating conversation summary");
      res.status(500).json({ error: "Failed to generate conversation summary" });
    }
  });

  app.get("/api/pinecone/stats", async (req, res) => {
    try {
      const indexName = req.query.indexName as string | undefined;

      // Validate indexName if provided
      if (
        indexName &&
        !Object.values(PineconeIndexName).includes(
          indexName as PineconeIndexName,
        )
      ) {
        return res.status(400).json({
          error: "Invalid index name",
          validIndexes: Object.values(PineconeIndexName),
        });
      }

      const targetIndex = indexName as PineconeIndexName | undefined;

      // Get Pinecone stats
      const pineconeStats = await pineconeService.getStats(targetIndex);
      
      // Get database document stats
      const documentStats = await storage.getDocumentStats();

      res.json({
        success: true,
        pinecone: pineconeStats,
        documents: documentStats,
        indexName: targetIndex || PineconeIndexName.AVATAR_CHAT,
        // Legacy field for backwards compatibility
        stats: pineconeStats,
      });
    } catch (error) {
      console.error("Error getting stats:", error);
      res.status(500).json({
        error: "Failed to get statistics",
      });
    }
  });

  // Test endpoint to list available indexes
  app.get("/api/pinecone/indexes", async (req, res) => {
    try {
      const indexes = await pineconeService.listIndexes();
      res.json({ success: true, indexes });
    } catch (error) {
      console.error("Error listing Pinecone indexes:", error);
      res.status(500).json({
        error: "Failed to list Pinecone indexes",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Analytics overview endpoint - user trends and avatar interactions
  app.get("/api/analytics/overview", async (req, res) => {
    const log = logger.child({ service: "analytics", operation: "getOverview" });
    
    try {
      log.info("Getting analytics overview");

      // Get avatar interaction stats
      const avatarStats = await storage.getAvatarInteractionStats();
      
      // Get overall conversation metrics
      const conversationMetrics = await storage.getConversationMetrics();
      
      // Get top user messages (common topics)
      const topUserMessages = await storage.getTopUserMessages(10);
      
      // Get engagement trend for the last 7 days
      const engagementTrend = await storage.getEngagementTrend(7);

      const avatarNameMap: Record<string, string> = {
        'mark-kohl': 'Mark Kohl',
        'willie-gault': 'Willie Gault',
        'june': 'June',
        'ann': 'Ann',
        'nigel': 'Nigel',
        'thad': 'Thad',
      };

      // Format avatar stats with friendly names
      const formattedAvatarStats = avatarStats.map((stat: any) => ({
        avatarId: stat.avatar_id,
        avatarName: avatarNameMap[stat.avatar_id] || stat.avatar_id,
        totalMessages: parseInt(stat.total_messages),
        uniqueUsers: parseInt(stat.unique_users),
        firstInteraction: stat.first_interaction,
        lastInteraction: stat.last_interaction,
      }));

      res.json({
        avatarStats: formattedAvatarStats,
        totalConversations: conversationMetrics.totalConversations,
        totalUsers: conversationMetrics.totalUsers,
        avgMessagesPerUser: conversationMetrics.avgMessagesPerUser,
        topUserMessages,
        engagementTrend,
      });

      log.info({ statsCount: formattedAvatarStats.length }, "Analytics overview retrieved");
    } catch (error: any) {
      log.error({ error: error.message }, "Error getting analytics overview");
      res.status(500).json({
        error: "Failed to get analytics overview",
        details: error.message,
      });
    }
  });

  // Prometheus metrics endpoint - for monitoring and alerting
  app.get("/metrics", async (req, res) => {
    try {
      res.set("Content-Type", metrics.register.contentType);
      const metricsData = await metrics.getMetrics();
      res.end(metricsData);
    } catch (error: any) {
      logger.error(
        { error: error.message },
        "Error generating Prometheus metrics",
      );
      res.status(500).json({ error: "Failed to generate metrics" });
    }
  });

  // Performance metrics endpoint - cache hit rates and statistics
  app.get("/api/performance/cache", async (req, res) => {
    try {
      const cacheMetrics = latencyCache.getCacheMetrics();
      const cacheStats = latencyCache.getStats();

      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        metrics: cacheMetrics,
        stats: cacheStats,
        performance: {
          averageQueryTime:
            cacheMetrics.hitRate > 0
              ? `~${Math.round(cacheMetrics.hitRate * 100)}% faster with cache`
              : "No data yet",
          recommendations:
            cacheMetrics.hitRate < 0.3 && cacheMetrics.totalRequests > 10
              ? "Low hit rate - consider increasing TTL or reviewing query patterns"
              : cacheMetrics.hitRate >= 0.5
                ? "Good cache performance"
                : "Gathering data...",
        },
      });
    } catch (error: any) {
      logger.error({ error: error.message }, "Error getting cache metrics");
      res.status(500).json({
        error: "Failed to get cache metrics",
      });
    }
  });

  // ======================================================================
  // AVATAR ROUTES - Moved to server/routes/avatars.ts
  // ======================================================================
  // Commented out - now handled by avatarRouter in server/routes/avatars.ts
  
  /*
  // Get avatar response with Claude Sonnet 4 + Google Search + Knowledge Base + Mem0 Memory
  app.get("/api/avatar/config/:avatarId", async (req, res) => {
    try {
      const { avatarId } = req.params;
      
      // Try to load from database first
      let avatarConfig = await storage.getAvatar(avatarId);
      
      // Fallback to default avatars if not found in DB
      if (!avatarConfig) {
        const { getAvatarById } = await import("../config/avatars.config.js");
        avatarConfig = getAvatarById(avatarId);
      }
      
      if (!avatarConfig) {
        return res.status(404).json({ error: "Avatar not found" });
      }
      
      res.json(avatarConfig);
    } catch (error: any) {
      console.error("Error fetching avatar config:", error);
      res.status(500).json({ error: "Failed to fetch avatar configuration" });
    }
  });

  app.get("/api/avatars", async (req, res) => {
    try {
      // Try to load from database first, fallback to defaults if empty
      const dbAvatars = await storage.listAvatars(true);
      if (dbAvatars.length > 0) {
        return res.json(dbAvatars);
      }
      
      // Fallback to default avatars if database is empty
      const { getActiveAvatars } = await import("../config/avatars.config.js");
      const avatars = getActiveAvatars();
      res.json(avatars);
    } catch (error: any) {
      console.error("Error fetching avatars:", error);
      res.status(500).json({ error: "Failed to fetch avatars" });
    }
  });

  app.get("/api/avatars/:id/embed", async (req, res) => {
    try {
      const { id } = req.params;
      
      const embedConfig = multiAssistantService.getEmbedConfig(id);
      
      if (!embedConfig) {
        const availableMentors = multiAssistantService.listMentors().map(m => m.name);
        return res.status(404).json({ 
          error: "Mentor not found",
          availableMentors,
        });
      }
      
      res.json({
        mentorId: id,
        sceneId: embedConfig.sceneId,
        voiceConfig: embedConfig.voiceConfig,
        audioOnly: embedConfig.audioOnly,
        assistantId: embedConfig.assistantId,
      });
    } catch (error: any) {
      logger.error({ error: error.message, mentorId: req.params.id }, "Error fetching embed config");
      res.status(500).json({ error: "Failed to fetch embed configuration" });
    }
  });

  // Admin avatar management endpoints
  // TODO: Add proper role-based authorization check (verify user is admin)
  app.get("/api/admin/avatars", isAuthenticated, async (req: any, res) => {
    try {
      // Return all avatars including inactive ones for admin view
      const avatars = await storage.listAvatars(false);
      res.json(avatars);
    } catch (error: any) {
      logger.error({ error: error.message }, "Error listing avatars for admin");
      res.status(500).json({ error: "Failed to list avatars" });
    }
  });

  app.post("/api/admin/avatars", isAuthenticated, async (req: any, res) => {
    try {
      // Validate request body
      const validatedData = insertAvatarProfileSchema.parse(req.body);
      
      // Additional runtime validation
      if (validatedData.isActive === true && (!validatedData.pineconeNamespaces || validatedData.pineconeNamespaces.length === 0)) {
        return res.status(400).json({ 
          error: "Active avatars must have at least one Pinecone namespace" 
        });
      }
      
      const newAvatar = await storage.createAvatar(validatedData);
      logger.info({ avatarId: newAvatar.id }, "Avatar created by admin");
      res.status(201).json(newAvatar);
    } catch (error: any) {
      logger.error({ error: error.message }, "Error creating avatar");
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid avatar data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create avatar" });
    }
  });

  app.put("/api/admin/avatars/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      // Validate request body
      const validatedData = updateAvatarProfileSchema.parse(req.body);
      
      // Additional runtime validation
      if (validatedData.isActive === true && validatedData.pineconeNamespaces?.length === 0) {
        return res.status(400).json({ 
          error: "Active avatars must have at least one Pinecone namespace" 
        });
      }
      
      const updatedAvatar = await storage.updateAvatar(id, validatedData);
      if (!updatedAvatar) {
        return res.status(404).json({ error: "Avatar not found" });
      }
      
      logger.info({ avatarId: id }, "Avatar updated by admin");
      res.json(updatedAvatar);
    } catch (error: any) {
      logger.error({ error: error.message }, "Error updating avatar");
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid avatar data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update avatar" });
    }
  });

  app.delete("/api/admin/avatars/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      await storage.softDeleteAvatar(id);
      logger.info({ avatarId: id }, "Avatar soft deleted by admin");
      res.json({ success: true, message: "Avatar deactivated successfully" });
    } catch (error: any) {
      logger.error({ error: error.message }, "Error deleting avatar");
      res.status(500).json({ error: "Failed to delete avatar" });
    }
  });
  */

  // Admin Pinecone namespace migration endpoint
  app.post("/api/admin/pinecone/migrate-namespace", isAuthenticated, async (req: any, res) => {
    const log = logger.child({ service: "pinecone", operation: "migrateNamespace" });
    
    try {
      const { sourceNamespace, targetNamespace, deleteSource = false, indexName } = req.body;
      
      if (!sourceNamespace || !targetNamespace) {
        return res.status(400).json({ 
          error: "sourceNamespace and targetNamespace are required" 
        });
      }

      log.info({ sourceNamespace, targetNamespace, deleteSource, indexName }, "Starting namespace migration");
      
      const result = await pineconeService.migrateNamespace(
        sourceNamespace,
        targetNamespace,
        indexName || PineconeIndexName.AVATAR_CHAT,
        deleteSource
      );
      
      log.info({ result }, "Namespace migration completed successfully");
      res.json(result);
    } catch (error: any) {
      log.error({ error: error.message }, "Error migrating namespace");
      res.status(500).json({ error: "Failed to migrate namespace", message: error.message });
    }
  });

  // Personal Knowledge Base Management Routes
  
  // List all knowledge base sources for authenticated user
  app.get("/api/knowledge-sources", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const sources = await storage.listKnowledgeSources(userId);
      res.json({ sources });
    } catch (error: any) {
      logger.error({ error: error.message }, "Error listing knowledge sources");
      res.status(500).json({ error: "Failed to list knowledge sources" });
    }
  });

  // Create a new knowledge base source
  app.post("/api/knowledge-sources", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { type, name, config } = req.body;

      // Validate request
      if (!type || !name) {
        return res.status(400).json({ error: "Type and name are required" });
      }

      if (!['notion', 'obsidian', 'manual'].includes(type)) {
        return res.status(400).json({ error: "Invalid source type" });
      }

      // Generate unique namespace for this source
      const namespace = `user-${userId}-${type}-${Date.now()}`;

      const sourceData = insertKnowledgeBaseSourceSchema.parse({
        userId,
        type,
        name,
        pineconeNamespace: namespace,
        config: config || {}
      });

      const source = await storage.createKnowledgeSource(sourceData);
      logger.info({ sourceId: source.id, type, userId }, "Knowledge source created");
      res.json({ source });
    } catch (error: any) {
      logger.error({ error: error.message }, "Error creating knowledge source");
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create knowledge source" });
    }
  });

  // Update a knowledge base source
  app.put("/api/knowledge-sources/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      
      const validatedData = updateKnowledgeBaseSourceSchema.parse(req.body);
      const source = await storage.updateKnowledgeSource(id, userId, validatedData);
      
      if (!source) {
        return res.status(404).json({ error: "Knowledge source not found" });
      }

      logger.info({ sourceId: id }, "Knowledge source updated");
      res.json({ source });
    } catch (error: any) {
      logger.error({ error: error.message }, "Error updating knowledge source");
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update knowledge source" });
    }
  });

  // Delete a knowledge base source
  app.delete("/api/knowledge-sources/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;

      await storage.deleteKnowledgeSource(id, userId);
      logger.info({ sourceId: id }, "Knowledge source deleted");
      res.json({ success: true });
    } catch (error: any) {
      logger.error({ error: error.message }, "Error deleting knowledge source");
      res.status(500).json({ error: "Failed to delete knowledge source" });
    }
  });

  // Sync Notion database to Pinecone namespace
  app.post("/api/knowledge-sources/:id/sync", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;

      const source = await storage.getKnowledgeSource(id, userId);
      if (!source) {
        return res.status(404).json({ error: "Knowledge source not found" });
      }

      if (source.type === 'notion') {
        const { notionService } = await import('./notionService.js');
        const databaseId = (source.config as any)?.databaseId;
        
        if (!databaseId) {
          return res.status(400).json({ error: "Notion database ID not configured" });
        }

        const result = await notionService.syncDatabaseToNamespace(
          databaseId,
          source.pineconeNamespace,
          source.id,
          userId
        );

        if (result.success) {
          logger.info({ sourceId: id, itemsCount: result.itemsCount }, "Notion sync completed");
          return res.json({ success: true, itemsCount: result.itemsCount });
        } else {
          return res.status(500).json({ error: result.error });
        }
      }

      res.status(400).json({ error: "Sync not supported for this source type" });
    } catch (error: any) {
      logger.error({ error: error.message }, "Error syncing knowledge source");
      res.status(500).json({ error: "Failed to sync knowledge source" });
    }
  });

  // Sync Wikipedia article to Pinecone namespace
  app.post("/api/wikipedia/sync", async (req, res) => {
    try {
      const { title, namespace } = req.body;

      if (!title || !namespace) {
        return res.status(400).json({ error: "Title and namespace are required" });
      }

      if (!wikipediaService.isAvailable()) {
        return res.status(503).json({ error: "Wikipedia service not available - check API keys" });
      }

      const result = await wikipediaService.syncArticleToNamespace(title, namespace);

      if (result.success) {
        logger.info({ title, namespace, articleId: result.articleId }, "Wikipedia article synced");
        return res.json({
          success: true,
          articleId: result.articleId,
          message: result.message
        });
      } else {
        return res.status(500).json({
          success: false,
          error: result.message
        });
      }
    } catch (error: any) {
      logger.error({ error: error.message }, "Error syncing Wikipedia article");
      res.status(500).json({ error: "Failed to sync Wikipedia article" });
    }
  });

  app.get("/api/pubmed/status", async (req, res) => {
    try {
      const available = pubmedService.isAvailable();
      res.json({ 
        available,
        service: "PubMed E-utilities",
        rateLimit: "3 requests/second (NCBI compliant)",
      });
    } catch (error: any) {
      logger.error({ error: error.message }, "Error checking PubMed status");
      res.status(500).json({ error: "Failed to check PubMed status" });
    }
  });

  app.post("/api/pubmed/search", async (req, res) => {
    const log = logger.child({ service: "pubmed", operation: "search-api" });
    try {
      const { query, maxResults } = req.body;

      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({ error: "Query parameter is required and must be a non-empty string" });
      }

      const parsedMaxResults = maxResults !== undefined ? parseInt(String(maxResults), 10) : 10;
      
      if (isNaN(parsedMaxResults) || parsedMaxResults < 1 || parsedMaxResults > 100) {
        return res.status(400).json({ 
          error: "maxResults must be a number between 1 and 100",
          received: maxResults 
        });
      }

      if (!pubmedService.isAvailable()) {
        return res.status(503).json({ 
          error: "PubMed service is temporarily unavailable. Please try again later." 
        });
      }

      log.info({ query, maxResults: parsedMaxResults }, "Searching PubMed via API");

      const result = await pubmedService.searchAndFetchPubMed(query, parsedMaxResults);

      log.info(
        { 
          query, 
          articlesRetrieved: result.articles.length,
          totalAvailable: result.totalCount 
        },
        "PubMed search completed"
      );

      res.json({
        success: true,
        query,
        articles: result.articles,
        formattedText: result.formattedText,
        count: result.articles.length,
        totalCount: result.totalCount,
      });
    } catch (error: any) {
      const errorDetails = {
        error: error.message,
        code: error.code,
        status: error.response?.status,
        breakerOpen: !pubmedService.isAvailable(),
      };
      
      log.error(errorDetails, "PubMed search API error");
      
      if (error.message?.includes('circuit breaker') || error.code === 'EOPENBREAKER') {
        return res.status(503).json({ 
          error: "PubMed service is temporarily unavailable due to repeated failures. Please try again in a few minutes.",
          circuitBreakerOpen: true
        });
      }
      
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return res.status(504).json({ error: "PubMed request timed out. Please try again." });
      }
      
      if (error.response?.status === 429) {
        return res.status(429).json({ 
          error: "Rate limit exceeded. Please wait a moment and try again." 
        });
      }

      res.status(500).json({ 
        error: "Failed to search PubMed",
        message: error.message 
      });
    }
  });

  // NOTE: This endpoint is intentionally NOT protected by isAuthenticated
  // to allow both authenticated and anonymous users to use the avatar
  // Rate limiting applied: 20 requests per user per minute for natural conversation flow
  app.post("/api/avatar/response", rateLimitMiddleware(20, 60000), async (req: any, res) => {
    try {
      const {
        message,
        conversationHistory = [],
        avatarPersonality,
        useWebSearch = false,
        avatarId = "mark-kohl",
        memoryEnabled = false, // Extract memory toggle flag
      } = req.body;

      // Get userId from authenticated session if available, or allow temp_ prefixed IDs for anonymous users
      let userId = req.user?.claims?.sub || null;
      if (!userId && req.body.userId?.startsWith('temp_')) {
        userId = req.body.userId;
      }

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Get avatar configuration early to check usePubMed setting
      const avatarConfig = getAvatarById(avatarId);
      if (!avatarConfig) {
        return res.status(404).json({ error: "Avatar not found" });
      }

      // Update session activity to prevent premature cleanup
      if (userId) {
        sessionManager.updateActivityByUserId(userId);
      }

      // Retrieve conversation history from database (last 20 messages for context)
      let dbConversationHistory: any[] = [];
      if (userId) {
        try {
          const conversationRecords = await storage.getConversationHistory(userId, avatarId, 20);
          dbConversationHistory = conversationRecords.map(conv => ({
            message: conv.text,
            isUser: conv.role === 'user',
          }));
          logger.info({ userId, avatarId, historyLength: dbConversationHistory.length }, 'Retrieved conversation history');
        } catch (error) {
          logger.error({ error, userId, avatarId }, 'Error retrieving conversation history');
          // Continue without history - don't fail the request
        }
      }

      // Save user message to database
      if (userId) {
        try {
          await storage.saveConversation({
            userId,
            avatarId,
            role: 'user',
            text: message,
          });
        } catch (error) {
          logger.error({ error, userId, avatarId }, 'Error saving user message to database');
          // Continue even if save fails - don't fail the request
        }
      }

      // Start performance timing
      const perfStart = Date.now();
      const perfTimings: Record<string, number> = {};

      // Check for research question context
      const pubmedCommandMatch = message.match(/search pubmed:\s*(.+)/i);
      const researchKeywords = [
        'research', 'study', 'studies', 'clinical trial', 'peer-reviewed',
        'scientific evidence', 'medical literature', 'published', 'meta-analysis',
        'systematic review', 'findings', 'recent research', 'what does research say',
        'according to research', 'evidence-based'
      ];
      const isResearchQuestion = researchKeywords.some(keyword => 
        message.toLowerCase().includes(keyword.toLowerCase())
      );
      
      // Check if avatar has toggles enabled
      const avatarUsePubMed = avatarConfig.usePubMed || false;
      const avatarUseWikipedia = avatarConfig.useWikipedia || false;
      const avatarUseGoogleSearch = avatarConfig.useGoogleSearch || false;

      // PARALLEL DATA FETCHING: Launch all enrichment operations concurrently
      const [memoryResultSettled, pubmedResultSettled, wikipediaResultSettled, googleSearchResultSettled, knowledgeResultSettled] = await Promise.allSettled([
        // 1. Memory search
        (async () => {
          const memStart = Date.now();
          if (!memoryEnabled || !userId || !memoryService.isAvailable()) {
            return { success: false, memories: [] };
          }
          try {
            const result = await memoryService.searchMemories(message, userId, { limit: 5 });
            perfTimings.memory = Date.now() - memStart;
            return result;
          } catch (error) {
            perfTimings.memory = Date.now() - memStart;
            logger.error({ error }, "Error fetching memories");
            return { success: false, memories: [] };
          }
        })(),

        // 2. PubMed research
        (async () => {
          const pubmedStart = Date.now();
          // Trigger PubMed if: explicit command, research question, OR avatar has usePubMed enabled
          if (!pubmedCommandMatch && !isResearchQuestion && !avatarUsePubMed) {
            return null;
          }
          try {
            const { searchHybrid, isAvailable } = await import("./pubmedService.js");
            if (!isAvailable()) {
              perfTimings.pubmed = Date.now() - pubmedStart;
              return null;
            }
            
            const searchQuery = pubmedCommandMatch ? pubmedCommandMatch[1].trim() : message;
            const maxResults = pubmedCommandMatch ? 10 : 5;
            
            logger.info({ userId, searchQuery, explicit: !!pubmedCommandMatch, maxResults }, 
              'Searching PubMed (hybrid mode) for avatar response');
            
            const results = await searchHybrid(searchQuery, maxResults);
            perfTimings.pubmed = Date.now() - pubmedStart;
            
            if (results.articles.length > 0) {
              logger.info({ userId, papersFound: results.articles.length, source: results.source }, 
                'PubMed research retrieved');
              return { results, searchQuery };
            }
            return null;
          } catch (error: any) {
            perfTimings.pubmed = Date.now() - pubmedStart;
            logger.error({ error: error.message }, 'Error fetching PubMed research');
            return null;
          }
        })(),

        // 3. Wikipedia search
        (async () => {
          const wikiStart = Date.now();
          if (!avatarUseWikipedia) {
            return null;
          }
          try {
            const { wikipediaService } = await import("./wikipediaService.js");
            if (!wikipediaService || !wikipediaService.isAvailable()) {
              perfTimings.wikipedia = Date.now() - wikiStart;
              return null;
            }
            
            logger.info({ userId, query: message }, 'Searching Wikipedia for avatar response');
            
            // Wikipedia service doesn't have a search function yet, so we'll skip for now
            // TODO: Implement Wikipedia search function
            perfTimings.wikipedia = Date.now() - wikiStart;
            return null;
          } catch (error: any) {
            perfTimings.wikipedia = Date.now() - wikiStart;
            logger.error({ error: error.message }, 'Error fetching Wikipedia results');
            return null;
          }
        })(),

        // 4. Google Search
        (async () => {
          const googleStart = Date.now();
          if (!avatarUseGoogleSearch) {
            return null;
          }
          try {
            if (!googleSearchService || !googleSearchService.isAvailable()) {
              perfTimings.googleSearch = Date.now() - googleStart;
              return null;
            }
            
            logger.info({ userId, query: message }, 'Searching Google for avatar response');
            
            const searchResults = await googleSearchService.search(message, 3);
            perfTimings.googleSearch = Date.now() - googleStart;
            
            if (searchResults) {
              logger.info({ userId, resultsLength: searchResults.length }, 'Google search results retrieved');
              return searchResults;
            }
            return null;
          } catch (error: any) {
            perfTimings.googleSearch = Date.now() - googleStart;
            logger.error({ error: error.message }, 'Error fetching Google search results');
            return null;
          }
        })(),

        // 5. Knowledge base (Pinecone + user sources)
        (async () => {
          const kbStart = Date.now();
          try {
            // Use avatarConfig from outer scope (already loaded above)
            let allNamespaces = [...avatarConfig.pineconeNamespaces];
            
            // Add user's knowledge sources and documents
            if (userId && !userId.startsWith('temp_')) {
              const userSources = await storage.listKnowledgeSources(userId);
              const activeSourceNamespaces = userSources
                .filter(source => source.status === 'active' && (source.itemsCount || 0) > 0)
                .map(source => source.pineconeNamespace);
              
              const documentNamespaces = [`documents-${userId}`, `video-transcripts-${userId}`];
              allNamespaces = [...allNamespaces, ...activeSourceNamespaces, ...documentNamespaces];
            }

            const { pineconeNamespaceService } = await import("./pineconeNamespaceService.js");
            if (!pineconeNamespaceService.isAvailable() || allNamespaces.length === 0) {
              perfTimings.knowledge = Date.now() - kbStart;
              return { context: "", namespaces: 0 };
            }

            const knowledgeResults = await pineconeNamespaceService.retrieveContext(message, 3, allNamespaces);
            perfTimings.knowledge = Date.now() - kbStart;
            
            const context = knowledgeResults.length > 0 ? knowledgeResults[0].text : "";
            return { context, namespaces: allNamespaces.length };
          } catch (error) {
            perfTimings.knowledge = Date.now() - kbStart;
            logger.error({ error }, 'Error fetching knowledge base');
            return { context: "", namespaces: 0 };
          }
        })()
      ]);

      // Extract results from settled promises
      const memoryResult = memoryResultSettled.status === 'fulfilled' ? memoryResultSettled.value : { success: false, memories: [] };
      const pubmedResult = pubmedResultSettled.status === 'fulfilled' ? pubmedResultSettled.value : null;
      const wikipediaResult = wikipediaResultSettled.status === 'fulfilled' ? wikipediaResultSettled.value : null;
      const googleSearchResult = googleSearchResultSettled.status === 'fulfilled' ? googleSearchResultSettled.value : null;
      const knowledgeResult = knowledgeResultSettled.status === 'fulfilled' ? knowledgeResultSettled.value : { context: "", namespaces: 0 };

      // Build memory context
      let memoryContext = "";
      if (memoryResult.success && memoryResult.memories && memoryResult.memories.length > 0) {
        memoryContext = "\n\nRELEVANT MEMORIES FROM PREVIOUS CONVERSATIONS:\n" +
          memoryResult.memories.map((m) => `- ${m.content}`).join("\n");
        logger.info({ userId, memoryCount: memoryResult.memories.length }, 'Retrieved relevant memories');
      }

      // Build PubMed context
      let pubmedContext = "";
      let pubmedMetadata: {
        papersFound: number;
        totalAvailable: number;
        fromCache: boolean;
        query: string;
        papers: Array<{ pmid: string; title: string; authors: string[] }>;
      } | null = null;

      if (pubmedResult) {
        const { results, searchQuery } = pubmedResult;
        const sourceDescription = results.source || 'PubMed';
        pubmedContext = `\n\nRELEVANT PEER-REVIEWED RESEARCH FROM PUBMED:\n${results.formattedText}\n\n` +
          `[Note: This research is from ${sourceDescription}. ${results.totalCount} total papers available on this topic.]`;
        
        pubmedMetadata = {
          papersFound: results.articles.length,
          totalAvailable: results.totalCount,
          fromCache: results.fromCache || false,
          query: searchQuery,
          papers: results.articles.map(article => ({
            pmid: article.pmid,
            title: article.title,
            authors: article.authors.slice(0, 3)
          }))
        };
      }

      // Build Wikipedia context
      let wikipediaContext = "";
      if (wikipediaResult) {
        wikipediaContext = `\n\nWIKIPEDIA INFORMATION:\n${wikipediaResult}`;
        logger.info({ userId }, 'Wikipedia results retrieved');
      }

      // Build Google Search context
      let googleSearchContext = "";
      if (googleSearchResult) {
        googleSearchContext = `\n\nWEB SEARCH RESULTS:\n${googleSearchResult}`;
        logger.info({ userId }, 'Google search results retrieved');
      }

      // Get knowledge context
      const knowledgeContext = knowledgeResult.context;
      if (knowledgeContext && knowledgeResult.namespaces > 0) {
        console.log(`📚 Knowledge context retrieved for ${avatarId} (${knowledgeContext.length} chars) from ${knowledgeResult.namespaces} namespaces`);
      }

      const currentDate = new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      
      const personalityWithDate = `${avatarConfig.personalityPrompt.replace(/- Today's date:.*/, `- Today's date: ${currentDate}`)}`
        .replace(/⚠️ CRITICAL SYSTEM CONFIGURATION:/, `⚠️ CRITICAL SYSTEM CONFIGURATION:\n- Today's date: ${currentDate}`);

      const personalityPrompt = avatarPersonality || personalityWithDate;

      // Enhanced personality prompt with memory and PubMed context
      let enhancedPersonality = personalityPrompt;
      
      if (memoryContext) {
        enhancedPersonality += `\n\n${memoryContext}\n\nUse these memories naturally in your response when relevant, but don't explicitly mention "I remember" unless it flows naturally.`;
      }
      
      if (pubmedContext) {
        enhancedPersonality += `\n\n${pubmedContext}\n\nYou have access to peer-reviewed medical research. Incorporate these findings naturally in your response. Cite specific papers when relevant using "According to a ${pubmedMetadata?.fromCache ? 'recent study' : 'study'} by [authors]..." format. You can mention PMID numbers for credibility.`;
      }
      
      if (wikipediaContext) {
        enhancedPersonality += `\n\n${wikipediaContext}\n\nYou have access to Wikipedia information. Incorporate these facts naturally in your response when relevant.`;
      }
      
      if (googleSearchContext) {
        enhancedPersonality += `\n\n${googleSearchContext}\n\nYou have access to web search results. Use this current information to enhance your response when relevant.`;
      }

      // Generate response using Claude Sonnet 4 with all context
      perfTimings.dataFetch = Date.now() - perfStart;
      const claudeStart = Date.now();
      
      let aiResponse: string;

      if (claudeService.isAvailable()) {
        // Use database conversation history for context-aware responses
        const enhancedConversationHistory = dbConversationHistory.length > 0 
          ? dbConversationHistory 
          : conversationHistory.map((msg: any) => ({
              message: msg.message,
              isUser: msg.isUser,
            }));

        aiResponse = await claudeService.generateResponse(
          message,
          knowledgeContext,
          enhancedConversationHistory,
          enhancedPersonality,
        );
      } else {
        // Fallback to knowledge base only
        aiResponse =
          knowledgeContext ||
          "I'm here to help, but I don't have specific information about that topic right now.";
      }
      
      perfTimings.claude = Date.now() - claudeStart;

      // Save avatar response to database
      if (userId) {
        try {
          await storage.saveConversation({
            userId,
            avatarId,
            role: 'assistant',
            text: aiResponse,
          });
          logger.info({ userId, avatarId }, 'Saved avatar response to database');
        } catch (error) {
          logger.error({ error, userId, avatarId }, 'Error saving avatar response to database');
          // Continue even if save fails - don't fail the request
        }
      }

      // Store conversation in memory if enabled
      if (memoryEnabled && userId && memoryService.isAvailable()) {
        try {
          // Store both the user's message and the AI's response
          const conversationText = `User asked: "${message}"\nAssistant responded: "${aiResponse}"`;
          const memoryResult = await memoryService.addMemory(
            conversationText,
            userId,
            MemoryType.NOTE,
            {
              timestamp: new Date().toISOString(),
              hasKnowledgeBase: !!knowledgeContext,
              hasWikipedia: !!wikipediaContext,
              hasGoogleSearch: !!googleSearchContext,
              hasPubMedResearch: !!pubmedContext,
              avatarId,
            }
          );
          if (memoryResult.success) {
            logger.info({ userId, memory: memoryResult.memory?.id }, 'Stored avatar conversation in memory');
          }
        } catch (memError) {
          logger.error({ error: memError }, 'Error storing memory');
          // Continue even if memory storage fails
        }
      }

      // Calculate total response time
      perfTimings.total = Date.now() - perfStart;

      // Log performance metrics
      logger.info({ 
        userId, 
        avatarId,
        perfTimings,
        hasMemories: !!memoryContext,
        hasPubMed: !!pubmedContext,
        hasWikipedia: !!wikipediaContext,
        hasGoogleSearch: !!googleSearchContext,
        hasKnowledge: !!knowledgeContext
      }, 'Avatar response performance metrics');

      res.json({
        success: true,
        message,
        knowledgeResponse: aiResponse,
        personalityUsed: personalityPrompt,
        usedWikipedia: avatarUseWikipedia && !!wikipediaContext,
        usedGoogleSearch: avatarUseGoogleSearch && !!googleSearchContext,
        usedClaude: claudeService.isAvailable(),
        hasMemories: !!memoryContext,
        pubmedResearch: pubmedMetadata ? {
          papersFound: pubmedMetadata.papersFound,
          totalAvailable: pubmedMetadata.totalAvailable,
          fromCache: pubmedMetadata.fromCache,
          searchQuery: pubmedMetadata.query,
          papers: pubmedMetadata.papers.map(paper => ({
            pmid: paper.pmid,
            title: paper.title,
            authors: paper.authors,
            url: `https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/`
          }))
        } : null,
        performance: {
          totalMs: perfTimings.total,
          dataFetchMs: perfTimings.dataFetch,
          claudeMs: perfTimings.claude,
          breakdown: perfTimings
        }
      });
    } catch (error) {
      console.error("Error getting avatar response:", error);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Failed to get avatar response",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  });

  // Test Pinecone Assistant connection
  app.post("/api/assistant/test", async (req, res) => {
    try {
      const { query = "test query" } = req.body;

      // Import here to avoid circular dependency issues
      const { pineconeAssistant } = await import("./mcpAssistant.js");

      if (!pineconeAssistant.isAvailable()) {
        return res.status(400).json({
          error:
            "Pinecone Assistant not available - check API key configuration",
        });
      }

      const results = await pineconeAssistant.retrieveContext(query, 3);

      res.json({
        success: true,
        query,
        results,
        message: "Pinecone Assistant connection successful",
      });
    } catch (error) {
      console.error("Error testing assistant connection:", error);
      res.status(500).json({
        error: "Failed to connect to Pinecone Assistant",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Configure multer for file uploads
  const upload = multer({ dest: "uploads/" });
  const objectStorageService = new ObjectStorageService();

  // Import document queue for background processing
  const { enqueueDocumentJob, getJobStatus } = await import(
    "./documentQueue.js"
  );

  // Get presigned URL for direct-to-storage upload (fast response)
  app.get(
    "/api/documents/upload-url",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const { filename, fileType } = req.query;

        if (!filename || !fileType) {
          return res.status(400).json({
            error: "filename and fileType query parameters are required",
          });
        }

        const uploadURL = await objectStorageService.getObjectEntityUploadURL();
        const objectId = uploadURL.split("/").pop()?.split("?")[0] || "";
        const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        res.json({
          success: true,
          uploadURL,
          documentId,
          objectPath: uploadURL.split("?")[0],
          metadata: {
            filename: decodeURIComponent(filename as string),
            fileType: fileType as string,
          },
        });
      } catch (error) {
        console.error("Error generating upload URL:", error);
        res.status(500).json({
          error: "Failed to generate upload URL",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  // Enqueue document processing job (after client uploads to presigned URL)
  app.post("/api/documents/process", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    try {
      const {
        documentId,
        filename,
        fileType,
        objectPath,
        indexName,
        namespace,
      } = req.body;

      if (!documentId || !filename || !fileType || !objectPath) {
        return res.status(400).json({
          error:
            "Missing required fields: documentId, filename, fileType, objectPath",
        });
      }

      const { isQueueAvailable } = await import("./documentQueue.js");

      if (isQueueAvailable()) {
        const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        await enqueueDocumentJob({
          jobId,
          documentId,
          userId,
          filename,
          fileType,
          objectPath,
          indexName,
          namespace,
        });

        res.json({
          success: true,
          jobId,
          documentId,
          processing: "async",
          message:
            "Document processing started in background. Poll /api/jobs/:jobId for status.",
        });
      } else {
        const metadata = { userId, indexName, namespace };
        const result = await documentProcessor.processDocument(
          objectPath,
          fileType,
          documentId,
          metadata,
        );

        res.json({
          success: true,
          documentId,
          processing: "sync",
          result,
          message: "Document processed synchronously (Redis not configured)",
        });
      }
    } catch (error) {
      console.error("Error processing document:", error);
      res.status(500).json({
        error: "Failed to process document",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get job status (for polling)
  app.get("/api/jobs/:jobId", isAuthenticated, async (req: any, res) => {
    try {
      const { jobId } = req.params;

      const { isQueueAvailable } = await import("./documentQueue.js");

      if (!isQueueAvailable()) {
        return res.status(503).json({
          error: "Job queue not available - Redis not configured",
          message:
            "Set REDIS_URL environment variable to enable background job processing",
        });
      }

      const jobStatus = await getJobStatus(jobId);

      if (!jobStatus) {
        return res.status(404).json({
          error: "Job not found",
        });
      }

      res.json({
        success: true,
        job: jobStatus,
      });
    } catch (error) {
      console.error("Error getting job status:", error);
      res.status(500).json({
        error: "Failed to get job status",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Google Drive integration endpoints
  app.get("/api/google-drive/status", isAuthenticated, async (req: any, res) => {
    try {
      const isConnected = await googleDriveService.isConnected();
      res.json({ connected: isConnected });
    } catch (error) {
      res.json({ connected: false });
    }
  });

  app.get("/api/google-drive/folders", isAuthenticated, async (req: any, res) => {
    try {
      const { pageToken } = req.query;
      const result = await googleDriveService.listSharedFolders(pageToken as string | undefined);
      res.json(result);
    } catch (error) {
      console.error("Error listing Google Drive folders:", error);
      res.status(500).json({
        error: "Failed to list Google Drive folders",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/google-drive/folder/:folderId", isAuthenticated, async (req: any, res) => {
    try {
      const { folderId } = req.params;
      const { pageToken } = req.query;
      const result = await googleDriveService.listFolderContents(folderId, pageToken as string | undefined);
      res.json(result);
    } catch (error) {
      console.error("Error listing folder contents:", error);
      res.status(500).json({
        error: "Failed to list folder contents",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/api/google-drive/upload-to-pinecone", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    try {
      const { fileId, fileName, indexName, namespace } = req.body;

      if (!fileId || !fileName) {
        return res.status(400).json({
          error: "Missing required fields: fileId, fileName",
        });
      }

      // Download file from Google Drive
      const { buffer, mimeType, fileName: processedFileName } = await googleDriveService.downloadFile(fileId);

      // Save to temporary file
      const tempDir = "uploads";
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const tempPath = path.join(tempDir, `gdrive_${Date.now()}_${processedFileName}`);
      fs.writeFileSync(tempPath, buffer);

      try {
        const documentId = `doc_gdrive_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const metadata = { userId, indexName, namespace, source: 'google-drive' };

        // Process document directly
        const result = await documentProcessor.processDocument(
          tempPath,
          mimeType,
          documentId,
          metadata,
        );

        // Clean up temp file
        fs.unlinkSync(tempPath);

        res.json({
          success: true,
          documentId,
          fileName: processedFileName,
          result,
          message: "File uploaded from Google Drive and processed successfully",
        });
      } catch (processingError) {
        // Clean up temp file on error
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
        throw processingError;
      }
    } catch (error) {
      console.error("Error uploading from Google Drive:", error);
      res.status(500).json({
        error: "Failed to upload file from Google Drive",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Document upload and processing endpoints (protected)
  app.post(
    "/api/documents/upload",
    isAuthenticated,
    upload.single("document"),
    async (req: any, res) => {
      const userId = req.user.claims.sub;
      try {
        if (!req.file) {
          return res.status(400).json({ error: "No file uploaded" });
        }

        const { originalname, mimetype, size, path: tempPath } = req.file;
        const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Validate file type
        const allowedTypes = [
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "text/plain",
          "audio/mp3",
          "audio/mpeg",
          "audio/wav",
          "audio/m4a",
          "audio/webm",
          "audio/mp4",
        ];

        if (!allowedTypes.includes(mimetype)) {
          fs.unlinkSync(tempPath); // Clean up temp file
          return res.status(400).json({
            error:
              "Unsupported file type. Supported types: PDF, DOCX, TXT, MP3, WAV, M4A, WebM",
          });
        }

        // Get upload URL from object storage
        const uploadURL = await objectStorageService.getObjectEntityUploadURL();

        // Read file and upload to object storage
        const fileBuffer = fs.readFileSync(tempPath);

        try {
          const uploadResponse = await fetch(uploadURL, {
            method: "PUT",
            body: fileBuffer,
            headers: {
              "Content-Type": mimetype,
            },
          });

          if (!uploadResponse.ok) {
            throw new Error(`Upload failed: ${uploadResponse.statusText}`);
          }

          // Get the object path from the upload URL
          const objectPath =
            objectStorageService.normalizeObjectEntityPath(uploadURL);

          // Get category from form data
          const category = req.body.category || null;

          // Process document in background with better error handling and resource cleanup
          documentProcessor
            .processDocument(tempPath, mimetype, documentId, {
              filename: originalname,
              fileSize: size,
              category,
              uploadedAt: new Date().toISOString(),
              userId,
            })
            .then((result) => {
              console.log(
                `Document processing completed for ${documentId}:`,
                result,
              );
            })
            .catch((error) => {
              console.error(
                `Document processing failed for ${documentId}:`,
                error,
              );
              // Clean up temp file on processing error
              try {
                if (fs.existsSync(tempPath)) {
                  fs.unlinkSync(tempPath);
                }
              } catch (cleanupError) {
                console.error("Error cleaning up temp file:", cleanupError);
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
            userId,
          });
        } catch (uploadError) {
          console.error("Object storage upload error:", uploadError);
          fs.unlinkSync(tempPath);
          return res.status(500).json({
            error: "Failed to upload to object storage",
          });
        }
      } catch (error) {
        console.error("Document upload error:", error);
        if (req.file?.path) {
          fs.unlinkSync(req.file.path);
        }
        res.status(500).json({
          error: "Failed to upload document",
        });
      }
    },
  );

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
        message: "User documents retrieved successfully",
      });
    } catch (error) {
      console.error("Error fetching user documents:", error);
      res.status(500).json({
        error: "Failed to fetch user documents",
      });
    }
  });

  // Get all documents for knowledge base management
  app.get("/api/documents", async (req: any, res) => {
    try {
      const documents = await storage.getAllDocuments();
      res.json(documents);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({
        error: "Failed to fetch documents",
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
      console.error("Error deleting document:", error);
      res.status(500).json({
        error: "Failed to delete document",
      });
    }
  });

  // Upload and process PDF document
  app.post(
    "/api/documents/upload-pdf",
    isAuthenticated,
    upload.single("file"),
    async (req: any, res) => {
      const log = logger.child({ service: "document", operation: "uploadPDF" });
      
      try {
        const userId = req.user.claims.sub;

        if (!req.file) {
          return res.status(400).json({ error: "No file uploaded" });
        }

        const { isAvailable, processPDFDocument } = await import("./documentService.js");
        
        if (!isAvailable()) {
          return res.status(503).json({ 
            error: "Document service not available. Check OpenAI and Pinecone configuration." 
          });
        }

        const { originalname, mimetype, size, path: tempPath } = req.file;
        const category = req.body.category || "OTHER";

        // Validate PDF file
        if (mimetype !== "application/pdf") {
          fs.unlinkSync(tempPath);
          return res.status(400).json({ error: "Only PDF files are supported" });
        }

        const documentId = `pdf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Create database record with category-based namespace
        const document = await storage.createDocument({
          userId,
          filename: originalname,
          fileType: "pdf",
          fileSize: size.toString(),
          pineconeNamespace: category,
          objectPath: tempPath,
        });

        log.info({ documentId, filename: originalname, userId, category }, "Processing PDF document");

        // Process PDF in background with category namespace and user tracking
        processPDFDocument(tempPath, originalname, category, documentId, userId)
          .then(async (metadata: any) => {
            await storage.updateDocumentStatus(
              document.id,
              "completed",
              metadata.totalChunks,
              metadata.textLength
            );
            log.info({ documentId, chunks: metadata.totalChunks }, "PDF processed successfully");
            // Clean up temp file
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          })
          .catch(async (error: any) => {
            await storage.updateDocumentStatus(document.id, "failed");
            log.error({ documentId, error: error.message }, "PDF processing failed");
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          });

        res.json({
          success: true,
          documentId: document.id,
          filename: originalname,
          fileType: "pdf",
          status: "processing",
          message: "PDF upload started. Processing in background.",
        });
      } catch (error: any) {
        log.error({ error: error.message }, "Error uploading PDF");
        if (req.file?.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        res.status(500).json({
          error: "Failed to upload PDF",
          details: error.message,
        });
      }
    }
  );

  // Upload and process video document
  app.post(
    "/api/documents/upload-video",
    isAuthenticated,
    upload.single("file"),
    async (req: any, res) => {
      const log = logger.child({ service: "document", operation: "uploadVideo" });
      
      try {
        const userId = req.user.claims.sub;

        if (!req.file) {
          return res.status(400).json({ error: "No file uploaded" });
        }

        const { isAvailable, processVideoDocument } = await import("./documentService.js");
        
        if (!isAvailable()) {
          return res.status(503).json({ 
            error: "Document service not available. Check OpenAI and Pinecone configuration." 
          });
        }

        const { originalname, mimetype, size, path: tempPath } = req.file;
        const category = req.body.category || "OTHER";

        // Validate video/audio file
        const allowedMimeTypes = [
          "video/mp4",
          "video/mpeg",
          "video/quicktime",
          "video/webm",
          "audio/mp3",
          "audio/mpeg",
          "audio/wav",
          "audio/m4a",
          "audio/webm",
          "audio/mp4",
        ];

        if (!allowedMimeTypes.includes(mimetype)) {
          fs.unlinkSync(tempPath);
          return res.status(400).json({ 
            error: "Unsupported file type. Supported: MP4, MPEG, MOV, WebM, MP3, WAV, M4A" 
          });
        }

        const documentId = `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Create database record with category-based namespace
        const document = await storage.createDocument({
          userId,
          filename: originalname,
          fileType: "video",
          fileSize: size.toString(),
          pineconeNamespace: category,
          objectPath: tempPath,
        });

        log.info({ documentId, filename: originalname, userId, category }, "Processing video document");

        // Process video in background with category namespace and user tracking
        processVideoDocument(tempPath, originalname, category, documentId, userId)
          .then(async (metadata: any) => {
            await storage.updateDocumentStatus(
              document.id,
              "completed",
              metadata.totalChunks,
              metadata.textLength
            );
            log.info({ documentId, chunks: metadata.totalChunks }, "Video processed successfully");
            // Clean up temp file
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          })
          .catch(async (error) => {
            await storage.updateDocumentStatus(document.id, "failed");
            log.error({ documentId, error: error.message }, "Video processing failed");
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          });

        res.json({
          success: true,
          documentId: document.id,
          filename: originalname,
          fileType: "video",
          status: "processing",
          message: "Video upload started. Transcribing and processing in background.",
        });
      } catch (error: any) {
        log.error({ error: error.message }, "Error uploading video");
        if (req.file?.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        res.status(500).json({
          error: "Failed to upload video",
          details: error.message,
        });
      }
    }
  );

  // Upload and process DOCX document
  app.post(
    "/api/documents/upload-docx",
    isAuthenticated,
    upload.single("file"),
    async (req: any, res) => {
      const log = logger.child({ service: "document", operation: "uploadDOCX" });
      
      try {
        const userId = req.user.claims.sub;

        if (!req.file) {
          return res.status(400).json({ error: "No file uploaded" });
        }

        const { isAvailable, processDOCXDocument } = await import("./documentService.js");
        
        if (!isAvailable()) {
          return res.status(503).json({ 
            error: "Document service not available. Check OpenAI and Pinecone configuration." 
          });
        }

        const { originalname, mimetype, size, path: tempPath } = req.file;
        const category = req.body.category || "OTHER";

        // Validate DOCX file
        if (mimetype !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && !originalname.endsWith('.docx')) {
          fs.unlinkSync(tempPath);
          return res.status(400).json({ error: "Only DOCX files are supported" });
        }

        const documentId = `docx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Create database record with category-based namespace
        const document = await storage.createDocument({
          userId,
          filename: originalname,
          fileType: "docx",
          fileSize: size.toString(),
          pineconeNamespace: category,
          objectPath: tempPath,
        });

        log.info({ documentId, filename: originalname, userId, category }, "Processing DOCX document");

        // Process DOCX in background with category namespace and user tracking
        processDOCXDocument(tempPath, originalname, category, documentId, userId)
          .then(async (metadata: any) => {
            await storage.updateDocumentStatus(
              document.id,
              "completed",
              metadata.totalChunks,
              metadata.textLength
            );
            log.info({ documentId, chunks: metadata.totalChunks }, "DOCX processed successfully");
            // Clean up temp file
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          })
          .catch(async (error: any) => {
            await storage.updateDocumentStatus(document.id, "failed");
            log.error({ documentId, error: error.message }, "DOCX processing failed");
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          });

        res.json({
          success: true,
          documentId: document.id,
          filename: originalname,
          fileType: "docx",
          status: "processing",
          message: "DOCX upload started. Processing in background.",
        });
      } catch (error: any) {
        log.error({ error: error.message }, "Error uploading DOCX");
        if (req.file?.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        res.status(500).json({
          error: "Failed to upload DOCX",
          details: error.message,
        });
      }
    }
  );

  // Upload and process TXT document
  app.post(
    "/api/documents/upload-txt",
    isAuthenticated,
    upload.single("file"),
    async (req: any, res) => {
      const log = logger.child({ service: "document", operation: "uploadTXT" });
      
      try {
        const userId = req.user.claims.sub;

        if (!req.file) {
          return res.status(400).json({ error: "No file uploaded" });
        }

        const { isAvailable, processTXTDocument } = await import("./documentService.js");
        
        if (!isAvailable()) {
          return res.status(503).json({ 
            error: "Document service not available. Check OpenAI and Pinecone configuration." 
          });
        }

        const { originalname, mimetype, size, path: tempPath } = req.file;
        const category = req.body.category || "OTHER";

        // Validate TXT file
        if (mimetype !== "text/plain" && !originalname.endsWith('.txt')) {
          fs.unlinkSync(tempPath);
          return res.status(400).json({ error: "Only TXT files are supported" });
        }

        const documentId = `txt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Create database record with category-based namespace
        const document = await storage.createDocument({
          userId,
          filename: originalname,
          fileType: "txt",
          fileSize: size.toString(),
          pineconeNamespace: category,
          objectPath: tempPath,
        });

        log.info({ documentId, filename: originalname, userId, category }, "Processing TXT document");

        // Process TXT in background with category namespace and user tracking
        processTXTDocument(tempPath, originalname, category, documentId, userId)
          .then(async (metadata: any) => {
            await storage.updateDocumentStatus(
              document.id,
              "completed",
              metadata.totalChunks,
              metadata.textLength
            );
            log.info({ documentId, chunks: metadata.totalChunks }, "TXT processed successfully");
            // Clean up temp file
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          })
          .catch(async (error: any) => {
            await storage.updateDocumentStatus(document.id, "failed");
            log.error({ documentId, error: error.message }, "TXT processing failed");
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          });

        res.json({
          success: true,
          documentId: document.id,
          filename: originalname,
          fileType: "txt",
          status: "processing",
          message: "TXT upload started. Processing in background.",
        });
      } catch (error: any) {
        log.error({ error: error.message }, "Error uploading TXT");
        if (req.file?.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        res.status(500).json({
          error: "Failed to upload TXT",
          details: error.message,
        });
      }
    }
  );

  // Upload and process ZIP file containing documents
  app.post(
    "/api/documents/upload-zip",
    isAuthenticated,
    upload.single("file"),
    async (req: any, res) => {
      const log = logger.child({ service: "document", operation: "uploadZIP" });
      
      try {
        const userId = req.user.claims.sub;

        if (!req.file) {
          return res.status(400).json({ error: "No file uploaded" });
        }

        const { isAvailable, processPDFDocument, processDOCXDocument, processTXTDocument } = await import("./documentService.js");
        
        if (!isAvailable()) {
          return res.status(503).json({ 
            error: "Document service not available. Check OpenAI and Pinecone configuration." 
          });
        }

        const { originalname, mimetype, size, path: tempPath } = req.file;
        const category = req.body.category || "OTHER";

        // Validate ZIP file
        if (mimetype !== "application/zip" && mimetype !== "application/x-zip-compressed" && !originalname.endsWith('.zip')) {
          fs.unlinkSync(tempPath);
          return res.status(400).json({ error: "Only ZIP files are supported" });
        }

        log.info({ filename: originalname, userId, category, size }, "Processing ZIP file");

        // Import unzipper
        const unzipper = await import("unzipper");
        const path = await import("path");
        
        // Security limits
        const MAX_FILES = 50; // Maximum files to extract
        const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB per file
        const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB total extracted
        
        // Create temp directory for extraction with unique ID
        const extractId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const extractDir = path.join('/tmp', `zip_extract_${extractId}`);
        if (!fs.existsSync(extractDir)) {
          fs.mkdirSync(extractDir, { recursive: true });
        }

        // Extract ZIP file
        const directory = await unzipper.Open.file(tempPath);
        const extractedFiles: { name: string; path: string; type: string }[] = [];
        
        let totalSize = 0;
        let fileCount = 0;
        
        for (const file of directory.files) {
          // Security: Check file count limit
          if (fileCount >= MAX_FILES) {
            log.warn({ maxFiles: MAX_FILES }, "ZIP file contains too many files, stopping extraction");
            break;
          }
          
          // Skip directories and hidden files
          if (file.type === 'Directory' || file.path.startsWith('__MACOSX') || file.path.includes('/.')) {
            continue;
          }
          
          // Security: Get safe filename (removes path traversal attempts)
          const rawName = path.basename(file.path);
          // Additional security: remove any remaining path separators and sanitize
          const safeName = rawName.replace(/[\/\\]/g, '_').replace(/\.\./g, '_');
          
          if (!safeName || safeName.startsWith('.')) {
            continue;
          }
          
          const ext = path.extname(safeName).toLowerCase();
          const supportedTypes = ['.pdf', '.docx', '.txt'];
          
          if (!supportedTypes.includes(ext)) {
            continue;
          }

          // Security: Check file size before extraction
          if (file.uncompressedSize && file.uncompressedSize > MAX_FILE_SIZE) {
            log.warn({ filename: safeName, size: file.uncompressedSize }, "File too large, skipping");
            continue;
          }
          
          // Security: Check total size limit
          if (totalSize + (file.uncompressedSize || 0) > MAX_TOTAL_SIZE) {
            log.warn({ totalSize, maxTotal: MAX_TOTAL_SIZE }, "Total extracted size limit reached, stopping");
            break;
          }

          // Generate unique filename to prevent overwrites
          const uniqueName = `${Date.now()}_${Math.random().toString(36).substr(2, 6)}_${safeName}`;
          const extractPath = path.join(extractDir, uniqueName);
          
          // Verify extraction path is within extract directory (prevent path traversal)
          const resolvedPath = path.resolve(extractPath);
          const resolvedDir = path.resolve(extractDir);
          if (!resolvedPath.startsWith(resolvedDir)) {
            log.warn({ filename: safeName }, "Path traversal attempt detected, skipping file");
            continue;
          }
          
          // Extract file
          const content = await file.buffer();
          
          // Verify actual size matches expected
          if (content.length > MAX_FILE_SIZE) {
            log.warn({ filename: safeName, actualSize: content.length }, "Extracted file too large, skipping");
            continue;
          }
          
          fs.writeFileSync(extractPath, content);
          totalSize += content.length;
          fileCount++;
          
          extractedFiles.push({
            name: safeName, // Use original safe name for display
            path: extractPath,
            type: ext.replace('.', '')
          });
        }

        if (extractedFiles.length === 0) {
          // Clean up
          fs.unlinkSync(tempPath);
          fs.rmSync(extractDir, { recursive: true, force: true });
          return res.status(400).json({ 
            error: "No supported documents found in ZIP file. Supports: PDF, DOCX, TXT" 
          });
        }

        log.info({ extractedCount: extractedFiles.length }, "Files extracted from ZIP");

        // Process each file
        const results: { filename: string; status: string; documentId?: string; error?: string }[] = [];
        
        for (const extractedFile of extractedFiles) {
          const documentId = `${extractedFile.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          try {
            // Create database record
            const document = await storage.createDocument({
              userId,
              filename: extractedFile.name,
              fileType: extractedFile.type,
              fileSize: fs.statSync(extractedFile.path).size.toString(),
              pineconeNamespace: category,
              objectPath: extractedFile.path,
            });

            // Process based on file type
            let processPromise: Promise<any>;
            
            if (extractedFile.type === 'pdf') {
              processPromise = processPDFDocument(extractedFile.path, extractedFile.name, category, documentId, userId);
            } else if (extractedFile.type === 'docx') {
              processPromise = processDOCXDocument(extractedFile.path, extractedFile.name, category, documentId, userId);
            } else {
              processPromise = processTXTDocument(extractedFile.path, extractedFile.name, category, documentId, userId);
            }

            // Process in background
            processPromise
              .then(async (metadata: any) => {
                await storage.updateDocumentStatus(
                  document.id,
                  "completed",
                  metadata.totalChunks,
                  metadata.textLength
                );
                log.info({ documentId, filename: extractedFile.name }, "Document from ZIP processed successfully");
                if (fs.existsSync(extractedFile.path)) {
                  fs.unlinkSync(extractedFile.path);
                }
              })
              .catch(async (error: any) => {
                await storage.updateDocumentStatus(document.id, "failed");
                log.error({ documentId, filename: extractedFile.name, error: error.message }, "Document from ZIP processing failed");
                if (fs.existsSync(extractedFile.path)) {
                  fs.unlinkSync(extractedFile.path);
                }
              });

            results.push({
              filename: extractedFile.name,
              status: "processing",
              documentId: document.id
            });
          } catch (fileError: any) {
            log.error({ filename: extractedFile.name, error: fileError.message }, "Failed to process file from ZIP");
            results.push({
              filename: extractedFile.name,
              status: "failed",
              error: fileError.message
            });
            if (fs.existsSync(extractedFile.path)) {
              fs.unlinkSync(extractedFile.path);
            }
          }
        }

        // Clean up original ZIP file
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }

        // Schedule extraction directory cleanup after processing
        setTimeout(() => {
          if (fs.existsSync(extractDir)) {
            fs.rmSync(extractDir, { recursive: true, force: true });
          }
        }, 60000); // Clean up after 1 minute

        const successCount = results.filter(r => r.status === "processing").length;
        const failedCount = results.filter(r => r.status === "failed").length;

        res.json({
          success: true,
          filename: originalname,
          fileType: "zip",
          status: "processing",
          message: `ZIP upload complete. ${successCount} file(s) processing, ${failedCount} failed.`,
          extractedFiles: results
        });
      } catch (error: any) {
        log.error({ error: error.message }, "Error uploading ZIP");
        if (req.file?.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        res.status(500).json({
          error: "Failed to upload ZIP",
          details: error.message,
        });
      }
    }
  );

  // Get user's uploaded documents
  app.get("/api/documents/user/:userId", isAuthenticated, async (req: any, res) => {
    const log = logger.child({ service: "document", operation: "getUserDocuments" });
    
    try {
      const { userId } = req.params;
      const requestingUser = req.user.claims.sub;

      // Users can only view their own documents
      if (userId !== requestingUser) {
        return res.status(403).json({ error: "Access denied" });
      }

      const documents = await storage.getUserDocuments(userId);

      log.info({ userId, count: documents.length }, "User documents retrieved");

      res.json({
        success: true,
        documents,
      });
    } catch (error: any) {
      log.error({ error: error.message }, "Error fetching user documents");
      res.status(500).json({
        error: "Failed to fetch user documents",
        details: error.message,
      });
    }
  });

  // Get all users for admin purposes
  app.get("/api/admin/users", async (req: any, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({
        error: "Failed to fetch users",
      });
    }
  });

  // Get API cost tracking statistics
  app.get("/api/admin/costs", isAuthenticated, async (req: any, res) => {
    try {
      const stats = await storage.getCostStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching cost stats:", error);
      res.status(500).json({
        error: "Failed to fetch cost statistics",
      });
    }
  });

  // Get active session statistics
  app.get("/api/admin/sessions", isAuthenticated, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 1000;
      const stats = sessionManager.getSessionStats();
      const historyData = sessionManager.getSessionHistory(limit);
      
      res.json({
        current: {
          totalActiveSessions: stats.totalActiveSessions,
          sessionsByUser: stats.userSessionCounts,
          sessionsByAvatar: stats.avatarSessionCounts,
        },
        history: historyData.recentSessions.map(session => ({
          sessionId: session.sessionId,
          userId: session.userId,
          avatarId: session.avatarId,
          startTime: session.startTime,
          endTime: session.endTime,
          duration: session.durationMs,
        })),
      });
    } catch (error) {
      console.error("Error fetching session stats:", error);
      res.status(500).json({
        error: "Failed to fetch session statistics",
      });
    }
  });

  // Start a session (for audio-only mode or session registration without HeyGen token)
  app.post("/api/session/start", async (req, res) => {
    try {
      const { userId, avatarId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const sessionCheck = sessionManager.canStartSession(userId);
      if (!sessionCheck.allowed) {
        return res.status(429).json({
          error: sessionCheck.reason,
          currentCount: sessionCheck.currentCount,
        });
      }

      if (avatarId) {
        const switchCheck = sessionManager.canSwitchAvatar(userId, avatarId);
        if (!switchCheck.allowed) {
          return res.status(429).json({
            error: switchCheck.reason,
            remainingCooldownMs: switchCheck.remainingCooldownMs,
          });
        }
      }

      const sessionId = `session_${userId}_${Date.now()}`;
      sessionManager.startSession(sessionId, userId, avatarId || 'unknown');

      res.json({ sessionId });
    } catch (error) {
      console.error("Error starting session:", error);
      res.status(500).json({
        error: "Failed to start session",
      });
    }
  });

  // End a session
  app.post("/api/session/end", async (req, res) => {
    try {
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ error: "sessionId is required" });
      }

      sessionManager.endSession(sessionId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error ending session:", error);
      res.status(500).json({
        error: "Failed to end session",
      });
    }
  });

  // End all sessions for a user
  app.post("/api/session/end-all", async (req, res) => {
    try {
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      sessionManager.endAllUserSessions(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error ending all user sessions:", error);
      res.status(500).json({
        error: "Failed to end all sessions",
      });
    }
  });

  // Search documents for RAG
  app.post("/api/documents/search", async (req, res) => {
    try {
      const { query, maxResults = 5 } = req.body;

      if (!query) {
        return res.status(400).json({
          error: "Query is required",
        });
      }

      const results = await documentProcessor.searchDocuments(
        query,
        maxResults,
      );

      res.json({
        success: true,
        query,
        results: results.map((result) => ({
          text: result.text,
          score: result.score,
          documentId: result.documentId,
          metadata: result.metadata,
        })),
      });
    } catch (error) {
      console.error("Document search error:", error);
      res.status(500).json({
        error: "Failed to search documents",
      });
    }
  });

  // Get conversation context for RAG
  app.post(
    "/api/chat/context",
    rateLimitMiddleware(20, 60000),
    async (req, res) => {
      try {
        const { query, maxTokens = 2000 } = req.body;

        if (!query) {
          return res.status(400).json({
            error: "Query is required",
          });
        }

        const context = await documentProcessor.getConversationContext(
          query,
          maxTokens,
        );

        res.json({
          success: true,
          query,
          context,
          length: context.length,
        });
      } catch (error) {
        console.error("Context retrieval error:", error);
        res.status(500).json({
          error: "Failed to get conversation context",
        });
      }
    },
  );

  // Session management endpoints
  app.post("/api/sessions", async (req, res) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({
          error: "User ID is required",
        });
      }

      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      res.json({
        success: true,
        sessionId,
        userId,
        conversationHistory: [],
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Session creation error:", error);
      res.status(500).json({
        error: "Failed to create session",
      });
    }
  });

  app.post("/api/sessions/:sessionId/messages", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { message, isUser = true } = req.body;

      if (!message) {
        return res.status(400).json({
          error: "Message is required",
        });
      }

      // If this is a user message, get RAG context
      let context = "";
      if (isUser) {
        context = await documentProcessor.getConversationContext(message);
      }

      const messageEntry = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        message,
        isUser,
        context: isUser ? context : undefined,
        timestamp: new Date().toISOString(),
      };

      res.json({
        success: true,
        sessionId,
        message: messageEntry,
        context: isUser ? context : undefined,
      });
    } catch (error) {
      console.error("Message processing error:", error);
      res.status(500).json({
        error: "Failed to process message",
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
      let textContent = html
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const documentId = `url_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Process the extracted text with size limits
      if (textContent.length > 500000) {
        // Limit to 500KB
        textContent = textContent.substring(0, 500000);
        console.warn(`URL content truncated to 500KB for ${documentId}`);
      }

      // Create temporary file with extracted content
      const tempFilePath = `/tmp/${documentId}.txt`;
      fs.writeFileSync(tempFilePath, textContent);

      // Process the extracted text
      documentProcessor
        .processDocument(tempFilePath, "text/plain", documentId, {
          url,
          category,
          type: "url_content",
          extractedAt: new Date().toISOString(),
        })
        .then((result) => {
          console.log(`URL processing completed for ${documentId}:`, result);
          // Clean up temp file
          try {
            fs.unlinkSync(tempFilePath);
          } catch (cleanupError) {
            console.error("Error cleaning up temp file:", cleanupError);
          }
        })
        .catch((error) => {
          console.error(`URL processing failed for ${documentId}:`, error);
          // Clean up temp file on error too
          try {
            fs.unlinkSync(tempFilePath);
          } catch (cleanupError) {
            console.error("Error cleaning up temp file:", cleanupError);
          }
        });

      res.json({
        success: true,
        documentId,
        filename: new URL(url).hostname,
        fileType: "text/html",
        fileSize: textContent.length,
        status: "completed",
        message: "URL content extracted and processing started",
      });
    } catch (error) {
      console.error("URL processing error:", error);
      res.status(500).json({
        error: "Failed to process URL",
      });
    }
  });

  // Text content processing endpoint
  app.post("/api/documents/text", async (req, res) => {
    try {
      const { text, title = "Custom Text Input", category = null } = req.body;

      if (!text) {
        return res.status(400).json({ error: "Text content is required" });
      }

      const documentId = `text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Limit text size to prevent memory issues
      let limitedText = text;
      if (text.length > 500000) {
        // Limit to 500KB
        limitedText = text.substring(0, 500000);
        console.warn(`Text content truncated to 500KB for ${documentId}`);
      }

      // Create temporary file with text content
      const tempFilePath = `/tmp/${documentId}.txt`;
      fs.writeFileSync(tempFilePath, limitedText);

      // Process the text
      documentProcessor
        .processDocument(tempFilePath, "text/plain", documentId, {
          title,
          category,
          type: "document_chunk",
          createdAt: new Date().toISOString(),
        })
        .then((result) => {
          console.log(`Text processing completed for ${documentId}:`, result);
          // Clean up temp file
          fs.unlinkSync(tempFilePath);
        })
        .catch((error) => {
          console.error(`Text processing failed for ${documentId}:`, error);
          // Clean up temp file on error too
          try {
            fs.unlinkSync(tempFilePath);
          } catch {}
        });

      res.json({
        success: true,
        documentId,
        filename: title,
        fileType: "text/plain",
        fileSize: text.length,
        status: "completed",
        message: "Text content processing started",
      });
    } catch (error) {
      console.error("Text processing error:", error);
      res.status(500).json({
        error: "Failed to process text content",
      });
    }
  });

  // Audio transcription and processing endpoint
  app.post(
    "/api/documents/dictation",
    upload.single("audio"),
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: "Audio file is required" });
        }

        const documentId = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const category = req.body.category || null;

        // Transcribe audio using OpenAI Whisper
        const transcribedText = await documentProcessor.extractTextFromFile(
          req.file.path,
          req.file.mimetype,
        );

        // Create temporary file with transcribed content
        const tempFilePath = `/tmp/${documentId}.txt`;
        fs.writeFileSync(tempFilePath, transcribedText);

        // Process the transcribed text
        documentProcessor
          .processDocument(tempFilePath, "text/plain", documentId, {
            originalFilename: req.file.originalname,
            category,
            type: "audio_transcription",
            audioFileSize: req.file.size,
            transcribedAt: new Date().toISOString(),
          })
          .then((result) => {
            console.log(
              `Audio transcription processing completed for ${documentId}:`,
              result,
            );
            // Clean up temp files
            fs.unlinkSync(tempFilePath);
            fs.unlinkSync(req.file!.path);
          })
          .catch((error) => {
            console.error(
              `Audio transcription processing failed for ${documentId}:`,
              error,
            );
            // Clean up temp files on error too
            try {
              fs.unlinkSync(tempFilePath);
            } catch {}
            try {
              fs.unlinkSync(req.file!.path);
            } catch {}
          });

        res.json({
          success: true,
          documentId,
          filename: `Audio Recording - ${new Date().toLocaleString()}`,
          fileType: "audio/wav",
          fileSize: req.file.size,
          status: "completed",
          message: "Audio transcription and processing started",
        });
      } catch (error) {
        console.error("Audio processing error:", error);
        if (req.file?.path) {
          try {
            fs.unlinkSync(req.file.path);
          } catch {}
        }
        res.status(500).json({
          error: "Failed to process audio recording",
        });
      }
    },
  );

  // Enhanced AI chat endpoint with Claude Sonnet and Google Search
  app.post(
    "/api/chat/enhanced",
    rateLimitMiddleware(30, 60000),
    async (req, res) => {
      try {
        const {
          message,
          conversationHistory = [],
          useWebSearch = false,
          maxTokens = 2000,
          memoryEnabled = false,
          userId,
        } = req.body;

        if (!message) {
          return res.status(400).json({
            error: "Message is required",
          });
        }

        // Retrieve relevant memories if memory is enabled
        let relevantMemories = "";
        if (memoryEnabled && userId && memoryService.isAvailable()) {
          const memoryResult = await memoryService.searchMemories(message, userId, { limit: 5 });
          if (memoryResult.success && memoryResult.memories && memoryResult.memories.length > 0) {
            relevantMemories = memoryResult.memories
              .map((m, i) => `[Memory ${i + 1}]: ${m.content}`)
              .join('\n');
            logger.info(
              { userId, memoryCount: memoryResult.memories.length },
              'Retrieved relevant memories for conversation'
            );
          }
        }

        // Get conversation context from knowledge base
        const context = await documentProcessor.getConversationContext(
          message,
          maxTokens,
        );

        let webSearchResults = "";

        // Use Google Search for current information if requested or if query seems time-sensitive
        if (useWebSearch || googleSearchService.shouldUseWebSearch(message)) {
          if (googleSearchService.isAvailable()) {
            webSearchResults = await googleSearchService.search(message, 4);
          } else {
            console.warn("Google Search requested but not available");
          }
        }

        // Enhance context with memories
        let enhancedContext = context;
        if (relevantMemories) {
          enhancedContext = `Previous Conversations and Preferences:\n${relevantMemories}\n\nKnowledge Base:\n${context}`;
        }

        let aiResponse: string;

        // Use Claude Sonnet if available, otherwise fallback to basic context response
        if (claudeService.isAvailable()) {
          if (webSearchResults) {
            aiResponse = await claudeService.generateEnhancedResponse(
              message,
              enhancedContext,
              webSearchResults,
              conversationHistory,
            );
          } else {
            aiResponse = await claudeService.generateResponse(
              message,
              enhancedContext,
              conversationHistory,
            );
          }
        } else {
          // Fallback response when Claude is not available
          const contextInfo = enhancedContext
            ? `Based on the knowledge base: ${enhancedContext.substring(0, 500)}...`
            : "";
          const webInfo = webSearchResults
            ? `\n\nCurrent information: ${webSearchResults.substring(0, 300)}...`
            : "";
          aiResponse = `${contextInfo}${webInfo}\n\nI can provide information from the knowledge base${webSearchResults ? " and current web results" : ""}, but for advanced AI conversation capabilities, Claude Sonnet integration is needed.`;
        }

        // Store conversation in memory if enabled
        if (memoryEnabled && userId && memoryService.isAvailable()) {
          const conversationText = `User: ${message}\nAssistant: ${aiResponse}`;
          const memoryResult = await memoryService.addMemory(
            conversationText,
            userId,
            MemoryType.NOTE,
            {
              timestamp: new Date().toISOString(),
              hasWebSearch: !!webSearchResults,
              hasContext: !!context,
            }
          );
          if (memoryResult.success) {
            logger.info({ userId, memory: memoryResult.memory?.id }, 'Stored conversation in memory');
          }
        }

        // Store conversation in Pinecone if it has good context
        try {
          if (context) {
            const embedding =
              await documentProcessor.generateEmbedding(message);
            const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            await pineconeService.storeConversation(
              conversationId,
              `Q: ${message}\nA: ${aiResponse}`,
              embedding,
              {
                type: "chat_enhanced",
                hasWebSearch: !!webSearchResults,
                timestamp: new Date().toISOString(),
              },
            );
          }
        } catch (storeError) {
          console.error("Error storing conversation:", storeError);
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
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.error("Enhanced chat error:", error);
        res.status(500).json({
          error: "Failed to process enhanced chat request",
        });
      }
    },
  );

  // Test endpoint for PubMed summarization
  app.post("/api/test-pubmed-summary", async (req, res) => {
    try {
      const { query, maxResults = 5 } = req.body;

      if (!query) {
        return res.status(400).json({ error: "query is required" });
      }

      logger.info({ query, maxResults }, "Testing PubMed summarization");

      const result = await pubmedService.searchAndFetchPubMed(
        query,
        maxResults,
        true // generateSummary = true
      );

      res.json({
        success: true,
        query,
        totalArticles: result.totalCount,
        returnedArticles: result.articles.length,
        summary: result.summary,
        fromCache: result.fromCache,
        articles: result.articles.map(a => ({
          pmid: a.pmid,
          title: a.title,
          authors: a.authors.slice(0, 3),
          journal: a.journal,
          year: a.pubDate.split('-')[0]
        }))
      });
    } catch (error: any) {
      logger.error({ error: error.message }, "Error testing PubMed summarization");
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Offline PubMed search endpoint
  app.post("/api/pubmed/offline-search", async (req, res) => {
    try {
      const { query, maxResults = 10 } = req.body;

      if (!query) {
        return res.status(400).json({ error: "query is required" });
      }

      logger.info({ query, maxResults }, "Offline PubMed search request");

      const offlinePubMed = await import("./offlinePubMedService");
      const articles = await offlinePubMed.searchOfflinePubMed(query, maxResults);

      const formattedText = articles.map((article, index) => 
        `${index + 1}. ${article.title}\n` +
        `   Authors: ${article.authors.slice(0, 3).join(', ')}${article.authors.length > 3 ? ' et al.' : ''}\n` +
        `   Journal: ${article.journal} (${article.pubDate})\n` +
        `   PMID: ${article.pmid}\n` +
        (article.abstract ? `   Abstract: ${article.abstract.substring(0, 200)}...\n` : '') +
        (article.keywords?.length ? `   Keywords: ${article.keywords.join(', ')}\n` : '')
      ).join('\n');

      res.json({
        success: true,
        query,
        source: 'offline-database',
        returnedArticles: articles.length,
        articles,
        formattedText
      });
    } catch (error: any) {
      logger.error({ error: error.message }, "Error in offline PubMed search");
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get offline PubMed database statistics
  app.get("/api/pubmed/offline-stats", async (req, res) => {
    const log = logger.child({ service: "pubmed", operation: "getOfflineStats" });
    
    try {
      log.info("Getting offline PubMed database statistics");

      const offlinePubMed = await import("./offlinePubMedService");
      const stats = await offlinePubMed.getOfflineStats();

      log.info({ stats }, "Offline PubMed stats retrieved");

      res.json({
        success: true,
        stats,
      });
    } catch (error: any) {
      log.error({ error: error.message }, "Error getting offline PubMed stats");
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // Clear offline PubMed database (admin only)
  app.delete("/api/pubmed/offline-clear", isAuthenticated, async (req: any, res) => {
    const log = logger.child({ service: "pubmed", operation: "clearOffline" });
    
    try {
      const userId = req.user.claims.sub;
      
      // TODO: Add admin role check here
      // For now, allow any authenticated user (update this for production)
      
      log.warn({ userId }, "Clearing offline PubMed database");

      const offlinePubMed = await import("./offlinePubMedService");
      await offlinePubMed.clearOfflineDatabase();

      log.info({ userId }, "Offline PubMed database cleared successfully");

      res.json({
        success: true,
        message: "Offline PubMed database cleared successfully",
      });
    } catch (error: any) {
      log.error({ error: error.message }, "Error clearing offline PubMed database");
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // Import PubMed dump file (admin only)
  app.post(
    "/api/pubmed/import-dump",
    isAuthenticated,
    upload.single("file"),
    async (req: any, res) => {
      const log = logger.child({ service: "pubmed", operation: "importDump" });
      
      try {
        const userId = req.user.claims.sub;
        
        if (!req.file) {
          return res.status(400).json({ error: "No file uploaded" });
        }

        const { originalname, mimetype, size, path: tempPath } = req.file;

        // Validate file type (XML or gzipped XML)
        if (!mimetype.includes("xml") && !mimetype.includes("gzip") && 
            !originalname.endsWith(".xml") && !originalname.endsWith(".xml.gz")) {
          fs.unlinkSync(tempPath);
          return res.status(400).json({ 
            error: "Invalid file type. Expected XML or XML.GZ file" 
          });
        }

        log.info({ userId, filename: originalname, size }, "Starting PubMed dump import");

        // Process in background
        const importId = `import_${Date.now()}`;

        // Start import process
        import("./offlinePubMedService").then(async (offlinePubMed) => {
          try {
            await offlinePubMed.importPubMedDump(tempPath);
            log.info({ importId, filename: originalname }, "PubMed dump import completed");
            // Clean up temp file
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          } catch (error: any) {
            log.error({ importId, error: error.message }, "PubMed dump import failed");
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          }
        });

        res.json({
          success: true,
          importId,
          filename: originalname,
          status: "processing",
          message: "PubMed dump import started in background. This may take a while for large files.",
        });
      } catch (error: any) {
        log.error({ error: error.message }, "Error starting PubMed dump import");
        if (req.file?.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        res.status(500).json({
          error: "Failed to start PubMed dump import",
          details: error.message,
        });
      }
    }
  );

  const httpServer = createServer(app);
  return httpServer;
}

// Avatar seeding function - populates database with default avatars if empty
export async function seedDefaultAvatars(): Promise<void> {
  try {
    const existingAvatars = await storage.listAvatars(false);
    
    if (existingAvatars.length === 0) {
      const { defaultAvatars } = await import("../config/avatars.config.js");
      
      logger.info("Seeding database with default avatars...");
      
      for (const avatar of defaultAvatars) {
        await storage.createAvatar(avatar);
        logger.info({ avatarId: avatar.id, name: avatar.name }, "Seeded default avatar");
      }
      
      logger.info({ count: defaultAvatars.length }, "Default avatars seeded successfully");
    } else {
      logger.info({ count: existingAvatars.length }, "Avatars already exist in database, skipping seed");
    }
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to seed default avatars");
    // Don't throw - allow server to start even if seeding fails
  }
}