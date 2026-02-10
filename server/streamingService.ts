import WebSocket, { WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { logger } from './logger';
import { pineconeNamespaceService } from './pineconeNamespaceService';
import { mem0Service } from './mem0Service';
import { storage } from './storage';

const log = logger.child({ service: 'streaming' });

const ELEVENLABS_STT_URL = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';
const ELEVENLABS_TTS_URL = 'wss://api.elevenlabs.io/v1/text-to-speech';
const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime';

interface StreamingSession {
  sttWs: WebSocket | null;
  ttsWs: WebSocket | null;
  openaiWs: WebSocket | null;
  clientWs: WebSocket;
  avatarId: string;
  userId: string;
  languageCode: string;
  voiceId: string;
  accumulatedText: string;
  isProcessing: boolean;
  ttsReady: boolean;
}

const activeSessions = new Map<string, StreamingSession>();

export function setupStreamingWebSocket(wss: WebSocketServer): void {
  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const path = url.pathname;
    
    if (path === '/ws/streaming-chat') {
      handleStreamingChat(ws, url);
    }
  });
  
  log.info('Streaming WebSocket server initialized');
}

async function handleStreamingChat(clientWs: WebSocket, url: URL): Promise<void> {
  const avatarId = url.searchParams.get('avatarId') || '';
  const userId = url.searchParams.get('userId') || '';
  const languageCode = url.searchParams.get('lang') || 'en';
  const sessionId = `${userId}_${Date.now()}`;
  
  log.info({ avatarId, userId, sessionId }, 'New streaming chat session');
  
  const avatar = await storage.getAvatar(avatarId);
  const voiceId = avatar?.elevenlabsVoiceId || 'EXAVITQu4vr4xnSDxMaL';
  
  const session: StreamingSession = {
    sttWs: null,
    ttsWs: null,
    openaiWs: null,
    clientWs,
    avatarId,
    userId,
    languageCode,
    voiceId,
    accumulatedText: '',
    isProcessing: false,
    ttsReady: false,
  };
  
  activeSessions.set(sessionId, session);
  
  await startTTSStream(session);
  
  clientWs.on('message', async (data: Buffer | string) => {
    try {
      if (Buffer.isBuffer(data) && data.length > 0 && data[0] !== 123) {
        if (session.sttWs?.readyState === WebSocket.OPEN) {
          session.sttWs.send(data);
        }
        return;
      }
      
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'start_stt':
          await startSTTStream(session);
          break;
          
        case 'audio_chunk':
          if (session.sttWs?.readyState === WebSocket.OPEN) {
            const binaryAudio = Buffer.from(message.audio, 'base64');
            session.sttWs.send(binaryAudio);
          }
          break;
          
        case 'stop_stt':
          if (session.sttWs?.readyState === WebSocket.OPEN) {
            session.sttWs.send(JSON.stringify({ flush: true }));
          }
          break;
          
        case 'send_text':
          await processUserMessage(session, message.text);
          break;
      }
    } catch (error) {
      log.error({ error }, 'Error handling streaming message');
    }
  });
  
  clientWs.on('close', () => {
    cleanupSession(sessionId);
  });
  
  clientWs.on('error', (error) => {
    log.error({ error, sessionId }, 'Client WebSocket error');
    cleanupSession(sessionId);
  });
  
  clientWs.send(JSON.stringify({ type: 'connected', sessionId }));
}

