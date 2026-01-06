import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { ingestText, queryNamespace, deleteBySourceId } from '../ingest/ingestionService.js';
import { validateNamespaceParams } from '../ingest/namespaceUtils.js';
import { 
  ingestCourseTranscript, 
  deleteNamespaceVectors,
  getNamespaceStats
} from '../ingest/courseIngestionService.js';
import { ingestPodcast } from '../ingest/podcastIngestionService.js';
import { logger } from '../logger.js';

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

const router = Router();

const ADMIN_SECRET = process.env.ADMIN_SECRET;

function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const adminKey = req.headers['x-admin-secret'] || req.headers['x-admin-key'];
  
  if (!ADMIN_SECRET) {
    logger.error({ service: 'ingest-routes' }, 'ADMIN_SECRET not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }
  
  // Normalize both values - trim whitespace and handle array case
  const normalizedAdminKey = Array.isArray(adminKey) ? adminKey[0] : String(adminKey || '').trim();
  const normalizedSecret = ADMIN_SECRET.trim();
  
  if (!normalizedAdminKey || normalizedAdminKey !== normalizedSecret) {
    logger.warn({
      service: 'ingest-routes',
      operation: 'auth_failed',
      hasAdminKey: !!adminKey,
      adminKeyLength: normalizedAdminKey.length,
      expectedLength: normalizedSecret.length,
      path: req.path
    }, 'Admin authentication failed');
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing X-Admin-Secret header' });
  }
  
  next();
}

const IngestTextSchema = z.object({
  env: z.enum(['prod', 'staging']),
  mentor: z.string().min(1, 'Mentor slug is required'),
  kb: z.string().min(1, 'Knowledge base slug is required'),
  version: z.number().int().positive('Version must be a positive integer'),
  source_type: z.enum(['pdf', 'url', 'transcript', 'doc']),
  source_id: z.string().min(1, 'Source ID is required'),
  title: z.string().min(1, 'Title is required'),
  text: z.string().min(1, 'Text content is required'),
  dryRun: z.boolean().optional()
});

const QuerySchema = z.object({
  env: z.enum(['prod', 'staging']),
  mentor: z.string().min(1, 'Mentor slug is required'),
  kb: z.string().min(1, 'Knowledge base slug is required'),
  version: z.number().int().positive('Version must be a positive integer'),
  query: z.string().min(1, 'Query is required'),
  topK: z.number().int().min(1).max(100).optional().default(12)
});

const DeleteSourceSchema = z.object({
  env: z.enum(['prod', 'staging']),
  mentor: z.string().min(1, 'Mentor slug is required'),
  kb: z.string().min(1, 'Knowledge base slug is required'),
  version: z.number().int().positive('Version must be a positive integer')
});

router.post('/ingest/text', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const parseResult = IngestTextSchema.safeParse(req.body);
    
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      });
    }
    
    const data = parseResult.data;
    
    logger.info({
      service: 'ingest-routes',
      operation: 'ingest_text',
      mentor: data.mentor,
      kb: data.kb,
      sourceId: data.source_id,
      dryRun: data.dryRun
    }, 'Processing ingest request');
    
    const result = await ingestText({
      env: data.env,
      mentor: data.mentor,
      kb: data.kb,
      version: data.version,
      source_type: data.source_type,
      source_id: data.source_id,
      title: data.title,
      text: data.text,
      dryRun: data.dryRun
    });
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error({
      service: 'ingest-routes',
      operation: 'ingest_text',
      error: (error as Error).message
    }, 'Ingestion failed');
    
    res.status(500).json({
      error: 'Ingestion failed',
      message: (error as Error).message
    });
  }
});

router.post('/query', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const parseResult = QuerySchema.safeParse(req.body);
    
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      });
    }
    
    const data = parseResult.data;
    
    logger.info({
      service: 'ingest-routes',
      operation: 'query',
      mentor: data.mentor,
      kb: data.kb,
      topK: data.topK
    }, 'Processing query request');
    
    const result = await queryNamespace({
      env: data.env,
      mentor: data.mentor,
      kb: data.kb,
      version: data.version,
      query: data.query,
      topK: data.topK
    });
    
    res.json({
      success: true,
      ...result,
      citations: result.matches.map(m => ({
        title: m.metadata.title,
        section: m.metadata.section,
        source_id: m.metadata.source_id,
        chunk_index: m.metadata.chunk_index,
        score: m.score
      }))
    });
  } catch (error) {
    logger.error({
      service: 'ingest-routes',
      operation: 'query',
      error: (error as Error).message
    }, 'Query failed');
    
    res.status(500).json({
      error: 'Query failed',
      message: (error as Error).message
    });
  }
});

