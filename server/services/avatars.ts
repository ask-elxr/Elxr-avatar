/**
 * Avatar Service
 * 
 * Centralized service for avatar configuration and management.
 * Re-exports avatar helper functions from config.
 */

import { 
  defaultAvatars, 
  getDefaultAvatarById, 
  getActiveDefaultAvatars,
  type AvatarProfile 
} from '../../config/avatars.config.js';
import { storage } from '../storage.js';

/**
 * Merge a single avatar record: DB fields override default fields
 * Only falls back to defaults when DB value is null/undefined, NOT empty string
 */
function mergeSingleAvatar(dbAvatar: AvatarProfile | undefined, defaultAvatar: AvatarProfile | undefined): AvatarProfile | null {
  // If no default and no DB, return null
  if (!defaultAvatar && !dbAvatar) {
    return null;
  }
  
  // If only default exists, return it
  if (!dbAvatar) {
    return defaultAvatar!;
  }
  
  // If only DB exists, return it
  if (!defaultAvatar) {
    return dbAvatar;
  }
  
  // Merge: start with default, overlay DB fields
  // Use nullish coalescing (??) to only fallback when undefined/null, not empty strings
  return {
    ...defaultAvatar,
    ...dbAvatar,
    // DB values take absolute precedence (including null, empty string, false)
    // Only fallback to default if DB value is undefined
    // Exception: profileImageUrl falls back to default if null OR undefined
    profileImageUrl: (dbAvatar.profileImageUrl !== undefined && dbAvatar.profileImageUrl !== null) ? dbAvatar.profileImageUrl : defaultAvatar.profileImageUrl,
    heygenAvatarId: dbAvatar.heygenAvatarId !== undefined ? dbAvatar.heygenAvatarId : defaultAvatar.heygenAvatarId,
    heygenVoiceId: dbAvatar.heygenVoiceId !== undefined ? dbAvatar.heygenVoiceId : defaultAvatar.heygenVoiceId,
    heygenKnowledgeId: dbAvatar.heygenKnowledgeId !== undefined ? dbAvatar.heygenKnowledgeId : defaultAvatar.heygenKnowledgeId,
    elevenlabsVoiceId: dbAvatar.elevenlabsVoiceId !== undefined ? dbAvatar.elevenlabsVoiceId : defaultAvatar.elevenlabsVoiceId,
    voiceRate: dbAvatar.voiceRate !== undefined ? dbAvatar.voiceRate : defaultAvatar.voiceRate,
    pineconeNamespaces: dbAvatar.pineconeNamespaces !== undefined ? dbAvatar.pineconeNamespaces : defaultAvatar.pineconeNamespaces,
    personalityPrompt: dbAvatar.personalityPrompt !== undefined ? dbAvatar.personalityPrompt : defaultAvatar.personalityPrompt,
    isActive: dbAvatar.isActive !== undefined ? dbAvatar.isActive : defaultAvatar.isActive,
  };
}

/**
 * Get avatar by ID (merges DB override with default base)
 */
export async function getAvatarById(avatarId: string): Promise<AvatarProfile | null> {
  const defaultAvatar = getDefaultAvatarById(avatarId);
  
  try {
    const dbAvatar = await storage.getAvatar(avatarId);
    return mergeSingleAvatar(dbAvatar, defaultAvatar);
  } catch (error) {
    // If DB lookup fails, return default
    return defaultAvatar || null;
  }
}

/**
 * Merge DB avatars with defaults, doing field-level merging
 */
function mergeAvatars(dbAvatars: AvatarProfile[], defaults: AvatarProfile[]): AvatarProfile[] {
  const dbMap = new Map(dbAvatars.map(a => [a.id, a] as const));
  const defaultMap = new Map(defaults.map(a => [a.id, a] as const));
  const result: AvatarProfile[] = [];
  
  // Get all unique IDs from both sources
  const dbIds = Array.from(dbMap.keys());
  const defaultIds = Array.from(defaultMap.keys());
  const allIds = new Set([...dbIds, ...defaultIds]);
  const allIdsArray = Array.from(allIds);
  
  // Merge each avatar
  for (const id of allIdsArray) {
    const merged = mergeSingleAvatar(dbMap.get(id), defaultMap.get(id));
    if (merged) {
      result.push(merged);
    }
  }
  
  return result;
}

/**
 * Get all active avatars (merges DB and defaults, then filters by isActive)
 */
export async function getActiveAvatars(): Promise<AvatarProfile[]> {
  try {
    // Get ALL avatars from database (both active and inactive)
    // This ensures we see DB overrides that deactivate defaults
    const allDbAvatars = await storage.listAvatars(false);
    const allDefaults = defaultAvatars;
    
    // Merge DB avatars with defaults (DB overrides defaults, including isActive)
    const merged = mergeAvatars(allDbAvatars, allDefaults);
    
    // NOW filter by isActive after merging (respects DB overrides)
    return merged.filter(a => a.isActive === true);
  } catch (error) {
    // If DB lookup fails, return default active avatars
    return getActiveDefaultAvatars();
  }
}

/**
 * Get all avatars (merges DB and defaults, including inactive)
 */
export async function getAllAvatars(): Promise<AvatarProfile[]> {
  try {
    const dbAvatars = await storage.listAvatars(false);
    
    // Merge DB avatars with all defaults (DB overrides defaults)
    return mergeAvatars(dbAvatars, defaultAvatars);
  } catch (error) {
    // If DB lookup fails, return defaults
    return defaultAvatars;
  }
}

/**
 * Get avatars that can generate videos (have valid HeyGen avatar IDs)
 * IMPORTANT: Only "_public" suffix avatars work for video generation
 * Custom avatars work for interactive streaming but NOT for video generation
 */
export async function getVideoCapableAvatars(): Promise<AvatarProfile[]> {
  const allAvatars = await getActiveAvatars();
  // Only return avatars with HeyGen IDs that end with "_public"
  // These are the named avatars accessible for VIDEO GENERATION with this HeyGen subscription
  // Note: Custom avatars work for streaming but NOT for video generation
  return allAvatars.filter(avatar => 
    avatar.heygenAvatarId && avatar.heygenAvatarId.endsWith('_public')
  );
}

// Re-export types and constants for convenience
export { defaultAvatars, type AvatarProfile };
