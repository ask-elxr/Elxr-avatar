import { useState, useRef, useCallback, useEffect } from "react";
import StreamingAvatar, {
  TaskType,
  AvatarQuality,
  StreamingEvents,
} from "@heygen/streaming-avatar";
import { SessionDriver, HeyGenDriver, AudioOnlyDriver } from "./sessionDrivers";
import { getMemberstackId } from "@/lib/queryClient";

interface AvatarSessionConfig {
  videoRef: React.RefObject<HTMLVideoElement>;
  userId: string;
  memoryEnabled: boolean;
  selectedAvatarId?: string;
  languageCode?: string;
  elevenLabsLanguageCode?: string;
  onSessionActiveChange?: (active: boolean) => void;
  onResetInactivityTimer?: () => void;
  onVideoGenerating?: (topic: string, videoRecordId: string) => void;
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
  microphoneStatus: 'listening' | 'stopped' | 'not-supported' | 'permission-denied' | 'needs-gesture';
  avatarRef: React.MutableRefObject<StreamingAvatar | null>;
  intentionalStopRef: React.MutableRefObject<boolean>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  currentRequestIdRef: React.MutableRefObject<string>;
  speakingIntervalRef: React.MutableRefObject<NodeJS.Timeout | null>;
  hasAskedAnythingElseRef: React.MutableRefObject<boolean>;
  handleSubmitMessage: (message: string, imageData?: { base64: string; mimeType: string }) => Promise<void>;
  stopAudio: () => void;
  manualStartVoice: () => void;
}

