import StreamingAvatar, {
  AvatarQuality,
  StreamingEvents,
  TaskType,
} from "@heygen/streaming-avatar";

export interface SessionDriver {
  start(): Promise<void>;
  stop(): Promise<void>;
  speak(text: string, languageCode?: string): Promise<void>;
  interrupt(): Promise<void>;
  supportsVoiceInput(): boolean;
  setLanguage?(languageCode: string): void;
}

/**
 * HeyGen Realtime Audio Streamer
 * Handles WebSocket connection to HeyGen for streaming PCM audio with lip-sync
 */
class HeyGenRealtimeStreamer {
  private ws: WebSocket | null = null;
  private isConnected: boolean = false;
  private eventIdCounter: number = 0;
  private currentEventId: string | null = null;
  private onStartTalking?: () => void;
  private onStopTalking?: () => void;

  constructor(
    onStartTalking?: () => void,
    onStopTalking?: () => void
  ) {
    this.onStartTalking = onStartTalking;
    this.onStopTalking = onStopTalking;
  }

  async connect(realtimeEndpoint: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log("🔌 Connecting to HeyGen realtime WebSocket:", realtimeEndpoint);
        this.ws = new WebSocket(realtimeEndpoint);

        this.ws.onopen = () => {
          console.log("✅ HeyGen realtime WebSocket connected");
          this.isConnected = true;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log("📩 HeyGen realtime event:", data.type);
            
            switch (data.type) {
              case "avatar.start_talking":
                this.onStartTalking?.();
                break;
              case "avatar.stop_talking":
                this.onStopTalking?.();
                break;
              case "error":
                console.error("❌ HeyGen realtime error:", data.error);
                break;
            }
          } catch (e) {
            console.warn("Failed to parse HeyGen message:", e);
          }
        };

        this.ws.onerror = (error) => {
          console.error("❌ HeyGen realtime WebSocket error:", error);
          this.isConnected = false;
          reject(error);
        };

        this.ws.onclose = () => {
          console.log("🔌 HeyGen realtime WebSocket closed");
          this.isConnected = false;
        };

