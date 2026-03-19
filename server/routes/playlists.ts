import { Router, Request, Response } from "express";
import { db } from "../db";
import { generatedMedia } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { isAuthenticated } from "../auth";
import * as spotify from "../services/spotify";
import { suggestPlaylistFromConversation } from "../services/playlistGeneration";
import {
  generatePlaylist,
  regeneratePlaylist,
} from "../services/playlistOrchestrator";
import { storage } from "../storage";
import { logger } from "../logger";

const log = logger.child({ route: "playlists" });

export const playlistRouter = Router();

// All routes require authentication
playlistRouter.use(isAuthenticated);

// --- Spotify OAuth ---

// GET /api/spotify/connect — Redirect user to Spotify OAuth
playlistRouter.get("/spotify/connect", (req: Request, res: Response) => {
  if (!spotify.isConfigured()) {
    return res.status(503).json({ message: "Spotify integration not configured" });
  }

  const userId = (req as any).user?.claims?.sub;
  // Encode userId in state for the callback
  const state = Buffer.from(JSON.stringify({ userId })).toString("base64url");
  const url = spotify.getConnectUrl(state);
  res.json({ url });
});

// GET /api/spotify/callback — Handle Spotify OAuth callback
playlistRouter.get("/spotify/callback", async (req: Request, res: Response) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      log.warn({ error }, "Spotify OAuth denied");
      return res.redirect("/?spotify=denied");
    }

    if (!code || !state) {
      return res.status(400).json({ message: "Missing code or state" });
    }

    // Decode userId from state
    const stateData = JSON.parse(
      Buffer.from(state as string, "base64url").toString(),
    );
    const userId = stateData.userId;
    if (!userId) {
      return res.status(400).json({ message: "Invalid state" });
    }

    const tokens = await spotify.exchangeCode(code as string);
    await spotify.saveTokens(
      userId,
      tokens.access_token,
      tokens.refresh_token,
      tokens.expires_in,
    );

    log.info({ userId }, "Spotify connected successfully");

    // Redirect back to the app with success indicator
    const appBase = process.env.APP_BASE_URL || "";
    res.redirect(`${appBase}/dashboard/videos?spotify=connected`);
  } catch (err) {
    log.error({ err }, "Spotify callback failed");
    res.redirect("/?spotify=error");
  }
});

// GET /api/spotify/status — Check if user has Spotify connected
playlistRouter.get("/spotify/status", async (req: Request, res: Response) => {
  const userId = (req as any).user?.claims?.sub;
  const connected = await spotify.isConnected(userId);
  res.json({ connected, configured: spotify.isConfigured() });
});

// POST /api/spotify/disconnect — Disconnect Spotify
playlistRouter.post("/spotify/disconnect", async (req: Request, res: Response) => {
  const userId = (req as any).user?.claims?.sub;
  await spotify.disconnectUser(userId);
  res.json({ success: true });
});

// --- Playlist suggestion ---

// POST /api/avatar/playlist-suggestion — Check if a playlist should be suggested
playlistRouter.post(
  "/avatar/playlist-suggestion",
  async (req: Request, res: Response) => {
    try {
      let { conversationContext, avatarId } = req.body;

      // If no context provided but avatarId given, fetch from server-side conversation history
      if (!conversationContext && avatarId) {
        const userId = (req as any).user?.claims?.sub;
        if (userId) {
          const history = await storage.getConversationHistory(userId, avatarId, 10);
          if (history && history.length > 0) {
            conversationContext = history
              .map((m: any) => `${m.role}: ${m.text}`)
              .join("\n");
          }
        }
      }

      if (!conversationContext) {
        return res.json({ shouldSuggest: false, suggestedType: "", rationale: "", defaultDuration: 30, energyCurve: "" });
      }

      const suggestion =
        await suggestPlaylistFromConversation(conversationContext);

      res.json(suggestion);
    } catch (err) {
      log.error({ err }, "Playlist suggestion failed");
      res.status(500).json({ message: "Failed to analyze conversation" });
    }
  },
);

// --- Playlist generation ---

