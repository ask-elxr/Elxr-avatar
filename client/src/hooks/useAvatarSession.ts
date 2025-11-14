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
  isLoading: boolean;
  showReconnect: boolean;
  startSession: (options?: StartSessionOptions) => Promise<void>;
  endSession: () => void;
  endSessionShowReconnect: () => Promise<void>;
  reconnect: () => void;
  togglePause: () => Promise<void>;
  isPaused: boolean;
  isSpeaking: boolean;
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
  const [isLoading, setIsLoading] = useState(false);
  const [showReconnect, setShowReconnect] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSpeakingState, setIsSpeakingState] = useState(false);

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

  const startSession = useCallback(async (options?: StartSessionOptions) => {
    setIsLoading(true);
    const { audioOnly = false, avatarId } = options || {};
    audioOnlyRef.current = audioOnly;
    
    const activeAvatarId = avatarId || currentAvatarIdRef.current;
    currentAvatarIdRef.current = activeAvatarId;

    // If audio-only mode, skip HeyGen video session but still register the session
    if (audioOnly) {
      // Hide video element
      if (videoRef.current) {
        videoRef.current.style.display = 'none';
        videoRef.current.style.visibility = 'hidden';
      }
      
      // Register audio-only session with session manager
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
        console.error("Error registering audio-only session:", error);
        setIsLoading(false);
        throw error;
      }
      
      // Set session as active but don't create HeyGen session
      console.log('Audio-only mode: Video disabled, session registered');
      setSessionActive(true);
      setIsLoading(false);
      onSessionActiveChange?.(true);
      
      setTimeout(() => {
        onResetInactivityTimer?.();
      }, 500);
      
      // Return early - don't create HeyGen session
      return;
    }

    // For video mode, ensure video is visible
    if (videoRef.current) {
      console.log('Video mode: Ensuring video element is visible');
      videoRef.current.style.display = 'block';
      videoRef.current.style.visibility = 'visible';
      videoRef.current.style.opacity = '1';
    }

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
        console.log(
          "Stream disconnected - intentionalStop flag:",
          intentionalStopRef.current,
        );
        console.log(
          "Session disconnected - showing reconnect screen to save credits",
        );
        intentionalStopRef.current = false;
        isSpeakingRef.current = false;
        setSessionActive(false);
        setShowReconnect(true);
        onSessionActiveChange?.(false);
        
        endSessionOnServer();
      });

      avatar.on(StreamingEvents.AVATAR_START_TALKING, () => {
        isSpeakingRef.current = true;
        setIsSpeakingState(true);
      });

      avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
        isSpeakingRef.current = false;
        setIsSpeakingState(false);
      });

      // NOTE: USER_TALKING_MESSAGE handler removed to prevent voice transcription issues
      // Avatar's own voice was being transcribed and sent back as new user messages
      // Users can still send text messages via the handleSubmitMessage function

      await avatar.createStartAvatar({
        quality: audioOnly ? AvatarQuality.Low : AvatarQuality.High,
        avatarName: avatarConfig.heygenAvatarId,
        knowledgeBase: avatarConfig.heygenKnowledgeId || undefined,
        voice: avatarConfig.heygenVoiceId ? {
          voiceId: avatarConfig.heygenVoiceId,
          rate: parseFloat(avatarConfig.voiceRate || "1.0"),
        } : {
          rate: parseFloat(avatarConfig.voiceRate || "1.0"),
        },
        language: "en",
        disableIdleTimeout: true,
      });

      // Voice chat disabled to prevent voice transcription issues
      // Users can interact via text input only
      console.log("Avatar session started - text input ready");

      setSessionActive(true);
      onSessionActiveChange?.(true);
      setIsLoading(false);

      // No automatic greeting - saves HeyGen credits
      // User can start conversation via text input
      
      // Reset inactivity timer after session starts
      setTimeout(() => {
        onResetInactivityTimer?.();
      }, 500);
    } catch (error) {
      console.error("Error starting avatar session:", error);
      setIsLoading(false);
      
      endSessionOnServer();
    }
  }, [
    videoRef,
    userId,
    memoryEnabled,
    onSessionActiveChange,
    onResetInactivityTimer,
  ]);

  const endSessionShowReconnect = useCallback(async () => {
    if (abortControllerRef.current) {
      console.log("Cancelling ongoing API request");
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

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

    setSessionActive(false);
    setIsLoading(true);
    setShowReconnect(true);
    onSessionActiveChange?.(false);
    
    endSessionOnServer();
  }, [videoRef, onSessionActiveChange]);

  const endSession = useCallback(() => {
    if (abortControllerRef.current) {
      console.log("Cancelling ongoing API request on end session");
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (avatarRef.current) {
      intentionalStopRef.current = true;
      avatarRef.current.stopAvatar().catch(console.error);
      avatarRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setSessionActive(false);
    setIsLoading(true);
    setShowReconnect(true);
    onSessionActiveChange?.(false);
    
    endSessionOnServer();
  }, [videoRef, onSessionActiveChange]);

  const reconnect = useCallback(() => {
    setShowReconnect(false);
    hasStartedRef.current = false;
    startSession({ audioOnly: audioOnlyRef.current });
  }, [startSession]);

  const togglePause = useCallback(async () => {
    if (isPaused) {
      setIsPaused(false);
      hasStartedRef.current = false;
      startSession({ audioOnly: audioOnlyRef.current });
      console.log("Avatar resuming - restarting session");
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
  }, []);

  const handleSubmitMessage = useCallback(async (message: string) => {
    if (!message.trim() || !sessionActive) return;

    onResetInactivityTimer?.();
    const requestId = Date.now().toString() + Math.random().toString(36);
    currentRequestIdRef.current = requestId;
    console.log("User submitted message - Request ID:", requestId);

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
        // Video mode: Get Claude response then speak via HeyGen
        const response = await fetch("/api/avatar/response", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            userId: memoryEnabled ? userId : undefined,
            avatarId: currentAvatarIdRef.current,
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
          await avatarRef.current.speak({
            text: claudeResponse,
            task_type: TaskType.TALK,
          });
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
  }, [sessionActive, memoryEnabled, userId, onResetInactivityTimer]);

  return {
    sessionActive,
    isLoading,
    showReconnect,
    startSession,
    endSession,
    endSessionShowReconnect,
    reconnect,
    togglePause,
    isPaused,
    isSpeaking: isSpeakingState,
    avatarRef,
    intentionalStopRef,
    abortControllerRef,
    currentRequestIdRef,
    speakingIntervalRef,
    hasAskedAnythingElseRef,
    handleSubmitMessage,
  };
}
