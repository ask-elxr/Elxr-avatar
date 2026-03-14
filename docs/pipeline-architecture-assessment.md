# Pipeline Architecture Assessment

Assessment of the knowledge ingestion pipelines — covering the full flow from content upload to Pinecone vector storage, current parameters vs industry best practices, and improvement opportunities.

**Last updated**: 2026-03-13

---

## Pipeline Overview

The system has multiple ingestion paths, all converging on the same Pinecone vector store (`ask-elxr` index, 1536-dim cosine):

```
┌──────────────────┐     ┌───────────────────┐     ┌────────────────┐
│  Single Transcript│     │  Batch Upload (ZIP)│     │  Document Upload│
│  (Podcast tab)    │     │  (Podcast tab)     │     │  (Upload tab)   │
└────────┬─────────┘     └─────────┬──────────┘     └───────┬────────┘
         │                         │                         │
         ▼                         ▼                         ▼
   ┌───────────┐           ┌──────────────┐          ┌─────────────┐
   │ Claude AI │           │  Claude AI   │          │  Algorithmic │
   │ Extraction│           │  Extraction  │          │  Chunker     │
   │ + Chunking│           │  + Chunking  │          │  (350 tok)   │
   └─────┬─────┘           └──────┬───────┘          └──────┬──────┘
         │                        │                          │
         ▼                        ▼                          ▼
   ┌──────────────────────────────────────────────────────────────┐
   │              OpenAI Embeddings (text-embedding-3-small)      │
   └──────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
   ┌──────────────────────────────────────────────────────────────┐
   │                 Pinecone (ask-elxr index)                    │
   │           Namespaced by topic (addiction, mind, etc.)         │
   └──────────────────────────────────────────────────────────────┘
```

---

## Podcast Ingestion Pipeline (Detailed)

### Single Transcript Flow

**Frontend**: `client/src/components/PodcastIngestion.tsx`
**API**: `POST /api/admin/podcast/ingest`
**Backend**: `server/ingest/podcastIngestionService.ts`

1. **Substance Extraction** (`extractSubstance()`)
   - Splits transcript into batches of ~8000 tokens (32K chars)
   - Claude Haiku removes conversational fluff (intros, filler, ads, transitions)
   - Anonymizes speaker identity (names, companies, dates)
   - Output: cleaned prose, typically 40-60% reduction

2. **Semantic Chunking** (`chunkPodcastContent()`)
   - Splits extracted text into batches
   - Claude Haiku creates standalone knowledge units (120-300 tokens each)
   - Classifies each chunk with metadata: `content_type`, `tone`, `topic`, `confidence`
   - Validation: min 20 chars, max 350 tokens, enum enforcement

3. **Embedding** (`embedder.embedBatch()`)
   - Model: `text-embedding-3-small` (1536 dimensions)
   - Batch size: 100 texts per API call
   - Retry: 3 attempts with exponential backoff

4. **Pinecone Upsert**
   - Batch size: 50 vectors per upsert
   - Vector ID format: `{source}:{uuid8}`
   - Metadata: namespace, source, content_type, tone, topic, confidence, voice_origin, text, created_at, source_type

### Batch Upload Flow

**Frontend**: `client/src/components/BatchPodcastIngestion.tsx`
**API**: `POST /api/admin/podcast/batch/upload`
**Backend**: `server/ingest/batchPodcastService.ts`

Extends single transcript with:
- ZIP extraction with per-file SHA-256 deduplication
- Optional auto-namespace classification (Claude Haiku per episode)
- Two processing modes: `chunks` (standard) and `mentor_memory` (wisdom distillation)
- Full resumability: transcripts stored in PostgreSQL, per-namespace progress tracking
- Micro-batch embedding: 15 chunks at a time with 500ms delays between batches

---

## Metadata Schema

