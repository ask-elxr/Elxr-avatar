# Overview

This project is a full-stack AI avatar chat platform integrating HeyGen's streaming avatar technology with Claude Sonnet 4 AI and real-time Google web search. It features a React frontend and a Node.js/Express backend, enabling intelligent conversations with a Mark Kohl-personality-driven avatar. The avatar utilizes a Pinecone knowledge base and current web information for informed responses, supporting multi-mentor configurations and personal knowledge base integration.

**Cost Control Features**: Comprehensive HeyGen credit tracking with pre-call balance checks, configurable thresholds, automatic circuit breaking, and per-user rate limiting to prevent unauthorized spending.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend
- **Framework**: React with TypeScript, using Vite.
- **UI/UX**: `shadcn/ui` on Radix UI with Tailwind CSS for responsive design.
- **State Management**: TanStack Query for server state, React hooks for local state.
- **Routing**: Wouter for lightweight client-side routing.
- **Optimization**: React lazy loading, tree-shaking, and static avatar photo loading for bandwidth savings.
- **Avatar Session Management**: Custom hooks for lifecycle and inactivity.

## Backend
- **Framework**: Express.js for RESTful APIs.
- **Database ORM**: Drizzle ORM for PostgreSQL.
- **Background Processing**: BullMQ and Redis for asynchronous document processing (chunking, embedding, Pinecone storage).
- **API Security**: Credential-based requests with CORS, per-user rate limiting (1 request/minute for HeyGen/avatar endpoints).
- **Reliability**: Circuit breakers (Opossum) for external APIs, Pino for structured logging, Prometheus for metrics.
- **Cost Control**: HeyGen credit tracking with balance checks, configurable thresholds, automatic blocking on credit exhaustion.

## Data Storage
- **Primary Database**: PostgreSQL (Neon Database service) for persistent data and session storage.
- **Vector Database**: Pinecone for conversation embeddings and knowledge bases (supports multiple namespaces per mentor/user).
- **ORM**: Drizzle ORM for type-safe operations.
- **Caching**: Intelligent normalized Pinecone query cache with TTL and LRU eviction.

## Authentication & Authorization
- **Authentication**: Session-based, server-side authentication stored in PostgreSQL.
- **User Management**: Username/password authentication with secure storage, supports anonymous users with temporary IDs.

## Core Features
- **AI Avatar**: HeyGen Streaming SDK for real-time video interaction.
- **AI Model**: Claude Sonnet 4 (`claude-sonnet-4-20250514`) for reasoning.
- **Knowledge Retrieval**: Pinecone knowledge base (ask-elxr) and integrated Google Web Search.
- **Personality Integration**: Mark Kohl personality (customizable per mentor) via system prompts.
- **Conversation Management**: Enhanced token limits, timeout handling, inactivity detection, pause/resume, current date awareness.
- **Multi-Assistant Architecture**: Per-mentor configurations with dedicated Pinecone namespaces and categories.
- **Personal Knowledge Bases**: Supports user-connected Notion/Obsidian knowledge sources with isolated Pinecone namespaces.
- **API Cost Tracking**: Tracks external API usage with admin dashboard.
- **Avatar Management System**: Database-driven configuration and CRUD operations for avatar profiles via admin panel.

# External Dependencies

## Core Services
- **HeyGen Streaming Avatar API**: Real-time AI avatar video streaming.
- **Neon Database**: Managed PostgreSQL hosting.
- **Pinecone Vector Database**: Vector storage for embeddings.
- **Claude Sonnet 4**: AI model.
- **Google Web Search**: Real-time web information retrieval.
- **Redis**: Used by BullMQ for background job queuing.
- **ElevenLabs**: Text-to-speech for audio-only mode.

## Frontend Libraries
- **React**: UI framework.
- **shadcn/ui & Radix UI**: Component libraries.
- **Tailwind CSS**: Styling.
- **TanStack React Query**: Server state management.
- **Wouter**: Client-side routing.

## Backend Dependencies
- **Express.js**: Web application framework.
- **Drizzle ORM**: PostgreSQL ORM.
- **BullMQ**: Job queue.
- **Pino**: Structured logging.
- **Opossum**: Circuit breaker implementation.

# Recent Changes

## November 16, 2025