router.delete('/source/:source_id', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { source_id } = req.params;
    
    if (!source_id) {
      return res.status(400).json({ error: 'Source ID is required' });
    }
    
    const parseResult = DeleteSourceSchema.safeParse(req.body);
    
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      });
    }
    
    const data = parseResult.data;
    
    logger.info({
      service: 'ingest-routes',
      operation: 'delete_source',
      mentor: data.mentor,
      kb: data.kb,
      sourceId: source_id
    }, 'Processing delete request');
    
    const result = await deleteBySourceId(
      data.env,
      data.mentor,
      data.kb,
      data.version,
      source_id
    );
    
    res.json({
      success: true,
      ...result,
      source_id
    });
  } catch (error) {
    logger.error({
      service: 'ingest-routes',
      operation: 'delete_source',
      error: (error as Error).message
    }, 'Deletion failed');
    
    res.status(500).json({
      error: 'Deletion failed',
      message: (error as Error).message
    });
  }
});

router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'pinecone-ingestion',
    timestamp: new Date().toISOString()
  });
});

const CourseIngestionSchema = z.object({
  namespace: z.string().min(1, 'Namespace is required'),
  source: z.string().min(1, 'Source identifier is required'),
  rawText: z.string().min(100, 'Text content must be at least 100 characters'),
  attribution: z.string().optional(),
  dryRun: z.boolean().optional()
});

const PROTECTED_NAMESPACES = ['mark-kohl', 'markkohl', 'mark_kohl'];

function isProtectedNamespace(namespace: string): boolean {
  const normalized = namespace.toLowerCase().replace(/[^a-z0-9]/g, '');
  return PROTECTED_NAMESPACES.some(p => 
    normalized.includes(p.replace(/[^a-z0-9]/g, ''))
  );
}

router.post('/course/ingest', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const parseResult = CourseIngestionSchema.safeParse(req.body);
    
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      });
    }
    
    const data = parseResult.data;
    
    if (isProtectedNamespace(data.namespace)) {
      return res.status(403).json({
        error: 'Protected namespace',
        message: `Namespace "${data.namespace}" is protected and cannot be modified through this ingestion pipeline`
      });
    }
    
    logger.info({
      service: 'course-ingest-routes',
      operation: 'course_ingest',
      namespace: data.namespace,
      source: data.source,
      textLength: data.rawText.length,
      dryRun: data.dryRun
    }, 'Processing course ingestion request');
    
    const result = await ingestCourseTranscript({
      namespace: data.namespace,
      source: data.source,
      rawText: data.rawText,
      attribution: data.attribution,
      dryRun: data.dryRun
    });
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error({
      service: 'course-ingest-routes',
      operation: 'course_ingest',
      error: (error as Error).message
    }, 'Course ingestion failed');
    
    res.status(500).json({
      error: 'Course ingestion failed',
      message: (error as Error).message
    });
  }
});

router.get('/course/stats/:namespace', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { namespace } = req.params;
    
    if (!namespace) {
      return res.status(400).json({ error: 'Namespace is required' });
    }
    
    const stats = await getNamespaceStats(namespace);
    
    res.json({
      success: true,
      namespace,
      ...stats
    });
  } catch (error) {
    logger.error({
      service: 'course-ingest-routes',
      operation: 'get_stats',
      error: (error as Error).message
    }, 'Failed to get stats');
    
    res.status(500).json({
      error: 'Failed to get namespace stats',
      message: (error as Error).message
    });
  }
});

router.delete('/course/namespace/:namespace', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { namespace } = req.params;
    
    if (!namespace) {
      return res.status(400).json({ error: 'Namespace is required' });
    }
    
    if (isProtectedNamespace(namespace)) {
      return res.status(403).json({
        error: 'Protected namespace',
        message: `Namespace "${namespace}" is protected and cannot be deleted`
      });
    }
    
    logger.info({
      service: 'course-ingest-routes',
      operation: 'delete_namespace',
      namespace
    }, 'Processing namespace deletion request');
    
    const result = await deleteNamespaceVectors(namespace);
    
    res.json({
      success: true,
      namespace,
      ...result
    });
  } catch (error) {
    logger.error({
      service: 'course-ingest-routes',
      operation: 'delete_namespace',
      error: (error as Error).message
    }, 'Namespace deletion failed');
    
    res.status(500).json({
      error: 'Namespace deletion failed',
      message: (error as Error).message
    });
  }
});

