import { useState, useEffect, useRef, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { X, Maximize2, Minimize2, Pause, Play, Send, Users, Brain, Database, Menu, ChevronLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import unpinchGraphic1 from "@assets/Unpinch 1__1760076687886.png";
import unpinchGraphic2 from "@assets/unpinch 2_1760076687886.png";
import { useAvatarSession } from "@/hooks/useAvatarSession";
import { useInactivityTimer } from "@/hooks/useInactivityTimer";
import { LoadingPlaceholder } from "@/components/LoadingPlaceholder";
import { AvatarSelector } from "@/components/avatar-selector";
import { AvatarSwitcher } from "@/components/AvatarSwitcher";
import { AudioOnlyDisplay } from "@/components/AudioOnlyDisplay";
import { MemoryViewer } from "@/components/MemoryViewer";

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
  const [audioOnly, setAudioOnly] = useState(false); // Default to video mode
  const [selectedAvatarId, setSelectedAvatarId] = useState(avatarId || "mark-kohl");
  const [showAvatarSelector, setShowAvatarSelector] = useState(!avatarId);
  const [showAvatarSwitcher, setShowAvatarSwitcher] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [switchingAvatar, setSwitchingAvatar] = useState(false);
  const [showMemoryViewer, setShowMemoryViewer] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
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

  // Save memory preference to localStorage
  const handleMemoryToggle = (checked: boolean) => {
    setMemoryEnabled(checked);
    localStorage.setItem('memory-enabled', checked.toString());
    toast({
      title: checked ? "Memory Enabled" : "Memory Disabled",
      description: checked
        ? "Your conversations will be remembered across sessions"
        : "Memory has been turned off",
    });
  };
  
  // Hook 1: Avatar session management
  const {
    sessionActive,
    heygenSessionActive,
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
  
  // Reset Start button when session ends (but not during reconnect, initial state, or avatar switching)
  const prevSessionActiveRef = useRef(sessionActive);
  useEffect(() => {
    // Only reset when transitioning from active to inactive (true → false)
    // And NOT during avatar switching
    if (prevSessionActiveRef.current && !sessionActive && !showReconnect && !switchingAvatar) {
      setShowChatButton(true);
    }
    prevSessionActiveRef.current = sessionActive;
  }, [sessionActive, showReconnect, switchingAvatar]);
  
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
  
  // No auto-start - user must click Start button to avoid burning credits
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, [clearAllTimers]);

  // Mobile detection effect - mobile (<768px), tablet/desktop (>=768px)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // Mobile only, tablets get desktop layout
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
      // End current session
      if (sessionActive) {
        await endSession();
      }

      // End ALL server sessions for this user to clean up any lingering sessions
      await fetch("/api/session/end-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId }),
      });

      // Small delay to ensure cleanup
      await new Promise(resolve => setTimeout(resolve, 300));

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
      if (error.message?.includes("wait") || error.message?.includes("Maximum")) {
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
      {/* Sidebar Toggle Button - Top Left */}
      <Button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute z-[60] top-3 left-3 md:top-4 md:left-4 lg:top-6 lg:left-6 bg-black/50 hover:bg-black/70 text-white rounded-lg backdrop-blur-sm p-2 md:p-3"
        data-testid="button-toggle-sidebar"
        title={sidebarOpen ? "Close menu" : "Open menu"}
      >
        {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </Button>

      {/* Left Sidebar Menu */}
      <div 
        className={`absolute z-50 top-0 left-0 h-full w-72 md:w-80 glass-strong border-r border-white/10 transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full p-6">
          {/* Sidebar Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse glow-primary" />
              Settings
            </h2>
            <Button
              onClick={() => setSidebarOpen(false)}
              variant="ghost"
              size="sm"
              className="text-white/70 hover:text-white"
              data-testid="button-close-sidebar"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </div>

          {/* Sidebar Content */}
          <div className="flex-1 space-y-4">
            {/* Audio Only Toggle */}
            <div className="glass p-4 rounded-lg border border-white/10 card-hover">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="audio-only-sidebar"
                  className="text-white text-base font-medium cursor-pointer select-none flex-1"
                >
                  Audio Only Mode
                </label>
                <Checkbox
                  id="audio-only-sidebar"
                  checked={audioOnly}
                  onCheckedChange={handleAudioOnlyToggle}
                  className="border-white data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                  data-testid="checkbox-audio-only"
                />
              </div>
              <p className="text-white/60 text-sm mt-2">
                Switch to audio-only for lower bandwidth usage
              </p>
            </div>

            {/* Memory Toggle */}
            <div className="glass p-4 rounded-lg border border-white/10 card-hover">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="memory-enabled-sidebar"
                  className="text-white text-base font-medium cursor-pointer select-none flex items-center gap-2 flex-1"
                >
                  <Brain className="w-5 h-5 text-purple-400" />
                  Conversation Memory
                  {memoryEnabled && (
                    <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse glow-primary" title="Memory active" />
                  )}
                </label>
                <Checkbox
                  id="memory-enabled-sidebar"
                  checked={memoryEnabled}
                  onCheckedChange={handleMemoryToggle}
                  className="border-white data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                  data-testid="checkbox-memory-enabled"
                />
              </div>
              <p className="text-white/60 text-sm mt-2">
                Remember conversations across sessions using AI memory
              </p>
            </div>

            {/* View Memories Button */}
            <Button
              onClick={() => {
                setShowMemoryViewer(true);
                setSidebarOpen(false);
              }}
              className="w-full bg-gradient-primary hover:opacity-90 text-white rounded-lg flex items-center gap-3 justify-center !h-auto py-4 glow-primary"
              data-testid="button-view-memories"
              title="View stored memories"
            >
              <Database className="w-5 h-5" />
              <span className="text-base font-semibold">View Memories</span>
            </Button>
          </div>

          {/* Sidebar Footer */}
          <div className="mt-6 pt-4 border-t border-white/10">
            <p className="text-white/50 text-xs text-center">
              Settings apply in real-time
            </p>
          </div>
        </div>
      </div>

      {/* Overlay when sidebar is open */}
      {sidebarOpen && (
        <div 
          className="absolute inset-0 bg-black/50 z-40 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
          data-testid="sidebar-overlay"
        />
      )}

      {/* Fullscreen Button - Top Left (Below Sidebar Toggle) */}
      {sessionActive && (
        <Button
          onClick={toggleFullscreen}
          className="absolute z-50 bg-black/50 hover:bg-black/70 text-white rounded-lg backdrop-blur-sm flex items-center gap-2 !h-auto !min-h-[44px] p-2 md:p-3 top-16 left-3 md:top-20 md:left-4 lg:top-20 lg:left-6"
          data-testid="button-fullscreen-toggle"
          title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? (
            <Minimize2 className="w-5 h-5" aria-hidden="true" />
          ) : (
            <Maximize2 className="w-5 h-5" aria-hidden="true" />
          )}
        </Button>
      )}

      {/* Pause/Resume Button - Top Center */}
      {sessionActive && (
        <Button
          onClick={async () => {
            try {
              await togglePause();
            } catch (error: any) {
              toast({
                variant: "destructive",
                title: isPaused ? "Cannot resume" : "Cannot pause",
                description: error.message || `Failed to ${isPaused ? "resume" : "pause"} session. Please try again.`,
              });
            }
          }}
          className="absolute z-50 left-1/2 -translate-x-1/2 bg-purple-500/80 hover:bg-purple-600 text-white rounded-full backdrop-blur-sm flex items-center gap-2 !h-auto !min-h-[44px] top-3 p-2 md:top-4 md:p-3 lg:top-6 lg:px-4 lg:py-2"
          data-testid="button-pause-toggle"
          title={isPaused ? "Resume chat" : "Pause chat"}
          aria-label={isPaused ? "Resume chat" : "Pause chat"}
        >
          {isPaused ? (
            <>
              <Play className="w-4 h-4 md:w-5 md:h-5 lg:w-4 lg:h-4" aria-hidden="true" />
              <span className="hidden md:inline text-sm font-medium">Resume</span>
            </>
          ) : (
            <>
              <Pause className="w-4 h-4 md:w-5 md:h-5 lg:w-4 lg:h-4" aria-hidden="true" />
              <span className="hidden md:inline text-sm font-medium">Pause</span>
            </>
          )}
        </Button>
      )}

      {/* Avatar Switcher Button - Top Right (Next to End Chat) */}
      {sessionActive && (
        <Button
          onClick={() => setShowAvatarSwitcher(true)}
          className="absolute z-50 bg-purple-500/80 hover:bg-purple-600 text-white rounded-full backdrop-blur-sm flex items-center gap-2 !h-auto !min-h-[44px] top-16 right-3 p-2 md:top-20 md:right-4 md:p-3 lg:top-6 lg:right-40 lg:px-4 lg:py-2"
          disabled={switchingAvatar}
          data-testid="button-open-avatar-switcher"
          title="Switch AI Guide"
          aria-label="Switch AI Guide"
        >
          <Users className="w-4 h-4 md:w-5 md:h-5 lg:w-4 lg:h-4" aria-hidden="true" />
          <span className="hidden md:inline text-sm font-medium">Switch</span>
        </Button>
      )}

      {/* End Chat Button - Top Right */}
      {sessionActive && (
        <Button
          onClick={endChat}
          className="absolute z-50 bg-purple-700/80 hover:bg-purple-800 text-white rounded-full backdrop-blur-sm flex items-center gap-2 !h-auto !min-h-[44px] top-3 right-3 p-2 md:top-4 md:right-4 md:p-3 lg:top-6 lg:right-6 lg:px-4 lg:py-2"
          data-testid="button-end-chat"
          title="End chat and restart"
          aria-label="End chat and restart"
        >
          <X className="w-4 h-4 md:w-5 md:h-5 lg:w-4 lg:h-4" aria-hidden="true" />
          <span className="hidden md:inline text-sm font-medium">End Chat</span>
        </Button>
      )}

      {/* Start Button - Full overlay in audio mode, positioned over video in video mode */}
      {showChatButton && !showAvatarSelector && (
        <div className={`absolute inset-0 z-50 flex items-center justify-center ${audioOnly ? 'bg-black' : 'pointer-events-none'}`}>
          <Button
            onClick={async () => {
              console.log("Start button clicked - initiating session manually");
              setShowChatButton(false);
              try {
                await startSession({ audioOnly, avatarId: selectedAvatarId });
              } catch (error: any) {
                setShowChatButton(true); // Restore button so user can retry
                toast({
                  variant: "destructive",
                  title: "Cannot start session",
                  description: error.message || "Failed to start session. Please try again.",
                });
              }
            }}
            className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 md:px-12 md:py-4 text-base md:text-lg font-semibold rounded-full shadow-lg pointer-events-auto"
            data-testid="button-start-session"
          >
            Start Chat
          </Button>
        </div>
      )}

      {/* Loading Overlay - Full screen in audio mode, unobtrusive spinner in video mode */}
      {isLoading && !showReconnect && (
        audioOnly ? (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black">
            <LoadingPlaceholder avatarId={selectedAvatarId} data-testid="loading-placeholder" />
          </div>
        ) : (
          <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
            <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" data-testid="loading-spinner" />
          </div>
        )
      )}

      {/* Reconnect Screen - Full overlay in audio mode, floating button in video mode */}
      {showReconnect && (
        <div className={`absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 md:gap-8 ${audioOnly ? 'bg-black' : 'pointer-events-none'}`}>
          {audioOnly && <LoadingPlaceholder avatarId={selectedAvatarId} data-testid="reconnect-placeholder" />}
          <Button
            onClick={async () => {
              try {
                await reconnect();
              } catch (error: any) {
                toast({
                  variant: "destructive",
                  title: "Cannot reconnect",
                  description: error.message || "Failed to reconnect. Please try again.",
                });
              }
            }}
            className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-2.5 md:px-10 md:py-3 text-sm md:text-base font-semibold rounded-full shadow-lg pointer-events-auto"
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
          <div className="flex flex-col items-center gap-2 md:gap-3">
            <img 
              src={showExpandedFingers ? unpinchGraphic2 : unpinchGraphic1} 
              alt="Expand for fullscreen" 
              className="w-12 h-12 md:w-16 md:h-16 transition-opacity duration-300"
              data-testid="unpinch-graphic"
            />
            <p className="text-white text-sm md:text-base font-medium text-center drop-shadow-lg">
              Click full screen<br/>then expand
            </p>
          </div>
        </div>
      )}

      {/* Avatar Video Stream */}
      <div className="w-full h-full flex items-center justify-center bg-black">
        {/* HeyGen avatar video stream */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
          style={{ display: audioOnly ? 'none' : 'block' }}
          data-testid="avatar-video"
        />
        
        {/* Audio-only display */}
        {audioOnly && (
          <AudioOnlyDisplay isSpeaking={isSpeaking} sessionActive={sessionActive} />
        )}
      </div>

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
          className="absolute bottom-3 md:bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 md:gap-2 w-full max-w-2xl px-3 md:px-4"
        >
          <Input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 bg-black/50 backdrop-blur-sm text-white border-purple-500/30 focus:border-purple-500 placeholder:text-gray-400 text-sm md:text-base h-9 md:h-10"
            data-testid="input-message"
            disabled={!sessionActive || isPaused}
          />
          <Button
            type="submit"
            disabled={!inputMessage.trim() || !sessionActive || isPaused}
            className="bg-purple-500 hover:bg-purple-600 text-white rounded-full flex items-center gap-2 !h-auto !min-h-[44px] p-3 md:px-4 md:py-3"
            data-testid="button-send-message"
            aria-label="Send message"
          >
            <Send className="w-4 h-4 md:w-5 md:h-5" aria-hidden="true" />
            <span className="hidden md:inline text-sm font-medium">Send</span>
          </Button>
        </form>
      )}

      {/* Current Avatar Indicator - Bottom Left */}
      {sessionActive && currentAvatarName && (
        <div className="absolute z-40 bg-black/60 backdrop-blur-sm text-white px-3 py-1.5 md:px-4 md:py-2 rounded-lg bottom-16 left-3 md:bottom-20 md:left-4 lg:bottom-6 lg:left-6">
          <div className="flex items-center gap-1.5 md:gap-2">
            <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-sm md:text-base font-medium">{currentAvatarName}</span>
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

      {/* Memory Viewer Dialog */}
      {showMemoryViewer && (
        <MemoryViewer
          userId={userId}
          onClose={() => setShowMemoryViewer(false)}
        />
      )}
    </div>
  );
}
