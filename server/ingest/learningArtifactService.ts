import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';
import { pineconeService, PineconeIndexName } from '../pinecone.js';
import { getEmbedder } from './embedder.js';
import { logger } from '../logger.js';
import { db } from '../db.js';
import { ingestionJobs } from '@shared/schema.js';
import { eq } from 'drizzle-orm';
import {
  LearningArtifact,
  LessonArtifacts,
  ArtifactRecord,
  ArtifactMetadata,
  ArtifactType,
  IngestionRequest,
  IngestionResult,
  BatchIngestionRequest,
  BatchIngestionResult,
  DetectedLesson,
  FullCourseIngestionRequest,
  FullCourseIngestionResult,
} from './learningArtifactTypes.js';

const EMBED_BATCH_SIZE = 15;
const UPSERT_BATCH_SIZE = 50;
const SLEEP_BETWEEN_BATCHES_MS = 500;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const ARTIFACT_EXTRACTION_SYSTEM_PROMPT = `You convert course transcripts into original learning artifacts.
You must output ONLY valid JSON matching the schema provided.

Rules:
• Do NOT quote the transcript.
• Do NOT reuse distinctive phrasing. If any sentence feels "copyable," rewrite it.
• Write as synthesized learning: principles, mental models, heuristics, failure modes, checklists, scenarios, and Q&A.
• Keep artifacts short and useful (1–6 sentences).
• Prefer general, transferable knowledge over story details.
• Add tags and topic/subtopic so retrieval works.
• If content involves medical/mental-health/illegal risk, add brief safety_notes (e.g., "seek professional help", "harm reduction", etc.) without being preachy.

Output requirements:
• JSON only. No markdown code blocks. No explanation text.
• 30–120 artifacts depending on transcript length.
• Confidence: high if broadly established, med if plausible but context-dependent, low if speculative.

Artifact types:
• principle: Core truth or fundamental concept
• mental_model: Framework for thinking about something
• heuristic: Rule of thumb or quick decision guide
• failure_mode: Common mistake or trap to avoid
• checklist: Step-by-step procedure or list
• qa_pair: Question and answer format
• scenario: Situational example or case study

Schema to output:
{
  "lesson_title": "string",
  "artifacts": [
    {
      "artifact_type": "principle" | "mental_model" | "heuristic" | "failure_mode" | "checklist" | "qa_pair" | "scenario",
      "title": "string (short, descriptive)",
      "content": "string (1-6 sentences, synthesized wisdom)",
      "steps": ["string"] | null,
      "example": "string" | null,
      "topic": "string (main topic area)",
      "subtopic": "string (specific aspect)",
      "tags": ["3-10 relevant tags"],
      "confidence": "low" | "med" | "high",
      "safety_notes": "string" | null
    }
  ]
}`;

const LESSON_DETECTION_SYSTEM_PROMPT = `You are a course structure analyzer. Your job is to detect individual lessons within a full course transcript.

Look for:
• Lesson headings, module numbers, chapter markers
• Section breaks indicated by "Lesson 1:", "Module 2:", "Chapter 3:", "Part 1:", etc.
• Clear topic transitions with new introductions
• Timestamps or time markers that indicate new segments
• Speaker introductions of new topics
• Significant subject matter changes

Output ONLY valid JSON with this schema:
{
  "course_title": "string (detected or inferred course title)",
  "lessons": [
    {
      "lesson_id": "string (e.g., lesson_01, module_02, chapter_03)",
      "lesson_title": "string (descriptive title for this lesson)",
      "start_marker": "string (first few words that start this lesson)",
      "end_marker": "string (last few words of this lesson, or 'END' if last lesson)"
    }
  ]
}

Rules:
• Each lesson should be a coherent unit of learning (typically 5-30 minutes of content)
• If no clear lesson boundaries exist, create logical divisions based on topic changes
• Minimum 1 lesson, but try to detect natural divisions
• Generate clean lesson_id values (lowercase, underscores, no special chars)
• lesson_title should be descriptive of the content`;

