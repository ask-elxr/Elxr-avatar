interface EndChatIntentResult {
  isEndChatRequest: boolean;
  confidence: number;
  farewellType: 'goodbye' | 'done' | 'thanks' | 'stop' | 'leave' | null;
}

const END_CHAT_PATTERNS = [
  // Direct goodbye phrases
  { pattern: /\b(?:goodbye|good\s*bye|bye\s*bye|bye|byeee+|buh-bye)\b/i, type: 'goodbye' as const, confidence: 0.95 },
  { pattern: /\b(?:see\s+you|see\s+ya|catch\s+you)\s*(?:later|soon|around|next\s+time)?\b/i, type: 'goodbye' as const, confidence: 0.90 },
  { pattern: /\b(?:take\s+care|have\s+a\s+(?:good|great|nice)\s+(?:one|day|night))\b/i, type: 'goodbye' as const, confidence: 0.90 },
  { pattern: /\b(?:gotta\s+go|got\s+to\s+go|have\s+to\s+go|need\s+to\s+go|i'?m\s+(?:gonna|going\s+to)\s+go)\b/i, type: 'leave' as const, confidence: 0.90 },
  { pattern: /\b(?:i'?m\s+(?:off|out|leaving|heading\s+out|signing\s+off|logging\s+off))\b/i, type: 'leave' as const, confidence: 0.90 },
  { pattern: /\b(?:later|laterz|laters|ciao|adios|sayonara|au\s+revoir|peace\s+out|peace)\b/i, type: 'goodbye' as const, confidence: 0.85 },
  
  // Done/finished phrases
  { pattern: /\b(?:i'?m\s+done|we'?re\s+done|that'?s\s+all|all\s+done)\b/i, type: 'done' as const, confidence: 0.95 },
  { pattern: /\b(?:i'?m\s+finished|we'?re\s+finished|i'?m\s+good|we'?re\s+good)\s*(?:for\s+now|here|with\s+this)?\b/i, type: 'done' as const, confidence: 0.90 },
  { pattern: /\b(?:that'?s\s+(?:it|everything)|nothing\s+(?:else|more)|no\s+more\s+questions?)\b/i, type: 'done' as const, confidence: 0.85 },
  { pattern: /\b(?:i\s+(?:don'?t\s+)?have\s+(?:any\s+)?(?:no\s+)?(?:more|other)\s+questions?)\b/i, type: 'done' as const, confidence: 0.85 },
  { pattern: /\b(?:that\s+(?:will\s+be|was)\s+all|that\s+(?:covers|answered)\s+(?:it|everything))\b/i, type: 'done' as const, confidence: 0.85 },
  
  // Thank you + goodbye combinations
  { pattern: /\b(?:thanks?\s+(?:and\s+)?(?:goodbye|bye|see\s+you|take\s+care))\b/i, type: 'thanks' as const, confidence: 0.95 },
  { pattern: /\b(?:thank\s+you\s+(?:so\s+much\s+)?(?:and\s+)?(?:goodbye|bye|see\s+you|take\s+care|for\s+(?:your|the)\s+(?:help|time|chat)))\b/i, type: 'thanks' as const, confidence: 0.95 },
  { pattern: /\b(?:thanks?\s+for\s+(?:your|the)\s+(?:help|time|chat|assistance|info|information|advice))\s*[.!]?\s*$/i, type: 'thanks' as const, confidence: 0.85 },
  { pattern: /\b(?:appreciate\s+(?:it|your\s+(?:help|time))|you'?ve\s+been\s+(?:great|helpful|a\s+(?:great|big)\s+help))\s*[.!]?\s*$/i, type: 'thanks' as const, confidence: 0.80 },
  
  // Stop/end session phrases
  { pattern: /\b(?:end\s+(?:the\s+)?(?:chat|session|conversation|call|this))\b/i, type: 'stop' as const, confidence: 0.98 },
  { pattern: /\b(?:stop\s+(?:the\s+)?(?:chat|session|conversation|call|this|talking))\b/i, type: 'stop' as const, confidence: 0.98 },
  { pattern: /\b(?:close\s+(?:the\s+)?(?:chat|session|conversation|this))\b/i, type: 'stop' as const, confidence: 0.98 },
  { pattern: /\b(?:disconnect|log\s*out|sign\s*out|exit|quit)\b/i, type: 'stop' as const, confidence: 0.95 },
  { pattern: /\b(?:let'?s\s+(?:end|stop|wrap\s+up|finish)\s+(?:this|here|the\s+(?:chat|session|conversation)))\b/i, type: 'stop' as const, confidence: 0.95 },
  
  // Casual endings
  { pattern: /\b(?:ok\s+)?(?:that'?s\s+)?(?:all\s+)?(?:i\s+)?(?:needed|wanted)\s*(?:to\s+know)?\s*[.!]?\s*$/i, type: 'done' as const, confidence: 0.75 },
  { pattern: /\b(?:perfect|great|awesome|wonderful|excellent)[,.]?\s*(?:thanks?|thank\s+you)?\s*[.!]?\s*$/i, type: 'done' as const, confidence: 0.70 },
];

const NEGATIVE_INDICATORS = [
  /\b(?:don'?t|do\s+not)\s+(?:end|stop|close|leave|go)\b/i,
  /\b(?:wait|hold\s+on|one\s+more|another\s+question|before\s+(?:you|i)\s+go)\b/i,
  /\b(?:actually|but\s+first|oh\s+wait|hmm)\b/i,
  /\?$/,
];

const FAREWELL_RESPONSES: Record<string, string[]> = {
  goodbye: [
    "Goodbye! It was great chatting with you. Take care!",
    "Bye for now! Feel free to come back anytime you need help.",
    "See you later! Have a wonderful day!",
    "Goodbye! I enjoyed our conversation. Take care of yourself!",
  ],
  done: [
    "Glad I could help! If you have any more questions, I'm here anytime.",
    "Perfect! Feel free to come back whenever you need assistance.",
    "Great! Don't hesitate to reach out if you need anything else.",
    "Wonderful! I'm always here if you need more help in the future.",
  ],
  thanks: [
    "You're very welcome! It was my pleasure helping you. Take care!",
    "Happy to help! Come back anytime. Have a great day!",
    "Anytime! I'm always here when you need me. Take care!",
    "My pleasure! Feel free to chat again whenever you'd like.",
  ],
  stop: [
    "Session ended. Thank you for chatting! Come back anytime.",
    "Ending our session now. It was nice talking with you!",
    "Session closed. Take care and feel free to return anytime!",
  ],
  leave: [
    "No problem! Take care and come back anytime!",
    "Sure thing! Have a great rest of your day!",
    "Okay! It was nice chatting. See you next time!",
  ],
};

export function detectEndChatIntent(message: string): EndChatIntentResult {
  const normalizedMessage = message.toLowerCase().trim();
  
  for (const negativePattern of NEGATIVE_INDICATORS) {
    if (negativePattern.test(normalizedMessage)) {
      return {
        isEndChatRequest: false,
        confidence: 0.9,
        farewellType: null,
      };
    }
  }
  
  for (const { pattern, type, confidence } of END_CHAT_PATTERNS) {
    if (pattern.test(normalizedMessage)) {
      const messageLength = normalizedMessage.replace(/[^\w\s]/g, '').trim().split(/\s+/).length;
      const adjustedConfidence = messageLength <= 5 ? confidence : confidence * 0.85;
      
      return {
        isEndChatRequest: true,
        confidence: adjustedConfidence,
        farewellType: type,
      };
    }
  }
  
  return {
    isEndChatRequest: false,
    confidence: 0,
    farewellType: null,
  };
}

export function getFarewellResponse(farewellType: string | null, avatarName?: string): string {
  const type = farewellType || 'goodbye';
  const responses = FAREWELL_RESPONSES[type] || FAREWELL_RESPONSES.goodbye;
  return responses[Math.floor(Math.random() * responses.length)];
}

export function isDefiniteEndChat(message: string): boolean {
  const result = detectEndChatIntent(message);
  return result.isEndChatRequest && result.confidence >= 0.85;
}
