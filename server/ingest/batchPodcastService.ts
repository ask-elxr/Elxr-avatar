import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import * as unzipper from 'unzipper';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { logger } from '../logger.js';
import { storage } from '../storage.js';
import { extractSubstance, chunkPodcastContent } from './podcastIngestionService.js';
import { embedAndUploadMicroBatch, prepareChunksForStorage, loadChunksFromStorage, type ChunkRecord } from './microBatchIngestion.js';
import { classifyTranscript, type ClassificationResult } from './namespaceClassifier.js';
import { distillAndChunkTranscript } from './podcastDistillationService.js';
import type { PodcastBatch, PodcastEpisode } from '@shared/schema';

function computeContentHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

const TEMP_DIR = '/tmp/podcast-batches';
const VALID_EXTENSIONS = ['.txt', '.md', '.srt', '.vtt'];
const MAX_CONCURRENT_EPISODES = 2;
const DELAY_BETWEEN_EPISODES_MS = 2000;

export interface BatchUploadResult {
  batchId: string;
  namespace: string;
  autoDetect: boolean;
  totalEpisodes: number;
  episodeFilenames: string[];
}

export interface EpisodeClassification {
  episodeId: string;
  filename: string;
  primaryNamespace: string;
  secondaryNamespace?: string;
  confidence: number;
  rationale: string;
}

export interface BatchStatusResult {
  batch: PodcastBatch;
  episodes: PodcastEpisode[];
  progress: {
    percentage: number;
    processed: number;
    total: number;
    successful: number;
    failed: number;
    skipped: number;
    classifiedCount: number;
  };
}

async function ensureTempDir(batchId: string): Promise<string> {
  const batchDir = path.join(TEMP_DIR, batchId);
  await fs.promises.mkdir(batchDir, { recursive: true });
  return batchDir;
}

async function cleanupBatchDir(batchId: string): Promise<void> {
  const batchDir = path.join(TEMP_DIR, batchId);
  try {
    await fs.promises.rm(batchDir, { recursive: true, force: true });
    logger.debug({ batchId }, 'Cleaned up batch temp directory');
  } catch (error) {
    logger.warn({ batchId, error: (error as Error).message }, 'Failed to cleanup batch directory');
  }
}

function isValidTranscriptFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  const basename = path.basename(filename);
  return VALID_EXTENSIONS.includes(ext) && 
         !basename.startsWith('.') && 
         !basename.startsWith('__MACOSX');
}

async function performZipExtraction(
  batch: { id: string },
  zipBuffer: Buffer,
  namespace: string,
  autoDetect: boolean,
  distillMode: 'chunks' | 'mentor_memory',
  mentorName?: string
): Promise<{ episodeFilenames: string[]; skippedDuplicates: number }> {
  const batchDir = await ensureTempDir(batch.id);
  const episodeFilenames: string[] = [];
  
  const directory = await unzipper.Open.buffer(zipBuffer);
  
  let skippedDuplicates = 0;
  
  for (const file of directory.files) {
    if (file.type === 'File' && isValidTranscriptFile(file.path)) {
      const filename = path.basename(file.path);
      const filePath = path.join(batchDir, filename);
      
      const content = await file.buffer();
      const transcriptText = content.toString('utf-8');
      const contentHash = computeContentHash(transcriptText);
      
      const existingEpisode = await storage.findPodcastEpisodeByHash(contentHash);
      if (existingEpisode && existingEpisode.status === 'completed') {
        skippedDuplicates++;
        logger.info({ 
          batchId: batch.id, 
          filename,
          existingEpisodeId: existingEpisode.id,
          existingFilename: existingEpisode.filename 
        }, 'Skipping duplicate episode - content already ingested');
        continue;
      }
      
      await fs.promises.writeFile(filePath, content);
      
      await storage.createPodcastEpisode({
        batchId: batch.id,
        filename,
        textLength: content.length,
        transcriptText,
        contentHash,
      });
      
      episodeFilenames.push(filename);
      logger.debug({ batchId: batch.id, filename, contentHash: contentHash.slice(0, 8) }, 'Extracted episode file to DB');
    }
  }
  
  if (skippedDuplicates > 0) {
    logger.info({ 
      batchId: batch.id, 
      skippedDuplicates,
      newEpisodes: episodeFilenames.length 
    }, 'Skipped duplicate episodes during extraction');
  }
  
  await storage.updatePodcastBatch(batch.id, {
    status: 'extracting',
    totalEpisodes: episodeFilenames.length,
  });
  
  logger.info({ 
    batchId: batch.id, 
    totalEpisodes: episodeFilenames.length 
  }, 'Zip extraction complete');
  
  return { episodeFilenames, skippedDuplicates };
}

