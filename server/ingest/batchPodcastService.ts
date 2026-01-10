import { v4 as uuidv4 } from 'uuid';
import * as unzipper from 'unzipper';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { logger } from '../logger.js';
import { storage } from '../storage.js';
import { ingestPodcast } from './podcastIngestionService.js';
import { classifyTranscript, type ClassificationResult } from './namespaceClassifier.js';
import type { PodcastBatch, PodcastEpisode } from '@shared/schema';

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

export async function extractZipAndCreateBatch(
  zipBuffer: Buffer,
  namespace: string,
  zipFilename: string,
  autoDetect: boolean = false
): Promise<BatchUploadResult> {
  const batchId = uuidv4();
  
  logger.info({ 
    batchId, 
    namespace, 
    zipFilename,
    autoDetect,
    bufferSize: zipBuffer.length 
  }, 'Starting zip extraction for podcast batch');
  
  const batch = await storage.createPodcastBatch({
    namespace,
    zipFilename,
    autoDetect,
  });
  
  const batchDir = await ensureTempDir(batch.id);
  const episodeFilenames: string[] = [];
  
  try {
    const zipStream = Readable.from(zipBuffer);
    const directory = await unzipper.Open.buffer(zipBuffer);
    
    for (const file of directory.files) {
      if (file.type === 'File' && isValidTranscriptFile(file.path)) {
        const filename = path.basename(file.path);
        const filePath = path.join(batchDir, filename);
        
        const content = await file.buffer();
        const transcriptText = content.toString('utf-8');
        
        // Write to temp dir for backward compatibility (will be removed later)
        await fs.promises.writeFile(filePath, content);
        
        // Store transcript in database for reliability (survives server restarts)
        await storage.createPodcastEpisode({
          batchId: batch.id,
          filename,
          textLength: content.length,
          transcriptText,
        });
        
        episodeFilenames.push(filename);
        logger.debug({ batchId: batch.id, filename }, 'Extracted episode file to DB');
      }
    }
    
    await storage.updatePodcastBatch(batch.id, {
      status: 'extracting',
      totalEpisodes: episodeFilenames.length,
    });
    
    logger.info({ 
      batchId: batch.id, 
      totalEpisodes: episodeFilenames.length 
    }, 'Zip extraction complete');
    
    return {
      batchId: batch.id,
      namespace,
      autoDetect,
      totalEpisodes: episodeFilenames.length,
      episodeFilenames,
    };
  } catch (error) {
    logger.error({ 
      batchId: batch.id, 
      error: (error as Error).message 
    }, 'Failed to extract zip file');
    
    await storage.updatePodcastBatch(batch.id, {
      status: 'failed',
      error: (error as Error).message,
    });
    
    await cleanupBatchDir(batch.id);
    throw error;
  }
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
  const pendingEpisodes = episodes.filter(e => e.status === 'pending');
  
  logger.info({ 
    batchId, 
    totalEpisodes: episodes.length,
    pendingEpisodes: pendingEpisodes.length 
  }, 'Starting batch episode processing');
  
  await storage.updatePodcastBatch(batchId, { status: 'processing' });
  
  const batchDir = path.join(TEMP_DIR, batchId);
  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;
  let totalChunks = 0;
  
  for (let i = 0; i < pendingEpisodes.length; i++) {
    const episode = pendingEpisodes[i];
    
    logger.info({ 
      batchId, 
      episodeId: episode.id, 
      filename: episode.filename,
      progress: `${i + 1}/${pendingEpisodes.length}`,
      hasDbTranscript: !!episode.transcriptText
    }, 'Processing episode');
    
    try {
      await storage.updatePodcastEpisode(episode.id, { status: 'processing' });
      
      // First try to read from database (reliable), then fall back to temp file (legacy)
      let fileContent: string;
      if (episode.transcriptText) {
        fileContent = episode.transcriptText;
      } else {
        // Fallback to temp file for backward compatibility
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
      
      const sourceId = `batch-${batchId}-${episode.filename.replace(/\.[^/.]+$/, '')}`;
      
      const namespacesToIngest = batch.autoDetect && episode.predictedNamespaces?.length
        ? episode.predictedNamespaces
        : [batch.namespace];
      
      let episodeTotalChunks = 0;
      let episodeDiscardedCount = 0;
      
      for (const ns of namespacesToIngest) {
        const nsSourceId = namespacesToIngest.length > 1 
          ? `${sourceId}-${ns.toLowerCase()}`
          : sourceId;
          
        const result = await ingestPodcast({
          namespace: ns,
          source: nsSourceId,
          rawText: fileContent,
          sourceType: 'podcast',
          dryRun: false,
        });
        
        episodeTotalChunks += result.totalChunks;
        episodeDiscardedCount += result.discardedCount;
        
        logger.debug({ 
          episodeId: episode.id, 
          namespace: ns, 
          chunks: result.totalChunks 
        }, 'Ingested to namespace');
      }
      
      await storage.updatePodcastEpisode(episode.id, {
        status: 'completed',
        chunksCount: episodeTotalChunks,
        discardedCount: episodeDiscardedCount,
      });
      
      totalChunks += episodeTotalChunks;
      successCount++;
      
      logger.info({ 
        episodeId: episode.id, 
        filename: episode.filename,
        chunks: episodeTotalChunks,
        namespaces: namespacesToIngest
      }, 'Episode processed successfully');
      
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
    
    await storage.updatePodcastBatch(batchId, {
      processedEpisodes: i + 1,
      successfulEpisodes: successCount,
      failedEpisodes: failCount,
      skippedEpisodes: skipCount,
      totalChunks,
    });
    
    if (i < pendingEpisodes.length - 1) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_EPISODES_MS));
    }
  }
  
  const finalStatus = failCount === pendingEpisodes.length ? 'failed' : 'completed';
  
  await storage.updatePodcastBatch(batchId, {
    status: finalStatus,
    processedEpisodes: pendingEpisodes.length,
    successfulEpisodes: successCount,
    failedEpisodes: failCount,
    skippedEpisodes: skipCount,
    totalChunks,
  });
  
  await cleanupBatchDir(batchId);
  
  logger.info({ 
    batchId, 
    status: finalStatus,
    successful: successCount,
    failed: failCount,
    skipped: skipCount,
    totalChunks
  }, 'Batch processing complete');
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
    b.status === 'processing' || b.status === 'extracting' || b.status === 'classifying'
  );
  
  if (stuckBatches.length === 0) {
    logger.info('No stuck batches found during startup recovery');
    return { resumedCount: 0, failedCount: 0 };
  }
  
  logger.info({ count: stuckBatches.length }, 'Found stuck batches, attempting recovery');
  
  let resumedCount = 0;
  let failedCount = 0;
  
  for (const batch of stuckBatches) {
    // Check if episodes have transcripts stored in database (new reliable method)
    const episodes = await storage.getPodcastEpisodesByBatch(batch.id);
    const episodesWithTranscripts = episodes.filter(e => e.transcriptText);
    const pendingEpisodes = episodes.filter(e => e.status === 'pending' || e.status === 'processing');
    
    // If episodes have transcripts in DB, we can resume without temp files
    if (episodesWithTranscripts.length > 0 && pendingEpisodes.length > 0) {
      logger.info({ 
        batchId: batch.id, 
        episodesWithTranscripts: episodesWithTranscripts.length,
        pendingEpisodes: pendingEpisodes.length
      }, 'Resuming batch from database transcripts');
      
      // Reset any episodes stuck in 'processing' back to 'pending'
      for (const ep of episodes.filter(e => e.status === 'processing')) {
        await storage.updatePodcastEpisode(ep.id, { status: 'pending' });
      }
      
      // Resume processing
      processBatchEpisodes(batch.id).catch(error => {
        logger.error({ batchId: batch.id, error: (error as Error).message }, 'Failed to resume batch');
      });
      resumedCount++;
      continue;
    }
    
    // Legacy: Check if temp directory exists
    const batchDir = path.join(TEMP_DIR, batch.id);
    const dirExists = await fs.promises.access(batchDir).then(() => true).catch(() => false);
    
    if (dirExists) {
      logger.info({ batchId: batch.id }, 'Resuming stuck batch from temp files (legacy)');
      processBatchEpisodes(batch.id).catch(error => {
        logger.error({ batchId: batch.id, error: (error as Error).message }, 'Failed to resume batch');
      });
      resumedCount++;
      continue;
    }
    
    // No transcripts in DB and no temp files - can't recover
    logger.warn({ batchId: batch.id }, 'Batch has no transcripts in DB and temp directory missing, marking as failed');
    await storage.updatePodcastBatch(batch.id, {
      status: 'failed',
      error: 'Recovery failed: no transcripts in database and temp directory missing. Please re-upload ZIP.'
    });
    failedCount++;
  }
  
  logger.info({ resumedCount, failedCount }, 'Batch recovery complete');
  return { resumedCount, failedCount };
}
