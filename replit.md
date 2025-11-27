# Multi-Avatar AI Chat System

### Overview
This project is an advanced AI chat platform that integrates HeyGen video avatars for real-time voice conversations. It features knowledge retrieval from diverse sources like Pinecone, PubMed, Wikipedia, and Notion, coupled with persistent memory via Mem0. The system also includes a comprehensive admin management interface and a newly developed video course creation system using AI avatars. The business vision is to provide an interactive and intelligent conversational experience with personalized AI interactions, offering significant market potential in education, customer service, and specialized information retrieval.

### User Preferences
- **Architecture**: Modular code organization with separate config/, services/, routes/
- **Avatar Merging**: DB overrides take absolute precedence (including null, false, empty string)
- **Service Facades**: Thin wrappers that re-export existing functionality
- **Route Extraction**: Incremental migration from monolithic routes.ts to feature-focused modules

### System Architecture

#### Frontend (React + TypeScript)
- **Location**: `client/src/`
- **Key Features**: Avatar selection, HeyGen video streaming, Web Speech API for voice recognition, real-time chat with memory, document upload, and an admin dashboard.

#### Backend (Express + TypeScript + Python)
- **Location**: `server/`
- **Key Components**:
    - **Routes**: Modular handlers in `server/routes/` for avatars, courses, and sessions.
    - **Services**: Business logic facades in `server/services/` for avatars, RAG, memory, and authentication.
    - **Config**: Centralized configuration in `config/`.
    - **Python**: Pipecat bot service for conversational AI.

#### Database (PostgreSQL + Drizzle ORM)
- **Schema**: Defined in `shared/schema.ts`.
- **Key Tables**:
    - `avatar_profiles`: Stores avatar configurations with database overrides.
    - `conversations`: Stores persistent chat history.
    - `courses`, `lessons`, `generated_videos`: Support the video course creation system.

#### Avatar System
- **Multi-avatar support**: Includes Mark Kohl, Willie Gault, June, Ann, Nigel, Thad, Kelsey, Judy, Dexter, and Shawn, each with unique expertise and configurable settings (10 total active avatars).
- **Dual Avatar System**: Each avatar has two HeyGen IDs:
  - `heygenAvatarId`: LiveAvatar ID for real-time streaming chat
  - `heygenVideoAvatarId`: Instant/Public Avatar ID for video course generation
