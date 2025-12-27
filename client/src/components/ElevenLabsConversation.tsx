import { useConversation } from '@elevenlabs/react';
import { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';

interface ElevenLabsConversationProps {
  agentId: string;
  avatarId: string;
  userId: string;
  voiceId?: string;
  onMessage?: (message: { role: 'user' | 'assistant'; content: string }) => void;
  onStatusChange?: (status: string) => void;
  onSpeakingChange?: (isSpeaking: boolean) => void;
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
  autoStart?: boolean;
  className?: string;
}

export interface ElevenLabsConversationRef {
  endConversation: () => Promise<void>;
  isConnected: () => boolean;
}

export const ElevenLabsConversation = forwardRef<ElevenLabsConversationRef, ElevenLabsConversationProps>(
  function ElevenLabsConversationInner(props, ref) {
  const {
    agentId,
    avatarId,
    userId,
    voiceId,
    onMessage,
    onStatusChange,
    onSpeakingChange,
    onSessionStart,
    onSessionEnd,
    autoStart = false,
    className = '',
  } = props;
  const [hasStarted, setHasStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const startedRef = useRef(false);
  const autoStartUsedRef = useRef(false);

  const conversation = useConversation({
    onConnect: ({ conversationId }) => {
      console.log('🎙️ ElevenLabs conversation connected:', conversationId);
      setHasStarted(true);
      setError(null);
      onSessionStart?.();
    },
    onDisconnect: () => {
      console.log('🎙️ ElevenLabs conversation disconnected');
      setHasStarted(false);
      onSessionEnd?.();
    },
    onMessage: (message) => {
      console.log('🎙️ ElevenLabs message:', message);
      // Parse ElevenLabs message format to our app format
      // ElevenLabs messages can have different formats depending on type
      if (message && typeof message === 'object') {
        const msgAny = message as any;
        // Check for user transcript
        if (msgAny.type === 'user_transcript' || msgAny.source === 'user') {
          const content = msgAny.text || msgAny.message || msgAny.transcript || '';
          if (content) {
            onMessage?.({ role: 'user', content });
          }
        }
        // Check for agent response
        else if (msgAny.type === 'agent_response' || msgAny.source === 'agent' || msgAny.source === 'ai') {
          const content = msgAny.text || msgAny.message || msgAny.response || '';
          if (content) {
            onMessage?.({ role: 'assistant', content });
          }
        }
        // Fallback: try to extract any text content
        else if (msgAny.text || msgAny.message) {
          const content = msgAny.text || msgAny.message;
          const role = msgAny.role === 'user' ? 'user' : 'assistant';
          onMessage?.({ role, content });
        }
      }
    },
    onError: (message, context) => {
      console.error('🎙️ ElevenLabs error:', message, context);
      setError(typeof message === 'string' ? message : 'Connection error');
    },
  });

  useEffect(() => {
    onStatusChange?.(conversation.status);
  }, [conversation.status, onStatusChange]);

  useEffect(() => {
    onSpeakingChange?.(conversation.isSpeaking);
  }, [conversation.isSpeaking, onSpeakingChange]);

  const startConversation = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;

    try {
      setError(null);
      console.log('🎙️ Requesting microphone access...');
      
      await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('🎙️ Microphone access granted');

      console.log('🎙️ Starting ElevenLabs conversation with agent:', agentId, 'voiceId:', voiceId);
      
      const sessionConfig: any = {
        agentId: agentId,
        connectionType: 'webrtc',
      };
      
      if (voiceId) {
        sessionConfig.overrides = {
          tts: {
            voiceId: voiceId,
          },
        };
        console.log('🎙️ Using voice override:', voiceId);
      }
      
      await conversation.startSession(sessionConfig);
      
      console.log('🎙️ ElevenLabs conversation started successfully');
    } catch (err: any) {
      console.error('🎙️ Failed to start ElevenLabs conversation:', err);
      setError(err.message || 'Failed to start conversation');
      startedRef.current = false;
    }
  }, [agentId, voiceId, conversation]);

  const endConversation = useCallback(async () => {
    try {
      console.log('🎙️ Ending ElevenLabs conversation...');
      await conversation.endSession();
      startedRef.current = false;
    } catch (err: any) {
      console.error('🎙️ Error ending conversation:', err);
    }
  }, [conversation]);

  useImperativeHandle(ref, () => ({
    endConversation,
    isConnected: () => conversation.status === 'connected',
  }), [endConversation, conversation.status]);

  const toggleMute = useCallback(() => {
    const newVolume = isMuted ? 1 : 0;
    conversation.setVolume({ volume: newVolume });
    setIsMuted(!isMuted);
  }, [conversation, isMuted]);

  useEffect(() => {
    // Auto-start when enabled, but only once per component mount
    // Status can be: 'disconnected', 'connecting', 'connected', 'disconnecting'
    const isDisconnected = conversation.status === 'disconnected' || 
                           (conversation.status as string) === 'idle';
    if (autoStart && !autoStartUsedRef.current && !startedRef.current && isDisconnected) {
      autoStartUsedRef.current = true;
      const timer = setTimeout(() => {
        startConversation();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoStart, conversation.status, startConversation]);

  useEffect(() => {
    return () => {
      if (conversation.status === 'connected') {
        conversation.endSession().catch(console.error);
      }
    };
  }, []);

  const isConnected = conversation.status === 'connected';
  const isConnecting = conversation.status === 'connecting';

  return (
    <div className={`flex flex-col items-center gap-4 ${className}`} data-testid="elevenlabs-conversation">
      {error && (
        <div className="text-red-500 text-sm bg-red-500/10 px-4 py-2 rounded-lg" data-testid="text-error">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div 
          className={`w-3 h-3 rounded-full ${
            isConnected ? 'bg-green-500 animate-pulse' : 
            isConnecting ? 'bg-yellow-500 animate-pulse' : 
            'bg-gray-500'
          }`}
          data-testid="status-indicator"
        />
        <span className="text-sm text-white/70" data-testid="text-status">
          {isConnecting ? 'Connecting...' : 
           isConnected ? (conversation.isSpeaking ? 'Speaking...' : 'Listening...') : 
           'Disconnected'}
        </span>
      </div>

      <div className="flex gap-2">
        {!isConnected && !isConnecting && (
          <Button
            onClick={startConversation}
            className="bg-primary hover:bg-primary/90"
            data-testid="button-start-conversation"
          >
            <Mic className="w-4 h-4 mr-2" />
            Start Conversation
          </Button>
        )}

        {isConnected && (
          <>
            <Button
              onClick={toggleMute}
              variant="outline"
              size="icon"
              data-testid="button-toggle-mute"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </Button>

            <Button
              onClick={endConversation}
              variant="destructive"
              data-testid="button-end-conversation"
            >
              <MicOff className="w-4 h-4 mr-2" />
              End
            </Button>
          </>
        )}
      </div>

      {conversation.isSpeaking && (
        <div className="flex items-center gap-2 text-primary" data-testid="speaking-indicator">
          <div className="flex gap-1">
            <div className="w-1 h-4 bg-primary rounded animate-pulse" style={{ animationDelay: '0ms' }} />
            <div className="w-1 h-6 bg-primary rounded animate-pulse" style={{ animationDelay: '150ms' }} />
            <div className="w-1 h-4 bg-primary rounded animate-pulse" style={{ animationDelay: '300ms' }} />
            <div className="w-1 h-5 bg-primary rounded animate-pulse" style={{ animationDelay: '450ms' }} />
          </div>
          <span className="text-sm">Agent speaking...</span>
        </div>
      )}
    </div>
  );
});

export default ElevenLabsConversation;
