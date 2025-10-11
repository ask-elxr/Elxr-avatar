# Overview

This is a full-stack AI avatar chat platform featuring 3 unique avatars (Mark Kohl, Sarah Chen, Dr. James Rivera), each with distinct personalities and specialized Pinecone knowledge bases. Built with HeyGen's streaming avatar SDK, Claude Sonnet 4 AI, and real-time Google web search. The platform offers 5-minute demo sessions for each avatar, with optional sign-in for unlimited access and long-term memory via Mem0 API.

# User Preferences

Preferred communication style: Simple, everyday language.

# Recent Changes

## Latest Updates (October 11, 2025)
- **Multi-Avatar System** - 3 unique avatars with distinct personalities and knowledge bases
  - Mark Kohl: Sarcastic sage blending mycology, filmmaking, kundalini (Pinecone: ask-elxr, knowledge-base-assistant)
  - Sarah Chen: Wellness expert focusing on holistic health (Pinecone: wellness-assistant)
  - Dr. James Rivera: Research specialist in academic/scientific topics (Pinecone: research-assistant)
  - Each avatar has separate HeyGen avatar ID, personality prompts, and Pinecone assistants
  - Avatar configuration system in shared/avatarConfig.ts for centralized management
- **Avatar Selection Interface** - Beautiful card-based UI for choosing avatars
  - Grid layout showing all 3 avatars with descriptions
  - "Back to Selection" button to switch avatars during session
  - Responsive design for mobile and desktop
  - Avatar props passed to chat component for dynamic configuration
- **5-Minute Demo Timer** - Time-limited demo sessions for each avatar
  - Countdown timer displayed in bottom-right corner (shows MM:SS format)
  - Warning message at 1 minute remaining (orange pulsing badge)
  - Demo expiration screen with options to try another demo or change avatar
  - Different reconnect messages for demo expiration vs inactivity timeout
  - Timer pauses when avatar is paused, resets on reconnection
- **Mem0 API Integration** - Long-term memory system for signed-in users (Phase 2)
  - Graceful degradation when API key not present
  - Mem0Service for user memory creation, retrieval, and search
  - Ready for integration with user authentication system
- **Reconnect Screen After Timeout** - Shows reconnect option instead of auto-looping
  - After 1 minute of inactivity, logo appears with "Reconnect" button
  - User must click "Reconnect" to restart session (no auto-restart loop)
  - Manual "End Chat" button still auto-restarts immediately
  - Prevents continuous resource usage when idle
- **Inactivity Timeout** - Automatic timeout after 1 minute of no user interaction
  - Timer starts when session becomes active
  - Resets on any user activity (speaking, button clicks)
  - Paused when avatar is manually paused
  - Shows reconnect screen when timeout occurs
- **Added Pause/Resume Control** - Yellow pause button in top center for controlling avatar
  - Pause: Stops voice chat (mutes microphone and stops listening)
  - Resume: Restarts voice chat (enables microphone again)
  - Button shows Pause icon when active, Play icon when paused
  - Works on both mobile and desktop
  - Pausing also stops the inactivity timer
- **Removed Action Descriptions** - Avatar no longer uses stage directions like "*leans back*" or "*smirks*"
- **No File Promises** - Avatar won't promise to send links, PDFs, or documents (speaks information instead)
- **Fixed October 2023 Reference Bug** - Avatar now maintains current date awareness from first response
  - System prompt always includes today's date (dynamic, updates automatically)
  - Explicit prohibition against mentioning "October 2023", "training data", or "knowledge cutoff"
  - Mark Kohl personality prompt includes current date at top of system configuration
  - Works correctly even when Google Search returns poor results
  - No more "my knowledge is from Oct 2023" disclaimers
- **Universal Auto-Start** - Avatar now auto-starts on all devices (mobile and desktop)
  - Removed "Chat now" button on desktop (ready for custom trigger implementation)
  - Auto-restart functionality on both platforms when "End Chat" is clicked
  - Loading video displays during initialization and restart
  - Mobile: Unpinch animation guides users to fullscreen
  - Desktop: Clean interface without mobile-specific graphics
- **Smart Loading Video Integration** - Loading video displays at the right moments during user interaction
  - Shows MP4 intro logo when session starts
  - Also displays when ending chat and restarting avatar session
  - 5-second display duration with automatic fade-out
  - PostMessage listener detects HeyGen's `streaming-embed:show` action
