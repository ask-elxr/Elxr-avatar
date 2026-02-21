import WebSocket, { WebSocketServer } from 'ws';
import { logger } from './logger.js';
import { claudeService } from './claudeService.js';
import { elevenlabsService } from './elevenlabsService.js';
import { getAvatarById } from './services/avatars.js';
import { getAvatarSystemPrompt } from './engine/avatarIntegration.js';
import { storage } from './storage.js';
import { memoryService, MemoryType } from './memoryService.js';
import { latencyCache } from './cache.js';
import { sessionManager } from './sessionManager.js';
import { ELXR_CONTENT_POLICY } from './contentTaxonomy.js';
import { getBanterLevel, buildAvatarPrompt } from './warmthEngine.js';
import { isValidAdminSecret } from './replitAuth.js';
import { checkChatRateLimit } from './chatRateLimit.js';

const log = logger.child({ service: 'conversation-ws' });

const ELEVENLABS_STT_URL = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';

const IDLE_NUDGE_1_MS = 12_000;
const IDLE_NUDGE_2_MS = 25_000;
const IDLE_SOFT_END_MS = 45_000;

const NUDGES_1 = [
  "I'm here. Go on.",
  "Take your time.",
  "No rush — what's on your mind?",
  "Alright. Where do you want to start?",
];
const NUDGES_2 = [
  "Still with me?",
  "Want the short version or the real one?",
  "If you're stuck, give me one sentence and we'll work from there.",
  "We can do this in tiny steps. What's step one?",
];
const SOFT_ENDS = [
  "Alright — I'll pause. Tap me when you want to carry on.",
  "Okay. I'll be quiet for now. Come back when you're ready.",
  "No pressure. I'm here when you want to pick this up again.",
  "Got it. I'll stop talking. You restart whenever.",
];

function rand(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

interface ConversationSession {
  ws: WebSocket;
  sessionId: string;
  state: 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING';
  turnId: number;
  active: {
    llmAbort: AbortController | null;
    ttsAbort: AbortController | null;
    ttsQueue: Array<{ sentence: string; turnId: number }>;
    playing: boolean;
  };
  bargeTimer: NodeJS.Timeout | null;
  idleTimer1: NodeJS.Timeout | null;
  idleTimer2: NodeJS.Timeout | null;
  idleTimer3: NodeJS.Timeout | null;
  sttWs: WebSocket | null;
  sttReady: boolean;
  keepaliveInterval: ReturnType<typeof setInterval> | null;
  avatarId: string;
  userId: string | null;
  voiceId: string;
  languageCode: string | undefined;
  systemPrompt: string;
  memoryEnabled: boolean;
  sampleRate: number;
  audioOnly: boolean;
  conversationHistory: Array<{ message: string; isUser: boolean }>;
  accumulatedTranscript: string;
}

const activeSessions = new Map<string, ConversationSession>();

function sendJSON(ws: WebSocket, obj: any): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function sendTtsBinary(ws: WebSocket, turnId: number, audioChunk: Buffer): void {
  const header = Buffer.alloc(8);
  header.write('TTS0', 0, 4, 'ascii');
  header.writeUInt32LE(turnId, 4);
  const payload = Buffer.concat([header, audioChunk]);
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(payload);
  }
}

function bargeIn(session: ConversationSession, reason: string = 'user_started_speaking'): void {
  session.turnId += 1;
  log.info({ sessionId: session.sessionId, turnId: session.turnId, reason }, 'Barge-in triggered');

  if (session.active.llmAbort) {
    try { session.active.llmAbort.abort(reason); } catch {}
    session.active.llmAbort = null;
  }

  if (session.active.ttsAbort) {
    try { session.active.ttsAbort.abort(reason); } catch {}
    session.active.ttsAbort = null;
  }

  session.active.ttsQueue.length = 0;

  sendJSON(session.ws, { type: 'STOP_AUDIO', turnId: session.turnId, reason });
  session.state = 'LISTENING';
  resetIdleTimers(session);
}

function clearIdleTimers(session: ConversationSession): void {
  if (session.idleTimer1) { clearTimeout(session.idleTimer1); session.idleTimer1 = null; }
  if (session.idleTimer2) { clearTimeout(session.idleTimer2); session.idleTimer2 = null; }
  if (session.idleTimer3) { clearTimeout(session.idleTimer3); session.idleTimer3 = null; }
}