### Avatar Photo Loading Screens & Error Handling
- **Replaced logo video with static avatar photos**: Each mentor now displays their own photo before conversation starts
  - Updated `LoadingPlaceholder` component to accept `avatarId` prop and show mentor-specific photos
  - Avatar photos mapped by ID: mark-kohl, thad, willie-gault, june, ann, shawn
  - Photos displayed in 3 states: initial loading, reconnect screen, and video mode idle (session active but HeyGen not started)
  - Significant bandwidth savings: static images vs. looping video
  - Removed `placeholderVideo` import from `avatar-chat.tsx`
  - Falls back to default photo if mentor-specific image not available

- **Fixed session limit error handling**: 429 errors now properly caught and displayed to user
  - Updated Start button onClick handler to be async with try/catch
  - Added toast notifications for session limit errors ("Cannot start session")  
  - Fixed `reconnect()` and `togglePause()` functions in useAvatarSession to properly await and catch errors
  - Prevents unhandled promise rejections in browser console
  - User-friendly error messages instead of console errors

### Avatar Switching Updates
- **Smart cooldown system**: Cooldown clears when ALL user sessions end, maintains during concurrent sessions
  - Reduced avatar switch cooldown from 30 seconds to 3 seconds
  - Updated `endSession()`, `cleanupInactiveSessions()`, and `canStartSession()` to check for remaining user sessions
  - Prevents abuse while allowing immediate switching after all sessions end

### Database & Admin Panel
- **All 6 real mentors**: Mark Kohl, Willie Gault, June, Ann, Shawn, Thad  
  - Each mentor fully editable in admin panel with HeyGen IDs, ElevenLabs voices, Pinecone namespaces
  - Cleared old test avatars (Marcus Johnson, Dr. Sarah Chen)

### URL Routing
- **Added `/avatar` route**: Enables mentor-specific URLs for iframe embeds
  - Route `/avatar?mentor=<mentor-id>` loads specific mentor on page load
  - Supports all 6 mentors for external platform integration

## November 17, 2025

### HeyGen Credit Tracking & Rate Limiting
- **Implemented comprehensive credit monitoring system**: Prevents unauthorized HeyGen spending
  - **Database schema**: New `heygen_credit_usage` table tracks all HeyGen API calls
    - Fields: userId, operation (token_generation, streaming_session), creditsUsed, successful, timestamp
  - **Credit service** (`server/heygenCreditService.ts`):
    - Pre-call balance checking with configurable thresholds
    - Default limit: 1000 credits (configurable via `HEYGEN_CREDIT_LIMIT`)
    - Warning threshold: 20 credits (configurable via `HEYGEN_WARNING_THRESHOLD`)
    - Critical threshold: 10 credits - blocks new requests (configurable via `HEYGEN_CRITICAL_THRESHOLD`)
    - Automatic credit logging for every API call with success/failure tracking
    - GET /api/heygen/credits endpoint for real-time usage monitoring
  - **Credit checking integrated into /api/heygen/token**:
    - Balance checked before every HeyGen API call
    - Returns 402 Payment Required if credits exhausted
    - Logs credit usage regardless of call success/failure
    - Warning logs when balance drops below threshold
  - **Per-user rate limiting**:
    - 1 request per user per minute on /api/heygen/token
    - 1 request per user per minute on /api/avatar/response
    - Rate limiting uses userId from authenticated session or request body (for temp_ IDs)
    - Returns 429 Too Many Requests if limit exceeded
  - **Storage layer** (`server/storage.ts`):
    - `logHeygenCredit()`: Records credit usage
    - `getHeygenCreditUsage()`: Retrieves usage by user/date
    - `getHeygenCreditBalance()`: Aggregates total, 24h, and 7d usage
  - **Circuit breaker integration**: Credit exhaustion triggers automatic blocking to prevent wasteful API calls

### UI Cleanup
- **Removed stream statistics overlay**: Deleted development-only stream stats display
  - Removed FPS, Resolution, Bitrate, and Audio level overlay
  - Removed `useStreamStats` hook import and usage
  - Cleaner UI without technical metrics cluttering the interface

### Video Mode Default & Instant Display
- **Changed default to video mode**: App now starts in video mode instead of audio-only
  - `audioOnly` state changed from `useState(true)` to `useState(false)`
- **Removed static placeholder screens in video mode**: Video element visible immediately without blocking overlays
  - Removed placeholder photo overlay when session active but HeyGen not started
  - Start button floats over video with transparent background (`pointer-events-none`) in video mode
  - Reconnect button floats over video with transparent background in video mode
  - Unobtrusive purple spinner shows during HeyGen connection (pointer-events-none)
