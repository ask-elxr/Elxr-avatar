import { useState, useRef, useCallback, useEffect } from "react";
import { SessionDriver, LiveAvatarDriver, HeyGenStreamingDriver, AudioOnlyDriver } from "./sessionDrivers";
import { getMemberstackId, buildAuthenticatedWsUrl, getAuthHeaders } from "@/lib/queryClient";
import { unlockMobileAudio, getSharedAudioElement, stopSharedAudio, isAudioUnlocked, ensureAudioUnlocked, ensureAudioContextResumed, playAudioBlob, createFreshAudioElement, incrementSessionToken, getCurrentSessionToken, getGlobalVolume, registerMediaElement, unregisterMediaElement } from "@/lib/mobileAudio";
import { requestMicrophoneOnce, isMicPermissionGranted } from "@/lib/microphoneCache";
import { useConversationWs } from "./useConversationWs";

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
  skipServerRegistration?: boolean; // Safari iOS workaround - worker already registered
}

interface AvatarSessionReturn {
  sessionActive: boolean;
  heygenSessionActive: boolean;
  isLoading: boolean;
  showReconnect: boolean;
  videoReady: boolean; // True when LiveKit video track is attached and playing
  startSession: (options?: StartSessionOptions) => Promise<void>;
  endSession: () => Promise<void>;
  endSessionShowReconnect: () => Promise<void>;
  reconnect: () => Promise<void>;
  togglePause: () => Promise<void>;
  switchTransportMode: (toVideoMode: boolean) => Promise<void>;
  isPaused: boolean;
  isSpeaking: boolean;
  microphoneStatus: 'listening' | 'stopped' | 'not-supported' | 'permission-denied' | 'needs-gesture';
  sessionDriverRef: React.MutableRefObject<SessionDriver | null>;
  intentionalStopRef: React.MutableRefObject<boolean>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  currentRequestIdRef: React.MutableRefObject<string>;
  speakingIntervalRef: React.MutableRefObject<NodeJS.Timeout | null>;
  hasAskedAnythingElseRef: React.MutableRefObject<boolean>;
  handleSubmitMessage: (message: string, imageData?: { base64: string; mimeType: string }) => Promise<void>;
  stopAudio: () => void;
  manualStartVoice: () => void;
  isMicMuted: boolean;
  toggleMicMute: () => void;
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
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [videoReady, setVideoReady] = useState(false); // Track when LiveKit video track is attached

