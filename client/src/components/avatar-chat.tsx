import { useState, useEffect, useRef, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { X, Maximize2, Minimize2, Pause, Play, Send, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import unpinchGraphic1 from "@assets/Unpinch 1__1760076687886.png";
import unpinchGraphic2 from "@assets/unpinch 2_1760076687886.png";
import { useAvatarSession } from "@/hooks/useAvatarSession";
import { useInactivityTimer } from "@/hooks/useInactivityTimer";
import { LoadingPlaceholder } from "@/components/LoadingPlaceholder";
import { useStreamStats } from "@/hooks/useStreamStats";
import { AvatarSelector } from "@/components/avatar-selector";
import { AvatarSwitcher } from "@/components/AvatarSwitcher";
import { AudioOnlyDisplay } from "@/components/AudioOnlyDisplay";

interface AvatarChatProps {
  userId: string;
  avatarId?: string;
}

export function AvatarChat({ userId, avatarId }: AvatarChatProps) {
  // UI-only state
  const [isMobile, setIsMobile] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showExpandedFingers, setShowExpandedFingers] = useState(false);
  const [hasUsedFullscreen, setHasUsedFullscreen] = useState(false);
  const [showUnpinchAnimation, setShowUnpinchAnimation] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [showChatButton, setShowChatButton] = useState(true);
  const [audioOnly, setAudioOnly] = useState(true); // Default to audio-only to save credits
  const [selectedAvatarId, setSelectedAvatarId] = useState(avatarId || "mark-kohl");
  const [showAvatarSelector, setShowAvatarSelector] = useState(!avatarId);
  const [showAvatarSwitcher, setShowAvatarSwitcher] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [switchingAvatar, setSwitchingAvatar] = useState(false);
  
  // UI-only refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const unpinchTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const { toast } = useToast();
  
  // Callback ref bridge to break circular dependency
  const resetTimerRef = useRef<(() => void) | null>(null);
  
  // Fetch current avatar name for display
  const [currentAvatarName, setCurrentAvatarName] = useState("");
  
  useEffect(() => {
    const fetchAvatarName = async () => {
      try {
        const response = await fetch(`/api/avatar/config/${selectedAvatarId}`);
        if (response.ok) {
          const data = await response.json();
          setCurrentAvatarName(data.name || "");
        }
      } catch (error) {
        console.error("Error fetching avatar name:", error);
      }
    };
    fetchAvatarName();
  }, [selectedAvatarId]);
  
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
    isSpeaking: isSpeakingFromHook,
    avatarRef,
    hasAskedAnythingElseRef,
    speakingIntervalRef,
    handleSubmitMessage
  } = useAvatarSession({
    videoRef,
    userId,
    memoryEnabled,
    selectedAvatarId,
    onResetInactivityTimer: () => resetTimerRef.current?.()
  });
  
  // Sync isSpeaking state from hook
  useEffect(() => {
    setIsSpeaking(isSpeakingFromHook);
  }, [isSpeakingFromHook]);
  
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
  
  // Hook 3: Stream statistics for testing
  const streamStats = useStreamStats({ 
    avatarRef, 
    sessionActive: sessionActive && !isPaused 
  });
  
  // No auto-start - user must click Start button to avoid burning credits
  
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

  // Ensure video is visible when not in audio-only mode
  useEffect(() => {
    if (!audioOnly && videoRef.current) {
      videoRef.current.style.display = 'block';
      videoRef.current.style.visibility = 'visible';
      videoRef.current.style.opacity = '1';
    }
  }, [audioOnly]);

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

  const handleAudioOnlyToggle = async (checked: boolean) => {
    const newAudioOnly = checked as boolean;
    const previousAudioOnly = audioOnly;
    
    // If session is active, restart it with new mode
    if (sessionActive) {
      try {
        await endSession(); // End current session and wait for cleanup
        
        // Only update state after successful cleanup
        setAudioOnly(newAudioOnly);
        
        // Restart with new setting
        await startSession({ audioOnly: newAudioOnly, avatarId: selectedAvatarId });
      } catch (error) {
        console.error("Error toggling audio-only mode:", error);
        // Revert state on error
        setAudioOnly(previousAudioOnly);
        
        toast({
          title: "Mode Switch Failed",
          description: "Failed to switch mode. Please try again.",
          variant: "destructive",
        });
      }
    } else {
      // No active session, just update state
      setAudioOnly(newAudioOnly);
    }
  };

  const handleAvatarConfirm = () => {
    setShowAvatarSelector(false);
  };

  const handleAvatarSwitch = async (newAvatarId: string) => {
    if (newAvatarId === selectedAvatarId) {
      return;
    }

    setSwitchingAvatar(true);
    
    try {
      // End current session and wait for cleanup
      if (sessionActive) {
        await endSession();
      }

      // Update selected avatar
      setSelectedAvatarId(newAvatarId);

      // Start new session with new avatar
      await startSession({ audioOnly, avatarId: newAvatarId });
      
      // Success - close dialog and show toast
      setShowAvatarSwitcher(false);
      toast({
        title: "Avatar Switched",
        description: "Your conversation continues with a new AI guide.",
      });
    } catch (error: any) {
      console.error("Error switching avatar:", error);
      
      // Keep dialog open and show error
      if (error.message?.includes("wait")) {
        toast({
          title: "Please Wait",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Switch Failed",
          description: "Failed to switch avatar. Please try again.",
          variant: "destructive",
        });
      }
      
      // Don't close dialog on error - let user try again
    } finally {
      setSwitchingAvatar(false);
    }
  };

  if (showAvatarSelector) {
    return (
      <AvatarSelector
        selectedAvatarId={selectedAvatarId}
        onSelect={setSelectedAvatarId}
        onConfirm={handleAvatarConfirm}
      />
    );
  }

  return (
    <div ref={containerRef} className="w-full h-screen relative overflow-hidden bg-black">
      {/* Audio Only Toggle - Top Left (Always Visible) */}
      <div className={`absolute z-50 flex items-center gap-3 bg-black/50 backdrop-blur-sm px-4 py-3 rounded-lg ${
        isMobile ? 'top-4 left-4' : 'top-6 left-6'
      }`}>
        <Checkbox
          id="audio-only"
          checked={audioOnly}
          onCheckedChange={handleAudioOnlyToggle}
          className="border-white data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
          data-testid="checkbox-audio-only"
        />
        <label
          htmlFor="audio-only"
          className="text-white text-sm font-medium cursor-pointer select-none"
        >
          Audio Only
        </label>
      </div>

      {/* Fullscreen Button - Top Left (Below Audio Toggle) */}
      {sessionActive && (
        <Button
          onClick={toggleFullscreen}
          className={`absolute z-50 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-sm ${
            isMobile ? 'top-20 left-4 p-3' : 'top-24 left-6 p-2'
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

      {/* Avatar Switcher Button - Top Right (Next to End Chat) */}
      {sessionActive && (
        <Button
          onClick={() => setShowAvatarSwitcher(true)}
          className={`absolute z-50 bg-purple-500/80 hover:bg-purple-600 text-white rounded-full backdrop-blur-sm flex items-center gap-2 ${
            isMobile ? 'top-4 right-20 p-3' : 'top-6 right-24 px-4 py-2'
          }`}
          disabled={switchingAvatar}
          data-testid="button-open-avatar-switcher"
          title="Switch AI Guide"
        >
          <Users className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} />
          {!isMobile && <span className="text-sm font-medium">Switch</span>}
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

      {/* Start Button - Shows when session not active, avatar selected, and not loading/reconnecting */}
      {!sessionActive && !isLoading && !showReconnect && !showAvatarSelector && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black">
          <Button
            onClick={() => {
              console.log("Start button clicked - initiating session manually");
              setShowChatButton(false);
              startSession({ audioOnly, avatarId: selectedAvatarId });
            }}
            className="bg-purple-600 hover:bg-purple-700 text-white px-12 py-4 text-lg font-semibold rounded-full shadow-lg"
            data-testid="button-start-session"
          >
            Start Chat
          </Button>
        </div>
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
          style={{ display: audioOnly ? 'none' : 'block' }}
          data-testid="avatar-video"
        />
        {audioOnly && (
          <AudioOnlyDisplay isSpeaking={isSpeaking} sessionActive={sessionActive} />
        )}
      </div>

      {/* Testing Overlay - Stream Statistics (Development Only) */}
      {import.meta.env.MODE !== "production" && sessionActive && !isPaused && (
        <div 
          className="absolute bottom-20 right-4 bg-black/80 backdrop-blur-sm text-white p-3 rounded-lg text-xs font-mono z-50 min-w-[200px]"
          data-testid="stream-stats-overlay"
        >
          <div className="text-purple-400 font-semibold mb-2 text-center">Stream Stats</div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-400">FPS:</span>
              <span className="font-semibold">{streamStats.fps}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Resolution:</span>
              <span className="font-semibold">{streamStats.frameWidth}×{streamStats.frameHeight}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Bitrate:</span>
              <span className="font-semibold">{streamStats.bitrateKbps} Kbps</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Audio:</span>
              <span className="font-semibold">{streamStats.audioLevel}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Text Input - Bottom Center */}
      {sessionActive && !isPaused && (
        <form 
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (inputMessage.trim()) {
              handleSubmitMessage(inputMessage);
              setInputMessage("");
            }
          }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 w-full max-w-2xl px-4"
        >
          <Input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 bg-black/50 backdrop-blur-sm text-white border-purple-500/30 focus:border-purple-500 placeholder:text-gray-400"
            data-testid="input-message"
            disabled={!sessionActive || isPaused}
          />
          <Button
            type="submit"
            disabled={!inputMessage.trim() || !sessionActive || isPaused}
            className="bg-purple-500 hover:bg-purple-600 text-white rounded-full p-3"
            data-testid="button-send-message"
          >
            <Send className="w-5 h-5" />
          </Button>
        </form>
      )}

      {/* Current Avatar Indicator - Bottom Left */}
      {sessionActive && currentAvatarName && (
        <div className={`absolute z-40 bg-black/60 backdrop-blur-sm text-white px-4 py-2 rounded-lg ${
          isMobile ? 'bottom-20 left-4' : 'bottom-6 left-6'
        }`}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium">{currentAvatarName}</span>
          </div>
        </div>
      )}

      {/* Avatar Switcher Dialog */}
      <AvatarSwitcher
        open={showAvatarSwitcher}
        onOpenChange={setShowAvatarSwitcher}
        currentAvatarId={selectedAvatarId}
        onSwitch={handleAvatarSwitch}
        disabled={switchingAvatar}
      />
    </div>
  );
}