        // Timeout after 10 seconds
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error("WebSocket connection timeout"));
          }
        }, 10000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Send PCM audio to HeyGen for lip-sync
   * @param pcmData - PCM 16-bit 24kHz audio buffer
   */
  async sendAudio(pcmData: ArrayBuffer): Promise<void> {
    if (!this.ws || !this.isConnected) {
      throw new Error("WebSocket not connected");
    }

    // Generate new event ID for this audio utterance
    this.currentEventId = `audio_${++this.eventIdCounter}_${Date.now()}`;
    const base64Audio = this.arrayBufferToBase64(pcmData);

    // Send audio chunk
    this.ws.send(JSON.stringify({
      type: "agent.speak",
      event_id: this.currentEventId,
      audio: base64Audio,
    }));

    console.log(`🎤 Sent ${pcmData.byteLength} bytes of PCM audio to HeyGen (event: ${this.currentEventId})`);
  }

  /**
   * Signal end of audio utterance - reuses the event_id from sendAudio
   */
  endOfUtterance(): void {
    if (!this.ws || !this.isConnected) return;
    if (!this.currentEventId) {
      console.warn("⚠️ No current event ID for speak_end");
      return;
    }

    this.ws.send(JSON.stringify({
      type: "agent.speak_end",
      event_id: this.currentEventId,
    }));
    
    console.log(`🔚 Sent speak_end to HeyGen (event: ${this.currentEventId})`);
    this.currentEventId = null;
  }

  /**
   * Interrupt current speech
   */
  interrupt(): void {
    if (!this.ws || !this.isConnected) return;

    this.ws.send(JSON.stringify({
      type: "agent.interrupt",
    }));
    
    console.log("⏹️ Sent interrupt to HeyGen");
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }

  isReady(): boolean {
    return this.isConnected;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
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
  private realtimeStreamer: HeyGenRealtimeStreamer | null = null;
  private sessionId: string | null = null;

  constructor(config: DriverConfig) {
    this.config = config;
    this.languageCode = config.languageCode || "en";
    
    // Use ElevenLabs when avatar has ElevenLabs voice but no HeyGen voice
    // This provides voice consistency between audio-only and video modes for avatars like Shawn, Judy, Kelsey
    this.useElevenLabsVoice = !config.avatarConfig.heygenVoiceId && 
                              !!config.avatarConfig.elevenlabsVoiceId;
    
    if (this.useElevenLabsVoice) {
      console.log(`🎙️ HeyGenDriver: Using ElevenLabs voice with lip-sync for ${config.avatarConfig.name || config.avatarId}`);
    } else {
      console.log(`🎙️ HeyGenDriver: Using HeyGen voice for ${config.avatarConfig.name || config.avatarId}`);
    }
  }

  async start(): Promise<void> {
    const token = await this.fetchAccessToken();
    const avatar = new StreamingAvatar({ token });
    this.avatar = avatar;

    avatar.on(StreamingEvents.STREAM_READY, async (event) => {
      console.log("Stream ready:", event.detail);
      if (this.config.videoRef.current) {
        this.config.videoRef.current.srcObject = event.detail;
        this.config.videoRef.current.play().catch(console.error);
      }
      
      this.config.onStreamReady?.();
    });

    avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
      console.log("Stream disconnected");
      this.realtimeStreamer?.disconnect();
      this.config.onStreamDisconnected?.();
    });

    // Wire up HeyGen talking events for native voice mode
    // For ElevenLabs mode, events come from the realtime streamer
    if (!this.useElevenLabsVoice) {
      avatar.on(StreamingEvents.AVATAR_START_TALKING, () => {
        this.config.onAvatarStartTalking?.();
      });

      avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
        this.config.onAvatarStopTalking?.();
      });
    }

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
    
    // Configure voice for HeyGen session
    // For avatars with only ElevenLabs voice, we use a fallback voice for session init
    // Actual audio will come via realtime WebSocket for lip-sync
    const FALLBACK_HEYGEN_VOICE_ID = "1bd001e7e50f421d891986aad5158bc8"; // Wayne - neutral male voice
    
    if (this.config.avatarConfig.heygenVoiceId) {
      // Use HeyGen's native voice with lip-sync
      avatarStartConfig.voice = {
        voiceId: this.config.avatarConfig.heygenVoiceId,
        rate: parseFloat(this.config.avatarConfig.voiceRate || "1.0"),
      };
      console.log(`🎙️ HeyGenDriver: Using HeyGen native voice: ${this.config.avatarConfig.heygenVoiceId}`);
    } else {
      // Use fallback voice for session initialization
      // ElevenLabs audio will be streamed via realtime WebSocket for lip-sync
      avatarStartConfig.voice = {
        voiceId: FALLBACK_HEYGEN_VOICE_ID,
        rate: parseFloat(this.config.avatarConfig.voiceRate || "1.0"),
      };
      console.log(`🎙️ HeyGenDriver: Using fallback voice for init, ElevenLabs audio via realtime API`);
    }
    
    const sessionInfo = await avatar.createStartAvatar(avatarStartConfig);
    console.log("📋 HeyGen session info:", sessionInfo);
    
    // Store session ID for reference
    if (sessionInfo) {
      this.sessionId = (sessionInfo as any).session_id || (sessionInfo as any).sessionId || null;
      console.log("📋 Session ID:", this.sessionId);
      
      // For ElevenLabs voice avatars, try to get the realtime endpoint for lip-sync
      if (this.useElevenLabsVoice) {
        const realtimeEndpoint = (sessionInfo as any).realtime_endpoint || 
                                 (sessionInfo as any).data?.realtime_endpoint ||
                                 (sessionInfo as any).webrtc?.realtime_endpoint;
        
        console.log("📋 All session info keys:", Object.keys(sessionInfo));
        console.log("📍 Realtime endpoint from session:", realtimeEndpoint);
        
        if (realtimeEndpoint) {
          try {
            console.log("🔌 Initializing realtime audio streamer for lip-sync...");
            this.realtimeStreamer = new HeyGenRealtimeStreamer(
              () => this.config.onAvatarStartTalking?.(),
              () => this.config.onAvatarStopTalking?.()
            );
            await this.realtimeStreamer.connect(realtimeEndpoint);
            console.log("✅ Realtime audio streamer ready for ElevenLabs lip-sync");
          } catch (error) {
            console.warn("⚠️ Failed to connect realtime streamer, falling back to audio-only:", error);
            this.realtimeStreamer = null;
          }
        } else {
          console.warn("⚠️ No realtime endpoint in session info, using audio-only fallback");
        }
      }
    }
    
    if (this.useElevenLabsVoice) {
      console.log("✅ HeyGen avatar started - ElevenLabs lip-sync mode enabled");
    }
  }

  async stop(): Promise<void> {
    this.stopCurrentAudio();
    this.realtimeStreamer?.disconnect();
    this.realtimeStreamer = null;
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
    if (this.useElevenLabsVoice) {
      // Use ElevenLabs audio for correct voice
      await this.speakWithElevenLabs(text, languageCodeOverride);
    } else if (this.avatar) {
      // Use HeyGen's built-in TTS with lip-sync
      await this.avatar.speak({
        text,
        task_type: TaskType.REPEAT,
      });
    }
  }

  private async speakWithElevenLabs(text: string, languageCodeOverride?: string): Promise<void> {
    try {
      this.stopCurrentAudio();

      // Try to use realtime streamer for lip-sync if available
      if (this.realtimeStreamer?.isReady()) {
        console.log("🎤 Using realtime audio streaming for lip-sync");
        await this.speakWithRealtimeLipSync(text, languageCodeOverride);
        return;
      }

      // Fallback to regular audio playback without lip-sync
      console.log("⚠️ Realtime streamer not available, using audio-only playback");
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

  private async speakWithRealtimeLipSync(text: string, languageCodeOverride?: string): Promise<void> {
    if (!this.realtimeStreamer?.isReady()) {
      throw new Error("Realtime streamer not ready");
    }

    try {
      // Get PCM audio from ElevenLabs
      const response = await fetch("/api/elevenlabs/tts-pcm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          avatarId: this.config.avatarId || this.config.avatarConfig.id,
          languageCode: languageCodeOverride || this.languageCode,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate PCM audio from ElevenLabs");
      }

      const pcmArrayBuffer = await response.arrayBuffer();
      console.log(`📦 Received ${pcmArrayBuffer.byteLength} bytes of PCM audio`);

      // Send PCM audio to HeyGen for lip-sync
      await this.realtimeStreamer.sendAudio(pcmArrayBuffer);
      this.realtimeStreamer.endOfUtterance();

      // Also play the audio locally for the user to hear
      // Convert PCM to playable format using AudioContext
      await this.playPCMAudio(pcmArrayBuffer);

    } catch (error) {
      console.error("Error in realtime lip-sync:", error);
      this.config.onAvatarStopTalking?.();
      throw error;
    }
  }

  private async playPCMAudio(pcmData: ArrayBuffer): Promise<void> {
    try {
      const audioContext = new AudioContext({ sampleRate: 24000 });
      
      // PCM 16-bit signed little-endian at 24kHz
      const pcmInt16 = new Int16Array(pcmData);
      const samples = pcmInt16.length;
      
      // Create audio buffer
      const audioBuffer = audioContext.createBuffer(1, samples, 24000);
      const channelData = audioBuffer.getChannelData(0);
      
      // Convert Int16 to Float32 (-1 to 1 range)
      for (let i = 0; i < samples; i++) {
        channelData[i] = pcmInt16[i] / 32768;
      }
      
      // Play the audio
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start();
      
      // Cleanup when done
      source.onended = () => {
        audioContext.close();
      };
    } catch (error) {
      console.error("Error playing PCM audio:", error);
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
