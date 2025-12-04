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
  ConnectionState,
  LocalAudioTrack
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
  private audioContext: AudioContext | null = null;
  private publishedAudioTrack: LocalAudioTrack | null = null;
  private mediaStreamDestination: MediaStreamAudioDestinationNode | null = null;

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
    
    // Clean up audio context
    if (this.audioContext) {
      try {
        await this.audioContext.close();
      } catch (e) {
        // Ignore
      }
      this.audioContext = null;
    }
    
    // Disconnect from LiveKit room first
    if (this.livekitRoom) {
      console.log("📵 Disconnecting from LiveKit room...");
      await this.unpublishAudioTrack();
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

    // In CUSTOM mode, we publish audio to LiveKit so HeyGen can animate the avatar's lips
    console.log("🎙️ CUSTOM mode: Publishing audio to LiveKit for lip-sync");
    
    // Mute the video element to prevent echo (audio comes from our own playback)
    if (this.config.videoRef.current) {
      this.config.videoRef.current.muted = true;
    }
    
    // Play ElevenLabs audio and publish to LiveKit for lip-sync
    await this.playElevenLabsAudio(text, languageCodeOverride);
  }

  /**
   * Play ElevenLabs audio for the avatar's voice AND publish to LiveKit for lip-sync
   * The audio is published to LiveKit so HeyGen can animate the avatar's lips
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
      const arrayBuffer = await audioBlob.arrayBuffer();
      
      // Create AudioContext if needed (use 48kHz for LiveKit compatibility)
      if (!this.audioContext) {
        this.audioContext = new AudioContext({ sampleRate: 48000 });
      }
      
      // Resume AudioContext if suspended (browser autoplay policy)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      // Decode the audio data
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      // Create source and destination nodes
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      
      // Create a MediaStreamDestination for publishing to LiveKit
      this.mediaStreamDestination = this.audioContext.createMediaStreamDestination();
      
      // Connect source to both destination (for LiveKit) and speakers (for local playback)
      source.connect(this.mediaStreamDestination);
      source.connect(this.audioContext.destination);
      
      // Publish audio to LiveKit for lip-sync (if room is connected)
      if (this.livekitRoom && this.livekitRoom.state === ConnectionState.Connected) {
        try {
          // Unpublish any existing track first
          await this.unpublishAudioTrack();
          
          // Create LocalAudioTrack from the MediaStream
          const audioTrack = this.mediaStreamDestination.stream.getAudioTracks()[0];
          if (audioTrack) {
            this.publishedAudioTrack = new LocalAudioTrack(audioTrack, undefined, false);
            await this.livekitRoom.localParticipant.publishTrack(this.publishedAudioTrack);
            console.log("🎤 Published audio to LiveKit for lip-sync");
          }
        } catch (pubError: any) {
          console.warn("⚠️ Failed to publish audio to LiveKit:", pubError?.message || pubError);
          console.warn("⚠️ LiveKit room state:", this.livekitRoom?.state);
          console.warn("⚠️ Local participant:", this.livekitRoom?.localParticipant?.identity);
          // Continue with local playback even if publishing fails
        }
      } else {
        console.log("📵 LiveKit room not connected - playing audio locally only");
      }
      
      // Track the source for stopping
      (source as any)._isPlaying = true;
      this.currentAudio = source as any;
      
      // Handle audio end - cleanup
      source.onended = async () => {
        console.log("🔊 Audio playback ended");
        await this.unpublishAudioTrack();
        this.config.onAvatarStopTalking?.();
      };
      
      // Start playback
      source.start(0);
      console.log("🔊 Playing ElevenLabs audio with LiveKit lip-sync");
      this.config.onAvatarStartTalking?.();
      
    } catch (error) {
      console.error("Error playing ElevenLabs audio:", error);
      await this.unpublishAudioTrack();
    }
  }
  
  /**
   * Unpublish audio track from LiveKit room
   */
  private async unpublishAudioTrack(): Promise<void> {
    if (this.publishedAudioTrack && this.livekitRoom) {
      try {
        await this.livekitRoom.localParticipant.unpublishTrack(this.publishedAudioTrack);
        this.publishedAudioTrack.stop();
        console.log("🔇 Unpublished audio from LiveKit");
      } catch (e) {
        console.warn("Error unpublishing audio track:", e);
      }
      this.publishedAudioTrack = null;
    }
    this.mediaStreamDestination = null;
  }

  private stopCurrentAudio(): void {
    if (this.currentAudio) {
      try {
        // Handle AudioBufferSourceNode (used for LiveKit lip-sync)
        if ((this.currentAudio as any)._isPlaying) {
          (this.currentAudio as AudioBufferSourceNode).stop();
        } else if (typeof (this.currentAudio as any).pause === 'function') {
          // Handle HTMLAudioElement (fallback)
          (this.currentAudio as HTMLAudioElement).pause();
        }
      } catch (e) {
        // AudioBufferSourceNode.stop() throws if already stopped
      }
      this.currentAudio = null;
      this.config.onAvatarStopTalking?.();
    }
    // Also unpublish from LiveKit
    this.unpublishAudioTrack();
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