router.post('/course/extract-text', requireAdminAuth, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const { originalname, mimetype, buffer } = req.file;
    const extension = originalname.toLowerCase().split('.').pop();
    
    logger.info({
      service: 'course-ingest-routes',
      operation: 'extract_text',
      filename: originalname,
      mimetype,
      size: buffer.length
    }, 'Extracting text from file');
    
    let text = '';
    
    if (extension === 'pdf' || mimetype === 'application/pdf') {
      const pdfData = await pdfParse(buffer);
      text = pdfData.text;
    } else if (extension === 'docx' || mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (extension === 'txt' || mimetype === 'text/plain') {
      text = buffer.toString('utf-8');
    } else {
      return res.status(400).json({ 
        error: 'Unsupported file type',
        message: `File type "${extension || mimetype}" is not supported. Use PDF, DOCX, or TXT.`
      });
    }
    
    text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    
    logger.info({
      service: 'course-ingest-routes',
      operation: 'extract_text',
      filename: originalname,
      extractedLength: text.length
    }, 'Text extraction complete');
    
    res.json({
      success: true,
      filename: originalname,
      text,
      characterCount: text.length
    });
  } catch (error) {
    logger.error({
      service: 'course-ingest-routes',
      operation: 'extract_text',
      error: (error as Error).message
    }, 'Text extraction failed');
    
    res.status(500).json({
      error: 'Text extraction failed',
      message: (error as Error).message
    });
  }
});

const PodcastIngestionSchema = z.object({
  namespace: z.string().min(1, 'Namespace is required'),
  source: z.string().min(1, 'Source identifier is required'),
  rawText: z.string().min(100, 'Text content must be at least 100 characters'),
  sourceType: z.enum(['podcast', 'video', 'interview']),
  attribution: z.string().optional(),
  dryRun: z.boolean().optional()
});

router.post('/podcast/ingest', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const parseResult = PodcastIngestionSchema.safeParse(req.body);
    
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      });
    }
    
    const data = parseResult.data;
    
    if (isProtectedNamespace(data.namespace)) {
      return res.status(403).json({
        error: 'Protected namespace',
        message: `Namespace "${data.namespace}" is protected and cannot be modified`
      });
    }
    
    logger.info({
      service: 'podcast-ingest-routes',
      operation: 'podcast_ingest',
      namespace: data.namespace,
      source: data.source,
      sourceType: data.sourceType,
      textLength: data.rawText.length,
      dryRun: data.dryRun
    }, 'Processing podcast/video ingestion request');
    
    const result = await ingestPodcast({
      namespace: data.namespace,
      source: data.source,
      rawText: data.rawText,
      sourceType: data.sourceType,
      attribution: data.attribution,
      dryRun: data.dryRun
    });
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error({
      service: 'podcast-ingest-routes',
      operation: 'podcast_ingest',
      error: (error as Error).message
    }, 'Podcast/video ingestion failed');
    
    res.status(500).json({
      error: 'Podcast/video ingestion failed',
      message: (error as Error).message
    });
  }
});

import {
  extractZipAndCreateBatch,
  processBatchEpisodes,
  getBatchStatus,
  retryFailedEpisodes,
  listBatches,
  resumeStuckBatches,
  classifyBatchEpisodes,
  updateEpisodeNamespace
} from '../ingest/batchPodcastService.js';
import { getNamespaceTaxonomy } from '../ingest/namespaceClassifier.js';

const batchUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }
});

router.get('/podcast/namespaces/taxonomy', requireAdminAuth, async (req: Request, res: Response) => {
  res.json({
    success: true,
    namespaces: getNamespaceTaxonomy()
  });
});

