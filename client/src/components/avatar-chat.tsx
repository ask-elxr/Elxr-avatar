import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Maximize, Minimize, X, Send, Mic, Video, Settings } from "lucide-react";

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  context?: string;
}

export function AvatarChat() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: "Hello! I'm your AI avatar assistant. I can help you with questions and I have access to any documents that have been uploaded to my knowledge base. What would you like to know?",
      isUser: false,
      timestamp: new Date(),
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Check if device is mobile
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    // Scroll to bottom when new messages are added
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const endCall = () => {
    // Clear messages and start fresh
    setMessages([{
      id: Date.now().toString(),
      text: "Hello! I'm your AI avatar assistant. I can help you with questions and I have access to any documents that have been uploaded to my knowledge base. What would you like to know?",
      isUser: false,
      timestamp: new Date(),
    }]);
  };

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputMessage,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsTyping(true);

    try {
      // Get context from RAG system
      const contextResponse = await fetch('/api/chat/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: inputMessage, maxTokens: 2000 }),
      });

      let context = '';
      if (contextResponse.ok) {
        const contextData = await contextResponse.json();
        context = contextData.context || '';
      }

      // Simulate AI response with context
      setTimeout(() => {
        const aiResponse: Message = {
          id: (Date.now() + 1).toString(),
          text: generateAIResponse(inputMessage, context),
          isUser: false,
          timestamp: new Date(),
          context: context ? `Used context from uploaded documents: ${context.substring(0, 100)}...` : undefined,
        };

        setMessages(prev => [...prev, aiResponse]);
        setIsTyping(false);
      }, 1500);

    } catch (error) {
      console.error('Error sending message:', error);
      setIsTyping(false);
      
      const errorResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: "I'm sorry, I'm having trouble connecting to my knowledge base right now. Please try again later.",
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorResponse]);
    }
  };

  const generateAIResponse = (userInput: string, context: string): string => {
    const responses = [
      `Thank you for your question about "${userInput}". ${context ? 'Based on the documents in my knowledge base, ' : ''}I'm here to help you with any information you need.`,
      `That's an interesting question! ${context ? 'I found some relevant information in the uploaded documents. ' : ''}Let me provide you with a helpful response.`,
      `I understand you're asking about "${userInput}". ${context ? 'I have access to relevant documentation that can help answer this. ' : ''}How can I assist you further?`,
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="w-full h-screen relative overflow-hidden bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* Avatar Video Section */}
      <div className={`${isFullscreen && isMobile ? 'fixed inset-0 z-50' : 'h-1/2'} bg-black relative`}>
        {/* Avatar Placeholder */}
        <div className="w-full h-full bg-gradient-to-b from-gray-800 to-black flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="w-32 h-32 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <Video className="w-16 h-16 text-white" />
            </div>
            <div className="text-white">
              <h3 className="text-xl font-semibold">AI Avatar</h3>
              <p className="text-sm opacity-80">Ready to assist you</p>
            </div>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="absolute top-4 left-4 right-4 flex justify-between">
          {isMobile && (
            <Button
              onClick={toggleFullscreen}
              className="bg-black/50 hover:bg-black/70 text-white rounded-full p-3 backdrop-blur-sm"
              data-testid="button-fullscreen-toggle"
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </Button>
          )}
          
          <div className="flex gap-2 ml-auto">
            <Button
              className="bg-black/50 hover:bg-black/70 text-white rounded-full p-3 backdrop-blur-sm"
              data-testid="button-mic-toggle"
            >
              <Mic className="w-5 h-5" />
            </Button>
            <Button
              onClick={endCall}
              className="bg-red-600/80 hover:bg-red-700 text-white rounded-full p-3 backdrop-blur-sm"
              data-testid="button-end-call"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Status Indicator */}
        <div className="absolute bottom-4 left-4">
          <div className="bg-green-500 text-white px-3 py-1 rounded-full text-sm flex items-center gap-2">
            <div className="w-2 h-2 bg-green-300 rounded-full animate-pulse"></div>
            Connected
          </div>
        </div>
      </div>

      {/* Chat Section */}
      <div className={`${isFullscreen && isMobile ? 'hidden' : 'h-1/2'} flex flex-col bg-background`}>
        <Card className="flex-1 m-4 flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Chat with Avatar</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col space-y-4">
            {/* Messages */}
            <ScrollArea className="flex-1 pr-4" ref={scrollAreaRef}>
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        message.isUser
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      <p className="text-sm">{message.text}</p>
                      {message.context && (
                        <p className="text-xs opacity-70 mt-2 italic">
                          {message.context}
                        </p>
                      )}
                      <p className="text-xs opacity-50 mt-1">
                        {message.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
                
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg p-3 max-w-[80%]">
                      <div className="flex space-x-2">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Input */}
            <div className="flex gap-2">
              <Input
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                className="flex-1"
                data-testid="input-chat-message"
              />
              <Button 
                onClick={sendMessage} 
                disabled={!inputMessage.trim() || isTyping}
                data-testid="button-send-message"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
