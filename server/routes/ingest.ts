import { Router, type Request, type Response, type NextFunction } from 'express';
import { storage } from '../storage.js';
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
import { 
  learningArtifactService, 
  startFullCourseIngestionJob, 
  getFullCourseJob, 
  listFullCourseJobs,
  resumeInterruptedJobs,
  FullCourseJob 
} from '../ingest/learningArtifactService.js';
import {
  listAllNamespaces,
  findDuplicateNamespaces,
  consolidateNamespaces
} from '../ingest/namespaceConsolidation.js';

// Export resume function for server startup
export { resumeInterruptedJobs };
import { KNOWN_KBS, isValidKb } from '../ingest/learningArtifactTypes.js';
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
    
    if (!isPersonalKnowledgeNamespace(data.namespace)) {
      return res.status(403).json({
        error: 'Verbatim ingestion restricted',
        message: `This route stores conversational chunks (near-verbatim). It is only allowed for personal knowledge namespaces (e.g., mark-kohl, willie-gault). For course content, use the Learning Artifact pipeline at /api/admin/learning-artifacts/ingest to ensure anonymity.`
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
    
    if (isPersonalKnowledgeNamespace(namespace)) {
      return res.status(403).json({
        error: 'Protected namespace',
        message: `Namespace "${namespace}" is a personal knowledge namespace and cannot be deleted through this route`
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
    
    if (isPersonalKnowledgeNamespace(data.namespace)) {
      return res.status(403).json({
        error: 'Protected namespace',
        message: `Namespace "${data.namespace}" is a personal knowledge namespace and cannot be modified through podcast ingestion`
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
    const distillMode = req.body.distillMode === 'mentor_memory' ? 'mentor_memory' : 'chunks';
    const mentorName = req.body.mentorName?.trim() || undefined;
    
    if (!namespace || typeof namespace !== 'string') {
      return res.status(400).json({ error: 'Namespace is required (used as fallback when auto-detect is enabled)' });
    }
    
    // When using mentor_memory mode, a mentor name is highly recommended for better output
    if (distillMode === 'mentor_memory' && !mentorName) {
      logger.warn({
        service: 'batch-podcast-routes',
        operation: 'batch_upload',
        namespace,
        distillMode
      }, 'Mentor Wisdom mode selected without a mentor name - using "Mentor" as default');
    }
    
    if (!autoDetect && isPersonalKnowledgeNamespace(namespace)) {
      return res.status(403).json({
        error: 'Protected namespace',
        message: `Namespace "${namespace}" is a personal knowledge namespace and cannot be modified through batch podcast ingestion`
      });
    }
    
    logger.info({
      service: 'batch-podcast-routes',
      operation: 'batch_upload',
      namespace,
      autoDetect,
      distillMode,
      mentorName,
      filename: req.file.originalname,
      size: req.file.size
    }, 'Processing batch podcast upload');
    
    const result = await extractZipAndCreateBatch(
      req.file.buffer,
      namespace,
      req.file.originalname,
      autoDetect,
      distillMode as 'chunks' | 'mentor_memory',
      mentorName
    );
    
    res.json({
      success: true,
      ...result,
      message: `Batch created. Extraction is running in the background - refresh to see progress.`
    });
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

router.delete('/podcast/batch/:batchId', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    logger.info({ batchId, service: 'batch-podcast-routes' }, 'Deleting batch and all episodes');
    
    const batch = await storage.getPodcastBatch(batchId);
    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }
    
    await storage.deletePodcastBatch(batchId);
    
    res.json({
      success: true,
      message: `Deleted batch "${batch.zipFilename}" and all its episodes`
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to delete batch',
      message: (error as Error).message
    });
  }
});

router.post('/podcast/batch/:batchId/cancel', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    logger.info({ batchId, service: 'batch-podcast-routes' }, 'Cancelling batch');
    
    const batch = await storage.getPodcastBatch(batchId);
    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }
    
    const episodes = await storage.getPodcastEpisodesByBatch(batchId);
    for (const ep of episodes.filter((e: any) => e.status === 'pending' || e.status === 'processing')) {
      await storage.updatePodcastEpisode(ep.id, { status: 'skipped', error: 'Cancelled by user' });
    }
    
    await storage.updatePodcastBatch(batchId, { status: 'failed', error: 'Cancelled by user' });
    
    res.json({
      success: true,
      message: `Cancelled batch "${batch.zipFilename}"`
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to cancel batch',
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

// ============================================================================
// LEARNING ARTIFACT INGESTION ROUTES
// ============================================================================

const LearningArtifactIngestSchema = z.object({
  kb: z.string().min(1, 'Knowledge base is required'),
  courseId: z.string().min(1, 'Course ID is required'),
  lessonId: z.string().min(1, 'Lesson ID is required'),
  lessonTitle: z.string().optional(),
  rawText: z.string().min(100, 'Transcript must be at least 100 characters'),
  dryRun: z.boolean().optional().default(false)
});

const LearningArtifactBatchSchema = z.object({
  kb: z.string().min(1, 'Knowledge base is required'),
  courseId: z.string().min(1, 'Course ID is required'),
  transcripts: z.array(z.object({
    lessonId: z.string().min(1),
    lessonTitle: z.string().optional(),
    text: z.string().min(100)
  })).min(1, 'At least one transcript is required'),
  dryRun: z.boolean().optional().default(false)
});

router.get('/learning-artifacts/kbs', requireAdminAuth, async (_req: Request, res: Response) => {
  res.json({
    success: true,
    knowledgeBases: KNOWN_KBS
  });
});

router.post('/learning-artifacts/ingest', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const parseResult = LearningArtifactIngestSchema.safeParse(req.body);
    
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
    
    if (!isValidKb(data.kb)) {
      return res.status(400).json({
        error: 'Invalid knowledge base',
        message: `Unknown KB "${data.kb}". Valid options: ${KNOWN_KBS.join(', ')}`,
        validKbs: KNOWN_KBS
      });
    }
    
    logger.info({
      service: 'learning-artifacts',
      operation: 'ingest',
      kb: data.kb,
      courseId: data.courseId,
      lessonId: data.lessonId,
      dryRun: data.dryRun
    }, 'Starting learning artifact ingestion');
    
    const result = await learningArtifactService.ingestTranscript({
      kb: data.kb,
      courseId: data.courseId,
      lessonId: data.lessonId,
      lessonTitle: data.lessonTitle,
      rawText: data.rawText,
      dryRun: data.dryRun
    });
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Learning artifact ingestion failed');
    res.status(500).json({
      error: 'Ingestion failed',
      message: (error as Error).message
    });
  }
});

router.post('/learning-artifacts/ingest-batch', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const parseResult = LearningArtifactBatchSchema.safeParse(req.body);
    
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
    
    if (!isValidKb(data.kb)) {
      return res.status(400).json({
        error: 'Invalid knowledge base',
        message: `Unknown KB "${data.kb}". Valid options: ${KNOWN_KBS.join(', ')}`,
        validKbs: KNOWN_KBS
      });
    }
    
    logger.info({
      service: 'learning-artifacts',
      operation: 'batch_ingest',
      kb: data.kb,
      courseId: data.courseId,
      lessonCount: data.transcripts.length,
      dryRun: data.dryRun
    }, 'Starting batch learning artifact ingestion');
    
    const result = await learningArtifactService.ingestBatch({
      kb: data.kb,
      courseId: data.courseId,
      transcripts: data.transcripts,
      dryRun: data.dryRun
    });
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Batch learning artifact ingestion failed');
    res.status(500).json({
      error: 'Batch ingestion failed',
      message: (error as Error).message
    });
  }
});

const FullCourseIngestionSchema = z.object({
  kb: z.string().min(1, 'Knowledge base is required'),
  courseId: z.string().min(1, 'Course ID is required'),
  courseTitle: z.string().optional(),
  rawText: z.string().min(500, 'Course transcript must be at least 500 characters'),
  dryRun: z.boolean().optional().default(false)
});

// Start full course ingestion as background job (returns immediately with job ID)
router.post('/learning-artifacts/ingest-full-course', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const parseResult = FullCourseIngestionSchema.safeParse(req.body);
    
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
    
    if (!isValidKb(data.kb)) {
      return res.status(400).json({
        error: 'Invalid knowledge base',
        message: `Unknown KB "${data.kb}". Valid options: ${KNOWN_KBS.join(', ')}`,
        validKbs: KNOWN_KBS
      });
    }
    
    logger.info({
      service: 'learning-artifacts',
      operation: 'full_course_ingest_start',
      kb: data.kb,
      courseId: data.courseId,
      textLength: data.rawText.length,
      dryRun: data.dryRun
    }, 'Starting full course ingestion as background job');
    
    // Start background job and return immediately
    const jobId = await startFullCourseIngestionJob({
      kb: data.kb,
      courseId: data.courseId,
      courseTitle: data.courseTitle,
      rawText: data.rawText,
      dryRun: data.dryRun
    });
    
    res.json({
      success: true,
      jobId,
      message: 'Full course ingestion started. Poll /learning-artifacts/job/:jobId for status.'
    });
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to start full course ingestion');
    res.status(500).json({
      error: 'Failed to start full course ingestion',
      message: (error as Error).message
    });
  }
});

// Get status of a full course ingestion job
router.get('/learning-artifacts/job/:jobId', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const job = await getFullCourseJob(jobId);
    
    if (!job) {
      return res.status(404).json({
        error: 'Job not found',
        message: `No job found with ID "${jobId}"`
      });
    }
    
    res.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        kb: job.kb,
        courseId: job.courseId,
        courseTitle: job.courseTitle,
        lessonsDetected: job.lessonsDetected,
        lessonsProcessed: job.lessonsProcessed,
        totalArtifacts: job.totalArtifacts,
        currentLesson: job.currentLesson,
        errors: job.errors,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        // Only include result when completed
        result: job.status === 'completed' ? job.result : undefined
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get job status',
      message: (error as Error).message
    });
  }
});