function normalizeTranscript(text: string): string {
  let normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  const boilerplatePatterns = [
    /^.*subscribe.*channel.*$/gim,
    /^.*like.*comment.*share.*$/gim,
    /^.*thanks for watching.*$/gim,
    /^.*don't forget to.*$/gim,
    /^.*click.*notification.*bell.*$/gim,
    /^.*welcome back.*channel.*$/gim,
    /^.*link.*description.*below.*$/gim,
    /^\[music\]$/gim,
    /^\[applause\]$/gim,
    /^.*patreon.*support.*$/gim,
  ];

  for (const pattern of boilerplatePatterns) {
    normalized = normalized.replace(pattern, '');
  }

  normalized = normalized.replace(/\n{3,}/g, '\n\n').trim();

  return normalized;
}

function generateArtifactId(
  courseId: string,
  lessonId: string,
  artifactType: ArtifactType,
  artifactIndex: number,
  chunkText: string
): string {
  const hash = crypto.createHash('sha1').update(chunkText).digest('hex').slice(0, 12);
  return `${courseId}:${lessonId}:${artifactType}:${artifactIndex}:${hash}`;
}

function packForVectorSearch(artifact: LearningArtifact): string {
  let chunkText = `${artifact.title}\n${artifact.content}`;
  
  if (artifact.steps && artifact.steps.length > 0) {
    chunkText += '\n• ' + artifact.steps.join('\n• ');
  }
  
  if (artifact.example) {
    chunkText += `\nExample: ${artifact.example}`;
  }
  
  return chunkText;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  delayMs: number = RETRY_DELAY_MS
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      logger.warn({ 
        attempt: attempt + 1, 
        maxRetries, 
        error: lastError.message 
      }, 'API call failed, retrying...');
      
      if (attempt < maxRetries - 1) {
        await sleep(delayMs * (attempt + 1));
      }
    }
  }
  
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class LearningArtifactService {
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic();
  }

  async extractLearningArtifacts(
    text: string,
    lessonTitle?: string
  ): Promise<LessonArtifacts> {
    const normalizedText = normalizeTranscript(text);
    
    const userPrompt = lessonTitle
      ? `Extract learning artifacts from this transcript titled "${lessonTitle}":\n\n${normalizedText}`
      : `Extract learning artifacts from this transcript:\n\n${normalizedText}`;

    const response = await withRetry(async () => {
      return await this.anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 8192,
        system: ARTIFACT_EXTRACTION_SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: userPrompt }
        ]
      });
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    let jsonText = content.text.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7);
    }
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith('```')) {
      jsonText = jsonText.slice(0, -3);
    }
    jsonText = jsonText.trim();

    try {
      const parsed = JSON.parse(jsonText) as LessonArtifacts;
      
      if (!parsed.lesson_title || !Array.isArray(parsed.artifacts)) {
        throw new Error('Invalid response structure');
      }
      
      return parsed;
    } catch (error) {
      logger.error({ error, rawResponse: content.text.slice(0, 500) }, 'Failed to parse artifact extraction response');
      throw new Error(`Failed to parse learning artifacts: ${(error as Error).message}`);
    }
  }

  async ingestTranscript(request: IngestionRequest): Promise<IngestionResult> {
    const { kb, courseId, lessonId, lessonTitle, rawText, dryRun = false } = request;
    
    logger.info({ kb, courseId, lessonId, dryRun }, 'Starting learning artifact ingestion');

    const lessonArtifacts = await this.extractLearningArtifacts(rawText, lessonTitle);
    
    const artifactsByType: Record<ArtifactType, number> = {
      principle: 0,
      mental_model: 0,
      heuristic: 0,
      failure_mode: 0,
      checklist: 0,
      qa_pair: 0,
      scenario: 0,
    };

    const records: ArtifactRecord[] = [];
    const createdAt = new Date().toISOString();

    for (let i = 0; i < lessonArtifacts.artifacts.length; i++) {
      const artifact = lessonArtifacts.artifacts[i];
      artifactsByType[artifact.artifact_type]++;
      
      const chunkText = packForVectorSearch(artifact);
      const id = generateArtifactId(courseId, lessonId, artifact.artifact_type, i, chunkText);
      
      const metadata: ArtifactMetadata = {
        kb,
        course_id: courseId,
        lesson_id: lessonId,
        lesson_title: lessonArtifacts.lesson_title,
        artifact_type: artifact.artifact_type,
        artifact_index: i,
        title: artifact.title,
        topic: artifact.topic,
        subtopic: artifact.subtopic,
        tags: artifact.tags.join(','),
        confidence: artifact.confidence,
        created_at: createdAt,
        rights: 'original_derivative',
        source_type: 'derived_learning',
        text: chunkText,
      };
      
      if (artifact.safety_notes) {
        metadata.safety_notes = artifact.safety_notes;
      }
      
      records.push({ id, chunk_text: chunkText, metadata });
    }

    if (dryRun) {
      return {
        kb,
        courseId,
        lessonId,
        lessonTitle: lessonArtifacts.lesson_title,
        totalArtifacts: lessonArtifacts.artifacts.length,
        artifactsByType,
        dryRunPreview: lessonArtifacts.artifacts.slice(0, 10),
      };
    }

    const upsertedCount = await this.upsertToPinecone(records, kb);

    logger.info({
      kb,
      courseId,
      lessonId,
      totalArtifacts: records.length,
      upsertedCount,
    }, 'Learning artifact ingestion complete');

    return {
      kb,
      courseId,
      lessonId,
      lessonTitle: lessonArtifacts.lesson_title,
      totalArtifacts: records.length,
      artifactsByType,
      recordsUpserted: upsertedCount,
    };
  }

  async ingestBatch(request: BatchIngestionRequest): Promise<BatchIngestionResult> {
    const { kb, courseId, transcripts, dryRun = false } = request;
    
    logger.info({ kb, courseId, lessonCount: transcripts.length, dryRun }, 'Starting batch learning artifact ingestion');

    const results: IngestionResult[] = [];
    const errors: Array<{ lessonId: string; error: string }> = [];
    const totalArtifactsByType: Record<ArtifactType, number> = {
      principle: 0,
      mental_model: 0,
      heuristic: 0,
      failure_mode: 0,
      checklist: 0,
      qa_pair: 0,
      scenario: 0,
    };

    for (const transcript of transcripts) {
      try {
        const result = await this.ingestTranscript({
          kb,
          courseId,
          lessonId: transcript.lessonId,
          lessonTitle: transcript.lessonTitle,
          rawText: transcript.text,
          dryRun,
        });
        
        results.push(result);
        
        for (const [type, count] of Object.entries(result.artifactsByType)) {
          totalArtifactsByType[type as ArtifactType] += count;
        }
        
        await sleep(2000);
      } catch (error) {
        errors.push({
          lessonId: transcript.lessonId,
          error: (error as Error).message,
        });
        logger.error({ lessonId: transcript.lessonId, error }, 'Failed to ingest lesson');
      }
    }

    const totalArtifacts = results.reduce((sum, r) => sum + r.totalArtifacts, 0);

    return {
      kb,
      courseId,
      lessonsProcessed: results.length,
      totalArtifacts,
      artifactsByType: totalArtifactsByType,
      results,
      errors,
    };
  }

  private async upsertToPinecone(records: ArtifactRecord[], namespace: string): Promise<number> {
    const embedder = getEmbedder();
    const index = await pineconeService.initializeIndex(PineconeIndexName.ASK_ELXR);
    const ns = index.namespace(namespace.toUpperCase());
    
    const allVectors: any[] = [];

    for (let i = 0; i < records.length; i += EMBED_BATCH_SIZE) {
      const batch = records.slice(i, i + EMBED_BATCH_SIZE);
      const texts = batch.map(r => r.chunk_text);
      
      const embeddings = await withRetry(async () => {
        return await embedder.embedBatch(texts);
      });
      
      for (let j = 0; j < batch.length; j++) {
        allVectors.push({
          id: batch[j].id,
          values: embeddings[j],
          metadata: batch[j].metadata,
        });
      }
      
      if (i + EMBED_BATCH_SIZE < records.length) {
        await sleep(SLEEP_BETWEEN_BATCHES_MS);
      }
    }

    for (let i = 0; i < allVectors.length; i += UPSERT_BATCH_SIZE) {
      const batch = allVectors.slice(i, i + UPSERT_BATCH_SIZE);
      
      await withRetry(async () => {
        await ns.upsert(batch);
      });
      
      if (i + UPSERT_BATCH_SIZE < allVectors.length) {
        await sleep(SLEEP_BETWEEN_BATCHES_MS);
      }
    }

    return allVectors.length;
  }

  async getNamespaceStats(namespace: string): Promise<{ vectorCount: number }> {
    try {
      const index = await pineconeService.initializeIndex(PineconeIndexName.ASK_ELXR);
      const stats = await index.describeIndexStats();
      const normalizedNs = namespace.toUpperCase();
      const nsStats = stats.namespaces?.[normalizedNs];
      
      return {
        vectorCount: nsStats?.recordCount || 0,
      };
    } catch (error) {
      logger.error({ namespace, error }, 'Failed to get namespace stats');
      return { vectorCount: 0 };
    }
  }

  async checkExistingArtifacts(namespace: string, courseId: string, lessonId: string): Promise<{ exists: boolean; count: number }> {
    try {
      const index = await pineconeService.initializeIndex(PineconeIndexName.ASK_ELXR);
      const ns = index.namespace(namespace.toUpperCase());

      const dummyEmbedding = new Array(1536).fill(0);
      const result = await ns.query({
        vector: dummyEmbedding,
        topK: 1,
        filter: {
          course_id: { $eq: courseId },
          lesson_id: { $eq: lessonId },
        },
        includeMetadata: false,
      });

      const count = result.matches?.length || 0;
      return { exists: count > 0, count };
    } catch (error) {
      logger.warn({ namespace, courseId, lessonId, error }, 'Failed to check existing artifacts, proceeding');
      return { exists: false, count: 0 };
    }
  }

  async deleteBySource(namespace: string, courseId: string, lessonId?: string): Promise<{ deleted: boolean }> {
    try {
      const index = await pineconeService.initializeIndex(PineconeIndexName.ASK_ELXR);
      const ns = index.namespace(namespace.toUpperCase());
      
      const filter: any = { course_id: { $eq: courseId } };
      if (lessonId) {
        filter.lesson_id = { $eq: lessonId };
      }
      
      await ns.deleteMany(filter);
      
      logger.info({ namespace, courseId, lessonId }, 'Deleted artifacts by source');
      return { deleted: true };
    } catch (error) {
      logger.error({ namespace, courseId, lessonId, error }, 'Failed to delete artifacts');
      throw error;
    }
  }

  async detectLessons(rawText: string): Promise<{ courseTitle: string; lessons: DetectedLesson[] }> {
    const normalizedText = normalizeTranscript(rawText);
    const truncatedText = normalizedText.slice(0, 100000);
    
    logger.info({ textLength: normalizedText.length }, 'Detecting lessons in course transcript');

    const response = await withRetry(async () => {
      return await this.anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 8000,
        system: LESSON_DETECTION_SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: `Analyze this course transcript and detect individual lessons:\n\n${truncatedText}` }
        ]
      });
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    let jsonText = content.text.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7);
    }
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith('```')) {
      jsonText = jsonText.slice(0, -3);
    }
    jsonText = jsonText.trim();

    try {
      const parsed = JSON.parse(jsonText) as {
        course_title: string;
        lessons: Array<{
          lesson_id: string;
          lesson_title: string;
          start_marker: string;
          end_marker: string;
        }>;
      };

      const detectedLessons: DetectedLesson[] = [];
      
      for (let i = 0; i < parsed.lessons.length; i++) {
        const lesson = parsed.lessons[i];
        const nextLesson = parsed.lessons[i + 1];
        
        const startIdx = normalizedText.indexOf(lesson.start_marker);
        let endIdx: number;
        
        if (lesson.end_marker === 'END' || i === parsed.lessons.length - 1) {
          endIdx = normalizedText.length;
        } else if (nextLesson) {
          const nextStartIdx = normalizedText.indexOf(nextLesson.start_marker);
          endIdx = nextStartIdx > startIdx ? nextStartIdx : normalizedText.length;
        } else {
          const endMarkerIdx = normalizedText.indexOf(lesson.end_marker, startIdx);
          endIdx = endMarkerIdx > 0 ? endMarkerIdx + lesson.end_marker.length : normalizedText.length;
        }
        
        const lessonText = startIdx >= 0 
          ? normalizedText.slice(startIdx, endIdx).trim()
          : normalizedText.slice(0, Math.floor(normalizedText.length / parsed.lessons.length)).trim();
        
        if (lessonText.length > 100) {
          detectedLessons.push({
            lessonId: lesson.lesson_id,
            lessonTitle: lesson.lesson_title,
            text: lessonText,
          });
        }
      }

      if (detectedLessons.length === 0) {
        detectedLessons.push({
          lessonId: 'lesson_01',
          lessonTitle: parsed.course_title || 'Full Course',
          text: normalizedText,
        });
      }

      logger.info({ 
        courseTitle: parsed.course_title, 
        lessonsDetected: detectedLessons.length 
      }, 'Lesson detection complete');

      return {
        courseTitle: parsed.course_title,
        lessons: detectedLessons,
      };
    } catch (error) {
      logger.error({ error, rawResponse: content.text.slice(0, 500) }, 'Failed to parse lesson detection response');
      return {
        courseTitle: 'Unknown Course',
        lessons: [{
          lessonId: 'lesson_01',
          lessonTitle: 'Full Course',
          text: normalizedText,
        }],
      };
    }
  }

  async ingestFullCourse(request: FullCourseIngestionRequest): Promise<FullCourseIngestionResult> {
    const { kb, courseId, courseTitle, rawText, dryRun = false } = request;
    
    logger.info({ kb, courseId, dryRun }, 'Starting full course ingestion with auto-detection');

    const { courseTitle: detectedTitle, lessons } = await this.detectLessons(rawText);
    const finalCourseTitle = courseTitle || detectedTitle;

    logger.info({ 
      courseTitle: finalCourseTitle, 
      lessonsDetected: lessons.length 
    }, 'Lessons detected, starting artifact extraction');

    if (dryRun) {
      return {
        kb,
        courseId,
        courseTitle: finalCourseTitle,
        detectedLessons: lessons.map(l => ({ ...l, text: l.text.slice(0, 500) + '...' })),
        lessonsProcessed: 0,
        totalArtifacts: 0,
        artifactsByType: {
          principle: 0,
          mental_model: 0,
          heuristic: 0,
          failure_mode: 0,
          checklist: 0,
          qa_pair: 0,
          scenario: 0,
        },
        results: [],
        errors: [],
        dryRun: true,
      };
    }

    const batchResult = await this.ingestBatch({
      kb,
      courseId,
      transcripts: lessons.map(l => ({
        lessonId: l.lessonId,
        lessonTitle: l.lessonTitle,
        text: l.text,
      })),
      dryRun: false,
    });

    return {
      kb,
      courseId,
      courseTitle: finalCourseTitle,
      detectedLessons: lessons.map(l => ({ ...l, text: l.text.slice(0, 200) + '...' })),
      lessonsProcessed: batchResult.lessonsProcessed,
      totalArtifacts: batchResult.totalArtifacts,
      artifactsByType: batchResult.artifactsByType,
      results: batchResult.results,
      errors: batchResult.errors,
      dryRun: false,
    };
  }
}

