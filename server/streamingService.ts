import WebSocket, { WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { logger } from './logger';
import { pineconeNamespaceService } from './pineconeNamespaceService';
import { mem0Service } from './mem0Service';
import { storage } from './storage';

const log = logger.child({ service: 'streaming' });

const ELEVENLABS_STT_URL = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';
const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime';

interface StreamingSession {
  sttWs: WebSocket | null;
  openaiWs: WebSocket | null;
  clientWs: WebSocket;
  avatarId: string;
  userId: string;
  languageCode: string;
  accumulatedText: string;
  isProcessing: boolean;
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
  
  const session: StreamingSession = {
    sttWs: null,
    openaiWs: null,
    clientWs,
    avatarId,
    userId,
    languageCode,
    accumulatedText: '',
    isProcessing: false,
  };
  
  activeSessions.set(sessionId, session);
  
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

async function processUserMessage(session: StreamingSession, userText: string): Promise<void> {
  if (session.isProcessing) {
    session.clientWs.send(JSON.stringify({ type: 'busy', message: 'Still processing previous message' }));
    return;
  }
  
  session.isProcessing = true;
  session.accumulatedText = '';
  
  try {
    const avatar = await storage.getAvatar(session.avatarId);
    if (!avatar) {
      throw new Error('Avatar not found');
    }
    
    const [memories, knowledgeText] = await Promise.all([
      mem0Service.isAvailable() 
        ? mem0Service.searchMemories(session.userId, userText, 3)
        : Promise.resolve([]),
      searchPineconeNamespaces(avatar.pineconeNamespaces || [], userText),
    ]);
    
    const memoryContext = memories.length > 0
      ? `\n\nUser's relevant memories:\n${memories.map((m: { memory: string }) => `- ${m.memory}`).join('\n')}`
      : '';
    
    const knowledgeContext = knowledgeText 
      ? `\n\nRelevant knowledge:\n${knowledgeText}`
      : '';
    
    const systemPrompt = buildSystemPrompt(avatar, memoryContext, knowledgeContext);
    
    await streamOpenAIResponse(session, systemPrompt, userText, avatar.elevenlabsVoiceId || '');
    
    if (mem0Service.isAvailable()) {
      mem0Service.addMemory(session.userId, userText).catch(err => 
        log.error({ err }, 'Failed to save memory')
      );
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
    return '';
  }
  
  try {
    const results = await pineconeNamespaceService.retrieveContext(query, 3, namespaces);
    if (results.length > 0) {
      return results.map((r: { text: string; score: number }) => r.text).join('\n\n');
    }
  } catch (error) {
    log.warn({ namespaces, error }, 'Failed to search Pinecone');
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
- Respond as if speaking aloud`;
}

async function streamOpenAIResponse(
  session: StreamingSession,
  systemPrompt: string,
  userText: string,
  voiceId: string
): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    session.clientWs.send(JSON.stringify({ type: 'error', message: 'OpenAI not configured' }));
    return;
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
    let textBuffer = '';
    const CHUNK_SIZE = 50;
    
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
          textBuffer += delta;
          
          session.clientWs.send(JSON.stringify({
            type: 'llm_delta',
            delta,
            accumulated: fullResponse,
          }));
          
          if (textBuffer.length >= CHUNK_SIZE || 
              textBuffer.includes('.') || 
              textBuffer.includes('!') || 
              textBuffer.includes('?')) {
            
            const chunkToSpeak = textBuffer.trim();
            if (chunkToSpeak) {
              session.clientWs.send(JSON.stringify({
                type: 'tts_chunk',
                text: chunkToSpeak,
                voiceId,
              }));
            }
            textBuffer = '';
          }
        }
        
        if (event.type === 'response.text.done') {
          if (textBuffer.trim()) {
            session.clientWs.send(JSON.stringify({
              type: 'tts_chunk',
              text: textBuffer.trim(),
              voiceId,
            }));
          }
          
          session.clientWs.send(JSON.stringify({
            type: 'llm_complete',
            fullText: fullResponse,
          }));
        }
        
        if (event.type === 'response.done') {
          session.clientWs.send(JSON.stringify({ type: 'response_complete' }));
          openaiWs.close();
          resolve();
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
    if (session.openaiWs?.readyState === WebSocket.OPEN) {
      session.openaiWs.close();
    }
    activeSessions.delete(sessionId);
    log.info({ sessionId }, 'Streaming session cleaned up');
  }
}

export { activeSessions };
