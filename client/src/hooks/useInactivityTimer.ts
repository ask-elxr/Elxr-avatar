import { useRef, useEffect, useCallback } from "react";
import type { SessionDriver } from "./sessionDrivers";

interface InactivityTimerConfig {
  sessionActive: boolean;
  isPaused: boolean;
  sessionDriverRef: React.MutableRefObject<SessionDriver | null>;
  speakingIntervalRef: React.MutableRefObject<NodeJS.Timeout | null>;
  hasAskedAnythingElseRef: React.MutableRefObject<boolean>;
  onEndSessionShowReconnect: () => Promise<void>;
  isVideoMode?: boolean;
  onSpeakWarning?: (message: string) => Promise<void>;
}

interface InactivityTimerReturn {
  resetInactivityTimer: () => void;
  clearAllTimers: () => void;
}

const POLITE_WARNING = "Hey, are you still there? Just say something if you'd like to keep chatting.";
const POLITE_FAREWELL = "Looks like you stepped away. I'll be right here whenever you're ready to pick back up — just hit reconnect!";

// Estimate speech duration: average speaking rate is ~150 words per minute, plus buffer for avatar animation
function estimateSpeechDuration(message: string): number {
  const wordCount = message.split(/\s+/).length;
  const millisecondsPerWord = 400; // ~150 wpm = 400ms per word
  const animationBuffer = 2000; // Extra time for avatar animation startup/wind-down
  return Math.max(wordCount * millisecondsPerWord + animationBuffer, 5000); // Minimum 5 seconds
}

export function useInactivityTimer({
  sessionActive,
  isPaused,
  sessionDriverRef,
  speakingIntervalRef,
  hasAskedAnythingElseRef,
  onEndSessionShowReconnect,
  isVideoMode = false,
  onSpeakWarning,
}: InactivityTimerConfig): InactivityTimerReturn {
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const signOffTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasShownWarningRef = useRef<boolean>(false);

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
    
    hasShownWarningRef.current = false;
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

      if (sessionDriverRef.current) {
        sessionDriverRef.current.interrupt().catch(() => {});
      }
    }

    if (speakingIntervalRef.current) {
      clearInterval(speakingIntervalRef.current);
      speakingIntervalRef.current = null;
      console.log("Cleared speaking interval - user interrupted");
    }

    hasAskedAnythingElseRef.current = false;
    hasShownWarningRef.current = false;

    const warningDelay = 45000;
    const signOffDelay = 15000;

    inactivityTimerRef.current = setTimeout(async () => {
      console.log(`⏰ Inactivity warning triggered after ${warningDelay / 1000}s - prompting user`);
      hasShownWarningRef.current = true;
      
      if (sessionDriverRef.current && onSpeakWarning) {
        try {
          await onSpeakWarning(POLITE_WARNING);
        } catch (error) {
          console.error("Failed to speak warning:", error);
        }
      }

      signOffTimeoutRef.current = setTimeout(async () => {
        console.log(`⏰ Sign-off triggered after ${signOffDelay / 1000}s grace period - ending session`);
        
        let farewellComplete = false;
        
        if (onSpeakWarning) {
          try {
            await onSpeakWarning(POLITE_FAREWELL);
            // Wait for farewell speech to complete based on message length
            const estimatedDuration = estimateSpeechDuration(POLITE_FAREWELL);
            console.log(`⏳ Waiting ${estimatedDuration}ms for farewell speech to complete`);
            await new Promise(resolve => setTimeout(resolve, estimatedDuration));
            farewellComplete = true;
          } catch (error) {
            console.error("Failed to speak farewell:", error);
            farewellComplete = true; // Continue even if farewell fails
          }
        } else {
          farewellComplete = true;
        }
        
        // Only end session after farewell is complete or if we failed
        if (farewellComplete) {
          console.log("✅ Farewell complete, ending session");
          onEndSessionShowReconnect();
        }
      }, signOffDelay);
    }, warningDelay);
  }, [sessionDriverRef, speakingIntervalRef, onEndSessionShowReconnect, isVideoMode, onSpeakWarning]);

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
