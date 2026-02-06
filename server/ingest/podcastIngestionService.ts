import { v4 as uuidv4 } from 'uuid';
import Anthropic from '@anthropic-ai/sdk';
import { pineconeService, PineconeIndexName } from '../pinecone.js';
import { getEmbedder } from './embedder.js';
import { logger } from '../logger.js';
import {
  PodcastIngestionRequest,
  PodcastIngestionResult,
  PODCAST_EXTRACTION_PROMPT,
  PODCAST_CHUNKING_PROMPT
} from './podcastTypes.js';
import {
  ConversationalChunk,
  ConversationalMetadata,
  ContentType,
  Tone,
  Confidence,
  VoiceOrigin
} from './conversationalTypes.js';

const anthropic = new Anthropic();
const UPSERT_BATCH_SIZE = 50;
const MAX_TOKENS_PER_BATCH = 8000;
const APPROX_CHARS_PER_TOKEN = 4;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const PROTECTED_NAMESPACES = ['mark-kohl', 'markkohl', 'mark_kohl'];

function isProtectedNamespace(namespace: string): boolean {
  const normalized = namespace.toLowerCase().replace(/[^a-z0-9]/g, '');
  return PROTECTED_NAMESPACES.some(p => 
    normalized.includes(p.replace(/[^a-z0-9]/g, ''))
  );
}

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

export async function extractSubstance(text: string): Promise<string> {
  logger.info({ textLength: text.length }, 'Starting podcast substance extraction');
  
  const batches = splitTextIntoBatches(text);
  const extractedParts: string[] = [];
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    logger.debug({ batchIndex: i, batchLength: batch.length }, 'Extracting substance from batch');
    
    const response = await withRetry(() => anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 8192,
      system: PODCAST_EXTRACTION_PROMPT,
      messages: [
        {
          role: 'user',
          content: batch
        }
      ]
    }));
    
    const extracted = response.content[0].type === 'text' 
      ? response.content[0].text 
      : '';
    
    if (extracted.trim()) {
      extractedParts.push(extracted.trim());
    }
  }
  
  const combined = extractedParts.join('\n\n');
  logger.info({ 
    originalLength: text.length, 
    extractedLength: combined.length,
    reductionPercent: Math.round((1 - combined.length / text.length) * 100)
  }, 'Substance extraction complete');
  
  return combined;
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

export async function chunkPodcastContent(
  text: string,
  attribution?: string
): Promise<{ chunks: ConversationalChunk[]; discardedCount: number }> {
  const batches = splitTextIntoBatches(text);
  logger.info({ batchCount: batches.length, totalLength: text.length }, 'Starting podcast chunking');
  
  const allChunks: ConversationalChunk[] = [];
  let discardedCount = 0;
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    logger.debug({ batchIndex: i, batchLength: batch.length }, 'Chunking batch');
    
    const response = await withRetry(() => anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 8192,
      system: PODCAST_CHUNKING_PROMPT,
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
  }
  
  logger.info({ 
    totalChunks: allChunks.length, 
    discardedCount 
  }, 'Podcast chunking complete');
  
  return { chunks: allChunks, discardedCount };
}

export async function ingestPodcast(
  request: PodcastIngestionRequest
): Promise<PodcastIngestionResult> {
  const { source, rawText, sourceType, attribution, dryRun } = request;
  // Normalize namespace to UPPERCASE for consistency with Pinecone storage
  const namespace = request.namespace.toUpperCase();
  
  if (isProtectedNamespace(namespace)) {
    throw new Error(`Namespace "${namespace}" is protected and cannot be modified`);
  }
  
  logger.info({
    service: 'podcast-ingestion',
    namespace,
    source,
    sourceType,
    textLength: rawText.length,
    dryRun: !!dryRun
  }, 'Starting podcast/video ingestion');
  
  const extractedText = await extractSubstance(rawText);
  
  if (extractedText.length < 100) {
    throw new Error('After removing conversational fluff, there was not enough substantive content to process');
  }
  
  const result = await chunkPodcastContent(extractedText, attribution);
  
  if (dryRun) {
    const chunksByType = result.chunks.reduce((acc, c) => {
      acc[c.content_type] = (acc[c.content_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      namespace,
      source,
      sourceType,
      totalChunks: result.chunks.length,
      chunksByType,
      discardedCount: result.discardedCount,
      dryRunPreview: result.chunks.slice(0, 10)
    };
  }
  
  const embedder = getEmbedder();
  const createdAt = new Date().toISOString();
  
  const textsToEmbed = result.chunks.map(c => c.text);
  const embeddings = await embedder.embedBatch(textsToEmbed);
  
  const vectors = result.chunks.map((chunk, index) => {
    const metadata: ConversationalMetadata = {
      namespace,
      source,
      content_type: chunk.content_type,
      tone: chunk.tone,
      topic: chunk.topic,
      confidence: chunk.confidence,
      voice_origin: chunk.voice_origin,
      text: chunk.text,
      created_at: createdAt,
      source_type: sourceType
    };
    
    if (chunk.attribution) {
      metadata.attribution = chunk.attribution;
    }
    
    return {
      id: `${source}:${uuidv4().slice(0, 8)}`,
      values: embeddings[index],
      metadata
    };
  });
  
  const index = await pineconeService.initializeIndex(PineconeIndexName.ASK_ELXR);
  const ns = index.namespace(namespace);
  
  for (let i = 0; i < vectors.length; i += UPSERT_BATCH_SIZE) {
    const batch = vectors.slice(i, i + UPSERT_BATCH_SIZE);
    await ns.upsert(batch as any);
    logger.debug({ 
      namespace, 
      batchStart: i, 
      batchEnd: i + batch.length 
    }, 'Upserted batch');
  }
  
  const chunksByType = result.chunks.reduce((acc, c) => {
    acc[c.content_type] = (acc[c.content_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  logger.info({
    service: 'podcast-ingestion',
    namespace,
    source,
    sourceType,
    totalChunks: result.chunks.length,
    discardedCount: result.discardedCount,
    chunksByType
  }, 'Podcast/video ingestion complete');
  
  return {
    namespace,
    source,
    sourceType,
    totalChunks: result.chunks.length,
    chunksByType,
    discardedCount: result.discardedCount
  };
}
