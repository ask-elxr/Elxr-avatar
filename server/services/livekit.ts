import { AccessToken } from 'livekit-server-sdk';
import { logger } from '../logger.js';

interface LiveKitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

interface RoomTokenParams {
  roomName: string;
  participantName: string;
  participantIdentity: string;
  ttl?: number; // Time to live in seconds
}

/**
 * LiveKit service for generating room access tokens
 * Used with LiveAvatar CUSTOM mode for video streaming
 */
export class LiveKitService {
  private config: LiveKitConfig | null = null;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    const url = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (url && apiKey && apiSecret) {
      this.config = { url, apiKey, apiSecret };
      logger.info({
        service: 'livekit',
        operation: 'initialize',
        url: url.substring(0, 30) + '...',
      }, 'LiveKit service initialized');
    } else {
      logger.warn({
        service: 'livekit',
        operation: 'initialize',
        hasUrl: !!url,
        hasApiKey: !!apiKey,
        hasApiSecret: !!apiSecret,
      }, 'LiveKit service not configured - missing environment variables');
    }
  }

  isConfigured(): boolean {
    return this.config !== null;
  }

  getUrl(): string | null {
    return this.config?.url || null;
  }

  /**
   * Generate a room access token for a participant
   * @param params - Room and participant configuration
   * @returns Access token string
   */
  async generateRoomToken(params: RoomTokenParams): Promise<string> {
    if (!this.config) {
      throw new Error('LiveKit service not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.');
    }

    const { roomName, participantName, participantIdentity, ttl = 3600 } = params;

    const token = new AccessToken(this.config.apiKey, this.config.apiSecret, {
      identity: participantIdentity,
      name: participantName,
      ttl,
    });

    // Grant permissions for the room
    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const jwt = await token.toJwt();

    logger.debug({
      service: 'livekit',
      operation: 'generateRoomToken',
      roomName,
      participantIdentity,
      ttl,
    }, 'Generated LiveKit room token');

    return jwt;
  }

  /**
   * Generate LiveKit config for LiveAvatar CUSTOM mode
   * @param userId - User identifier for the participant
   * @param avatarId - Avatar identifier for room naming
   * @returns LiveKit configuration for LiveAvatar API
   */
  async generateLiveAvatarConfig(userId: string, avatarId: string): Promise<{
    livekit_url: string;
    livekit_room: string;
    livekit_client_token: string;
  }> {
    if (!this.config) {
      throw new Error('LiveKit service not configured');
    }

    // Create unique room name for this session
    const roomName = `liveavatar-${avatarId}-${userId}-${Date.now()}`;
    
    // Generate token for the user to join the room
    const clientToken = await this.generateRoomToken({
      roomName,
      participantName: `User-${userId}`,
      participantIdentity: `user-${userId}`,
      ttl: 7200, // 2 hours
    });

    logger.debug({
      service: 'livekit',
      operation: 'generateLiveAvatarConfig',
      roomName,
      userId,
      avatarId,
    }, 'Generated LiveAvatar LiveKit config');

    return {
      livekit_url: this.config.url,
      livekit_room: roomName,
      livekit_client_token: clientToken,
    };
  }
}

// Singleton instance
export const liveKitService = new LiveKitService();
