import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2 } from "lucide-react";
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
  const [conversationHistory, setConversationHistory] = useState<any[]>([]);
  
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
    mutationFn: async ({ message }: { message: string }): Promise<ChatResponse> => {
      const response = await fetch('/api/chat/enhanced', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          useWebSearch: true,
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
    if (!inputMessage.trim() || chatMutation.isPending) return;
    
    // Auto-start session if not active
    if (!sessionActive && !isLoading) {
      startSession();
    }
    
    chatMutation.mutate({
      message: inputMessage.trim(),
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Auto-start session when component mounts
  useState(() => {
    if (!sessionActive && !isLoading && !error) {
      setTimeout(() => startSession(), 1000);
    }
  });

  return (
    <div className="h-screen w-full relative bg-black">
      {/* Full Screen Avatar Video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={false}
        className="w-full h-full object-cover"
        data-testid="heygen-avatar-video"
      />

      {/* Bottom Input Bar - Exactly like the screenshots */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
        <div className="flex space-x-2 max-w-4xl mx-auto">
          <Input
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            className="flex-1 bg-white/95 border-0 rounded-full h-12 px-4 text-black"
            disabled={chatMutation.isPending}
            data-testid="input-chat-message"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || chatMutation.isPending}
            className="bg-red-500 hover:bg-red-600 text-white rounded-full w-12 h-12 p-0"
            data-testid="button-send-message"
          >
            {chatMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </div>

        {/* Error message */}
        {(chatMutation.error || error) && (
          <div className="mt-2 text-center">
            <div className="inline-block bg-red-500/90 text-white px-4 py-2 rounded-full text-sm">
              {chatMutation.error?.message || error}
            </div>
          </div>
        )}
      </div>

      {/* Session status indicator */}
      {!sessionActive && !isLoading && (
        <div className="absolute top-4 left-4 bg-yellow-500/80 text-white px-3 py-1 rounded-full text-sm">
          Starting session...
        </div>
      )}
    </div>
  );
}
