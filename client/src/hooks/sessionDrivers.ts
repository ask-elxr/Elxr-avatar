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
  
  // ElevenLabs STT via WebSocket (replaces HeyGen's built-in STT)
  private sttWebSocket: WebSocket | null = null;
  private sttReady: boolean = false;
  private mediaStream: MediaStream | null = null;
  private audioWorkletNode: AudioWorkletNode | null = null;
  private sttAudioContext: AudioContext | null = null;
  
  // Streaming audio accumulator for real-time lip-sync
  private audioChunkBuffer: Uint8Array[] = [];
  private audioBufferSize: number = 0;
  private isStreamingAudio: boolean = false;
  private streamingFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly STREAMING_BUFFER_THRESHOLD = 12000; // ~0.5s of 24kHz PCM audio (24000 samples/s * 2 bytes * 0.25s)
  private readonly STREAMING_FLUSH_DELAY = 200; // ms - flush buffer after no new chunks for this duration

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
        
        // Enable voice chat for mobile devices - uses ElevenLabs STT via WebSocket
        // MediaRecorder API works in iframes on mobile (unlike WebSocket or Web Speech API alone)
        // Transcriptions are routed to our Claude + RAG + ElevenLabs TTS pipeline
        this.enableMobileVoiceChat = this.config.enableMobileVoiceChat === true;
        console.log("🔧 LiveAvatarDriver code version: 2024-12-09-v8 (no apiUrl override)");
        console.log(`🎤 Voice input: ${this.enableMobileVoiceChat ? 'ENABLED (using ElevenLabs STT)' : 'DISABLED (using Web Speech API)'}`);
        
        // SDK signature: new LiveAvatarSession(sessionAccessToken, config?)
        // sessionAccessToken is the token from /v1/sessions/token endpoint
        // SDK has correct apiUrl built-in, no override needed
        const session = new LiveAvatarSession(sessionToken);
        this.session = session;

        // Listen for stream ready event - this is when we attach the video element and start ElevenLabs STT
        session.on(SessionEvent.SESSION_STREAM_READY, async () => {
          console.log("🎬 LiveAvatar SESSION_STREAM_READY event received");
          // Use SDK's attach() method to connect video element
          // Retry with increasing delays if video element is not yet rendered
          this.attachVideoWithRetry(5);
          
          // Start ElevenLabs STT after stream is ready (for mobile devices)
          if (this.enableMobileVoiceChat) {
            console.log("🎤 Starting ElevenLabs STT after stream ready...");
            try {
              await this.startElevenLabsSTT();
              console.log("✅ ElevenLabs STT started successfully");
            } catch (sttError: any) {
              console.warn("⚠️ Failed to start ElevenLabs STT:", sttError?.message || sttError);
              // If STT fails (e.g., permission denied), the UI should show a message
            }
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

        // Note: User voice input is now handled by ElevenLabs STT (not HeyGen SDK)
        // USER_TRANSCRIPTION events from HeyGen are no longer used

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
    
    // Stop ElevenLabs STT
    await this.stopElevenLabsSTT();
    
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

  /**
   * Start ElevenLabs STT - captures microphone and streams to backend
   * Uses MediaRecorder API which works on mobile devices in iframes
   */
  private async startElevenLabsSTT(): Promise<void> {
    console.log("🎤 Starting ElevenLabs STT (replacing HeyGen's built-in STT)...");
    
    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
      console.log("✅ Microphone access granted");
      
      // Connect to ElevenLabs STT WebSocket
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/ws/elevenlabs-stt`;
      console.log("🔌 Connecting to ElevenLabs STT WebSocket:", wsUrl);
      
      this.sttWebSocket = new WebSocket(wsUrl);
      
      this.sttWebSocket.onopen = () => {
        console.log("✅ ElevenLabs STT WebSocket connected");
        // Send start command with language
        this.sttWebSocket?.send(JSON.stringify({
          type: 'start',
          languageCode: this.languageCode.split('-')[0] || 'en',
        }));
      };
      
      this.sttWebSocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'stt_ready') {
            console.log("✅ ElevenLabs STT ready - starting audio capture");
            this.sttReady = true;
            this.startAudioCapture();
            this.config.onVoiceChatReady?.();
          } else if (message.type === 'final') {
            console.log("🎤 ElevenLabs STT transcription:", message.text);
            if (message.text && this.config.onUserMessage) {
              this.config.onUserMessage(message.text);
            }
          } else if (message.type === 'partial') {
            console.log("🎤 ElevenLabs STT partial:", message.text);
          } else if (message.type === 'error') {
            console.error("❌ ElevenLabs STT error:", message.message);
          }
        } catch (error) {
          console.error("Error parsing STT message:", error);
        }
      };
      
      this.sttWebSocket.onerror = (error) => {
        console.error("❌ ElevenLabs STT WebSocket error:", error);
      };
      
      this.sttWebSocket.onclose = () => {
        console.log("📵 ElevenLabs STT WebSocket closed");
        this.sttReady = false;
      };
      
    } catch (error) {
      console.error("❌ Failed to start ElevenLabs STT:", error);
      throw error;
    }
  }

  /**
   * Start capturing audio and sending to ElevenLabs STT
   * Uses ScriptProcessorNode for PCM conversion (works on all browsers including mobile Safari)
   */
  private startAudioCapture(): void {
    if (!this.mediaStream || !this.sttWebSocket) return;
    
    try {
      // Create AudioContext for PCM conversion
      this.sttAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000,
      });
      
      const source = this.sttAudioContext.createMediaStreamSource(this.mediaStream);
      
      // Use ScriptProcessorNode for PCM capture (deprecated but widely supported)
      const bufferSize = 4096;
      const scriptProcessor = this.sttAudioContext.createScriptProcessor(bufferSize, 1, 1);
      
      scriptProcessor.onaudioprocess = (event) => {
        if (!this.sttReady || !this.sttWebSocket || this.sttWebSocket.readyState !== WebSocket.OPEN) {
          return;
        }
        
        // Get PCM float32 data
        const inputData = event.inputBuffer.getChannelData(0);
        
        // Convert float32 to int16 PCM
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Send binary PCM data
        this.sttWebSocket.send(pcm16.buffer);
      };
      
      source.connect(scriptProcessor);
      scriptProcessor.connect(this.sttAudioContext.destination);
      
      console.log("✅ Audio capture started - streaming PCM to ElevenLabs STT");
      
    } catch (error) {
      console.error("❌ Failed to start audio capture:", error);
    }
  }

  /**
   * Stop ElevenLabs STT and clean up resources
   */
  private async stopElevenLabsSTT(): Promise<void> {
    console.log("🛑 Stopping ElevenLabs STT...");
    
    // Stop media stream
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    // Close STT audio context
    if (this.sttAudioContext) {
      try {
        await this.sttAudioContext.close();
      } catch (e) {
        // Ignore
      }
      this.sttAudioContext = null;
    }
    
    // Close WebSocket
    if (this.sttWebSocket) {
      if (this.sttWebSocket.readyState === WebSocket.OPEN) {
        this.sttWebSocket.send(JSON.stringify({ type: 'stop' }));
      }
      this.sttWebSocket.close();
      this.sttWebSocket = null;
    }
    
    this.sttReady = false;
    console.log("✅ ElevenLabs STT stopped");
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
}

// Alias for backwards compatibility
export const HeyGenDriver = LiveAvatarDriver;

/**
 * HeyGenStreamingDriver - Uses the older @heygen/streaming-avatar SDK
 * This is more stable than the newer LiveAvatar SDK
 * Video is streamed via MediaStream, we use our own Claude + RAG + ElevenLabs pipeline
 */
export class HeyGenStreamingDriver implements SessionDriver {
  private streamingAvatar: any = null;
  private config: DriverConfig;
  private languageCode: string = "en";
  private mediaStream: MediaStream | null = null;

  constructor(config: DriverConfig) {
    this.config = config;
    this.languageCode = config.languageCode || "en";
    console.log(`🎬 HeyGenStreamingDriver: Using @heygen/streaming-avatar SDK for ${config.avatarConfig.name || config.avatarId}`);
  }

  async start(): Promise<void> {
    console.log("🚀 HeyGenStreamingDriver.start() called for:", this.config.avatarId);
    
    try {
      // Dynamically import the HeyGen Streaming Avatar SDK
      const { default: StreamingAvatar, AvatarQuality, StreamingEvents } = await import("@heygen/streaming-avatar");
      
      // Fetch access token from backend
      const token = await this.fetchAccessToken();
      console.log("🔑 Got HeyGen Streaming token");
      
      // Create streaming avatar instance
      this.streamingAvatar = new StreamingAvatar({ token });
      
      // Set up event listeners
      this.streamingAvatar.on(StreamingEvents.STREAM_READY, (event: any) => {
        console.log("🎬 HeyGen STREAM_READY event received");
        this.mediaStream = event.detail;
        
        // Attach stream to video element
        if (this.config.videoRef.current && this.mediaStream) {
          this.config.videoRef.current.srcObject = this.mediaStream;
          this.config.videoRef.current.onloadedmetadata = () => {
            this.config.videoRef.current?.play().catch(err => {
              console.warn("⚠️ Video autoplay prevented:", err);
            });
          };
          console.log("✅ Video stream attached");
          this.config.onStreamReady?.();
          this.config.onVideoReady?.();
        }
      });

      this.streamingAvatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        console.log("🔌 HeyGen stream disconnected");
        this.config.onStreamDisconnected?.();
      });

      this.streamingAvatar.on(StreamingEvents.AVATAR_START_TALKING, () => {
        console.log("🗣️ Avatar started talking");
        this.config.onAvatarStartTalking?.();
      });

      this.streamingAvatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
        console.log("🤐 Avatar stopped talking");
        this.config.onAvatarStopTalking?.();
      });

      // Get avatar ID - prefer heygenAvatarId for HeyGen Streaming API
      const avatarName = this.config.avatarConfig?.heygenAvatarId || 
                         this.config.avatarConfig?.liveAvatarId ||
                         this.config.avatarId;
      
      console.log("📋 Starting HeyGen Streaming avatar:", avatarName);
      
      // Start the avatar session
      await this.streamingAvatar.createStartAvatar({
        quality: AvatarQuality.High,
        avatarName: avatarName,
        language: this.languageCode,
        disableIdleTimeout: true,
      });
      
      console.log("✅ HeyGen Streaming avatar session started");
      
    } catch (error: any) {
      console.error("❌ Error starting HeyGen Streaming session:", error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    console.log("🛑 Stopping HeyGen Streaming session...");
    
    if (this.streamingAvatar) {
      try {
        await this.streamingAvatar.stopAvatar();
      } catch (error) {
        console.error("Error stopping avatar:", error);
      }
      this.streamingAvatar = null;
    }
    
    if (this.config.videoRef.current) {
      this.config.videoRef.current.srcObject = null;
    }
    
    this.mediaStream = null;
    console.log("✅ HeyGen Streaming session stopped");
  }

  setLanguage(languageCode: string): void {
    this.languageCode = languageCode;
    console.log(`🌐 HeyGenStreamingDriver language set to: ${languageCode}`);
  }

  async speak(text: string, languageCodeOverride?: string): Promise<void> {
    if (!this.streamingAvatar) {
      console.warn("Cannot speak - no active streaming avatar session");
      return;
    }

    try {
      console.log(`🗣️ Speaking via HeyGen avatar: "${text.substring(0, 50)}..."`);
      // Use HeyGen's built-in TTS via the speak method
      await this.streamingAvatar.speak({ text });
    } catch (error) {
      console.error("Error speaking:", error);
    }
  }

  async interrupt(): Promise<void> {
    if (this.streamingAvatar) {
      try {
        await this.streamingAvatar.interrupt();
      } catch (error) {
        console.error("Error interrupting:", error);
      }
    }
  }

  supportsVoiceInput(): boolean {
    return true; // HeyGen SDK supports voice input
  }

  private async fetchAccessToken(): Promise<string> {
    const response = await fetch("/api/heygen/streaming-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: this.config.userId,
        avatarId: this.config.avatarId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch HeyGen Streaming token: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.token;
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
