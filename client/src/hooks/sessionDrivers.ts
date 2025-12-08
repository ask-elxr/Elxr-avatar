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
  // Direct audio playback for batch audio mode
  repeatAudio?(base64Audio: string): Promise<void>;
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
  private readonly STREAMING_BUFFER_THRESHOLD = 12000; // ~0.5s of 24kHz PCM audio (24000 samples/s * 2 bytes * 0.25s)
  private readonly STREAMING_FLUSH_DELAY = 200; // ms - flush buffer after no new chunks for this duration

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
      // Estimate duration: ~200ms per word + 10s buffer for network/processing
      // Long responses with ElevenLabs audio need more time for transmission and processing
      const wordCount = text.split(/\s+/).length;
      const estimatedMs = Math.max(15000, wordCount * 200 + 10000);
      console.log(`⏱️ Speech timeout set to ${(estimatedMs/1000).toFixed(1)}s for ${wordCount} words`);
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
    this.audioChunkBuffer = [];
    this.audioBufferSize = 0;
    if (this.streamingFlushTimer) {
      clearTimeout(this.streamingFlushTimer);
      this.streamingFlushTimer = null;
    }
    console.log("🎵 Started streaming audio accumulation for lip-sync");
    
    // Ensure video is unmuted for SDK audio playback
    if (this.config.videoRef.current) {
      this.config.videoRef.current.muted = false;
    }
    
    this.config.onAvatarStartTalking?.();
  }

  /**
   * Add an audio chunk to the buffer - sends to SDK when threshold reached
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
    
    // Check if we have enough audio to send to SDK for lip-sync
    if (this.audioBufferSize >= this.STREAMING_BUFFER_THRESHOLD) {
      this.flushAudioBuffer();
    } else {
      // Set a timer to flush if no more chunks arrive
      this.streamingFlushTimer = setTimeout(() => {
        if (this.audioBufferSize > 0) {
          this.flushAudioBuffer();
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

  /**
   * Helper to create a WAV header for PCM data
   */
  private createWavHeader(dataSize: number, sampleRate: number = 24000, channels: number = 1, bitsPerSample: number = 16): Uint8Array {
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);
    const headerSize = 44;
    const fileSize = headerSize + dataSize - 8;
    
    const header = new Uint8Array(headerSize);
    const view = new DataView(header.buffer);
    
    // RIFF header
    header.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
    view.setUint32(4, fileSize, true);
    header.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"
    
    // fmt subchunk
    header.set([0x66, 0x6D, 0x74, 0x20], 12); // "fmt "
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    
    // data subchunk
    header.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
    view.setUint32(40, dataSize, true);
    
    return header;
  }

  /**
   * Directly send base64 WAV audio to the SDK for lip-sync playback
   * Used by batch audio mode for complete audio responses
   * 
   * NOTE: Sends complete audio in ONE call - no chunking!
   * The greeting path sends 400KB+ audio this way and it works perfectly.
   * Chunking causes split playback because each repeatAudio() starts new playback.
   */
  async repeatAudio(base64Audio: string): Promise<void> {
    if (!this.session) {
      console.warn("Cannot repeat audio - session not initialized");
      return;
    }
    
    const totalLength = base64Audio.length;
    console.log(`🎤 [repeatAudio] Sending ${totalLength} chars of base64 WAV audio to SDK (single call, no chunking)`);
    
    return new Promise((resolve) => {
      // Set up completion handler
      this.speechCompleteResolver = () => {
        console.log("✅ [repeatAudio] Avatar finished speaking");
        resolve();
      };
      
      // Send full audio in one call - same as working greeting path
      // This matches speakWithElevenLabsVoice() which works for 400KB+ audio
      this.session!.repeatAudio(base64Audio);
      console.log("🔊 [repeatAudio] Full audio sent to SDK - awaiting playback completion");
      
      // Set a timeout in case the SDK doesn't fire the completion event
      const timeout = setTimeout(() => {
        console.warn("⚠️ [repeatAudio] Speech timeout - resolving anyway");
        if (this.speechCompleteResolver) {
          this.speechCompleteResolver();
          this.speechCompleteResolver = null;
        }
      }, 60000); // 60 second timeout for long responses
      
      // Clean up timeout when speech completes naturally
      const originalResolver = this.speechCompleteResolver;
      this.speechCompleteResolver = () => {
        clearTimeout(timeout);
        originalResolver?.();
        this.speechCompleteResolver = null;
      };
    });
  }
}

// Alias for backwards compatibility
export const HeyGenDriver = LiveAvatarDriver;

export class AudioOnlyDriver implements SessionDriver {
  private config: DriverConfig;
  private currentAudio: HTMLAudioElement | null = null;
  private avatarId: string;
  private languageCode: string;
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private playbackEndedNotified: boolean = true; // Track if stop callback has been sent (start true = no active playback)

