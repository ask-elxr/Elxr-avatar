import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../logger.js';
import {
  ConversationalChunk,
  ChunkingResult,
  AnonymizationResult,
  ContentType,
  Tone,
  Confidence,
  VoiceOrigin,
  ANONYMIZATION_SYSTEM_PROMPT,
  CHUNKING_SYSTEM_PROMPT,
  ANONYMIZATION_CHECK_PROMPT
} from './conversationalTypes.js';

const anthropic = new Anthropic();

const MAX_TOKENS_PER_BATCH = 8000;
const APPROX_CHARS_PER_TOKEN = 4;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  delayMs: number = RETRY_DELAY_MS
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      logger.warn({ 
        attempt: attempt + 1, 
        maxRetries, 
        error: lastError.message 
      }, 'Claude API call failed, retrying...');
      
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
      }
    }
  }
  
  throw lastError;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / APPROX_CHARS_PER_TOKEN);
}

function splitTextIntoBatches(text: string, maxTokens: number = MAX_TOKENS_PER_BATCH): string[] {
  const batches: string[] = [];
  const maxChars = maxTokens * APPROX_CHARS_PER_TOKEN;
  
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
  let currentBatch = '';
  
  for (const paragraph of paragraphs) {
    if ((currentBatch + '\n\n' + paragraph).length > maxChars) {
      if (currentBatch.trim()) {
        batches.push(currentBatch.trim());
      }
      currentBatch = paragraph;
    } else {
      currentBatch += (currentBatch ? '\n\n' : '') + paragraph;
    }
  }
  
  if (currentBatch.trim()) {
    batches.push(currentBatch.trim());
  }
  
  return batches;
}

export async function anonymizeText(text: string): Promise<AnonymizationResult> {
  logger.info({ textLength: text.length }, 'Starting anonymization');
  
  try {
    const response = await withRetry(() => anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 8192,
      system: ANONYMIZATION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: text
        }
      ]
    }));
    
    const anonymizedText = response.content[0].type === 'text' 
      ? response.content[0].text 
      : text;
    
    const checkResponse = await withRetry(() => anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 10,
      messages: [
        {
          role: 'user',
          content: `${ANONYMIZATION_CHECK_PROMPT}\n\nText to check:\n${anonymizedText}`
        }
      ]
    }));
    
    const checkResult = checkResponse.content[0].type === 'text'
      ? checkResponse.content[0].text.trim().toUpperCase()
      : 'NO';
    
    if (checkResult === 'YES') {
      logger.warn('Anonymization check failed, re-anonymizing');
      const reAnonymized = await withRetry(() => anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 8192,
        system: ANONYMIZATION_SYSTEM_PROMPT + '\n\nThis text was already anonymized once but still contains recognizable elements. Be MORE aggressive in removing identifying patterns.',
        messages: [
          {
            role: 'user',
            content: anonymizedText
          }
        ]
      }));
      
      const finalText = reAnonymized.content[0].type === 'text'
        ? reAnonymized.content[0].text
        : anonymizedText;
      
      return {
        anonymizedText: finalText,
        wasModified: true
      };
    }
    
    logger.info({ originalLength: text.length, anonymizedLength: anonymizedText.length }, 'Anonymization complete');
    
    return {
      anonymizedText,
      wasModified: text !== anonymizedText
    };
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Anonymization failed');
    throw error;
  }
}

function validateChunk(chunk: any): ConversationalChunk | null {
  const validContentTypes: ContentType[] = ['explanation', 'advice', 'story', 'warning', 'reframe'];
  const validTones: Tone[] = ['warm', 'blunt', 'reflective', 'reassuring', 'provocative'];
  const validConfidences: Confidence[] = ['soft', 'direct', 'authoritative'];
  
  if (!chunk.text || typeof chunk.text !== 'string' || chunk.text.trim().length < 20) {
    return null;
  }
  
  const tokenEstimate = estimateTokens(chunk.text);
  if (tokenEstimate > 350) {
    return null;
  }
  
  const content_type = validContentTypes.includes(chunk.content_type) 
    ? chunk.content_type 
    : 'explanation';
  
  const tone = validTones.includes(chunk.tone) 
    ? chunk.tone 
    : 'warm';
  
  const confidence = validConfidences.includes(chunk.confidence) 
    ? chunk.confidence 
    : 'direct';
  
  const topic = typeof chunk.topic === 'string' && chunk.topic.trim() 
    ? chunk.topic.trim().toLowerCase() 
    : 'general';
  
  return {
    text: chunk.text.trim(),
    content_type,
    tone,
    topic,
    confidence,
    voice_origin: 'avatar_native' as VoiceOrigin
  };
}

function parseChunksFromResponse(responseText: string): ConversationalChunk[] {
  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    logger.warn('No JSON array found in chunking response');
    return [];
  }
  
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      return [];
    }
    
    const validChunks: ConversationalChunk[] = [];
    for (const item of parsed) {
      const validated = validateChunk(item);
      if (validated) {
        validChunks.push(validated);
      }
    }
    
    return validChunks;
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to parse chunks JSON');
    return [];
  }
}

export async function chunkTextConversationally(
  text: string,
  attribution?: string
): Promise<ChunkingResult> {
  const batches = splitTextIntoBatches(text);
  logger.info({ batchCount: batches.length, totalLength: text.length }, 'Starting conversational chunking');
  
  const allChunks: ConversationalChunk[] = [];
  let discardedCount = 0;
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    logger.debug({ batchIndex: i, batchLength: batch.length }, 'Processing batch');
    
    try {
      const response = await withRetry(() => anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 8192,
        system: CHUNKING_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: batch
          }
        ]
      }));
      
      const responseText = response.content[0].type === 'text'
        ? response.content[0].text
        : '';
      
      const chunks = parseChunksFromResponse(responseText);
      
      for (const chunk of chunks) {
        if (attribution) {
          chunk.voice_origin = 'attributed';
          chunk.attribution = attribution;
        }
        allChunks.push(chunk);
      }
      
      const estimatedInputChunks = Math.ceil(estimateTokens(batch) / 200);
      if (chunks.length < estimatedInputChunks * 0.3) {
        discardedCount += Math.max(0, estimatedInputChunks - chunks.length);
      }
      
      logger.debug({ batchIndex: i, chunksExtracted: chunks.length }, 'Batch complete');
    } catch (error) {
      logger.error({ batchIndex: i, error: (error as Error).message }, 'Batch processing failed after retries');
      throw error;
    }
  }
  
  logger.info({ 
    totalChunks: allChunks.length, 
    discardedCount,
    byContentType: allChunks.reduce((acc, c) => {
      acc[c.content_type] = (acc[c.content_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  }, 'Conversational chunking complete');
  
  return {
    chunks: allChunks,
    discardedCount
  };
}

export async function processTranscript(
  rawText: string,
  attribution?: string
): Promise<ChunkingResult & { anonymizedText: string }> {
  const anonymization = await anonymizeText(rawText);
  
  const chunking = await chunkTextConversationally(
    anonymization.anonymizedText,
    attribution
  );
  
  return {
    ...chunking,
    anonymizedText: anonymization.anonymizedText
  };
}