### Standard Podcast Chunks

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `namespace` | string | lowercase topic | Pinecone namespace |
| `source` | string | identifier | Source episode/file |
| `content_type` | enum | explanation, advice, story, warning, reframe | Content classification |
| `tone` | enum | warm, blunt, reflective, reassuring, provocative | Tone classification |
| `topic` | string | short phrase | Topic keyword |
| `confidence` | enum | soft, direct, authoritative | Confidence level |
| `voice_origin` | enum | avatar_native, attributed | Attribution status |
| `attribution` | string? | optional | Speaker attribution if provided |
| `text` | string | chunk content | Full text of the chunk |
| `created_at` | string | ISO 8601 | Ingestion timestamp |
| `source_type` | string | podcast, video, interview | Content source type |

### Mentor Memory Chunks (Extended)

Additional fields for `mentor_memory` distillation mode:
- `doc_type`: `mentor_memory` | `learned_wisdom`
- `kind`: principle | mental_model | heuristic | misconception | red_flag | voice_rules | go_to_move
- `mentor`: mentor name
- `derived`: `'true'`

---

## Current Parameters vs Best Practices

| Parameter | Current Value | Best Practice (2025-2026) | Assessment |
|-----------|--------------|--------------------------|------------|
| Chunk size (podcast) | 120-300 tokens | 256-512 tokens | Slightly small but suited for conversational queries |
| Chunk size (documents) | 350 tokens, 60 overlap | 256-512 tokens, 10-20% overlap | Well within range |
| Chunking strategy (podcast) | AI-driven (Claude Haiku) | LLM-driven > semantic > recursive | Premium approach |
| Chunking strategy (documents) | Token-based with heading awareness | Heading-aware splitting | Good |
| Overlap (podcast) | None (semantic boundaries) | 0-20% or none for semantic | Correct for LLM chunking |
| Overlap (documents) | ~17% (60/350 tokens) | 10-20% | Optimal |
| Embedding model | text-embedding-3-small (1536d) | text-embedding-3-small | Correct |
| Embedding batch size (single) | 100 | Up to 2048 | Conservative but safe |
| Embedding batch size (batch) | 15 + 500ms delay | Up to 100 | Very conservative; room to increase |
| Upsert batch size | 50 | Up to 1000 (2MB max) | Conservative but safe |
| Similarity metric | Cosine | Cosine (for normalized embeddings) | Correct |
| Validation | 20 char min, 350 token max | Varies | Strong enforcement |

---

## Architecture Strengths

### AI-Driven Semantic Chunking
Instead of mechanical splitting (fixed-size windows), the podcast pipeline uses Claude Haiku to identify natural knowledge boundaries. Each chunk represents ONE complete idea, making retrieval more precise. Feb 2026 benchmarks show LLM-based chunking outperforms recursive (69% accuracy) and semantic (54% accuracy) methods.

### Rich Metadata Classification
Every chunk is classified with `content_type`, `tone`, `topic`, and `confidence`. This enables:
- Filtered retrieval (e.g., only "advice" chunks, only "authoritative" confidence)
- Tone-aware response generation (matching chunk tone to avatar personality)
- Analytics on knowledge base composition

### Content Anonymization
The extraction prompt removes speaker identity, company names, dates, and biographical markers while preserving the insight. This is critical for educational content that must not be traceable to specific individuals.

### Full Resumability (Batch Pipeline)
- Transcripts stored in PostgreSQL immediately after ZIP extraction
- Pre-chunked data saved to DB before embedding
- Per-namespace upload progress persisted after each Pinecone upsert
- SHA-256 content hashing prevents duplicate ingestion
- `resumeStuckBatches()` recovers from server crashes

### Strong Validation
- Schema enforcement on all chunk metadata fields (enum validation with defaults)
- Minimum/maximum size thresholds with logging of discarded chunks
- Protected namespace guards prevent accidental modification of personal knowledge bases

---

## Improvement Opportunities

### 1. Contextual Retrieval (High Impact)
**What**: Prepend a brief source/episode summary to each chunk before embedding.
**Why**: Anthropic's research shows contextual retrieval improves retrieval relevance by ~49%. Chunks like "This approach works well in practice" become much more findable when prefixed with "From a discussion about cognitive behavioral therapy techniques: This approach works well in practice."
**Where**: `server/ingest/podcastIngestionService.ts` — add a summary generation step between extraction and chunking.

