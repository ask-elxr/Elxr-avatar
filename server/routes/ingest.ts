import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { ingestText, queryNamespace, deleteBySourceId } from '../ingest/ingestionService.js';
import { validateNamespaceParams } from '../ingest/namespaceUtils.js';
import { 
  ingestCourseTranscript, 
  deleteAvatarNamespace, 
  getAvatarNamespaceStats 
} from '../ingest/courseIngestionService.js';
import { isProtectedAvatar } from '../ingest/conversationalTypes.js';
import { logger } from '../logger.js';

const router = Router();

const ADMIN_SECRET = process.env.ADMIN_SECRET;

function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const adminKey = req.headers['x-admin-secret'] || req.headers['x-admin-key'];
  
  if (!ADMIN_SECRET) {
    logger.error({ service: 'ingest-routes' }, 'ADMIN_SECRET not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }
  
  if (!adminKey || adminKey !== ADMIN_SECRET) {
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
  avatar: z.string().min(1, 'Avatar ID is required'),
  source: z.string().min(1, 'Source identifier is required'),
  rawText: z.string().min(100, 'Text content must be at least 100 characters'),
  attribution: z.string().optional(),
  dryRun: z.boolean().optional()
});

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
    
    if (isProtectedAvatar(data.avatar)) {
      return res.status(403).json({
        error: 'Protected avatar',
        message: `Avatar "${data.avatar}" is protected and cannot be modified through this ingestion pipeline`
      });
    }
    
    logger.info({
      service: 'course-ingest-routes',
      operation: 'course_ingest',
      avatar: data.avatar,
      source: data.source,
      textLength: data.rawText.length,
      dryRun: data.dryRun
    }, 'Processing course ingestion request');
    
    const result = await ingestCourseTranscript({
      avatar: data.avatar,
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

router.get('/course/stats/:avatar', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { avatar } = req.params;
    
    if (!avatar) {
      return res.status(400).json({ error: 'Avatar ID is required' });
    }
    
    const stats = await getAvatarNamespaceStats(avatar);
    
    res.json({
      success: true,
      avatar,
      namespaces: stats
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

router.delete('/course/namespace/:avatar', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { avatar } = req.params;
    const { contentType } = req.query;
    
    if (!avatar) {
      return res.status(400).json({ error: 'Avatar ID is required' });
    }
    
    if (isProtectedAvatar(avatar)) {
      return res.status(403).json({
        error: 'Protected avatar',
        message: `Avatar "${avatar}" is protected and cannot be deleted`
      });
    }
    
    logger.info({
      service: 'course-ingest-routes',
      operation: 'delete_namespace',
      avatar,
      contentType: contentType || 'all'
    }, 'Processing namespace deletion request');
    
    const result = await deleteAvatarNamespace(
      avatar, 
      contentType as any
    );
    
    res.json({
      success: true,
      avatar,
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

export default router;
