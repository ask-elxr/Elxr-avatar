# Elxrai — Alternative Tech Stack Comparison & Cost Optimization

> **Date**: March 15, 2026
> **Purpose**: Identify cost-effective alternatives for each third-party service
> **Current monthly spend**: ~$2,379/month
> **Target**: Reduce costs while maintaining quality

---

## Executive Summary

By migrating to optimized alternatives across all service categories, Elxrai could reduce monthly infrastructure costs from **$2,379 to $590-$960** — a **60-75% reduction** ($17,000-$21,500/year savings).

| Category | Current | Optimized | Savings |
|----------|---------|-----------|---------|
| LLM (Conversations) | $605 | $195-$340 | $265-$410 |
| TTS/STT | $490 | $0-$175 | $315-$490 |
| Avatar Streaming | $675 | $50-$225 | $450-$625 |
| Video Generation | $375 | $18-$89 | $286-$357 |
| WebRTC | $139 | $30-$50 | $89-$109 |
| Infrastructure | $95 | $30-$80 | $15-$65 |
| **TOTAL** | **$2,379** | **$590-$960** | **$1,419-$1,789** |

---

## 1. LLM ALTERNATIVES (Current: Claude — $605/month)

### Current Setup
| Tier | Model | Cost (Input/Output per 1M tok) | Use Case |
|------|-------|-------------------------------|----------|
| Premium | Claude Opus 4.6 | $5.00 / $25.00 | Conversations, voice |
| Mid | Claude Sonnet 4.5 | $3.00 / $15.00 | Memory extraction, critic |
| Budget | Claude Haiku 4.5 | $1.00 / $5.00 | Ingestion, classification |

### Alternatives Comparison

| Model | Input $/1M | Output $/1M | Context | Quality (MMLU) | Streaming | Best For |
|-------|-----------|-------------|---------|----------------|-----------|----------|
| **Claude Opus 4.6** (current) | $5.00 | $25.00 | 200K | ~92% | Yes | Personality-driven chat |
| **GPT-4.1** | $2.00 | $8.00 | 1M | ~90% | Yes | General conversations |
| **Gemini 2.5 Pro** | $1.25 | $10.00 | 1M | ~91% | Yes | Long-context analysis |
| **Mistral Large 3** | $2.00 | $6.00 | 256K | ~85% | Yes | EU data residency |
| **DeepSeek V3.2** | $0.28 | $0.42 | 128K | ~87% | Yes | Cost-optimized batch |
| **Cohere Command R+** | $2.50 | $10.00 | 128K | ~83% | Yes | RAG-specific features |
| | | | | | | |
| **Claude Sonnet 4.5** (current) | $3.00 | $15.00 | 200K | ~88% | Yes | Structured extraction |
| **GPT-4.1 Mini** | $0.40 | $1.60 | 1M | ~83% | Yes | Mid-tier tasks |
| **Gemini 2.5 Flash** | $0.30 | $2.50 | 1M | ~82% | Yes | Fast mid-tier |
| **Mistral Medium 3** | $0.40 | $2.00 | 128K | ~78% | Yes | EU mid-tier |
| | | | | | | |
| **Claude Haiku 4.5** (current) | $1.00 | $5.00 | 200K | ~75% | Yes | Classification |
| **GPT-4.1 Nano** | $0.10 | $0.40 | 1M | ~70% | Yes | High-volume batch |
| **Gemini 2.0 Flash Lite** | $0.075 | $0.30 | 1M | ~68% | Yes | Ultra-cheap batch |
| **Llama 4 Maverick (Groq)** | $0.15 | $0.60 | 1M | ~72% | Yes | Fast inference |
| **Llama 4 Scout (Groq)** | $0.11 | $0.11 | 10M | ~65% | Yes | Massive context |

### Recommended LLM Strategy

#### Option A: Hybrid (Best Quality + Savings) — **$340/month** (44% savings)
| Tier | Switch To | Monthly Cost | Savings |
|------|-----------|-------------|---------|
| Conversations | **Keep Claude Opus 4.6** | $528 → $528 | $0 (quality priority) |
| Memory extraction | **GPT-4.1 Mini** | $40.50 → $5 | $35.50 |
| Ingestion | **GPT-4.1 Nano** | $22 → $2 | $20 |
| Intent detection | **GPT-4.1 Mini** | $22.50 → $3 | $19.50 |
| **Total** | | **$538** → **$340** (est.) | **~$265** |