// List all full course ingestion jobs
router.get('/learning-artifacts/jobs', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const jobs = await listFullCourseJobs();
    
    res.json({
      success: true,
      jobs: jobs.map(job => ({
        id: job.id,
        status: job.status,
        kb: job.kb,
        courseId: job.courseId,
        courseTitle: job.courseTitle,
        lessonsDetected: job.lessonsDetected,
        lessonsProcessed: job.lessonsProcessed,
        totalArtifacts: job.totalArtifacts,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        hasErrors: job.errors.length > 0
      }))
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to list jobs',
      message: (error as Error).message
    });
  }
});

router.get('/learning-artifacts/stats/:namespace', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { namespace } = req.params;
    const stats = await learningArtifactService.getNamespaceStats(namespace);
    
    res.json({
      success: true,
      namespace,
      ...stats
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get stats',
      message: (error as Error).message
    });
  }
});

router.delete('/learning-artifacts/:namespace/:courseId', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { namespace, courseId } = req.params;
    const { lessonId } = req.query;
    
    const result = await learningArtifactService.deleteBySource(
      namespace, 
      courseId, 
      lessonId as string | undefined
    );
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to delete artifacts',
      message: (error as Error).message
    });
  }
});

// ============================================
// Namespace Management Routes
// ============================================

