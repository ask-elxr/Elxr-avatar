import { useState, useRef, useEffect, useCallback } from "react";
import { getAuthHeaders } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Square, Mic, Volume2 } from "lucide-react";
import { Room, RoomEvent, Track, RemoteTrack, RemoteTrackPublication, RemoteParticipant } from "livekit-client";

const AVATARS = [
  { id: "kelsey", name: "Kelsey" },
  { id: "mark-kohl", name: "Mark Kohl" },
  { id: "nigel", name: "Nigel" },
  { id: "thad", name: "Thad" },
  { id: "willie-gault", name: "Willie Gault" },
  { id: "ann", name: "Ann" },
  { id: "dexter", name: "Dexter" },
  { id: "judy", name: "Judy" },
  { id: "june", name: "June" },
  { id: "shawn", name: "Shawn" },
];

interface LogEntry {
  timestamp: string;
  level: "info" | "error" | "success" | "debug";
  message: string;
}

export default function LiveAvatarTest() {
  const [selectedAvatar, setSelectedAvatar] = useState("kelsey");
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [videoState, setVideoState] = useState<any>(null);
  const [liveKitState, setLiveKitState] = useState<string>("disconnected");
  const [sessionState, setSessionState] = useState<string>("idle");
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  const sessionRef = useRef<any>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const log = useCallback((level: LogEntry["level"], message: string) => {
    const entry: LogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
    };
    setLogs(prev => [...prev, entry]);
    console.log(`[${level.toUpperCase()}] ${message}`);
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const updateVideoState = useCallback(() => {
    if (videoRef.current) {
      const v = videoRef.current;
      setVideoState({
        srcObject: v.srcObject ? "present" : "null",
        readyState: v.readyState,
        videoWidth: v.videoWidth,
        videoHeight: v.videoHeight,
        paused: v.paused,
        muted: v.muted,
      });
    }
  }, []);

  const handleStart = async () => {
    setIsLoading(true);
    setLogs([]);
    log("info", `Starting LiveAvatar test with avatar: ${selectedAvatar}`);

    try {
      // Step 1: Get token from backend
      log("info", "Step 1: Fetching token from /api/heygen/token...");
      const tokenResponse = await fetch("/api/heygen/token", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          userId: `test-user-${Date.now()}`,
          avatarId: selectedAvatar,
        }),
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        throw new Error(`Token fetch failed: ${error}`);
      }

      const tokenData = await tokenResponse.json();
      log("success", `Token received! Session ID: ${tokenData.session_id}`);
      log("debug", `LiveKit URL: ${tokenData.livekit_url?.substring(0, 40)}...`);
      log("debug", `LiveKit Room: ${tokenData.livekit_room}`);
      log("debug", `Has frontend_token: ${!!tokenData.frontend_token}`);
      log("debug", `Has livekit_client_token: ${!!tokenData.livekit_client_token}`);

      // Step 2: Import LiveAvatar SDK dynamically
      log("info", "Step 2: Importing LiveAvatar SDK...");
      const { LiveAvatarSession } = await import("@heygen/liveavatar-web-sdk");
      log("success", "LiveAvatar SDK imported");

      // Step 3: Connect to LiveKit FIRST (before session.start)
      log("info", "Step 3: Connecting to LiveKit room (BEFORE session.start)...");
      setLiveKitState("connecting");
      
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;

      // Set up LiveKit event handlers
      room.on(RoomEvent.ConnectionStateChanged, (state) => {
        log("debug", `LiveKit connection state: ${state}`);
        setLiveKitState(state);
      });

      room.on(RoomEvent.ParticipantConnected, (participant) => {
        log("success", `LiveKit participant connected: ${participant.identity}`);
      });

      room.on(RoomEvent.TrackSubscribed, (
        track: RemoteTrack,
        publication: RemoteTrackPublication,
        participant: RemoteParticipant
      ) => {
        log("info", `LiveKit track subscribed: ${track.kind} from ${participant.identity}`);
        
        if (track.kind === Track.Kind.Video && videoRef.current) {
          log("success", "Attaching video track to video element...");
          track.attach(videoRef.current);
          updateVideoState();
          
          // Check video state after a moment
          setTimeout(() => {
            updateVideoState();
            if (videoRef.current && videoRef.current.videoWidth > 0) {
              log("success", `Video playing: ${videoRef.current.videoWidth}x${videoRef.current.videoHeight}`);
            }
          }, 1000);
        }
        
        if (track.kind === Track.Kind.Audio) {
          log("info", "Audio track received (avatar sends audio for lip-sync reference)");
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        log("info", "LiveKit disconnected");
        setLiveKitState("disconnected");
      });

      // Connect to LiveKit with the frontend (user) token
      const frontendToken = tokenData.frontend_token;
      if (!frontendToken) {
        throw new Error("No frontend_token in response - required for CUSTOM mode");
      }

      await room.connect(tokenData.livekit_url, frontendToken);
      log("success", `Connected to LiveKit room: ${tokenData.livekit_room}`);
      setLiveKitState("connected");

      // Step 4: Create LiveAvatar session
      log("info", "Step 4: Creating LiveAvatar session...");
      const { SessionEvent, AgentEventsEnum } = await import("@heygen/liveavatar-web-sdk");
      
      const session = new LiveAvatarSession(tokenData.session_token, {
        voiceChat: false, // We manage LiveKit connection ourselves
      });
      sessionRef.current = session;

      session.on(SessionEvent.SESSION_STATE_CHANGED, (state: any) => {
        log("debug", `LiveAvatar session state: ${state}`);
        setSessionState(String(state));
      });

      session.on(SessionEvent.SESSION_DISCONNECTED, (reason: any) => {
        log("info", `LiveAvatar disconnected: ${reason}`);
      });

      session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => {
        log("info", "Avatar started speaking");
      });

      session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
        log("info", "Avatar stopped speaking");
      });

      // Step 5: Start session - avatar joins the LiveKit room
      log("info", "Step 5: Calling session.start() - avatar will join LiveKit room...");
      
      try {
        await session.start();
        log("success", "session.start() completed successfully!");
        setIsConnected(true);
        setSessionState("connected");
      } catch (startError: any) {
        log("error", `session.start() FAILED: ${startError.message}`);
        log("error", `Error details: ${JSON.stringify(startError)}`);
        throw startError;
      }

      // Step 6: Check room state
      log("info", "Step 6: Checking LiveKit room state...");
      const participants = Array.from(room.remoteParticipants.values());
      log("debug", `Remote participants: ${participants.map(p => p.identity).join(", ") || "none"}`);
      
      participants.forEach(p => {
        const tracks = Array.from(p.trackPublications.values());
        log("debug", `Participant ${p.identity} has ${tracks.length} tracks`);
        tracks.forEach(t => {
          log("debug", `  - ${t.kind}: subscribed=${t.isSubscribed}`);
        });
      });

      updateVideoState();

    } catch (error: any) {
      log("error", `Error: ${error.message}`);
      setSessionState("error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    log("info", "Stopping session...");
    
    try {
      if (sessionRef.current) {
        await sessionRef.current.stop();
        log("success", "LiveAvatar session stopped");
      }
    } catch (e: any) {
      log("error", `Error stopping session: ${e.message}`);
    }
    
    try {
      if (roomRef.current) {
        roomRef.current.disconnect();
        log("success", "LiveKit room disconnected");
      }
    } catch (e: any) {
      log("error", `Error disconnecting room: ${e.message}`);
    }
    
    sessionRef.current = null;
    roomRef.current = null;
    setIsConnected(false);
    setLiveKitState("disconnected");
    setSessionState("idle");
    setVideoState(null);
  };

  const handleSpeak = async () => {
    if (!sessionRef.current) {
      log("error", "No active session");
      return;
    }

    const text = "Hello, this is a test of the LiveAvatar lip-sync functionality.";
    log("info", `Sending speak command: "${text}"`);
    
    try {
      await sessionRef.current.speak(text);
      log("success", "Speak command sent");
    } catch (e: any) {
      log("error", `Speak error: ${e.message}`);
    }
  };

  const clearLogs = () => setLogs([]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">LiveAvatar Integration Test</h1>
        <p className="text-gray-400 mb-6">
          Minimal test page to validate LiveAvatar SDK + LiveKit integration for all avatars.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Controls */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white">Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Select Avatar</label>
                <Select value={selectedAvatar} onValueChange={setSelectedAvatar} disabled={isConnected}>
                  <SelectTrigger className="bg-gray-700 border-gray-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AVATARS.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button 
                  onClick={handleStart} 
                  disabled={isLoading || isConnected}
                  className="flex-1"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                  Start
                </Button>
                <Button 
                  onClick={handleStop} 
                  disabled={!isConnected}
                  variant="destructive"
                  className="flex-1"
                >
                  <Square className="w-4 h-4 mr-2" />
                  Stop
                </Button>
              </div>

              <Button 
                onClick={handleSpeak} 
                disabled={!isConnected}
                variant="secondary"
                className="w-full"
              >
                <Volume2 className="w-4 h-4 mr-2" />
                Test Speak
              </Button>

              {/* Status Badges */}
              <div className="flex flex-wrap gap-2">
                <Badge variant={liveKitState === "connected" ? "default" : "secondary"}>
                  LiveKit: {liveKitState}
                </Badge>
                <Badge variant={sessionState === "connected" || sessionState === "CONNECTED" ? "default" : "secondary"}>
                  Session: {sessionState}
                </Badge>
              </div>

              {/* Video State */}
              {videoState && (
                <div className="bg-gray-700 p-3 rounded text-xs font-mono">
                  <div className="text-gray-400 mb-1">Video Element State:</div>
                  <pre>{JSON.stringify(videoState, null, 2)}</pre>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Video Display */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white">Video Output</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative aspect-video bg-black rounded overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-contain"
                  onLoadedMetadata={() => {
                    log("debug", "Video: loadedmetadata event");
                    updateVideoState();
                  }}
                  onPlay={() => {
                    log("debug", "Video: play event");
                    updateVideoState();
                  }}
                  onError={(e) => {
                    log("error", `Video error: ${JSON.stringify(e)}`);
                  }}
                />
                {!isConnected && !isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                    Select an avatar and click Start
                  </div>
                )}
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 className="w-8 h-8 animate-spin" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Logs */}
        <Card className="bg-gray-800 border-gray-700 mt-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-white">Debug Logs</CardTitle>
            <Button variant="ghost" size="sm" onClick={clearLogs}>Clear</Button>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-900 rounded p-3 h-64 overflow-y-auto font-mono text-xs">
              {logs.map((entry, i) => (
                <div 
                  key={i} 
                  className={`mb-1 ${
                    entry.level === "error" ? "text-red-400" :
                    entry.level === "success" ? "text-green-400" :
                    entry.level === "debug" ? "text-gray-500" :
                    "text-blue-400"
                  }`}
                >
                  <span className="text-gray-600">[{entry.timestamp}]</span> {entry.message}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
