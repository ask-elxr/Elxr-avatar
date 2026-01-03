import { v4 as uuidv4 } from 'uuid';
import { pineconeService, PineconeIndexName } from '../pinecone.js';
import { getEmbedder } from './embedder.js';
import { processTranscript } from './conversationalChunker.js';
import { logger } from '../logger.js';
import {
  CourseIngestionRequest,
  CourseIngestionResult,
  ConversationalChunk,
  ConversationalMetadata,
  ContentType,
  isProtectedAvatar,
  getNamespaceForContentType
} from './conversationalTypes.js';

const UPSERT_BATCH_SIZE = 50;

export async function ingestCourseTranscript(
  request: CourseIngestionRequest
): Promise<CourseIngestionResult> {
  const { avatar, source, rawText, attribution, dryRun } = request;
  
  if (isProtectedAvatar(avatar)) {
    throw new Error(`Avatar "${avatar}" is protected and cannot be modified through this ingestion pipeline`);
  }
  
  logger.info({
    service: 'course-ingestion',
    avatar,
    source,
    textLength: rawText.length,
    dryRun: !!dryRun
  }, 'Starting course transcript ingestion');
  
  const result = await processTranscript(rawText, attribution);
  
  if (dryRun) {
    const chunksByType = result.chunks.reduce((acc, c) => {
      acc[c.content_type] = (acc[c.content_type] || 0) + 1;
      return acc;
    }, {} as Record<ContentType, number>);
    
    const chunksByNamespace = result.chunks.reduce((acc, c) => {
      const ns = getNamespaceForContentType(avatar, c.content_type);
      acc[ns] = (acc[ns] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      avatar,
      source,
      totalChunks: result.chunks.length,
      chunksByType,
      chunksByNamespace,
      discardedCount: result.discardedCount,
      dryRunPreview: result.chunks.slice(0, 10)
    };
  }
  
  const chunksByNamespace: Record<string, ConversationalChunk[]> = {};
  for (const chunk of result.chunks) {
    const namespace = getNamespaceForContentType(avatar, chunk.content_type);
    if (!chunksByNamespace[namespace]) {
      chunksByNamespace[namespace] = [];
    }
    chunksByNamespace[namespace].push(chunk);
  }
  
  const embedder = getEmbedder();
  const createdAt = new Date().toISOString();
  
  const namespaceResults: Record<string, number> = {};
  
  for (const [namespace, chunks] of Object.entries(chunksByNamespace)) {
    logger.info({ namespace, chunkCount: chunks.length }, 'Processing namespace');
    
    const textsToEmbed = chunks.map(c => c.text);
    const embeddings = await embedder.embedBatch(textsToEmbed);
    
    const vectors = chunks.map((chunk, index) => {
      const metadata: ConversationalMetadata = {
        avatar,
        source,
        content_type: chunk.content_type,
        tone: chunk.tone,
        topic: chunk.topic,
        confidence: chunk.confidence,
        voice_origin: chunk.voice_origin,
        text: chunk.text,
        created_at: createdAt
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
    
    let upsertedCount = 0;
    for (let i = 0; i < vectors.length; i += UPSERT_BATCH_SIZE) {
      const batch = vectors.slice(i, i + UPSERT_BATCH_SIZE);
      
      try {
        await ns.upsert(batch as any);
        upsertedCount += batch.length;
        
        logger.debug({
          namespace,
          batchIndex: Math.floor(i / UPSERT_BATCH_SIZE),
          batchSize: batch.length,
          totalUpserted: upsertedCount
        }, 'Upserted batch');
      } catch (error) {
        logger.error({
          namespace,
          error: (error as Error).message,
          batchIndex: Math.floor(i / UPSERT_BATCH_SIZE)
        }, 'Failed to upsert batch');
        throw error;
      }
    }
    
    namespaceResults[namespace] = upsertedCount;
  }
  
  const chunksByType = result.chunks.reduce((acc, c) => {
    acc[c.content_type] = (acc[c.content_type] || 0) + 1;
    return acc;
  }, {} as Record<ContentType, number>);
  
  logger.info({
    service: 'course-ingestion',
    avatar,
    source,
    totalChunks: result.chunks.length,
    namespaceResults,
    discardedCount: result.discardedCount
  }, 'Course transcript ingestion complete');
  
  return {
    avatar,
    source,
    totalChunks: result.chunks.length,
    chunksByType,
    chunksByNamespace: namespaceResults,
    discardedCount: result.discardedCount
  };
}

export async function deleteAvatarNamespace(
  avatar: string,
  contentType?: ContentType
): Promise<{ deleted: string[] }> {
  if (isProtectedAvatar(avatar)) {
    throw new Error(`Avatar "${avatar}" is protected and cannot be deleted`);
  }
  
  const avatarSlug = avatar.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const namespaces = contentType 
    ? [getNamespaceForContentType(avatar, contentType)]
    : [
        `${avatarSlug}_core`,
        `${avatarSlug}_stories`,
        `${avatarSlug}_advice`,
        `${avatarSlug}_warnings`,
        `${avatarSlug}_reframes`
      ];
  
  const index = await pineconeService.initializeIndex(PineconeIndexName.ASK_ELXR);
  const deleted: string[] = [];
  
  for (const namespace of namespaces) {
    try {
      const ns = index.namespace(namespace);
      await ns.deleteAll();
      deleted.push(namespace);
      logger.info({ namespace }, 'Deleted namespace');
    } catch (error) {
      logger.warn({ namespace, error: (error as Error).message }, 'Failed to delete namespace (may not exist)');
    }
  }
  
  return { deleted };
}

export async function getAvatarNamespaceStats(avatar: string): Promise<Record<string, { vectorCount: number }>> {
  const avatarSlug = avatar.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const namespaces = [
    `${avatarSlug}_core`,
    `${avatarSlug}_stories`,
    `${avatarSlug}_advice`,
    `${avatarSlug}_warnings`,
    `${avatarSlug}_reframes`
  ];
  
  const index = await pineconeService.initializeIndex(PineconeIndexName.ASK_ELXR);
  const stats: Record<string, { vectorCount: number }> = {};
  
  try {
    const indexStats = await index.describeIndexStats();
    
    for (const namespace of namespaces) {
      const nsStats = indexStats.namespaces?.[namespace];
      stats[namespace] = { vectorCount: nsStats?.recordCount || 0 };
    }
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to get namespace stats');
    for (const namespace of namespaces) {
      stats[namespace] = { vectorCount: 0 };
    }
  }
  
  return stats;
}