- **Immediate avatar appearance in video mode**: HeyGen starts immediately when clicking "Start Chat"
  - Video element shows instantly with loading spinner
  - HeyGen stream connects and avatar appears (no lazy loading in video mode)
  - Audio mode retains lazy loading (HeyGen starts on first message to save credits)
  - Smart state management: Start button only reappears on true session end (not during initialization)
  
### Avatar Database Updates
- **Removed Shawn mentor**: Replaced with new mentor lineup
- **Added Katya**: New emotional coach and self-awareness guide
  - HeyGen Avatar ID: `Katya_Chair_Sitting_public`
  - Description: "Emotional coach and self-awareness guide"
  - Pinecone namespace: `katya`
- **Updated Willie Gault**: Correct HeyGen avatar ID `a9d3346d94594c5f9ca522f6d0469038`
- **Updated avatar IDs**: June (`June_HR_public`), Thad (`Thaddeus_Chair_Sitting_public`), Ann (`Ann_Therapist_public`)
- **All mentor photos configured**: Each mentor now has their own unique loading screen photo
  - Willie Gault, June, Ann photos added to LoadingPlaceholder component
  - No more shared placeholder photos between mentors

### Avatar Switching Bug Fix
- **Fixed session cleanup bug**: Avatar switching now works correctly without 429 errors
  - **Root cause**: Lingering sessions weren't being cleaned up when switching avatars
  - **Previous issues**:
    - `/api/heygen/token` was creating duplicate sessions
    - Old sessions remained active when starting new avatar
  - **Solutions implemented**:
    1. Removed duplicate `sessionManager.startSession()` call from `/api/heygen/token`
    2. Added `endAllUserSessions()` method to SessionManager to force cleanup
    3. Created `/api/session/end-all` endpoint to terminate all user sessions
    4. Updated `handleAvatarSwitch()` to call `/api/session/end-all` before starting new avatar
    5. Prevented Start button from reappearing during avatar switch by checking `switchingAvatar` state
  - **Result**: Clean avatar switches with guaranteed session cleanup, no more 429 errors

### Pinecone Cost Optimization
- **Consolidated to single Pinecone assistant**: Reduced from 2 assistants to 1 (ask-elxr only)
  - **Previous setup**: Mark Kohl used "knowledge-base-assistant", others used "ask-elxr"
  - **New setup**: All mentors now use "ask-elxr" assistant
  - **Files updated**:
    - `server/multiAssistantService.ts`: Mark Kohl now uses ask-elxr
    - `shared/avatarConfig.ts`: Updated system prompt references
    - `client/src/components/streaming-avatar.tsx`: UI now shows "3-Source Intelligence" (was 4-Source)
    - `server/mcpAssistant.ts`: Changed from knowledge-base-assistant to ask-elxr
  - **Result**: ~50% reduction in Pinecone costs by eliminating duplicate assistant

### Topic-Based Namespace Mapping
- **Implemented multi-namespace knowledge retrieval**: Each mentor now queries topic-specific namespaces in addition to their personal namespace
  - **17 topic namespaces mapped to avatars**: ADDICTION, MIND, BODY, SEXUALITY, TRANSITIONS, SPIRITUALITY, SCIENCE, PSYCHEDELICS, NUTRITION, LIFE, LONGEVITY, GRIEF, MIDLIFE, MOVEMENT, WORK, SLEEP, OTHER
  - **Avatar → Topic mappings** (`shared/avatarConfig.ts`):
    - Mark Kohl: default + PSYCHEDELICS, SPIRITUALITY, SCIENCE
    - Willie Gault: willie-gault + WORK, MOVEMENT
    - June: june + MIND, GRIEF, TRANSITIONS  
    - Ann: ann + BODY, NUTRITION, MOVEMENT, SLEEP
    - Shawn: shawn + WORK, LIFE, TRANSITIONS, MIDLIFE
    - Thad: thad + WORK, LIFE, LONGEVITY
  - **Parallel namespace queries** (`server/pineconeNamespaceService.ts`):
    - Changed from sequential to parallel queries using Promise.all()
    - Deduplicates and sorts namespaces before querying to avoid redundant API calls
    - Results combined and scored across all namespaces
  - **Cache normalization** (`server/cache.ts`):
    - Updated normalizePineconeKey to deduplicate and sort namespaces for canonical cache keys
    - Prevents cache misses from namespace ordering differences
    - Cache invalidation on server startup to clear old entries with different normalization
  - **Willie Gault Wikipedia integration**: Automatically syncs Willie Gault's Wikipedia page to his personal namespace on server startup
  - **Result**: Broader knowledge coverage per mentor with minimal performance impact through parallelization and caching