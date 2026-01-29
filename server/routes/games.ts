import { Router, type Request, type Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { storage } from '../storage.js';
import { logger } from '../logger.js';

const router = Router();
const anthropic = new Anthropic();

// Zod schemas for input validation
const gameRequestSchema = z.object({
  avatarId: z.string().min(1).max(100),
  userId: z.string().min(1).max(100).optional(),
  gameType: z.enum(['trivia', 'word-association', 'mood-checkin', 'would-you-rather', 'story-builder']),
  action: z.string().min(1).max(50),
  data: z.record(z.unknown()).optional()
});

const wordAssociationDataSchema = z.object({
  prompt: z.string().max(100).optional(),
  userWord: z.string().max(100).optional()
});

const moodCheckinDataSchema = z.object({
  question: z.string().max(500).optional(),
  userResponse: z.string().max(2000).optional()
});

const wyrDataSchema = z.object({
  optionA: z.string().max(500).optional(),
  optionB: z.string().max(500).optional(),
  userChoice: z.enum(['A', 'B']).optional()
});

const storyDataSchema = z.object({
  story: z.array(z.object({
    role: z.enum(['user', 'avatar']),
    text: z.string().max(1000)
  })).max(50).optional(),
  userLine: z.string().max(500).optional()
});

// Sanitize user input to prevent prompt injection
function sanitizeInput(input: string): string {
  return input
    .replace(/\[system\]/gi, '')
    .replace(/\[assistant\]/gi, '')
    .replace(/\[user\]/gi, '')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .slice(0, 2000);
}

async function getAvatarContext(avatarId: string): Promise<string> {
  const avatar = await storage.getAvatar(avatarId);
  if (!avatar) {
    return `a friendly AI assistant`;
  }
  return `${avatar.name || avatarId}, ${avatar.description || 'an AI mentor'}`;
}

async function generateGameResponse(prompt: string, maxTokens: number = 500): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }]
  });
  
  return response.content[0].type === 'text' ? response.content[0].text : '';
}

