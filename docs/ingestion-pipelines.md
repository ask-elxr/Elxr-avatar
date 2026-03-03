# Ingestion Pipelines

## Overview

The ingestion system transforms raw content (documents, transcripts, podcasts, Drive files) into searchable vector embeddings in Pinecone. All ingestion code lives in `server/ingest/`.

**Key constraints**:
- Embedding model: `text-embedding-3-small` (1536 dimensions) — never `ada-002`
- Ingestion LLM: Claude Haiku 3.5 (cost savings)
- Content anonymity: Educational content MUST go through Learning Artifact pipeline. Only personal knowledge namespaces (mark-kohl, willie-gault) allow verbatim chunks.

## Pinecone Namespace Taxonomy

Defined in `shared/pineconeCategories.ts`. Sourced from Google Drive folder structure.

| Namespace | Topic |
|-----------|-------|
| ADDICTION | Addiction, recovery, substance-related |
| MIND | Mental health, psychology, cognitive wellness |
| BODY | Physical health, anatomy |
| SEXUALITY | Sexual health, intimacy, relationships |
| TRANSITIONS | Life transitions, change |
| SPIRITUALITY | Spiritual practices, consciousness |
| SCIENCE | Scientific research, evidence-based |
| PSYCHEDELICS | Psychedelic compounds and therapy |
| NUTRITION | Diet and food wellness |
| LIFE | General life guidance |
| LONGEVITY | Aging, healthspan optimization |
| GRIEF | Loss and bereavement |
| MIDLIFE | Midlife transitions |
| MOVEMENT | Exercise and fitness |
| WORK | Career and work-life balance |
| SLEEP | Sleep health |
| MARK_KOHL | Mark Kohl's personal knowledge |
| WILLIE_GAULT | Willie Gault's expertise |
| NIGEL_WILLIAMS | Nigel Williams's expertise |
| OTHER | Miscellaneous |

**Pinecone indexes**: `avatar-chat-knowledge` (primary), `ask-elxr` (secondary)

## Common Components

### Chunker (`server/ingest/chunker.ts`)
Token-based text splitting:
- **Default**: 350 tokens per chunk, 60 token overlap
- Heading-aware: Respects markdown headings, preserves breadcrumb context
- Each chunk includes metadata: source, position, heading hierarchy

### Embedder (`server/ingest/embedder.ts`)
OpenAI embedding with production reliability:
- Model: `text-embedding-3-small` (1536 dims)
- Batch processing: Sends multiple texts per API call
- Retry logic: Exponential backoff for rate limits
- Error handling: Graceful degradation per chunk

### Namespace Classifier (`server/ingest/namespaceClassifier.ts`)
Auto-classifies content into Pinecone namespaces using Claude:
- Analyzes text content
- Maps to the taxonomy above
- Used in podcast batch ingestion

---

## Pipeline 1: Document Processing

**Files**: `server/documentProcessor.ts`, `server/documentService.ts`

**Input**: PDF, DOCX, or video files uploaded via the frontend.

**Flow**:
1. File uploaded via multer → stored in object storage
2. Text extracted (pdf-parse for PDF, mammoth for DOCX)
3. Text chunked (350 tokens, 60 overlap)
4. Chunks embedded via OpenAI
5. Vectors upserted to Pinecone (`documents` or `video-transcripts` namespace)
6. Progress tracked in `jobs` table

**Endpoints**: `POST /api/documents/process`, `POST /api/documents/upload-zip`

---

## Pipeline 2: Topic Folder Ingestion (Google Drive)

**Files**: `server/googleDriveService.ts`, routes in `server/routes.ts`

**Input**: Files from organized Google Drive topic folders.

**Flow**:
1. Admin browses Google Drive folders via the picker UI
2. Files selected for ingestion with target namespace
3. Claude extracts substance from raw content
4. Content converted to conversational chunks
5. Chunks embedded and upserted to the appropriate Pinecone namespace

**Endpoints**: `POST /api/google-drive/topic-upload-single`, `POST /api/google-drive/topic-upload-artifacts`

---

## Pipeline 3: Course Transcript Ingestion

**Files**: `server/ingest/courseIngestionService.ts`, `server/ingest/conversationalChunker.ts`

**Input**: Course transcripts (single lesson or full course text).

**Flow**:
1. Text submitted via admin panel
2. Claude anonymizes content (removes instructor names, recognizable phrasing)
3. Self-check loop validates anonymization quality
4. Content split into conversational chunks (120-300 token standalone units)
5. Each chunk classified with metadata (topic, type)
6. Chunks embedded and upserted to content-type specific namespaces

**Important**: This pipeline enforces the content anonymity policy. No verbatim quotes or instructor names in educational content.

**Endpoints**: `POST /api/admin/course/ingest`

---

