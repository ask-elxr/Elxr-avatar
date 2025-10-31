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
  const avatarRef = useRef<StreamingAvatar | null>(null);
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
        avatarRef.current.interrupt().catch(() => {});
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
    
    // Set 5-minute timeout - simple sign-off after 5 minutes of inactivity
    inactivityTimerRef.current = setTimeout(async () => {
      console.log("Inactivity timeout triggered - 5 minutes elapsed");
      
      if (avatarRef.current) {
        try {
          // Interrupt any ongoing speech
          await avatarRef.current.interrupt().catch(() => {});
          
          // Mark's authentic sign-offs
          const signOffs = [
            "Thanks for spending a little time with me. Remember — curiosity is the beginning of every transformation.",
            "I'm glad we got to connect today. Keep exploring, keep questioning — that's where growth begins.",
            "Appreciate you being here. I hope something we talked about stays with you in the best way.",
            "That's it for now — but remember, this conversation doesn't end here. It continues every time you pause and reflect.",
            "Take care of yourself out there — and take the time to stay curious.",
            "Thanks for listening. This project is about one thing — bringing real wisdom to as many people as possible. You're part of that.",
            "I built this AI version of myself so I could keep sharing what I've learned — thanks for helping make that mission real.",
            "I appreciate you spending a few minutes with me. That's how we make knowledge human again — one real conversation at a time.",
            "If anything here helped you think differently, then it's doing exactly what it was meant to.",
            "Thanks for letting me be part of your day — I hope this AI version of me carries something useful from the real one.",
            "Before you go — take a breath. Let what resonated sink in. That's how change begins.",
            "Every good conversation leaves us a little different than before. I hope this one did, too.",
            "You don't need to have it all figured out — just keep asking the right questions.",
            "I'll leave you with this — stay awake, stay kind, and keep learning.",
            "The beauty of AI is reach; the beauty of being human is connection. Thanks for sharing both.",
            "Alright, that's enough wisdom for one sitting — go stretch, breathe, live a little.",
            "Don't let this chat be the smartest thing you do today — but it's a good start.",
            "I'll be here whenever you're ready for round two. Until then, keep doing life your way.",
            "That's me signing off — or at least, my digital twin. The real one's probably out getting some sunlight.",
            "Until next time — stay curious, stay kind, and don't forget to laugh a little."
          ];
          
          const randomSignOff = signOffs[Math.floor(Math.random() * signOffs.length)];
          await avatarRef.current.speak({
            text: randomSignOff,
            task_type: TaskType.REPEAT
          });
          
          console.log("Sign-off message delivered:", randomSignOff);
          
          // Wait 5 seconds for message to finish, then end session
          // Store timeout in ref so it can be cancelled if user speaks
          signOffTimeoutRef.current = setTimeout(() => {
            endSessionShowReconnect();
          }, 5000);
        } catch (error) {
          console.error("Error during sign-off:", error);
          endSessionShowReconnect();
        }
      } else {
        // No avatar - just end session
        endSessionShowReconnect();
      }
    }, 300000); // 300 seconds = 5 minutes
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
        // NEVER auto-restart - always show reconnect screen to prevent credit drain
        console.log("Session disconnected - showing reconnect screen to save credits");
        intentionalStopRef.current = false; // Reset flag
        setSessionActive(false);
        setShowReconnect(true); // Show manual reconnect option
        if (inactivityTimerRef.current) {
          clearTimeout(inactivityTimerRef.current);
        }
      });

      // Listen for user message events - fires when user talks
      avatar.on(StreamingEvents.USER_TALKING_MESSAGE, async (message: any) => {
        try {
          console.log("USER_TALKING_MESSAGE event received:", message);
          
          const userMessage = message?.detail?.message || message?.message || message;
          console.log("User message extracted:", userMessage);
          
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
                
                await avatar.interrupt().catch(() => {});
                await avatar.speak({
                  text: goodbye,
                  task_type: TaskType.REPEAT
                });
                
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
            
            // While API is processing, interrupt HeyGen and say a quick thinking phrase
            const thinkingPhrases = [
              "Give me a second — I'm pulling from a few lifetimes of learning.",
              "Let me scan the archives of experience for you.",
              "Digging through decades of insight — hang tight.",
              "Hold on — I'm thinking faster than I can speak.",
              "Give me a second… even AI needs to collect its thoughts.",
              "You just asked a deep one. Let me find words that fit.",
              "Some questions deserve a thoughtful pause.",
              "Searching my circuits — and maybe my heart, too.",
              "Good question. Let me check what truth feels like today.",
              "Finding the quiet space where the best answers live.",
              "Running a quick scan between logic and intuition.",
              "My code is whispering… give it a moment.",
              "Running the empathy algorithm — it's my favorite one.",
              "Let me synchronize Mark's mind and machine for this one.",
              "Artificial maybe, but still aiming for authentic.",
              "You could call it data… I call it distilled wisdom.",
              "One moment — cross-checking what science and soul both agree on."
            ];
            
            const followUpPhrases = [
              "The human part of me wants to rush. The wise part knows to pause.",
              "Looking back through Mark's stories… one of them fits perfectly here.",
              "There's a thread connecting what you asked to something timeless — let me find it.",
              "My training says there's data here. My instincts say there's meaning.",
              "I'm searching through memory, both digital and human.",
              "Stay with your breath while I gather this one.",
              "Wisdom loading… in real time.",
              "Let me slow down enough to give you something real.",
              "This may be artificial intelligence… but the wisdom is very real.",
              "I might be digital, but what I'm reaching for is human truth.",
              "I'm not guessing. I'm remembering patterns that change people.",
              "Processing… or maybe just pausing to feel this one.",
              "That one hit the soul servers… stand by.",
              "Wisdom doesn't rush. I'm taking a breath with you.",
              "Give me a heartbeat — depth takes a second."
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
            
            // Set up interval to add follow-up phrases every 9 seconds while waiting
            const fillerInterval = setInterval(async () => {
              const followUpPhrase = followUpPhrases[Math.floor(Math.random() * followUpPhrases.length)];
              
              // Reset timer before each filler phrase to keep session alive
              resetInactivityTimer();
              
              await avatar.interrupt().catch(() => {});
              await avatar.speak({
                text: followUpPhrase,
                task_type: TaskType.REPEAT
              }).catch(() => {}); // Catch errors if response arrives during speak
            }, 9000);
            
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
                
                // Clear any existing speaking interval
                if (speakingIntervalRef.current) {
                  clearInterval(speakingIntervalRef.current);
                }
                
                // Set up interval to keep resetting timer while avatar speaks (every 10 seconds)
                // This prevents timeout during long responses
                // Store in ref so it persists even after speak() resolves
                speakingIntervalRef.current = setInterval(() => {
                  resetInactivityTimer();
                  console.log("Resetting timer during avatar speech");
                }, 10000);
                
                // Safety timeout: stop the speaking interval after 3 minutes max
                // (avatar should be done by then, and this prevents infinite loop)
                setTimeout(() => {
                  if (speakingIntervalRef.current) {
                    clearInterval(speakingIntervalRef.current);
                    speakingIntervalRef.current = null;
                    console.log("Cleared speaking interval - max duration reached");
                    // Start fresh 60-second timer now that avatar is done
                    resetInactivityTimer();
                  }
                }, 180000); // 3 minutes
                
                // Make avatar speak Claude's response using REPEAT (not TALK)
                // NOTE: This promise resolves immediately after queueing, NOT after vocalization completes
                await avatar.speak({
                  text: claudeResponse,
                  task_type: TaskType.REPEAT
                });
                
                // DON'T clear interval here - avatar is still speaking!
                // Interval will be cleared when user speaks again OR after 3 minutes
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
      
      // Mark greets users with a random intro
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
      await avatar.speak({
        text: randomGreeting,
        task_type: TaskType.REPEAT
      }).catch(console.error);
      
      // Start inactivity timer AFTER greeting is done (wait 2 seconds for it to finish)
      setTimeout(() => {
        resetInactivityTimer();
      }, 2000);
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
      // Mark as intentional stop to prevent auto-restart loops
      intentionalStopRef.current = true;
      avatarRef.current.stopAvatar().catch(console.error);
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
      
      // Clear sign-off timeout when paused
      if (signOffTimeoutRef.current) {
        clearTimeout(signOffTimeoutRef.current);
        signOffTimeoutRef.current = null;
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