function resetIdleTimers(session: ConversationSession): void {
  clearIdleTimers(session);
  if (session.state !== 'LISTENING') return;

  session.idleTimer1 = setTimeout(() => {
    if (session.state === 'LISTENING') {
      const text = rand(NUDGES_1);
      sendJSON(session.ws, { type: 'MUM_NUDGE', text });
      log.info({ sessionId: session.sessionId, text }, 'Idle nudge 1');
    }
  }, IDLE_NUDGE_1_MS);

  session.idleTimer2 = setTimeout(() => {
    if (session.state === 'LISTENING') {
      const text = rand(NUDGES_2);
      sendJSON(session.ws, { type: 'MUM_NUDGE', text });
      log.info({ sessionId: session.sessionId, text }, 'Idle nudge 2');
    }
  }, IDLE_NUDGE_2_MS);

  session.idleTimer3 = setTimeout(() => {
    if (session.state === 'LISTENING') {
      const text = rand(SOFT_ENDS);
      sendJSON(session.ws, { type: 'MUM_SOFT_END', text });
      log.info({ sessionId: session.sessionId, text }, 'Idle soft end (session stays open)');
    }
  }, IDLE_SOFT_END_MS);
}

function maybeBargeInFromStt(session: ConversationSession, sttMsg: any): void {
  const assistantTalking = session.state === 'SPEAKING' || session.state === 'THINKING';
  if (!assistantTalking) return;

  const speechStart = sttMsg.type === 'vad' && sttMsg.event === 'speech_start';
  const partialReal =
    sttMsg.type === 'partial' &&
    (sttMsg.text?.trim()?.length ?? 0) >= 2 &&
    (sttMsg.confidence ?? 1) >= 0.6;

  if (speechStart || partialReal) {
    if (!session.bargeTimer) {
      session.bargeTimer = setTimeout(() => {
        session.bargeTimer = null;
        if (session.state === 'SPEAKING' || session.state === 'THINKING') {
          bargeIn(session, 'user_started_speaking');
        }
      }, 150);
    }
  }
}

