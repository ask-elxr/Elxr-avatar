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

  const fetchAccessToken = async (): Promise<string> => {
    const response = await fetch("/api/heygen/token", {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error("Failed to fetch access token");
    }

    const data = await response.json();
    return data.token;
  };

  const startSession = useCallback(async (options?: StartSessionOptions) => {
    setIsLoading(true);
    const { audioOnly = false, avatarId } = options || {};
    audioOnlyRef.current = audioOnly;
    
    const activeAvatarId = avatarId || currentAvatarIdRef.current;
    currentAvatarIdRef.current = activeAvatarId;

    // If audio-only mode, skip HeyGen video session
    if (audioOnly) {
      // Hide video element
      if (videoRef.current) {
        videoRef.current.style.display = 'none';
        videoRef.current.style.visibility = 'hidden';
      }
      
      // Set session as active but don't create HeyGen session
      console.log('Audio-only mode: Video disabled');
      setSessionActive(true);
      setIsLoading(false);
      onSessionActiveChange?.(true);
      
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

      const greetings = [
        "Hey there — I'm Mark Kohl. You're actually talking to my digital self, but everything you'll hear comes directly from my real experiences, my research, and my life's work.",
        "Hi, I'm Mark Kohl. This is my avatar — but what you're about to hear comes straight from me. I helped build this AI so my work could reach more people, in more ways.",
        "Hello. I'm Mark Kohl — or at least, the AI version of me. I've spent years teaching, learning, and exploring what makes us human. This is my way of sharing that knowledge with anyone who needs it.",
        "Hey there. I'm Mark Kohl — or at least, the AI version of me. I created this so I could be here even when I can't be in person.",
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
        "Hi, I'm Mark Kohl. The version you're seeing here might be digital, but the heart, intention, and voice behind it are 100% human.",
      ];

      const randomGreeting =
        greetings[Math.floor(Math.random() * greetings.length)];
      await avatar
        .speak({
          text: randomGreeting,
          task_type: TaskType.TALK,
        })
        .catch(console.error);

      setTimeout(() => {
        onResetInactivityTimer?.();
      }, 2000);
    } catch (error) {
      console.error("Error starting avatar session:", error);
      setIsLoading(false);
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
        await avatarRef.current.speak({
          text: "Well, if that's all I've got to work with here... guess I'll save us both some credits and take a break. Hit that reconnect button when you're ready for round two!",
          task_type: TaskType.TALK,
        });

        await new Promise((resolve) => setTimeout(resolve, 2000));

        intentionalStopRef.current = true;
        console.log("Setting intentionalStop flag to TRUE for timeout");

        await avatarRef.current.stopAvatar().catch(console.error);
        avatarRef.current = null;
      } catch (error) {
        console.error("Error in timeout message:", error);
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
    }
  }, [isPaused, startSession, videoRef, onSessionActiveChange]);

  useEffect(() => {
    return () => {
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

      // Speak the response based on mode
      if (audioOnlyRef.current) {
        // Audio-only mode: Use ElevenLabs TTS
        console.log("Audio-only mode: Using ElevenLabs TTS");
        isSpeakingRef.current = true;
        setIsSpeakingState(true);

        try {
          const ttsResponse = await fetch("/api/elevenlabs/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: claudeResponse,
            avatarId: currentAvatarIdRef.current,
          }),
          signal: controller.signal,
        });

        if (ttsResponse.ok) {
          const audioBlob = await ttsResponse.blob();
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
        } else {
          // TTS fetch failed - clear state
          isSpeakingRef.current = false;
          setIsSpeakingState(false);
          currentAudioRef.current = null;
          const errorText = await ttsResponse.text();
          console.error("Failed to generate TTS audio:", ttsResponse.status, errorText);
        }
        } catch (ttsError) {
          // TTS fetch or playback error - clear state
          isSpeakingRef.current = false;
          setIsSpeakingState(false);
          currentAudioRef.current = null;
          if (ttsError instanceof Error && ttsError.name !== "AbortError") {
            console.error("TTS error:", ttsError);
          }
        }
      } else if (avatarRef.current) {
        // Video mode: Use HeyGen avatar
        await avatarRef.current.speak({
          text: claudeResponse,
          task_type: TaskType.TALK,
        });
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
