import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { X, Maximize2, Minimize2, Pause, Play, ArrowLeft } from "lucide-react";
import loadingVideo from "@assets/intro logo_1760052672430.mp4";
import unpinchGraphic1 from "@assets/Unpinch 1__1760076687886.png";
import unpinchGraphic2 from "@assets/unpinch 2_1760076687886.png";
import StreamingAvatar, { AvatarQuality, StreamingEvents, TaskType } from "@heygen/streaming-avatar";
import { useAuth } from "@/hooks/useAuth";

interface AvatarChatProps {
  avatarId?: string;
  avatarConfig?: {
    id: string;
    name: string;
    description: string;
    heygenAvatarId: string;
    demoMinutes: number;
  };
  onBackToSelection?: () => void;
}

export function AvatarChat({ 
  avatarId = "mark-kohl", 
  avatarConfig = {
    id: "mark-kohl",
    name: "Mark Kohl",
    description: "Your no-nonsense guide",
    heygenAvatarId: "josh_lite3_20230714",
    demoMinutes: 5
  },
  onBackToSelection
}: AvatarChatProps = {}) {
  const { isAuthenticated } = useAuth();
  const [isMobile, setIsMobile] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [showChatButton, setShowChatButton] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showExpandedFingers, setShowExpandedFingers] = useState(false);
  const [hasUsedFullscreen, setHasUsedFullscreen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showReconnect, setShowReconnect] = useState(false);
  const [reconnectReason, setReconnectReason] = useState<'inactivity' | 'demo-expired'>('inactivity');
  const [demoTimeRemaining, setDemoTimeRemaining] = useState<number | null>(null);
  const [showDemoWarning, setShowDemoWarning] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const avatarRef = useRef<StreamingAvatar | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasStartedRef = useRef(false);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const demoTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Check if device is mobile
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  useEffect(() => {
    // Auto-start the session when component mounts (both mobile and desktop)
    if (!hasStartedRef.current) {
      hasStartedRef.current = true;
      setIsLoading(true);
      setShowChatButton(false);
      startSession();
    }
  }, []);

  // Reset inactivity timer
  const resetInactivityTimer = () => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    
    // Set new 1-minute timeout
    inactivityTimerRef.current = setTimeout(() => {
      console.log("Inactivity timeout - showing reconnect screen");
      endSessionShowReconnect();
    }, 60000); // 60 seconds = 1 minute
  };

  // Start inactivity timer when session becomes active
  useEffect(() => {
    if (sessionActive && !isPaused) {
      resetInactivityTimer();
    }
    
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [sessionActive, isPaused]);

  // Start demo timer when session becomes active (only for non-authenticated users)
  useEffect(() => {
    // Skip demo timer for authenticated users - they have unlimited access
    if (isAuthenticated) {
      setDemoTimeRemaining(null);
      setShowDemoWarning(false);
      return;
    }

    if (sessionActive) {
      // Set initial time in seconds
      const demoSeconds = avatarConfig.demoMinutes * 60;
      setDemoTimeRemaining(demoSeconds);
      
      // Update timer every second
      const interval = setInterval(() => {
        setDemoTimeRemaining(prev => {
          if (prev === null || prev <= 0) {
            clearInterval(interval);
            return 0;
          }
          
          const newTime = prev - 1;
          
          // Show warning at 1 minute remaining
          if (newTime === 60 && !showDemoWarning) {
            setShowDemoWarning(true);
          }
          
          // End session when time runs out
          if (newTime === 0) {
            setTimeout(() => {
              endDemoSession();
            }, 100);
          }
          
          return newTime;
        });
      }, 1000);
      
      demoTimerRef.current = interval as any;
    } else {
      // Clear timer when session is not active
      if (demoTimerRef.current) {
        clearInterval(demoTimerRef.current);
        demoTimerRef.current = null;
      }
      setDemoTimeRemaining(null);
      setShowDemoWarning(false);
    }
    
    return () => {
      if (demoTimerRef.current) {
        clearInterval(demoTimerRef.current);
      }
    };
  }, [sessionActive, avatarConfig.demoMinutes, isAuthenticated]);

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
    // Listen for fullscreen changes (both desktop and mobile)
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement || 
        (document as any).webkitFullscreenElement ||
        (videoRef.current as any)?.webkitDisplayingFullscreen
      );
      setIsFullscreen(isCurrentlyFullscreen);
      
      // Track that fullscreen has been used at least once
      if (isCurrentlyFullscreen) {
        setHasUsedFullscreen(true);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    
    if (videoRef.current) {
      videoRef.current.addEventListener('webkitbeginfullscreen', () => {
        setIsFullscreen(true);
        setHasUsedFullscreen(true);
      });
      videoRef.current.addEventListener('webkitendfullscreen', () => setIsFullscreen(false));
    }
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    // Animate unpinch graphic by toggling between two images (MOBILE ONLY)
    // Show whenever session is active and not in fullscreen
    if (isMobile && sessionActive && !isFullscreen) {
      const interval = setInterval(() => {
        setShowExpandedFingers(prev => !prev);
      }, 800); // Toggle every 800ms for smooth animation
      
      return () => clearInterval(interval);
    }
  }, [isMobile, sessionActive, isFullscreen]);

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
        
        // Reset inactivity timer on user activity
        resetInactivityTimer();
        
        const userMessage = message?.detail?.message || message?.message || message;
        console.log("User message extracted:", userMessage);
        
        if (userMessage) {
          // Get response from Claude backend
          try {
            const response = await fetch("/api/avatar/response", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                message: userMessage,
                avatarId: avatarId
              })
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
        avatarName: avatarConfig.heygenAvatarId,
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

  function endSessionShowReconnect() {
    // Clear inactivity timer
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    
    if (avatarRef.current) {
      avatarRef.current.stopAvatar().catch(console.error);
      avatarRef.current = null;
    }
    setReconnectReason('inactivity');
    setSessionActive(false);
    setIsLoading(true);
    setShowReconnect(true);
  }

  function endSession() {
    // Clear inactivity timer
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    
    if (avatarRef.current) {
      avatarRef.current.stopAvatar().catch(console.error);
      avatarRef.current = null;
    }
    setSessionActive(false);
    setIsLoading(true);
    
    // Auto-restart on both mobile and desktop
    setTimeout(() => {
      hasStartedRef.current = false;
      startSession();
    }, 100);
  }

  function endDemoSession() {
    // Clear all timers
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    if (demoTimerRef.current) {
      clearInterval(demoTimerRef.current);
      demoTimerRef.current = null;
    }
    
    if (avatarRef.current) {
      avatarRef.current.stopAvatar().catch(console.error);
      avatarRef.current = null;
    }
    setReconnectReason('demo-expired');
    setSessionActive(false);
    setIsLoading(true);
    setShowReconnect(true);
  }

  const endChat = () => {
    endSession();
  };

  const reconnect = () => {
    setShowReconnect(false);
    hasStartedRef.current = false;
    startSession();
  };

  const togglePause = async () => {
    if (!avatarRef.current) return;

    try {
      if (isPaused) {
        // Resume: Start voice chat again
        await avatarRef.current.startVoiceChat();
        setIsPaused(false);
        console.log("Avatar resumed");
        // Reset inactivity timer when resuming
        resetInactivityTimer();
      } else {
        // Pause: Stop voice chat (mutes microphone)
        await avatarRef.current.closeVoiceChat();
        setIsPaused(true);
        console.log("Avatar paused");
        // Clear inactivity timer when paused
        if (inactivityTimerRef.current) {
          clearTimeout(inactivityTimerRef.current);
          inactivityTimerRef.current = null;
        }
      }
    } catch (error) {
      console.error("Error toggling pause:", error);
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (isMobile && videoRef.current) {
        const videoElement = videoRef.current as any;
        
        // For iOS Safari: Remove playsInline to allow native fullscreen
        videoElement.removeAttribute('playsinline');
        
        // Try different fullscreen methods
        if (videoElement.webkitEnterFullscreen) {
          // iOS Safari - this is the most reliable method
          videoElement.webkitEnterFullscreen();
        } else if (videoElement.webkitRequestFullscreen) {
          await videoElement.webkitRequestFullscreen();
        } else if (videoElement.requestFullscreen) {
          await videoElement.requestFullscreen();
        }
        
        // Restore playsInline after a delay (when exiting fullscreen)
        setTimeout(() => {
          videoElement.setAttribute('playsinline', '');
        }, 500);
      } else {
        // Desktop: Use container fullscreen
        if (!document.fullscreenElement) {
          await containerRef.current?.requestFullscreen();
        } else {
          await document.exitFullscreen();
        }
      }
    } catch (error) {
      console.error('Error toggling fullscreen:', error);
      // Restore playsInline on error
      if (isMobile && videoRef.current) {
        (videoRef.current as any).setAttribute('playsinline', '');
      }
    }
  };

  return (
    <div ref={containerRef} className="w-full h-screen relative overflow-hidden bg-black">
      {/* Fullscreen Button - Top Left - Only shown when session active */}
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

      {/* Pause/Resume Button - Top Center - Only shown when session active */}
      {sessionActive && (
        <Button
          onClick={togglePause}
          className={`absolute z-50 left-1/2 -translate-x-1/2 bg-yellow-600/80 hover:bg-yellow-700 text-white rounded-full backdrop-blur-sm flex items-center gap-2 ${
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

      {/* End Chat Button - Top Right (All Screens) - Only shown when session active */}
      {sessionActive && (
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

      {/* Back to Selection Button - Bottom Left - Only shown when callback provided */}
      {onBackToSelection && !showReconnect && !isLoading && (
        <Button
          onClick={onBackToSelection}
          className={`absolute z-50 bg-gray-600/80 hover:bg-gray-700 text-white rounded-full backdrop-blur-sm flex items-center gap-2 ${
            isMobile ? 'bottom-4 left-4 p-3' : 'bottom-6 left-6 px-4 py-2'
          }`}
          data-testid="button-back-to-selection"
          title="Choose different avatar"
        >
          <ArrowLeft className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} />
          {!isMobile && <span className="text-sm font-medium">Change Avatar</span>}
        </Button>
      )}

      {/* Demo Timer Display - Bottom Right */}
      {sessionActive && demoTimeRemaining !== null && demoTimeRemaining > 0 && (
        <div 
          className={`absolute z-50 bg-purple-600/80 backdrop-blur-sm rounded-full px-4 py-2 ${
            isMobile ? 'bottom-4 right-4' : 'bottom-6 right-6'
          } ${showDemoWarning ? 'animate-pulse bg-orange-600/80' : ''}`}
          data-testid="demo-timer"
        >
          <span className="text-white text-sm font-medium">
            {Math.floor(demoTimeRemaining / 60)}:{(demoTimeRemaining % 60).toString().padStart(2, '0')}
          </span>
        </div>
      )}

      {/* Demo Warning Message - Center */}
      {showDemoWarning && sessionActive && (
        <div className="absolute z-50 top-24 left-1/2 -translate-x-1/2 bg-orange-600/90 backdrop-blur-sm rounded-lg px-6 py-3 max-w-md">
          <p className="text-white text-center text-sm font-medium" data-testid="demo-warning">
            1 minute remaining in demo. Sign in for unlimited access!
          </p>
        </div>
      )}

      {/* Loading Video Overlay */}
      {isLoading && !showReconnect && (
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

      {/* Reconnect Screen - Shows after inactivity timeout or demo expiration */}
      {showReconnect && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black gap-6">
          <video
            autoPlay
            muted
            loop
            playsInline
            className="max-w-[60%] max-h-[60%] object-contain"
            data-testid="reconnect-video"
          >
            <source src={loadingVideo} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
          {reconnectReason === 'demo-expired' ? (
            <>
              <div className="text-center max-w-md px-4">
                <h3 className="text-white text-xl font-bold mb-2" data-testid="demo-expired-title">
                  Demo Time Expired
                </h3>
                <p className="text-gray-300 text-sm mb-4" data-testid="demo-expired-message">
                  Your {avatarConfig.demoMinutes}-minute demo with {avatarConfig.name} has ended. Sign in for unlimited access or try another demo!
                </p>
              </div>
              <div className="flex flex-wrap gap-3 justify-center">
                <Button
                  onClick={() => window.location.href = "/api/login"}
                  className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 text-sm font-semibold rounded-full shadow-lg"
                  data-testid="button-sign-in"
                >
                  Sign In for Unlimited Access
                </Button>
                <Button
                  onClick={reconnect}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 text-sm font-semibold rounded-full shadow-lg"
                  data-testid="button-try-again"
                >
                  Try Another Demo
                </Button>
                {onBackToSelection && (
                  <Button
                    onClick={onBackToSelection}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-8 py-3 text-sm font-semibold rounded-full shadow-lg"
                    data-testid="button-change-avatar"
                  >
                    Change Avatar
                  </Button>
                )}
              </div>
            </>
          ) : (
            <Button
              onClick={reconnect}
              className="bg-purple-600 hover:bg-purple-700 text-white px-10 py-3 text-base font-semibold rounded-full shadow-lg"
              data-testid="button-reconnect"
            >
              Reconnect
            </Button>
          )}
        </div>
      )}

      {/* Unpinch Graphic - Mobile only, shows when video is not in fullscreen */}
      {isMobile && sessionActive && !isFullscreen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <img 
              src={showExpandedFingers ? unpinchGraphic2 : unpinchGraphic1} 
              alt="Expand for fullscreen" 
              className="w-16 h-16 opacity-90 transition-opacity duration-300"
              data-testid="unpinch-graphic"
            />
            <p className="text-white text-base font-medium text-center">
              Expand for<br/>Fullscreen
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
