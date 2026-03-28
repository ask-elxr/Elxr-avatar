# Elxrai Third-Party Services — Financial Analysis & Cost Projections

> **Date**: March 15, 2026
> **Scale**: Medium (~75 conversations/day, ~10 messages/session)
> **Prepared by**: Automated codebase audit

---

## Executive Summary

Elxrai integrates **17 third-party services** via API keys. At medium scale, the estimated monthly infrastructure cost is **~$2,379/month** ($28,548/year). Video/avatar services account for 52% of costs, while AI/LLM services account for 48%.

**Top 5 cost drivers (97% of total spend):**
1. LiveAvatar (live streaming) — $675/mo
2. Claude AI (conversations) — $605/mo
3. ElevenLabs (TTS/STT) — $490/mo
4. HeyGen (video generation) — $375/mo
5. LiveKit (WebRTC) — $139/mo

At 200 active members, break-even cost is **~$12/member/month**.

---

## Baseline Assumptions

| Metric | Value |
|--------|-------|
| Daily conversations | 75 |
| Messages per conversation | 10 (avg) |
| Daily messages | 750 |
| Monthly messages | ~22,500 |
| Video generations | ~10/day (courses + chat videos) |
| Live avatar sessions | ~30/day, avg 5 min each |
| Content ingestion | ~20 documents/week |
| Active members | ~200 |

---

## 1. SERVICE-BY-SERVICE BREAKDOWN

---

### 1.1 Anthropic Claude (Primary LLM) — $605/month

| Detail | Value |
|--------|-------|
| **API Key** | `ANTHROPIC_API_KEY` |
| **Code Locations** | `server/claudeService.ts`, `server/mem0Service.ts`, `server/engine/responseCritic.ts`, `server/ingest/` |
| **Billing** | Per token (input + output) |
| **Call Pattern** | Per user message (streaming), per conversation (memory), per ingestion batch |

**Models & Pricing (per 1M tokens):**

| Model | Input | Output | Used For |
|-------|-------|--------|----------|
| Claude Opus 4.6 | $5.00 | $25.00 | Conversations, enhanced responses, fast voice, intent detection |
| Claude Sonnet 4.5 | $3.00 | $15.00 | Memory extraction (Mem0), response critic |
| Claude Haiku 4.5 | $1.00 | $5.00 | Ingestion, namespace classification, distillation |

**Monthly Usage Breakdown:**

| Use Case | Input Tokens | Output Tokens | Model | Monthly Cost |
|----------|-------------|---------------|-------|-------------|
| Streaming conversations (voice) | ~11.25M | ~7.87M | Opus 4.6 | **$253.13** |
| Enhanced/RAG responses (~30% of msgs) | ~6.75M | ~6.75M | Opus 4.6 | **$202.50** |
| Fast voice responses (~20% of msgs) | ~2.25M | ~1.57M | Opus 4.6 | **$50.63** |
| Memory extraction | ~2.25M | ~2.25M | Sonnet 4.5 | **$40.50** |
| Response critic (~5% of msgs) | ~0.56M | ~0.84M | Sonnet 4.5 | **$14.35** |
| Ingestion (Haiku) | ~2M | ~4M | Haiku 4.5 | **$22.00** |
| Intent detection | ~1.12M | ~0.67M | Opus 4.6 | **$22.50** |

**How it's called in code:**
- `claudeService.ts` → `messages.create()` for standard responses (max 4,096 tokens, or 300-350 for voice mode)
- `claudeService.ts` → `messages.stream()` for real-time streaming with sentence-level yielding
- `mem0Service.ts` → Claude Sonnet for fact extraction (confidence >= 0.7)
- `server/ingest/` → Claude Haiku for chunking, classification, distillation
- Circuit breaker: 60s timeout, 50% error threshold

---

### 1.2 OpenAI (Embeddings + Audio Transcription) — $0.10/month

| Detail | Value |
|--------|-------|
| **API Key** | `OPENAI_API_KEY` |
| **Code Locations** | `server/ingest/embedder.ts`, `server/documentProcessor.ts`, `server/pineconeNamespaceService.ts`, `server/pubmedService.ts`, `server/notionService.ts`, `server/wikipediaService.ts`, `server/routes.ts` |
| **Model** | `text-embedding-3-small` (1536 dimensions) — **CRITICAL: Never use ada-002** |
| **Billing** | $0.02 per 1M input tokens |
| **Call Pattern** | Per search query (1 embed), per document ingestion (batch of 100) |

