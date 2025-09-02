import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Send, Search, Loader2, Play, Square, Mic, MicOff } from "lucide-react";
import { useAvatarSession } from "@/hooks/use-avatar-session";
import { useMutation } from "@tanstack/react-query";

interface ChatResponse {
  success: boolean;
  message: string;
  metadata: {
    hasContext: boolean;
    hasWebSearch: boolean;
    claudeAvailable: boolean;
    googleSearchAvailable: boolean;
    contextLength: number;
    timestamp: string;
  };
}

export function AvatarChat() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inputMessage, setInputMessage] = useState("");
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<any[]>([]);
  const [showControls, setShowControls] = useState(true);
  
  const {
    isLoading,
    isConnected,
    isSpeaking,
    sessionActive,
    messages,
    error,
    startSession,
    endSession,
    sendMessage: sendToAvatar
  } = useAvatarSession(videoRef);

  // Enhanced chat mutation that processes through Claude backend first
  const chatMutation = useMutation({
    mutationFn: async ({ message, webSearch }: { message: string; webSearch: boolean }): Promise<ChatResponse> => {
      const response = await fetch('/api/chat/enhanced', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          useWebSearch: webSearch,
          conversationHistory: conversationHistory.slice(-10),
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.statusText}`);
      }

      return response.json();
    },
    onSuccess: async (data, variables) => {
      setConversationHistory(prev => [
        ...prev,
        { message: variables.message, isUser: true },
        { message: data.message, isUser: false }
      ]);
      
      if (sessionActive && sendToAvatar) {
        await sendToAvatar(data.message);
      }
      
      setInputMessage("");
    },
  });

  const handleSendMessage = () => {
    if (!inputMessage.trim() || chatMutation.isPending || !sessionActive) return;
    
    chatMutation.mutate({
      message: inputMessage.trim(),
      webSearch: useWebSearch,
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Auto-hide controls after 3 seconds of inactivity
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    
    const resetTimeout = () => {
      setShowControls(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => setShowControls(false), 3000);
    };

    const handleMouseMove = () => resetTimeout();
    const handleMouseClick = () => resetTimeout();

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('click', handleMouseClick);
    resetTimeout();

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('click', handleMouseClick);
      clearTimeout(timeout);
    };
  }, []);

  return (
    <div className="w-full h-screen relative overflow-hidden bg-black">
      {/* Full Screen Avatar Video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
        data-testid="heygen-avatar-video"
      />

      {/* Controls Overlay - Auto-hide */}
      <div className={`absolute inset-0 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        
        {/* Top Controls */}
        <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-50">
          {/* Status */}
          <div className="flex flex-col space-y-2">
            <div className={`px-3 py-1 rounded-full text-sm font-medium backdrop-blur-sm ${
              isConnected 
                ? 'bg-green-500/80 text-white' 
                : 'bg-red-500/80 text-white'
            }`}>
              {isLoading ? 'Connecting...' : isConnected ? 'Connected' : 'Disconnected'}
            </div>
            
            {isSpeaking && (
              <div className="px-3 py-1 rounded-full text-sm font-medium bg-blue-500/80 text-white backdrop-blur-sm">
                Speaking...
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-2">
            {!sessionActive ? (
              <Button
                onClick={startSession}
                disabled={isLoading}
                className="bg-green-600/90 hover:bg-green-700 text-white backdrop-blur-sm"
                data-testid="button-start-avatar"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
              </Button>
            ) : (
              <Button
                onClick={endSession}
                className="bg-red-600/90 hover:bg-red-700 text-white backdrop-blur-sm"
                data-testid="button-stop-avatar"
              >
                <Square className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>

        {/* Bottom Controls */}
        <div className="absolute bottom-4 left-4 right-4 z-50">
          {/* Web Search Toggle */}
          <div className="flex justify-center mb-4">
            <div className="flex items-center space-x-2 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2">
              <Search className="w-4 h-4 text-white" />
              <Switch
                id="web-search"
                checked={useWebSearch}
                onCheckedChange={setUseWebSearch}
                data-testid="switch-web-search"
              />
              <Label htmlFor="web-search" className="text-sm text-white">
                Web Search
              </Label>
            </div>
          </div>

          {/* Chat Input */}
          <div className="flex space-x-3 bg-black/60 backdrop-blur-sm rounded-full p-3">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={sessionActive ? "Ask Claude anything..." : "Start avatar session to chat"}
              className="flex-1 bg-white/90 border-0 rounded-full"
              disabled={chatMutation.isPending || !sessionActive}
              data-testid="input-chat-message"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || chatMutation.isPending || !sessionActive}
              className="bg-blue-500 hover:bg-blue-600 text-white rounded-full w-12 h-12"
              data-testid="button-send-message"
            >
              {chatMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </Button>
          </div>

          {chatMutation.error && (
            <div className="mt-2 text-center">
              <div className="inline-block bg-red-500/90 text-white px-4 py-2 rounded-full text-sm backdrop-blur-sm">
                Error: {chatMutation.error.message}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="absolute bottom-20 left-4 right-4 bg-red-500/90 text-white p-3 rounded-lg backdrop-blur-sm z-40">
          <p className="text-sm text-center">{error}</p>
        </div>
      )}
    </div>
  );
}
