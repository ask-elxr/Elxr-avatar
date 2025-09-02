import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useAvatarSession } from "@/hooks/use-avatar-session";

export function AvatarChat() {
  const [sessionTimer, setSessionTimer] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const {
    isLoading,
    isConnected,
    sessionActive,
    startSession,
    endSession,
    error
  } = useAvatarSession(videoRef);

  // Session timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (sessionActive) {
      interval = setInterval(() => {
        setSessionTimer(prev => prev + 1);
      }, 1000);
    } else {
      setSessionTimer(0);
    }
    return () => clearInterval(interval);
  }, [sessionActive]);

  const formatTimeRemaining = (seconds: number) => {
    const remaining = Math.max(0, 900 - seconds); // 15 minutes max
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    return `Time remaining ${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
      <div className="w-full max-w-2xl mx-auto">
        {/* Avatar Video Container */}
        <div className="relative bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-lg aspect-video">
          
          {/* Loading State */}
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-800">
              <div className="flex flex-col items-center space-y-4">
                <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse delay-75"></div>
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse delay-150"></div>
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse delay-300"></div>
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse delay-500"></div>
                </div>
              </div>
            </div>
          )}

          {/* Avatar Video */}
          {isConnected && (
            <div className="absolute inset-0">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                autoPlay
                playsInline
                muted
                data-testid="avatar-video"
              />

              {/* Session Timer - Top Right */}
              <div className="absolute top-4 right-4 bg-black bg-opacity-70 text-white px-3 py-1 rounded text-sm">
                <span data-testid="session-timer">{formatTimeRemaining(sessionTimer)}</span>
              </div>
            </div>
          )}

          {/* Initial State - Chat Now Button */}
          {!isLoading && !isConnected && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-800">
              <div className="text-center space-y-6">
                <div className="w-24 h-24 bg-blue-600 rounded-full flex items-center justify-center mx-auto">
                  <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <Button 
                  onClick={startSession}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 text-lg rounded-lg"
                  data-testid="button-chat-now"
                >
                  Chat now
                </Button>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-800">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                  <span className="text-red-600 text-2xl">⚠</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Connection Error</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{error}</p>
                  <Button 
                    onClick={startSession}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
                    data-testid="button-retry"
                  >
                    Try Again
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Controls */}
          {sessionActive && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-4">
              <div className="flex items-center justify-between">
                {/* Progress Dots */}
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                  <div className="w-2 h-2 bg-white/50 rounded-full"></div>
                  <div className="w-2 h-2 bg-white/50 rounded-full"></div>
                  <div className="w-2 h-2 bg-white/50 rounded-full"></div>
                  <div className="w-2 h-2 bg-white/50 rounded-full"></div>
                  <div className="w-2 h-2 bg-white/50 rounded-full"></div>
                  <div className="w-2 h-2 bg-white/50 rounded-full"></div>
                  <div className="w-2 h-2 bg-white/50 rounded-full"></div>
                </div>

                {/* End Chat Button */}
                <Button
                  onClick={endSession}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm"
                  data-testid="button-end-chat"
                >
                  End Chat
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