export async function extractZipAndCreateBatch(
  zipBuffer: Buffer,
  namespace: string,
  zipFilename: string,
  autoDetect: boolean = false,
  distillMode: 'chunks' | 'mentor_memory' = 'chunks',
  mentorName?: string
): Promise<BatchUploadResult> {
  logger.info({ 
    namespace, 
    zipFilename,
    autoDetect,
    distillMode,
    mentorName,
    bufferSize: zipBuffer.length 
  }, 'Starting zip extraction for podcast batch');
  
  const batch = await storage.createPodcastBatch({
    namespace,
    zipFilename,
    autoDetect,
    distillMode,
    mentorName,
  });
  
  performZipExtraction(batch, zipBuffer, namespace, autoDetect, distillMode, mentorName)
    .then(async ({ episodeFilenames }) => {
      if (autoDetect) {
        classifyBatchEpisodes(batch.id).then(() => {
          logger.info({ batchId: batch.id }, 'Batch classification complete, ready for review');
        }).catch(error => {
          logger.error({ batchId: batch.id, error: (error as Error).message }, 'Batch classification failed');
        });
      } else {
        processBatchEpisodes(batch.id).catch(error => {
          logger.error({ batchId: batch.id, error: (error as Error).message }, 'Background batch processing failed');
        });
      }
    })
    .catch(async (error) => {
      logger.error({ 
        batchId: batch.id, 
        error: (error as Error).message 
      }, 'Failed to extract zip file');
      
      await storage.updatePodcastBatch(batch.id, {
        status: 'failed',
        error: (error as Error).message,
      });
      
      await cleanupBatchDir(batch.id);
    });
  
  return {
    batchId: batch.id,
    namespace,
    autoDetect,
    totalEpisodes: 0,
    episodeFilenames: [],
  };
}

export async function classifyBatchEpisodes(batchId: string): Promise<EpisodeClassification[]> {
  const batch = await storage.getPodcastBatch(batchId);
  if (!batch) {
    throw new Error(`Batch ${batchId} not found`);
  }
  
  const episodes = await storage.getPodcastEpisodesByBatch(batchId);
  const unclassifiedEpisodes = episodes.filter(e => !e.primaryNamespace && !e.manualOverride);
  
  logger.info({ 
    batchId, 
    totalEpisodes: episodes.length,
    toClassify: unclassifiedEpisodes.length 
  }, 'Starting batch episode classification');
  
  const batchDir = path.join(TEMP_DIR, batchId);
  const classifications: EpisodeClassification[] = [];
  
  for (const episode of unclassifiedEpisodes) {
    try {
      // First try to read from database (reliable), then fall back to temp file (legacy)
      let fileContent: string;
      if (episode.transcriptText) {
        fileContent = episode.transcriptText;
        logger.debug({ filename: episode.filename }, 'Reading transcript from database');
      } else {
        // Fallback to temp file for backward compatibility
        const filePath = path.join(batchDir, episode.filename);
        fileContent = await fs.promises.readFile(filePath, 'utf-8');
        logger.debug({ filename: episode.filename }, 'Reading transcript from temp file (legacy)');
      }
      
      if (fileContent.trim().length < 100) {
        logger.debug({ filename: episode.filename }, 'Content too short for classification');
        continue;
      }
      
      const result = await classifyTranscript(fileContent, episode.filename);
      
      const namespaces = result.secondary 
        ? [result.primary, result.secondary]
        : [result.primary];
      
      await storage.updatePodcastEpisode(episode.id, {
        predictedNamespaces: namespaces,
        primaryNamespace: result.primary,
        confidence: result.confidence,
        classificationRationale: result.rationale,
      });
      
      classifications.push({
        episodeId: episode.id,
        filename: episode.filename,
        primaryNamespace: result.primary,
        secondaryNamespace: result.secondary,
        confidence: result.confidence,
        rationale: result.rationale,
      });
      
      logger.info({ 
        filename: episode.filename,
        primary: result.primary,
        secondary: result.secondary || 'none',
        confidence: result.confidence
      }, 'Episode classified');
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      logger.error({ 
        episodeId: episode.id, 
        error: (error as Error).message 
      }, 'Failed to classify episode');
    }
  }
  
  logger.info({ 
    batchId, 
    classified: classifications.length 
  }, 'Batch classification complete');
  
  return classifications;
}