export const learningArtifactService = new LearningArtifactService();

// Background job tracking for full course ingestion - now database-backed for persistence
export interface FullCourseJob {
  id: string;
  status: 'detecting' | 'processing' | 'completed' | 'failed';
  kb: string;
  courseId: string;
  courseTitle?: string;
  dryRun: boolean;
  lessonsDetected: number;
  lessonsProcessed: number;
  totalArtifacts: number;
  currentLesson?: string;
  detectedLessons?: DetectedLesson[];
  processedLessonIds: string[];
  errors: Array<{ lessonId: string; error: string }>;
  startedAt: Date;
  completedAt?: Date;
  result?: FullCourseIngestionResult;
}

// In-memory cache for raw text (too large for DB, only needed during processing)
const jobRawTextCache = new Map<string, string>();

async function saveJobToDb(job: FullCourseJob): Promise<void> {
  await db.insert(ingestionJobs).values({
    id: job.id,
    status: job.status,
    kb: job.kb,
    courseId: job.courseId,
    courseTitle: job.courseTitle,
    dryRun: job.dryRun,
    lessonsDetected: job.lessonsDetected,
    lessonsProcessed: job.lessonsProcessed,
    totalArtifacts: job.totalArtifacts,
    currentLesson: job.currentLesson,
    detectedLessons: job.detectedLessons as any,
    processedLessonIds: job.processedLessonIds as any,
    errors: job.errors as any,
    result: job.result as any,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  }).onConflictDoUpdate({
    target: ingestionJobs.id,
    set: {
      status: job.status,
      courseTitle: job.courseTitle,
      lessonsDetected: job.lessonsDetected,
      lessonsProcessed: job.lessonsProcessed,
      totalArtifacts: job.totalArtifacts,
      currentLesson: job.currentLesson,
      detectedLessons: job.detectedLessons as any,
      processedLessonIds: job.processedLessonIds as any,
      errors: job.errors as any,
      result: job.result as any,
      completedAt: job.completedAt,
      updatedAt: new Date(),
    },
  });
}