**Monthly Usage:**

| Use Case | Tokens | Cost |
|----------|--------|------|
| Query embeddings (22,500 queries × ~100 tok) | 2.25M | **$0.05** |
| Document ingestion (~80 docs × ~5,000 tok avg) | 0.4M | **$0.01** |
| Podcast/course/PubMed/Wikipedia ingestion | ~2M | **$0.04** |

**How it's called in code:**
- `embedder.ts` → `embeddings.create()` with batches of up to 100 texts, 3 retries with exponential backoff
- `documentProcessor.ts` → `audio.transcriptions.create()` for audio files (Whisper)
- Used everywhere a vector search query is made (RAG pipeline)

---

### 1.3 Pinecone (Vector Database) — $2-10/month

| Detail | Value |
|--------|-------|
| **API Key** | `PINECONE_API_KEY` |
| **Code Locations** | `server/pinecone.ts`, `server/pineconeNamespaceService.ts`, `server/documentService.ts` |
| **Indexes** | `avatar-chat-knowledge`, `ask-elxr` (1536 dims, serverless, AWS us-east-1) |
| **Billing** | Read: $16/1M RU, Write: $2/1M WU, Storage: $0.33/GB/mo |
| **Call Pattern** | Per user message (query), per ingestion batch (upsert) |

**Monthly Usage:**

| Operation | Volume | Cost |
|-----------|--------|------|
| Read queries (22,500 msgs × ~1-5 RU) | ~67,500 RU | **$1.08** |
| Write/upsert (~5,000 vectors/mo) | ~5,000 WU | **$0.01** |
| Storage (~500K vectors, ~2GB) | 2 GB | **$0.66** |

**How it's called in code:**
- `pinecone.ts` → `index.query()` for similarity search (topK typically 5-10)
- `pinecone.ts` → `index.upsert()` for storing embeddings with metadata
- `pinecone.ts` → `index.delete()` for removing vectors
- `pineconeNamespaceService.ts` → Namespace-specific operations
- Knowledge organized by namespace taxonomy in `shared/pineconeCategories.ts`

---

### 1.4 ElevenLabs (TTS + STT) — $330-650/month

| Detail | Value |
|--------|-------|
| **API Key** | `ELEVENLABS_API_KEY` |
| **Code Locations** | `server/elevenlabsService.ts`, `server/elevenlabsSttService.ts`, `server/conversationWsService.ts`, `server/services/chatVideo.ts`, `server/services/videoGeneration.ts`, `server/streamingService.ts`, `server/webrtcStreamingService.ts` |
| **Billing** | Per character (TTS), per minute (STT) |
| **Call Pattern** | Per AI response (TTS), per user audio input (STT), per video generation |

**Models Used:**
- `eleven_flash_v2_5` — Fast English TTS (0.5 credits/char on turbo)
- `eleven_turbo_v2_5` — Standard TTS
- `eleven_multilingual_v2` — Non-English languages
- `scribe_v1` / `scribe_v2_realtime` — Speech-to-text

**Monthly Usage:**

| Use Case | Volume | Cost |
|----------|--------|------|
| TTS — avatar responses (~22,500 msgs × ~200 chars avg) | 4.5M chars | **$540-$1,080** |
| STT — real-time transcription (~150 hrs/mo) | 150 hrs | **$45-$90** |
| Video audio generation (~300 videos) | ~300K chars | **$36-$72** |

**Plan Tier Analysis:**
| Plan | Base Cost | Included | Overage Rate | Estimated Total |
|------|-----------|----------|-------------|-----------------|
| Scale ($99/mo) | $99 | 2M chars | $0.18/1K chars | ~$648/mo |
| Business ($330/mo) | $330 | 11M chars | $0.12/1K chars | ~$330/mo (if within quota) |

**Recommendation:** Business plan likely cheaper at this scale.

**How it's called in code:**
- `elevenlabsService.ts` → `textToSpeech.convert()` for generating speech streams
- REST: `/v1/text-to-speech/{voiceId}` with PCM format for HeyGen lip-sync
- REST: `/v1/text-to-speech/{voiceId}/with-timestamps` for LiveAvatar Base64 PCM
- WebSocket: `wss://api.elevenlabs.io/v1/speech-to-text/realtime` for real-time STT
- REST: `/v1/speech-to-text` for batch audio transcription (Scribe v1)
- Voice settings: stability 0.7, similarity_boost 0.65, use_speaker_boost: true

