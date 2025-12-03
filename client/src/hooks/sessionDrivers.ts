import StreamingAvatar, {
  AvatarQuality,
  StreamingEvents,
  TaskType,
  ElevenLabsModel,
} from "@heygen/streaming-avatar";

export interface SessionDriver {
  start(): Promise<void>;
  stop(): Promise<void>;
  speak(text: string, languageCode?: string): Promise<void>;
  interrupt(): Promise<void>;
  supportsVoiceInput(): boolean;
  setLanguage?(languageCode: string): void;
}

interface DriverConfig {
  avatarConfig: any;
  audioOnly: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  avatarId: string;
  userId: string;
  languageCode?: string;
  onStreamReady?: () => void;
  onStreamDisconnected?: () => void;
  onAvatarStartTalking?: () => void;
  onAvatarStopTalking?: () => void;
  onUserMessage?: (message: string) => void;
}

export class HeyGenDriver implements SessionDriver {
  private avatar: StreamingAvatar | null = null;
  private config: DriverConfig;
  private currentAudio: HTMLAudioElement | null = null;
  private useElevenLabsVoice: boolean = false;
  private languageCode: string = "en";

  constructor(config: DriverConfig) {
    this.config = config;
    this.languageCode = config.languageCode || "en";
    
    // Use ElevenLabs when avatar has ElevenLabs voice but no HeyGen voice
    // This provides voice consistency between audio-only and video modes for avatars like Shawn, Judy, Kelsey
    this.useElevenLabsVoice = !config.avatarConfig.heygenVoiceId && 
                              !!config.avatarConfig.elevenlabsVoiceId;
    
    if (this.useElevenLabsVoice) {
      console.log(`🎙️ HeyGenDriver: Using ElevenLabs voice for ${config.avatarConfig.name || config.avatarId} (no HeyGen voice configured)`);
    } else {
      console.log(`🎙️ HeyGenDriver: Using HeyGen voice for ${config.avatarConfig.name || config.avatarId}`);
    }
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

    // Always wire up HeyGen talking events - HeyGen SDK handles both native voices
    // and ElevenLabs voices with lip-sync, so events come from HeyGen
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

    const avatarStartConfig: any = {
      quality: this.config.audioOnly ? AvatarQuality.Low : AvatarQuality.High,
      avatarName: this.config.avatarConfig.heygenAvatarId,
      language: "en",
      disableIdleTimeout: true,
    };
    
    // Configure voice: use HeyGen voice ID if available, otherwise use ElevenLabs voice via HeyGen
    if (this.config.avatarConfig.heygenVoiceId) {
      // Use HeyGen's native voice
      avatarStartConfig.voice = {
        voiceId: this.config.avatarConfig.heygenVoiceId,
        rate: parseFloat(this.config.avatarConfig.voiceRate || "1.0"),
      };
      console.log(`🎙️ HeyGenDriver: Using HeyGen native voice: ${this.config.avatarConfig.heygenVoiceId}`);
    } else if (this.config.avatarConfig.elevenlabsVoiceId) {
      // Use ElevenLabs voice through HeyGen SDK - this enables lip-sync with ElevenLabs audio
      avatarStartConfig.voice = {
        voiceId: this.config.avatarConfig.elevenlabsVoiceId,
        rate: parseFloat(this.config.avatarConfig.voiceRate || "1.0"),
        model: ElevenLabsModel.eleven_multilingual_v2,
        elevenlabsSettings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      };
      console.log(`🎙️ HeyGenDriver: Using ElevenLabs voice via HeyGen SDK: ${this.config.avatarConfig.elevenlabsVoiceId} (lip-sync enabled)`);
    }
    
    await avatar.createStartAvatar(avatarStartConfig);
    
    if (this.useElevenLabsVoice) {
      console.log("✅ HeyGen avatar started with ElevenLabs voice integration (HeyGen SDK handles TTS + lip-sync)");
    }
  }

  async stop(): Promise<void> {
    this.stopCurrentAudio();
    if (this.avatar) {
      await this.avatar.stopAvatar().catch(console.error);
      this.avatar = null;
    }
  }

  setLanguage(languageCode: string): void {
    this.languageCode = languageCode;
    console.log(`🌐 HeyGenDriver language set to: ${languageCode}`);
  }

  async speak(text: string, languageCodeOverride?: string): Promise<void> {
    if (this.avatar) {
      // Use HeyGen's speak method - this works with both native HeyGen voices 
      // and ElevenLabs voices configured via the SDK (both get lip-sync)
      await this.avatar.speak({
        text,
        task_type: TaskType.REPEAT,
      });
    }
  }

  private async speakWithElevenLabs(text: string, languageCodeOverride?: string): Promise<void> {
    try {
      this.stopCurrentAudio();
      this.config.onAvatarStartTalking?.();

      const response = await fetch("/api/elevenlabs/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          avatarId: this.config.avatarId || this.config.avatarConfig.id,
          languageCode: languageCodeOverride || this.languageCode,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate ElevenLabs TTS audio");
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
      console.error("Error playing ElevenLabs TTS:", error);
      this.config.onAvatarStopTalking?.();
    }
  }

  private stopCurrentAudio(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
      this.config.onAvatarStopTalking?.();
    }
  }

  async interrupt(): Promise<void> {
    this.stopCurrentAudio();
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
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: this.config.userId,
        avatarId: this.config.avatarId,
      }),
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

  isUsingElevenLabsVoice(): boolean {
    return this.useElevenLabsVoice;
  }
}

export class AudioOnlyDriver implements SessionDriver {
  private config: DriverConfig;
  private currentAudio: HTMLAudioElement | null = null;
  private avatarId: string;
  private languageCode: string;

  constructor(config: DriverConfig, avatarId: string, languageCode: string = "en") {
    this.config = config;
    this.avatarId = avatarId;
    this.languageCode = languageCode;
  }

  async start(): Promise<void> {
    console.log("Audio-only mode started - no HeyGen session created");
  }

  async stop(): Promise<void> {
    this.stopCurrentAudio();
  }

  setLanguage(languageCode: string): void {
    this.languageCode = languageCode;
    console.log(`🌐 AudioOnlyDriver language set to: ${languageCode}`);
  }

  async speak(text: string, languageCodeOverride?: string): Promise<void> {
    try {
      this.stopCurrentAudio();

      this.config.onAvatarStartTalking?.();

      const response = await fetch("/api/elevenlabs/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          avatarId: this.avatarId,
          languageCode: languageCodeOverride || this.languageCode,
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
