# Multi-Avatar AI Chat System

### Overview
This project is an advanced AI chat platform integrating HeyGen video avatars for real-time voice conversations and a video course creation system. It features knowledge retrieval from diverse sources (Pinecone, PubMed, Wikipedia, Notion) and persistent memory via Mem0. The system aims to provide an interactive, intelligent, and personalized AI conversational experience with significant market potential in education, customer service, and specialized information retrieval.

### User Preferences
- **Architecture**: Modular code organization with separate config/, services/, routes/
- **Avatar Merging**: DB overrides take absolute precedence (including null, false, empty string)
- **Service Facades**: Thin wrappers that re-export existing functionality
- **Route Extraction**: Incremental migration from monolithic routes.ts to feature-focused modules

### System Architecture

#### Frontend (React + TypeScript)
- **Core Features**: Avatar selection, LiveAvatar video streaming, Web Speech API for voice recognition, real-time chat with memory, document upload, and an admin dashboard.
- **SessionDriver Pattern**: Unified abstraction for avatar sessions (`LiveAvatarDriver`, `AudioOnlyDriver`).
- **Real-time Streaming Pipeline**: Ultra-low latency voice conversation via WebSocket, integrating ElevenLabs STT, Pinecone RAG, Mem0, OpenAI Realtime API, and ElevenLabs Realtime TTS. Designed for zero buffering and minimum latency across LLM, TTS, and STT streams.
- **WebRTC Streaming Pipeline**: LiveKit-based WebRTC transport for ultra-low latency audio, bridging to ElevenLabs STT/TTS and Claude AI.
- **Parallel RAG + LLM Pipeline**: Prioritizes responsiveness by initiating RAG/Mem0 searches immediately and conditionally including context in the LLM prompt.
- **Audio Streaming Mode**: Includes immediate thinking sounds, parallel data fetching, Claude streaming with sentence buffering, concurrent TTS generation, and SSE audio events for ordered playback.
- **Templated Responses**: Pre-written greetings, buffer fillers, and idle outros in `server/templatedResponses.ts` - never LLM-generated, rotated randomly with no repeats.
- **Warmth Engine**: `server/warmthEngine.ts` implements banter level detection (0-3), context condensing (score ≥0.78, max 1200 chars), and warmth protocol for natural responses.

#### Backend (Express + TypeScript + Python)
- **Structure**: Modular routes, service facades for business logic (avatars, RAG, memory, auth), and centralized configuration.
- **Python Integration**: Pipecat bot service for conversational AI.

#### Database (PostgreSQL + Drizzle ORM)
- **Schema**: Defined in `shared/schema.ts`, including tables for `avatar_profiles`, `conversations`, `courses`, `lessons`, `generated_videos`, `mood_entries`, and a subscription system.

#### Avatar System
- **Multi-avatar Support**: Includes 10 active avatars with unique expertise, configurable settings, dedicated Pinecone knowledge bases, and per-avatar research source toggles.
- **HeyGen Integration**: Utilizes dual HeyGen IDs (LiveAvatar for streaming, Instant/Public for video generation) and separate API keys.
- **Platform & Voice Configuration**: Per-avatar selection for streaming platform (LiveAvatar/HeyGen) and voice source (ElevenLabs/HeyGen).

#### Video Course System
- **Workflow**: Users create courses, add lessons, and generate videos via HeyGen, with optional AI script generation using Claude AI and Pinecone knowledge. Supports watermarked test videos and watermark-free production videos.
- **Robust Video Status Monitoring**: Includes polling, startup recovery, and orphaned lesson detection.

#### Chat Video-on-Demand System
- **Feature**: Users can request videos during chat via intent detection, generating scripts with Claude AI and creating videos asynchronously via HeyGen. Includes a global notification system for video status.

#### Mood Tracker System
- **Feature**: Users log emotional states, with Claude AI generating personalized, empathetic responses.

#### Subscription System
- **Tiers**: Free Trial, Basic, and Full plans with varying limits and management for activation, usage tracking, and limit enforcement.

#### Role-Based Access Control (RBAC)
- **Roles**: `admin` and `user`, with backend middleware and frontend guards for protection.

#### Webflow Embedding Mode
- **Anonymous Access**: Bypasses authentication for user-facing routes, assigning anonymous session IDs.
- **Admin Secret Authentication**: Admin routes protected by `X-Admin-Secret` header.
- **CORS & CSP**: Configured for embedding from any origin.
- **Embed-Only Routes**: Chrome-free pages for iframe embedding.

