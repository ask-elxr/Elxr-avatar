import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Maximize, Minimize, X, MessageSquare, Mic, MicOff, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useKnowledgeBase } from "@/hooks/useKnowledgeBase";

export function AvatarChat() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showKnowledgeTest, setShowKnowledgeTest] = useState(false);
  const [micPermission, setMicPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const { user, isAuthenticated } = useAuth();
  const { getAvatarResponse, isLoading, error } = useKnowledgeBase();
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

  const forceRefreshAvatar = () => {
    // Force refresh with cache busting
    const timestamp = new Date().getTime();
    setRefreshKey(timestamp);
    
    // Also try to clear any cached iframe content
    if (iframeRef.current) {
      iframeRef.current.src = 'about:blank';
      setTimeout(() => {
        setRefreshKey(timestamp + 1);
      }, 100);
    }
    
    alert('🔄 Avatar refreshed with cache clearing. Try talking now!');
  };

  const testKnowledgeBase = async () => {
    try {
      // Test Mark Kohl personality with default system
      const response = await getAvatarResponse("What are the main topics you can help with?");
      alert(`Mark Kohl says: ${response}`);
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to query knowledge base'}`);
    }
  };

  const requestMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermission('granted');
      // Stop the stream immediately, we just needed permission
      stream.getTracks().forEach(track => track.stop());
      
      // Refresh iframe to reinitialize with permissions
      setRefreshKey(prev => prev + 1);
      
      alert('✅ Microphone permission granted! The avatar should now be able to hear you.');
    } catch (err) {
      setMicPermission('denied');
      alert('❌ Microphone access denied. Please:\n\n1. Click the 🔒 lock icon in your browser address bar\n2. Allow microphone access\n3. Refresh the page\n\nOr check your browser settings to allow microphone for this site.');
    }
  };

  const openDirectLink = () => {
    const heygenUrl = "https://labs.heygen.com/guest/streaming-embed?share=eyJxdWFsaXR5IjoiaGlnaCIsImF2YXRhck5hbWUiOiI3ZTAxZTVkNGUwNjE0OWM5YmEzYzE3Mjhm%0D%0AYThmMDNkMCIsInByZXZpZXdJbWciOiJodHRwczovL2ZpbGVzMi5oZXlnZW4uYWkvYXZhdGFyL3Yz%0D%0ALzdlMDFlNWQ0ZTA2MTQ5YzliYTNjMTcyOGZhOGYwM2QwL2Z1bGwvMi4yL3ByZXZpZXdfdGFyZ2V0%0D%0ALndlYnAiLCJuZWVkUmVtb3ZlQmFja2dyb3VuZCI6ZmFsc2UsImtub3dsZWRnZUJhc2VJZCI6ImVk%0D%0AYjA0Y2I4ZTdiNDRiNmZiMGNkNzNhM2VkZDRiY2E0IiwidXNlcm5hbWUiOiJlN2JjZWNhYWMwZTA0%0D%0ANTZjYjZiZDBjYWFiNzBmZjQ2MSJ9";
    window.open(heygenUrl, '_blank');
    alert('🔗 Opened HeyGen avatar in new tab. Test if audio works there!\n\nIf it works in the new tab, the issue is with iframe embedding.\nIf it doesn\'t work there either, the HeyGen link may be expired.');
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
        {/* Direct Link Test Button */}
        <Button
          onClick={openDirectLink}
          className="bg-purple-600/80 hover:bg-purple-700 text-white rounded-full p-3 backdrop-blur-sm"
          data-testid="button-direct-link"
          title="Open HeyGen avatar in new tab to test audio"
        >
          <ExternalLink className="w-5 h-5" />
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

        {/* Knowledge Base Test Button */}
        <Button
          onClick={testKnowledgeBase}
          disabled={isLoading}
          className="bg-blue-600/80 hover:bg-blue-700 text-white rounded-full p-3 backdrop-blur-sm"
          data-testid="button-test-knowledge"
        >
          <MessageSquare className="w-5 h-5" />
        </Button>
        
        {/* Force Refresh Button */}
        <Button
          onClick={forceRefreshAvatar}
          className="bg-gray-600/80 hover:bg-gray-700 text-white rounded-full p-3 backdrop-blur-sm"
          data-testid="button-force-refresh"
          title="Force refresh avatar with cache clearing"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Avatar Iframe */}
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
        {/* Overlay to hide HeyGen branding */}
        <div className="absolute bottom-3 right-3 w-44 h-10 bg-transparent pointer-events-none z-50" style={{background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)'}}></div>
      </div>
    </div>
  );
}
