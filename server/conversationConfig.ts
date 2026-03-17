export interface ConversationConfig {
  interruption: {
    minVoiceMs: number;
    vadThreshold: number;
    sttPartialCanTrigger: boolean;
    stopTtsGraceMs: number;
  };
  listening: {
    minUtteranceMs: number;
    endOfTurnHoldMs: number;
    slowSpeakerHoldMs: number;
  };
  speaking: {
    chunkBySentence: boolean;
    maxSentencesPerChunk: number;
    interChunkGapMs: number;
  };
  inactivity: {
    postSpeechIdleMs: number;
    firstReengageMs: number;
    secondReengageMs: number;
    closingStartMs: number;
    sessionEndMs: number;
  };
  closing: {
    postClosingDelayMs: number;
  };
  latency: {
    thinkingAckMs: number;
  };
}

export const DEFAULT_CONFIG: ConversationConfig = {
  interruption: {
    minVoiceMs: 180,
    vadThreshold: 0.6,
    sttPartialCanTrigger: true,
    stopTtsGraceMs: 50,
  },
  listening: {
    minUtteranceMs: 350,
    endOfTurnHoldMs: 800,
    slowSpeakerHoldMs: 1200,
  },
  speaking: {
    chunkBySentence: true,
    maxSentencesPerChunk: 2,
    interChunkGapMs: 80,
  },
  inactivity: {
    postSpeechIdleMs: 3_000,
    firstReengageMs: 10_000,
    secondReengageMs: 22_000,
    closingStartMs: 30_000,
    sessionEndMs: 50_000,
  },
  closing: {
    postClosingDelayMs: 900,
  },
  latency: {
    thinkingAckMs: 1_800,
  },
};

export const RE_ENGAGE_PHRASES_1 = [
  "I'm here. Go on.",
  "Take your time.",
  "No rush — what's on your mind?",
  "Alright. Where do you want to start?",
];

export const RE_ENGAGE_PHRASES_2 = [
  "Still with me?",
  "Want the short version or the real one?",
  "If you're stuck, give me one sentence and we'll work from there.",
  "We can do this in tiny steps. What's step one?",
];

export const WARM_CLOSING_PHRASES = [
  "Alright — I'll pause. Tap me when you want to carry on.",
  "Okay. I'll be quiet for now. Come back when you're ready.",
  "No pressure. I'm here when you want to pick this up again.",
  "Got it. I'll stop talking. You restart whenever.",
];

export const THINKING_FILLER_PHRASES = [
  "Let me think...",
  "Okay...",
  "Hmm, let me consider that...",
  "One moment...",
  "Good question...",
];