export async function updateEpisodeNamespace(
  episodeId: string,
  primaryNamespace: string,
  secondaryNamespace?: string
): Promise<void> {
  const namespaces = secondaryNamespace 
    ? [primaryNamespace, secondaryNamespace]
    : [primaryNamespace];
    
  await storage.updatePodcastEpisode(episodeId, {
    predictedNamespaces: namespaces,
    primaryNamespace,
    manualOverride: true,
  });
  
  logger.info({ episodeId, primaryNamespace, secondaryNamespace }, 'Episode namespace updated manually');
}

export async function processBatchEpisodes(batchId: string): Promise<void> {
  const batch = await storage.getPodcastBatch(batchId);
  if (!batch) {
    throw new Error(`Batch ${batchId} not found`);
  }
  
  const episodes = await storage.getPodcastEpisodesByBatch(batchId);
  
  // Helper to check if all namespaces are complete for an episode
  const isEpisodeFullyComplete = (e: typeof episodes[0]): boolean => {
    if (!e.chunksJson || !e.chunksCount) return e.status === 'completed';
    
    const namespacesToCheck = batch.autoDetect && e.predictedNamespaces?.length
      ? e.predictedNamespaces
      : [batch.namespace];
    
    const progress = (e.namespaceProgress as Record<string, number>) || {};
    return namespacesToCheck.every(ns => (progress[ns.toUpperCase()] || 0) >= (e.chunksCount || 0));
  };
  
  // Include episodes that are pending, processing, or have incomplete namespace uploads
  const episodesToProcess = episodes.filter(e => 
    e.status === 'pending' || 
    e.status === 'processing' ||
    (e.chunksJson && !isEpisodeFullyComplete(e))
  );
  
  logger.info({ 
    batchId, 
    totalEpisodes: episodes.length,
    episodesToProcess: episodesToProcess.length 
  }, 'Starting micro-batch episode processing');
  
  await storage.updatePodcastBatch(batchId, { status: 'processing' });
  
  const batchDir = path.join(TEMP_DIR, batchId);
  let successCount = episodes.filter(e => e.status === 'completed').length;
  let failCount = episodes.filter(e => e.status === 'failed').length;
  let skipCount = episodes.filter(e => e.status === 'skipped').length;
  let totalChunks = episodes.reduce((sum, e) => sum + (e.chunksCount || 0), 0);
  
  for (let i = 0; i < episodesToProcess.length; i++) {
    const episode = episodesToProcess[i];
    
    logger.info({ 
      batchId, 
      episodeId: episode.id, 
      filename: episode.filename,
      progress: `${i + 1}/${episodesToProcess.length}`,
      hasDbTranscript: !!episode.transcriptText,
      hasPreChunked: !!episode.chunksJson,
      chunksUploaded: episode.chunksUploaded || 0,
    }, 'Processing episode (micro-batch mode)');
    
    try {
      await storage.updatePodcastEpisode(episode.id, { status: 'processing' });
      
      let chunks: ChunkRecord[];
      let discardedCount = episode.discardedCount || 0;
      
      // Check if we already have pre-chunked data (resuming interrupted upload)
      if (episode.chunksJson && Array.isArray(episode.chunksJson)) {
        chunks = loadChunksFromStorage(episode.chunksJson);
        logger.info({ 
          episodeId: episode.id, 
          existingChunks: chunks.length,
          alreadyUploaded: episode.chunksUploaded || 0
        }, 'Resuming from pre-chunked data');
      } else {
        // Step 1: Get transcript from DB or temp file
        let fileContent: string;
        if (episode.transcriptText) {
          fileContent = episode.transcriptText;
        } else {
          const filePath = path.join(batchDir, episode.filename);
          try {
            fileContent = await fs.promises.readFile(filePath, 'utf-8');
          } catch (readError) {
            throw new Error(`Transcript not found in database or temp file. Server may have restarted. Please re-upload.`);
          }
        }
        
        if (fileContent.trim().length < 100) {
          logger.warn({ episodeId: episode.id, filename: episode.filename }, 'Episode too short, skipping');
          await storage.updatePodcastEpisode(episode.id, { 
            status: 'skipped',
            error: 'Content too short (less than 100 characters)'
          });
          skipCount++;
          continue;
        }
        
        // Step 2: Process content based on distillMode
        const sourceId = `batch-${batchId}-${episode.filename.replace(/\.[^/.]+$/, '')}`;
        
        if (batch.distillMode === 'mentor_memory') {
          // DISTILLATION MODE: Extract wisdom and convert to mentor memory
          logger.info({ episodeId: episode.id, distillMode: batch.distillMode, mentorName: batch.mentorName }, 
            'Distilling transcript into mentor wisdom');
          
          const distillationChunks = await distillAndChunkTranscript(
            fileContent,
            batch.namespace,
            batch.mentorName || 'Mentor',
            'mentor_memory'
          );
          
          if (distillationChunks.length === 0) {
            logger.warn({ episodeId: episode.id }, 'No wisdom extracted from transcript');
            await storage.updatePodcastEpisode(episode.id, { 
              status: 'skipped',
              error: 'No extractable wisdom from transcript (may be low-signal content)'
            });
            skipCount++;
            continue;
          }
          
          // Convert distillation chunks to ChunkRecord format with extended metadata
          // The additional fields (doc_type, kind, mentor, derived) are preserved via ChunkRecord's
          // flexible structure and will be included in Pinecone metadata
          chunks = distillationChunks.map(dc => ({
            id: dc.id,
            text: dc.text,
            content_type: dc.metadata.doc_type, // 'mentor_memory' or 'learned_wisdom'
            tone: 'reflective', // distilled wisdom has a reflective tone
            topic: dc.metadata.kind, // 'principle', 'mental_model', 'heuristic', etc.
            confidence: dc.metadata.confidence || 'medium',
            voice_origin: 'avatar_native', // distilled wisdom is in mentor's voice
            attribution: `distilled:${dc.metadata.mentor || 'Mentor'}`,
            // Extended metadata for distillation tracking
            doc_type: dc.metadata.doc_type,
            kind: dc.metadata.kind,
            mentor: dc.metadata.mentor || batch.mentorName || 'Mentor',
            derived: 'true' // string because metadata values must be strings
          } as ChunkRecord & Record<string, string>));
          discardedCount = 0;
          
          logger.info({ 
            episodeId: episode.id, 
            wisdomChunks: chunks.length,
            types: distillationChunks.map(c => c.metadata.kind).filter((v, i, a) => a.indexOf(v) === i)
          }, 'Distillation complete');
          
        } else {
          // CONVERSATIONAL CHUNKS MODE: Original extraction + chunking
          logger.info({ episodeId: episode.id }, 'Extracting substance from transcript');
          const extractedText = await extractSubstance(fileContent);
          
          if (extractedText.length < 100) {
            logger.warn({ episodeId: episode.id }, 'Not enough substantive content after extraction');
            await storage.updatePodcastEpisode(episode.id, { 
              status: 'skipped',
              error: 'Not enough substantive content after extraction'
            });
            skipCount++;
            continue;
          }
          
          // Step 3: Chunk the content (Claude AI processing)
          logger.info({ episodeId: episode.id }, 'Chunking extracted content');
          const chunkResult = await chunkPodcastContent(extractedText);
          discardedCount = chunkResult.discardedCount;
          
          // Step 4: Prepare chunks with IDs for storage
          chunks = prepareChunksForStorage(chunkResult.chunks, sourceId);
        }
        
        // Step 5: Save pre-chunked data to database (CRITICAL for resumability)
        await storage.updatePodcastEpisode(episode.id, {
          chunksJson: chunks,
          chunksCount: chunks.length,
          discardedCount,
          chunksUploaded: 0,
        });
        
        logger.info({ 
          episodeId: episode.id, 
          chunksCount: chunks.length,
          discardedCount 
        }, 'Pre-chunked data saved to database');
      }
      
      // Step 6: Determine namespaces
      const namespacesToIngest = batch.autoDetect && episode.predictedNamespaces?.length
        ? episode.predictedNamespaces
        : [batch.namespace];
      
      // Step 7: Micro-batch embed and upload to each namespace
      // IMPORTANT: For multi-namespace, we embed once and upload to each namespace separately
      // Each namespace gets its own upload progress tracking (persisted to DB for resumability)
      const sourceId = `batch-${batchId}-${episode.filename.replace(/\.[^/.]+$/, '')}`;
      let episodeTotalChunks = chunks.length;
      
      // Get namespace-specific progress from database (for resumability)
      const namespaceProgress: Record<string, number> = 
        (episode.namespaceProgress as Record<string, number>) || {};
      
      for (const ns of namespacesToIngest) {
        const nsSourceId = namespacesToIngest.length > 1 
          ? `${sourceId}-${ns.toLowerCase()}`
          : sourceId;
        
        // For each namespace, check if already fully uploaded
        const nsKey = ns.toUpperCase();
        const nsChunksUploaded = namespaceProgress[nsKey] || 0;
        
        if (nsChunksUploaded >= chunks.length) {
          logger.info({ 
            episodeId: episode.id, 
            namespace: ns, 
            alreadyUploaded: nsChunksUploaded
          }, 'Namespace already fully uploaded, skipping');
          continue;
        }
        
        // Each namespace starts fresh (we re-embed and upload all chunks)
        // This is necessary because Pinecone stores per-namespace
        const result = await embedAndUploadMicroBatch(
          episode.id,
          chunks,
          ns,
          nsSourceId,
          'podcast',
          nsChunksUploaded // Resume from where this namespace left off
        );
        
        // Track per-namespace progress and persist to database (for resumability)
        namespaceProgress[nsKey] = result.chunksUploaded;
        
        // Save namespace progress to database after each namespace completes
        await storage.updatePodcastEpisode(episode.id, {
          namespaceProgress: namespaceProgress,
        });
        
        logger.info({ 
          episodeId: episode.id, 
          namespace: ns, 
          chunks: result.chunksUploaded,
          namespaceProgress
        }, 'Micro-batch upload complete for namespace');
      }
      
      // Check if all namespaces are complete
      const allNamespacesComplete = namespacesToIngest.every(ns => 
        (namespaceProgress[ns.toUpperCase()] || 0) >= chunks.length
      );
      
      if (allNamespacesComplete) {
        await storage.updatePodcastEpisode(episode.id, {
          status: 'completed',
          chunksCount: episodeTotalChunks,
          chunksUploaded: episodeTotalChunks,
          discardedCount,
        });
        
        totalChunks += episodeTotalChunks;
        successCount++;
        
        logger.info({ 
          episodeId: episode.id, 
          filename: episode.filename,
          chunks: episodeTotalChunks,
          namespaces: namespacesToIngest
        }, 'Episode processed successfully (micro-batch mode)');
      } else {
        // Still processing - update progress but don't mark complete
        logger.warn({ 
          episodeId: episode.id, 
          namespaceProgress,
          totalChunks: chunks.length
        }, 'Not all namespaces complete - episode still in progress');
      }
      
    } catch (error) {
      logger.error({ 
        episodeId: episode.id, 
        filename: episode.filename,
        error: (error as Error).message 
      }, 'Failed to process episode');
      
      await storage.updatePodcastEpisode(episode.id, {
        status: 'failed',
        error: (error as Error).message,
      });
      
      failCount++;
    }
    
    // Update batch progress
    const allEpisodes = await storage.getPodcastEpisodesByBatch(batchId);
    const processedCount = allEpisodes.filter(e => 
      e.status === 'completed' || e.status === 'failed' || e.status === 'skipped'
    ).length;
    
    await storage.updatePodcastBatch(batchId, {
      processedEpisodes: processedCount,
      successfulEpisodes: allEpisodes.filter(e => e.status === 'completed').length,
      failedEpisodes: allEpisodes.filter(e => e.status === 'failed').length,
      skippedEpisodes: allEpisodes.filter(e => e.status === 'skipped').length,
      totalChunks: allEpisodes.reduce((sum, e) => sum + (e.chunksCount || 0), 0),
    });
    
    // Sleep between episodes
    if (i < episodesToProcess.length - 1) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_EPISODES_MS));
    }
  }
  
  // Recalculate final counts
  const finalEpisodes = await storage.getPodcastEpisodesByBatch(batchId);
  const finalSuccess = finalEpisodes.filter(e => e.status === 'completed').length;
  const finalFail = finalEpisodes.filter(e => e.status === 'failed').length;
  const finalSkip = finalEpisodes.filter(e => e.status === 'skipped').length;
  const finalChunks = finalEpisodes.reduce((sum, e) => sum + (e.chunksCount || 0), 0);
  
  const finalStatus = finalFail === finalEpisodes.length ? 'failed' : 'completed';
  
  await storage.updatePodcastBatch(batchId, {
    status: finalStatus,
    processedEpisodes: finalEpisodes.length,
    successfulEpisodes: finalSuccess,
    failedEpisodes: finalFail,
    skippedEpisodes: finalSkip,
    totalChunks: finalChunks,
  });
  
  await cleanupBatchDir(batchId);
  
  logger.info({ 
    batchId, 
    status: finalStatus,
    successful: finalSuccess,
    failed: finalFail,
    skipped: finalSkip,
    totalChunks: finalChunks
  }, 'Micro-batch processing complete');
}

