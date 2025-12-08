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
  // Streaming audio methods for real-time lip-sync
  startStreamingAudio?(): void;
  addAudioChunk?(base64Audio: string): void;
  endStreamingAudio?(): void;
  isStreamingAudioActive?(): boolean;
}

interface DriverConfig {
  avatarConfig: any;
  audioOnly: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  avatarId: string;
  userId: string;
  languageCode?: string;
  enableMobileVoiceChat?: boolean; // Enable HeyGen's built-in voice chat for mobile (uses LiveKit WebRTC)
  onStreamReady?: () => void;
  onStreamDisconnected?: () => void;
  onAvatarStartTalking?: () => void;
  onAvatarStopTalking?: () => void;
  onUserMessage?: (message: string) => void;
  onVideoReady?: () => void; // Called when LiveKit video track is attached and playing
  onVoiceChatReady?: () => void; // Called when SDK's voice chat is ready for microphone input
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
  private enableMobileVoiceChat: boolean = false; // Track if mobile voice chat is enabled
  
  // Streaming audio accumulator for real-time lip-sync
  private audioChunkBuffer: Uint8Array[] = [];
  private audioBufferSize: number = 0;
  private isStreamingAudio: boolean = false;
  private streamingFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private isFirstAudioChunk: boolean = true;
  private readonly FIRST_AUDIO_THRESHOLD = 4000; // ~80ms - send first audio ASAP for faster perceived latency
  private readonly STREAMING_BUFFER_THRESHOLD = 8000; // ~170ms of 24kHz PCM audio for subsequent chunks
  private readonly STREAMING_FLUSH_DELAY = 150; // ms - flush buffer after no new chunks for this duration

  // Promise resolver for waiting on speech completion
  private speechCompleteResolver: (() => void) | null = null;
  private isSpeaking: boolean = false;

