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
  onVideoReady?: () => void; // Called when LiveKit video track is attached and playing
}

/**
 * LiveAvatarDriver - Uses the new HeyGen LiveAvatar SDK for streaming avatar sessions
 * In CUSTOM mode, video is streamed through LiveKit room, not through the SDK
 */
export class LiveAvatarDriver implements SessionDriver {
  private session: LiveAvatarSession | null = null;
  private config: DriverConfig;
  private currentAudio: HTMLAudioElement | null = null;
  private useElevenLabsVoice: boolean = true; // Always use ElevenLabs in CUSTOM mode
  private languageCode: string = "en";
  private sessionId: string | null = null;
  private videoAttached: boolean = false;
  private audioContext: AudioContext | null = null;

  constructor(config: DriverConfig) {
    this.config = config;
    this.languageCode = config.languageCode || "en";
    
    console.log(`🎙️ LiveAvatarDriver: CUSTOM mode - Using ElevenLabs voice with SDK lip-sync for ${config.avatarConfig.name || config.avatarId}`);
  }

  async start(): Promise<void> {
    console.log("🚀 LiveAvatarDriver.start() called for:", this.config.avatarId);
    
    // Fetch session credentials from the backend
    const { sessionId, sessionToken } = await this.fetchSessionCredentials();
    this.sessionId = sessionId;
    
    console.log("📋 Creating LiveAvatar session:", { sessionId, hasToken: !!sessionToken });
    
    // Create LiveAvatarSession with sessionAccessToken and config
    // SDK signature: new LiveAvatarSession(sessionAccessToken: string, config?: SessionConfig)
    // The SDK handles LiveKit connection internally when session.start() is called
    const session = new LiveAvatarSession(sessionToken, {
      voiceChat: false, // Disable SDK's voice chat - we use our own Claude + ElevenLabs pipeline
      apiUrl: "https://api.liveavatar.com",
    });
    this.session = session;

    // Listen for stream ready event - this is when we attach the video element
    session.on(SessionEvent.SESSION_STREAM_READY, () => {
      console.log("🎬 LiveAvatar SESSION_STREAM_READY event received");
      // Use SDK's attach() method to connect video element
      if (this.config.videoRef.current && this.session) {
        console.log("📺 Attaching video element via session.attach()...");
        this.session.attach(this.config.videoRef.current);
        this.videoAttached = true;
        this.config.onStreamReady?.();
        this.config.onVideoReady?.();
        console.log("✅ Video element attached via SDK - stream should be visible");
      } else {
        console.warn("⚠️ Cannot attach video - ref or session not available");
      }
    });

    // Listen for session state changes
    session.on(SessionEvent.SESSION_STATE_CHANGED, (state: SessionState) => {
      console.log("📊 LiveAvatar session state:", state);
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

    // Start the session - SDK handles LiveKit connection internally
    console.log("🔄 Calling session.start() - SDK will connect to LiveKit...");
    await session.start();
    console.log("✅ session.start() completed - waiting for SESSION_STREAM_READY event");
    
    // Mute the video element since we play ElevenLabs audio separately
    if (this.config.videoRef.current) {
      this.config.videoRef.current.muted = true;
    }
    console.log("✅ LiveAvatar session started - CUSTOM mode with Claude + RAG + ElevenLabs");
  }

  async stop(): Promise<void> {
    this.stopCurrentAudio();
    this.videoAttached = false;
    
    // Clean up audio context
    if (this.audioContext) {
      try {
        await this.audioContext.close();
      } catch (e) {
        // Ignore
      }
      this.audioContext = null;
    }
    
    // Stop the LiveAvatar session - SDK handles LiveKit disconnection internally
    if (this.session) {
      console.log("📵 Stopping LiveAvatar session...");
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

    // In CUSTOM mode, get ElevenLabs audio and send to SDK for lip-sync
    console.log("🎙️ CUSTOM mode: Getting ElevenLabs audio for lip-sync");
    
    // Mute the video element to prevent echo (audio comes from our own playback)
    if (this.config.videoRef.current) {
      this.config.videoRef.current.muted = true;
    }
    
    await this.playElevenLabsWithLipSync(text, languageCodeOverride);
  }

  /**
   * Play ElevenLabs audio locally AND send base64 audio to SDK for lip-sync
   * Uses session.repeatAudio(base64) to animate avatar lips
   */
  private async playElevenLabsWithLipSync(text: string, languageCodeOverride?: string): Promise<void> {
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
      const arrayBuffer = await audioBlob.arrayBuffer();
      
      // Convert to base64 for SDK's repeatAudio() method
      const base64Audio = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      
      // Send audio to SDK for lip-sync animation
      if (this.session) {
        console.log("🎤 Sending audio to SDK for lip-sync (repeatAudio)...");
        this.session.repeatAudio(base64Audio);
      }
      
      // Also play audio locally through speakers
      // Create AudioContext if needed
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }
      
      // Resume AudioContext if suspended (browser autoplay policy)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      // Decode and play the audio
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer.slice(0));
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      
      // Track the source for stopping
      (source as any)._isPlaying = true;
      this.currentAudio = source as any;
      
      // Handle audio end
      source.onended = () => {
        console.log("🔊 Audio playback ended");
        this.config.onAvatarStopTalking?.();
      };
      
      // Start playback
      source.start(0);
      console.log("🔊 Playing ElevenLabs audio with SDK lip-sync");
      this.config.onAvatarStartTalking?.();
      
    } catch (error) {
      console.error("Error playing ElevenLabs audio:", error);
    }
  }

  private stopCurrentAudio(): void {
    if (this.currentAudio) {
      try {
        // Handle AudioBufferSourceNode
        if ((this.currentAudio as unknown as { _isPlaying?: boolean })._isPlaying) {
          (this.currentAudio as unknown as AudioBufferSourceNode).stop();
        } else if (typeof (this.currentAudio as unknown as { pause?: () => void }).pause === 'function') {
          // Handle HTMLAudioElement (fallback)
          (this.currentAudio as unknown as HTMLAudioElement).pause();
        }
      } catch (e) {
        // AudioBufferSourceNode.stop() throws if already stopped
      }
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
    console.log("🔑 Fetching LiveAvatar session credentials for:", this.config.avatarId);
    
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
      const errorText = await response.text();
      console.error("❌ LiveAvatar API error:", response.status, errorText);
      throw new Error(`Failed to fetch LiveAvatar session credentials: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log("📦 LiveAvatar session credentials received:", {
      sessionId: data.session_id,
      hasToken: !!data.session_token,
      mode: data.mode
    });
    
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
