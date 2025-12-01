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
-   **Core Features**: Avatar selection, HeyGen video streaming, Web Speech API for voice recognition, real-time chat with memory, document upload, and an admin dashboard.
-   **Mobile Fullscreen Support**: Adaptive fullscreen modes for iOS Safari, Android Chrome, and a CSS fallback with safe area handling.
-   **Microphone Permission**: Explicit user permission request for improved UX.
-   **Voice Recognition**: Throttled auto-restart to prevent rapid restart loops.
-   **Audio/Video Mode Toggle**: Seamless switching between HeyGen video and ElevenLabs audio modes, preserving conversation context. An idle timeout is implemented only for video mode.

#### Backend (Express + TypeScript + Python)
-   **Structure**: Modular routes, service facades for business logic (avatars, RAG, memory, auth), and centralized configuration.
-   **Python Integration**: Pipecat bot service for conversational AI.

#### Database (PostgreSQL + Drizzle ORM)
-   **Schema**: Defined in `shared/schema.ts`.
-   **Key Tables**: `avatar_profiles` (avatar configurations), `conversations` (chat history), `courses`, `lessons`, `generated_videos` (video course system), `chat_generated_videos` (chat video-on-demand), `mood_entries` (mood tracker), `subscription_plans`, `user_subscriptions`, `usage_periods` (subscription system).

#### Avatar System
-   **Multi-avatar Support**: Includes 10 active avatars with unique expertise, configurable settings, dedicated Pinecone knowledge base namespaces, and per-avatar research source toggles.
-   **Dual HeyGen IDs**: Each avatar has both a LiveAvatar ID for streaming chat and an Instant/Public Avatar ID for video course generation.
-   **Avatar Service**: Handles field-level merging where database values override defaults and manages active/inactive avatars.
-   **Auto-Reconnection**: HeyGen WebRTC sessions automatically retry on disconnection.

#### Video Course System
-   **Workflow**: Users create courses, add lessons, and generate videos via HeyGen.
-   **AI Script Generation**: Scripts can be auto-generated using the avatar's Pinecone knowledge base and Claude AI, with configurable duration.
-   **Video Modes**: Supports watermarked test videos (Instant Avatars) and watermark-free production videos (Public Avatars), with automatic detection.
-   **Robust Video Status Monitoring**: Includes polling timeouts, startup recovery, orphaned lesson detection, and background checking for completion.

#### Chat Video-on-Demand System
-   **Feature**: Users can request videos during chat via intent detection.
-   **Process**: Extracts topic, retrieves knowledge, generates script using Claude AI, and creates video asynchronously via HeyGen.
-   **Global Notification System**: App-wide polling for video status changes, with local storage tracking to prevent duplicate notifications.

#### Mood Tracker System
-   **Feature**: Users log emotional states (joyful, anxious, etc.) with intensity.
-   **AI Integration**: Claude AI generates personalized, empathetic responses based on mood and avatar personality.

#### Subscription System
-   **Tiers**: Free Trial, Basic, and Full plans with varying limits on avatars, videos, and chat sessions.
-   **Management**: Handles plan activation, usage tracking, limit enforcement, and admin user statistics.

#### Role-Based Access Control (RBAC)
-   **Roles**: `admin` and `user`.
-   **Backend Protection**: `requireAdmin` middleware for admin-only routes (e.g., document uploads, knowledge base management, analytics, user management).
-   **Frontend Guards**: UI elements and pages are conditionally rendered based on user role.

#### Webflow Embedding Mode
-   **Anonymous Access**: Authentication is bypassed for all user-facing routes. Users are automatically assigned anonymous session IDs (format: `webflow_[timestamp]_[random]`).
-   **Admin Secret Authentication**: Admin routes are protected by `X-Admin-Secret` header (set via `ADMIN_SECRET` environment variable). The admin page prompts for the secret if not provided.
-   **Secret Storage**: Admin secret can be provided via URL parameter (`?admin_secret=...`) or entered in the admin login form. It is persisted in `localStorage` for convenience.
-   **CORS & CSP**: Configured to allow embedding from any origin with `frame-ancestors *` header.
-   **Hidden Auth UI**: Login/logout buttons are hidden in the embedded mode since authentication is handled externally by Webflow.

#### Technical Implementations
-   **AI Integration**: Primary LLM is Claude Sonnet 4.5, integrated with RAG (Pinecone, PubMed, Wikipedia, Google Search) and Mem0 for persistent conversation memory.
-   **Pinecone**: Direct namespace-based vector queries for cost-effective knowledge retrieval.
-   **Real-time Voice**: HeyGen for video/audio synthesis, Web Speech API for voice recognition.
-   **Anonymous Sessions**: Support for persistent anonymous user sessions.

### External Dependencies

-   **HeyGen**: Video avatar service.
-   **Anthropic (Claude AI)**: Primary Large Language Model.
-   **Pinecone**: Vector database.
-   **Mem0**: Persistent memory service.
-   **PubMed**: Medical and scientific research source.
-   **Wikipedia**: General knowledge source.
-   **Google Search**: Web search.
-   **PostgreSQL**: Relational database.
-   **Drizzle ORM**: TypeScript ORM.
-   **OpenAI**: For embeddings (if configured).
-   **ElevenLabs**: Alternative TTS service.
-   **Redis (Upstash)**: For background job queuing.