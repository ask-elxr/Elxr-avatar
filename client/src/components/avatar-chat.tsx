import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { X, Maximize2, Minimize2 } from "lucide-react";
import loadingVideo from "@assets/intro logo_1760052672430.mp4";
import StreamingAvatar, { AvatarQuality, StreamingEvents, TaskType } from "@heygen/streaming-avatar";

export function AvatarChat() {
  const [isMobile, setIsMobile] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [showChatButton, setShowChatButton] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPinchHint, setShowPinchHint] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const avatarRef = useRef<StreamingAvatar | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Check if device is mobile
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
    // Auto-hide loading video after 5 seconds to show the avatar
    if (isLoading) {
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  useEffect(() => {
    // Show pinch hint on mobile when session becomes active
    if (sessionActive && isMobile) {
      setShowPinchHint(true);
      const timer = setTimeout(() => {
        setShowPinchHint(false);
      }, 5000); // Hide after 5 seconds
      
      return () => clearTimeout(timer);
    }
  }, [sessionActive, isMobile]);

  useEffect(() => {
    // Listen for fullscreen changes (desktop only - mobile uses CSS)
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement || 
        (document as any).webkitFullscreenElement
      );
      setIsFullscreen(isCurrentlyFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
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
    setIsLoading(true);
    setShowChatButton(false);

    try {
      const token = await fetchAccessToken();
      const avatar = new StreamingAvatar({ token });
      avatarRef.current = avatar;

      avatar.on(StreamingEvents.STREAM_READY, (event) => {
        console.log("Stream ready:", event.detail);
        if (videoRef.current) {
          videoRef.current.srcObject = event.detail;
          videoRef.current.play().catch(console.error);
        }
      });

      avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        console.log("Stream disconnected");
        endSession();
      });

      // Listen for user message events - fires when user talks
      avatar.on(StreamingEvents.USER_TALKING_MESSAGE, async (message: any) => {
        console.log("USER_TALKING_MESSAGE event received:", message);
        
        const userMessage = message?.detail?.message || message?.message || message;
        console.log("User message extracted:", userMessage);
        
        if (userMessage) {
          // Get response from Claude backend
          try {
            const response = await fetch("/api/avatar/response", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: userMessage })
            });

            if (response.ok) {
              const data = await response.json();
              const claudeResponse = data.knowledgeResponse || data.response;
              console.log("Claude response received:", claudeResponse);
              
              // Interrupt any GPT-4 response from knowledge base
              await avatar.interrupt().catch(() => {});
              
              // Make avatar speak Claude's response using REPEAT (not TALK)
              await avatar.speak({
                text: claudeResponse,
                task_type: TaskType.REPEAT
              });
            }
          } catch (error) {
            console.error("Error getting Claude response:", error);
          }
        }
      });

      // Start avatar session with knowledge base (required for voice recognition)
      // We intercept and override responses with Claude
      await avatar.createStartAvatar({
        quality: AvatarQuality.High,
        avatarName: "7e01e5d4e06149c9ba3c1728fa8f03d0",
        knowledgeBase: "edb04cb8e7b44b6fb0cd73a3edd4bca4",
        voice: {
          rate: 1.0
        },
        language: "en",
        disableIdleTimeout: false
      });

      // Start voice chat to enable microphone input
      console.log("Starting voice chat...");
      await avatar.startVoiceChat();
      console.log("Voice chat started - you can now speak to the avatar");

      setSessionActive(true);
    } catch (error) {
      console.error("Error starting avatar session:", error);
      setIsLoading(false);
      setShowChatButton(true);
    }
  }

  function endSession() {
    if (avatarRef.current) {
      avatarRef.current.stopAvatar().catch(console.error);
      avatarRef.current = null;
    }
    setSessionActive(false);
    setShowChatButton(true);
    setIsLoading(true); // Show loading when restarting
  }

  const endChat = () => {
    endSession();
  };

  const toggleFullscreen = async () => {
    // Desktop only: Use standard fullscreen API
    try {
      const video = videoRef.current as any;
      
      if (!document.fullscreenElement) {
        if (video.requestFullscreen) {
          await video.requestFullscreen();
        } else if (video.webkitRequestFullscreen) {
          await video.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        }
      }
    } catch (error) {
      console.error('Error toggling fullscreen:', error);
    }
  };

  return (
    <div 
      ref={containerRef} 
      className="relative overflow-hidden bg-black w-full h-screen"
    >
      {/* Chat Now Button - Only shown before session starts */}
      {showChatButton && !sessionActive && !isLoading && (
        <div className="absolute inset-0 z-40 flex items-center justify-center">
          <Button
            onClick={startSession}
            className="bg-purple-600 hover:bg-purple-700 text-white px-10 py-3 text-base font-semibold rounded-full shadow-lg"
            data-testid="button-chat-now"
          >
            Chat now
          </Button>
        </div>
      )}

      {/* Fullscreen Button - Desktop Only */}
      {sessionActive && !isMobile && (
        <Button
          onClick={toggleFullscreen}
          className="absolute top-6 left-6 p-2 z-50 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-sm"
          data-testid="button-fullscreen-toggle"
          title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? (
            <Minimize2 className="w-5 h-5" />
          ) : (
            <Maximize2 className="w-5 h-5" />
          )}
        </Button>
      )}

      {/* Mobile Fullscreen Hint - Shows for 5 seconds after session starts */}
      {showPinchHint && (
        <div className="absolute top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 flex flex-col items-center gap-3 animate-fade-in">
          <img src="/attached_assets/unpinch_1760074356896.png" alt="Pinch gesture" className="w-16 h-16" />
          <div className="text-white text-center">
            <div className="text-lg font-semibold">Expand for</div>
            <div className="text-lg font-semibold">Fullscreen</div>
          </div>
        </div>
      )}

      {/* End Chat Button - Top Right (All Screens) - Always shown when session active */}
      {sessionActive && (
        <Button
          onClick={endChat}
          className={`absolute bg-red-600/80 hover:bg-red-700 text-white rounded-full backdrop-blur-sm flex items-center gap-2 ${
            isMobile ? 'top-4 right-4 p-3 z-[10000]' : 'top-6 right-6 px-4 py-2 z-50'
          }`}
          data-testid="button-end-chat"
          title="End chat and restart"
        >
          <X className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} />
          {!isMobile && <span className="text-sm font-medium">End Chat</span>}
        </Button>
      )}

      {/* Loading Video Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black">
          <video
            autoPlay
            muted
            playsInline
            className="max-w-[80%] max-h-[80%] object-contain"
            data-testid="loading-video"
          >
            <source src={loadingVideo} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>
      )}

      {/* Avatar Video Stream */}
      <div className="w-full h-full flex items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={isMobile ? "max-w-full max-h-[65vh] object-contain" : "w-full h-full object-cover"}
          style={isMobile ? { touchAction: 'pinch-zoom' } : undefined}
          data-testid="avatar-video"
        />
      </div>
    </div>
  );
}
