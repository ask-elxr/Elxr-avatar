import { v4 as uuidv4 } from 'uuid';
import * as unzipper from 'unzipper';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { logger } from '../logger.js';
import { storage } from '../storage.js';
import { ingestPodcast } from './podcastIngestionService.js';
import type { PodcastBatch, PodcastEpisode } from '@shared/schema';

const TEMP_DIR = '/tmp/podcast-batches';
const VALID_EXTENSIONS = ['.txt', '.md', '.srt', '.vtt'];
const MAX_CONCURRENT_EPISODES = 2;
const DELAY_BETWEEN_EPISODES_MS = 2000;

export interface BatchUploadResult {
  batchId: string;
  namespace: string;
  totalEpisodes: number;
  episodeFilenames: string[];
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
  zipFilename: string
): Promise<BatchUploadResult> {
  const batchId = uuidv4();
  
  logger.info({ 
    batchId, 
    namespace, 
    zipFilename, 
    bufferSize: zipBuffer.length 
  }, 'Starting zip extraction for podcast batch');
  
  const batch = await storage.createPodcastBatch({
    namespace,
    zipFilename,
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
        await fs.promises.writeFile(filePath, content);
        
        await storage.createPodcastEpisode({
          batchId: batch.id,
          filename,
          textLength: content.length,
        });
        
        episodeFilenames.push(filename);
        logger.debug({ batchId: batch.id, filename }, 'Extracted episode file');
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
    const filePath = path.join(batchDir, episode.filename);
    
    logger.info({ 
      batchId, 
      episodeId: episode.id, 
      filename: episode.filename,
      progress: `${i + 1}/${pendingEpisodes.length}` 
    }, 'Processing episode');
    
    try {
      await storage.updatePodcastEpisode(episode.id, { status: 'processing' });
      
      const fileContent = await fs.promises.readFile(filePath, 'utf-8');
      
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
      
      const result = await ingestPodcast({
        namespace: batch.namespace,
        source: sourceId,
        rawText: fileContent,
        sourceType: 'podcast',
        dryRun: false,
      });
      
      await storage.updatePodcastEpisode(episode.id, {
        status: 'completed',
        chunksCount: result.totalChunks,
        discardedCount: result.discardedCount,
      });
      
      totalChunks += result.totalChunks;
      successCount++;
      
      logger.info({ 
        episodeId: episode.id, 
        filename: episode.filename,
        chunks: result.totalChunks 
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
  
  const processed = episodeCounts.completed + episodeCounts.failed + episodeCounts.skipped;
  const totalChunks = episodes.reduce((sum, e) => sum + (e.chunksCount || 0), 0);
  
  return {
    batch,
    episodes,
    progress: {
      percentage: episodeCounts.total > 0 ? Math.round((processed / episodeCounts.total) * 100) : 0,
      processed,
      total: episodeCounts.total,
      successful: episodeCounts.completed,
      failed: episodeCounts.failed,
      skipped: episodeCounts.skipped,
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

export async function resumeStuckBatches(): Promise<{ resumedCount: number }> {
  const batches = await storage.listPodcastBatches(50);
  const stuckBatches = batches.filter(b => 
    b.status === 'processing' || b.status === 'extracting'
  );
  
  if (stuckBatches.length === 0) {
    logger.info('No stuck batches found during startup recovery');
    return { resumedCount: 0 };
  }
  
  logger.info({ count: stuckBatches.length }, 'Found stuck batches, attempting recovery');
  
  for (const batch of stuckBatches) {
    const batchDir = path.join(TEMP_DIR, batch.id);
    const dirExists = await fs.promises.access(batchDir).then(() => true).catch(() => false);
    
    if (!dirExists) {
      logger.warn({ batchId: batch.id }, 'Batch temp directory missing, marking as failed');
      await storage.updatePodcastBatch(batch.id, {
        status: 'failed',
        error: 'Recovery failed: temp directory missing after restart'
      });
      continue;
    }
    
    logger.info({ batchId: batch.id }, 'Resuming stuck batch processing');
    processBatchEpisodes(batch.id).catch(error => {
      logger.error({ batchId: batch.id, error: (error as Error).message }, 'Failed to resume batch');
    });
  }
  
  return { resumedCount: stuckBatches.length };
}
