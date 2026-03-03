# System Architecture

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client (React/Vite)                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ Dashboard │ │   Chat   │ │  Admin   │ │  Embed (Webflow) │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┬─────────┘   │
│       └─────────────┴────────────┴────────────────┘             │
│              │ REST (fetch) │ WebSocket (4 channels) │           │
└──────────────┼──────────────┼────────────────────────┼───────────┘
               │              │                        │
┌──────────────┼──────────────┼────────────────────────┼───────────┐
│              ▼              ▼                        ▼           │
│                    Server (Express.js)                            │
│  ┌───────────┐ ┌────────────┐ ┌──────────────┐ ┌────────────┐  │
│  │  Routes   │ │  Services  │ │   Ingestion   │ │  Persona   │  │
│  │ (REST API)│ │ (Business) │ │  Pipelines    │ │  Engine    │  │
│  └─────┬─────┘ └─────┬──────┘ └──────┬───────┘ └─────┬──────┘  │
│        └──────────────┴───────────────┴───────────────┘         │
│                              │                                   │
└──────────────────────────────┼───────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
    ┌─────▼─────┐      ┌──────▼──────┐     ┌──────▼──────┐
    │ PostgreSQL │      │  Pinecone   │     │  External   │
    │   (Neon)   │      │  (Vectors)  │     │  Services   │
    └────────────┘      └─────────────┘     └─────────────┘
                                            HeyGen, Claude,
                                            ElevenLabs, Mem0,
                                            LiveKit, OpenAI...
```

## Frontend Architecture

### Technology Stack
- **Framework**: React 18 with TypeScript
- **Bundler**: Vite 5 with `@vitejs/plugin-react`
- **Routing**: wouter v3.3.5 (lightweight, ~2KB)
- **Data fetching**: TanStack React Query v5 (`staleTime: Infinity`)
- **UI components**: shadcn/ui (new-york style) built on Radix UI primitives
- **Styling**: Tailwind CSS v3.4 with CSS custom properties, dark mode only
- **Icons**: lucide-react
- **Charts**: recharts
- **Animations**: framer-motion
- **Forms**: react-hook-form + zod

### Entry Points
- `client/index.html` — HTML shell with PWA meta tags, font preloads
- `client/src/main.tsx` — React root mount
- `client/src/App.tsx` — Provider tree + router

### Provider Hierarchy
```
QueryClientProvider (TanStack Query)
  └─ TooltipProvider (Radix)
       ├─ Toaster (shadcn toast)
       ├─ AuthSyncListener (cross-tab logout sync, 30s heartbeat)
       ├─ GlobalVideoNotifications (polls for completed videos)
       └─ Router (wouter)