  constructor(config: DriverConfig, avatarId: string, languageCode: string = "en") {
    this.config = config;
    this.avatarId = avatarId;
    this.languageCode = languageCode;
  }
  
  /**
   * Helper to ensure onAvatarStopTalking is called exactly once per playback
   */
  private notifyStopped(): void {
    if (!this.playbackEndedNotified) {
      this.playbackEndedNotified = true;
      this.config.onAvatarStopTalking?.();
    }
  }

  async start(): Promise<void> {
    console.log("Audio-only mode started - no HeyGen session created");
    // Create AudioContext lazily on first use to avoid Safari limits
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  async stop(): Promise<void> {
    this.stopCurrentAudio();
    // Close AudioContext on full stop
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        await this.audioContext.close();
      } catch (e) {
        // Already closed
      }
      this.audioContext = null;
    }
  }

  setLanguage(languageCode: string): void {
    this.languageCode = languageCode;
    console.log(`🌐 AudioOnlyDriver language set to: ${languageCode}`);
  }

  async speak(text: string, languageCodeOverride?: string): Promise<void> {
    try {
      this.stopCurrentAudio();
      
      // Mark that we're starting new playback (callback not yet sent)
      this.playbackEndedNotified = false;

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
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
        this.notifyStopped();
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
        this.notifyStopped();
      };

      await audio.play();
    } catch (error) {
      console.error("Error playing TTS:", error);
      this.notifyStopped();
    }
  }

  async interrupt(): Promise<void> {
    this.stopCurrentAudio();
  }

  supportsVoiceInput(): boolean {
    return false;
  }

  /**
   * Play base64-encoded PCM audio directly using Web Audio API
   * Used by batch audio mode for complete audio responses
   * PCM format: 16-bit signed little-endian mono at 24kHz
   */
  async repeatAudio(base64Audio: string): Promise<void> {
    try {
      // Stop any existing audio before starting new playback
      this.stopCurrentAudio();
      
      // Mark that we're starting new playback (callback not yet sent)
      this.playbackEndedNotified = false;
      
      this.config.onAvatarStartTalking?.();
      console.log(`🔊 [AudioOnlyDriver] Playing ${base64Audio.length} chars of base64 PCM audio`);
      
      // Decode base64 to bytes
      const binaryString = atob(base64Audio);
      const len = binaryString.length;
      const pcmBytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        pcmBytes[i] = binaryString.charCodeAt(i);
      }
      
      console.log(`🔊 [AudioOnlyDriver] Decoded ${pcmBytes.length} bytes of PCM data`);
      
      // Use the single persistent AudioContext created in start()
      // If closed, we should not be receiving playback requests (session should be active)
      if (!this.audioContext || this.audioContext.state === 'closed') {
        throw new Error("AudioContext not available - ensure start() was called and session is active");
      }
      
      // Resume AudioContext if suspended (browser autoplay policy)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      const sampleRate = 24000;
      const numSamples = Math.floor(pcmBytes.length / 2); // 16-bit = 2 bytes per sample
      
      // Create audio buffer
      const audioBuffer = this.audioContext.createBuffer(1, numSamples, sampleRate);
      const channelData = audioBuffer.getChannelData(0);
      
      // Convert 16-bit PCM to float32 (range -1.0 to 1.0)
      const pcmView = new DataView(pcmBytes.buffer);
      for (let i = 0; i < numSamples; i++) {
        const sample = pcmView.getInt16(i * 2, true); // true = little-endian
        channelData[i] = sample / 32768; // Normalize to -1.0 to 1.0
      }
      
      // Create source and track it for interrupt/stop capability
      const source = this.audioContext.createBufferSource();
      this.currentSource = source;
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      
      return new Promise<void>((resolve) => {
        source.onended = () => {
          console.log("✅ [AudioOnlyDriver] Web Audio playback ended");
          this.currentSource = null;
          this.notifyStopped(); // Safe to call multiple times - only fires once per playback
          resolve();
        };
        
        source.start(0);
        console.log(`🔊 [AudioOnlyDriver] Started playback: ${numSamples} samples at ${sampleRate}Hz = ${(numSamples / sampleRate).toFixed(1)}s`);
      });
    } catch (error) {
      console.error("❌ [AudioOnlyDriver] repeatAudio error:", error);
      this.currentSource = null;
      this.notifyStopped();
    }
  }

  private stopCurrentAudio(): void {
    // Stop Web Audio playback
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (e) {
        // Already stopped
      }
      this.currentSource = null;
    }
    
    // Stop HTMLAudioElement playback
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    
    // Notify that playback has stopped (safe to call multiple times)
    this.notifyStopped();
  }
}
