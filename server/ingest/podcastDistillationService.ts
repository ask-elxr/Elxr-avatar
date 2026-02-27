import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';
import { logger } from '../logger.js';

const anthropic = new Anthropic();

export interface DistilledWisdom {
  topics: string[];
  principles: Array<{ text: string; confidence: 'high' | 'medium' | 'low' }>;
  mental_models: Array<{ text: string; confidence: 'high' | 'medium' | 'low' }>;
  heuristics: Array<{ if: string; then: string; confidence: 'high' | 'medium' | 'low' }>;
  misconceptions: Array<{ text: string; confidence: 'high' | 'medium' | 'low' }>;
  red_flags: Array<{ text: string; confidence: 'high' | 'medium' | 'low' }>;
  safe_disclaimer: string;
}

export interface MentorMemory {
  mentor: string;
  voice_rules: string[];
  go_to_moves: Array<{ trigger: string; response_style: string; why_it_helps: string }>;
  signature_principles: Array<{ text: string; when_to_use: string }>;
  question_prompts: string[];
  boundary_notes: string[];
}

export interface DistillationChunk {
  id: string;
  text: string;
  metadata: {
    kb: string;
    doc_type: 'learned_wisdom' | 'mentor_memory';
    mentor: string | null;
    derived: boolean;
    kind: string;
    confidence?: string;
    text: string;
  };
}

const SYSTEM_DISTILL = `
You are extracting "learned wisdom" from podcast transcripts for a private knowledge base.

CRITICAL RULES:
- Do NOT quote or closely paraphrase the transcript.
- Do NOT include names of hosts/guests, show titles, episode titles, dates, or unique anecdotes.
- Do NOT include distinctive phrasing that could identify the source.
- Transform content into generalized insights, patterns, and guidance that could apply broadly.
- If the transcript is low-signal (banter, ads), say so and extract only what is truly reusable.
- Avoid medical claims; use cautious language and recommend professional help when appropriate.

Output MUST be valid JSON with this shape:
{
  "topics": ["..."],
  "principles": [{"text":"...", "confidence":"high|medium|low"}],
  "mental_models": [{"text":"...", "confidence":"high|medium|low"}],
  "heuristics": [{"if":"...", "then":"...", "confidence":"high|medium|low"}],
  "misconceptions": [{"text":"...", "confidence":"high|medium|low"}],
  "red_flags": [{"text":"...", "confidence":"high|medium|low"}],
  "safe_disclaimer": "one short sentence safety disclaimer"
}
`.trim();

const SYSTEM_MENTOR_MEMORY = `
You are rewriting distilled insights into a mentor's conversational "memory and guidance style" for an avatar.

CRITICAL RULES:
- Do NOT reference the podcast, episode, transcript, or any names.
- Do NOT quote or paraphrase uniquely identifiable phrasing.
- Keep it practical and conversational.
- Use first-person voice ("I've noticed…", "What tends to help…") but DO NOT claim to be human.
- Encourage honesty; avoid cheerleading; prefer clarity over comfort.
- If sensitive topics arise, include gentle safety guidance (professional help, crisis resources where appropriate).

Output MUST be valid JSON with this shape:
{
  "mentor": "Name",
  "voice_rules": ["..."],
  "go_to_moves": [{"trigger":"...", "response_style":"...", "why_it_helps":"..."}],
  "signature_principles": [{"text":"...", "when_to_use":"..."}],
  "question_prompts": ["..."],
  "boundary_notes": ["..."]
}
`.trim();

const MAX_INPUT_CHARS = 120000;

function extractJSON(text: string): string {
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

export async function distillTranscript(transcriptText: string): Promise<DistilledWisdom> {
  const trimmed = transcriptText.slice(0, MAX_INPUT_CHARS);
  
  logger.info({ textLength: trimmed.length }, 'Distilling transcript into learned wisdom');
  
  const response = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 4000,
    messages: [
      {
        role: 'user',
        content: `TRANSCRIPT (for extraction only; do NOT quote):\n${trimmed}`
      }
    ],
    system: SYSTEM_DISTILL
  });
  
  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }
  
  try {
    const parsed = JSON.parse(extractJSON(content.text)) as DistilledWisdom;
    logger.info({ 
      topicsCount: parsed.topics?.length || 0,
      principlesCount: parsed.principles?.length || 0,
      mentalModelsCount: parsed.mental_models?.length || 0,
      heuristicsCount: parsed.heuristics?.length || 0
    }, 'Successfully distilled transcript');
    return parsed;
  } catch (error) {
    logger.error({ error: (error as Error).message, text: content.text.slice(0, 500) }, 'Failed to parse distillation response');
    throw new Error('Failed to parse distillation response as JSON');
  }
}

