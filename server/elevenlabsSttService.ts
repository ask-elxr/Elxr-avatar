import WebSocket, { WebSocketServer } from 'ws';
import { logger } from './logger.js';

const log = logger.child({ service: 'elevenlabs-stt' });

const ELEVENLABS_STT_URL = 'wss://api.elevenlabs.io/v1/speech-to-text/stream';

interface STTSession {
  sessionId: string;
  clientWs: WebSocket;
  sttWs: WebSocket | null;
  sttReady: boolean;
  languageCode: string;
}

const activeSessions = new Map<string, STTSession>();

export function initElevenLabsSttServer(wss: WebSocketServer): void {
  wss.on('connection', async (ws: WebSocket, request: any) => {
    const sessionId = `stt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    log.info({ sessionId }, 'New ElevenLabs STT connection');
    
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
  switch (message.type) {
    case 'start': {
      const { languageCode = 'en' } = message;
      
      const session: STTSession = {
        sessionId,
        clientWs,
        sttWs: null,
        sttReady: false,
        languageCode,
      };
      
      activeSessions.set(sessionId, session);
      
      try {
        await startSTTStream(session);
        
        clientWs.send(JSON.stringify({
          type: 'started',
          sessionId,
        }));
        
        log.info({ sessionId, languageCode }, 'STT session started');
      } catch (error) {
        log.error({ sessionId, error }, 'Failed to start STT session');
        clientWs.send(JSON.stringify({ type: 'error', message: 'Failed to start STT session' }));
      }
      break;
    }
    
    case 'stop': {
      const session = activeSessions.get(sessionId);
      if (session?.sttWs?.readyState === WebSocket.OPEN) {
        session.sttWs.send(JSON.stringify({ type: 'close_stream' }));
      }
      cleanupSession(sessionId);
      clientWs.send(JSON.stringify({ type: 'stopped' }));
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

async function startSTTStream(session: STTSession): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    log.error('ELEVENLABS_API_KEY not set');
    throw new Error('ELEVENLABS_API_KEY not configured');
  }
  
  const sttUrl = `${ELEVENLABS_STT_URL}?model_id=scribe_v1&language_code=${session.languageCode}`;
  
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
        
        sttWs.send(JSON.stringify({
          type: 'config',
          format: 'pcm_16000',
          sample_rate: 16000,
          channels: 1,
          encoding: 'pcm_s16le',
        }));
        
        session.sttReady = true;
        clearTimeout(connectionTimeout);
        
        session.clientWs.send(JSON.stringify({ type: 'stt_ready' }));
        resolve();
      });
      
      sttWs.on('message', async (data: Buffer) => {
        try {
          const event = JSON.parse(data.toString());
          
          if (event.type === 'transcript') {
            if (event.is_final) {
              session.clientWs.send(JSON.stringify({
                type: 'final',
                text: event.text,
              }));
            } else {
              session.clientWs.send(JSON.stringify({
                type: 'partial',
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
        clearTimeout(connectionTimeout);
        session.clientWs.send(JSON.stringify({ type: 'error', message: 'STT connection error' }));
        reject(error);
      });
      
      sttWs.on('close', () => {
        session.sttReady = false;
        log.info({ sessionId: session.sessionId }, 'STT WebSocket closed');
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
  
  if (session.sttWs?.readyState === WebSocket.OPEN) {
    session.sttWs.close();
  }
  
  activeSessions.delete(sessionId);
  log.info({ sessionId }, 'STT session cleaned up');
}

export function getActiveSTTSessions(): number {
  return activeSessions.size;
}
