/**
 * Authentication Service
 * 
 * Centralized service for authentication and authorization.
 * Wrapper around Replit Auth.
 */

import { setupAuth, isAuthenticated } from '../replitAuth.js';
import type { Express, Request } from 'express';

/**
 * Setup authentication for the Express app
 */
export async function initializeAuth(app: Express): Promise<void> {
  await setupAuth(app);
}

/**
 * Get user ID from authenticated request
 */
export function getUserIdFromRequest(req: any): string | null {
  try {
    if (req.user?.claims?.sub) {
      return req.user.claims.sub;
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Get user key (authenticated userId or session ID fallback)
 */
export function getUserKey(req: any, sessionId?: string): string {
  const userId = getUserIdFromRequest(req);
  if (userId) {
    return userId;
  }
  
  // Fall back to session ID for anonymous users
  return sessionId || `anon_${Date.now()}`;
}

// Re-export middleware and utilities
export { isAuthenticated };
