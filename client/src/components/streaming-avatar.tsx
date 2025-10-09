import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Maximize, Minimize, X, Mic } from "lucide-react";
import StreamingAvatar, { AvatarQuality, StreamingEvents, TaskType } from "@heygen/streaming-avatar";

export function StreamingAvatarComponent() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [avatarStarted, setAvatarStarted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  
  const mediaStreamRef = useRef<HTMLVideoElement>(null);
  const avatarRef = useRef<StreamingAvatar | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
      endSession();
    };
  }, []);

  useEffect(() => {
    if (!avatarStarted && !isLoadingSession) {
      startSession();
    }
  }, []);

  useEffect(() => {
    if (stream && mediaStreamRef.current) {
      mediaStreamRef.current.srcObject = stream;
      mediaStreamRef.current.onloadedmetadata = () => {
        mediaStreamRef.current?.play().catch(err => {
          console.error("Video play error:", err);
        });
      };
    }
  }, [stream]);

  // Initialize Web Speech API when avatar is ready
  useEffect(() => {
    if (avatarStarted && !isLoadingSession && 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        console.log('🎤 Voice recognition started');
        setIsListening(true);
      };

      recognition.onresult = async (event: any) => {
        const transcript = event.results[event.results.length - 1][0].transcript;
        console.log('📝 Heard:', transcript);
        
        if (transcript.trim()) {
          await handleSpeak(transcript);
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech') {
          recognition.start();
        }
      };

      recognition.onend = () => {
        if (avatarStarted) {
          recognition.start();
        }
      };

      recognitionRef.current = recognition;
      recognition.start();

      return () => {
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
      };
    }
  }, [avatarStarted, isLoadingSession]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error("Fullscreen error:", err);
      setIsFullscreen(!isFullscreen);
    }
  };

  async function fetchAccessToken(): Promise<string> {
    try {
      const response = await fetch("/api/heygen/token", {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch access token");
      }

      const data = await response.json();
      return data.token;
    } catch (error) {
      console.error("Error fetching access token:", error);
      throw error;
    }
  }

  async function startSession() {
    console.log("🚀 Starting avatar session...");
    setIsLoadingSession(true);

    try {
      const newToken = await fetchAccessToken();
      
      const avatar = new StreamingAvatar({ token: newToken });
      avatarRef.current = avatar;
      setAvatarStarted(true);

      avatar.on(StreamingEvents.STREAM_READY, (event) => {
        console.log("✅ Stream ready");
        setStream(event.detail);
      });

      await avatar.createStartAvatar({
        quality: AvatarQuality.High,
        avatarName: "Angela-inblackskirt-20220820",
        language: "en",
        disableIdleTimeout: false
      });

      setIsLoadingSession(false);
    } catch (error) {
      console.error("❌ Error starting avatar session:", error);
      setAvatarStarted(false);
      setIsLoadingSession(false);
    }
  }

  async function handleSpeak(text: string) {
    try {
      const response = await fetch("/api/chat/enhanced", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: text,
          useWebSearch: true
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log("🤖 AI Response:", data.message);
        
        if (avatarRef.current) {
          await avatarRef.current.speak({ 
            text: data.message,
            taskType: TaskType.TALK
          });
        }
      }
    } catch (error) {
      console.error("Error processing message:", error);
    }
  }

  async function endSession() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    
    if (avatarRef.current) {
      try {
        await avatarRef.current.stopAvatar();
      } catch (error) {
        console.error("Error ending session:", error);
      }
    }
    setAvatarStarted(false);
    setStream(null);
    setIsListening(false);
  }

  const forceRefreshAvatar = async () => {
    await endSession();
    setTimeout(() => startSession(), 500);
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      
      {/* Top Controls */}
      <div className="absolute top-4 right-4 flex gap-2 z-50">
        <Button
          onClick={toggleFullscreen}
          className="bg-gray-600/80 hover:bg-gray-700 text-white rounded-full p-3 backdrop-blur-sm"
          data-testid="button-fullscreen"
        >
          {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
        </Button>
        <Button
          onClick={forceRefreshAvatar}
          className="bg-gray-600/80 hover:bg-gray-700 text-white rounded-full p-3 backdrop-blur-sm"
          data-testid="button-force-refresh"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Avatar Video */}
      <div className={`w-full h-full ${isFullscreen && isMobile ? 'transform scale-[4] origin-center' : ''}`}>
        <video
          ref={mediaStreamRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover bg-black"
          data-testid="heygen-avatar-video"
        >
          <track kind="captions" />
        </video>
        
        {/* Listening Indicator */}
        {isListening && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-600 text-white shadow-lg">
              <Mic className="w-4 h-4 animate-pulse" />
              <span className="text-sm font-medium">Listening...</span>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
