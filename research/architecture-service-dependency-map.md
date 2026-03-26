# Elxrai — Architecture & Service Dependency Map

> **Date**: March 15, 2026
> **Purpose**: Map every business feature to its third-party service dependencies
> **Scope**: Essential vs optional services, failure behavior, critical paths

---

## Executive Summary

Elxrai integrates **17 third-party services** across **12 user-facing features**. Only **3 services are truly essential** for the core product (Claude, ElevenLabs, PostgreSQL). Everything else degrades gracefully — the architecture is designed for resilience with circuit breakers, parallel fetching, and fire-and-forget patterns.

| Dependency Level | Services | What Breaks Without Them |
|-----------------|----------|-------------------------|
| **HARD** (system down) | Claude, ElevenLabs, Neon PostgreSQL | Chat doesn't work at all |
| **MEDIUM** (feature lost) | HeyGen/LiveAvatar, LiveKit, Pinecone, OpenAI | Video avatars, knowledge retrieval |
| **SOFT** (quality reduced) | Mem0, Google Search, PubMed, Wikipedia | Memory, real-time info, research |
| **OPTIONAL** (admin/ops) | Memberstack, Resend, Notion, Google Drive, Redis | Billing, email, ingestion |

---

## 1. SYSTEM ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (React + Vite)                              │
│                                                                                 │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────┐  ┌───────────────┐   │
│  │  avatar-chat  │  │ useAvatarSession │  │ sessionDrivers│  │  Dashboard    │   │
│  │  .tsx         │  │ .ts              │  │ .ts          │  │  Pages        │   │
│  └──────┬───────┘  └────────┬─────────┘  └──────┬───────┘  └───────────────┘   │
│         │                   │                    │                               │
│         │    WebSocket      │    LiveKit SDK     │    HeyGen LiveAvatar SDK     │
│         │    Connection     │    (WebRTC)        │    (Video Rendering)         │
└─────────┼───────────────────┼────────────────────┼──────────────────────────────┘
          │                   │                    │
          ▼                   ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           SERVER (Express.js + TypeScript)                       │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                    REAL-TIME CONVERSATION PIPELINE                       │    │
│  │                    (conversationWsService.ts)                           │    │
│  │                                                                         │    │
│  │   User Audio ──► ElevenLabs STT ──► Intent Detection ──► Claude LLM   │    │
│  │                   (WebSocket)        (Claude/fast)        (Opus 4.6)    │    │
│  │                                                              │          │    │
│  │                                          ┌───────────────────┤          │    │
│  │                                          │ PARALLEL CONTEXT  │          │    │
│  │                                          ▼                   ▼          │    │
│  │                                   ┌────────────┐  ┌──────────────┐     │    │
│  │                                   │ RAG Service │  │ Mem0 Memory  │     │    │
│  │                                   │ (rag.ts)    │  │ (mem0Svc.ts) │     │    │
│  │                                   └──────┬─────┘  └──────┬───────┘     │    │
│  │                                          │               │             │    │
│  │                              ┌───────────┼───────┐       │             │    │
│  │                              ▼           ▼       ▼       ▼             │    │
│  │                        ┌─────────┐ ┌────────┐ ┌──────┐ ┌─────┐        │    │
│  │                        │Pinecone │ │Google  │ │PubMed│ │Mem0 │        │    │
│  │                        │(vectors)│ │Search  │ │(NCBI)│ │(API)│        │    │
│  │                        └─────────┘ └────────┘ └──────┘ └─────┘        │    │
│  │                                                                         │    │
│  │   Claude Response ──► ElevenLabs TTS ──► Audio Stream                  │    │
│  │   (streaming)          (PCM/WebSocket)    │                             │    │
│  │                                           ▼                             │    │
│  │                              ┌──────────────────────┐                   │    │
│  │                              │ LiveAvatar / HeyGen  │                   │    │
│  │                              │ (lip-sync + render)  │                   │    │
│  │                              └──────────┬───────────┘                   │    │
│  │                                         │                               │    │
│  │                              ┌──────────▼───────────┐                   │    │
│  │                              │   LiveKit (WebRTC)   │                   │    │
│  │                              │   Video Transport    │                   │    │
│  │                              └──────────────────────┘                   │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  ┌────────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐    │
│  │  VIDEO GENERATION  │  │  INGESTION        │  │  BACKGROUND SERVICES     │    │
│  │                    │  │                    │  │                          │    │
│  │  Claude (script)   │  │  Google Drive      │  │  Mem0 (fire-and-forget) │    │
│  │  ElevenLabs (audio)│  │  Notion            │  │  Resend (email notify)  │    │
│  │  HeyGen (video)    │  │  PubMed            │  │  BullMQ + Redis (queue) │    │
│  │  Resend (email)    │  │  Wikipedia          │  │  Memberstack (billing)  │    │
│  │                    │  │  Podcasts           │  │                          │    │
│  │                    │  │  ──► OpenAI Embed   │  │                          │    │
│  │                    │  │  ──► Pinecone Store │  │                          │    │
│  └────────────────────┘  └──────────────────┘  └──────────────────────────┘    │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                    FOUNDATION: Neon PostgreSQL (Drizzle ORM)             │    │
│  │    sessions │ conversations │ avatarProfiles │ knowledgeBases │ users    │    │
│  │    lessons  │ generatedVideos │ moodEntries │ subscriptions │ 20+ tables│    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. FEATURE-TO-SERVICE DEPENDENCY MATRIX

