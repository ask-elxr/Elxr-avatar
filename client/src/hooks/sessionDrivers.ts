import { 
  LiveAvatarSession, 
  SessionEvent, 
  AgentEventsEnum,
  SessionState 
} from "@heygen/liveavatar-web-sdk";
import { Room, RoomEvent, Track, RemoteTrack, RemoteTrackPublication, RemoteParticipant } from "livekit-client";
import { requestMicrophoneOnce } from "@/lib/microphoneCache";
import { getGlobalVolume } from "@/lib/mobileAudio";
import { buildAuthenticatedWsUrl, getAuthHeaders } from "@/lib/queryClient";

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
  // Session token for cleanup
  getLiveAvatarSessionToken?(): string | null;
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
  private useHeygenVoice: boolean = false; // Toggle between built-in voice (repeat) and ElevenLabs voice (repeatAudio)
  private languageCode: string = "en";
  private sessionId: string | null = null;
  private intentionalStop: boolean = false; // Track if disconnect was intentional
  private liveAvatarSessionToken: string | null = null; // Store token for proper cleanup
  private videoAttached: boolean = false;
  private audioContext: AudioContext | null = null;
  private enableMobileVoiceChat: boolean = false; // Track if mobile voice chat is enabled
  
  // LiveKit Room for CUSTOM mode (direct connection, bypassing SDK's session.start())
  private liveKitRoom: Room | null = null;
  private useDirectLiveKit: boolean = false; // True when using direct LiveKit connection
  
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
    
    // In CUSTOM mode, session.repeat(text) is NOT supported by HeyGen SDK
    // Always use ElevenLabs TTS + repeatAudio() for lip-sync in CUSTOM mode
    this.useHeygenVoice = false;
    
    console.log(`🎙️ LiveAvatarDriver: CUSTOM mode - Using ElevenLabs TTS + repeatAudio() for ${config.avatarConfig?.name || config.avatarId}`);
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
        
        // Mobile fix: Set webkit-specific attributes
        videoEl.setAttribute('webkit-playsinline', 'true');
        videoEl.setAttribute('x5-playsinline', 'true');
        videoEl.setAttribute('x5-video-player-type', 'h5');
        
        const isMobile = /iPad|iPhone|iPod|Android|mobile/i.test(navigator.userAgent);
        
        // Try to play with audio first
        videoEl.muted = false;
        videoEl.play().then(() => {
          console.log("✅ Video playing with audio");
        }).catch(async err => {
          console.warn("⚠️ Video autoplay with audio prevented:", err.message || err);
          
          // Strategy 1: Try muted first, then unmute
          try {
            videoEl.muted = true;
            await videoEl.play();
            console.log("✅ Video playing muted, attempting unmute...");
            
            // Unmute after short delay
            setTimeout(() => {
              videoEl.muted = false;
              console.log("🔊 Video unmuted");
            }, 300);
          } catch (mutedError) {
            console.error("❌ Video play failed even muted:", mutedError);
            
            // Strategy 2: For mobile, try resuming AudioContext
            if (isMobile) {
              try {
                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                await audioContext.resume();
                await videoEl.play();
                console.log("✅ Video playing after AudioContext resume");
              } catch (audioContextError) {
                console.error("❌ Mobile video play failed:", audioContextError);
              }
            }
          }
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
          await new Promise(resolve => setTimeout(resolve, 800));
        }
        
        // Fetch session credentials from the backend (fresh token on each attempt)
        const credentials = await this.fetchSessionCredentials();
        this.sessionId = credentials.sessionId;
        this.liveAvatarSessionToken = credentials.sessionToken; // Store for cleanup
        
        console.log("📋 Creating LiveAvatar session:", { 
          sessionId: credentials.sessionId, 
          hasToken: !!credentials.sessionToken, 
          mode: credentials.mode,
          hasLiveKitConfig: !!(credentials.livekit_url && credentials.livekit_token),
          attempt: attempt + 1 
        });
        
        this.enableMobileVoiceChat = this.config.enableMobileVoiceChat === true;
        console.log("🔧 LiveAvatarDriver code version: 2024-12-30-v10 (SDK session.start + repeatAudio for lip-sync)");
        console.log(`🎤 Voice input: ${this.enableMobileVoiceChat ? 'ENABLED (using ElevenLabs STT)' : 'DISABLED (using Web Speech API)'}`);
        
        // Always use SDK's session.start() - it handles LiveKit connection internally
        // In CUSTOM mode, we use session.repeatAudio() to send ElevenLabs TTS for lip-sync
        console.log(`🎬 Using SDK session.start() (mode: ${credentials.mode})`);
        this.useDirectLiveKit = false;
        
        const session = new LiveAvatarSession(credentials.sessionToken);
        this.session = session;

        session.on(SessionEvent.SESSION_STREAM_READY, async () => {
          console.log("🎬 LiveAvatar SESSION_STREAM_READY event received");
          this.attachVideoWithRetry(5);
          
          if (this.enableMobileVoiceChat) {
            console.log("🎤 Starting ElevenLabs STT after stream ready...");
            try {
              await this.startElevenLabsSTT();
              console.log("✅ ElevenLabs STT started successfully");
            } catch (sttError: any) {
              console.warn("⚠️ Failed to start ElevenLabs STT:", sttError?.message || sttError);
            }
          }
        });

        session.on(SessionEvent.SESSION_STATE_CHANGED, (state: SessionState) => {
          console.log("📊 LiveAvatar session state:", state);
        });

        session.on(SessionEvent.SESSION_DISCONNECTED, (reason) => {
          console.log("📵 LiveAvatar stream disconnected:", reason);
          console.log("📵 Stream disconnected - intentionalStop flag:", this.intentionalStop);
          
          // Log detailed error info for debugging failed sessions
          if (reason === "SESSION_START_FAILED") {
            console.error("Session start failed:", {
              status: (session as any)?.lastError?.status || null,
              errorCode: (session as any)?.lastError?.code || 500,
            });
          }
          
          this.config.onStreamDisconnected?.();
        });

        session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => {
          console.log("🗣️ Avatar started speaking");
          this.config.onAvatarStartTalking?.();
        });

        session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
          console.log("🤫 Avatar stopped speaking");
          this.config.onAvatarStopTalking?.();
        });

        console.log("🔄 Calling session.start() - SDK will connect to LiveKit...");
        await session.start();
        console.log("✅ session.start() completed - waiting for SESSION_STREAM_READY event");
        
        console.log("✅ LiveAvatar session started - SDK-managed mode");
        return;
        
      } catch (startError: any) {
        lastError = startError;
        console.error(`❌ Error starting LiveAvatar session (attempt ${attempt + 1}):`, startError?.message || startError, startError);
        
        // Clean up failed session before retry
        if (this.liveKitRoom) {
          try {
            await this.liveKitRoom.disconnect();
          } catch (e) {
            // Ignore cleanup errors
          }
          this.liveKitRoom = null;
        }
        if (this.session) {
          try {
            await this.session.stop();
          } catch (e) {
            // Ignore cleanup errors
          }
          this.session = null;
        }
        
        if (attempt >= MAX_RETRIES) {
          throw lastError;
        }
      }
    }
  }
  
  /**
   * Connect directly to LiveKit room for CUSTOM mode
   * This bypasses the SDK's session.start() which doesn't work with external LiveKit rooms
   */
  private async connectToLiveKitRoom(livekitUrl: string, livekitToken: string, roomName: string): Promise<void> {
    console.log("🔌 Connecting to LiveKit room:", { livekitUrl, roomName, hasToken: !!livekitToken });
    
    // Create LiveKit Room instance
    this.liveKitRoom = new Room({
      adaptiveStream: true,
      dynacast: true,
    });
    
    // Set up room event handlers
    this.liveKitRoom.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      console.log("📹 LiveKit track subscribed:", { 
        kind: track.kind, 
        participantIdentity: participant.identity,
        trackSid: track.sid 
      });
      
      // Attach video track from avatar participant
      if (track.kind === Track.Kind.Video && participant.identity.toLowerCase().includes('avatar')) {
        console.log("🎬 Attaching avatar video track to video element");
        if (this.config.videoRef.current) {
          track.attach(this.config.videoRef.current);
          this.videoAttached = true;
          this.config.onStreamReady?.();
          this.config.onVideoReady?.();
          console.log("✅ Avatar video attached successfully");
          
          // Force play
          const videoEl = this.config.videoRef.current;
          videoEl.muted = false;
          videoEl.volume = getGlobalVolume();
          videoEl.play().catch(err => {
            console.warn("⚠️ Video autoplay prevented, trying muted:", err);
            videoEl.muted = true;
            videoEl.play().then(() => {
              setTimeout(() => { 
                videoEl.muted = false; 
                videoEl.volume = getGlobalVolume();
              }, 500);
            });
          });
        }
      }
      
      // Also attach audio track
      if (track.kind === Track.Kind.Audio && participant.identity.toLowerCase().includes('avatar')) {
        console.log("🔊 Attaching avatar audio track");
        if (this.config.videoRef.current) {
          track.attach(this.config.videoRef.current);
        }
      }
    });
    
    this.liveKitRoom.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      console.log("📵 LiveKit track unsubscribed:", track.kind);
      track.detach();
    });
    
    this.liveKitRoom.on(RoomEvent.Disconnected, () => {
      console.log("📵 LiveKit room disconnected");
      this.config.onStreamDisconnected?.();
    });
    
    this.liveKitRoom.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      console.log("👤 Participant connected:", participant.identity);
    });
    
    // Connect to the room
    console.log("🔄 Connecting to LiveKit room...");
    await this.liveKitRoom.connect(livekitUrl, livekitToken);
    console.log("✅ Connected to LiveKit room:", this.liveKitRoom.name);
    
    // Check for existing participants (avatar may have joined before us)
    const participants = Array.from(this.liveKitRoom.remoteParticipants.values());
    for (const participant of participants) {
      console.log("👤 Existing participant:", participant.identity);
      const publications = Array.from(participant.trackPublications.values());
      for (const publication of publications) {
        if (publication.track && publication.isSubscribed) {
          const track = publication.track as RemoteTrack;
          if (track.kind === Track.Kind.Video && participant.identity.toLowerCase().includes('avatar')) {
            console.log("🎬 Found existing avatar video track, attaching...");
            if (this.config.videoRef.current) {
              track.attach(this.config.videoRef.current);
              this.videoAttached = true;
              this.config.onStreamReady?.();
              this.config.onVideoReady?.();
            }
          }
        }
      }
    }
  }

  async stop(): Promise<void> {
    console.log("🛑 Stopping LiveAvatar session...");
    this.stopCurrentAudio();
    this.videoAttached = false;
    
    // Stop ElevenLabs STT
    await this.stopElevenLabsSTT();
    
    // Stop all tracks in the MediaStream to release camera/mic
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => {
        track.stop();
        console.log(`🛑 Stopped track: ${track.kind}`);
      });
      this.mediaStream = null;
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
    
    // Clear video element
    if (this.config.videoRef.current) {
      this.config.videoRef.current.pause();
      this.config.videoRef.current.srcObject = null;
    }
    
    // Disconnect from LiveKit room (for CUSTOM mode with direct connection)
    if (this.liveKitRoom) {
      console.log("📵 Disconnecting from LiveKit room...");
      try {
        await this.liveKitRoom.disconnect();
      } catch (e) {
        console.warn("Error disconnecting from LiveKit room:", e);
      }
      this.liveKitRoom = null;
    }
    
    // Stop the LiveAvatar session - SDK handles LiveKit disconnection internally (for FULL mode)
    if (this.session && !this.useDirectLiveKit) {
      console.log("📵 Stopping LiveAvatar SDK session...");
      try {
        await this.session.stop();
      } catch (e) {
        console.warn("Error stopping SDK session:", e);
      }
    }
    this.session = null;
    this.useDirectLiveKit = false;
    
    console.log("✅ LiveAvatar session stopped and resources released");
  }

  /**
   * Start ElevenLabs STT - captures microphone and streams to backend
   * Uses MediaRecorder API which works on mobile devices in iframes
   */
  private async startElevenLabsSTT(): Promise<void> {
    console.log("🎤 Starting ElevenLabs STT (replacing HeyGen's built-in STT)...");
    
    try {
      // Request microphone access using cached system to avoid repeated permission prompts
      this.mediaStream = await requestMicrophoneOnce({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
      console.log("✅ Microphone access granted (using cached stream)");
      
      // Connect to ElevenLabs STT WebSocket
      const wsUrl = buildAuthenticatedWsUrl('/ws/elevenlabs-stt');
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
    
    // Update ElevenLabs STT language if it's active (mobile voice chat)
    if (this.sttWebSocket?.readyState === WebSocket.OPEN && this.sttReady) {
      console.log(`🌐 Updating LiveAvatarDriver STT language to: ${languageCode}`);
      this.sttWebSocket.send(JSON.stringify({
        type: 'update_language',
        languageCode: languageCode.split('-')[0] || 'en',
      }));
    }
  }

  /**
   * Get the LiveAvatar session token for proper cleanup when ending session
   */
  getLiveAvatarSessionToken(): string | null {
    return this.liveAvatarSessionToken;
  }

  async speak(text: string, languageCodeOverride?: string): Promise<void> {
    if (!this.session) return;

    // Ensure video is unmuted with current volume - SDK plays audio through WebRTC stream
    if (this.config.videoRef.current) {
      this.config.videoRef.current.muted = false;
      this.config.videoRef.current.volume = getGlobalVolume();
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
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
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

  private async fetchSessionCredentials(): Promise<{ 
    sessionId: string; 
    sessionToken: string;
    mode?: string;
    livekit_url?: string;
    livekit_room?: string;
    livekit_token?: string;
  }> {
    console.log("🔑 Fetching LiveAvatar session credentials for:", this.config.avatarId);
    
    const response = await fetch("/api/heygen/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      credentials: "include",
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
      mode: data.mode,
      hasLiveKitConfig: !!(data.livekit_url && data.livekit_room && data.livekit_token),
    });
    
    return {
      sessionId: data.sessionId || data.session_id,
      sessionToken: data.sessionToken || data.session_token,
      mode: data.mode,
      livekit_url: data.livekit_url,
      livekit_room: data.livekit_room,
      livekit_token: data.livekit_token,
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
    
    // Ensure video is unmuted with current volume for SDK audio playback
    if (this.config.videoRef.current) {
      this.config.videoRef.current.muted = false;
      this.config.videoRef.current.volume = getGlobalVolume();
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
      this.streamingAvatar.on(StreamingEvents.STREAM_READY, async (event: any) => {
        console.log("🎬 HeyGen STREAM_READY event received");
        this.mediaStream = event.detail;
        
        // Attach stream to video element with proper audio handling
        if (this.config.videoRef.current && this.mediaStream) {
          const videoEl = this.config.videoRef.current;
          videoEl.srcObject = this.mediaStream;
          
          // Set webkit-specific attributes for mobile
          videoEl.setAttribute('webkit-playsinline', 'true');
          videoEl.setAttribute('x5-playsinline', 'true');
          videoEl.setAttribute('playsinline', 'true');
          
          // Ensure audio is enabled
          videoEl.muted = false;
          videoEl.volume = getGlobalVolume();
          
          videoEl.onloadedmetadata = async () => {
            try {
              // Try to play with audio first
              videoEl.muted = false;
              await videoEl.play();
              console.log("✅ Video playing with audio");
            } catch (err: any) {
              console.warn("⚠️ Video autoplay with audio prevented:", err?.message || err);
              
              // Strategy: Play muted first, then unmute
              try {
                videoEl.muted = true;
                await videoEl.play();
                console.log("✅ Video playing muted, attempting unmute...");
                
                // Unmute after short delay
                setTimeout(() => {
                  videoEl.muted = false;
                  console.log("🔊 Video unmuted");
                }, 300);
              } catch (mutedError) {
                console.error("❌ Video play failed even muted:", mutedError);
              }
            }
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
      
      // Get HeyGen voice ID for streaming
      const heygenVoiceId = this.config.avatarConfig?.heygenVoiceId;
      
      console.log("📋 Starting HeyGen Streaming avatar:", avatarName);
      console.log("🔊 Using HeyGen voice ID:", heygenVoiceId || "default");
      
      // Build start request with optional voice settings
      const startRequest: any = {
        quality: AvatarQuality.High,
        avatarName: avatarName,
        language: this.languageCode,
        disableIdleTimeout: true,
      };
      
      // Only add voice settings if we have a valid HeyGen voice ID
      if (heygenVoiceId) {
        startRequest.voice = {
          voiceId: heygenVoiceId,
          rate: 1.0,
        };
      }
      
      // Start the avatar session
      await this.streamingAvatar.createStartAvatar(startRequest);
      
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
    
    // Stop all tracks in the MediaStream to release camera/mic
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => {
        track.stop();
        console.log(`🛑 Stopped track: ${track.kind}`);
      });
      this.mediaStream = null;
    }
    
    // Clear video element
    if (this.config.videoRef.current) {
      this.config.videoRef.current.pause();
      this.config.videoRef.current.srcObject = null;
    }
    
    console.log("✅ HeyGen Streaming session stopped and resources released");
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
      // Ensure video is unmuted before speaking - audio comes through video stream
      if (this.config.videoRef.current) {
        this.config.videoRef.current.muted = false;
        this.config.videoRef.current.volume = getGlobalVolume();
      }
      
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
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      credentials: "include",
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
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
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
      // 📱 MOBILE FIX: Use shared audio element from mobileAudio utility
      const { getSharedAudioElement } = await import('@/lib/mobileAudio');
      const audio = getSharedAudioElement();
      
      // Revoke previous blob URL if any
      if (audio.src && audio.src.startsWith('blob:')) {
        URL.revokeObjectURL(audio.src);
      }
      
      const audioUrl = URL.createObjectURL(audioBlob);
      audio.src = audioUrl;
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

      audio.load();
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