export async function convertToMentorMemory(distilledWisdom: DistilledWisdom, mentorName: string): Promise<MentorMemory> {
  logger.info({ mentorName }, 'Converting distilled wisdom to mentor memory');
  
  const response = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 4000,
    messages: [
      {
        role: 'user',
        content: `MENTOR NAME: ${mentorName}\n\nDISTILLED INSIGHTS (input JSON):\n${JSON.stringify(distilledWisdom, null, 2)}`
      }
    ],
    system: SYSTEM_MENTOR_MEMORY
  });
  
  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }
  
  try {
    const parsed = JSON.parse(extractJSON(content.text)) as MentorMemory;
    logger.info({ 
      mentor: parsed.mentor,
      voiceRulesCount: parsed.voice_rules?.length || 0,
      goToMovesCount: parsed.go_to_moves?.length || 0,
      principlesCount: parsed.signature_principles?.length || 0
    }, 'Successfully converted to mentor memory');
    return parsed;
  } catch (error) {
    logger.error({ error: (error as Error).message, text: content.text.slice(0, 500) }, 'Failed to parse mentor memory response');
    throw new Error('Failed to parse mentor memory response as JSON');
  }
}

export function buildDistillationChunks(
  doc: DistilledWisdom | MentorMemory,
  docType: 'learned_wisdom' | 'mentor_memory',
  namespace: string
): DistillationChunk[] {
  const chunks: DistillationChunk[] = [];
  const baseMeta = {
    kb: namespace,
    doc_type: docType,
    mentor: (doc as MentorMemory).mentor || null,
    derived: true,
  };
  
  function add(text: string, extraMeta: Record<string, string> = {}): void {
    const normalized = (text || '').trim();
    if (!normalized || normalized.length < 25) return;
    
    const truncated = normalized.slice(0, 2000);
    const id = crypto.createHash('sha1').update(docType + '::' + truncated).digest('hex');
    
    chunks.push({
      id,
      text: truncated,
      metadata: {
        ...baseMeta,
        ...extraMeta,
        text: truncated,
        kind: extraMeta.kind || 'unknown',
      } as DistillationChunk['metadata'],
    });
  }
  
  if (docType === 'learned_wisdom') {
    const wisdom = doc as DistilledWisdom;
    
    (wisdom.topics || []).forEach((t) => add(`Topic: ${t}`, { kind: 'topic' }));
    (wisdom.principles || []).forEach((p) => add(p.text, { kind: 'principle', confidence: p.confidence || 'medium' }));
    (wisdom.mental_models || []).forEach((m) => add(m.text, { kind: 'mental_model', confidence: m.confidence || 'medium' }));
    (wisdom.heuristics || []).forEach((h) => add(`If: ${h.if}\nThen: ${h.then}`, { kind: 'heuristic', confidence: h.confidence || 'medium' }));
    (wisdom.misconceptions || []).forEach((m) => add(m.text, { kind: 'misconception', confidence: m.confidence || 'medium' }));
    (wisdom.red_flags || []).forEach((r) => add(r.text, { kind: 'red_flag', confidence: r.confidence || 'medium' }));
    
    if (wisdom.safe_disclaimer) add(wisdom.safe_disclaimer, { kind: 'disclaimer' });
  }
  
  if (docType === 'mentor_memory') {
    const memory = doc as MentorMemory;
    
    if (memory.voice_rules?.length) {
      add(`Voice rules:\n- ${memory.voice_rules.join('\n- ')}`, { kind: 'voice_rules' });
    }
    
    (memory.go_to_moves || []).forEach((m) => {
      add(`Trigger: ${m.trigger}\nResponse style: ${m.response_style}\nWhy it helps: ${m.why_it_helps}`, { kind: 'go_to_move' });
    });
    
    (memory.signature_principles || []).forEach((p) => {
      add(`${p.text}\nWhen to use: ${p.when_to_use}`, { kind: 'signature_principle' });
    });
    
    if (memory.question_prompts?.length) {
      add(`Question prompts:\n- ${memory.question_prompts.join('\n- ')}`, { kind: 'question_prompts' });
    }
    
    if (memory.boundary_notes?.length) {
      add(`Boundary notes:\n- ${memory.boundary_notes.join('\n- ')}`, { kind: 'boundary_notes' });
    }
  }
  
  return chunks;
}

export async function distillAndChunkTranscript(
  transcriptText: string,
  namespace: string,
  mentorName?: string,
  mode: 'learned' | 'mentor_memory' = 'mentor_memory'
): Promise<DistillationChunk[]> {
  const distilled = await distillTranscript(transcriptText);
  
  if (mode === 'learned') {
    return buildDistillationChunks(distilled, 'learned_wisdom', namespace);
  }
  
  if (!mentorName) {
    mentorName = 'Mentor';
  }
  
  const mentorMemory = await convertToMentorMemory(distilled, mentorName);
  return buildDistillationChunks(mentorMemory, 'mentor_memory', namespace);
}