async function buildSystemPrompt(session: ConversationSession): Promise<string> {
  const avatarConfig = await getAvatarById(session.avatarId);
  if (!avatarConfig) return 'You are a helpful AI assistant.';

  const basePersonality = await getAvatarSystemPrompt(session.avatarId) || avatarConfig.personalityPrompt;
  const currentDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  let prompt = basePersonality.replace(/- Today's date:.*/, `- Today's date: ${currentDate}`)
    .replace(/⚠️ CRITICAL SYSTEM CONFIGURATION:/, `⚠️ CRITICAL SYSTEM CONFIGURATION:\n- Today's date: ${currentDate}`);

  if (session.memoryEnabled && memoryService.isAvailable()) {
    prompt = `
🚫 ABSOLUTE RULE - NEVER DENY MEMORY CAPABILITY:
You have a real, working long-term memory system. NEVER say "I don't have memory between conversations" or similar.
NEVER explain or apologize about memory limitations. You HAVE memory - use it or acknowledge it's building.

` + prompt;
  }

  prompt += `

💚 CRITICAL BEHAVIOR RULE - ALWAYS POLITE AND WARM:
You MUST maintain a consistently warm, polite, patient, and respectful tone throughout the ENTIRE conversation.

🎙️ BARGE-IN BEHAVIOR:
If the user speaks while you are responding, immediately stop and listen. Do not apologize unless the user sounds annoyed.`;

  return prompt;
}

async function fetchContext(session: ConversationSession, message: string): Promise<{
  knowledgeContext: string;
  memoryContext: string;
}> {
  let knowledgeContext = '';
  let memoryContext = '';

  const cachedCtx = session.userId ? latencyCache.getSessionRagContext(session.userId, session.avatarId) : null;
  if (cachedCtx) {
    knowledgeContext = cachedCtx.knowledgeContext || '';
    memoryContext = cachedCtx.memoryContext || '';
    if (cachedCtx.conversationHistory?.length) {
      session.conversationHistory = cachedCtx.conversationHistory;
    }
  } else {
    const avatarConfig = await getAvatarById(session.avatarId);
    const [memResult, ragResult, histResult] = await Promise.allSettled([
      (async () => {
        if (!session.memoryEnabled || !session.userId || !memoryService.isAvailable()) return null;
        return memoryService.searchMemories(message, session.userId, { limit: 5 });
      })(),
      (async () => {
        const { pineconeNamespaceService } = await import('./pineconeNamespaceService.js');
        if (!pineconeNamespaceService.isAvailable() || !avatarConfig?.pineconeNamespaces?.length) return [];
        return pineconeNamespaceService.retrieveContext(message, 8, avatarConfig.pineconeNamespaces);
      })(),
      (async () => {
        if (!session.userId) return [];
        const records = await storage.getConversationHistory(session.userId, session.avatarId, 6);
        return records.map(conv => ({ message: conv.text, isUser: conv.role === 'user' }));
      })()
    ]);

    if (memResult.status === 'fulfilled' && memResult.value?.memories?.length) {
      memoryContext = '\n\nRELEVANT MEMORIES FROM PREVIOUS CONVERSATIONS:\n' +
        memResult.value.memories.map((m: any) => `- ${m.content}`).join('\n');
    }
    if (ragResult.status === 'fulfilled' && ragResult.value?.length) {
      const ragResults = ragResult.value as Array<{ text: string; score: number; metadata: { namespace: string; [key: string]: any } }>;
      knowledgeContext = ragResults
        .map((r, i) => `[Result ${i + 1} from ${r.metadata.namespace}]\n${r.text}`)
        .join('\n\n---\n\n');
    }
    if (histResult.status === 'fulfilled' && histResult.value?.length) {
      session.conversationHistory = histResult.value as Array<{ message: string; isUser: boolean }>;
    }
  }

  if (session.userId) {
    const avatarConfig = await getAvatarById(session.avatarId);
    (async () => {
      try {
        const { pineconeNamespaceService } = await import('./pineconeNamespaceService.js');
        const namespaces = avatarConfig?.pineconeNamespaces || [];
        const [newMem, newRag, newHist] = await Promise.allSettled([
          (async () => {
            if (!session.memoryEnabled || !session.userId || !memoryService.isAvailable()) return { memories: [] };
            return memoryService.searchMemories(message, session.userId, { limit: 5 });
          })(),
          (async () => {
            if (!pineconeNamespaceService.isAvailable() || !namespaces.length) return null;
            const results = await pineconeNamespaceService.retrieveContext(message, 8, namespaces);
            return results.length > 0 ? results : null;
          })(),
          (async () => {
            if (!session.userId) return [];
            const records = await storage.getConversationHistory(session.userId, session.avatarId, 6);
            return records.map((conv: any) => ({ message: conv.text, isUser: conv.role === 'user' }));
          })()
        ]);

        let newMemCtx = '';
        if (newMem.status === 'fulfilled' && (newMem.value as any)?.memories?.length) {
          newMemCtx = '\n\nRELEVANT MEMORIES:\n' + (newMem.value as any).memories.map((m: any) => `- ${m.content}`).join('\n');
        }
        let newKnowledgeCtx = '';
        if (newRag.status === 'fulfilled' && newRag.value) {
          const ragResults = newRag.value as Array<{ text: string; score: number; metadata: { namespace: string; [key: string]: any } }>;
          newKnowledgeCtx = ragResults
            .map((r, i) => `[Result ${i + 1} from ${r.metadata.namespace}]\n${r.text}`)
            .join('\n\n---\n\n');
        }
        const newConvHist = newHist.status === 'fulfilled' ? newHist.value as Array<{ message: string; isUser: boolean }> : [];

        latencyCache.setSessionRagContext(session.userId!, session.avatarId, {
          knowledgeContext: newKnowledgeCtx,
          memoryContext: newMemCtx,
          conversationHistory: newConvHist,
          lastQuery: message
        });
      } catch (e) {
        log.error({ error: e }, 'Background RAG fetch failed');
      }
    })();
  }

  return { knowledgeContext, memoryContext };
}

const TTS_CHUNK_INTERVAL_MS = 200;
const TTS_MIN_CHUNK_BYTES = 4800;

async function speakSentence(session: ConversationSession, text: string, myTurn: number): Promise<void> {
  const abort = new AbortController();
  session.active.ttsAbort = abort;

  try {
    if (session.audioOnly) {
      const pendingChunks: Buffer[] = [];
      let pendingBytes = 0;
      let lastFlush = Date.now();

      const flush = () => {
        if (pendingChunks.length > 0 && session.turnId === myTurn && !abort.signal.aborted) {
          const batch = Buffer.concat(pendingChunks);
          pendingChunks.length = 0;
          pendingBytes = 0;
          sendTtsBinary(session.ws, myTurn, batch);
        }
        lastFlush = Date.now();
      };

      for await (const chunk of elevenlabsService.streamSpeechPCM(text, session.voiceId, session.languageCode, abort.signal)) {
        if (session.turnId !== myTurn || abort.signal.aborted) break;
        pendingChunks.push(chunk);
        pendingBytes += chunk.length;

        const elapsed = Date.now() - lastFlush;
        if (elapsed >= TTS_CHUNK_INTERVAL_MS && pendingBytes >= TTS_MIN_CHUNK_BYTES) {
          flush();
        }
      }

      flush();
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of elevenlabsService.streamSpeechPCM(text, session.voiceId, session.languageCode, abort.signal)) {
        if (session.turnId !== myTurn || abort.signal.aborted) break;
        chunks.push(chunk);
      }
      if (chunks.length > 0 && session.turnId === myTurn && !abort.signal.aborted) {
        const fullSentenceAudio = Buffer.concat(chunks);
        sendTtsBinary(session.ws, myTurn, fullSentenceAudio);
      }
    }
  } catch (e: any) {
    if (e.name !== 'AbortError') {
      log.error({ error: e.message, sessionId: session.sessionId }, 'TTS streaming error');
    }
  } finally {
    if (session.active.ttsAbort === abort) {
      session.active.ttsAbort = null;
    }
  }
}

