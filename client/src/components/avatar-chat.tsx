import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Maximize, Minimize, X } from "lucide-react";

export function AvatarChat() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Check if device is mobile
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

  const endCall = () => {
    // Reset the iframe to end the call
    setRefreshKey(prev => prev + 1);
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

      {/* End Call Button - Top Right */}
      <Button
        onClick={endCall}
        className="absolute top-4 right-4 z-50 bg-red-600/80 hover:bg-red-700 text-white rounded-full p-3 backdrop-blur-sm"
        data-testid="button-end-call"
      >
        <X className="w-5 h-5" />
      </Button>

      {/* Avatar Iframe */}
      <div className={`w-full h-full ${isFullscreen && isMobile ? 'transform scale-[4] origin-center' : ''}`}>
        <iframe
          key={refreshKey}
          ref={iframeRef}
          src="https://labs.heygen.com/guest/streaming-embed?share=eyJxdWFsaXR5IjoiaGlnaCIsImF2YXRhck5hbWUiOiI3ZTAxZTVkNGUwNjE0OWM5YmEzYzE3Mjhm%0D%0AYThmMDNkMCIsInByZXZpZXdJbWciOiJodHRwczovL2ZpbGVzMi5oZXlnZW4uYWkvYXZhdGFyL3Yz%0D%0ALzdlMDFlNWQ0ZTA2MTQ5YzliYTNjMTcyOGZhOGYwM2QwL2Z1bGwvMi4yL3ByZXZpZXdfdGFyZ2V0%0D%0ALndlYnAiLCJuZWVkUmVtb3ZlQmFja2dyb3VuZCI6ZmFsc2UsImtub3dsZWRnZUJhc2VJZCI6ImVk%0D%0AYjA0Y2I4ZTdiNDRiNmZiMGNkNzNhM2VkZDRiY2E0IiwidXNlcm5hbWUiOiJlN2JjZWNhYWMwZTA0%0D%0ANTZjYjZiZDBjYWFiNzBmZjQ2MSJ9&inIFrame=1"
          className="w-full h-full border-0"
          allow="microphone; camera"
          title="HeyGen Interactive Avatar"
          data-testid="heygen-avatar-iframe"
        />
      </div>
    </div>
  );
}
