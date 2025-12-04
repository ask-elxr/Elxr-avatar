import { 
  LiveAvatarSession, 
  SessionEvent, 
  AgentEventsEnum,
  SessionState 
} from "@heygen/liveavatar-web-sdk";
import { 
  Room, 
  RoomEvent, 
  Track, 
  RemoteTrack,
  RemoteTrackPublication,
  RemoteParticipant,
  ConnectionState
} from "livekit-client";

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
 * In CUSTOM mode, video is streamed through LiveKit room, not through the SDK
 */
export class LiveAvatarDriver implements SessionDriver {
  private session: LiveAvatarSession | null = null;
  private config: DriverConfig;
  private currentAudio: HTMLAudioElement | null = null;
  private useElevenLabsVoice: boolean = false;
  private languageCode: string = "en";
  private sessionId: string | null = null;
  private videoAttached: boolean = false;
  private livekitRoom: Room | null = null;
  private livekitCredentials: { url: string; room: string; token: string } | null = null;

  constructor(config: DriverConfig) {
    this.config = config;
    this.languageCode = config.languageCode || "en";
    
    // CUSTOM mode doesn't support HeyGen's text-to-speech (repeat() method)
    // In CUSTOM mode, we MUST use ElevenLabs TTS and animate lip-sync
    // This is the designed behavior: CUSTOM mode = external LLM + external TTS + HeyGen avatar for lip-sync
    this.useElevenLabsVoice = true;
    
    console.log(`🎙️ LiveAvatarDriver: CUSTOM mode - Using ElevenLabs voice with lip-sync for ${config.avatarConfig.name || config.avatarId}`);
  }

  private attachVideoTrack(track: RemoteTrack): void {
    if (!this.config.videoRef.current) {
      console.warn("⚠️ Video ref not available for track attachment");
      return;
    }
    
    console.log("🎬 Attaching LiveKit video track to video element");
    const element = track.attach();
    
    if (element instanceof HTMLVideoElement) {
      this.config.videoRef.current.srcObject = element.srcObject;
      this.config.videoRef.current.play().catch(console.error);
    } else {
      track.attach(this.config.videoRef.current);
      this.config.videoRef.current.play().catch(console.error);
    }
    
    this.videoAttached = true;
    this.config.onStreamReady?.();
    console.log("✅ LiveKit video track attached successfully");
  }