function dbRowToJob(row: any): FullCourseJob {
  return {
    id: row.id,
    status: row.status as FullCourseJob['status'],
    kb: row.kb,
    courseId: row.courseId,
    courseTitle: row.courseTitle || undefined,
    dryRun: row.dryRun ?? false,
    lessonsDetected: row.lessonsDetected ?? 0,
    lessonsProcessed: row.lessonsProcessed ?? 0,
    totalArtifacts: row.totalArtifacts ?? 0,
    currentLesson: row.currentLesson || undefined,
    detectedLessons: row.detectedLessons as DetectedLesson[] | undefined,
    processedLessonIds: (row.processedLessonIds as string[]) ?? [],
    errors: (row.errors as Array<{ lessonId: string; error: string }>) ?? [],
    startedAt: row.startedAt ?? new Date(),
    completedAt: row.completedAt || undefined,
    result: row.result as FullCourseIngestionResult | undefined,
  };
}

export async function getFullCourseJob(jobId: string): Promise<FullCourseJob | undefined> {
  const rows = await db.select().from(ingestionJobs).where(eq(ingestionJobs.id, jobId)).limit(1);
  if (rows.length === 0) return undefined;
  return dbRowToJob(rows[0]);
}

export async function listFullCourseJobs(): Promise<FullCourseJob[]> {
  const rows = await db.select().from(ingestionJobs).orderBy(ingestionJobs.startedAt);
  return rows.map(dbRowToJob).reverse(); // Most recent first
}

