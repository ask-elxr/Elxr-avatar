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