# External Services

All third-party integrations, required environment variables, and how each service is used in the platform.

---

## Anthropic (Claude AI)

**Purpose**: Primary Large Language Model for conversations, content generation, and analysis.

| Env Var | Required |
|---------|----------|
| `ANTHROPIC_API_KEY` | Yes |

**Usage**:
- **Conversations** (`server/claudeService.ts`): Claude Opus 4.6 for avatar chat responses. Streaming and non-streaming modes. Wrapped in circuit breaker.
- **Script generation**: Generate lesson scripts for video courses.
- **Ingestion** (`server/ingest/`): Claude Haiku 3.5 for cost-efficient content processing — anonymization, conversational chunking, learning artifact extraction, lesson boundary detection.
- **Content taxonomy** (`server/contentTaxonomy.ts`): Guardrail enforcement.
- **Mood responses** (`server/services/moodResponse.ts`): Personalized empathetic responses.
- **Intent detection** (`server/services/intent.ts`): Detect video generation and end-chat intents.
- **Persona generation** (`server/routes/personas.ts`): Generate persona specs from text/documents.

**Key files**: `server/claudeService.ts`, `server/ingest/learningArtifactService.ts`

---

## OpenAI

**Purpose**: Text embeddings for vector search.

| Env Var | Required |
|---------|----------|
| `OPENAI_API_KEY` | Yes |

**Usage**:
- **Embeddings** (`server/ingest/embedder.ts`): `text-embedding-3-small` model (1536 dimensions). Used for ALL embedding operations — both ingestion and retrieval.
- Batch processing with retry logic for rate limits.

**Important**: Never use `ada-002`. The project standardized on `text-embedding-3-small` everywhere.

**Key files**: `server/ingest/embedder.ts`, `server/pinecone.ts`

---

## Pinecone

**Purpose**: Vector database for RAG (Retrieval-Augmented Generation).

| Env Var | Required |
|---------|----------|
| `PINECONE_API_KEY` | Yes |

**Usage**:
- **Indexes**: `avatar-chat-knowledge` (primary), `ask-elxr` (secondary)
- **Namespaces**: 20+ topic-based namespaces (ADDICTION, MIND, BODY, SEXUALITY, NUTRITION, etc.) — see `shared/pineconeCategories.ts`
- **Operations**: Query (RAG retrieval), upsert (ingestion), delete, namespace management
- **Caching**: In-memory latency cache for query results (`server/cache.ts`)
- **Admin**: Full namespace CRUD, vector inspection, migration tools

**Key files**: `server/pinecone.ts`, `shared/pineconeCategories.ts`

---

## HeyGen

**Purpose**: Video avatar service — real-time streaming and video generation.

| Env Var | Required |
|---------|----------|
| `HEYGEN_API_KEY` | Yes |
| `HEYGEN_CREDIT_LIMIT` | No (default 1000, set in .replit) |

**Usage**:
- **LiveAvatar streaming**: Real-time video avatars with lip-sync. CUSTOM mode (app controls LLM) or FULL mode (HeyGen controls LLM).
- **Streaming Avatar** (legacy): Older HeyGen streaming SDK.
- **Video generation**: Create videos for course lessons and chat-triggered requests. Background polling for completion.
- **Preview GIFs**: Generate avatar preview animations.
- **Credit tracking**: `heygen_credit_usage` table logs all operations.

**Two types of avatar IDs per profile**:
- `heygen_avatar_id` / `live_avatar_id` — For streaming
- `heygen_video_avatar_id` — For video generation (Instant Avatars)

**Key files**: `server/routes.ts` (token endpoints), `server/services/videoGeneration.ts`, `client/src/hooks/sessionDrivers.ts`

---

## ElevenLabs

**Purpose**: Text-to-speech (TTS) and speech-to-text (STT).

| Env Var | Required |
|---------|----------|
| `ELEVENLABS_API_KEY` | Yes |
| `ELEVENLABS_AGENT_ID` | Yes |

**Usage**:
- **TTS** (`server/elevenlabsService.ts`): Streaming TTS in multiple formats (PCM, base64, streaming). Per-avatar voice IDs. Acknowledgment phrase caching. Circuit breaker protected.
- **STT** (`server/elevenlabsSttService.ts`): Real-time speech-to-text via WebSocket (`wss://api.elevenlabs.io/v1/speech-to-text/realtime`). Used in the unified conversation WebSocket pipeline.
- **Conversational AI agent**: Standalone agent mode via `ELEVENLABS_AGENT_ID`.

**Key files**: `server/elevenlabsService.ts`, `server/elevenlabsSttService.ts`, `server/conversationWsService.ts`

---

## LiveKit

**Purpose**: WebRTC transport for real-time audio/video streaming.

| Env Var | Required |
|---------|----------|
| `LIVEKIT_API_KEY` | Yes |
| `LIVEKIT_API_SECRET` | Yes |
| `LIVEKIT_URL` | Yes |

**Usage**:
- **WebRTC rooms**: Creates rooms for LiveAvatar CUSTOM mode sessions.
- **Token generation** (`server/services/livekit.ts`): JWT tokens for room participants.
- **Client integration**: `livekit-client` SDK for connecting to rooms.
- **Audio routing**: Streams TTS audio to HeyGen avatar for lip-sync via LiveKit.

