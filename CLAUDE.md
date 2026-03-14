# Elxrai — Multi-Avatar AI Chat Platform

AI chat platform with HeyGen video avatars, real-time voice conversations, RAG knowledge retrieval, and video course creation. Built for education, wellness coaching, and specialized information retrieval.

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui (Radix), wouter (routing), TanStack React Query
- **Backend**: Express.js, TypeScript, tsx (dev), esbuild (prod bundle)
- **Database**: PostgreSQL (Neon serverless) + Drizzle ORM
- **AI**: Claude (primary LLM), OpenAI (embeddings), Pinecone (vectors), Mem0 (memory), ElevenLabs (TTS/STT)
- **Video**: HeyGen (avatars, LiveAvatar, video generation), LiveKit (WebRTC)
- **Auth**: Replit OIDC + Memberstack + admin secret header
- **Queue**: BullMQ + Redis (Upstash)

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server (tsx, port 5000) |
| `npm run build` | Build for production (vite + esbuild) |
| `npm run start` | Run production build |
| `npm run db:push` | Push schema to database (drizzle-kit) |
| `npm run check` | TypeScript type checking |

## Project Structure

```
client/           # React frontend (Vite)
  src/
    pages/        # Route pages (Dashboard, admin, courses, etc.)
    components/   # Feature components + ui/ (shadcn)
    hooks/        # Custom hooks (useAuth, useAvatarSession, useConversationWs, etc.)
    lib/          # Utilities (queryClient, cn)
    services/     # Client-side service classes
    workers/      # Web Workers (iOS Safari session workaround)
server/           # Express backend
  routes.ts       # Main API routes (~400KB monolith)
  routes/         # Feature route modules (avatars, courses, mood, subscription, ingest, personas, games)
  services/       # Business logic (rag, subscription, videoGeneration, etc.)
  engine/         # Personality engine (persona specs, prompt assembler, response critic)
  ingest/         # Knowledge ingestion pipelines (chunker, embedder, podcast, course, learning artifacts)
  db.ts           # Drizzle + Neon connection
  storage.ts      # Data access layer (IStorage interface)
shared/           # Shared between client & server
  schema.ts       # Drizzle database schema (all tables)
  pineconeCategories.ts  # Knowledge namespace taxonomy
config/           # Avatar configuration (avatars.config.ts)
migrations/       # SQL migration files
scripts/          # Admin/utility scripts
```

## Path Aliases

| Alias | Maps to |
|-------|---------|
| `@/` | `client/src/` |
| `@shared/` | `shared/` |
| `@assets/` | `attached_assets/` |

## Key Conventions

- **Embedding model**: Always `text-embedding-3-small` (1536 dims) — for both ingestion AND retrieval. Never `ada-002`.
- **Primary LLM**: Claude Opus 4.6 for conversations (quality). Haiku 3.5 for ingestion (cost).
- **Avatar merging**: DB overrides take absolute precedence (including null, false, empty string).
- **Content anonymity**: Course/educational content MUST go through Learning Artifact pipeline. Only personal knowledge namespaces (mark-kohl, willie-gault) allow verbatim chunks.
- **React Query**: `staleTime: Infinity` — data never auto-refreshes. Invalidate manually with `queryClient.invalidateQueries()`.
- **Styling**: Tailwind + CSS variables for theming. Dark mode only. `cn()` utility for class merging.
- **Routing**: wouter (not React Router). All pages lazy-loaded.

## Environment Variables (Required)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Claude AI |
| `OPENAI_API_KEY` | Embeddings (text-embedding-3-small) |
| `PINECONE_API_KEY` | Vector database |
| `HEYGEN_API_KEY` | Video avatars |
| `ELEVENLABS_API_KEY` | TTS/STT |
| `DEEPGRAM_API_KEY` | Speech-to-text |
| `MEM0_API_KEY` | Persistent memory |
| `MEMBERSTACK_SECRET_KEY` | Subscription billing |
| `SESSION_SECRET` | Express session signing |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `LIVEKIT_URL` | WebRTC streaming |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Drive OAuth |
| `RESEND_API_KEY` | Email |
| `FAL_KEY` | fal.ai (AI image/video generation for B-roll) |
| `ADMIN_SECRET` | Admin panel auth (supports comma-separated) |
| `PORT` | Server port (default 5000) |

## Architecture Quick Reference

- **Server entry**: `server/index.ts` → Express on port 5000, host 0.0.0.0
- **Client entry**: `client/src/main.tsx` → `App.tsx` (providers + router)
- **DB connection**: `server/db.ts` → Neon serverless + Drizzle
- **Schema**: `shared/schema.ts` (20+ tables)
- **Auth middleware**: `server/replitAuth.ts` → `isAuthenticated`, `requireAdmin`, `requireMemberstackOrAdmin`
- **4 WebSocket servers**: `/ws/streaming-chat`, `/ws/webrtc-streaming`, `/ws/elevenlabs-stt`, `/ws/conversation`
- **Session drivers**: `client/src/hooks/sessionDrivers.ts` → LiveAvatarDriver, AudioOnlyDriver, HeyGenStreamingDriver

## Important Files

| File | Why it matters |
|------|---------------|
| `server/routes.ts` | Main API routes (~400KB). Most endpoints live here. |
| `shared/schema.ts` | All database table definitions |
| `config/avatars.config.ts` | Avatar profile defaults (seeds DB on startup) |
| `server/claudeService.ts` | Claude AI integration |
| `server/conversationWsService.ts` | Unified real-time conversation WebSocket |
| `server/pinecone.ts` | Vector DB operations |
| `server/storage.ts` | Data access layer |
| `client/src/components/avatar-chat.tsx` | Core chat UI component |
| `client/src/hooks/useAvatarSession.ts` | Avatar session lifecycle hook |
| `client/src/hooks/sessionDrivers.ts` | Video/audio driver abstraction |
| `client/src/lib/queryClient.ts` | API client + React Query config |

## Deployment

```bash
# Build
npm run build    # → dist/public/ (client) + dist/index.js (server)

# Run
NODE_ENV=production node dist/index.js

# DB
npm run db:push  # Push schema changes
```

Port 5000 internally, served on 0.0.0.0. Currently deployed on Replit (GCE target). See `docs/deployment.md` for local and alternative hosting setup.

## Detailed Documentation

See the `docs/` folder for in-depth reference:
- `docs/architecture.md` — System design and component interactions
- `docs/api-reference.md` — Complete endpoint list
- `docs/database-schema.md` — All tables and relationships
- `docs/external-services.md` — Third-party integrations
- `docs/deployment.md` — Build, deploy, and environment setup
- `docs/frontend-guide.md` — Routes, components, hooks, styling
- `docs/avatar-system.md` — Avatar profiles, HeyGen, personality engine
- `docs/ingestion-pipelines.md` — Knowledge ingestion workflows
- `docs/troubleshooting.md` — Common issues and debugging
