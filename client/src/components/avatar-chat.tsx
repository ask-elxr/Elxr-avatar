import { useState, useEffect, useRef, FormEvent, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { X, Pause, Play, Send, Settings, Mic, MicOff, User, Bot, Volume2, VolumeX, Video, Film, Loader2, ExternalLink, Maximize, Minimize, Image, X as XIcon, MoreVertical, RefreshCw, Gamepad2, MessageSquare, Menu, ShieldOff } from "lucide-react";
import mumIconPath from "@assets/Mum_flav_256_1771715821899.png";
import { useToast } from "@/hooks/use-toast";
import { queryClient, getAuthHeaders } from "@/lib/queryClient";
import { useAvatarSession } from "@/hooks/useAvatarSession";
import { useInactivityTimer } from "@/hooks/useInactivityTimer";
import { useFullscreen } from "@/hooks/useFullscreen";
import { LoadingPlaceholder } from "@/components/LoadingPlaceholder";
import { AvatarSelector } from "@/components/avatar-selector";
import { AvatarMiniGames } from "@/components/AvatarMiniGames";
import { AvatarSwitcher } from "@/components/AvatarSwitcher";
import { AudioOnlyDisplay, AudioOnlyDisplayRef } from "@/components/AudioOnlyDisplay";
import { AudioVideoToggle, type ChatMode } from "@/components/AudioVideoToggle";
import { LanguageSelector } from "@/components/LanguageSelector";
import { LoadingSpinner } from "@/components/loading-spinner";
import { TrialCountdown } from "@/components/TrialCountdown";
import { Slider } from "@/components/ui/slider";
import { unlockMobileAudio, stopSharedAudio, getGlobalVolume, setGlobalVolume, getSharedAudioElement, registerMediaElement, unregisterMediaElement } from "@/lib/mobileAudio";
import { useChromaKey } from "@/hooks/useChromaKey";

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
  const [mumMode, setMumMode] = useState(() => {
    const saved = localStorage.getItem('mum-mode');
    if (saved !== null) return saved === 'true';
    const legacyMemory = localStorage.getItem('memory-enabled');
    if (legacyMemory !== null) {
      const mum = legacyMemory !== 'true';
      localStorage.setItem('mum-mode', mum.toString());
      localStorage.removeItem('memory-enabled');
      return mum;
    }
    return !localStorage.getItem('memberstack_id');
  });
  const memoryEnabled = !mumMode;
  const [showChatButton, setShowChatButton] = useState(true);
  const [showDisclaimer, setShowDisclaimer] = useState(() => {
    return localStorage.getItem('disclaimer-accepted') !== 'true';
  });
  const [audioOnly, setAudioOnly] = useState(false); // Default to video mode
  const [chatMode, setChatMode] = useState<ChatMode>('video');
  const [textChatActive, setTextChatActive] = useState(false);
  const [textChatLoading, setTextChatLoading] = useState(false);
  const [isModeSwitching, setIsModeSwitching] = useState(false);
  const [micPermissionGranted, setMicPermissionGranted] = useState<boolean | null>(null);
  const [requestingMicPermission, setRequestingMicPermission] = useState(false);
  const [sessionStarting, setSessionStarting] = useState(false); // Track if session start was initiated (prevents black screen)
  const [loadingTimedOut, setLoadingTimedOut] = useState(false); // Track if loading has exceeded timeout
  const [selectedAvatarId, setSelectedAvatarId] = useState(avatarId || "mark-kohl");
  const [showAvatarSelector, setShowAvatarSelector] = useState(!avatarId);
  const [showAvatarSwitcher, setShowAvatarSwitcher] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [switchingAvatar, setSwitchingAvatar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMiniGames, setShowMiniGames] = useState(false);
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
  const [elevenLabsAgentConfig, setElevenLabsAgentConfig] = useState<{ enabled: boolean; agentId: string } | null>(null);
  const [elevenLabsAgentActive, setElevenLabsAgentActive] = useState(false); // Track when ElevenLabs Agent mode is active
  const [avatarVoiceId, setAvatarVoiceId] = useState<string>(''); // Track avatar's ElevenLabs voice ID
  const [volume, setVolume] = useState(() => getGlobalVolume() * 100); // Volume 0-100 for slider
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const toolbarTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dismissedVideosRef = useRef<Set<string>>(new Set());
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const videoPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioOnlyRef = useRef<AudioOnlyDisplayRef>(null);
  const textChatScrollRef = useRef<HTMLDivElement>(null);
  
  // UI-only refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chromaCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const { toast } = useToast();
  const { isFullscreen, enterFullscreen, toggleFullscreen, isSupported: fullscreenSupported, isMobile } = useFullscreen();

  // Callback ref bridge to break circular dependency
  const resetTimerRef = useRef<(() => void) | null>(null);
  
  const toggleMumMode = useCallback(() => {
    setMumMode(prev => {
      const next = !prev;
      localStorage.setItem('mum-mode', next.toString());
      toast({
        title: next ? "MUM Mode On" : "MUM Mode Off",
        description: next
          ? "Private session — no conversations stored or remembered"
          : "Memory enabled — conversations will be remembered",
      });
      return next;
    });
  }, [toast]);

  // Fetch ElevenLabs agent configuration on mount
  useEffect(() => {
    const fetchAgentConfig = async () => {
      try {
        const response = await fetch('/api/elevenlabs/agent-config');
        if (response.ok) {
          const config = await response.json();
          console.log("🎙️ ElevenLabs agent config:", config);
          setElevenLabsAgentConfig(config);
        }
      } catch (error) {
        console.error("Failed to fetch ElevenLabs agent config:", error);
      }
    };
    fetchAgentConfig();
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
          // Load ElevenLabs voice ID for agent mode
          if (avatar.elevenlabsVoiceId) {
            setAvatarVoiceId(avatar.elevenlabsVoiceId);
            console.log(`🎤 Loaded avatar voice ID: ${avatar.elevenlabsVoiceId}`);
          } else {
            setAvatarVoiceId('');
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
  // Note: Safari/iOS don't support permissions.query for microphone, so we skip it there
  useEffect(() => {
    const checkMicPermission = async () => {
      // Skip permissions API on iOS/Safari - it's not supported and will fail
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      
      if (isIOS || isSafari) {
        console.log('📱 iOS/Safari detected - skipping permissions.query, will request on button click');
        return; // Leave as null, will prompt on button click
      }
      
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

  const handleMemoryToggle = (checked: boolean) => {
    const newMumMode = !checked;
    setMumMode(newMumMode);
    localStorage.setItem('mum-mode', newMumMode.toString());
  };

  const handleVolumeChange = useCallback((values: number[]) => {
    const newVolume = values[0];
    const normalizedVolume = newVolume / 100; // Convert to 0-1 range
    
    setVolume(newVolume);
    // setGlobalVolume updates all registered media elements including video, audio, and shared elements
    setGlobalVolume(normalizedVolume);
    
    // Also update video element directly (for video mode)
    if (videoRef.current) {
      videoRef.current.volume = normalizedVolume;
    }
  }, []);
  
  useEffect(() => {
    console.log("🧠 MUM mode:", mumMode, "memoryEnabled:", memoryEnabled);
  }, [mumMode, memoryEnabled]);
  
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
    manualStartVoice,
    isMicMuted,
    toggleMicMute,
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

  const needsChromaKey = selectedAvatarId === 'nigel';
  const chromaKeyActive = needsChromaKey && videoReady && !isLoading && !showReconnect && !audioOnly;
  useChromaKey(videoRef, chromaCanvasRef, { enabled: chromaKeyActive });

  // Clear sessionStarting when session becomes active or shows reconnect (prevents stuck loading state)
  useEffect(() => {
    if (sessionActive || showReconnect) {
      setSessionStarting(false);
      setLoadingTimedOut(false); // Reset timeout flag when session starts or shows reconnect
    }
  }, [sessionActive, showReconnect]);
  
  // 📱 CRITICAL FIX: Clear sessionStarting whenever isLoading becomes false
  // This ensures the loading overlay clears even if sessionActive hasn't been set yet
  // (happens on mobile when audio greeting fails)
  useEffect(() => {
    if (!isLoading && sessionStarting) {
      console.log("📱 isLoading=false, clearing sessionStarting to remove loading overlay");
      setSessionStarting(false);
    }
  }, [isLoading, sessionStarting]);

  // 📱 iOS Safari fix: Force clear stuck loading state when tab becomes visible
  // This handles cases where iOS suspends React state updates
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log("📱 Tab visible - checking for stuck loading state");
        // If session is actually active but UI still shows loading, force clear it
        if (sessionActive && sessionStarting) {
          console.log("📱 Detected stuck loading state, clearing sessionStarting");
          setSessionStarting(false);
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [sessionActive, sessionStarting]);

  // Loading timeout: If loading takes too long in video mode, force show reconnect
  useEffect(() => {
    if (sessionStarting && !audioOnly) {
      const timeoutId = setTimeout(() => {
        console.log("⏰ Loading timeout reached (30s) - forcing reconnect screen");
        setLoadingTimedOut(true);
      }, 30000);
      return () => clearTimeout(timeoutId);
    }
    return undefined;
  }, [sessionStarting, audioOnly]);
  
  // 📱 Additional safeguard: Auto-clear sessionStarting after short delay for audio-only mode
  useEffect(() => {
    if (sessionStarting && audioOnly) {
      const timeoutId = setTimeout(() => {
        console.log("📱 Audio-only mode: Auto-clearing sessionStarting after 5s");
        setSessionStarting(false);
      }, 5000);
      return () => clearTimeout(timeoutId);
    }
    return undefined;
  }, [sessionStarting, audioOnly]);
  
  // Register video element for volume updates when session becomes active
  useEffect(() => {
    if (sessionActive && videoRef.current) {
      registerMediaElement(videoRef.current);
      return () => {
        if (videoRef.current) {
          unregisterMediaElement(videoRef.current);
        }
      };
    }
  }, [sessionActive]);

  const resetToolbarTimer = useCallback(() => {
    setToolbarVisible(true);
    if (toolbarTimerRef.current) {
      clearTimeout(toolbarTimerRef.current);
    }
    toolbarTimerRef.current = setTimeout(() => {
      setToolbarVisible(false);
    }, 5000);
  }, []);

  useEffect(() => {
    if (!sessionActive) {
      setToolbarVisible(true);
      if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current);
      return;
    }
    resetToolbarTimer();
    if (isMobile && !isFullscreen && containerRef.current) {
      enterFullscreen(containerRef.current, videoRef.current);
    }
    return () => {
      if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current);
    };
  }, [sessionActive, resetToolbarTimer, isMobile, isFullscreen, enterFullscreen]);
  
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
          // 📱 MOBILE FIX: Use shared audio element
          const { getSharedAudioElement } = await import('@/lib/mobileAudio');
          const audio = getSharedAudioElement();
          if (audio.src && audio.src.startsWith('blob:')) {
            URL.revokeObjectURL(audio.src);
          }
          audio.src = audioUrl;
          audio.onended = () => URL.revokeObjectURL(audioUrl);
          audio.load();
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

  // Auto-scroll text chat when new messages arrive
  useEffect(() => {
    if (textChatScrollRef.current && chatMode === 'text') {
      textChatScrollRef.current.scrollTop = textChatScrollRef.current.scrollHeight;
    }
  }, [chatHistory, chatMode]);

  // Handle text-only message submission
  const handleTextSubmit = useCallback(async (message: string) => {
    if (!message.trim() || textChatLoading) return;
    
    setChatHistory(prev => [...prev, {
      id: `${Date.now()}-user`,
      role: 'user',
      content: message.trim(),
      timestamp: new Date()
    }]);
    
    setTextChatLoading(true);
    
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json", ...getAuthHeaders() };
      const memberstackId = typeof window !== 'undefined' ? (window as any).__memberstackId : undefined;
      if (memberstackId) {
        headers['X-Member-Id'] = memberstackId;
      }
      
      const response = await fetch("/api/avatar/response", {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: message.trim(),
          userId: memoryEnabled ? userId : undefined,
          avatarId: selectedAvatarId,
          memoryEnabled,
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        const claudeResponse = data.knowledgeResponse || data.response;
        
        setChatHistory(prev => [...prev, {
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          content: claudeResponse,
          timestamp: new Date()
        }]);
      } else {
        setChatHistory(prev => [...prev, {
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          content: "I'm having trouble responding right now. Please try again.",
          timestamp: new Date()
        }]);
      }
    } catch (error) {
      console.error("Text chat error:", error);
      setChatHistory(prev => [...prev, {
        id: `${Date.now()}-assistant`,
        role: 'assistant',
        content: "Connection issue. Please try again.",
        timestamp: new Date()
      }]);
    } finally {
      setTextChatLoading(false);
    }
  }, [textChatLoading, memoryEnabled, userId, selectedAvatarId]);

  // Handle triple-mode switching
  const handleChatModeChange = useCallback(async (newMode: ChatMode) => {
    if (newMode === chatMode) return;
    
    const prevMode = chatMode;
    setChatMode(newMode);
    
    if (newMode === 'text') {
      // Switching TO text mode - end any active audio/video session
      stopSharedAudio();
      if (elevenLabsAgentActive && audioOnlyRef.current) {
        await audioOnlyRef.current.endAgentConversation().catch(() => {});
      }
      setElevenLabsAgentActive(false);
      if (sessionActive) {
        await endSession().catch(() => {});
      }
      setAudioOnly(false);
      setShowChatButton(false);
      setTextChatActive(true);
      setSessionStarting(false);
    } else if (newMode === 'audio') {
      // Switching to audio mode
      setTextChatActive(false);
      setAudioOnly(true);
      if (prevMode === 'text') {
        setShowChatButton(true);
      } else {
        handleModeToggle(false);
      }
    } else if (newMode === 'video') {
      // Switching to video mode
      setTextChatActive(false);
      setAudioOnly(false);
      if (prevMode === 'text') {
        setShowChatButton(true);
      } else {
        handleModeToggle(true);
      }
    }
  }, [chatMode, elevenLabsAgentActive, sessionActive, endSession]);

  const handleModeToggle = async (isVideoMode: boolean) => {
    console.log(`🔄 handleModeToggle called: isVideoMode=${isVideoMode}`);
    console.log(`🔄 Current state: audioOnly=${audioOnly}, sessionActive=${sessionActive}, isModeSwitching=${isModeSwitching}, isLoading=${isLoading}, elevenLabsAgentActive=${elevenLabsAgentActive}`);
    console.log(`🔄 Avatar capabilities: enableVideoMode=${avatarCapabilities.enableVideoMode}, enableAudioMode=${avatarCapabilities.enableAudioMode}`);
    
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
    
    // Handle switching from ElevenLabs agent mode to video mode
    // End the agent session and let user restart in video mode via Start Chat button
    if (elevenLabsAgentActive && isVideoMode) {
      console.log("🔄 Ending ElevenLabs agent mode to switch to video");
      setElevenLabsAgentActive(false);
      setAudioOnly(false);
      setShowChatButton(true);
      setChatHistory([]); // Clear chat history for fresh start
      
      toast({
        title: "Video Mode Selected",
        description: "Press Start Chat to begin with video",
      });
      return;
    }
    
    // Handle switching from ElevenLabs agent mode to stay in audio (different avatar setup)
    if (elevenLabsAgentActive && !isVideoMode) {
      // Already in audio mode via agent, no action needed
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
        
        // Check error type for specific messages
        const errorMessage = error?.message?.toLowerCase() || '';
        const errorResponse = error?.responseText || '';
        const is404 = errorMessage.includes('404') || errorMessage.includes('not found');
        const isConcurrentLimit = errorMessage.includes('concurrent') || 
                                  errorMessage.includes('10004') ||
                                  errorResponse.includes('10004') ||
                                  errorResponse.includes('Concurrent limit');
        
        let toastTitle = "Switch failed";
        let toastDescription = "Failed to switch to video mode. Please try again.";
        
        if (isConcurrentLimit) {
          toastTitle = "Video session in use";
          toastDescription = "Another video session is active. Please close other tabs or wait a moment and try again.";
        } else if (is404) {
          toastTitle = "Video unavailable";
          toastDescription = "Video mode is not available for this avatar. Using audio mode instead.";
        }
        
        toast({
          variant: "destructive",
          title: toastTitle,
          description: toastDescription,
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
    
    // 🔇 IMMEDIATELY stop any playing audio to prevent voice overlap
    stopSharedAudio();
    
    try {
      // End any active agent session first via ref
      if (elevenLabsAgentActive && audioOnlyRef.current) {
        console.log("🔄 Calling endAgentConversation before avatar switch");
        await audioOnlyRef.current.endAgentConversation();
        console.log("🔄 Agent conversation ended");
      }
      setElevenLabsAgentActive(false);
      
      await endSession();
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Clear chat history for fresh start with new avatar
      setChatHistory([]);
      
      // Show start button to let user initiate new session
      setShowChatButton(true);
      
      toast({
        title: "Avatar Switched",
        description: `Switched to ${newAvatarId}. Press Start Chat to begin.`,
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
    // 🔇 Immediately stop any playing audio
    stopSharedAudio();
    
    // Handle both legacy session and agent mode
    if (elevenLabsAgentActive) {
      setElevenLabsAgentActive(false);
      setShowChatButton(true);
    } else {
      await endSession();
    }
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
    <div ref={containerRef} className="relative w-full h-full bg-black overflow-hidden">
      {/* Full Screen Avatar Video */}
      <div className="relative w-full h-full bg-black">
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
            muted={false}
            className="w-full h-full object-cover"
            style={{ 
              display: (videoReady && !isLoading && !showReconnect && !chromaKeyActive) ? 'block' : 'none',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100%',
              height: '100%',
              zIndex: 10,
              WebkitBackfaceVisibility: 'hidden',
              backfaceVisibility: 'hidden',
              pointerEvents: 'none',
            }}
            data-testid="avatar-video"
            onError={(e) => console.error("Video error:", e)}
            onLoadedData={() => console.log("Video loaded data")}
            onCanPlay={() => console.log("Video can play")}
          />
          {chromaKeyActive && (
            <canvas
              ref={chromaCanvasRef}
              className="w-full h-full object-cover"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100%',
                height: '100%',
                zIndex: 10,
                pointerEvents: 'none',
              }}
            />
          )}
          
          {audioOnly && !heygenSessionActive && (sessionActive || isLoading || elevenLabsAgentActive) && (
            <AudioOnlyDisplay 
              ref={audioOnlyRef}
              isSpeaking={isSpeaking} 
              sessionActive={sessionActive || elevenLabsAgentActive} 
              avatarId={selectedAvatarId}
              userId={userId}
              agentId={elevenLabsAgentConfig?.agentId || ''}
              voiceId={avatarVoiceId}
              useElevenLabsAgent={elevenLabsAgentActive}
              onSpeakingChange={(speaking) => {
                setIsSpeaking(speaking);
              }}
              onSessionStart={() => {
                console.log('🎙️ ElevenLabs agent session started');
              }}
              onSessionEnd={() => {
                console.log('🎙️ ElevenLabs agent session ended');
                setElevenLabsAgentActive(false);
                setShowChatButton(true);
              }}
              onMessage={(message) => {
                setChatHistory(prev => [...prev, {
                  id: `${Date.now()}-${message.role}`,
                  role: message.role,
                  content: message.content,
                  timestamp: new Date()
                }]);
              }}
            />
          )}
        </div>

        {/* Text Chat Mode - GIF background with chat bubbles */}
        {textChatActive && chatMode === 'text' && (
          <>
            {/* GIF Background */}
            <div className="absolute inset-0 flex items-center justify-center">
              <img
                src={(() => {
                  const gifs: Record<string, string> = {
                    'mark-kohl': '/attached_assets/MArk-kohl-loop_1763964600000.gif',
                    'willie-gault': '/attached_assets/Willie gault gif-low_1763964813725.gif',
                    'june': '/attached_assets/June-low_1764106896823.gif',
                    'thad': '/attached_assets/Thad_1763963906199.gif',
                    'nigel': '',
                    'ann': '/attached_assets/Ann_1763966361095.gif',
                    'kelsey': '/attached_assets/Kelsey_1764111279103.gif',
                    'judy': '/attached_assets/Screen Recording 2025-07-14 at 14.35.37-low_1764106921758.gif',
                    'dexter': '/attached_assets/DexterDoctor-ezgif.com-loop-count_1764111811631.gif',
                    'shawn': '/attached_assets/Screen Recording 2025-07-14 at 14.41.54-low_1764106970821.gif',
                  };
                  return gifs[selectedAvatarId] || gifs['mark-kohl'];
                })()}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/30" />
            </div>

            {/* Chat Messages Overlay */}
            <div 
              ref={textChatScrollRef}
              className="absolute inset-0 overflow-y-auto z-10 pt-20 pb-24 px-4 sm:px-6"
              style={{ scrollBehavior: 'smooth' }}
            >
              <div className="max-w-2xl mx-auto flex flex-col gap-3 min-h-full justify-end">
                {chatHistory.length === 0 && (
                  <div className="text-center text-white/70 py-8">
                    <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">Type a message to start chatting</p>
                  </div>
                )}
                {chatHistory.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-primary/90 text-white rounded-br-md'
                          : 'bg-black/70 backdrop-blur-md text-white/95 rounded-bl-md border border-white/10'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {textChatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-black/70 backdrop-blur-md text-white/70 rounded-2xl rounded-bl-md px-4 py-3 border border-white/10">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Top Controls for text mode - icon-only */}
            <div className="absolute top-3 left-0 right-0 flex items-center justify-between px-3 sm:px-4 z-30 safe-area-inset-top">
              <div className="flex items-center gap-1.5">
                <AudioVideoToggle
                  isVideoMode={false}
                  onToggle={handleModeToggle}
                  disabled={false}
                  enableAudioMode={avatarCapabilities.enableAudioMode}
                  enableVideoMode={avatarCapabilities.enableVideoMode}
                  chatMode={chatMode}
                  onModeChange={handleChatModeChange}
                  iconOnly
                />
              </div>
              <div className="flex items-center gap-1.5">
                {/* Switch Avatar */}
                <button
                  onClick={() => setShowAvatarSwitcher(true)}
                  title="Switch Avatar"
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-sm shadow-lg transition-all active:scale-95 border border-white/30 text-white/80 hover:text-white"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>

                {/* Three-dot menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="w-10 h-10 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-sm shadow-lg transition-all active:scale-95 border border-white/30 text-white/80 hover:text-white"
                      style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 bg-black/90 border-white/20 backdrop-blur-md z-[200]">
                    <DropdownMenuItem 
                      onSelect={() => setShowSettings(!showSettings)}
                      className="text-white/90 hover:text-white focus:text-white focus:bg-white/10 cursor-pointer"
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Settings
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Close */}
                <button
                  onClick={() => {
                    setTextChatActive(false);
                    setChatHistory([]);
                    setShowChatButton(true);
                  }}
                  title="End Chat"
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-red-500/80 hover:bg-red-600 backdrop-blur-sm shadow-lg transition-all active:scale-95 border border-red-400/30 text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Text Input */}
            <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-20">
              <form 
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  if (inputMessage.trim() && !textChatLoading) {
                    handleTextSubmit(inputMessage);
                    setInputMessage("");
                  }
                }}
                className="flex items-center gap-2 max-w-2xl mx-auto"
              >
                <div className="flex-1">
                  <Input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="Type your message..."
                    className="w-full bg-black/60 border-white/20 text-white placeholder:text-gray-400 backdrop-blur-sm text-base"
                    autoFocus
                    disabled={textChatLoading}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={!inputMessage.trim() || textChatLoading}
                  className="bg-primary hover:bg-primary/90 text-white min-w-[44px] min-h-[44px]"
                >
                  {textChatLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </form>
            </div>
          </>
        )}

        {/* Overlay Controls */}
        {(sessionActive || elevenLabsAgentActive) && (
          <>
            {/* Hamburger button - shown when toolbar is hidden */}
            {sessionActive && !toolbarVisible && (
              <button
                onClick={resetToolbarTimer}
                className="absolute top-3 right-3 z-30 w-10 h-10 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm shadow-lg transition-all active:scale-95 border border-white/20 text-white/70 hover:text-white safe-area-inset-top"
                data-testid="button-hamburger"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}

            {/* Top Controls Bar - Clean icon-only toolbar */}
            <div 
              className={`absolute top-3 left-0 right-0 flex items-center justify-between px-3 sm:px-4 z-30 safe-area-inset-top transition-opacity duration-300 ${
                sessionActive && !toolbarVisible ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
              onPointerDown={sessionActive ? resetToolbarTimer : undefined}
            >
              {/* Left side - Mode toggle icons */}
              <div className="flex items-center gap-1.5">
                <AudioVideoToggle
                  isVideoMode={!audioOnly}
                  onToggle={handleModeToggle}
                  disabled={isModeSwitching || isLoading}
                  enableAudioMode={avatarCapabilities.enableAudioMode}
                  enableVideoMode={avatarCapabilities.enableVideoMode}
                  chatMode={chatMode}
                  onModeChange={handleChatModeChange}
                  iconOnly
                />
                <LanguageSelector
                  selectedLanguage={selectedLanguage}
                  onLanguageChange={handleLanguageChange}
                  disabled={isLoading}
                />
              </div>

              {/* Right side - Icon buttons + three-dot menu + close */}
              <div className="flex items-center gap-1.5">
                {/* Mute - only in voice/video mode */}
                {chatMode !== 'text' && !elevenLabsAgentActive && (
                  <button
                    onClick={toggleMicMute}
                    title={isMicMuted ? "Unmute" : "Mute"}
                    className={`w-10 h-10 flex items-center justify-center rounded-full backdrop-blur-sm shadow-lg transition-all active:scale-95 border ${
                      isMicMuted 
                        ? 'bg-red-500/80 hover:bg-red-500/90 border-red-400/60 text-white' 
                        : 'bg-black/60 hover:bg-black/80 border-white/30 text-white/80 hover:text-white'
                    }`}
                    data-testid="button-mute-mic"
                  >
                    {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                )}

                {/* Switch Avatar */}
                <button
                  onClick={() => setShowAvatarSwitcher(true)}
                  title="Switch Avatar"
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-sm shadow-lg transition-all active:scale-95 border border-white/30 text-white/80 hover:text-white"
                  data-testid="button-switch-avatar"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>

                {/* Fullscreen */}
                {fullscreenSupported && (
                  <button
                    onClick={() => toggleFullscreen(containerRef.current, videoRef.current)}
                    title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-sm shadow-lg transition-all active:scale-95 border border-white/30 text-white/80 hover:text-white"
                    data-testid="button-fullscreen"
                  >
                    {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                  </button>
                )}

                {/* MUM Mode toggle */}
                <button
                  onClick={toggleMumMode}
                  title={mumMode ? "MUM Mode: ON — Private session" : "MUM Mode: OFF — Memory enabled"}
                  className={`w-10 h-10 flex items-center justify-center rounded-full backdrop-blur-sm shadow-lg transition-all active:scale-95 border ${
                    mumMode
                      ? 'bg-purple-600/60 hover:bg-purple-600/80 border-purple-400/60'
                      : 'bg-black/60 hover:bg-black/80 border-white/30'
                  }`}
                  data-testid="button-mum-mode"
                >
                  <img src={mumIconPath} alt="MUM" className="w-6 h-6 rounded" />
                </button>

                {/* Three-dot menu for less-used actions */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="w-10 h-10 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-sm shadow-lg transition-all active:scale-95 border border-white/30 text-white/80 hover:text-white"
                      style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                      data-testid="button-menu"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 bg-black/90 border-white/20 backdrop-blur-md z-[200]">
                    {!elevenLabsAgentActive && (
                      <DropdownMenuItem 
                        onSelect={() => togglePause()}
                        className="text-white/90 hover:text-white focus:text-white focus:bg-white/10 cursor-pointer"
                        data-testid="menu-pause"
                      >
                        {isPaused ? (
                          <>
                            <Play className="w-4 h-4 mr-2" />
                            Resume
                          </>
                        ) : (
                          <>
                            <Pause className="w-4 h-4 mr-2" />
                            Pause
                          </>
                        )}
                      </DropdownMenuItem>
                    )}
                    
                    <DropdownMenuItem 
                      onSelect={() => setShowSettings(!showSettings)}
                      className="text-white/90 hover:text-white focus:text-white focus:bg-white/10 cursor-pointer"
                      data-testid="menu-settings"
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Settings
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem 
                      onSelect={() => setShowMiniGames(true)}
                      className="text-white/90 hover:text-white focus:text-white focus:bg-white/10 cursor-pointer"
                      data-testid="menu-games"
                    >
                      <Gamepad2 className="w-4 h-4 mr-2" />
                      Play Games
                    </DropdownMenuItem>
                    
                    {isSpeaking && audioOnly && (
                      <>
                        <DropdownMenuSeparator className="bg-white/20" />
                        <DropdownMenuItem 
                          onSelect={() => {
                            stopAudio();
                            toast({
                              title: "Audio Stopped",
                              description: "Playback stopped",
                            });
                          }}
                          className="text-amber-400 hover:text-amber-300 focus:text-amber-300 focus:bg-white/10 cursor-pointer"
                          data-testid="menu-stop-audio"
                        >
                          <VolumeX className="w-4 h-4 mr-2" />
                          Stop Audio
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                
                {/* Close/End chat */}
                <button
                  onClick={endChat}
                  title="End Chat"
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-red-500/80 hover:bg-red-600 backdrop-blur-sm shadow-lg transition-all active:scale-95 border border-red-400/30 text-white"
                  data-testid="button-end-chat"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Mic Blocked Status - only show when permission denied */}
            {microphoneStatus === 'permission-denied' && (
              <div className="absolute top-16 right-4 flex items-center gap-2 bg-red-500/20 border border-red-500/40 px-3 py-2 rounded-full backdrop-blur-sm z-30">
                <MicOff className="w-4 h-4 text-red-400" />
                <span className="text-sm text-red-400 font-medium">Mic blocked</span>
              </div>
            )}
            
            {/* Voice Not Supported - Only show if microphone truly not working after session is fully active */}
            {microphoneStatus === 'not-supported' && !isLoading && (
              <div className="absolute top-16 right-4 flex flex-col items-end gap-1 bg-amber-500/20 border border-amber-500/40 px-3 py-2 rounded-lg backdrop-blur-sm z-30 max-w-[200px]">
                <div className="flex items-center gap-2">
                  <MicOff className="w-4 h-4 text-amber-400" />
                  <span className="text-sm text-amber-400 font-medium">Voice connecting...</span>
                </div>
                <span className="text-xs text-amber-300/80 text-right">Type your message or wait</span>
              </div>
            )}
            
            {/* iOS Safari needs gesture - show tap to speak button */}
            {microphoneStatus === 'needs-gesture' && (
              <button
                onClick={manualStartVoice}
                className="absolute top-16 right-4 flex items-center gap-2 bg-blue-500/30 hover:bg-blue-500/50 border border-blue-400/60 px-4 py-2 rounded-full backdrop-blur-sm z-30 transition-all active:scale-95"
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

        {/* Disclaimer Modal - shows before first session */}
        {showDisclaimer && !showAvatarSelector && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-30">
            <div className="bg-zinc-900 border border-white/20 rounded-2xl max-w-md mx-4 p-6 sm:p-8 shadow-2xl">
              <h2 className="text-xl font-semibold text-white mb-4">Before we start</h2>
              <div className="text-white/80 text-sm leading-relaxed space-y-3 mb-4">
                <p>MUM provides general information and conversational guidance only.</p>
                <p>It does not provide medical, mental health, legal, or professional advice, and it does not replace working with a qualified professional who knows your personal situation.</p>
                <p>Any insights shared here are meant to help you think, reflect, and explore options — not to diagnose, treat, or direct medical or therapeutic decisions.</p>
                <p>If you are dealing with a medical condition, mental health concern, or urgent situation, please consult a licensed professional or appropriate services.</p>
              </div>

              <button
                onClick={toggleMumMode}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all mb-4 ${
                  mumMode
                    ? 'bg-purple-600/20 border-purple-500/50'
                    : 'bg-white/5 border-white/10 hover:border-white/20'
                }`}
              >
                <img src={mumIconPath} alt="MUM" className="w-10 h-10 rounded-lg flex-shrink-0" />
                <div className="text-left flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white text-sm font-semibold">MUM Mode</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${mumMode ? 'bg-purple-500/30 text-purple-300' : 'bg-white/10 text-white/50'}`}>
                      {mumMode ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <p className="text-white/50 text-xs leading-snug mt-0.5">
                    In MUM mode, conversations are not stored or remembered. No chat history is retained. Each session stands alone — private, untracked, and separate from your account history.
                  </p>
                </div>
              </button>

              <Button
                onClick={() => {
                  localStorage.setItem('disclaimer-accepted', 'true');
                  setShowDisclaimer(false);
                }}
                className="w-full bg-primary hover:bg-primary/90 text-white py-3 text-base font-medium rounded-xl"
              >
                I understand — let's continue
              </Button>
            </div>
          </div>
        )}

        {/* Start Button - requests microphone permission if needed, then starts chat */}
        {showChatButton && !showDisclaimer && !showAvatarSelector && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20">
            {/* Mode Toggle above the start button */}
            <div className="absolute top-6 left-0 right-0 flex justify-center z-30">
              <AudioVideoToggle
                isVideoMode={!audioOnly}
                onToggle={(isVideo) => {
                  if (isVideo) {
                    setChatMode('video');
                    setAudioOnly(false);
                  } else {
                    setChatMode('audio');
                    setAudioOnly(true);
                  }
                }}
                disabled={false}
                enableAudioMode={avatarCapabilities.enableAudioMode}
                enableVideoMode={avatarCapabilities.enableVideoMode}
                chatMode={chatMode}
                onModeChange={(newMode) => {
                  setChatMode(newMode);
                  if (newMode === 'audio') setAudioOnly(true);
                  else if (newMode === 'video') setAudioOnly(false);
                }}
                iconOnly
              />
            </div>
            <Button
              onClick={async () => {
                console.log("📱 BUTTON CLICKED - Start Chat pressed, mode:", chatMode);
                
                // Text mode: skip mic permission and audio unlock
                if (chatMode === 'text') {
                  setShowChatButton(false);
                  setTextChatActive(true);
                  // Fetch and show avatar greeting in text mode (only if no messages yet)
                  if (chatHistory.length === 0) {
                    try {
                      const greetingResponse = await fetch(`/api/avatar/greeting/${selectedAvatarId}`);
                      if (greetingResponse.ok) {
                        const { greeting } = await greetingResponse.json();
                        if (greeting) {
                          setChatHistory([{
                            id: `${Date.now()}-assistant`,
                            role: 'assistant',
                            content: greeting,
                            timestamp: new Date()
                          }]);
                        }
                      }
                    } catch (e) {
                      console.warn("Failed to fetch text mode greeting:", e);
                    }
                  }
                  return;
                }
                
                // 📱 CRITICAL: Unlock mobile audio FIRST during user interaction
                // iOS requires this to be done during a user gesture
                const { unlockMobileAudio } = await import('@/lib/mobileAudio');
                await unlockMobileAudio();
                console.log("📱 Mobile audio unlocked");
                
                // Request microphone permission if not already granted
                if (micPermissionGranted !== true) {
                  setRequestingMicPermission(true);
                  try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    stream.getTracks().forEach(track => track.stop());
                    setMicPermissionGranted(true);
                  } catch (error: any) {
                    console.error('Microphone permission denied:', error);
                    setMicPermissionGranted(false);
                    setRequestingMicPermission(false);
                    toast({
                      variant: "destructive",
                      title: "Microphone Access Required",
                      description: "Please allow microphone access to start voice chat",
                    });
                    return; // Don't proceed if mic denied
                  }
                  setRequestingMicPermission(false);
                }
                
                setShowChatButton(false);
                setSessionStarting(true); // Show loading immediately to prevent black screen
                console.log("📱 State updated, about to call startSession");
                
                // Check if ElevenLabs Agent mode is enabled for audio-only
                const useElevenLabsAgent = audioOnly && elevenLabsAgentConfig?.enabled;
                
                if (useElevenLabsAgent) {
                  // ElevenLabs Agent mode: Skip legacy pipeline, let ElevenLabsConversation handle everything
                  console.log("🎙️ Using ElevenLabs Agent mode - skipping legacy session");
                  setSessionStarting(false);
                  // Set agent active to show the audio-only display with agent
                  // The ElevenLabsConversation component will auto-start
                  setElevenLabsAgentActive(true);
                  return;
                }
                
                const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                
                // For audio-only mode: Use direct session start (same as desktop)
                // No complex LiveKit setup needed - just start listening and responding
                if (audioOnly) {
                  console.log("🎧 Audio-only mode - using direct session start");
                  startSession({ audioOnly: true, avatarId: selectedAvatarId }).then(() => {
                    console.log("🎧 Audio-only session started successfully");
                  }).catch((error: any) => {
                    setShowChatButton(true);
                    setSessionStarting(false);
                    toast({
                      variant: "destructive",
                      title: "Cannot start session",
                      description: error.message || "Failed to start session",
                    });
                  });
                  return;
                }
                
                // Video mode on mobile: Use LiveKit server-side approach
                if (isMobile) {
                  console.log("📱 Mobile VIDEO detected, using LiveKit server-side approach");
                  
                  (async () => {
                    try {
                      console.log("📱 Starting mobile session via LiveKit...");
                      
                      // Get LiveKit room credentials from server
                      const response = await fetch('/api/session/start-mobile', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                        credentials: 'include',
                        body: JSON.stringify({ 
                          userId: userId,
                          avatarId: selectedAvatarId 
                        }),
                      });
                      
                      if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        throw new Error(errorData.error || 'Failed to start mobile session');
                      }
                      
                      const data = await response.json();
                      console.log("📱 Mobile session created:", data.sessionId);
                      console.log("📱 LiveKit room:", data.livekit?.room);
                      
                      // Store LiveKit credentials for the session
                      if (data.livekit) {
                        (window as any).__mobileAvatarLiveKit = data.livekit;
                      }
                      
                      // Start session with LiveKit config
                      await startSession({ 
                        audioOnly: false, 
                        avatarId: selectedAvatarId,
                        skipServerRegistration: true,
                      });
                      
                      console.log("📱 Mobile session started successfully via LiveKit");
                    } catch (error: any) {
                      console.error("📱 Mobile session error:", error);
                      setShowChatButton(true);
                      setSessionStarting(false);
                      toast({
                        variant: "destructive",
                        title: "Cannot start session",
                        description: error.message || "Failed to start session",
                      });
                    }
                  })();
                } else {
                  // Desktop video path - direct session start
                  console.log("🖥️ Desktop VIDEO detected, using direct session start");
                  startSession({ audioOnly: false, avatarId: selectedAvatarId }).then(() => {
                    console.log("🖥️ startSession returned successfully");
                  }).catch((error: any) => {
                    setShowChatButton(true);
                    setSessionStarting(false);
                    toast({
                      variant: "destructive",
                      title: "Cannot start session",
                      description: error.message || "Failed to start session",
                    });
                  });
                }
              }}
              disabled={requestingMicPermission}
              className="bg-primary hover:bg-primary/90 text-white px-8 py-4 text-lg font-semibold rounded-full shadow-lg flex items-center gap-2"
              style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
              data-testid="button-start-session"
            >
              {requestingMicPermission ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Requesting...
                </>
              ) : chatMode === 'text' ? (
                <>
                  <MessageSquare className="w-5 h-5" />
                  Start Text Chat
                </>
              ) : (
                "Let's have a word"
              )}
            </Button>
            {micPermissionGranted === false && (
              <p className="text-red-400 text-sm mt-4 text-center">
                Microphone access was denied. Please check browser settings.
              </p>
            )}
          </div>
        )}

        {/* Loading Overlay - shows immediately when Start Chat is clicked or during loading */}
        {/* Keep overlay visible until video is actually ready (videoReady) in video mode, or session is active in audio mode */}
        {/* Hide if showReconnect or loadingTimedOut is true (will show reconnect screen instead) */}
        {!showReconnect && !loadingTimedOut && (isLoading || isModeSwitching || (sessionStarting && !sessionActive) || (!audioOnly && !videoReady && sessionActive)) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-20">
            {/* Always show avatar placeholder for visual feedback */}
            <LoadingPlaceholder avatarId={selectedAvatarId} data-testid="loading-placeholder" />
            {isModeSwitching && (
              <p className="text-white/80 mt-4 text-sm">
                Switching to {audioOnly ? 'audio' : 'video'} mode...
              </p>
            )}
            {!audioOnly && !isModeSwitching && (
              <p className="text-white/60 text-xs mt-2">
                Loading video avatar...
              </p>
            )}
          </div>
        )}

        {/* Reconnect Screen - shows on disconnect or loading timeout */}
        {(showReconnect || loadingTimedOut) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black z-20">
            <LoadingPlaceholder avatarId={selectedAvatarId} data-testid="reconnect-placeholder" />
            {loadingTimedOut && !showReconnect && (
              <p className="text-white/70 text-sm text-center max-w-xs">
                Taking longer than expected. Please try again.
              </p>
            )}
            <Button
              onClick={async () => {
                setLoadingTimedOut(false);
                setSessionStarting(false);
                setShowChatButton(true);
                try {
                  await endSession();
                } catch (e) {
                  // Ignore errors when ending stale session
                }
              }}
              className="bg-primary hover:bg-primary/90 text-white px-8 py-3 font-semibold rounded-full shadow-lg"
              data-testid="button-reconnect"
            >
              {loadingTimedOut ? "Try Again" : "Reconnect"}
            </Button>
            {chatMode !== 'text' && (
              <button
                onClick={toggleMicMute}
                title={isMicMuted ? "Unmute" : "Mute"}
                className={`w-12 h-12 flex items-center justify-center rounded-full backdrop-blur-sm shadow-lg transition-all active:scale-95 border ${
                  isMicMuted 
                    ? 'bg-red-500/80 hover:bg-red-500/90 border-red-400/60 text-white' 
                    : 'bg-black/60 hover:bg-black/80 border-white/30 text-white/80 hover:text-white'
                }`}
                data-testid="button-mute-mic-reconnect"
              >
                {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
            )}
          </div>
        )}

        {/* Settings Panel */}
        {showSettings && sessionActive && (
          <div className="absolute top-20 right-6 bg-black/90 backdrop-blur-lg border border-white/20 rounded-lg p-4 w-72 z-10">
            <h3 className="text-white font-semibold mb-4">Settings</h3>
            
            <div className="space-y-4">
              {/* Volume Control */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="volume" className="text-white text-sm flex items-center gap-2">
                    {volume === 0 ? (
                      <VolumeX className="w-4 h-4" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                    Volume
                  </label>
                  <span className="text-white/70 text-xs">{Math.round(volume)}%</span>
                </div>
                <Slider
                  id="volume"
                  value={[volume]}
                  onValueChange={handleVolumeChange}
                  min={0}
                  max={100}
                  step={5}
                  className="w-full"
                />
              </div>

              <button
                onClick={toggleMumMode}
                className={`w-full flex items-center gap-3 p-2 rounded-lg border transition-all ${
                  mumMode
                    ? 'bg-purple-600/20 border-purple-500/50'
                    : 'bg-white/5 border-white/10 hover:border-white/20'
                }`}
              >
                <img src={mumIconPath} alt="MUM" className="w-8 h-8 rounded flex-shrink-0" />
                <div className="text-left flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-white text-sm font-medium">MUM Mode</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${mumMode ? 'bg-purple-500/30 text-purple-300' : 'bg-white/10 text-white/50'}`}>
                      {mumMode ? 'ON' : 'OFF'}
                    </span>
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Drag overlay */}
        {isDragOver && (sessionActive || elevenLabsAgentActive) && (
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
        {(sessionActive || elevenLabsAgentActive) && (
          <div 
            className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/60 to-transparent z-10"
            onDragOver={!elevenLabsAgentActive ? handleDragOver : undefined}
            onDragLeave={!elevenLabsAgentActive ? handleDragLeave : undefined}
            onDrop={!elevenLabsAgentActive ? handleDrop : undefined}
          >
            {/* Agent mode: Show voice indicator instead of text input */}
            {elevenLabsAgentActive ? (
              <div className="max-w-4xl mx-auto text-center">
                <p className="text-white/70 text-sm">
                  Speak naturally - the AI is listening
                </p>
              </div>
            ) : (
              <>
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
                  <button
                    type="button"
                    onClick={toggleMumMode}
                    title={mumMode ? "MUM Mode: ON — Private session" : "MUM Mode: OFF — Memory enabled"}
                    className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-md transition-all ${
                      mumMode 
                        ? 'ring-2 ring-purple-500/60 opacity-100' 
                        : 'opacity-60 hover:opacity-90'
                    }`}
                  >
                    <img src={mumIconPath} alt="MUM" className="w-7 h-7 rounded" />
                  </button>
                  <Button
                    type="submit"
                    disabled={(!inputMessage.trim() && !attachedImage) || !sessionActive || isPaused}
                    className="bg-primary hover:bg-primary/90 text-white"
                    data-testid="button-send-message"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
              </>
            )}
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
        
        {showMiniGames && (
          <AvatarMiniGames
            avatarId={selectedAvatarId}
            userId={userId}
            onClose={() => setShowMiniGames(false)}
            onGameMessage={(userMsg, avatarMsg) => {
              setChatHistory(prev => [
                ...prev,
                { id: `game-${Date.now()}-user`, role: 'user', content: userMsg, timestamp: new Date() },
                { id: `game-${Date.now()}-avatar`, role: 'assistant', content: avatarMsg, timestamp: new Date() }
              ]);
            }}
          />
        )}
      </div>
    </div>
  );
}
