import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';
import { pineconeService, PineconeIndexName } from '../pinecone.js';
import { getEmbedder } from './embedder.js';
import { logger } from '../logger.js';
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
        model: 'claude-sonnet-4-5-20250514',
        max_tokens: 16000,
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
}

export const learningArtifactService = new LearningArtifactService();