// Resume interrupted jobs on server startup
export async function resumeInterruptedJobs(): Promise<void> {
  // Find jobs that were interrupted mid-processing (have lessons detected)
  const processingRows = await db.select().from(ingestionJobs)
    .where(eq(ingestionJobs.status, 'processing'));
  
  // Also find jobs stuck in detecting phase (crashed during lesson detection)
  const detectingRows = await db.select().from(ingestionJobs)
    .where(eq(ingestionJobs.status, 'detecting'));
  
  if (processingRows.length === 0 && detectingRows.length === 0) {
    logger.info({ service: 'ingestion-jobs' }, 'No interrupted jobs to resume');
    return;
  }

  // Mark stuck detecting jobs as failed (can't resume without raw text)
  for (const row of detectingRows) {
    const job = dbRowToJob(row);
    job.status = 'failed';
    job.errors.push({ lessonId: 'global', error: 'Job interrupted during lesson detection - cannot resume (raw text not stored)' });
    job.completedAt = new Date();
    await saveJobToDb(job);
    logger.warn({ jobId: job.id }, 'Job stuck in detecting phase - marked as failed');
  }

  // Resume processing jobs that have lessons already detected
  for (const row of processingRows) {
    const job = dbRowToJob(row);
    
    // If we have detected lessons, we can resume from where we left off
    if (job.detectedLessons && job.detectedLessons.length > 0) {
      logger.info({ 
        jobId: job.id, 
        lessonsProcessed: job.lessonsProcessed,
        totalLessons: job.lessonsDetected 
      }, 'Resuming interrupted job');
      
      // Resume processing in background
      resumeJobProcessing(job);
    } else {
      // Can't resume without lesson data - mark as failed
      job.status = 'failed';
      job.errors.push({ lessonId: 'global', error: 'Job interrupted before lessons were detected - cannot resume' });
      job.completedAt = new Date();
      await saveJobToDb(job);
      logger.warn({ jobId: job.id }, 'Job interrupted before lesson detection - marked as failed');
    }
  }
}