router.post('/podcast/batch/upload', requireAdminAuth, batchUpload.single('zipFile'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No zip file uploaded' });
    }
    
    const namespace = req.body.namespace;
    const autoDetect = req.body.autoDetect === 'true' || req.body.autoDetect === true;
    
    if (!namespace || typeof namespace !== 'string') {
      return res.status(400).json({ error: 'Namespace is required (used as fallback when auto-detect is enabled)' });
    }
    
    if (!autoDetect && isProtectedNamespace(namespace)) {
      return res.status(403).json({
        error: 'Protected namespace',
        message: `Namespace "${namespace}" is protected and cannot be modified`
      });
    }
    
    logger.info({
      service: 'batch-podcast-routes',
      operation: 'batch_upload',
      namespace,
      autoDetect,
      filename: req.file.originalname,
      size: req.file.size
    }, 'Processing batch podcast upload');
    
    const result = await extractZipAndCreateBatch(
      req.file.buffer,
      namespace,
      req.file.originalname,
      autoDetect
    );
    
    if (autoDetect) {
      classifyBatchEpisodes(result.batchId).then(() => {
        logger.info({ batchId: result.batchId }, 'Batch classification complete, ready for review');
      }).catch(error => {
        logger.error({ batchId: result.batchId, error: (error as Error).message }, 'Batch classification failed');
      });
      
      res.json({
        success: true,
        ...result,
        message: `Batch created with ${result.totalEpisodes} episodes. Classification started - review before processing.`
      });
    } else {
      processBatchEpisodes(result.batchId).catch(error => {
        logger.error({ batchId: result.batchId, error: (error as Error).message }, 'Background batch processing failed');
      });
      
      res.json({
        success: true,
        ...result,
        message: `Batch created with ${result.totalEpisodes} episodes. Processing started in background.`
      });
    }
  } catch (error) {
    logger.error({
      service: 'batch-podcast-routes',
      operation: 'batch_upload',
      error: (error as Error).message
    }, 'Batch upload failed');
    
    res.status(500).json({
      error: 'Batch upload failed',
      message: (error as Error).message
    });
  }
});

router.get('/podcast/batch/:batchId', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const status = await getBatchStatus(batchId);
    
    if (!status) {
      return res.status(404).json({ error: 'Batch not found' });
    }
    
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get batch status',
      message: (error as Error).message
    });
  }
});

router.get('/podcast/batches', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const batches = await listBatches(limit);
    
    res.json({
      success: true,
      batches
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to list batches',
      message: (error as Error).message
    });
  }
});

router.post('/podcast/batch/:batchId/retry', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const result = await retryFailedEpisodes(batchId);
    
    res.json({
      success: true,
      ...result,
      message: result.retriedCount > 0 
        ? `Retrying ${result.retriedCount} failed episodes`
        : 'No failed episodes to retry'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retry episodes',
      message: (error as Error).message
    });
  }
});

router.post('/podcast/batch/resume-stuck', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    logger.info({ service: 'batch-podcast-routes' }, 'Manually triggering resume of stuck batches');
    const result = await resumeStuckBatches();
    
    res.json({
      success: true,
      ...result,
      message: result.resumedCount > 0 
        ? `Resumed ${result.resumedCount} stuck batch(es)`
        : 'No stuck batches found to resume'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to resume stuck batches',
      message: (error as Error).message
    });
  }
});

router.post('/podcast/batch/:batchId/classify', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    
    logger.info({ batchId }, 'Triggering batch classification');
    
    const classifications = await classifyBatchEpisodes(batchId);
    
    res.json({
      success: true,
      classified: classifications.length,
      classifications,
      message: `Classified ${classifications.length} episodes`
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to classify batch',
      message: (error as Error).message
    });
  }
});

router.post('/podcast/batch/:batchId/start-processing', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    
    logger.info({ batchId }, 'Starting batch processing after review');
    
    processBatchEpisodes(batchId).catch(error => {
      logger.error({ batchId, error: (error as Error).message }, 'Background batch processing failed');
    });
    
    res.json({
      success: true,
      message: 'Processing started in background'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to start processing',
      message: (error as Error).message
    });
  }
});

router.patch('/podcast/episode/:episodeId/namespace', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { episodeId } = req.params;
    const { primaryNamespace, secondaryNamespace } = req.body;
    
    if (!primaryNamespace) {
      return res.status(400).json({ error: 'primaryNamespace is required' });
    }
    
    await updateEpisodeNamespace(episodeId, primaryNamespace, secondaryNamespace);
    
    res.json({
      success: true,
      message: `Episode namespace updated to ${primaryNamespace}${secondaryNamespace ? `, ${secondaryNamespace}` : ''}`
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to update episode namespace',
      message: (error as Error).message
    });
  }
});

export default router;