## Pipeline 4: Learning Artifact Ingestion

**File**: `server/ingest/learningArtifactService.ts` (~34KB)

**Input**: Course transcripts (single lesson or full course).

**Purpose**: Transform transcripts into derived learning artifacts instead of storing verbatim text. This ensures copyright compliance and better retrieval quality.

### Artifact Types
| Type | Description |
|------|-------------|
| `principle` | Core teaching principles |
| `mental_model` | Mental models and frameworks |
| `heuristic` | Rules of thumb and practical guidelines |
| `failure_mode` | Common mistakes and anti-patterns |
| `checklist` | Step-by-step procedures |
| `qa_pair` | Question-answer pairs |
| `scenario` | Practical scenarios and examples |

### Flow
1. Transcript submitted (single lesson or full course)
2. **Auto-lesson detection** (full course): Claude identifies lesson boundaries
3. Each lesson processed by Claude → generates typed learning artifacts
4. Artifacts embedded and upserted to Pinecone with rich metadata
5. Progress tracked in `ingestion_jobs` table (persistent, survives restarts)

### Background Job Pattern
Full course ingestion runs as a background job to avoid HTTP timeouts:
- Returns job ID immediately
- Frontend polls `GET /api/admin/learning-artifacts/job/:jobId` for status
- Real-time progress: lessons detected, processed, artifacts created

**Endpoints**:
- `POST /api/admin/learning-artifacts/ingest` — Single lesson
- `POST /api/admin/learning-artifacts/ingest-batch` — Batch lessons
- `POST /api/admin/learning-artifacts/ingest-full-course` — Full course (background job)

---

## Pipeline 5: Podcast Batch Ingestion

**Files**: `server/ingest/batchPodcastService.ts` (~29KB), `server/ingest/microBatchIngestion.ts`

**Input**: ZIP archives containing podcast episode transcripts.

**Purpose**: Process large volumes of podcast episodes with full resumability.

### Resumability Architecture
Designed for Replit's constrained environment:
- All intermediate state stored in `podcast_batches` + `podcast_episodes` tables
- Survives server restarts — just call resume endpoint
- Micro-batch processing prevents memory/timeout issues

### Flow
1. ZIP uploaded → episodes extracted → saved to `podcast_episodes` table
2. **Classification phase**: Claude auto-classifies each episode into namespace
3. Admin reviews/overrides namespace assignments
4. **Processing phase** (micro-batch):
   - Process episodes in small batches
   - Each episode: chunk → embed → upsert to classified namespace
   - Rate limiting between batches
   - Retry logic for individual failures

### Distillation Modes
- `chunks` — Standard chunking (verbatim text, for personal namespaces only)
- `mentor_memory` — Claude-powered distillation to mentor-style insights

**Endpoints**:
- `POST /api/admin/podcast/batch/upload` — Upload ZIP
- `POST /api/admin/podcast/batch/:id/classify` — Classify episodes
- `POST /api/admin/podcast/batch/:id/start-processing` — Start processing
- `POST /api/admin/podcast/batch/:id/retry` — Retry failed
- `POST /api/admin/podcast/batch/resume-stuck` — Resume after crash

---

## Pipeline 6: Text Ingestion (Direct)

**File**: `server/ingest/ingestionService.ts`

**Input**: Plain text submitted via admin panel or API.

**Flow**:
1. Text submitted with target namespace
2. Chunked (350 tokens, 60 overlap)
3. Embedded via OpenAI
4. Upserted to Pinecone

**Endpoints**: `POST /api/admin/ingest/text`

---

## Pipeline 7: Wikipedia Sync

**File**: `server/wikipediaService.ts`

**Input**: Wikipedia article URLs.

**Flow**:
1. Fetch article content via Wikipedia API
2. Extract clean text
3. Chunk and embed
4. Upsert to avatar's Pinecone namespace
5. Auto-triggered on server start for certain avatars (e.g., Willie Gault)

**Endpoints**: `POST /api/wikipedia/sync`

---

## Pipeline 8: n8n Webhook Ingestion

**Routes**: `server/routes.ts` (webhook section)

**Input**: Files pushed from n8n automation workflows.

**Flow**:
1. n8n sends file via webhook
2. Server processes and ingests to Pinecone
3. Stats available via webhook endpoint

**Endpoints**: `POST /api/webhook/n8n/ingest-file`, `POST /api/webhook/n8n/ingest-all`

---

## Namespace Management

**File**: `server/ingest/namespaceConsolidation.ts`

Admin tools for managing Pinecone namespaces:
- List all namespaces with vector counts
- Detect duplicate namespaces
- Consolidate/merge namespaces
- Migrate vectors between namespaces
- Delete namespaces

**Endpoints**: `GET /api/admin/namespaces`, `POST /api/admin/namespaces/consolidate`
