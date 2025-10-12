import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { X, Maximize2, Minimize2, Pause, Play } from "lucide-react";
import loadingVideo from "@assets/intro logo_1760052672430.mp4";
import unpinchGraphic1 from "@assets/Unpinch 1__1760076687886.png";
import unpinchGraphic2 from "@assets/unpinch 2_1760076687886.png";
import StreamingAvatar, { AvatarQuality, StreamingEvents, TaskType } from "@heygen/streaming-avatar";

interface AvatarChatProps {
  userId: string;
}

export function AvatarChat({ userId }: AvatarChatProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [showChatButton, setShowChatButton] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showExpandedFingers, setShowExpandedFingers] = useState(false);
  const [hasUsedFullscreen, setHasUsedFullscreen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showReconnect, setShowReconnect] = useState(false);
  const intentionalStopRef = useRef(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const avatarRef = useRef<StreamingAvatar | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasStartedRef = useRef(false);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentRequestIdRef = useRef<string>("");
  const hasAskedAnythingElseRef = useRef(false);

  useEffect(() => {
    // Check if device is mobile
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    // Global handler to suppress abort error overlays
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (event.reason?.name === 'AbortError' || event.reason?.message?.includes('aborted')) {
        event.preventDefault(); // Suppress the error overlay
        console.log("Abort error suppressed - this is expected when cancelling requests");
      }
    };
    
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
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
      console.log("Inactivity timer cleared and reset");
    } else {
      console.log("Inactivity timer started for first time");
    }
    
    // Reset the "asked anything else" flag when user is active
    hasAskedAnythingElseRef.current = false;
    
    // Set new 1-minute timeout
    inactivityTimerRef.current = setTimeout(async () => {
      console.log("Inactivity timeout triggered - 60 seconds elapsed");
      
      // First timeout: Ask if there's anything else
      if (!hasAskedAnythingElseRef.current && avatarRef.current) {
        hasAskedAnythingElseRef.current = true;
        console.log("Asking if there's anything else...");
        
        try {
          // First interrupt any ongoing speech
          await avatarRef.current.interrupt().catch(() => {});
          console.log("About to speak: Is there anything else...");
          
          await avatarRef.current.speak({
            text: "Is there anything else I can help you with?",
            task_type: TaskType.REPEAT
          });
          
          console.log("Successfully spoke the question");
          
          // Give user 20 more seconds to respond
          inactivityTimerRef.current = setTimeout(() => {
            console.log("No response after asking - terminating session");
            endSessionShowReconnect();
          }, 20000); // 20 seconds to respond
        } catch (error) {
          console.error("Error asking if anything else:", error);
          endSessionShowReconnect();
        }
      } else {
        // Already asked or no avatar - just end session
        console.log("Already asked or no avatar - terminating immediately");
        endSessionShowReconnect();
      }
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
        console.log("Stream disconnected - intentionalStop flag:", intentionalStopRef.current);
        // Only auto-restart if disconnect was NOT intentional (e.g., not from pause/timeout)
        if (!intentionalStopRef.current) {
          console.log("Unintentional disconnect - auto-restarting");
          endSession();
        } else {
          console.log("Intentional stop - NOT auto-restarting, staying stopped");
          intentionalStopRef.current = false; // Reset flag
          setSessionActive(false);
        }
      });

      // Listen for user message events - fires when user talks
      avatar.on(StreamingEvents.USER_TALKING_MESSAGE, async (message: any) => {
        try {
          console.log("USER_TALKING_MESSAGE event received:", message);
          
          // Reset inactivity timer on user activity
          resetInactivityTimer();
          
          const userMessage = message?.detail?.message || message?.message || message;
          console.log("User message extracted:", userMessage);
          
          if (userMessage) {
            // Generate unique request ID to track this request
            const requestId = Date.now().toString() + Math.random().toString(36);
            currentRequestIdRef.current = requestId;
            console.log("New question detected - Request ID:", requestId);
            
            // START THE API CALL IMMEDIATELY (don't wait for thinking phrase)
            const responsePromise = fetch("/api/avatar/response", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: userMessage })
            });
            
            // While API is processing, interrupt HeyGen and say a quick thinking phrase
            const thinkingPhrases = [
              "Let me think on that...",
              "Good question, give me a sec...",
              "Ah, interesting - let me pull that up...",
              "That's a great one, hold on...",
              "Mmm, let me dig into that..."
            ];
            
            const followUpPhrases = [
              "Still digging through the archives...",
              "Hang tight, pulling up the good stuff...",
              "Almost there, just connecting the dots...",
              "This is a juicy one, give me another moment...",
              "Alright, piecing this together..."
            ];
            
            const randomPhrase = thinkingPhrases[Math.floor(Math.random() * thinkingPhrases.length)];
            
            // Reset inactivity timer before thinking phrase to prevent timeout
            resetInactivityTimer();
            
            // Interrupt any HeyGen response and say thinking phrase
            await avatar.interrupt().catch(() => {});
            await avatar.speak({
              text: randomPhrase,
              task_type: TaskType.REPEAT
            });
            
            // Set up interval to add follow-up phrases every 12 seconds while waiting
            const fillerInterval = setInterval(async () => {
              const followUpPhrase = followUpPhrases[Math.floor(Math.random() * followUpPhrases.length)];
              
              // Reset timer before each filler phrase to keep session alive
              resetInactivityTimer();
              
              await avatar.interrupt().catch(() => {});
              await avatar.speak({
                text: followUpPhrase,
                task_type: TaskType.REPEAT
              }).catch(() => {}); // Catch errors if response arrives during speak
            }, 12000);
            
            // Wait for Claude response (already started processing above)
            try {
              const response = await responsePromise;
              
              // Clear the filler interval once response arrives
              clearInterval(fillerInterval);

              // Check if this is still the current request - ignore if a newer one exists
              if (requestId !== currentRequestIdRef.current) {
                console.log("Ignoring old response - newer request in progress");
                return;
              }

              if (response.ok) {
                const data = await response.json();
                const claudeResponse = data.knowledgeResponse || data.response;
                console.log("Claude response received:", claudeResponse);
                
                // Reset inactivity timer before avatar starts speaking to prevent timeout mid-response
                resetInactivityTimer();
                
                // Interrupt thinking phrase and speak the real response
                await avatar.interrupt().catch(() => {});
                
                // Make avatar speak Claude's response using REPEAT (not TALK)
                await avatar.speak({
                  text: claudeResponse,
                  task_type: TaskType.REPEAT
                });
              }
            } catch (error) {
              // Clear the filler interval on error
              clearInterval(fillerInterval);
              console.error("Error getting Claude response:", error);
            }
          }
        } catch (error) {
          // Silently catch abort errors to prevent error overlay
          if (error instanceof Error && error.name === 'AbortError') {
            // This is expected - do nothing
          } else if (error instanceof DOMException && error.name === 'AbortError') {
            // This is expected - do nothing  
          } else {
            console.error("Unexpected error in message handler:", error);
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

  async function endSessionShowReconnect() {
    // Clear inactivity timer
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    
    // Make avatar say goodbye message before stopping
    if (avatarRef.current) {
      try {
        // Avatar speaks a funny timeout message
        await avatarRef.current.speak({
          text: "Well, if that's all I've got to work with here... guess I'll save us both some credits and take a break. Hit that reconnect button when you're ready for round two!",
          task_type: TaskType.REPEAT
        });
        
        // Wait a moment for the message to finish
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Mark this as intentional stop so it doesn't auto-restart
        intentionalStopRef.current = true;
        console.log("Setting intentionalStop flag to TRUE for timeout");
        
        // Now stop the avatar stream (saves credits!)
        await avatarRef.current.stopAvatar().catch(console.error);
        avatarRef.current = null;
      } catch (error) {
        console.error("Error in timeout message:", error);
        // Stop avatar anyway
        if (avatarRef.current) {
          intentionalStopRef.current = true;
          await avatarRef.current.stopAvatar().catch(console.error);
          avatarRef.current = null;
        }
      }
    }
    
    // Clear the video element to remove any lingering stream
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      console.log("Video element cleared on timeout");
    }
    
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

  const endChat = () => {
    endSession();
  };

  const reconnect = () => {
    setShowReconnect(false);
    hasStartedRef.current = false;
    startSession();
  };

  const togglePause = async () => {
    if (isPaused) {
      // Resume: Restart the entire avatar session
      setIsPaused(false);
      hasStartedRef.current = false;
      startSession();
      console.log("Avatar resuming - restarting session");
    } else {
      // Pause: STOP the avatar stream completely (saves credits!)
      if (avatarRef.current) {
        // Mark this as intentional stop so it doesn't auto-restart
        intentionalStopRef.current = true;
        console.log("Setting intentionalStop flag to TRUE for pause");
        await avatarRef.current.stopAvatar().catch(console.error);
        avatarRef.current = null;
      }
      
      // Clear the video element to remove any lingering stream
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        console.log("Video element cleared");
      }
      
      setSessionActive(false);
      setIsPaused(true);
      console.log("Avatar paused - stream stopped to save credits");
      
      // Clear inactivity timer when paused
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
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

      {/* End Chat Button - Top Right (All Screens) - Only shown when session active */}
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

      {/* Reconnect Screen - Shows after inactivity timeout */}
      {showReconnect && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black gap-8">
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
          <Button
            onClick={reconnect}
            className="bg-purple-600 hover:bg-purple-700 text-white px-10 py-3 text-base font-semibold rounded-full shadow-lg"
            data-testid="button-reconnect"
          >
            Reconnect
          </Button>
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
