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
  ContentType
} from './conversationalTypes.js';

const UPSERT_BATCH_SIZE = 50;

const PERSONAL_KNOWLEDGE_NAMESPACES = [
  'mark-kohl', 'markkohl', 'mark_kohl', 'mark kohl',
  'willie-gault', 'williegault', 'willie_gault', 'willie gault',
];

function isPersonalKnowledgeNamespace(namespace: string): boolean {
  const normalized = namespace.toLowerCase().replace(/[^a-z0-9]/g, '');
  return PERSONAL_KNOWLEDGE_NAMESPACES.some(p => 
    normalized.includes(p.replace(/[^a-z0-9]/g, ''))
  );
}

export async function ingestCourseTranscript(
  request: CourseIngestionRequest
): Promise<CourseIngestionResult> {
  const { namespace, source, rawText, attribution, dryRun } = request;
  
  if (!isPersonalKnowledgeNamespace(namespace)) {
    throw new Error(`Verbatim ingestion restricted: namespace "${namespace}" is not a personal knowledge namespace. Use the Learning Artifact pipeline for course content to ensure anonymity.`);
  }
  
  logger.info({
    service: 'course-ingestion',
    namespace,
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
    
    return {
      namespace,
      source,
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
  }, {} as Record<ContentType, number>);
  
  logger.info({
    service: 'course-ingestion',
    namespace,
    source,
    totalChunks: result.chunks.length,
    discardedCount: result.discardedCount,
    chunksByType
  }, 'Course transcript ingestion complete');
  
  return {
    namespace,
    source,
    totalChunks: result.chunks.length,
    chunksByType,
    discardedCount: result.discardedCount
  };
}

export async function deleteNamespaceVectors(
  namespace: string
): Promise<{ deleted: string[] }> {
  if (isPersonalKnowledgeNamespace(namespace)) {
    throw new Error(`Namespace "${namespace}" is a personal knowledge namespace and cannot be deleted through this route`);
  }
  
  const index = await pineconeService.initializeIndex(PineconeIndexName.ASK_ELXR);
  const deleted: string[] = [];
  
  try {
    const ns = index.namespace(namespace);
    await ns.deleteAll();
    deleted.push(namespace);
    logger.info({ namespace }, 'Deleted all vectors in namespace');
  } catch (error) {
    logger.warn({ namespace, error: (error as Error).message }, 'Failed to delete namespace');
  }
  
  return { deleted };
}

export async function getNamespaceStats(namespace: string): Promise<{ vectorCount: number }> {
  const index = await pineconeService.initializeIndex(PineconeIndexName.ASK_ELXR);
  const indexStats = await index.describeIndexStats();
  
  const nsStats = indexStats.namespaces?.[namespace];
  return { vectorCount: nsStats?.recordCount || 0 };
}

export async function deleteAvatarNamespace(
  avatar: string, 
  contentType?: ContentType
): Promise<{ deleted: string[] }> {
  const avatarSlug = avatar.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const namespaces = contentType 
    ? [`${avatarSlug}_${contentType === 'story' ? 'stories' : contentType === 'warning' ? 'warnings' : contentType === 'reframe' ? 'reframes' : contentType}`]
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
      logger.warn({ namespace, error: (error as Error).message }, 'Failed to delete namespace');
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
  
  const indexStats = await index.describeIndexStats();
  
  for (const namespace of namespaces) {
    const nsStats = indexStats.namespaces?.[namespace];
    stats[namespace] = { vectorCount: nsStats?.recordCount || 0 };
  }
  
  return stats;
}
