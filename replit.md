# Multi-Avatar AI Chat System

## Overview
A sophisticated AI chat platform featuring HeyGen video avatars with real-time voice conversations, knowledge retrieval from multiple sources (Pinecone, PubMed, Wikipedia, Notion), persistent memory (Mem0), and comprehensive admin management.

**Current Status**: Successfully restructured codebase with modular architecture. Implemented Pipecat integration for multi-avatar conversational AI with automatic video-to-audio switching.

## Recent Changes (November 2024)

### Code Restructuring
- **Created new directory structure**: `config/`, `server/services/`, `server/routes/`
- **Moved avatar configuration**: `shared/avatarConfig.ts` → `config/avatars.config.ts`
- **Created service facades**:
  - `server/services/avatars.ts` - Avatar management with proper DB/default merging
  - `server/services/rag.ts` - Claude + Pinecone + search integration
  - `server/services/memory.ts` - Mem0 wrapper
  - `server/services/auth.ts` - Replit authentication wrapper
- **Extracted routes**:
  - `server/routes/avatars.ts` - Avatar CRUD and configuration endpoints
  - `server/routes/pipecat.ts` - Pipecat session management

### Pipecat Integration (NEW)
- **Multi-avatar support**: Mark Kohl, Willie Gault, Fitness Coach (expandable)
- **Per-avatar features**:
  - Dedicated Pinecone knowledge base namespaces
  - Custom voice profiles (Cartesia TTS)
  - Configurable video duration limits
  - Unique personalities and expertise areas
- **Automatic video-to-audio switching**: After 5 minutes (configurable), switches to audio-only mode to save HeyGen credits while preserving voice quality
- **Real-time voice**: Deepgram STT + Cartesia TTS + Google Gemini LLM
- **Python service**: `server/pipecat_bot.py` handles WebRTC transport and avatar orchestration

## Architecture

### Frontend (React + TypeScript)
- **Location**: `client/src/`
- **Key Features**:
  - Avatar selection interface
  - HeyGen video streaming
  - Voice recognition (Web Speech API)
  - Real-time chat with memory
  - Document upload & processing
  - Admin dashboard

### Backend (Express + TypeScript + Python)
- **Location**: `server/`
- **Key Components**:
  - **Routes**: Modular route handlers in `server/routes/`
  - **Services**: Business logic facades in `server/services/`
  - **Config**: Centralized configuration in `config/`
  - **Python**: Pipecat bot service for conversational AI

### Database (PostgreSQL + Drizzle ORM)
- **Schema**: `shared/schema.ts`
- **Tables**:
  - `avatar_profiles` - Avatar configurations with DB overrides
  - `conversations` - Chat history
  - `documents` - Uploaded documents metadata
  - `knowledge_base_sources` - User knowledge sources (Notion, etc.)
  - `api_calls` - Usage tracking

## Avatar System

### Avatar Service (server/services/avatars.ts)
**Field-level merging**: DB values override defaults using `!== undefined` checks
- Handles deactivation: DB `isActive: false` suppresses default avatars
- Handles partial overrides: Only undefined DB fields fallback to defaults
- Handles blank values: DB null/empty string/false overrides defaults

**Key Functions**:
- `getAvatarById(id)` - Merges DB override with default base
- `getActiveAvatars()` - Returns all active avatars (DB + defaults, filtered by isActive)
- `getAllAvatars()` - Returns all avatars including inactive (for admin)

### Pipecat Multi-Avatar Configuration
**Location**: `server/pipecat_bot.py`

**Current Avatars**:
1. **Mark Kohl** (`mark-kohl`)
   - Expertise: Mycology, filmmaking, kundalini
   - Knowledge: `mark-kohl`, `general-knowledge`
   - Voice: Cartesia `00967b2f-88a6-4a31-8153-110a92134b9f`
   - Video limit: 5 minutes

2. **Willie Gault** (`willie-gault`)
   - Expertise: Olympic athletics, NFL, business
   - Knowledge: `willie-gault`, `sports-knowledge`
   - Voice: Cartesia `a0e99841-438c-4a64-b679-ae501e7d6091`
   - Video limit: 5 minutes