  const sessionDriverRef = useRef<SessionDriver | null>(null);
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
  const liveAvatarSessionTokenRef = useRef<string | null>(null); // LiveAvatar session token for proper cleanup
  const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null); // Web Speech API for voice input
  const isMicMutedRef = useRef(false);
  const lastTranscriptRef = useRef<string>(""); // For deduplication
  const lastAvatarResponseRef = useRef<string>(""); // For echo detection - track what avatar last said
  const lastAvatarResponseTimeRef = useRef<number>(0); // When avatar spoke (for echo detection window)
  const bargeInDebounceRef = useRef<NodeJS.Timeout | null>(null); // Debounce timer for barge-in on partials
  const performBargeInRef = useRef<((reason: string) => void) | null>(null); // Ref bridge for barge-in from conversation WS
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
  const streamingEnabledRef = useRef(true); // Enable audio streaming mode - faster first-response latency
  const sentenceQueueRef = useRef<string[]>([]); // Queue of sentences to speak
  const isSpeakingQueueRef = useRef(false); // Whether we're currently processing the speak queue
  const sessionTokenRef = useRef<number>(getCurrentSessionToken()); // Track current session for audio gating
  const useElevenLabsVoiceRef = useRef(false); // Use ElevenLabs voice in video mode for avatars without HeyGen voice
  const elevenLabsVideoAudioRef = useRef<HTMLAudioElement | null>(null); // Audio element for ElevenLabs in video mode
  const elevenLabsRecognitionResumeTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Pending recognition resume timer for ElevenLabs
  const MAX_AUTO_RECONNECT_ATTEMPTS = 3; // Max auto-reconnect before showing manual button
  const MIN_RESTART_INTERVAL_MS = 2000; // Minimum 2 seconds between recognition restarts
  
  // ElevenLabs STT refs for mobile voice input (Web Speech API doesn't work reliably on mobile)
  const elevenLabsSttWsRef = useRef<WebSocket | null>(null);
  const elevenLabsSttReadyRef = useRef(false);
  const elevenLabsSttAudioContextRef = useRef<AudioContext | null>(null);
  const elevenLabsSttProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const elevenLabsSttStreamRef = useRef<MediaStream | null>(null);
  const useElevenLabsSttRef = useRef(false); // Track if we're using ElevenLabs STT instead of Web Speech API
  const usingHeygenMobileVoiceChatRef = useRef(false); // Track if we're using HeyGen's built-in voice chat (LiveKit WebRTC) for mobile
  const pendingLanguageUpdateRef = useRef<string | null>(null); // Queue language updates when STT is reconnecting
  const useConversationWsModeRef = useRef(false); // Track if using unified conversation WS (STT+Claude+TTS in one pipe)

  const conversationWs = useConversationWs({
    avatarId: selectedAvatarId || 'default',
    userId,
    memoryEnabled,
    languageCode: elevenLabsLanguageCode,
    sampleRate: 16000,
    get playLocalAudio() { return audioOnlyRef.current; },
    onTranscriptPartial: (text) => {
      if (conversationWsBargeInEnabled()) {
        if (!bargeInDebounceRef.current && text.length >= 2) {
          bargeInDebounceRef.current = setTimeout(() => {
            bargeInDebounceRef.current = null;
            if (isSpeakingRef.current && performBargeInRef.current) {
              performBargeInRef.current(`conversation WS partial: "${text.substring(0, 30)}"`);
            }
          }, 150);
        }
      }
    },
    onTranscriptFinal: (text) => {
      if (bargeInDebounceRef.current) {
        clearTimeout(bargeInDebounceRef.current);
        bargeInDebounceRef.current = null;
      }
      if (isSpeakingRef.current && performBargeInRef.current) {
        performBargeInRef.current(`conversation WS final: "${text.substring(0, 30)}"`);
      }
      lastTranscriptRef.current = text;
    },
    onTurnStart: (_turnId) => {
      onResetInactivityTimer?.();
      const driver = sessionDriverRef.current;
      if (driver && !audioOnlyRef.current && driver.startStreamingAudio) {
        driver.startStreamingAudio();
      }
    },
    onTurnEnd: (_turnId) => {
      const driver = sessionDriverRef.current;
      if (driver && !audioOnlyRef.current && driver.endStreamingAudio) {
        driver.endStreamingAudio();
      }
    },
    onAudioChunk: (pcmBytes, _turnId) => {
      const driver = sessionDriverRef.current;
      if (driver && !audioOnlyRef.current && driver.addAudioChunk) {
        let binary = '';
        for (let i = 0; i < pcmBytes.length; i++) {
          binary += String.fromCharCode(pcmBytes[i]);
        }
        driver.addAudioChunk(btoa(binary));
      }
    },
    onAudioStop: (_turnId) => {
      const driver = sessionDriverRef.current;
      if (driver && !audioOnlyRef.current) {
        if (driver.endStreamingAudio) {
          driver.endStreamingAudio();
        }
        driver.interrupt().catch(() => {});
      }
      isSpeakingRef.current = false;
      setIsSpeakingState(false);
    },
    onSpeakingChange: (speaking) => {
      isSpeakingRef.current = speaking;
      setIsSpeakingState(speaking);
      onResetInactivityTimer?.();
    },
    onNudge: (text) => {
      console.log('[mum nudge]', text);
    },
    onSoftEnd: (text) => {
      console.log('[mum soft end]', text);
    },
    onError: (err) => {
      console.error('Conversation WS error:', err);
    },
  });

  const conversationWsBargeInEnabled = useCallback(() => {
    return useConversationWsModeRef.current && isSpeakingRef.current;
  }, []);

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
    
    // Update session driver language if active (for TTS)
    if (sessionDriverRef.current?.setLanguage && sessionActiveRef.current) {
      console.log(`🌐 Updating session driver language to: ${elevenLabsLanguageCode}`);
      sessionDriverRef.current.setLanguage(elevenLabsLanguageCode);
    }
    
    // Update ElevenLabs STT language if active during a session
    // Always track pending language until server confirms (handles race conditions during reconnect)
    if (elevenLabsSttWsRef.current?.readyState === WebSocket.OPEN && sessionActiveRef.current) {
      // Always set pending - will be cleared only when server confirms with language_updated
      pendingLanguageUpdateRef.current = elevenLabsLanguageCode;
      
      if (elevenLabsSttReadyRef.current) {
        // STT is ready, send update immediately
        console.log(`🌐 Sending language update to ElevenLabs STT: ${elevenLabsLanguageCode}`);
        elevenLabsSttWsRef.current.send(JSON.stringify({
          type: 'update_language',
          languageCode: elevenLabsLanguageCode,
        }));
      } else {
        // STT is reconnecting, pending update will be replayed on stt_ready
        console.log(`🌐 Queuing language update (STT reconnecting): ${elevenLabsLanguageCode}`);
      }
    }
  }, [elevenLabsLanguageCode]);

  // Safari iOS workaround: The browser suspends JavaScript during startup
  // Track loading start time to detect stuck states
  const loadingStartTimeRef = useRef<number | null>(null);
  const safariKeepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // When loading starts, track time and start a keepalive for Safari
  useEffect(() => {
    if (isLoading) {
      loadingStartTimeRef.current = Date.now();
      document.title = "Loading...";
      console.log("📱 Safari keepalive: Loading started");
      
      // Safari workaround: Use requestAnimationFrame loop to keep JS thread alive
      // This prevents Safari from suspending fetch() during startup
      let keepaliveFrame: number | null = null;
      const keepalive = () => {
        if (loadingStartTimeRef.current) {
          const elapsed = Date.now() - loadingStartTimeRef.current;
          // Update title with elapsed time for debugging
          document.title = `Loading (${Math.floor(elapsed / 1000)}s)...`;
        }
        keepaliveFrame = requestAnimationFrame(keepalive);
      };
      keepaliveFrame = requestAnimationFrame(keepalive);
      
      return () => {
        if (keepaliveFrame) {
          cancelAnimationFrame(keepaliveFrame);
        }
        loadingStartTimeRef.current = null;
      };
    } else {
      loadingStartTimeRef.current = null;
      if (sessionActive) {
        document.title = "Chat Active";
      }
    }
  }, [isLoading, sessionActive]);

  // Handle tab visibility changes - pause session when hidden, resume when visible
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden' && sessionActiveRef.current) {
        // Tab became hidden - stop the avatar session to release resources
        console.log("📱 Tab became hidden - stopping avatar session to release resources...");
        
        // Stop the HeyGen session to release camera/mic
        if (sessionDriverRef.current && !audioOnlyRef.current) {
          try {
            intentionalStopRef.current = true;
            // Capture LiveAvatar session token before stopping (for proper cleanup)
            const token = sessionDriverRef.current.getLiveAvatarSessionToken?.();
            if (token) {
              liveAvatarSessionTokenRef.current = token;
              console.log("📵 Captured LiveAvatar token for cleanup (tab hidden)");
            }
            await sessionDriverRef.current.stop();
            sessionDriverRef.current = null;
            setHeygenSessionActive(false);
            console.log("✅ Avatar session stopped (tab hidden)");
          } catch (err) {
            console.error("❌ Failed to stop avatar session:", err);
          }
        }
        
        // Stop voice recognition
        if (recognitionRef.current) {
          try {
            recognitionIntentionalStopRef.current = true;
            recognitionRunningRef.current = false;
            recognitionRef.current.stop();
            console.log("✅ Voice recognition stopped (tab hidden)");
          } catch (err) {
            // Ignore
          }
        }
        
        // Pause any playing audio
        if (currentAudioRef.current && !currentAudioRef.current.paused) {
          currentAudioRef.current.pause();
          console.log("✅ Audio paused (tab hidden)");
        }
        
      } else if (document.visibilityState === 'visible' && sessionActiveRef.current) {
        console.log("📱 Tab became visible - resuming audio contexts...");
        
        // Resume ElevenLabs STT AudioContext if exists
        if (elevenLabsSttAudioContextRef.current?.state === 'suspended') {
          try {
            await elevenLabsSttAudioContextRef.current.resume();
            console.log("✅ ElevenLabs STT AudioContext resumed");
          } catch (err) {
            console.error("❌ Failed to resume ElevenLabs STT AudioContext:", err);
          }
        }
        
        // Resume any playing audio elements
        if (currentAudioRef.current?.paused && !currentAudioRef.current.ended) {
          try {
            await currentAudioRef.current.play();
            console.log("✅ Current audio resumed");
          } catch (err) {
            console.error("❌ Failed to resume current audio:", err);
          }
        }
        
        // Restart voice recognition if it stopped while tab was hidden
        if (!recognitionRunningRef.current && !isSpeakingRef.current && !isPaused) {
          console.log("🎤 Restarting voice recognition after tab visibility change");
          // Small delay to let audio system stabilize
          setTimeout(() => {
            if (sessionActiveRef.current && !recognitionRunningRef.current && !isSpeakingRef.current) {
              startVoiceRecognition();
            }
          }, 500);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPaused]);

  const fetchAccessToken = async (avatarId: string): Promise<{ token: string; sessionId: string }> => {
    const response = await fetch("/api/heygen/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      credentials: "include",
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
        // Send LiveAvatar session token if we have one (for proper cleanup)
        const payload: { sessionId: string; liveAvatarSessionToken?: string } = {
          sessionId: sessionIdRef.current,
        };
        if (liveAvatarSessionTokenRef.current) {
          payload.liveAvatarSessionToken = liveAvatarSessionTokenRef.current;
          console.log("📵 Sending LiveAvatar session token for cleanup");
        }
        
        await fetch("/api/session/end", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify(payload),
        });
        sessionIdRef.current = null;
        liveAvatarSessionTokenRef.current = null;
      } catch (error) {
        console.error("Failed to end session on server:", error);
      }
    }
  };

  // 🔇 CRITICAL: Centralized cancellation of all pending audio/requests
  // Called from endSession, handleAvatarSwitch, and any path that needs clean slate
  const cancelPendingWork = useCallback(() => {
    console.log("🔇 cancelPendingWork: Cancelling all pending audio and requests");
    
    // 1. Abort any in-flight API requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // 2. Increment session token to invalidate all pending audio playback
    const newToken = incrementSessionToken();
    sessionTokenRef.current = newToken;
    
    // 3. Clear request ID to invalidate responses for old requests
    currentRequestIdRef.current = "";
    
    // 4. Clear sentence queue to prevent queued speech from playing
    sentenceQueueRef.current = [];
    isSpeakingQueueRef.current = false;
    
    // 5. Stop any currently playing audio
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      if (currentAudioRef.current.src?.startsWith('blob:')) {
        URL.revokeObjectURL(currentAudioRef.current.src);
      }
      currentAudioRef.current = null;
    }
    stopSharedAudio();
    
    // 6. Clear barge-in debounce
    if (bargeInDebounceRef.current) {
      clearTimeout(bargeInDebounceRef.current);
      bargeInDebounceRef.current = null;
    }
    
    // 7. Stop acknowledgment audio
    if (currentAcknowledgmentRef.current) {
      currentAcknowledgmentRef.current.pause();
      currentAcknowledgmentRef.current = null;
    }
    
    // 7. Stop ElevenLabs video mode audio
    if (elevenLabsVideoAudioRef.current) {
      elevenLabsVideoAudioRef.current.pause();
      elevenLabsVideoAudioRef.current = null;
    }
    
    isSpeakingRef.current = false;
    setIsSpeakingState(false);
    
    console.log("🔇 cancelPendingWork: All pending work cancelled, token:", newToken);
  }, []);

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
        
        // Register for real-time volume updates
        registerMediaElement(audio);
        
        audio.preload = "auto";
        audio.volume = getGlobalVolume() * 0.8; // Use global volume with 80% multiplier for acknowledgment
        // Mobile-specific: Add attributes for iOS/Android compatibility
        audio.setAttribute('playsinline', 'true');
        audio.setAttribute('webkit-playsinline', 'true');
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
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
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
        
        // Register for real-time volume updates
        registerMediaElement(audio);
        
        audio.volume = getGlobalVolume() * 0.8; // Use global volume with 80% multiplier for acknowledgment
        // Mobile-specific: Add attributes for iOS/Android compatibility
        audio.setAttribute('playsinline', 'true');
        audio.setAttribute('webkit-playsinline', 'true');
        audio.preload = 'auto';
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          unregisterMediaElement(audio);
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

  // Stop ElevenLabs STT and cleanup resources
  const stopElevenLabsSTT = useCallback(() => {
    console.log("🎤 Stopping ElevenLabs STT...");
    
    if (elevenLabsSttProcessorRef.current) {
      elevenLabsSttProcessorRef.current.disconnect();
      elevenLabsSttProcessorRef.current = null;
    }
    
    if (elevenLabsSttAudioContextRef.current) {
      elevenLabsSttAudioContextRef.current.close().catch(() => {});
      elevenLabsSttAudioContextRef.current = null;
    }
    
    if (elevenLabsSttStreamRef.current) {
      elevenLabsSttStreamRef.current.getTracks().forEach(track => track.stop());
      elevenLabsSttStreamRef.current = null;
    }
    
    if (elevenLabsSttWsRef.current?.readyState === WebSocket.OPEN) {
      elevenLabsSttWsRef.current.send(JSON.stringify({ type: 'stop' }));
      elevenLabsSttWsRef.current.close();
    }
    elevenLabsSttWsRef.current = null;
    elevenLabsSttReadyRef.current = false;
    
    if (useElevenLabsSttRef.current) {
      recognitionRunningRef.current = false;
      setMicrophoneStatus('stopped');
    }
  }, []);

  // Connect pre-acquired microphone stream to WebSocket (called after stt_ready)
  // 📱 IMPORTANT: Must be defined BEFORE startElevenLabsSTT which references it
  const toggleMicMute = useCallback(() => {
    const newMuted = !isMicMutedRef.current;
    isMicMutedRef.current = newMuted;
    setIsMicMuted(newMuted);
    console.log(newMuted ? "🔇 Microphone muted" : "🔊 Microphone unmuted");
  }, []);

  const connectMicToWebSocket = useCallback(() => {
    const stream = elevenLabsSttStreamRef.current;
    const audioContext = elevenLabsSttAudioContextRef.current;
    
    if (!stream || !audioContext) {
      console.error("🎤 Cannot connect mic - stream or audioContext missing");
      return;
    }
    
    try {
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      elevenLabsSttProcessorRef.current = processor;
      
      const NOISE_GATE_THRESHOLD = 0.008;
      const HANGOVER_FRAMES = 8;
      let hangoverCounter = 0;
      
      processor.onaudioprocess = (e) => {
        if (elevenLabsSttWsRef.current?.readyState !== WebSocket.OPEN || !elevenLabsSttReadyRef.current) {
          return;
        }
        
        if (isMicMutedRef.current) {
          const silence = new Int16Array(e.inputBuffer.length);
          elevenLabsSttWsRef.current.send(silence.buffer);
          return;
        }
        
        const inputData = e.inputBuffer.getChannelData(0);
        
        let sumSquares = 0;
        for (let i = 0; i < inputData.length; i++) {
          sumSquares += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sumSquares / inputData.length);
        
        if (rms >= NOISE_GATE_THRESHOLD) {
          hangoverCounter = HANGOVER_FRAMES;
        } else {
          hangoverCounter = Math.max(0, hangoverCounter - 1);
        }
        
        if (hangoverCounter === 0) {
          const silence = new Int16Array(inputData.length);
          elevenLabsSttWsRef.current.send(silence.buffer);
          return;
        }
        
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcm16[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
        }
        elevenLabsSttWsRef.current.send(pcm16.buffer);
      };
      
      source.connect(processor);
      processor.connect(audioContext.destination);
      
      recognitionRunningRef.current = true;
      console.log("🎤 Audio pipeline connected to WebSocket with noise gate, AudioContext state:", audioContext.state);
    } catch (error) {
      console.error("🎤 Failed to connect audio pipeline:", error);
    }
  }, []);

  // Hard-stop audio + abort fetch in one call (barge-in helper)
  const performBargeIn = useCallback((reason: string) => {
    console.log(`🛑 BARGE-IN: ${reason}`);
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        if (currentAudioRef.current.src?.startsWith('blob:')) {
          URL.revokeObjectURL(currentAudioRef.current.src);
        }
        currentAudioRef.current.src = '';
        currentAudioRef.current = null;
      } catch (e) {
        currentAudioRef.current = null;
      }
    }
    // Stop conversation WS audio pipeline (Web Audio source nodes)
    conversationWs.hardStopAudio();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (sessionDriverRef.current && !audioOnlyRef.current) {
      sessionDriverRef.current.interrupt().catch(() => {});
    }
    isSpeakingRef.current = false;
    setIsSpeakingState(false);
  }, [conversationWs]);

  // Keep ref in sync so conversation WS callbacks can trigger barge-in
  performBargeInRef.current = performBargeIn;

  // Handle ElevenLabs STT transcript (same flow as Web Speech API)
  const handleElevenLabsSttTranscript = useCallback((transcript: string | undefined | null, isFinal: boolean) => {
    // PARTIAL TRANSCRIPT BARGE-IN: Interrupt audio as soon as real speech is detected
    if (!isFinal) {
      const partialText = (transcript || '').trim();
      const hasActiveAudio = currentAudioRef.current && !currentAudioRef.current.paused;
      const hasActiveDriver = sessionDriverRef.current && !audioOnlyRef.current;
      const assistantSpeaking = hasActiveAudio || hasActiveDriver || isSpeakingRef.current;
      if (assistantSpeaking && partialText.length >= 2) {
        if (!bargeInDebounceRef.current) {
          bargeInDebounceRef.current = setTimeout(() => {
            bargeInDebounceRef.current = null;
            const stillPlaying = (currentAudioRef.current && !currentAudioRef.current.paused) || isSpeakingRef.current;
            if (stillPlaying) {
              performBargeIn(`partial speech detected: "${partialText.substring(0, 30)}"`);
            }
          }, 150);
        }
      }
      return;
    }
    
    // Final transcript: if barge-in debounce pending, fire it immediately
    if (bargeInDebounceRef.current) {
      clearTimeout(bargeInDebounceRef.current);
      bargeInDebounceRef.current = null;
      const stillPlaying = (currentAudioRef.current && !currentAudioRef.current.paused) || isSpeakingRef.current;
      if (stillPlaying) {
        performBargeIn(`debounce flushed by final transcript`);
      }
    }
    
    // Guard against undefined/null transcript
    if (transcript == null) {
      console.log("🎤 ElevenLabs STT received null/undefined transcript, ignoring");
      return;
    }
    
    const trimmedTranscript = transcript.trim();
    if (!trimmedTranscript) return;
    
    // INTERRUPTION MODE: If audio is playing, treat user speech as interruption request
    // Don't block - instead stop the current audio and process the new message
    if (audioOnlyRef.current && currentAudioRef.current) {
      // Normalize function: remove punctuation, collapse whitespace, lowercase
      const normalize = (text: string) => text.toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .replace(/\s+/g, ' ')    // Collapse whitespace
        .trim();
      
      const normalizedTranscript = normalize(trimmedTranscript);
      
      // Always allow common interrupt words regardless of echo matching
      const alwaysAllow = ['stop', 'wait', 'no', 'hey', 'hold on', 'actually', 'excuse me', 'pause'];
      const isInterruptWord = alwaysAllow.some(w => normalizedTranscript === w || normalizedTranscript.startsWith(w + ' '));
      
      // Echo detection: Only block very short phrases that exactly match avatar speech
      // Keep window short (5s) and threshold tight (< 15 chars) to avoid blocking real interruptions
      const timeSinceAvatarSpoke = Date.now() - lastAvatarResponseTimeRef.current;
      if (!isInterruptWord && timeSinceAvatarSpoke < 5000 && lastAvatarResponseRef.current && normalizedTranscript.length < 15) {
        const normalizedAvatar = normalize(lastAvatarResponseRef.current);
        if (normalizedAvatar.includes(normalizedTranscript)) {
          console.log("🔇 ECHO during playback (ignored):", trimmedTranscript.substring(0, 30));
          return;
        }
      }
      
      // NOT an echo - this is a real interruption!
      performBargeIn(`final transcript interruption: "${trimmedTranscript.substring(0, 30)}"`);
      // Fall through to process the new message as an interruption
    }
    
    if (isSpeakingRef.current && !audioOnlyRef.current) {
      if (!sessionDriverRef.current) {
        console.log("🔇 ECHO BLOCKED (ElevenLabs STT): Ignoring while avatar speaking:", trimmedTranscript.substring(0, 50));
        return;
      }
    }
    
    // Post-playback echo detection: Only block very short echoes within a tight window
    const postPlaybackTimeSince = Date.now() - lastAvatarResponseTimeRef.current;
    if (postPlaybackTimeSince < 3000 && lastAvatarResponseRef.current) {
      const normalizeText = (text: string) => text.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      const normalizedAvatarResponse = normalizeText(lastAvatarResponseRef.current);
      const normalizedTranscriptText = normalizeText(trimmedTranscript);
      
      if (normalizedAvatarResponse.includes(normalizedTranscriptText) && normalizedTranscriptText.length < 15) {
        console.log("🔇 ECHO DETECTED (post-playback):", trimmedTranscript.substring(0, 50));
        return;
      }
    }
    
    // Deduplicate
    if (trimmedTranscript === lastTranscriptRef.current) return;
    lastTranscriptRef.current = trimmedTranscript;
    
    console.log("🎤 ElevenLabs STT voice input (final):", trimmedTranscript);
    
    // Interrupt if speaking (audio or video mode)
    if (isSpeakingRef.current) {
      performBargeIn(`final transcript: "${trimmedTranscript.substring(0, 30)}"`);
    }
    
    // Submit the message
    handleSubmitMessageRef.current?.(trimmedTranscript);
  }, [performBargeIn]);

  // Start ElevenLabs STT for mobile devices
  // 📱 CRITICAL iOS FIX: Request microphone FIRST (within user gesture context)
  // before any async operations that would break the gesture chain
  const startElevenLabsSTT = useCallback(async () => {
    // More robust check - ensure WebSocket is truly open AND ready AND we have ACTIVELY working audio capture
    const wsOpen = elevenLabsSttWsRef.current?.readyState === WebSocket.OPEN;
    const sttReady = elevenLabsSttReadyRef.current;
    const hasAudioProcessor = elevenLabsSttProcessorRef.current !== null;
    const hasAudioStream = elevenLabsSttStreamRef.current !== null;
    
    // Additional checks: AudioContext must be running AND media track must be live
    const audioContextRunning = elevenLabsSttAudioContextRef.current?.state === 'running';
    const mediaTrackLive = elevenLabsSttStreamRef.current?.getAudioTracks().some(track => track.readyState === 'live') ?? false;
    
    console.log("🎤 ElevenLabs STT state check:", { 
      wsOpen, 
      sttReady, 
      hasAudioProcessor, 
      hasAudioStream, 
      audioContextRunning,
      mediaTrackLive 
    });
    
    // Only skip if ALL components are truly active AND working
    if (wsOpen && sttReady && hasAudioProcessor && hasAudioStream && audioContextRunning && mediaTrackLive) {
      console.log("⏭️ ElevenLabs STT already active (verified all components including live audio)");
      return;
    }
    
    // If some components exist but audio isn't actually flowing, clean up and restart
    if (wsOpen || hasAudioProcessor || hasAudioStream) {
      console.log("⚠️ ElevenLabs STT in incomplete/stale state - cleaning up and restarting");
    }
    
    useElevenLabsSttRef.current = true;
    
    // 📱 Check if we can reuse existing mic stream (important for post-greeting restart)
    // If mic is already granted, don't request again (we may not be in user gesture context)
    let micStream: MediaStream | null = elevenLabsSttStreamRef.current;
    let audioContext: AudioContext | null = elevenLabsSttAudioContextRef.current;
    const existingMicValid = micStream?.getAudioTracks().some(t => t.readyState === 'live') ?? false;
    const existingAudioContextValid = audioContext && audioContext.state !== 'closed';
    
    if (existingMicValid && existingAudioContextValid) {
      console.log("🎤 Reusing existing mic stream and AudioContext");
      
      // Cleanup old WebSocket and processor (but keep mic stream and AudioContext)
      if (elevenLabsSttProcessorRef.current) {
        elevenLabsSttProcessorRef.current.disconnect();
        elevenLabsSttProcessorRef.current = null;
      }
      if (elevenLabsSttWsRef.current?.readyState === WebSocket.OPEN) {
        elevenLabsSttWsRef.current.send(JSON.stringify({ type: 'stop' }));
        elevenLabsSttWsRef.current.close();
      }
      elevenLabsSttWsRef.current = null;
      elevenLabsSttReadyRef.current = false;
      
      // Resume AudioContext if suspended
      if (audioContext!.state === 'suspended') {
        try {
          await audioContext!.resume();
          console.log("🔊 AudioContext resumed, state:", audioContext!.state);
        } catch (e) {
          console.warn("🔊 Failed to resume AudioContext:", e);
        }
      }
    } else {
      // Need fresh mic - cleanup existing first
      console.log("🎤 Need fresh mic stream (existing invalid:", { existingMicValid, existingAudioContextValid }, ")");
      stopElevenLabsSTT();
      
      // 📱 iOS CRITICAL: Request microphone within user gesture context
      // This MUST happen before any async operations (WebSocket, fetch, etc.)
      // Otherwise iOS Safari will deny the permission request
      // Uses cached microphone system to avoid repeated permission prompts
      try {
        console.log("🎤 Requesting microphone access (using cache if available)...");
        micStream = await requestMicrophoneOnce({
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        });
        elevenLabsSttStreamRef.current = micStream;
        console.log("🎤 Microphone access granted!");
        
        // Create AudioContext
        audioContext = new AudioContext({ sampleRate: 16000 });
        elevenLabsSttAudioContextRef.current = audioContext;
        
        // Resume AudioContext if suspended (iOS)
        if (audioContext.state === 'suspended') {
          console.log("🔊 AudioContext suspended - resuming...");
          await audioContext.resume();
          console.log("🔊 AudioContext resumed, state:", audioContext.state);
        }
      } catch (error: any) {
        console.error("🎤 Microphone access denied:", error);
        if (error.name === 'NotAllowedError') {
          setMicrophoneStatus('permission-denied');
        } else {
          setMicrophoneStatus('not-supported');
        }
        return; // Can't proceed without microphone
      }
    }
    
    setMicrophoneStatus('listening');
    
    // Now set up WebSocket (async operations are OK after mic is granted)
    const wsUrl = buildAuthenticatedWsUrl('/ws/elevenlabs-stt');
    console.log("🎤 Starting ElevenLabs STT WebSocket...", { wsUrl });
    
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
      elevenLabsSttWsRef.current = ws;
    } catch (wsError) {
      console.error("🎤 ElevenLabs STT WebSocket creation failed:", wsError);
      setMicrophoneStatus('not-supported');
      return;
    }
    
    ws.onopen = () => {
      console.log("🎤 ElevenLabs STT WebSocket connected successfully");
      ws.send(JSON.stringify({
        type: 'start',
        languageCode: elevenLabsLanguageCodeRef.current || 'en',
      }));
    };
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'stt_ready':
            console.log("🎤 ElevenLabs STT ready - connecting audio pipeline");
            elevenLabsSttReadyRef.current = true;
            // Connect the pre-acquired microphone stream to the WebSocket
            connectMicToWebSocket();
            
            // Check for pending language update (queued while STT was reconnecting)
            // Always replay if there's a pending update - it means user changed language during reconnect
            if (pendingLanguageUpdateRef.current) {
              console.log(`🌐 Replaying queued language update: ${pendingLanguageUpdateRef.current}`);
              ws.send(JSON.stringify({
                type: 'update_language',
                languageCode: pendingLanguageUpdateRef.current,
              }));
              // Don't clear yet - wait for language_updated confirmation
            }
            break;
          
          case 'language_updated':
            console.log(`🌐 Language updated confirmed: ${message.languageCode}`);
            elevenLabsSttReadyRef.current = true;
            // Clear pending update now that server has confirmed the language change
            pendingLanguageUpdateRef.current = null;
            break;
            
          case 'partial':
            if (message.text) {
              console.log("🎤 ElevenLabs STT partial:", message.text);
            }
            handleElevenLabsSttTranscript(message.text, false);
            break;
            
          case 'final':
            console.log("🎤 ElevenLabs STT transcription:", message.text || "(empty)");
            handleElevenLabsSttTranscript(message.text, true);
            break;
            
          case 'error':
            console.error("🎤 ElevenLabs STT error:", message.message);
            setMicrophoneStatus('not-supported');
            break;
        }
      } catch (error) {
        console.error("Error parsing ElevenLabs STT message:", error);
      }
    };
    
    ws.onerror = (error) => {
      console.error("🎤 ElevenLabs STT WebSocket error:", error);
      setMicrophoneStatus('not-supported');
    };
    
    ws.onclose = () => {
      console.log("🎤 ElevenLabs STT WebSocket closed");
      elevenLabsSttReadyRef.current = false;
      elevenLabsSttWsRef.current = null;
      if (useElevenLabsSttRef.current) {
        recognitionRunningRef.current = false;
      }
    };
  }, [stopElevenLabsSTT, handleElevenLabsSttTranscript, connectMicToWebSocket]);
  
  // Start microphone capture for ElevenLabs STT (legacy - kept for compatibility)
  const startMicrophoneForElevenLabsSTT = useCallback(async () => {
    // This function is now mostly handled by startElevenLabsSTT
    // which requests mic FIRST before WebSocket connection
    console.log("🎤 startMicrophoneForElevenLabsSTT called - using connectMicToWebSocket instead");
    connectMicToWebSocket();
  }, [connectMicToWebSocket]);

  // Reference to handleSubmitMessage for use in callbacks (avoids circular dependency)
  const handleSubmitMessageRef = useRef<((message: string) => Promise<void>) | null>(null);

  const startVoiceRecognition = useCallback(() => {
    // Version check - helps verify fresh code is loaded
    console.log("🔧 Voice recognition code version: 2024-12-09-elevenlabs-primary");
    
    // Skip if using unified conversation WS (handles STT internally)
    if (useConversationWsModeRef.current) {
      console.log("⏭️ Skipping old voice recognition - conversation WS handles STT");
      return;
    }
    
    // Skip if using HeyGen's built-in voice chat (mobile mode with LiveKit WebRTC)
    // HeyGen SDK handles microphone capture and sends USER_TRANSCRIPTION events
    if (usingHeygenMobileVoiceChatRef.current) {
      console.log("⏭️ Skipping voice recognition - using HeyGen's built-in voice chat (LiveKit WebRTC)");
      return;
    }
    
    // Skip if already initialized AND running
    if (recognitionRunningRef.current) {
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

    // ✅ ALWAYS use ElevenLabs STT for better mobile support
    // ElevenLabs STT works reliably on mobile (iOS Safari, Chrome) when embedded in iframes
    // Web Speech API has issues on mobile devices, especially in cross-origin iframes
    console.log("🎤 Using ElevenLabs STT for voice input (mobile-compatible)");
    useElevenLabsSttRef.current = true;
    startElevenLabsSTT();
  }, [startElevenLabsSTT]);

  const stopHeyGenSession = useCallback(async () => {
    if (!sessionDriverRef.current || !heygenSessionActive) return;
    
    // Don't stop if we're in audio mode - the session should continue
    if (audioOnlyRef.current) {
      console.log("In audio mode - skipping avatar stop (no video active)");
      return;
    }
    
    console.log("Stopping avatar session - keeping conversation active");
    clearIdleTimeout();
    
    try {
      intentionalStopRef.current = true;
      // Capture LiveAvatar session token before stopping (for proper cleanup)
      const token = sessionDriverRef.current.getLiveAvatarSessionToken?.();
      if (token) {
        liveAvatarSessionTokenRef.current = token;
        console.log("📵 Captured LiveAvatar token for cleanup");
      }
      await sessionDriverRef.current.stop().catch(console.error);
      sessionDriverRef.current = null;
      
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      
      setHeygenSessionActive(false);
      isSpeakingRef.current = false;
      setIsSpeakingState(false);
      
      console.log("Avatar video stopped - conversation continues (audio/text still work)");
    } catch (error) {
      console.error("Error stopping avatar session:", error);
    }
  }, [heygenSessionActive, videoRef, clearIdleTimeout]);

  const startIdleTimeout = useCallback(() => {
    clearIdleTimeout();
    // Server-side idle nudges (MUM_NUDGE / MUM_SOFT_END) handle inactivity now.
    // No client-side idle timeout needed — the conversation WS stays open.
  }, [clearIdleTimeout]);

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
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
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
      console.log(`🔊 ElevenLabs audio blob received: ${audioBlob.size} bytes, type: ${audioBlob.type}`);
      
      if (audioBlob.size === 0) {
        console.error("❌ ElevenLabs returned empty audio blob");
        throw new Error("Empty audio blob");
      }
      
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      // CRITICAL: Register for volume updates immediately upon creation (before async load)
      // This ensures slider changes propagate even during initial playback window
      registerMediaElement(audio);
      
      // Ensure audio is properly configured for playback
      audio.volume = getGlobalVolume(); // Use global volume setting
      audio.muted = false;
      
      // Mobile-specific: Add attributes for iOS/Android compatibility
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('webkit-playsinline', 'true');
      audio.preload = 'auto';
      
      // CRITICAL: Append audio element to document body to ensure it plays through speakers
      // Some browsers don't play detached Audio elements properly
      audio.style.display = 'none';
      document.body.appendChild(audio);
      
      // For debugging - check audio context state
      console.log(`🔊 Creating audio element: volume=${audio.volume}, muted=${audio.muted}, attached to DOM, registered for volume updates`);
      
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
          const duration = audio.duration || 0;
          console.log(`🗣️ ElevenLabs avatar STOP talking (video mode) - played ${duration.toFixed(2)}s`);
          isSpeakingRef.current = false;
          setIsSpeakingState(false);
          URL.revokeObjectURL(audioUrl);
          
          // Unregister from volume updates
          unregisterMediaElement(audio);
          
          // Remove audio element from DOM
          if (audio.parentNode) {
            audio.parentNode.removeChild(audio);
          }
          elevenLabsVideoAudioRef.current = null;
          
          // Resume voice recognition with delay (matches HeyGen AVATAR_STOP_TALKING behavior)
          resumeRecognitionWithDelay();
          
          // Reset idle timeout
          startIdleTimeout();
          resolve();
        };

        audio.onerror = (e) => {
          // === AVATAR_STOP_TALKING equivalent on error ===
          console.error("🗣️ ElevenLabs audio error:", e);
          isSpeakingRef.current = false;
          setIsSpeakingState(false);
          URL.revokeObjectURL(audioUrl);
          
          // Unregister from volume updates
          unregisterMediaElement(audio);
          
          // Remove audio element from DOM
          if (audio.parentNode) {
            audio.parentNode.removeChild(audio);
          }
          elevenLabsVideoAudioRef.current = null;
          console.log("🗣️ ElevenLabs avatar STOP talking (error - video mode)");
          
          // Resume voice recognition with delay on error
          resumeRecognitionWithDelay();
          
          // Restart idle timeout on error
          startIdleTimeout();
          resolve();
        };

        // Play audio - use loadeddata event to ensure audio is ready
        audio.onloadeddata = () => {
          console.log(`🔊 ElevenLabs audio loaded: duration=${audio.duration?.toFixed(2)}s`);
        };
        
        audio.play().then(() => {
          console.log("🔊 ElevenLabs audio playback started");
        }).catch((err) => {
          console.error("Error playing ElevenLabs audio in video mode:", err);
          // === AVATAR_STOP_TALKING equivalent on play error ===
          isSpeakingRef.current = false;
          setIsSpeakingState(false);
          
          // Remove audio element from DOM on error
          if (audio.parentNode) {
            audio.parentNode.removeChild(audio);
          }
          URL.revokeObjectURL(audioUrl);
          elevenLabsVideoAudioRef.current = null;
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

  const startLiveAvatarSession = useCallback(async (activeAvatarId: string, options?: { skipGreeting?: boolean }) => {
    console.log(`🎬 startLiveAvatarSession called: avatarId=${activeAvatarId}, skipGreeting=${options?.skipGreeting}`);
    console.log(`🎬 State check: audioOnlyRef=${audioOnlyRef.current}, sessionDriverRef exists=${!!sessionDriverRef.current}, heygenSessionActive=${heygenSessionActive}`);
    
    // Skip if audio-only
    if (audioOnlyRef.current) {
      console.log("⏭️ Skipping startLiveAvatarSession - in audio-only mode");
      return;
    }
    
    // ✅ CRITICAL: Prevent multiple sessions from starting
    if (sessionDriverRef.current && heygenSessionActive) {
      console.log("⏭️ LiveAvatar session already active - skipping restart");
      return;
    }
    
    const skipGreeting = options?.skipGreeting ?? false;
    console.log(`Starting LiveAvatar session${skipGreeting ? ' (mode switch - no greeting)' : ' (fresh start)'}`);
    setIsLoading(true);
    
    // CRITICAL: Reset intentional stop flag when starting a new session
    // This ensures voice recognition can start after the greeting
    intentionalStopRef.current = false;
    recognitionIntentionalStopRef.current = false;
    
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

      // Detect mobile for voice chat mode
      const userAgent = navigator.userAgent || '';
      const isMobile = /iPad|iPhone|iPod|android|mobile|phone/i.test(userAgent) || 
                       (('ontouchstart' in window || navigator.maxTouchPoints > 0) && window.innerWidth <= 768);
      console.log("🔧 Session start code version: 2024-12-28-v1");
      console.log(`📱 Mobile detection for voice chat: ${isMobile}`);

      // Select driver based on avatar's streamingPlatform setting
      // LiveAvatar = new LiveAvatar SDK (has built-in ElevenLabs STT), HeyGen = older SDK (no built-in STT)
      const streamingPlatform = avatarConfig.streamingPlatform || 'liveavatar';
      console.log(`🎬 Streaming platform: ${streamingPlatform}`);
      
      // CRITICAL: Only skip our voice recognition if using LiveAvatarDriver on mobile
      // LiveAvatarDriver has built-in ElevenLabs STT that handles voice input
      // HeyGenStreamingDriver does NOT have built-in STT, so we need our own voice recognition
      const driverHasBuiltInSTT = streamingPlatform === 'liveavatar';
      usingHeygenMobileVoiceChatRef.current = isMobile && driverHasBuiltInSTT;
      console.log(`🎤 Driver has built-in STT: ${driverHasBuiltInSTT}, usingHeygenMobileVoiceChat: ${usingHeygenMobileVoiceChatRef.current}`);

      const driverConfig = {
        avatarConfig,
        audioOnly: false,
        videoRef,
        avatarId: activeAvatarId,
        userId,
        languageCode: languageCodeRef.current,
        enableMobileVoiceChat: isMobile, // Enable HeyGen's built-in voice chat on mobile (uses LiveKit WebRTC)
        
        // Video ready callback - called when LiveKit video track is attached
        onVideoReady: () => {
          console.log("📺 Video track ready - updating videoReady state");
          setVideoReady(true);
        },
        
        // Stream ready callback - handles video attachment and greeting
        onStreamReady: async () => {
          console.log("🎬 LiveAvatar stream ready");
          
          // Clear loading state and timeout as soon as stream is ready
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
            loadingTimeoutRef.current = null;
          }
          setIsLoading(false);
          setHeygenSessionActive(true);
          
          // If using HeyGen's mobile voice chat, set microphone status to listening
          // The SDK handles microphone capture via LiveKit WebRTC
          if (usingHeygenMobileVoiceChatRef.current) {
            console.log("🎤 HeyGen mobile voice chat active - microphone handled by SDK");
            setMicrophoneStatus('listening');
          }
          
          // 🎤 Avatar speaks first with a personalized greeting (only for fresh starts, not mode switches)
          if (!skipGreeting) {
            console.log("🗣️ Fetching greeting for avatar:", activeAvatarId);
            try {
              const greetingResponse = await fetch(`/api/avatar/greeting/${activeAvatarId}`);
              console.log("🗣️ Greeting response status:", greetingResponse.status);
              if (greetingResponse.ok) {
                const { greeting } = await greetingResponse.json();
                console.log("🗣️ Greeting fetched:", greeting ? greeting.substring(0, 50) + "..." : "null");
                console.log("🗣️ sessionDriverRef.current exists:", !!sessionDriverRef.current);
                if (greeting && sessionDriverRef.current) {
                  console.log("🗣️ Avatar greeting:", greeting);
                  // Longer delay to ensure session is fully ready for speaking (production may need more time)
                  await new Promise(resolve => setTimeout(resolve, 500));
                  // Retry greeting speak up to 2 times if it fails
                  let greetingSpoken = false;
                  for (let attempt = 0; attempt < 3 && !greetingSpoken; attempt++) {
                    try {
                      if (sessionDriverRef.current) {
                        await sessionDriverRef.current.speak(greeting, elevenLabsLanguageCodeRef.current);
                        greetingSpoken = true;
                        console.log("🗣️ Greeting speak() completed on attempt", attempt + 1);
                      }
                    } catch (speakError) {
                      console.warn(`🗣️ Greeting speak attempt ${attempt + 1} failed:`, speakError);
                      if (attempt < 2) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                      }
                    }
                  }
                  // Fallback: if greeting didn't trigger onAvatarStopTalking, ensure voice recognition starts
                  if (!greetingSpoken && !recognitionRunningRef.current) {
                    console.log("🎤 Greeting failed - starting voice recognition as fallback");
                    recognitionIntentionalStopRef.current = false;
                    startVoiceRecognition();
                  } else if (greetingSpoken) {
                    // Safety net: if onAvatarStopTalking never fires, start recognition after timeout
                    setTimeout(() => {
                      if (!recognitionRunningRef.current && sessionActiveRef.current && !isSpeakingRef.current) {
                        console.log("🎤 Safety net: starting voice recognition 15s after greeting (onAvatarStopTalking may not have fired)");
                        recognitionIntentionalStopRef.current = false;
                        startVoiceRecognition();
                      }
                    }, 15000);
                  }
                } else {
                  console.warn("🗣️ Cannot speak greeting - greeting:", !!greeting, "driver:", !!sessionDriverRef.current);
                  // Start voice recognition anyway since greeting couldn't be spoken
                  if (!recognitionRunningRef.current) {
                    console.log("🎤 No greeting spoken - starting voice recognition");
                    recognitionIntentionalStopRef.current = false;
                    startVoiceRecognition();
                  }
                }
              } else {
                console.warn("🗣️ Greeting API failed with status:", greetingResponse.status);
                // Start voice recognition even if greeting API fails
                if (!recognitionRunningRef.current) {
                  recognitionIntentionalStopRef.current = false;
                  startVoiceRecognition();
                }
              }
            } catch (error) {
              console.warn("Failed to fetch greeting:", error);
              // Start voice recognition even if greeting completely fails
              if (!recognitionRunningRef.current) {
                recognitionIntentionalStopRef.current = false;
                startVoiceRecognition();
              }
            }
          } else {
            console.log("⏭️ Skipping greeting - mode switch (seamless transition)");
            // For mode switches, ensure voice recognition starts immediately
            recognitionIntentionalStopRef.current = false;
            if (!recognitionRunningRef.current && sessionActiveRef.current) {
              console.log("🎤 Starting voice recognition after seamless mode switch");
              startVoiceRecognition();
            }
          }
        },
        
        // Stream disconnected callback - handles reconnection logic
        onStreamDisconnected: () => {
          console.log("📵 Stream disconnected - intentionalStop flag:", intentionalStopRef.current);
          
          const wasUnintentional = !intentionalStopRef.current;
          
          intentionalStopRef.current = false;
          isSpeakingRef.current = false;
          sessionDriverRef.current = null;
          usingHeygenMobileVoiceChatRef.current = false; // Reset mobile voice chat flag
          setHeygenSessionActive(false);
          setVideoReady(false); // Reset video ready state on disconnect
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
                    if (sessionActiveRef.current && !sessionDriverRef.current) {
                      console.log(`🔄 Executing auto-reconnect attempt ${attemptNum}...`);
                      await startLiveAvatarSession(currentAvatarIdRef.current);
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
        },
        
        // Avatar start talking callback - pause voice recognition
        onAvatarStartTalking: () => {
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
        },
        
        // Avatar stop talking callback - resume voice recognition
        onAvatarStopTalking: () => {
          isSpeakingRef.current = false;
          setIsSpeakingState(false);
          
          // 🎤 Resume voice recognition after a delay to prevent echo
          // Mobile devices need much longer delay (6+ seconds) because:
          // 1. Audio buffering causes residual playback
          // 2. Echo from speakers is picked up by microphone
          // 3. Video mode has additional audio latency
          const userAgent = navigator.userAgent || '';
          const isMobile = /iPad|iPhone|iPod|android|mobile|phone/i.test(userAgent);
          const isIOS = /iPad|iPhone|iPod/.test(userAgent);
          const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent);
          
          // Use longer delay for mobile video mode to prevent echo pickup
          let delay = 1000; // Desktop default
          if (isMobile) {
            delay = 6000; // Mobile needs 6 seconds to avoid echo
          } else if (isIOS || isSafari) {
            delay = 4000; // iOS/Safari desktop
          }
          
          console.log("🎤 Avatar stopped talking, will resume voice recognition in", delay, "ms (mobile:", isMobile, ")");
          
          setTimeout(() => {
            if (recognitionIntentionalStopRef.current || isSpeakingRef.current) {
              console.log("🎤 Skip resume: intentionalStop=", recognitionIntentionalStopRef.current, "isSpeaking=", isSpeakingRef.current);
              return;
            }
            
            if (recognitionRunningRef.current) {
              console.log("🎤 Voice recognition already running");
              return;
            }
            
            console.log("🔊 Resuming voice recognition (avatar finished speaking)");
            startVoiceRecognition();
          }, delay);
        },
        
        // User message callback (from LiveAvatar voice input if enabled)
        onUserMessage: (message: string) => {
          console.log("🎤 User message from driver:", message);
          handleSubmitMessage(message);
        },
      };
      
      // Create the appropriate driver based on streamingPlatform
      let driver: SessionDriver;
      if (streamingPlatform === 'heygen') {
        console.log("🎬 Using HeyGenStreamingDriver (older, more stable SDK)");
        driver = new HeyGenStreamingDriver(driverConfig);
      } else {
        console.log("🎬 Using LiveAvatarDriver (newer SDK)");
        driver = new LiveAvatarDriver(driverConfig);
      }
      
      sessionDriverRef.current = driver;
      
      // Start the avatar session
      await driver.start();
      
      console.log(`✅ ${streamingPlatform === 'heygen' ? 'HeyGen Streaming' : 'LiveAvatar'} session started`);
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString?.() || JSON.stringify(error) || 'Unknown error';
      console.error("❌ Error starting LiveAvatar session:", errorMessage, error);
      setIsLoading(false);
      sessionDriverRef.current = null;
      throw error;
    }
  }, [heygenSessionActive, videoRef, userId, startIdleTimeout, clearIdleTimeout, startVoiceRecognition]);
  
  // Alias for backwards compatibility
  const startHeyGenSession = startLiveAvatarSession;

  const startSession = useCallback(async (options?: StartSessionOptions) => {
    console.log("📱 startSession called - beginning session initialization...");
    
    // 🔇 CRITICAL: Stop any previous session driver FIRST to free up HeyGen session slot
    // This prevents "Maximum 2 concurrent sessions" error when switching avatars
    if (sessionDriverRef.current) {
      console.log("🛑 Stopping previous session driver before starting new session");
      try {
        intentionalStopRef.current = true;
        await sessionDriverRef.current.stop();
        sessionDriverRef.current = null;
        console.log("✅ Previous session driver stopped successfully");
      } catch (e) {
        console.warn("⚠️ Error stopping previous session:", e);
        sessionDriverRef.current = null;
      }
    }
    
    // 🔇 CRITICAL: Cancel any pending work from previous session to prevent voice overlap
    // Note: We don't call cancelPendingWork() here because we want to keep the current token
    // Instead, just stop audio and refresh the token to current global value
    if (currentAudioRef.current) {
      console.log("🔇 Stopping previous audio at session start");
      currentAudioRef.current.pause();
      if (currentAudioRef.current.src?.startsWith('blob:')) {
        URL.revokeObjectURL(currentAudioRef.current.src);
      }
      currentAudioRef.current = null;
    }
    stopSharedAudio();
    isSpeakingRef.current = false;
    setIsSpeakingState(false);
    
    // 🔄 Refresh session token to capture current global token for this new session
    // This ensures new audio uses the latest token after any previous endSession() increments
    sessionTokenRef.current = getCurrentSessionToken();
    console.log("🔄 Session token refreshed to:", sessionTokenRef.current);
    
    // ✅ MOBILE DEFENSE: Wrap EVERYTHING in try-catch to prevent stuck loading state
    // Use ReturnType for browser compatibility
    let loadingTimeoutId: ReturnType<typeof setTimeout> | null = null;
    
    try {
      setIsLoading(true);
      
      // Reset session state for clean start
      hasStartedRef.current = false;
      reconnectAttemptsRef.current = 0;
      recognitionIntentionalStopRef.current = false;
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      
      // ✅ Safety timeout: Auto-clear loading state after 30 seconds
      // HeyGen initialization can take 15-20 seconds, so we give it plenty of time
      loadingTimeoutId = setTimeout(() => {
        console.warn("⚠️ Loading timeout reached - auto-clearing loading state");
        setIsLoading(false);
        setShowReconnect(true);
        loadingTimeoutRef.current = null;
      }, 30000);
      loadingTimeoutRef.current = loadingTimeoutId;
      
      const { audioOnly = false, avatarId, skipServerRegistration = false } = options || {};
      audioOnlyRef.current = audioOnly;
      
      const activeAvatarId = avatarId || currentAvatarIdRef.current;
      currentAvatarIdRef.current = activeAvatarId;

      // 🔓 MOBILE FIX: Unlock audio on user gesture - MUST happen synchronously with gesture
      try {
        console.log("📱 Unlocking mobile audio on user gesture...");
        const unlocked = await ensureAudioUnlocked();
        if (unlocked) {
          console.log("📱 Mobile audio unlocked successfully");
        } else {
          console.warn("📱 Audio unlock returned false, but continuing anyway");
        }
      } catch (error) {
        console.warn("📱 Audio unlock failed:", error);
        // Try to at least resume the AudioContext
        await ensureAudioContextResumed().catch(() => {});
      }

      // Skip server registration if already done by Web Worker (Safari iOS workaround)
      if (!skipServerRegistration) {
        // End all existing sessions first to prevent "Maximum 2 concurrent sessions" error
        try {
          console.log("📱 Ending previous sessions...");
          await fetch("/api/session/end-all", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...getAuthHeaders(),
            },
            body: JSON.stringify({
              userId,
            }),
          });
          console.log("📱 Previous sessions ended");
        } catch (error) {
          console.warn("Failed to end previous sessions:", error);
          // Continue anyway - this is just cleanup
        }

        // Register session with server (for both audio and video modes)
        try {
          console.log("📱 Registering session with server...");
          const response = await fetch("/api/session/start", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getAuthHeaders() },
            credentials: "include",
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
          console.log("📱 Session registered successfully:", data.sessionId);
        } catch (error: any) {
          console.error("Error registering session:", error);
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
            loadingTimeoutRef.current = null;
          }
          setIsLoading(false);
          throw error;
        }
      } else {
        console.log("📱 Skipping server registration (already done by Web Worker)");
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
    isMicMutedRef.current = false;
    setIsMicMuted(false);
    onSessionActiveChange?.(true)
    
    // ✅ MOBILE: Request microphone permission once and cache it (non-blocking)
    // Uses the global microphone cache to avoid repeated permission prompts
    const isMobile = /iPad|iPhone|iPod|Android|mobile/i.test(navigator.userAgent);
    if (isMobile && navigator.mediaDevices?.getUserMedia && !isMicPermissionGranted?.()) {
      // Request mic once and cache - subsequent calls will reuse the cached stream
      const warmupMic = async () => {
        try {
          console.log("📱 Requesting microphone permission (cached for session)...");
          await requestMicrophoneOnce({ audio: true });
          console.log("📱 Microphone permission cached successfully");
        } catch (error) {
          console.warn("📱 Microphone permission request failed (non-critical):", error);
        }
      };
      // Fire and forget - don't block session start
      warmupMic();
    }
    
    // ✅ Voice recognition is handled by conversation WS (unified STT + Claude + TTS pipe)
    // Skip starting the old separate ElevenLabs STT - conversation WS handles mic capture internally
    
    // Start HeyGen immediately in video mode for instant avatar appearance
    if (!audioOnly) {
      try {
        await startHeyGenSession(activeAvatarId);
        // Loading state cleared by STREAM_READY event
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
          loadingTimeoutRef.current = null;
        }
        
        // Start conversation WS for streaming TTS → LiveAvatar lip-sync
        useConversationWsModeRef.current = true;
        await conversationWs.connect();
        await conversationWs.startMic();
        console.log("🎙️ Video mode: Conversation WS connected for streaming lip-sync");
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
      
      // 📱 AUDIO MODE: Start voice recognition FIRST and wait for mic to be acquired
      // This ensures mic is ready before we play greeting (critical for post-greeting listening)
      console.log("🎤 Audio mode: Starting voice recognition before greeting...");
      
      // Use unified conversation WS (STT + Claude + TTS in one pipe)
      // This replaces the separate ElevenLabs STT + /api/audio flow
      useConversationWsModeRef.current = true;
      await conversationWs.connect();
      await conversationWs.startMic();
      console.log("🎤 Audio mode: Conversation WS connected with mic streaming");
      // Skip ElevenLabs STT - conversation WS handles STT internally
      
      // Pre-cache acknowledgment audio for faster responses in audio-only mode
      triggerAcknowledgmentCache(activeAvatarId);
      
      // 🎤 Avatar speaks first with a personalized greeting (audio-only mode)
      try {
        // 🔇 CRITICAL: Stop any existing audio before playing new greeting
        // This prevents overlapping audio when switching avatars quickly
        const existingAudio = currentAudioRef.current as HTMLAudioElement | null;
        if (existingAudio) {
          console.log("🔇 Stopping previous audio before greeting");
          existingAudio.pause();
          existingAudio.currentTime = 0;
          if (existingAudio.src?.startsWith('blob:')) {
            URL.revokeObjectURL(existingAudio.src);
          }
          currentAudioRef.current = null;
        }
        stopSharedAudio();
        
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
            console.log("🎤 Fetching greeting audio from ElevenLabs...");
            const audioResponse = await fetch("/api/elevenlabs/tts", {
              method: "POST",
              headers: { "Content-Type": "application/json", ...getAuthHeaders() },
              body: JSON.stringify({
                text: greeting,
                avatarId: activeAvatarId,
                languageCode: elevenLabsLanguageCodeRef.current,
              }),
            });
            console.log("🎤 Greeting audio response status:", audioResponse.status);
            if (audioResponse.ok) {
              const audioBlob = await audioResponse.blob();
              console.log("🎤 Greeting audio blob size:", audioBlob.size, "bytes, type:", audioBlob.type);
              
              // 📱 MOBILE FIX: Use shared audio element (already unlocked) instead of new Audio()
              // This is critical for iOS Safari which requires audio to be played from a user gesture
              isSpeakingRef.current = true;
              setIsSpeakingState(true);
              
              try {
                console.log("🎤 Attempting to play greeting via shared audio element...");
                const audio = await playAudioBlob(audioBlob, sessionTokenRef.current);
                currentAudioRef.current = audio;
                console.log("🎤 Greeting audio PLAYING via shared element");
                
                // Set up cleanup after audio ends
                const originalOnEnded = audio.onended;
                audio.onended = () => {
                  console.log("🎤 Greeting audio ENDED successfully");
                  currentAudioRef.current = null;
                  isSpeakingRef.current = false;
                  setIsSpeakingState(false);
                  if (originalOnEnded) {
                    originalOnEnded.call(audio, new Event('ended'));
                  }
                  // 📱 ALWAYS verify STT is working after greeting ends
                  // The recognitionRunningRef may be true but STT could be broken
                  setTimeout(() => {
                    if (audioOnlyRef.current && !recognitionIntentionalStopRef.current && sessionActiveRef.current) {
                      // Verify ElevenLabs STT is actually working
                      const wsOpen = elevenLabsSttWsRef.current?.readyState === WebSocket.OPEN;
                      const sttReady = elevenLabsSttReadyRef.current;
                      const audioContextRunning = elevenLabsSttAudioContextRef.current?.state === 'running';
                      const mediaTrackLive = elevenLabsSttStreamRef.current?.getAudioTracks().some(t => t.readyState === 'live') ?? false;
                      
                      console.log("🔊 Post-greeting STT state check:", { wsOpen, sttReady, audioContextRunning, mediaTrackLive });
                      
                      if (wsOpen && sttReady && audioContextRunning && mediaTrackLive) {
                        console.log("🔊 STT still working after greeting - listening for input");
                      } else {
                        // STT is broken - restart it
                        console.log("🔊 STT broken after greeting - restarting voice recognition");
                        recognitionRunningRef.current = false;
                        startVoiceRecognition();
                      }
                    }
                  }, 500);
                };
                
                const originalOnError = audio.onerror;
                audio.onerror = (e) => {
                  console.error("🎤 Greeting audio ERROR:", e);
                  currentAudioRef.current = null;
                  isSpeakingRef.current = false;
                  setIsSpeakingState(false);
                  if (originalOnError) {
                    (originalOnError as any).call(audio, e);
                  }
                  setTimeout(() => {
                    if (audioOnlyRef.current && !recognitionRunningRef.current && !recognitionIntentionalStopRef.current && sessionActiveRef.current) {
                      console.log("🔊 Voice recognition resumed (greeting error)");
                      startVoiceRecognition();
                    }
                  }, 500);
                };
              } catch (err: any) {
                console.error("🎤 Greeting audio play() FAILED:", err?.name, err?.message);
                currentAudioRef.current = null;
                isSpeakingRef.current = false;
                setIsSpeakingState(false);
                
                // Resume voice recognition if play fails - session still works, just no greeting
                setTimeout(() => {
                  if (audioOnlyRef.current && !recognitionRunningRef.current && !recognitionIntentionalStopRef.current && sessionActiveRef.current) {
                    console.log("🔊 Voice recognition started (greeting skipped)");
                    startVoiceRecognition();
                  }
                }, 500);
              }
            } else {
              console.error("🎤 Failed to fetch greeting audio:", audioResponse.status);
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
    } catch (error: any) {
      // ✅ MOBILE DEFENSE: Catch ANY error and clear loading state
      console.error("📱 startSession failed with error:", error?.message || error);
      if (loadingTimeoutId) {
        clearTimeout(loadingTimeoutId);
      }
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      setIsLoading(false);
      setShowReconnect(true);
      throw error;
    }
  }, [
    videoRef,
    userId,
    onSessionActiveChange,
    onResetInactivityTimer,
    startHeyGenSession,
    startVoiceRecognition,
    startElevenLabsSTT,
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
    
    // Stop ElevenLabs STT as well
    stopElevenLabsSTT();
    
    // Disconnect conversation WS if active
    if (useConversationWsModeRef.current) {
      conversationWs.disconnect();
      useConversationWsModeRef.current = false;
    }

    if (sessionDriverRef.current) {
      try {
        // No automatic farewell - saves credits
        // Just stop the avatar session immediately
        intentionalStopRef.current = true;
        console.log("Setting intentionalStop flag to TRUE for timeout");

        await sessionDriverRef.current.stop().catch(console.error);
        sessionDriverRef.current = null;
      } catch (error) {
        console.error("Error stopping avatar on timeout:", error);
        if (sessionDriverRef.current) {
          intentionalStopRef.current = true;
          await sessionDriverRef.current.stop().catch(console.error);
          sessionDriverRef.current = null;
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
  }, [videoRef, onSessionActiveChange, stopElevenLabsSTT]);

  const endSession = useCallback(async () => {
    // 🔇 CRITICAL: Cancel all pending work immediately to prevent voice overlap
    cancelPendingWork();

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
    
    // Stop ElevenLabs STT as well
    stopElevenLabsSTT();
    
    // Disconnect conversation WS if active
    if (useConversationWsModeRef.current) {
      conversationWs.disconnect();
      useConversationWsModeRef.current = false;
    }

    if (sessionDriverRef.current) {
      intentionalStopRef.current = true;
      await sessionDriverRef.current.stop().catch(console.error);
      sessionDriverRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    // Stop current audio if playing (both ref audio AND shared mobile audio)
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
    // Stop ElevenLabs video mode audio as well
    if (elevenLabsVideoAudioRef.current) {
      try {
        elevenLabsVideoAudioRef.current.pause();
        elevenLabsVideoAudioRef.current = null;
      } catch (e) {
        console.warn("Error stopping ElevenLabs video audio:", e);
        elevenLabsVideoAudioRef.current = null;
      }
    }
    // Also stop shared mobile audio element to prevent voice overlap on avatar switch
    stopSharedAudio();
    
    isSpeakingRef.current = false;
    setIsSpeakingState(false);

    setSessionActive(false);
    setHeygenSessionActive(false);
    setIsLoading(false);
    setShowReconnect(false);
    onSessionActiveChange?.(false);
    
    await endSessionOnServer();
  }, [videoRef, onSessionActiveChange, clearIdleTimeout, stopElevenLabsSTT, cancelPendingWork]);

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
    
    console.log(`🔄 switchTransportMode called: toVideoMode=${toVideoMode}, newAudioOnly=${newAudioOnly}`);
    console.log(`🔄 Current state: audioOnlyRef=${audioOnlyRef.current}, sessionActive=${sessionActiveRef.current}, heygenSessionActive=${heygenSessionActive}`);
    console.log(`🔄 Refs: sessionDriverRef exists=${!!sessionDriverRef.current}, currentAvatarId=${currentAvatarIdRef.current}`);
    
    // Skip if already in the target mode AND the session is in a valid state
    // Don't skip if we're supposedly in video mode but no video session is active
    const videoModeButNoSession = !audioOnlyRef.current && !heygenSessionActive && !toVideoMode === false;
    const alreadyInTargetMode = audioOnlyRef.current === newAudioOnly;
    
    if (alreadyInTargetMode) {
      // For video mode, verify session is actually running
      if (!newAudioOnly && !heygenSessionActive) {
        console.log("🔄 Supposedly in video mode but no session active - retrying video start");
        // Don't return, proceed to start video session
      } else {
        console.log("Already in target mode with valid session, skipping switch");
        return;
      }
    }
    
    console.log(`🔄 Switching transport: ${audioOnlyRef.current ? 'Audio' : 'Video'} → ${newAudioOnly ? 'Audio' : 'Video'}`);
    
    // 📱 MOBILE FIX: Unlock video/audio IMMEDIATELY on user gesture - MUST be first!
    // This must happen BEFORE any async operations or the user gesture expires
    // For video mode, we need to "prime" the video element so play() works later
    if (toVideoMode && videoRef.current) {
      try {
        console.log("📱 Unlocking video element for mobile...");
        videoRef.current.muted = true;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('webkit-playsinline', 'true');
        // Start a muted play to unlock, then immediately pause
        // Add timeout to prevent hanging if play() never resolves (e.g., no video source)
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 500));
          await Promise.race([playPromise.catch(() => {}), timeoutPromise]);
        }
        videoRef.current.pause();
        console.log("📱 Video element unlocked for mobile");
      } catch (e) {
        console.warn("📱 Video unlock failed:", e);
      }
    }
    // Also unlock audio - properly await instead of racing with timeout
    try {
      const unlocked = await ensureAudioUnlocked();
      console.log("📱 Audio unlock result:", unlocked);
    } catch (e) {
      console.warn("📱 Audio unlock failed, continuing anyway:", e);
    }
    
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
    
    // If switching FROM video TO audio, stop avatar (releases credits automatically)
    // Keep server session alive for conversation continuity
    if (!wasAudioOnly && newAudioOnly) {
      // Always clear avatar state when switching to audio, even if avatar seems inactive
      try {
        intentionalStopRef.current = true;
        
        // Stop avatar if it exists
        if (sessionDriverRef.current) {
          await sessionDriverRef.current.stop().catch((e: Error) => {
            console.warn("Error stopping avatar:", e);
          });
        }
        
        // ALWAYS clear these state values to ensure clean audio mode
        sessionDriverRef.current = null;
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
        // conversation tracking, not billing (that's handled by stop)
        
        console.log("✅ Avatar stopped - switched to audio mode (session preserved)");
      } catch (error) {
        console.error("Error stopping avatar for mode switch:", error);
        // Revert mode on failure but still try to clean up state
        audioOnlyRef.current = wasAudioOnly;
        sessionDriverRef.current = null;
        setHeygenSessionActive(false);
        throw error;
      }
    }
    
    // If switching FROM audio TO video, start HeyGen
    console.log(`🔄 Checking if should start video: !newAudioOnly=${!newAudioOnly}, wasAudioOnly=${wasAudioOnly}`);
    if (!newAudioOnly) {
      console.log("🔄 Entering video start block");
      if (videoRef.current) {
        console.log("🔄 Setting video element styles");
        videoRef.current.style.display = 'block';
        videoRef.current.style.visibility = 'visible';
        videoRef.current.style.opacity = '1';
      } else {
        console.warn("🔄 No videoRef.current!");
      }
      
      try {
        console.log("🔄 Setting isLoading=true");
        setIsLoading(true);
        
        // Small delay to ensure video element is rendered and DOM is updated
        console.log("🔄 Waiting 100ms for DOM update...");
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Pass skipGreeting=true for seamless mode switch - conversation is already in progress
        console.log(`🔄 Calling startHeyGenSession with avatarId=${currentAvatarIdRef.current}`);
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
      if (sessionDriverRef.current) {
        try {
          await sessionDriverRef.current.interrupt();
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

      if (sessionDriverRef.current) {
        intentionalStopRef.current = true;
        console.log("Setting intentionalStop flag to TRUE for pause");
        await sessionDriverRef.current.stop().catch(console.error);
        sessionDriverRef.current = null;
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
      console.log("Avatar paused - stream stopped");
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
      
      // Stop conversation WS if active
      if (useConversationWsModeRef.current) {
        conversationWs.disconnect();
        useConversationWsModeRef.current = false;
      }
      
      // Stop voice recognition (Web Speech API or ElevenLabs STT)
      if (useElevenLabsSttRef.current) {
        stopElevenLabsSTT();
        console.log("🛑 ElevenLabs STT stopped on cleanup");
      }
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
      
      if (sessionDriverRef.current) {
        intentionalStopRef.current = true;
        sessionDriverRef.current.stop().catch(console.error);
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
    
    // 🎤 KEEP STT LISTENING for interruptions during audio playback (audio-only mode)
    // In video mode, pause recognition to prevent echo
    if (useElevenLabsSttRef.current && elevenLabsSttReadyRef.current) {
      if (audioOnlyRef.current) {
        // Audio-only mode: Keep STT connected for interruption detection
        // Echo protection is handled in handleElevenLabsSttTranscript
        console.log("🎤 ElevenLabs STT stays active (interruption enabled)");
      } else {
        // Video mode: Pause the microphone
        if (elevenLabsSttProcessorRef.current) {
          elevenLabsSttProcessorRef.current.disconnect();
          elevenLabsSttProcessorRef.current = null;
        }
        recognitionRunningRef.current = false;
        console.log("🔇 ElevenLabs STT microphone paused (video mode)");
      }
    } else if (recognitionRef.current && recognitionRunningRef.current) {
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
    } else if (sessionDriverRef.current) {
      // Video mode: Interrupt avatar if speaking
      await sessionDriverRef.current.interrupt().catch(() => {});
    }

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Conversation WS mode: send text via WS (server handles STT+Claude+TTS streaming)
      // Works for both audio-only and video modes
      if (useConversationWsModeRef.current && conversationWs.isConnected) {
        console.log(`${audioOnlyRef.current ? 'Audio-only' : 'Video'} mode: Sending text via conversation WS (streaming pipeline)`);
        conversationWs.sendText(message);
        return; // WS handles everything including LiveAvatar lip-sync feed
      }
      
      // Audio-only mode: Use conversation WS or fallback to /api/audio endpoint
      if (audioOnlyRef.current) {
        
        // Fallback: Use combined /api/audio endpoint (Claude + ElevenLabs in one call)
        console.log("Audio-only mode: Using /api/audio endpoint (fallback)");
        console.log("🧠 Memory settings:", { memoryEnabled: memoryEnabledRef.current, userId });

        // Play instant acknowledgment while Claude processes (non-blocking)
        playAcknowledgmentInstantly().catch(() => {});

        try {
          const audioResponse = await fetch("/api/audio", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getAuthHeaders() },
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
              
              // Store avatar response for echo detection (audio mode)
              lastAvatarResponseRef.current = decodedResponse;
              lastAvatarResponseTimeRef.current = Date.now();
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
            
            // Final check before playing - mode might have changed during blob processing
            if (!audioOnlyRef.current) {
              console.log("🚫 Skipping audio playback - mode changed to video");
              isSpeakingRef.current = false;
              setIsSpeakingState(false);
              return;
            }

            // 📱 MOBILE FIX: Use playAudioBlob which properly uses the pre-unlocked shared element
            // This is critical for iOS Safari which rejects audio.play() outside user gesture context
            try {
              console.log(`🔊 Playing audio via playAudioBlob (unlocked: ${isAudioUnlocked()}, token: ${sessionTokenRef.current})`);
              const audio = await playAudioBlob(audioBlob, sessionTokenRef.current);
              currentAudioRef.current = audio;
              
              // Setup cleanup after playback ends (playAudioBlob resolves when play STARTS)
              audio.onended = () => {
                console.log(`🔊 Audio playback ENDED successfully`);
                isSpeakingRef.current = false;
                setIsSpeakingState(false);
                currentAudioRef.current = null;
                
                // Cleanup blob URL
                if (audio.src && audio.src.startsWith('blob:')) {
                  URL.revokeObjectURL(audio.src);
                }
                
                // 🔊 Resume voice recognition after audio ends (with 1s delay to prevent echo)
                setTimeout(() => {
                  if (audioOnlyRef.current && !recognitionRunningRef.current && !currentAudioRef.current) {
                    startVoiceRecognition();
                    console.log("🔊 Voice recognition resumed (audio-only mode - avatar finished)");
                  }
                }, 1000);
              };
              
              audio.onerror = () => {
                console.error(`🔊 Audio playback ERROR`);
                isSpeakingRef.current = false;
                setIsSpeakingState(false);
                currentAudioRef.current = null;
                if (audio.src && audio.src.startsWith('blob:')) {
                  URL.revokeObjectURL(audio.src);
                }
              };
              
            } catch (playError) {
              console.error(`🔊 Audio playback FAILED:`, playError);
              isSpeakingRef.current = false;
              setIsSpeakingState(false);
              currentAudioRef.current = null;
              
              // Resume voice recognition on error
              setTimeout(() => {
                if (audioOnlyRef.current && !recognitionRunningRef.current && !currentAudioRef.current) {
                  startVoiceRecognition();
                }
              }, 1000);
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
        
        // Video mode: Start avatar session ONLY on first message if not already started
        // Skip this in audio-only mode - we don't need HeyGen video
        if (!audioOnlyRef.current && !heygenSessionActive && !sessionDriverRef.current) {
          try {
            const avatarStartTime = performance.now();
            await startHeyGenSession(currentAvatarIdRef.current);
            console.log(`⏱️ [TIMING] Avatar session start: ${(performance.now() - avatarStartTime).toFixed(0)}ms`);
          } catch (error) {
            console.error("Failed to start avatar session:", error);
          }
        }
        
        // ⏱️ TIMING: API call
        const apiStartTime = performance.now();
        console.log("⏱️ [TIMING] API call starting...");
        
        // Check if driver supports repeatAudio (LiveAvatarDriver has getSessionInstance, HeyGenStreamingDriver doesn't)
        // HeyGenStreamingDriver uses older SDK that only has speak({ text }) - no custom audio support
        const driverSupportsAudioStreaming = typeof (sessionDriverRef.current as any)?.getSessionInstance === 'function';
        console.log(`🔍 Driver audio streaming support: ${driverSupportsAudioStreaming ? 'YES (LiveAvatarDriver)' : 'NO (HeyGenStreamingDriver - using text fallback)'}`);
        
        // Use AUDIO streaming mode for faster perceived response (concurrent TTS)
        // Audio chunks may arrive out of order - frontend handles ordering via index
        // Only use audio streaming if driver supports repeatAudio (LiveAvatarDriver)
        if (streamingEnabledRef.current && sessionDriverRef.current && driverSupportsAudioStreaming) {
          console.log("🎯 [AUDIO-STREAMING] Using audio streaming mode for faster response");
          
          let fullResponse = '';
          let firstAudioTime = 0;
          let audioCount = 0;
          let performanceData: any = null;
          
          // Ordered playback state - audio chunks may arrive out of order
          const audioBuffer: Map<number, { content: string; type: string; isFinal: boolean }> = new Map();
          let nextPlayIndex = 0;
          let streamingComplete = false;
          let streamError = false;
          let audioAborted = false;
          
          const processAudioQueue = async () => {
            const maxWaitMs = 30000;
            const startTime = Date.now();
            
            while (!streamingComplete || audioBuffer.size > 0) {
              if (audioAborted) {
                audioBuffer.clear();
                console.log("🛑 [AUDIO-STREAMING] Audio queue aborted by interruption");
                break;
              }
              
              if (Date.now() - startTime > maxWaitMs) {
                console.warn("🎯 [AUDIO-STREAMING] Timeout waiting for audio");
                break;
              }
              
              if (streamError) {
                console.warn("🎯 [AUDIO-STREAMING] Stopping due to stream error");
                break;
              }
              
              // Check if next audio chunk is ready
              const nextAudio = audioBuffer.get(nextPlayIndex);
              if (nextAudio) {
                audioBuffer.delete(nextPlayIndex);
                
                if (!sessionDriverRef.current) break;
                
                try {
                  // Call repeatAudio via getSessionInstance() - session is private in LiveAvatarDriver
                  const driver = sessionDriverRef.current as any;
                  // Use getSessionInstance() method to access the internal HeyGen session
                  const session = driver?.getSessionInstance?.() || driver?.session;
                  
                  if (session?.repeatAudio) {
                    session.repeatAudio(nextAudio.content);
                    console.log(`🔊 [AUDIO-STREAMING] Audio index ${nextPlayIndex} (${nextAudio.type}) sent to SDK`);
                    
                    // Estimate audio duration from PCM data length (24kHz, 16-bit mono)
                    // Fast estimate: base64Length * 0.75 / 48000 * 1000ms
                    const durationMs = (nextAudio.content.length * 0.75 / 48000) * 1000;
                    
                    // Wait for approximate audio duration before playing next chunk
                    await new Promise(resolve => setTimeout(resolve, Math.max(durationMs * 0.8, 100)));
                  } else {
                    // Debug: log what's available
                    const hasGetSession = typeof driver?.getSessionInstance === 'function';
                    console.warn(`🔊 [AUDIO-STREAMING] repeatAudio not available - driver: ${!!driver}, hasGetSession: ${hasGetSession}, session: ${!!session}, methods: ${session ? Object.keys(session).slice(0, 5).join(',') : 'none'}`);
                  }
                } catch (e) {
                  console.warn("Audio playback error:", e);
                }
                
                nextPlayIndex++;
              } else {
                // Wait for next chunk to arrive
                await new Promise(resolve => setTimeout(resolve, 50));
              }
            }
            console.log("🎯 [AUDIO-STREAMING] Audio queue fully processed");
          };
          
          // Wire abort signal to stop audio queue on interruption
          controller.signal.addEventListener('abort', () => {
            audioAborted = true;
            audioBuffer.clear();
          });
          
          // Start processing audio queue in background
          const audioProcessor = processAudioQueue();
          
          try {
            // Use fetch with streaming body for SSE - AUDIO streaming endpoint
            const headers: Record<string, string> = { "Content-Type": "application/json", ...getAuthHeaders() };
            
            const response = await fetch("/api/avatar/response/stream-audio", {
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
              throw new Error(`Audio stream failed: ${response.status}`);
            }
            
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            
            if (reader) {
              let pendingEventType: string | null = null;
              
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                
                // Process complete SSE events (event + data pairs separated by double newline)
                let eventEndIndex: number;
                while ((eventEndIndex = buffer.indexOf('\n\n')) !== -1) {
                  const eventBlock = buffer.substring(0, eventEndIndex);
                  buffer = buffer.substring(eventEndIndex + 2);
                  
                  // Parse event block which may contain event: and data: lines
                  const lines = eventBlock.split('\n');
                  let eventType: string | null = pendingEventType;
                  let dataStr: string | null = null;
                  
                  for (const line of lines) {
                    if (line.startsWith('event: ')) {
                      eventType = line.slice(7);
                    } else if (line.startsWith('data: ')) {
                      dataStr = line.slice(6);
                    }
                  }
                  
                  pendingEventType = null; // Reset pending
                  
                  if (eventType && dataStr) {
                    try {
                      const data = JSON.parse(dataStr);
                      
                      if (eventType === 'audio') {
                        audioCount++;
                        if (audioCount === 1) {
                          firstAudioTime = performance.now();
                          console.log(`🎯 [AUDIO-STREAMING] First audio ready: ${(firstAudioTime - apiStartTime).toFixed(0)}ms (type: ${data.type})`);
                        }
                        
                        // Buffer audio by index for ordered playback
                        // Thinking sound has index 0, sentences have index 1+
                        const audioIndex = data.type === 'thinking' ? 0 : data.index;
                        audioBuffer.set(audioIndex, {
                          content: data.content,
                          type: data.type,
                          isFinal: data.isFinal
                        });
                        
                        if (data.text) {
                          console.log(`🎯 [AUDIO-STREAMING] Audio ${audioIndex} (${data.type}): "${data.text?.substring(0, 40)}..."`);
                        } else {
                          console.log(`🎯 [AUDIO-STREAMING] Audio ${audioIndex} (${data.type}) buffered`);
                        }
                      } else if (eventType === 'sentence') {
                        // Text event - for logging only
                        console.log(`📝 [AUDIO-STREAMING] Sentence ${data.index}: "${data.content?.substring(0, 50)}..."`);
                      } else if (eventType === 'done') {
                        fullResponse = data.fullResponse;
                        performanceData = data.performance;
                        const totalTime = performance.now() - flowStartTime;
                        console.log(`🎯 [AUDIO-STREAMING] === STREAMING COMPLETE ===`);
                        console.log(`🎯 [AUDIO-STREAMING] Total audio chunks: ${audioCount}`);
                        console.log(`🎯 [AUDIO-STREAMING] First audio delay: ${firstAudioTime ? (firstAudioTime - apiStartTime).toFixed(0) : 'N/A'}ms`);
                        console.log(`🎯 [AUDIO-STREAMING] Time to first audio from backend: ${performanceData?.timeToFirstAudioMs || 'N/A'}ms`);
                        console.log(`🎯 [AUDIO-STREAMING] Total time: ${totalTime.toFixed(0)}ms`);
                        if (performanceData) {
                          console.log(`🎯 [AUDIO-STREAMING] Backend breakdown:`, performanceData);
                        }
                        console.log(`📝 USER MESSAGE: ${message}`);
                        console.log(`🤖 CLAUDE RESPONSE: ${fullResponse}`);
                        console.log(`---`);
                        
                        // Check if there was an error
                        if (data.error) {
                          streamError = true;
                        }
                      } else if (eventType === 'timing') {
                        console.log(`⏱️ [TIMING] Data fetch: ${data.dataFetch}ms`);
                      } else if (eventType === 'status') {
                        console.log(`📊 [STATUS] ${data.phase}: ${data.message}`);
                      } else if (eventType === 'error') {
                        console.error(`❌ [AUDIO-STREAMING] Error: ${data.message}`);
                        if (data.fatal) {
                          streamError = true;
                        }
                      }
                    } catch (e) {
                      // JSON parse error, skip
                    }
                  }
                }
              }
            }
            
            // Mark stream as complete so audio processor can finish
            streamingComplete = true;
            
            // Wait for all audio to be played
            await audioProcessor;
            
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
        const fallbackHeaders: Record<string, string> = { "Content-Type": "application/json", ...getAuthHeaders() };
        
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

        // Video mode: Use avatar with auto-reconnect on 401
        if (sessionDriverRef.current) {
          // ✅ Avatar speaks Claude's response
          // Note: Voice recognition will be paused by AVATAR_START_TALKING event
          console.log("🗣️ SENDING TO AVATAR - Text length:", claudeResponse.length, "characters");
          
          // Store avatar response for echo detection
          lastAvatarResponseRef.current = claudeResponse;
          lastAvatarResponseTimeRef.current = Date.now();
          
          // ⏱️ TIMING: Avatar speak call
          const speakStartTime = performance.now();
          console.log("⏱️ [TIMING] Avatar speak() starting...");
          
          // Helper function to speak with retry on 401
          const speakWithRetry = async (retryCount = 0): Promise<void> => {
            try {
              if (!sessionDriverRef.current) {
                throw new Error("Avatar not available");
              }
              
              // Use the session driver's speak method which handles voice mode internally
              await sessionDriverRef.current.speak(claudeResponse, elevenLabsLanguageCodeRef.current);
              
              const speakEndTime = performance.now();
              console.log(`⏱️ [TIMING] speak() completed: ${(speakEndTime - speakStartTime).toFixed(0)}ms`);
              console.log(`⏱️ [TIMING] === TOTAL FLOW TIME: ${(speakEndTime - flowStartTime).toFixed(0)}ms ===`);
              console.log("✅ Speak completed successfully");
            } catch (speakError) {
              const errorMsg = speakError instanceof Error ? speakError.message : String(speakError);
              
              // Check for 401 Unauthorized - session expired
              if ((errorMsg.includes("401") || errorMsg.includes("Unauthorized")) && retryCount < 1) {
                console.log("🔄 Avatar session expired (401) - auto-reconnecting...");
                
                // Clear old session
                setHeygenSessionActive(false);
                if (sessionDriverRef.current) {
                  try {
                    await sessionDriverRef.current.stop().catch(() => {});
                  } catch (e) {
                    // Ignore errors when stopping expired session
                  }
                }
                sessionDriverRef.current = null;
                
                // Restart avatar session
                try {
                  await startHeyGenSession(currentAvatarIdRef.current);
                  console.log("✅ Avatar session restarted - retrying speak...");
                  
                  // Wait a moment for session to stabilize
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  
                  // Retry speak
                  await speakWithRetry(retryCount + 1);
                } catch (reconnectError) {
                  console.error("❌ Failed to reconnect avatar session:", reconnectError);
                  setShowReconnect(true);
                }
              } else {
                // Non-401 error or already retried - rethrow
                throw speakError;
              }
            }
          };
          
          await speakWithRetry();
          
          // Safety net: if onAvatarStopTalking doesn't fire after speak completes,
          // force-clear speaking state and restart voice recognition.
          // Uses a polling approach: check every 5s up to 30s for voice recognition to resume.
          let safetyNetAttempts = 0;
          const safetyNetMaxAttempts = 6; // 6 x 5s = 30s max
          const safetyNetInterval = setInterval(() => {
            safetyNetAttempts++;
            
            // Stop checking if session ended or recognition already running
            if (!sessionActiveRef.current || recognitionIntentionalStopRef.current || recognitionRunningRef.current) {
              clearInterval(safetyNetInterval);
              return;
            }
            
            // If still "speaking" after 15s, onAvatarStopTalking likely didn't fire
            if (isSpeakingRef.current && safetyNetAttempts >= 3) {
              console.log("🎤 Safety net: clearing stuck speaking state after", safetyNetAttempts * 5, "s");
              isSpeakingRef.current = false;
              setIsSpeakingState(false);
            }
            
            // Try to restart voice recognition
            if (!isSpeakingRef.current && !recognitionRunningRef.current) {
              console.log("🎤 Safety net: restarting voice recognition after speak() (attempt", safetyNetAttempts, ")");
              recognitionIntentionalStopRef.current = false;
              startVoiceRecognition();
              clearInterval(safetyNetInterval);
              return;
            }
            
            if (safetyNetAttempts >= safetyNetMaxAttempts) {
              console.log("🎤 Safety net: max attempts reached, forcing voice recognition restart");
              isSpeakingRef.current = false;
              setIsSpeakingState(false);
              recognitionIntentionalStopRef.current = false;
              startVoiceRecognition();
              clearInterval(safetyNetInterval);
            }
          }, 5000);
          
          // If end session was requested, wait for avatar to finish speaking then end
          if (shouldEndSession) {
            console.log("👋 Farewell spoken - ending session in 3 seconds...");
            setTimeout(async () => {
              console.log("👋 Auto-ending session after farewell");
              await endSessionShowReconnect();
            }, 3000);
          }
        } else if (shouldEndSession) {
          // Audio-only mode with end session - speak farewell then end session
          console.log("👋 Audio-only farewell - speaking with TTS...");
          try {
            const ttsResponse = await fetch('/api/elevenlabs/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                text: claudeResponse, 
                avatarId: currentAvatarIdRef.current,
                languageCode: elevenLabsLanguageCodeRef.current
              })
            });
            if (ttsResponse.ok) {
              const audioBlob = await ttsResponse.blob();
              // 📱 MOBILE FIX: Use shared audio element
              const audio = getSharedAudioElement();
              if (audio.src && audio.src.startsWith('blob:')) {
                URL.revokeObjectURL(audio.src);
              }
              const audioUrl = URL.createObjectURL(audioBlob);
              audio.src = audioUrl;
              currentAudioRef.current = audio;
              audio.onended = async () => {
                URL.revokeObjectURL(audioUrl);
                currentAudioRef.current = null;
                isSpeakingRef.current = false;
                setIsSpeakingState(false);
                console.log("👋 Farewell audio finished - ending session...");
                await endSessionShowReconnect();
              };
              isSpeakingRef.current = true;
              setIsSpeakingState(true);
              audio.load();
              await audio.play();
            } else {
              // TTS failed, still end session
              setTimeout(async () => {
                await endSessionShowReconnect();
              }, 2000);
            }
          } catch (error) {
            console.error("Audio-only farewell TTS failed:", error);
            setTimeout(async () => {
              await endSessionShowReconnect();
            }, 2000);
          }
        } else {
          // Audio-only mode without sessionDriver - use TTS directly
          console.log("🔊 Audio-only mode - speaking with ElevenLabs TTS...");
          try {
            const ttsResponse = await fetch('/api/elevenlabs/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                text: claudeResponse, 
                avatarId: currentAvatarIdRef.current,
                languageCode: elevenLabsLanguageCodeRef.current
              })
            });
            if (ttsResponse.ok) {
              const audioBlob = await ttsResponse.blob();
              // 📱 MOBILE FIX: Use shared audio element
              const audio = getSharedAudioElement();
              if (audio.src && audio.src.startsWith('blob:')) {
                URL.revokeObjectURL(audio.src);
              }
              const audioUrl = URL.createObjectURL(audioBlob);
              audio.src = audioUrl;
              currentAudioRef.current = audio;
              audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
                currentAudioRef.current = null;
                isSpeakingRef.current = false;
                setIsSpeakingState(false);
                console.log("🔊 Audio-only TTS playback finished");
                // Resume voice recognition after audio ends
                if (sessionActiveRef.current && !recognitionRunningRef.current) {
                  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
                  const delay = (isIOS || isSafari) ? 3500 : 1000;
                  setTimeout(() => {
                    if (sessionActiveRef.current && !recognitionRunningRef.current) {
                      startVoiceRecognition();
                      console.log("🎤 Voice recognition resumed after audio-only TTS");
                    }
                  }, delay);
                }
              };
              isSpeakingRef.current = true;
              setIsSpeakingState(true);
              console.log("🔊 Playing audio-only TTS response via shared element...");
              audio.load();
              await audio.play();
            } else {
              console.error("Audio-only TTS request failed:", ttsResponse.status);
              isSpeakingRef.current = false;
              setIsSpeakingState(false);
            }
          } catch (error) {
            console.error("Audio-only TTS failed:", error);
            isSpeakingRef.current = false;
            setIsSpeakingState(false);
          }
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
        
        // Check for 401 Unauthorized error - session expired (fallback if speakWithRetry failed)
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
          console.log("🔄 Avatar session expired (401) - showing reconnect button...");
          setShowReconnect(true);
          setHeygenSessionActive(false);
          sessionDriverRef.current = null;
        }
      }
    } finally {
      // Clear abort controller only if it's still the one we created
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [sessionActive, heygenSessionActive, userId, onResetInactivityTimer, startHeyGenSession, clearIdleTimeout, endSessionShowReconnect, playAcknowledgmentInstantly, stopAcknowledgmentAudio, speakWithElevenLabsInVideoMode]);

  // Wire up handleSubmitMessageRef for use in ElevenLabs STT transcript handler
  useEffect(() => {
    handleSubmitMessageRef.current = handleSubmitMessage;
  }, [handleSubmitMessage]);

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
      // Stop avatar session on unmount (prevents audio continuing when navigating away)
      if (sessionDriverRef.current) {
        try {
          intentionalStopRef.current = true;
          sessionDriverRef.current.stop();
          sessionDriverRef.current = null;
          console.log("🛑 Avatar session stopped on unmount");
        } catch (err) {
          console.error("Failed to stop avatar session on unmount:", err);
        }
      }
      
      // Stop any playing audio
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      
      // Stop voice recognition
      if (recognitionRef.current) {
        try {
          recognitionIntentionalStopRef.current = true;
          recognitionRef.current.abort();
          recognitionRef.current = null;
        } catch (e) {}
      }
      
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
      // Cleanup ElevenLabs STT on unmount
      if (elevenLabsSttWsRef.current) {
        elevenLabsSttWsRef.current.close();
        elevenLabsSttWsRef.current = null;
      }
      if (elevenLabsSttAudioContextRef.current) {
        elevenLabsSttAudioContextRef.current.close().catch(() => {});
        elevenLabsSttAudioContextRef.current = null;
      }
      if (elevenLabsSttStreamRef.current) {
        elevenLabsSttStreamRef.current.getTracks().forEach(track => track.stop());
        elevenLabsSttStreamRef.current = null;
      }
    };
  }, []);

  // Manual voice start for mobile Safari (requires user gesture)
  const manualStartVoice = useCallback(() => {
    console.log("🎤 Manual voice start triggered (user gesture)");
    // Clean up any existing recognition
    if (useElevenLabsSttRef.current) {
      stopElevenLabsSTT();
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }
    recognitionRunningRef.current = false;
    recognitionIntentionalStopRef.current = false;
    startVoiceRecognition();
  }, [startVoiceRecognition, stopElevenLabsSTT]);

  return {
    sessionActive,
    heygenSessionActive,
    isLoading,
    showReconnect,
    videoReady, // True when LiveKit video track is attached and playing
    startSession,
    endSession,
    endSessionShowReconnect,
    reconnect,
    togglePause,
    switchTransportMode,
    isPaused,
    isSpeaking: isSpeakingState,
    microphoneStatus,
    sessionDriverRef,
    intentionalStopRef,
    abortControllerRef,
    currentRequestIdRef,
    speakingIntervalRef,
    hasAskedAnythingElseRef,
    handleSubmitMessage,
    stopAudio,
    manualStartVoice,
    isMicMuted,
    toggleMicMute,
  };
}
