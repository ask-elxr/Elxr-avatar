import { useState, useRef, useCallback, useEffect } from 'react';
import { buildAuthenticatedWsUrl } from '@/lib/queryClient';

interface StreamingChatConfig {
  avatarId: string;
  userId: string;
  languageCode?: string;
  onPartialTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
  onLLMDelta?: (delta: string, accumulated: string) => void;
  onLLMComplete?: (fullText: string) => void;
  onAudioChunk?: (audioData: string) => void;
  onError?: (error: string) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onSpeakingStart?: () => void;
  onSpeakingEnd?: () => void;
}

interface StreamingChatState {
  isConnected: boolean;
  isListening: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  partialTranscript: string;
  fullTranscript: string;
}

export function useStreamingChat(config: StreamingChatConfig) {
  const [state, setState] = useState<StreamingChatState>({
    isConnected: false,
    isListening: false,
    isProcessing: false,
    isSpeaking: false,
    partialTranscript: '',
    fullTranscript: '',
  });

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const playbackContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const nextPlayTimeRef = useRef<number>(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const baseUrl = buildAuthenticatedWsUrl('/ws/streaming-chat');
    const wsUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}avatarId=${config.avatarId}&userId=${config.userId}&lang=${config.languageCode || 'en'}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('🔌 Streaming chat WebSocket connected');
      setState(s => ({ ...s, isConnected: true }));
      config.onConnected?.();
    };

    ws.onclose = () => {
      console.log('🔌 Streaming chat WebSocket disconnected');
      setState(s => ({ ...s, isConnected: false, isListening: false }));
      config.onDisconnected?.();
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      config.onError?.('Connection error');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };
  }, [config.avatarId, config.userId, config.languageCode]);

  const playAudioChunk = useCallback((base64Audio: string, isFinal: boolean) => {
    if (!playbackContextRef.current) {
      playbackContextRef.current = new AudioContext({ sampleRate: 24000 });
    }
    
    const ctx = playbackContextRef.current;
    
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 32768;
    }
    
    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);
    
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    
    const currentTime = ctx.currentTime;
    const startTime = Math.max(currentTime, nextPlayTimeRef.current);
    
    if (!isPlayingRef.current) {
      isPlayingRef.current = true;
      setState(s => ({ ...s, isSpeaking: true }));
      config.onSpeakingStart?.();
    }
    
    source.start(startTime);
    nextPlayTimeRef.current = startTime + buffer.duration;
    
    source.onended = () => {
      if (isFinal && ctx.currentTime >= nextPlayTimeRef.current - 0.1) {
        isPlayingRef.current = false;
        setState(s => ({ ...s, isSpeaking: false }));
        config.onSpeakingEnd?.();
      }
    };
  }, [config]);

  const handleMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'connected':
        console.log('📡 Session connected:', message.sessionId);
        break;

      case 'tts_ready':
        console.log('🔊 TTS stream ready');
        break;

      case 'stt_ready':
        console.log('🎤 STT stream ready');
        setState(s => ({ ...s, isListening: true }));
        break;

      case 'stt_partial':
        setState(s => ({ ...s, partialTranscript: message.text }));
        config.onPartialTranscript?.(message.text);
        break;

      case 'stt_final':
        setState(s => ({ 
          ...s, 
          fullTranscript: message.accumulated,
          partialTranscript: '',
        }));
        config.onFinalTranscript?.(message.accumulated);
        break;

      case 'llm_delta':
        setState(s => ({ ...s, isProcessing: true }));
        config.onLLMDelta?.(message.delta, message.accumulated);
        break;

      case 'llm_complete':
        config.onLLMComplete?.(message.fullText);
        break;

      case 'audio_chunk':
        playAudioChunk(message.audio, message.isFinal);
        config.onAudioChunk?.(message.audio);
        break;

      case 'response_complete':
        setState(s => ({ ...s, isProcessing: false }));
        break;

      case 'error':
        console.error('Server error:', message.message);
        config.onError?.(message.message);
        break;

      case 'busy':
        console.warn('Server busy:', message.message);
        break;
    }
  }, [config, playAudioChunk]);

  const startListening = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      streamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      wsRef.current.send(JSON.stringify({ type: 'start_stt' }));

      processor.onaudioprocess = (event) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const inputData = event.inputBuffer.getChannelData(0);
          const pcm16 = float32ToPCM16(inputData);
          wsRef.current.send(pcm16.buffer);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setState(s => ({ ...s, isListening: true }));
      console.log('🎤 Started streaming audio');

    } catch (error) {
      console.error('Failed to start listening:', error);
      config.onError?.('Failed to access microphone');
    }
  }, [config]);

  const stopListening = useCallback(() => {
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

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop_stt' }));
    }

    setState(s => ({ ...s, isListening: false }));
    console.log('🔇 Stopped listening');
  }, []);

  const sendText = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      return;
    }

    setState(s => ({ ...s, isProcessing: true, fullTranscript: '' }));
    wsRef.current.send(JSON.stringify({
      type: 'send_text',
      text,
    }));
  }, []);

  const disconnect = useCallback(() => {
    stopListening();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (playbackContextRef.current) {
      playbackContextRef.current.close();
      playbackContextRef.current = null;
    }
    isPlayingRef.current = false;
    nextPlayTimeRef.current = 0;
  }, [stopListening]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    startListening,
    stopListening,
    sendText,
  };
}

function float32ToPCM16(float32Array: Float32Array): Int16Array {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return pcm16;
}
