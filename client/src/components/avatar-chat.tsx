import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Maximize, Minimize, X } from "lucide-react";
import loadingVideo from "@assets/intro logo_1760052672430.mp4";

export function AvatarChat() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

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
    // Listen for HeyGen iframe messages to detect when chat starts
    const handleMessage = (event: MessageEvent) => {
      // Verify message is from HeyGen
      if (!event.origin.includes('heygen.com')) return;
      
      const data = event.data;
      
      // Show loading video when chat starts/connects
      if (data.type === 'streaming-embed' && 
          (data.action === 'show' || data.action === 'start' || data.action === 'connect' || data.action === 'connecting')) {
        setIsLoading(true);
      }
      
      // Also show on connection status changes
      if (data.status === 'connecting' || data.event === 'connecting') {
        setIsLoading(true);
      }
    };

    window.addEventListener('message', handleMessage);
    
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    // Auto-hide loading video after 8 seconds to ensure it covers full connecting phase
    if (isLoading) {
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 8000);
      
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const endChat = () => {
    // Reset the iframe to end the call
    setRefreshKey(prev => prev + 1);
    setIsLoading(true); // Show loading again when restarting
  };


  return (
    <div className="w-full h-screen relative overflow-hidden">
      {/* Fullscreen Button - Mobile Only (Top Left) */}
      {isMobile && (
        <Button
          onClick={toggleFullscreen}
          className="absolute top-4 left-4 z-50 bg-black/50 hover:bg-black/70 text-white rounded-full p-3 backdrop-blur-sm"
          data-testid="button-fullscreen-toggle"
        >
          {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
        </Button>
      )}

      {/* End Chat Button - Top Right (All Screens) */}
      <Button
        onClick={endChat}
        className={`absolute z-50 bg-red-600/80 hover:bg-red-700 text-white rounded-full backdrop-blur-sm flex items-center gap-2 ${
          isMobile ? 'top-4 right-4 p-3' : 'top-6 right-6 px-4 py-2'
        }`}
        data-testid="button-end-chat"
        title="End chat and restart"
      >
        <X className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} />
        {!isMobile && <span className="text-sm font-medium">End Chat</span>}
      </Button>

      {/* Loading Video Overlay */}
      {isLoading && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black">
          <video
            autoPlay
            muted
            playsInline
            className="max-w-[80%] max-h-[80%] object-contain"
            data-testid="loading-video"
          >
            <source src={loadingVideo} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>
      )}

      {/* Avatar Iframe */}
      <div className={`w-full h-full overflow-hidden relative ${isFullscreen && isMobile ? 'transform scale-[4] origin-center' : ''}`}>
        <iframe
          key={refreshKey}
          src={`https://labs.heygen.com/guest/streaming-embed?share=eyJxdWFsaXR5IjoiaGlnaCIsImF2YXRhck5hbWUiOiI3ZTAxZTVkNGUwNjE0OWM5YmEzYzE3Mjhm%0D%0AYThmMDNkMCIsInByZXZpZXdJbWciOiJodHRwczovL2ZpbGVzMi5oZXlnZW4uYWkvYXZhdGFyL3Yz%0D%0ALzdlMDFlNWQ0ZTA2MTQ5YzliYTNjMTcyOGZhOGYwM2QwL2Z1bGwvMi4yL3ByZXZpZXdfdGFyZ2V0%0D%0ALndlYnAiLCJuZWVkUmVtb3ZlQmFja2dyb3VuZCI6ZmFsc2UsImtub3dsZWRnZUJhc2VJZCI6ImVk%0D%0AYjA0Y2I4ZTdiNDRiNmZiMGNkNzNhM2VkZDRiY2E0Iiwic2hhcmVfY29kZSI6IjhiZWM2YzBlLTJl%0D%0AYjEtNGVkMy04ODBiLTdiN2I3Yzg3NDFmZSIsInVzZXJuYW1lIjoiZTdiY2VjYWFjMGUwNDU2Y2I2%0D%0AYmQwY2FhYjcwZmY0NjEifQ%3D%3D&inIFrame=1&t=${refreshKey}`}
          className="w-full h-full border-0"
          allow="microphone; camera"
          title="HeyGen Interactive Avatar"
          data-testid="heygen-avatar-iframe"
        />
        
        {/* Mask overlay to hide HeyGen's built-in End Chat button (bottom right) */}
        <div 
          className="absolute bottom-0 right-0 w-64 h-28 z-[100] pointer-events-none"
          style={{
            background: '#e5e1d8'
          }}
        />
      </div>
    </div>
  );
}