router.post('/play', async (req: Request, res: Response) => {
  try {
    // Validate request body with Zod
    const parseResult = gameRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: parseResult.error.errors 
      });
    }
    
    const { avatarId, userId, gameType, action, data } = parseResult.data;
    
    const avatarContext = await getAvatarContext(avatarId);
    
    logger.info({ 
      service: 'games', 
      gameType, 
      action, 
      avatarId 
    }, 'Processing game action');
    
    switch (gameType) {
      case 'trivia': {
        if (action === 'generate_question') {
          const prompt = `You are ${avatarContext}. Generate a trivia question related to your area of expertise.

The question should be interesting and educational, suitable for an adult learner.

Respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{
  "question": "The trivia question",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctIndex": 0,
  "explanation": "Brief explanation of the correct answer"
}`;
          
          const response = await generateGameResponse(prompt, 400);
          
          try {
            const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const question = JSON.parse(cleaned);
            return res.json({ success: true, question });
          } catch (parseError) {
            logger.error({ error: (parseError as Error).message, response }, 'Failed to parse trivia response');
            return res.json({
              success: true,
              question: {
                question: "What is the most important factor in personal growth?",
                options: ["Self-awareness", "External validation", "Material wealth", "Avoiding challenges"],
                correctIndex: 0,
                explanation: "Self-awareness is foundational to personal growth as it allows us to understand our patterns, strengths, and areas for improvement."
              }
            });
          }
        }
        break;
      }
      
      case 'word-association': {
        if (action === 'generate_prompt') {
          const themes = ['growth', 'change', 'strength', 'connection', 'wisdom', 'courage', 'peace', 'energy', 'healing', 'love', 'purpose', 'balance', 'trust', 'hope', 'creativity'];
          const word = themes[Math.floor(Math.random() * themes.length)];
          return res.json({ success: true, word });
        }
        
        if (action === 'respond') {
          const wordData = wordAssociationDataSchema.safeParse(data);
          if (!wordData.success) {
            return res.status(400).json({ error: 'Invalid word association data' });
          }
          const { prompt, userWord } = wordData.data;
          const sanitizedWord = userWord ? sanitizeInput(userWord) : '';
          const sanitizedPrompt = prompt ? sanitizeInput(prompt) : '';
          
          const aiPrompt = `You are ${avatarContext}. The user played a word association game.
          
The starting word was: "${sanitizedPrompt}"
The user associated it with: "${sanitizedWord}"

Give a brief, warm response (1-2 sentences) acknowledging their association and sharing what you might have said. Be genuine and personal.`;
          
          const response = await generateGameResponse(aiPrompt, 150);
          return res.json({ success: true, response });
        }
        break;
      }
      
      case 'mood-checkin': {
        if (action === 'start') {
          const questions = [
            "How are you feeling right now, in this moment?",
            "What's been on your mind lately?",
            "If your current mood was a weather pattern, what would it be?",
            "What's one thing that brought you joy recently?",
            "How would you describe your energy level today?",
            "Is there something you've been carrying that you'd like to share?"
          ];
          const question = questions[Math.floor(Math.random() * questions.length)];
          return res.json({ success: true, question });
        }
        
        if (action === 'respond') {
          const moodData = moodCheckinDataSchema.safeParse(data);
          if (!moodData.success) {
            return res.status(400).json({ error: 'Invalid mood check-in data' });
          }
          const { question, userResponse } = moodData.data;
          const sanitizedQuestion = question ? sanitizeInput(question) : '';
          const sanitizedResponse = userResponse ? sanitizeInput(userResponse) : '';
          
          const prompt = `You are ${avatarContext}. You asked the user: "${sanitizedQuestion}"

They responded: "${sanitizedResponse}"

Provide a warm, empathetic response (2-3 sentences). Acknowledge their feelings without being preachy. If appropriate, offer a gentle perspective or word of encouragement. Be genuine, not clinical.`;
          
          const response = await generateGameResponse(prompt, 200);
          return res.json({ success: true, response });
        }
        break;
      }
      
      case 'would-you-rather': {
        if (action === 'generate') {
          const prompt = `You are ${avatarContext}. Generate a thought-provoking "Would You Rather" question that relates to personal growth, life choices, or philosophical dilemmas.

Make it interesting and conversation-worthy, not silly.

Respond ONLY with valid JSON (no markdown):
{
  "optionA": "First option",
  "optionB": "Second option"
}`;
          
          const response = await generateGameResponse(prompt, 200);
          
          try {
            const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const question = JSON.parse(cleaned);
            return res.json({ success: true, question });
          } catch (parseError) {
            return res.json({
              success: true,
              question: {
                optionA: "Have the ability to know when someone is lying",
                optionB: "Have the ability to lie without anyone ever detecting it"
              }
            });
          }
        }
        
        if (action === 'respond') {
          const wyrData = wyrDataSchema.safeParse(data);
          if (!wyrData.success) {
            return res.status(400).json({ error: 'Invalid would-you-rather data' });
          }
          const { optionA, optionB, userChoice } = wyrData.data;
          const sanitizedA = optionA ? sanitizeInput(optionA) : '';
          const sanitizedB = optionB ? sanitizeInput(optionB) : '';
          const chosen = userChoice === 'A' ? sanitizedA : sanitizedB;
          
          const prompt = `You are ${avatarContext}. The user was asked "Would you rather: ${sanitizedA} OR ${sanitizedB}?"

They chose: "${chosen}"

Share your own perspective on this choice in 2-3 sentences. What would you choose and why? Be genuine and conversational.`;
          
          const response = await generateGameResponse(prompt, 200);
          return res.json({ success: true, response });
        }
        break;
      }
      
      case 'story-builder': {
        if (action === 'start') {
          const prompt = `You are ${avatarContext}. Start a collaborative story with the user. Write the opening line or two of an interesting story (any genre - adventure, mystery, slice of life, etc.). Keep it brief (1-2 sentences) and leave it open-ended so the user can continue.`;
          
          const response = await generateGameResponse(prompt, 100);
          return res.json({ success: true, opening: response });
        }
        
        if (action === 'continue') {
          const storyData = storyDataSchema.safeParse(data);
          if (!storyData.success) {
            return res.status(400).json({ error: 'Invalid story data' });
          }
          const { story, userLine } = storyData.data;
          const sanitizedLine = userLine ? sanitizeInput(userLine) : '';
          
          const storyContext = (story || []).map((s) => 
            `${s.role === 'avatar' ? 'You' : 'User'}: ${sanitizeInput(s.text)}`
          ).join('\n');
          
          const prompt = `You are ${avatarContext}, collaboratively writing a story with a user.

Story so far:
${storyContext}

Continue the story with 1-2 sentences that build on what the user added. Keep it engaging and leave room for them to continue.`;
          
          const response = await generateGameResponse(prompt, 100);
          return res.json({ success: true, continuation: response });
        }
        break;
      }
      
      default:
        return res.status(400).json({ error: `Unknown game type: ${gameType}` });
    }
    
    return res.status(400).json({ error: `Unknown action: ${action} for game: ${gameType}` });
    
  } catch (error) {
    logger.error({ 
      service: 'games', 
      error: (error as Error).message 
    }, 'Game action failed');
    
    res.status(500).json({ 
      error: 'Game action failed', 
      message: (error as Error).message 
    });
  }
});

export default router;
