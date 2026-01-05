export type SourceType = 'podcast' | 'video' | 'interview';

export interface PodcastIngestionRequest {
  namespace: string;
  source: string;
  rawText: string;
  sourceType: SourceType;
  attribution?: string;
  dryRun?: boolean;
}

export interface PodcastIngestionResult {
  namespace: string;
  source: string;
  sourceType: SourceType;
  totalChunks: number;
  chunksByType: Record<string, number>;
  discardedCount: number;
  dryRunPreview?: any[];
}

export const PODCAST_EXTRACTION_PROMPT = `You are a content distillation engine for podcasts and video interviews.

Your job is to extract ONLY the valuable insights, removing all conversational fluff.

REMOVE completely:
- Host introductions ("Welcome to the show", "Thanks for having me")
- Small talk and pleasantries ("How are you?", "Great to be here")
- Self-promotion ("Check out my website", "Follow me on...")
- Transitions ("Let me ask you this", "That's a great question")
- Filler phrases ("You know", "I mean", "Like I said")
- Repetition for emphasis (podcasts repeat because listeners drift)
- Off-topic tangents unrelated to the core subject
- Reading ads or sponsorship messages
- Podcast-specific references ("As I mentioned last episode")
- Laughing, pauses, stuttering transcription artifacts

KEEP and ENHANCE:
- Core insights and wisdom
- Practical advice and actionable tips
- Unique perspectives and frameworks
- Emotional truths and vulnerability
- Stories that illustrate a point (anonymize them)
- Warnings and cautionary advice
- Counterintuitive observations

ANONYMIZATION RULES:
- Remove guest/host names throughout
- Convert "When I was at Google..." to "At a major tech company..."
- Remove specific dates and locations
- Generalize unique career markers
- Keep the wisdom, remove the biography

OUTPUT:
Return ONLY the cleaned, substantive text. No meta commentary.
The output should read like a coherent knowledge document, not a transcript.
Remove all speaker labels (Host:, Guest:, etc.)
Combine related points into flowing prose.`;

export const PODCAST_CHUNKING_PROMPT = `You are a knowledge editor for podcast and video content.

Transform this cleaned podcast content into standalone knowledge units.

RULES:
- Each chunk: ONE complete idea (120-300 tokens)
- No podcast references ("the host mentioned", "earlier in the interview")
- No speaker references
- Write as if an expert is speaking directly
- Each chunk must stand alone without context

CLASSIFY each chunk:
- content_type: explanation | advice | story | warning | reframe
- tone: warm | blunt | reflective | reassuring | provocative  
- topic: short lowercase phrase
- confidence: soft | direct | authoritative

OUTPUT FORMAT (JSON array only):
[
  {
    "text": "...",
    "content_type": "...",
    "tone": "...",
    "topic": "...",
    "confidence": "..."
  }
]

If content is purely conversational filler, discard it.`;
