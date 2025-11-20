/**
 * Memory Service
 * 
 * Centralized service for conversation memory using Mem0.
 * Wrapper around mem0Service for simplified API.
 */

import { memoryService, MemoryType } from '../memoryService.js';

/**
 * Get user-avatar memory snippets
 */
export async function getUserAvatarMemory(
  userKey: string,
  avatarId: string
): Promise<string[]> {
  if (!memoryService.isAvailable()) {
    return [];
  }

  try {
    const result = await memoryService.getAllMemories(`${userKey}::${avatarId}`);
    
    if (result.success && result.memories) {
      return result.memories.map((m: any) => m.memory || m.text || '').filter(Boolean);
    }
    
    return [];
  } catch (error) {
    console.error('Error fetching user-avatar memory:', error);
    return [];
  }
}

/**
 * Add user-avatar memory (fire-and-forget)
 */
export async function addUserAvatarMemory(
  userKey: string,
  avatarId: string,
  message: string,
  answer: string
): Promise<void> {
  if (!memoryService.isAvailable()) {
    return;
  }

  try {
    await memoryService.addMemory(
      `User: ${message}\nAssistant: ${answer}`,
      `${userKey}::${avatarId}`,
      MemoryType.NOTE
    );
  } catch (error) {
    // Silent failure - memory is nice-to-have, not critical
    console.error('Error adding user-avatar memory:', error);
  }
}

/**
 * Get all memories for a user-avatar pair
 */
export async function getAllUserAvatarMemories(
  userKey: string,
  avatarId: string
): Promise<any[]> {
  if (!memoryService.isAvailable()) {
    return [];
  }

  try {
    const result = await memoryService.getAllMemories(`${userKey}::${avatarId}`);
    return result.success && result.memories ? result.memories : [];
  } catch (error) {
    console.error('Error fetching all memories:', error);
    return [];
  }
}

/**
 * Delete all memories for a user-avatar pair
 */
export async function deleteUserAvatarMemories(
  userKey: string,
  avatarId: string
): Promise<void> {
  if (!memoryService.isAvailable()) {
    return;
  }

  try {
    await memoryService.deleteAllMemories(`${userKey}::${avatarId}`);
  } catch (error) {
    console.error('Error deleting memories:', error);
    throw error;
  }
}

// Re-export the full service for advanced use cases
export { memoryService, MemoryType };
