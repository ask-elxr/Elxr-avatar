import { useState, useEffect, useRef, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { X, Pause, Play, Send, Settings, Mic, MicOff, User, Bot, Volume2, VolumeX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAvatarSession } from "@/hooks/useAvatarSession";
import { useInactivityTimer } from "@/hooks/useInactivityTimer";
import { LoadingPlaceholder } from "@/components/LoadingPlaceholder";
import { AvatarSelector } from "@/components/avatar-selector";
import { AvatarSwitcher } from "@/components/AvatarSwitcher";
import { AudioOnlyDisplay } from "@/components/AudioOnlyDisplay";
import { LoadingSpinner } from "@/components/loading-spinner";

interface AvatarChatProps {
  userId: string;
  avatarId?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function AvatarChat({ userId, avatarId }: AvatarChatProps) {
  // UI-only state
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [showChatButton, setShowChatButton] = useState(true);
  const [audioOnly, setAudioOnly] = useState(false);
  const [selectedAvatarId, setSelectedAvatarId] = useState(avatarId || "mark-kohl");
  const [showAvatarSelector, setShowAvatarSelector] = useState(!avatarId);
  const [showAvatarSwitcher, setShowAvatarSwitcher] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [switchingAvatar, setSwitchingAvatar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // UI-only refs
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const { toast } = useToast();
  
  // Callback ref bridge to break circular dependency
  const resetTimerRef = useRef<(() => void) | null>(null);
  
  // Memory preference from localStorage
  useEffect(() => {
    const memoryPref = localStorage.getItem('memory-enabled');
    setMemoryEnabled(memoryPref === 'true');
  }, []);

  // Save memory preference to localStorage
  const handleMemoryToggle = (checked: boolean) => {
    setMemoryEnabled(checked);
    localStorage.setItem('memory-enabled', checked.toString());
    toast({
      title: checked ? "Memory Enabled" : "Memory Disabled",
      description: checked
        ? "Your conversations will be remembered across sessions"
        : "Memory has been turned off",
    });
  };
  
  // Hook 1: Avatar session management
  const {
    sessionActive,
    heygenSessionActive,
    isLoading,
    showReconnect,
    startSession,
    endSession,
    endSessionShowReconnect,
    reconnect,
    togglePause,
    isPaused,
    isSpeaking: isSpeakingFromHook,
    microphoneStatus,
    avatarRef,
    hasAskedAnythingElseRef,
    speakingIntervalRef,
    handleSubmitMessage: originalHandleSubmitMessage,
    stopAudio
  } = useAvatarSession({
    videoRef,
    userId,
    memoryEnabled,
    selectedAvatarId,
    onResetInactivityTimer: () => resetTimerRef.current?.()
  });
  
  // Sync isSpeaking state from hook
  useEffect(() => {
    setIsSpeaking(isSpeakingFromHook);
  }, [isSpeakingFromHook]);
  
  // Reset Start button when session ends
  const prevSessionActiveRef = useRef(sessionActive);
  useEffect(() => {
    if (prevSessionActiveRef.current && !sessionActive && !showReconnect && !switchingAvatar) {
      setShowChatButton(true);
    }
    prevSessionActiveRef.current = sessionActive;
  }, [sessionActive, showReconnect, switchingAvatar]);
  
  // Hook 2: Inactivity timer management
  const { resetInactivityTimer } = useInactivityTimer({
    sessionActive,
    isPaused,
    avatarRef,
    speakingIntervalRef,
    hasAskedAnythingElseRef,
    onEndSessionShowReconnect: endSessionShowReconnect
  });
  
  // Bridge the actual function to the ref
  resetTimerRef.current = resetInactivityTimer;

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);

  // Fetch conversation history from database
  const fetchConversationHistory = async () => {
    try {
      const response = await fetch(`/api/conversations/history/${userId}/${selectedAvatarId}?limit=50`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.conversations) {
          const formattedHistory: ChatMessage[] = data.conversations.map((conv: any) => ({
            id: conv.id,
            role: conv.role,
            content: conv.text,
            timestamp: new Date(conv.createdAt)
          }));
          setChatHistory(formattedHistory);
        }
      }
    } catch (error) {
      console.error('Error fetching conversation history:', error);
    }
  };

  // Load conversation history when session starts
  useEffect(() => {
    if (sessionActive && userId && selectedAvatarId) {
      fetchConversationHistory();
      
      // Poll for updates every 2 seconds while session is active
      pollIntervalRef.current = setInterval(fetchConversationHistory, 2000);
      
      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      };
    }
  }, [sessionActive, userId, selectedAvatarId]);

  // Wrapped handleSubmitMessage that adds to chat history
  const handleSubmitMessage = async (message: string) => {
    // Send to AI
    await originalHandleSubmitMessage(message);
    
    // Poll immediately after sending to get updated history
    setTimeout(fetchConversationHistory, 500);
  };

  const handleAudioOnlyToggle = async (checked: boolean) => {
    setAudioOnly(checked);
    
    // If session is active, restart with new mode
    if (sessionActive) {
      try {
        await endSession();
        await new Promise(resolve => setTimeout(resolve, 500));
        await startSession({ audioOnly: checked, avatarId: selectedAvatarId });
      } catch (error) {
        console.error("Error switching audio mode:", error);
      }
    }
    
    toast({
      title: checked ? "Audio Mode Enabled" : "Video Mode Enabled",
      description: checked
        ? "Switched to audio-only mode for lower bandwidth"
        : "Switched to video mode",
    });
  };

  const handleAvatarSwitch = async (newAvatarId: string) => {
    setSwitchingAvatar(true);
    setSelectedAvatarId(newAvatarId);
    setShowAvatarSwitcher(false);
    
    try {
      await endSession();
      await new Promise(resolve => setTimeout(resolve, 500));
      await startSession({ audioOnly, avatarId: newAvatarId });
      
      toast({
        title: "Avatar Switched",
        description: "Successfully switched to new AI guide",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Switch failed",
        description: error.message || "Failed to switch avatar",
      });
    } finally {
      setSwitchingAvatar(false);
    }
  };

  const endChat = async () => {
    await endSession();
    setChatHistory([]); // Clear chat history on end
  };

  if (showAvatarSelector) {
    return (
      <AvatarSelector
        selectedAvatarId={selectedAvatarId}
        onSelect={(id: string) => {
          setSelectedAvatarId(id);
        }}
        onConfirm={() => {
          setShowAvatarSelector(false);
        }}
      />
    );
  }

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      {/* Full Screen Avatar Video */}
      <div className="relative w-full h-screen bg-black">
        {/* Video Element */}
        <div className="w-full h-full flex items-center justify-center">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
            style={{ 
              display: (audioOnly || isLoading || showReconnect) ? 'none' : 'block',
              objectPosition: selectedAvatarId === 'kelsey' ? 'center 30%' : 'center'
            }}
            data-testid="avatar-video"
          />
          
          {audioOnly && (
            <AudioOnlyDisplay isSpeaking={isSpeaking} sessionActive={sessionActive} />
          )}
        </div>

        {/* Overlay Controls */}
        {sessionActive && (
          <>
            {/* Top Controls Bar */}
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent z-30">
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => togglePause()}
                  className="bg-white/10 hover:bg-white/20 border border-white/20 text-white"
                  size="sm"
                  data-testid="button-pause-toggle"
                >
                  {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </Button>
                
                <Button
                  onClick={() => setShowAvatarSwitcher(true)}
                  className="bg-white/10 hover:bg-white/20 border border-white/20 text-white"
                  size="sm"
                  data-testid="button-switch-avatar"
                >
                  Switch Avatar
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setShowSettings(!showSettings)}
                  className="bg-white/10 hover:bg-white/20 border border-white/20 text-white"
                  size="sm"
                >
                  <Settings className="w-4 h-4" />
                </Button>
                
                {/* Emergency Stop Button for Audio-Only Mode */}
                {isSpeaking && audioOnly && (
                  <Button
                    onClick={() => {
                      stopAudio();
                      toast({
                        title: "Audio Stopped",
                        description: "Playback stopped",
                      });
                    }}
                    className="bg-amber-500/80 hover:bg-amber-600 text-white"
                    size="sm"
                    data-testid="button-stop-audio"
                  >
                    <VolumeX className="w-4 h-4" />
                  </Button>
                )}
                
                <Button
                  onClick={endChat}
                  className="bg-red-500/80 hover:bg-red-600 text-white"
                  size="sm"
                  data-testid="button-end-chat"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Microphone Status */}
            {microphoneStatus === 'listening' && (
              <div className="absolute top-20 right-4 flex items-center gap-2 bg-green-500/20 border border-green-500/40 px-3 py-2 rounded-full backdrop-blur-sm z-30">
                <Mic className="w-4 h-4 text-green-400 animate-pulse" />
                <span className="text-sm text-green-400 font-medium">Listening</span>
              </div>
            )}
            
            {microphoneStatus === 'permission-denied' && (
              <div className="absolute top-20 right-4 flex items-center gap-2 bg-red-500/20 border border-red-500/40 px-3 py-2 rounded-full backdrop-blur-sm z-30">
                <MicOff className="w-4 h-4 text-red-400" />
                <span className="text-sm text-red-400 font-medium">Mic blocked</span>
              </div>
            )}
          </>
        )}

        {/* Start Button */}
        {showChatButton && !showAvatarSelector && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20">
            <Button
              onClick={async () => {
                setShowChatButton(false);
                try {
                  await startSession({ audioOnly, avatarId: selectedAvatarId });
                } catch (error: any) {
                  setShowChatButton(true);
                  toast({
                    variant: "destructive",
                    title: "Cannot start session",
                    description: error.message || "Failed to start session",
                  });
                }
              }}
              className="bg-primary hover:bg-primary/90 text-white px-8 py-4 text-lg font-semibold rounded-full shadow-lg"
              data-testid="button-start-session"
            >
              Start Chat
            </Button>
          </div>
        )}

        {/* Loading Overlay */}
        {isLoading && !showReconnect && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20">
            {audioOnly ? (
              <LoadingPlaceholder avatarId={selectedAvatarId} data-testid="loading-placeholder" />
            ) : (
              <LoadingSpinner size="md" />
            )}
          </div>
        )}

        {/* Reconnect Screen */}
        {showReconnect && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black z-20">
            {audioOnly && <LoadingPlaceholder avatarId={selectedAvatarId} data-testid="reconnect-placeholder" />}
            <Button
              onClick={async () => {
                try {
                  await reconnect();
                } catch (error: any) {
                  toast({
                    variant: "destructive",
                    title: "Cannot reconnect",
                    description: error.message || "Failed to reconnect",
                  });
                }
              }}
              className="bg-primary hover:bg-primary/90 text-white px-8 py-3 font-semibold rounded-full shadow-lg"
              data-testid="button-reconnect"
            >
              Reconnect
            </Button>
          </div>
        )}

        {/* Settings Panel */}
        {showSettings && sessionActive && (
          <div className="absolute top-16 right-4 bg-black/90 backdrop-blur-lg border border-white/20 rounded-lg p-4 w-72 z-10">
            <h3 className="text-white font-semibold mb-4">Settings</h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label htmlFor="audio-only" className="text-white text-sm">
                  Audio Only Mode
                </label>
                <Checkbox
                  id="audio-only"
                  checked={audioOnly}
                  onCheckedChange={handleAudioOnlyToggle}
                  className="border-white data-[state=checked]:bg-primary"
                />
              </div>

              <div className="flex items-center justify-between">
                <label htmlFor="memory" className="text-white text-sm">
                  Conversation Memory
                </label>
                <Checkbox
                  id="memory"
                  checked={memoryEnabled}
                  onCheckedChange={handleMemoryToggle}
                  className="border-white data-[state=checked]:bg-primary"
                />
              </div>
            </div>
          </div>
        )}

        {/* Chat Input Overlay (Bottom) */}
        {sessionActive && (
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/60 to-transparent z-10">
            <form 
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (inputMessage.trim() && !isPaused) {
                  handleSubmitMessage(inputMessage);
                  setInputMessage("");
                }
              }}
              className="flex items-center gap-2 max-w-4xl mx-auto"
            >
              <Input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 bg-black/50 border-white/20 text-white placeholder:text-gray-400 backdrop-blur-sm"
                data-testid="input-message"
                disabled={!sessionActive || isPaused}
              />
              <Button
                type="submit"
                disabled={!inputMessage.trim() || !sessionActive || isPaused}
                className="bg-primary hover:bg-primary/90 text-white"
                data-testid="button-send-message"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        )}
      </div>

      {/* Avatar Switcher Dialog */}
      <AvatarSwitcher
        open={showAvatarSwitcher}
        onOpenChange={setShowAvatarSwitcher}
        currentAvatarId={selectedAvatarId}
        onSwitch={handleAvatarSwitch}
        disabled={switchingAvatar}
      />
    </div>
  );
}