function enqueueTts(session: ConversationSession, sentence: string, myTurn: number): void {
  session.active.ttsQueue.push({ sentence, turnId: myTurn });
  if (!session.active.playing) consumeTtsQueue(session);
}

async function consumeTtsQueue(session: ConversationSession): Promise<void> {
  session.active.playing = true;
  try {
    while (session.active.ttsQueue.length) {
      const item = session.active.ttsQueue.shift();
      if (!item) continue;
      if (item.turnId !== session.turnId) continue;
      await speakSentence(session, item.sentence, item.turnId);
      if (item.turnId !== session.turnId) break;
    }
  } finally {
    session.active.playing = false;
  }
}

function popCompleteSentences(buffer: string): { complete: string[]; remaining: string } {
  const re = /([^\r\n.!?]*[.!?]+)(\s+|$)/g;
  let match;
  const complete: string[] = [];
  let lastIndex = 0;

  while ((match = re.exec(buffer)) !== null) {
    const sentence = match[1].trim();
    if (sentence.length >= 5) {
      complete.push(sentence);
    }
    lastIndex = re.lastIndex;
  }

  return { complete, remaining: buffer.slice(lastIndex) };
}

async function runTurn(session: ConversationSession, userMessage: string): Promise<void> {
  const myTurn = session.turnId;

  if (session.userId) {
    const rateCheck = checkChatRateLimit(session.userId);
    if (!rateCheck.allowed) {
      sendJSON(session.ws, { type: 'ERROR', message: 'Daily message limit reached. Please try again tomorrow.' });
      log.warn({ sessionId: session.sessionId, userId: session.userId }, 'Daily chat rate limit exceeded on WebSocket');
      return;
    }
  }

  session.state = 'THINKING';
  clearIdleTimers(session);
  sendJSON(session.ws, { type: 'TURN_START', turnId: myTurn });

  log.info({ sessionId: session.sessionId, turnId: myTurn, message: userMessage.substring(0, 80) }, 'Starting turn');

  try {
    const [ctxResult] = await Promise.all([
      fetchContext(session, userMessage),
      !session.systemPrompt ? buildSystemPrompt(session).then(p => { session.systemPrompt = p; }) : Promise.resolve(),
    ]);
    if (session.turnId !== myTurn) return;

    const { knowledgeContext, memoryContext } = ctxResult;

    let enhancedPrompt = session.systemPrompt;
    if (memoryContext) {
      enhancedPrompt += `\n${memoryContext}\nUse these memories naturally.`;
    }

    const llmAbort = new AbortController();
    session.active.llmAbort = llmAbort;

    session.state = 'SPEAKING';
    let buffer = '';
    let fullResponse = '';

    const streamGen = claudeService.streamResponse(
      userMessage,
      knowledgeContext,
      session.conversationHistory.slice(-4),
      enhancedPrompt,
      undefined,
      undefined,
      true,
      true
    );

    for await (const event of streamGen) {
      if (session.turnId !== myTurn || llmAbort.signal.aborted) break;

      if (event.type === 'text') {
        buffer += event.content;
        fullResponse += event.content;

        const { complete, remaining } = popCompleteSentences(buffer);
        buffer = remaining;

        for (const sentence of complete) {
          if (session.turnId !== myTurn) break;
          enqueueTts(session, sentence, myTurn);
        }
      }
    }

    if (buffer.trim() && session.turnId === myTurn) {
      enqueueTts(session, buffer.trim(), myTurn);
    }

    while (session.active.playing && session.turnId === myTurn) {
      await new Promise(r => setTimeout(r, 50));
    }

    if (session.turnId === myTurn) {
      sendJSON(session.ws, { type: 'TURN_END', turnId: myTurn });
      session.state = 'LISTENING';
      resetIdleTimers(session);

      if (session.userId && fullResponse) {
        storage.saveConversation({ userId: session.userId, avatarId: session.avatarId, role: 'user', text: userMessage }).catch(() => {});
        storage.saveConversation({ userId: session.userId, avatarId: session.avatarId, role: 'assistant', text: fullResponse }).catch(() => {});

        session.conversationHistory.push({ message: userMessage, isUser: true });
        session.conversationHistory.push({ message: fullResponse, isUser: false });
        if (session.conversationHistory.length > 12) {
          session.conversationHistory = session.conversationHistory.slice(-12);
        }

        if (session.memoryEnabled && memoryService.isAvailable()) {
          memoryService.addMemory(
            `User asked: "${userMessage}"\nAssistant responded: "${fullResponse}"`,
            session.userId,
            MemoryType.NOTE,
            { avatarId: session.avatarId, audioOnly: true }
          ).catch(() => {});
        }
      }
    }
  } catch (e: any) {
    if (e.name !== 'AbortError') {
      log.error({ error: e.message, sessionId: session.sessionId }, 'Error in turn');
    }
  } finally {
    if (session.active.llmAbort?.signal.aborted === false) {
      session.active.llmAbort = null;
    }
  }
}

