export * from './personaTypes';
export * from './personaLoader';
export * from './personaRegistry';
export * from './promptAssembler';
export * from './responseCritic';
export * from './avatarIntegration';

import { getPersona, hasPersona } from './personaRegistry';
import { assemblePrompt } from './promptAssembler';
import { critiqueAndFix, validateResponse } from './responseCritic';
import type { PersonaSpec, AssembledPrompt, CriticResult } from './personaTypes';

export interface PersonalityEngineResult {
  systemPrompt: string;
  namespaces: string[];
  personaId: string;
}

export function buildPersonalizedPrompt(
  avatarId: string,
  context?: { recentFacts?: string[] }
): PersonalityEngineResult | null {
  const persona = getPersona(avatarId);
  
  if (!persona) {
    return null;
  }

  const assembled = assemblePrompt(persona, context);
  
  return {
    systemPrompt: assembled.systemPrompt,
    namespaces: assembled.namespaces,
    personaId: assembled.personaId,
  };
}

export async function processResponse(
  avatarId: string,
  response: string,
  userMessage: string
): Promise<{ finalResponse: string; wasRewritten: boolean; issues: string[] }> {
  const persona = getPersona(avatarId);
  
  if (!persona) {
    return { finalResponse: response, wasRewritten: false, issues: [] };
  }

  return critiqueAndFix(response, persona, userMessage);
}

export function validateAvatarResponse(
  avatarId: string,
  response: string
): CriticResult {
  const persona = getPersona(avatarId);
  
  if (!persona) {
    return { passed: true, issues: [] };
  }

  return validateResponse(response, persona);
}

export { getPersona, hasPersona };