### Feature 1: Avatar Chat (Core Product)

**Business Purpose**: Users have real-time voice/video conversations with AI avatars for education, wellness coaching, and information retrieval.

```
User speaks into mic
  │
  ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  ElevenLabs STT  │────►│   Claude Opus    │────►│  ElevenLabs TTS  │
│  (speech→text)   │     │   (generate      │     │  (text→speech)   │
│                  │     │    response)      │     │                  │
│  ESSENTIAL       │     │  ESSENTIAL        │     │  ESSENTIAL       │
│  ~100ms latency  │     │  ~300-800ms       │     │  ~100ms latency  │
└──────────────────┘     └────────┬─────────┘     └────────┬─────────┘
                                  │                         │
                    ┌─────────────┤ (parallel)              │
                    ▼             ▼                         ▼
             ┌────────────┐ ┌─────────┐          ┌──────────────────┐
             │  Pinecone   │ │  Mem0   │          │  LiveAvatar /    │
             │  (RAG)      │ │ (memory)│          │  HeyGen (video)  │
             │  OPTIONAL   │ │ OPTIONAL│          │  OPTIONAL        │
             └────────────┘ └─────────┘          └────────┬─────────┘
                                                          │
                                                 ┌────────▼─────────┐
                                                 │  LiveKit (WebRTC) │
                                                 │  OPTIONAL         │
                                                 └──────────────────┘
```

| Service | Role | Essential? | Latency | On Failure |
|---------|------|-----------|---------|------------|
| **ElevenLabs STT** | Transcribe user speech in real-time | ESSENTIAL for voice | ~100ms | Text input fallback only |
| **Claude Opus 4.6** | Generate conversational response | ESSENTIAL | 300-800ms | Chat completely broken |
| **ElevenLabs TTS** | Convert response to speech | ESSENTIAL for voice | ~100ms | Silent text response only |
| **Pinecone** | Retrieve relevant knowledge chunks | OPTIONAL | ~50ms | Chat works, no RAG context |
| **OpenAI Embeddings** | Embed search query for Pinecone | OPTIONAL | ~30ms | RAG pipeline breaks |
| **Mem0** | Retrieve user memories | OPTIONAL | ~100ms | Falls back to last 6 exchanges |
| **Google Search** | Real-time web info | OPTIONAL | ~200ms | No current events context |
| **PubMed** | Medical research | OPTIONAL | ~300ms | No research citations |
| **Wikipedia** | General knowledge | OPTIONAL | ~200ms | Reduced breadth |
| **LiveAvatar/HeyGen** | Render avatar video | OPTIONAL | N/A | Falls back to audio-only |
| **LiveKit** | Transport video via WebRTC | OPTIONAL | N/A | Falls back to audio-only |

