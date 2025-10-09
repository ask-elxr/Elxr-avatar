import { useState, useCallback, useRef, useEffect } from "react";
import { heygenService } from "@/services/heygen-service";

interface Message {
  type: 'user' | 'avatar';
  text: string;
  timestamp: string;
}

export function useAvatarSession(videoRef: React.RefObject<HTMLVideoElement>) {
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const avatarRef = useRef<any>(null);

  const addMessage = useCallback((type: 'user' | 'avatar', text: string) => {
    const timestamp = new Date().toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: false
    });
    
    setMessages(prev => [...prev, { type, text, timestamp }]);
  }, []);

  const startSession = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Import HeyGen SDK events dynamically
      const { StreamingEvents, TaskType } = await import('@heygen/streaming-avatar');
      
      const { avatar, sessionInfo } = await heygenService.initializeAvatar();
      avatarRef.current = avatar;

      // Set up event listeners
      avatar.on(StreamingEvents.AVATAR_START_TALKING, () => {
        setIsSpeaking(true);
      });

      avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
        setIsSpeaking(false);
      });

      avatar.on(StreamingEvents.STREAM_READY, (event: any) => {
        if (videoRef.current) {
          videoRef.current.srcObject = event.detail;
          videoRef.current.play().catch(console.error);
        }
      });

      avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        setIsConnected(false);
        setSessionActive(false);
        setError('Stream disconnected unexpectedly');
      });

      setIsLoading(false);
      setIsConnected(true);
      setSessionActive(true);

      // Send initial greeting
      setTimeout(() => {
        avatar.speak({
          text: "Hello! I'm your AI assistant. How can I help you today?",
          task_type: TaskType.TALK
        });
        addMessage('avatar', "Hello! I'm your AI assistant. How can I help you today?");
      }, 1000);

    } catch (err) {
      setIsLoading(false);
      setError(err instanceof Error ? err.message : 'Failed to start session');
      console.error('Session start error:', err);
    }
  }, [videoRef, addMessage]);

  const endSession = useCallback(async () => {
    try {
      if (avatarRef.current) {
        await heygenService.stopAvatar();
        avatarRef.current = null;
      }
    } catch (err) {
      console.error('Error ending session:', err);
    } finally {
      setIsConnected(false);
      setSessionActive(false);
      setMessages([]);
      setIsSpeaking(false);
      setError(null);
    }
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!avatarRef.current || !sessionActive) return;

    try {
      // Import TaskType dynamically
      const { TaskType } = await import('@heygen/streaming-avatar');
      
      addMessage('user', text);
      
      // Get intelligent response from backend (Claude Sonnet 4 + Pinecone + Google)
      const response = await fetch('/api/avatar/response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationHistory: messages.slice(-10),
          useWebSearch: true
        })
      });

      if (!response.ok) {
        throw new Error('Backend API failed');
      }

      const data = await response.json();
      const intelligentResponse = data.knowledgeResponse || text;
      
      // Make avatar speak the intelligent response
      await avatarRef.current.speak({
        text: intelligentResponse,
        task_type: TaskType.TALK
      });
      
      addMessage('avatar', intelligentResponse);
    } catch (err) {
      console.error('Error sending message:', err);
      setError('Failed to send message');
      
      // Fallback to direct speech if backend fails
      await avatarRef.current.speak({
        text: text,
        task_type: await import('@heygen/streaming-avatar').then(m => m.TaskType.TALK)
      });
    }
  }, [sessionActive, addMessage, messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (avatarRef.current) {
        endSession();
      }
    };
  }, [endSession]);

  return {
    isLoading,
    isConnected,
    isSpeaking,
    sessionActive,
    messages,
    error,
    startSession,
    endSession,
    sendMessage
  };
}