  private async connectToLiveKitRoom(): Promise<void> {
    if (!this.livekitCredentials) {
      console.warn("⚠️ No LiveKit credentials available for CUSTOM mode");
      return;
    }

    console.log("🔌 Connecting to LiveKit room for video stream...", {
      room: this.livekitCredentials.room,
      url: this.livekitCredentials.url.substring(0, 30) + "..."
    });

    this.livekitRoom = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: { width: 1280, height: 720 }
      }
    });

    this.livekitRoom.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      console.log("📺 LiveKit track subscribed:", {
        kind: track.kind,
        participantId: participant.identity,
        trackSid: track.sid
      });
      
      if (track.kind === Track.Kind.Video) {
        this.attachVideoTrack(track);
      }
      
      if (track.kind === Track.Kind.Audio) {
        console.log("🔊 LiveKit audio track received - attaching");
        track.attach();
      }
    });

    this.livekitRoom.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      console.log("📺 LiveKit track unsubscribed:", track.kind);
      track.detach();
    });

    this.livekitRoom.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      console.log("🔌 LiveKit connection state:", state);
    });

    this.livekitRoom.on(RoomEvent.Disconnected, () => {
      console.log("📵 LiveKit room disconnected");
      this.config.onStreamDisconnected?.();
    });

    this.livekitRoom.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      console.log("👤 Participant connected:", participant.identity);
    });

    try {
      await this.livekitRoom.connect(this.livekitCredentials.url, this.livekitCredentials.token);
      console.log("✅ Connected to LiveKit room:", this.livekitCredentials.room);
      
      this.livekitRoom.remoteParticipants.forEach((participant) => {
        participant.trackPublications.forEach((publication) => {
          if (publication.track && publication.track.kind === Track.Kind.Video) {
            console.log("📺 Found existing video track from:", participant.identity);
            this.attachVideoTrack(publication.track as RemoteTrack);
          }
          if (publication.track && publication.track.kind === Track.Kind.Audio) {
            console.log("🔊 Found existing audio track from:", participant.identity);
            (publication.track as RemoteTrack).attach();
          }
        });
      });
    } catch (error) {
      console.error("❌ Failed to connect to LiveKit room:", error);
      throw error;
    }
  }

  async start(): Promise<void> {
    console.log("🚀 LiveAvatarDriver.start() called for:", this.config.avatarId);
    
    // Fetch session credentials from the backend
    const { sessionId, sessionToken } = await this.fetchSessionCredentials();
    this.sessionId = sessionId;
    
    console.log("📋 Creating LiveAvatar session:", { sessionId, hasToken: !!sessionToken });
    
    // Create LiveAvatarSession with the token
    const session = new LiveAvatarSession(sessionToken, {
      voiceChat: true, // Enable voice chat for voice input
    });
    this.session = session;

    // Listen for stream ready event (informational in CUSTOM mode - video comes from LiveKit)
    session.on(SessionEvent.SESSION_STREAM_READY, () => {
      console.log("🎬 LiveAvatar SESSION_STREAM_READY event received (CUSTOM mode uses LiveKit for video)");
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

    // Start the session
    console.log("🔄 Calling session.start()...");
    await session.start();
    console.log("✅ session.start() completed");
    
    if (this.useElevenLabsVoice) {
      console.log("✅ LiveAvatar session started - text-based lip-sync with ElevenLabs audio");
      if (this.config.videoRef.current) {
        this.config.videoRef.current.muted = true;
      }
    } else {
      console.log("✅ LiveAvatar session started - using native HeyGen voice");
    }
    
    // Connect to LiveKit room for video streaming in CUSTOM mode
    if (this.livekitCredentials) {
      console.log("🔌 Connecting to LiveKit room for video stream (CUSTOM mode)...");
      await this.connectToLiveKitRoom();
    } else {
      console.log("⚠️ No LiveKit credentials - falling back to SDK attach method");
    }
  }

  async stop(): Promise<void> {
    this.stopCurrentAudio();
    this.videoAttached = false;
    
    // Disconnect from LiveKit room first
    if (this.livekitRoom) {
      console.log("📵 Disconnecting from LiveKit room...");
      await this.livekitRoom.disconnect();
      this.livekitRoom = null;
    }
    this.livekitCredentials = null;
    
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

    // In CUSTOM mode, the avatar video streams through LiveKit but repeat() is not supported
    // We play ElevenLabs audio for voice - the avatar will show but without lip-sync animation
    // Future improvement: publish audio to LiveKit for lip-sync
    console.log("🎙️ CUSTOM mode: Playing ElevenLabs voice with avatar video (no lip-sync in CUSTOM mode)");
    
    // Mute the video element to prevent any audio interference
    if (this.config.videoRef.current) {
      this.config.videoRef.current.muted = true;
    }
    
    // Note: repeat() is NOT supported in CUSTOM mode - it generates "Unsupported command" errors
    // For lip-sync in CUSTOM mode, we would need to publish audio to LiveKit room
    // For now, we just play ElevenLabs audio without lip-sync animation
    
    // Play ElevenLabs audio for the actual voice
    await this.playElevenLabsAudio(text, languageCodeOverride);
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
    
    // Store LiveKit credentials for CUSTOM mode video streaming
    if (data.livekit) {
      this.livekitCredentials = {
        url: data.livekit.url,
        room: data.livekit.room,
        token: data.livekit.token,
      };
      console.log("📦 LiveKit credentials received for CUSTOM mode:", {
        room: this.livekitCredentials.room,
        hasToken: !!this.livekitCredentials.token
      });
    }
    
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
