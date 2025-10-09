import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Maximize, Minimize, X } from "lucide-react";
import loadingVideo from "@assets/elxr_Transparent-DarkBg_1760049264390.mov";

export function AvatarChat() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

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
    // Show loading video for 5 seconds to give avatar time to initialize
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 5000); // Show loading for 5 seconds

    return () => clearTimeout(timer);
  }, [refreshKey]);

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
      {/* Mobile Controls */}
      {isMobile && (
        <>
          {/* Fullscreen Button - Top Left */}
          <Button
            onClick={toggleFullscreen}
            className="absolute top-4 left-4 z-50 bg-black/50 hover:bg-black/70 text-white rounded-full p-3 backdrop-blur-sm"
            data-testid="button-fullscreen-toggle"
          >
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </Button>
          
          {/* End Chat Button - Top Right */}
          <Button
            onClick={endChat}
            className="absolute top-4 right-4 z-50 bg-red-600/80 hover:bg-red-700 text-white rounded-full p-3 backdrop-blur-sm"
            data-testid="button-end-chat"
            title="End chat and restart"
          >
            <X className="w-5 h-5" />
          </Button>
        </>
      )}

      {/* End Chat Button - Desktop (Top Right) */}
      {!isMobile && (
        <Button
          onClick={endChat}
          className="absolute top-6 right-6 z-50 bg-red-600/80 hover:bg-red-700 text-white rounded-full px-4 py-2 backdrop-blur-sm flex items-center gap-2"
          data-testid="button-end-chat-desktop"
          title="End chat and restart"
        >
          <X className="w-4 h-4" />
          <span className="text-sm font-medium">End Chat</span>
        </Button>
      )}

      {/* Loading Video Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="max-w-[80%] max-h-[80%] object-contain"
            data-testid="loading-video"
            onError={(e) => console.error('Video loading error:', e)}
            onLoadedData={() => console.log('Video loaded successfully')}
          >
            <source src={loadingVideo} type="video/quicktime" />
            <source src={loadingVideo} type="video/mp4" />
          </video>
        </div>
      )}

      {/* Avatar Iframe */}
      <div className={`w-full h-full avatar-iframe-container ${isFullscreen && isMobile ? 'transform scale-[4] origin-center' : ''}`}>
        <iframe
          key={refreshKey}
          src={`https://labs.heygen.com/guest/streaming-embed?share=eyJxdWFsaXR5IjoiaGlnaCIsImF2YXRhck5hbWUiOiI3ZTAxZTVkNGUwNjE0OWM5YmEzYzE3Mjhm%0D%0AYThmMDNkMCIsInByZXZpZXdJbWciOiJodHRwczovL2ZpbGVzMi5oZXlnZW4uYWkvYXZhdGFyL3Yz%0D%0ALzdlMDFlNWQ0ZTA2MTQ5YzliYTNjMTcyOGZhOGYwM2QwL2Z1bGwvMi4yL3ByZXZpZXdfdGFyZ2V0%0D%0ALndlYnAiLCJuZWVkUmVtb3ZlQmFja2dyb3VuZCI6ZmFsc2UsImtub3dsZWRnZUJhc2VJZCI6ImVk%0D%0AYjA0Y2I4ZTdiNDRiNmZiMGNkNzNhM2VkZDRiY2E0Iiwic2hhcmVfY29kZSI6IjhiZWM2YzBlLTJl%0D%0AYjEtNGVkMy04ODBiLTdiN2I3Yzg3NDFmZSIsInVzZXJuYW1lIjoiZTdiY2VjYWFjMGUwNDU2Y2I2%0D%0AYmQwY2FhYjcwZmY0NjEifQ%3D%3D&inIFrame=1&t=${refreshKey}`}
          className="w-full h-full border-0"
          allow="microphone; camera"
          title="HeyGen Interactive Avatar"
          data-testid="heygen-avatar-iframe"
        />
      </div>
    </div>
  );
}