```

### Dual Mode Architecture
The app runs in two modes:
1. **Standalone** — Full-page app at `/*` routes
2. **Embed** — Content-only at `/embed/*` routes, designed for Webflow iframe embedding. Receives identity via `?member_id=` URL params. Same components with `isEmbed={true}` prop.

### State Management
- **No global store** — No Redux, Zustand, or MobX
- **Remote state**: React Query with aggressive caching (`staleTime: Infinity`)
- **Local state**: `useState` in components/hooks
- **Persistent state**: `localStorage` for user preferences, auth tokens, notification tracking

### Session Driver Abstraction
`client/src/hooks/sessionDrivers.ts` defines a `SessionDriver` interface with three implementations:
- **LiveAvatarDriver** — HeyGen LiveAvatar SDK + optional direct LiveKit WebRTC
- **HeyGenStreamingDriver** — Legacy HeyGen Streaming Avatar SDK
- **AudioOnlyDriver** — Audio-only mode (no video)

## Backend Architecture

### Technology Stack
- **Framework**: Express.js v4
- **Runtime**: Node.js 20 (tsx in dev, esbuild bundle in prod)
- **ORM**: Drizzle ORM with Neon serverless driver
- **Session**: express-session + connect-pg-simple (PostgreSQL)
- **Auth**: Passport.js (Replit OIDC strategy)
- **Logging**: Pino (structured JSON)
- **Metrics**: prom-client (Prometheus)
- **Resilience**: opossum (circuit breaker)

### Middleware Stack (order matters)
1. CORS (allows all origins for Webflow embedding)
2. `express.json({ limit: '10mb' })`
3. `express.urlencoded({ extended: false, limit: '10mb' })`
4. Request logger (API routes only)
5. Static file serving (`/attached_assets`, `/demo`)
6. Session middleware (PostgreSQL store)
7. Passport (Replit OIDC)
8. Timeout middleware (10s default, skipped for uploads)
9. Performance tracking middleware
10. Global error handler
11. Vite dev middleware (dev only)

### Route Organization
| Mount | File | Purpose |
|-------|------|---------|
| `/` | `server/routes.ts` | Main routes (~400KB monolith) |
| `/api` | `server/routes/avatars.ts` | Avatar CRUD |
| `/api/courses` | `server/routes/courses.ts` | Course + lesson management |
| `/api/mood` | `server/routes/mood.ts` | Mood tracking |
| `/api/subscription` | `server/routes/subscription.ts` | Plans and billing |
| `/api/admin` | `server/routes/ingest.ts` | Knowledge ingestion |
| `/api/admin` | `server/routes/personas.ts` | Persona management |
| `/api/games` | `server/routes/games.ts` | Avatar mini-games |

### Startup Sequence
On server start (`server/index.ts`):
1. Register all route modules
2. Seed default avatars from `config/avatars.config.ts`
3. Initialize subscription plans
4. Recover stuck video-generation jobs
5. Start chat video background checker
6. Invalidate Pinecone latency cache
7. Auto-sync Willie Gault Wikipedia page

## Database

- **Provider**: Neon serverless PostgreSQL
- **ORM**: Drizzle ORM (`drizzle-orm/neon-serverless`)
- **Connection**: WebSocket transport via `ws` package
- **Schema**: `shared/schema.ts` (~20 tables)
- **Migrations**: `migrations/` folder, managed by drizzle-kit
- **Data access**: `server/storage.ts` (`IStorage` interface → `DatabaseStorage`)

See `docs/database-schema.md` for full table definitions.

## WebSocket Services

Four WebSocket servers run on the same HTTP server (noServer mode, routed by URL path on `upgrade`):

| Path | Service | Purpose |
|------|---------|---------|
| `/ws/streaming-chat` | `streamingService.ts` | Streaming text + audio delta responses |
| `/ws/webrtc-streaming` | `webrtcStreamingService.ts` | WebRTC/LiveKit video streaming |
| `/ws/elevenlabs-stt` | `elevenlabsSttService.ts` | Real-time speech-to-text (mobile) |
| `/ws/conversation` | `conversationWsService.ts` | **Unified conversation pipe** (primary) |

### Unified Conversation WebSocket (`/ws/conversation`)
The main real-time channel. Implements a server-side state machine:

```
IDLE → LISTENING → THINKING → SPEAKING → IDLE
```

**Pipeline**: Mic PCM → ElevenLabs STT → Claude streaming (sentence buffering) → ElevenLabs streaming TTS → binary audio chunks to client

**Binary protocol**: `[TTS0 magic 4B][turnId uint32 LE][PCM 24kHz 16-bit audio]`

**Barge-in**: When user speaks while avatar is speaking, turnId increments, Claude+TTS AbortControllers fire, sentence queue clears, STOP_AUDIO sent to client.

**Idle behavior**: Nudge at 12s, second nudge at 25s, soft-end at 45s.

## AI Pipeline

### Chat Flow
1. User sends message (text or voice transcription)
2. **Parallel fetch**: Pinecone RAG query + Mem0 memory search
3. **Persona engine** assembles system prompt from avatar's persona spec
4. **Claude** generates response with RAG context + memory + conversation history
5. **ElevenLabs TTS** converts response to audio (streamed per sentence)
6. **HeyGen LiveAvatar** lip-syncs to audio (video mode) or audio plays directly (audio mode)
7. **Mem0** extracts and stores new memories from the conversation

### Models Used
| Purpose | Model |
|---------|-------|
| Conversations | Claude Opus 4.6 |
| Ingestion/extraction | Claude Haiku 3.5 |
| Embeddings | OpenAI text-embedding-3-small (1536 dims) |

### Personality Engine (`server/engine/`)
- `personaLoader.ts` — Loads JSON persona spec files from `server/engine/personas/`
- `personaRegistry.ts` — Registry of all loaded personas
- `promptAssembler.ts` — Builds system prompt from persona + avatar config + context
- `responseCritic.ts` — Validates response quality
- `avatarIntegration.ts` — Bridge between DB avatar_profiles and persona engine

## Authentication

Three concurrent auth mechanisms:

| Method | Header/Mechanism | Use Case |
|--------|-------------------|----------|
| Replit OIDC | Session cookie | Admin/dev users on Replit |
| Memberstack | `X-Member-Id` header | Webflow embedded users |
| Admin secret | `X-Admin-Secret` header | Admin panel access |
| Anonymous | Auto-generated `webflow_*` ID | Unauthenticated visitors |

### Auth Middleware Layers
- `isAuthenticated` — Most routes. Accepts any auth method, falls back to anonymous.
- `requireAdmin` — Admin routes. Checks admin secret or DB role.
- `requireMemberstackOrAdmin` — AI-powered endpoints. Blocks anonymous users.

### Dev Mode Bypass
When `NODE_ENV=development` on localhost, a mock user is injected without OIDC redirect.
