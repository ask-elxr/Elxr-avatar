# Overview

This project is a full-stack AI avatar chat platform that integrates HeyGen's streaming avatar technology with Claude Sonnet 4 AI and real-time Google web search. The application features a React frontend and a Node.js/Express backend, enabling users to engage in intelligent conversations with a Mark Kohl-personality-driven avatar. The avatar leverages a comprehensive Pinecone knowledge base and current web information to provide rich and informed responses.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript.
- **Build System**: Vite for fast development and optimized production builds.
- **UI/UX**: `shadcn/ui` component library built on Radix UI primitives, styled with Tailwind CSS for consistent, accessible, and responsive design.
- **State Management**: TanStack Query for server state and React hooks for local state.
- **Routing**: Wouter for lightweight client-side routing.
- **Loading UI**: Pure CSS loading animation with ELXR purple gradient branding, replacing heavier video assets.
- **Optimization**: React lazy loading for page components (code-splitting), tree-shaking for icons.
- **Avatar Session Management**: `useAvatarSession` and `useInactivityTimer` hooks for lifecycle and cleanup.

## Backend Architecture
- **Framework**: Express.js for a RESTful API server.
- **Database ORM**: Drizzle ORM for PostgreSQL.
- **Configuration**: Environment-based configuration for development and production.
- **Background Processing**: BullMQ and Redis queue for asynchronous document processing (chunking, embedding, Pinecone storage) with retry mechanisms and job status tracking.
- **API Security**: Credential-based requests with CORS handling.
- **Reliability & Observability**:
    - Circuit breakers (Opossum) for external APIs (Claude, Pinecone, OpenAI, HeyGen) with configured timeouts and automatic failure detection.
    - Structured logging (Pino) with contextual information.
    - Prometheus metrics for API calls, circuit breaker states, HTTP traffic, and cache performance.

## Data Storage
- **Primary Database**: PostgreSQL (Neon Database service) for persistent data.
- **Vector Database**: Pinecone for storing conversation embeddings (1536 dimensions).
- **ORM**: Drizzle ORM for type-safe operations.
- **Session Storage**: PostgreSQL-based session storage using `connect-pg-simple`.
- **Schema**: User management with UUIDs, conversations table with embedding support.
- **Pinecone Query Caching**: Intelligent normalized query cache with TTL, automatic invalidation, and LRU eviction for faster responses.

## Authentication & Authorization
- **Authentication**: Session-based, server-side authentication stored in PostgreSQL.
- **User Management**: Username/password authentication with secure storage.

## Core Features
- **AI Avatar**: HeyGen Streaming SDK integration for real-time avatar interaction.
- **AI Model**: Claude Sonnet 4 (`claude-sonnet-4-20250514`) for advanced AI reasoning.
- **Knowledge Retrieval**: Dual Pinecone knowledge base access (`knowledge-base-assistant` and `ask-elxr`) in parallel for comprehensive responses.
- **Web Search**: Integrated Google Web Search for real-time information access.
- **Personality Integration**: Mark Kohl personality applied via custom system prompts.
- **Conversation Management**:
    - Enhanced token limits and prompting for deeper responses.
    - Improved timeout handling, including mid-answer cutoff prevention and polite prompts before session termination.
    - Inactivity detection with personalized sign-offs.
    - Pause/Resume functionality that fully stops the avatar stream to save credits.
    - Removal of action descriptions and promises for external resources from avatar responses.
    - Current date awareness in avatar responses.

# External Dependencies

## Core Services
- **HeyGen Streaming Avatar API**: Real-time AI avatar video streaming.
- **Neon Database**: Managed PostgreSQL hosting.
- **Pinecone Vector Database**: Vector storage for embeddings and AI context memory.
- **Claude Sonnet 4**: AI model for natural language processing and generation.
- **Google Web Search**: Real-time web information retrieval.
- **Redis**: Used by BullMQ for background job queuing.

## Frontend Libraries
- **React**: UI framework.
- **shadcn/ui & Radix UI**: Component libraries.
- **Tailwind CSS**: Styling framework.
- **TanStack React Query**: Server state management.
- **Wouter**: Client-side routing.
- **React Hook Form & Zod**: Form handling and validation.
- **Lucide React**: Icon library.

## Backend Dependencies
- **Express.js**: Web application framework.
- **Drizzle ORM**: PostgreSQL ORM.
- **express-session & connect-pg-simple**: Session management.
- **BullMQ**: Job queue for background processing.
- **Pino**: Structured logging.
- **Opossum**: Circuit breaker implementation.

# Integration Notes

