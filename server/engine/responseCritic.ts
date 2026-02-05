import type { PersonaSpec, CriticResult } from './personaTypes';
import Anthropic from '@anthropic-ai/sdk';

// <important_do_not_delete>
const CRITIC_MODEL = "claude-sonnet-4-5";
// </important_do_not_delete>

const anthropic = new Anthropic();

export function validateResponse(response: string, persona: PersonaSpec): CriticResult {
  const issues: string[] = [];
  const lowerResponse = response.toLowerCase();

  for (const bannedWord of persona.voice.bannedWords) {
    if (lowerResponse.includes(bannedWord.toLowerCase())) {
      issues.push(`Used banned word: "${bannedWord}"`);
    }
  }

  const aiPhrases = [
    'as an ai',
    'i am an ai',
    'i\'m an ai',
    'as a language model',
    'as an assistant',
    'i cannot',
    'i\'m not able to',
    'chatgpt',
    'openai',
    'anthropic',
    'claude',
  ];
  
  for (const phrase of aiPhrases) {
    if (lowerResponse.includes(phrase)) {
      issues.push(`Broke character with AI reference: "${phrase}"`);
    }
  }

  const actionPatterns = /\*[^*]+\*/g;
  if (actionPatterns.test(response)) {
    issues.push('Used action descriptions (*leans back*, etc.)');
  }

  if (response.length > 2000 && persona.output.maxLength === 'short') {
    issues.push('Response too long for "short" format');
  }
  if (response.length > 3500 && persona.output.maxLength === 'medium') {
    issues.push('Response too long for "medium" format');
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}

export async function rewriteResponse(
  originalResponse: string,
  issues: string[],
  persona: PersonaSpec,
  userMessage: string
): Promise<string> {
  const criticPrompt = `You are a response editor. The following response was written by "${persona.displayName}" but has issues that need fixing.

ISSUES FOUND:
${issues.map(i => `- ${i}`).join('\n')}

PERSONA VOICE RULES:
- Tone: ${persona.voice.tone.join(', ')}
- Banned words: ${persona.voice.bannedWords.join(', ')}
- Must stay in character as ${persona.displayName}
- No AI references, no action descriptions

ORIGINAL USER MESSAGE:
${userMessage}

ORIGINAL RESPONSE:
${originalResponse}

Rewrite the response to fix all issues while preserving the meaning and staying in character as ${persona.displayName}. Output ONLY the rewritten response, nothing else.`;

  try {
    const result = await anthropic.messages.create({
      model: CRITIC_MODEL,
      max_tokens: 1500,
      messages: [{ role: 'user', content: criticPrompt }],
    });

    const textBlock = result.content.find(b => b.type === 'text');
    return textBlock?.text || originalResponse;
  } catch (error) {
    console.error('Critic rewrite failed:', error);
    return originalResponse;
  }
}

export async function critiqueAndFix(
  response: string,
  persona: PersonaSpec,
  userMessage: string
): Promise<{ finalResponse: string; wasRewritten: boolean; issues: string[] }> {
  const validation = validateResponse(response, persona);
  
  if (validation.passed) {
    return { finalResponse: response, wasRewritten: false, issues: [] };
  }

  const rewritten = await rewriteResponse(response, validation.issues, persona, userMessage);
  
  return {
    finalResponse: rewritten,
    wasRewritten: true,
    issues: validation.issues,
  };
}
