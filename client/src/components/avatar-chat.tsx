import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useAvatarSession } from "@/hooks/use-avatar-session";
import { MessageCircle, Send, Mic, Zap, CheckCircle, Shield } from "lucide-react";

export function AvatarChat() {
  const [message, setMessage] = useState("");
  const [sessionTimer, setSessionTimer] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);

  const {
    isLoading,
    isConnected,
    isSpeaking,
    sessionActive,
    messages,
    startSession,
    endSession,
    sendMessage: sendAvatarMessage,
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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTimeRemaining = (seconds: number) => {
    const remaining = Math.max(0, 900 - seconds); // 15 minutes max
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    return `Time remaining ${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSendMessage = () => {
    if (message.trim() && sessionActive) {
      sendAvatarMessage(message.trim());
      setMessage("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      {/* Header */}
      <div className="w-full max-w-4xl mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">H</span>
            </div>
            <h1 className="text-2xl font-semibold text-foreground">HeyGen Interactive Avatar</h1>
          </div>
          <div className="hidden md:flex items-center space-x-4">
            <span className="text-sm text-muted-foreground">Powered by AI</span>
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          </div>
        </div>
      </div>

      {/* Main Chat Interface */}
      <div className="w-full max-w-4xl">
        <Card className="overflow-hidden shadow-lg">
          {/* Video Section */}
          <div className="relative bg-muted aspect-video md:aspect-[16/10]">
            
            {/* Loading State */}
            {isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted z-10">
                <div className="flex flex-col items-center space-y-4">
                  <LoadingSpinner size="lg" />
                  <p className="text-muted-foreground text-lg font-medium">Initializing Avatar...</p>
                  <p className="text-sm text-muted-foreground">Please wait while we set up your chat session</p>
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

                {/* Speaking Indicator */}
                {isSpeaking && (
                  <div className="absolute top-4 left-4" data-testid="speaking-indicator">
                    <div className="bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-medium flex items-center space-x-2">
                      <div className="w-2 h-2 bg-primary-foreground rounded-full animate-pulse"></div>
                      <span>Speaking...</span>
                    </div>
                  </div>
                )}

                {/* Session Timer */}
                <div className="absolute top-4 right-4 bg-black bg-opacity-50 text-white px-3 py-1 rounded-lg text-sm font-medium">
                  <span data-testid="session-timer">{formatTimeRemaining(sessionTimer)}</span>
                </div>
              </div>
            )}

            {/* Welcome State */}
            {!isLoading && !isConnected && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-primary/5 to-accent/5">
                <div className="text-center space-y-6 p-8">
                  <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mx-auto">
                    <MessageCircle className="w-10 h-10 text-primary-foreground" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-semibold text-foreground mb-2">Start Your Conversation</h2>
                    <p className="text-muted-foreground">Click the button below to begin chatting with your AI avatar</p>
                  </div>
                  <Button 
                    onClick={startSession}
                    className="px-8 py-3 text-lg"
                    data-testid="button-start-chat"
                  >
                    Start Chat Session
                  </Button>
                </div>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted z-10">
                <div className="text-center space-y-4 p-8">
                  <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
                    <span className="text-destructive text-2xl">⚠</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">Connection Error</h3>
                    <p className="text-sm text-muted-foreground mb-4">{error}</p>
                    <Button 
                      onClick={startSession}
                      variant="outline"
                      data-testid="button-retry"
                    >
                      Try Again
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Chat Interface */}
          <div className="border-t border-border bg-card">
            
            {/* Chat Messages */}
            {sessionActive && messages.length > 0 && (
              <div className="max-h-40 overflow-y-auto p-4 space-y-3" data-testid="chat-messages">
                {messages.map((msg, index) => (
                  <div key={index} className="flex space-x-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      msg.type === 'user' ? 'bg-muted' : 'bg-primary'
                    }`}>
                      <span className={`text-xs font-medium ${
                        msg.type === 'user' ? 'text-muted-foreground' : 'text-primary-foreground'
                      }`}>
                        {msg.type === 'user' ? 'U' : 'AI'}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-foreground">{msg.text}</p>
                      <span className="text-xs text-muted-foreground">{msg.timestamp}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Chat Controls */}
            {sessionActive && (
              <div className="p-4 border-t border-border">
                <div className="flex space-x-3">
                  <div className="flex-1">
                    <div className="relative">
                      <Input
                        ref={messageInputRef}
                        type="text"
                        placeholder="Type your message..."
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyPress={handleKeyPress}
                        className="pr-12"
                        data-testid="input-message"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 h-8 w-8"
                        data-testid="button-voice-input"
                      >
                        <Mic className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <Button 
                    onClick={handleSendMessage}
                    disabled={!message.trim() || isSpeaking}
                    data-testid="button-send-message"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Send
                  </Button>
                </div>
              </div>
            )}

            {/* Session Controls */}
            {sessionActive && (
              <div className="p-4 bg-muted/30 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm text-muted-foreground">Connected</span>
                  </div>
                  <div className="hidden md:flex items-center space-x-2 text-sm text-muted-foreground">
                    <span data-testid="text-session-duration">Session: {formatTime(sessionTimer)}</span>
                  </div>
                </div>
                <Button
                  variant="destructive"
                  onClick={endSession}
                  data-testid="button-end-chat"
                >
                  End Chat
                </Button>
              </div>
            )}

            {/* Initial Controls */}
            {!sessionActive && !isLoading && !error && (
              <div className="p-6 text-center space-y-4">
                <p className="text-muted-foreground">Ready to start your interactive chat session?</p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button 
                    onClick={startSession}
                    className="flex items-center space-x-2"
                    data-testid="button-chat-now"
                  >
                    <MessageCircle className="w-5 h-5" />
                    <span>Chat Now</span>
                  </Button>
                  <Button 
                    variant="outline"
                    data-testid="button-learn-more"
                  >
                    Learn More
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Feature Info */}
        <div className="mt-8 grid md:grid-cols-3 gap-6">
          <Card className="text-center p-6">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Zap className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">Real-time Interaction</h3>
            <p className="text-sm text-muted-foreground">Engage in natural conversations with AI-powered avatars that respond instantly</p>
          </Card>

          <Card className="text-center p-6">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">High Quality</h3>
            <p className="text-sm text-muted-foreground">Professional-grade avatars with natural expressions and smooth video quality</p>
          </Card>

          <Card className="text-center p-6">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">Secure & Private</h3>
            <p className="text-sm text-muted-foreground">Enterprise-grade security with encrypted sessions and data protection</p>
          </Card>
        </div>

        {/* Tech Stack */}
        <Card className="mt-8 p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 text-center">Powered by Advanced AI Technology</h3>
          <div className="flex flex-wrap justify-center items-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-primary/10 rounded flex items-center justify-center">
                <span className="text-primary font-bold text-xs">H</span>
              </div>
              <span>HeyGen Streaming SDK</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-primary/10 rounded flex items-center justify-center">
                <span className="text-primary font-bold text-xs">⚡</span>
              </div>
              <span>WebRTC Streaming</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-primary/10 rounded flex items-center justify-center">
                <span className="text-primary font-bold text-xs">🤖</span>
              </div>
              <span>GPT-4o Integration</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
