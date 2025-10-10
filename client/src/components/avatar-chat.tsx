import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Maximize, Minimize, X } from "lucide-react";
import loadingVideo from "@assets/intro logo_1760052672430.mp4";

export function AvatarChat() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showIntro, setShowIntro] = useState(true);
  const [isChatStarted, setIsChatStarted] = useState(false);

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
    // Auto-hide intro video after chat starts
    if (isChatStarted && showIntro) {
      const timer = setTimeout(() => {
        setShowIntro(false);
      }, 6000); // Show for 6 seconds to cover connecting phase
      
      return () => clearTimeout(timer);
    }
  }, [isChatStarted, showIntro]);

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const startChat = () => {
    setIsChatStarted(true);
    // Trigger HeyGen's chat by sending a click event to the iframe
    const iframe = document.querySelector('iframe[data-testid="heygen-avatar-iframe"]') as HTMLIFrameElement;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'start-chat' }, '*');
    }
  };

  const endChat = () => {
    // Reset everything
    setRefreshKey(prev => prev + 1);
    setShowIntro(true);
    setIsChatStarted(false);
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

      {/* End Chat Button - Top Right (Show only when chat is active) */}
      {isChatStarted && !showIntro && (
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
      )}

      {/* Intro Video Overlay with Chat Now Button */}
      {showIntro && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="max-w-[80%] max-h-[60%] object-contain mb-8"
            data-testid="intro-video"
          >
            <source src={loadingVideo} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
          
          {/* Chat Now Button - Only show if chat hasn't started */}
          {!isChatStarted && (
            <Button
              onClick={startChat}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 text-lg font-semibold rounded-lg shadow-xl transition-all duration-200 hover:scale-105"
              data-testid="button-chat-now"
            >
              Chat now
            </Button>
          )}
        </div>
      )}

      {/* Avatar Iframe Container */}
      <div className={`w-full h-full overflow-hidden relative ${isFullscreen && isMobile ? 'transform scale-[4] origin-center' : ''}`}>
        <iframe
          key={refreshKey}
          src={`https://labs.heygen.com/guest/streaming-embed?share=eyJxdWFsaXR5IjoiaGlnaCIsImF2YXRhck5hbWUiOiI3ZTAxZTVkNGUwNjE0OWM5YmEzYzE3Mjhm%0D%0AYThmMDNkMCIsInByZXZpZXdJbWciOiJodHRwczovL2ZpbGVzMi5oZXlnZW4uYWkvYXZhdGFyL3Yz%0D%0ALzdlMDFlNWQ0ZTA2MTQ5YzliYTNjMTcyOGZhOGYwM2QwL2Z1bGwvMi4yL3ByZXZpZXdfdGFyZ2V0%0D%0ALndlYnAiLCJuZWVkUmVtb3ZlQmFja2dyb3VuZCI6ZmFsc2UsImtub3dsZWRnZUJhc2VJZCI6ImVk%0D%0AYjA0Y2I4ZTdiNDRiNmZiMGNkNzNhM2VkZDRiY2E0Iiwic2hhcmVfY29kZSI6IjhiZWM2YzBlLTJl%0D%0AYjEtNGVkMy04ODBiLTdiN2I3Yzg3NDFmZSIsInVzZXJuYW1lIjoiZTdiY2VjYWFjMGUwNDU2Y2I2%0D%0AYmQwY2FhYjcwZmY0NjEifQ%3D%3D&inIFrame=1&t=${refreshKey}`}
          className="w-full h-full border-0"
          allow="microphone; camera"
          title="HeyGen Interactive Avatar"
          data-testid="heygen-avatar-iframe"
        />
        
        {/* Solid overlay to completely hide HeyGen's bottom controls */}
        <div 
          className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none z-[100]"
          style={{
            background: 'linear-gradient(to top, #e5e1d8 60%, transparent 100%)'
          }}
        />
      </div>
    </div>
  );
}