async function resumeJobProcessing(job: FullCourseJob): Promise<void> {
  const lessons = job.detectedLessons!;
  const processedSet = new Set(job.processedLessonIds);
  
  // Find lessons that haven't been processed yet
  const remainingLessons = lessons.filter(l => !processedSet.has(l.lessonId));
  
  if (remainingLessons.length === 0) {
    job.status = 'completed';
    job.completedAt = new Date();
    await saveJobToDb(job);
    logger.info({ jobId: job.id }, 'Resumed job - all lessons already processed');
    return;
  }

  logger.info({ 
    jobId: job.id, 
    remainingLessons: remainingLessons.length 
  }, 'Resuming job processing');

  // Continue processing
  const artifactsByType: Record<string, number> = {
    principle: 0, mental_model: 0, heuristic: 0, 
    failure_mode: 0, checklist: 0, qa_pair: 0, scenario: 0,
  };

  for (const lesson of remainingLessons) {
    job.currentLesson = lesson.lessonTitle;
    await saveJobToDb(job);

    try {
      logger.info({ 
        jobId: job.id, 
        lessonIndex: job.lessonsProcessed + 1, 
        totalLessons: lessons.length,
        lessonId: lesson.lessonId 
      }, 'Background job: Processing lesson (resumed)');

      const result = await learningArtifactService.ingestTranscript({
        kb: job.kb,
        courseId: job.courseId,
        lessonId: lesson.lessonId,
        lessonTitle: lesson.lessonTitle,
        rawText: lesson.text,
        dryRun: false,
      });

      job.lessonsProcessed += 1;
      job.totalArtifacts += result.totalArtifacts;
      job.processedLessonIds.push(lesson.lessonId);

      // Aggregate artifact counts
      for (const [type, count] of Object.entries(result.artifactsByType)) {
        artifactsByType[type] = (artifactsByType[type] || 0) + (count as number);
      }

      await saveJobToDb(job);

      logger.info({ 
        jobId: job.id, 
        lessonIndex: job.lessonsProcessed,
        artifactsExtracted: result.totalArtifacts 
      }, 'Background job: Lesson processed (resumed)');

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      job.errors.push({ lessonId: lesson.lessonId, error: errorMsg });
      job.processedLessonIds.push(lesson.lessonId); // Mark as processed even on error
      await saveJobToDb(job);
      logger.error({ jobId: job.id, lessonId: lesson.lessonId, error: errorMsg }, 'Background job: Lesson failed (resumed)');
    }
  }

  job.status = 'completed';
  job.completedAt = new Date();
  job.result = {
    kb: job.kb,
    courseId: job.courseId,
    courseTitle: job.courseTitle || 'Unknown',
    detectedLessons: lessons.map(l => ({ ...l, text: l.text.slice(0, 200) + '...' })),
    lessonsProcessed: job.lessonsProcessed,
    totalArtifacts: job.totalArtifacts,
    artifactsByType: artifactsByType as any,
    results: [],
    errors: job.errors,
    dryRun: false,
  };
  await saveJobToDb(job);

  logger.info({ 
    jobId: job.id, 
    lessonsProcessed: job.lessonsProcessed,
    totalArtifacts: job.totalArtifacts 
  }, 'Background job: Full course ingestion completed (resumed)');
}