// POST /api/playlists/generate — Generate a full playlist
playlistRouter.post(
  "/playlists/generate",
  async (req: Request, res: Response) => {
    const userId = (req as any).user?.claims?.sub;

    try {
      let {
        conversationContext,
        avatarName,
        avatarId,
        conversationId,
        overrideGoal,
        overrideDuration,
        overrideMood,
      } = req.body;

      // If no conversationContext but avatarId provided, fetch from server
      if (!conversationContext && avatarId && userId) {
        const history = await storage.getConversationHistory(userId, avatarId, 10);
        if (history && history.length > 0) {
          conversationContext = history
            .map((m: any) => `${m.role}: ${m.text}`)
            .join("\n");
        }
      }

      // Derive avatarName from avatarId if not provided
      if (!avatarName && avatarId) {
        avatarName = avatarId.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      }

      if (!conversationContext || !avatarName) {
        return res.status(400).json({
          message: "conversationContext and avatarName are required",
        });
      }

      const result = await generatePlaylist({
        userId,
        conversationContext,
        avatarName,
        conversationId,
        overrideGoal,
        overrideDuration: overrideDuration ? Number(overrideDuration) : undefined,
        overrideMood,
      });

      res.json(result);
    } catch (err) {
      log.error({ err }, "Playlist generation failed");
      res.status(500).json({ message: "Failed to generate playlist" });
    }
  },
);

// --- My Media ---

// GET /api/my-media — Get all user's generated media (playlists, etc.)
playlistRouter.get("/my-media", async (req: Request, res: Response) => {
  const userId = (req as any).user?.claims?.sub;
  const type = req.query.type as string | undefined;

  try {
    let query = db
      .select()
      .from(generatedMedia)
      .where(eq(generatedMedia.userId, userId))
      .orderBy(desc(generatedMedia.createdAt));

    const items = await query;

    // Filter by type client-side if specified (simpler than dynamic where)
    const filtered = type ? items.filter((i) => i.type === type) : items;

    res.json(filtered);
  } catch (err) {
    log.error({ err }, "Failed to fetch media items");
    res.status(500).json({ message: "Failed to fetch media" });
  }
});

// GET /api/my-media/:id — Get single media item detail
playlistRouter.get("/my-media/:id", async (req: Request, res: Response) => {
  const userId = (req as any).user?.claims?.sub;

  try {
    const [item] = await db
      .select()
      .from(generatedMedia)
      .where(
        and(
          eq(generatedMedia.id, req.params.id),
          eq(generatedMedia.userId, userId),
        ),
      );

    if (!item) {
      return res.status(404).json({ message: "Media item not found" });
    }

    res.json(item);
  } catch (err) {
    log.error({ err }, "Failed to fetch media item");
    res.status(500).json({ message: "Failed to fetch media item" });
  }
});

// POST /api/my-media/:id/regenerate — Create a new version of a playlist
playlistRouter.post(
  "/my-media/:id/regenerate",
  async (req: Request, res: Response) => {
    const userId = (req as any).user?.claims?.sub;

    try {
      const result = await regeneratePlaylist(req.params.id, userId);
      res.json(result);
    } catch (err) {
      log.error({ err }, "Playlist regeneration failed");
      res.status(500).json({ message: "Failed to regenerate playlist" });
    }
  },
);

// DELETE /api/my-media/:id — Delete a media item
playlistRouter.delete("/my-media/:id", async (req: Request, res: Response) => {
  const userId = (req as any).user?.claims?.sub;

  try {
    const [item] = await db
      .select()
      .from(generatedMedia)
      .where(
        and(
          eq(generatedMedia.id, req.params.id),
          eq(generatedMedia.userId, userId),
        ),
      );

    if (!item) {
      return res.status(404).json({ message: "Media item not found" });
    }

    await db.delete(generatedMedia).where(eq(generatedMedia.id, req.params.id));
    res.json({ success: true });
  } catch (err) {
    log.error({ err }, "Failed to delete media item");
    res.status(500).json({ message: "Failed to delete media item" });
  }
});
