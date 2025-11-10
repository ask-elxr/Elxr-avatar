import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { X, Maximize2, Minimize2, Pause, Play } from "lucide-react";
import unpinchGraphic1 from "@assets/Unpinch 1__1760076687886.png";
import unpinchGraphic2 from "@assets/unpinch 2_1760076687886.png";
import { useAvatarSession } from "@/hooks/useAvatarSession";
import { useInactivityTimer } from "@/hooks/useInactivityTimer";
import { LoadingPlaceholder } from "@/components/LoadingPlaceholder";

interface AvatarChatProps {
  userId: string;
}

export function AvatarChat({ userId }: AvatarChatProps) {
  // UI-only state
  const [isMobile, setIsMobile] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showExpandedFingers, setShowExpandedFingers] = useState(false);
  const [hasUsedFullscreen, setHasUsedFullscreen] = useState(false);
  const [showUnpinchAnimation, setShowUnpinchAnimation] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [showChatButton, setShowChatButton] = useState(true);
  
  // UI-only refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const unpinchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasAutoStarted = useRef(false);
  
  // Callback ref bridge to break circular dependency
  const resetTimerRef = useRef<(() => void) | null>(null);
  
  // Memory preference from localStorage
  useEffect(() => {
    const memoryPref = localStorage.getItem('memory-enabled');
    setMemoryEnabled(memoryPref === 'true');
  }, []);
  
  // Hook 1: Avatar session management
  const {
    sessionActive,
    isLoading,
    showReconnect,
    startSession,
    endSession,
    endSessionShowReconnect,
    reconnect,
    togglePause,
    isPaused,
    avatarRef,
    hasAskedAnythingElseRef,
    speakingIntervalRef
  } = useAvatarSession({
    videoRef,
    userId,
    memoryEnabled,
    onResetInactivityTimer: () => resetTimerRef.current?.()
  });
  
  // Hook 2: Inactivity timer management
  const { resetInactivityTimer, clearAllTimers } = useInactivityTimer({
    sessionActive,
    isPaused,
    avatarRef,
    speakingIntervalRef,
    hasAskedAnythingElseRef,
    onEndSessionShowReconnect: endSessionShowReconnect
  });
  
  // Bridge the actual function to the ref
  resetTimerRef.current = resetInactivityTimer;
  
  // Auto-start effect
  useEffect(() => {
    if (!hasAutoStarted.current) {
      hasAutoStarted.current = true;
      setShowChatButton(false);
      startSession();
    }
  }, [startSession]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, [clearAllTimers]);

  // Mobile detection effect
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (event.reason?.name === 'AbortError' || event.reason?.message?.includes('aborted')) {
        event.preventDefault();
        console.log("Abort error suppressed - this is expected when cancelling requests");
      }
    };
    
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Show unpinch animation on mobile after session starts
  useEffect(() => {
    if (isMobile && sessionActive && !isLoading) {
      console.log("Session active on mobile - showing unpinch animation for 5 seconds");
      setShowUnpinchAnimation(true);
      
      const timer = setTimeout(() => {
        console.log("Hiding unpinch animation");
        setShowUnpinchAnimation(false);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [isMobile, sessionActive, isLoading]);

  // Fullscreen change listeners
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement || 
        (document as any).webkitFullscreenElement ||
        (videoRef.current as any)?.webkitDisplayingFullscreen
      );
      
      console.log("Fullscreen change detected:", isCurrentlyFullscreen);
      setIsFullscreen(isCurrentlyFullscreen);
      
      if (isCurrentlyFullscreen) {
        console.log("Entering fullscreen - showing unpinch animation");
        setHasUsedFullscreen(true);
        setShowUnpinchAnimation(true);
        
        if (unpinchTimerRef.current) {
          clearTimeout(unpinchTimerRef.current);
        }
        
        unpinchTimerRef.current = setTimeout(() => {
          console.log("Hiding unpinch animation after 5 seconds");
          setShowUnpinchAnimation(false);
        }, 5000);
      } else {
        console.log("Exiting fullscreen - hiding unpinch animation");
        setShowUnpinchAnimation(false);
        if (unpinchTimerRef.current) {
          clearTimeout(unpinchTimerRef.current);
        }
      }
    };

    const handleWebkitBeginFullscreen = () => {
      console.log("Webkit begin fullscreen - showing unpinch animation");
      setIsFullscreen(true);
      setHasUsedFullscreen(true);
      setShowUnpinchAnimation(true);
      
      if (unpinchTimerRef.current) {
        clearTimeout(unpinchTimerRef.current);
      }
      
      unpinchTimerRef.current = setTimeout(() => {
        console.log("Hiding unpinch animation after 5 seconds (webkit)");
        setShowUnpinchAnimation(false);
      }, 5000);
    };

    const handleWebkitEndFullscreen = () => {
      console.log("Webkit end fullscreen");
      setIsFullscreen(false);
      setShowUnpinchAnimation(false);
      if (unpinchTimerRef.current) {
        clearTimeout(unpinchTimerRef.current);
      }
    };

    const handlePresentationModeChanged = (e: any) => {
      const mode = (e.target as any)?.webkitPresentationMode;
      console.log("Presentation mode changed:", mode);
      
      if (mode === 'fullscreen') {
        console.log("iOS fullscreen detected - showing unpinch animation");
        setIsFullscreen(true);
        setHasUsedFullscreen(true);
        setShowUnpinchAnimation(true);
        
        if (unpinchTimerRef.current) {
          clearTimeout(unpinchTimerRef.current);
        }
        
        unpinchTimerRef.current = setTimeout(() => {
          console.log("Hiding unpinch animation after 5 seconds (iOS)");
          setShowUnpinchAnimation(false);
        }, 5000);
      } else {
        console.log("iOS exiting fullscreen");
        setIsFullscreen(false);
        setShowUnpinchAnimation(false);
        if (unpinchTimerRef.current) {
          clearTimeout(unpinchTimerRef.current);
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    
    if (videoRef.current) {
      videoRef.current.addEventListener('webkitbeginfullscreen', handleWebkitBeginFullscreen);
      videoRef.current.addEventListener('webkitendfullscreen', handleWebkitEndFullscreen);
      videoRef.current.addEventListener('webkitpresentationmodechanged', handlePresentationModeChanged);
    }
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      if (videoRef.current) {
        videoRef.current.removeEventListener('webkitbeginfullscreen', handleWebkitBeginFullscreen);
        videoRef.current.removeEventListener('webkitendfullscreen', handleWebkitEndFullscreen);
        videoRef.current.removeEventListener('webkitpresentationmodechanged', handlePresentationModeChanged);
      }
    };
  }, []);

  // Animate unpinch graphic
  useEffect(() => {
    if (isMobile && sessionActive && showUnpinchAnimation) {
      const interval = setInterval(() => {
        setShowExpandedFingers(prev => !prev);
      }, 800);
      
      return () => clearInterval(interval);
    }
  }, [isMobile, sessionActive, showUnpinchAnimation]);

  // UI handler functions
  const toggleFullscreen = async () => {
    try {
      if (isMobile && videoRef.current) {
        const videoElement = videoRef.current as any;
        
        videoElement.removeAttribute('playsinline');
        
        if (videoElement.webkitEnterFullscreen) {
          videoElement.webkitEnterFullscreen();
        } else if (videoElement.webkitRequestFullscreen) {
          await videoElement.webkitRequestFullscreen();
        } else if (videoElement.requestFullscreen) {
          await videoElement.requestFullscreen();
        }
        
        setTimeout(() => {
          videoElement.setAttribute('playsinline', '');
        }, 500);
      } else {
        if (!document.fullscreenElement) {
          await containerRef.current?.requestFullscreen();
        } else {
          await document.exitFullscreen();
        }
      }
    } catch (error) {
      console.error('Error toggling fullscreen:', error);
      if (isMobile && videoRef.current) {
        (videoRef.current as any).setAttribute('playsinline', '');
      }
    }
  };

  const endChat = () => endSession();

  return (
    <div ref={containerRef} className="w-full h-screen relative overflow-hidden bg-black">
      {/* Fullscreen Button - Top Left */}
      {sessionActive && (
        <Button
          onClick={toggleFullscreen}
          className={`absolute z-50 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-sm ${
            isMobile ? 'top-4 left-4 p-3' : 'top-6 left-6 p-2'
          }`}
          data-testid="button-fullscreen-toggle"
          title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? (
            <Minimize2 className={isMobile ? 'w-5 h-5' : 'w-5 h-5'} />
          ) : (
            <Maximize2 className={isMobile ? 'w-5 h-5' : 'w-5 h-5'} />
          )}
        </Button>
      )}

      {/* Pause/Resume Button - Top Center */}
      {sessionActive && (
        <Button
          onClick={togglePause}
          className={`absolute z-50 left-1/2 -translate-x-1/2 bg-purple-500/80 hover:bg-purple-600 text-white rounded-full backdrop-blur-sm flex items-center gap-2 ${
            isMobile ? 'top-4 p-3' : 'top-6 px-4 py-2'
          }`}
          data-testid="button-pause-toggle"
          title={isPaused ? "Resume chat" : "Pause chat"}
        >
          {isPaused ? (
            <>
              <Play className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} />
              {!isMobile && <span className="text-sm font-medium">Resume</span>}
            </>
          ) : (
            <>
              <Pause className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} />
              {!isMobile && <span className="text-sm font-medium">Pause</span>}
            </>
          )}
        </Button>
      )}

      {/* End Chat Button - Top Right */}
      {sessionActive && (
        <Button
          onClick={endChat}
          className={`absolute z-50 bg-purple-700/80 hover:bg-purple-800 text-white rounded-full backdrop-blur-sm flex items-center gap-2 ${
            isMobile ? 'top-4 right-4 p-3' : 'top-6 right-6 px-4 py-2'
          }`}
          data-testid="button-end-chat"
          title="End chat and restart"
        >
          <X className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} />
          {!isMobile && <span className="text-sm font-medium">End Chat</span>}
        </Button>
      )}

      {/* Loading Overlay */}
      {isLoading && !showReconnect && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black">
          <LoadingPlaceholder data-testid="loading-placeholder" />
        </div>
      )}

      {/* Reconnect Screen */}
      {showReconnect && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black gap-8">
          <LoadingPlaceholder data-testid="reconnect-placeholder" />
          <Button
            onClick={reconnect}
            className="bg-purple-600 hover:bg-purple-700 text-white px-10 py-3 text-base font-semibold rounded-full shadow-lg"
            data-testid="button-reconnect"
          >
            Reconnect
          </Button>
        </div>
      )}

      {/* Unpinch Graphic - Mobile/Tablet only */}
      {isMobile && sessionActive && (
        <div className={`absolute left-1/2 transform -translate-x-1/2 z-40 pointer-events-none transition-opacity duration-500 ${
          showUnpinchAnimation ? 'opacity-90' : 'opacity-0'
        }`}
        style={{ top: '55%' }}>
          <div className="flex flex-col items-center gap-3">
            <img 
              src={showExpandedFingers ? unpinchGraphic2 : unpinchGraphic1} 
              alt="Expand for fullscreen" 
              className="w-16 h-16 transition-opacity duration-300"
              data-testid="unpinch-graphic"
            />
            <p className="text-white text-base font-medium text-center drop-shadow-lg">
              Click full screen<br/>then expand
            </p>
          </div>
        </div>
      )}

      {/* Avatar Video Stream */}
      <div className="w-full h-full flex items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
          data-testid="avatar-video"
        />
      </div>
    </div>
  );
}