export async function getBatchStatus(batchId: string): Promise<BatchStatusResult | null> {
  const batch = await storage.getPodcastBatch(batchId);
  if (!batch) {
    return null;
  }
  
  const episodes = await storage.getPodcastEpisodesByBatch(batchId);
  
  const episodeCounts = {
    total: episodes.length,
    pending: episodes.filter(e => e.status === 'pending').length,
    processing: episodes.filter(e => e.status === 'processing').length,
    completed: episodes.filter(e => e.status === 'completed').length,
    failed: episodes.filter(e => e.status === 'failed').length,
    skipped: episodes.filter(e => e.status === 'skipped').length,
  };
  
  // Count classified episodes (those with a primary namespace assigned)
  const classifiedCount = episodes.filter(e => e.primaryNamespace !== null).length;
  
  const processed = episodeCounts.completed + episodeCounts.failed + episodeCounts.skipped;
  const totalChunks = episodes.reduce((sum, e) => sum + (e.chunksCount || 0), 0);
  
  // During classifying phase, show classification progress instead of processing progress
  const isClassifying = batch.status === 'classifying' || (batch.autoDetect && batch.status === 'extracting');
  const progressPercentage = isClassifying
    ? (episodeCounts.total > 0 ? Math.round((classifiedCount / episodeCounts.total) * 100) : 0)
    : (episodeCounts.total > 0 ? Math.round((processed / episodeCounts.total) * 100) : 0);
  
  return {
    batch,
    episodes,
    progress: {
      percentage: progressPercentage,
      processed,
      total: episodeCounts.total,
      successful: episodeCounts.completed,
      failed: episodeCounts.failed,
      skipped: episodeCounts.skipped,
      classifiedCount,
    },
  };
}

