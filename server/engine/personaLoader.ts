import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { PersonaSpec } from './personaTypes';
import { logger } from '../logger';

const log = logger.child({ module: 'persona-loader' });

function getPersonasDir(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    return join(__dirname, 'personas');
  } catch {
    return join(process.cwd(), 'server', 'engine', 'personas');
  }
}

export function loadPersonaFromFile(filePath: string): PersonaSpec | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const persona = JSON.parse(content) as PersonaSpec;
    log.debug({ personaId: persona.id, filePath }, 'Loaded persona from file');
    return persona;
  } catch (error) {
    log.error({ filePath, error }, 'Failed to load persona from file');
    return null;
  }
}

export function loadAllPersonas(): Map<string, PersonaSpec> {
  const personas = new Map<string, PersonaSpec>();
  const personasDir = getPersonasDir();

  if (!existsSync(personasDir)) {
    log.warn({ personasDir }, 'Personas directory does not exist');
    return personas;
  }

  try {
    const files = readdirSync(personasDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    for (const file of jsonFiles) {
      const filePath = join(personasDir, file);
      const persona = loadPersonaFromFile(filePath);
      if (persona) {
        personas.set(persona.id, persona);
      }
    }

    log.info({ count: personas.size }, 'Loaded personas from JSON files');
  } catch (error) {
    log.error({ error }, 'Failed to load personas directory');
  }

  return personas;
}

export function reloadPersona(personaId: string): PersonaSpec | null {
  const personasDir = getPersonasDir();
  const filePath = join(personasDir, `${personaId}.json`);
  
  if (!existsSync(filePath)) {
    log.warn({ personaId, filePath }, 'Persona file not found');
    return null;
  }

  return loadPersonaFromFile(filePath);
}
