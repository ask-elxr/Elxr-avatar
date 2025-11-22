import { Router } from 'express';
import type { Request, Response } from 'express';
import { spawn } from 'child_process';
import { logger } from '../logger.js';
import { isAuthenticated } from '../replitAuth.js';

export const pipecatRouter = Router();

interface Avatar {
  id: string;
  name: string;
  voice_id: string;
  max_video_duration_minutes: number;
  knowledge_bases: string[];
}

// Avatar configurations (synced with Python pipecat_bot.py)
const AVATARS: Record<string, Avatar> = {
  "mark-kohl": {
    id: "mark-kohl",
    name: "Mark Kohl",
    voice_id: "00967b2f-88a6-4a31-8153-110a92134b9f",
    max_video_duration_minutes: 5,
    knowledge_bases: ["mark-kohl", "general-knowledge"],
  },
  "willie-gault": {
    id: "willie-gault",
    name: "Willie Gault",
    voice_id: "a0e99841-438c-4a64-b679-ae501e7d6091",
    max_video_duration_minutes: 5,
    knowledge_bases: ["willie-gault", "sports-knowledge"],
  },
  "fitness-coach": {
    id: "fitness-coach",
    name: "Fitness Coach",
    voice_id: "b7d50908-b17c-442d-ad8d-810c63997ed9",
    max_video_duration_minutes: 3,
    knowledge_bases: ["fitness-knowledge", "health-tips"],
  },
};

/**
 * Get list of available Pipecat avatars
 * @route GET /api/pipecat/avatars
 */
pipecatRouter.get("/avatars", async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      avatars: Object.values(AVATARS),
    });
  } catch (error: any) {
    logger.error({ error: error.message }, "Error fetching Pipecat avatars");
    res.status(500).json({ error: "Failed to fetch avatars" });
  }
});

/**
 * Get specific avatar configuration
 * @route GET /api/pipecat/avatars/:id
 */
pipecatRouter.get("/avatars/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const avatar = AVATARS[id];
    
    if (!avatar) {
      return res.status(404).json({ error: "Avatar not found" });
    }
    
    res.json({
      success: true,
      avatar,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, "Error fetching avatar");
    res.status(500).json({ error: "Failed to fetch avatar" });
  }
});

/**
 * Start a Pipecat session with specific avatar
 * @route POST /api/pipecat/session/start
 */
pipecatRouter.post("/session/start", async (req: any, res: Response) => {
  try {
    const { avatarId = "mark-kohl", userId, roomUrl } = req.body;
    
    if (!AVATARS[avatarId]) {
      return res.status(400).json({ error: "Invalid avatar ID" });
    }
    
    if (!roomUrl) {
      return res.status(400).json({ error: "Room URL is required" });
    }
    
    logger.info({ 
      avatarId, 
      userId: userId || req.user?.claims?.sub,
      roomUrl 
    }, "Starting Pipecat session");
    
    // Spawn Python Pipecat bot process
    const pythonProcess = spawn('python', [
      'server/pipecat_bot.py',
      '--room-url', roomUrl,
      '--avatar-id', avatarId,
    ], {
      env: {
        ...process.env,
        AVATAR_ID: avatarId,
      }
    });
    
    pythonProcess.stdout.on('data', (data) => {
      logger.info({ source: 'pipecat', avatarId }, data.toString());
    });
    
    pythonProcess.stderr.on('data', (data) => {
      logger.error({ source: 'pipecat', avatarId }, data.toString());
    });
    
    pythonProcess.on('close', (code) => {
      logger.info({ avatarId, exitCode: code }, 'Pipecat process exited');
    });
    
    res.json({
      success: true,
      message: "Pipecat session started",
      avatarId,
      roomUrl,
      config: AVATARS[avatarId],
    });
  } catch (error: any) {
    logger.error({ error: error.message }, "Error starting Pipecat session");
    res.status(500).json({ error: "Failed to start session" });
  }
});

/**
 * Get session status
 * @route GET /api/pipecat/session/status/:sessionId
 */
pipecatRouter.get("/session/status/:sessionId", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    
    // TODO: Implement session tracking with Redis or in-memory store
    res.json({
      success: true,
      sessionId,
      status: "active",
      message: "Session tracking to be implemented",
    });
  } catch (error: any) {
    logger.error({ error: error.message }, "Error fetching session status");
    res.status(500).json({ error: "Failed to fetch session status" });
  }
});

/**
 * Update avatar configuration (admin only)
 * @route PUT /api/pipecat/avatars/:id
 * @access Authenticated users
 */
pipecatRouter.put("/avatars/:id", isAuthenticated, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    if (!AVATARS[id]) {
      return res.status(404).json({ error: "Avatar not found" });
    }
    
    // Update avatar configuration
    // TODO: Persist to database
    Object.assign(AVATARS[id], updates);
    
    logger.info({ avatarId: id, updates }, "Avatar configuration updated");
    
    res.json({
      success: true,
      avatar: AVATARS[id],
    });
  } catch (error: any) {
    logger.error({ error: error.message }, "Error updating avatar");
    res.status(500).json({ error: "Failed to update avatar" });
  }
});
