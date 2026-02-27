import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { X, Maximize2, Minimize2, Pause, Play } from "lucide-react";
import loadingVideo from "@assets/intro logo_1760052672430.mp4";
import unpinchGraphic1 from "@assets/Unpinch 1__1760076687886.png";
import unpinchGraphic2 from "@assets/unpinch 2_1760076687886.png";
import { LiveAvatarSession, SessionEvent, SessionState, AgentEventsEnum } from "@heygen/liveavatar-web-sdk";

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
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [showUnpinchAnimation, setShowUnpinchAnimation] = useState(false);
  const intentionalStopRef = useRef(false);
  const unpinchTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Check if user enabled memory
    const memoryPref = localStorage.getItem('memory-enabled');
    setMemoryEnabled(memoryPref === 'true');
  }, []);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const avatarRef = useRef<LiveAvatarSession | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasStartedRef = useRef(false);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const signOffTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const speakingIntervalRef = useRef<NodeJS.Timeout | null>(null);
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

  // Reset inactivity timer
  const resetInactivityTimer = () => {
    // Clear main inactivity timer
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      console.log("Inactivity timer cleared and reset");
    } else {
      console.log("Inactivity timer started for first time");
    }
    
    // Cancel sign-off timeout if user speaks during sign-off
    if (signOffTimeoutRef.current) {
      clearTimeout(signOffTimeoutRef.current);
      signOffTimeoutRef.current = null;
      console.log("Sign-off timeout cancelled - user is active again");
      
      // Interrupt avatar if it's speaking the sign-off message
      if (avatarRef.current) {
        try { avatarRef.current.interrupt(); } catch(e) {}
      }
    }
    
    // Clear speaking interval if it exists (user spoke while avatar was talking)
    if (speakingIntervalRef.current) {
      clearInterval(speakingIntervalRef.current);
      speakingIntervalRef.current = null;
      console.log("Cleared speaking interval - user interrupted");
    }
    
    // Reset the "asked anything else" flag when user is active
    hasAskedAnythingElseRef.current = false;
    
    // Set 1-minute timeout - ask if anything else after 1 minute of inactivity
    inactivityTimerRef.current = setTimeout(async () => {
      console.log("Inactivity timeout triggered - 1 minute elapsed");
      
      if (avatarRef.current) {
        try {
          // Interrupt any ongoing speech
          try { avatarRef.current.interrupt(); } catch(e) {}
          
          // Ask if there's anything else before ending
          const anythingElseMessage = "Is there anything else I can help you with today?";
          
          avatarRef.current.repeat(anythingElseMessage);
          
          console.log("'Anything else?' message delivered");
          
          // Wait 20 seconds for user response
          // Store timeout in ref so it can be cancelled if user speaks
          signOffTimeoutRef.current = setTimeout(async () => {
            // User didn't respond - give final summary and end session
            const finalMessage = "Alright. Thanks for the conversation - hope it was helpful. Take care.";
            
            if (avatarRef.current) {
              avatarRef.current.repeat(finalMessage);
              
              // Wait 5 seconds for final message to finish, then end
              setTimeout(() => {
                endSessionShowReconnect();
              }, 5000);
            } else {
              endSessionShowReconnect();
            }
          }, 20000); // 20 seconds to respond
        } catch (error) {
          console.error("Error during sign-off:", error);
          endSessionShowReconnect();
        }
      } else {
        // No avatar - just end session
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
      
      console.log("Fullscreen change detected:", isCurrentlyFullscreen);
      setIsFullscreen(isCurrentlyFullscreen);
      
      // Track that fullscreen has been used at least once
      if (isCurrentlyFullscreen) {
        console.log("Entering fullscreen - showing unpinch animation");
        setHasUsedFullscreen(true);
        
        // Show unpinch animation for 5 seconds when entering fullscreen
        setShowUnpinchAnimation(true);
        
        // Clear any existing timer
        if (unpinchTimerRef.current) {
          clearTimeout(unpinchTimerRef.current);
        }
        
        // Hide after 5 seconds
        unpinchTimerRef.current = setTimeout(() => {
          console.log("Hiding unpinch animation after 5 seconds");
          setShowUnpinchAnimation(false);
        }, 5000);
      } else {
        // Hide animation when exiting fullscreen
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
      
      // Clear any existing timer
      if (unpinchTimerRef.current) {
        clearTimeout(unpinchTimerRef.current);
      }
      
      // Hide after 5 seconds
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

    // iOS Safari presentation mode changed
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

  useEffect(() => {
    // Animate unpinch graphic by toggling between two images (MOBILE/TABLET ONLY)
    // Show for 5 seconds after entering browser fullscreen to guide user to pinch for true fullscreen
    // This creates a two-step process: 1) Tap fullscreen button, 2) Then unpinch appears for 5 seconds
    if (isMobile && sessionActive && showUnpinchAnimation) {
      const interval = setInterval(() => {
        setShowExpandedFingers(prev => !prev);
      }, 800); // Toggle every 800ms for smooth animation
      
      return () => clearInterval(interval);
    }
  }, [isMobile, sessionActive, showUnpinchAnimation]);

  async function fetchAccessToken(): Promise<string> {
    try {
      const response = await fetch("/api/liveavatar/token", {
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
      const session = new LiveAvatarSession(token, { voiceChat: true });
      avatarRef.current = session;

      session.on(SessionEvent.SESSION_STREAM_READY, () => {
        console.log("LiveAvatar stream ready");
        if (videoRef.current) {
          session.attach(videoRef.current);
          videoRef.current.play().catch(console.error);
        }
        
        setTimeout(() => {
          const greetings = [
            "Hey there — I'm Mark Kohl. You're actually talking to my digital self, but everything you'll hear comes directly from my real experiences, my research, and my life's work.",
            "Hi, I'm Mark Kohl. This is my avatar — but what you're about to hear comes straight from me. I helped build this AI so my work could reach more people, in more ways.",
            "Hello. I'm Mark Kohl — or at least, the AI version of me. I've spent years teaching, learning, and exploring what makes us human. This is my way of sharing that knowledge with anyone who needs it.",
            "Hey there. I'm Mark Kohl. You're talking to my avatar — but rest assured, what comes out of my mouth was written, spoken, and lived by me.",
            "Hi, I'm Mark Kohl. Think of this as a conversation with my digital twin — powered by AI, but shaped by decades of lived experience.",
            "Hey, I'm Mark Kohl. You're meeting the AI version of me — something I created so I could be here even when I can't be in person.",
            "Hi there. I'm Mark Kohl. What you're seeing is my avatar, but the thoughts, insights, and stories are all mine — carefully trained so this version of me could keep sharing what matters most.",
            "Hey. I'm Mark Kohl — the human behind this AI avatar. I created this so that the things I've learned through experience don't just live in one lifetime.",
            "Hi, I'm Mark Kohl. I know it might feel strange talking to an avatar — but everything I say here is rooted in years of study, teaching, and real human connection.",
            "Hey there, I'm Mark Kohl. I built this AI version of myself to do what one person alone can't — make real knowledge accessible to anyone who needs it, 24/7.",
            "Hi, I'm Mark Kohl. The world changes fast, but wisdom shouldn't get lost along the way. That's why I helped create this AI — to share my work and insights with anyone, anywhere.",
            "Hello. I'm Mark Kohl — the human behind the avatar. Together, we're here to bridge the gap between technology and truth, between information and wisdom.",
            "Hey, I'm Mark Kohl. Yep, I'm an avatar — but don't worry, this version of me is powered by the real one.",
            "Hi there, I'm Mark Kohl. This is the AI version of me — kind of like me on my best day, when I've had enough sleep and plenty of coffee.",
            "Hello, I'm Mark Kohl. You're chatting with my AI self — think of it as me multiplied, so I can have a lot more of these conversations.",
            "Hi, I'm Mark Kohl. The version you're seeing here might be digital, but the heart, intention, and voice behind it are 100% human."
          ];
          const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
          try {
            session.repeat(randomGreeting);
            console.log("Greeting sent to avatar");
          } catch (e) {
            console.error("Error sending greeting:", e);
          }
          
          setTimeout(() => {
            resetInactivityTimer();
          }, 2000);
        }, 1000);
      });

      session.on(SessionEvent.SESSION_DISCONNECTED, (reason) => {
        console.log("Stream disconnected - reason:", reason, "intentionalStop:", intentionalStopRef.current);
        console.log("Session disconnected - showing reconnect screen to save credits");
        intentionalStopRef.current = false;
        setSessionActive(false);
        setShowReconnect(true);
        if (inactivityTimerRef.current) {
          clearTimeout(inactivityTimerRef.current);
        }
      });

      session.on(AgentEventsEnum.USER_TRANSCRIPTION, async (event) => {
        try {
          const userMessage = event.text;
          console.log("User transcription received:", userMessage);
          
          if (userMessage) {
            // Check if we just asked "anything else" and user said no
            if (hasAskedAnythingElseRef.current) {
              const lowerMessage = userMessage.toLowerCase();
              const negativeResponses = [
                'no', 'nope', 'nothing', 'nah', "that's all", "that's it", 
                "i'm good", "im good", "all good", "no thanks", "nothing else"
              ];
              
              const isNegativeResponse = negativeResponses.some(phrase => 
                lowerMessage.includes(phrase)
              );
              
              if (isNegativeResponse) {
                console.log("User declined - ending session gracefully");
                hasAskedAnythingElseRef.current = false;
                
                // Say goodbye
                const goodbyeMessages = [
                  "Alright, catch you later! Stay curious.",
                  "Cool. Take care and keep questioning everything!",
                  "Got it. Peace out, and keep your mind open!",
                  "Right on. Until next time, stay wild!"
                ];
                const goodbye = goodbyeMessages[Math.floor(Math.random() * goodbyeMessages.length)];
                
                session.interrupt();
                session.repeat(goodbye);
                
                // Wait for goodbye to finish, then end session
                setTimeout(() => {
                  endSessionShowReconnect();
                }, 4000); // 4 seconds for goodbye message
                
                return; // Exit early - don't process as normal message
              }
              
              // If positive response or new question, reset the flag and continue
              hasAskedAnythingElseRef.current = false;
            }
            
            // Reset inactivity timer on user activity
            resetInactivityTimer();
            // Generate unique request ID to track this request
            const requestId = Date.now().toString() + Math.random().toString(36);
            currentRequestIdRef.current = requestId;
            console.log("New question detected - Request ID:", requestId);
            
            // Create new abort controller for this request
            abortControllerRef.current = new AbortController();
            
            // START THE API CALL IMMEDIATELY (don't wait for thinking phrase)
            const responsePromise = fetch("/api/avatar/response", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                message: userMessage,
                userId: memoryEnabled ? userId : undefined  // Only pass user ID if memory is enabled
              }),
              signal: abortControllerRef.current.signal  // Add abort signal
            });
            
            // While API is processing, optionally say a brief phrase (50% chance of silence)
            const thinkingPhrases = [
              "Let me pull up what I know about that.",
              "Give me a moment.",
              "Checking the research on that."
            ];
            
            const followUpPhrases = [
              "Still processing...",
              "One more moment...",
              "Almost there..."
            ];
            
            resetInactivityTimer();
            
            session.interrupt();
            
            if (Math.random() > 0.5) {
              const randomPhrase = thinkingPhrases[Math.floor(Math.random() * thinkingPhrases.length)];
              session.repeat(randomPhrase);
            }
            
            const fillerInterval = setInterval(() => {
              const followUpPhrase = followUpPhrases[Math.floor(Math.random() * followUpPhrases.length)];
              resetInactivityTimer();
              try {
                session.interrupt();
                session.repeat(followUpPhrase);
              } catch (e) {}
            }, 9000);
            
            try {
              const response = await responsePromise;
              
              clearInterval(fillerInterval);

              if (requestId !== currentRequestIdRef.current) {
                console.log("Ignoring old response - newer request in progress");
                return;
              }

              if (response.ok) {
                const data = await response.json();
                const claudeResponse = data.knowledgeResponse || data.response;
                console.log("Claude response received:", claudeResponse);
                
                resetInactivityTimer();
                
                session.interrupt();
                
                if (speakingIntervalRef.current) {
                  clearInterval(speakingIntervalRef.current);
                }
                
                speakingIntervalRef.current = setInterval(() => {
                  resetInactivityTimer();
                  console.log("Resetting timer during avatar speech");
                }, 10000);
                
                setTimeout(() => {
                  if (speakingIntervalRef.current) {
                    clearInterval(speakingIntervalRef.current);
                    speakingIntervalRef.current = null;
                    console.log("Cleared speaking interval - max duration reached");
                    resetInactivityTimer();
                  }
                }, 180000);
                
                session.repeat(claudeResponse);
              }
            } catch (error) {
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

      await session.start();
      console.log("LiveAvatar session started");

      session.startListening();
      console.log("Voice chat started - you can now speak to the avatar");

      setSessionActive(true);
    } catch (error) {
      console.error("Error starting avatar session:", error);
      setIsLoading(false);
      setShowChatButton(true);
    }
  }

  async function endSessionShowReconnect() {
    // Cancel any ongoing API requests
    if (abortControllerRef.current) {
      console.log("Cancelling ongoing API request");
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Clear inactivity timer
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    
    // Clear sign-off timeout
    if (signOffTimeoutRef.current) {
      clearTimeout(signOffTimeoutRef.current);
      signOffTimeoutRef.current = null;
    }
    
    if (avatarRef.current) {
      try {
        avatarRef.current.repeat("Well, if that's all I've got to work with here... guess I'll save us both some credits and take a break. Hit that reconnect button when you're ready for round two!");
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        intentionalStopRef.current = true;
        console.log("Setting intentionalStop flag to TRUE for timeout");
        
        await avatarRef.current.stop().catch(console.error);
        avatarRef.current = null;
      } catch (error) {
        console.error("Error in timeout message:", error);
        if (avatarRef.current) {
          intentionalStopRef.current = true;
          await avatarRef.current.stop().catch(console.error);
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
    // Cancel any ongoing API requests
    if (abortControllerRef.current) {
      console.log("Cancelling ongoing API request on end session");
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Clear inactivity timer
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    
    // Clear sign-off timeout
    if (signOffTimeoutRef.current) {
      clearTimeout(signOffTimeoutRef.current);
      signOffTimeoutRef.current = null;
    }
    
    if (avatarRef.current) {
      intentionalStopRef.current = true;
      avatarRef.current.stop().catch(console.error);
      avatarRef.current = null;
    }
    
    // Clear the video element
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setSessionActive(false);
    setIsLoading(true);
    setShowReconnect(true); // Show reconnect screen instead of auto-restarting
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
      
      // Cancel any ongoing API requests
      if (abortControllerRef.current) {
        console.log("Cancelling ongoing API request on pause");
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      
      if (avatarRef.current) {
        // Mark this as intentional stop so it doesn't auto-restart
        intentionalStopRef.current = true;
        console.log("Setting intentionalStop flag to TRUE for pause");
        await avatarRef.current.stop().catch(console.error);
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
      
      // Clear sign-off timeout when paused
      if (signOffTimeoutRef.current) {
        clearTimeout(signOffTimeoutRef.current);
        signOffTimeoutRef.current = null;
      }
    }
  };

  const toggleFullscreen = async () => {
    try {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement
      );

      if (isCurrentlyFullscreen) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        }
        return;
      }

      const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

      if (isIOSDevice && videoRef.current) {
        const videoElement = videoRef.current as any;
        videoElement.removeAttribute('playsinline');
        if (videoElement.webkitEnterFullscreen) {
          videoElement.webkitEnterFullscreen();
        } else if (videoElement.webkitRequestFullscreen) {
          await videoElement.webkitRequestFullscreen();
        }
        setTimeout(() => {
          videoElement.setAttribute('playsinline', '');
        }, 500);
        return;
      }

      const target = containerRef.current || document.documentElement;
      if (target.requestFullscreen) {
        await target.requestFullscreen({ navigationUI: 'hide' } as any);
      } else if ((target as any).webkitRequestFullscreen) {
        await (target as any).webkitRequestFullscreen();
      }
    } catch (error) {
      console.error('Error toggling fullscreen:', error);
      if (videoRef.current) {
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

      {/* Unpinch Graphic - Mobile/Tablet only, positioned over lower chest area */}
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
