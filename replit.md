# Overview

This project is a full-stack AI avatar chat platform that integrates HeyGen's streaming avatar technology with Claude Sonnet 4 AI and real-time Google web search. It features a React frontend and a Node.js/Express backend, enabling intelligent conversations with a Mark Kohl-personality-driven avatar. The avatar utilizes a Pinecone knowledge base and current web information for informed responses, supporting multi-mentor configurations and personal knowledge base integration. Key features include comprehensive HeyGen credit tracking, configurable thresholds, automatic circuit breaking, and per-user rate limiting to manage costs.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend
- **Framework**: React with TypeScript, using Vite.
- **UI/UX**: `shadcn/ui` on Radix UI with Tailwind CSS for responsive design.
- **State Management**: TanStack Query for server state, React hooks for local state.
- **Optimization**: React lazy loading, tree-shaking, and static avatar photo loading for bandwidth savings.
- **Avatar Session Management**: Custom hooks for lifecycle and inactivity.

## Backend
- **Framework**: Express.js for RESTful APIs.
- **Database ORM**: Drizzle ORM for PostgreSQL.
- **Background Processing**: BullMQ and Redis for asynchronous document processing (chunking, embedding, Pinecone storage).
- **API Security**: Credential-based requests with CORS, per-user rate limiting (1 request/minute for HeyGen/avatar endpoints).
- **Reliability**: Circuit breakers (Opossum) for external APIs, Pino for structured logging, Prometheus for metrics.
- **Cost Control**: HeyGen credit tracking with balance checks, configurable thresholds, automatic blocking on credit exhaustion.
- **Memory System**: Mem0 OSS for persistent conversation memory with OpenAI embeddings and in-memory vector storage.

## Data Storage
- **Primary Database**: PostgreSQL (Neon Database service) for persistent data and session storage.
- **Vector Database**: Pinecone for conversation embeddings and knowledge bases (supports multiple namespaces per mentor/user).
- **ORM**: Drizzle ORM for type-safe operations.
- **Caching**: 
  - Knowledge base: Intelligent normalized Pinecone query cache with TTL and LRU eviction
  - PubMed queries: Vector similarity-based cache in 'pubmed-cache' namespace with 7-day TTL, 95% similarity threshold, and embedding reuse optimization

## Authentication & Authorization
- **Authentication**: Session-based, server-side authentication stored in PostgreSQL.
- **User Management**: Username/password authentication with secure storage, supports anonymous users with temporary IDs.

## Core Features
- **AI Avatar**: HeyGen Streaming SDK for real-time video interaction.
- **AI Model**: Claude Sonnet 4 (`claude-sonnet-4-20250514`) for reasoning.
- **Knowledge Retrieval**: Pinecone knowledge base (ask-elxr), integrated Google Web Search with topic-based namespace mapping, and PubMed research integration for medical/scientific literature.
- **Personality Integration**: Mark Kohl personality (customizable per mentor) via system prompts.
- **Conversation Management**: Enhanced token limits, timeout handling, inactivity detection, pause/resume, current date awareness.
- **Multi-Assistant Architecture**: Per-mentor configurations with dedicated Pinecone namespaces and categories.
- **Personal Knowledge Bases**: Supports user-connected Notion/Obsidian knowledge sources with isolated Pinecone namespaces.
- **API Cost Tracking**: Tracks external API usage with admin dashboard.
- **Avatar Management System**: Database-driven configuration and CRUD operations for avatar profiles via admin panel.
- **Credit Monitoring**: Comprehensive HeyGen credit tracking with pre-call balance checks, configurable thresholds, and automatic blocking.
- **Persistent Memory**: Mem0 OSS for conversation persistence and user preference tracking.
- **PubMed Integration**: NCBI E-utilities for searching and retrieving peer-reviewed medical/scientific research with NCBI-compliant rate limiting (3 req/sec) and intelligent Pinecone-based caching.
  - **Smart Caching**: Vector similarity search (95% threshold) with 7-day expiration in dedicated 'pubmed-cache' namespace
  - **Cost Optimization**: Embedding reuse between cache check and storage, reducing OpenAI costs by 50% on cache misses
  - **Performance**: 3x faster response times on cache hits (1619ms → 532ms for typical queries)
  - **AI-Powered Summarization**: Claude Sonnet 4 generates comprehensive summaries of PubMed research results (~15s for 3-4 articles)
    * **Main Findings**: 3-5 key discoveries with PMID citations for traceability
    * **Common Themes**: 2-4 recurring patterns across studies
    * **Controversies**: Conflicting results or debates in the literature
    * **Relevance**: Explanation of how findings address the user's query
    * **Synthesis**: 2-3 paragraph narrative integrating all findings
    * **Cache Integration**: Summaries cached alongside articles for instant retrieval on subsequent requests

# External Dependencies

## Core Services
- **HeyGen Streaming Avatar API**: Real-time AI avatar video streaming.
- **Neon Database**: Managed PostgreSQL hosting.
- **Pinecone Vector Database**: Vector storage for embeddings.
- **Claude Sonnet 4**: AI model.
- **Google Web Search**: Real-time web information retrieval.
- **NCBI E-utilities (PubMed)**: Medical and scientific literature search and retrieval.
- **Redis**: Used by BullMQ for background job queuing.
- **ElevenLabs**: Text-to-speech for audio-only mode.
- **Mem0 OSS**: AI memory layer for conversation persistence and user preferences.

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
- **Axios**: HTTP client for external API calls.
- **xml2js**: XML parser for PubMed API responses.