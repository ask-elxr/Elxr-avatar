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
- **Frontend Integration**: Pending video notifications overlay on chat, toast alerts for completed videos with playback option
- **API Endpoints**:
  - `GET /api/courses/chat-videos` - List user's generated videos
  - `GET /api/courses/chat-videos/pending` - Get pending/generating videos for notification polling
  - `GET /api/courses/chat-videos/:videoId` - Get specific video details

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