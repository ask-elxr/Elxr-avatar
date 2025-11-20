import { Router } from 'express';
import type { Request, Response } from 'express';
import { logger } from '../logger.js';
import { storage } from '../storage.js';
import { isAuthenticated } from '../replitAuth.js';
import { getActiveAvatars, getAvatarById, getAllAvatars } from '../services/avatars.js';
import { insertAvatarProfileSchema, updateAvatarProfileSchema } from '@shared/schema';

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
