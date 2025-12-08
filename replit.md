# Multi-Avatar AI Chat System

### Overview
This project is an advanced AI chat platform integrating HeyGen video avatars for real-time voice conversations and a video course creation system. It features knowledge retrieval from diverse sources (Pinecone, PubMed, Wikipedia, Notion) and persistent memory via Mem0. The system aims to provide an interactive, intelligent, and personalized AI conversational experience with significant market potential in education, customer service, and specialized information retrieval.

### User Preferences
- **Architecture**: Modular code organization with separate config/, services/, routes/
- **Avatar Merging**: DB overrides take absolute precedence (including null, false, empty string)
- **Service Facades**: Thin wrappers that re-export existing functionality
- **Route Extraction**: Incremental migration from monolithic routes.ts to feature-focused modules

### System Architecture

#### Frontend (React + TypeScript)
- **Core Features**: Avatar selection, LiveAvatar video streaming, ElevenLabs STT for voice recognition (exclusive, no Web Speech API), real-time chat with memory, document upload, and an admin dashboard.
- **SessionDriver Pattern**: Unified abstraction for avatar sessions (`LiveAvatarDriver`, `AudioOnlyDriver`) with a common interface.
- **Real-time Streaming Pipeline**: Ultra-low latency voice conversation via WebSocket, integrating ElevenLabs STT (exclusive), Pinecone RAG, Mem0, and ElevenLabs Realtime TTS.
- **WebRTC Streaming Pipeline**: LiveKit-based WebRTC transport for ultra-low latency audio, bridging to ElevenLabs STT/TTS and Claude AI.
- **True Streaming Optimization**: Designed for zero buffering and minimum latency across LLM, TTS, and STT streams.
- **Parallel RAG + LLM Pipeline**: Prioritizes responsiveness by initiating RAG/Mem0 searches immediately and conditionally including context in the LLM prompt.
- **End-to-End Streaming Pipeline**:
    -   User audio → STT streaming (partial transcripts ~100ms)
    -   STT final → LLM streaming (token-by-token to TTS)
    -   LLM tokens → TTS streaming (audio chunks ~50ms)
    -   TTS audio → Avatar SDK (`repeatAudio()` for lip-sync)
    -   `LiveAvatarDriver` accumulates streaming audio (12KB threshold / 200ms timeout)
    -   Batched audio sent to SDK for synchronized lip animation

#### Backend (Express + TypeScript + Python)
- **Structure**: Modular routes, service facades for business logic (avatars, RAG, memory, auth), and centralized configuration.
- **Python Integration**: Pipecat bot service for conversational AI.

#### Database (PostgreSQL + Drizzle ORM)
- **Schema**: Defined in `shared/schema.ts`, including tables for `avatar_profiles`, `conversations`, `courses`, `lessons`, `generated_videos`, `mood_entries`, and a subscription system.

#### Avatar System
- **Multi-avatar Support**: Includes 10 active avatars with unique expertise, configurable settings, dedicated Pinecone knowledge bases, and per-avatar research source toggles.
- **HeyGen Integration**: Utilizes dual HeyGen IDs (LiveAvatar for streaming, Instant/Public for video generation) and separate API keys.
- **Platform & Voice Configuration**: Per-avatar selection for streaming platform (LiveAvatar/HeyGen) and voice source (ElevenLabs/HeyGen).
- **Avatar Service**: Manages field-level merging and active/inactive avatar states.

#### Video Course System
- **Workflow**: Users create courses, add lessons, and generate videos via HeyGen, with optional AI script generation using Claude AI and Pinecone knowledge.
- **Video Modes**: Supports watermarked test videos (Instant Avatars) and watermark-free production videos (Public Avatars).
- **Robust Video Status Monitoring**: Includes polling, startup recovery, and orphaned lesson detection.

#### Chat Video-on-Demand System
- **Feature**: Users can request videos during chat via intent detection, generating scripts with Claude AI and creating videos asynchronously via HeyGen.
- **Global Notification System**: App-wide polling for video status changes with local storage tracking.

#### Mood Tracker System
- **Feature**: Users log emotional states, with Claude AI generating personalized, empathetic responses.

#### Subscription System
- **Tiers**: Free Trial, Basic, and Full plans with varying limits.
- **Management**: Handles plan activation, usage tracking, and limit enforcement.

#### Role-Based Access Control (RBAC)
- **Roles**: `admin` and `user`.
- **Protection**: Backend middleware for admin-only routes and frontend guards for UI elements.

#### Webflow Embedding Mode
- **Anonymous Access**: Bypasses authentication for user-facing routes, assigning anonymous session IDs.
- **Admin Secret Authentication**: Admin routes protected by `X-Admin-Secret` header, with UI for input and `localStorage` persistence.
- **CORS & CSP**: Configured for embedding from any origin.
- **Hidden Auth UI**: Login/logout buttons are hidden.
- **Embed-Only Routes**: Chrome-free pages for iframe embedding without navigation sidebars.

#### Avatar-Namespace Matrix Visualization
- **Component**: `AvatarNamespaceMatrix.tsx` provides interactive visualization of avatar-to-Pinecone namespace relationships with matrix and list views, detail panels, and API endpoints.

#### Google Drive Topic Folders Integration
- **Source**: Integrates with Google Drive topic folders for Pinecone namespace population.
- **Mapping**: Configured in `shared/pineconeCategories.ts` with case-insensitive folder name matching.
- **Admin UI**: KnowledgeBase page offers a "Topic Folders" tab for bulk uploads.
- **Memory Optimization**: Implements file size limits, excludes archives, and processes sequentially to minimize memory usage.

#### Technical Implementations
- **AI Integration**: Primary LLM is Claude Sonnet 4.5, integrated with RAG (Pinecone, PubMed, Wikipedia, Google Search) and Mem0 for persistent memory.
- **Smart Memory Extraction**: Mem0 extracts filtered, deduplicated, and typed memories using Claude.
- **Pinecone**: Direct namespace-based vector queries with namespace normalization.
- **Real-time Voice**: HeyGen for video/audio synthesis, ElevenLabs STT for voice recognition (exclusive - no Web Speech API).
- **Streaming Audio Pipeline**: Sub-1-second first audio latency via aggressive timer-based flushing (100ms first chunk, 200ms subsequent).
- **Anonymous Sessions**: Supports persistent anonymous user sessions.

### External Dependencies

- **HeyGen**: Video avatar service.
- **Anthropic (Claude AI)**: Primary Large Language Model.
- **Pinecone**: Vector database.
- **Mem0**: Persistent memory service.
- **PubMed**: Medical and scientific research source.
- **Wikipedia**: General knowledge source.
- **Google Search**: Web search.
- **PostgreSQL**: Relational database.
- **Drizzle ORM**: TypeScript ORM.
- **OpenAI**: For embeddings (if configured).
- **ElevenLabs**: Alternative TTS service.
- **Redis (Upstash)**: For background job queuing.