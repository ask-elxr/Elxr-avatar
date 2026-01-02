import * as fs from 'fs';
import * as path from 'path';
import { pineconeService, PineconeIndexName } from '../pinecone.js';
import { chunkDocument, getDryRunPreview, type Chunk } from './chunker.js';
import { getEmbedder } from './embedder.js';
import { buildNamespace, buildVectorId, type NamespaceParams, type Environment } from './namespaceUtils.js';
import { logger } from '../logger.js';

const UPSERT_BATCH_SIZE = 50;
const DEBUG_LOG_DIR = 'storage/debug/pinecone';

export type SourceType = 'pdf' | 'url' | 'transcript' | 'doc';

export interface IngestTextRequest {
  env: Environment;
  mentor: string;
  kb: string;
  version: number;
  source_type: SourceType;
  source_id: string;
  title: string;
  text: string;
  dryRun?: boolean;
}

export interface IngestResult {
  namespace: string;
  totalChunks: number;
  upsertedCount: number;
  debugLogPath?: string;
  dryRunPreview?: ReturnType<typeof getDryRunPreview>;
}

export interface QueryRequest {
  env: Environment;
  mentor: string;
  kb: string;
  version: number;
  query: string;
  topK?: number;
}

export interface QueryMatch {
  id: string;
  score: number;
  metadata: {
    mentor: string;
    kb: string;
    env: string;
    source_type: string;
    source_id: string;
    title: string;
    section: string;
    chunk_index: number;
    text_preview: string;
    created_at: string;
  };
  text?: string;
}

export interface QueryResult {
  namespace: string;
  query: string;
  matches: QueryMatch[];
}

interface DebugLogEntry {
  id: string;
  namespace: string;
  source_id: string;
  chunk_index: number;
  section: string;
  text: string;
  text_with_breadcrumb: string;
  metadata: Record<string, any>;
  created_at: string;
}

function ensureDebugLogDir(namespace: string): string {
  const sanitizedNamespace = namespace.replace(/:/g, '_');
  const dirPath = path.join(DEBUG_LOG_DIR, sanitizedNamespace);
  
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  
  return dirPath;
}

