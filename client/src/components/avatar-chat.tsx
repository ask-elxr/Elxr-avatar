import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Send, Bot, User, Search, Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: string;
  hasWebSearch?: boolean;
}

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [useWebSearch, setUseWebSearch] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
          conversationHistory: messages.slice(-10), // Last 10 messages for context
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.statusText}`);
      }

      return response.json();
    },
    onSuccess: (data, variables) => {
      // Add user message
      const userMessage: Message = {
        id: `user_${Date.now()}`,
        content: variables.message,
        isUser: true,
        timestamp: new Date().toISOString(),
      };

      // Add AI response
      const aiMessage: Message = {
        id: `ai_${Date.now()}`,
        content: data.message,
        isUser: false,
        timestamp: data.metadata.timestamp,
        hasWebSearch: data.metadata.hasWebSearch,
      };

      setMessages(prev => [...prev, userMessage, aiMessage]);
      setInputMessage("");
    },
  });

  const sendMessage = () => {
    if (!inputMessage.trim() || chatMutation.isPending) return;
    
    chatMutation.mutate({
      message: inputMessage.trim(),
      webSearch: useWebSearch,
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 shadow-sm border-b border-gray-200 dark:border-slate-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Claude AI Assistant</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Powered by Anthropic Claude with web search</p>
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
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 dark:text-gray-400 mt-20">
            <Bot className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-medium mb-2">Welcome to Claude AI</h3>
            <p>Ask me anything! I can help with questions, analysis, and more.</p>
            <p className="text-sm mt-2">Toggle web search for current information.</p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`flex max-w-3xl ${message.isUser ? 'flex-row-reverse' : 'flex-row'} space-x-3`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                message.isUser 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300'
              }`}>
                {message.isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              
              <Card className={`${message.isUser ? 'bg-blue-500 text-white' : 'bg-white dark:bg-slate-800'} shadow-sm`}>
                <CardContent className="p-3">
                  <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                  {!message.isUser && message.hasWebSearch && (
                    <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center">
                      <Search className="w-3 h-3 mr-1" />
                      Included web search results
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        ))}
        
        {chatMutation.isPending && (
          <div className="flex justify-start">
            <div className="flex max-w-3xl space-x-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-gray-200 dark:bg-slate-700">
                <Loader2 className="w-4 h-4 animate-spin text-gray-700 dark:text-gray-300" />
              </div>
              <Card className="bg-white dark:bg-slate-800 shadow-sm">
                <CardContent className="p-3">
                  <div className="text-sm text-gray-500 dark:text-gray-400">Claude is thinking...</div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 p-4">
        <div className="flex space-x-4">
          <Input
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask Claude anything..."
            className="flex-1"
            disabled={chatMutation.isPending}
            data-testid="input-chat-message"
          />
          <Button
            onClick={sendMessage}
            disabled={!inputMessage.trim() || chatMutation.isPending}
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
      </div>
    </div>
  );
}
