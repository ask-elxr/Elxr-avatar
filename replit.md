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
-   **Core Features**: Avatar selection, LiveAvatar video streaming, Web Speech API for voice recognition, real-time chat with memory, document upload, and an admin dashboard.
-   **SessionDriver Pattern**: Unified abstraction for avatar sessions via `client/src/hooks/sessionDrivers.ts`:
    -   `LiveAvatarDriver`: Uses HeyGen LiveAvatar SDK with CUSTOM mode for video streaming while preserving Claude + RAG + ElevenLabs pipeline.
    -   `AudioOnlyDriver`: Audio-only mode using ElevenLabs TTS without video session.
    -   Common interface: `start()`, `stop()`, `speak(text, languageCode?)`, `interrupt()`, `supportsVoiceInput()`.
-   **Mobile Fullscreen Support**: Adaptive fullscreen modes for iOS Safari, Android Chrome, and a CSS fallback with safe area handling.
-   **Microphone Permission**: Explicit user permission request for improved UX.
-   **Voice Recognition**: Throttled auto-restart to prevent rapid restart loops. Recognition pauses during avatar speech and resumes with platform-aware delays.
-   **Audio/Video Mode Toggle**: Seamless switching between LiveAvatar video and ElevenLabs audio modes, preserving conversation context. An idle timeout is implemented only for video mode.

#### Backend (Express + TypeScript + Python)
-   **Structure**: Modular routes, service facades for business logic (avatars, RAG, memory, auth), and centralized configuration.
-   **Python Integration**: Pipecat bot service for conversational AI.

#### Database (PostgreSQL + Drizzle ORM)
-   **Schema**: Defined in `shared/schema.ts`.
-   **Key Tables**: `avatar_profiles` (avatar configurations), `conversations` (chat history), `courses`, `lessons`, `generated_videos` (video course system), `chat_generated_videos` (chat video-on-demand), `mood_entries` (mood tracker), `subscription_plans`, `user_subscriptions`, `usage_periods` (subscription system).

#### Avatar System
-   **Multi-avatar Support**: Includes 10 active avatars with unique expertise, configurable settings, dedicated Pinecone knowledge base namespaces, and per-avatar research source toggles.
-   **Dual HeyGen IDs**: Each avatar has both a LiveAvatar ID for streaming chat and an Instant/Public Avatar ID for video course generation.
-   **Dual HeyGen API Keys**: System uses `LIVEAVATAR_API_KEY` for interactive streaming sessions and `HEYGEN_VIDEO_API_KEY` for video generation. Falls back to legacy `HEYGEN_API_KEY` if new keys not set.
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
-   **Embed-Only Routes**: Chrome-free pages for iframe embedding without navigation sidebars:
    -   User Routes: `/embed/dashboard`, `/embed/chat`, `/embed/chat/:avatarId`, `/embed/videos`, `/embed/courses`, `/embed/mood`, `/embed/plan`, `/embed/credits`, `/embed/settings`
    -   Admin Routes: `/embed/admin`, `/embed/admin/avatars`, `/embed/admin/knowledge`, `/embed/admin/courses`, `/embed/admin/users`, `/embed/admin/analytics`, `/embed/admin/credits`
-   **Implementation**: Embed pages reuse Dashboard/Admin components with `isEmbed={true}` prop that hides sidebar, mobile header, and floating orbs.

#### Avatar-Namespace Matrix Visualization
-   **Component**: `AvatarNamespaceMatrix.tsx` provides interactive visualization of avatar-to-Pinecone namespace relationships.
-   **Views**: Toggle between matrix grid view (avatars × namespaces) and list view (namespace cards with connected avatars).
-   **Detail Panel**: Click any namespace to see vector counts, connected avatars, content source breakdown, and sample content previews.
-   **Data-testid Coverage**: Comprehensive test instrumentation for all dynamic elements (summary stats, matrix cells, footer totals, list badges, detail panels).
-   **Integration**: Available in Knowledge Base admin page under "Mapping" tab.
-   **API Endpoints**:
    -   `GET /api/pinecone/namespaces` - List all namespaces with vector counts
    -   `GET /api/pinecone/namespaces/:namespace` - Get namespace details with sample vectors
    -   `GET /api/pinecone/avatar-connections` - Get avatar-namespace mapping

#### Google Drive Topic Folders Integration
-   **Source Folder**: `0AL_h7e92I2C8Uk9PVA` contains pre-organized topic folders for Pinecone namespace population.
-   **Folder-to-Namespace Mapping**: Configured in `shared/pineconeCategories.ts` with case-insensitive folder name matching.
-   **Topic Folders**: Addiction, Body, Career→WORK, grief→GRIEF, life→LIFE, longevity→LONGEVITY, Mark Kohl Brain→MARK_KOHL, Mind, movement→MOVEMENT, Nigel Williams→NIGEL_WILLIAMS, Nutrition, Sleep, Spirituality, Transitions, Willie Gault→WILLIE_GAULT.
-   **Admin UI**: KnowledgeBase page has "Topic Folders" tab for bulk uploads. Shows file sizes and filtering info.
-   **API Endpoints** (admin-only with `requireAdmin` middleware):
    -   `GET /api/google-drive/topic-folders` - List all topic folders with file counts
    -   `GET /api/google-drive/topic-folder/:folderId/files` - List files in a topic folder
    -   `POST /api/google-drive/topic-upload-single` - Upload single file to namespace
-   **Memory Optimization**: 
    -   File size limit: 3MB max per file (files >3MB auto-skipped)
    -   Archives excluded: zip, rar, 7z, gzip files filtered out
    -   Text limit: 200KB max extracted text per document
    -   Chunk limit: 15 max chunks per document
    -   Sequential processing: One chunk at a time to minimize memory

#### Technical Implementations
-   **AI Integration**: Primary LLM is Claude Sonnet 4.5, integrated with RAG (Pinecone, PubMed, Wikipedia, Google Search) and Mem0 for persistent conversation memory.
-   **Pinecone**: Direct namespace-based vector queries for cost-effective knowledge retrieval. Namespace normalization converts uppercase categories (ADDICTION, MARK_KOHL) to lowercase (addiction, mark-kohl).
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