import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { ingestText, queryNamespace, deleteBySourceId } from '../ingest/ingestionService.js';
import { validateNamespaceParams } from '../ingest/namespaceUtils.js';
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

export default router;