3. **Fitness Coach** (`fitness-coach`)
   - Expertise: Health, fitness, wellness
   - Knowledge: `fitness-knowledge`, `health-tips`
   - Voice: Cartesia `b7d50908-b17c-442d-ad8d-810c63997ed9`
   - Video limit: 3 minutes

## API Endpoints

### Avatar Management
- `GET /api/avatars` - List active avatars
- `GET /api/avatar/config/:id` - Get avatar configuration
- `GET /api/admin/avatars` - List all avatars (admin, requires auth)
- `POST /api/admin/avatars` - Create new avatar (admin, requires auth)
- `PUT /api/admin/avatars/:id` - Update avatar (admin, requires auth)
- `DELETE /api/admin/avatars/:id` - Soft delete avatar (admin, requires auth)

### Pipecat Sessions
- `GET /api/pipecat/avatars` - List available Pipecat avatars
- `GET /api/pipecat/avatars/:id` - Get specific avatar config
- `POST /api/pipecat/session/start` - Start Pipecat session with avatar
- `GET /api/pipecat/session/status/:sessionId` - Get session status
- `PUT /api/pipecat/avatars/:id` - Update avatar config (admin)

### Chat & Memory
- `POST /api/avatar/response` - Get AI response (Claude + RAG + Memory + PubMed)
- `GET /api/memory/users/:userId` - Get user memories
- `POST /api/memory/users/:userId` - Add memory
- `DELETE /api/memory/users/:userId/memories/:memoryId` - Delete memory

## Environment Variables

### Required
- `HEYGEN_API_KEY` - HeyGen video avatar service
- `ANTHROPIC_API_KEY` - Claude AI (main LLM)
- `GOOGLE_API_KEY` - Google Gemini (Pipecat LLM)
- `DEEPGRAM_API_KEY` - Speech-to-text (Pipecat)
- `CARTESIA_API_KEY` - Text-to-speech (Pipecat)

### Optional
- `PINECONE_API_KEY` - Vector database for knowledge retrieval
- `OPENAI_API_KEY` - OpenAI embeddings for Pinecone
- `MEM0_API_KEY` - Persistent memory service
- `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_ENGINE_ID` - Web search
- `ELEVENLABS_API_KEY` - Alternative TTS (currently disabled)
- `REDIS_URL` - Background job queue (Upstash)

### Database (Auto-configured)
- `DATABASE_URL` - PostgreSQL connection string
- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`

## User Preferences
- **Architecture**: Modular code organization with separate config/, services/, routes/
- **Avatar Merging**: DB overrides take absolute precedence (including null, false, empty string)
- **Service Facades**: Thin wrappers that re-export existing functionality
- **Route Extraction**: Incremental migration from monolithic routes.ts to feature-focused modules

## Project Structure
```
├── config/
│   └── avatars.config.ts          # Avatar configurations (moved from shared/)
├── server/
│   ├── routes/
│   │   ├── avatars.ts             # Avatar CRUD endpoints
│   │   └── pipecat.ts             # Pipecat session endpoints
│   ├── services/
│   │   ├── avatars.ts             # Avatar business logic
│   │   ├── rag.ts                 # RAG service facade
│   │   ├── memory.ts              # Memory service facade
│   │   └── auth.ts                # Auth service facade
│   ├── pipecat_bot.py             # Pipecat multi-avatar bot (Python)
│   ├── routes.ts                  # Legacy routes (being extracted)
│   ├── storage.ts                 # Database interface
│   └── index.ts                   # Server entry point
├── client/src/
│   ├── pages/                     # React pages
│   ├── components/                # React components
│   └── App.tsx                    # Main React app
└── shared/
    └── schema.ts                  # Database schema & types
```

## Development
- **Start**: `npm run dev` (auto-configured workflow)
- **Database**: Auto-seeded with default avatars on first run
- **Port**: 5000 (both API and frontend via Vite)

## Next Steps
- [ ] Integrate Pipecat sessions with frontend UI
- [ ] Add per-avatar Pinecone namespace switching
- [ ] Implement session tracking with Redis
- [ ] Add more avatar personalities
- [ ] Complete route extraction (chat, memory, documents, knowledge)
- [ ] Add comprehensive testing