  constructor(config: DriverConfig) {
    this.config = config;
    this.languageCode = config.languageCode || "en";
    
    // Check avatar config for voice source preference
    // Use the INTERACTIVE voice setting (not the video creation one)
    this.useHeygenVoice = config.avatarConfig?.useHeygenVoiceForInteractive === true;
    
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
    
    // Retry logic for transient HeyGen service errors (404/500)
    const MAX_RETRIES = 1;
    let lastError: any = null;
    
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`🔄 Retry attempt ${attempt + 1}/${MAX_RETRIES + 1} with fresh token...`);
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 800));
        }
        
        // Fetch session credentials from the backend (fresh token on each attempt)
        const { sessionId, sessionToken } = await this.fetchSessionCredentials();
        this.sessionId = sessionId;
        
        console.log("📋 Creating LiveAvatar session:", { sessionId, hasToken: !!sessionToken, attempt: attempt + 1 });
        
        // Create LiveAvatarSession with sessionAccessToken and config
        // SDK signature: new LiveAvatarSession(sessionAccessToken: string, config?: SessionConfig)
        // The SDK handles LiveKit connection internally when session.start() is called
        // NOTE: LiveAvatar is a separate service from HeyGen - must use LiveAvatar API endpoint
        
        // Enable voice chat for mobile devices - uses LiveKit WebRTC for microphone capture
        // This works in iframes on mobile (unlike WebSocket or Web Speech API)
        // USER_TRANSCRIPTION events will be routed to our Claude + ElevenLabs pipeline
        this.enableMobileVoiceChat = this.config.enableMobileVoiceChat === true;
        console.log("🔧 LiveAvatarDriver code version: 2024-12-07-v2");
        console.log(`🎤 LiveAvatar voiceChat: ${this.enableMobileVoiceChat ? 'ENABLED (mobile mode - using LiveKit WebRTC)' : 'DISABLED (using Web Speech API)'}`);
        
        const session = new LiveAvatarSession(sessionToken, {
          voiceChat: this.enableMobileVoiceChat, // Enable for mobile - uses LiveKit for microphone capture
          apiUrl: "https://api.liveavatar.com", // LiveAvatar service endpoint (different from HeyGen)
        });
        this.session = session;

        // Track if we've already started voice chat to avoid duplicates
        let voiceChatStarted = false;
        
        // Helper function to start voice chat - called when session is fully connected
        const startVoiceChatIfReady = async () => {
          if (voiceChatStarted || !this.enableMobileVoiceChat || !this.session) return;
          
          console.log("🎤 Starting SDK voice chat (LiveKit microphone capture)...");
          try {
            const voiceChat = this.session.voiceChat;
            console.log("🎤 VoiceChat state:", voiceChat?.state);
            
            if (voiceChat && voiceChat.state !== 'ACTIVE') {
              console.log("🎤 Starting voiceChat.start() for microphone capture...");
              await voiceChat.start({ defaultMuted: false });
              console.log("✅ VoiceChat microphone capture started, state:", voiceChat.state);
            }
            
            // Then tell the avatar to start listening for speech
            this.session.startListening();
            console.log("✅ SDK startListening() called - avatar is now listening");
            voiceChatStarted = true;
            this.config.onVoiceChatReady?.();
          } catch (voiceChatError: any) {
            console.warn("⚠️ Failed to start SDK voice chat:", voiceChatError?.message || voiceChatError);
          }
        };
        
        // Listen for stream ready event - attach video element
        session.on(SessionEvent.SESSION_STREAM_READY, async () => {
          console.log("🎬 LiveAvatar SESSION_STREAM_READY event received");
          // Use SDK's attach() method to connect video element
          this.attachVideoWithRetry(5);
        });

        // Listen for session state changes - start voice chat when CONNECTED
        session.on(SessionEvent.SESSION_STATE_CHANGED, async (state: SessionState) => {
          console.log("📊 LiveAvatar session state:", state);
          
          // Only start voice chat once session is fully connected
          if (state === SessionState.CONNECTED && this.enableMobileVoiceChat) {
            console.log("🎤 Session CONNECTED - now starting voice chat...");
            // Small delay to ensure everything is ready
            await new Promise(resolve => setTimeout(resolve, 500));
            await startVoiceChatIfReady();
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
          this.isSpeaking = true;
          this.config.onAvatarStartTalking?.();
        });

        session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, async () => {
          console.log("🤫 Avatar stopped speaking");
          this.isSpeaking = false;
          this.config.onAvatarStopTalking?.();
          
          // Resolve any pending speech completion promise
          if (this.speechCompleteResolver) {
            const resolver = this.speechCompleteResolver;
            this.speechCompleteResolver = null;
            resolver();
          }
          
          // Resume listening after avatar stops speaking (for HeyGen voice chat)
          if (this.enableMobileVoiceChat && this.session) {
            // Small delay to prevent echo feedback
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log("🎤 Resuming SDK listening after avatar finished speaking...");
            try {
              this.session.startListening();
              console.log("✅ SDK startListening() called - avatar is listening again");
            } catch (e: any) {
              console.warn("⚠️ Failed to resume listening:", e?.message || e);
            }
          }
        });

        // Listen for ALL agent events for debugging
        console.log("🔧 Available AgentEventsEnum keys:", Object.keys(AgentEventsEnum));
        
        // Listen for user speaking events (for debugging voice input)
        session.on(AgentEventsEnum.USER_SPEAK_STARTED, () => {
          console.log("🎤 USER_SPEAK_STARTED - User started speaking (SDK voice detection)");
        });

        session.on(AgentEventsEnum.USER_SPEAK_ENDED, () => {
          console.log("🎤 USER_SPEAK_ENDED - User stopped speaking (SDK voice detection)");
        });

        // Listen for user transcription (voice input)
        session.on(AgentEventsEnum.USER_TRANSCRIPTION, (event) => {
          console.log("🎤 USER_TRANSCRIPTION event received:", event);
          console.log("🎤 User transcription text:", event?.text);
          if (event?.text && this.config.onUserMessage) {
            console.log("🎤 Forwarding user message to pipeline:", event.text);
            this.config.onUserMessage(event.text);
          }
        });
        
        // Log voiceChat state periodically for debugging
        if (this.enableMobileVoiceChat) {
          const voiceChatDebugInterval = setInterval(() => {
            if (!this.session) {
              clearInterval(voiceChatDebugInterval);
              return;
            }
            const vc = this.session.voiceChat;
            console.log("🎤 VoiceChat debug - state:", vc?.state, "isListening:", (this.session as any)?.isListening);
          }, 5000);
          // Store interval for cleanup
          (this as any).voiceChatDebugInterval = voiceChatDebugInterval;
        }

        // Start the session - SDK handles LiveKit connection internally
        console.log("🔄 Calling session.start() - SDK will connect to LiveKit...");
        await session.start();
        console.log("✅ session.start() completed - waiting for SESSION_STREAM_READY event");
        // Note: startListening() is called in SESSION_STREAM_READY handler (after stream is ready)
        
        // Success - exit retry loop
        console.log("✅ LiveAvatar session started - CUSTOM mode with Claude + RAG + ElevenLabs");
        return;
        
      } catch (startError: any) {
        lastError = startError;
        console.error(`❌ Error starting LiveAvatar session (attempt ${attempt + 1}):`, startError?.message || startError, startError);
        
        // Clean up failed session before retry
        if (this.session) {
          try {
            await this.session.stop();
          } catch (e) {
            // Ignore cleanup errors
          }
          this.session = null;
        }
        
        // If this was the last attempt, throw the error
        if (attempt >= MAX_RETRIES) {
          throw lastError;
        }
        // Otherwise, continue to next retry iteration
      }
    }
  }

  async stop(): Promise<void> {
    this.stopCurrentAudio();
    this.videoAttached = false;
    
    // Clean up debug interval
    if ((this as any).voiceChatDebugInterval) {
      clearInterval((this as any).voiceChatDebugInterval);
      (this as any).voiceChatDebugInterval = null;
    }
    
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
    
    // Create promise to wait for speech completion
    const speechCompletePromise = new Promise<void>((resolve) => {
      this.speechCompleteResolver = resolve;
    });
    
    // Set timeout to avoid hanging indefinitely if SDK event doesn't fire
    const timeoutPromise = new Promise<void>((resolve) => {
      // Estimate duration: ~150ms per word + 2s buffer
      const wordCount = text.split(/\s+/).length;
      const estimatedMs = Math.max(3000, wordCount * 150 + 2000);
      setTimeout(() => {
        if (this.speechCompleteResolver) {
          console.warn(`⚠️ Speech timeout after ${estimatedMs}ms - SDK AVATAR_SPEAK_ENDED not received`);
          this.speechCompleteResolver = null;
          resolve();
        }
      }, estimatedMs);
    });
    
    if (this.useHeygenVoice) {
      // Use HeyGen's built-in voice via session.repeat(text)
      console.log("🎙️ CUSTOM mode: Using HeyGen voice via session.repeat()");
      await this.speakWithHeygenVoice(text);
    } else {
      // Use ElevenLabs voice via session.repeatAudio(base64)
      console.log("🎙️ CUSTOM mode: Using ElevenLabs voice via session.repeatAudio()");
      await this.speakWithElevenLabsVoice(text, languageCodeOverride);
    }
    
    // Wait for speech to complete (or timeout)
    console.log("⏳ Waiting for avatar to finish speaking...");
    await Promise.race([speechCompletePromise, timeoutPromise]);
    console.log("✅ Avatar finished speaking (or timeout reached)");
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

  /**
   * Start streaming audio mode - prepares buffer for incoming audio chunks
   */
  startStreamingAudio(): void {
    this.isStreamingAudio = true;
    this.isFirstAudioChunk = true; // Reset for each new stream
    this.audioChunkBuffer = [];
    this.audioBufferSize = 0;
    if (this.streamingFlushTimer) {
      clearTimeout(this.streamingFlushTimer);
      this.streamingFlushTimer = null;
    }
    console.log("🎵 Started streaming audio accumulation for lip-sync (fast first-chunk mode)");
    
    // Ensure video is unmuted for SDK audio playback
    if (this.config.videoRef.current) {
      this.config.videoRef.current.muted = false;
    }
    
    this.config.onAvatarStartTalking?.();
  }

  /**
   * Add an audio chunk to the buffer - sends to SDK when threshold reached
   * Uses smaller threshold for first chunk to minimize time-to-first-audio
   * @param base64Audio Base64 encoded PCM audio chunk (24kHz, 16-bit)
   */
  addAudioChunk(base64Audio: string): void {
    if (!this.isStreamingAudio || !this.session) return;
    
    // Decode base64 to binary
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    this.audioChunkBuffer.push(bytes);
    this.audioBufferSize += bytes.length;
    
    // Clear previous flush timer
    if (this.streamingFlushTimer) {
      clearTimeout(this.streamingFlushTimer);
    }
    
    // Use smaller threshold for first audio to minimize time-to-first-audio
    const threshold = this.isFirstAudioChunk ? this.FIRST_AUDIO_THRESHOLD : this.STREAMING_BUFFER_THRESHOLD;
    
    // Check if we have enough audio to send to SDK for lip-sync
    if (this.audioBufferSize >= threshold) {
      this.flushAudioBuffer();
      this.isFirstAudioChunk = false; // Subsequent chunks use larger threshold
    } else {
      // Set a timer to flush if no more chunks arrive
      this.streamingFlushTimer = setTimeout(() => {
        if (this.audioBufferSize > 0) {
          this.flushAudioBuffer();
          this.isFirstAudioChunk = false;
        }
      }, this.STREAMING_FLUSH_DELAY);
    }
  }

  /**
   * Flush accumulated audio buffer to SDK for lip-sync playback
   */
  private flushAudioBuffer(): void {
    if (!this.session || this.audioChunkBuffer.length === 0) return;
    
    // Combine all chunks into one buffer
    const totalLength = this.audioChunkBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of this.audioChunkBuffer) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    
    // Convert to base64 for SDK
    let binary = '';
    for (let i = 0; i < combined.length; i++) {
      binary += String.fromCharCode(combined[i]);
    }
    const base64Audio = btoa(binary);
    
    console.log(`🔊 Sending ${totalLength} bytes (${(totalLength / 48000 * 1000).toFixed(0)}ms) to SDK for lip-sync`);
    
    // Send to SDK for lip-sync + audio playback
    this.session.repeatAudio(base64Audio);
    
    // Clear buffer
    this.audioChunkBuffer = [];
    this.audioBufferSize = 0;
  }

  /**
   * End streaming audio mode - flushes remaining buffer
   */
  endStreamingAudio(): void {
    if (this.streamingFlushTimer) {
      clearTimeout(this.streamingFlushTimer);
      this.streamingFlushTimer = null;
    }
    
    // Flush any remaining audio
    if (this.audioBufferSize > 0) {
      this.flushAudioBuffer();
    }
    
    this.isStreamingAudio = false;
    console.log("🎵 Ended streaming audio mode");
    
    // Delay the stop talking callback to allow SDK to finish playback
    setTimeout(() => {
      this.config.onAvatarStopTalking?.();
    }, 500);
  }

  /**
   * Check if streaming audio mode is active
   */
  isStreamingAudioActive(): boolean {
    return this.isStreamingAudio;
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
