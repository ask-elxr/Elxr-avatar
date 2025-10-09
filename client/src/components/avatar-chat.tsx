import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Maximize, Minimize, MessageSquare, Mic, MicOff, Power } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAvatarSession } from "@/hooks/use-avatar-session";

export function AvatarChat() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [micPermission, setMicPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const { user, isAuthenticated } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const {
    isLoading,
    isConnected,
    isSpeaking,
    sessionActive,
    messages,
    error,
    startSession,
    endSession,
    sendMessage
  } = useAvatarSession(videoRef);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const requestMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermission('granted');
      stream.getTracks().forEach(track => track.stop());
      alert('✅ Microphone permission granted! The avatar can now hear you.');
    } catch (err) {
      setMicPermission('denied');
      alert('❌ Microphone access denied. Click the 🔒 lock icon in your browser address bar and allow microphone access.');
    }
  };

  const handleSendMessage = () => {
    if (userInput.trim() && sessionActive) {
      sendMessage(userInput);
      setUserInput("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="w-full h-screen relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      {/* Fullscreen Button - Mobile Only */}
      {isMobile && (
        <Button
          onClick={toggleFullscreen}
          className="absolute top-4 left-4 z-50 bg-black/50 hover:bg-black/70 text-white rounded-full p-3 backdrop-blur-sm"
          data-testid="button-fullscreen-toggle"
        >
          {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
        </Button>
      )}

      {/* Control Buttons - Top Right */}
      <div className="absolute top-4 right-4 z-50 flex gap-2">
        {/* Power Button - Start/Stop Session */}
        <Button
          onClick={sessionActive ? endSession : startSession}
          disabled={isLoading}
          className={`${
            sessionActive 
              ? 'bg-red-600/80 hover:bg-red-700' 
              : 'bg-green-600/80 hover:bg-green-700'
          } text-white rounded-full p-3 backdrop-blur-sm ${isLoading ? 'animate-pulse' : ''}`}
          data-testid="button-session-toggle"
          title={sessionActive ? 'End avatar session' : 'Start avatar session'}
        >
          <Power className="w-5 h-5" />
        </Button>

        {/* Microphone Permission Button */}
        <Button
          onClick={requestMicrophonePermission}
          className={`${
            micPermission === 'granted' 
              ? 'bg-green-600/80 hover:bg-green-700' 
              : micPermission === 'denied'
              ? 'bg-yellow-600/80 hover:bg-yellow-700'
              : 'bg-orange-600/80 hover:bg-orange-700'
          } text-white rounded-full p-3 backdrop-blur-sm`}
          data-testid="button-microphone-permission"
          title={
            micPermission === 'granted' 
              ? 'Microphone access granted' 
              : micPermission === 'denied'
              ? 'Microphone access denied - click to retry'
              : 'Click to enable microphone access'
          }
        >
          {micPermission === 'granted' ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </Button>
      </div>

      {/* Video Avatar */}
      <div className={`w-full h-full flex items-center justify-center ${isFullscreen && isMobile ? 'transform scale-[4] origin-center' : ''}`}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
          data-testid="heygen-avatar-video"
        />
        
        {!sessionActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="text-center text-white">
              <h2 className="text-2xl font-bold mb-4">AI Avatar Ready</h2>
              <p className="text-lg mb-6">Click the green power button to start</p>
              {error && (
                <p className="text-red-400 mt-2">Error: {error}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Chat Interface - Bottom */}
      {sessionActive && (
        <div className="absolute bottom-0 left-0 right-0 z-50 bg-black/70 backdrop-blur-sm text-white p-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex gap-2">
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="input-chat-message"
                disabled={!sessionActive || isSpeaking}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!userInput.trim() || !sessionActive || isSpeaking}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6"
                data-testid="button-send-message"
              >
                <MessageSquare className="w-5 h-5" />
              </Button>
            </div>
            
            {isSpeaking && (
              <p className="text-sm text-blue-400 mt-2 animate-pulse">Avatar is speaking...</p>
            )}
            
            <p className="text-xs text-white/60 mt-2">
              💡 Powered by Claude Sonnet 4 + Pinecone + Google Search (Current 2025 Data)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
