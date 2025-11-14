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
import { getAvatarById } from "../shared/avatarConfig.js";
import { multiAssistantService } from "./multiAssistantService.js";
import { sessionManager } from "./sessionManager.js";

export async function registerRoutes(app: Express): Promise<Server> {
  // Create circuit breaker for HeyGen API
  const heygenTokenBreaker = wrapServiceCall(
    async (apiKey: string) => {
      const response = await fetch(
        "https://api.heygen.com/v1/streaming.create_token",
        {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
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
  // HeyGen API token endpoint for Streaming SDK
  app.post("/api/heygen/token", async (req, res) => {
    const log = logger.child({ service: "heygen", operation: "createToken" });

    try {
      const { userId, avatarId } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
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
      const data = await heygenTokenBreaker.execute(apiKey);
      const duration = Date.now() - startTime;

      log.info("HeyGen token created successfully");

      const sessionId = `session_${userId}_${Date.now()}`;
      sessionManager.startSession(sessionId, userId, avatarId || 'unknown');

      storage.logApiCall({
        serviceName: 'heygen',
        endpoint: 'streaming.create_token',
        userId: null,
        responseTimeMs: duration,
      }).catch((error) => {
        log.error({ error: error.message }, 'Failed to log API call');
      });

      res.json({
        token: data.data?.token || data.token,
        sessionId,
        ...data,
      });
    } catch (error: any) {
      log.error({ error: error.message }, "Error creating HeyGen token");
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

      // Step 1: Get Claude response with knowledge base context
      const currentDate = new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      
      const personalityWithDate = `${avatarConfig.personalityPrompt.replace(/- Today's date:.*/, `- Today's date: ${currentDate}`)}`
        .replace(/⚠️ CRITICAL SYSTEM CONFIGURATION:/, `⚠️ CRITICAL SYSTEM CONFIGURATION:\n- Today's date: ${currentDate}`);

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

      // Generate Claude response
      const claudeResponseResult = await claudeService.generateEnhancedResponse(
        message,
        knowledgeContext,
        personalityWithDate,
        userId || undefined,
        "",
      );

      const responseText = typeof claudeResponseResult === 'string' 
        ? claudeResponseResult 
        : (claudeResponseResult?.text || "");
      
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

      const stats = await pineconeService.getStats(targetIndex);
      res.json({
        success: true,
        stats,
        indexName: targetIndex || PineconeIndexName.AVATAR_CHAT,
      });
    } catch (error) {
      console.error("Error getting Pinecone stats:", error);
      res.status(500).json({
        error: "Failed to get Pinecone stats",
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

  // Get avatar response with Claude Sonnet 4 + Google Search + Knowledge Base + Mem0 Memory
  app.get("/api/avatar/config/:avatarId", async (req, res) => {
    try {
      const { avatarId } = req.params;
      
      // Try to load from database first
      let avatarConfig = await storage.getAvatar(avatarId);
      
      // Fallback to default avatars if not found in DB
      if (!avatarConfig) {
        const { getAvatarById } = await import("@shared/avatarConfig");
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
      const { getActiveAvatars } = await import("@shared/avatarConfig");
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

  // NOTE: This endpoint is intentionally NOT protected by isAuthenticated
  // to allow both authenticated and anonymous users to use the avatar
  app.post("/api/avatar/response", async (req: any, res) => {
    try {
      const {
        message,
        conversationHistory = [],
        avatarPersonality,
        useWebSearch = false,
        avatarId = "mark-kohl",
      } = req.body;

      // Get userId from authenticated session if available, or allow temp_ prefixed IDs for anonymous users
      let userId = req.user?.claims?.sub || null;
      if (!userId && req.body.userId?.startsWith('temp_')) {
        userId = req.body.userId;
      }

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Update session activity to prevent premature cleanup
      if (userId) {
        sessionManager.updateActivityByUserId(userId);
      }

      let mem0Context = "";
      if (userId) {
        try {
          const { mem0Service } = await import("./mem0Service.js");
          const memories = await mem0Service.searchMemories(userId, message, 3);
          if (memories && memories.length > 0) {
            mem0Context =
              "\n\nRELEVANT MEMORIES FROM PREVIOUS CONVERSATIONS:\n" +
              memories.map((m) => `- ${m.memory}`).join("\n");
          }
        } catch (memError) {
          console.error("Error fetching Mem0 memories:", memError);
          // Continue without memories if there's an error
        }
      }

      // Get avatar configuration
      const { getAvatarById } = await import("@shared/avatarConfig");
      const avatarConfig = getAvatarById(avatarId);
      
      if (!avatarConfig) {
        return res.status(404).json({ error: "Avatar not found" });
      }

      const currentDate = new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      
      const personalityWithDate = `${avatarConfig.personalityPrompt.replace(/- Today's date:.*/, `- Today's date: ${currentDate}`)}`
        .replace(/⚠️ CRITICAL SYSTEM CONFIGURATION:/, `⚠️ CRITICAL SYSTEM CONFIGURATION:\n- Today's date: ${currentDate}`);

      const personalityPrompt = avatarPersonality || personalityWithDate;

      // Enhanced personality prompt with Mem0 context
      const enhancedPersonality = mem0Context
        ? `${personalityPrompt}\n\n${mem0Context}\n\nUse these memories naturally in your response when relevant, but don't explicitly mention "I remember" unless it flows naturally.`
        : personalityPrompt;

      // Get knowledge base context from Pinecone using avatar-specific namespaces + user's personal knowledge sources
      const { pineconeNamespaceService } = await import(
        "./pineconeNamespaceService.js"
      );
      let knowledgeContext = "";

      // Combine avatar namespaces with user's personal knowledge source namespaces
      let allNamespaces = [...avatarConfig.pineconeNamespaces];
      
      if (userId && !userId.startsWith('temp_')) {
        try {
          const userSources = await storage.listKnowledgeSources(userId);
          const activeSourceNamespaces = userSources
            .filter(source => source.status === 'active' && (source.itemsCount || 0) > 0)
            .map(source => source.pineconeNamespace);
          allNamespaces = [...allNamespaces, ...activeSourceNamespaces];
        } catch (error) {
          console.error('Error fetching user knowledge sources:', error);
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
          console.log(
            `📚 Knowledge context retrieved for ${avatarId} (${knowledgeContext.length} chars) from ${allNamespaces.length} namespaces`,
          );
        }
      }

      // DISABLED: Web search (speeds up responses - only using Claude + Pinecone now)
      let webSearchResults = "";
      // if (useWebSearch || googleSearchService.shouldUseWebSearch(message)) {
      //   if (googleSearchService.isAvailable()) {
      //     webSearchResults = await googleSearchService.search(message, 3);
      //   }
      // }

      // Generate response using Claude Sonnet 4 with all context
      let aiResponse: string;

      if (claudeService.isAvailable()) {
        // Use Claude Sonnet 4 with Mark Kohl personality
        const enhancedConversationHistory = conversationHistory.map(
          (msg: any) => ({
            message: msg.message,
            isUser: msg.isUser,
          }),
        );

        if (webSearchResults) {
          aiResponse = await claudeService.generateEnhancedResponse(
            message,
            knowledgeContext,
            webSearchResults,
            enhancedConversationHistory,
            enhancedPersonality, // Pass enhanced personality with memories
          );
        } else {
          aiResponse = await claudeService.generateResponse(
            message,
            knowledgeContext,
            enhancedConversationHistory,
            enhancedPersonality, // Pass enhanced personality with memories
          );
        }
      } else {
        // Fallback to knowledge base only
        aiResponse =
          knowledgeContext ||
          "I'm here to help, but I don't have specific information about that topic right now.";
      }

      if (userId) {
        try {
          const { mem0Service } = await import('./mem0Service.js');
          // Store both the user's message and the AI's response
          const conversationText = `User asked: "${message}"\nAssistant responded: "${aiResponse}"`;
          await mem0Service.addMemory(userId, conversationText, {
            timestamp: new Date().toISOString(),
            hasKnowledgeBase: !!knowledgeContext,
            hasWebSearch: !!webSearchResults
          });
        } catch (memError) {
          console.error('Error storing Mem0 memory:', memError);
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
        hasMemories: !!mem0Context,
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
        } = req.body;

        if (!message) {
          return res.status(400).json({
            error: "Message is required",
          });
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

        let aiResponse: string;

        // Use Claude Sonnet if available, otherwise fallback to basic context response
        if (claudeService.isAvailable()) {
          if (webSearchResults) {
            aiResponse = await claudeService.generateEnhancedResponse(
              message,
              context,
              webSearchResults,
              conversationHistory,
            );
          } else {
            aiResponse = await claudeService.generateResponse(
              message,
              context,
              conversationHistory,
            );
          }
        } else {
          // Fallback response when Claude is not available
          const contextInfo = context
            ? `Based on the knowledge base: ${context.substring(0, 500)}...`
            : "";
          const webInfo = webSearchResults
            ? `\n\nCurrent information: ${webSearchResults.substring(0, 300)}...`
            : "";
          aiResponse = `${contextInfo}${webInfo}\n\nI can provide information from the knowledge base${webSearchResults ? " and current web results" : ""}, but for advanced AI conversation capabilities, Claude Sonnet integration is needed.`;
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

  const httpServer = createServer(app);
  return httpServer;
}

// Avatar seeding function - populates database with default avatars if empty
export async function seedDefaultAvatars(): Promise<void> {
  try {
    const existingAvatars = await storage.listAvatars(false);
    
    if (existingAvatars.length === 0) {
      const { defaultAvatars } = await import("@shared/avatarConfig");
      
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