**Code path**: `client/avatar-chat.tsx` → `useAvatarSession.ts` → `sessionDrivers.ts` → WS `/ws/conversation` → `conversationWsService.ts` → `claudeService.ts` + `elevenlabsService.ts` + `pinecone.ts` + `mem0Service.ts`

**Resilience**:
- Circuit breaker on Claude (60s timeout, 50% error threshold)
- Circuit breaker on ElevenLabs TTS (30s timeout)
- Barge-in detection (150ms speech_start timer)
- Context fetching (RAG, memory, web) runs in parallel, non-blocking
- Memory extraction is fire-and-forget (never blocks response)

---

### Feature 2: Knowledge/RAG Pipeline

**Business Purpose**: Ingest domain-specific documents so avatars can answer questions with accurate, sourced information.

```
Document Upload
  │
  ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Claude Haiku    │────►│  OpenAI Embed    │────►│    Pinecone      │
│  (chunk + clean) │     │  (text-embed-    │     │  (vector store)  │
│                  │     │   3-small)       │     │                  │
│  ESSENTIAL       │     │  ESSENTIAL       │     │  ESSENTIAL       │
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

**Ingestion Path (Background — not user-facing latency)**:

| Step | Service | What Happens |
|------|---------|-------------|
| 1. Upload | BullMQ/Redis | Job queued for processing |
| 2. Parse | Local | Extract text from PDF/audio/text |
| 3. Chunk | Claude Haiku 4.5 | Split into semantic chunks, anonymize educational content |
| 4. Embed | OpenAI text-embedding-3-small | Generate 1536-dim vectors (batches of 100) |
| 5. Store | Pinecone | Upsert vectors with metadata into namespace |
| 6. Track | PostgreSQL | Update knowledge base status |

**Retrieval Path (Real-time — user-facing)**:

| Step | Service | Latency |
|------|---------|---------|
| 1. Embed query | OpenAI text-embedding-3-small | ~30ms |
| 2. Vector search | Pinecone | ~50ms |
| 3. Inject context | Claude (system prompt) | 0ms (prompt assembly) |

**Special Pipelines**:
- **Learning Artifacts**: Educational content goes through anonymization/taxonomy (MUST use this pipeline)
- **Personal Namespaces**: `mark-kohl`, `willie-gault` allow verbatim chunks (bypass anonymization)
- **Podcasts**: Audio → transcription (OpenAI Whisper) → distillation (Claude Haiku) → chunks → embeddings

**Code path**: `server/routes/ingest.ts` → `server/documentQueue.ts` → `server/ingest/chunker.ts` → `server/ingest/embedder.ts` → `server/pinecone.ts`

---

### Feature 3: Video Course Generation

**Business Purpose**: Automatically generate video lessons with avatar presenters for educational courses.

```
Course Outline
  │
  ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Claude Opus     │────►│  ElevenLabs TTS  │────►│  HeyGen Video    │
│  (write script)  │     │  (generate audio)│     │  (render video)  │
│  ESSENTIAL       │     │  ESSENTIAL       │     │  ESSENTIAL       │
└──────────────────┘     └──────────────────┘     └────────┬─────────┘
                                                           │
                                                  ┌────────▼─────────┐
                                                  │  Resend (email)  │
                                                  │  "Video Ready!"  │
                                                  │  OPTIONAL        │
                                                  └──────────────────┘
