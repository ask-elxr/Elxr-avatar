import { Router } from 'express';
import { writeFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { getPersona, getAllPersonas, refreshPersona, refreshAllPersonas, registerPersona } from '../engine/personaRegistry';
import { assemblePrompt } from '../engine/promptAssembler';
import { validateResponse } from '../engine/responseCritic';
import type { PersonaSpec } from '../engine/personaTypes';
import { logger } from '../logger';
import { claudeService } from '../claudeService';

const upload = multer({ 
  dest: '/tmp/persona-uploads/',
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['text/plain', 'text/markdown', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.md') || file.originalname.endsWith('.txt')) {
      cb(null, true);
    } else {
      cb(new Error('Only .txt, .md, .pdf, and .docx files are allowed'));
    }
  }
});

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

async function extractTextFromFile(filePath: string, mimeType: string, originalName: string): Promise<string> {
  if (mimeType === 'text/plain' || originalName.endsWith('.txt') || originalName.endsWith('.md')) {
    return readFileSync(filePath, 'utf-8');
  } else if (mimeType === 'application/pdf') {
    const pdfParse = await import('pdf-parse').then(m => m.default);
    const pdfBuffer = readFileSync(filePath);
    const pdfData = await pdfParse(pdfBuffer);
    return pdfData.text || '';
  } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || '';
  }
  throw new Error('Unsupported file type');
}

function getExtractionSystemPrompt(avatarId: string): string {
  return `You are an expert at analyzing personality documents and extracting structured persona specifications.

Given a document describing a person's personality, communication style, expertise, and character traits, extract a structured PersonaSpec JSON object.

The PersonaSpec must have this exact structure:
{
  "id": "${avatarId}",
  "displayName": "string - the person's name or display name",
  "oneLiner": "string - a brief one-sentence description",
  "role": "string - their primary role or expertise",
  "audience": ["array of strings - who they typically speak to"],
  "boundaries": {
    "notA": ["array - what they are NOT (e.g., 'doctor', 'therapist')"],
    "refuseTopics": ["array - topics they won't discuss"]
  },
  "voice": {
    "tone": ["array of tone descriptors like 'warm', 'direct', 'knowledgeable'"],
    "humor": "string - description of their humor style",
    "readingLevel": "string - e.g., 'accessible', 'academic', 'plainspoken'",
    "bannedWords": ["array - words they never use"],
    "signaturePhrases": ["array - phrases they commonly use"]
  },
  "behavior": {
    "opensWith": ["array - how they typically start responses"],
    "disagreementStyle": "string - how they handle disagreement",
    "uncertaintyProtocol": "string - how they handle uncertainty"
  },
  "knowledge": {
    "namespaces": ["array - topic areas of expertise in UPPERCASE"],
    "kbPolicy": {
      "whenToQuery": ["array - situations requiring knowledge lookup"],
      "whenNotToQuery": ["array - situations not requiring lookup"]
    }
  },
  "output": {
    "maxLength": "short" | "medium" | "long",
    "structure": ["array - response structure elements"]
  },
  "safety": {
    "crisis": {
      "selfHarm": "string - protocol for handling crisis situations"
    }
  }
}

Analyze the document and extract as much relevant information as possible. For fields not mentioned in the document, provide reasonable defaults based on the overall personality described.

IMPORTANT: Return ONLY valid JSON, no markdown formatting, no explanation text.`;
}

async function extractPersonaFromText(avatarId: string, text: string): Promise<PersonaSpec> {
  if (!claudeService.isAvailable()) {
    throw new Error('AI service not available');
  }
  
  const client = claudeService.getClient();
  if (!client) {
    throw new Error('AI client not available');
  }
  
  const systemPrompt = getExtractionSystemPrompt(avatarId);
  const userMessage = `Extract a PersonaSpec from this personality document:\n\n${text.substring(0, 15000)}`;
  
  const response = await client.messages.create({
    model: claudeService.getDefaultModel(),
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  });
  
  const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
  
  let cleanJson = responseText.trim();
  if (cleanJson.startsWith('```json')) {
    cleanJson = cleanJson.slice(7);
  } else if (cleanJson.startsWith('```')) {
    cleanJson = cleanJson.slice(3);
  }
  if (cleanJson.endsWith('```')) {
    cleanJson = cleanJson.slice(0, -3);
  }
  cleanJson = cleanJson.trim();
  
  const persona = JSON.parse(cleanJson) as PersonaSpec;
  persona.id = avatarId;
  
  return persona;
}

personaRouter.post('/personas/:id/from-text', async (req, res) => {
  const avatarId = req.params.id;
  const { text } = req.body;
  
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Text content is required' });
  }
  
  if (text.trim().length < 50) {
    return res.status(400).json({ error: 'Text is too short (minimum 50 characters)' });
  }
  
  try {
    log.info({ avatarId, textLength: text.length }, 'Extracting persona from pasted text');
    
    const persona = await extractPersonaFromText(avatarId, text);
    
    log.info({ avatarId, displayName: persona.displayName }, 'Successfully extracted persona from text');
    res.json({ success: true, persona });
    
  } catch (error: any) {
    log.error({ error: error.message, avatarId }, 'Failed to extract persona from text');
    res.status(500).json({ error: 'Failed to extract persona: ' + error.message });
  }
});

personaRouter.post('/personas/:id/from-document', upload.single('document'), async (req, res) => {
  const avatarId = req.params.id;
  const file = req.file;
  
  if (!file) {
    return res.status(400).json({ error: 'No document uploaded' });
  }
  
  try {
    log.info({ avatarId, filename: file.originalname }, 'Extracting persona from document');
    
    const text = await extractTextFromFile(file.path, file.mimetype, file.originalname);
    
    if (!text || text.trim().length < 50) {
      unlinkSync(file.path);
      return res.status(400).json({ error: 'Document is too short or empty' });
    }
    
    const persona = await extractPersonaFromText(avatarId, text);
    
    unlinkSync(file.path);
    
    log.info({ avatarId, displayName: persona.displayName }, 'Successfully extracted persona from document');
    res.json({ success: true, persona });
    
  } catch (error: any) {
    log.error({ error: error.message, avatarId }, 'Failed to extract persona from document');
    if (file && existsSync(file.path)) {
      unlinkSync(file.path);
    }
    res.status(500).json({ error: 'Failed to extract persona: ' + error.message });
  }
});