---

### 1.5 HeyGen (Video Avatar Generation) — $250-500/month

| Detail | Value |
|--------|-------|
| **API Keys** | `HEYGEN_API_KEY` (streaming), `HEYGEN_VIDEO_API_KEY` (video generation) |
| **Code Locations** | `server/services/videoGeneration.ts`, `server/services/chatVideo.ts`, `server/services/previewGeneration.ts`, `server/heygenCreditService.ts`, `server/routes.ts` |
| **Billing** | Credits: 1 credit = 1 min video (~$0.50-$0.99/credit depending on tier) |
| **Call Pattern** | Per video generation (async, takes minutes), per streaming session token |

**Monthly Usage:**

| Use Case | Volume | Credits | Cost (Scale @ $0.50) |
|----------|--------|---------|---------------------|
| Video generation (courses) | ~200 videos × 2 min avg | 400 credits | **$200** |
| Chat video generation | ~100 videos × 1 min avg | 100 credits | **$50** |
| Preview generation | ~50 previews | 50 credits | **$25** |

**Additional**: Scale plan base cost ~$330/mo which may include some credits.

**How it's called in code:**
- `videoGeneration.ts` → `POST /v2/video_generators/stream` to generate videos
- `videoGeneration.ts` → `GET /v2/video_generators/{video_id}` to poll status
- `chatVideo.ts` → Upload audio to `https://upload.heygen.com/v1/asset`
- `routes.ts` → `POST /v1/streaming.create_token` for interactive streaming tokens
- `heygenCreditService.ts` → Credit tracking with warning/critical thresholds
- Some avatars use "talking_photo" type instead of "avatar" type

---

### 1.6 LiveAvatar (Real-Time Avatar Streaming) — $450-900/month

| Detail | Value |
|--------|-------|
| **API Key** | `LIVEAVATAR_API_KEY` |
| **Code Locations** | `server/routes.ts` (inline token generation), `client/src/hooks/sessionDrivers.ts` (LiveAvatarDriver) |
| **Base URL** | `https://api.liveavatar.com/v1` |
| **Billing** | $0.10/min (Lite/CUSTOM mode) or $0.20/min (Full mode) |
| **Call Pattern** | Per live session (creates token, streams for duration of conversation) |

**Monthly Usage:**

| Use Case | Volume | Cost |
|----------|--------|------|
| Live sessions (~30/day × 5 min × 30 days) | 4,500 min | **$450-$900** |

**How it's called in code:**
- `routes.ts` → `POST /v1/sessions/token` to create session tokens
- Two modes:
  - `CUSTOM` — Uses Elxrai's own Claude + RAG + ElevenLabs pipeline, LiveKit for video delivery
  - `FULL` — Uses LiveAvatar's built-in LLM (requires context_id)
- `sessionDrivers.ts` → `LiveAvatarDriver` manages client-side connection lifecycle

**This is the single most expensive service** — consider session duration limits and Lite mode.

---

### 1.7 LiveKit (WebRTC Video/Audio Streaming) — $139/month

| Detail | Value |
|--------|-------|
| **API Keys** | `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL` |
| **Code Locations** | `server/services/livekit.ts`, `client/src/hooks/sessionDrivers.ts`, `client/src/hooks/useWebRTCStreaming.ts` |
| **Billing** | ~$0.004/min (audio), ~$0.015/min (video) |
| **Call Pattern** | Per live avatar session (room creation + token generation) |

**Monthly Usage:**

| Use Case | Volume | Cost |
|----------|--------|------|
| Avatar streaming rooms (video) | 4,500 min × 2 participants | **$135** |
| Audio-only sessions | ~500 min × 2 participants | **$4** |

**How it's called in code:**
- `livekit.ts` → `AccessToken.toJwt()` to generate JWT room tokens
- Room grants: roomJoin, canPublish, canSubscribe, canPublishData, roomCreate
- Token TTL: 3,600s (1hr default), 7,200s (2hrs for avatar/user pairs)
- Used as the transport layer for LiveAvatar CUSTOM mode

---

### 1.8 Mem0 (Persistent User Memory) — $22/month

| Detail | Value |
|--------|-------|
| **API Key** | `MEM0_API_KEY` |
| **Code Locations** | `server/mem0Service.ts`, `server/memoryService.ts`, `server/routes.ts` |
| **Base URL** | `https://api.mem0.ai/v1` |
| **Billing** | ~$0.001/memory operation |
| **Call Pattern** | Per conversation (extract + store), per session start (retrieve) |

