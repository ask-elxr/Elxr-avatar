export type ContentType = 'explanation' | 'advice' | 'story' | 'warning' | 'reframe';
export type Tone = 'warm' | 'blunt' | 'reflective' | 'reassuring' | 'provocative';
export type Confidence = 'soft' | 'direct' | 'authoritative';
export type VoiceOrigin = 'avatar_native' | 'attributed';

export interface ConversationalChunk {
  text: string;
  content_type: ContentType;
  tone: Tone;
  topic: string;
  confidence: Confidence;
  voice_origin: VoiceOrigin;
  attribution?: string;
}

export interface ConversationalMetadata {
  namespace: string;
  source: string;
  content_type: string;
  tone: string;
  topic: string;
  confidence: string;
  voice_origin: string;
  attribution?: string;
  text: string;
  created_at: string;
  [key: string]: string | undefined;
}

export interface CourseIngestionRequest {
  namespace: string;
  source: string;
  rawText: string;
  attribution?: string;
  dryRun?: boolean;
}

export interface CourseIngestionResult {
  namespace: string;
  source: string;
  totalChunks: number;
  chunksByType: Record<ContentType, number>;
  discardedCount: number;
  dryRunPreview?: ConversationalChunk[];
}

export interface AnonymizationResult {
  anonymizedText: string;
  wasModified: boolean;
}

export interface ChunkingResult {
  chunks: ConversationalChunk[];
  discardedCount: number;
}

export const PROTECTED_AVATARS = ['mark-kohl', 'markkohl'] as const;

export function isProtectedAvatar(avatar: string): boolean {
  const normalized = avatar.toLowerCase().replace(/[^a-z0-9]/g, '');
  return PROTECTED_AVATARS.some(p => 
    p.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized
  );
}

export function getNamespaceForContentType(avatar: string, contentType: ContentType): string {
  const avatarSlug = avatar.toLowerCase().replace(/[^a-z0-9]/g, '_');
  
  switch (contentType) {
    case 'story':
      return `${avatarSlug}_stories`;
    case 'advice':
      return `${avatarSlug}_advice`;
    case 'warning':
      return `${avatarSlug}_warnings`;
    case 'reframe':
      return `${avatarSlug}_reframes`;
    case 'explanation':
    default:
      return `${avatarSlug}_core`;
  }
}

export const ANONYMIZATION_SYSTEM_PROMPT = `You are an anonymization and voice-normalization engine.

Your job is to rewrite content so that:
- No individual person can be identified
- No unique verbal tics, phrases, or storytelling markers remain
- The content sounds like it comes from a knowledgeable avatar persona, not a real human

STRICT RULES:
- Remove names, places, dates, personal identifiers
- Remove references to "my practice," "my clients," "when I was…"
- Convert first-person personal stories into generalized experiential wisdom
- Preserve insight, emotional truth, and usefulness
- Do NOT add attribution unless explicitly told to

STYLE RULES:
- Speak in confident, conversational generalizations
- Use phrases like:
  "What I've seen again and again…"
  "Most people don't realize…"
  "In practice, this usually shows up as…"
- Avoid any phrasing that implies a specific biography

If the text feels recognizable as a specific person:
REWRITE IT AGAIN.

OUTPUT:
- Clean, anonymous, avatar-native language
- No meta commentary
- No explanation of changes
- Return ONLY the anonymized text`;

export const CHUNKING_SYSTEM_PROMPT = `You are a conversational knowledge editor.

Your job is to transform long-form course transcripts into short, stand-alone knowledge units that can be used in natural conversation.

IMPORTANT RULES:
- Do NOT preserve lesson structure, modules, or sequencing
- Do NOT reference lessons, chapters, timestamps, or downloads
- Write as if a human expert is speaking conversationally
- Each output chunk must stand alone without context
- Use natural spoken language, not academic tone

For each chunk:
- Express ONE idea only
- 120–300 tokens max
- No intros like "In this lesson…"
- No summaries of what will be covered
- No calls to action

CLASSIFY each chunk with metadata:
- content_type: explanation | advice | story | warning | reframe
- tone: warm | blunt | reflective | reassuring | provocative
- topic: short lowercase phrase (e.g. "desire mismatch")
- confidence: soft | direct | authoritative

EXCLUSION RULES - NEVER include content that is:
- Lesson intros ("In this module you'll learn…")
- Calls to action ("Download the worksheet", "Sign up for…")
- Structural glue ("Next we'll talk about…", "Earlier we discussed…")
- Repetition for emphasis (courses repeat because humans forget, vectors remember everything)
- Long lists (turn into atomic statements or discard)
- Stage directions ([pause], [laughs], Slide 14)
- Brand or platform instructions
- Legal disclaimers

OUTPUT FORMAT (JSON array only, no other text):

[
  {
    "text": "...",
    "content_type": "explanation|advice|story|warning|reframe",
    "tone": "warm|blunt|reflective|reassuring|provocative",
    "topic": "short lowercase phrase",
    "confidence": "soft|direct|authoritative"
  }
]

If content is repetitive, collapse it.
If content is instructional, convert it into spoken advice.
If content is emotional, preserve the emotional framing.
If content is purely logistical, discard it.`;

export const ANONYMIZATION_CHECK_PROMPT = `Could this text reasonably be traced back to a specific public individual based on phrasing, storytelling style, or identifiable details?

Answer only YES or NO.`;