*Rationale: Claude's conversational personality is the product differentiator for avatar chat. Keep it where users notice. Cut costs on background processing where they don't.*

#### Option B: Full GPT-4.1 Migration — **$195/month** (68% savings)
| Tier | Switch To | Monthly Cost | Savings |
|------|-----------|-------------|---------|
| Conversations | **GPT-4.1** | $528 → $150 | $378 |
| Memory extraction | **GPT-4.1 Mini** | $40.50 → $5 | $35.50 |
| Ingestion | **GPT-4.1 Nano** | $22 → $2 | $20 |
| **Total** | | **$605** → **$195** | **$410** |

*Risk: GPT-4.1 may feel less natural in personality-driven conversations. Test with real users.*

#### Option C: Gemini Migration — **$215/month** (64% savings)
| Tier | Switch To | Monthly Cost |
|------|-----------|-------------|
| Conversations | **Gemini 2.5 Pro** | $170 |
| Memory extraction | **Gemini 2.5 Flash** | $8 |
| Ingestion | **Gemini 2.0 Flash Lite** | $2 |
| **Total** | | **$215** (estimated) |

*Advantage: 1M context window. Risk: Less tested for avatar personality scenarios.*

### Migration Effort (LLM)
- **Low effort** for Options A (just swap model calls for background tasks — OpenAI SDK already in codebase)
- **Medium effort** for Options B/C (rewrite `claudeService.ts` system prompts, test personality quality)
- Already have `OPENAI_API_KEY` and OpenAI SDK installed

---

## 2. TTS ALTERNATIVES (Current: ElevenLabs — $490/month)

### Current Setup
- 4.5M characters/month TTS output
- Models: `eleven_flash_v2_5`, `eleven_multilingual_v2`
- Requires: PCM audio output, WebSocket streaming, low latency for avatar lip-sync

### Alternatives Comparison

| Provider | $/1K chars | Monthly Cost (4.5M) | TTFB Latency | WebSocket | PCM Output | Voice Quality |
|----------|-----------|---------------------|-------------|-----------|------------|---------------|
| **Azure Neural TTS** | $0.016 | **$0** (5M free!) | ~150ms | Yes | Yes | Good |
| **Azure Neural HD V2** | $0.030 | **$135** | ~150ms | Yes | Yes | Excellent |
| **Google WaveNet** | $0.016 | **$56** | ~150ms | gRPC only | Yes | Good |
| **Amazon Polly Neural** | $0.016 | **$72** | ~200ms | REST | Yes | Good |
| **Deepgram Aura-2** | $0.030 | **$135** | ~150ms | **Native** | **Yes (linear16)** | Good |
| **Cartesia Sonic 3** | ~$0.038 | **$171** | **40ms** | **Native** | Yes | Excellent |
| **LMNT** | $0.035 | **$158** | 150ms | Yes | Yes | Good |
| **OpenAI gpt-4o-mini-tts** | ~$0.020 | **$90** | ~200ms | REST only | Yes | Very Good |
| **ElevenLabs** (current) | $0.18-0.30 | **$490** | ~100ms | Yes | Yes | Excellent |
| **PlayHT 3.0** | ~$1.20 | **$5,400** | ~200ms | Yes | Yes | Excellent |

### STT Alternatives (Current: ~$30-40/month — low priority)

| Provider | $/hour | Monthly (100 hrs) | Real-time WS | Notes |
|----------|--------|-------------------|-------------|-------|
| **AssemblyAI** | $0.15 | **$15** | Yes | Session billing |
| **OpenAI Transcribe** | $0.18 | **$18** | No | Batch only |
| **Gladia Solaria-1** | $0.25-0.55 | **$25-55** | Yes | 103ms partial latency |
| **ElevenLabs Scribe** (current) | $0.30-0.40 | **$30-40** | Yes | Already integrated |
| **Deepgram Nova-3** | $0.39-0.46 | **$39-46** | **Yes (native)** | Already have API key |
| **Google Cloud STT** | $1.44-2.16 | **$144-216** | gRPC | Very expensive |

