# Overview

This is a full-stack AI avatar chat platform that combines HeyGen's streaming avatar technology with Claude Sonnet 4 AI and real-time Google web search. The application features a React-based frontend with a Node.js/Express backend, allowing users to have intelligent conversations with the Mark Kohl personality-driven avatar that accesses both a comprehensive Pinecone knowledge base and current web information.

# User Preferences

Preferred communication style: Simple, everyday language.

# Recent Changes

## Latest Updates (October 22, 2025)
- **Dual Pinecone Knowledge Base Access** - Mark now queries BOTH `knowledge-base-assistant` AND `ask-elxr` assistants in parallel for comprehensive responses
- **Disabled Google Web Search for Speed** - Avatar now responds faster using only Claude Sonnet 4 + dual Pinecone knowledge bases (no web search delays)
- **20 Authentic Mark Kohl Sign-Offs** - After 60 seconds inactivity, Mark says one of 20 personalized goodbyes
- **Fixed Greeting Timing** - Inactivity timer now starts 2 seconds AFTER Mark's greeting (no more cut-offs)

## Previous Updates (October 12, 2025)
- **CRITICAL FIX: Pause Now Stops Avatar Stream** - Prevents credit drain when paused
  - Pause button now completely stops the HeyGen avatar stream (calls `stopAvatar()`)
  - Previously only muted microphone, avatar kept streaming and charging credits
  - Resume button restarts the entire session (new stream starts)
  - Saves significant HeyGen credits when taking breaks
- **Two-Stage Timeout with Polite Prompt** - Avatar asks before terminating
  - After 60 seconds inactivity → Avatar asks: "Is there anything else I can help you with?"
  - User gets 20 more seconds to respond
  - If user responds → Timer resets, conversation continues
  - If no response → Avatar gives funny timeout message and terminates with reconnect screen
- **Timeout Message with Credit Savings** - Funny message before stopping avatar
  - After asking "anything else?" with no response, avatar says: "Well, if that's all I've got to work with here... guess I'll save us both some credits and take a break. Hit that reconnect button when you're ready for round two!"
  - Then fully stops avatar stream to prevent credit charges
  - Shows reconnect button (no auto-loop)
- **Reconnect Screen After Timeout** - Shows reconnect option instead of auto-looping
  - After 1 minute of inactivity, logo appears with "Reconnect" button
  - User must click "Reconnect" to restart session (no auto-restart loop)
  - Manual "End Chat" button still auto-restarts immediately
  - Prevents continuous resource usage when idle
- **Added Pause/Resume Control** - Purple pause button in top center for controlling avatar
  - Pause: Completely stops avatar stream (saves HeyGen credits!)
  - Resume: Restarts entire session with new stream
  - Button shows Pause icon when active, Play icon when paused
  - Works on both mobile and desktop
  - Pausing stops the inactivity timer and clears video element
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
- **Optimized Pinecone Access** - Uses single `knowledge-base-assistant` for faster responses (30-40% speed improvement)
- **Upgraded to Claude Sonnet 4** (`claude-sonnet-4-20250514`) - Latest AI model for superior responses
- **Integrated Google Web Search** - Avatar now accesses real-time web information (2025 data confirmed)
- **Enhanced Avatar Intelligence** - Combines Pinecone knowledge base + Google Search + Claude Sonnet 4
- **Mark Kohl Personality** - Full integration with custom personality system prompts
- **Fixed Request Timeouts** - Increased timeout to 30s for full AI processing pipeline
- **Improved Response Quality** - Multi-source intelligence (knowledge base, web, AI reasoning)

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