```

| Service | Role | Essential? | On Failure |
|---------|------|-----------|------------|
| **Claude** | Generate lesson scripts from outline | ESSENTIAL | Can't create lessons |
| **ElevenLabs TTS** | Convert script to avatar voice audio | ESSENTIAL | No audio for video |
| **HeyGen Video API** | Render avatar video with lip-sync | ESSENTIAL | No video output |
| **Resend** | Email user when video is done | OPTIONAL | Silent, check dashboard |
| **PostgreSQL** | Track video status | ESSENTIAL | Status lost |

**Async Process**:
- Video generation takes minutes (not real-time)
- HeyGen polling every 2-10 minutes for completion
- Email notification via Resend on completion
- Tracked in `generatedVideos` and `chatGeneratedVideos` tables

**Code path**: `server/routes/courses.ts` → `server/services/videoGeneration.ts` → ElevenLabs TTS → HeyGen upload + render → `server/services/email.ts`

---

### Feature 4: Memory System

**Business Purpose**: Remember user preferences, health info, goals across conversations for personalized experiences.

```
Conversation Ends
  │
  ▼ (fire-and-forget)
┌──────────────────┐     ┌──────────────────┐
│  Claude Sonnet   │────►│     Mem0 API     │
│  (extract facts) │     │  (store memory)  │
│  ESSENTIAL       │     │  ESSENTIAL       │
│  for extraction  │     │  for persistence │
└──────────────────┘     └──────────────────┘

Next Conversation Starts
  │
  ▼
┌──────────────────┐     ┌──────────────────┐
│     Mem0 API     │────►│  Claude (inject  │
│  (search memory) │     │   into context)  │
│  OPTIONAL        │     │  OPTIONAL        │
└──────────────────┘     └──────────────────┘
```

| Service | Role | Essential? | On Failure |
|---------|------|-----------|------------|
| **Claude Sonnet 4.5** | Extract facts from conversation (confidence >= 0.7) | For extraction only | No new memories saved |
| **Mem0** | Store and search memories | For memory feature | Falls back to conversation history (last 6 exchanges) |

**Memory Types**: preference, bio, task, goal, health, relationship, skip (filtered out)

**Resilience**:
- Extraction is fire-and-forget (never blocks conversation)
- Deduplication at 0.85 similarity threshold
- Fallback: last 6 conversation exchanges from PostgreSQL

**Code path**: `server/conversationWsService.ts` → `server/mem0Service.ts` (fire-and-forget) → `server/memoryService.ts`

---

### Feature 5: Content Ingestion Sources

**Business Purpose**: Pull knowledge from external platforms to build avatar expertise.

| Source | Service | Trigger | Pipeline | Essential? |
|--------|---------|---------|----------|-----------|
| **Google Drive** | Google Drive API (service account) | Admin-triggered folder sync | Files → PDF export → chunks → embeddings → Pinecone | OPTIONAL |
| **Notion** | Notion API | Admin-triggered DB sync | Pages → blocks → text → chunks → embeddings → Pinecone | OPTIONAL |
| **PubMed** | NCBI eutils API | User query or batch import | Search → XML parse → embeddings → Pinecone | OPTIONAL |
| **Wikipedia** | Wikipedia REST API | User query or batch | Search → extract → embeddings → Pinecone | OPTIONAL |
| **Podcasts** | Manual URL upload | Admin upload | Audio → Whisper transcription → Haiku distillation → chunks → embeddings | OPTIONAL |

**All ingestion is OPTIONAL** — these enrich the knowledge base but are not required for core chat. If none are configured, avatars still work with their personality engine and general Claude knowledge.

**Code paths**:
- `server/googleDriveService.ts` → `server/ingest/embedder.ts` → `server/pinecone.ts`
- `server/notionService.ts` → embedder → Pinecone
- `server/pubmedService.ts` → embedder → Pinecone
- `server/wikipediaService.ts` → embedder → Pinecone
- `server/ingest/podcastIngestionService.ts` → Whisper → Haiku → embedder → Pinecone

---

### Feature 6: User Authentication & Access Control

**Business Purpose**: Gate features by subscription tier, identify users, manage billing.

```
User Arrives
  │
  ├──► Memberstack ID in header? ──► Fetch member info ──► Provision user in DB
  │
  ├──► Admin secret in header? ──► Grant admin access
  │
  └──► No auth? ──► Anonymous access (limited features)
