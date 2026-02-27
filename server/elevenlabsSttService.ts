import WebSocket, { WebSocketServer } from 'ws';
import { logger } from './logger.js';

const log = logger.child({ service: 'elevenlabs-stt' });

const ELEVENLABS_STT_URL = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';

const GARBAGE_WORDS = [
  'foreign',
  '[foreign]',
  '(foreign)',
  '[music]',
  '(music)',
  '[inaudible]',
  '(inaudible)',
  '[unintelligible]',
  '(unintelligible)',
];

function cleanTranscript(text: string): string {
  if (!text) return '';
  let cleaned = text;
  for (const word of GARBAGE_WORDS) {
    cleaned = cleaned.replace(new RegExp(word, 'gi'), '');
  }
  return cleaned.replace(/\s+/g, ' ').trim();
}

interface STTSession {
  sessionId: string;
  clientWs: WebSocket;
  sttWs: WebSocket | null;
  sttReady: boolean;
  languageCode: string;
  sampleRate: number;
  isReconnecting: boolean;
  keepaliveInterval: NodeJS.Timeout | null;
}

const activeSessions = new Map<string, STTSession>();

export function initElevenLabsSttServer(wss: WebSocketServer): void {
  wss.on('connection', async (ws: WebSocket, request: any) => {
    const sessionId = `stt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const clientIp = request.socket?.remoteAddress || 'unknown';
    
    log.info({ sessionId, clientIp, url: request.url }, 'New ElevenLabs STT connection established');
    
    ws.on('message', async (data: Buffer | string) => {
      try {
        if (typeof data === 'string' || (data instanceof Buffer && data[0] === 0x7b)) {
          const message = JSON.parse(data.toString());
          await handleControlMessage(ws, sessionId, message);
        } else {
          await handleAudioData(sessionId, data as Buffer);
        }
      } catch (error) {
        log.error({ sessionId, error }, 'Error processing STT message');
      }
    });
    
    ws.on('close', () => {
      cleanupSession(sessionId);
      log.info({ sessionId }, 'ElevenLabs STT connection closed');
    });
    
    ws.on('error', (error) => {
      log.error({ sessionId, error }, 'ElevenLabs STT WebSocket error');
      cleanupSession(sessionId);
    });
  });
  
  log.info('ElevenLabs STT WebSocket server initialized');
}

async function handleControlMessage(
  clientWs: WebSocket,
  sessionId: string,
  message: any
): Promise<void> {
  log.debug({ sessionId, messageType: message.type }, 'Received control message from client');
  
  switch (message.type) {
    case 'start': {
      const { languageCode = 'en', sampleRate = 16000 } = message;
      
      log.info({ sessionId, languageCode, sampleRate }, 'Starting STT session...');
      
      const session: STTSession = {
        sessionId,
        clientWs,
        sttWs: null,
        sttReady: false,
        languageCode,
        sampleRate,
        isReconnecting: false,
        keepaliveInterval: null,
      };
      
      activeSessions.set(sessionId, session);
      
      try {
        await startSTTStream(session);
        
        clientWs.send(JSON.stringify({
          type: 'started',
          sessionId,
        }));
        
        log.info({ sessionId, languageCode, sampleRate }, 'STT session started successfully');
      } catch (error) {
        log.error({ sessionId, error }, 'Failed to start STT session');
        clientWs.send(JSON.stringify({ type: 'error', message: 'Failed to start STT session' }));
      }
      break;
    }
    
    case 'stop': {
      const session = activeSessions.get(sessionId);
      if (session?.sttWs?.readyState === WebSocket.OPEN) {
        session.sttWs.close();
      }
      cleanupSession(sessionId);
      clientWs.send(JSON.stringify({ type: 'stopped' }));
      break;
    }
    
    case 'update_language': {
      const session = activeSessions.get(sessionId);
      if (!session) {
        log.warn({ sessionId }, 'No session found for language update');
        clientWs.send(JSON.stringify({ type: 'error', message: 'No active session' }));
        break;
      }
      
      const { languageCode } = message;
      if (!languageCode) {
        log.warn({ sessionId }, 'No language code provided for update');
        break;
      }
      
      if (session.languageCode === languageCode) {
        log.debug({ sessionId, languageCode }, 'Language already set, skipping update');
        break;
      }
      
      // Prevent race conditions - skip if already reconnecting
      if (session.isReconnecting) {
        log.warn({ sessionId, languageCode }, 'Already reconnecting, ignoring language update');
        break;
      }
      
      log.info({ sessionId, oldLanguage: session.languageCode, newLanguage: languageCode }, 'Updating STT language');
      
      // Mark as reconnecting to prevent race conditions
      session.isReconnecting = true;
      session.sttReady = false;
      
      if (session.keepaliveInterval) {
        clearInterval(session.keepaliveInterval);
        session.keepaliveInterval = null;
      }
      if (session.sttWs?.readyState === WebSocket.OPEN) {
        session.sttWs.close();
      }
      session.sttWs = null;
      session.languageCode = languageCode;
      
      // Reconnect with new language
      try {
        await startSTTStream(session);
        session.isReconnecting = false;
        clientWs.send(JSON.stringify({
          type: 'language_updated',
          languageCode,
        }));
        log.info({ sessionId, languageCode }, 'STT language updated successfully');
      } catch (error) {
        session.isReconnecting = false;
        log.error({ sessionId, error }, 'Failed to update STT language');
        clientWs.send(JSON.stringify({ type: 'error', message: 'Failed to update language. Please restart session.' }));
      }
      break;
    }
  }
}

async function handleAudioData(sessionId: string, audioData: Buffer): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) return;
  
  if (session.sttWs?.readyState === WebSocket.OPEN && session.sttReady) {
    const audioBase64 = audioData.toString('base64');
    session.sttWs.send(JSON.stringify({
      message_type: 'input_audio_chunk',
      audio_base_64: audioBase64,
      sample_rate: session.sampleRate,
    }));
  }
}

async function startSTTStream(session: STTSession): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    log.error('ELEVENLABS_API_KEY not set');
    throw new Error('ELEVENLABS_API_KEY not configured');
  }
  
  const queryParams = new URLSearchParams({
    model_id: 'scribe_v2_realtime',
    language_code: session.languageCode,
    sample_rate: session.sampleRate.toString(),
    audio_format: `pcm_${session.sampleRate}`,
    commit_strategy: 'vad',
    vad_silence_threshold_secs: '1.0',
    vad_threshold: '0.15',
    min_speech_duration_ms: '100',
    min_silence_duration_ms: '300',
  });
  
  const sttUrl = `${ELEVENLABS_STT_URL}?${queryParams.toString()}`;
  
  log.debug({ sessionId: session.sessionId, sttUrl }, 'Connecting to ElevenLabs STT');
  
  return new Promise((resolve, reject) => {
    try {
      const sttWs = new WebSocket(sttUrl, {
        headers: { 'xi-api-key': apiKey },
      });
      session.sttWs = sttWs;
      
      const connectionTimeout = setTimeout(() => {
        if (!session.sttReady) {
          log.error({ sessionId: session.sessionId }, 'STT connection timeout');
          sttWs.close();
          reject(new Error('STT connection timeout'));
        }
      }, 10000);
      
      sttWs.on('open', () => {
        log.info({ sessionId: session.sessionId }, 'ElevenLabs STT WebSocket connected');
        session.sttReady = true;
        clearTimeout(connectionTimeout);
        if (session.keepaliveInterval) clearInterval(session.keepaliveInterval);
        session.keepaliveInterval = setInterval(() => {
          if (sttWs.readyState === WebSocket.OPEN) {
            const silence = Buffer.alloc(3200);
            sttWs.send(silence);
          }
        }, 5000);
        session.clientWs.send(JSON.stringify({ type: 'stt_ready' }));
        resolve();
      });
      
      sttWs.on('message', async (data: Buffer) => {
        try {
          const event = JSON.parse(data.toString());
          const msgType = event.type || event.message_type;
          
          log.debug({ sessionId: session.sessionId, messageType: msgType, text: event.text?.substring(0, 50) }, 'STT message received');
          
          if (msgType === 'session_started' || msgType === 'session_begin') {
            log.info({ sessionId: session.sessionId }, 'STT session confirmed started');
          } else if (msgType === 'partial_transcript' || msgType === 'transcript') {
            // Handle partial transcripts (speech_final=false) vs final (speech_final=true)
            const isFinal = event.speech_final === true || event.is_final === true;
            const transcriptText = cleanTranscript(event.text || '');
            if (isFinal) {
              // Only send final if there's actual text after cleaning
              if (transcriptText) {
                log.info({ sessionId: session.sessionId, text: transcriptText }, 'Final transcript received');
                session.clientWs.send(JSON.stringify({
                  type: 'final',
                  text: transcriptText,
                }));
              }
            } else {
              // Only send partial if there's actual text after cleaning
              if (transcriptText) {
                session.clientWs.send(JSON.stringify({
                  type: 'partial',
                  text: transcriptText,
                }));
              }
            }
          } else if (msgType === 'committed_transcript' || msgType === 'committed_transcript_with_timestamps' || msgType === 'utterance_end') {
            const transcriptText = event.text || event.transcript || '';
            log.info({ sessionId: session.sessionId, text: transcriptText }, 'Committed transcript received');
            // Only send if there's actual text
            if (transcriptText) {
              session.clientWs.send(JSON.stringify({
                type: 'final',
                text: transcriptText,
              }));
            }
          } else if (msgType === 'error') {
            log.error({ sessionId: session.sessionId, error: event }, 'STT error from server');
            session.clientWs.send(JSON.stringify({
              type: 'error',
              message: event.error || 'STT server error',
            }));
          }
        } catch (error) {
          log.error({ sessionId: session.sessionId, error }, 'Error parsing STT message');
        }
      });
      
      sttWs.on('error', (error: any) => {
        const errorDetails = {
          message: error?.message || 'Unknown error',
          code: error?.code,
          errno: error?.errno,
          type: error?.type,
        };
        log.error({ sessionId: session.sessionId, errorDetails, errorString: String(error) }, 'STT WebSocket error');
        clearTimeout(connectionTimeout);
        session.clientWs.send(JSON.stringify({ type: 'error', message: 'STT connection error' }));
        reject(error);
      });
      
      sttWs.on('close', (code: number, reason: Buffer) => {
        session.sttReady = false;
        log.info({ 
          sessionId: session.sessionId, 
          closeCode: code,
          closeReason: reason?.toString() || 'No reason provided'
        }, 'STT WebSocket closed');
      });
    } catch (error) {
      log.error({ sessionId: session.sessionId, error }, 'Failed to start STT stream');
      reject(error);
    }
  });
}

function cleanupSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (!session) return;
  
  if (session.keepaliveInterval) {
    clearInterval(session.keepaliveInterval);
    session.keepaliveInterval = null;
  }
  
  if (session.sttWs?.readyState === WebSocket.OPEN) {
    session.sttWs.close();
  }
  
  activeSessions.delete(sessionId);
  log.info({ sessionId }, 'STT session cleaned up');
}

export function getActiveSTTSessions(): number {
  return activeSessions.size;
}