#### Avatar-Namespace Matrix Visualization
- **Component**: `AvatarNamespaceMatrix.tsx` provides interactive visualization of avatar-to-Pinecone namespace relationships.

#### Google Drive Topic Folders Integration
- **Source**: Integrates with Google Drive topic folders for Pinecone namespace population, configured in `shared/pineconeCategories.ts`.
- **Admin UI**: KnowledgeBase page offers a "Topic Folders" tab for bulk uploads.
- **Memory Optimization**: Implements file size limits, excludes archives, and processes sequentially.
- **Bulk Ingestion Endpoints** (Admin Only, authenticated via X-Admin-Secret header):
  - `POST /api/google-drive/bulk-ingest-start`: Starts server-side background ingestion of all topic folders
  - `GET /api/google-drive/bulk-ingest-status`: Returns current ingestion progress, success/fail counts, and recent results
- **Processing Pipeline**: Claude substance extraction (85-90% reduction) → conversational chunking → OpenAI embeddings → Pinecone upsert
- **Current Status** (Jan 2026): Bulk ingestion of 277 files across 17 namespaces running server-side (~5-7 min per file)

#### Personality Engine
- **Location**: `server/engine/` directory with modular architecture.
- **Persona Specs**: JSON files defining identity, boundaries, voice, behavior, knowledge policies.
- **Components**: `personaLoader.ts`, `personaRegistry.ts`, `promptAssembler.ts`, `responseCritic.ts`, `avatarIntegration.ts`.

#### Production Pinecone Ingestion System
- **Location**: `server/ingest/` directory with modular architecture.
- **Namespace Format**: `{env}:mentor:{mentorSlug}:{kbSlug}:v{version}`.
- **Chunking**: Token-based (350 tokens default, 60 overlap), heading-aware splitting, breadcrumb context.
- **Embeddings**: OpenAI text-embedding-3-small with batch processing and retry logic.
- **Debug Logging**: JSONL files for debugging and reindexing.
- **Admin Endpoints**: For ingesting text, querying namespaces, deleting sources, and health checks.

#### Course Transcript Ingestion System
- **Location**: `server/ingest/`.
- **Purpose**: Anonymize and conversationally chunk course transcripts using Claude AI, then route to content-type specific Pinecone namespaces.
- **Anonymization**: Claude-powered removal of sensitive information with a self-check loop.
- **Conversational Chunking**: 120-300 token standalone units with metadata classification (e.g., `content_type`, `tone`, `topic`, `confidence`, `voice_origin`).
- **Namespace Routing**: Content routed to `{avatar}_core`, `{avatar}_stories`, etc., based on content type.
- **Exclusion Rules**: Automatically discards lesson intros, CTAs, structural glue, repetition, long lists, stage directions, brand instructions.
- **Protected Avatars**: Mark Kohl's namespace is protected.
- **Admin Endpoints**: For ingesting transcripts, getting namespace stats, and deleting namespaces.
- **Admin UI**: KnowledgeBase page "Courses" tab with transcript paste, dry run, stats, and preview.

#### Batch Podcast Ingestion System (Replit-Safe Architecture)
- **Location**: `server/ingest/batchPodcastService.ts`, `server/ingest/microBatchIngestion.ts`, `client/src/components/BatchPodcastIngestion.tsx`.
- **Purpose**: Process large ZIP archives of podcast episode transcripts with full resumability.
- **Database Tables**: `podcast_batches`, `podcast_episodes` (with `transcript_text`, `chunks_json`, `chunks_uploaded` columns for persistence).
- **Processing Flow**:
  1. ZIP upload → extraction → store transcript in database (`transcript_text`)
  2. Substance extraction + chunking → save pre-chunked data as JSON (`chunks_json`)
  3. Micro-batch embedding (15 chunks at a time) with 500ms sleep intervals
  4. Micro-batch upserting (50 vectors at a time) with 300ms sleep intervals
  5. Per-namespace progress tracking for multi-namespace support
- **Resumability**: Survives server restarts by storing all intermediate state in database:
  - Transcripts stored in `transcript_text` column (no temp file dependency)
  - Pre-chunked data stored in `chunks_json` column
  - Upload progress tracked in `chunks_uploaded` column
  - Automatic startup recovery calls `resumeStuckBatches()` 5 seconds after server start