function writeDebugLog(entries: DebugLogEntry[], namespace: string, sourceId: string): string {
  const dirPath = ensureDebugLogDir(namespace);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${sourceId}_${timestamp}.jsonl`;
  const filePath = path.join(dirPath, filename);
  
  const lines = entries.map(entry => JSON.stringify(entry)).join('\n');
  fs.writeFileSync(filePath, lines + '\n');
  
  logger.info({ logPath: filePath, entryCount: entries.length }, 'Wrote debug log');
  return filePath;
}

export async function ingestText(request: IngestTextRequest): Promise<IngestResult> {
  const { env, mentor, kb, version, source_type, source_id, title, text, dryRun } = request;
  
  const namespace = buildNamespace({ env, mentor, kb, version });
  
  logger.info({
    service: 'ingestion',
    operation: 'ingest_text',
    namespace,
    sourceId: source_id,
    textLength: text.length,
    dryRun: !!dryRun
  }, 'Starting text ingestion');
  
  if (dryRun) {
    const preview = getDryRunPreview(text, { title, mentor, kb });
    return {
      namespace,
      totalChunks: preview.totalChunks,
      upsertedCount: 0,
      dryRunPreview: preview
    };
  }
  
  const chunks = chunkDocument(text, { title, mentor, kb });
  
  if (chunks.length === 0) {
    logger.warn({ namespace, sourceId: source_id }, 'No chunks generated from text');
    return {
      namespace,
      totalChunks: 0,
      upsertedCount: 0
    };
  }
  
  logger.info({ namespace, chunkCount: chunks.length }, 'Chunking complete, starting embedding');
  
  const embedder = getEmbedder();
  const textsToEmbed = chunks.map(c => c.textWithBreadcrumb);
  const embeddings = await embedder.embedBatch(textsToEmbed);
  
  logger.info({ namespace, embeddingCount: embeddings.length }, 'Embedding complete, starting upsert');
  
  const createdAt = new Date().toISOString();
  const debugEntries: DebugLogEntry[] = [];
  
  const vectors = chunks.map((chunk, index) => {
    const vectorId = buildVectorId(source_id, chunk.metadata.chunk_index);
    
    const metadata = {
      mentor,
      kb,
      env,
      source_type,
      source_id,
      title,
      section: chunk.metadata.section,
      chunk_index: chunk.metadata.chunk_index,
      text_preview: chunk.metadata.text_preview,
      text: chunk.text,
      created_at: createdAt
    };
    
    debugEntries.push({
      id: vectorId,
      namespace,
      source_id,
      chunk_index: chunk.metadata.chunk_index,
      section: chunk.metadata.section,
      text: chunk.text,
      text_with_breadcrumb: chunk.textWithBreadcrumb,
      metadata,
      created_at: createdAt
    });
    
    return {
      id: vectorId,
      values: embeddings[index],
      metadata
    };
  });
  
  let upsertedCount = 0;
  const index = await pineconeService.initializeIndex(PineconeIndexName.ASK_ELXR);
  const ns = index.namespace(namespace);
  
  for (let i = 0; i < vectors.length; i += UPSERT_BATCH_SIZE) {
    const batch = vectors.slice(i, i + UPSERT_BATCH_SIZE);
    
    try {
      await ns.upsert(batch);
      upsertedCount += batch.length;
      
      logger.debug({
        service: 'ingestion',
        batchIndex: Math.floor(i / UPSERT_BATCH_SIZE),
        batchSize: batch.length,
        totalUpserted: upsertedCount
      }, 'Upserted batch');
    } catch (error) {
      logger.error({
        service: 'ingestion',
        error: (error as Error).message,
        batchIndex: Math.floor(i / UPSERT_BATCH_SIZE)
      }, 'Failed to upsert batch');
      throw error;
    }
  }
  
  const debugLogPath = writeDebugLog(debugEntries, namespace, source_id);
  
  logger.info({
    service: 'ingestion',
    namespace,
    sourceId: source_id,
    totalChunks: chunks.length,
    upsertedCount
  }, 'Text ingestion complete');
  
  return {
    namespace,
    totalChunks: chunks.length,
    upsertedCount,
    debugLogPath
  };
}

export async function queryNamespace(request: QueryRequest): Promise<QueryResult> {
  const { env, mentor, kb, version, query, topK = 12 } = request;
  
  const namespace = buildNamespace({ env, mentor, kb, version });
  
  logger.info({
    service: 'ingestion',
    operation: 'query',
    namespace,
    queryLength: query.length,
    topK
  }, 'Starting namespace query');
  
  const embedder = getEmbedder();
  const queryEmbedding = await embedder.embed(query);
  
  const index = await pineconeService.initializeIndex(PineconeIndexName.ASK_ELXR);
  const ns = index.namespace(namespace);
  
  const results = await ns.query({
    vector: queryEmbedding,
    topK,
    includeMetadata: true,
    includeValues: false
  });
  
  const matches: QueryMatch[] = (results.matches || []).map(match => {
    const metadata = match.metadata as Record<string, any>;
    return {
      id: match.id,
      score: match.score || 0,
      metadata: {
        mentor: metadata?.mentor || '',
        kb: metadata?.kb || '',
        env: metadata?.env || '',
        source_type: metadata?.source_type || '',
        source_id: metadata?.source_id || '',
        title: metadata?.title || '',
        section: metadata?.section || '',
        chunk_index: metadata?.chunk_index || 0,
        text_preview: metadata?.text_preview || '',
        created_at: metadata?.created_at || ''
      },
      text: metadata?.text || undefined
    };
  });
  
  logger.info({
    service: 'ingestion',
    namespace,
    matchCount: matches.length
  }, 'Query complete');
  
  return {
    namespace,
    query,
    matches
  };
}

export async function deleteBySourceId(
  env: Environment,
  mentor: string,
  kb: string,
  version: number,
  sourceId: string
): Promise<{ namespace: string; deletedCount: number }> {
  const namespace = buildNamespace({ env, mentor, kb, version });
  
  logger.info({
    service: 'ingestion',
    operation: 'delete_source',
    namespace,
    sourceId
  }, 'Starting source deletion');
  
  const index = await pineconeService.initializeIndex(PineconeIndexName.ASK_ELXR);
  const ns = index.namespace(namespace);
  
  const vectorIds: string[] = [];
  let paginationToken: string | undefined;
  
  do {
    const listResponse = await ns.listPaginated({
      prefix: `${sourceId}:`,
      limit: 100,
      paginationToken
    });
    
    if (listResponse.vectors) {
      for (const v of listResponse.vectors) {
        if (v.id) vectorIds.push(v.id);
      }
    }
    
    paginationToken = listResponse.pagination?.next;
  } while (paginationToken);
  
  if (vectorIds.length > 0) {
    await ns.deleteMany(vectorIds);
  }
  
  logger.info({
    service: 'ingestion',
    namespace,
    sourceId,
    deletedCount: vectorIds.length
  }, 'Source deletion complete');
  
  return {
    namespace,
    deletedCount: vectorIds.length
  };
}