## Personal Knowledge Base Integration
- **Decision**: User dismissed Replit's Notion connector, will implement custom integration using API credentials stored as secrets
- **Approach**: Support multiple knowledge base types (Notion, Obsidian) with flexible sync mechanism
- **Storage**: Each user can connect their own knowledge bases with isolated Pinecone namespaces
- **API Keys**: NOTION_API_KEY (optional) - for Notion integration via REST API

# Recent Changes

## November 13, 2025

### Anonymous User Support with Secure userId Handling
- Updated avatar response endpoint to support both authenticated and anonymous users
- Authenticated users: userId derived from session (req.user.claims.sub)
- Anonymous users: Can send temp_ prefixed userId for session tracking (e.g., "temp_anonymous_123")
- Security: Non-temp_ prefixed userIds from request body are rejected to prevent impersonation
- Personal knowledge sources only loaded for authenticated users, not temp_ sessions

### CORS Middleware for Webflow Embedding
- Added CORS middleware to server/index.ts for cross-origin support
- Configured headers: Access-Control-Allow-Origin (*), Access-Control-Allow-Methods, Access-Control-Allow-Headers
- Added X-Frame-Options (ALLOWALL) and Content-Security-Policy (frame-ancestors *;)
- Handles OPTIONS preflight requests with 200 status
- Enables iframe embedding in Webflow and other platforms

### Personal Knowledge Base Integration
- Implemented support for connecting personal knowledge sources (Notion, Obsidian)
- Created `knowledge_base_sources` table with user-scoped access control
- Each source gets isolated Pinecone namespace for data separation
- Notion integration service syncs pages with full content extraction
- API endpoints for CRUD operations on knowledge sources
- Sync endpoint triggers Notion→Pinecone synchronization
- Avatar responses automatically query user's active personal knowledge sources
- UI component in admin panel for managing connections
- Security: userId derived from authenticated session, not request body
- Status tracking: active, syncing, error with detailed error messages

### API Cost Tracking & Premium Admin Styling
- Created `api_calls` table to track all external API usage (Claude, ElevenLabs, HeyGen, Pinecone, OpenAI)
- Implemented fire-and-forget logging across all services with error handling
- Built admin endpoint `/api/admin/costs` with aggregations (total, 24h, 7d, avg response time)
- Created CostTracking component with:
  - Pie chart showing API usage distribution with percentages
  - Premium color palette (purple, green, blue, orange, teal)
  - Responsive table with service breakdown
  - Zero-total edge case handling
- Applied premium gradient styling throughout admin panel:
  - Gradient backgrounds and borders on all cards
  - Gradient text effects on titles
  - Icon badges with gradient backgrounds
  - Hover effects with scale and color transitions
  - Each section has unique color theme for visual hierarchy

## November 13, 2025

### Avatar Management System
- Migrated avatar configurations from hardcoded to database-driven system
- Created `avatar_profiles` table with proper schema (boolean isActive, nullable fields)
- Implemented full CRUD API endpoints:
  - GET /api/admin/avatars - List all avatars (admin only)
  - POST /api/admin/avatars - Create new avatar (admin only)
  - PUT /api/admin/avatars/:id - Update avatar (admin only)
  - DELETE /api/admin/avatars/:id - Soft delete avatar (admin only)
- Added automatic database seeding on server startup (3 default avatars)
- Updated public endpoints to load from DB with fallback to defaults
- Created AvatarManager UI component for admin dashboard with:
  - Table view with name, description, status, and actions
  - Dialog-based create/edit form with full validation
  - Tag-based namespace management
  - Switch for active/inactive status
  - Toast notifications for success/error states
- Integrated Avatar Management into admin.tsx dashboard

## November 11, 2025

### Optimized Avatar Interrupt Logic
- Added event-driven tracking for avatar speaking state using AVATAR_START_TALKING and AVATAR_STOP_TALKING events
- Only interrupts when avatar is actively speaking, preventing unnecessary API calls
- Improves conversation flow smoothness and reduces potential errors
- Implemented via `isSpeakingRef` that tracks real-time speaking state

### Stream Statistics Overlay (Development Only)
- Created useStreamStats hook that reads WebRTC peer connection stats via getStats()
- Displays FPS, resolution, bitrate (Kbps), and audio level in bottom-right overlay
- Only visible in development mode (import.meta.env.MODE !== "production")
- Polls every 1 second, handles peer connection availability gracefully
- Auto-resets stats when session ends

### Testing Infrastructure
- Installed Vitest testing framework with 57 passing tests
- Avatar tests: Dual namespace querying, score filtering, request validation, error handling
- Document tests: Text/chunk limits, file types, circuit breaker config, metadata handling
- Configuration-focused tests catch constant/threshold changes
- See TESTING.md for full details, limitations, and recommended improvements