async function startSttStream(session: ConversationSession): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY not configured');
  }

  const queryParams = new URLSearchParams({
    model_id: 'scribe_v2_realtime',
    language_code: session.languageCode?.split('-')[0] || 'en',
    sample_rate: session.sampleRate.toString(),
    audio_format: `pcm_${session.sampleRate}`,
    commit_strategy: 'vad',
    vad_silence_threshold_secs: '1.5',
    vad_threshold: '0.35',
    min_speech_duration_ms: '300',
    min_silence_duration_ms: '800',
  });

  const sttUrl = `${ELEVENLABS_STT_URL}?${queryParams.toString()}`;
  log.info({ sessionId: session.sessionId, sttUrl }, 'Connecting to ElevenLabs STT');

  const sttWs = new WebSocket(sttUrl, {
    headers: { 'xi-api-key': apiKey },
  });

  session.sttWs = sttWs;

  sttWs.on('open', () => {
    log.info({ sessionId: session.sessionId }, 'ElevenLabs STT connected');
    session.sttReady = true;

    session.keepaliveInterval = setInterval(() => {
      if (sttWs.readyState === WebSocket.OPEN) {
        sttWs.send(JSON.stringify({ type: 'ping' }));
      }
    }, 5000);

    sendJSON(session.ws, { type: 'STT_READY' });
  });

  sttWs.on('message', async (data: Buffer) => {
    try {
      const event = JSON.parse(data.toString());
      const msgType = event.type || event.message_type;

      if (session.state === 'LISTENING') {
        resetIdleTimers(session);
      }

      if (msgType === 'partial_transcript' || msgType === 'transcript') {
        const isFinal = event.speech_final === true || event.is_final === true;
        const text = (event.text || '').trim();

        if (isFinal && text) {
          sendJSON(session.ws, { type: 'STT_FINAL', text });
          log.info({ sessionId: session.sessionId, text: text.substring(0, 80) }, 'Final transcript');

          if (session.bargeTimer) {
            clearTimeout(session.bargeTimer);
            session.bargeTimer = null;
          }

          if (session.state === 'SPEAKING') {
            bargeIn(session, 'user_started_speaking');
          }

          session.accumulatedTranscript += (session.accumulatedTranscript ? ' ' : '') + text;

          if (session.state === 'THINKING') {
            log.info({ sessionId: session.sessionId, text: text.substring(0, 80) }, 'Queuing transcript while thinking');
            return;
          }

          const finalMessage = session.accumulatedTranscript;
          session.accumulatedTranscript = '';

          session.turnId += 1;
          await runTurn(session, finalMessage);

        } else if (!isFinal && text) {
          sendJSON(session.ws, {
            type: 'STT_PARTIAL',
            text,
            confidence: event.confidence ?? 1.0
          });

          maybeBargeInFromStt(session, {
            type: 'partial',
            text,
            confidence: event.confidence ?? 1.0
          });
        }
      } else if (msgType === 'committed_transcript' || msgType === 'committed_transcript_with_timestamps' || msgType === 'utterance_end') {
        const text = (event.text || event.transcript || '').trim();
        if (text) {
          sendJSON(session.ws, { type: 'STT_FINAL', text });
          log.info({ sessionId: session.sessionId, text: text.substring(0, 80) }, 'Committed transcript');

          if (session.bargeTimer) {
            clearTimeout(session.bargeTimer);
            session.bargeTimer = null;
          }

          if (session.state === 'SPEAKING') {
            bargeIn(session, 'user_started_speaking');
          }

          session.accumulatedTranscript += (session.accumulatedTranscript ? ' ' : '') + text;

          if (session.state === 'THINKING') {
            log.info({ sessionId: session.sessionId, text: text.substring(0, 80) }, 'Queuing transcript while thinking');
            return;
          }

          const finalMessage = session.accumulatedTranscript;
          session.accumulatedTranscript = '';

          session.turnId += 1;
          await runTurn(session, finalMessage);
        }
      } else if (msgType === 'vad') {
        if (event.event === 'speech_start') {
          maybeBargeInFromStt(session, { type: 'vad', event: 'speech_start' });
        }
      } else if (msgType === 'session_started' || msgType === 'session_begin') {
        log.info({ sessionId: session.sessionId }, 'STT session confirmed started');
      }
    } catch (e: any) {
      log.error({ error: e.message, sessionId: session.sessionId }, 'Error processing STT message');
    }
  });

  sttWs.on('error', (error: Error) => {
    log.error({ error: error.message, sessionId: session.sessionId }, 'STT WebSocket error');
  });

  sttWs.on('close', () => {
    log.info({ sessionId: session.sessionId }, 'STT WebSocket closed');
    session.sttReady = false;
  });
}

function cleanupSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  if (session.bargeTimer) {
    clearTimeout(session.bargeTimer);
    session.bargeTimer = null;
  }

  clearIdleTimers(session);

  if (session.keepaliveInterval) {
    clearInterval(session.keepaliveInterval);
    session.keepaliveInterval = null;
  }

  if (session.active.llmAbort) {
    try { session.active.llmAbort.abort('session_ended'); } catch {}
  }
  if (session.active.ttsAbort) {
    try { session.active.ttsAbort.abort('session_ended'); } catch {}
  }
  session.active.ttsQueue.length = 0;

  if (session.sttWs?.readyState === WebSocket.OPEN) {
    session.sttWs.close();
  }

  activeSessions.delete(sessionId);
  log.info({ sessionId }, 'Conversation session cleaned up');
}

export function initConversationWsServer(wss: WebSocketServer): void {
  wss.on('connection', async (ws: WebSocket, request: any) => {
    const sessionId = `conv_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    log.info({ sessionId }, 'New conversation WebSocket connection');

    const urlParams = new URL(request.url || '', `http://${request.headers.host}`).searchParams;
    const urlAdminSecret = urlParams.get('admin_secret');
    const urlMemberId = urlParams.get('member_id');

    ws.on('message', async (data: Buffer | string) => {
      try {
        if (typeof data === 'string' || (data instanceof Buffer && data[0] === 0x7b)) {
          const message = JSON.parse(data.toString());
          if (!message.adminSecret && urlAdminSecret) message.adminSecret = urlAdminSecret;
          if (!message.memberstackId && urlMemberId) message.memberstackId = urlMemberId;
          await handleControlMessage(ws, sessionId, message);
        } else {
          handleAudioData(sessionId, data as Buffer);
        }
      } catch (error: any) {
        log.error({ sessionId, error: error.message }, 'Error processing message');
      }
    });

    ws.on('close', () => {
      cleanupSession(sessionId);
    });

    ws.on('error', (error: Error) => {
      log.error({ sessionId, error: error.message }, 'WebSocket error');
      cleanupSession(sessionId);
    });
  });

  log.info('Conversation WebSocket server initialized');
}