async function startSTTStream(session: StreamingSession): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    session.clientWs.send(JSON.stringify({ type: 'error', message: 'STT not configured' }));
    return;
  }
  
  const sttUrl = `${ELEVENLABS_STT_URL}?model_id=scribe_v1&language_code=${session.languageCode}&sample_rate=16000&encoding=pcm_s16le`;
  
  try {
    const sttWs = new WebSocket(sttUrl, {
      headers: { 'xi-api-key': apiKey },
    });
    
    session.sttWs = sttWs;
    
    sttWs.on('open', () => {
      log.info('ElevenLabs STT WebSocket connected');
      session.clientWs.send(JSON.stringify({ type: 'stt_ready' }));
    });
    
    sttWs.on('message', (data: Buffer) => {
      try {
        const event = JSON.parse(data.toString());
        
        if (event.text && event.type === 'partial') {
          session.clientWs.send(JSON.stringify({
            type: 'stt_partial',
            text: event.text,
          }));
        }
        
        if (event.text && (event.type === 'final' || event.is_final)) {
          session.accumulatedText += (session.accumulatedText ? ' ' : '') + event.text;
          session.clientWs.send(JSON.stringify({
            type: 'stt_final',
            text: event.text,
            accumulated: session.accumulatedText,
          }));
          
          processUserMessage(session, session.accumulatedText);
          session.accumulatedText = '';
        }
      } catch (error) {
        log.error({ error }, 'Error parsing STT message');
      }
    });
    
    sttWs.on('error', (error) => {
      log.error({ error }, 'STT WebSocket error');
      session.clientWs.send(JSON.stringify({ type: 'stt_error', message: 'STT connection error' }));
    });
    
    sttWs.on('close', () => {
      log.info('STT WebSocket closed');
    });
    
  } catch (error) {
    log.error({ error }, 'Failed to connect to ElevenLabs STT');
    session.clientWs.send(JSON.stringify({ type: 'error', message: 'Failed to start STT' }));
  }
}

async function startTTSStream(session: StreamingSession): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    log.warn('ElevenLabs API key not configured, TTS will not work');
    return;
  }
  
  // Use multilingual model for non-English languages
  const isNonEnglish = session.languageCode && !session.languageCode.startsWith('en');
  const modelId = isNonEnglish ? 'eleven_multilingual_v2' : 'eleven_turbo_v2_5';
  log.debug({ languageCode: session.languageCode, modelId, isNonEnglish }, 'Selected TTS model for streaming');
  
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
        
        if (event.alignment) {
          session.clientWs.send(JSON.stringify({
            type: 'audio_alignment',
            alignment: event.alignment,
          }));
        }
        
      } catch (error) {
        log.error({ error }, 'Error parsing TTS message');
      }
    });
    
    ttsWs.on('error', (error) => {
      log.error({ error }, 'TTS WebSocket error');
      session.ttsReady = false;
    });
    
    ttsWs.on('close', () => {
      log.info('TTS WebSocket closed');
      session.ttsReady = false;
    });
    
  } catch (error) {
    log.error({ error }, 'Failed to connect to ElevenLabs TTS');
  }
}

function sendTextToTTS(session: StreamingSession, text: string, flush: boolean = false): void {
  if (!session.ttsWs || session.ttsWs.readyState !== WebSocket.OPEN || !session.ttsReady) {
    log.warn('TTS WebSocket not ready, cannot send text');
    return;
  }
  
  session.ttsWs.send(JSON.stringify({
    text: text,
    try_trigger_generation: true,
    flush: flush,
  }));
}

function closeTTSGeneration(session: StreamingSession): void {
  if (session.ttsWs && session.ttsWs.readyState === WebSocket.OPEN) {
    session.ttsWs.send(JSON.stringify({ text: '' }));
  }
}

