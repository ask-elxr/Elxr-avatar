interface HeyGenConfig {
  apiKey: string;
  avatarId: string;
  voiceId: string;
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
      const memberstackId = localStorage.getItem('memberstack_id') || new URLSearchParams(window.location.search).get('member_id');
      const adminSecret = localStorage.getItem('admin_secret') || new URLSearchParams(window.location.search).get('admin_secret');
      const authHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (memberstackId) authHeaders['X-Member-Id'] = memberstackId;
      if (adminSecret) authHeaders['X-Admin-Secret'] = adminSecret;
      const response = await fetch("/api/heygen/token", {
        method: "POST",
        headers: authHeaders,
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch access token: ${response.statusText}`);
      }

      const data: CreateTokenResponse = await response.json();
      return data.data.token;
    } catch (error) {
      console.error("Error fetching access token:", error);
      throw new Error("Failed to authenticate with HeyGen service");
    }
  }

  async initializeAvatar(): Promise<any> {
    try {
      // Dynamically import the HeyGen SDK
      const {
        default: StreamingAvatar,
        AvatarQuality,
        VoiceEmotion,
      } = await import("@heygen/streaming-avatar");

      const token = await this.fetchAccessToken();
      this.streamingAvatar = new StreamingAvatar({ token });

      // Build config - only include voice if we have a specific voiceId
      const avatarStartConfig: any = {
        quality: AvatarQuality.High,
        avatarName: this.config.avatarId,
        knowledgeBase: undefined,
        knowledgeId: undefined,
        useSilencePrompt: false,
        language: "en",
        disableIdleTimeout: true,
      };
      
      // Only set voice if we have a valid voice ID
      if (this.config.voiceId && this.config.voiceId !== "default") {
        avatarStartConfig.voice = {
          voiceId: this.config.voiceId,
          rate: 1.0,
          emotion: VoiceEmotion.FRIENDLY,
        };
      }
      
      const sessionInfo = await this.streamingAvatar.createStartAvatar(avatarStartConfig);

      return { avatar: this.streamingAvatar, sessionInfo };
    } catch (error) {
      console.error("Error initializing avatar:", error);
      throw new Error("Failed to initialize avatar session");
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
        console.error("Error stopping avatar:", error);
      }
    }
  }
}

// Create service instance with environment variables
// ❌ CRITICAL: No knowledgeId - we use Pinecone + Claude instead of HeyGen's AI
export const heygenService = new HeyGenService({
  apiKey: import.meta.env.VITE_HEYGEN_API_KEY || "",
  avatarId:
    import.meta.env.VITE_HEYGEN_AVATAR_ID || "7e01e5d4e06149c9ba3c1728fa8f03d0",
  voiceId: import.meta.env.VITE_HEYGEN_VOICE_ID || "default",
});
