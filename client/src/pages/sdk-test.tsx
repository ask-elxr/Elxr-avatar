"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { getAuthHeaders } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Play, Square, Volume2, Mic, MicOff } from "lucide-react";
import {
  LiveAvatarSession,
  SessionState,
  SessionEvent,
  AgentEventsEnum,
  ConnectionQuality,
  VoiceChatEvent,
  VoiceChatState,
} from "@heygen/liveavatar-web-sdk";

const AVATARS = [
  { id: "kelsey", name: "Kelsey", liveAvatarId: "4fa4c788-dd88-4331-9276-8429c55e32b7" },
  { id: "mark-kohl", name: "Mark Kohl", liveAvatarId: "98917de8-81a1-4a24-ad0b-584fff35c168" },
  { id: "nigel", name: "Nigel", liveAvatarId: "0eb7418e-f377-43d5-806a-091f11e75541" },
  { id: "thad", name: "Thad", liveAvatarId: "3f462a97-2adc-4174-9c1c-b946ae4f909d" },
  { id: "willie-gault", name: "Willie Gault", liveAvatarId: "df82e86b-bca5-4a87-9119-2e9c7a708532" },
  { id: "ann", name: "Ann", liveAvatarId: "513fd1b7-7ef9-466d-9af2-344e51eeb833" },
  { id: "dexter", name: "Dexter", liveAvatarId: "bd43ce31-7425-4379-8407-60f029548e61" },
  { id: "judy", name: "Judy", liveAvatarId: "6e32f90a-f566-45be-9ec7-a5f6999ee606" },
  { id: "june", name: "June", liveAvatarId: "65f9e3c9-d48b-4118-b73a-4ae2e3cbb8f0" },
  { id: "shawn", name: "Shawn", liveAvatarId: "7b888024-f8c9-4205-95e1-78ce01497bda" },
];

interface LogEntry {
  timestamp: string;
  level: "info" | "error" | "success" | "debug";
  message: string;
}

type LiveAvatarContextType = {
  sessionRef: React.RefObject<LiveAvatarSession | null>;
  sessionState: SessionState;
  isStreamReady: boolean;
  connectionQuality: ConnectionQuality;
  isUserTalking: boolean;
  isAvatarTalking: boolean;
  isMuted: boolean;
  voiceChatState: VoiceChatState;
};

const LiveAvatarContext = createContext<LiveAvatarContextType | null>(null);

function LiveAvatarContextProvider({
  children,
  sessionAccessToken,
  onLog,
}: {
  children: React.ReactNode;
  sessionAccessToken: string;
  onLog: (level: LogEntry["level"], message: string) => void;
}) {
  const sessionRef = useRef<LiveAvatarSession | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>(SessionState.INACTIVE);
  const [isStreamReady, setIsStreamReady] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>(ConnectionQuality.UNKNOWN);
  const [isUserTalking, setIsUserTalking] = useState(false);
  const [isAvatarTalking, setIsAvatarTalking] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [voiceChatState, setVoiceChatState] = useState<VoiceChatState>(VoiceChatState.INACTIVE);

  useEffect(() => {
    onLog("info", "Creating LiveAvatarSession with token...");
    
    const session = new LiveAvatarSession(sessionAccessToken, {
      voiceChat: true,
      apiUrl: "https://api.liveavatar.com",
    });
    sessionRef.current = session;

    session.on(SessionEvent.SESSION_STATE_CHANGED, (state) => {
      onLog("debug", `Session state changed: ${state}`);
      setSessionState(state);
      if (state === SessionState.DISCONNECTED) {
        setIsStreamReady(false);
      }
    });

    session.on(SessionEvent.SESSION_STREAM_READY, () => {
      onLog("success", "Stream ready!");
      setIsStreamReady(true);
    });

    session.on(SessionEvent.SESSION_CONNECTION_QUALITY_CHANGED, (quality) => {
      onLog("debug", `Connection quality: ${quality}`);
      setConnectionQuality(quality);
    });

    session.on(AgentEventsEnum.USER_SPEAK_STARTED, () => {
      onLog("debug", "User started speaking");
      setIsUserTalking(true);
    });

    session.on(AgentEventsEnum.USER_SPEAK_ENDED, () => {
      onLog("debug", "User stopped speaking");
      setIsUserTalking(false);
    });

    session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => {
      onLog("info", "Avatar started speaking");
      setIsAvatarTalking(true);
    });

    session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
      onLog("info", "Avatar stopped speaking");
      setIsAvatarTalking(false);
    });

    session.voiceChat.on(VoiceChatEvent.MUTED, () => {
      onLog("debug", "Microphone muted");
      setIsMuted(true);
    });

    session.voiceChat.on(VoiceChatEvent.UNMUTED, () => {
      onLog("debug", "Microphone unmuted");
      setIsMuted(false);
    });

    session.voiceChat.on(VoiceChatEvent.STATE_CHANGED, (state) => {
      onLog("debug", `Voice chat state: ${state}`);
      setVoiceChatState(state);
    });

    onLog("success", "Session object created");

    return () => {
      if (sessionRef.current) {
        sessionRef.current.removeAllListeners();
        sessionRef.current.voiceChat.removeAllListeners();
      }
    };
  }, [sessionAccessToken, onLog]);

  return (
    <LiveAvatarContext.Provider
      value={{
        sessionRef,
        sessionState,
        isStreamReady,
        connectionQuality,
        isUserTalking,
        isAvatarTalking,
        isMuted,
        voiceChatState,
      }}
    >
      {children}
    </LiveAvatarContext.Provider>
  );
}