- **Micro-Batch Design**: Prevents memory/timeout issues on Replit by processing in small batches with retry logic and rate limiting.
- **Supported File Types**: .txt, .md, .srt, .vtt.
- **Rate Limiting**: 2-second delay between episodes, 500ms between embedding batches, 300ms between upsert batches.
- **Protected Namespaces**: Mark Kohl's namespace cannot be modified.
- **Admin Endpoints**: For uploading ZIPs, getting batch status, listing batches, retrying failed episodes, and manually triggering recovery.
- **Admin UI**: KnowledgeBase page "Podcasts" tab → "Batch Upload (ZIP)" sub-tab.

#### Learning Artifact Ingestion System
- **Location**: `server/ingest/learningArtifactService.ts`, `server/ingest/learningArtifactTypes.ts`, `client/src/components/LearningArtifactIngestion.tsx`.
- **Purpose**: Transform course transcripts into derived learning artifacts instead of storing verbatim text. Safer for copyright and more useful for retrieval.
- **Artifact Types**: `principle`, `mental_model`, `heuristic`, `failure_mode`, `checklist`, `qa_pair`, `scenario`.
- **Processing Flow**:
  1. Transcript normalization (remove boilerplate, clean whitespace)
  2. Claude AI extracts 30-120 learning artifacts per lesson in structured JSON
  3. Each artifact includes: title, content, steps, example, topic, subtopic, tags, confidence, safety_notes
  4. Artifacts packed for vector search and embedded via OpenAI
  5. Upsert to Pinecone with structured IDs and comprehensive metadata
- **ID Format**: `${courseId}:${lessonId}:${artifact_type}:${artifact_index}:${sha1_hash}`
- **Metadata**: kb, course_id, lesson_id, lesson_title, artifact_type, title, topic, subtopic, tags, confidence, rights, source_type
- **Known KBs**: psychedelics, sexuality, grief, relationships, mental_health, wellness, spirituality, general
- **Admin Endpoints** (X-Admin-Secret authenticated):
  - `GET /admin/learning-artifacts/kbs`: List valid knowledge bases
  - `POST /admin/learning-artifacts/ingest`: Ingest single transcript
  - `POST /admin/learning-artifacts/ingest-batch`: Batch ingest multiple transcripts
  - `GET /admin/learning-artifacts/stats/:namespace`: Get namespace stats
  - `DELETE /admin/learning-artifacts/:namespace/:courseId`: Delete artifacts by source
- **Admin UI**: KnowledgeBase page "Artifacts" tab with dry run preview and artifact type breakdown.
- **Evaluation**: `server/ingest/eval.ts` and `eval_queries.json` for testing retrieval quality.

#### Content Taxonomy System
- **Location**: `server/contentTaxonomy.ts`.
- **Purpose**: Professional, taxonomy-driven content policy for adult educational wellness platform.
- **Categories**: 8 subject areas including Sexuality & Intimacy, Mental/Emotional, Psychedelics.
- **Tone**: "Composed expert in a private room".
- **Framing**: Adult, educational, experiential, and harm-reduction oriented discussions.
- **Guardrails**: No explicit storytelling, illegal instructions, medical/legal advice, or harm glamorization.
- **Integration**: `ELXR_CONTENT_POLICY` is prepended to all avatar system prompts.

#### Avatar Mini-Games System
- **Location**: `client/src/components/AvatarMiniGames.tsx`, `server/routes/games.ts`.
- **Purpose**: Interactive games users can play with avatars during chat sessions.
- **Games Available**: Trivia Challenge, Word Association, Mood Check-in, Would You Rather, Story Builder.
- **Integration**: Accessible via "Play Games" button in avatar chat dropdown menu.
- **Backend**: Claude-powered game responses personalized to each avatar's personality.

#### Technical Implementations
- **AI Integration**: Primary LLM is Claude Sonnet 4.5, integrated with RAG (Pinecone, PubMed, Wikipedia, Google Search) and Mem0 for persistent memory.
- **Smart Memory Extraction**: Mem0 extracts filtered, deduplicated, and typed memories using Claude.
- **Real-time Voice**: HeyGen for video/audio synthesis, Web Speech API for voice recognition.
- **Anonymous Sessions**: Supports persistent anonymous user sessions.

### External Dependencies

- **HeyGen**: Video avatar service.
- **Anthropic (Claude AI)**: Primary Large Language Model.
- **Pinecone**: Vector database.
- **Mem0**: Persistent memory service.
- **PubMed**: Medical and scientific research source.
- **Wikipedia**: General knowledge source.
- **Google Search**: Web search.
- **PostgreSQL**: Relational database.
- **Drizzle ORM**: TypeScript ORM.
- **OpenAI**: For embeddings.
- **ElevenLabs**: Alternative TTS service.
- **Redis (Upstash)**: For background job queuing.