async function processUserMessage(session: StreamingSession, userText: string): Promise<void> {
  if (session.isProcessing) {
    session.clientWs.send(JSON.stringify({ type: 'busy', message: 'Still processing previous message' }));
    return;
  }
  
  session.isProcessing = true;
  session.accumulatedText = '';
  const startTime = Date.now();
  
  try {
    const avatar = await storage.getAvatar(session.avatarId);
    if (!avatar) {
      throw new Error('Avatar not found');
    }
    
    // Start RAG and Mem0 searches immediately (parallel, non-blocking)
    const ragPromise = searchPineconeNamespaces(avatar.pineconeNamespaces || [], userText);
    const memoryPromise = mem0Service.isAvailable() 
      ? mem0Service.searchMemories(session.userId, userText, 3).catch(() => [])
      : Promise.resolve([]);
    
    // Race: wait max 250ms for context, then start LLM regardless
    // Most RAG queries complete within 200ms, so this balances latency vs accuracy
    const CONTEXT_TIMEOUT_MS = 250;
    
    let memoryContext = '';
    let knowledgeContext = '';
    
    const contextResult = await Promise.race([
      Promise.all([memoryPromise, ragPromise]).then(([mem, rag]) => ({ mem, rag, complete: true })),
      new Promise<{ mem: any[], rag: string, complete: boolean }>(resolve => 
        setTimeout(() => resolve({ mem: [], rag: '', complete: false }), CONTEXT_TIMEOUT_MS)
      )
    ]);
    
    if (contextResult.complete) {
      if (contextResult.mem.length > 0) {
        memoryContext = `\n\nUser's relevant memories:\n${contextResult.mem.map((m: { memory: string }) => `- ${m.memory}`).join('\n')}`;
      }
      if (contextResult.rag) {
        knowledgeContext = `\n\n[INTERNAL - Things you know from your experience and research - present as YOUR OWN knowledge, never mention "snippets" or "knowledge base"]:\n${contextResult.rag}`;
      }
      log.debug({ memLen: memoryContext.length, ragLen: knowledgeContext.length, ms: Date.now() - startTime }, 'Context ready before timeout');
    } else {
      log.debug({ ms: CONTEXT_TIMEOUT_MS }, 'Starting LLM without waiting for full context');
    }
    
    const systemPrompt = buildSystemPrompt(avatar, memoryContext, knowledgeContext);
    
    const fullResponse = await streamOpenAIResponse(session, systemPrompt, userText);
    
    log.info({ totalMs: Date.now() - startTime }, 'Response complete');
    
    // Save memory in background (non-blocking) with full conversation
    if (mem0Service.isAvailable() && fullResponse) {
      mem0Service.addConversationMemory(session.userId, userText, fullResponse)
        .catch(err => log.warn({ err }, 'Failed to save memory'));
    }
    
  } catch (error) {
    log.error({ error }, 'Error processing user message');
    session.clientWs.send(JSON.stringify({ type: 'error', message: 'Failed to process message' }));
  } finally {
    session.isProcessing = false;
  }
}

async function searchPineconeNamespaces(namespaces: string[], query: string): Promise<string> {
  if (!pineconeNamespaceService.isAvailable() || namespaces.length === 0) {
    log.debug({ namespaces, queryLen: query.length }, '📚 RAG: Skipping search - no Pinecone or empty namespaces');
    return '';
  }
  
  const startTime = Date.now();
  try {
    log.info({ namespaces, query: query.substring(0, 80) }, '📚 RAG: Querying Pinecone namespaces');
    const results = await pineconeNamespaceService.retrieveContext(query, 3, namespaces);
    const duration = Date.now() - startTime;
    
    if (results.length > 0) {
      log.info({ 
        namespaces,
        resultCount: results.length,
        scores: results.map((r: { text: string; score: number }) => r.score.toFixed(3)),
        textPreviews: results.map((r: { text: string; score: number }) => r.text.substring(0, 60) + '...'),
        duration
      }, '📚 RAG: Retrieved context successfully');
      return results.map((r: { text: string; score: number }) => r.text).join('\n\n');
    } else {
      log.info({ namespaces, duration }, '📚 RAG: No matching context found');
    }
  } catch (error) {
    log.warn({ namespaces, error, duration: Date.now() - startTime }, '📚 RAG: Failed to search Pinecone');
  }
  
  return '';
}

