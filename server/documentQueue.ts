import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { documentProcessor } from './documentProcessor.js';
import type { InsertJob } from '../shared/schema.js';

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  console.warn('⚠️  REDIS_URL not set - background job queue disabled. Document processing will use synchronous processing.');
  console.warn('   To enable background jobs: Set REDIS_URL environment variable (e.g., Upstash Redis)');
}

const connection = REDIS_URL ? new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
}) : null;

connection?.on('error', (error) => {
  console.error('Redis connection error:', error);
});

connection?.on('connect', () => {
  console.log('✅ Connected to Redis for job queue');
});

export const documentQueue = connection ? new Queue('document-processing', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 100, // Keep last 100 completed jobs
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  },
}) : null;

export interface DocumentJobData {
  jobId: string;
  documentId: string;
  userId?: string;
  filename: string;
  fileType: string;
  objectPath: string;
  indexName?: string;
  namespace?: string;
}

export interface UrlProcessingJobData {
  jobId: string;
  userId?: string;
  url: string;
  indexName?: string;
  namespace?: string;
}

type JobData = DocumentJobData | UrlProcessingJobData;

const worker = connection ? new Worker<JobData>(
  'document-processing',
  async (job: Job<JobData>) => {
    console.log(`Processing job ${job.id}:`, job.data);

    try {
      if ('objectPath' in job.data) {
        const data = job.data as DocumentJobData;
        await job.updateProgress(10);

        const metadata = {
          userId: data.userId,
          indexName: data.indexName,
          namespace: data.namespace,
        };

        const result = await documentProcessor.processDocument(
          data.objectPath,
          data.fileType,
          data.documentId,
          metadata
        );

        await job.updateProgress(100);
        return { success: true, ...result };
      } else {
        const data = job.data as UrlProcessingJobData;
        await job.updateProgress(10);

        throw new Error('URL processing not yet implemented - coming in next phase');
      }
    } catch (error) {
      console.error(`Job ${job.id} failed:`, error);
      throw error;
    }
  },
  {
    connection,
    concurrency: 2,
  }
) : null;

worker?.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully`);
});

worker?.on('failed', (job, err) => {
  if (job) {
    console.error(`Job ${job.id} failed after ${job.attemptsMade} attempts:`, err.message);
  }
});

worker?.on('error', (error) => {
  console.error('Worker error:', error);
});

export async function enqueueDocumentJob(data: DocumentJobData): Promise<string> {
  if (!documentQueue) {
    throw new Error('Job queue not available - REDIS_URL not configured');
  }
  const job = await documentQueue.add('process-document', data, {
    jobId: data.jobId,
  });
  return job.id || data.jobId;
}

export async function enqueueUrlJob(data: UrlProcessingJobData): Promise<string> {
  if (!documentQueue) {
    throw new Error('Job queue not available - REDIS_URL not configured');
  }
  const job = await documentQueue.add('process-url', data, {
    jobId: data.jobId,
  });
  return job.id || data.jobId;
}

export async function getJobStatus(jobId: string) {
  if (!documentQueue) {
    throw new Error('Job queue not available - REDIS_URL not configured');
  }
  const job = await documentQueue.getJob(jobId);
  
  if (!job) {
    return null;
  }

  const state = await job.getState();
  const progress = job.progress;
  const failedReason = job.failedReason;
  const returnValue = job.returnvalue;

  return {
    id: job.id,
    status: state,
    progress: typeof progress === 'number' ? progress / 100 : 0,
    error: failedReason ? { message: failedReason } : null,
    result: returnValue,
    createdAt: new Date(job.timestamp),
    finishedAt: job.finishedOn ? new Date(job.finishedOn) : null,
  };
}

export function isQueueAvailable(): boolean {
  return !!documentQueue;
}

export async function gracefulShutdown() {
  if (worker && documentQueue && connection) {
    console.log('Shutting down document queue worker...');
    await worker.close();
    await documentQueue.close();
    connection.disconnect();
  }
}

if (connection) {
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}
