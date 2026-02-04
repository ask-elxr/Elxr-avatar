import { v4 as uuidv4 } from 'uuid';
import { pineconeService, PineconeIndexName } from '../pinecone.js';
import { getEmbedder } from './embedder.js';
import { logger } from '../logger.js';
import { storage } from '../storage.js';
import {
  ConversationalChunk,
  ConversationalMetadata,
} from './conversationalTypes.js';

const EMBED_BATCH_SIZE = 15;
const UPSERT_BATCH_SIZE = 50;
const SLEEP_BETWEEN_EMBED_MS = 500;
const SLEEP_BETWEEN_UPSERT_MS = 300;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export interface MicroBatchProgress {
  totalChunks: number;
  chunksEmbedded: number;
  chunksUploaded: number;
  isComplete: boolean;
}

export interface ChunkRecord {
  id: string;
  text: string;
  content_type: string;
  tone: string;
  topic: string;
  confidence: string;
  voice_origin: string;
  attribution?: string;
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
      }, 'API call failed, retrying...');
      
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
      }
    }
  }
  
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function embedAndUploadMicroBatch(
  episodeId: string,
  chunks: ChunkRecord[],
  namespace: string,
  source: string,
  sourceType: string,
  startFromChunk: number = 0,
  options: { updateEpisodeProgress?: boolean } = {}
): Promise<MicroBatchProgress> {
  const { updateEpisodeProgress = false } = options; // Default: don't update episode (caller manages progress)
  const embedder = getEmbedder();
  const createdAt = new Date().toISOString();
  const normalizedNamespace = namespace.toLowerCase();
  
  logger.info({
    episodeId,
    namespace: normalizedNamespace,
    totalChunks: chunks.length,
    startFromChunk,
  }, 'Starting micro-batch embedding and upload');
  
  const index = await pineconeService.initializeIndex(PineconeIndexName.ASK_ELXR);
  const ns = index.namespace(normalizedNamespace);
  
  let chunksEmbedded = startFromChunk;
  let chunksUploaded = startFromChunk;
  
  const chunksToProcess = chunks.slice(startFromChunk);
  const allVectors: any[] = [];
  
  for (let i = 0; i < chunksToProcess.length; i += EMBED_BATCH_SIZE) {
    const batchChunks = chunksToProcess.slice(i, i + EMBED_BATCH_SIZE);
    const batchTexts = batchChunks.map(c => c.text);
    
    logger.debug({
      episodeId,
      batchStart: startFromChunk + i,
      batchSize: batchChunks.length,
    }, 'Embedding micro-batch');
    
    const embeddings = await withRetry(() => embedder.embedBatch(batchTexts));
    
    const vectors = batchChunks.map((chunk, idx) => {
      const metadata: ConversationalMetadata = {
        namespace: normalizedNamespace,
        source,
        content_type: chunk.content_type as any,
        tone: chunk.tone as any,
        topic: chunk.topic,
        confidence: chunk.confidence as any,
        voice_origin: chunk.voice_origin as any,
        text: chunk.text,
        created_at: createdAt,
        source_type: sourceType,
      };
      
      if (chunk.attribution) {
        metadata.attribution = chunk.attribution;
      }
      
      // Copy any extended metadata fields from distillation mode
      // (doc_type, kind, mentor, derived)
      const chunkAny = chunk as unknown as Record<string, unknown>;
      for (const key of ['doc_type', 'kind', 'mentor', 'derived']) {
        if (chunkAny[key] !== undefined && typeof chunkAny[key] === 'string') {
          metadata[key] = chunkAny[key] as string;
        }
      }
      
      return {
        id: chunk.id,
        values: embeddings[idx],
        metadata,
      };
    });
    
    allVectors.push(...vectors);
    chunksEmbedded = startFromChunk + i + batchChunks.length;
    
    if (i + EMBED_BATCH_SIZE < chunksToProcess.length) {
      await sleep(SLEEP_BETWEEN_EMBED_MS);
    }
  }
  
  for (let i = 0; i < allVectors.length; i += UPSERT_BATCH_SIZE) {
    const batch = allVectors.slice(i, i + UPSERT_BATCH_SIZE);
    
    logger.debug({
      episodeId,
      namespace: normalizedNamespace,
      batchStart: i,
      batchSize: batch.length,
    }, 'Upserting micro-batch to Pinecone');
    
    await withRetry(() => ns.upsert(batch as any));
    
    chunksUploaded = startFromChunk + i + batch.length;
    
    // Only update episode progress if explicitly requested (for single-namespace use)
    if (updateEpisodeProgress) {
      await storage.updatePodcastEpisode(episodeId, {
        chunksUploaded,
      });
    }
    
    if (i + UPSERT_BATCH_SIZE < allVectors.length) {
      await sleep(SLEEP_BETWEEN_UPSERT_MS);
    }
  }
  
  const isComplete = chunksUploaded >= chunks.length;
  
  logger.info({
    episodeId,
    namespace: normalizedNamespace,
    totalChunks: chunks.length,
    chunksUploaded,
    isComplete,
  }, 'Micro-batch upload complete');
  
  return {
    totalChunks: chunks.length,
    chunksEmbedded,
    chunksUploaded,
    isComplete,
  };
}

export function prepareChunksForStorage(
  chunks: ConversationalChunk[],
  source: string
): ChunkRecord[] {
  return chunks.map((chunk, index) => ({
    id: `${source}:${uuidv4().slice(0, 8)}`,
    text: chunk.text,
    content_type: chunk.content_type,
    tone: chunk.tone,
    topic: chunk.topic,
    confidence: chunk.confidence,
    voice_origin: chunk.voice_origin,
    attribution: chunk.attribution,
  }));
}

export function loadChunksFromStorage(chunksJson: any): ChunkRecord[] {
  if (!chunksJson || !Array.isArray(chunksJson)) {
    return [];
  }
  return chunksJson as ChunkRecord[];
}
