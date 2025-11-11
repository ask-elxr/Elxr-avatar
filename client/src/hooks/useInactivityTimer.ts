import { useRef, useEffect, useCallback } from "react";
import { TaskType } from "@heygen/streaming-avatar";

interface InactivityTimerConfig {
  sessionActive: boolean;
  isPaused: boolean;
  avatarRef: React.MutableRefObject<any | null>;
  speakingIntervalRef: React.MutableRefObject<NodeJS.Timeout | null>;
  hasAskedAnythingElseRef: React.MutableRefObject<boolean>;
  onEndSessionShowReconnect: () => Promise<void>;
}

interface InactivityTimerReturn {
  resetInactivityTimer: () => void;
  clearAllTimers: () => void;
}

export function useInactivityTimer({
  sessionActive,
  isPaused,
  avatarRef,
  speakingIntervalRef,
  hasAskedAnythingElseRef,
  onEndSessionShowReconnect,
}: InactivityTimerConfig): InactivityTimerReturn {
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const signOffTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearAllTimers = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }

    if (signOffTimeoutRef.current) {
      clearTimeout(signOffTimeoutRef.current);
      signOffTimeoutRef.current = null;
    }

    if (speakingIntervalRef.current) {
      clearInterval(speakingIntervalRef.current);
      speakingIntervalRef.current = null;
    }
  }, [speakingIntervalRef]);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      console.log("Inactivity timer cleared and reset");
    } else {
      console.log("Inactivity timer started for first time");
    }

    if (signOffTimeoutRef.current) {
      clearTimeout(signOffTimeoutRef.current);
      signOffTimeoutRef.current = null;
      console.log("Sign-off timeout cancelled - user is active again");

      if (avatarRef.current) {
        avatarRef.current.interrupt().catch(() => {});
      }
    }

    if (speakingIntervalRef.current) {
      clearInterval(speakingIntervalRef.current);
      speakingIntervalRef.current = null;
      console.log("Cleared speaking interval - user interrupted");
    }

    hasAskedAnythingElseRef.current = false;

    inactivityTimerRef.current = setTimeout(async () => {
      console.log("Inactivity timeout triggered - 1 minute elapsed");

      if (avatarRef.current) {
        try {
          await avatarRef.current.interrupt().catch(() => {});

          const anythingElseMessage =
            "Is there anything else I can help you with today?";

          hasAskedAnythingElseRef.current = true;

          await avatarRef.current.speak({
            text: anythingElseMessage,
            task_type: TaskType.TALK,
          });

          console.log("'Anything else?' message delivered");

          signOffTimeoutRef.current = setTimeout(async () => {
            const finalMessage =
              "Alright. Thanks for the conversation - hope it was helpful. Take care.";

            if (avatarRef.current) {
              await avatarRef.current.speak({
                text: finalMessage,
                task_type: TaskType.TALK,
              });

              setTimeout(() => {
                onEndSessionShowReconnect();
              }, 5000);
            } else {
              onEndSessionShowReconnect();
            }
          }, 20000);
        } catch (error) {
          console.error("Error during sign-off:", error);
          onEndSessionShowReconnect();
        }
      } else {
        onEndSessionShowReconnect();
      }
    }, 60000);
  }, [avatarRef, speakingIntervalRef, onEndSessionShowReconnect]);

  useEffect(() => {
    if (sessionActive && !isPaused) {
      resetInactivityTimer();
    }

    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [sessionActive, isPaused, resetInactivityTimer]);

  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, [clearAllTimers]);

  return {
    resetInactivityTimer,
    clearAllTimers,
  };
}