- **End Chat Controls** - Added prominent end chat buttons for easy session restart
  - Mobile: Red circular X button in top right corner
  - Desktop: Red rounded button with "End Chat" text label
  - Both trigger loading video overlay during avatar reset
- **Multi-Index Pinecone Support** - Now supports accessing two Pinecone indexes (`avatar-chat-knowledge` and `ask-elxr`)
  - All conversation endpoints accept optional `indexName` parameter to select target index
  - Proper validation with 400 errors for invalid index names
  - Backward compatible with default index for existing functionality
  - Automatic index creation with readiness polling for serverless indexes

## Previous Updates (January 2025)
- **HeyGen Streaming SDK Integration** - Proper SDK implementation using @heygen/streaming-avatar package
- **Dual Pinecone Assistant Access** - Now queries both `ask-elxr` and `knowledge-base-assistant` simultaneously in parallel
- **Upgraded to Claude Sonnet 4** (`claude-sonnet-4-20250514`) - Latest AI model for superior responses
- **Integrated Google Web Search** - Avatar now accesses real-time web information (2025 data confirmed)
- **Enhanced Avatar Intelligence** - Combines 2 Pinecone assistants + Google Search + Claude Sonnet 4
- **Mark Kohl Personality** - Full integration with custom personality system prompts
- **Fixed Request Timeouts** - Increased timeout to 30s for full AI processing pipeline
- **Improved Response Quality** - Multi-source intelligence (2 knowledge bases, web, AI reasoning)

## Previous Updates
- Connected to knowledge-base-assistant using Pinecone SDK (26k+ tokens processed)
- Implemented avatar response system with knowledge base integration
- Added interactive test buttons (microphone, knowledge base, force refresh)
- Created clean full-screen avatar interface
- Fixed HeyGen iframe audio and permission handling

# System Architecture

## Frontend Architecture
- **React with TypeScript**: Single-page application built with React 18 and TypeScript for type safety
- **Vite Build System**: Modern build tool for fast development and optimized production builds
- **Component Design**: Uses shadcn/ui component library built on Radix UI primitives for consistent, accessible UI components
- **Styling**: Tailwind CSS with CSS custom properties for theming and responsive design
- **State Management**: TanStack Query for server state management and React hooks for local state
- **Routing**: Wouter for lightweight client-side routing

## Backend Architecture
- **Express.js Server**: RESTful API server with middleware for JSON parsing and request logging
- **Database Layer**: Drizzle ORM configured for PostgreSQL with schema definitions and migrations
- **Storage Abstraction**: Pluggable storage interface with in-memory implementation for development
- **Environment-based Configuration**: Separate development and production modes with environment variable support

## Data Storage
- **Primary Database**: PostgreSQL via Neon Database service for production data persistence
- **Vector Database**: Pinecone for storing conversation embeddings (1536 dimensions for OpenAI compatibility)
- **ORM**: Drizzle ORM for type-safe database operations and schema management
- **Session Storage**: PostgreSQL-based session storage using connect-pg-simple
- **Schema Design**: User management with UUID primary keys, conversations table with embedding support

## Authentication & Authorization
- **Session-based Authentication**: Server-side sessions stored in PostgreSQL
- **User Management**: Username/password authentication with secure password storage
- **API Security**: Credential-based requests with CORS handling

## External Dependencies

### Core Services
- **HeyGen Streaming Avatar API**: Primary AI avatar service for real-time video streaming and conversation (iframe embed approach)
- **Neon Database**: Managed PostgreSQL hosting for production data storage
- **Pinecone Vector Database**: Vector storage for conversation embeddings and AI context memory

### Frontend Libraries
- **UI Framework**: React 18 with TypeScript support
- **Component Library**: Radix UI primitives with shadcn/ui customizations
- **Styling**: Tailwind CSS with autoprefixer and PostCSS
- **State Management**: TanStack React Query for server state
- **Routing**: Wouter for lightweight client-side navigation
- **Form Handling**: React Hook Form with Zod validation
- **Icons**: Lucide React icon library

### Backend Dependencies
- **Server Framework**: Express.js with TypeScript
- **Database**: Drizzle ORM with PostgreSQL driver
- **Session Management**: express-session with PostgreSQL store
- **Development Tools**: tsx for TypeScript execution, esbuild for production builds

### Development Tools
- **Build System**: Vite with React plugin and runtime error overlay
- **Type Checking**: TypeScript with strict mode enabled
- **Database Migrations**: Drizzle Kit for schema management
- **Environment Management**: dotenv for configuration management