async function handleControlMessage(ws: WebSocket, sessionId: string, message: any): Promise<void> {
  switch (message.type) {
    case 'START_SESSION': {
      const {
        avatarId = 'mark-kohl',
        userId = null,
        memoryEnabled = false,
        sampleRate = 16000,
        languageCode,
        audioOnly = false,
        adminSecret = null,
        memberstackId = null,
      } = message;

      const hasAdminAccess = adminSecret && isValidAdminSecret(adminSecret);
      const hasMemberstack = !!memberstackId;
      const hasRealUser = userId && !userId.startsWith('webflow_') && !userId.startsWith('temp_');

      if (!hasAdminAccess && !hasMemberstack && !hasRealUser) {
        sendJSON(ws, { type: 'ERROR', message: 'Authentication required to chat with avatars.' });
        ws.close();
        log.warn({ sessionId, userId }, 'Anonymous user blocked from conversation WebSocket');
        return;
      }

      const effectiveUserId = hasMemberstack ? `ms_${memberstackId}` : userId;
      const effectiveMemoryEnabled = hasMemberstack ? true : memoryEnabled;

      const avatarConfig = await getAvatarById(avatarId);
      if (!avatarConfig) {
        sendJSON(ws, { type: 'ERROR', message: 'Avatar not found' });
        return;
      }

      const voiceId = avatarConfig.audioOnlyVoiceId || avatarConfig.elevenlabsVoiceId;
      if (!voiceId) {
        sendJSON(ws, { type: 'ERROR', message: 'Avatar not configured for audio' });
        return;
      }

      const session: ConversationSession = {
        ws,
        sessionId,
        state: 'IDLE',
        turnId: 0,
        active: {
          llmAbort: null,
          ttsAbort: null,
          ttsQueue: [],
          playing: false,
        },
        bargeTimer: null,
        idleTimer1: null,
        idleTimer2: null,
        idleTimer3: null,
        sttWs: null,
        sttReady: false,
        keepaliveInterval: null,
        avatarId,
        userId: effectiveUserId,
        voiceId,
        languageCode: languageCode || avatarConfig.elevenLabsLanguageCode || undefined,
        systemPrompt: '',
        memoryEnabled: effectiveMemoryEnabled,
        sampleRate,
        audioOnly: !!audioOnly,
        conversationHistory: [],
        accumulatedTranscript: '',
      };

      activeSessions.set(sessionId, session);

      if (effectiveUserId) {
        sessionManager.updateActivityByUserId(effectiveUserId);
      }

      try {
        await startSttStream(session);
        session.state = 'LISTENING';
        resetIdleTimers(session);
        sendJSON(ws, {
          type: 'SESSION_STARTED',
          sessionId,
          avatarId,
          turnId: session.turnId,
        });
      } catch (e: any) {
        log.error({ error: e.message, sessionId }, 'Failed to start STT');
        sendJSON(ws, { type: 'ERROR', message: 'Failed to start speech recognition' });
        cleanupSession(sessionId);
      }
      break;
    }

    case 'END_SESSION': {
      cleanupSession(sessionId);
      sendJSON(ws, { type: 'SESSION_ENDED' });
      break;
    }

    case 'SEND_TEXT': {
      const session = activeSessions.get(sessionId);
      if (!session) return;
      const text = message.text?.trim();
      if (!text) return;

      if (session.state === 'SPEAKING' || session.state === 'THINKING') {
        bargeIn(session, 'text_input');
      }
      session.turnId += 1;
      await runTurn(session, text);
      break;
    }

    case 'CLIENT_EVENT': {
      if (message.name === 'PING') {
        sendJSON(ws, { type: 'PONG' });
      }
      break;
    }

    default:
      log.debug({ sessionId, type: message.type }, 'Unknown message type');
  }
}

function handleAudioData(sessionId: string, audioData: Buffer): void {
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
