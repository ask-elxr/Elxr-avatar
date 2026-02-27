import { logger } from "./logger.js";

interface SessionInfo {
  userId: string;
  avatarId: string;
  startTime: number;
  lastActivity: number;
  liveAvatarSessionToken?: string; // LiveAvatar session token for proper cleanup
}

interface AvatarSwitchInfo {
  lastSwitchTime: number;
  avatarId: string;
}

interface CompletedSession {
  sessionId: string;
  userId: string;
  avatarId: string;
  startTime: number;
  endTime: number;
  durationMs: number;
}

class SessionManager {
  private activeSessions: Map<string, SessionInfo> = new Map();
  private avatarSwitches: Map<string, AvatarSwitchInfo> = new Map();
  private completedSessions: CompletedSession[] = [];
  
  private readonly MAX_CONCURRENT_SESSIONS_PER_USER = 2;
  private readonly AVATAR_SWITCH_COOLDOWN_MS = 1000; // 1 second - just enough to prevent accidental double-clicks
  private readonly SESSION_TIMEOUT_MS = 900000; // 15 minutes of inactivity - allows users to watch/listen without active messaging
  private readonly MAX_HISTORY_LENGTH = 1000; // Keep last 1000 completed sessions

  constructor() {
    setInterval(() => this.cleanupInactiveSessions(), 60000);
  }

  private cleanupInactiveSessions() {
    const now = Date.now();
    let cleanedCount = 0;
    const usersToCheck = new Set<string>();

    for (const [sessionId, session] of Array.from(this.activeSessions.entries())) {
      if (now - session.lastActivity > this.SESSION_TIMEOUT_MS) {
        this.activeSessions.delete(sessionId);
        usersToCheck.add(session.userId);
        cleanedCount++;
        logger.info({
          env: process.env.NODE_ENV || "production",
          service: "session-manager",
          operation: "cleanup",
          sessionId,
          userId: session.userId,
          inactivityMs: now - session.lastActivity,
        }, "Cleaned up inactive session");
      }
    }

    // Clear avatar switch cooldown only for users with no remaining active sessions
    for (const userId of Array.from(usersToCheck)) {
      const hasOtherSessions = Array.from(this.activeSessions.values()).some(
        s => s.userId === userId
      );
      if (!hasOtherSessions) {
        this.avatarSwitches.delete(userId);
      }
    }

    if (cleanedCount > 0) {
      logger.info({
        env: process.env.NODE_ENV || "production",
        service: "session-manager",
        operation: "cleanup",
        cleanedCount,
        remainingCount: this.activeSessions.size,
      }, "Session cleanup completed");
    }
  }

  canStartSession(userId: string): { allowed: boolean; reason?: string; currentCount?: number } {
    // First, force cleanup of any inactive sessions for this user
    const now = Date.now();
    const userSessionIds: string[] = [];
    let cleanedAny = false;
    
    for (const [sessionId, session] of Array.from(this.activeSessions.entries())) {
      if (session.userId === userId) {
        // Check if session is inactive (older than timeout threshold)
        if (now - session.lastActivity > this.SESSION_TIMEOUT_MS) {
          this.activeSessions.delete(sessionId);
          cleanedAny = true;
          logger.info({
            env: process.env.NODE_ENV || "production",
            service: "session-manager",
            operation: "forceCleanup",
            sessionId,
            userId: session.userId,
            inactivityMs: now - session.lastActivity,
          }, "Force cleaned up inactive session before new session start");
        } else {
          userSessionIds.push(sessionId);
        }
      }
    }
    
    // Clear avatar switch cooldown only if user has no remaining active sessions
    if (cleanedAny && userSessionIds.length === 0) {
      this.avatarSwitches.delete(userId);
    }

    // Now check if user has reached the limit with active sessions only
    if (userSessionIds.length >= this.MAX_CONCURRENT_SESSIONS_PER_USER) {
      return {
        allowed: false,
        reason: `Maximum ${this.MAX_CONCURRENT_SESSIONS_PER_USER} concurrent sessions reached`,
        currentCount: userSessionIds.length,
      };
    }

    return { allowed: true, currentCount: userSessionIds.length };
  }