### 2. Content-Hash Deduplication for Single Transcripts (Medium Impact)
**What**: The batch pipeline has SHA-256 deduplication, but the single transcript path (`ingestPodcast()`) does not.
**Why**: Prevents accidental re-ingestion of the same transcript, which wastes API credits and creates duplicate vectors.
**Where**: `server/ingest/podcastIngestionService.ts` — add hash check before processing.

### 3. Chunk Index Tracking (Low Impact)
**What**: Add a `chunk_index` field to metadata to preserve ordering within an episode.
**Why**: Enables reconstructing the original narrative flow when displaying multiple chunks from the same source.
**Where**: `server/ingest/podcastIngestionService.ts` — add index to chunk metadata.

### 4. Increase Embed Batch Size (Low Impact)
**What**: Increase micro-batch embedding from 15 to 50-100 chunks per API call.
**Why**: The OpenAI embeddings API supports up to 2048 inputs per call. Processing 15 at a time with 500ms delays significantly slows batch ingestion.
**Where**: `server/ingest/microBatchIngestion.ts` — adjust `EMBED_BATCH_SIZE` constant.

### 5. Multi-Granularity Indexing (Future)
**What**: Index chunks at multiple sizes (sentence-level, paragraph-level, section-level) in the same namespace.
**Why**: Different query types benefit from different granularities. A specific factual question matches well with small chunks; a broad topic question benefits from larger context.
**Where**: Would require significant architecture changes to the chunking and retrieval pipelines.

---

## Key Constants Reference

| Constant | Value | File | Purpose |
|----------|-------|------|---------|
| `MAX_TOKENS_PER_BATCH` | 8000 | `podcastIngestionService.ts` | Claude input batch size |
| `APPROX_CHARS_PER_TOKEN` | 4 | `podcastIngestionService.ts` | Token estimation ratio |
| `UPSERT_BATCH_SIZE` | 50 | `podcastIngestionService.ts`, `microBatchIngestion.ts` | Pinecone upsert limit |
| `EMBED_BATCH_SIZE` | 15 | `microBatchIngestion.ts` | Embedding API batch size (micro-batch path) |
| `BATCH_SIZE` | 100 | `embedder.ts` | Embedding API batch size (direct path) |
| `SLEEP_BETWEEN_EMBED_MS` | 500 | `microBatchIngestion.ts` | Rate limit delay |
| `SLEEP_BETWEEN_UPSERT_MS` | 300 | `microBatchIngestion.ts` | Rate limit delay |
| `MAX_RETRIES` | 3 | multiple files | API retry attempts |
| `RETRY_DELAY_MS` | 1000 | multiple files | Base retry delay |
| Chunk tokens target | 120-300 | `podcastTypes.ts` (prompt) | Ideal chunk size |
| Chunk tokens hard limit | 350 | `podcastIngestionService.ts` | Validation threshold |
| Min substance chars | 100 | `podcastIngestionService.ts` | Post-extraction minimum |
| Min chunk chars | 20 | `podcastIngestionService.ts` | Chunk validation minimum |
| Document chunk size | 350 tokens | `chunker.ts` | Document pipeline default |
| Document overlap | 60 tokens | `chunker.ts` | Document pipeline overlap |

---

## Processing Models

| Stage | Model | Cost Tier | Purpose |
|-------|-------|-----------|---------|
| Substance extraction | `claude-haiku-4-5-20251001` | Low | Remove conversational fluff |
| Semantic chunking | `claude-haiku-4-5-20251001` | Low | Create standalone knowledge units |
| Namespace classification | `claude-haiku-4-5-20251001` | Low | Auto-detect target namespace |
| Mentor distillation | `claude-haiku-4-5-20251001` | Low | Extract wisdom patterns |
| Embeddings | `text-embedding-3-small` | Low | 1536-dim vector generation |
| Conversations (retrieval) | `claude-opus-4-6` | High | Quality responses to users |

---

## Pinecone Configuration

| Setting | Value |
|---------|-------|
| Index name | `ask-elxr` |
| Dimensions | 1536 |
| Metric | cosine |
| Infrastructure | Serverless (AWS us-east-1) |
| Namespaces | 20 (16 topic + 3 personal + 1 other) |
| Max metadata per vector | 40KB |
