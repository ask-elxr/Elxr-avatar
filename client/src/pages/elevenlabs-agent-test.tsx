import { useState, useCallback, useEffect } from "react";
import { useConversation } from "@elevenlabs/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Volume2, VolumeX, Phone, PhoneOff, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

type Message = {
  role: "user" | "agent";
  text: string;
  isFinal: boolean;
};

export default function ElevenLabsAgentTest() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [micPermission, setMicPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

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
    micMuted: isMuted,
    volume,
  });

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
    } catch (err) {
      console.error("[ElevenLabs] End error:", err);
    }
  }, [conversation]);

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
      <div className="max-w-lg mx-auto space-y-4">
        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl text-center text-purple-400">
              ElevenLabs Agent Test
            </CardTitle>
            <p className="text-sm text-gray-400 text-center">Mobile-first voice AI prototype</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-center gap-2">
              <Badge
                variant={isConnected ? "default" : "secondary"}
                className={isConnected ? "bg-green-600" : "bg-gray-600"}
              >
                {isConnected ? "Connected" : "Disconnected"}
              </Badge>
              {isSpeaking && (
                <Badge className="bg-purple-600 animate-pulse">Speaking...</Badge>
              )}
              {micPermission === "granted" && (
                <Badge variant="outline" className="border-green-500 text-green-500">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Mic OK
                </Badge>
              )}
              {micPermission === "denied" && (
                <Badge variant="outline" className="border-red-500 text-red-500">
                  <AlertCircle className="w-3 h-3 mr-1" /> Mic Blocked
                </Badge>
              )}
            </div>

            {error && (
              <div className="bg-red-900/50 border border-red-700 rounded-lg p-3 text-sm text-red-300">
                <AlertCircle className="w-4 h-4 inline mr-2" />
                {error}
              </div>
            )}

            <div className="flex justify-center gap-3">
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

            {micPermission === "denied" && (
              <Button
                onClick={checkMicPermission}
                variant="outline"
                className="w-full border-yellow-600 text-yellow-500"
                data-testid="button-retry-mic"
              >
                <Mic className="w-4 h-4 mr-2" />
                Retry Microphone Permission
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-gray-300">Conversation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[50vh] overflow-y-auto" data-testid="conversation-messages">
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
          Using WebRTC for optimal mobile performance
        </p>
      </div>
    </div>
  );
}