function useLiveAvatarContext() {
  const context = useContext(LiveAvatarContext);
  if (!context) throw new Error("useLiveAvatarContext must be used within LiveAvatarContextProvider");
  return context;
}

function SessionComponent({
  mode,
  onLog,
  onStop,
}: {
  mode: "FULL" | "CUSTOM";
  onLog: (level: LogEntry["level"], message: string) => void;
  onStop: () => void;
}) {
  const {
    sessionRef,
    sessionState,
    isStreamReady,
    connectionQuality,
    isUserTalking,
    isAvatarTalking,
    isMuted,
    voiceChatState,
  } = useLiveAvatarContext();

  const videoRef = useRef<HTMLVideoElement>(null);
  const [message, setMessage] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (sessionState === SessionState.DISCONNECTED) {
      onStop();
    }
  }, [sessionState, onStop]);

  useEffect(() => {
    if (isStreamReady && videoRef.current && sessionRef.current) {
      onLog("info", "Attaching video element...");
      sessionRef.current.attach(videoRef.current);
      onLog("success", "Video element attached!");
    }
  }, [isStreamReady, sessionRef, onLog]);

  useEffect(() => {
    if (sessionState === SessionState.INACTIVE && sessionRef.current && !isStarting) {
      setIsStarting(true);
      onLog("info", "Starting session...");
      sessionRef.current.start()
        .then(() => {
          onLog("success", "Session started successfully!");
        })
        .catch((error) => {
          onLog("error", `Failed to start session: ${error.message}`);
        });
    }
  }, [sessionState, sessionRef, isStarting, onLog]);

  const handleSendMessage = async () => {
    if (!sessionRef.current || !message.trim()) return;
    onLog("info", `Sending message (FULL mode): "${message}"`);
    try {
      sessionRef.current.message(message);
      setMessage("");
      onLog("success", "Message sent to AI agent");
    } catch (error: any) {
      onLog("error", `Failed to send message: ${error.message}`);
    }
  };

  const handleRepeat = () => {
    if (!sessionRef.current || !message.trim()) return;
    onLog("info", `Repeating text with avatar TTS: "${message}"`);
    try {
      sessionRef.current.repeat(message);
      setMessage("");
      onLog("success", "Repeat command sent");
    } catch (error: any) {
      onLog("error", `Failed to repeat: ${error.message}`);
    }
  };

  const handleInterrupt = () => {
    if (!sessionRef.current) return;
    onLog("info", "Interrupting avatar...");
    try {
      sessionRef.current.interrupt();
      onLog("success", "Interrupted");
    } catch (error: any) {
      onLog("error", `Failed to interrupt: ${error.message}`);
    }
  };

  const handleStop = async () => {
    if (!sessionRef.current) return;
    onLog("info", "Stopping session...");
    try {
      await sessionRef.current.stop();
      onLog("success", "Session stopped");
    } catch (error: any) {
      onLog("error", `Failed to stop: ${error.message}`);
    }
  };

  const toggleVoiceChat = async () => {
    if (!sessionRef.current) return;
    if (voiceChatState === VoiceChatState.ACTIVE) {
      await sessionRef.current.voiceChat.stop();
    } else {
      await sessionRef.current.voiceChat.start();
    }
  };

  const toggleMute = () => {
    if (!sessionRef.current) return;
    if (isMuted) {
      sessionRef.current.voiceChat.unmute();
    } else {
      sessionRef.current.voiceChat.mute();
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-contain"
        />
        {!isStreamReady && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-white" />
          </div>
        )}
        <Button
          onClick={handleStop}
          variant="destructive"
          size="sm"
          className="absolute bottom-4 right-4"
        >
          <Square className="w-4 h-4 mr-1" /> Stop
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant={sessionState === SessionState.CONNECTED ? "default" : "secondary"}>
          Session: {sessionState}
        </Badge>
        <Badge variant={isStreamReady ? "default" : "secondary"}>
          Stream: {isStreamReady ? "Ready" : "Not Ready"}
        </Badge>
        <Badge>Quality: {connectionQuality}</Badge>
        <Badge variant={isAvatarTalking ? "default" : "outline"}>
          Avatar: {isAvatarTalking ? "Talking" : "Silent"}
        </Badge>
        {mode === "FULL" && (
          <>
            <Badge variant={isUserTalking ? "default" : "outline"}>
              User: {isUserTalking ? "Talking" : "Silent"}
            </Badge>
            <Badge variant={voiceChatState === VoiceChatState.ACTIVE ? "default" : "secondary"}>
              Voice: {voiceChatState}
            </Badge>
          </>
        )}
      </div>

      {mode === "FULL" && (
        <div className="flex gap-2">
          <Button onClick={toggleVoiceChat} variant="outline">
            {voiceChatState === VoiceChatState.ACTIVE ? "Stop Voice Chat" : "Start Voice Chat"}
          </Button>
          {voiceChatState === VoiceChatState.ACTIVE && (
            <Button onClick={toggleMute} variant="outline">
              {isMuted ? <MicOff className="w-4 h-4 mr-1" /> : <Mic className="w-4 h-4 mr-1" />}
              {isMuted ? "Unmute" : "Mute"}
            </Button>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message..."
          onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
        />
        <Button onClick={handleSendMessage}>Send</Button>
        <Button onClick={handleRepeat} variant="secondary">Repeat</Button>
        <Button onClick={handleInterrupt} variant="outline">Interrupt</Button>
      </div>
    </div>
  );
}

export default function SDKTestPage() {
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);
  const [mode, setMode] = useState<"FULL" | "CUSTOM">("CUSTOM");
  const [sessionToken, setSessionToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const log = (level: LogEntry["level"], message: string) => {
    const entry: LogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
    };
    setLogs(prev => [...prev, entry]);
    console.log(`[${level.toUpperCase()}] ${message}`);
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleStart = async () => {
    setIsLoading(true);
    setLogs([]);
    log("info", `Starting ${mode} mode session for ${selectedAvatar.name}...`);
    log("debug", `LiveAvatar ID: ${selectedAvatar.liveAvatarId}`);

    try {
      log("info", "Fetching session token from backend...");
      
      const res = await fetch("/api/heygen/token", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          userId: `sdk-test-${Date.now()}`,
          avatarId: selectedAvatar.id,
        }),
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(`Token fetch failed: ${error}`);
      }

      const data = await res.json();
      log("success", `Token received! Session ID: ${data.session_id}`);
      log("debug", `Has session_token: ${!!data.session_token}`);
      
      setSessionToken(data.session_token);
    } catch (error: any) {
      log("error", error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSessionStopped = () => {
    log("info", "Session ended - resetting state");
    setSessionToken("");
  };

  const clearLogs = () => setLogs([]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold">LiveAvatar SDK Test</h1>
          <p className="text-gray-400">
            Fresh SDK integration following official demo patterns
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white">Session</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!sessionToken ? (
                <>
                  <div>
                    <label className="text-sm text-gray-400 mb-2 block">Avatar</label>
                    <Select
                      value={selectedAvatar.id}
                      onValueChange={(id) => setSelectedAvatar(AVATARS.find(a => a.id === id)!)}
                    >
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

                  <div>
                    <label className="text-sm text-gray-400 mb-2 block">Mode</label>
                    <Select value={mode} onValueChange={(v) => setMode(v as "FULL" | "CUSTOM")}>
                      <SelectTrigger className="bg-gray-700 border-gray-600">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CUSTOM">CUSTOM (External AI)</SelectItem>
                        <SelectItem value="FULL">FULL (Built-in AI)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button onClick={handleStart} disabled={isLoading} className="w-full">
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Play className="w-4 h-4 mr-2" />
                    )}
                    Start Session
                  </Button>
                </>
              ) : (
                <LiveAvatarContextProvider
                  sessionAccessToken={sessionToken}
                  onLog={log}
                >
                  <SessionComponent
                    mode={mode}
                    onLog={log}
                    onStop={handleSessionStopped}
                  />
                </LiveAvatarContextProvider>
              )}
            </CardContent>
          </Card>

          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-white">Debug Logs</CardTitle>
              <Button variant="ghost" size="sm" onClick={clearLogs}>Clear</Button>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-900 rounded p-3 h-96 overflow-y-auto font-mono text-xs">
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
    </div>
  );
}