  canSwitchAvatar(userId: string, newAvatarId: string): { allowed: boolean; reason?: string; remainingCooldownMs?: number } {
    const switchInfo = this.avatarSwitches.get(userId);
    
    if (!switchInfo) {
      return { allowed: true };
    }

    if (switchInfo.avatarId === newAvatarId) {
      return { allowed: true };
    }

    const now = Date.now();
    const timeSinceLastSwitch = now - switchInfo.lastSwitchTime;

    if (timeSinceLastSwitch < this.AVATAR_SWITCH_COOLDOWN_MS) {
      const remainingCooldownMs = this.AVATAR_SWITCH_COOLDOWN_MS - timeSinceLastSwitch;
      return {
        allowed: false,
        reason: `Please wait ${Math.ceil(remainingCooldownMs / 1000)} seconds before switching avatars`,
        remainingCooldownMs,
      };
    }

    return { allowed: true };
  }

  startSession(sessionId: string, userId: string, avatarId: string): void {
    const now = Date.now();
    
    this.activeSessions.set(sessionId, {
      userId,
      avatarId,
      startTime: now,
      lastActivity: now,
    });

    this.avatarSwitches.set(userId, {
      lastSwitchTime: now,
      avatarId,
    });

    logger.info({
      env: process.env.NODE_ENV || "production",
      service: "session-manager",
      operation: "startSession",
      sessionId,
      userId,
      avatarId,
      activeSessionCount: this.activeSessions.size,
    }, "Session started");
  }

