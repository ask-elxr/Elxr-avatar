import { Router } from 'express';
import type { Request, Response } from 'express';
import { logger } from '../logger.js';
import { storage } from '../storage.js';
import { isAuthenticated } from '../replitAuth.js';
import { getActiveAvatars, getAvatarById, getAllAvatars, getVideoCapableAvatars } from '../services/avatars.js';
import { insertAvatarProfileSchema, updateAvatarProfileSchema } from '@shared/schema';
import { previewGenerationService } from '../services/previewGeneration.js';
import { getIntroPhrase } from '../config/lineLibrary.js';

export const avatarRouter = Router();

/**
 * Get avatar configuration by ID (merges DB overrides with defaults)
 * @route GET /api/avatar/config/:avatarId
 */
avatarRouter.get("/avatar/config/:avatarId", async (req: Request, res: Response) => {
  try {
    const { avatarId } = req.params;
    
    const avatarConfig = await getAvatarById(avatarId);
    
    if (!avatarConfig) {
      return res.status(404).json({ error: "Avatar not found" });
    }
    
    res.json(avatarConfig);
  } catch (error: any) {
    logger.error({ error: error.message, avatarId: req.params.avatarId }, "Error fetching avatar config");
    res.status(500).json({ error: "Failed to fetch avatar configuration" });
  }
});

/**
 * Get a personalized greeting for an avatar to speak first
 * @route GET /api/avatar/greeting/:avatarId
 */
avatarRouter.get("/avatar/greeting/:avatarId", async (req: Request, res: Response) => {
  try {
    const { avatarId } = req.params;
    
    const greeting = getIntroPhrase(avatarId);
    
    res.json({ greeting });
  } catch (error: any) {
    logger.error({ error: error.message, avatarId: req.params.avatarId }, "Error fetching avatar greeting");
    res.status(500).json({ error: "Failed to fetch greeting" });
  }
});

/**
 * List all active avatars (merges DB overrides with defaults)
 * @route GET /api/avatars
 */
avatarRouter.get("/avatars", async (req: Request, res: Response) => {
  try {
    const avatars = await getActiveAvatars();
    res.json(avatars);
  } catch (error: any) {
    logger.error({ error: error.message }, "Error fetching avatars");
    res.status(500).json({ error: "Failed to fetch avatars" });
  }
});

/**
 * List avatars capable of video generation (have valid HeyGen IDs)
 * @route GET /api/avatars/video-capable
 */
avatarRouter.get("/avatars/video-capable", async (req: Request, res: Response) => {
  try {
    const avatars = await getVideoCapableAvatars();
    res.json(avatars);
  } catch (error: any) {
    logger.error({ error: error.message }, "Error fetching video-capable avatars");
    res.status(500).json({ error: "Failed to fetch video-capable avatars" });
  }
});

/**
 * Get embed configuration for a specific avatar
 * @route GET /api/avatars/:id/embed
 * TODO: Re-enable after extracting multiAssistant service
 */
// avatarRouter.get("/:id/embed", async (req: Request, res: Response) => {
//   try {
//     const { id } = req.params;
//     
//     const embedConfig = multiAssistantService.getEmbedConfig(id);
//     
//     if (!embedConfig) {
//       const availableMentors = multiAssistantService.listMentors().map((m: any) => m.name);
//       return res.status(404).json({ 
//         error: "Mentor not found",
//         availableMentors,
//       });
//     }
//     
//     res.json({
//       mentorId: id,
//       sceneId: embedConfig.sceneId,
//       voiceConfig: embedConfig.voiceConfig,
//       audioOnly: embedConfig.audioOnly,
//       assistantId: embedConfig.assistantId,
//     });
//   } catch (error: any) {
//     logger.error({ error: error.message, mentorId: req.params.id }, "Error fetching embed config");
//     res.status(500).json({ error: "Failed to fetch embed configuration" });
//   }
// });

// TODO: Uncomment and fix the route path
// avatarRouter.get("/avatars/:id/embed", async (req: Request, res: Response) => { ... });

/**
 * List all avatars for admin (includes inactive ones)
 * @route GET /api/admin/avatars
 * @access Authenticated users
 */
avatarRouter.get("/admin/avatars", isAuthenticated, async (req: any, res: Response) => {
  try {
    // Return all avatars including inactive ones for admin view
    const avatars = await getAllAvatars();
    res.json(avatars);
  } catch (error: any) {
    logger.error({ error: error.message }, "Error listing avatars for admin");
    res.status(500).json({ error: "Failed to list avatars" });
  }
});

/**
 * Create a new avatar
 * @route POST /api/admin/avatars
 * @access Authenticated users
 */
avatarRouter.post("/admin/avatars", isAuthenticated, async (req: any, res: Response) => {
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

/**
 * Update an existing avatar
 * @route PUT /api/admin/avatars/:id
 * @access Authenticated users
 */
avatarRouter.put("/admin/avatars/:id", isAuthenticated, async (req: any, res: Response) => {
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

/**
 * Soft delete an avatar (marks as inactive)
 * @route DELETE /api/admin/avatars/:id
 * @access Authenticated users
 */
avatarRouter.delete("/admin/avatars/:id", isAuthenticated, async (req: any, res: Response) => {
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

/**
 * Reorder avatars (change display order)
 * @route POST /api/admin/avatars/reorder
 * @access Authenticated users
 */
avatarRouter.post("/admin/avatars/reorder", isAuthenticated, async (req: any, res: Response) => {
  try {
    const { avatarIds } = req.body;
    
    if (!Array.isArray(avatarIds)) {
      return res.status(400).json({ error: "avatarIds must be an array" });
    }
    
    // Update sort order for each avatar
    for (let i = 0; i < avatarIds.length; i++) {
      await storage.updateAvatar(avatarIds[i], { sortOrder: i });
    }
    
    logger.info({ avatarCount: avatarIds.length }, "Avatars reordered by admin");
    res.json({ success: true, message: "Avatar order updated" });
  } catch (error: any) {
    logger.error({ error: error.message }, "Error reordering avatars");
    res.status(500).json({ error: "Failed to reorder avatars" });
  }
});

/**
 * Generate preview GIF for a specific avatar using HeyGen
 * @route POST /api/admin/avatars/:id/generate-preview
 * @access Authenticated users
 */
avatarRouter.post("/admin/avatars/:id/generate-preview", isAuthenticated, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    
    logger.info({ avatarId: id }, "Starting preview generation for avatar");
    
    const result = await previewGenerationService.generatePreviewForAvatar(id);
    
    if (result.success) {
      res.json({
        success: true,
        avatarId: result.avatarId,
        gifPath: result.gifPath,
        message: "Preview GIF generated successfully",
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || "Failed to generate preview",
      });
    }
  } catch (error: any) {
    logger.error({ error: error.message, avatarId: req.params.id }, "Error generating avatar preview");
    res.status(500).json({ error: "Failed to generate avatar preview" });
  }
});

/**
 * Generate preview GIFs for all avatars that need them
 * @route POST /api/admin/avatars/generate-all-previews
 * @access Authenticated users
 */
avatarRouter.post("/admin/avatars/generate-all-previews", isAuthenticated, async (req: any, res: Response) => {
  try {
    logger.info("Starting preview generation for all missing avatars");
    
    const results = await previewGenerationService.generateAllMissingPreviews();
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    res.json({
      success: true,
      message: `Generated ${successful.length} previews, ${failed.length} failed`,
      results,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, "Error generating all previews");
    res.status(500).json({ error: "Failed to generate previews" });
  }
});
