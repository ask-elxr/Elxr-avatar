import { useState, useRef, useCallback, useEffect } from "react";
import StreamingAvatar, {
  TaskType,
  AvatarQuality,
  StreamingEvents,
} from "@heygen/streaming-avatar";
import { SessionDriver, HeyGenDriver, AudioOnlyDriver } from "./sessionDrivers";

interface AvatarSessionConfig {
  videoRef: React.RefObject<HTMLVideoElement>;
  userId: string;
  memoryEnabled: boolean;
  selectedAvatarId?: string;
  onSessionActiveChange?: (active: boolean) => void;
  onResetInactivityTimer?: () => void;
}

interface StartSessionOptions {
  audioOnly?: boolean;
  avatarId?: string;
}

interface AvatarSessionReturn {
  sessionActive: boolean;
  heygenSessionActive: boolean;
  isLoading: boolean;
  showReconnect: boolean;
  startSession: (options?: StartSessionOptions) => Promise<void>;
  endSession: () => Promise<void>;
  endSessionShowReconnect: () => Promise<void>;
  reconnect: () => Promise<void>;
  togglePause: () => Promise<void>;
  switchTransportMode: (toVideoMode: boolean) => Promise<void>;
  isPaused: boolean;
  isSpeaking: boolean;
  microphoneStatus: 'listening' | 'stopped' | 'not-supported' | 'permission-denied';
  avatarRef: React.MutableRefObject<StreamingAvatar | null>;
  intentionalStopRef: React.MutableRefObject<boolean>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  currentRequestIdRef: React.MutableRefObject<string>;
  speakingIntervalRef: React.MutableRefObject<NodeJS.Timeout | null>;
  hasAskedAnythingElseRef: React.MutableRefObject<boolean>;
  handleSubmitMessage: (message: string) => Promise<void>;
  stopAudio: () => void;
}