```

| Service | Role | Essential? | On Failure |
|---------|------|-----------|------------|
| **Memberstack** | User identity, subscription tier, billing | OPTIONAL | Anonymous access, no billing |
| **PostgreSQL** | User record, session storage | ESSENTIAL | Auth completely broken |

**Feature Gates by Subscription Tier:**

| Feature | Free | Basic | Pro |
|---------|------|-------|-----|
| Avatars accessible | 1 | 1 | Unlimited |
| Chat sessions | 100 | Unlimited | Unlimited |
| Video courses | 2 | 50 | Unlimited |
| Video generation | — | 50 | Unlimited |
| Memory | — | Yes | Yes |
| Priority support | — | — | Yes |

**Code path**: `server/auth.ts` → `server/services/memberstack.ts` (cached lookups) → `server/services/subscription.ts`

---

### Feature 7: Email Notifications

**Business Purpose**: Notify users when async operations complete (video generation).

| Service | Role | Essential? | On Failure |
|---------|------|-----------|------------|
| **Resend** | Send transactional emails | OPTIONAL | Fail silently, user checks dashboard |

**Triggers**:
- Video generation complete (course or chat video)
- Email contains: topic, video URL, thumbnail, duration, avatar name

**Code path**: `server/services/email.ts` → Resend API

---

### Feature 8: Web Search Enhancement

**Business Purpose**: Augment avatar responses with real-time web information.

| Service | Role | Essential? | On Failure |
|---------|------|-----------|------------|
| **Google Custom Search** | Search current web for relevant info | OPTIONAL | Avatar uses existing knowledge only |

- Max 5 results per query
- Date-filtered to current year
- Free tier: 100 queries/day
- Used in enhanced response mode only (not every message)

**Code path**: `server/googleSearchService.ts` → injected into Claude system prompt

---

### Feature 9: Avatar Personality Engine

**Business Purpose**: Give each avatar a unique personality, voice, and expertise area.

```
Avatar Config (avatars.config.ts)
  │
  ▼ (seed on startup)
PostgreSQL (avatarProfiles table)
  │
  ▼ (DB overrides take precedence, including null/false/empty)
┌──────────────────────────────────────────────┐
│  Personality Engine (server/engine/)          │
│  - Persona specs (personality traits)        │
│  - Prompt assembler (system prompt builder)  │
│  - Response critic (quality check via Sonnet)│
│  - Avatar integration (merge config + DB)    │
└──────────────────────────────────────────────┘
  │
  ▼
