import WebSocket, { WebSocketServer } from 'ws';
import { logger } from './logger.js';
import { liveKitService } from './services/livekit.js';
import { getAvatarById } from './services/avatars.js';
import { pineconeNamespaceService } from './pineconeNamespaceService.js';
import { mem0Service } from './mem0Service.js';
import Anthropic from '@anthropic-ai/sdk';

const log = logger.child({ service: 'webrtc-streaming' });

const ELEVENLABS_STT_URL = 'wss://api.elevenlabs.io/v1/speech-to-text/stream';
const ELEVENLABS_TTS_URL = 'wss://api.elevenlabs.io/v1/text-to-speech';
const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime';

interface WebRTCSession {
  sessionId: string;
  clientWs: WebSocket;
  avatarId: string;
  userId: string;
  voiceId: string;
  languageCode: string;
  roomName: string;
  sttWs: WebSocket | null;
  ttsWs: WebSocket | null;
  accumulatedTranscript: string;
  isProcessing: boolean;
  sttReady: boolean;
  ttsReady: boolean;
  systemPrompt: string;
  pineconeNamespaces: string[];
}

const activeSessions = new Map<string, WebRTCSession>();

export function initWebRTCStreamingServer(wss: WebSocketServer): void {
  wss.on('connection', async (ws: WebSocket, request: any) => {
    const sessionId = `webrtc_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    log.info({ sessionId }, 'New WebRTC streaming connection');
    
    ws.on('message', async (data: Buffer | string) => {
      try {
        if (typeof data === 'string' || (data instanceof Buffer && data[0] === 0x7b)) {
          const message = JSON.parse(data.toString());
          await handleControlMessage(ws, sessionId, message);
        } else {
          await handleAudioData(sessionId, data as Buffer);
        }
      } catch (error) {
        log.error({ sessionId, error }, 'Error processing message');
      }
    });
    
    ws.on('close', () => {
      cleanupSession(sessionId);
      log.info({ sessionId }, 'WebRTC streaming connection closed');
    });
    
    ws.on('error', (error) => {
      log.error({ sessionId, error }, 'WebRTC streaming WebSocket error');
      cleanupSession(sessionId);
    });
  });
  
  log.info('WebRTC streaming WebSocket server initialized');
}

async function handleControlMessage(
  clientWs: WebSocket,
  sessionId: string,
  message: any
): Promise<void> {
  switch (message.type) {
    case 'init': {
      const { avatarId, userId, languageCode = 'en' } = message;
      
      if (!avatarId || !userId) {
        clientWs.send(JSON.stringify({ type: 'error', message: 'Missing avatarId or userId' }));
        return;
      }
      
      const avatar = await getAvatarById(avatarId);
      if (!avatar) {
        clientWs.send(JSON.stringify({ type: 'error', message: 'Avatar not found' }));
        return;
      }
      
      const roomName = `streaming-${avatarId}-${userId}-${Date.now()}`;
      
      const session: WebRTCSession = {
        sessionId,
        clientWs,
        avatarId,
        userId,
        voiceId: avatar.elevenlabsVoiceId || 'pNInz6obpgDQGcFmaJgB',
        languageCode,
        roomName,
        sttWs: null,
        ttsWs: null,
        accumulatedTranscript: '',
        isProcessing: false,
        sttReady: false,
        ttsReady: false,
        systemPrompt: avatar.personalityPrompt || 'You are a helpful AI assistant.',
        pineconeNamespaces: avatar.pineconeNamespaces || [],
      };
      
      activeSessions.set(sessionId, session);
      
      try {
        const livekitConfig = await liveKitService.generateLiveAvatarConfig(userId, avatarId);
        
        clientWs.send(JSON.stringify({
          type: 'connected',
          sessionId,
          livekit: {
            url: livekitConfig.livekit_url,
            room: livekitConfig.livekit_room,
            token: livekitConfig.frontend_token,
          },
        }));
        
        await startSTTStream(session);
        await startTTSStream(session);
        
        log.info({ sessionId, avatarId, roomName }, 'WebRTC session initialized');
      } catch (error) {
        log.error({ sessionId, error }, 'Failed to initialize WebRTC session');
        clientWs.send(JSON.stringify({ type: 'error', message: 'Failed to initialize session' }));
      }
      break;
    }
    
    case 'audio_config': {
      const session = activeSessions.get(sessionId);
      if (session) {
        log.debug({ sessionId, config: message.config }, 'Audio config received');
      }
      break;
    }
    
    case 'stop_listening': {
      const session = activeSessions.get(sessionId);
      if (session?.sttWs?.readyState === WebSocket.OPEN) {
        session.sttWs.send(JSON.stringify({ type: 'close_stream' }));
      }
      break;
    }
    
    case 'send_text': {
      const session = activeSessions.get(sessionId);
      if (session && message.text) {
        await processUserInput(session, message.text);
      }
      break;
    }
    
    case 'interrupt': {
      const session = activeSessions.get(sessionId);
      if (session) {
        session.isProcessing = false;
        if (session.ttsWs?.readyState === WebSocket.OPEN) {
          session.ttsWs.send(JSON.stringify({ text: '', flush: true }));
        }
        session.clientWs.send(JSON.stringify({ type: 'interrupted' }));
      }
      break;
    }
  }
}

async function handleAudioData(sessionId: string, audioData: Buffer): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) return;
  
  if (session.sttWs?.readyState === WebSocket.OPEN && session.sttReady) {
    session.sttWs.send(audioData);
  }
}

async function startSTTStream(session: WebRTCSession): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    log.error('ELEVENLABS_API_KEY not set');
    return;
  }
  
  const sttUrl = `${ELEVENLABS_STT_URL}?model_id=scribe_v1&language_code=${session.languageCode}`;
  
  try {
    const sttWs = new WebSocket(sttUrl, {
      headers: { 'xi-api-key': apiKey },
    });
    session.sttWs = sttWs;
    
    sttWs.on('open', () => {
      log.info({ sessionId: session.sessionId }, 'ElevenLabs STT WebSocket connected');
      
      sttWs.send(JSON.stringify({
        type: 'config',
        format: 'pcm_16000',
        sample_rate: 16000,
        channels: 1,
        encoding: 'pcm_s16le',
      }));
      
      session.sttReady = true;
      session.clientWs.send(JSON.stringify({ type: 'stt_ready' }));
    });
    
    sttWs.on('message', async (data: Buffer) => {
      try {
        const event = JSON.parse(data.toString());
        
        if (event.type === 'transcript') {
          if (event.is_final) {
            session.accumulatedTranscript += (session.accumulatedTranscript ? ' ' : '') + event.text;
            
            session.clientWs.send(JSON.stringify({
              type: 'stt_final',
              text: event.text,
              accumulated: session.accumulatedTranscript,
            }));
            
            if (event.text.trim()) {
              await processUserInput(session, session.accumulatedTranscript);
              session.accumulatedTranscript = '';
            }
          } else {
            session.clientWs.send(JSON.stringify({
              type: 'stt_partial',
              text: event.text,
            }));
          }
        }
      } catch (error) {
        log.error({ sessionId: session.sessionId, error }, 'Error parsing STT message');
      }
    });
    
    sttWs.on('error', (error) => {
      log.error({ sessionId: session.sessionId, error }, 'STT WebSocket error');
    });
    
    sttWs.on('close', () => {
      session.sttReady = false;
      log.info({ sessionId: session.sessionId }, 'STT WebSocket closed');
    });
  } catch (error) {
    log.error({ sessionId: session.sessionId, error }, 'Failed to start STT stream');
  }
}

async function startTTSStream(session: WebRTCSession): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    log.error('ELEVENLABS_API_KEY not set');
    return;
  }
  
  // Use multilingual model for non-English languages
  const isNonEnglish = session.languageCode && !session.languageCode.startsWith('en');
  const modelId = isNonEnglish ? 'eleven_multilingual_v2' : 'eleven_turbo_v2_5';
  log.debug({ languageCode: session.languageCode, modelId, isNonEnglish }, 'Selected TTS model for WebRTC streaming');
  
  const ttsUrl = `${ELEVENLABS_TTS_URL}/${session.voiceId}/stream-input?model_id=${modelId}&output_format=pcm_24000&optimize_streaming_latency=4`;
  
  try {
    const ttsWs = new WebSocket(ttsUrl, {
      headers: { 'xi-api-key': apiKey },
    });
    session.ttsWs = ttsWs;
    
    ttsWs.on('open', () => {
      log.info({ voiceId: session.voiceId }, 'ElevenLabs TTS WebSocket connected');
      
      ttsWs.send(JSON.stringify({
        text: ' ',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.8,
          speed: 1.0,
        },
        generation_config: {
          chunk_length_schedule: [50],
        },
      }));
      
      session.ttsReady = true;
      session.clientWs.send(JSON.stringify({ type: 'tts_ready' }));
    });
    
    ttsWs.on('message', (data: Buffer) => {
      try {
        const event = JSON.parse(data.toString());
        
        if (event.audio) {
          session.clientWs.send(JSON.stringify({
            type: 'audio_chunk',
            audio: event.audio,
            isFinal: event.isFinal || false,
          }));
        }
        
        if (event.isFinal) {
          session.isProcessing = false;
          session.clientWs.send(JSON.stringify({ type: 'response_complete' }));
        }
      } catch {
        if (data.length > 0) {
          const base64Audio = data.toString('base64');
          session.clientWs.send(JSON.stringify({
            type: 'audio_chunk',
            audio: base64Audio,
            isFinal: false,
          }));
        }
      }
    });
    
    ttsWs.on('error', (error) => {
      log.error({ sessionId: session.sessionId, error }, 'TTS WebSocket error');
    });
    
    ttsWs.on('close', () => {
      session.ttsReady = false;
      log.info({ sessionId: session.sessionId }, 'TTS WebSocket closed');
    });
  } catch (error) {
    log.error({ sessionId: session.sessionId, error }, 'Failed to start TTS stream');
  }
}

async function processUserInput(session: WebRTCSession, userText: string): Promise<void> {
  if (session.isProcessing || !userText.trim()) return;
  
  session.isProcessing = true;
  const startTime = Date.now();
  
  try {
    // Start RAG and Mem0 searches immediately (parallel, non-blocking)
    const ragPromise = (pineconeNamespaceService.isAvailable() && session.pineconeNamespaces.length > 0)
      ? pineconeNamespaceService.retrieveContext(userText, 3, session.pineconeNamespaces)
          .catch(err => { log.warn({ err }, 'RAG query failed'); return []; })
      : Promise.resolve([]);
    
    const memoryPromise = mem0Service.isAvailable()
      ? mem0Service.searchMemories(session.userId, userText, 3)
          .catch(err => { log.warn({ err }, 'Memory query failed'); return []; })
      : Promise.resolve([]);
    
    // Race: wait max 250ms for context, then start LLM regardless
    // Most RAG queries complete within 200ms, so this balances latency vs accuracy
    const CONTEXT_TIMEOUT_MS = 250;
    
    let ragContext = '';
    let memoryContext = '';
    
    const contextResult = await Promise.race([
      Promise.all([ragPromise, memoryPromise]).then(([rag, mem]) => ({ rag, mem, complete: true })),
      new Promise<{ rag: any[], mem: any[], complete: boolean }>(resolve => 
        setTimeout(() => resolve({ rag: [], mem: [], complete: false }), CONTEXT_TIMEOUT_MS)
      )
    ]);
    
    if (contextResult.complete) {
      if (contextResult.rag.length > 0) {
        ragContext = contextResult.rag.map((r: { text: string }) => r.text).join('\n\n');
      }
      if (contextResult.mem.length > 0) {
        memoryContext = contextResult.mem.map((m: { memory: string }) => m.memory).join('\n');
      }
      log.debug({ ragLen: ragContext.length, memLen: memoryContext.length, ms: Date.now() - startTime }, 'Context ready before timeout');
    } else {
      log.debug({ ms: CONTEXT_TIMEOUT_MS }, 'Starting LLM without full context (timeout exceeded)');
    }
    
    const systemPrompt = `${session.systemPrompt}
${ragContext ? `\nRELEVANT KNOWLEDGE:\n${ragContext}` : ''}
${memoryContext ? `\nUSER CONTEXT:\n${memoryContext}` : ''}

Respond naturally and conversationally. Keep responses concise for voice.`;

    const anthropic = new Anthropic();
    let fullResponse = '';
    
    // Start LLM streaming immediately
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-5',
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userText }],
    });
    
    stream.on('text', (text) => {
      if (!session.isProcessing) return;
      
      fullResponse += text;
      
      session.clientWs.send(JSON.stringify({
        type: 'llm_delta',
        delta: text,
        accumulated: fullResponse,
      }));
      
      if (session.ttsWs?.readyState === WebSocket.OPEN) {
        session.ttsWs.send(JSON.stringify({
          text: text,
          try_trigger_generation: true,
        }));
      }
    });
    
    stream.on('end', async () => {
      if (session.ttsWs?.readyState === WebSocket.OPEN) {
        session.ttsWs.send(JSON.stringify({
          text: '',
          flush: true,
        }));
      }
      
      session.clientWs.send(JSON.stringify({
        type: 'llm_complete',
        fullText: fullResponse,
      }));
      
      log.info({ totalMs: Date.now() - startTime }, 'Response complete');
      
      // Save memory in background (non-blocking)
      if (mem0Service.isAvailable()) {
        mem0Service.addConversationMemory(session.userId, userText, fullResponse)
          .catch(err => log.warn({ err }, 'Failed to save memory'));
      }
    });
    
    stream.on('error', (error) => {
      log.error({ error }, 'LLM stream error');
      session.isProcessing = false;
      session.clientWs.send(JSON.stringify({ type: 'error', message: 'LLM processing failed' }));
    });
    
  } catch (error) {
    log.error({ sessionId: session.sessionId, error }, 'Error processing user input');
    session.isProcessing = false;
    session.clientWs.send(JSON.stringify({ type: 'error', message: 'Processing failed' }));
  }
}

function cleanupSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (!session) return;
  
  if (session.sttWs?.readyState === WebSocket.OPEN) {
    session.sttWs.close();
  }
  if (session.ttsWs?.readyState === WebSocket.OPEN) {
    session.ttsWs.close();
  }
  
  activeSessions.delete(sessionId);
  log.info({ sessionId }, 'WebRTC session cleaned up');
}

export function getActiveWebRTCSessions(): number {
  return activeSessions.size;
}
