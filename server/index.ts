import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes, seedDefaultAvatars } from "./routes";
import { avatarRouter } from "./routes/avatars.js";
import { coursesRouter } from "./routes/courses.js";
import { moodRouter } from "./routes/mood.js";
import subscriptionRouter from "./routes/subscription.js";
import ingestRouter, { resumeInterruptedJobs } from "./routes/ingest.js";
import { personaRouter } from "./routes/personas.js";
import gamesRouter from "./routes/games.js";
import { requireAdmin, isAuthenticated } from "./replitAuth.js";
import { subscriptionService } from "./services/subscription.js";
import { videoGenerationService } from "./services/videoGeneration.js";
import { chatVideoService } from "./services/chatVideo.js";
import { resumeStuckBatches } from "./ingest/batchPodcastService.js";
import { setupVite, serveStatic, log } from "./vite";
import { latencyCache } from "./cache";
import { isConfigured as isAssetStorageConfigured, getPublicUrl } from "./assetStorage.js";
import path from "path";
import fs from "fs";

const app = express();

// Add memory monitoring and limits
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit immediately, try to gracefully handle it
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit immediately, try to gracefully handle it
});

// Monitor memory usage
const monitorMemory = () => {
  const memUsage = process.memoryUsage();
  const heapUsed = Math.round(memUsage.heapUsed / 1024 / 1024);
  const heapTotal = Math.round(memUsage.heapTotal / 1024 / 1024);
  
  if (heapUsed > 1000) { // Alert if heap usage exceeds 1GB
    console.warn(`High memory usage detected: ${heapUsed}MB / ${heapTotal}MB`);
    if (global.gc) {
      global.gc();
    }
  }
};

// Check memory every 30 seconds
setInterval(monitorMemory, 30000);

// CORS middleware for Webflow embedding and cross-origin requests
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  // Include X-Admin-Secret header for admin access in embedded mode
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Secret, X-User-Id');
  // Allow embedding in any iframe (for Webflow and other sites)
  res.setHeader('Content-Security-Policy', "frame-ancestors *");
  // Remove X-Frame-Options to allow embedding (CSP frame-ancestors takes precedence)
  res.removeHeader('X-Frame-Options');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

app.use(express.json({ limit: '10mb' })); // Limit request size
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Serve attached_assets: redirect to Firebase Storage when configured, local filesystem fallback for dev
if (isAssetStorageConfigured()) {
  app.use('/attached_assets', (req, res) => {
    const filename = decodeURIComponent(req.path.slice(1)); // Remove leading /
    res.redirect(301, getPublicUrl(filename));
  });
  console.log('📁 Serving attached_assets via Google Cloud Storage');
} else {
  const productionAssetsPath = path.resolve(import.meta.dirname, '..', 'attached_assets');
  const devAssetsPath = path.resolve(process.cwd(), 'attached_assets');
  const attachedAssetsPath = fs.existsSync(productionAssetsPath) ? productionAssetsPath : devAssetsPath;
  app.use('/attached_assets', express.static(attachedAssetsPath));
  console.log(`📁 Serving attached_assets from: ${attachedAssetsPath}`);
}

// Serve demo pages directly (before Vite middleware catches them)
// Check multiple locations for production compatibility
const productionPublicPath = path.resolve(import.meta.dirname, '..', 'public');
const devPublicPath = path.resolve(process.cwd(), 'public');
const publicPath = fs.existsSync(productionPublicPath) ? productionPublicPath : devPublicPath;
app.get('/demo/mark-kohl', (req, res) => {
  const filePath = path.join(publicPath, 'demo-mark-kohl.html');
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('Demo page not found');
  }
});
app.use('/demo', express.static(publicPath));
console.log(`📄 Serving demo pages from: ${publicPath}`);

// Health check endpoint - registered early, before any async initialization
// so Railway healthcheck passes as soon as the server binds
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

(async () => {
  const server = await registerRoutes(app);
  
  // Register modular routes
  app.use("/api", avatarRouter);
  app.use("/api/courses", coursesRouter);
  app.use("/api/mood", moodRouter);
  app.use("/api/subscription", subscriptionRouter);
  app.use("/api/admin", ingestRouter);
  app.use("/api/admin", isAuthenticated, personaRouter);
  app.use("/api/games", gamesRouter);
  
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Only send response if headers haven't been sent yet
    if (!res.headersSent) {
      res.status(status).json({ message });
    }

    // Log the error with request context for debugging
    console.error(`Express error on ${req.method} ${req.path}:`, message);
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Start listening FIRST so healthcheck passes, then do heavy initialization
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    ...(process.platform === 'linux' ? { reusePort: true } : {}),
  }, () => {
    log(`serving on port ${port}`);
  });

  // Heavy initialization tasks — run after server is listening
  // These are non-blocking: failures are logged but don't prevent the server from serving
  let dbAvailable = true;

  try {
    await seedDefaultAvatars();
  } catch (error: any) {
    console.warn('⚠️ Failed to seed avatars (database may be unavailable):', error.message);
    dbAvailable = false;
  }

  try {
    await subscriptionService.initializePlans();
  } catch (error: any) {
    console.warn('⚠️ Failed to initialize subscription plans:', error.message);
    dbAvailable = false;
  }

  try {
    await videoGenerationService.recoverStuckVideos();
    videoGenerationService.startBackgroundChecker();
  } catch (error: any) {
    console.warn('⚠️ Failed to initialize video generation service:', error.message);
  }

  try {
    chatVideoService.startBackgroundChecker();
  } catch (error: any) {
    console.warn('⚠️ Failed to start chat video service:', error.message);
  }

  if (!dbAvailable) {
    console.warn('⚠️ Database is currently unavailable. Some features may not work until database connection is restored.');
  }

  latencyCache.invalidatePineconeCache();
  log('💾 Pinecone cache cleared for cache key normalization update');

  try {
    const { wikipediaService } = await import('./wikipediaService.js');
    const { multiAssistantService } = await import('./multiAssistantService.js');

    if (wikipediaService.isAvailable()) {
      log('Syncing Willie Gault Wikipedia page to Pinecone...');
      const metadata = multiAssistantService.getMetadataForMentor('willie-gault');

      const result = await wikipediaService.syncArticleToNamespace(
        'Willie Gault',
        'willie-gault',
        metadata
      );
      if (result.success) {
        log(`✓ Willie Gault Wikipedia page synced successfully with metadata: ${JSON.stringify(metadata)}`);
      } else {
        console.warn(`⚠️  Failed to sync Willie Gault Wikipedia: ${result.message}`);
      }
    } else {
      console.warn('⚠️  Wikipedia service not available - skipping Willie Gault sync');
    }
  } catch (error: any) {
    console.error('Error syncing Willie Gault Wikipedia:', error.message);
  }

  // Delayed recovery tasks
  setTimeout(async () => {
    try {
      const result = await resumeStuckBatches();
      if (result.resumedCount > 0 || result.failedCount > 0) {
        log(`🎙️ Podcast batch recovery: ${result.resumedCount} resumed, ${result.failedCount} failed`);
      }
    } catch (error: any) {
      console.error('Error during podcast batch recovery:', error.message);
    }

    try {
      await resumeInterruptedJobs();
    } catch (error: any) {
      console.error('Error during ingestion job recovery:', error.message);
    }
  }, 5000);
})();
