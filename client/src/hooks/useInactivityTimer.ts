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

    // Auto-end session after 5 minutes of silence to save credits
    // No farewell message - just show reconnect button
    inactivityTimerRef.current = setTimeout(async () => {
      console.log("Inactivity timeout triggered - 5 minutes elapsed, ending session to save credits");
      onEndSessionShowReconnect();
    }, 300000); // 5 minutes = 300,000ms
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
