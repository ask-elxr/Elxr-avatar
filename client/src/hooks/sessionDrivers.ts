import StreamingAvatar, {
  AvatarQuality,
  StreamingEvents,
  TaskType,
} from "@heygen/streaming-avatar";

export interface SessionDriver {
  start(): Promise<void>;
  stop(): Promise<void>;
  speak(text: string): Promise<void>;
  interrupt(): Promise<void>;
  supportsVoiceInput(): boolean;
}

interface DriverConfig {
  avatarConfig: any;
  audioOnly: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  onStreamReady?: () => void;
  onStreamDisconnected?: () => void;
  onAvatarStartTalking?: () => void;
  onAvatarStopTalking?: () => void;
  onUserMessage?: (message: string) => void;
}

export class HeyGenDriver implements SessionDriver {
  private avatar: StreamingAvatar | null = null;
  private config: DriverConfig;

  constructor(config: DriverConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    const token = await this.fetchAccessToken();
    const avatar = new StreamingAvatar({ token });
    this.avatar = avatar;

    avatar.on(StreamingEvents.STREAM_READY, (event) => {
      console.log("Stream ready:", event.detail);
      if (this.config.videoRef.current) {
        this.config.videoRef.current.srcObject = event.detail;
        this.config.videoRef.current.play().catch(console.error);
      }
      this.config.onStreamReady?.();
    });

    avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
      console.log("Stream disconnected");
      this.config.onStreamDisconnected?.();
    });

    avatar.on(StreamingEvents.AVATAR_START_TALKING, () => {
      this.config.onAvatarStartTalking?.();
    });

    avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
      this.config.onAvatarStopTalking?.();
    });

    avatar.on(StreamingEvents.USER_TALKING_MESSAGE, async (message: any) => {
      const userMessage = message?.detail?.message || message?.message || message;
      if (userMessage && this.config.onUserMessage) {
        this.config.onUserMessage(userMessage);
      }
    });

    await avatar.createStartAvatar({
      quality: this.config.audioOnly ? AvatarQuality.Low : AvatarQuality.High,
      avatarName: this.config.avatarConfig.heygenAvatarId,
      // ❌ CRITICAL: DO NOT pass knowledgeBase - HeyGen's built-in AI bypasses our Claude Sonnet 4.5 backend!
      // When knowledgeBase is set, HeyGen uses its own AI with its own personality instead of routing through our backend
      // knowledgeBase: this.config.avatarConfig.heygenKnowledgeId || undefined,
      voice: this.config.avatarConfig.heygenVoiceId
        ? {
            voiceId: this.config.avatarConfig.heygenVoiceId,
            rate: parseFloat(this.config.avatarConfig.voiceRate || "1.0"),
          }
        : {
            rate: parseFloat(this.config.avatarConfig.voiceRate || "1.0"),
          },
      language: "en",
      disableIdleTimeout: true,
    });

    // ❌ DO NOT call startVoiceChat() - this enables HeyGen's built-in AI which auto-responds!
    // We want HeyGen ONLY for video rendering, not for AI responses
    // Voice input will be handled manually through USER_TALKING_MESSAGE events
    // Then we send the text to our Claude backend and manually call avatar.speak()
    
    /* REMOVED - This was causing HeyGen's AI to respond instead of Claude:
    try {
      console.log("Starting voice chat...");
      await avatar.startVoiceChat();
      console.log("✅ Voice chat started successfully - microphone is active");
    } catch (error) {
      console.error("❌ Failed to start voice chat:", error);
      console.error("This usually means microphone permission was denied or microphone is not available");
      // Voice chat failed but avatar can still work with text input
      // Don't throw error - allow text-only fallback
    }
    */
  }

  async stop(): Promise<void> {
    if (this.avatar) {
      await this.avatar.stopAvatar().catch(console.error);
      this.avatar = null;
    }
  }

  async speak(text: string): Promise<void> {
    if (this.avatar) {
      // ✅ CRITICAL: Use REPEAT (not TALK) - REPEAT just speaks our text, TALK uses HeyGen's AI
      await this.avatar.speak({
        text,
        task_type: TaskType.REPEAT,
      });
    }
  }

  async interrupt(): Promise<void> {
    if (this.avatar) {
      await this.avatar.interrupt().catch(() => {});
    }
  }

  supportsVoiceInput(): boolean {
    return true;
  }

  private async fetchAccessToken(): Promise<string> {
    const response = await fetch("/api/heygen/token", {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error("Failed to fetch access token");
    }

    const data = await response.json();
    return data.token;
  }

  getAvatarInstance(): StreamingAvatar | null {
    return this.avatar;
  }
}

export class AudioOnlyDriver implements SessionDriver {
  private config: DriverConfig;
  private currentAudio: HTMLAudioElement | null = null;
  private avatarId: string;

  constructor(config: DriverConfig, avatarId: string) {
    this.config = config;
    this.avatarId = avatarId;
  }

  async start(): Promise<void> {
    console.log("Audio-only mode started - no HeyGen session created");
  }

  async stop(): Promise<void> {
    this.stopCurrentAudio();
  }

  async speak(text: string): Promise<void> {
    try {
      this.stopCurrentAudio();

      this.config.onAvatarStartTalking?.();

      const response = await fetch("/api/elevenlabs/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          avatarId: this.avatarId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate TTS audio");
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      this.currentAudio = audio;

      audio.onended = () => {
        this.config.onAvatarStopTalking?.();
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
      };

      audio.onerror = () => {
        this.config.onAvatarStopTalking?.();
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
      };

      await audio.play();
    } catch (error) {
      console.error("Error playing TTS:", error);
      this.config.onAvatarStopTalking?.();
    }
  }

  async interrupt(): Promise<void> {
    this.stopCurrentAudio();
  }

  supportsVoiceInput(): boolean {
    return false;
  }

  private stopCurrentAudio(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
      this.config.onAvatarStopTalking?.();
    }
  }
}