**Monthly Usage:**

| Operation | Volume | Cost |
|-----------|--------|------|
| Memory storage (~3 facts/convo × 2,250 convos) | 6,750 ops | **$6.75** |
| Memory search (dedup + retrieval) | ~15,000 ops | **$15.00** |

**How it's called in code:**
- `mem0Service.ts` → `POST /memories` to add memories
- `mem0Service.ts` → `POST /memories/search` to search memories
- `mem0Service.ts` → `GET /memories` to list all memories for a user
- `mem0Service.ts` → `DELETE /memories/{id}` to remove memories
- Memory types: preference, bio, task, goal, health, relationship, skip (filtered)
- Extraction: Claude Sonnet 4.5 extracts facts (confidence >= 0.7), then stores via Mem0 API
- Deduplication: 0.85 similarity threshold to avoid duplicate memories

---

### 1.9 Neon PostgreSQL (Database) — $30/month

| Detail | Value |
|--------|-------|
| **Env Var** | `DATABASE_URL` |
| **Code Locations** | `server/db.ts` (Drizzle + Neon serverless connection) |
| **Billing** | $0.106/CU-hour (Launch), $0.35/GB storage |
| **Call Pattern** | Every API request (DB queries via Drizzle ORM) |

**Monthly Usage:**

| Resource | Volume | Cost |
|----------|--------|------|
| Compute (0.5 CU, ~18 hrs/day active with autoscale) | ~270 CU-hours | **$28.62** |
| Storage (~5 GB, 20+ tables) | 5 GB | **$1.75** |

**Notes:** Neon auto-scales to zero when inactive. Launch plan base ~$19/mo.

---

### 1.10 Upstash Redis (BullMQ Job Queue) — $0/month

| Detail | Value |
|--------|-------|
| **Env Var** | `REDIS_URL` |
| **Code Locations** | `server/documentQueue.ts` |
| **Billing** | $0.20/100K commands, first 500K free |
| **Call Pattern** | Per document ingestion job (enqueue, process, complete) |

~50K commands/month — well within free tier.

**How it's called in code:**
- `documentQueue.ts` → BullMQ Queue + Worker
- Job types: `document-processing`
- Concurrency: 2 workers, 3 retries with exponential backoff
- Cleanup: completed jobs kept 24hrs (last 100), failed jobs 7 days
- WebSocket progress at `/ws/document-processing`

---

### 1.11 Resend (Email) — $0/month

| Detail | Value |
|--------|-------|
| **API Key** | `RESEND_API_KEY` |
| **Code Locations** | `server/services/email.ts` |
| **Billing** | Free up to 3,000 emails/mo |
| **Call Pattern** | Per event (video ready notification) |

~100-300 emails/month — free tier covers this.

---

### 1.12 Memberstack (Subscription & Billing) — $25-35/month

| Detail | Value |
|--------|-------|
| **API Key** | `MEMBERSTACK_SECRET_KEY` |
| **Code Locations** | `server/services/memberstack.ts`, `server/routes.ts` |
| **Billing** | Fixed monthly plan |
| **Call Pattern** | Per user action (subscription check, member info retrieval) |

**How it's called in code:**
- `memberstack.ts` → `GET /members/{memberstackId}` via `X-API-KEY` header
- Used in auth middleware: `requireMemberstackOrAdmin`

---

### 1.13 Google Custom Search — $0-15/month

| Detail | Value |
|--------|-------|
| **API Keys** | `GOOGLE_SEARCH_API_KEY`, `GOOGLE_SEARCH_ENGINE_ID` |
| **Code Locations** | `server/googleSearchService.ts` |
| **Billing** | 100 free queries/day, then $5/1K queries |
| **Call Pattern** | Per enhanced search query (on-demand, max 5 results per call) |

Mostly within free tier at current usage. Date-filtered to current year only.

---

### 1.14 Google Drive API — $0/month (FREE)

| Detail | Value |
|--------|-------|
| **Credentials** | `GCS_CLIENT_EMAIL`, `GCS_PRIVATE_KEY`, `GCS_PROJECT_ID` |
| **Code Locations** | `server/googleDriveService.ts` |
| **Call Pattern** | Per folder sync (user-triggered, reads files, exports as PDF) |

Free quota-based API. No per-use charges.

