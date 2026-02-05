import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../logger';
import { getAvatarById } from './avatars';

const DEFAULT_MODEL = "claude-sonnet-4-5";

const anthropic = process.env.ANTHROPIC_API_KEY 
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

interface MoodResponseParams {
  mood: string;
  intensity: number;
  notes?: string;
  avatarId?: string;
  userName?: string;
}

const moodEmojis: Record<string, string> = {
  joyful: "😊",
  calm: "😌",
  energized: "⚡",
  anxious: "😰",
  sad: "😢",
  stressed: "😫",
  neutral: "😐",
};

const moodDescriptions: Record<string, { positive: boolean; description: string }> = {
  joyful: { positive: true, description: "happy and joyful" },
  calm: { positive: true, description: "calm and at peace" },
  energized: { positive: true, description: "full of energy and motivated" },
  anxious: { positive: false, description: "anxious and worried" },
  sad: { positive: false, description: "sad and down" },
  stressed: { positive: false, description: "stressed and overwhelmed" },
  neutral: { positive: true, description: "neutral and balanced" },
};

export async function generateMoodResponse(params: MoodResponseParams): Promise<string> {
  const { mood, intensity, notes, avatarId, userName } = params;
  
  const log = logger.child({
    service: 'moodResponse',
    mood,
    intensity,
    avatarId,
  });

  if (!anthropic) {
    log.warn('Anthropic API key not configured, using fallback response');
    return generateFallbackResponse(mood, intensity);
  }

  try {
    let avatarPersonality = "";
    let avatarName = "your wellness guide";
    
    if (avatarId) {
      const avatar = await getAvatarById(avatarId);
      if (avatar) {
        avatarName = avatar.name;
        avatarPersonality = avatar.personalityPrompt || "";
      }
    }

    const moodInfo = moodDescriptions[mood] || { positive: false, description: mood };
    const intensityDescription = getIntensityDescription(intensity);
    const userContext = notes ? `\n\nThe user shared: "${notes}"` : "";
    const greeting = userName ? `${userName}` : "there";

    const systemPrompt = `You are ${avatarName}, an empathetic and supportive AI companion helping users with their emotional wellness.

${avatarPersonality ? `Your personality and expertise:\n${avatarPersonality}\n` : ""}

Your role is to:
1. Acknowledge and validate the user's emotional state
2. Provide empathetic, warm, and genuine support
3. Offer brief, actionable suggestions when appropriate (especially for difficult emotions)
4. Celebrate positive emotions and encourage self-care
5. Keep responses conversational and under 3-4 sentences
6. Use a warm, caring tone that matches your personality

Important: Be authentic and caring, not clinical. Speak naturally as if talking to a friend.`;

    const userMessage = `The user is currently feeling ${moodInfo.description} with ${intensityDescription} intensity (${intensity}/5).${userContext}

Generate a brief, empathetic response that:
- Acknowledges their current emotional state
- ${moodInfo.positive ? "Celebrates their positive mood and encourages them" : "Offers comfort and a brief helpful suggestion"}
- Feels personal and warm, not generic
- Is 2-4 sentences maximum`;

    log.debug('Generating mood response with Claude');
    
    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    log.info('Mood response generated successfully');
    return textContent.text;
  } catch (error: any) {
    log.error({ error: error.message }, 'Error generating mood response');
    return generateFallbackResponse(mood, intensity);
  }
}

function getIntensityDescription(intensity: number): string {
  if (intensity <= 2) return "mild";
  if (intensity <= 3) return "moderate";
  if (intensity <= 4) return "strong";
  return "very strong";
}

function generateFallbackResponse(mood: string, intensity: number): string {
  const moodInfo = moodDescriptions[mood] || { positive: false, description: mood };
  const emoji = moodEmojis[mood] || "💙";
  
  if (moodInfo.positive) {
    const positiveResponses = [
      `${emoji} I'm so glad to hear you're feeling ${moodInfo.description}! That's wonderful. Keep embracing these positive moments.`,
      `${emoji} What a great mood to be in! Feeling ${moodInfo.description} is something to celebrate. Enjoy this positive energy!`,
      `${emoji} It's beautiful that you're feeling ${moodInfo.description} right now. These moments are precious - take it in!`,
    ];
    return positiveResponses[Math.floor(Math.random() * positiveResponses.length)];
  } else {
    const supportiveResponses = [
      `${emoji} I hear you - feeling ${moodInfo.description} can be really tough. Remember, it's okay to feel this way, and these feelings will pass. Take care of yourself today.`,
      `${emoji} Thank you for sharing that you're feeling ${moodInfo.description}. You're not alone in this. Try taking a few deep breaths and being gentle with yourself.`,
      `${emoji} It takes courage to acknowledge when we're feeling ${moodInfo.description}. Remember to give yourself grace. Small steps forward still count.`,
    ];
    return supportiveResponses[Math.floor(Math.random() * supportiveResponses.length)];
  }
}

export const moodResponseService = {
  generateMoodResponse,
};
