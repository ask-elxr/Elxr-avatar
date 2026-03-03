# Avatar System

## Overview

The avatar system is the core feature of Elxrai. Each avatar is a virtual AI mentor with:
- A unique visual appearance (HeyGen video avatar)
- A distinct voice (ElevenLabs or HeyGen TTS)
- A specialized personality and expertise (persona engine)
- Dedicated knowledge bases (Pinecone namespaces)
- Configurable research sources (PubMed, Wikipedia, Google Search)

The platform supports ~10 active avatars with full CRUD management via the admin panel.

## Avatar Profile Schema

Defined in `shared/schema.ts` as the `avatar_profiles` table. Key fields:

### Identity
- `id`, `name`, `description`, `profile_image_url`, `tags`
- `is_active` — Whether shown in avatar list
- `sort_order` — Display order

### Streaming Platform
- `streaming_platform` — `'liveavatar'` (new) or `'heygen'` (legacy)
- `interactive_voice_source` — `'elevenlabs'`, `'heygen'`, or `'liveavatar'`

### HeyGen IDs (multiple per avatar)
| Field | Purpose |
|-------|---------|
| `heygen_avatar_id` | Legacy HeyGen Streaming Avatar SDK |
| `live_avatar_id` | New HeyGen LiveAvatar platform |
| `heygen_video_avatar_id` | For video generation (Instant Avatars) |
| `live_avatar_context_id` | Required for FULL mode (HeyGen controls LLM) |
| `requires_full_mode` | Some avatars only work in FULL mode |

### Voice IDs
| Field | Service | Purpose |
|-------|---------|---------|
| `heygen_voice_id` | HeyGen | Streaming voice |
| `heygen_video_voice_id` | HeyGen | Video generation voice |
| `elevenlabs_voice_id` | ElevenLabs | Interactive TTS |
| `live_avatar_voice_id` | HeyGen LiveAvatar | LiveAvatar voice |
| `audio_only_voice_id` | ElevenLabs | Dedicated audio-only voice |
| `voice_rate` | All | Speech rate multiplier (default `'1.0'`) |

### Language
- `language_code` — BCP-47 (e.g. `en-US`)
- `elevenlabs_language_code` — ElevenLabs format (e.g. `en`)

### Knowledge & Research
- `pinecone_namespaces` — Array of Pinecone namespace strings for RAG
- `use_pubmed` — Enable PubMed medical research
- `use_wikipedia` — Enable Wikipedia lookups
- `use_google_search` — Enable Google Search

### Capabilities
- `enable_audio_mode` — Allow audio-only mode
- `enable_video_mode` — Allow video streaming mode
- `enable_video_creation` — Allow video generation (courses, chat videos)

### Personality
- `personality_prompt` — Text defining the avatar's personality for Claude
- `loading_animation_url` — Custom loading video URL
- `heygen_knowledge_id` — HeyGen-hosted knowledge base (for FULL mode)

## Configuration File

**File**: `config/avatars.config.ts` (~36KB)

Defines default avatar profiles that seed the database on server startup via `seedDefaultAvatars()`. Each avatar has:
- All IDs (HeyGen, ElevenLabs, LiveAvatar)
- Full personality prompt
- Pinecone namespace assignments
- Research source toggles
- Capability flags

### DB Override Precedence
**Critical convention**: When merging config defaults with DB values, DB overrides take **absolute precedence** — including `null`, `false`, and empty string values. This means if a DB field is explicitly set to `null`, it stays `null` and does NOT fall back to the config default.

## Personality Engine

**Location**: `server/engine/`

A modular system for assembling avatar personalities:

| File | Purpose |
|------|---------|
| `personaLoader.ts` | Loads JSON persona spec files from `server/engine/personas/` |
| `personaRegistry.ts` | Registry of all loaded personas |
| `promptAssembler.ts` | Builds complete system prompt from persona + avatar config + RAG context |
| `responseCritic.ts` | Validates response quality against persona boundaries |
| `avatarIntegration.ts` | Bridge between DB `avatar_profiles` and persona engine |
| `personaTypes.ts` | TypeScript types for persona specs |

### Persona Spec Structure (JSON)
Each persona file defines:
- **Identity**: Name, role, background
- **Boundaries**: What the avatar can/cannot discuss
- **Voice**: Tone, style, vocabulary
- **Behavior**: Response patterns, engagement style
- **Knowledge policies**: How to use RAG, memory, and research sources

### Prompt Assembly Flow
1. Load persona spec from JSON file
2. Load avatar profile from DB (merged with config defaults)
3. Fetch RAG context from Pinecone
4. Fetch user memories from Mem0
5. Assemble system prompt: persona + knowledge context + memory + content taxonomy guardrails
6. Send to Claude with conversation history

## Session Drivers

**File**: `client/src/hooks/sessionDrivers.ts`

Abstracts the streaming platform behind a `SessionDriver` interface:

```typescript
interface SessionDriver {
  start(config): Promise<void>
  stop(): Promise<void>
  speak(text: string): Promise<void>
  interrupt(): void
  // ... events, state
}
```

### LiveAvatarDriver (Primary)
- Uses `@heygen/liveavatar-web-sdk`
- Two modes:
  - **CUSTOM mode**: App controls LLM (Claude + RAG). Audio routed through LiveKit WebRTC.
  - **FULL mode**: HeyGen controls LLM. Avatar uses its own knowledge base (`heygen_knowledge_id`).
- Lip-sync via `repeatAudio()` API

### HeyGenStreamingDriver (Legacy)
- Uses `@heygen/streaming-avatar` SDK
- Older streaming protocol

### AudioOnlyDriver
- No video rendering
- ElevenLabs TTS audio playback only
- Uses `AudioOnlyDisplay` component with imperative ref for UI updates

## Chat Flow (CUSTOM mode)

1. User starts session → `LiveAvatarDriver.start()` → LiveKit room created
2. User speaks → Web Speech API / ElevenLabs STT transcribes
3. Transcription sent to server via WebSocket (`/ws/conversation`) or REST (`/api/avatar/response`)
4. Server pipeline:
   a. Parallel fetch: Pinecone RAG + Mem0 memory
   b. Persona engine assembles system prompt
   c. Claude generates response (streaming, sentence-buffered)
   d. ElevenLabs TTS converts each sentence to audio
   e. Audio sent back to client
5. Client feeds audio to LiveAvatar `repeatAudio()` for lip-sync
6. Mem0 extracts and stores new memories

## Barge-In System

When the user speaks while the avatar is speaking:
1. ElevenLabs STT detects partial transcript
2. 150ms debounced check: is audio element actually playing?
3. `performBargeIn()`:
   - Hard-stops audio (pause, reset currentTime, revoke blob URL)
   - Aborts in-flight fetch to server
   - Interrupts HeyGen driver
   - Resets speaking state
4. Server-side: `req.on('close')` sets `requestAborted` flag, checked before Claude and TTS calls
5. New turn begins immediately

## Content Taxonomy

**File**: `server/contentTaxonomy.ts`

Professional guardrails for the adult educational wellness platform:
- No explicit storytelling
- No illegal instructions
- No medical/legal advice
- No harm glamorization
- Taxonomy-driven content policy injected into every system prompt

## Mini-Games

**Files**: `client/src/components/AvatarMiniGames.tsx`, `server/routes/games.ts`

Interactive games users can play with avatars during chat:
- Trivia
- Word association
- Mood check-in
- Would you rather
- Story builder

Games use Claude to generate questions/responses in the avatar's personality.