### Recommended TTS/STT Strategy

#### Option A: Azure Neural (FREE) — **$0/month** (100% savings)
- 5M characters/month free tier covers your entire 4.5M usage
- Native WebSocket + PCM support for avatar lip-sync
- Risk: Free tier may have rate limits; voice quality is "good" not "excellent"
- Migration: Medium effort (new SDK, different WebSocket protocol)

#### Option B: Deepgram Aura-2 (Lowest Friction) — **$135/month** (72% savings)
- **Already have `DEEPGRAM_API_KEY`** — zero new vendor onboarding
- Native WebSocket + PCM linear16 (perfect for HeyGen lip-sync format)
- Can consolidate TTS + STT on one vendor
- Migration: Low-medium effort (already have credentials)

#### Option C: Cartesia Sonic 3 (Best Latency) — **$171/month** (65% savings)
- Industry-leading 40ms TTFB (vs 100ms ElevenLabs)
- Excellent voice quality, native WebSocket
- Best choice if real-time responsiveness is critical for avatar experience
- Migration: Medium effort (new SDK)

#### Option D: Hybrid Azure Free + Keep ElevenLabs for Premium
- Use Azure free tier for standard conversations
- Keep ElevenLabs for premium/multilingual users
- Cost: ~$50-100/month depending on ElevenLabs usage

### Migration Effort (TTS)
- Rewrite `server/elevenlabsService.ts` to abstract TTS provider
- Update PCM format handling in `server/services/chatVideo.ts` and `server/services/videoGeneration.ts`
- Test lip-sync quality with LiveAvatar/HeyGen avatars (critical)

---

## 3. AVATAR STREAMING ALTERNATIVES (Current: LiveAvatar — $675/month)