export function useAvatarSession({
  videoRef,
  userId,
  memoryEnabled,
  selectedAvatarId = "mark-kohl",
  languageCode = "en-US",
  elevenLabsLanguageCode = "en",
  onSessionActiveChange,
  onResetInactivityTimer,
  onVideoGenerating,
}: AvatarSessionConfig): AvatarSessionReturn {
  const [sessionActive, setSessionActive] = useState(false);
  const [heygenSessionActive, setHeygenSessionActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showReconnect, setShowReconnect] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSpeakingState, setIsSpeakingState] = useState(false);
  const [microphoneStatus, setMicrophoneStatus] = useState<'listening' | 'stopped' | 'not-supported' | 'permission-denied' | 'needs-gesture'>('stopped');

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
  const memoryEnabledRef = useRef(memoryEnabled); // Always have current value for callbacks
  const languageCodeRef = useRef(languageCode); // For speech recognition
  const elevenLabsLanguageCodeRef = useRef(elevenLabsLanguageCode); // For TTS
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
  const currentAcknowledgmentRef = useRef<HTMLAudioElement | null>(null); // Currently playing acknowledgment (for stopping)
  const streamingEnabledRef = useRef(true); // Enable streaming mode by default for faster responses
  const sentenceQueueRef = useRef<string[]>([]); // Queue of sentences to speak
  const isSpeakingQueueRef = useRef(false); // Whether we're currently processing the speak queue
  const useElevenLabsVoiceRef = useRef(false); // Use ElevenLabs voice in video mode for avatars without HeyGen voice
  const elevenLabsVideoAudioRef = useRef<HTMLAudioElement | null>(null); // Audio element for ElevenLabs in video mode
  const elevenLabsRecognitionResumeTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Pending recognition resume timer for ElevenLabs
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

  // Sync memoryEnabledRef with memoryEnabled prop (prevents stale closures)
  useEffect(() => {
    memoryEnabledRef.current = memoryEnabled;
  }, [memoryEnabled]);

  // Sync language refs with props
  useEffect(() => {
    languageCodeRef.current = languageCode;
    // Update recognition language if active
    if (recognitionRef.current) {
      recognitionRef.current.lang = languageCode;
      console.log(`🌐 Updated speech recognition language to: ${languageCode}`);
    }
  }, [languageCode]);

  useEffect(() => {
    elevenLabsLanguageCodeRef.current = elevenLabsLanguageCode;
  }, [elevenLabsLanguageCode]);

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

  const stopAcknowledgmentAudio = useCallback(() => {
    if (currentAcknowledgmentRef.current) {
      try {
        currentAcknowledgmentRef.current.pause();
        currentAcknowledgmentRef.current.currentTime = 0;
        currentAcknowledgmentRef.current = null;
        console.log("🔇 Acknowledgment audio stopped");
      } catch (e) {
        currentAcknowledgmentRef.current = null;
      }
    }
  }, []);

  const playAcknowledgmentInstantly = useCallback(async () => {
    if (!audioOnlyRef.current) return; // Only for audio-only mode
    const avatarId = currentAvatarIdRef.current;
    
    try {
      const response = await fetch(`/api/audio/acknowledgment/${avatarId}`);
      if (response.ok) {
        // Note: Voice recognition is already stopped in handleSubmitMessage
        // before this function is called, so no need to stop it here
        
        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        audio.volume = 0.8; // Slightly lower volume for acknowledgment
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          if (currentAcknowledgmentRef.current === audio) {
            currentAcknowledgmentRef.current = null;
          }
          // Note: Don't resume voice recognition here - main response audio will play next
          // Voice recognition will be resumed after main response ends
        };
        currentAcknowledgmentRef.current = audio; // Track for stopping later
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
    // Skip if already initialized AND running
    if (recognitionRef.current && recognitionRunningRef.current) {
      console.log("⏭️ Voice recognition already active");
      return;
    }
    
    // If we have a stale reference that's not running, clean it up
    if (recognitionRef.current && !recognitionRunningRef.current) {
      console.log("🔄 Cleaning up stale voice recognition reference");
      try {
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }

    // Clear any stuck timeout from previous instance
    if (recognitionStuckTimeoutRef.current) {
      clearTimeout(recognitionStuckTimeoutRef.current);
      recognitionStuckTimeoutRef.current = null;
    }

    // ✅ Initialize Web Speech API for voice input
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      
      // Enhanced mobile browser detection
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera || '';
      const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;
      const isAndroid = /android/i.test(userAgent);
      // Better mobile detection: check for mobile keyword, touch capability, and small screen
      const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isSmallScreen = window.innerWidth <= 768;
      const hasMobileKeyword = /mobile|phone/i.test(userAgent);
      const isMobile = isIOS || isAndroid || hasMobileKeyword || (hasTouchScreen && isSmallScreen);
      // More reliable Safari detection for iOS
      const isSafari = /Safari/.test(userAgent) && !/Chrome|CriOS|FxiOS|Edg/.test(userAgent);
      const isIOSSafari = isIOS && isSafari;
      const isChrome = /Chrome/.test(userAgent) && !/Edg/.test(userAgent);
      const isChromeIOS = isIOS && /CriOS/i.test(userAgent);
      const isFirefoxIOS = isIOS && /FxiOS/i.test(userAgent);
      const isChromeMobile = isChrome && (isAndroid || hasMobileKeyword);
      
      console.log(`📱 Browser detection: iOS=${isIOS}, Android=${isAndroid}, Safari=${isSafari}, iOSSafari=${isIOSSafari}, Chrome=${isChrome}, ChromeIOS=${isChromeIOS}, ChromeMobile=${isChromeMobile}, touch=${hasTouchScreen}, smallScreen=${isSmallScreen}`);
      console.log(`📱 UserAgent: ${userAgent.substring(0, 100)}...`);
      
      // Chrome on iOS does NOT support Web Speech API (Apple restricts it)
      // Only Safari can use it on iOS
      if (isChromeIOS || isFirefoxIOS) {
        console.warn("⚠️ Voice input not supported in Chrome/Firefox on iOS - only Safari supports it");
        setMicrophoneStatus('not-supported');
        return;
      }
      
      if (!SpeechRecognition) {
        console.warn("⚠️ Web Speech API not supported in this browser - use text input instead");
        // On iOS Safari, offer tap-to-enable even if API seems missing (might be a timing issue)
        if (isIOSSafari) {
          console.log("📱 iOS Safari detected but SpeechRecognition not available - offering tap to enable");
          setMicrophoneStatus('needs-gesture');
        } else {
          setMicrophoneStatus('not-supported');
        }
        return;
      }

      const recognition = new SpeechRecognition();
      
      // MOBILE/SAFARI FIX: Use non-continuous mode for better reliability
      // Safari (both iOS and macOS) and mobile browsers have issues with continuous mode
      const useContinuous = !isMobile && !isSafari;
      recognition.continuous = useContinuous;
      recognition.interimResults = false; // Only get final results
      recognition.lang = languageCodeRef.current;
      recognition.maxAlternatives = 1; // Only get best match
      
      console.log(`🎤 Voice recognition config: continuous=${useContinuous}, mobile=${isMobile}, safari=${isSafari}, lang=${recognition.lang}`);
      
      // Mobile/Safari stuck detection - recreate if no results for 15 seconds
      const resetStuckTimeout = () => {
        if (recognitionStuckTimeoutRef.current) {
          clearTimeout(recognitionStuckTimeoutRef.current);
        }
        // Apply stuck detection for mobile AND Safari (both can get stuck)
        if ((isMobile || isSafari) && sessionActiveRef.current && !isSpeakingRef.current) {
          recognitionStuckTimeoutRef.current = setTimeout(() => {
            console.log("⚠️ Recognition appears stuck (mobile/Safari), recreating...");
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
              }, 500);
            }
          }, 15000); // 15 seconds stuck detection
        }
      };
      
      recognition.onstart = () => {
        setMicrophoneStatus('listening');
        console.log("🎤 Microphone listening" + (isMobile ? " (mobile mode)" : ""));
        resetStuckTimeout(); // Start stuck detection
      };
      
      // MOBILE FIX: Handle audio start/end events for Safari iOS
      recognition.onaudiostart = () => {
        console.log("🔊 Audio capture started");
      };
      
      recognition.onaudioend = () => {
        console.log("🔊 Audio capture ended");
      };
      
      recognition.onspeechstart = () => {
        console.log("🗣️ Speech detected");
      };
      
      recognition.onspeechend = () => {
        console.log("🗣️ Speech ended");
        // SAFARI FIX: Force proper stop on speech end (both iOS and macOS Safari)
        if (isSafari) {
          try {
            // This counterintuitive pattern helps Safari properly end recognition
            recognition.stop();
          } catch (e) {}
        }
      };
      
      recognition.onresult = (event: any) => {
        resetStuckTimeout(); // Reset stuck timeout on any result
        
        // Only process final results (not interim)
        const result = event.results[event.results.length - 1];
        if (!result.isFinal) return;
        
        const transcript = result[0].transcript.trim();
        
        // 🔇 ECHO PROTECTION: Block transcripts while audio is playing in audio-only mode
        // This prevents the avatar from hearing its own voice through the speaker
        if (audioOnlyRef.current && currentAudioRef.current) {
          console.log("🔇 ECHO BLOCKED: Ignoring transcript while audio playing:", transcript.substring(0, 50));
          return;
        }
        
        // 🔇 ECHO PROTECTION: If avatar is speaking (video mode), allow interrupts
        if (isSpeakingRef.current && !audioOnlyRef.current) {
          // In video mode, user can interrupt by speaking
          if (!avatarRef.current) {
            console.log("🔇 ECHO BLOCKED: Ignoring transcript while avatar speaking (no active session):", transcript.substring(0, 50));
            return;
          }
        }
        
        // Deduplicate (Web Speech can fire same result multiple times)
        if (transcript && transcript !== lastTranscriptRef.current) {
          lastTranscriptRef.current = transcript;
          // ⏱️ TIMING: Mark when voice input was captured
          const voiceInputTime = performance.now();
          console.log("⏱️ [TIMING] === VOICE INPUT CAPTURED ===");
          console.log("🎤 Voice input (final):", transcript);
          console.log("⏱️ [TIMING] STT completed at:", new Date().toISOString());
          
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
          
          // If avatar is speaking in video mode, interrupt it
          if (isSpeakingRef.current && avatarRef.current && !audioOnlyRef.current) {
            console.log("🛑 Interrupting HeyGen avatar - user is speaking");
            avatarRef.current.interrupt().catch(() => {});
            isSpeakingRef.current = false;
            setIsSpeakingState(false);
          }
          
          // Process the message (always process after interrupting)
          console.log("🎤 Submitting voice transcript:", transcript, "isSpeaking:", isSpeakingRef.current);
          handleSubmitMessage(transcript);
        }
      };
      
      recognition.onerror = (event: any) => {
        console.log(`🎤 Speech recognition error: ${event.error} (mobile=${isMobile}, iOS=${isIOS})`);
        
        if (event.error === 'not-allowed') {
          console.error("🎤 Microphone permission denied - use text input instead");
          setMicrophoneStatus('permission-denied');
          // Clear stuck timeout on permission error
          if (recognitionStuckTimeoutRef.current) {
            clearTimeout(recognitionStuckTimeoutRef.current);
            recognitionStuckTimeoutRef.current = null;
          }
        } else if (event.error === 'service-not-allowed') {
          // This happens on iOS when using non-Safari browsers or in PWA mode
          console.error("🎤 Speech recognition service not allowed - may be browser limitation");
          setMicrophoneStatus('not-supported');
        } else if (event.error === 'network') {
          // Network required for speech recognition (it's server-based)
          console.error("🎤 Network error - check internet connection");
          // Try to restart after a delay
          if (!recognitionIntentionalStopRef.current && sessionActiveRef.current) {
            setTimeout(() => {
              if (!recognitionIntentionalStopRef.current && sessionActiveRef.current && !recognitionRunningRef.current) {
                console.log("🔄 Retrying voice recognition after network error...");
                startVoiceRecognition();
              }
            }, 3000);
          }
        } else if (event.error === 'audio-capture') {
          // Microphone not available or in use by another app
          console.error("🎤 Audio capture failed - microphone may be in use");
          setMicrophoneStatus('permission-denied');
        } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.error("🎤 Speech recognition error:", event.error);
        }
        // 'no-speech' and 'aborted' are normal events, don't log as errors
      };
      
      recognition.onend = () => {
        recognitionRunningRef.current = false;
        
        // Clear any pending restart timeout
        if (recognitionRestartTimeoutRef.current) {
          clearTimeout(recognitionRestartTimeoutRef.current);
          recognitionRestartTimeoutRef.current = null;
        }
        
        // Auto-restart unless intentionally stopped, avatar is speaking, or audio is playing
        // Use ref instead of state to get current value in closure
        // 🔇 ECHO FIX: Don't restart while audio is playing in audio-only mode
        if (!recognitionIntentionalStopRef.current && !isSpeakingRef.current && sessionActiveRef.current && !currentAudioRef.current) {
          // Throttle restarts to prevent rapid loop (min 2 seconds between restarts)
          const now = Date.now();
          const timeSinceLastRestart = now - lastRecognitionRestartRef.current;
          const delayNeeded = Math.max(0, MIN_RESTART_INTERVAL_MS - timeSinceLastRestart);
          
          if (delayNeeded > 0) {
            // Schedule delayed restart
            recognitionRestartTimeoutRef.current = setTimeout(() => {
              // 🔇 ECHO FIX: Don't restart while audio is playing
              if (!recognitionIntentionalStopRef.current && !isSpeakingRef.current && sessionActiveRef.current && !recognitionRunningRef.current && !currentAudioRef.current) {
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
      
      try {
        recognition.start();
        recognitionRunningRef.current = true;
        console.log("✅ Web Speech API started for voice input");
      } catch (startError: any) {
        // iOS Safari often requires user gesture for first start
        console.warn("⚠️ Failed to start speech recognition:", startError?.message || startError);
        recognitionRunningRef.current = false;
        
        // On iOS Safari, offer tap-to-enable (user gesture required)
        if (isIOSSafari) {
          console.log("📱 iOS Safari detected - need user gesture to start voice");
          setMicrophoneStatus('needs-gesture');
        } else if (isMobile) {
          // Other mobile browsers might also need gesture
          console.log("📱 Mobile browser detected - offering tap to enable");
          setMicrophoneStatus('needs-gesture');
        } else {
          setMicrophoneStatus('stopped');
        }
      }
    } catch (error: any) {
      console.error("❌ Error initializing Web Speech API:", error?.message || error);
      
      // Check if this is iOS Safari - offer tap-to-enable even on error
      const userAgent = navigator.userAgent || '';
      const isIOS = /iPad|iPhone|iPod/.test(userAgent);
      const isSafari = /Safari/.test(userAgent) && !/Chrome|CriOS|FxiOS|Edg/.test(userAgent);
      const isIOSSafariOuter = isIOS && isSafari;
      
      if (isIOSSafariOuter) {
        console.log("📱 iOS Safari error - offering tap to enable voice");
        setMicrophoneStatus('needs-gesture');
      } else {
        setMicrophoneStatus('not-supported');
      }
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

  // Helper to speak with ElevenLabs in video mode (for avatars without HeyGen voice)
  // This mirrors the AVATAR_START_TALKING/STOP_TALKING behavior from HeyGen sessions
  const speakWithElevenLabsInVideoMode = useCallback(async (text: string): Promise<void> => {
    try {
      // Stop any currently playing ElevenLabs audio
      if (elevenLabsVideoAudioRef.current) {
        elevenLabsVideoAudioRef.current.pause();
        elevenLabsVideoAudioRef.current = null;
      }

      // === AVATAR_START_TALKING equivalent ===
      // Pause voice recognition while speaking
      if (recognitionRef.current && recognitionRunningRef.current) {
        try {
          recognitionIntentionalStopRef.current = true;
          recognitionRef.current.stop();
          recognitionRunningRef.current = false;
          setMicrophoneStatus('stopped');
          console.log("🔇 Voice recognition paused for ElevenLabs speech (video mode)");
        } catch (e) {
          // Ignore errors
        }
      }

      isSpeakingRef.current = true;
      setIsSpeakingState(true);
      clearIdleTimeout(); // Clear idle timeout while speaking
      console.log("🗣️ ElevenLabs avatar START talking (video mode)");

      const response = await fetch("/api/elevenlabs/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          avatarId: currentAvatarIdRef.current,
          languageCode: elevenLabsLanguageCodeRef.current,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate ElevenLabs TTS audio");
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      elevenLabsVideoAudioRef.current = audio;

      return new Promise((resolve) => {
        // Helper function to resume recognition with platform-specific delay
        // iOS Safari needs a longer delay (3-5 seconds) due to video/audio conflicts
        // Uses ref for cancellation to prevent racing timers
        const resumeRecognitionWithDelay = () => {
          // Cancel any pending resume timeout to prevent racing
          if (elevenLabsRecognitionResumeTimeoutRef.current) {
            clearTimeout(elevenLabsRecognitionResumeTimeoutRef.current);
            elevenLabsRecognitionResumeTimeoutRef.current = null;
          }
          
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
          const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
          const delay = (isIOS || isSafari) ? 3500 : 1000; // 3.5s for iOS/Safari, 1s for others
          
          elevenLabsRecognitionResumeTimeoutRef.current = setTimeout(() => {
            elevenLabsRecognitionResumeTimeoutRef.current = null;
            recognitionIntentionalStopRef.current = false;
            if (!recognitionRunningRef.current && sessionActiveRef.current) {
              startVoiceRecognition();
              console.log("🎤 Voice recognition resumed after ElevenLabs speech (delayed)");
            }
          }, delay);
        };

        audio.onended = () => {
          // === AVATAR_STOP_TALKING equivalent ===
          isSpeakingRef.current = false;
          setIsSpeakingState(false);
          URL.revokeObjectURL(audioUrl);
          elevenLabsVideoAudioRef.current = null;
          console.log("🗣️ ElevenLabs avatar STOP talking (video mode)");
          
          // Resume voice recognition with delay (matches HeyGen AVATAR_STOP_TALKING behavior)
          resumeRecognitionWithDelay();
          
          // Reset idle timeout
          startIdleTimeout();
          resolve();
        };

        audio.onerror = () => {
          // === AVATAR_STOP_TALKING equivalent on error ===
          isSpeakingRef.current = false;
          setIsSpeakingState(false);
          URL.revokeObjectURL(audioUrl);
          elevenLabsVideoAudioRef.current = null;
          console.log("🗣️ ElevenLabs avatar STOP talking (error - video mode)");
          
          // Resume voice recognition with delay on error
          resumeRecognitionWithDelay();
          
          // Restart idle timeout on error
          startIdleTimeout();
          resolve();
        };

        audio.play().catch((err) => {
          console.error("Error playing ElevenLabs audio in video mode:", err);
          // === AVATAR_STOP_TALKING equivalent on play error ===
          isSpeakingRef.current = false;
          setIsSpeakingState(false);
          console.log("🗣️ ElevenLabs avatar STOP talking (play error - video mode)");
          
          // Resume voice recognition with delay on play error
          resumeRecognitionWithDelay();
          
          // Restart idle timeout on play error
          startIdleTimeout();
          resolve();
        });
      });
    } catch (error) {
      console.error("Error in speakWithElevenLabsInVideoMode:", error);
      // === AVATAR_STOP_TALKING equivalent on fetch error ===
      isSpeakingRef.current = false;
      setIsSpeakingState(false);
      console.log("🗣️ ElevenLabs avatar STOP talking (fetch error - video mode)");
      
      // Resume voice recognition with delay on fetch error
      // Cancel any pending resume timeout to prevent racing
      if (elevenLabsRecognitionResumeTimeoutRef.current) {
        clearTimeout(elevenLabsRecognitionResumeTimeoutRef.current);
        elevenLabsRecognitionResumeTimeoutRef.current = null;
      }
      
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      const delay = (isIOS || isSafari) ? 3500 : 1000;
      
      elevenLabsRecognitionResumeTimeoutRef.current = setTimeout(() => {
        elevenLabsRecognitionResumeTimeoutRef.current = null;
        recognitionIntentionalStopRef.current = false;
        if (!recognitionRunningRef.current && sessionActiveRef.current) {
          startVoiceRecognition();
        }
      }, delay);
      
      // Restart idle timeout on fetch error
      startIdleTimeout();
    }
  }, [clearIdleTimeout, startIdleTimeout, startVoiceRecognition]);

  const startHeyGenSession = useCallback(async (activeAvatarId: string, options?: { skipGreeting?: boolean }) => {
    // Skip if audio-only
    if (audioOnlyRef.current) {
      return;
    }
    
    // ✅ CRITICAL: Prevent multiple sessions from starting
    if (avatarRef.current && heygenSessionActive) {
      console.log("⏭️ HeyGen session already active - skipping restart");
      return;
    }
    
    const skipGreeting = options?.skipGreeting ?? false;
    console.log(`Starting HeyGen session${skipGreeting ? ' (mode switch - no greeting)' : ' (fresh start)'}`);
    setIsLoading(true);
    
    try {
      const avatarConfigResponse = await fetch(`/api/avatar/config/${activeAvatarId}`);
      if (!avatarConfigResponse.ok) {
        throw new Error("Failed to fetch avatar configuration");
      }
      const avatarConfig = await avatarConfigResponse.json();

      // Detect if this avatar should use ElevenLabs voice in video mode
      // (has ElevenLabs voice configured but no HeyGen voice)
      console.log(`🔍 Avatar voice config check: heygenVoiceId="${avatarConfig.heygenVoiceId}", elevenlabsVoiceId="${avatarConfig.elevenlabsVoiceId}"`);
      useElevenLabsVoiceRef.current = !avatarConfig.heygenVoiceId && !!avatarConfig.elevenlabsVoiceId;
      console.log(`🎙️ useElevenLabsVoiceRef set to: ${useElevenLabsVoiceRef.current}`);
      if (useElevenLabsVoiceRef.current) {
        console.log(`🎙️ Avatar ${avatarConfig.name} will use ElevenLabs voice in video mode (no HeyGen voice configured)`);
      }

      const { token, sessionId } = await fetchAccessToken(activeAvatarId);
      // Only update sessionIdRef if we got a new one - during mode switching,
      // we already have a valid sessionId from startSession and the token endpoint
      // doesn't return one, so we'd overwrite with undefined
      if (sessionId) {
        sessionIdRef.current = sessionId;
      }
      const avatar = new StreamingAvatar({ token });
      avatarRef.current = avatar;

      avatar.on(StreamingEvents.STREAM_READY, async (event) => {
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
        
        // 🎤 Avatar speaks first with a personalized greeting (only for fresh starts, not mode switches)
        if (!skipGreeting) {
          try {
            const greetingResponse = await fetch(`/api/avatar/greeting/${activeAvatarId}`);
            if (greetingResponse.ok) {
              const { greeting } = await greetingResponse.json();
              if (greeting && avatar) {
                console.log("🗣️ Avatar greeting:", greeting);
                // Use ElevenLabs voice if avatar doesn't have HeyGen voice configured
                if (useElevenLabsVoiceRef.current) {
                  console.log("🎙️ Using ElevenLabs for greeting (video mode with ElevenLabs voice)");
                  await speakWithElevenLabsInVideoMode(greeting);
                } else {
                  await avatar.speak({
                    text: greeting,
                    taskType: TaskType.REPEAT,
                  });
                }
              }
            }
          } catch (error) {
            console.warn("Failed to fetch greeting:", error);
          }
        } else {
          console.log("⏭️ Skipping greeting - mode switch (seamless transition)");
          // For mode switches, ensure voice recognition starts immediately
          if (!recognitionRunningRef.current && !recognitionIntentionalStopRef.current && sessionActiveRef.current) {
            console.log("🎤 Starting voice recognition after seamless mode switch");
            startVoiceRecognition();
          }
        }
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
        
        console.log("🎤 Avatar stopped talking, will resume voice recognition in", delay, "ms");
        
        setTimeout(() => {
          // Skip if intentionally stopped or avatar started speaking again
          if (recognitionIntentionalStopRef.current || isSpeakingRef.current) {
            console.log("🎤 Skip resume: intentionalStop=", recognitionIntentionalStopRef.current, "isSpeaking=", isSpeakingRef.current);
            return;
          }
          
          // Skip if already running
          if (recognitionRunningRef.current) {
            console.log("🎤 Voice recognition already running");
            return;
          }
          
          // Use startVoiceRecognition for more robust handling (handles recreation)
          console.log("🔊 Resuming voice recognition (avatar finished speaking)");
          startVoiceRecognition();
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
      
      // HeyGen API requires a voice config to start the avatar session.
      // For avatars using ElevenLabs voice (no heygenVoiceId), we pass a fallback
      // voice ID just to satisfy HeyGen's requirements. The actual speaking will
      // be done via ElevenLabs through speakWithElevenLabsInVideoMode().
      const FALLBACK_HEYGEN_VOICE_ID = "ea54d3885c264ed4adbb45b71b1cab08"; // Generic HeyGen voice for session init
      
      avatarStartConfig.voice = {
        voiceId: avatarConfig.heygenVoiceId || FALLBACK_HEYGEN_VOICE_ID,
        rate: parseFloat(avatarConfig.voiceRate || "1.0"),
      };
      
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
  }, [heygenSessionActive, videoRef, startIdleTimeout, clearIdleTimeout, startVoiceRecognition]);

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
    
    // ✅ MOBILE FIX: Warm up microphone before starting voice recognition
    // Mobile browsers (especially iOS Safari) require an active audio stream
    // before Web Speech API will work properly
    const isMobile = /iPad|iPhone|iPod|Android|mobile/i.test(navigator.userAgent);
    if (isMobile) {
      try {
        console.log("📱 Mobile detected - warming up microphone...");
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Keep stream active briefly to "warm up" the microphone
        await new Promise(resolve => setTimeout(resolve, 300));
        // Stop tracks - we just needed to activate the microphone
        stream.getTracks().forEach(track => track.stop());
        console.log("📱 Microphone warmed up successfully");
      } catch (error) {
        console.warn("📱 Microphone warm-up failed:", error);
        // Continue anyway - voice recognition may still work
      }
    }
    
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
      
      // 🎤 Avatar speaks first with a personalized greeting (audio-only mode)
      try {
        const greetingResponse = await fetch(`/api/avatar/greeting/${activeAvatarId}`);
        if (greetingResponse.ok) {
          const { greeting } = await greetingResponse.json();
          if (greeting) {
            console.log("🗣️ Audio-only greeting:", greeting);
            
            // 🔇 Pause voice recognition while greeting plays to prevent feedback
            if (recognitionRef.current && recognitionRunningRef.current) {
              try {
                recognitionRef.current.stop();
                recognitionRunningRef.current = false;
                console.log("🔇 Voice recognition paused (greeting playing)");
              } catch (e) {
                recognitionRunningRef.current = false;
              }
            }
            
            // Use ElevenLabs TTS endpoint to speak the greeting
            const audioResponse = await fetch("/api/elevenlabs/tts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: greeting,
                avatarId: activeAvatarId,
                languageCode: elevenLabsLanguageCodeRef.current,
              }),
            });
            if (audioResponse.ok) {
              const audioBlob = await audioResponse.blob();
              const audioUrl = URL.createObjectURL(audioBlob);
              const audio = new Audio(audioUrl);
              
              // 🔇 CRITICAL: Set currentAudioRef to block voice recognition restart during playback
              currentAudioRef.current = audio;
              isSpeakingRef.current = true;
              setIsSpeakingState(true);
              
              // 🔊 Resume voice recognition after greeting ends
              audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
                currentAudioRef.current = null;
                isSpeakingRef.current = false;
                setIsSpeakingState(false);
                setTimeout(() => {
                  if (audioOnlyRef.current && !recognitionRunningRef.current && !recognitionIntentionalStopRef.current && sessionActiveRef.current) {
                    console.log("🔊 Voice recognition resumed (greeting finished)");
                    startVoiceRecognition();
                  }
                }, 500);
              };
              
              audio.onerror = () => {
                URL.revokeObjectURL(audioUrl);
                currentAudioRef.current = null;
                isSpeakingRef.current = false;
                setIsSpeakingState(false);
                // Still try to resume voice recognition on error
                setTimeout(() => {
                  if (audioOnlyRef.current && !recognitionRunningRef.current && !recognitionIntentionalStopRef.current && sessionActiveRef.current) {
                    console.log("🔊 Voice recognition resumed (greeting error)");
                    startVoiceRecognition();
                  }
                }, 500);
              };
              
              audio.play().catch((err) => {
                console.error("Failed to play greeting audio:", err);
                currentAudioRef.current = null;
                isSpeakingRef.current = false;
                setIsSpeakingState(false);
                // Resume voice recognition if play fails
                setTimeout(() => {
                  if (audioOnlyRef.current && !recognitionRunningRef.current && !recognitionIntentionalStopRef.current && sessionActiveRef.current) {
                    startVoiceRecognition();
                  }
                }, 500);
              });
            }
          }
        }
      } catch (error) {
        console.warn("Failed to play audio greeting:", error);
        // Resume voice recognition on any error
        setTimeout(() => {
          if (audioOnlyRef.current && !recognitionRunningRef.current && !recognitionIntentionalStopRef.current && sessionActiveRef.current) {
            startVoiceRecognition();
          }
        }, 500);
      }
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
  // This preserves conversation context and provides seamless transition
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
    
    // CRITICAL: Stop voice recognition IMMEDIATELY to prevent processing queued audio
    // This ensures no messages from the old mode leak into the new mode
    if (recognitionRef.current) {
      try {
        recognitionIntentionalStopRef.current = true;
        recognitionRunningRef.current = false;
        if (recognitionRestartTimeoutRef.current) {
          clearTimeout(recognitionRestartTimeoutRef.current);
          recognitionRestartTimeoutRef.current = null;
        }
        recognitionRef.current.stop();
        recognitionRef.current = null;
        console.log("🛑 Voice recognition stopped for seamless mode switch");
      } catch (e) {
        console.warn("Error stopping voice recognition during mode switch:", e);
        recognitionRef.current = null;
      }
    }
    setMicrophoneStatus('stopped');
    
    // CRITICAL: Cancel any pending API requests to prevent old responses in new mode
    if (abortControllerRef.current) {
      console.log("🛑 Cancelling pending API request for mode switch");
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // CRITICAL: Update mode ref FIRST so all guards work correctly
    const wasAudioOnly = audioOnlyRef.current;
    audioOnlyRef.current = newAudioOnly;
    
    // Stop any current audio playback first (thorough cleanup)
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        currentAudioRef.current.src = '';
        currentAudioRef.current.load(); // Force release audio resources
        currentAudioRef.current = null;
        isSpeakingRef.current = false;
        setIsSpeakingState(false);
        console.log("🛑 Stopped audio playback for mode switch");
      } catch (e) {
        console.warn("Error stopping audio:", e);
        currentAudioRef.current = null;
      }
    }
    
    // Also clear speaking state even if no audio ref (safety)
    isSpeakingRef.current = false;
    setIsSpeakingState(false);
    
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
        // Pass skipGreeting=true for seamless mode switch - conversation is already in progress
        await startHeyGenSession(currentAvatarIdRef.current, { skipGreeting: true });
        setIsLoading(false);
        console.log("✅ HeyGen started - seamless switch to video mode (no greeting, conversation continues)");
        
        // CRITICAL: Reset the intentional stop flag so voice recognition can restart
        // Voice recognition will be started by the STREAM_READY handler
        recognitionIntentionalStopRef.current = false;
        
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
    
    // For audio mode switch, reset flag and restart voice recognition
    if (newAudioOnly) {
      recognitionIntentionalStopRef.current = false;
      if (!recognitionRunningRef.current && sessionActiveRef.current) {
        console.log("🎤 Restarting voice recognition after audio mode switch");
        startVoiceRecognition();
      }
    }
  }, [videoRef, startHeyGenSession, clearIdleTimeout, startVoiceRecognition]);

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

      // Clear sentence queue immediately to stop avatar from speaking more
      sentenceQueueRef.current = [];
      isSpeakingQueueRef.current = false;
      console.log("🛑 Sentence queue cleared on pause");

      // Interrupt avatar speech immediately
      if (avatarRef.current) {
        try {
          await avatarRef.current.interrupt();
          console.log("🛑 Avatar speech interrupted on pause");
        } catch (e) {
          console.warn("Error interrupting avatar:", e);
        }
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

  const handleSubmitMessage = useCallback(async (message: string, imageData?: { base64: string; mimeType: string }) => {
    console.log("📝 handleSubmitMessage called with:", { message, sessionActive, heygenSessionActive, memoryEnabled: memoryEnabledRef.current, userId, hasImage: !!imageData });
    
    if (!message.trim() && !imageData) {
      console.warn("Empty message and no image, skipping");
      return;
    }

    // 🔇 CRITICAL: Set speaking flag FIRST to prevent recognition auto-restart race condition
    isSpeakingRef.current = true;
    setIsSpeakingState(true);
    
    // 🔇 Then stop voice recognition to prevent echo/feedback
    if (recognitionRef.current && recognitionRunningRef.current) {
      try {
        recognitionRef.current.stop();
        recognitionRunningRef.current = false;
        console.log("🔇 Voice recognition stopped (processing user message)");
      } catch (e) {
        recognitionRunningRef.current = false;
      }
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
    } else if (avatarRef.current) {
      // Video mode: Interrupt avatar if speaking
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
        console.log("🧠 Memory settings:", { memoryEnabled: memoryEnabledRef.current, userId });

        // Play instant acknowledgment while Claude processes (non-blocking)
        playAcknowledgmentInstantly().catch(() => {});

        try {
          const audioResponse = await fetch("/api/audio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message,
              userId: memoryEnabledRef.current ? userId : undefined,
              avatarId: currentAvatarIdRef.current,
              memoryEnabled: memoryEnabledRef.current, // Use ref for current value
              languageCode: elevenLabsLanguageCodeRef.current, // Pass language for TTS
              imageBase64: imageData?.base64,
              imageMimeType: imageData?.mimeType,
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
            // Log Claude response from header for frontend debugging
            const claudeResponse = audioResponse.headers.get("X-Claude-Response");
            const avatarName = audioResponse.headers.get("X-Avatar-Name");
            if (claudeResponse) {
              const decodedResponse = decodeURIComponent(claudeResponse);
              const decodedAvatarName = avatarName ? decodeURIComponent(avatarName) : "Avatar";
              console.log(`\n🎧 ═══════════════════════════════════════════════════════════════`);
              console.log(`🎧 AUDIO MODE - ${decodedAvatarName}`);
              console.log(`🎧 ═══════════════════════════════════════════════════════════════`);
              console.log(`📥 USER: "${message}"`);
              console.log(`📤 CLAUDE RESPONSE:`);
              console.log(`───────────────────────────────────────────────────────────────`);
              console.log(decodedResponse);
              console.log(`───────────────────────────────────────────────────────────────`);
              console.log(`📊 Response: ${decodedResponse.length} chars`);
              console.log(`🎧 ═══════════════════════════════════════════════════════════════\n`);
            }
            
            // Check for video generation headers and notify
            const isVideoGenerating = audioResponse.headers.get("X-Video-Generating") === "true";
            const videoRecordId = audioResponse.headers.get("X-Video-Record-Id");
            const videoTopic = audioResponse.headers.get("X-Video-Topic");
            
            if (isVideoGenerating && videoRecordId && onVideoGenerating) {
              const decodedTopic = videoTopic ? decodeURIComponent(videoTopic) : "your requested topic";
              console.log("🎬 Video generation started:", { videoRecordId, topic: decodedTopic });
              onVideoGenerating(decodedTopic, videoRecordId);
            }
            
            // CRITICAL: Check if we're still in audio mode before playing
            // User might have switched to video mode while waiting for response
            if (!audioOnlyRef.current) {
              console.log("🚫 Skipping audio playback - switched to video mode during fetch");
              isSpeakingRef.current = false;
              setIsSpeakingState(false);
              return;
            }
            
            // Stop acknowledgment audio before playing main response
            stopAcknowledgmentAudio();
            
            // Note: Voice recognition already stopped at start of handleSubmitMessage
            // and will be resumed after audio.onended
            
            const audioBlob = await audioResponse.blob();
            console.log(`🔊 Audio blob received: ${(audioBlob.size / 1024).toFixed(1)} KB, type: ${audioBlob.type}`);
            
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            currentAudioRef.current = audio;
            
            // Set volume to max and log audio properties
            audio.volume = 1.0;
            console.log(`🔊 Audio element created, volume: ${audio.volume}, muted: ${audio.muted}`);

            audio.onloadedmetadata = () => {
              console.log(`🔊 Audio metadata loaded: duration=${audio.duration.toFixed(2)}s, volume=${audio.volume}`);
            };

            audio.onended = () => {
              console.log(`🔊 Audio playback ENDED successfully`);
              isSpeakingRef.current = false;
              setIsSpeakingState(false);
              URL.revokeObjectURL(audioUrl);
              currentAudioRef.current = null;
              
              // 🔊 Resume voice recognition after audio ends (with 1s delay to prevent echo)
              // Increased from 500ms to allow any speaker echo to fully dissipate
              setTimeout(() => {
                if (audioOnlyRef.current && !recognitionRunningRef.current && !currentAudioRef.current) {
                  startVoiceRecognition();
                  console.log("🔊 Voice recognition resumed (audio-only mode - avatar finished)");
                }
              }, 1000);
            };

            audio.onerror = (e) => {
              console.error(`🔊 Audio playback ERROR:`, e, audio.error);
              isSpeakingRef.current = false;
              setIsSpeakingState(false);
              URL.revokeObjectURL(audioUrl);
              currentAudioRef.current = null;
              
              // Resume voice recognition on error too (with delay to prevent echo)
              setTimeout(() => {
                if (audioOnlyRef.current && !recognitionRunningRef.current && !currentAudioRef.current) {
                  startVoiceRecognition();
                }
              }, 1000);
            };

            // Final check before playing - mode might have changed during blob processing
            if (!audioOnlyRef.current) {
              console.log("🚫 Skipping audio playback - mode changed to video");
              URL.revokeObjectURL(audioUrl);
              currentAudioRef.current = null;
              isSpeakingRef.current = false;
              setIsSpeakingState(false);
              return;
            }

            try {
              await audio.play();
              console.log(`🔊 Audio playback STARTED - duration: ${audio.duration.toFixed(2)}s, currentTime: ${audio.currentTime}, paused: ${audio.paused}`);
            } catch (playError) {
              console.error(`🔊 Audio play() FAILED:`, playError);
            }
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
        // ⏱️ TIMING: Start full flow timer
        const flowStartTime = performance.now();
        console.log("⏱️ [TIMING] === FULL RESPONSE FLOW STARTED ===");
        
        // Video mode: Start HeyGen session ONLY on first message if not already started
        if (!heygenSessionActive && !avatarRef.current) {
          try {
            const heygenStartTime = performance.now();
            await startHeyGenSession(currentAvatarIdRef.current);
            console.log(`⏱️ [TIMING] HeyGen session start: ${(performance.now() - heygenStartTime).toFixed(0)}ms`);
          } catch (error) {
            console.error("Failed to start HeyGen session:", error);
          }
        }
        
        // ⏱️ TIMING: API call
        const apiStartTime = performance.now();
        console.log("⏱️ [TIMING] API call starting...");
        
        // Use streaming mode for faster perceived response
        if (streamingEnabledRef.current && avatarRef.current) {
          console.log("🚀 [STREAMING] Using streaming mode for faster response");
          
          let fullResponse = '';
          let firstSentenceTime = 0;
          let sentenceCount = 0;
          let streamingComplete = false;
          let performanceData: any = null;
          
          // Clear sentence queue for new message
          sentenceQueueRef.current = [];
          isSpeakingQueueRef.current = false;
          
          // Helper to speak all sentences sequentially - waits for each to complete
          const processSentenceQueue = async () => {
            while (sentenceQueueRef.current.length > 0 || !streamingComplete) {
              // Wait for more sentences if queue is empty but stream isn't complete
              if (sentenceQueueRef.current.length === 0) {
                await new Promise(resolve => setTimeout(resolve, 100));
                continue;
              }
              
              if (!avatarRef.current) break;
              
              const sentence = sentenceQueueRef.current.shift();
              if (sentence) {
                isSpeakingQueueRef.current = true;
                try {
                  // Use ElevenLabs voice if avatar doesn't have HeyGen voice configured
                  if (useElevenLabsVoiceRef.current) {
                    await speakWithElevenLabsInVideoMode(sentence);
                  } else {
                    // Wait for speak to complete before next sentence
                    await avatarRef.current.speak({
                      text: sentence,
                      task_type: TaskType.REPEAT,
                    });
                  }
                  // Small delay between sentences for natural pacing
                  await new Promise(resolve => setTimeout(resolve, 200));
                } catch (e) {
                  console.warn("Speak error:", e);
                }
                isSpeakingQueueRef.current = false;
              }
            }
            console.log("🚀 [STREAMING] Sentence queue fully processed");
          };
          
          // Start processing queue in background (runs concurrently with stream reading)
          const queueProcessor = processSentenceQueue();
          
          try {
            // Use fetch with streaming body for SSE
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            const memberstackId = getMemberstackId();
            if (memberstackId) {
              headers['X-Member-Id'] = memberstackId;
            }
            
            const response = await fetch("/api/avatar/response/stream", {
              method: "POST",
              headers,
              body: JSON.stringify({
                message,
                userId: memoryEnabledRef.current ? userId : undefined,
                avatarId: currentAvatarIdRef.current,
                memoryEnabled: memoryEnabledRef.current,
                languageCode: elevenLabsLanguageCodeRef.current,
                imageBase64: imageData?.base64,
                imageMimeType: imageData?.mimeType,
              }),
              signal: controller.signal,
            });
            
            if (!response.ok) {
              throw new Error(`Stream failed: ${response.status}`);
            }
            
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            
            if (reader) {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                
                for (let i = 0; i < lines.length; i++) {
                  const line = lines[i];
                  if (line.startsWith('event: ')) {
                    const eventType = line.slice(7);
                    // Look for data line right after event line
                    if (i + 1 < lines.length && lines[i + 1].startsWith('data: ')) {
                      try {
                        const data = JSON.parse(lines[i + 1].slice(6));
                        
                        if (eventType === 'sentence') {
                          sentenceCount++;
                          if (sentenceCount === 1) {
                            firstSentenceTime = performance.now();
                            console.log(`🚀 [STREAMING] First sentence ready: ${(firstSentenceTime - apiStartTime).toFixed(0)}ms`);
                          }
                          console.log(`🚀 [STREAMING] Sentence ${sentenceCount}: "${data.content.substring(0, 50)}..."`);
                          
                          // Queue sentence for speaking
                          sentenceQueueRef.current.push(data.content);
                        } else if (eventType === 'done') {
                          fullResponse = data.fullResponse;
                          performanceData = data.performance;
                          const totalTime = performance.now() - flowStartTime;
                          console.log(`🚀 [STREAMING] === STREAMING COMPLETE ===`);
                          console.log(`🚀 [STREAMING] Total sentences: ${sentenceCount}`);
                          console.log(`🚀 [STREAMING] First sentence delay: ${firstSentenceTime ? (firstSentenceTime - apiStartTime).toFixed(0) : 'N/A'}ms`);
                          console.log(`🚀 [STREAMING] Total time: ${totalTime.toFixed(0)}ms`);
                          if (performanceData) {
                            console.log(`🚀 [STREAMING] Backend breakdown:`, performanceData);
                          }
                          console.log(`📝 USER MESSAGE: ${message}`);
                          console.log(`🤖 CLAUDE RESPONSE: ${fullResponse}`);
                          console.log(`---`);
                          
                          // Check for video generation notification
                          if (data.videoGenerating && onVideoGenerating) {
                            const { videoRecordId, topic } = data.videoGenerating;
                            console.log(`🎬 [STREAMING] Video generation started: topic="${topic}", id=${videoRecordId}`);
                            onVideoGenerating(topic, videoRecordId);
                          }
                        } else if (eventType === 'timing') {
                          console.log(`⏱️ [TIMING] Data fetch: ${data.dataFetch}ms`);
                        }
                      } catch (e) {
                        // JSON parse error, skip
                      }
                    }
                  }
                }
              }
            }
            
            // Mark stream as complete so queue processor can finish
            streamingComplete = true;
            
            // Wait for all sentences to be spoken
            await queueProcessor;
            
            // Post-response cleanup (same as non-streaming)
            onResetInactivityTimer?.();
            clearIdleTimeout();
            
            // Clear and set speaking interval
            if (speakingIntervalRef.current) {
              clearInterval(speakingIntervalRef.current);
            }
            speakingIntervalRef.current = setInterval(() => {
              onResetInactivityTimer?.();
            }, 10000);
            
            setTimeout(() => {
              if (speakingIntervalRef.current) {
                clearInterval(speakingIntervalRef.current);
                speakingIntervalRef.current = null;
                onResetInactivityTimer?.();
              }
            }, 180000);
            
            console.log(`⏱️ [TIMING] === TOTAL FLOW TIME: ${(performance.now() - flowStartTime).toFixed(0)}ms ===`);
            
          } catch (streamError) {
            streamingComplete = true; // Ensure queue processor can exit
            if (streamError instanceof Error && streamError.name !== "AbortError") {
              console.error("Streaming error, falling back to non-streaming:", streamError);
              streamingEnabledRef.current = false;
            } else {
              throw streamError;
            }
          }
          
          // If streaming succeeded, we're done
          if (fullResponse) {
            return;
          }
        }
        
        // Non-streaming fallback
        const fallbackHeaders: Record<string, string> = { "Content-Type": "application/json" };
        const fallbackMemberstackId = getMemberstackId();
        if (fallbackMemberstackId) {
          fallbackHeaders['X-Member-Id'] = fallbackMemberstackId;
        }
        
        const response = await fetch("/api/avatar/response", {
          method: "POST",
          headers: fallbackHeaders,
          body: JSON.stringify({
            message,
            userId: memoryEnabledRef.current ? userId : undefined,
            avatarId: currentAvatarIdRef.current,
            memoryEnabled: memoryEnabledRef.current,
            languageCode: elevenLabsLanguageCodeRef.current,
          }),
          signal: controller.signal,
        });
        
        const apiEndTime = performance.now();
        console.log(`⏱️ [TIMING] API response received: ${(apiEndTime - apiStartTime).toFixed(0)}ms`);

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
        
        // ⏱️ Log backend performance breakdown
        if (data.performance) {
          console.log("⏱️ [TIMING] === BACKEND BREAKDOWN ===");
          console.log(`⏱️ [TIMING] ├─ Total backend: ${data.performance.totalMs}ms`);
          console.log(`⏱️ [TIMING] ├─ Data fetch (parallel): ${data.performance.dataFetchMs}ms`);
          if (data.performance.breakdown) {
            const b = data.performance.breakdown;
            if (b.memory) console.log(`⏱️ [TIMING] │  ├─ Memory (Mem0): ${b.memory}ms`);
            if (b.pubmed) console.log(`⏱️ [TIMING] │  ├─ PubMed: ${b.pubmed}ms`);
            if (b.wikipedia) console.log(`⏱️ [TIMING] │  ├─ Wikipedia: ${b.wikipedia}ms`);
            if (b.googleSearch) console.log(`⏱️ [TIMING] │  ├─ Google Search: ${b.googleSearch}ms`);
            if (b.knowledge) console.log(`⏱️ [TIMING] │  └─ Knowledge (Pinecone): ${b.knowledge}ms`);
          }
          console.log(`⏱️ [TIMING] └─ Claude AI: ${data.performance.claudeMs}ms`);
        }
        
        console.log("Claude response received:", claudeResponse.substring(0, 100) + "...");

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
          console.log("🗣️ SENDING TO HEYGEN - Text length:", claudeResponse.length, "characters");
          
          // ⏱️ TIMING: HeyGen speak call
          const speakStartTime = performance.now();
          console.log("⏱️ [TIMING] HeyGen speak() starting...");
          
          // Helper function to speak with retry on 401
          const speakWithRetry = async (retryCount = 0): Promise<void> => {
            try {
              if (!avatarRef.current) {
                throw new Error("Avatar not available");
              }
              
              // Use ElevenLabs voice if avatar doesn't have HeyGen voice configured
              if (useElevenLabsVoiceRef.current) {
                console.log("🎙️ Using ElevenLabs for response (video mode with ElevenLabs voice)");
                await speakWithElevenLabsInVideoMode(claudeResponse);
              } else {
                await avatarRef.current.speak({
                  text: claudeResponse,
                  task_type: TaskType.REPEAT, // ✅ CRITICAL: REPEAT = just speak our text, TALK = use HeyGen's AI
                });
              }
              
              const speakEndTime = performance.now();
              console.log(`⏱️ [TIMING] speak() completed: ${(speakEndTime - speakStartTime).toFixed(0)}ms`);
              console.log(`⏱️ [TIMING] === TOTAL FLOW TIME: ${(speakEndTime - flowStartTime).toFixed(0)}ms ===`);
              console.log("✅ Speak completed successfully");
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
  }, [sessionActive, heygenSessionActive, userId, onResetInactivityTimer, startHeyGenSession, clearIdleTimeout, endSessionShowReconnect, playAcknowledgmentInstantly, stopAcknowledgmentAudio, speakWithElevenLabsInVideoMode]);

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
    // Also stop ElevenLabs audio in video mode and handle recognition state
    if (elevenLabsVideoAudioRef.current) {
      try {
        elevenLabsVideoAudioRef.current.pause();
        elevenLabsVideoAudioRef.current = null;
        console.log("🛑 ElevenLabs video audio force stopped");
        
        // Cancel any pending recognition resume timeout
        if (elevenLabsRecognitionResumeTimeoutRef.current) {
          clearTimeout(elevenLabsRecognitionResumeTimeoutRef.current);
          elevenLabsRecognitionResumeTimeoutRef.current = null;
        }
        
        // Immediately reset recognition state and schedule resume
        // Use the same delayed resume logic to avoid echo
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        const delay = (isIOS || isSafari) ? 3500 : 1000;
        
        elevenLabsRecognitionResumeTimeoutRef.current = setTimeout(() => {
          elevenLabsRecognitionResumeTimeoutRef.current = null;
          recognitionIntentionalStopRef.current = false;
          if (!recognitionRunningRef.current && sessionActiveRef.current) {
            startVoiceRecognition();
            console.log("🎤 Voice recognition resumed after manual audio stop");
          }
        }, delay);
      } catch (e) {
        console.warn("Error force stopping ElevenLabs video audio:", e);
        elevenLabsVideoAudioRef.current = null;
      }
    }
    isSpeakingRef.current = false;
    setIsSpeakingState(false);
  }, [startVoiceRecognition]);

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

  // Manual voice start for mobile Safari (requires user gesture)
  const manualStartVoice = useCallback(() => {
    console.log("🎤 Manual voice start triggered (user gesture)");
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }
    recognitionRunningRef.current = false;
    recognitionIntentionalStopRef.current = false;
    startVoiceRecognition();
  }, [startVoiceRecognition]);

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
    manualStartVoice,
  };
}