export async function retryFailedEpisodes(batchId: string): Promise<{ retriedCount: number }> {
  const episodes = await storage.getPodcastEpisodesByBatch(batchId);
  const failedEpisodes = episodes.filter(e => e.status === 'failed');
  
  if (failedEpisodes.length === 0) {
    return { retriedCount: 0 };
  }
  
  for (const episode of failedEpisodes) {
    await storage.updatePodcastEpisode(episode.id, { 
      status: 'pending',
      error: null,
    });
  }
  
  await storage.updatePodcastBatch(batchId, {
    status: 'processing',
    failedEpisodes: 0,
  });
  
  processBatchEpisodes(batchId).catch(error => {
    logger.error({ batchId, error: (error as Error).message }, 'Retry processing failed');
  });
  
  return { retriedCount: failedEpisodes.length };
}

export async function listBatches(limit: number = 20): Promise<PodcastBatch[]> {
  return storage.listPodcastBatches(limit);
}

export async function resumeStuckBatches(): Promise<{ resumedCount: number; failedCount: number }> {
  const batches = await storage.listPodcastBatches(50);
  const stuckBatches = batches.filter(b => 
    b.status === 'processing' || b.status === 'extracting' || b.status === 'classifying' || b.status === 'failed' || (b.status === 'pending' && b.totalEpisodes === 0)
  );
  
  if (stuckBatches.length === 0) {
    logger.info('No stuck batches found during startup recovery');
    return { resumedCount: 0, failedCount: 0 };
  }
  
  logger.info({ count: stuckBatches.length }, 'Found stuck/failed batches, attempting recovery');
  
  let resumedCount = 0;
  let failedCount = 0;
  
  for (const batch of stuckBatches) {
    const episodes = await storage.getPodcastEpisodesByBatch(batch.id);
    const episodesWithTranscripts = episodes.filter(e => e.transcriptText);
    const retryableEpisodes = episodes.filter(e => e.status === 'pending' || e.status === 'processing' || e.status === 'failed');
    
    if (episodesWithTranscripts.length > 0 && retryableEpisodes.length > 0) {
      logger.info({ 
        batchId: batch.id, 
        episodesWithTranscripts: episodesWithTranscripts.length,
        retryableEpisodes: retryableEpisodes.length
      }, 'Resuming batch from database transcripts');
      
      for (const ep of episodes.filter(e => e.status === 'processing' || e.status === 'failed')) {
        await storage.updatePodcastEpisode(ep.id, { status: 'pending', error: null });
      }
      
      const totalCount = episodes.length;
      await storage.updatePodcastBatch(batch.id, { 
        status: 'processing', 
        error: null,
        totalEpisodes: totalCount > (batch.totalEpisodes || 0) ? totalCount : batch.totalEpisodes 
      });
      
      processBatchEpisodes(batch.id).catch(error => {
        logger.error({ batchId: batch.id, error: (error as Error).message }, 'Failed to resume batch');
      });
      resumedCount++;
      continue;
    }
    
    const batchDir = path.join(TEMP_DIR, batch.id);
    const dirExists = await fs.promises.access(batchDir).then(() => true).catch(() => false);
    
    if (dirExists) {
      logger.info({ batchId: batch.id }, 'Resuming stuck batch from temp files (legacy)');
      
      for (const ep of episodes.filter(e => e.status === 'failed')) {
        await storage.updatePodcastEpisode(ep.id, { status: 'pending', error: null });
      }
      await storage.updatePodcastBatch(batch.id, { status: 'processing', error: null });
      
      processBatchEpisodes(batch.id).catch(error => {
        logger.error({ batchId: batch.id, error: (error as Error).message }, 'Failed to resume batch');
      });
      resumedCount++;
      continue;
    }
    
    if (batch.status !== 'failed') {
      logger.warn({ batchId: batch.id }, 'Batch has no transcripts in DB and temp directory missing, marking as failed');
      await storage.updatePodcastBatch(batch.id, {
        status: 'failed',
        error: 'Recovery failed: no transcripts in database and temp directory missing. Please re-upload ZIP.'
      });
    }
    failedCount++;
  }
  
  logger.info({ resumedCount, failedCount }, 'Batch recovery complete');
  return { resumedCount, failedCount };
}