### Current Setup
- ~4,500 minutes/month of live avatar streaming
- Uses CUSTOM mode (Elxrai's own Claude + RAG + ElevenLabs pipeline)
- LiveKit for video delivery

### Alternatives Comparison

| Provider | $/minute | Monthly (4,500 min) | Real-time | Custom LLM | Lip-Sync | Quality |
|----------|---------|---------------------|-----------|------------|----------|---------|
| **Simli** | $0.009-0.05 | **$41-$225** | Yes | Yes (BYO) | Yes | Good |
| **Tavus** | ~$0.10 | **$450** | Yes | Yes (Phoenix-3) | Yes | Excellent |
| **D-ID Agents** | ~$0.08-0.15 | **$360-$675** | Yes | Yes (BYO) | Yes | Good |
| **LiveAvatar** (current) | $0.10-0.20 | **$450-$900** | Yes | Yes (CUSTOM) | Yes | Excellent |

### Recommended Avatar Streaming Strategy

#### Option A: Simli — **$50-225/month** (67-93% savings)
- Significant cost reduction at $0.009-0.05/min
- Supports BYO (Bring Your Own) LLM — compatible with current Claude + RAG pipeline
- Lip-sync from audio input (works with any TTS provider)
- Risk: Avatar quality may not match HeyGen/LiveAvatar — **must test with your specific avatar faces**
- Migration: Medium effort (rewrite `LiveAvatarDriver` in `sessionDrivers.ts`)

#### Option B: D-ID Agents — **$360-675/month** (0-47% savings)
- More established platform, closer quality to HeyGen
- BYO LLM support
- Less savings than Simli
- Migration: Medium effort

#### Option C: Keep LiveAvatar, Optimize Usage
- Enforce 5-minute session caps
- Use Lite mode ($0.10/min) exclusively
- Estimated: $450/month (33% savings)

---

## 4. VIDEO GENERATION ALTERNATIVES (Current: HeyGen — $375/month)

### Current Setup
- ~500 credits/month (1 credit = 1 min video)
- Course videos + chat video generation
- Uses custom avatars with uploaded audio

### Alternatives Comparison

| Provider | Plan | Included Minutes | Extra $/min | Monthly Cost (est.) |
|----------|------|-----------------|-------------|---------------------|
| **D-ID Build** | $18/mo | 32 min | $0.56/min | **$18 + overages** |
| **D-ID Scale** | $108/mo | 240 min | $0.45/min | **$108 + overages** |
| **Synthesia Creator** | $89/mo | 30 min | $3.00/min | **$89 + overages** |
| **Synthesia Enterprise** | Custom | Custom | Custom | **Negotiate** |
| **HeyGen** (current) | $330+/mo | Varies | ~$0.50/min | **$375** |

### Recommended Video Generation Strategy

#### Option A: D-ID for Short Videos — **$18-108/month** (71-95% savings)
- Best for chat video clips (1-2 min)
- API-first, good documentation
- Risk: Different avatar rendering style — test visual quality
- Migration: Medium effort (rewrite `server/services/videoGeneration.ts` and `chatVideo.ts`)

#### Option B: Reduce HeyGen Usage
- Limit video generation to premium features only
- Use static/text responses for non-premium users
- Keep current integration, just control access
- Cost: $200-250/month (33-47% savings)

#### Option C: Open-Source (SadTalker/Wav2Lip)
- Self-hosted, no per-use cost
- Risk: Significantly lower quality, requires GPU infrastructure
- Only viable for non-customer-facing content

---

## 5. WEBRTC ALTERNATIVES (Current: LiveKit — $139/month)

### Current Setup
- ~4,500 min video streaming + ~500 min audio-only
- Used as transport for LiveAvatar CUSTOM mode
- 2 participants per room (user + avatar)

### Alternatives Comparison

| Provider | Video $/min | Audio $/min | Monthly (est.) | Free Tier |
|----------|-----------|-----------|----------------|-----------|
| **Daily.co** | $0.004/participant | $0.002/participant | **$30-50** | 10K min free |
| **Agora** | $0.0039/min | $0.0019/min | **$35-50** | 10K min free |
| **Self-hosted LiveKit** | $0 (infra only) | $0 | **$20-40** (server) | N/A |
| **Twilio Video** | $0.004/min | $0.001/min | **$40-60** | None |
| **LiveKit Cloud** (current) | $0.015/min | $0.004/min | **$139** | 5K min free |

### Recommended WebRTC Strategy

#### Option A: Daily.co — **$30-50/month** (64-78% savings)
- Well-documented API, React SDK available
- 10,000 free minutes/month (covers ~55% of usage)
- Similar feature set to LiveKit
- Migration: Medium effort (rewrite `server/services/livekit.ts`, update client hooks)

#### Option B: Self-hosted LiveKit — **$20-40/month** (71-86% savings)
- Run LiveKit server on a $20-40/month VPS (Hetzner, DigitalOcean)
- Eliminates per-minute charges entirely
- Risk: Operational burden, need to manage infrastructure
- Migration: Low code changes (same SDK), but need DevOps setup

---

## 6. INFRASTRUCTURE CONSOLIDATION

### 6.1 Replace Pinecone with pgvector (in Neon)

| Aspect | Pinecone | pgvector (Neon) |
|--------|----------|-----------------|
| Cost | $5-10/mo | $0 (included in Neon) |
| Performance (<1M vectors) | ~50ms p95 | ~28ms p95 |
| Maintenance | Managed | Managed (part of Neon) |
| Migration effort | — | Medium (rewrite `server/pinecone.ts`) |

**Recommendation**: Migrate to pgvector. At <1M vectors, pgvector in Neon actually outperforms Pinecone serverless and eliminates a dependency. Neon supports pgvector natively.

### 6.2 Replace Mem0 with Self-Hosted or Custom

| Aspect | Mem0 Cloud | Self-Hosted Mem0 | Custom (Postgres) |
|--------|-----------|------------------|-------------------|
| Cost | $22/mo | $0 (Docker) | $0 (in Neon) |
| Features | Full API | Full API | Basic CRUD + search |
| Migration effort | — | Low (Docker) | High (build from scratch) |

**Recommendation**: Self-host Mem0 via Docker on existing infrastructure. Lowest effort, eliminates the API cost.

### 6.3 Database — Keep Neon
Neon at $30/month is competitive and already integrated. Supabase ($25/mo) or Railway ($5-20/mo) offer marginal savings not worth the migration effort.

---

## 7. OPTIMIZED STACK COMPARISON

### Current vs Optimized (Conservative)

| Service | Current Provider | Current Cost | New Provider | New Cost |
|---------|-----------------|-------------|-------------|---------|
| LLM (Conversations) | Claude Opus 4.6 | $528 | Claude Opus 4.6 (keep) | $528 |
| LLM (Background) | Claude Sonnet/Haiku | $77 | GPT-4.1 Mini/Nano | $10 |
| TTS | ElevenLabs | $490 | Deepgram Aura-2 | $135 |
| STT | ElevenLabs Scribe | ~$35 | Keep ElevenLabs | $35 |
| Avatar Streaming | LiveAvatar | $675 | Simli | $150 |
| Video Generation | HeyGen | $375 | D-ID Build/Scale | $108 |
| WebRTC | LiveKit Cloud | $139 | Daily.co | $40 |
| Vector DB | Pinecone | $5 | pgvector (Neon) | $0 |
| Memory | Mem0 Cloud | $22 | Mem0 self-hosted | $0 |
| Database | Neon | $30 | Neon (keep) | $30 |
| Auth/Billing | Memberstack | $30 | Memberstack (keep) | $30 |
| Other | Various | $8 | Keep | $8 |
| **TOTAL** | | **$2,379** | | **$1,074** |

**Savings: $1,305/month (55%)** — Conservative approach keeping Claude for conversations.

### Current vs Optimized (Aggressive)

| Service | Current Provider | Current Cost | New Provider | New Cost |
|---------|-----------------|-------------|-------------|---------|
| LLM (Conversations) | Claude Opus 4.6 | $528 | GPT-4.1 | $150 |
| LLM (Background) | Claude Sonnet/Haiku | $77 | GPT-4.1 Mini/Nano | $10 |
| TTS | ElevenLabs | $490 | Azure Neural (free) | $0 |
| STT | ElevenLabs Scribe | ~$35 | AssemblyAI | $15 |
| Avatar Streaming | LiveAvatar | $675 | Simli | $50 |
| Video Generation | HeyGen | $375 | D-ID Build | $18 |
| WebRTC | LiveKit Cloud | $139 | Self-hosted LiveKit | $30 |
| Vector DB | Pinecone | $5 | pgvector (Neon) | $0 |
| Memory | Mem0 Cloud | $22 | Custom Postgres | $0 |
| Database | Neon | $30 | Neon (keep) | $30 |
| Auth/Billing | Memberstack | $30 | Memberstack (keep) | $30 |
| Other | Various | $8 | Keep | $8 |
| **TOTAL** | | **$2,379** | | **$341** |

**Savings: $2,038/month (86%)** — Aggressive approach, requires extensive testing.

---

## 8. MIGRATION ROADMAP

### Phase 1: Quick Wins (Week 1-2) — Save $320/month
| Change | Effort | Risk | Savings |
|--------|--------|------|---------|
| Switch ingestion LLM to GPT-4.1 Nano | Low | Low | $20/mo |
| Switch memory extraction to GPT-4.1 Mini | Low | Low | $35/mo |
| Switch intent detection to GPT-4.1 Mini | Low | Low | $20/mo |
| Consolidate Pinecone → pgvector (Neon) | Medium | Low | $5/mo |
| Self-host Mem0 | Low | Low | $22/mo |
| Enforce LiveAvatar Lite mode + 5min caps | Low | Low | $225/mo |

### Phase 2: TTS Migration (Week 3-4) — Save $355/month
| Change | Effort | Risk | Savings |
|--------|--------|------|---------|
| Migrate TTS to Deepgram Aura-2 or Azure | Medium | Medium | $355/mo |
| Test lip-sync quality with avatars | — | Critical | — |
| Keep ElevenLabs STT (low cost, working) | None | None | $0 |

### Phase 3: Avatar & Video (Week 5-8) — Save $630/month
| Change | Effort | Risk | Savings |
|--------|--------|------|---------|
| Evaluate Simli for avatar streaming | Medium | High | $450-625/mo |
| Migrate WebRTC to Daily.co | Medium | Low | $89-109/mo |
| Evaluate D-ID for video generation | Medium | Medium | $267/mo |

### Phase 4: LLM Optimization (Week 9-10) — Save $0-378/month
| Change | Effort | Risk | Savings |
|--------|--------|------|---------|
| A/B test GPT-4.1 vs Claude for conversations | High | High | $378/mo |
| Only proceed if quality metrics pass | — | — | — |

---

## 9. RISK MATRIX

| Migration | Quality Risk | Integration Risk | Reversibility |
|-----------|-------------|-----------------|---------------|
| LLM background → GPT-4.1 Mini/Nano | Low | Low (SDK exists) | Easy |
| Pinecone → pgvector | Low | Medium | Medium |
| Mem0 → self-hosted | Low | Low | Easy |
| ElevenLabs → Deepgram Aura-2 | Medium (voice quality) | Low (have key) | Easy |
| ElevenLabs → Azure Neural | Medium (voice quality) | Medium | Easy |
| LiveAvatar → Simli | **High** (avatar quality) | Medium | Hard |
| HeyGen → D-ID | **High** (avatar rendering) | Medium | Hard |
| LiveKit → Daily.co | Low | Medium | Medium |
| Claude → GPT-4.1 (conversations) | **High** (personality) | Medium | Easy |

---

## 10. ANNUAL FINANCIAL IMPACT

| Scenario | Monthly | Yearly | vs Current ($28,548/yr) |
|----------|---------|--------|------------------------|
| **Current** | $2,379 | $28,548 | — |
| **Phase 1 only** (quick wins) | $2,059 | $24,708 | Save $3,840 |
| **Phase 1+2** (+ TTS) | $1,704 | $20,448 | Save $8,100 |
| **Phase 1+2+3** (+ avatar/video) | $1,074 | $12,888 | Save $15,660 |
| **Full aggressive** | $341 | $4,092 | Save $24,456 |

### Break-Even per Member

| Scenario | 200 Members | 500 Members | 1,000 Members |
|----------|-------------|-------------|---------------|
| Current | $11.90/mo | $4.76/mo | $2.38/mo |
| Conservative optimized | $5.37/mo | $2.15/mo | $1.07/mo |
| Aggressive optimized | $1.71/mo | $0.68/mo | $0.34/mo |

---

## Sources

### LLM Pricing
- [OpenAI GPT-4.1 Pricing](https://platform.openai.com/docs/pricing)
- [Google Gemini API Pricing](https://ai.google.dev/pricing)
- [DeepSeek API Pricing](https://platform.deepseek.com/api-docs/pricing)
- [Mistral API Pricing](https://mistral.ai/products/la-plateforme#pricing)
- [Groq Pricing (Llama)](https://groq.com/pricing/)
- [Cohere Pricing](https://cohere.com/pricing)

### TTS/STT Pricing
- [Azure Speech Services Pricing](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/)
- [Google Cloud TTS Pricing](https://cloud.google.com/text-to-speech/pricing)
- [Amazon Polly Pricing](https://aws.amazon.com/polly/pricing/)
- [Deepgram Pricing](https://deepgram.com/pricing)
- [Cartesia Pricing](https://cartesia.ai/pricing)
- [ElevenLabs API Pricing](https://elevenlabs.io/pricing/api)
- [AssemblyAI Pricing](https://www.assemblyai.com/pricing)
- [Gladia Pricing](https://www.gladia.io/pricing)

### Avatar/Video
- [Simli Pricing](https://www.simli.com/pricing)
- [D-ID Pricing](https://www.d-id.com/pricing/)
- [Synthesia Pricing](https://www.synthesia.io/pricing)
- [Tavus Pricing](https://www.tavus.io/pricing)

### WebRTC
- [Daily.co Pricing](https://www.daily.co/pricing)
- [Agora Pricing](https://www.agora.io/en/pricing/)
- [LiveKit Cloud Pricing](https://livekit.com/pricing)

### Infrastructure
- [Neon pgvector Documentation](https://neon.tech/docs/extensions/pgvector)
- [Mem0 Self-Hosting Guide](https://docs.mem0.ai/open-source/quickstart)
