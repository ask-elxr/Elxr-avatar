interface HeyGenConfig {
  apiKey: string;
  avatarId: string;
  voiceId: string;
  knowledgeId?: string;
}

interface CreateTokenResponse {
  data: {
    token: string;
  };
}

export class HeyGenService {
  private config: HeyGenConfig;
  private streamingAvatar: any = null;

  constructor(config: HeyGenConfig) {
    this.config = config;
  }

  async fetchAccessToken(): Promise<string> {
    try {
      const response = await fetch('/api/heygen/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch access token: ${response.statusText}`);
      }

      const data: any = await response.json();
      return data.token;
    } catch (error) {
      console.error('Error fetching access token:', error);
      throw new Error('Failed to authenticate with HeyGen service');
    }
  }

  async initializeAvatar(): Promise<any> {
    try {
      // Dynamically import the HeyGen SDK
      const { default: StreamingAvatar, AvatarQuality, VoiceEmotion } = await import('@heygen/streaming-avatar');
      
      const token = await this.fetchAccessToken();
      this.streamingAvatar = new StreamingAvatar({ token });

      const sessionInfo = await this.streamingAvatar.createStartAvatar({
        quality: AvatarQuality.High,
        avatarName: this.config.avatarId,
        knowledgeId: this.config.knowledgeId,
        voice: {
          voiceId: this.config.voiceId,
          rate: 1.0,
          emotion: VoiceEmotion.FRIENDLY
        },
        language: 'en',
        disableIdleTimeout: true
      });

      return { avatar: this.streamingAvatar, sessionInfo };
    } catch (error) {
      console.error('Error initializing avatar:', error);
      throw new Error('Failed to initialize avatar session');
    }
  }

  getAvatar() {
    return this.streamingAvatar;
  }

  async stopAvatar(): Promise<void> {
    if (this.streamingAvatar) {
      try {
        await this.streamingAvatar.stopAvatar();
        this.streamingAvatar = null;
      } catch (error) {
        console.error('Error stopping avatar:', error);
      }
    }
  }
}

// Create service instance with environment variables
export const heygenService = new HeyGenService({
  apiKey: import.meta.env.VITE_HEYGEN_API_KEY || '',
  avatarId: import.meta.env.VITE_HEYGEN_AVATAR_ID || '7e01e5d4e06149c9ba3c1728fa8f03d0',
  voiceId: import.meta.env.VITE_HEYGEN_VOICE_ID || 'default',
  knowledgeId: import.meta.env.VITE_HEYGEN_KNOWLEDGE_ID || 'edb04cb8e7b44b6fb0cd73a3edd4bca4'
});
