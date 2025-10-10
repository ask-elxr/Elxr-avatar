# Overview

This is a full-stack AI avatar chat platform that combines HeyGen's streaming avatar technology with Claude Sonnet 4 AI and real-time Google web search. The application features a React-based frontend with a Node.js/Express backend, allowing users to have intelligent conversations with the Mark Kohl personality-driven avatar that accesses both a comprehensive Pinecone knowledge base and current web information.

# User Preferences

Preferred communication style: Simple, everyday language.

# Recent Changes

## Latest Updates (October 2025)
- **Redesigned Intro Experience** - Clean loading video with integrated "Chat now" button
  - Intro logo video plays on loop when page loads
  - "Chat now" button overlaid on video for immediate interaction
  - When clicked, video continues playing for 6 seconds to cover HeyGen's connecting phase
  - No duplicate "Chat now" buttons - single, clear call to action
  - Eliminates the "Connecting..." screen by covering it with branded intro video
- **Streamlined End Chat Control** - Single, adaptive end chat button
  - Shows only when avatar chat is active (after intro completes)
  - Mobile: Red circular X button in top right corner
  - Desktop: Red rounded button with "End Chat" text label
  - Clicking resets to intro screen with logo and "Chat now" button
  - No duplicate buttons - HeyGen's built-in controls are hidden
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