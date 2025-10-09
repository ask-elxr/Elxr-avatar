import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Maximize, Minimize, MessageSquare, Mic, MicOff, X } from "lucide-react";
import StreamingAvatar, { AvatarQuality, StreamingEvents } from "@heygen/streaming-avatar";
import { useKnowledgeBase } from "@/hooks/useKnowledgeBase";

export function StreamingAvatarComponent() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [avatarStarted, setAvatarStarted] = useState(false);
  const [isUserTalking, setIsUserTalking] = useState(false);
  const [micPermission, setMicPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  
  const mediaStreamRef = useRef<HTMLVideoElement>(null);
  const avatarRef = useRef<StreamingAvatar | null>(null);
  const { getAvatarResponse, isLoading } = useKnowledgeBase();

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
      endSession();
    };
  }, []);

  useEffect(() => {
    if (stream && mediaStreamRef.current) {
      console.log("🎥 Attaching stream to video element", {
        streamTracks: stream.getTracks().length,
        videoElement: !!mediaStreamRef.current
      });
      
      mediaStreamRef.current.srcObject = stream;
      mediaStreamRef.current.onloadedmetadata = () => {
        console.log("✅ Video metadata loaded, starting playback");
        mediaStreamRef.current?.play().then(() => {
          console.log("✅ Video playing successfully");
        }).catch(err => {
          console.error("❌ Video play error:", err);
        });
      };
    }
  }, [stream]);

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  async function fetchAccessToken(): Promise<string> {
    try {
      const response = await fetch("/api/heygen/token", {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch access token");
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

    try {
      const newToken = await fetchAccessToken();
      
      const avatar = new StreamingAvatar({ token: newToken });
      avatarRef.current = avatar;
      
      // Set avatarStarted immediately so the video element exists when STREAM_READY fires
      setAvatarStarted(true);

      avatar.on(StreamingEvents.STREAM_READY, (event) => {
        console.log("✅ Stream ready:", event.detail);
        console.log("📹 Avatar mediaStream:", avatar.mediaStream);
        console.log("📹 MediaStream tracks:", avatar.mediaStream?.getTracks());
        console.log("📹 Video ref exists:", !!mediaStreamRef.current);
        console.log("📹 Avatar started:", avatarStarted);
        
        // MediaStream is available via avatar.mediaStream property, NOT event.detail
        if (avatar.mediaStream) {
          console.log("🎬 Setting stream state...");
          setStream(avatar.mediaStream);
        } else {
          console.error("❌ No mediaStream available on avatar object");
        }
      });

      avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        console.warn("⚠️ Stream disconnected - this may be temporary");
        // Don't automatically end the session - let the user manually restart if needed
        // endSession();
      });

      avatar.on(StreamingEvents.AVATAR_START_TALKING, () => {
        console.log("Avatar started talking");
      });

      avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
        console.log("Avatar stopped talking");
      });

      avatar.on(StreamingEvents.USER_START, () => {
        console.log("User started talking");
        setIsUserTalking(true);
      });

      avatar.on(StreamingEvents.USER_STOP, () => {
        console.log("User stopped talking");
        setIsUserTalking(false);
      });

      // Start avatar session
      await avatar.createStartAvatar({
        quality: AvatarQuality.High,
        avatarName: "7e01e5d4e06149c9ba3c1728fa8f03d0",
        voice: {
          rate: 1.0
        },
        language: "en",
        disableIdleTimeout: false
      });

      // avatarStarted is already set to true above
      setMicPermission('granted');
      
    } catch (error) {
      console.error("Error starting avatar session:", error);
      alert(`❌ Error starting avatar: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease make sure your HeyGen API key is correctly configured.`);
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
  }

  async function handleSpeak(text: string) {
    if (!avatarRef.current || !avatarStarted) {
      alert("Please start the avatar first");
      return;
    }

    try {
      // Get enhanced response from backend with 4-source intelligence
      const response = await fetch("/api/chat/enhanced", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: text,
          useWebSearch: true
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get AI response");
      }

      const data = await response.json();
      const aiResponse = data.message;

      // Make avatar speak the response
      await avatarRef.current.speak({ text: aiResponse });
      
    } catch (error) {
      console.error("Error in avatar speech:", error);
      alert(`Error: ${error instanceof Error ? error.message : 'Speech failed'}`);
    }
  }

  const testKnowledgeBase = async () => {
    try {
      const response = await getAvatarResponse("What are the main topics you can help with?");
      alert(`Mark Kohl says: ${response}`);
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to query knowledge base'}`);
    }
  };

  const requestMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermission('granted');
      stream.getTracks().forEach(track => track.stop());
      
      alert('✅ Microphone permission granted! The avatar should now be able to hear you.');
    } catch (err) {
      setMicPermission('denied');
      alert('❌ Microphone access denied. Please:\n\n1. Click the 🔒 lock icon in your browser address bar\n2. Allow microphone access\n3. Refresh the page\n\nOr check your browser settings to allow microphone for this site.');
    }
  };

  const forceRefreshAvatar = () => {
    endSession();
    alert('🔄 Avatar session ended. Click to restart!');
  };

  // Auto-start avatar on load
  useEffect(() => {
    if (!avatarStarted && !isLoadingSession) {
      startSession();
    }
  }, []);

  return (
    <div className="w-full h-screen relative overflow-hidden">
      {/* Fullscreen Button - Mobile Only */}
      {isMobile && (
        <Button
          onClick={toggleFullscreen}
          className="absolute top-4 left-4 z-50 bg-black/50 hover:bg-black/70 text-white rounded-full p-3 backdrop-blur-sm"
          data-testid="button-fullscreen-toggle"
        >
          {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
        </Button>
      )}

      {/* Control Buttons - Top Right */}
      <div className="absolute top-4 right-4 z-50 flex gap-2">
        {/* Microphone Permission Button */}
        <Button
          onClick={requestMicrophonePermission}
          className={`${
            micPermission === 'granted' 
              ? 'bg-green-600/80 hover:bg-green-700' 
              : micPermission === 'denied'
              ? 'bg-yellow-600/80 hover:bg-yellow-700'
              : 'bg-orange-600/80 hover:bg-orange-700'
          } text-white rounded-full p-3 backdrop-blur-sm`}
          data-testid="button-microphone-permission"
          title={
            micPermission === 'granted' 
              ? 'Microphone access granted' 
              : micPermission === 'denied'
              ? 'Microphone access denied - click to retry'
              : 'Click to enable microphone access'
          }
        >
          {micPermission === 'granted' ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </Button>

        {/* Knowledge Base Test Button */}
        <Button
          onClick={testKnowledgeBase}
          disabled={isLoading}
          className="bg-blue-600/80 hover:bg-blue-700 text-white rounded-full p-3 backdrop-blur-sm"
          data-testid="button-test-knowledge"
        >
          <MessageSquare className="w-5 h-5" />
        </Button>
        
        {/* Force Refresh Button */}
        <Button
          onClick={forceRefreshAvatar}
          className="bg-gray-600/80 hover:bg-gray-700 text-white rounded-full p-3 backdrop-blur-sm"
          data-testid="button-force-refresh"
          title="End avatar session"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Avatar Video or Loading State */}
      <div className={`w-full h-full ${isFullscreen && isMobile ? 'transform scale-[4] origin-center' : ''}`}>
        {!avatarStarted || isLoadingSession ? (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-white mb-4">
                {isLoadingSession ? "Starting Avatar..." : "Loading Avatar"}
              </h1>
              <p className="text-gray-300">SDK-based • No Branding • 4-Source Intelligence</p>
            </div>
          </div>
        ) : (
          <video
            ref={mediaStreamRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover bg-black"
            data-testid="heygen-avatar-video"
          >
            <track kind="captions" />
          </video>
        )}
      </div>
    </div>
  );
}
