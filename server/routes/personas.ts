import { Router } from 'express';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getPersona, getAllPersonas, refreshPersona, refreshAllPersonas, registerPersona } from '../engine/personaRegistry';
import { assemblePrompt } from '../engine/promptAssembler';
import { validateResponse } from '../engine/responseCritic';
import type { PersonaSpec } from '../engine/personaTypes';
import { logger } from '../logger';

const log = logger.child({ module: 'persona-routes' });

export const personaRouter = Router();

function getPersonasDir(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    return join(__dirname, '..', 'engine', 'personas');
  } catch {
    return join(process.cwd(), 'server', 'engine', 'personas');
  }
}

personaRouter.get('/personas', (req, res) => {
  try {
    const personas = getAllPersonas();
    res.json(personas);
  } catch (error: any) {
    log.error({ error: error.message }, 'Failed to list personas');
    res.status(500).json({ error: 'Failed to list personas' });
  }
});

personaRouter.get('/personas/:id', (req, res) => {
  try {
    const persona = getPersona(req.params.id);
    if (!persona) {
      return res.status(404).json({ error: 'Persona not found' });
    }
    res.json(persona);
  } catch (error: any) {
    log.error({ error: error.message, personaId: req.params.id }, 'Failed to get persona');
    res.status(500).json({ error: 'Failed to get persona' });
  }
});

personaRouter.get('/personas/:id/preview', (req, res) => {
  try {
    const persona = getPersona(req.params.id);
    if (!persona) {
      return res.status(404).json({ error: 'Persona not found' });
    }
    const assembled = assemblePrompt(persona);
    res.json({ 
      personaId: persona.id,
      systemPrompt: assembled.systemPrompt,
      namespaces: assembled.namespaces
    });
  } catch (error: any) {
    log.error({ error: error.message, personaId: req.params.id }, 'Failed to preview persona prompt');
    res.status(500).json({ error: 'Failed to preview persona prompt' });
  }
});

personaRouter.put('/personas/:id', (req, res) => {
  try {
    const personaData = req.body as PersonaSpec;
    
    if (personaData.id !== req.params.id) {
      return res.status(400).json({ error: 'Persona ID mismatch' });
    }

    const personasDir = getPersonasDir();
    if (!existsSync(personasDir)) {
      mkdirSync(personasDir, { recursive: true });
    }

    const filePath = join(personasDir, `${req.params.id}.json`);
    writeFileSync(filePath, JSON.stringify(personaData, null, 2), 'utf-8');
    
    registerPersona(personaData);
    
    log.info({ personaId: req.params.id }, 'Persona updated');
    res.json({ success: true, persona: personaData });
  } catch (error: any) {
    log.error({ error: error.message, personaId: req.params.id }, 'Failed to update persona');
    res.status(500).json({ error: 'Failed to update persona' });
  }
});

personaRouter.post('/personas', (req, res) => {
  try {
    const personaData = req.body as PersonaSpec;
    
    if (!personaData.id) {
      return res.status(400).json({ error: 'Persona ID is required' });
    }

    const existing = getPersona(personaData.id);
    if (existing) {
      return res.status(409).json({ error: 'Persona already exists' });
    }

    const personasDir = getPersonasDir();
    if (!existsSync(personasDir)) {
      mkdirSync(personasDir, { recursive: true });
    }

    const filePath = join(personasDir, `${personaData.id}.json`);
    writeFileSync(filePath, JSON.stringify(personaData, null, 2), 'utf-8');
    
    registerPersona(personaData);
    
    log.info({ personaId: personaData.id }, 'Persona created');
    res.status(201).json({ success: true, persona: personaData });
  } catch (error: any) {
    log.error({ error: error.message }, 'Failed to create persona');
    res.status(500).json({ error: 'Failed to create persona' });
  }
});

personaRouter.post('/personas/:id/refresh', (req, res) => {
  try {
    const success = refreshPersona(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Persona file not found' });
    }
    res.json({ success: true });
  } catch (error: any) {
    log.error({ error: error.message, personaId: req.params.id }, 'Failed to refresh persona');
    res.status(500).json({ error: 'Failed to refresh persona' });
  }
});

personaRouter.post('/personas/refresh-all', (req, res) => {
  try {
    refreshAllPersonas();
    const personas = getAllPersonas();
    res.json({ success: true, count: personas.length });
  } catch (error: any) {
    log.error({ error: error.message }, 'Failed to refresh all personas');
    res.status(500).json({ error: 'Failed to refresh all personas' });
  }
});

personaRouter.post('/personas/:id/test-critic', (req, res) => {
  try {
    const { response } = req.body;
    if (!response) {
      return res.status(400).json({ error: 'Response text is required' });
    }

    const persona = getPersona(req.params.id);
    if (!persona) {
      return res.status(404).json({ error: 'Persona not found' });
    }

    const result = validateResponse(response, persona);
    res.json(result);
  } catch (error: any) {
    log.error({ error: error.message, personaId: req.params.id }, 'Failed to test critic');
    res.status(500).json({ error: 'Failed to test critic' });
  }
});
