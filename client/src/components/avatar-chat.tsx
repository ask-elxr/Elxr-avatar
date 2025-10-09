import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Maximize, Minimize, MessageSquare, Mic, MicOff, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useKnowledgeBase } from "@/hooks/useKnowledgeBase";

export function AvatarChat() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [micPermission, setMicPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const { user, isAuthenticated } = useAuth();
  const { getAvatarResponse, isLoading, error } = useKnowledgeBase();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const requestMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermission('granted');
      stream.getTracks().forEach(track => track.stop());
      setRefreshKey(prev => prev + 1);
      alert('✅ Microphone permission granted! The avatar can now hear you.');
    } catch (err) {
      setMicPermission('denied');
      alert('❌ Microphone access denied. Click the 🔒 lock icon in your browser address bar and allow microphone access.');
    }
  };

  const testCurrentInfo = async () => {
    try {
      const response = await getAvatarResponse("Who is the current US president in 2025?");
      alert(`✅ BACKEND API (WITH CURRENT DATA):\n\n${response.substring(0, 300)}...\n\n💡 This uses Pinecone + Google Search + Claude Sonnet 4 with current 2025 information!`);
    } catch (err) {
      alert(`❌ Error: ${err instanceof Error ? err.message : 'Failed to query'}`);
    }
  };

  const openDirectLink = () => {
    const heygenUrl = "https://labs.heygen.com/guest/streaming-embed?share=eyJxdWFsaXR5IjoiaGlnaCIsImF2YXRhck5hbWUiOiI3ZTAxZTVkNGUwNjE0OWM5YmEzYzE3Mjhm%0D%0AYThmMDNkMCIsInByZXZpZXdJbWciOiJodHRwczovL2ZpbGVzMi5oZXlnZW4uYWkvYXZhdGFyL3Yz%0D%0ALzdlMDFlNWQ0ZTA2MTQ5YzliYTNjMTcyOGZhOGYwM2QwL2Z1bGwvMi4yL3ByZXZpZXdfdGFyZ2V0%0D%0ALndlYnAiLCJuZWVkUmVtb3ZlQmFja2dyb3VuZCI6ZmFsc2UsImtub3dsZWRnZUJhc2VJZCI6ImVk%0D%0AYjA0Y2I4ZTdiNDRiNmZiMGNkNzNhM2VkZDRiY2E0IiwidXNlcm5hbWUiOiJlN2JjZWNhYWMwZTA0%0D%0ANTZjYjZiZDBjYWFiNzBmZjQ2MSJ9";
    window.open(heygenUrl, '_blank');
  };

  return (
    <div className="w-full h-screen relative overflow-hidden">
      {/* Fullscreen Button - Mobile Only */}
      {isMobile && (
        <Button
          onClick={toggleFullscreen}
          className="absolute top-4 left-4 z-50 bg-black/50 hover:bg-black/70 text-white rounded-full p-3 backdrop-blur-sm"
          data-testid="button-fullscreen-toggle"
        >
          {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
        </Button>
      )}

      {/* Control Buttons - Top Right */}
      <div className="absolute top-4 right-4 z-50 flex gap-2">
        {/* Test Backend API Button - SHOWS CURRENT DATA */}
        <Button
          onClick={testCurrentInfo}
          disabled={isLoading}
          className="bg-blue-600/80 hover:bg-blue-700 text-white rounded-full p-3 backdrop-blur-sm animate-pulse"
          data-testid="button-test-backend"
          title="Test backend API with current 2025 information (Pinecone + Google + Claude)"
        >
          <MessageSquare className="w-5 h-5" />
        </Button>

        {/* Microphone Permission Button */}
        <Button
          onClick={requestMicrophonePermission}
          className={`${
            micPermission === 'granted' 
              ? 'bg-green-600/80 hover:bg-green-700' 
              : micPermission === 'denied'
              ? 'bg-yellow-600/80 hover:bg-yellow-700'
              : 'bg-orange-600/80 hover:bg-orange-700'
          } text-white rounded-full p-3 backdrop-blur-sm`}
          data-testid="button-microphone-permission"
          title={
            micPermission === 'granted' 
              ? 'Microphone access granted' 
              : micPermission === 'denied'
              ? 'Microphone access denied - click to retry'
              : 'Click to enable microphone access'
          }
        >
          {micPermission === 'granted' ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </Button>

        {/* Direct Link Test Button */}
        <Button
          onClick={openDirectLink}
          className="bg-purple-600/80 hover:bg-purple-700 text-white rounded-full p-3 backdrop-blur-sm"
          data-testid="button-direct-link"
          title="Open HeyGen avatar in new tab"
        >
          <ExternalLink className="w-5 h-5" />
        </Button>
      </div>

      {/* Video Avatar Iframe */}
      <div className={`w-full h-full avatar-iframe-container ${isFullscreen && isMobile ? 'transform scale-[4] origin-center' : ''}`}>
        <iframe
          key={refreshKey}
          ref={iframeRef}
          src={`https://labs.heygen.com/guest/streaming-embed?share=eyJxdWFsaXR5IjoiaGlnaCIsImF2YXRhck5hbWUiOiI3ZTAxZTVkNGUwNjE0OWM5YmEzYzE3Mjhm%0D%0AYThmMDNkMCIsInByZXZpZXdJbWciOiJodHRwczovL2ZpbGVzMi5oZXlnZW4uYWkvYXZhdGFyL3Yz%0D%0ALzdlMDFlNWQ0ZTA2MTQ5YzliYTNjMTcyOGZhOGYwM2QwL2Z1bGwvMi4yL3ByZXZpZXdfdGFyZ2V0%0D%0ALndlYnAiLCJuZWVkUmVtb3ZlQmFja2dyb3VuZCI6ZmFsc2UsImtub3dsZWRnZUJhc2VJZCI6ImVk%0D%0AYjA0Y2I4ZTdiNDRiNmZiMGNkNzNhM2VkZDRiY2E0IiwidXNlcm5hbWUiOiJlN2JjZWNhYWMwZTA0%0D%0ANTZjYjZiZDBjYWFiNzBmZjQ2MSJ9&inIFrame=1&t=${refreshKey}`}
          className="w-full h-full border-0"
          allow="microphone; camera"
          title="HeyGen Interactive Avatar"
          data-testid="heygen-avatar-iframe"
        />
      </div>
    </div>
  );
}
