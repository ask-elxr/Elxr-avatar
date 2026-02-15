export type ArtifactType = 
  | 'principle'
  | 'mental_model'
  | 'heuristic'
  | 'failure_mode'
  | 'checklist'
  | 'qa_pair'
  | 'scenario';

export type ArtifactConfidence = 'low' | 'med' | 'high';

export interface LearningArtifact {
  artifact_type: ArtifactType;
  title: string;
  content: string;
  steps: string[] | null;
  example: string | null;
  topic: string;
  subtopic: string;
  tags: string[];
  confidence: ArtifactConfidence;
  safety_notes: string | null;
}

export interface LessonArtifacts {
  lesson_title: string;
  artifacts: LearningArtifact[];
}

export interface ArtifactRecord {
  id: string;
  chunk_text: string;
  metadata: ArtifactMetadata;
}

export interface ArtifactMetadata {
  kb: string;
  course_id: string;
  lesson_id: string;
  lesson_title: string;
  artifact_type: ArtifactType;
  artifact_index: number;
  title: string;
  topic: string;
  subtopic: string;
  tags: string;
  confidence: ArtifactConfidence;
  created_at: string;
  rights: 'original_derivative';
  source_type: 'derived_learning';
  safety_notes?: string;
  text: string;
}

export interface IngestionRequest {
  kb: string;
  courseId: string;
  lessonId: string;
  lessonTitle?: string;
  rawText: string;
  dryRun?: boolean;
}

export interface IngestionResult {
  kb: string;
  courseId: string;
  lessonId: string;
  lessonTitle: string;
  totalArtifacts: number;
  artifactsByType: Record<ArtifactType, number>;
  dryRunPreview?: LearningArtifact[];
  recordsUpserted?: number;
}

export interface BatchIngestionRequest {
  kb: string;
  courseId: string;
  transcripts: Array<{
    lessonId: string;
    lessonTitle?: string;
    text: string;
  }>;
  dryRun?: boolean;
}

export interface BatchIngestionResult {
  kb: string;
  courseId: string;
  lessonsProcessed: number;
  totalArtifacts: number;
  artifactsByType: Record<ArtifactType, number>;
  results: IngestionResult[];
  errors: Array<{ lessonId: string; error: string }>;
}

export interface DetectedLesson {
  lessonId: string;
  lessonTitle: string;
  text: string;
  startLine?: number;
  endLine?: number;
}

export interface FullCourseIngestionRequest {
  kb: string;
  courseId: string;
  courseTitle?: string;
  rawText: string;
  dryRun?: boolean;
}

export interface FullCourseIngestionResult {
  kb: string;
  courseId: string;
  courseTitle: string;
  detectedLessons: DetectedLesson[];
  lessonsProcessed: number;
  totalArtifacts: number;
  artifactsByType: Record<ArtifactType, number>;
  results: IngestionResult[];
  errors: Array<{ lessonId: string; error: string }>;
  dryRun: boolean;
}

export const KNOWN_KBS = [
  'psychedelics',
  'sexuality',
  'grief',
  'relationships',
  'mental_health',
  'wellness',
  'spirituality',
  'general',
  'transitions',
  'life',
  'midlife',
  'mind',
  'addiction',
  'body',
  'science',
  'nutrition',
  'longevity',
  'movement',
  'work',
  'sleep',
] as const;

export type KnowledgeBase = typeof KNOWN_KBS[number];

export function isValidKb(kb: string): kb is KnowledgeBase {
  return KNOWN_KBS.includes(kb as KnowledgeBase);
}
