import { useState, useCallback, useRef, useEffect } from 'react';
import { buildAuthenticatedWsUrl } from '@/lib/queryClient';

export interface ConversationWsConfig {
  avatarId: string;
  userId: string | null;
  memoryEnabled: boolean;
  languageCode?: string;
  sampleRate?: number;
  onTranscriptPartial?: (text: string) => void;
  onTranscriptFinal?: (text: string) => void;
  onTurnStart?: (turnId: number) => void;
  onTurnEnd?: (turnId: number) => void;
  onError?: (error: string) => void;
  onSpeakingChange?: (speaking: boolean) => void;
  onAudioChunk?: (pcmBytes: Uint8Array, turnId: number) => void;
  onAudioStop?: (turnId: number) => void;
  onNudge?: (text: string) => void;
  onSoftEnd?: (text: string) => void;
  playLocalAudio?: boolean;
}

interface ConversationWsState {
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  currentTurnId: number;
  partialTranscript: string;
}

const TTS_SAMPLE_RATE = 24000;

export function useConversationWs(config: ConversationWsConfig) {
  const [state, setState] = useState<ConversationWsState>({
    isConnected: false,
    isListening: false,
    isSpeaking: false,
    currentTurnId: 0,
    partialTranscript: '',
  });

  const wsRef = useRef<WebSocket | null>(null);
  const micContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const configRef = useRef(config);

  const playbackCtxRef = useRef<AudioContext | null>(null);
  const sourceNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const currentTurnIdRef = useRef(0);
  const stoppedRef = useRef(false);
  const nextPlayTimeRef = useRef(0);
  const speakingRef = useRef(false);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const ensurePlaybackCtx = useCallback(() => {
    if (!playbackCtxRef.current || playbackCtxRef.current.state === 'closed') {
      playbackCtxRef.current = new AudioContext({ sampleRate: TTS_SAMPLE_RATE });
    }
    if (playbackCtxRef.current.state === 'suspended') {
      playbackCtxRef.current.resume();
    }
    return playbackCtxRef.current;
  }, []);

  const hardStopAudio = useCallback(() => {
    stoppedRef.current = true;
    speakingRef.current = false;
    try {
      sourceNodesRef.current.forEach(n => { try { n.stop(); } catch {} });
    } finally {
      sourceNodesRef.current = [];
    }
    if (playbackCtxRef.current && playbackCtxRef.current.state !== 'closed') {
      playbackCtxRef.current.close().catch(() => {});
    }
    playbackCtxRef.current = null;
    nextPlayTimeRef.current = 0;
    setState(s => ({ ...s, isSpeaking: false }));
    configRef.current.onSpeakingChange?.(false);
  }, []);

  const playPcmChunk = useCallback((pcmBytes: Uint8Array, turnId: number) => {
    if (turnId !== currentTurnIdRef.current) return;
    if (stoppedRef.current) return;

    configRef.current.onAudioChunk?.(pcmBytes, turnId);

    if (configRef.current.playLocalAudio !== undefined && !configRef.current.playLocalAudio) return;

    const ctx = ensurePlaybackCtx();
    const sampleCount = pcmBytes.length / 2;
    if (sampleCount === 0) return;

    const float32 = new Float32Array(sampleCount);
    const dv = new DataView(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength);
    for (let i = 0; i < sampleCount; i++) {
      float32[i] = dv.getInt16(i * 2, true) / 32768;
    }

    const audioBuffer = ctx.createBuffer(1, sampleCount, TTS_SAMPLE_RATE);
    audioBuffer.copyToChannel(float32, 0);

    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(ctx.destination);

    const now = ctx.currentTime;
    const startTime = Math.max(now, nextPlayTimeRef.current);
    src.start(startTime);
    nextPlayTimeRef.current = startTime + audioBuffer.duration;

    sourceNodesRef.current.push(src);
    src.onended = () => {
      sourceNodesRef.current = sourceNodesRef.current.filter(n => n !== src);
      if (sourceNodesRef.current.length === 0 && !stoppedRef.current) {
        setState(s => ({ ...s, isSpeaking: false }));
        configRef.current.onSpeakingChange?.(false);
      }
    };
  }, [ensurePlaybackCtx]);

  const handleBinaryMessage = useCallback((data: ArrayBuffer) => {
    const buf = new Uint8Array(data);
    if (buf.length < 8) return;

    const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
    if (magic !== 'TTS0') return;

    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const turnId = dv.getUint32(4, true);

    if (turnId !== currentTurnIdRef.current) return;
    if (stoppedRef.current) return;

    const audioBytes = buf.slice(8);
    playPcmChunk(audioBytes, turnId);
  }, [playPcmChunk]);

  const handleJsonMessage = useCallback((msg: any) => {
    switch (msg.type) {
      case 'SESSION_STARTED':
        console.log('🎙️ Conversation WS session started:', msg.sessionId);
        break;

      case 'STT_READY':
        console.log('🎙️ Conversation WS STT ready');
        setState(s => ({ ...s, isListening: true }));
        break;

      case 'STT_PARTIAL':
        setState(s => ({ ...s, partialTranscript: msg.text }));
        configRef.current.onTranscriptPartial?.(msg.text);
        break;

      case 'STT_FINAL':
        setState(s => ({ ...s, partialTranscript: '' }));
        configRef.current.onTranscriptFinal?.(msg.text);
        break;

      case 'TURN_START':
        currentTurnIdRef.current = msg.turnId;
        stoppedRef.current = false;
        speakingRef.current = true;
        nextPlayTimeRef.current = 0;
        setState(s => ({ ...s, currentTurnId: msg.turnId, isSpeaking: true }));
        configRef.current.onSpeakingChange?.(true);
        configRef.current.onTurnStart?.(msg.turnId);
        break;

      case 'TURN_END':
        speakingRef.current = false;
        configRef.current.onTurnEnd?.(msg.turnId);
        break;

      case 'STOP_AUDIO':
        hardStopAudio();
        speakingRef.current = false;
        configRef.current.onAudioStop?.(msg.turnId);
        currentTurnIdRef.current = msg.turnId;
        stoppedRef.current = false;
        setState(s => ({ ...s, currentTurnId: msg.turnId, isSpeaking: false }));
        break;

      case 'SESSION_ENDED':
        console.log('🎙️ Conversation WS session ended');
        break;

      case 'ERROR':
        console.error('🎙️ Conversation WS error:', msg.message);
        configRef.current.onError?.(msg.message);
        break;

      case 'MUM_NUDGE':
        console.log('[mum nudge]', msg.text);
        configRef.current.onNudge?.(msg.text);
        break;

      case 'MUM_SOFT_END':
        console.log('[mum soft end]', msg.text);
        configRef.current.onSoftEnd?.(msg.text);
        break;

      case 'PONG':
        break;
    }
  }, [hardStopAudio]);

  const connect = useCallback((): Promise<void> => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const wsUrl = buildAuthenticatedWsUrl('/ws/conversation');

      console.log('🎙️ Connecting to conversation WS...');
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        console.log('🎙️ Conversation WS connected');
        setState(s => ({ ...s, isConnected: true }));

        ws.send(JSON.stringify({
          type: 'START_SESSION',
          avatarId: configRef.current.avatarId,
          userId: configRef.current.userId,
          memoryEnabled: configRef.current.memoryEnabled,
          sampleRate: configRef.current.sampleRate || 16000,
          languageCode: configRef.current.languageCode,
          audioOnly: configRef.current.playLocalAudio ?? false,
        }));
        resolve();
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          handleBinaryMessage(event.data);
        } else if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data);
            handleJsonMessage(msg);
          } catch (e) {
            console.error('Failed to parse WS message:', e);
          }
        }
      };

      ws.onerror = () => {
        configRef.current.onError?.('Connection failed');
        reject(new Error('Connection failed'));
      };

      ws.onclose = () => {
        console.log('🎙️ Conversation WS closed');
        setState(s => ({
          ...s,
          isConnected: false,
          isListening: false,
          isSpeaking: false,
        }));
      };
    });
  }, [handleBinaryMessage, handleJsonMessage]);

  const startMic = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      configRef.current.onError?.('Not connected');
      return;
    }

    try {
      const sampleRate = configRef.current.sampleRate || 16000;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      micStreamRef.current = stream;
      const audioContext = new AudioContext({ sampleRate });
      micContextRef.current = audioContext;

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

      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);

      console.log('🎙️ Mic streaming to conversation WS');
    } catch (error: any) {
      console.error('Mic error:', error);
      if (error.name === 'NotAllowedError') {
        configRef.current.onError?.('Microphone permission denied');
      } else {
        configRef.current.onError?.('Failed to access microphone');
      }
    }
  }, []);

  const stopMic = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (micContextRef.current) {
      micContextRef.current.close().catch(() => {});
      micContextRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
  }, []);

  const sendText = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'SEND_TEXT', text }));
    }
  }, []);

  const disconnect = useCallback(() => {
    stopMic();
    hardStopAudio();

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'END_SESSION' }));
      wsRef.current.close();
    }
    wsRef.current = null;

    setState({
      isConnected: false,
      isListening: false,
      isSpeaking: false,
      currentTurnId: 0,
      partialTranscript: '',
    });
  }, [stopMic, hardStopAudio]);

  useEffect(() => {
    return () => {
      stopMic();
      hardStopAudio();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [stopMic, hardStopAudio]);

  return {
    ...state,
    connect,
    disconnect,
    startMic,
    stopMic,
    sendText,
    hardStopAudio,
  };
}
