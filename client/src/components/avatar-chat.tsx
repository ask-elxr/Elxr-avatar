import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Maximize, Minimize, X } from "lucide-react";
import loadingVideo from "@assets/intro logo_1760052672430.mp4";
import { heygenService } from "@/services/heygen-service";

export function AvatarChat() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [isChatStarted, setIsChatStarted] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const avatarRef = useRef<any>(null);

  useEffect(() => {
    // Check if device is mobile
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    // Auto-hide intro video after avatar initializes
    if (isChatStarted && showIntro && !isInitializing) {
      const timer = setTimeout(() => {
        setShowIntro(false);
      }, 2000); // Show for 2 seconds after avatar is ready
      
      return () => clearTimeout(timer);
    }
  }, [isChatStarted, showIntro, isInitializing]);

  // Cleanup avatar on unmount
  useEffect(() => {
    return () => {
      if (avatarRef.current) {
        heygenService.stopAvatar();
      }
    };
  }, []);

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const startChat = async () => {
    if (isInitializing) return;
    
    setIsInitializing(true);
    setIsChatStarted(true);
    
    try {
      // Initialize HeyGen avatar with SDK
      const { StreamingEvents } = await import('@heygen/streaming-avatar');
      const { avatar } = await heygenService.initializeAvatar();
      
      // Listen for stream ready event and attach to video
      avatar.on(StreamingEvents.STREAM_READY, (event: any) => {
        if (videoRef.current && event.detail) {
          videoRef.current.srcObject = event.detail;
          setIsInitializing(false);
        }
      });
      
      // Listen for disconnection
      avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        console.log('Stream disconnected');
      });
      
      avatarRef.current = avatar;
    } catch (error) {
      console.error('Failed to start avatar:', error);
      setIsInitializing(false);
      setIsChatStarted(false);
      setShowIntro(true);
    }
  };

  const endChat = async () => {
    // Stop avatar
    if (avatarRef.current) {
      await heygenService.stopAvatar();
      avatarRef.current = null;
    }
    
    // Reset video
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    // Reset state
    setShowIntro(true);
    setIsChatStarted(false);
    setIsInitializing(false);
  };


  return (
    <div className="w-full h-screen relative overflow-hidden">
      {/* Fullscreen Button - Mobile Only (Top Left) */}
      {isMobile && (
        <Button
          onClick={toggleFullscreen}
          className="absolute top-4 left-4 z-50 bg-black/50 hover:bg-black/70 text-white rounded-full p-3 backdrop-blur-sm"
          data-testid="button-fullscreen-toggle"
        >
          {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
        </Button>
      )}

      {/* End Chat Button - Top Right (Show only when chat is active) */}
      {isChatStarted && !showIntro && (
        <Button
          onClick={endChat}
          className={`absolute z-50 bg-red-600/80 hover:bg-red-700 text-white rounded-full backdrop-blur-sm flex items-center gap-2 ${
            isMobile ? 'top-4 right-4 p-3' : 'top-6 right-6 px-4 py-2'
          }`}
          data-testid="button-end-chat"
          title="End chat and restart"
        >
          <X className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} />
          {!isMobile && <span className="text-sm font-medium">End Chat</span>}
        </Button>
      )}

      {/* Intro Video Overlay with Chat Now Button */}
      {showIntro && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="max-w-[80%] max-h-[60%] object-contain mb-8"
            data-testid="intro-video"
          >
            <source src={loadingVideo} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
          
          {/* Chat Now Button - Only show if chat hasn't started */}
          {!isChatStarted && (
            <Button
              onClick={startChat}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 text-lg font-semibold rounded-lg shadow-xl transition-all duration-200 hover:scale-105"
              data-testid="button-chat-now"
            >
              Chat now
            </Button>
          )}
        </div>
      )}

      {/* Avatar Video Stream - SDK Based */}
      <div className={`w-full h-full overflow-hidden relative flex items-center justify-center bg-gradient-to-b from-gray-100 to-gray-200 ${isFullscreen && isMobile ? 'transform scale-[4] origin-center' : ''}`}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
          data-testid="heygen-avatar-video"
        />
      </div>
    </div>
  );
}
