import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Mic, MicOff, Power, MessageSquare } from "lucide-react";
import StreamingAvatar, { 
  AvatarQuality, 
  StreamingEvents,
  TaskType,
  VoiceEmotion 
} from '@heygen/streaming-avatar';

export function AvatarChat() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isVoiceChatActive, setIsVoiceChatActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [status, setStatus] = useState("Click 'Start Avatar' to begin");
  const [apiToken, setApiToken] = useState<string | null>(null);
  
  const avatarRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const conversationHistoryRef = useRef<Array<{message: string, isUser: boolean}>>([]);

  // Fetch HeyGen API token from backend
  useEffect(() => {
    fetch('/api/heygen/token')
      .then(res => res.json())
      .then(data => {
        if (data.token) {
          setApiToken(data.token);
        }
      })
      .catch(err => {
        console.error('Failed to get HeyGen token:', err);
        setStatus('Error: Failed to get API token');
      });
  }, []);

  // Initialize and start avatar session
  const startSession = async () => {
    if (!apiToken) {
      setStatus('Error: No API token available');
      return;
    }

    setIsLoading(true);
    setStatus('Initializing avatar...');

    try {
      // Initialize streaming avatar
      const avatar = new StreamingAvatar({ token: apiToken });
      avatarRef.current = avatar;

      // Set up event listeners
      avatar.on(StreamingEvents.STREAM_READY, (event: any) => {
        setStatus('Avatar ready! Click "Start Voice Chat" to begin.');
        if (videoRef.current && event.stream) {
          videoRef.current.srcObject = event.stream;
          videoRef.current.play();
        }
      });

      avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        setStatus('Avatar disconnected');
        setIsSessionActive(false);
        setIsVoiceChatActive(false);
      });

      avatar.on(StreamingEvents.AVATAR_START_TALKING, () => {
        setIsSpeaking(true);
        setStatus('Avatar is speaking...');
      });

      avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
        setIsSpeaking(false);
        setStatus(isVoiceChatActive ? 'Listening for your voice...' : 'Avatar ready');
      });

      // User speech events
      avatar.on(StreamingEvents.USER_START, () => {
        setStatus('You are speaking...');
      });

      avatar.on(StreamingEvents.USER_STOP, async (event: any) => {
        setStatus('Processing your question...');
        console.log('User said:', event);
        
        // Get user's transcribed text
        const userMessage = event.message || event.text || '';
        
        if (userMessage.trim()) {
          // Add to conversation history
          conversationHistoryRef.current.push({
            message: userMessage,
            isUser: true
          });

          try {
            // Call our backend API with Pinecone + Google Search + Claude
            const response = await fetch('/api/avatar/response', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: userMessage,
                conversationHistory: conversationHistoryRef.current,
                useWebSearch: true
              })
            });

            const data = await response.json();
            
            if (data.success && data.knowledgeResponse) {
              const aiResponse = data.knowledgeResponse;
              
              // Add to conversation history
              conversationHistoryRef.current.push({
                message: aiResponse,
                isUser: false
              });

              // Make avatar speak our backend response using REPEAT mode
              await avatar.speak({
                text: aiResponse,
                task_type: TaskType.REPEAT
              });

              setStatus('Avatar responded - listening...');
            }
          } catch (error) {
            console.error('Error getting backend response:', error);
            setStatus('Error getting response - try again');
          }
        }
      });

      // Create and start avatar session
      const sessionInfo = await avatar.createStartAvatar({
        avatarName: '7e01e5d4e06149c9ba3c1728fa8f03d0', // Your avatar ID
        quality: AvatarQuality.High,
        voice: {
          rate: 1.0,
          emotion: VoiceEmotion.FRIENDLY
        }
      });

      console.log('Session started:', sessionInfo.session_id);
      setIsSessionActive(true);
      setIsLoading(false);
      
    } catch (error) {
      console.error('Error starting avatar:', error);
      setStatus('Error: ' + (error instanceof Error ? error.message : 'Failed to start avatar'));
      setIsLoading(false);
    }
  };

  // Start voice chat
  const startVoiceChat = async () => {
    if (!avatarRef.current) return;

    try {
      setStatus('Starting voice chat...');
      await avatarRef.current.startVoiceChat({
        useSilencePrompt: true
      });
      setIsVoiceChatActive(true);
      setStatus('Listening for your voice... Speak now!');
    } catch (error) {
      console.error('Error starting voice chat:', error);
      setStatus('Error: ' + (error instanceof Error ? error.message : 'Failed to start voice chat'));
    }
  };

  // Stop voice chat
  const stopVoiceChat = async () => {
    if (!avatarRef.current) return;

    try {
      await avatarRef.current.closeVoiceChat();
      setIsVoiceChatActive(false);
      setStatus('Voice chat stopped');
    } catch (error) {
      console.error('Error stopping voice chat:', error);
    }
  };

  // Stop session
  const stopSession = async () => {
    if (!avatarRef.current) return;

    try {
      setStatus('Stopping avatar...');
      await avatarRef.current.stopAvatar();
      
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      
      setIsSessionActive(false);
      setIsVoiceChatActive(false);
      conversationHistoryRef.current = [];
      setStatus('Avatar stopped. Click "Start Avatar" to begin again.');
    } catch (error) {
      console.error('Error stopping avatar:', error);
      setStatus('Error stopping avatar');
    }
  };

  // Test backend API directly
  const testBackendAPI = async () => {
    try {
      setStatus('Testing backend API...');
      const response = await fetch('/api/avatar/response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Who is the current US president in 2025?',
          useWebSearch: true
        })
      });

      const data = await response.json();
      if (data.success) {
        alert(`✅ Backend API Works!\n\nResponse: ${data.knowledgeResponse.substring(0, 200)}...`);
        setStatus('Backend API test successful');
      }
    } catch (error) {
      alert('❌ Backend API Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
      setStatus('Backend API test failed');
    }
  };

  return (
    <div className="w-full h-screen relative overflow-hidden bg-gradient-to-br from-gray-900 to-gray-800">
      {/* Control Panel */}
      <div className="absolute top-4 left-4 right-4 z-50 flex justify-between items-start">
        {/* Status Display */}
        <div className="bg-black/60 backdrop-blur-sm text-white px-4 py-2 rounded-lg max-w-md">
          <div className="flex items-center gap-2">
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSpeaking && <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />}
            <span className="text-sm">{status}</span>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex gap-2">
          {/* Test Backend Button */}
          <Button
            onClick={testBackendAPI}
            className="bg-blue-600/80 hover:bg-blue-700 text-white rounded-full p-3"
            data-testid="button-test-backend"
            title="Test backend API (Pinecone + Google + Claude)"
          >
            <MessageSquare className="w-5 h-5" />
          </Button>

          {/* Start/Stop Session Button */}
          {!isSessionActive ? (
            <Button
              onClick={startSession}
              disabled={isLoading || !apiToken}
              className="bg-green-600/80 hover:bg-green-700 text-white rounded-full p-3"
              data-testid="button-start-session"
              title="Start Avatar Session"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Power className="w-5 h-5" />}
            </Button>
          ) : (
            <Button
              onClick={stopSession}
              className="bg-red-600/80 hover:bg-red-700 text-white rounded-full p-3"
              data-testid="button-stop-session"
              title="Stop Avatar Session"
            >
              <Power className="w-5 h-5" />
            </Button>
          )}

          {/* Voice Chat Toggle */}
          {isSessionActive && (
            <Button
              onClick={isVoiceChatActive ? stopVoiceChat : startVoiceChat}
              className={`${
                isVoiceChatActive 
                  ? 'bg-orange-600/80 hover:bg-orange-700' 
                  : 'bg-purple-600/80 hover:bg-purple-700'
              } text-white rounded-full p-3`}
              data-testid="button-voice-chat"
              title={isVoiceChatActive ? 'Stop Voice Chat' : 'Start Voice Chat'}
            >
              {isVoiceChatActive ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </Button>
          )}
        </div>
      </div>

      {/* Video Container */}
      <div className="w-full h-full flex items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
          data-testid="avatar-video"
        />
      </div>

      {/* Instructions Overlay (shown when no session) */}
      {!isSessionActive && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="text-center text-white max-w-lg px-4">
            <h2 className="text-3xl font-bold mb-4">AI Avatar Chat</h2>
            <p className="text-lg mb-6">
              Powered by Claude Sonnet 4, dual Pinecone knowledge bases, and real-time Google web search
            </p>
            <div className="space-y-3 text-left bg-white/10 p-6 rounded-lg">
              <p>✅ <strong>Step 1:</strong> Click the green power button to start</p>
              <p>✅ <strong>Step 2:</strong> Click the microphone button to enable voice chat</p>
              <p>✅ <strong>Step 3:</strong> Speak your question</p>
              <p>✅ <strong>Step 4:</strong> Avatar responds with current 2024-2025 information!</p>
            </div>
            <p className="text-sm mt-4 text-gray-300">
              💡 Click the blue chat button to test the backend API directly
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
