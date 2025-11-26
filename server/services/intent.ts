import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

interface VideoIntentResult {
  isVideoRequest: boolean;
  topic: string | null;
  confidence: number;
}

const VIDEO_REQUEST_PATTERNS = [
  /\b(?:send|show|make|create|generate|give|provide)\s+(?:me\s+)?(?:a\s+)?video\b/i,
  /\b(?:i\s+)?(?:want|need|would like|can you)\s+(?:to\s+)?(?:see|watch|view|have)\s+(?:a\s+)?video\b/i,
  /\bvideo\s+(?:about|on|explaining|showing|demonstrating|covering)\b/i,
  /\bcan\s+(?:you\s+)?(?:make|create|produce|generate)\s+(?:a\s+)?video\b/i,
  /\b(?:please\s+)?(?:prepare|put together)\s+(?:a\s+)?video\b/i,
  /\brecord\s+(?:a\s+)?video\s+(?:for|about|on)\b/i,
  /\bi['']d\s+like\s+(?:a\s+)?video\b/i,
  /\b(?:get|fetch)\s+(?:me\s+)?(?:a\s+)?video\b/i,
  /\bvideo\s+(?:please|for me)\b/i,
  /\b(?:share|present)\s+(?:a\s+)?video\s+(?:about|on)\b/i,
];

const TOPIC_EXTRACTION_PATTERNS = [
  /video\s+(?:about|on|explaining|showing|demonstrating|covering|for|regarding)\s+(.+?)(?:\.|$|,|\?|!)/i,
  /(?:send|show|make|create|generate|give|provide)\s+(?:me\s+)?(?:a\s+)?video\s+(?:about|on|for|explaining|showing)\s+(.+?)(?:\.|$|,|\?|!)/i,
  /(?:want|need|would like)\s+(?:to\s+)?(?:see|watch|view|have)\s+(?:a\s+)?video\s+(?:about|on|for|explaining|showing)\s+(.+?)(?:\.|$|,|\?|!)/i,
  /video\s+(.+?)(?:\s+please|\s+for me|$|\.|,|\?|!)/i,
];

function extractTopicFromMessage(message: string): string | null {
  for (const pattern of TOPIC_EXTRACTION_PATTERNS) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const topic = match[1].trim();
      if (topic.length > 3 && topic.length < 200) {
        return topic;
      }
    }
  }
  return null;
}

function detectVideoIntentWithPatterns(message: string): VideoIntentResult {
  const normalizedMessage = message.toLowerCase().trim();
  
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
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
      system: `You are a video request detector. Analyze user messages and determine if they are requesting a video to be created for them.

Respond in JSON format only:
{
  "isVideoRequest": true/false,
  "topic": "extracted topic or null",
  "confidence": 0.0-1.0
}

A video request includes phrases like:
- "Send me a video about..."
- "I need a video explaining..."
- "Can you make a video showing..."
- "I want to see a video on..."
- Any request for the AI to create, generate, or provide a video

NOT video requests:
- Questions about videos in general
- Asking to watch an existing video
- Discussing video as a concept`,
      messages: [
        {
          role: "user",
          content: `Analyze this message for video request intent: "${message}"`,
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
  
  if (patternResult.isVideoRequest && patternResult.confidence >= 0.85) {
    return patternResult;
  }
  
  if (!patternResult.isVideoRequest && !message.toLowerCase().includes('video')) {
    return { isVideoRequest: false, topic: null, confidence: 1.0 };
  }
  
  const aiResult = await detectVideoIntentWithAI(message);
  
  if (aiResult.isVideoRequest && aiResult.confidence > patternResult.confidence) {
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
  ];
  
  return responses[Math.floor(Math.random() * responses.length)];
}