Claude System Prompt (injected per conversation)
```

| Service | Role | Essential? |
|---------|------|-----------|
| **PostgreSQL** | Store avatar profiles + overrides | ESSENTIAL |
| **Claude** | Execute personality via system prompt | ESSENTIAL |
| **Claude Sonnet** | Response critic (~5% of messages) | OPTIONAL |
| **ElevenLabs** | Voice ID mapping per avatar | ESSENTIAL for voice |

**Key Rule**: DB overrides take **absolute precedence** over config defaults — including null, false, and empty string values.

**Code path**: `config/avatars.config.ts` → `server/engine/avatarIntegration.ts` → `server/engine/promptAssembler.ts` → `server/claudeService.ts`

---

### Feature 10: Mood & Wellness

**Business Purpose**: Wellness check-ins, mood tracking, personalized wellness advice.

| Service | Role | Essential? |
|---------|------|-----------|
| **Claude Sonnet 4.5** | Generate mood-aware responses | ESSENTIAL for feature |
| **PostgreSQL** | Store mood entries | ESSENTIAL |

**Code path**: `server/routes/mood.ts` → `server/services/moodResponse.ts` → Claude

---

### Feature 11: Games & Interactive Features

**Business Purpose**: Trivia, word association, and interactive engagement with avatars.

| Service | Role | Essential? |
|---------|------|-----------|
| **Claude Sonnet 4.5** | Generate game content dynamically | ESSENTIAL for feature |
| **PostgreSQL** | Track scores/progress | ESSENTIAL |

**Code path**: `server/routes/games.ts` → Claude

---

### Feature 12: Admin Panel & Content Management

**Business Purpose**: Admin dashboard for managing avatars, content, users, and monitoring.

| Service | Role | Essential? |
|---------|------|-----------|
| **PostgreSQL** | All CRUD operations | ESSENTIAL |
| **Admin Secret** | Authentication | ESSENTIAL |
| **HeyGen** | Credit monitoring | OPTIONAL |

**Code path**: `client/src/pages/admin.tsx` → `server/routes.ts` (admin endpoints)

---

## 3. CRITICAL PATH ANALYSIS

### Tier 1: HARD DEPENDENCIES (System Down Without)

| Service | Features Affected | Why It's Hard |
|---------|-------------------|---------------|
| **Neon PostgreSQL** | ALL | All state: users, sessions, conversations, avatars, videos, subscriptions |
| **Claude (Anthropic)** | Chat, Courses, Memory, Games, Mood | The "brain" — no AI responses possible without it |
| **ElevenLabs** | Voice Chat, Video Generation | Voice mode completely broken; video audio generation broken |

**If PostgreSQL goes down**: Entire platform is non-functional.
**If Claude goes down**: Avatars can't respond. Video scripts can't be generated. Memory can't be extracted.
**If ElevenLabs goes down**: Voice conversations impossible (text fallback exists but poor UX). Video generation stalls.

### Tier 2: MEDIUM DEPENDENCIES (Feature Lost)

| Service | Features Affected | Degradation |
|---------|-------------------|-------------|
| **HeyGen/LiveAvatar** | Avatar video rendering | Falls back to audio-only mode |
| **LiveKit** | Video streaming transport | Falls back to audio-only mode |
| **Pinecone** | Knowledge retrieval | Chat works but no domain expertise |
| **OpenAI Embeddings** | RAG pipeline | Knowledge retrieval breaks entirely |

### Tier 3: SOFT DEPENDENCIES (Quality Reduced)

| Service | Features Affected | Degradation |
|---------|-------------------|-------------|
| **Mem0** | Conversation memory | Falls back to last 6 exchanges from DB |
| **Google Search** | Real-time web info | No current events context |
| **PubMed** | Medical research | No research citations |
| **Wikipedia** | General knowledge | Slightly less informed responses |

### Tier 4: OPTIONAL (Admin/Ops Only)

| Service | Features Affected | Degradation |
|---------|-------------------|-------------|
| **Memberstack** | Billing, subscription tiers | Anonymous access, no feature gating |
| **Resend** | Email notifications | Silent — users check dashboard |
| **Notion** | Knowledge ingestion | Admin can't sync from Notion |
| **Google Drive** | Knowledge ingestion | Admin can't sync from Drive |
| **Upstash Redis** | Document processing queue | Ingestion jobs don't queue (can process inline) |

---

## 4. SERVICE HEALTH & RESILIENCE MAP

### Circuit Breakers

| Service | Timeout | Error Threshold | Recovery | File |
|---------|---------|----------------|----------|------|
| **Claude** | 60s | 50% | Auto-reset | `server/claudeService.ts` |
| **ElevenLabs TTS** | 30s | 50% | Auto-reset | `server/elevenlabsService.ts` |
| **LiveAvatar Token** | 10s | — | Retry once | `server/routes.ts` |

### Fallback Chains

```
Video Mode:
  LiveAvatar (CUSTOM) ──fail──► HeyGen Streaming ──fail──► Audio-Only Mode

Knowledge Retrieval:
  Pinecone RAG ──fail──► Google Search ──fail──► Claude General Knowledge

Memory:
  Mem0 Memory ──fail──► PostgreSQL Last 6 Exchanges ──fail──► No Memory

TTS:
  ElevenLabs Flash ──fail──► ElevenLabs Turbo ──fail──► Text-Only Response

Authentication:
  Memberstack ──fail──► Admin Secret ──fail──► Anonymous (limited access)
