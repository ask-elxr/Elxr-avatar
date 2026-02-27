import { useState, useCallback, useRef, useEffect } from 'react';
import { Room, RoomEvent, createLocalAudioTrack } from 'livekit-client';
import { buildAuthenticatedWsUrl } from '@/lib/queryClient';
import type { LocalAudioTrack } from 'livekit-client';
import type { SessionDriver } from './sessionDrivers';

interface WebRTCStreamingConfig {
  avatarId: string;
  userId: string;
  languageCode?: string;
  sessionDriver?: SessionDriver | null; // Optional: connect to LiveAvatarDriver for lip-sync
  onPartialTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
  onLLMDelta?: (delta: string, accumulated: string) => void;
  onLLMComplete?: (fullText: string) => void;
  onAudioChunk?: (audio: string) => void;
  onSpeakingStart?: () => void;
  onSpeakingEnd?: () => void;
  onError?: (error: string) => void;
}

interface WebRTCStreamingState {
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
  partialTranscript: string;
  fullTranscript: string;
}

export function useWebRTCStreaming(config: WebRTCStreamingConfig) {
  const [state, setState] = useState<WebRTCStreamingState>({
    isConnected: false,
    isListening: false,
    isSpeaking: false,
    isProcessing: false,
    partialTranscript: '',
    fullTranscript: '',
  });

  const roomRef = useRef<Room | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const localAudioTrackRef = useRef<LocalAudioTrack | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);

  // Ref to track if we've started streaming to the avatar driver
  const avatarStreamingStartedRef = useRef<boolean>(false);
  
  const playAudioChunk = useCallback((base64Audio: string, isFinal: boolean) => {
    // If session driver is available, use it for lip-sync (SDK handles audio playback)
    if (config.sessionDriver?.addAudioChunk) {
      // Start streaming audio if not already started
      if (!avatarStreamingStartedRef.current && config.sessionDriver.startStreamingAudio) {
        config.sessionDriver.startStreamingAudio();
        avatarStreamingStartedRef.current = true;
        setState(s => ({ ...s, isSpeaking: true }));
        config.onSpeakingStart?.();
      }
      
      // Send chunk to driver for lip-sync
      config.sessionDriver.addAudioChunk(base64Audio);
      
      // End streaming if this is the final chunk
      if (isFinal && config.sessionDriver.endStreamingAudio) {
        config.sessionDriver.endStreamingAudio();
        avatarStreamingStartedRef.current = false;
        setState(s => ({ ...s, isSpeaking: false }));
        config.onSpeakingEnd?.();
      }
      
      // Note: onAudioChunk callback is NOT called here to avoid duplicate events
      // The audio is routed to SDK for lip-sync, not played via Web Audio
      return;
    }
    
    // Fallback: play audio directly via Web Audio API (no avatar lip-sync)
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

  const handleWSMessage = useCallback((event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'connected':
          console.log('📡 WebRTC session connected:', message.sessionId);
          if (message.livekit) {
            connectToLiveKit(message.livekit);
          }
          break;
          
        case 'stt_ready':
          console.log('🎤 STT ready');
          setState(s => ({ ...s, isListening: true }));
          break;
          
        case 'tts_ready':
          console.log('🔊 TTS ready');
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
          
        case 'interrupted':
          setState(s => ({ ...s, isProcessing: false, isSpeaking: false }));
          break;
          
        case 'error':
          console.error('Server error:', message.message);
          config.onError?.(message.message);
          break;
      }
    } catch (error) {
      console.error('Error parsing WS message:', error);
    }
  }, [config, playAudioChunk]);

  const connectToLiveKit = useCallback(async (livekitConfig: {
    url: string;
    room: string;
    token: string;
  }) => {
    try {
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      
      roomRef.current = room;
      
      room.on(RoomEvent.Disconnected, () => {
        console.log('📡 Disconnected from LiveKit room');
        setState(s => ({ ...s, isConnected: false }));
      });
      
      await room.connect(livekitConfig.url, livekitConfig.token);
      console.log('📡 Connected to LiveKit room:', livekitConfig.room);
      
      setState(s => ({ ...s, isConnected: true }));
      
    } catch (error) {
      console.error('Failed to connect to LiveKit:', error);
      config.onError?.('Failed to connect to WebRTC room');
    }
  }, [config]);

  const connect = useCallback(() => {
    const wsUrl = buildAuthenticatedWsUrl('/ws/webrtc-streaming');
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    
    ws.onopen = () => {
      console.log('📡 WebSocket connected');
      ws.send(JSON.stringify({
        type: 'init',
        avatarId: config.avatarId,
        userId: config.userId,
        languageCode: config.languageCode || 'en',
      }));
    };
    
    ws.onmessage = handleWSMessage;
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      config.onError?.('WebSocket connection failed');
    };
    
    ws.onclose = () => {
      console.log('📡 WebSocket closed');
      setState(s => ({ ...s, isConnected: false, isListening: false }));
    };
  }, [config, handleWSMessage]);

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
      
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        if (wsRef.current?.readyState === WebSocket.OPEN && state.isListening) {
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
      
      if (roomRef.current) {
        const localTrack = await createLocalAudioTrack({
          echoCancellation: true,
          noiseSuppression: true,
        });
        localAudioTrackRef.current = localTrack;
        await roomRef.current.localParticipant.publishTrack(localTrack);
        console.log('🎤 Published local audio track');
      }
      
      setState(s => ({ ...s, isListening: true }));
      
    } catch (error) {
      console.error('Failed to start listening:', error);
      config.onError?.('Failed to access microphone');
    }
  }, [config, state.isListening]);

  const stopListening = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop_listening' }));
    }
    
    if (localAudioTrackRef.current) {
      localAudioTrackRef.current.stop();
      localAudioTrackRef.current = null;
    }
    
    setState(s => ({ ...s, isListening: false }));
  }, []);

  const sendText = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'send_text', text }));
    }
  }, []);

  const interrupt = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'interrupt' }));
    }
    
    if (playbackContextRef.current) {
      playbackContextRef.current.close();
      playbackContextRef.current = null;
    }
    
    isPlayingRef.current = false;
    nextPlayTimeRef.current = 0;
    setState(s => ({ ...s, isSpeaking: false, isProcessing: false }));
  }, []);

  const disconnect = useCallback(() => {
    stopListening();
    
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    
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
    
    setState({
      isConnected: false,
      isListening: false,
      isSpeaking: false,
      isProcessing: false,
      partialTranscript: '',
      fullTranscript: '',
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
    sendText,
    interrupt,
  };
}
