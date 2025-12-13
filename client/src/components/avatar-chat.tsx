import { useState, useEffect, useRef, FormEvent, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { X, Pause, Play, Send, Settings, Mic, MicOff, User, Bot, Volume2, VolumeX, Video, Film, Loader2, ExternalLink, Maximize, Minimize, Image, X as XIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useAvatarSession } from "@/hooks/useAvatarSession";
import { useInactivityTimer } from "@/hooks/useInactivityTimer";
import { useFullscreen } from "@/hooks/useFullscreen";
import { LoadingPlaceholder } from "@/components/LoadingPlaceholder";
import { AvatarSelector } from "@/components/avatar-selector";
import { AvatarSwitcher } from "@/components/AvatarSwitcher";
import { AudioOnlyDisplay } from "@/components/AudioOnlyDisplay";
import { AudioVideoToggle } from "@/components/AudioVideoToggle";
import { LanguageSelector } from "@/components/LanguageSelector";
import { LoadingSpinner } from "@/components/loading-spinner";
import { TrialCountdown } from "@/components/TrialCountdown";

interface ChatGeneratedVideo {
  id: string;
  userId: string;
  avatarId: string;
  topic: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  videoUrl?: string;
  thumbnailUrl?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

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
  const [audioOnly, setAudioOnly] = useState(true); // Default to audio mode
  const [isModeSwitching, setIsModeSwitching] = useState(false);
  const [micPermissionGranted, setMicPermissionGranted] = useState<boolean | null>(null);
  const [requestingMicPermission, setRequestingMicPermission] = useState(false);
  const [selectedAvatarId, setSelectedAvatarId] = useState(avatarId || "mark-kohl");
  const [showAvatarSelector, setShowAvatarSelector] = useState(!avatarId);
  const [showAvatarSwitcher, setShowAvatarSwitcher] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [switchingAvatar, setSwitchingAvatar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState("en-US");
  const [elevenLabsLanguage, setElevenLabsLanguage] = useState("en");
  const [avatarCapabilities, setAvatarCapabilities] = useState({
    enableAudioMode: true,
    enableVideoMode: true,
    enableVideoCreation: true,
  });
  const [pendingVideos, setPendingVideos] = useState<ChatGeneratedVideo[]>([]);
  const [completedVideos, setCompletedVideos] = useState<ChatGeneratedVideo[]>([]);
  const [attachedImage, setAttachedImage] = useState<{ base64: string; mimeType: string; preview: string } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dismissedVideosRef = useRef<Set<string>>(new Set());
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const videoPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // UI-only refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { toast } = useToast();
  const { isFullscreen, toggleFullscreen, isSupported: fullscreenSupported } = useFullscreen();
  
  // Callback ref bridge to break circular dependency
  const resetTimerRef = useRef<(() => void) | null>(null);
  
  // Memory preference from localStorage
  useEffect(() => {
    const memoryPref = localStorage.getItem('memory-enabled');
    console.log("🧠 Loading memory preference from localStorage:", memoryPref);
    setMemoryEnabled(memoryPref === 'true');
  }, []);

  // Load avatar's language settings and capabilities when avatar changes
  useEffect(() => {
    const abortController = new AbortController();
    const avatarIdAtFetch = selectedAvatarId;
    
    const loadAvatarConfig = async () => {
      try {
        const response = await fetch(`/api/avatar/config/${avatarIdAtFetch}`, {
          signal: abortController.signal
        });
        if (response.ok && avatarIdAtFetch === selectedAvatarId) {
          const avatar = await response.json();
          // Load language settings
          if (avatar.languageCode) {
            setSelectedLanguage(avatar.languageCode);
            console.log(`🌐 Loaded avatar language: ${avatar.languageCode}`);
          } else {
            setSelectedLanguage("en-US");
          }
          if (avatar.elevenLabsLanguageCode) {
            setElevenLabsLanguage(avatar.elevenLabsLanguageCode);
          } else {
            setElevenLabsLanguage("en");
          }
          // Load capability settings
          const capabilities = {
            enableAudioMode: avatar.enableAudioMode ?? true,
            enableVideoMode: avatar.enableVideoMode ?? true,
            enableVideoCreation: avatar.enableVideoCreation ?? true,
          };
          setAvatarCapabilities(capabilities);
          console.log(`🎛️ Loaded avatar capabilities:`, capabilities);
          
          // If current mode is disabled, switch to an available mode
          if (audioOnly && !capabilities.enableAudioMode && capabilities.enableVideoMode) {
            setAudioOnly(false);
            console.log(`🔄 Audio disabled for ${avatarIdAtFetch}, switching to video mode`);
          } else if (!audioOnly && !capabilities.enableVideoMode && capabilities.enableAudioMode) {
            setAudioOnly(true);
            console.log(`🔄 Video disabled for ${avatarIdAtFetch}, switching to audio mode`);
          }
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.warn("Failed to load avatar config:", error);
        }
      }
    };
    loadAvatarConfig();
    
    return () => {
      abortController.abort();
    };
  }, [selectedAvatarId]);

  // Check initial microphone permission status
  useEffect(() => {
    const checkMicPermission = async () => {
      try {
        const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (result.state === 'granted') {
          setMicPermissionGranted(true);
        } else if (result.state === 'denied') {
          setMicPermissionGranted(false);
        }
        // If 'prompt', leave as null to show the allow button
      } catch (error) {
        // Permissions API not supported, leave as null
        console.log('Permissions API not supported, will request on button click');
      }
    };
    checkMicPermission();
  }, []);

  // Function to request microphone permission
  const requestMicrophonePermission = async () => {
    setRequestingMicPermission(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Permission granted - stop the stream immediately (we just needed permission)
      stream.getTracks().forEach(track => track.stop());
      setMicPermissionGranted(true);
      toast({
        title: "Microphone Access Granted",
        description: "You can now start your chat session",
      });
    } catch (error: any) {
      console.error('Microphone permission denied:', error);
      setMicPermissionGranted(false);
      toast({
        variant: "destructive",
        title: "Microphone Access Denied",
        description: "Please allow microphone access in your browser settings to use voice chat",
      });
    } finally {
      setRequestingMicPermission(false);
    }
  };

  // Save memory preference to localStorage
  const handleMemoryToggle = (checked: boolean) => {
    console.log("🧠 Memory toggle changed to:", checked);
    setMemoryEnabled(checked);
    localStorage.setItem('memory-enabled', checked.toString());
    toast({
      title: checked ? "Memory Enabled" : "Memory Disabled",
      description: checked
        ? "Your conversations will be remembered across sessions"
        : "Memory has been turned off",
    });
  };
  
  // Debug: Log when memoryEnabled changes
  useEffect(() => {
    console.log("🧠 memoryEnabled state is now:", memoryEnabled);
  }, [memoryEnabled]);
  
  // Hook 1: Avatar session management
  const {
    sessionActive,
    heygenSessionActive,
    isLoading,
    showReconnect,
    videoReady, // True when LiveKit video track is attached and playing
    startSession,
    endSession,
    endSessionShowReconnect,
    reconnect,
    togglePause,
    switchTransportMode,
    isPaused,
    isSpeaking: isSpeakingFromHook,
    microphoneStatus,
    sessionDriverRef,
    hasAskedAnythingElseRef,
    speakingIntervalRef,
    handleSubmitMessage: originalHandleSubmitMessage,
    stopAudio,
    manualStartVoice
  } = useAvatarSession({
    videoRef,
    userId,
    memoryEnabled,
    selectedAvatarId,
    languageCode: selectedLanguage,
    elevenLabsLanguageCode: elevenLabsLanguage,
    onResetInactivityTimer: () => resetTimerRef.current?.(),
    onVideoGenerating: (topic, videoRecordId) => {
      console.log("🎬 Video generation notification:", { topic, videoRecordId });
      toast({
        title: "🎬 Creating Your Video",
        description: `Generating video about "${topic}". You'll find it in My Videos when ready!`,
        duration: 8000,
      });
      // Invalidate chat videos query to trigger refresh
      queryClient.invalidateQueries({ queryKey: ["/api/courses/chat-videos"] });
    }
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
  
  // Hook 2: Inactivity timer management with polite warning
  const handleSpeakWarning = useCallback(async (message: string) => {
    if (sessionDriverRef.current && !audioOnly) {
      try {
        await sessionDriverRef.current.speak(message);
      } catch (error) {
        console.error("Failed to speak warning via avatar:", error);
      }
    } else if (audioOnly) {
      try {
        const response = await fetch(`/api/elevenlabs/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: message, avatarId: selectedAvatarId })
        });
        if (response.ok) {
          const audioBlob = await response.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          audio.onended = () => URL.revokeObjectURL(audioUrl);
          await audio.play().catch((err) => {
            console.error("Audio play failed (likely mobile autoplay restriction):", err);
          });
        }
      } catch (error) {
        console.error("Failed to speak warning via audio:", error);
      }
    }
  }, [sessionDriverRef, audioOnly, selectedAvatarId]);

  const { resetInactivityTimer } = useInactivityTimer({
    sessionActive,
    isPaused,
    sessionDriverRef,
    speakingIntervalRef,
    hasAskedAnythingElseRef,
    onEndSessionShowReconnect: endSessionShowReconnect,
    isVideoMode: !audioOnly,
    onSpeakWarning: handleSpeakWarning
  });
  
  // Bridge the actual function to the ref
  resetTimerRef.current = resetInactivityTimer;

  // Keyboard shortcut for fullscreen (F key to toggle)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle F key when not typing in an input
      if (event.key === 'f' || event.key === 'F') {
        const activeElement = document.activeElement;
        const isTyping = activeElement?.tagName === 'INPUT' || 
                        activeElement?.tagName === 'TEXTAREA' ||
                        (activeElement as HTMLElement)?.isContentEditable;
        
        // Allow fullscreen toggle anytime (not just during active session)
        if (!isTyping && fullscreenSupported && containerRef.current) {
          event.preventDefault();
          // Pass video element for iOS video fullscreen support
          toggleFullscreen(containerRef.current, videoRef.current);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [fullscreenSupported, toggleFullscreen]);

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

  // Poll for pending and completed video notifications
  const fetchPendingVideos = async () => {
    try {
      const response = await fetch('/api/courses/chat-videos');
      if (response.ok) {
        const videos: ChatGeneratedVideo[] = await response.json();
        
        // Filter pending/generating videos
        setPendingVideos(videos.filter(v => 
          v.status === 'pending' || v.status === 'generating'
        ));
        
        // Filter recently completed videos (last 30 minutes) that haven't been dismissed
        const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
        const recentlyCompleted = videos.filter(v => 
          v.status === 'completed' && 
          v.completedAt && 
          new Date(v.completedAt).getTime() > thirtyMinutesAgo &&
          !dismissedVideosRef.current.has(v.id)
        );
        setCompletedVideos(recentlyCompleted);
      }
    } catch (error) {
      console.error('Error fetching videos:', error);
    }
  };
  
  const dismissCompletedVideo = (videoId: string) => {
    dismissedVideosRef.current.add(videoId);
    setCompletedVideos(prev => prev.filter(v => v.id !== videoId));
  };

  // Poll for pending videos when session is active (for UI display only)
  useEffect(() => {
    if (sessionActive && userId) {
      fetchPendingVideos();
      
      videoPollIntervalRef.current = setInterval(() => {
        fetchPendingVideos();
      }, 5000);
      
      return () => {
        if (videoPollIntervalRef.current) {
          clearInterval(videoPollIntervalRef.current);
          videoPollIntervalRef.current = null;
        }
      };
    }
  }, [sessionActive, userId]);

  // Wrapped handleSubmitMessage that adds to chat history
  const handleSubmitMessage = async (message: string, imageData?: { base64: string; mimeType: string }) => {
    // Send to AI with optional image
    await originalHandleSubmitMessage(message, imageData);
    
    // Clear attached image after sending
    if (attachedImage) {
      setAttachedImage(null);
    }
    
    // Poll immediately after sending to get updated history
    setTimeout(fetchConversationHistory, 500);
  };

  // Handle image file processing
  const processImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({
        variant: "destructive",
        title: "Invalid file type",
        description: "Please drop an image file (JPEG, PNG, GIF, or WebP)",
      });
      return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast({
        variant: "destructive",
        title: "Unsupported image format",
        description: "Supported formats: JPEG, PNG, GIF, WebP",
      });
      return;
    }

    // Check file size (max 5MB for base64 encoding)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "Image too large",
        description: "Please use an image smaller than 5MB",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const base64 = dataUrl.split(',')[1]; // Remove data:image/xxx;base64, prefix
      const preview = dataUrl;
      
      setAttachedImage({
        base64,
        mimeType: file.type,
        preview,
      });
      
      toast({
        title: "Image attached",
        description: "Your image will be sent with your next message",
      });
    };
    reader.readAsDataURL(file);
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processImageFile(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processImageFile(files[0]);
    }
  };

  const removeAttachedImage = () => {
    setAttachedImage(null);
  };

  const handleLanguageChange = (languageCode: string, elevenLabsCode: string) => {
    setSelectedLanguage(languageCode);
    setElevenLabsLanguage(elevenLabsCode);
    
    toast({
      title: "Language Changed",
      description: `Speech recognition and synthesis set to ${languageCode}`,
    });
  };

  const handleModeToggle = async (isVideoMode: boolean) => {
    const newAudioOnly = !isVideoMode;
    const previousAudioOnly = audioOnly;
    
    // Check if the requested mode is enabled
    if (isVideoMode && !avatarCapabilities.enableVideoMode) {
      toast({
        variant: "destructive",
        title: "Video mode unavailable",
        description: "Video mode is not enabled for this avatar.",
      });
      return;
    }
    if (!isVideoMode && !avatarCapabilities.enableAudioMode) {
      toast({
        variant: "destructive",
        title: "Audio mode unavailable",
        description: "Audio mode is not enabled for this avatar.",
      });
      return;
    }
    
    // If session is active, switch transport layer without restarting session
    if (sessionActive) {
      setIsModeSwitching(true);
      setAudioOnly(newAudioOnly); // Update UI immediately
      
      try {
        // Use seamless transport switching - preserves conversation context
        await switchTransportMode(isVideoMode);
        
        toast({
          title: isVideoMode ? "Video Mode" : "Audio Mode",
          description: isVideoMode
            ? "Switched to video - conversation continues"
            : "Switched to audio - conversation continues",
        });
      } catch (error: any) {
        console.error("Error switching mode:", error);
        // Revert to previous mode on failure
        setAudioOnly(previousAudioOnly);
        
        // Check if this is a video unavailable error (404)
        const errorMessage = error?.message?.toLowerCase() || '';
        const is404 = errorMessage.includes('404') || errorMessage.includes('not found');
        
        toast({
          variant: "destructive",
          title: is404 ? "Video unavailable" : "Switch failed",
          description: is404 
            ? "Video mode is not available for this avatar. Using audio mode instead."
            : "Failed to switch to video mode. Please try again.",
        });
      } finally {
        setIsModeSwitching(false);
      }
    } else {
      // If session not active, just update the state for next session
      setAudioOnly(newAudioOnly);
    }
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
    <div ref={containerRef} className="relative w-full h-screen bg-black overflow-hidden">
      {/* Full Screen Avatar Video */}
      <div className="relative w-full h-screen bg-black">
        {/* Video Element */}
        <div className="w-full h-full flex items-center justify-center relative">
          {(() => {
            console.log("🖼️ Render state:", { audioOnly, heygenSessionActive, videoReady, isLoading, showReconnect, 
              videoShouldShow: videoReady && !isLoading && !showReconnect,
              gifShouldShow: audioOnly && !heygenSessionActive
            });
            return null;
          })()}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
            style={{ 
              display: (videoReady && !isLoading && !showReconnect) ? 'block' : 'none',
              position: 'absolute',
              top: 0,
              left: 0,
              zIndex: 10
            }}
            data-testid="avatar-video"
          />
          
          {audioOnly && !heygenSessionActive && (
            <AudioOnlyDisplay isSpeaking={isSpeaking} sessionActive={sessionActive} avatarId={selectedAvatarId} />
          )}
        </div>

        {/* Overlay Controls */}
        {sessionActive && (
          <>
            {/* Top Controls Bar */}
            <div className="absolute top-0 left-0 right-0 flex flex-col items-center p-4 bg-gradient-to-b from-black/60 to-transparent z-30">
              {/* Audio/Video Toggle, Language Selector, and Trial Countdown - Centered at top */}
              <div className="mb-3 flex items-center gap-3">
                <TrialCountdown compact />
                <AudioVideoToggle
                  isVideoMode={!audioOnly}
                  onToggle={handleModeToggle}
                  disabled={isModeSwitching || isLoading}
                  enableAudioMode={avatarCapabilities.enableAudioMode}
                  enableVideoMode={avatarCapabilities.enableVideoMode}
                />
                <LanguageSelector
                  selectedLanguage={selectedLanguage}
                  onLanguageChange={handleLanguageChange}
                  disabled={isLoading}
                />
              </div>
              
              <div className="w-full flex items-center justify-between">
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
                {/* Fullscreen Button - Video-like immersive experience (works on mobile too) */}
                {fullscreenSupported && (
                  <Button
                    onClick={() => toggleFullscreen(containerRef.current, videoRef.current)}
                    className="bg-white/10 hover:bg-white/20 border border-white/20 text-white"
                    size="sm"
                    data-testid="button-fullscreen"
                    title={isFullscreen ? "Exit Fullscreen (F)" : "Fullscreen (F)"}
                  >
                    {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                  </Button>
                )}
                
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
            </div>

            {/* Mic Blocked Status - only show when permission denied */}
            {microphoneStatus === 'permission-denied' && (
              <div className="absolute top-20 right-4 flex items-center gap-2 bg-red-500/20 border border-red-500/40 px-3 py-2 rounded-full backdrop-blur-sm z-30">
                <MicOff className="w-4 h-4 text-red-400" />
                <span className="text-sm text-red-400 font-medium">Mic blocked</span>
              </div>
            )}
            
            {/* Voice Not Supported - ElevenLabs WebSocket STT handles this automatically via useAvatarSession */}
            {microphoneStatus === 'not-supported' && (
              <div className="absolute top-20 right-4 flex flex-col items-end gap-1 bg-amber-500/20 border border-amber-500/40 px-3 py-2 rounded-lg backdrop-blur-sm z-30 max-w-[200px]">
                <div className="flex items-center gap-2">
                  <MicOff className="w-4 h-4 text-amber-400" />
                  <span className="text-sm text-amber-400 font-medium">Voice not available</span>
                </div>
                <span className="text-xs text-amber-300/80 text-right">Type your message below</span>
              </div>
            )}
            
            {/* iOS Safari needs gesture - show tap to speak button */}
            {microphoneStatus === 'needs-gesture' && (
              <button
                onClick={manualStartVoice}
                className="absolute top-20 right-4 flex items-center gap-2 bg-blue-500/30 hover:bg-blue-500/50 border border-blue-400/60 px-4 py-2 rounded-full backdrop-blur-sm z-30 transition-all active:scale-95"
                data-testid="button-tap-to-speak"
              >
                <Mic className="w-4 h-4 text-blue-400" />
                <span className="text-sm text-blue-300 font-medium">Tap to enable voice</span>
              </button>
            )}

            {/* Video Notifications - Pending and Completed */}
            {(pendingVideos.length > 0 || completedVideos.length > 0) && (
              <div className="absolute top-32 left-4 flex flex-col gap-2 z-30 max-w-[250px]">
                {/* Pending Videos */}
                {pendingVideos.map((video) => (
                  <div 
                    key={video.id} 
                    className="flex items-center gap-2 bg-blue-500/20 border border-blue-500/40 px-3 py-2 rounded-lg backdrop-blur-sm"
                    data-testid={`video-generating-${video.id}`}
                  >
                    <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs text-blue-400 font-medium">
                        {video.status === 'pending' ? 'Starting video...' : 'Generating video...'}
                      </span>
                      <span className="text-xs text-blue-300/80 truncate">
                        {video.topic}
                      </span>
                    </div>
                  </div>
                ))}
                
                {/* Completed Videos with Watch Link */}
                {completedVideos.map((video) => (
                  <div 
                    key={video.id} 
                    className="flex items-center gap-2 bg-green-500/20 border border-green-500/40 px-3 py-2 rounded-lg backdrop-blur-sm"
                    data-testid={`video-completed-${video.id}`}
                  >
                    <Film className="w-4 h-4 text-green-400 flex-shrink-0" />
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs text-green-400 font-medium">Video Ready!</span>
                      <span className="text-xs text-green-300/80 truncate">
                        {video.topic}
                      </span>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <a
                        href={video.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 bg-green-500/30 hover:bg-green-500/50 rounded transition-colors"
                        title="Watch Video"
                        data-testid={`video-watch-${video.id}`}
                      >
                        <ExternalLink className="w-3 h-3 text-green-300" />
                      </a>
                      <button
                        onClick={() => dismissCompletedVideo(video.id)}
                        className="p-1 bg-green-500/20 hover:bg-green-500/40 rounded transition-colors"
                        title="Dismiss"
                        data-testid={`video-dismiss-${video.id}`}
                      >
                        <X className="w-3 h-3 text-green-300/70" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </>
        )}

        {/* Microphone Permission Button - shown before Start Chat if permission not yet granted */}
        {showChatButton && !showAvatarSelector && micPermissionGranted !== true && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/50 z-20">
            <div className="text-center mb-2">
              <p className="text-white/80 text-sm mb-1">Voice chat requires microphone access</p>
              <p className="text-white/60 text-xs">Click below to allow microphone</p>
            </div>
            <Button
              onClick={requestMicrophonePermission}
              disabled={requestingMicPermission}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 text-lg font-semibold rounded-full shadow-lg flex items-center gap-3"
              data-testid="button-allow-microphone"
            >
              {requestingMicPermission ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Requesting...
                </>
              ) : (
                <>
                  <Mic className="w-5 h-5" />
                  Allow Microphone
                </>
              )}
            </Button>
            {micPermissionGranted === false && (
              <p className="text-red-400 text-sm mt-2">
                Microphone access was denied. Please check browser settings.
              </p>
            )}
          </div>
        )}

        {/* Start Button - shown after microphone permission is granted */}
        {showChatButton && !showAvatarSelector && micPermissionGranted === true && (
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
        {(isLoading || isModeSwitching) && !showReconnect && !heygenSessionActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-20">
            {audioOnly && !isModeSwitching ? (
              <LoadingPlaceholder avatarId={selectedAvatarId} data-testid="loading-placeholder" />
            ) : (
              <LoadingSpinner size="md" />
            )}
            {isModeSwitching && (
              <p className="text-white/80 mt-4 text-sm">
                Switching to {audioOnly ? 'audio' : 'video'} mode...
              </p>
            )}
          </div>
        )}

        {/* Reconnect Screen */}
        {showReconnect && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black z-20">
            {audioOnly && !heygenSessionActive && <LoadingPlaceholder avatarId={selectedAvatarId} data-testid="reconnect-placeholder" />}
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

        {/* Drag overlay */}
        {isDragOver && sessionActive && (
          <div 
            className="absolute inset-0 bg-primary/30 backdrop-blur-sm z-20 flex items-center justify-center border-4 border-dashed border-primary rounded-lg"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="text-center text-white">
              <Image className="w-16 h-16 mx-auto mb-4 opacity-80" />
              <p className="text-xl font-semibold">Drop image here</p>
              <p className="text-sm opacity-70">Claude will analyze and respond</p>
            </div>
          </div>
        )}

        {/* Chat Input Overlay (Bottom) */}
        {sessionActive && (
          <div 
            className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/60 to-transparent z-10"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Image preview */}
            {attachedImage && (
              <div className="max-w-4xl mx-auto mb-3">
                <div className="relative inline-block">
                  <img 
                    src={attachedImage.preview} 
                    alt="Attached" 
                    className="h-20 rounded-lg border-2 border-white/30"
                  />
                  <button
                    onClick={removeAttachedImage}
                    className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1"
                    data-testid="button-remove-image"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
            
            <form 
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if ((inputMessage.trim() || attachedImage) && !isPaused) {
                  handleSubmitMessage(
                    inputMessage || "What do you see in this image?",
                    attachedImage ? { base64: attachedImage.base64, mimeType: attachedImage.mimeType } : undefined
                  );
                  setInputMessage("");
                }
              }}
              className="flex items-center gap-2 max-w-4xl mx-auto"
            >
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleFileSelect}
                className="hidden"
                data-testid="input-file"
              />
              
              {/* Image upload button */}
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="bg-black/50 border-white/20 text-white hover:bg-white/20"
                disabled={!sessionActive || isPaused}
                data-testid="button-attach-image"
              >
                <Image className="w-4 h-4" />
              </Button>
              
              <div className="flex-1 relative">
                <Input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder={attachedImage ? "Ask about the image..." : (microphoneStatus === 'listening' ? "" : "Type your message...")}
                  className="flex-1 w-full bg-black/50 border-white/20 text-white placeholder:text-gray-400 backdrop-blur-sm pr-4"
                  data-testid="input-message"
                  disabled={!sessionActive || isPaused}
                />
                {/* Audio Waveform - shows inside input when listening */}
                {microphoneStatus === 'listening' && !inputMessage && !attachedImage && (
                  <div className="absolute inset-y-0 left-3 flex items-center gap-[2px] pointer-events-none">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                      <div
                        key={i}
                        className="w-[2px] rounded-full"
                        style={{
                          height: '60%',
                          background: `linear-gradient(to top, rgba(99, 102, 241, 0.8), rgba(139, 92, 246, 1), rgba(167, 139, 250, 0.9))`,
                          boxShadow: '0 0 8px rgba(139, 92, 246, 0.6)',
                          animation: `waveform 0.6s ease-in-out infinite`,
                          animationDelay: `${i * 0.08}s`,
                        }}
                      />
                    ))}
                    <style>{`
                      @keyframes waveform {
                        0%, 100% { transform: scaleY(0.2); opacity: 0.5; }
                        50% { transform: scaleY(1); opacity: 1; }
                      }
                    `}</style>
                  </div>
                )}
              </div>
              <Button
                type="submit"
                disabled={(!inputMessage.trim() && !attachedImage) || !sessionActive || isPaused}
                className="bg-primary hover:bg-primary/90 text-white"
                data-testid="button-send-message"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        )}

        {/* Avatar Switcher Dialog - Must be inside fullscreen container to work in fullscreen mode */}
        <AvatarSwitcher
          open={showAvatarSwitcher}
          onOpenChange={setShowAvatarSwitcher}
          currentAvatarId={selectedAvatarId}
          onSwitch={handleAvatarSwitch}
          disabled={switchingAvatar}
        />
      </div>
    </div>
  );
}