export async function startFullCourseIngestionJob(
  request: FullCourseIngestionRequest
): Promise<string> {
  const jobId = `fc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { kb, courseId, courseTitle, rawText, dryRun = false } = request;

  const job: FullCourseJob = {
    id: jobId,
    status: 'detecting',
    kb,
    courseId,
    courseTitle,
    dryRun,
    lessonsDetected: 0,
    lessonsProcessed: 0,
    totalArtifacts: 0,
    processedLessonIds: [],
    errors: [],
    startedAt: new Date(),
  };

  // Save to database immediately
  await saveJobToDb(job);

  // Run in background (non-blocking)
  (async () => {
    try {
      logger.info({ jobId, kb, courseId }, 'Background job: Starting lesson detection');

      const { courseTitle: detectedTitle, lessons } = await learningArtifactService.detectLessons(rawText);
      const finalCourseTitle = courseTitle || detectedTitle;

      job.courseTitle = finalCourseTitle;
      job.lessonsDetected = lessons.length;
      job.detectedLessons = lessons; // Store full lesson data for resume capability
      job.status = 'processing';
      await saveJobToDb(job);

      logger.info({ 
        jobId, 
        courseTitle: finalCourseTitle, 
        lessonsDetected: lessons.length 
      }, 'Background job: Lessons detected, starting artifact extraction');

      if (dryRun) {
        job.status = 'completed';
        job.completedAt = new Date();
        job.result = {
          kb,
          courseId,
          courseTitle: finalCourseTitle,
          detectedLessons: lessons.map(l => ({ ...l, text: l.text.slice(0, 500) + '...' })),
          lessonsProcessed: 0,
          totalArtifacts: 0,
          artifactsByType: {
            principle: 0, mental_model: 0, heuristic: 0, 
            failure_mode: 0, checklist: 0, qa_pair: 0, scenario: 0,
          },
          results: [],
          errors: [],
          dryRun: true,
        };
        await saveJobToDb(job);
        return;
      }

      // Process lessons one by one to track progress
      const results: any[] = [];
      let totalArtifacts = 0;
      const artifactsByType: Record<string, number> = {
        principle: 0, mental_model: 0, heuristic: 0, 
        failure_mode: 0, checklist: 0, qa_pair: 0, scenario: 0,
      };

      for (let i = 0; i < lessons.length; i++) {
        const lesson = lessons[i];
        job.currentLesson = lesson.lessonTitle;
        await saveJobToDb(job);

        try {
          logger.info({ 
            jobId, 
            lessonIndex: i + 1, 
            totalLessons: lessons.length,
            lessonId: lesson.lessonId 
          }, 'Background job: Processing lesson');

          const result = await learningArtifactService.ingestTranscript({
            kb,
            courseId,
            lessonId: lesson.lessonId,
            lessonTitle: lesson.lessonTitle,
            rawText: lesson.text,
            dryRun: false,
          });

          results.push(result);
          job.lessonsProcessed = i + 1;
          totalArtifacts += result.totalArtifacts;
          job.totalArtifacts = totalArtifacts;
          job.processedLessonIds.push(lesson.lessonId);

          // Aggregate artifact counts
          for (const [type, count] of Object.entries(result.artifactsByType)) {
            artifactsByType[type] = (artifactsByType[type] || 0) + (count as number);
          }

          await saveJobToDb(job);

          logger.info({ 
            jobId, 
            lessonIndex: i + 1,
            artifactsExtracted: result.totalArtifacts 
          }, 'Background job: Lesson processed');

        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          job.errors.push({ lessonId: lesson.lessonId, error: errorMsg });
          job.processedLessonIds.push(lesson.lessonId); // Mark as processed even on error
          await saveJobToDb(job);
          logger.error({ jobId, lessonId: lesson.lessonId, error: errorMsg }, 'Background job: Lesson failed');
        }
      }

      job.status = 'completed';
      job.completedAt = new Date();
      job.result = {
        kb,
        courseId,
        courseTitle: finalCourseTitle,
        detectedLessons: lessons.map(l => ({ ...l, text: l.text.slice(0, 200) + '...' })),
        lessonsProcessed: job.lessonsProcessed,
        totalArtifacts,
        artifactsByType: artifactsByType as any,
        results,
        errors: job.errors,
        dryRun: false,
      };
      await saveJobToDb(job);

      logger.info({ 
        jobId, 
        lessonsProcessed: job.lessonsProcessed,
        totalArtifacts 
      }, 'Background job: Full course ingestion completed');

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      job.status = 'failed';
      job.completedAt = new Date();
      job.errors.push({ lessonId: 'global', error: errorMsg });
      await saveJobToDb(job);
      logger.error({ jobId, error: errorMsg }, 'Background job: Full course ingestion failed');
    }
  })();

  return jobId;
}
