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
    postSpeechIdleMs: 8_000,
    firstReengageMs: 35_000,
    secondReengageMs: 55_000,
    closingStartMs: 75_000,
    sessionEndMs: 120_000,
  },
  closing: {
    postClosingDelayMs: 900,
  },
  latency: {
    thinkingAckMs: 1_800,
  },
};

export const RE_ENGAGE_PHRASES_1 = [
  "I'm still here whenever you're ready.",
  "Take your time — no rush.",
  "Just let me know when you want to keep going.",
  "I'll be right here.",
];

export const RE_ENGAGE_PHRASES_2 = [
  "Still there? No worries if you need a minute.",
  "Whenever you're ready — I'm not going anywhere.",
  "Just checking in. Take all the time you need.",
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

export const VIDEO_OFFER_PHRASES = [
  "By the way — if you ever want me to make you a short video on what we're talking about, just say the word. I can create one for you in a few minutes.",
  "Oh, one thing — I can actually create videos for you on any topic we discuss. Just ask me to make a video and I'll put one together. They usually take a couple minutes.",
  "Quick heads up — if anything we talk about clicks and you want a video on it, just tell me. I can make you a personalized video and you'll find it in your My Videos section.",
];
