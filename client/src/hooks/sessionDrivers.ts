import { 
  LiveAvatarSession, 
  SessionEvent, 
  AgentEventsEnum,
  SessionState 
} from "@heygen/liveavatar-web-sdk";

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

/**
 * LiveAvatarDriver - Uses the new HeyGen LiveAvatar SDK for streaming avatar sessions
 * This replaces the older HeyGenDriver that used @heygen/streaming-avatar
 */
export class LiveAvatarDriver implements SessionDriver {
  private session: LiveAvatarSession | null = null;
  private config: DriverConfig;
  private currentAudio: HTMLAudioElement | null = null;
  private useElevenLabsVoice: boolean = false;
  private languageCode: string = "en";
  private sessionId: string | null = null;
  private videoAttached: boolean = false;

  constructor(config: DriverConfig) {
    this.config = config;
    this.languageCode = config.languageCode || "en";
    
    // Use ElevenLabs when avatar has ElevenLabs voice but no HeyGen voice
    // This provides voice consistency between audio-only and video modes for avatars like Shawn, Judy, Kelsey
    this.useElevenLabsVoice = !config.avatarConfig.heygenVoiceId && 
                              !!config.avatarConfig.elevenlabsVoiceId;
    
    if (this.useElevenLabsVoice) {
      console.log(`🎙️ LiveAvatarDriver: Using ElevenLabs voice with lip-sync for ${config.avatarConfig.name || config.avatarId}`);
    } else {
      console.log(`🎙️ LiveAvatarDriver: Using HeyGen voice for ${config.avatarConfig.name || config.avatarId}`);
    }
  }

  private attachVideoElement(): void {
    if (this.videoAttached || !this.session || !this.config.videoRef.current) {
      return;
    }
    
    console.log("🎬 Attaching video element to LiveAvatar session");
    this.session.attach(this.config.videoRef.current);
    this.config.videoRef.current.play().catch(console.error);
    this.videoAttached = true;
    this.config.onStreamReady?.();
  }

  async start(): Promise<void> {
    // Fetch session credentials from the backend
    const { sessionId, sessionToken } = await this.fetchSessionCredentials();
    this.sessionId = sessionId;
    
    console.log("📋 Creating LiveAvatar session:", { sessionId });
    
    // Create LiveAvatarSession with the token
    const session = new LiveAvatarSession(sessionToken, {
      voiceChat: true, // Enable voice chat for voice input
    });
    this.session = session;

    // Listen for stream ready event
    session.on(SessionEvent.SESSION_STREAM_READY, () => {
      console.log("🎬 LiveAvatar SESSION_STREAM_READY event received");
      this.attachVideoElement();
    });

    // Listen for session state changes
    session.on(SessionEvent.SESSION_STATE_CHANGED, (state: SessionState) => {
      console.log("📊 LiveAvatar session state:", state);
      
      // In CUSTOM mode, SESSION_STREAM_READY may not fire, so attach on CONNECTED as fallback
      if (state === SessionState.CONNECTED && !this.videoAttached) {
        console.log("📺 CONNECTED state reached - attempting video attachment (CUSTOM mode fallback)");
        // Small delay to allow SDK to fully initialize the stream
        setTimeout(() => this.attachVideoElement(), 500);
      }
    });

    // Listen for session disconnected
    session.on(SessionEvent.SESSION_DISCONNECTED, (reason) => {
      console.log("📵 LiveAvatar stream disconnected:", reason);
      this.config.onStreamDisconnected?.();
    });

    // Listen for avatar talking events
    session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => {
      console.log("🗣️ Avatar started speaking");
      this.config.onAvatarStartTalking?.();
    });

    session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
      console.log("🤫 Avatar stopped speaking");
      this.config.onAvatarStopTalking?.();
    });

    // Listen for user transcription (voice input)
    session.on(AgentEventsEnum.USER_TRANSCRIPTION, (event) => {
      console.log("🎤 User transcription:", event.text);
      if (event.text && this.config.onUserMessage) {
        this.config.onUserMessage(event.text);
      }
    });

    // Start the session
    await session.start();
    
    if (this.useElevenLabsVoice) {
      console.log("✅ LiveAvatar session started - text-based lip-sync with ElevenLabs audio");
      // Mute the video since we'll play ElevenLabs audio separately
      if (this.config.videoRef.current) {
        this.config.videoRef.current.muted = true;
      }
    } else {
      console.log("✅ LiveAvatar session started - using native HeyGen voice");
    }
  }

  async stop(): Promise<void> {
    this.stopCurrentAudio();
    this.videoAttached = false;
    if (this.session) {
      await this.session.stop();
      this.session = null;
    }
  }

  setLanguage(languageCode: string): void {
    this.languageCode = languageCode;
    console.log(`🌐 LiveAvatarDriver language set to: ${languageCode}`);
  }

  async speak(text: string, languageCodeOverride?: string): Promise<void> {
    if (!this.session) return;

    if (this.useElevenLabsVoice) {
      // For avatars with ElevenLabs voice but no HeyGen voice:
      // 1. Mute HeyGen video to prevent fallback voice from playing
      // 2. Use session.repeat(text) to animate the avatar's lips
      // 3. Play ElevenLabs audio separately for the actual voice
      console.log("🎙️ Using text-based lip-sync with ElevenLabs audio (HeyGen audio muted)");
      
      // Mute the video element to prevent HeyGen's fallback voice from playing
      if (this.config.videoRef.current) {
        this.config.videoRef.current.muted = true;
      }
      
      // Start lip-sync animation from text using repeat (HeyGen will animate)
      this.session.repeat(text);
      
      // Play ElevenLabs audio for the actual voice
      await this.playElevenLabsAudio(text, languageCodeOverride);
    } else {
      // Use LiveAvatar's built-in TTS with lip-sync (for avatars with heygenVoiceId)
      // Ensure video is unmuted for native HeyGen voice
      if (this.config.videoRef.current) {
        this.config.videoRef.current.muted = false;
      }
      
      // Use repeat() to make the avatar speak the text
      this.session.repeat(text);
    }
  }

  /**
   * Play ElevenLabs audio for the avatar's voice
   * This is used alongside session.repeat(text) for text-based lip-sync
   */
  private async playElevenLabsAudio(text: string, languageCodeOverride?: string): Promise<void> {
    try {
      this.stopCurrentAudio();

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
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
      };

      await audio.play();
      console.log("🔊 Playing ElevenLabs audio");
    } catch (error) {
      console.error("Error playing ElevenLabs audio:", error);
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
    if (this.session) {
      this.session.interrupt();
    }
  }

  supportsVoiceInput(): boolean {
    return true;
  }

  private async fetchSessionCredentials(): Promise<{ sessionId: string; sessionToken: string }> {
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
      throw new Error("Failed to fetch LiveAvatar session credentials");
    }

    const data = await response.json();
    return {
      sessionId: data.sessionId || data.session_id,
      sessionToken: data.sessionToken || data.session_token,
    };
  }

  getSessionInstance(): LiveAvatarSession | null {
    return this.session;
  }

  isUsingElevenLabsVoice(): boolean {
    return this.useElevenLabsVoice;
  }
}

// Alias for backwards compatibility
export const HeyGenDriver = LiveAvatarDriver;

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
