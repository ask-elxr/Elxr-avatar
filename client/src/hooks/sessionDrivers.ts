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
  private useHeygenVoice: boolean = false; // Toggle between HeyGen voice (repeat) and ElevenLabs voice (repeatAudio)
  private languageCode: string = "en";
  private sessionId: string | null = null;
  private videoAttached: boolean = false;
  private audioContext: AudioContext | null = null;

  constructor(config: DriverConfig) {
    this.config = config;
    this.languageCode = config.languageCode || "en";
    
    // Check avatar config for voice source preference
    this.useHeygenVoice = config.avatarConfig?.useHeygenVoiceForLive === true;
    
    const voiceSource = this.useHeygenVoice ? "HeyGen voice (session.repeat)" : "ElevenLabs voice (session.repeatAudio)";
    console.log(`🎙️ LiveAvatarDriver: CUSTOM mode - Using ${voiceSource} for ${config.avatarConfig.name || config.avatarId}`);
  }

  /**
   * Attach video element with retry logic
   * Sometimes the video element isn't rendered yet when SESSION_STREAM_READY fires
   */
  private attachVideoWithRetry(retriesLeft: number): void {
    if (this.videoAttached) {
      console.log("✅ Video already attached, skipping");
      return;
    }

    if (this.config.videoRef.current && this.session) {
      console.log("📺 Attaching video element via session.attach()...");
      try {
        this.session.attach(this.config.videoRef.current);
        this.videoAttached = true;
        this.config.onStreamReady?.();
        this.config.onVideoReady?.();
        console.log("✅ Video element attached via SDK - stream should be visible");
        
        // Force video element to play with audio enabled
        // SDK handles audio through WebRTC - don't mute!
        const videoEl = this.config.videoRef.current;
        videoEl.muted = false; // SDK handles audio through WebRTC stream
        videoEl.play().catch(err => {
          console.warn("⚠️ Video autoplay prevented:", err.message || err);
          // If autoplay is blocked, try muted first then unmute
          videoEl.muted = true;
          videoEl.play().then(() => {
            // Unmute after playback starts
            setTimeout(() => {
              videoEl.muted = false;
            }, 100);
          }).catch(e => console.error("Video play failed:", e));
        });
        
        // Log video state for debugging
        setTimeout(() => {
          if (this.config.videoRef.current) {
            const v = this.config.videoRef.current;
            console.log("📺 Video element state after attach:", {
              srcObject: v.srcObject ? "present" : "null",
              readyState: v.readyState,
              paused: v.paused,
              videoWidth: v.videoWidth,
              videoHeight: v.videoHeight,
              currentTime: v.currentTime,
            });
          }
        }, 1000);
      } catch (err) {
        console.error("❌ Error attaching video:", err);
      }
    } else if (retriesLeft > 0) {
      console.log(`⏳ Video ref not ready, retrying in 200ms... (${retriesLeft} retries left)`);
      setTimeout(() => this.attachVideoWithRetry(retriesLeft - 1), 200);
    } else {
      console.error("❌ Failed to attach video - video element not available after retries");
    }
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
      // Retry with increasing delays if video element is not yet rendered
      this.attachVideoWithRetry(5);
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

    // Ensure video is unmuted - SDK plays audio through WebRTC stream
    if (this.config.videoRef.current) {
      this.config.videoRef.current.muted = false;
    }
    
    if (this.useHeygenVoice) {
      // Use HeyGen's built-in voice via session.repeat(text)
      console.log("🎙️ CUSTOM mode: Using HeyGen voice via session.repeat()");
      await this.speakWithHeygenVoice(text);
    } else {
      // Use ElevenLabs voice via session.repeatAudio(base64)
      console.log("🎙️ CUSTOM mode: Using ElevenLabs voice via session.repeatAudio()");
      await this.speakWithElevenLabsVoice(text, languageCodeOverride);
    }
  }

  /**
   * Speak using HeyGen's built-in voice
   * Uses session.repeat(text) - HeyGen handles TTS and lip-sync
   */
  private async speakWithHeygenVoice(text: string): Promise<void> {
    try {
      if (this.session) {
        console.log(`🗣️ HeyGen voice speaking: "${text.substring(0, 50)}..."`);
        this.session.repeat(text);
        console.log("🔊 Text sent to HeyGen for TTS and lip-sync");
      }
    } catch (error) {
      console.error("Error speaking with HeyGen voice:", error);
    }
  }

  /**
   * Speak using ElevenLabs voice with SDK lip-sync
   * SDK handles both lip-sync animation AND audio playback through WebRTC
   * 
   * CRITICAL: SDK requires PCM 24kHz base64 audio format
   * Uses /api/elevenlabs/tts-base64 which returns audio in this exact format
   * 
   * Following official demo pattern: just call repeatAudio() - SDK handles everything
   */
  private async speakWithElevenLabsVoice(text: string, languageCodeOverride?: string): Promise<void> {
    try {
      // Get base64 PCM audio from ElevenLabs (SDK-compatible format)
      const response = await fetch("/api/elevenlabs/tts-base64", {
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

      const data = await response.json();
      const base64Audio = data.audio;
      
      if (!base64Audio) {
        throw new Error("No audio data in response");
      }
      
      console.log(`🎤 Got base64 PCM audio (${base64Audio.length} chars), sending to SDK...`);
      
      // Send base64 PCM audio to SDK - SDK handles BOTH lip-sync AND audio playback
      // The audio comes through the WebRTC video stream (video element must be unmuted)
      if (this.session) {
        this.session.repeatAudio(base64Audio);
        console.log("🔊 Audio sent to SDK for lip-sync playback");
      }
      
    } catch (error) {
      console.error("Error speaking with ElevenLabs voice:", error);
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
    return !this.useHeygenVoice;
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