```

### Fire-and-Forget Operations (Non-Blocking)

| Operation | Service | Blocking? | Impact of Failure |
|-----------|---------|-----------|-------------------|
| Memory extraction | Claude + Mem0 | No | No new memories saved |
| Email notification | Resend | No | User not notified |
| Usage tracking | PostgreSQL | No | Billing inaccurate |
| HeyGen credit check | HeyGen API | No | Credit warnings missed |

### Rate Limiting

| Service | Limit | Mitigation |
|---------|-------|------------|
| PubMed (no key) | 3 req/sec | Queue + throttle |
| PubMed (with key) | 10 req/sec | Queue + throttle |
| Google Search | 100 free/day | Cached results |
| ElevenLabs | Plan-dependent | Quota monitoring |
| Claude | Token-based | Circuit breaker |

### Parallel vs Sequential Operations

```
PARALLEL (non-blocking context fetch):
  ┌──► Pinecone RAG query
  │
  ├──► Mem0 memory search
  │
  ├──► Google Search (if enhanced mode)
  │
  └──► PubMed search (if medical topic)

SEQUENTIAL (critical path):
  STT → Intent Detection → Claude Response → TTS → Avatar Render
```

---

## 5. DATABASE AS FOUNDATION

PostgreSQL (Neon) is the **single foundational dependency**. Every feature ultimately reads from or writes to it.

### Table-to-Feature Mapping

| Table | Feature | Critical? |
|-------|---------|-----------|
| `users` | Auth, all features | Yes |
| `sessions` | Auth, request handling | Yes |
| `conversations` | Chat history, memory fallback | Yes |
| `conversationMessages` | Message storage, analytics | Yes |
| `avatarProfiles` | Avatar configuration | Yes |
| `knowledgeBases` | RAG knowledge tracking | For RAG |
| `knowledgeDocuments` | Document metadata | For RAG |
| `generatedVideos` | Course video tracking | For courses |
| `chatGeneratedVideos` | Chat video tracking | For chat videos |
| `lessons` | Course content | For courses |
| `courses` | Course structure | For courses |
| `moodEntries` | Wellness tracking | For mood |
| `subscriptionPlans` | Plan definitions | For billing |
| `userSubscriptions` | User-plan mapping | For billing |
| `usagePeriods` | Usage tracking per billing cycle | For billing |
| `personas` | Avatar personality specs | For personality |
| `pinnedMessages` | User-pinned messages | For UX |
| `userPreferences` | User settings | For personalization |
| `introVideos` | Avatar intro content | For onboarding |
| `notificationSettings` | Email/notification prefs | For notifications |

---

## 6. BUSINESS CRITICALITY MATRIX

### Revenue-Critical Services

| Service | Revenue Impact | Why |
|---------|---------------|-----|
| **Claude** | Direct | No conversations = no product value |
| **ElevenLabs** | Direct | Voice is the primary UX modality |
| **PostgreSQL** | Direct | All state lost = complete outage |
| **Memberstack** | Revenue | No billing = no subscription revenue |
| **HeyGen/LiveAvatar** | Differentiator | Video avatars are the unique selling point |

### Cost-Critical Services (Highest $/usage)

| Service | Monthly Cost | Cost Driver |
|---------|-------------|-------------|
| **LiveAvatar** | $675 | Per-minute streaming |
| **Claude** | $605 | Per-token generation |
| **ElevenLabs** | $490 | Per-character TTS |
| **HeyGen** | $375 | Per-minute video |
| **LiveKit** | $139 | Per-minute WebRTC |

### Services That Could Be Eliminated

| Service | Replace With | Risk | Savings |
|---------|-------------|------|---------|
| **Pinecone** | pgvector in Neon | Low (better performance at scale) | $5/mo + 1 fewer vendor |
| **Mem0** | Self-hosted or custom Postgres | Low-Medium | $22/mo + 1 fewer vendor |
| **Upstash Redis** | Already free tier | None | $0 (already free) |
| **Deepgram** | Not in use | None | Remove dead API key |
| **Google Search** | Consolidate into RAG | Medium (lose real-time) | $0-15/mo |

### Services That Could Be Swapped (Higher Risk)

| Service | Alternative | Risk | Savings |
|---------|------------|------|---------|
| **ElevenLabs TTS** | Azure Neural (free), Deepgram, Cartesia | Medium (voice quality) | $315-490/mo |
| **LiveAvatar** | Simli | High (avatar quality) | $450-625/mo |
| **HeyGen Video** | D-ID | High (rendering quality) | $267-357/mo |
| **LiveKit** | Daily.co or self-hosted | Low-Medium | $89-109/mo |
| **Claude (background)** | GPT-4.1 Mini/Nano | Low | $55-75/mo |

---

## 7. DEPENDENCY HEAT MAP

Shows how many features depend on each service:

```
Service                    Features Using It    Business Criticality
──────────────────────────────────────────────────────────────────────
PostgreSQL (Neon)          ████████████  12/12   ██████████  CRITICAL
Claude (Anthropic)         ████████░░░░   8/12   ██████████  CRITICAL
ElevenLabs                 ████░░░░░░░░   4/12   ████████░░  HIGH
HeyGen / LiveAvatar        ███░░░░░░░░░   3/12   ████████░░  HIGH
Pinecone                   ███░░░░░░░░░   3/12   ██████░░░░  MEDIUM
OpenAI Embeddings          ███░░░░░░░░░   3/12   ██████░░░░  MEDIUM
LiveKit                    ██░░░░░░░░░░   2/12   ████░░░░░░  MEDIUM
Mem0                       ██░░░░░░░░░░   2/12   ████░░░░░░  LOW-MED
Memberstack                ██░░░░░░░░░░   2/12   ████░░░░░░  LOW-MED
Google Search              █░░░░░░░░░░░   1/12   ██░░░░░░░░  LOW
PubMed                     █░░░░░░░░░░░   1/12   ██░░░░░░░░  LOW
Wikipedia                  █░░░░░░░░░░░   1/12   ██░░░░░░░░  LOW
Resend                     █░░░░░░░░░░░   1/12   █░░░░░░░░░  MINIMAL
Google Drive               █░░░░░░░░░░░   1/12   █░░░░░░░░░  MINIMAL
Notion                     █░░░░░░░░░░░   1/12   █░░░░░░░░░  MINIMAL
Upstash Redis              █░░░░░░░░░░░   1/12   █░░░░░░░░░  MINIMAL
Deepgram                   ░░░░░░░░░░░░   0/12   ░░░░░░░░░░  UNUSED
```

---

## 8. RECOMMENDATIONS

### Immediate Actions (No Code Changes)
1. **Remove `DEEPGRAM_API_KEY`** from environment — it's not integrated, just wasting a credential
2. **Monitor ElevenLabs quota** — highest risk of surprise overages
3. **Set LiveAvatar session caps** — 5-minute limit prevents cost runaway

### Short-Term Optimizations (Low Risk)
1. **Consolidate Pinecone → pgvector** in Neon — eliminates a vendor, better at your scale
2. **Self-host Mem0** — Docker deploy, same API, zero cost
3. **Route background Claude tasks to GPT-4.1 Mini/Nano** — 88% savings on non-conversation AI

### Medium-Term Evaluations (Test First)
1. **Evaluate Deepgram Aura-2 or Azure Neural TTS** — potential 72-100% TTS savings
2. **Evaluate Simli for avatar streaming** — potential 67-93% savings
3. **Evaluate Daily.co for WebRTC** — potential 64-78% savings

### Key Principle
> **Protect the critical path** (STT → Claude → TTS) and **optimize everything else**. Users directly experience conversation quality — that's where premium services earn their cost. Background processing, ingestion, memory, and infrastructure are optimization targets.

---

## Related Documents
- [Cost Analysis](./third-party-services-cost-analysis.md) — Detailed per-service cost projections
- [Alternative Stack Comparison](./alternative-stack-comparison.md) — Provider alternatives with pricing