router.get('/namespaces', requireAdminAuth, async (_req: Request, res: Response) => {
  try {
    const namespaces = await listAllNamespaces();
    res.json({ namespaces, total: namespaces.length });
  } catch (error) {
    logger.error({
      service: 'ingest-routes',
      operation: 'list_namespaces',
      error: (error as Error).message
    }, 'Failed to list namespaces');
    res.status(500).json({
      error: 'Failed to list namespaces',
      message: (error as Error).message
    });
  }
});

router.get('/namespaces/duplicates', requireAdminAuth, async (_req: Request, res: Response) => {
  try {
    const duplicates = await findDuplicateNamespaces();
    res.json({ 
      duplicates, 
      count: duplicates.length,
      totalVectorsToMove: duplicates.reduce((sum, d) => sum + d.uppercaseCount, 0)
    });
  } catch (error) {
    logger.error({
      service: 'ingest-routes',
      operation: 'find_duplicates',
      error: (error as Error).message
    }, 'Failed to find duplicate namespaces');
    res.status(500).json({
      error: 'Failed to find duplicates',
      message: (error as Error).message
    });
  }
});

router.post('/namespaces/consolidate', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const dryRun = req.body.dryRun !== false;
    
    logger.info({
      service: 'ingest-routes',
      operation: 'consolidate_namespaces',
      dryRun
    }, 'Starting namespace consolidation');
    
    const result = await consolidateNamespaces(dryRun);
    
    res.json({
      success: true,
      dryRun,
      ...result
    });
  } catch (error) {
    logger.error({
      service: 'ingest-routes',
      operation: 'consolidate_namespaces',
      error: (error as Error).message
    }, 'Failed to consolidate namespaces');
    res.status(500).json({
      error: 'Failed to consolidate namespaces',
      message: (error as Error).message
    });
  }
});

export default router;