---

### 1.15 Notion API — $0/month (FREE)

| Detail | Value |
|--------|-------|
| **API Key** | `NOTION_API_KEY` |
| **Code Locations** | `server/notionService.ts` |
| **Call Pattern** | Per database sync (queries pages, extracts content → embeddings → Pinecone) |

Free with Notion workspace subscription.

---

### 1.16 PubMed/NCBI — $0/month (FREE)

| Detail | Value |
|--------|-------|
| **API Key** | `NCBI_API_KEY` (optional, increases rate limit 3→10 req/sec) |
| **Code Locations** | `server/pubmedService.ts`, `server/offlinePubMedService.ts` |
| **Call Pattern** | Per search query, per article fetch (XML) |

Free public API. Pipeline: PubMed → parse XML → OpenAI embeddings → Pinecone.

---

### 1.17 Deepgram (STT — Secondary) — $0/month (NOT IN USE)

| Detail | Value |
|--------|-------|
| **API Key** | `DEEPGRAM_API_KEY` (defined in env, not actively integrated) |
| **Status** | ElevenLabs STT is the primary speech-to-text service |

API key exists but service is not integrated into the current pipeline. Could be a cost-saving alternative ($0.0077/min vs ElevenLabs STT).

---

## 2. CONSOLIDATED COST PROJECTION

### Monthly Cost Summary

| # | Service | Category | Monthly Cost | % of Total |
|---|---------|----------|-------------|------------|
| 1 | **LiveAvatar** | Video Streaming | **$675** | 29.6% |
| 2 | **Claude (Anthropic)** | AI/LLM | **$605** | 26.5% |
| 3 | **ElevenLabs** | TTS/STT | **$490** | 21.5% |
| 4 | **HeyGen** | Video Generation | **$375** | 16.4% |
| 5 | **LiveKit** | WebRTC | **$139** | 6.1% |
| 6 | **Neon PostgreSQL** | Database | **$30** | 1.3% |
| 7 | **Memberstack** | Auth/Billing | **$30** | 1.3% |
| 8 | **Mem0** | Memory | **$22** | 1.0% |
| 9 | **Google Search** | Web Search | **$8** | 0.3% |
| 10 | **Pinecone** | Vector DB | **$5** | 0.2% |
| 11 | **OpenAI Embeddings** | Embeddings | **$0.10** | ~0% |
| 12 | **Upstash Redis** | Queue | **$0** | 0% |
| 13 | **Resend** | Email | **$0** | 0% |
| 14 | **Google Drive** | Ingestion | **$0** | 0% |
| 15 | **PubMed/NCBI** | Research | **$0** | 0% |
| 16 | **Notion** | Ingestion | **$0** | 0% |
| 17 | **Deepgram** | STT (unused) | **$0** | 0% |
| | **TOTAL** | | **~$2,379** | 100% |

---

### Time-Based Projections

| Period | Low Estimate | Mid Estimate | High Estimate |
|--------|-------------|-------------|---------------|
| **Weekly** | $430 | $595 | $770 |
| **Monthly** | $1,720 | $2,379 | $3,080 |
| **Quarterly** | $5,160 | $7,137 | $9,240 |
| **Yearly** | $20,640 | $28,548 | $36,960 |

*Low = optimistic (lower plan tiers, caching, lower engagement)*
*Mid = expected baseline at 75 conversations/day*
*High = peak usage, overage rates, longer sessions*

---

## 3. COST DISTRIBUTION

```
 ██████████████████████████████  LiveAvatar    29.6%  ($675/mo)
 █████████████████████████       Claude AI     26.5%  ($605/mo)
 █████████████████████           ElevenLabs    21.5%  ($490/mo)
 ████████████████                HeyGen        16.4%  ($375/mo)
 ██████                          LiveKit        6.1%  ($139/mo)
 █                               All Others    ~3.0%  ($95/mo)
```

**By category:**
- Video/Avatar services (LiveAvatar + HeyGen + LiveKit) = **52.1%** ($1,189/mo)
- AI/Language services (Claude + ElevenLabs + OpenAI) = **48.0%** ($1,095/mo)
- Infrastructure (Neon + Redis + Pinecone) = **1.5%** ($35/mo)
- SaaS tools (Memberstack + Resend + Google) = **1.6%** ($38/mo)

---

## 4. EXISTING COST CONTROLS IN CODEBASE

These optimizations are already implemented:

