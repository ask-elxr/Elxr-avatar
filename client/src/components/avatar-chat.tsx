import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Send, Bot, User, Search, Loader2, Play, Square } from "lucide-react";
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
          conversationHistory: conversationHistory.slice(-10), // Last 10 messages for context
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.statusText}`);
      }

      return response.json();
    },
    onSuccess: async (data, variables) => {
      // Update conversation history
      setConversationHistory(prev => [
        ...prev,
        { message: variables.message, isUser: true },
        { message: data.message, isUser: false }
      ]);
      
      // Send Claude's response to the avatar to speak
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

  return (
    <div className="flex h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800">
      {/* Left Panel - Avatar Video */}
      <div className="flex-1 relative bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
          data-testid="heygen-avatar-video"
        />
        
        {/* Avatar Status Overlay */}
        <div className="absolute top-4 left-4 z-10">
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
            isConnected 
              ? 'bg-green-500/80 text-white' 
              : 'bg-red-500/80 text-white'
          }`}>
            {isLoading ? 'Connecting...' : isConnected ? 'Connected' : 'Disconnected'}
          </div>
          
          {isSpeaking && (
            <div className="mt-2 px-3 py-1 rounded-full text-sm font-medium bg-blue-500/80 text-white">
              Speaking...
            </div>
          )}
        </div>

        {/* Avatar Controls */}
        <div className="absolute top-4 right-4 z-10 flex space-x-2">
          {!sessionActive ? (
            <Button
              onClick={startSession}
              disabled={isLoading}
              className="bg-green-600 hover:bg-green-700 text-white"
              data-testid="button-start-avatar"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            </Button>
          ) : (
            <Button
              onClick={endSession}
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="button-stop-avatar"
            >
              <Square className="w-4 h-4" />
            </Button>
          )}
        </div>

        {error && (
          <div className="absolute bottom-4 left-4 right-4 bg-red-500/90 text-white p-3 rounded-lg">
            <p className="text-sm">{error}</p>
          </div>
        )}
      </div>

      {/* Right Panel - Chat Interface */}
      <div className="w-96 flex flex-col bg-white dark:bg-slate-800 border-l border-gray-200 dark:border-slate-700">
        {/* Chat Header */}
        <div className="p-4 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Claude AI Chat</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Powered by Anthropic</p>
            </div>
          </div>
          
          {/* Web Search Toggle */}
          <div className="flex items-center space-x-2">
            <Search className="w-4 h-4 text-gray-500" />
            <Switch
              id="web-search"
              checked={useWebSearch}
              onCheckedChange={setUseWebSearch}
              data-testid="switch-web-search"
            />
            <Label htmlFor="web-search" className="text-sm text-gray-600 dark:text-gray-300">
              Web Search
            </Label>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && conversationHistory.length === 0 && (
            <div className="text-center text-gray-500 dark:text-gray-400 mt-10">
              <Bot className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <h3 className="font-medium mb-1">Chat with Claude</h3>
              <p className="text-sm">Your messages will be processed by Claude and spoken by the avatar</p>
            </div>
          )}

          {/* Show avatar messages from SDK */}
          {messages.map((message, index) => (
            <div key={index} className="flex justify-start">
              <Card className="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
                <CardContent className="p-3">
                  <div className="flex items-start space-x-2">
                    <Bot className="w-4 h-4 mt-0.5 text-purple-600 dark:text-purple-400" />
                    <div>
                      <div className="text-sm text-gray-700 dark:text-gray-300">{message.text}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{message.timestamp}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}

          {/* Show enhanced conversation history */}
          {conversationHistory.slice(-5).map((msg, index) => (
            <div key={`history_${index}`} className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}>
              <Card className={`max-w-xs ${
                msg.isUser 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-100 dark:bg-slate-700'
              }`}>
                <CardContent className="p-3">
                  <div className="flex items-start space-x-2">
                    {msg.isUser ? (
                      <User className="w-4 h-4 mt-0.5 text-white" />
                    ) : (
                      <Bot className="w-4 h-4 mt-0.5 text-gray-600 dark:text-gray-300" />
                    )}
                    <div className="text-sm">{msg.message}</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
          
          {chatMutation.isPending && (
            <div className="flex justify-center">
              <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Claude is processing...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-gray-200 dark:border-slate-700">
          <div className="flex space-x-2">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask Claude anything..."
              className="flex-1"
              disabled={chatMutation.isPending || !sessionActive}
              data-testid="input-chat-message"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || chatMutation.isPending || !sessionActive}
              className="bg-blue-500 hover:bg-blue-600 text-white"
              data-testid="button-send-message"
            >
              {chatMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          
          {chatMutation.error && (
            <div className="mt-2 text-sm text-red-600 dark:text-red-400">
              Error: {chatMutation.error.message}
            </div>
          )}
          
          {!sessionActive && (
            <div className="mt-2 text-sm text-amber-600 dark:text-amber-400">
              Start the avatar session to begin chatting
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