function buildSystemPrompt(avatar: any, memoryContext: string, knowledgeContext: string): string {
  return `You are ${avatar.name}, an AI wellness coach.
${avatar.personality || ''}
${avatar.expertise ? `Your expertise: ${avatar.expertise}` : ''}
${memoryContext}
${knowledgeContext}

CRITICAL VOICE MODE RULES:
- Keep responses under 2 sentences (30 words max)
- Be warm, conversational, and natural
- Never use bullet points, lists, or markdown
- Respond as if speaking aloud

KNOWLEDGE INTERNALIZATION (CRITICAL):
- NEVER reference "snippets", "knowledge base", "my information", "according to my data", or similar
- Present ALL knowledge as YOUR OWN lived experience, things you've learned, or your professional expertise
- Say "I've found that...", "In my experience...", "What I know is..." - NOT "Based on my knowledge..."
- If asked where you learned something, attribute it naturally: "from my work", "from research I've done", "over the years"

HUMOR & PERSONALITY:
- Be genuinely warm and occasionally witty - dry humor, clever observations, playful curiosity
- NEVER use awkward interjections like "Hah!" or forced laughter markers
- If something is funny, respond naturally: "That's a good one", "Ha, I like that", or just smile through your tone
- Let humor emerge naturally from the conversation, don't force it

BARGE-IN BEHAVIOR:
- If the user speaks while you are responding, immediately stop and listen. Do not apologize unless the user sounds annoyed.`;
}

async function streamOpenAIResponse(
  session: StreamingSession,
  systemPrompt: string,
  userText: string
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    session.clientWs.send(JSON.stringify({ type: 'error', message: 'OpenAI not configured' }));
    return '';
  }
  
  return new Promise((resolve, reject) => {
    const openaiWs = new WebSocket(
      `${OPENAI_REALTIME_URL}?model=gpt-4o-realtime-preview-2024-12-17`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      }
    );
    
    session.openaiWs = openaiWs;
    let fullResponse = '';
    
    openaiWs.on('open', () => {
      log.info('OpenAI Realtime WebSocket connected');
      
      openaiWs.send(JSON.stringify({
        type: 'session.update',
        session: {
          modalities: ['text'],
          instructions: systemPrompt,
          temperature: 0.8,
          max_response_output_tokens: 150,
        },
      }));
      
      openaiWs.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: userText }],
        },
      }));
      
      openaiWs.send(JSON.stringify({ type: 'response.create' }));
    });
    
    openaiWs.on('message', async (data: Buffer) => {
      try {
        const event = JSON.parse(data.toString());
        
        if (event.type === 'response.text.delta') {
          const delta = event.delta || '';
          fullResponse += delta;
          
          session.clientWs.send(JSON.stringify({
            type: 'llm_delta',
            delta,
            accumulated: fullResponse,
          }));
          
          sendTextToTTS(session, delta, false);
        }
        
        if (event.type === 'response.text.done') {
          sendTextToTTS(session, '', true);
          
          session.clientWs.send(JSON.stringify({
            type: 'llm_complete',
            fullText: fullResponse,
          }));
        }
        
        if (event.type === 'response.done') {
          session.clientWs.send(JSON.stringify({ type: 'response_complete' }));
          openaiWs.close();
          resolve(fullResponse);
        }
        
        if (event.type === 'error') {
          log.error({ error: event.error }, 'OpenAI Realtime error');
          session.clientWs.send(JSON.stringify({ 
            type: 'error', 
            message: event.error?.message || 'OpenAI error' 
          }));
          reject(new Error(event.error?.message));
        }
        
      } catch (error) {
        log.error({ error }, 'Error parsing OpenAI message');
      }
    });
    
    openaiWs.on('error', (error) => {
      log.error({ error }, 'OpenAI WebSocket error');
      reject(error);
    });
    
    openaiWs.on('close', () => {
      log.info('OpenAI WebSocket closed');
    });
  });
}

function cleanupSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    if (session.sttWs?.readyState === WebSocket.OPEN) {
      session.sttWs.close();
    }
    if (session.ttsWs?.readyState === WebSocket.OPEN) {
      closeTTSGeneration(session);
      session.ttsWs.close();
    }
    if (session.openaiWs?.readyState === WebSocket.OPEN) {
      session.openaiWs.close();
    }
    activeSessions.delete(sessionId);
    log.info({ sessionId }, 'Streaming session cleaned up');
  }
}

export { activeSessions };
