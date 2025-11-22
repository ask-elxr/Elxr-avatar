# Multi-Avatar AI Chat System

## Overview
A sophisticated AI chat platform featuring HeyGen video avatars with real-time voice conversations, knowledge retrieval from multiple sources (Pinecone, PubMed, Wikipedia, Notion), persistent memory (Mem0), and comprehensive admin management.

**Current Status**: Successfully restructured codebase with modular architecture. Focused on HeyGen video avatar system with Claude AI and RAG integration.

## Recent Changes (November 2024)

### Latest Updates (November 22, 2024)
- **✅ Fixed HeyGen TaskType**: Changed from `TaskType.TALK` to `TaskType.REPEAT` - TALK mode was using HeyGen's GPT-4o mini AI instead of speaking Claude's exact text
- **✅ Conversation Memory Implemented**: 
  - All conversations now saved to database (conversations table)
  - Avatar remembers conversation history across sessions (last 20 messages)
  - History passed to Claude for context-aware responses
  - Works for both authenticated users and anonymous users (temp_ IDs)
  - Error handling ensures database failures don't crash responses
- **✅ Fixed Avatar IDs**: All avatars now use their correct HeyGen avatar IDs
  - Willie Gault: `a9d3346d94594c5f9ca522f6d0469038`
  - June: `Katya_Chair_Sitting_public`
  - Ann: `Ann_Therapist_public`
  - Thad: `b115a2af9a9b41f3b69d589d6f26ecef`
  - Mark Kohl: `e16db57e57824a0e90b661ad528d3994`
  - Shawn: `a9d3346d94594c5f9ca522f6d0469038`
- **✅ Per-Avatar PubMed Toggle**: 
  - Added `usePubMed` boolean field to avatar configuration
  - Avatars can now have PubMed always enabled for their specialty
  - Mark Kohl: `usePubMed: true` (health/psychedelics/science research)
  - Ann: `usePubMed: true` (body wellness/nutrition research)
  - Other avatars: `usePubMed: false` (PubMed triggered by keywords only)
  - PubMed triggers if: explicit command OR research keywords OR avatar has `usePubMed: true`

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

### HeyGen Video System
- **Multi-avatar support**: Mark Kohl, Willie Gault, June, Ann, Shawn, Thad
- **Per-avatar features**:
  - Dedicated Pinecone knowledge base namespaces
  - Custom HeyGen avatar IDs (now all correctly configured)
  - Configurable session time limits
  - Unique personalities and expertise areas
  - **Per-avatar PubMed toggle**: Health/science avatars can have PubMed always enabled
- **Real-time video conversations**: HeyGen renders video/audio, Claude provides intelligence
- **AI Integration**: Claude Sonnet 4.5 + RAG (Pinecone, PubMed, Wikipedia) + persistent conversation memory

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
  - `conversations` - **NEW**: Persistent chat history (user & assistant messages with avatarId, role)
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

### Default Avatar Configuration
**Location**: `config/avatars.config.ts`

**Current Avatars**:
1. **Mark Kohl** (`mark-kohl`)
   - Expertise: Mycology, psychedelics, kundalini
   - PubMed: **Always enabled** (health/science research)
   - HeyGen Avatar: `e16db57e57824a0e90b661ad528d3994`

2. **Willie Gault** (`willie-gault`)
   - Expertise: Olympic athletics, NFL, business
   - PubMed: Keyword-triggered only
   - HeyGen Avatar: `a9d3346d94594c5f9ca522f6d0469038`

3. **June** (`june`)
   - Expertise: Mental health, mindfulness
   - PubMed: Keyword-triggered only
   - HeyGen Avatar: `Katya_Chair_Sitting_public`

4. **Ann** (`ann`)
   - Expertise: Body wellness, nutrition
   - PubMed: **Always enabled** (health/nutrition research)
   - HeyGen Avatar: `Ann_Therapist_public`

5. **Shawn** (`shawn`)
   - Expertise: Leadership, performance
   - PubMed: Keyword-triggered only
   - HeyGen Avatar: `a9d3346d94594c5f9ca522f6d0469038`

6. **Thad** (`thad`)
   - Expertise: Financial wellness
   - PubMed: Keyword-triggered only
   - HeyGen Avatar: `b115a2af9a9b41f3b69d589d6f26ecef`

## API Endpoints

### Avatar Management
- `GET /api/avatars` - List active avatars
- `GET /api/avatar/config/:id` - Get avatar configuration
- `GET /api/admin/avatars` - List all avatars (admin, requires auth)
- `POST /api/admin/avatars` - Create new avatar (admin, requires auth)
- `PUT /api/admin/avatars/:id` - Update avatar (admin, requires auth)
- `DELETE /api/admin/avatars/:id` - Soft delete avatar (admin, requires auth)

### HeyGen Sessions
- `POST /api/heygen/token` - Create HeyGen streaming token
- `POST /api/session/start` - Start HeyGen session
- `POST /api/session/end` - End HeyGen session
- `POST /api/session/end-all` - End all user sessions

### Chat & Memory
- `POST /api/avatar/response` - Get AI response (Claude + RAG + Memory + PubMed)
- `GET /api/memory/users/:userId` - Get user memories
- `POST /api/memory/users/:userId` - Add memory
- `DELETE /api/memory/users/:userId/memories/:memoryId` - Delete memory

## Environment Variables

### Required
- `HEYGEN_API_KEY` - HeyGen video avatar service
- `ANTHROPIC_API_KEY` - Claude AI (main LLM)

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
- [ ] Optimize HeyGen session management
- [ ] Add per-avatar Pinecone namespace switching
- [ ] Implement session tracking with Redis
- [ ] Add more avatar personalities
- [ ] Complete route extraction (chat, memory, documents, knowledge)
- [ ] Add comprehensive testing
- [ ] Implement credit usage monitoring and alerts