export function useAvatarSession({
  videoRef,
  userId,
  memoryEnabled,
  selectedAvatarId = "mark-kohl",
  onSessionActiveChange,
  onResetInactivityTimer,
}: AvatarSessionConfig): AvatarSessionReturn {
  const [sessionActive, setSessionActive] = useState(false);
  const [heygenSessionActive, setHeygenSessionActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showReconnect, setShowReconnect] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSpeakingState, setIsSpeakingState] = useState(false);
  const [microphoneStatus, setMicrophoneStatus] = useState<'listening' | 'stopped' | 'not-supported' | 'permission-denied'>('stopped');

  const avatarRef = useRef<StreamingAvatar | null>(null);
  const intentionalStopRef = useRef(false);
  const hasStartedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentRequestIdRef = useRef<string>("");
  const speakingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasAskedAnythingElseRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const audioOnlyRef = useRef(false);
  const currentAvatarIdRef = useRef(selectedAvatarId);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null); // Web Speech API for voice input
  const lastTranscriptRef = useRef<string>(""); // For deduplication
  const recognitionIntentionalStopRef = useRef(false); // Prevent auto-restart during cleanup
  const recognitionRunningRef = useRef(false); // Track if recognition is currently running
  const sessionActiveRef = useRef(false); // Track session active state for voice recognition
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Loading timeout reference
  const recognitionStuckTimeoutRef = useRef<NodeJS.Timeout | null>(null); // iOS Safari stuck detection
  const reconnectAttemptsRef = useRef(0); // Track auto-reconnection attempts
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Auto-reconnection timer
  const lastRecognitionRestartRef = useRef<number>(0); // Track last restart time for throttling
  const recognitionRestartTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Delayed restart timer
  const acknowledgmentAudioRef = useRef<HTMLAudioElement | null>(null); // Cached acknowledgment audio
  const acknowledgmentCacheReadyRef = useRef<Map<string, boolean>>(new Map()); // Track which avatars have cached acknowledgments
  const MAX_AUTO_RECONNECT_ATTEMPTS = 3; // Max auto-reconnect before showing manual button
  const MIN_RESTART_INTERVAL_MS = 2000; // Minimum 2 seconds between recognition restarts

  // Sync currentAvatarIdRef with selectedAvatarId prop changes
  useEffect(() => {
    currentAvatarIdRef.current = selectedAvatarId;
  }, [selectedAvatarId]);

  // Sync sessionActiveRef with sessionActive state
  useEffect(() => {
    sessionActiveRef.current = sessionActive;
  }, [sessionActive]);

  const fetchAccessToken = async (avatarId: string): Promise<{ token: string; sessionId: string }> => {
    const response = await fetch("/api/heygen/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId,
        avatarId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      if (response.status === 429) {
        throw new Error(errorData.error || "Rate limit exceeded. Please wait before starting a new session.");
      }
      
      throw new Error(errorData.error || "Failed to fetch access token");
    }

    const data = await response.json();
    return { token: data.token, sessionId: data.sessionId };
  };

  const endSessionOnServer = async () => {
    if (sessionIdRef.current) {
      try {
        await fetch("/api/session/end", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
          }),
        });
        sessionIdRef.current = null;
      } catch (error) {
        console.error("Failed to end session on server:", error);
      }
    }
  };

  const preloadAcknowledgmentAudio = useCallback(async (avatarId: string) => {
    if (acknowledgmentCacheReadyRef.current.get(avatarId)) {
      return; // Already loaded
    }
    try {
      const response = await fetch(`/api/audio/acknowledgment/${avatarId}`);
      if (response.ok) {
        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        audio.preload = "auto";
        acknowledgmentAudioRef.current = audio;
        acknowledgmentCacheReadyRef.current.set(avatarId, true);
        console.log("🔊 Acknowledgment audio preloaded for:", avatarId);
      }
    } catch (error) {
      console.log("Acknowledgment audio not ready yet, will retry later");
    }
  }, []);

  const triggerAcknowledgmentCache = useCallback(async (avatarId: string) => {
    try {
      const response = await fetch("/api/audio/acknowledgments/precache", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarId }),
      });
      if (response.ok) {
        const data = await response.json();
        console.log("🔊 Acknowledgment pre-cache triggered for:", avatarId, data.hasCached ? "(already cached)" : "(caching started)");
        // Preload first acknowledgment audio after a short delay to allow caching
        if (!data.hasCached) {
          setTimeout(() => preloadAcknowledgmentAudio(avatarId), 3000);
        } else {
          preloadAcknowledgmentAudio(avatarId);
        }
      } else {
        console.warn("Failed to trigger acknowledgment cache:", response.status);
      }
    } catch (error) {
      console.error("Failed to trigger acknowledgment cache:", error);
    }
  }, [preloadAcknowledgmentAudio]);

  const playAcknowledgmentInstantly = useCallback(async () => {
    if (!audioOnlyRef.current) return; // Only for audio-only mode
    const avatarId = currentAvatarIdRef.current;
    
    try {
      const response = await fetch(`/api/audio/acknowledgment/${avatarId}`);
      if (response.ok) {
        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        audio.volume = 0.8; // Slightly lower volume for acknowledgment
        audio.onended = () => URL.revokeObjectURL(audioUrl);
        await audio.play();
        console.log("🔊 Instant acknowledgment played");
      }
    } catch (error) {
      // Acknowledgment failed - proceed without it
      console.log("Acknowledgment not available, proceeding...");
    }
  }, []);

  const clearIdleTimeout = useCallback(() => {
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
  }, []);

  const startVoiceRecognition = useCallback(() => {
    // Skip if already initialized
    if (recognitionRef.current) {
      console.log("⏭️ Voice recognition already active");
      return;
    }

    // Clear any stuck timeout from previous instance
    if (recognitionStuckTimeoutRef.current) {
      clearTimeout(recognitionStuckTimeoutRef.current);
      recognitionStuckTimeoutRef.current = null;
    }

    // ✅ Initialize Web Speech API for voice input
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        console.warn("⚠️ Web Speech API not supported in this browser - use text input instead");
        setMicrophoneStatus('not-supported');
        return;
      }

      // Detect iOS/Safari for special handling
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false; // Only get final results
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1; // Only get best match
      
      // iOS Safari stuck detection - recreate if no results for 15 seconds
      const resetStuckTimeout = () => {
        if (recognitionStuckTimeoutRef.current) {
          clearTimeout(recognitionStuckTimeoutRef.current);
        }
        if ((isIOS || isSafari) && sessionActiveRef.current && !isSpeakingRef.current) {
          recognitionStuckTimeoutRef.current = setTimeout(() => {
            console.log("⚠️ iOS/Safari: Recognition appears stuck, recreating...");
            if (recognitionRef.current && !recognitionIntentionalStopRef.current && !isSpeakingRef.current) {
              try {
                recognitionRef.current.abort();
              } catch (e) {}
              recognitionRef.current = null;
              recognitionRunningRef.current = false;
              // Recreate after a brief delay
              setTimeout(() => {
                if (!recognitionIntentionalStopRef.current && !isSpeakingRef.current && sessionActiveRef.current) {
                  startVoiceRecognition();
                }
              }, 1000);
            }
          }, 15000); // 15 seconds stuck detection
        }
      };
      
      recognition.onstart = () => {
        setMicrophoneStatus('listening');
        console.log("🎤 Microphone listening");
        resetStuckTimeout(); // Start stuck detection
      };
      
      recognition.onresult = (event: any) => {
        resetStuckTimeout(); // Reset stuck timeout on any result
        
        // Only process final results (not interim)
        const result = event.results[event.results.length - 1];
        if (!result.isFinal) return;
        
        const transcript = result[0].transcript.trim();
        
        // Deduplicate (Web Speech can fire same result multiple times)
        if (transcript && transcript !== lastTranscriptRef.current) {
          lastTranscriptRef.current = transcript;
          console.log("🎤 Voice input (final):", transcript);
          
          // If avatar is speaking in audio mode, interrupt it
          if (isSpeakingRef.current && currentAudioRef.current) {
            console.log("🛑 Interrupting audio - user is speaking");
            try {
              currentAudioRef.current.pause();
              currentAudioRef.current.currentTime = 0;
              currentAudioRef.current.src = '';
              currentAudioRef.current.load();
              currentAudioRef.current = null;
            } catch (e) {
              console.warn("Error interrupting audio:", e);
              currentAudioRef.current = null;
            }
            isSpeakingRef.current = false;
            setIsSpeakingState(false);
          }
          
          // Process the message (now that we've interrupted if needed)
          if (!isSpeakingRef.current) {
            handleSubmitMessage(transcript);
          }
        }
      };
      
      recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed') {
          console.error("🎤 Microphone permission denied - use text input instead");
          setMicrophoneStatus('permission-denied');
          // Clear stuck timeout on permission error
          if (recognitionStuckTimeoutRef.current) {
            clearTimeout(recognitionStuckTimeoutRef.current);
            recognitionStuckTimeoutRef.current = null;
          }
        } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.error("🎤 Speech recognition error:", event.error);
        }
      };
      
      recognition.onend = () => {
        recognitionRunningRef.current = false;
        
        // Clear any pending restart timeout
        if (recognitionRestartTimeoutRef.current) {
          clearTimeout(recognitionRestartTimeoutRef.current);
          recognitionRestartTimeoutRef.current = null;
        }
        
        // Auto-restart unless intentionally stopped or avatar is speaking
        // Use ref instead of state to get current value in closure
        if (!recognitionIntentionalStopRef.current && !isSpeakingRef.current && sessionActiveRef.current) {
          // Throttle restarts to prevent rapid loop (min 2 seconds between restarts)
          const now = Date.now();
          const timeSinceLastRestart = now - lastRecognitionRestartRef.current;
          const delayNeeded = Math.max(0, MIN_RESTART_INTERVAL_MS - timeSinceLastRestart);
          
          if (delayNeeded > 0) {
            // Schedule delayed restart
            recognitionRestartTimeoutRef.current = setTimeout(() => {
              if (!recognitionIntentionalStopRef.current && !isSpeakingRef.current && sessionActiveRef.current && !recognitionRunningRef.current) {
                try {
                  setMicrophoneStatus('listening');
                  recognition.start();
                  recognitionRunningRef.current = true;
                  lastRecognitionRestartRef.current = Date.now();
                  console.log("🔄 Voice recognition restarted (throttled)");
                } catch (e) {
                  recognitionRunningRef.current = false;
                  setMicrophoneStatus('stopped');
                }
              }
            }, delayNeeded);
          } else {
            // Restart immediately if enough time has passed
            try {
              setMicrophoneStatus('listening');
              recognition.start();
              recognitionRunningRef.current = true;
              lastRecognitionRestartRef.current = now;
              console.log("🔄 Voice recognition restarted");
            } catch (e) {
              recognitionRunningRef.current = false;
              setMicrophoneStatus('stopped');
            }
          }
        } else {
          setMicrophoneStatus('stopped');
          // Clear stuck timeout when stopping
          if (recognitionStuckTimeoutRef.current) {
            clearTimeout(recognitionStuckTimeoutRef.current);
            recognitionStuckTimeoutRef.current = null;
          }
        }
      };
      
      recognitionRef.current = recognition;
      recognitionIntentionalStopRef.current = false;
      lastRecognitionRestartRef.current = Date.now(); // Initialize last restart time
      
      setMicrophoneStatus('listening'); // Set immediately before first start
      recognition.start();
      recognitionRunningRef.current = true;
      console.log("✅ Web Speech API started for voice input");
    } catch (error) {
      console.error("❌ Error initializing Web Speech API:", error);
      setMicrophoneStatus('not-supported');
    }
  }, []); // No dependencies needed - uses refs for current values

  const stopHeyGenSession = useCallback(async () => {
    if (!avatarRef.current || !heygenSessionActive) return;
    
    // Don't stop HeyGen if we're in audio mode - the session should continue
    if (audioOnlyRef.current) {
      console.log("In audio mode - skipping HeyGen stop (no HeyGen active)");
      return;
    }
    
    console.log("Stopping HeyGen session - keeping conversation active");
    clearIdleTimeout();
    
    try {
      intentionalStopRef.current = true;
      await avatarRef.current.stopAvatar().catch(console.error);
      avatarRef.current = null;
      
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      
      setHeygenSessionActive(false);
      isSpeakingRef.current = false;
      setIsSpeakingState(false);
      
      // NOTE: Don't call endSessionOnServer() - the server session is for
      // conversation tracking and should persist. HeyGen credits are released
      // by stopAvatar() on the client side. This allows users to continue
      // chatting after idle timeout (they can restart video or use audio mode).
      console.log("HeyGen video stopped - conversation continues (audio/text still work)");
    } catch (error) {
      console.error("Error stopping HeyGen session:", error);
    }
  }, [heygenSessionActive, videoRef, clearIdleTimeout]);

  const startIdleTimeout = useCallback(() => {
    clearIdleTimeout();
    
    // Only start idle timeout in video mode when not paused
    if (!audioOnlyRef.current && !isPaused) {
      idleTimeoutRef.current = setTimeout(() => {
        // Double-check we're still in video mode before stopping HeyGen
        // User might have switched to audio mode during the 3 minutes
        if (!audioOnlyRef.current && avatarRef.current) {
          console.log("3min idle timeout - stopping HeyGen session to save credits");
          stopHeyGenSession();
        } else {
          console.log("Idle timeout fired but not in video mode - skipping");
        }
      }, 180000); // 3 minutes - allows for longer avatar responses without disconnect
    }
  }, [isPaused, clearIdleTimeout, stopHeyGenSession]);

  const startHeyGenSession = useCallback(async (activeAvatarId: string) => {
    // Skip if audio-only
    if (audioOnlyRef.current) {
      return;
    }
    
    // ✅ CRITICAL: Prevent multiple sessions from starting
    if (avatarRef.current && heygenSessionActive) {
      console.log("⏭️ HeyGen session already active - skipping restart");
      return;
    }
    
    console.log("Starting HeyGen session for first message");
    setIsLoading(true);
    
    try {
      const avatarConfigResponse = await fetch(`/api/avatar/config/${activeAvatarId}`);
      if (!avatarConfigResponse.ok) {
        throw new Error("Failed to fetch avatar configuration");
      }
      const avatarConfig = await avatarConfigResponse.json();

      const { token, sessionId } = await fetchAccessToken(activeAvatarId);
      // Only update sessionIdRef if we got a new one - during mode switching,
      // we already have a valid sessionId from startSession and the token endpoint
      // doesn't return one, so we'd overwrite with undefined
      if (sessionId) {
        sessionIdRef.current = sessionId;
      }
      const avatar = new StreamingAvatar({ token });
      avatarRef.current = avatar;

      avatar.on(StreamingEvents.STREAM_READY, (event) => {
        console.log("Stream ready:", event.detail);
        if (videoRef.current) {
          videoRef.current.srcObject = event.detail;
          videoRef.current.play().catch(console.error);
        }
        
        // Clear loading state and timeout as soon as stream is ready
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
          loadingTimeoutRef.current = null;
        }
        setIsLoading(false);
      });

      avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        console.log("Stream disconnected - intentionalStop flag:", intentionalStopRef.current);
        
        const wasUnintentional = !intentionalStopRef.current;
        
        intentionalStopRef.current = false;
        isSpeakingRef.current = false;
        avatarRef.current = null;
        setHeygenSessionActive(false);
        clearIdleTimeout();
        
        if (wasUnintentional && sessionActiveRef.current) {
          const scheduleReconnect = () => {
            reconnectAttemptsRef.current++;
            const attemptNum = reconnectAttemptsRef.current;
            
            if (attemptNum <= MAX_AUTO_RECONNECT_ATTEMPTS) {
              const delay = Math.min(1000 * Math.pow(2, attemptNum - 1), 8000);
              console.log(`🔄 Auto-reconnecting attempt ${attemptNum}/${MAX_AUTO_RECONNECT_ATTEMPTS} in ${delay}ms...`);
              
              if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
              }
              
              reconnectTimeoutRef.current = setTimeout(async () => {
                try {
                  if (sessionActiveRef.current && !avatarRef.current) {
                    console.log(`🔄 Executing auto-reconnect attempt ${attemptNum}...`);
                    await startHeyGenSession(currentAvatarIdRef.current);
                    console.log("✅ Auto-reconnect successful!");
                    reconnectAttemptsRef.current = 0;
                  }
                } catch (error) {
                  console.error(`❌ Auto-reconnect attempt ${attemptNum} failed:`, error);
                  if (reconnectAttemptsRef.current < MAX_AUTO_RECONNECT_ATTEMPTS) {
                    scheduleReconnect();
                  } else {
                    console.log("⚠️ Max auto-reconnect attempts reached - showing reconnect button");
                    setShowReconnect(true);
                  }
                }
              }, delay);
            } else {
              console.log("⚠️ Max auto-reconnect attempts reached - showing reconnect button");
              setShowReconnect(true);
            }
          };
          
          scheduleReconnect();
        } else if (wasUnintentional) {
          console.log("⚠️ Unexpected disconnect (session not active) - showing reconnect button");
          setShowReconnect(true);
        }
      });

      avatar.on(StreamingEvents.AVATAR_START_TALKING, () => {
        isSpeakingRef.current = true;
        setIsSpeakingState(true);
        clearIdleTimeout();
        
        // 🎤 Pause voice recognition while avatar is speaking to prevent feedback loop
        if (recognitionRef.current && recognitionRunningRef.current) {
          try {
            recognitionRef.current.stop();
            recognitionRunningRef.current = false;
            console.log("🔇 Voice recognition paused (avatar speaking)");
          } catch (e) {
            // Ignore errors if already stopped
            recognitionRunningRef.current = false;
          }
        }
      });

      avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
        isSpeakingRef.current = false;
        setIsSpeakingState(false);
        // ✅ DON'T start idle timeout here - let the 5-minute inactivity timer handle session cleanup
        // This allows users to think, speak, or pause without premature disconnection
        
        // 🎤 Resume voice recognition after a delay to prevent echo
        // iOS Safari needs a longer delay (3-5 seconds) due to video/audio conflicts
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        const delay = (isIOS || isSafari) ? 3500 : 1000; // 3.5s for iOS/Safari, 1s for others
        
        setTimeout(() => {
          if (recognitionRef.current && !recognitionIntentionalStopRef.current && !isSpeakingRef.current && !recognitionRunningRef.current) {
            try {
              // On iOS/Safari, completely recreate recognition instance after video playback
              if (isIOS || isSafari) {
                recognitionRef.current.abort();
                recognitionRef.current = null;
                // Delay slightly more before recreating
                setTimeout(() => {
                  if (!recognitionIntentionalStopRef.current && !isSpeakingRef.current) {
                    startVoiceRecognition();
                    console.log("🔊 Voice recognition recreated for iOS/Safari (avatar finished)");
                  }
                }, 500);
              } else {
                setMicrophoneStatus('listening'); // Set immediately to prevent UI flicker
                recognitionRef.current.start();
                recognitionRunningRef.current = true;
                console.log("🔊 Voice recognition resumed (avatar finished)");
              }
            } catch (e) {
              // Ignore errors if already running - this can happen if onend auto-restart already started it
              recognitionRunningRef.current = false;
              setMicrophoneStatus('stopped');
            }
          }
        }, delay);
      });

      // ❌ DISABLED: USER_TALKING_MESSAGE listener removed
      // This event only works with HeyGen's voice chat which causes echo loops
      // Voice input now handled by Web Speech API in the component

      // Build the avatar config - only include voice if we have a specific voiceId
      const avatarStartConfig: any = {
        quality: AvatarQuality.High,
        avatarName: avatarConfig.heygenAvatarId,
        language: "en",
        disableIdleTimeout: true,
        // ❌ CRITICAL: Disable ALL HeyGen AI features - we use Claude instead
        knowledgeBase: undefined, // No knowledge base
        knowledgeId: undefined, // No knowledge ID
        useSilencePrompt: false, // Don't auto-respond to silence
        enablePushToTalk: false, // Disable push-to-talk mode
      };
      
      // Only set voice if we have a specific voice ID, otherwise let HeyGen use avatar's default
      if (avatarConfig.heygenVoiceId) {
        avatarStartConfig.voice = {
          voiceId: avatarConfig.heygenVoiceId,
          rate: parseFloat(avatarConfig.voiceRate || "1.0"),
        };
      }
      
      await avatar.createStartAvatar(avatarStartConfig);

      // ❌ DISABLED: HeyGen's voice chat causes echo loop with Claude
      // HeyGen's voice chat is designed ONLY for their built-in AI
      // When using Claude, the avatar hears itself and creates infinite loop
      // Solution: Use Web Speech API for voice input (separate from HeyGen video)
      console.log("✅ HeyGen video ready - voice input via Web Speech API, responses via Claude");

      console.log("HeyGen session started successfully");
      setHeygenSessionActive(true);
      setIsLoading(false);
    } catch (error) {
      console.error("Error starting HeyGen session:", error);
      setIsLoading(false);
      throw error;
    }
  }, [heygenSessionActive, videoRef, startIdleTimeout, clearIdleTimeout]);

  const startSession = useCallback(async (options?: StartSessionOptions) => {
    setIsLoading(true);
    
    reconnectAttemptsRef.current = 0;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
    }
    
    // ✅ Safety timeout: Auto-clear loading state after 30 seconds
    // HeyGen initialization can take 15-20 seconds, so we give it plenty of time
    loadingTimeoutRef.current = setTimeout(() => {
      console.warn("⚠️ Loading timeout reached - auto-clearing loading state");
      setIsLoading(false);
      setShowReconnect(true);
      loadingTimeoutRef.current = null;
    }, 30000);
    
    const { audioOnly = false, avatarId } = options || {};
    audioOnlyRef.current = audioOnly;
    
    const activeAvatarId = avatarId || currentAvatarIdRef.current;
    currentAvatarIdRef.current = activeAvatarId;

    // End all existing sessions first to prevent "Maximum 2 concurrent sessions" error
    try {
      await fetch("/api/session/end-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
        }),
      });
    } catch (error) {
      console.warn("Failed to end previous sessions:", error);
      // Continue anyway - this is just cleanup
    }

    // Register session with server (for both audio and video modes)
    try {
      const response = await fetch("/api/session/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          avatarId: activeAvatarId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 429) {
          throw new Error(errorData.error || "Rate limit exceeded. Please wait before starting a new session.");
        }
        
        throw new Error(errorData.error || "Failed to start session");
      }

      const data = await response.json();
      sessionIdRef.current = data.sessionId;
    } catch (error: any) {
      console.error("Error registering session:", error);
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      setIsLoading(false);
      throw error;
    }

    // Setup UI based on mode
    if (audioOnly) {
      // Hide video element for audio-only
      if (videoRef.current) {
        videoRef.current.style.display = 'none';
        videoRef.current.style.visibility = 'hidden';
      }
      console.log('Audio-only mode: Video disabled, session registered');
    } else {
      // Ensure video container is visible for placeholder/HeyGen
      if (videoRef.current) {
        console.log('Video mode: UI ready, HeyGen will start on first message');
        videoRef.current.style.display = 'block';
        videoRef.current.style.visibility = 'visible';
        videoRef.current.style.opacity = '1';
      }
    }

    setSessionActive(true);
    onSessionActiveChange?.(true);
    
    // ✅ Start voice recognition IMMEDIATELY for all modes (independent of HeyGen video)
    // This allows users to speak even before video loads or in audio-only mode
    startVoiceRecognition();
    
    // Start HeyGen immediately in video mode for instant avatar appearance
    if (!audioOnly) {
      try {
        await startHeyGenSession(activeAvatarId);
        // Loading state cleared by STREAM_READY event
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
          loadingTimeoutRef.current = null;
        }
      } catch (error) {
        console.error("Error starting HeyGen in video mode:", error);
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
          loadingTimeoutRef.current = null;
        }
        setIsLoading(false);
        throw error;
      }
    } else {
      // Audio mode: HeyGen will start on first message (lazy loading)
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      setIsLoading(false);
      
      // Pre-cache acknowledgment audio for faster responses in audio-only mode
      triggerAcknowledgmentCache(activeAvatarId);
    }
    
    setTimeout(() => {
      onResetInactivityTimer?.();
    }, 500);
  }, [
    videoRef,
    userId,
    onSessionActiveChange,
    onResetInactivityTimer,
    startHeyGenSession,
    startVoiceRecognition,
    triggerAcknowledgmentCache,
  ]);

  const endSessionShowReconnect = useCallback(async () => {
    if (abortControllerRef.current) {
      console.log("Cancelling ongoing API request");
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Stop speech recognition - set flag FIRST to prevent auto-restart  
    recognitionIntentionalStopRef.current = true;
    recognitionRunningRef.current = false;
    // Clear any pending restart timeout
    if (recognitionRestartTimeoutRef.current) {
      clearTimeout(recognitionRestartTimeoutRef.current);
      recognitionRestartTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        recognitionRef.current = null;
        console.log("✅ Voice recognition stopped");
      } catch (error) {
        console.warn("Error stopping speech recognition:", error);
      }
    }
    // Always reset microphone status to stopped, even if recognition was never initialized
    setMicrophoneStatus('stopped');

    if (avatarRef.current) {
      try {
        // No automatic farewell - saves HeyGen credits
        // Just stop the avatar session immediately
        intentionalStopRef.current = true;
        console.log("Setting intentionalStop flag to TRUE for timeout");

        await avatarRef.current.stopAvatar().catch(console.error);
        avatarRef.current = null;
      } catch (error) {
        console.error("Error stopping avatar on timeout:", error);
        if (avatarRef.current) {
          intentionalStopRef.current = true;
          await avatarRef.current.stopAvatar().catch(console.error);
          avatarRef.current = null;
        }
      }
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
      console.log("Video element cleared on timeout");
    }

    // Stop current audio if playing
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        currentAudioRef.current.src = '';
        currentAudioRef.current.load();
        currentAudioRef.current = null;
        console.log("Audio playback stopped");
      } catch (e) {
        console.warn("Error stopping audio:", e);
        currentAudioRef.current = null;
      }
    }
    isSpeakingRef.current = false;
    setIsSpeakingState(false);

    setSessionActive(false);
    setIsLoading(true);
    setShowReconnect(true);
    onSessionActiveChange?.(false);
    
    endSessionOnServer();
  }, [videoRef, onSessionActiveChange]);

  const endSession = useCallback(async () => {
    if (abortControllerRef.current) {
      console.log("Cancelling ongoing API request on end session");
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Clear idle timeout
    clearIdleTimeout();
    
    // Stop speech recognition - set flag FIRST to prevent auto-restart
    recognitionIntentionalStopRef.current = true;
    recognitionRunningRef.current = false;
    // Clear any pending restart timeout
    if (recognitionRestartTimeoutRef.current) {
      clearTimeout(recognitionRestartTimeoutRef.current);
      recognitionRestartTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        recognitionRef.current = null;
        console.log("✅ Voice recognition stopped");
      } catch (error) {
        console.warn("Error stopping speech recognition:", error);
      }
    }
    // Always reset microphone status to stopped, even if recognition was never initialized
    setMicrophoneStatus('stopped');

    if (avatarRef.current) {
      intentionalStopRef.current = true;
      await avatarRef.current.stopAvatar().catch(console.error);
      avatarRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    // Stop current audio if playing
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        currentAudioRef.current.src = '';
        currentAudioRef.current.load();
        currentAudioRef.current = null;
      } catch (e) {
        console.warn("Error stopping audio:", e);
        currentAudioRef.current = null;
      }
    }
    isSpeakingRef.current = false;
    setIsSpeakingState(false);

    setSessionActive(false);
    setHeygenSessionActive(false);
    setIsLoading(false);
    setShowReconnect(false);
    onSessionActiveChange?.(false);
    
    await endSessionOnServer();
  }, [videoRef, onSessionActiveChange, clearIdleTimeout]);

  const reconnect = useCallback(async () => {
    setShowReconnect(false);
    hasStartedRef.current = false;
    reconnectAttemptsRef.current = 0;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    try {
      await startSession({ audioOnly: audioOnlyRef.current });
    } catch (error) {
      console.error("Error reconnecting:", error);
      setShowReconnect(true);
      throw error;
    }
  }, [startSession]);

  // Switch between audio-only and video modes WITHOUT restarting the session
  // This preserves conversation context and keeps voice recognition running
  const switchTransportMode = useCallback(async (toVideoMode: boolean) => {
    const newAudioOnly = !toVideoMode;
    
    // Skip if already in the target mode
    if (audioOnlyRef.current === newAudioOnly) {
      console.log("Already in target mode, skipping switch");
      return;
    }
    
    console.log(`🔄 Switching transport: ${audioOnlyRef.current ? 'Audio' : 'Video'} → ${newAudioOnly ? 'Audio' : 'Video'}`);
    
    // CRITICAL: Clear any pending idle timeout to prevent it from firing in audio mode
    // and calling stopHeyGenSession which would clear sessionIdRef
    clearIdleTimeout();
    
    // CRITICAL: Update mode ref FIRST so all guards work correctly
    const wasAudioOnly = audioOnlyRef.current;
    audioOnlyRef.current = newAudioOnly;
    
    // Stop any current playback first
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        currentAudioRef.current = null;
        isSpeakingRef.current = false;
        setIsSpeakingState(false);
        console.log("Stopped audio playback for mode switch");
      } catch (e) {
        console.warn("Error stopping audio:", e);
      }
    }
    
    // If switching FROM video TO audio, stop HeyGen client (releases credits automatically)
    // Keep server session alive for conversation continuity
    if (!wasAudioOnly && newAudioOnly) {
      // Always clear HeyGen state when switching to audio, even if avatar seems inactive
      try {
        intentionalStopRef.current = true;
        
        // Stop avatar if it exists
        if (avatarRef.current) {
          await avatarRef.current.stopAvatar().catch((e) => {
            console.warn("Error stopping avatar:", e);
          });
        }
        
        // ALWAYS clear these state values to ensure clean audio mode
        avatarRef.current = null;
        setHeygenSessionActive(false);
        isSpeakingRef.current = false;
        setIsSpeakingState(false);
        
        if (videoRef.current) {
          videoRef.current.srcObject = null;
          videoRef.current.style.display = 'none';
          videoRef.current.style.visibility = 'hidden';
        }
        
        // NOTE: Don't call endSessionOnServer() - that clears sessionIdRef
        // which breaks subsequent requests. The server session is for
        // conversation tracking, not HeyGen billing (that's handled by stopAvatar)
        
        console.log("✅ HeyGen stopped - switched to audio mode (session preserved, avatarRef cleared)");
      } catch (error) {
        console.error("Error stopping HeyGen for mode switch:", error);
        // Revert mode on failure but still try to clean up state
        audioOnlyRef.current = wasAudioOnly;
        avatarRef.current = null;
        setHeygenSessionActive(false);
        throw error;
      }
    }
    
    // If switching FROM audio TO video, start HeyGen
    if (!newAudioOnly) {
      if (videoRef.current) {
        videoRef.current.style.display = 'block';
        videoRef.current.style.visibility = 'visible';
        videoRef.current.style.opacity = '1';
      }
      
      try {
        setIsLoading(true);
        await startHeyGenSession(currentAvatarIdRef.current);
        setIsLoading(false);
        console.log("✅ HeyGen started - switched to video mode");
      } catch (error) {
        console.error("Error starting HeyGen for mode switch:", error);
        setIsLoading(false);
        // Revert to audio mode on failure
        audioOnlyRef.current = true;
        if (videoRef.current) {
          videoRef.current.style.display = 'none';
          videoRef.current.style.visibility = 'hidden';
        }
        throw error;
      }
    }
    
    // Voice recognition continues running throughout - no restart needed
    console.log("🎤 Voice recognition remains active during mode switch");
  }, [videoRef, startHeyGenSession, clearIdleTimeout]);

  const togglePause = useCallback(async () => {
    if (isPaused) {
      setIsPaused(false);
      hasStartedRef.current = false;
      try {
        await startSession({ audioOnly: audioOnlyRef.current });
        console.log("Avatar resuming - restarting session");
      } catch (error) {
        console.error("Error resuming session:", error);
        // End session and show reconnect screen on failure
        setSessionActive(false);
        setIsPaused(false);
        setShowReconnect(true);
        await endSessionOnServer();
        throw error; // Re-throw so component can show toast
      }
    } else {
      if (abortControllerRef.current) {
        console.log("Cancelling ongoing API request on pause");
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      // Stop voice recognition FIRST to prevent picking up trailing audio from speakers
      recognitionIntentionalStopRef.current = true;
      recognitionRunningRef.current = false;
      if (recognitionRestartTimeoutRef.current) {
        clearTimeout(recognitionRestartTimeoutRef.current);
        recognitionRestartTimeoutRef.current = null;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
          recognitionRef.current = null;
          console.log("✅ Voice recognition stopped on pause");
        } catch (error) {
          console.warn("Error stopping speech recognition on pause:", error);
        }
      }
      setMicrophoneStatus('stopped');

      if (avatarRef.current) {
        intentionalStopRef.current = true;
        console.log("Setting intentionalStop flag to TRUE for pause");
        await avatarRef.current.stopAvatar().catch(console.error);
        avatarRef.current = null;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = null;
        console.log("Video element cleared");
      }

      // Stop current audio if playing
      if (currentAudioRef.current) {
        try {
          currentAudioRef.current.pause();
          currentAudioRef.current.currentTime = 0;
          currentAudioRef.current.src = '';
          currentAudioRef.current.load();
          currentAudioRef.current = null;
          console.log("Audio playback stopped on pause");
        } catch (e) {
          console.warn("Error stopping audio on pause:", e);
          currentAudioRef.current = null;
        }
      }
      isSpeakingRef.current = false;
      setIsSpeakingState(false);

      setSessionActive(false);
      setIsPaused(true);
      console.log("Avatar paused - stream stopped to save credits");
      onSessionActiveChange?.(false);
      
      endSessionOnServer();
    }
  }, [isPaused, startSession, videoRef, onSessionActiveChange]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (sessionIdRef.current) {
        const blob = new Blob(
          [JSON.stringify({ sessionId: sessionIdRef.current })],
          { type: "application/json" }
        );
        navigator.sendBeacon("/api/session/end", blob);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      
      clearIdleTimeout();
      
      // Stop any playing audio
      if (currentAudioRef.current) {
        try {
          currentAudioRef.current.pause();
          currentAudioRef.current.currentTime = 0;
          currentAudioRef.current.src = '';
          currentAudioRef.current = null;
          console.log("🛑 Audio stopped on cleanup");
        } catch (e) {
          console.warn("Error stopping audio on cleanup:", e);
          currentAudioRef.current = null;
        }
      }
      
      // Stop voice recognition
      if (recognitionRef.current) {
        try {
          recognitionIntentionalStopRef.current = true;
          recognitionRef.current.stop();
          recognitionRef.current = null;
          console.log("🛑 Voice recognition stopped on cleanup");
        } catch (e) {
          console.warn("Error stopping voice recognition on cleanup:", e);
        }
      }
      
      if (avatarRef.current) {
        intentionalStopRef.current = true;
        avatarRef.current.stopAvatar().catch(console.error);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (speakingIntervalRef.current) {
        clearInterval(speakingIntervalRef.current);
      }
      
      endSessionOnServer();
    };
  }, [clearIdleTimeout]);

  const handleSubmitMessage = useCallback(async (message: string) => {
    console.log("📝 handleSubmitMessage called with:", { message, sessionActive, heygenSessionActive });
    
    if (!message.trim()) {
      console.warn("Empty message, skipping");
      return;
    }

    // Clear idle timeout immediately to prevent mid-conversation shutdowns
    clearIdleTimeout();
    
    onResetInactivityTimer?.();
    const requestId = Date.now().toString() + Math.random().toString(36);
    currentRequestIdRef.current = requestId;
    console.log("✅ Processing message - Request ID:", requestId);

    // Interrupt current speech IMMEDIATELY before any API calls
    if (audioOnlyRef.current && currentAudioRef.current) {
      // Audio-only mode: Stop current audio
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
      isSpeakingRef.current = false;
      setIsSpeakingState(false);
    } else if (avatarRef.current && isSpeakingRef.current) {
      // Video mode: Interrupt avatar
      await avatarRef.current.interrupt().catch(() => {});
    }

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Audio-only mode: Use combined /api/audio endpoint (Claude + ElevenLabs in one call)
      if (audioOnlyRef.current) {
        console.log("Audio-only mode: Using /api/audio endpoint");
        isSpeakingRef.current = true;
        setIsSpeakingState(true);

        // Play instant acknowledgment while Claude processes (non-blocking)
        playAcknowledgmentInstantly().catch(() => {});

        try {
          const audioResponse = await fetch("/api/audio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message,
              userId: memoryEnabled ? userId : undefined,
              avatarId: currentAvatarIdRef.current,
              memoryEnabled, // Pass memory toggle flag
            }),
            signal: controller.signal,
          });

          if (requestId !== currentRequestIdRef.current) {
            console.log("Ignoring old audio response - newer request in progress");
            isSpeakingRef.current = false;
            setIsSpeakingState(false);
            return;
          }

          if (audioResponse.ok) {
            const audioBlob = await audioResponse.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            currentAudioRef.current = audio;

            audio.onended = () => {
              isSpeakingRef.current = false;
              setIsSpeakingState(false);
              URL.revokeObjectURL(audioUrl);
              currentAudioRef.current = null;
            };

            audio.onerror = () => {
              isSpeakingRef.current = false;
              setIsSpeakingState(false);
              URL.revokeObjectURL(audioUrl);
              currentAudioRef.current = null;
            };

            await audio.play();
            console.log("Audio playback started");
          } else {
            // Audio fetch failed - clear state
            isSpeakingRef.current = false;
            setIsSpeakingState(false);
            currentAudioRef.current = null;
            const errorText = await audioResponse.text();
            console.error("Failed to get audio response:", audioResponse.status, errorText);
          }
        } catch (audioError) {
          // Audio fetch or playback error - clear state
          isSpeakingRef.current = false;
          setIsSpeakingState(false);
          currentAudioRef.current = null;
          if (audioError instanceof Error && audioError.name !== "AbortError") {
            console.error("Audio error:", audioError);
          }
        }
      } else {
        // Video mode: Start HeyGen session ONLY on first message if not already started
        if (!heygenSessionActive && !avatarRef.current) {
          try {
            await startHeyGenSession(currentAvatarIdRef.current);
          } catch (error) {
            console.error("Failed to start HeyGen session:", error);
            // ⚠️ DON'T return early - still send message to Claude!
            // HeyGen is just for video rendering, Claude generates the response
          }
        }
        
        // Get Claude response then speak via HeyGen
        const response = await fetch("/api/avatar/response", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            userId: memoryEnabled ? userId : undefined,
            avatarId: currentAvatarIdRef.current,
            memoryEnabled, // Pass memory toggle flag
          }),
          signal: controller.signal,
        });

        if (requestId !== currentRequestIdRef.current) {
          console.log("Ignoring old response - newer request in progress");
          return;
        }

        if (!response.ok) {
          console.error("Failed to get response from API:", response.statusText);
          return;
        }

        const data = await response.json();
        const claudeResponse = data.knowledgeResponse || data.response;
        console.log("Claude response received:", claudeResponse);

        // Check if this is an end session response
        const shouldEndSession = data.endSession === true;
        if (shouldEndSession) {
          console.log("👋 End chat intent detected - will end session after farewell");
        }

        onResetInactivityTimer?.();
        clearIdleTimeout(); // Clear idle timeout when processing new message

        // Clear and reset speaking interval
        if (speakingIntervalRef.current) {
          clearInterval(speakingIntervalRef.current);
        }

        speakingIntervalRef.current = setInterval(() => {
          onResetInactivityTimer?.();
          console.log("Resetting timer during avatar speech");
        }, 10000);

        setTimeout(() => {
          if (speakingIntervalRef.current) {
            clearInterval(speakingIntervalRef.current);
            speakingIntervalRef.current = null;
            console.log("Cleared speaking interval - max duration reached");
            onResetInactivityTimer?.();
          }
        }, 180000);

        // Video mode: Use HeyGen avatar with auto-reconnect on 401
        if (avatarRef.current) {
          // ✅ Avatar speaks Claude's response
          // Note: Voice recognition will be paused by AVATAR_START_TALKING event
          console.log("🗣️ SENDING TO HEYGEN - Full Claude response:");
          console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
          console.log(claudeResponse);
          console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
          console.log("Text length:", claudeResponse.length, "characters");
          
          // Helper function to speak with retry on 401
          const speakWithRetry = async (retryCount = 0): Promise<void> => {
            try {
              if (!avatarRef.current) {
                throw new Error("Avatar not available");
              }
              await avatarRef.current.speak({
                text: claudeResponse,
                task_type: TaskType.REPEAT, // ✅ CRITICAL: REPEAT = just speak our text, TALK = use HeyGen's AI
              });
              console.log("✅ HeyGen speak() called with REPEAT mode (no HeyGen AI)");
            } catch (speakError) {
              const errorMsg = speakError instanceof Error ? speakError.message : String(speakError);
              
              // Check for 401 Unauthorized - session expired
              if ((errorMsg.includes("401") || errorMsg.includes("Unauthorized")) && retryCount < 1) {
                console.log("🔄 HeyGen session expired (401) - auto-reconnecting...");
                
                // Clear old session
                setHeygenSessionActive(false);
                if (avatarRef.current) {
                  try {
                    await avatarRef.current.stopAvatar().catch(() => {});
                  } catch (e) {
                    // Ignore errors when stopping expired session
                  }
                }
                avatarRef.current = null;
                
                // Restart HeyGen session
                try {
                  await startHeyGenSession(currentAvatarIdRef.current);
                  console.log("✅ HeyGen session restarted - retrying speak...");
                  
                  // Wait a moment for session to stabilize
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  
                  // Retry speak
                  await speakWithRetry(retryCount + 1);
                } catch (reconnectError) {
                  console.error("❌ Failed to reconnect HeyGen session:", reconnectError);
                  setShowReconnect(true);
                }
              } else {
                // Non-401 error or already retried - rethrow
                throw speakError;
              }
            }
          };
          
          await speakWithRetry();
          
          // If end session was requested, wait for avatar to finish speaking then end
          if (shouldEndSession) {
            console.log("👋 Farewell spoken - ending session in 3 seconds...");
            setTimeout(async () => {
              console.log("👋 Auto-ending session after farewell");
              await endSessionShowReconnect();
            }, 3000);
          }
        } else if (shouldEndSession) {
          // Audio-only mode or no avatar - end session immediately
          console.log("👋 Farewell delivered - ending session...");
          setTimeout(async () => {
            await endSessionShowReconnect();
          }, 2000);
        }
      }
    } catch (error) {
      // Cleanup on any error
      isSpeakingRef.current = false;
      setIsSpeakingState(false);
      currentAudioRef.current = null;
      
      if (error instanceof Error && error.name === "AbortError") {
        // Expected - request was cancelled
      } else if (error instanceof DOMException && error.name === "AbortError") {
        // Expected - request was cancelled
      } else {
        console.error("Error sending message:", error);
        
        // Check for HeyGen 401 Unauthorized error - session expired (fallback if speakWithRetry failed)
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
          console.log("🔄 HeyGen session expired (401) - showing reconnect button...");
          setShowReconnect(true);
          setHeygenSessionActive(false);
          avatarRef.current = null;
        }
      }
    } finally {
      // Clear abort controller only if it's still the one we created
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [sessionActive, heygenSessionActive, memoryEnabled, userId, onResetInactivityTimer, startHeyGenSession, clearIdleTimeout, endSessionShowReconnect, playAcknowledgmentInstantly]);

  const stopAudio = useCallback(() => {
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        currentAudioRef.current.src = '';
        currentAudioRef.current.load();
        currentAudioRef.current = null;
        console.log("🛑 Audio force stopped");
      } catch (e) {
        console.warn("Error force stopping audio:", e);
        currentAudioRef.current = null;
      }
    }
    isSpeakingRef.current = false;
    setIsSpeakingState(false);
  }, []);

  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
        idleTimeoutRef.current = null;
      }
    };
  }, []);

  return {
    sessionActive,
    heygenSessionActive,
    isLoading,
    showReconnect,
    startSession,
    endSession,
    endSessionShowReconnect,
    reconnect,
    togglePause,
    switchTransportMode,
    isPaused,
    isSpeaking: isSpeakingState,
    microphoneStatus,
    avatarRef,
    intentionalStopRef,
    abortControllerRef,
    currentRequestIdRef,
    speakingIntervalRef,
    hasAskedAnythingElseRef,
    handleSubmitMessage,
    stopAudio,
  };
}
