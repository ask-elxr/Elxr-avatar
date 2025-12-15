import { useState, useCallback, useEffect, useRef } from "react";
import { useConversation } from "@elevenlabs/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Volume2, VolumeX, Phone, PhoneOff, AlertCircle, CheckCircle2, Loader2, Video, VideoOff } from "lucide-react";

type Message = {
  role: "user" | "agent";
  text: string;
  isFinal: boolean;
};

export default function ElevenLabsVideoTest() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [micPermission, setMicPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const [heygenWs, setHeygenWs] = useState<WebSocket | null>(null);
  const [heygenSessionId, setHeygenSessionId] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [audioBuffer, setAudioBuffer] = useState<string[]>([]);

  const conversation = useConversation({
    onConnect: () => {
      console.log("[ElevenLabs] Connected");
      setIsConnecting(false);
      setError(null);
    },
    onDisconnect: () => {
      console.log("[ElevenLabs] Disconnected");
      setIsConnecting(false);
    },
    onMessage: (message) => {
      console.log("[ElevenLabs] Message:", message);
      if (message.source === "user" || message.source === "ai") {
        setMessages((prev) => {
          const newMessage: Message = {
            role: message.source === "user" ? "user" : "agent",
            text: message.message,
            isFinal: message.source === "ai" || !("isFinal" in message) || message.isFinal === true,
          };
          if (!newMessage.isFinal && prev.length > 0) {
            const last = prev[prev.length - 1];
            if (last.role === newMessage.role && !last.isFinal) {
              return [...prev.slice(0, -1), newMessage];
            }
          }
          return [...prev, newMessage];
        });
      }
    },
    onError: (err: unknown) => {
      console.error("[ElevenLabs] Error:", err);
      const errMsg = typeof err === "string" ? err : (err as Error)?.message || "Connection error";
      setError(errMsg);
      setIsConnecting(false);
    },
    onAudio: (audio: unknown) => {
      console.log("[ElevenLabs] Audio received:", audio);
      if (heygenWs && heygenWs.readyState === WebSocket.OPEN) {
        let base64Audio: string;
        if (audio instanceof ArrayBuffer) {
          base64Audio = arrayBufferToBase64(audio);
        } else if (typeof audio === "string") {
          base64Audio = audio;
        } else if (audio && typeof audio === "object" && "data" in audio) {
          const data = (audio as { data: ArrayBuffer | string }).data;
          base64Audio = data instanceof ArrayBuffer ? arrayBufferToBase64(data) : String(data);
        } else {
          console.warn("[ElevenLabs] Unknown audio format:", typeof audio);
          return;
        }
        heygenWs.send(JSON.stringify({
          type: "agent.speak",
          event_id: crypto.randomUUID(),
          audio: base64Audio
        }));
        console.log("[HeyGen] Sent audio chunk to avatar");
      }
    },
    onModeChange: (mode) => {
      console.log("[ElevenLabs] Mode changed:", mode);
      if (mode.mode === "listening" && heygenWs && heygenWs.readyState === WebSocket.OPEN) {
        heygenWs.send(JSON.stringify({
          type: "agent.speak_end",
          event_id: crypto.randomUUID()
        }));
        console.log("[HeyGen] Agent finished speaking");
      }
    },
    micMuted: isMuted,
    volume,
  });

  function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  const startHeyGenSession = useCallback(async () => {
    try {
      console.log("[HeyGen] Starting video session...");
      
      const response = await fetch("/api/heygen/streaming-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: "v2",
          avatar_id: "98917de8-81a1-4a24-ad0b-584fff35c168"
        })
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to create HeyGen session");
      }
      
      const data = await response.json();
      console.log("[HeyGen] Session created:", data);
      
      setHeygenSessionId(data.session_id);
      
      if (data.realtime_endpoint) {
        const ws = new WebSocket(data.realtime_endpoint);
        
        ws.onopen = () => {
          console.log("[HeyGen] WebSocket connected");
          setVideoReady(true);
        };
        
        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data);
          console.log("[HeyGen] WS message:", msg);
        };
        
        ws.onerror = (err) => {
          console.error("[HeyGen] WS error:", err);
        };
        
        ws.onclose = () => {
          console.log("[HeyGen] WebSocket closed");
          setVideoReady(false);
        };
        
        setHeygenWs(ws);
      }
      
      return true;
    } catch (err: any) {
      console.error("[HeyGen] Start error:", err);
      setError(err.message || "Failed to start HeyGen session");
      return false;
    }
  }, []);

  const checkMicPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicPermission("granted");
      return true;
    } catch (err) {
      console.error("[Mic] Permission denied:", err);
      setMicPermission("denied");
      setError("Microphone access is required for voice conversation. Please enable it in your browser settings.");
      return false;
    }
  }, []);

  const startConversation = useCallback(async () => {
    setError(null);
    setIsConnecting(true);

    const hasPermission = micPermission === "granted" || (await checkMicPermission());
    if (!hasPermission) {
      setIsConnecting(false);
      return;
    }

    // Start HeyGen video session first
    const heygenStarted = await startHeyGenSession();
    if (!heygenStarted) {
      console.warn("[HeyGen] Video session failed to start, continuing with audio only");
    }

    try {
      const response = await fetch("/api/elevenlabs/conversation-token");
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to get conversation token");
      }
      const { token, agentId } = await response.json();

      if (token) {
        await conversation.startSession({
          conversationToken: token,
          connectionType: "webrtc",
        });
      } else if (agentId) {
        await conversation.startSession({
          agentId,
          connectionType: "webrtc",
        });
      } else {
        throw new Error("No token or agentId returned from server");
      }
    } catch (err: any) {
      console.error("[ElevenLabs] Start error:", err);
      setError(err.message || "Failed to start conversation");
      setIsConnecting(false);
    }
  }, [conversation, micPermission, checkMicPermission]);

  const endConversation = useCallback(async () => {
    try {
      await conversation.endSession();
      
      if (heygenWs) {
        heygenWs.close();
        setHeygenWs(null);
      }
      
      setHeygenSessionId(null);
      setVideoReady(false);
    } catch (err) {
      console.error("[ElevenLabs] End error:", err);
    }
  }, [conversation, heygenWs]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const toggleVolume = useCallback(() => {
    setVolume((prev) => (prev === 0 ? 1 : 0));
  }, []);

  useEffect(() => {
    checkMicPermission();
  }, [checkMicPermission]);

  const isConnected = conversation.status === "connected";
  const isSpeaking = conversation.isSpeaking;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl text-center text-purple-400">
              ElevenLabs Agent + HeyGen Video
            </CardTitle>
            <p className="text-sm text-gray-400 text-center">Voice AI with video avatar lip-sync</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden relative">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                autoPlay
                playsInline
                muted
              />
              {!videoReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80">
                  <div className="text-center">
                    <VideoOff className="w-12 h-12 mx-auto text-gray-500 mb-2" />
                    <p className="text-gray-400 text-sm">Video avatar will appear here</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-2 flex-wrap">
              <Badge
                variant={isConnected ? "default" : "secondary"}
                className={isConnected ? "bg-green-600" : "bg-gray-600"}
              >
                {isConnected ? "Voice Connected" : "Voice Disconnected"}
              </Badge>
              <Badge
                variant={videoReady ? "default" : "secondary"}
                className={videoReady ? "bg-blue-600" : "bg-gray-600"}
              >
                {videoReady ? "Video Ready" : "No Video"}
              </Badge>
              {isSpeaking && (
                <Badge className="bg-purple-600 animate-pulse">Speaking...</Badge>
              )}
              {micPermission === "granted" && (
                <Badge variant="outline" className="border-green-500 text-green-500">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Mic OK
                </Badge>
              )}
            </div>

            {error && (
              <div className="bg-red-900/50 border border-red-700 rounded-lg p-3 text-sm text-red-300">
                <AlertCircle className="w-4 h-4 inline mr-2" />
                {error}
              </div>
            )}

            <div className="flex justify-center gap-3 flex-wrap">
              {!isConnected ? (
                <Button
                  onClick={startConversation}
                  disabled={isConnecting || micPermission === "denied"}
                  className="bg-green-600 hover:bg-green-700 text-white px-8 py-6 text-lg rounded-full"
                  data-testid="button-start-conversation"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Phone className="w-5 h-5 mr-2" />
                      Start Call
                    </>
                  )}
                </Button>
              ) : (
                <>
                  <Button
                    onClick={toggleMute}
                    variant="outline"
                    className={`rounded-full p-4 ${isMuted ? "bg-red-600 border-red-600" : "border-gray-600"}`}
                    data-testid="button-toggle-mute"
                  >
                    {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                  </Button>
                  <Button
                    onClick={endConversation}
                    className="bg-red-600 hover:bg-red-700 text-white px-8 py-6 text-lg rounded-full"
                    data-testid="button-end-conversation"
                  >
                    <PhoneOff className="w-5 h-5 mr-2" />
                    End Call
                  </Button>
                  <Button
                    onClick={toggleVolume}
                    variant="outline"
                    className={`rounded-full p-4 ${volume === 0 ? "bg-yellow-600 border-yellow-600" : "border-gray-600"}`}
                    data-testid="button-toggle-volume"
                  >
                    {volume === 0 ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-gray-300">Conversation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[30vh] overflow-y-auto" data-testid="conversation-messages">
              {messages.length === 0 ? (
                <p className="text-gray-500 text-center text-sm py-4">
                  {isConnected
                    ? "Start speaking to begin the conversation..."
                    : "Press 'Start Call' to begin"}
                </p>
              ) : (
                messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg ${
                      msg.role === "user"
                        ? "bg-blue-900/50 ml-8 text-blue-100"
                        : "bg-purple-900/50 mr-8 text-purple-100"
                    } ${!msg.isFinal ? "opacity-60" : ""}`}
                    data-testid={`message-${msg.role}-${idx}`}
                  >
                    <p className="text-xs font-semibold mb-1 uppercase tracking-wide opacity-70">
                      {msg.role === "user" ? "You" : "Agent"}
                    </p>
                    <p className="text-sm">{msg.text}</p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-gray-500 text-center">
          ElevenLabs WebRTC voice + HeyGen WSS Audio-to-Video (Beta)
        </p>
      </div>
    </div>
  );
}
