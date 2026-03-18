import { getPersona, hasPersona } from './personaRegistry';
import { assemblePrompt } from './promptAssembler';
import { critiqueAndFix } from './responseCritic';
import { storage } from '../storage';
import { logger } from '../logger';

const log = logger.child({ module: 'personality-engine' });

export async function getAvatarSystemPrompt(
  avatarId: string,
  context?: { recentFacts?: string[] }
): Promise<string | null> {
  if (hasPersona(avatarId)) {
    const persona = getPersona(avatarId)!;
    const assembled = assemblePrompt(persona, context);
    log.debug({ avatarId }, 'Using personality engine for avatar');
    return assembled.systemPrompt;
  }

  try {
    const avatar = await storage.getAvatar(avatarId);
    if (avatar?.personalityPrompt) {
      log.debug({ avatarId }, 'Using database personality prompt for avatar');
      return avatar.personalityPrompt;
    }
  } catch (error) {
    log.warn({ avatarId, error }, 'Failed to fetch avatar from storage');
  }

  return null;
}

export async function processAvatarResponse(
  avatarId: string,
  response: string,
  userMessage: string
): Promise<{ finalResponse: string; wasRewritten: boolean; issues: string[] }> {
  if (!hasPersona(avatarId)) {
    return { finalResponse: response, wasRewritten: false, issues: [] };
  }

  const persona = getPersona(avatarId)!;
  const result = await critiqueAndFix(response, persona, userMessage);
  
  if (result.wasRewritten) {
    log.info({ avatarId, issues: result.issues }, 'Response was rewritten by critic');
  }
  
  return result;
}

export function getAvatarKnowledgeNamespaces(avatarId: string): string[] | null {
  if (hasPersona(avatarId)) {
    const persona = getPersona(avatarId)!;
    return persona.knowledge.namespaces;
  }
  return null;
}

export function shouldQueryKnowledgeBase(
  avatarId: string,
  userMessage: string
): boolean {
  if (!hasPersona(avatarId)) {
    return true;
  }

  const persona = getPersona(avatarId)!;
  const messageLower = userMessage.toLowerCase();
  const { whenToQuery, whenNotToQuery } = persona.knowledge.kbPolicy;

  for (const pattern of whenNotToQuery) {
    const patternLower = pattern.toLowerCase();
    if (patternLower.includes('emotional support') && 
        (messageLower.includes('feel') || messageLower.includes('sad') || messageLower.includes('upset') || messageLower.includes('anxious'))) {
      return false;
    }
    if (patternLower.includes('pep talk') && 
        (messageLower.includes('encourage') || messageLower.includes('motivate'))) {
      return false;
    }
    if (patternLower.includes('casual conversation') && 
        (messageLower.includes('how are you') || messageLower.includes('what\'s up'))) {
      return false;
    }
    if (patternLower.includes('greeting') && 
        (messageLower.includes('hello') || messageLower.includes('hi ') || messageLower === 'hi')) {
      return false;
    }
  }

  for (const pattern of whenToQuery) {
    const patternLower = pattern.toLowerCase();
    if (patternLower.includes('facts') && 
        (messageLower.includes('what is') || messageLower.includes('how does') || messageLower.includes('tell me about'))) {
      return true;
    }
    if (patternLower.includes('research') || patternLower.includes('evidence')) {
      if (messageLower.includes('research') || messageLower.includes('study') || messageLower.includes('evidence')) {
        return true;
      }
    }
    if (patternLower.includes('steps') && 
        (messageLower.includes('how to') || messageLower.includes('steps') || messageLower.includes('guide'))) {
      return true;
    }
  }

  return true;
}