- **Updated Video Avatar IDs** (as of Nov 2025):
  - Ann: `1732832799` (Sophia public avatar)
  - June: `1732323320` (Judy public avatar)
  - Thad: `1732323365` (Doctor Dexter sitting pose)
  - Nigel: `1732829459` (Shawn sitting behind desk)
  - Kelsey: `June_HR_public` (uses June's animated style)
  - Judy: `1732323320` (wellness guide)
  - Dexter: `1732323365` (doctor sitting, medical wellness)
  - Shawn: `1732829459` (sitting behind desk, business strategist)
- **Per-avatar features**: Dedicated Pinecone knowledge base namespaces, configurable session limits, unique personalities, and per-avatar research source toggles (PubMed, Wikipedia, Google Search).
- **Avatar Service (`server/services/avatars.ts`)**: Handles field-level merging where database values override defaults and manages active/inactive avatars.
- **Auto-Reconnection**: HeyGen WebRTC sessions automatically retry up to 3 times with exponential backoff (1s, 2s, 4s) on unexpected disconnection before showing manual reconnect button.

#### Video Course System
- **Workflow**: Users create courses, add lessons with scripts, and generate videos via HeyGen API integration.
- **AI Script Generation**: Each lesson can have its script auto-generated using:
  - Avatar's Pinecone knowledge base (namespace-specific retrieval)
  - Claude AI for natural spoken content generation
  - Configurable target duration (30s to 3 minutes)
  - API: `POST /api/courses/generate-script` with `{avatarId, courseId, topic, lessonTitle, targetDuration}`
- **All avatars available for video courses**: Mark, Willie, Nigel, Thad, Ann, June, Kelsey, Judy, Dexter, Shawn.
- **Video Modes**:
  - **Test Videos (watermarked)**: Instant Avatars generate test videos with HeyGen watermark
  - **Production Videos**: Public avatars generate watermark-free production videos
- **Auto-detection**: System automatically uses test mode for Instant Avatars and production mode for public avatars
- **Video Generation Service (`server/services/videoGeneration.ts`)**: Manages HeyGen API calls for video creation, including async polling for completion status and automatic test/production mode selection.
  - **Robust Video Status Monitoring**:
    - 20-minute polling timeout (extended from 10 min for longer videos)
    - Startup recovery: checks stuck "generating" videos and resumes polling or updates status
    - Orphaned lesson detection: resets lessons stuck in "generating" with no video record to draft
    - Background checker: runs every 2 minutes to catch videos that completed after polling timeout
    - Active polling tracking: prevents duplicate polling for the same video
  - **Frontend Notifications**: Toast alerts when videos complete, with status change detection
- **Course Builder**: Integrated within the admin panel under "Video Courses" section. Features "Generate with AI" button for each lesson script.

#### Chat Video-on-Demand System
- **Feature**: Users can request videos during chat conversations by asking phrases like "make me a video about..." or "create a clip explaining..."
- **Intent Detection**: Uses regex patterns with fallback Claude AI classification for robust detection (`server/services/intent.ts`)
- **ChatVideoService (`server/services/chatVideo.ts`)**: Orchestrates video generation from chat:
  - Extracts topic from user request
  - Retrieves knowledge from avatar's Pinecone namespace
  - Generates script using Claude AI (optimized for spoken delivery)
  - Creates video via HeyGen API asynchronously
  - Status flow: pending → generating → completed/failed
- **Database Table**: `chat_generated_videos` tracks generation state, status, timestamps (createdAt, updatedAt, completedAt)
- **Global Notification System** (`client/src/hooks/useChatVideoNotifications.ts`):
  - Runs app-wide (mounted in App.tsx) to detect completed videos even after chat is closed
  - Polls every 5 seconds for video status changes
  - Uses user-scoped localStorage to track seen notifications (prevents duplicates)
  - Detects both newly completed videos (status transition) and recent completions on page load (within 10 minutes)
  - Works for both authenticated users and anonymous sessions
- **Frontend Integration**: Pending video notifications overlay on chat, global toast alerts for completed videos
- **API Endpoints**:
  - `GET /api/courses/chat-videos` - List user's generated videos
  - `GET /api/courses/chat-videos/pending` - Get pending/generating videos for notification polling
  - `GET /api/courses/chat-videos/:videoId` - Get specific video details

#### Mood Tracker System
- **Feature**: Users can log their emotional state and receive personalized, empathetic responses from AI avatars
- **Mood Types**: joyful, calm, energized, neutral, anxious, sad, stressed
- **Intensity Scale**: 1-5 scale from mild to intense
- **Database Table**: `mood_entries` stores userId, avatarId, mood, intensity, notes, avatarResponse, createdAt
- **Claude AI Integration**: `server/services/moodResponse.ts` generates avatar-specific empathetic responses using Claude Sonnet 4.5
- **API Endpoints**:
  - `POST /api/mood` - Log a new mood entry with optional notes
  - `GET /api/mood` - Get mood history with optional date range filter
  - `GET /api/mood/stats` - Get aggregated mood statistics (distribution, streak, average intensity)
- **Frontend**: Mood Tracker view in Dashboard with emoji-based mood selection cards, intensity slider, notes textarea, and mood history display
- **Personalization**: Responses are tailored to the avatar's personality when an avatarId is provided

#### Subscription System
- **Three Plan Tiers**:
  - **Free Trial**: 1-hour trial, 1 avatar, 2 courses max, 100 chat sessions
  - **Basic Plan** ($29/month): 1 avatar, 50 videos/month, 50 courses/month, 1000 chat sessions
  - **Full Plan** ($49/month): Unlimited avatars, videos, courses, and chat sessions
- **Database Tables**:
  - `subscription_plans`: Plan definitions with limits (slug, name, priceMonthly, avatarLimit, videoLimit, etc.)
  - `user_subscriptions`: User subscription records with status (trial/active/expired/cancelled)
  - `usage_periods`: Monthly usage tracking (videosCreated, coursesCreated, chatSessionsUsed)
- **Subscription Service** (`server/services/subscription.ts`):
  - Plan management (getPlans, getPlanBySlug)
  - Trial activation with avatar selection
  - Usage tracking and limit enforcement
  - Admin user stats aggregation
- **Dashboard Plan View** (`client/src/pages/Dashboard.tsx`):
  - Current plan display with status badge
  - Usage meters showing remaining limits
  - Available plans comparison with upgrade buttons
  - Trial countdown timer
  - Avatar selection for limited plans
- **API Endpoints** (`server/routes/subscription.ts`):
  - `GET /api/subscription/plans` - List all active plans
  - `GET /api/subscription/user-plan` - Get current user's plan info
  - `POST /api/subscription/start-trial` - Start free trial with avatar selection
  - `POST /api/subscription/upgrade` - Upgrade to paid plan
  - `GET /api/subscription/admin/users` - Admin: get all users with subscription/usage stats

#### Role-Based Access Control (RBAC)
- **User Roles**: Two roles - `admin` and `user` (default)
- **Backend Protection**: `requireAdmin` middleware in `server/replitAuth.ts` protects admin-only routes
- **Admin-Only Features**:
  - Document uploads (`/api/documents/upload-*`)
  - Knowledge Base management (`/api/pinecone/*`, `/api/documents/*`)
  - Analytics and costs (`/api/admin/costs`, `/api/admin/sessions`)
  - User management (`/api/admin/users`, `/api/admin/users/:id/role`, `/api/subscription/admin/users`)
  - Avatar configuration and course builder (via admin panel)
- **Admin User Management View** (`client/src/pages/admin.tsx`):
  - Summary stats: Total users, Pro users, Basic users, Active trials
  - Users table with plan, status, role, avatar, usage metrics, join date
  - Visual badges for plan tiers and subscription status
- **End-User Features**:
  - Chat with avatars (main chat interface)
  - View and download their generated videos (`/my-videos` page)
  - Request video generation during chat
  - View and manage subscription (My Plan view)
- **Frontend Guards**:
  - `useAuth` hook exposes `isAdmin` property
  - Admin page (`/admin`) shows access denied for non-admins
  - Knowledge Base page requires admin access
  - Dashboard shows different content based on role
- **Role Management**: Admins can update user roles via `PUT /api/admin/users/:userId/role`

#### Technical Implementations
- **AI Integration**: Uses Claude Sonnet 4.5 as the primary LLM, integrated with RAG (Pinecone, PubMed, Wikipedia, Google Search) and persistent conversation memory.
- **Pinecone Knowledge Retrieval**: Uses direct namespace-based vector queries via `pineconeNamespaceService.ts` (cost-effective approach). The `ask-elxr` index stores all avatar knowledge organized by category namespaces (ADDICTION, MIND, BODY, etc.).
- **Real-time Voice Conversations**: Achieved through HeyGen for video/audio synthesis and Web Speech API for voice recognition.
- **Persistent Memory**: Implemented via Mem0, storing conversation history for context-aware responses.
- **Anonymous Sessions**: Supports persistent anonymous user sessions for course management and other features.

### External Dependencies

- **HeyGen**: Video avatar service for real-time video generation and streaming.
- **Anthropic (Claude AI)**: Primary Large Language Model for AI responses.
- **Pinecone**: Vector database for knowledge retrieval.
- **Mem0**: Persistent memory service for conversation history.
- **PubMed**: Source for medical and scientific research.
- **Wikipedia**: General knowledge source.
- **Google Search**: Web search capabilities for broader information retrieval.
- **PostgreSQL**: Relational database for storing application data.
- **Drizzle ORM**: TypeScript ORM for interacting with PostgreSQL.
- **OpenAI**: Used for embeddings (if `OPENAI_API_KEY` is provided).
- **ElevenLabs**: Alternative TTS service (currently disabled, but integrated).
- **Redis (Upstash)**: Used for background job queuing.