import { useState, useCallback, useRef, useEffect } from 'react';
import { buildAuthenticatedWsUrl } from '@/lib/queryClient';

interface ElevenLabsSTTConfig {
  languageCode?: string;
  onPartialTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
  onError?: (error: string) => void;
  onReady?: () => void;
}

interface ElevenLabsSTTState {
  isConnected: boolean;
  isListening: boolean;
  isReady: boolean;
  partialTranscript: string;
}

export function useElevenLabsSTT(config: ElevenLabsSTTConfig = {}) {
  const [state, setState] = useState<ElevenLabsSTTState>({
    isConnected: false,
    isListening: false,
    isReady: false,
    partialTranscript: '',
  });

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const configRef = useRef(config);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'started':
          console.log('🎤 ElevenLabs STT session started:', message.sessionId);
          break;
          
        case 'stt_ready':
          console.log('🎤 ElevenLabs STT ready');
          setState(s => ({ ...s, isReady: true }));
          configRef.current.onReady?.();
          break;
          
        case 'partial':
          setState(s => ({ ...s, partialTranscript: message.text }));
          configRef.current.onPartialTranscript?.(message.text);
          break;
          
        case 'final':
          setState(s => ({ ...s, partialTranscript: '' }));
          configRef.current.onFinalTranscript?.(message.text);
          break;
          
        case 'stopped':
          console.log('🎤 ElevenLabs STT session stopped');
          break;
          
        case 'error':
          console.error('🎤 ElevenLabs STT error:', message.message);
          configRef.current.onError?.(message.message);
          break;
      }
    } catch (error) {
      console.error('Error parsing STT message:', error);
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('🎤 ElevenLabs STT already connected');
      return;
    }

    const wsUrl = buildAuthenticatedWsUrl('/ws/elevenlabs-stt');
    
    console.log('🎤 Connecting to ElevenLabs STT...');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    
    ws.onopen = () => {
      console.log('🎤 ElevenLabs STT WebSocket connected');
      setState(s => ({ ...s, isConnected: true }));
      
      ws.send(JSON.stringify({
        type: 'start',
        languageCode: configRef.current.languageCode || 'en',
      }));
    };
    
    ws.onmessage = handleMessage;
    
    ws.onerror = (error) => {
      console.error('🎤 ElevenLabs STT WebSocket error:', error);
      configRef.current.onError?.('STT connection failed');
    };
    
    ws.onclose = () => {
      console.log('🎤 ElevenLabs STT WebSocket closed');
      setState(s => ({ ...s, isConnected: false, isReady: false, isListening: false }));
    };
  }, [handleMessage]);

  const startListening = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('🎤 Cannot start listening - WebSocket not connected');
      configRef.current.onError?.('Not connected to STT service');
      return;
    }

    if (!state.isReady) {
      console.error('🎤 Cannot start listening - STT not ready');
      configRef.current.onError?.('STT service not ready');
      return;
    }

    try {
      console.log('🎤 Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      
      streamRef.current = stream;
      
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      
      processor.onaudioprocess = (e) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcm16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            pcm16[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
          }
          wsRef.current.send(pcm16.buffer);
        }
      };
      
      source.connect(processor);
      processor.connect(audioContext.destination);
      
      setState(s => ({ ...s, isListening: true }));
      console.log('🎤 ElevenLabs STT listening started');
      
    } catch (error: any) {
      console.error('🎤 Failed to start listening:', error);
      if (error.name === 'NotAllowedError') {
        configRef.current.onError?.('Microphone permission denied');
      } else if (error.name === 'NotFoundError') {
        configRef.current.onError?.('No microphone found');
      } else {
        configRef.current.onError?.('Failed to access microphone');
      }
    }
  }, [state.isReady]);

  const stopListening = useCallback(() => {
    console.log('🎤 Stopping ElevenLabs STT listening...');
    
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    setState(s => ({ ...s, isListening: false, partialTranscript: '' }));
  }, []);

  const disconnect = useCallback(() => {
    console.log('🎤 Disconnecting ElevenLabs STT...');
    
    stopListening();
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
      wsRef.current.close();
    }
    wsRef.current = null;
    
    setState({
      isConnected: false,
      isListening: false,
      isReady: false,
      partialTranscript: '',
    });
  }, [stopListening]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    ...state,
    connect,
    disconnect,
    startListening,
    stopListening,
  };
}
