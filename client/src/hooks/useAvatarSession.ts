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
  const sessionActiveRef = useRef(false); // Track session active state for voice recognition

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

    // ✅ Initialize Web Speech API for voice input
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        console.warn("⚠️ Web Speech API not supported in this browser - use text input instead");
        setMicrophoneStatus('not-supported');
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false; // Only get final results
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1; // Only get best match
      
      recognition.onstart = () => {
        setMicrophoneStatus('listening');
        console.log("🎤 Microphone listening");
      };
      
      recognition.onresult = (event: any) => {
        // Only process final results (not interim)
        const result = event.results[event.results.length - 1];
        if (!result.isFinal) return;
        
        const transcript = result[0].transcript.trim();
        
        // Deduplicate (Web Speech can fire same result multiple times)
        if (transcript && transcript !== lastTranscriptRef.current) {
          lastTranscriptRef.current = transcript;
          console.log("🎤 Voice input (final):", transcript);
          
          // Only process if avatar isn't speaking
          if (!isSpeakingRef.current) {
            handleSubmitMessage(transcript);
          } else {
            console.log("⏭️ Ignoring voice input - avatar is speaking");
          }
        }
      };
      
      recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed') {
          console.error("🎤 Microphone permission denied - use text input instead");
          setMicrophoneStatus('permission-denied');
        } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.error("🎤 Speech recognition error:", event.error);
        }
      };
      
      recognition.onend = () => {
        // Auto-restart unless intentionally stopped or avatar is speaking
        // Use ref instead of state to get current value in closure
        if (!recognitionIntentionalStopRef.current && !isSpeakingRef.current && sessionActiveRef.current) {
          try {
            setMicrophoneStatus('listening'); // Set immediately to prevent UI flicker
            recognition.start();
            console.log("🔄 Voice recognition auto-restarted");
          } catch (e) {
            // Already running or permission denied
            setMicrophoneStatus('stopped');
          }
        } else {
          setMicrophoneStatus('stopped');
        }
      };
      
      recognitionRef.current = recognition;
      recognitionIntentionalStopRef.current = false;
      
      setMicrophoneStatus('listening'); // Set immediately before first start
      recognition.start();
      console.log("✅ Web Speech API started for voice input");
    } catch (error) {
      console.error("❌ Error initializing Web Speech API:", error);
      setMicrophoneStatus('not-supported');
    }
  }, []); // No dependencies needed - uses refs for current values

  const stopHeyGenSession = useCallback(async () => {
    if (!avatarRef.current || !heygenSessionActive) return;
    
    console.log("Stopping HeyGen session - keeping UI active");
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
      
      // End server session to actually save credits
      await endSessionOnServer();
      console.log("HeyGen session stopped - showing placeholder, credits saved");
    } catch (error) {
      console.error("Error stopping HeyGen session:", error);
    }
  }, [heygenSessionActive, videoRef, clearIdleTimeout]);

  const startIdleTimeout = useCallback(() => {
    clearIdleTimeout();
    
    // Only start idle timeout in video mode when not paused
    if (!audioOnlyRef.current && !isPaused) {
      idleTimeoutRef.current = setTimeout(() => {
        console.log("3min idle timeout - stopping HeyGen session to save credits");
        stopHeyGenSession();
      }, 180000); // 3 minutes - allows for longer avatar responses without disconnect
    }
  }, [isPaused, clearIdleTimeout, stopHeyGenSession]);

  const startHeyGenSession = useCallback(async (activeAvatarId: string) => {
    // Skip if audio-only or already loading
    if (audioOnlyRef.current || isLoading) {
      return;
    }
    
    // ✅ CRITICAL: Prevent multiple sessions from starting
    if (avatarRef.current && heygenSessionActive) {
      console.log("⏭️ HeyGen session already active - skipping restart");
      return;
    }
    
    // ✅ Prevent session start during loading
    if (isLoading) {
      console.log("⏭️ Session already loading - skipping restart");
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
      sessionIdRef.current = sessionId;
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
        
        // If disconnect was unintentional (network error, HeyGen issue), show reconnect button
        const wasUnintentional = !intentionalStopRef.current;
        
        intentionalStopRef.current = false;
        isSpeakingRef.current = false;
        avatarRef.current = null; // Clear ref immediately to allow restart
        setHeygenSessionActive(false);
        clearIdleTimeout();
        
        // Show reconnect button for unexpected disconnections
        if (wasUnintentional) {
          console.log("⚠️ Unexpected disconnect - showing reconnect button");
          setShowReconnect(true);
        }
      });

      avatar.on(StreamingEvents.AVATAR_START_TALKING, () => {
        isSpeakingRef.current = true;
        setIsSpeakingState(true);
        clearIdleTimeout();
        
        // 🎤 Pause voice recognition while avatar is speaking to prevent feedback loop
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
            console.log("🔇 Voice recognition paused (avatar speaking)");
          } catch (e) {
            // Ignore errors if already stopped
          }
        }
      });

      avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
        isSpeakingRef.current = false;
        setIsSpeakingState(false);
        // ✅ DON'T start idle timeout here - let the 5-minute inactivity timer handle session cleanup
        // This allows users to think, speak, or pause without premature disconnection
        
        // 🎤 Resume voice recognition after a brief delay to prevent echo
        // Delay allows audio to fully stop before listening again
        setTimeout(() => {
          if (recognitionRef.current && !recognitionIntentionalStopRef.current && !isSpeakingRef.current) {
            try {
              setMicrophoneStatus('listening'); // Set immediately to prevent UI flicker
              recognitionRef.current.start();
              console.log("🔊 Voice recognition resumed (avatar finished)");
            } catch (e) {
              // Ignore errors if already running
              console.warn("Could not resume voice recognition:", e);
              setMicrophoneStatus('stopped');
            }
          }
        }, 1000); // 1 second delay
      });

      // ❌ DISABLED: USER_TALKING_MESSAGE listener removed
      // This event only works with HeyGen's voice chat which causes echo loops
      // Voice input now handled by Web Speech API in the component

      await avatar.createStartAvatar({
        quality: AvatarQuality.High,
        avatarName: avatarConfig.heygenAvatarId,
        voice: avatarConfig.heygenVoiceId ? {
          voiceId: avatarConfig.heygenVoiceId,
          rate: parseFloat(avatarConfig.voiceRate || "1.0"),
        } : {
          rate: parseFloat(avatarConfig.voiceRate || "1.0"),
        },
        language: "en",
        disableIdleTimeout: true,
        // ❌ CRITICAL: Disable ALL HeyGen AI features - we use Claude instead
        knowledgeBase: undefined, // No knowledge base
        knowledgeId: undefined, // No knowledge ID
        useSilencePrompt: false, // Don't auto-respond to silence
        enablePushToTalk: false, // Disable push-to-talk mode
      });

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
      } catch (error) {
        console.error("Error starting HeyGen in video mode:", error);
        setIsLoading(false);
        throw error;
      }
    } else {
      // Audio mode: HeyGen will start on first message (lazy loading)
      setIsLoading(false);
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
  ]);

  const endSessionShowReconnect = useCallback(async () => {
    if (abortControllerRef.current) {
      console.log("Cancelling ongoing API request");
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Stop speech recognition - set flag FIRST to prevent auto-restart  
    recognitionIntentionalStopRef.current = true;
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
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
      console.log("Audio playback stopped");
    }

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
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }

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
    try {
      await startSession({ audioOnly: audioOnlyRef.current });
    } catch (error) {
      console.error("Error reconnecting:", error);
      setShowReconnect(true);
      throw error; // Re-throw so component can show toast
    }
  }, [startSession]);

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
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
        console.log("Audio playback stopped on pause");
      }

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

        // Video mode: Use HeyGen avatar
        if (avatarRef.current) {
          // ✅ Avatar speaks Claude's response
          // Note: Voice recognition will be paused by AVATAR_START_TALKING event
          console.log("🗣️ SENDING TO HEYGEN - Full Claude response:");
          console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
          console.log(claudeResponse);
          console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
          console.log("Text length:", claudeResponse.length, "characters");
          
          await avatarRef.current.speak({
            text: claudeResponse,
            task_type: TaskType.REPEAT, // ✅ CRITICAL: REPEAT = just speak our text, TALK = use HeyGen's AI
          });
          
          console.log("✅ HeyGen speak() called with REPEAT mode (no HeyGen AI)");
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
      }
    } finally {
      // Clear abort controller only if it's still the one we created
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [sessionActive, heygenSessionActive, memoryEnabled, userId, onResetInactivityTimer, startHeyGenSession, clearIdleTimeout]);

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
  };
}
