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
- **Multi-avatar support**: Includes Mark Kohl, Willie Gault, June, Ann, Nigel, and Thad, each with unique expertise and configurable settings.
- **Dual Avatar System**: Each avatar has two HeyGen IDs:
  - `heygenAvatarId`: LiveAvatar ID for real-time streaming chat
  - `heygenVideoAvatarId`: Instant Avatar ID for video course generation
- **Per-avatar features**: Dedicated Pinecone knowledge base namespaces, configurable session limits, unique personalities, and per-avatar research source toggles (PubMed, Wikipedia, Google Search).
- **Avatar Service (`server/services/avatars.ts`)**: Handles field-level merging where database values override defaults and manages active/inactive avatars.

#### Video Course System
- **Workflow**: Users create courses, add lessons with scripts, and generate videos via HeyGen API integration.
- **All 6 avatars available**: Mark, Willie, Nigel, Thad, Ann, and June can all create video courses using Instant Avatars.
- **Video Generation Service (`server/services/videoGeneration.ts`)**: Manages HeyGen API calls for video creation, including async polling for completion status.

#### Technical Implementations
- **AI Integration**: Uses Claude Sonnet 4.5 as the primary LLM, integrated with RAG (Pinecone, PubMed, Wikipedia, Google Search) and persistent conversation memory.
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