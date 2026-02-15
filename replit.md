# Multi-Avatar AI Chat System

### Overview
This project is an advanced AI chat platform integrating HeyGen video avatars for real-time voice conversations and a video course creation system. It features knowledge retrieval from diverse sources and persistent memory. The system aims to provide an interactive, intelligent, and personalized AI conversational experience with significant market potential in education, customer service, and specialized information retrieval.

### User Preferences
- **Architecture**: Modular code organization with separate config/, services/, routes/
- **Avatar Merging**: DB overrides take absolute precedence (including null, false, empty string)
- **Service Facades**: Thin wrappers that re-export existing functionality
- **Route Extraction**: Incremental migration from monolithic routes.ts to feature-focused modules
- **Content Anonymity Policy**: Verbatim/conversational chunk ingestion is ONLY for personal knowledge namespaces (real people: mark-kohl, willie-gault). All course/educational content MUST go through the Learning Artifact pipeline to ensure anonymity — no quotes, no recognizable phrasing, no instructor names.
- **Embedding Model**: All retrieval AND ingestion uses `text-embedding-3-small` (1536 dims). No `ada-002` anywhere.

### System Architecture

#### Frontend (React + TypeScript)
- **Core Features**: Avatar selection, LiveAvatar video streaming, Web Speech API for voice recognition, real-time chat with memory, document upload, and an admin dashboard.
- **Real-time Streaming Pipeline**: Ultra-low latency voice conversation via WebSocket, integrating ElevenLabs STT, Pinecone RAG, Mem0, OpenAI Realtime API, and ElevenLabs Realtime TTS, designed for zero buffering.
- **Parallel RAG + LLM Pipeline**: Prioritizes responsiveness by initiating RAG/Mem0 searches immediately.
- **Audio Streaming Mode**: Includes immediate thinking sounds, parallel data fetching, Claude streaming with sentence buffering, concurrent TTS generation, and SSE audio events.
- **Barge-in/Cancellation System**: ElevenLabs STT partial transcripts trigger 150ms debounced interruption when avatar is speaking (checks audio element state, not just ref flag). `performBargeIn()` helper hard-stops audio (pause, reset currentTime, revoke blob URL), aborts in-flight fetch, interrupts HeyGen driver, and resets speaking state. Server-side `req.on('close')` handler on `/api/audio` sets `requestAborted` flag checked before Claude and TTS calls. `cancelPendingWork()` also clears barge-in debounce ref.
- **Unified Conversation WebSocket (`/ws/conversation`)**: Server-side session state machine (IDLE→LISTENING→THINKING→SPEAKING) with turnId-based cancellation. Binary protocol: `[TTS0 magic 4B][turnId uint32 LE][PCM 24kHz 16-bit audio]`. Server pipes mic PCM → ElevenLabs STT → Claude streaming with sentence buffering → ElevenLabs streaming TTS → binary audio chunks back to client. `bargeIn()` increments turnId, aborts Claude+TTS AbortControllers, clears sentence queue, sends STOP_AUDIO. Client `useConversationWs` hook parses binary TTS frames, drops late-turn audio, plays via WebAudio (audio-only) or feeds into LiveAvatar SDK's `repeatAudio()` (video mode) for lip-sync. `playLocalAudio` getter dynamically reads `audioOnlyRef.current` for reactive mode switching. Replaces legacy `/api/audio` batch flow.

#### Backend (Express + TypeScript + Python)
- **Structure**: Modular routes, service facades for business logic (avatars, RAG, memory, auth), and centralized configuration.
- **Python Integration**: Pipecat bot service for conversational AI.

#### Database (PostgreSQL + Drizzle ORM)
- **Schema**: Defined in `shared/schema.ts`, including tables for `avatar_profiles`, `conversations`, `courses`, `lessons`, `generated_videos`, `mood_entries`, and a subscription system.

#### Avatar System
- **Multi-avatar Support**: Includes 10 active avatars with unique expertise, configurable settings, dedicated Pinecone knowledge bases, and per-avatar research source toggles.
- **HeyGen Integration**: Utilizes dual HeyGen IDs (LiveAvatar for streaming, Instant/Public for video generation) and separate API keys.

#### Video Course System
- **Workflow**: Users create courses, add lessons, and generate videos via HeyGen, with optional AI script generation using Claude AI and Pinecone knowledge.

#### Chat Video-on-Demand System
- **Feature**: Users can request videos during chat via intent detection, generating scripts with Claude AI and creating videos asynchronously via HeyGen.

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

#### Google Drive Topic Folders Integration
- **Source**: Integrates with Google Drive topic folders for Pinecone namespace population.
- **Processing Pipeline**: Claude substance extraction → conversational chunking → OpenAI embeddings → Pinecone upsert.

#### Personality Engine
- **Location**: `server/engine/` directory with modular architecture.
- **Persona Specs**: JSON files defining identity, boundaries, voice, behavior, knowledge policies.

#### Production Pinecone Ingestion System
- **Location**: `server/ingest/` directory with modular architecture.
- **Chunking**: Token-based (350 tokens default, 60 overlap), heading-aware splitting, breadcrumb context.
- **Embeddings**: OpenAI text-embedding-3-small with batch processing and retry logic.

#### Course Transcript Ingestion System
- **Location**: `server/ingest/`.
- **Purpose**: Anonymize and conversationally chunk course transcripts using Claude AI, then route to content-type specific Pinecone namespaces.
- **Anonymization**: Claude-powered removal of sensitive information with a self-check loop.
- **Conversational Chunking**: 120-300 token standalone units with metadata classification.

#### Batch Podcast Ingestion System (Replit-Safe Architecture)
- **Location**: `server/ingest/batchPodcastService.ts`, `server/ingest/microBatchIngestion.ts`.
- **Purpose**: Process large ZIP archives of podcast episode transcripts with full resumability.
- **Resumability**: Survives server restarts by storing all intermediate state in the database.
- **Micro-Batch Design**: Prevents memory/timeout issues by processing in small batches with retry logic and rate limiting.

#### Learning Artifact Ingestion System
- **Location**: `server/ingest/learningArtifactService.ts`.
- **Purpose**: Transform course transcripts into derived learning artifacts instead of storing verbatim text for copyright and retrieval.
- **Artifact Types**: `principle`, `mental_model`, `heuristic`, `failure_mode`, `checklist`, `qa_pair`, `scenario`.
- **Auto-Lesson Detection**: Full course transcripts can be uploaded and automatically split into lessons using Claude AI boundary detection.
- **Background Job Pattern**: Full course ingestion runs as a background job to avoid HTTP timeouts. Returns job ID immediately, frontend polls for status with real-time progress tracking (lessons detected, processed, artifacts created).

#### Content Taxonomy System
- **Location**: `server/contentTaxonomy.ts`.
- **Purpose**: Professional, taxonomy-driven content policy for adult educational wellness platform.
- **Guardrails**: No explicit storytelling, illegal instructions, medical/legal advice, or harm glamorization.

#### Avatar Mini-Games System
- **Location**: `client/src/components/AvatarMiniGames.tsx`, `server/routes/games.ts`.
- **Purpose**: Interactive games users can play with avatars during chat sessions.

#### Technical Implementations
- **AI Integration**: Primary LLM is Claude Opus 4.6 for conversations (best quality), Haiku 3.5 for ingestion (cost savings). Integrated with RAG and Mem0 for persistent memory.
- **Smart Memory Extraction**: Mem0 extracts filtered, deduplicated, and typed memories using Claude.
- **Real-time Voice**: HeyGen for video/audio synthesis, Web Speech API for voice recognition.

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