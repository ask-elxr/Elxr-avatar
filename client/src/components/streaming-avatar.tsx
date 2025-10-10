import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, MessageSquare, Video, VideoOff } from "lucide-react";
import StreamingAvatar, { AvatarQuality, StreamingEvents } from "@heygen/streaming-avatar";

interface StreamingAvatarComponentProps {
  onAvatarResponse?: (response: string) => void;
}

export function StreamingAvatarComponent({ onAvatarResponse }: StreamingAvatarComponentProps) {
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [avatarStarted, setAvatarStarted] = useState(false);
  const [isUserTalking, setIsUserTalking] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Click 'Start Avatar' to begin");
  
  const mediaStreamRef = useRef<HTMLVideoElement>(null);
  const avatarRef = useRef<StreamingAvatar | null>(null);

  useEffect(() => {
    return () => {
      endSession();
    };
  }, []);

  async function fetchAccessToken(): Promise<string> {
    try {
      const response = await fetch("/api/heygen/token", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch access token");
      }

      const data = await response.json();
      return data.token;
    } catch (error) {
      console.error("Error fetching access token:", error);
      throw error;
    }
  }

  async function startSession() {
    setIsLoadingSession(true);
    setStatusMessage("Initializing avatar session...");

    try {
      const newToken = await fetchAccessToken();
      
      const avatar = new StreamingAvatar({ token: newToken });
      avatarRef.current = avatar;

      avatar.on(StreamingEvents.STREAM_READY, (event) => {
        console.log("Stream ready:", event.detail);
        setStream(event.detail);
        setStatusMessage("Avatar stream ready!");
      });

      avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        console.log("Stream disconnected");
        setStatusMessage("Avatar disconnected");
        endSession();
      });

      avatar.on(StreamingEvents.AVATAR_START_TALKING, () => {
        console.log("Avatar started talking");
        setStatusMessage("Avatar is speaking...");
      });

      avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
        console.log("Avatar stopped talking");
        setStatusMessage("Avatar ready for input");
      });

      avatar.on(StreamingEvents.USER_START, () => {
        console.log("User started talking");
        setIsUserTalking(true);
        setStatusMessage("Listening...");
      });

      avatar.on(StreamingEvents.USER_STOP, () => {
        console.log("User stopped talking");
        setIsUserTalking(false);
        setStatusMessage("Processing your question...");
      });

      // Start avatar session with your avatar ID
      // NOTE: We're using HeyGen's knowledge base ONLY to enable the avatar
      // but we override ALL responses with our Claude Sonnet 4 backend
      await avatar.createStartAvatar({
        quality: AvatarQuality.High,
        avatarName: "7e01e5d4e06149c9ba3c1728fa8f03d0", // Your avatar ID
        knowledgeBase: "edb04cb8e7b44b6fb0cd73a3edd4bca4", // Required by HeyGen but responses are overridden
        voice: {
          rate: 1.0
        },
        language: "en",
        disableIdleTimeout: false
      });

      setAvatarStarted(true);
      setStatusMessage("Avatar ready! Start talking or type a message");
      
    } catch (error) {
      console.error("Error starting avatar session:", error);
      setStatusMessage(`Error: ${error instanceof Error ? error.message : 'Failed to start avatar'}`);
    } finally {
      setIsLoadingSession(false);
    }
  }

  async function endSession() {
    if (avatarRef.current) {
      try {
        await avatarRef.current.stopAvatar();
        avatarRef.current = null;
      } catch (error) {
        console.error("Error ending session:", error);
      }
    }
    setStream(null);
    setAvatarStarted(false);
    setStatusMessage("Avatar session ended");
  }

  async function handleSpeak(text: string) {
    if (!avatarRef.current || !avatarStarted) {
      setStatusMessage("Please start the avatar first");
      return;
    }

    try {
      // Get enhanced response from Claude Sonnet 4 backend with 4-source intelligence
      const response = await fetch("/api/avatar/response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: text,
          useWebSearch: true, // Enable Google Search for current information
          conversationHistory: [] // Could add history tracking here
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get AI response");
      }

      const data = await response.json();
      const aiResponse = data.knowledgeResponse; // Claude Sonnet 4 response

      // Make avatar speak the response
      await avatarRef.current.speak({ text: aiResponse });
      
      if (onAvatarResponse) {
        onAvatarResponse(aiResponse);
      }
    } catch (error) {
      console.error("Error in avatar speech:", error);
      setStatusMessage(`Error: ${error instanceof Error ? error.message : 'Speech failed'}`);
    }
  }

  useEffect(() => {
    if (stream && mediaStreamRef.current) {
      mediaStreamRef.current.srcObject = stream;
      mediaStreamRef.current.onloadedmetadata = () => {
        mediaStreamRef.current?.play();
      };
    }
  }, [stream]);

  return (
    <div className="w-full h-screen relative overflow-hidden bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      {/* Video Stream */}
      <div className="w-full h-full flex items-center justify-center">
        {!avatarStarted ? (
          <div className="text-center">
            <div className="mb-8">
              <h1 className="text-4xl font-bold text-white mb-4">AI Avatar with 4-Source Intelligence</h1>
              <p className="text-gray-300 mb-2">Dual Pinecone Assistants + Google Search + Claude Sonnet 4</p>
              <p className="text-gray-400 text-sm">ask-elxr & knowledge-base-assistant</p>
            </div>
            <Button
              onClick={startSession}
              disabled={isLoadingSession}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-8 py-6 text-lg rounded-full"
              data-testid="button-start-avatar"
            >
              {isLoadingSession ? "Starting..." : "Start Avatar"}
            </Button>
          </div>
        ) : (
          <>
            <video
              ref={mediaStreamRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
              data-testid="avatar-video-stream"
            >
              <track kind="captions" />
            </video>

            {/* Control Panel */}
            <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex gap-4 bg-black/50 backdrop-blur-md rounded-full px-6 py-4">
              <Button
                onClick={endSession}
                className="bg-red-600 hover:bg-red-700 text-white rounded-full px-6"
                data-testid="button-end-session"
              >
                <VideoOff className="w-5 h-5 mr-2" />
                End Session
              </Button>
              
              <Button
                onClick={() => handleSpeak("Hello! Tell me what you can help with.")}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6"
                data-testid="button-test-message"
              >
                <MessageSquare className="w-5 h-5 mr-2" />
                Test Message
              </Button>
            </div>

            {/* Status Display */}
            <div className="absolute top-8 left-1/2 transform -translate-x-1/2 bg-black/50 backdrop-blur-md rounded-full px-6 py-3">
              <div className="flex items-center gap-3">
                {isUserTalking ? (
                  <Mic className="w-5 h-5 text-green-400 animate-pulse" />
                ) : (
                  <MicOff className="w-5 h-5 text-gray-400" />
                )}
                <span className="text-white text-sm" data-testid="status-message">
                  {statusMessage}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