**Key files**: `server/services/livekit.ts`, `server/webrtcStreamingService.ts`, `client/src/hooks/useWebRTCStreaming.ts`

---

## Mem0

**Purpose**: Persistent user memory service.

| Env Var | Required |
|---------|----------|
| `MEM0_API_KEY` | Yes |

**Usage**:
- **Memory storage**: Stores user preferences, conversation summaries, personal facts.
- **Memory retrieval**: Searches relevant memories for conversation context.
- **Smart extraction**: Filters, deduplicates, and types memories using Claude.
- **API**: REST API at `https://api.mem0.ai/v1`.
- **Operations**: Add, search, get all, update, delete, summarize.

**Key files**: `server/memoryService.ts`, `server/mem0Service.ts`

---

## Deepgram

**Purpose**: Speech-to-text (alternative to ElevenLabs STT).

| Env Var | Required |
|---------|----------|
| `DEEPGRAM_API_KEY` | Yes |

**Usage**:
- Used in the Python Pipecat bot service for conversational AI.
- Server-side transcription endpoint (`POST /api/stt`).

---

## Memberstack

**Purpose**: Subscription billing and user identity for Webflow-embedded mode.

| Env Var | Required |
|---------|----------|
| `MEMBERSTACK_SECRET_KEY` | Yes |

**Usage**:
- **Identity**: `X-Member-Id` header identifies Webflow users.
- **Webhooks**: Receives `member.plan.added/updated/removed` events.
- **Plan management**: Maps Memberstack plans to internal subscription tiers.
- **Client SDK**: `@memberstack/react` for frontend plan display.

**Key files**: `server/routes/subscription.ts`

---

## Google Drive

**Purpose**: Content source for knowledge base ingestion.

| Env Var | Required |
|---------|----------|
| `GOOGLE_CLIENT_ID` | Yes |
| `GOOGLE_CLIENT_SECRET` | Yes |

**Usage**:
- **Topic folders**: Browse and ingest content from organized Google Drive folders.
- **OAuth**: Server-side OAuth2 flow for Drive access.
- **File processing**: Download files, extract text, chunk, embed, and upsert to Pinecone.
- **Shared drives**: Support for shared/team drives.

**Key files**: `server/googleDriveService.ts`, `client/src/components/GoogleDrivePicker.tsx`, `client/src/components/TopicFolderUpload.tsx`

---

## Google Cloud Storage

**Purpose**: Object/file storage (via Replit sidecar).

| Env Var | Required |
|---------|----------|
| `REPLIT_OBJECT_STORAGE_BUCKET_ID` | Yes (on Replit) |

**Usage**:
- Stores uploaded PDFs, generated videos, audio files, GIFs.
- Credential exchange via Replit sidecar at `http://127.0.0.1:1106`.
- Signed URL generation for temporary access.

**Key files**: `server/objectStorage.ts`, `server/objectAcl.ts`

---

## Resend

**Purpose**: Transactional email.

| Env Var | Required |
|---------|----------|
| `RESEND_API_KEY` | Yes |

**Usage**:
- Sends email notifications when videos finish generating.

**Key files**: `server/services/email.ts`

---

## Google Search

**Purpose**: Web search for avatar research.

| Env Var | Required |
|---------|----------|
| `GOOGLE_SEARCH_API_KEY` | Conditional |
| `GOOGLE_SEARCH_ENGINE_ID` | Conditional |

**Usage**:
- Per-avatar toggle (`use_google_search` flag).
- Used during chat to supplement RAG with real-time web results.

**Key files**: `server/googleSearchService.ts`

---

## PubMed

**Purpose**: Medical and scientific literature search.

| Env Var | Required |
|---------|----------|
| None | N/A |

**Usage**:
- Per-avatar toggle (`use_pubmed` flag).
- Online search via PubMed API.
- Offline dump support for faster access.
- Results summarized by Claude before inclusion in chat.

**Key files**: `server/pubmedService.ts`

---

## Wikipedia

**Purpose**: General knowledge source.

| Env Var | Required |
|---------|----------|
| None | N/A |

**Usage**:
- Per-avatar toggle (`use_wikipedia` flag).
- Auto-syncs specific articles to Pinecone namespaces (e.g., Willie Gault's page).
- Content chunked and embedded for RAG retrieval.

**Key files**: `server/wikipediaService.ts`

---

## Redis (Upstash)

**Purpose**: Background job queue.

| Env Var | Required |
|---------|----------|
| Redis connection config | Conditional |

**Usage**:
- **BullMQ**: Job queue for background processing (document uploads, ingestion).
- **ioredis**: Redis client for BullMQ.
- Not required for basic operation — jobs fall back to in-process execution.

---

## Notion

**Purpose**: Knowledge base source integration.

| Env Var | Required |
|---------|----------|
| Notion API key (via KB source config) | Conditional |

**Usage**:
- Personal knowledge base source type.
- Syncs Notion pages to Pinecone namespaces.

**Key files**: `@notionhq/client` dependency
