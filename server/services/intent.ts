import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

interface VideoIntentResult {
  isVideoRequest: boolean;
  topic: string | null;
  confidence: number;
}

// Track pending video confirmations per user
interface PendingVideoConfirmation {
  topic: string;
  originalMessage: string;
  avatarId: string;
  timestamp: number;
  imageBase64?: string;
  imageMimeType?: string;
}

const pendingVideoConfirmations = new Map<string, PendingVideoConfirmation>();

// Confirmation patterns - more lenient to catch spoken variations
const CONFIRMATION_PATTERNS = [
  // Exact matches
  /^(?:yes|yeah|yep|yup|sure|ok|okay|confirm|do it|go ahead|please|definitely|absolutely|yes please|go for it)$/i,
  // Starting with confirmation word
  /^(?:yes|yeah|yep|yup|sure|ok|okay),?\s/i,
  // With please or let's do it
  /^(?:yes|yeah|yep|yup|sure|ok|okay),?\s*(?:please|do it|go ahead|that sounds good|let's do it)/i,
  // Affirmative phrases
  /^(?:that's|thats)\s+(?:right|correct|good|perfect|great)/i,
  /^(?:sounds good|perfect|great|awesome|cool)/i,
  /^(?:make|create|generate)\s+(?:it|the video)/i,
  // Contains strong confirmation (for noisy STT)
  /\b(?:yes|yeah|yep|yup|do it|go ahead|make the video|create the video|confirm|let's go|go for it)\b/i,
  // Very short messages that are likely confirmations
  /^(?:y|ya|ye|yea|uh huh|mm hmm|mhm)$/i,
];

const REJECTION_PATTERNS = [
  /^(?:no|nope|nah|cancel|never mind|nevermind|stop|don't|dont|not now|maybe later|wait)$/i,
  /^(?:actually|wait),?\s*(?:no|never mind|cancel|stop)/i,
  /^(?:hold on|wait a minute|wait a sec)/i,
];

export function setPendingVideoConfirmation(
  userId: string, 
  topic: string, 
  originalMessage: string, 
  avatarId: string,
  imageBase64?: string,
  imageMimeType?: string
): void {
  pendingVideoConfirmations.set(userId, {
    topic,
    originalMessage,
    avatarId,
    timestamp: Date.now(),
    imageBase64,
    imageMimeType,
  });
  
  // Auto-expire after 2 minutes
  setTimeout(() => {
    const pending = pendingVideoConfirmations.get(userId);
    if (pending && pending.timestamp === Date.now()) {
      pendingVideoConfirmations.delete(userId);
    }
  }, 120000);
}

export function getPendingVideoConfirmation(userId: string): PendingVideoConfirmation | undefined {
  const pending = pendingVideoConfirmations.get(userId);
  if (pending) {
    // Check if still valid (within 2 minutes)
    if (Date.now() - pending.timestamp < 120000) {
      return pending;
    } else {
      pendingVideoConfirmations.delete(userId);
    }
  }
  return undefined;
}

export function clearPendingVideoConfirmation(userId: string): void {
  pendingVideoConfirmations.delete(userId);
}

export function isVideoConfirmation(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return CONFIRMATION_PATTERNS.some(pattern => pattern.test(normalized));
}

export function isVideoRejection(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return REJECTION_PATTERNS.some(pattern => pattern.test(normalized));
}

export function generateConfirmationPrompt(topic: string, avatarName: string): string {
  const prompts = [
    `Just to confirm - would you like me to create a video about "${topic}"? Say "yes" when you're ready, or tell me more about what you'd like in the video.`,
    `I can create a video about "${topic}" for you. Does that sound right? Say "yes" to start, or feel free to add more details about what you'd like covered.`,
    `So you'd like a video about "${topic}"? Let me know if that's correct by saying "yes", or tell me more about what you want in the video.`,
  ];
  return prompts[Math.floor(Math.random() * prompts.length)];
}

export function generateRejectionResponse(): string {
  const responses = [
    "No problem! Let me know if you'd like a video later. What else can I help you with?",
    "Okay, I'll hold off on the video. Feel free to ask anytime. What else would you like to discuss?",
    "Got it, no video for now. What would you like to talk about instead?",
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

// Comprehensive video request patterns organized by category
const VIDEO_REQUEST_PATTERNS = [
  // === DIRECT ACTION VERBS ===
  // Basic create/make patterns
  /\b(?:make|create|generate|produce|build|craft|compose|prepare|develop|construct)\s+(?:me\s+)?(?:a\s+)?(?:quick\s+)?(?:short\s+)?(?:brief\s+)?video\b/i,
  /\b(?:send|show|give|provide|deliver|get|fetch|grab)\s+(?:me\s+)?(?:a\s+)?video\b/i,
  /\bvideo\s+(?:for|to)\s+(?:me|us)\b/i,

  // Record/film patterns
  /\b(?:record|film|shoot|capture)\s+(?:me\s+)?(?:a\s+)?video\b/i,
  /\b(?:record|film|shoot)\s+(?:a\s+)?(?:quick\s+)?(?:video\s+)?(?:about|on|explaining|showing|demonstrating|covering)\b/i,

  // Put together/compile patterns
  /\b(?:put\s+together|compile|assemble|whip\s+up|throw\s+together|cook\s+up)\s+(?:a\s+)?video\b/i,

  // === DESIRE/WANT EXPRESSIONS ===
  // Want patterns
  /\b(?:i\s+)?want\s+(?:you\s+to\s+)?(?:make\s+)?(?:me\s+)?(?:a\s+)?video\b/i,
  /\b(?:i\s+)?want\s+(?:to\s+)?(?:see|watch|view|have|get)\s+(?:a\s+)?video\b/i,
  /\bwant\s+(?:a\s+)?video\s+(?:about|on|explaining|showing|of|for|regarding|covering)\b/i,

  // Need patterns
  /\b(?:i\s+)?need\s+(?:you\s+to\s+)?(?:make\s+)?(?:me\s+)?(?:a\s+)?video\b/i,
  /\b(?:i\s+)?need\s+(?:a\s+)?video\s+(?:about|on|explaining|showing|of|for|regarding|covering)\b/i,
  /\bneed\s+(?:to\s+)?(?:see|watch|view|have|get)\s+(?:a\s+)?video\b/i,

  // Would like patterns
  /\b(?:i\s+)?(?:would|'d)\s+(?:really\s+)?like\s+(?:you\s+to\s+)?(?:make\s+)?(?:a\s+)?video\b/i,
  /\b(?:i\s+)?(?:would|'d)\s+(?:really\s+)?like\s+(?:to\s+)?(?:see|watch|view|have|get)\s+(?:a\s+)?video\b/i,
  /\bi['']d\s+(?:really\s+)?(?:like|love|appreciate)\s+(?:a\s+)?video\b/i,

  // Love/appreciate patterns
  /\b(?:i\s+)?(?:would\s+)?love\s+(?:to\s+)?(?:see|watch|view|have|get)\s+(?:a\s+)?video\b/i,
  /\b(?:would\s+)?(?:really\s+)?appreciate\s+(?:a\s+)?video\b/i,
  /\blove\s+(?:a\s+)?video\s+(?:about|on|explaining|showing)\b/i,

  // === POLITE REQUEST FORMS ===
  // Can you patterns
  /\bcan\s+(?:you\s+)?(?:please\s+)?(?:make|create|produce|generate|record|prepare|send|give|show)\s+(?:me\s+)?(?:a\s+)?video\b/i,
  /\bcan\s+(?:you\s+)?(?:please\s+)?(?:put\s+together|whip\s+up)\s+(?:a\s+)?video\b/i,
  /\bcan\s+i\s+(?:get|have|see)\s+(?:a\s+)?video\b/i,

  // Could you patterns
  /\bcould\s+(?:you\s+)?(?:please\s+)?(?:make|create|produce|generate|record|prepare|send|give|show)\s+(?:me\s+)?(?:a\s+)?video\b/i,
  /\bcould\s+(?:you\s+)?(?:possibly\s+)?(?:put\s+together|whip\s+up)\s+(?:a\s+)?video\b/i,
  /\bcould\s+i\s+(?:get|have|see)\s+(?:a\s+)?video\b/i,

  // Would you patterns
  /\bwould\s+(?:you\s+)?(?:please\s+)?(?:make|create|produce|generate|record|prepare|send|give|show)\s+(?:me\s+)?(?:a\s+)?video\b/i,
  /\bwould\s+(?:you\s+)?(?:be\s+able\s+to\s+)?(?:mind\s+)?(?:making|creating|generating)\s+(?:a\s+)?video\b/i,
  /\bwould\s+it\s+be\s+possible\s+(?:to\s+)?(?:get|have|make|create)\s+(?:a\s+)?video\b/i,

  // Will you patterns
  /\bwill\s+you\s+(?:please\s+)?(?:make|create|produce|generate|record|prepare|send)\s+(?:me\s+)?(?:a\s+)?video\b/i,

  // Please patterns
  /\bplease\s+(?:make|create|produce|generate|record|prepare|send|give|show)\s+(?:me\s+)?(?:a\s+)?video\b/i,
  /\bplease\s+(?:put\s+together|whip\s+up)\s+(?:a\s+)?video\b/i,
  /\bvideo\s+please\b/i,

  // === QUESTION-BASED REQUESTS ===
  // Is it possible patterns
  /\bis\s+it\s+possible\s+(?:for\s+you\s+)?to\s+(?:make|create|generate|produce)\s+(?:a\s+)?video\b/i,
  /\bis\s+there\s+(?:any\s+)?(?:way|chance)\s+(?:you\s+could|to\s+get)\s+(?:a\s+)?video\b/i,

  // How about/what about patterns
  /\b(?:how|what)\s+about\s+(?:making|creating|a)\s+(?:a\s+)?video\b/i,

  // Any chance patterns
  /\bany\s+chance\s+(?:of\s+)?(?:getting|you\s+could\s+make)\s+(?:a\s+)?video\b/i,

  // === IMPERATIVE/DIRECT COMMANDS ===
  // Just/go ahead patterns
  /\bjust\s+(?:make|create|generate|produce|record|send)\s+(?:me\s+)?(?:a\s+)?video\b/i,
  /\bgo\s+ahead\s+and\s+(?:make|create|generate|produce|record)\s+(?:a\s+)?video\b/i,

  // Let's patterns
  /\blet['']?s\s+(?:make|create|do|have)\s+(?:a\s+)?video\b/i,

  // === INFORMAL/CASUAL EXPRESSIONS ===
  // Gimme/hook me up patterns
  /\b(?:gimme|gimmie|give\s+me)\s+(?:a\s+)?video\b/i,
  /\bhook\s+me\s+up\s+with\s+(?:a\s+)?video\b/i,
  /\b(?:drop|hit\s+me\s+with)\s+(?:a\s+)?video\b/i,
  /\bshoot\s+(?:me\s+)?(?:over\s+)?(?:a\s+)?video\b/i,
  /\bthrow\s+(?:me\s+)?(?:a\s+)?video\b/i,

  // Slang patterns
  /\b(?:yo|hey|bro),?\s+(?:make|create|get\s+me|send\s+me)\s+(?:a\s+)?video\b/i,

  // === VIDEO + TOPIC PATTERNS ===
  // Video about/on/explaining patterns
  /\bvideo\s+(?:about|on|explaining|showing|demonstrating|covering|regarding|discussing|teaching|that\s+explains|that\s+shows|that\s+covers|that\s+teaches)\b/i,
  /\bvideo\s+(?:for|to\s+help\s+with|to\s+explain|to\s+show|to\s+demonstrate|to\s+teach)\b/i,

  // Explaining/teaching video patterns
  /\b(?:an?\s+)?(?:explanatory|educational|tutorial|instructional|how-to)\s+video\b/i,
  /\bvideo\s+(?:tutorial|lesson|guide|walkthrough|explanation|overview)\b/i,

  // === ALTERNATIVE TERMS FOR VIDEO ===
  // Clip patterns
  /\b(?:make|create|generate|produce|send|give)\s+(?:me\s+)?(?:a\s+)?(?:video\s+)?clip\b/i,
  /\b(?:a\s+)?clip\s+(?:about|on|explaining|showing|demonstrating)\b/i,

  // Recording patterns
  /\b(?:make|create|send|give)\s+(?:me\s+)?(?:a\s+)?recording\s+(?:about|on|explaining|showing)\b/i,

  // Footage patterns
  /\b(?:some|a\s+bit\s+of)\s+(?:video\s+)?footage\s+(?:about|on|showing)\b/i,

  // === CONTEXTUAL/FOLLOW-UP PATTERNS ===
  // Also/and patterns
  /\b(?:also|and\s+also|plus|additionally)\s+(?:make|create|generate|send)\s+(?:me\s+)?(?:a\s+)?video\b/i,
  /\b(?:also|and)\s+(?:i\s+)?(?:want|need|would\s+like)\s+(?:a\s+)?video\b/i,

  // Actually/btw patterns
  /\b(?:actually|btw|by\s+the\s+way)\s+(?:can\s+you\s+)?(?:make|create|send)\s+(?:me\s+)?(?:a\s+)?video\b/i,

  // Oh and patterns
  /\boh\s+(?:and\s+)?(?:can\s+you\s+)?(?:make|create|send)\s+(?:me\s+)?(?:a\s+)?video\b/i,

  // One more thing patterns
  /\b(?:one\s+more\s+thing|before\s+i\s+forget)\s*[,:]?\s*(?:make|create|send)\s+(?:me\s+)?(?:a\s+)?video\b/i,

  // === CONDITIONAL REQUESTS ===
  // If you could patterns
  /\bif\s+(?:you\s+)?could\s+(?:please\s+)?(?:make|create|generate|send)\s+(?:me\s+)?(?:a\s+)?video\b/i,
  /\bif\s+possible\s*[,:]?\s*(?:make|create|generate|send)\s+(?:me\s+)?(?:a\s+)?video\b/i,

  // When you have time patterns
  /\bwhen\s+(?:you\s+)?(?:have|get)\s+(?:a\s+)?(?:chance|time|moment)\s*[,:]?\s*(?:make|create|generate|send)\s+(?:me\s+)?(?:a\s+)?video\b/i,

  // === REQUESTING FOR OTHERS ===
  // For my/for our patterns
  /\b(?:make|create|generate|produce)\s+(?:a\s+)?video\s+for\s+(?:my|our)\b/i,
  /\bvideo\s+for\s+(?:my|our)\s+(?:team|class|students|family|friends|boss|client|meeting|presentation|project)\b/i,

  // === SPECIFIC USE CASES ===
  // Save/keep/remember patterns
  /\b(?:i\s+)?want\s+(?:to\s+)?(?:save|keep|remember)\s+(?:this\s+)?(?:as\s+)?(?:a\s+)?video\b/i,
  /\b(?:make|create|turn)\s+(?:this|that)\s+into\s+(?:a\s+)?video\b/i,

  // Share patterns
  /\b(?:make|create)\s+(?:a\s+)?video\s+(?:that\s+)?(?:i\s+)?can\s+share\b/i,
  /\b(?:a\s+)?video\s+(?:to|that\s+i\s+can)\s+share\s+(?:with|on)\b/i,

  // Download/export patterns
  /\b(?:a\s+)?video\s+(?:i\s+)?can\s+(?:download|export|save)\b/i,

  // === SUMMARY/EXPLAINER REQUESTS ===
  // Summarize as video patterns
  /\b(?:summarize|recap|explain)\s+(?:this|that|it)\s+(?:in|as)\s+(?:a\s+)?video\b/i,
  /\bvideo\s+(?:summary|recap|overview|breakdown)\s+(?:of|about|on)\b/i,

  // Quick video patterns
  /\b(?:a\s+)?quick\s+video\s+(?:about|on|explaining|showing)\b/i,
  /\b(?:a\s+)?short\s+video\s+(?:about|on|explaining|showing)\b/i,
  /\b(?:a\s+)?brief\s+video\s+(?:about|on|explaining|showing)\b/i,

  // === LEARNING/EDUCATION FOCUSED ===
  // Teach me patterns
  /\b(?:teach|show)\s+me\s+(?:about\s+)?(?:this\s+)?(?:in|with|through|via)\s+(?:a\s+)?video\b/i,
  /\blearn\s+(?:about\s+)?(?:this\s+)?(?:through|from|via)\s+(?:a\s+)?video\b/i,

  // Help me understand patterns
  /\bhelp\s+(?:me\s+)?understand\s+(?:this\s+)?(?:with|through|via)\s+(?:a\s+)?video\b/i,

  // === VISUAL/DEMO FOCUSED ===
  // Show me visually patterns
  /\bshow\s+(?:me\s+)?(?:this\s+)?(?:visually|in\s+video\s+form)\b/i,
  /\b(?:a\s+)?visual\s+(?:video\s+)?(?:explanation|demonstration|guide)\b/i,

  // Demo video patterns
  /\b(?:a\s+)?(?:demo|demonstration)\s+video\b/i,
  /\bvideo\s+(?:demo|demonstration)\b/i,

  // === TIME-SPECIFIC REQUESTS ===
  // Minute video patterns
  /\b(?:a\s+)?(?:one|two|three|1|2|3|30\s+second|60\s+second|90\s+second)[\s-]?(?:minute\s+)?video\b/i,

  // === ADDITIONAL CATCH-ALL PATTERNS ===
  // Generic "get a video" patterns
  /\b(?:get|have|receive)\s+(?:a\s+)?video\s+(?:from\s+you|made|created|generated)\b/i,

  // "I'm looking for" patterns
  /\b(?:i['']?m\s+)?looking\s+for\s+(?:a\s+)?video\s+(?:about|on|explaining|showing)\b/i,

  // "Do you" patterns
  /\bdo\s+you\s+(?:make|create|generate|produce)\s+videos?\b/i,

  // End of video patterns
  /\bmake\s+(?:a\s+)?video\s+(?:for|about|on)\s+(?:me|this)\b/i,

  // "Video of" patterns  
  /\b(?:make|create|get)\s+(?:me\s+)?(?:a\s+)?video\s+of\b/i,
];

// Comprehensive topic extraction patterns
const TOPIC_EXTRACTION_PATTERNS = [
  // Standard "video about/on X" patterns
  /video\s+(?:about|on|explaining|showing|demonstrating|covering|regarding|discussing|teaching|for|of)\s+(.+?)(?:\.|$|,|\?|!|\band\b)/i,
  
  // "make/create video about X" patterns
  /(?:make|create|generate|produce|send|give|record|prepare)\s+(?:me\s+)?(?:a\s+)?video\s+(?:about|on|for|explaining|showing|demonstrating|covering|regarding|of)\s+(.+?)(?:\.|$|,|\?|!|\band\b)/i,
  
  // "want/need video about X" patterns
  /(?:want|need|would\s+like|'d\s+like)\s+(?:to\s+)?(?:see|watch|view|have|get)?\s*(?:a\s+)?video\s+(?:about|on|for|explaining|showing|demonstrating|of)\s+(.+?)(?:\.|$|,|\?|!|\band\b)/i,
  
  // "video that explains/shows X" patterns
  /video\s+(?:that\s+)?(?:explains?|shows?|demonstrates?|covers?|teaches?|discusses?)\s+(.+?)(?:\.|$|,|\?|!|\band\b)/i,
  
  // "video to explain/show X" patterns
  /video\s+to\s+(?:explain|show|demonstrate|cover|teach|discuss|help\s+(?:me\s+)?(?:understand|learn))\s+(.+?)(?:\.|$|,|\?|!|\band\b)/i,
  
  // "X video" patterns (topic first)
  /(?:a\s+)?(.+?)\s+video(?:\s+please|\s+for\s+me)?(?:\.|$|,|\?|!)/i,
  
  // "video on the topic of X" patterns
  /video\s+(?:on\s+)?(?:the\s+)?(?:topic|subject|matter)\s+(?:of\s+)?(.+?)(?:\.|$|,|\?|!)/i,
  
  // "clip about X" patterns
  /(?:video\s+)?clip\s+(?:about|on|explaining|showing|of)\s+(.+?)(?:\.|$|,|\?|!)/i,
  
  // "tutorial on X" patterns
  /(?:video\s+)?(?:tutorial|lesson|guide|walkthrough)\s+(?:on|about|for)\s+(.+?)(?:\.|$|,|\?|!)/i,
  
  // "teach/explain X in/with video" patterns
  /(?:teach|explain|show|demonstrate)\s+(?:me\s+)?(?:about\s+)?(.+?)\s+(?:in|with|through|via)\s+(?:a\s+)?video/i,
  
  // "video summary/overview of X" patterns
  /video\s+(?:summary|overview|recap|breakdown)\s+(?:of|about|on)\s+(.+?)(?:\.|$|,|\?|!)/i,
  
  // "quick/short video on X" patterns
  /(?:quick|short|brief)\s+video\s+(?:about|on|explaining|of)\s+(.+?)(?:\.|$|,|\?|!)/i,
  
  // Fallback: "video" followed by content (less specific)
  /video\s+(.+?)(?:\s+please|\s+for\s+me|$|\.|,|\?|!)/i,
];

// Words/phrases that suggest the user is NOT requesting a video
const NEGATIVE_INDICATORS = [
  /\b(?:watch|watching|watched)\s+(?:the|a|your|this)\s+video\b/i,
  /\b(?:saw|seen)\s+(?:the|a|your|this)\s+video\b/i,
  /\b(?:liked|enjoyed|loved)\s+(?:the|a|your|this|that)\s+video\b/i,
  /\bthe\s+video\s+(?:you\s+)?(?:sent|made|created|shared)\b/i,
  /\bvideo\s+(?:was|is)\s+(?:great|good|helpful|interesting)\b/i,
  /\b(?:how|what)\s+(?:long|big)\s+(?:is|was)\s+(?:the|that)\s+video\b/i,
  /\bvideo\s+(?:file|format|size|length|quality|resolution)\b/i,
  /\bdownload(?:ed|ing)?\s+(?:the|a|your)\s+video\b/i,
  /\bplay(?:ing|ed)?\s+(?:the|a|your|this)\s+video\b/i,
  /\bvideo\s+(?:call|chat|conference|meeting)\b/i,
  /\byoutube\s+video\b/i,
  /\bvideo\s+game\b/i,
  /\bmusic\s+video\b/i,
];

// High-confidence trigger phrases (instant match)
const HIGH_CONFIDENCE_TRIGGERS = [
  /\b(?:make|create|generate|send)\s+me\s+a\s+video\b/i,
  /\bi\s+(?:want|need)\s+a\s+video\b/i,
  /\bcan\s+you\s+(?:make|create)\s+(?:me\s+)?a\s+video\b/i,
  /\bvideo\s+about\s+.{3,}/i,
  /\bvideo\s+explaining\s+.{3,}/i,
  /\bvideo\s+on\s+.{3,}/i,
];

function extractTopicFromMessage(message: string): string | null {
  // Clean up the message
  const cleanMessage = message.trim();
  
  for (const pattern of TOPIC_EXTRACTION_PATTERNS) {
    const match = cleanMessage.match(pattern);
    if (match && match[1]) {
      let topic = match[1].trim();
      
      // Remove trailing punctuation and common suffixes
      topic = topic.replace(/[.!?,;:]+$/, '').trim();
      topic = topic.replace(/\s+(?:please|thanks|thank you|for me|if you can|when you can)$/i, '').trim();
      
      // Remove leading articles if they're standalone
      topic = topic.replace(/^(?:the|a|an)\s+(?=\S)/i, '');
      
      // Validate topic length and content
      if (topic.length > 3 && topic.length < 300) {
        // Make sure it's not just filler words
        const fillerOnly = /^(?:it|this|that|something|anything|stuff|things?)$/i.test(topic);
        if (!fillerOnly) {
          return topic;
        }
      }
    }
  }
  return null;
}

function hasNegativeIndicators(message: string): boolean {
  return NEGATIVE_INDICATORS.some(pattern => pattern.test(message));
}

function hasHighConfidenceTrigger(message: string): boolean {
  return HIGH_CONFIDENCE_TRIGGERS.some(pattern => pattern.test(message));
}

function detectVideoIntentWithPatterns(message: string): VideoIntentResult {
  const normalizedMessage = message.toLowerCase().trim();
  
  // Check for negative indicators first (user is talking about existing videos, not requesting new ones)
  if (hasNegativeIndicators(message)) {
    return {
      isVideoRequest: false,
      topic: null,
      confidence: 0.9, // High confidence it's NOT a request
    };
  }
  
  // Check for high-confidence triggers first
  if (hasHighConfidenceTrigger(message)) {
    const topic = extractTopicFromMessage(message);
    return {
      isVideoRequest: true,
      topic,
      confidence: 0.98,
    };
  }
  
  // Check all video request patterns
  for (const pattern of VIDEO_REQUEST_PATTERNS) {
    if (pattern.test(normalizedMessage)) {
      const topic = extractTopicFromMessage(message);
      return {
        isVideoRequest: true,
        topic,
        confidence: topic ? 0.95 : 0.85,
      };
    }
  }
  
  return {
    isVideoRequest: false,
    topic: null,
    confidence: 0,
  };
}

async function detectVideoIntentWithAI(message: string): Promise<VideoIntentResult> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 300,
      system: `You are an expert video request detector. Analyze user messages and determine if they are requesting a video to be created/generated for them.

Respond ONLY in JSON format:
{
  "isVideoRequest": true/false,
  "topic": "extracted topic or null",
  "confidence": 0.0-1.0
}

VIDEO REQUEST EXAMPLES (should return isVideoRequest: true):
- "Send me a video about nutrition"
- "I need a video explaining meditation"
- "Can you make a video on stress management?"
- "I want to see a video about exercise"
- "Create a video for my team about productivity"
- "Could you put together a video on healthy eating?"
- "Hook me up with a video about sleep"
- "I'd love a quick video explaining mindfulness"
- "Make me a tutorial video on breathing exercises"
- "Generate a video clip about relaxation techniques"
- "Video about anxiety please"
- "How about a video on mental health?"
- "Would it be possible to get a video about wellness?"
- "A video showing proper stretching would be helpful"
- "I want something visual about this topic - can you make a video?"

NOT VIDEO REQUESTS (should return isVideoRequest: false):
- "The video you sent was great" (referring to existing video)
- "I watched that video yesterday" (past viewing)
- "How long is the video?" (asking about video properties)
- "Can you play the video?" (playback request)
- "I love video games" (different context)
- "Let's have a video call" (video conferencing)
- "What's your favorite YouTube video?" (general discussion)
- "The video quality was poor" (quality feedback)
- "I downloaded the video" (download confirmation)
- "That was a good music video" (music video discussion)

Key indicators of a VIDEO REQUEST:
1. Action verbs: make, create, generate, send, give, produce, record, prepare, put together
2. Desire expressions: want, need, would like, I'd love, looking for
3. Polite requests: can you, could you, would you, please
4. Topic indicators: about, on, explaining, showing, demonstrating, covering, regarding
5. Alternative terms: clip, recording, tutorial, lesson, guide

Extract the SPECIFIC topic the user wants the video to be about. Be precise but comprehensive.`,
      messages: [
        {
          role: "user",
          content: `Analyze this message for video generation request intent: "${message}"`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        isVideoRequest: Boolean(result.isVideoRequest),
        topic: result.topic || null,
        confidence: Number(result.confidence) || 0.5,
      };
    }
    
    return { isVideoRequest: false, topic: null, confidence: 0 };
  } catch (error) {
    console.error("AI video intent detection error:", error);
    return { isVideoRequest: false, topic: null, confidence: 0 };
  }
}

export async function detectVideoIntent(message: string): Promise<VideoIntentResult> {
  const patternResult = detectVideoIntentWithPatterns(message);
  
  // If high confidence from patterns (either yes or no), trust it
  if (patternResult.confidence >= 0.90) {
    console.log(`[Video Intent] Pattern detection result:`, patternResult);
    return patternResult;
  }
  
  // If pattern detection found a video request with good confidence, use it
  if (patternResult.isVideoRequest && patternResult.confidence >= 0.85) {
    console.log(`[Video Intent] Pattern detection found request:`, patternResult);
    return patternResult;
  }
  
  // If the message doesn't contain video-related keywords at all, skip AI
  const hasVideoKeyword = /\b(?:video|clip|recording|footage|tutorial|lesson)\b/i.test(message);
  const hasActionVerb = /\b(?:make|create|generate|produce|send|give|record|prepare|want|need|like)\b/i.test(message);
  
  if (!hasVideoKeyword && !hasActionVerb) {
    return { isVideoRequest: false, topic: null, confidence: 1.0 };
  }
  
  // Use AI for ambiguous cases or when video keyword is present but patterns didn't match
  console.log(`[Video Intent] Using AI detection for ambiguous message`);
  const aiResult = await detectVideoIntentWithAI(message);
  console.log(`[Video Intent] AI detection result:`, aiResult);
  
  // Compare results and return the more confident one
  if (aiResult.isVideoRequest && aiResult.confidence > patternResult.confidence) {
    return aiResult;
  }
  
  // If AI is confident it's NOT a request, trust that
  if (!aiResult.isVideoRequest && aiResult.confidence > 0.8) {
    return aiResult;
  }
  
  return patternResult.isVideoRequest ? patternResult : aiResult;
}

export function generateVideoAcknowledgment(topic: string | null, avatarName: string): string {
  const topicPart = topic ? ` about "${topic}"` : "";
  const responses = [
    `I'm creating a video${topicPart} for you now. Feel free to continue our conversation while I work on it - I'll let you know as soon as it's ready!`,
    `Great idea! I'm putting together a video${topicPart} for you. This will take a few minutes, but we can keep chatting in the meantime. I'll notify you when it's done!`,
    `Working on that video${topicPart} for you now! You can continue asking questions - I'll send you a notification once your video is ready to watch.`,
    `I'll create that video${topicPart} for you! It typically takes a few minutes. Let's keep our conversation going, and I'll let you know when it's ready.`,
    `Absolutely! I'm generating a personalized video${topicPart} just for you. Keep chatting with me - I'll alert you the moment it's complete!`,
    `On it! Your custom video${topicPart} is being created. Feel free to ask me anything else while you wait - I'll ping you when it's ready to view!`,
  ];
  
  return responses[Math.floor(Math.random() * responses.length)];
}

interface TopicRefinementResult {
  refinedTopic: string;
  isReplacement: boolean; // true = user clarified/replaced, false = user added details
}

/**
 * Intelligently refines the video topic based on user's follow-up message.
 * Determines if the user is:
 * 1. Clarifying/replacing the topic (new message IS the topic)
 * 2. Adding details to the existing topic (should be combined)
 */
export async function refineVideoTopic(
  originalTopic: string,
  userMessage: string
): Promise<TopicRefinementResult> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 200,
      system: `You analyze video topic refinements. When a user is asked to clarify what they want in a video, they may:
1. REPLACE: Provide a new/clarified topic that should replace the original (e.g., "protein intake for athletes" replaces "nutrition")
2. ADD: Add specific details to enhance the original topic (e.g., "with examples" adds to "meditation techniques")

Respond ONLY in JSON:
{
  "refinedTopic": "the final topic to use",
  "isReplacement": true/false
}

EXAMPLES:
- Original: "nutrition", User says: "focus on protein intake for athletes" → {"refinedTopic": "protein intake for athletes", "isReplacement": true}
- Original: "meditation", User says: "specifically about mindfulness" → {"refinedTopic": "mindfulness meditation", "isReplacement": true}
- Original: "workout routines", User says: "with warm-up exercises included" → {"refinedTopic": "workout routines with warm-up exercises", "isReplacement": false}
- Original: "stress management", User says: "breathing techniques" → {"refinedTopic": "breathing techniques for stress management", "isReplacement": true}
- Original: "nutrition", User says: "actually make it about sleep instead" → {"refinedTopic": "sleep", "isReplacement": true}
- Original: "running", User says: "for beginners" → {"refinedTopic": "running for beginners", "isReplacement": false}

The refined topic should be concise and clear - suitable for a video title.`,
      messages: [
        {
          role: "user",
          content: `Original topic: "${originalTopic}"\nUser's follow-up: "${userMessage}"\n\nDetermine the refined topic.`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      console.log(`[Topic Refinement] Original: "${originalTopic}" + User: "${userMessage}" → "${result.refinedTopic}" (${result.isReplacement ? 'replaced' : 'enhanced'})`);
      return {
        refinedTopic: result.refinedTopic || userMessage,
        isReplacement: Boolean(result.isReplacement),
      };
    }
    
    // Fallback: treat as replacement if message seems like a complete topic
    console.log(`[Topic Refinement] Fallback - treating as replacement`);
    return {
      refinedTopic: userMessage,
      isReplacement: true,
    };
  } catch (error) {
    console.error("[Topic Refinement] Error:", error);
    // On error, default to treating the new message as the complete topic
    return {
      refinedTopic: userMessage,
      isReplacement: true,
    };
  }
}