  /**
   * Store LiveAvatar session token for a session (for proper cleanup)
   */
  setLiveAvatarSessionToken(sessionId: string, token: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.liveAvatarSessionToken = token;
      logger.debug({
        env: process.env.NODE_ENV || "production",
        service: "session-manager",
        operation: "setLiveAvatarToken",
        sessionId,
        hasToken: !!token,
      }, "LiveAvatar session token stored");
    }
  }

  /**
   * Get LiveAvatar session token for a session
   */
  getLiveAvatarSessionToken(sessionId: string): string | undefined {
    const session = this.activeSessions.get(sessionId);
    return session?.liveAvatarSessionToken;
  }

  /**
   * Get all LiveAvatar session tokens for a user (for cleanup when switching avatars)
   */
  getUserLiveAvatarSessionTokens(userId: string): string[] {
    const tokens: string[] = [];
    for (const session of Array.from(this.activeSessions.values())) {
      if (session.userId === userId && session.liveAvatarSessionToken) {
        tokens.push(session.liveAvatarSessionToken);
      }
    }
    return tokens;
  }

  updateActivity(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
    }
  }

  updateActivityByUserId(userId: string): void {
    const now = Date.now();
    for (const session of Array.from(this.activeSessions.values())) {
      if (session.userId === userId) {
        session.lastActivity = now;
      }
    }
  }

  endSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      this.activeSessions.delete(sessionId);
      
      // Clear avatar switch cooldown only if user has no other active sessions
      const hasOtherSessions = Array.from(this.activeSessions.values()).some(
        s => s.userId === session.userId
      );
      if (!hasOtherSessions) {
        this.avatarSwitches.delete(session.userId);
      }
      
      const endTime = Date.now();
      const duration = endTime - session.startTime;
      
      this.completedSessions.push({
        sessionId,
        userId: session.userId,
        avatarId: session.avatarId,
        startTime: session.startTime,
        endTime,
        durationMs: duration,
      });

      if (this.completedSessions.length > this.MAX_HISTORY_LENGTH) {
        this.completedSessions.shift();
      }
      
      logger.info({
        env: process.env.NODE_ENV || "production",
        service: "session-manager",
        operation: "endSession",
        sessionId,
        userId: session.userId,
        avatarId: session.avatarId,
        durationMs: duration,
        activeSessionCount: this.activeSessions.size,
      }, "Session ended");
    }
  }

  endAllUserSessions(userId: string): void {
    const userSessions = Array.from(this.activeSessions.entries())
      .filter(([_, session]) => session.userId === userId);
    
    for (const [sessionId, _] of userSessions) {
      this.endSession(sessionId);
    }
    
    // Clear avatar switch cooldown
    this.avatarSwitches.delete(userId);
    
    logger.info({
      env: process.env.NODE_ENV || "production",
      service: "session-manager",
      operation: "endAllUserSessions",
      userId,
      sessionsEnded: userSessions.length,
    }, "All user sessions ended");
  }

  getActiveSessionCount(userId?: string): number {
    if (userId) {
      return Array.from(this.activeSessions.values()).filter(
        (session) => session.userId === userId
      ).length;
    }
    return this.activeSessions.size;
  }

  getSessionStats() {
    const userSessionCounts = new Map<string, number>();
    const avatarSessionCounts = new Map<string, number>();
    const now = Date.now();
    let totalDurationMs = 0;
    let longestSessionMs = 0;
    
    for (const session of Array.from(this.activeSessions.values())) {
      const userCount = userSessionCounts.get(session.userId) || 0;
      userSessionCounts.set(session.userId, userCount + 1);
      
      const avatarCount = avatarSessionCounts.get(session.avatarId) || 0;
      avatarSessionCounts.set(session.avatarId, avatarCount + 1);
      
      const sessionDuration = now - session.startTime;
      totalDurationMs += sessionDuration;
      longestSessionMs = Math.max(longestSessionMs, sessionDuration);
    }

    const avgDurationMs = this.activeSessions.size > 0 
      ? totalDurationMs / this.activeSessions.size 
      : 0;

    return {
      totalActiveSessions: this.activeSessions.size,
      uniqueUsers: userSessionCounts.size,
      maxConcurrentPerUser: this.MAX_CONCURRENT_SESSIONS_PER_USER,
      avatarSwitchCooldownSeconds: this.AVATAR_SWITCH_COOLDOWN_MS / 1000,
      sessionTimeoutMinutes: this.SESSION_TIMEOUT_MS / 60000,
      userSessionCounts: Object.fromEntries(userSessionCounts),
      avatarSessionCounts: Object.fromEntries(avatarSessionCounts),
      metrics: {
        avgDurationMs: Math.round(avgDurationMs),
        avgDurationMinutes: (avgDurationMs / 60000).toFixed(2),
        longestSessionMs,
        longestSessionMinutes: (longestSessionMs / 60000).toFixed(2),
        totalDurationMs,
        totalDurationMinutes: (totalDurationMs / 60000).toFixed(2),
      },
    };
  }

  getSessionHistory(limit: number = 100) {
    const recentSessions = this.completedSessions.slice(-limit);
    
    const avatarDurations = new Map<string, number>();
    const avatarCounts = new Map<string, number>();
    let totalDuration = 0;

    for (const session of recentSessions) {
      const avatarDuration = avatarDurations.get(session.avatarId) || 0;
      avatarDurations.set(session.avatarId, avatarDuration + session.durationMs);
      
      const avatarCount = avatarCounts.get(session.avatarId) || 0;
      avatarCounts.set(session.avatarId, avatarCount + 1);
      
      totalDuration += session.durationMs;
    }

    return {
      totalCompleted: this.completedSessions.length,
      recentCount: recentSessions.length,
      recentSessions: recentSessions.map(s => ({
        ...s,
        durationMinutes: (s.durationMs / 60000).toFixed(2),
      })),
      perAvatarStats: Array.from(avatarDurations.entries()).map(([avatarId, durationMs]) => ({
        avatarId,
        count: avatarCounts.get(avatarId) || 0,
        totalDurationMs: durationMs,
        totalDurationMinutes: (durationMs / 60000).toFixed(2),
        avgDurationMs: Math.round(durationMs / (avatarCounts.get(avatarId) || 1)),
        avgDurationMinutes: (durationMs / 60000 / (avatarCounts.get(avatarId) || 1)).toFixed(2),
      })),
      summary: {
        totalDurationMs: totalDuration,
        totalDurationMinutes: (totalDuration / 60000).toFixed(2),
        avgDurationMs: recentSessions.length > 0 ? Math.round(totalDuration / recentSessions.length) : 0,
        avgDurationMinutes: recentSessions.length > 0 ? (totalDuration / 60000 / recentSessions.length).toFixed(2) : "0.00",
      },
    };
  }
}

export const sessionManager = new SessionManager();