| Control | Where | Impact |
|---------|-------|--------|
| Voice mode caps Claude output at 350 tokens | `claudeService.ts` | Reduces Opus output cost ~91% for voice |
| Conversation history limited to last 4 messages | `claudeService.ts` | Limits context window growth |
| Haiku used for ingestion (not Opus) | `server/ingest/` | 5x cheaper for batch processing |
| OpenAI batch embeddings (100 per call) | `server/ingest/embedder.ts` | Fewer API calls, lower overhead |
| Mem0 deduplication (0.85 similarity) | `mem0Service.ts` | Prevents duplicate memory storage |
| HeyGen credit tracking with thresholds | `heygenCreditService.ts` | Warning/critical alerts before overspend |
| Circuit breakers on Claude calls | `claudeService.ts` | 60s timeout, prevents runaway costs on errors |
| Pinecone query result caching | `pinecone.ts` | Reduces read units on repeated queries |

---

## 5. COST OPTIMIZATION OPPORTUNITIES

| # | Optimization | Potential Savings | Effort |
|---|-------------|------------------|--------|
| 1 | **LiveAvatar Lite mode** — $0.10/min vs $0.20/min | Up to $450/mo | Low — config change |
| 2 | **Session duration caps** — limit live sessions to 5 min max | Variable | Low — add timer |
| 3 | **Anthropic Prompt Caching** — cache system prompts | $50-100/mo on Claude | Medium — SDK change |
| 4 | **Anthropic Batch API** — 50% off for non-realtime tasks | ~$30/mo | Medium — queue ingestion |
| 5 | **ElevenLabs Business plan** — $330/mo covers 11M chars | ~$300/mo savings vs Scale+overages | Low — plan upgrade |
| 6 | **Claude Sonnet for simple Q&A** — route simple queries to cheaper model | ~$100-150/mo | Medium — add routing |
| 7 | **Deepgram for STT** — $0.0077/min vs ElevenLabs | Variable | Medium — integration work |
| 8 | **Response length optimization** — shorter responses for simple queries | ~$50/mo on Claude | Low — prompt tuning |

**Maximum potential savings: ~$1,080/mo (45% reduction)**

---

## 6. NON-COST API KEYS

These API keys exist in the codebase but do not generate external service costs:

| Key | Purpose |
|-----|---------|
| `SESSION_SECRET` | Express session signing (local) |
| `ADMIN_SECRET` | Admin panel auth (local, supports comma-separated list) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth (no per-use cost) |
| `GCS_CLIENT_EMAIL` / `GCS_PRIVATE_KEY` | Google Drive service account (free API) |
| `DEEPGRAM_API_KEY` | Defined but not actively integrated |

---

## 7. REVENUE BREAK-EVEN ANALYSIS

| Members | Cost/Member/Month | Annual Infrastructure |
|---------|-------------------|-----------------------|
| 100 | $23.79 | $28,548 |
| 200 | $11.90 | $28,548 |
| 500 | $4.76 | $28,548 |
| 1,000 | $2.38 | $28,548 |

**Note:** These are marginal costs — at higher member counts, per-message costs (Claude, ElevenLabs) scale linearly while fixed costs (Neon, Memberstack) stay flat. At 1,000 members the monthly cost would likely be $8,000-12,000, not $2,379.

---

## Sources

- [Anthropic Claude API Pricing](https://docs.anthropic.com/en/docs/about-claude/pricing)
- [OpenAI Embeddings Pricing](https://platform.openai.com/docs/pricing)
- [Pinecone Pricing](https://www.pinecone.io/pricing/)
- [ElevenLabs API Pricing](https://elevenlabs.io/pricing/api)
- [HeyGen API Pricing](https://www.heygen.com/api-pricing)
- [HeyGen/LiveAvatar Pricing](https://help.heygen.com/en/articles/10060327-heygen-api-liveavatar-pricing-subscriptions-explained)
- [LiveKit Pricing](https://livekit.com/pricing)
- [Mem0 Pricing](https://mem0.ai/pricing)
- [Neon PostgreSQL Pricing](https://neon.com/pricing)
- [Upstash Redis Pricing](https://upstash.com/pricing/redis)
- [Resend Pricing](https://resend.com/pricing)
- [Memberstack Pricing](https://www.memberstack.com/pricing)
- [Google Custom Search API](https://developers.google.com/custom-search/v1/overview)
- [Deepgram Pricing](https://deepgram.com/pricing)
