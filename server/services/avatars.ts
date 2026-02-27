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
 * Convert pinecone namespace names to display-friendly tags
 * e.g., "addiction" -> "Addiction", "personal-development" -> "Personal Development"
 */
function namespaceToTag(namespace: string): string {
  return namespace
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Generate display tags from pineconeNamespaces
 * Filters out personal names/generic namespaces and takes top categories for display
 */
function generateDisplayTags(namespaces: string[]): string[] {
  if (!namespaces || namespaces.length === 0) return [];
  
  // List of namespaces to exclude from display tags (personal names, generic, etc.)
  const excludePatterns = [
    /^[a-z]+$/i, // Single lowercase words that might be names (like "shawn", "willie")
  ];
  
  // Specific known topic categories to prioritize
  const topicCategories = new Set([
    'addiction', 'body', 'transitions', 'science', 'nutrition', 'longevity',
    'midlife', 'work', 'mind', 'sexuality', 'spirituality', 'psychedelics',
    'life', 'grief', 'movement', 'sleep', 'leadership', 'performance',
    'personal-development', 'health', 'wellness', 'fitness', 'sports',
    'business', 'career', 'relationships', 'mental-health', 'education'
  ]);
  
  // Filter and sort: prioritize known topic categories
  const filteredNamespaces = namespaces.filter(ns => {
    const lower = ns.toLowerCase();
    // Keep if it's a known topic category
    if (topicCategories.has(lower)) return true;
    // Keep if it has a hyphen/underscore (likely a compound topic)
    if (ns.includes('-') || ns.includes('_')) return true;
    // Exclude if it's all uppercase (likely a category) but not in the set
    if (ns === ns.toUpperCase() && ns.length > 2) return true;
    return false;
  });
  
  // Take up to 5 tags for better coverage of categories
  return filteredNamespaces.slice(0, 5).map(namespaceToTag);
}

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
  // Handle namespaces safely - use nullish coalescing for proper null/undefined handling
  const mergedNamespaces = dbAvatar.pineconeNamespaces ?? defaultAvatar.pineconeNamespaces ?? [];
  
  return {
    ...defaultAvatar,
    ...dbAvatar,
    // DB values take absolute precedence (including null, empty string, false)
    // Only fallback to default if DB value is undefined
    // Exception: profileImageUrl falls back to default if null OR undefined
    profileImageUrl: (dbAvatar.profileImageUrl !== undefined && dbAvatar.profileImageUrl !== null) ? dbAvatar.profileImageUrl : defaultAvatar.profileImageUrl,
    heygenAvatarId: dbAvatar.heygenAvatarId !== undefined ? dbAvatar.heygenAvatarId : defaultAvatar.heygenAvatarId,
    heygenVideoAvatarId: dbAvatar.heygenVideoAvatarId !== undefined ? dbAvatar.heygenVideoAvatarId : defaultAvatar.heygenVideoAvatarId,
    heygenVoiceId: dbAvatar.heygenVoiceId !== undefined ? dbAvatar.heygenVoiceId : defaultAvatar.heygenVoiceId,
    heygenVideoVoiceId: dbAvatar.heygenVideoVoiceId !== undefined ? dbAvatar.heygenVideoVoiceId : (defaultAvatar as any).heygenVideoVoiceId,
    heygenKnowledgeId: dbAvatar.heygenKnowledgeId !== undefined ? dbAvatar.heygenKnowledgeId : defaultAvatar.heygenKnowledgeId,
    elevenlabsVoiceId: dbAvatar.elevenlabsVoiceId !== undefined ? dbAvatar.elevenlabsVoiceId : defaultAvatar.elevenlabsVoiceId,
    audioOnlyVoiceId: (dbAvatar as any).audioOnlyVoiceId !== undefined ? (dbAvatar as any).audioOnlyVoiceId : (defaultAvatar as any).audioOnlyVoiceId,
    liveAvatarVoiceId: (dbAvatar as any).liveAvatarVoiceId !== undefined ? (dbAvatar as any).liveAvatarVoiceId : (defaultAvatar as any).liveAvatarVoiceId,
    interactiveVoiceSource: (dbAvatar as any).interactiveVoiceSource !== undefined ? (dbAvatar as any).interactiveVoiceSource : (defaultAvatar as any).interactiveVoiceSource,
    voiceRate: dbAvatar.voiceRate !== undefined ? dbAvatar.voiceRate : defaultAvatar.voiceRate,
    pineconeNamespaces: mergedNamespaces,
    personalityPrompt: dbAvatar.personalityPrompt !== undefined ? dbAvatar.personalityPrompt : defaultAvatar.personalityPrompt,
    isActive: dbAvatar.isActive !== undefined ? dbAvatar.isActive : defaultAvatar.isActive,
    // Research source toggles - DB values take precedence
    usePubMed: dbAvatar.usePubMed !== undefined ? dbAvatar.usePubMed : defaultAvatar.usePubMed,
    useWikipedia: dbAvatar.useWikipedia !== undefined ? dbAvatar.useWikipedia : defaultAvatar.useWikipedia,
    useGoogleSearch: dbAvatar.useGoogleSearch !== undefined ? dbAvatar.useGoogleSearch : defaultAvatar.useGoogleSearch,
    // Auto-generate display tags from pinecone namespaces
    tags: generateDisplayTags(mergedNamespaces),
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
 * Get avatars that can generate videos (have valid video avatar IDs)
 * Uses heygenVideoAvatarId field which contains Instant Avatar IDs for video generation
 */
export async function getVideoCapableAvatars(): Promise<AvatarProfile[]> {
  const allAvatars = await getActiveAvatars();
  // Return avatars that have a valid video avatar ID
  // This includes both Instant Avatars and public avatars
  return allAvatars.filter(avatar => 
    avatar.heygenVideoAvatarId && avatar.heygenVideoAvatarId.trim().length > 0
  );
}

// Re-export types and constants for convenience
export { defaultAvatars, type AvatarProfile };
