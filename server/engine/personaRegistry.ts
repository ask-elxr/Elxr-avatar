import type { PersonaSpec } from './personaTypes';
import { loadAllPersonas, reloadPersona } from './personaLoader';
import { logger } from '../logger';

const log = logger.child({ module: 'persona-registry' });

let personas: Map<string, PersonaSpec> = new Map();
let initialized = false;

function ensureInitialized(): void {
  if (!initialized) {
    personas = loadAllPersonas();
    initialized = true;
  }
}

export function getPersona(id: string): PersonaSpec | undefined {
  ensureInitialized();
  return personas.get(id);
}

export function getAllPersonas(): PersonaSpec[] {
  ensureInitialized();
  return Array.from(personas.values());
}

export function hasPersona(id: string): boolean {
  ensureInitialized();
  return personas.has(id);
}

export function registerPersona(persona: PersonaSpec): void {
  ensureInitialized();
  personas.set(persona.id, persona);
  log.info({ personaId: persona.id }, 'Registered persona');
}

export function listPersonaIds(): string[] {
  ensureInitialized();
  return Array.from(personas.keys());
}

export function refreshPersona(personaId: string): boolean {
  const reloaded = reloadPersona(personaId);
  if (reloaded) {
    personas.set(personaId, reloaded);
    log.info({ personaId }, 'Refreshed persona from file');
    return true;
  }
  return false;
}

export function refreshAllPersonas(): void {
  personas = loadAllPersonas();
  log.info({ count: personas.size }, 'Refreshed all personas');
}
