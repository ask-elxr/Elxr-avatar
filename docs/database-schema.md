# Database Schema

**Provider**: Neon serverless PostgreSQL
**ORM**: Drizzle ORM (`drizzle-orm/neon-serverless`)
**Schema file**: `shared/schema.ts`
**Migration folder**: `migrations/`
**Push command**: `npm run db:push`

---

## users

User profiles from auth systems.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | varchar | PK, default UUID | |
| `email` | varchar | unique | |
| `first_name` | varchar | | |
| `last_name` | varchar | | |
| `profile_image_url` | varchar | | |
| `role` | varchar | default `'user'` | `'admin'` or `'user'` |
| `memberstack_id` | varchar | | Memberstack member ID |
| `current_plan_slug` | varchar | default `'free'` | |
| `trial_started_at` | timestamp | | |
| `last_active_at` | timestamp | | |
| `created_at` | timestamp | default now | |
| `updated_at` | timestamp | default now | |

## sessions (authSessions)

Express session store (connect-pg-simple).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `sid` | varchar | PK | Session ID |
| `sess` | jsonb | not null | Session data |
| `expire` | timestamp | not null, indexed | |

## conversations

Chat message history.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | varchar | PK, default UUID | |
| `user_id` | varchar | | No FK (supports anon `temp_` IDs) |
| `avatar_id` | varchar | | Which avatar |
| `role` | varchar | | `'user'` or `'assistant'` |
| `text` | text | | Message content |
| `embedding` | jsonb | | Vector embeddings |
| `metadata` | jsonb | | Additional metadata |
| `created_at` | timestamp | default now | |

## documents

Uploaded documents (PDF, video).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | varchar | PK | |
| `user_id` | varchar | FK → users.id | |
| `filename` | text | | |
| `file_type` | text | | `'pdf'` or `'video'` |
| `file_size` | text | | |
| `status` | text | | `processing`, `completed`, `failed` |
| `chunks_count` | integer | | |
| `text_length` | integer | | |
| `pinecone_namespace` | text | | `'documents'` or `'video-transcripts'` |
| `object_path` | text | | Path in object storage |
| `created_at` | timestamp | default now | |
| `updated_at` | timestamp | default now | |

## chat_sessions

Session-level conversation state.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | varchar | PK | |
| `user_id` | varchar | FK → users.id | |
| `conversation_history` | jsonb | | Message array |
| `context` | text | | RAG context |
| `created_at` | timestamp | default now | |
| `updated_at` | timestamp | default now | |

## jobs

Background job tracking (document processing, URL ingestion).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | varchar | PK | |
| `document_id` | varchar | FK → documents.id | |
| `user_id` | varchar | FK → users.id | |
| `type` | varchar | | `'document-upload'`, `'url-processing'` |
| `status` | varchar | | `pending`, `processing`, `completed`, `failed` |
| `progress` | text | | 0–1 as string |
| `error` | jsonb | | Error + stack trace |
| `result` | jsonb | | Job result |
| `created_at` | timestamp | default now | |
| `updated_at` | timestamp | default now | |

## ingestion_jobs

Full course ingestion jobs. Persistent across server restarts for resumability.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | varchar | PK | |
| `status` | varchar | | `detecting`, `processing`, `completed`, `failed` |
| `kb` | varchar | | Knowledge base target |
| `course_id` | varchar | | |
| `course_title` | varchar | | |
| `dry_run` | boolean | | |
| `lessons_detected` | integer | | Progress tracking |
| `lessons_processed` | integer | | |
| `total_artifacts` | integer | | |
| `current_lesson` | varchar | | Currently processing |
| `detected_lessons` | jsonb | | `{lessonId, title, startIndex, endIndex}[]` |
| `processed_lesson_ids` | jsonb | | Array of completed lesson IDs |
| `errors` | jsonb | | Array of error messages |
| `result` | jsonb | | Final result |
| `started_at` | timestamp | | |
| `completed_at` | timestamp | | |
| `created_at` | timestamp | default now | |
| `updated_at` | timestamp | default now | |

## avatar_profiles

Avatar configuration (HeyGen, voices, personality, knowledge sources).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | varchar | PK | |
| `name` | text | | Display name |
| `description` | text | | Bio/description |
| `profile_image_url` | text | | Avatar thumbnail |
| `streaming_platform` | text | | `'liveavatar'` or `'heygen'` |
| `interactive_voice_source` | text | | `'elevenlabs'`, `'heygen'`, or `'liveavatar'` |
| `heygen_avatar_id` | text | | For HeyGen streaming |
| `live_avatar_id` | text | | LiveAvatar platform ID |
| `heygen_video_avatar_id` | text | | For video generation (Instant Avatars) |
| `heygen_voice_id` | text | | HeyGen streaming voice |
| `heygen_video_voice_id` | text | | HeyGen video voice |
| `elevenlabs_voice_id` | text | | ElevenLabs voice |
| `live_avatar_voice_id` | text | | LiveAvatar voice |
| `live_avatar_context_id` | text | | Required for FULL mode |
| `requires_full_mode` | boolean | | Some avatars only support FULL mode |
| `audio_only_voice_id` | text | | Dedicated ElevenLabs voice for audio-only |
| `language_code` | text | | BCP-47 (e.g. `en-US`) |
| `elevenlabs_language_code` | text | | ElevenLabs code (e.g. `en`) |
| `personality_prompt` | text | | AI personality definition |
| `pinecone_namespaces` | text[] | | RAG knowledge sources |
| `tags` | text[] | | |
| `use_pubmed` | boolean | | Enable PubMed research |
| `use_wikipedia` | boolean | | Enable Wikipedia research |
| `use_google_search` | boolean | | Enable Google Search |
| `enable_audio_mode` | boolean | | |
| `enable_video_mode` | boolean | | |
| `enable_video_creation` | boolean | | |
| `loading_animation_url` | text | | Custom loading video |
| `is_active` | boolean | | Show in avatar list |
| `sort_order` | integer | | Display order |
| `heygen_knowledge_id` | text | | |
| `voice_rate` | text | default `'1.0'` | Speech rate |

## api_calls

API call latency tracking.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | varchar | PK | |
| `service_name` | varchar | | |
| `endpoint` | text | | |
| `user_id` | varchar | FK → users.id | |
| `response_time_ms` | integer | | |
| `timestamp` | timestamp | default now | |

## heygen_credit_usage

HeyGen credit consumption log.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | varchar | PK | |
| `user_id` | varchar | FK → users.id | |
| `operation` | varchar | | `'token_generation'`, `'streaming_session'`, etc. |
| `credits_used` | integer | | |
| `successful` | boolean | | |
| `timestamp` | timestamp | default now | |

## knowledge_base_sources

Personal knowledge base connections.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | varchar | PK | |
| `user_id` | varchar | FK → users.id | |
| `type` | varchar | | `'notion'`, `'obsidian'`, `'manual'` |
| `name` | text | | |
| `pinecone_namespace` | varchar | unique | |
| `config` | jsonb | | Source-specific config |
| `status` | varchar | | `active`, `syncing`, `error`, `disabled` |
| `last_sync_at` | timestamp | | |
| `sync_error` | text | | |
| `items_count` | integer | | |
| `created_at` | timestamp | default now | |
| `updated_at` | timestamp | default now | |

## courses

User-created video courses.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | varchar | PK | |
| `user_id` | varchar | | No FK (anon users allowed) |
| `title` | text | | |
| `description` | text | | |
| `avatar_id` | varchar | FK → avatar_profiles.id | |
| `status` | varchar | | `draft`, `generating`, `completed`, `failed` |
| `thumbnail_url` | text | | |
| `total_lessons` | integer | | |
| `total_duration` | integer | | In seconds |
| `created_at` | timestamp | default now | |
| `updated_at` | timestamp | default now | |

## lessons

Course lessons with avatar scripts.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | varchar | PK | |
| `course_id` | varchar | FK → courses.id, CASCADE | |
| `title` | text | | |
| `script` | text | | Avatar speech script |
| `order` | integer | | Lesson order |
| `duration` | integer | | Estimated seconds |
| `status` | varchar | | `pending`, `generating`, `completed`, `failed` |
| `error_message` | text | | |
| `created_at` | timestamp | default now | |
| `updated_at` | timestamp | default now | |

## generated_videos

HeyGen-generated lesson videos.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | varchar | PK | |
| `lesson_id` | varchar | FK → lessons.id, CASCADE | |
| `heygen_video_id` | text | | HeyGen generation job ID |
| `video_url` | text | | |
| `thumbnail_url` | text | | |
| `duration` | integer | | Actual seconds |
| `status` | varchar | | `queued`, `generating`, `completed`, `failed` |
| `test_video` | boolean | | Watermarked test video flag |
| `error_message` | text | | |
| `metadata` | jsonb | | HeyGen metadata |
| `created_at` | timestamp | default now | |
| `generated_at` | timestamp | | |

## chat_generated_videos

Videos generated from chat conversations.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | varchar | PK | |
| `user_id` | varchar | | |
| `avatar_id` | varchar | | |
| `request_text` | text | | User's request |
| `topic` | text | | |
| `script` | text | | Generated script |
| `heygen_video_id` | text | | |
| `video_url` | text | | |
| `thumbnail_url` | text | | |
| `duration` | integer | | |
| `status` | varchar | | Same as generated_videos |
| `test_video` | boolean | | |
| `error_message` | text | | |
| `metadata` | jsonb | | |
| `created_at` | timestamp | default now | |
| `generated_at` | timestamp | | |

## subscription_plans

Plan definitions.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `slug` | varchar | PK | `'free'`, `'basic'`, `'pro'` |
| `price_monthly` | integer | | In cents |
| `duration_hours` | integer | | Free trial length |
| `avatar_limit` | integer | | 1 for free/basic, null = unlimited |
| `video_limit` | integer | | Monthly limit |
| `course_limit` | integer | | Monthly limit |
| `course_lesson_limit` | integer | | Per-course limit |
| `chat_session_limit` | integer | | Monthly limit |
| `memberstack_plan_id` | varchar | | Memberstack integration |
| `features` | jsonb | | Feature flags |

## user_subscriptions

Active user subscriptions.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | varchar | PK | |
| `user_id` | varchar | FK → users.id | |
| `plan_slug` | varchar | FK → subscription_plans.slug | |
| `status` | varchar | | `active`, `cancelled`, `expired` |
| `selected_avatar_id` | varchar | | For limited plans |
| `expires_at` | timestamp | | |
| `renews_at` | timestamp | | |
| `cancelled_at` | timestamp | | |
| `memberstack_subscription_id` | varchar | | |
| `created_at` | timestamp | default now | |
| `updated_at` | timestamp | default now | |

## usage_periods

Per-billing-period usage tracking.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | varchar | PK | |
| `user_id` | varchar | FK → users.id | |
| `period_start` | timestamp | | |
| `period_end` | timestamp | | |
| `videos_created` | integer | default 0 | |
| `courses_created` | integer | default 0 | |
| `chat_sessions_used` | integer | default 0 | |
| `mood_entries_logged` | integer | default 0 | |
| `credits_used` | integer | default 0 | |

## mood_entries

Mood tracker entries.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | varchar | PK | |
| `user_id` | varchar | FK → users.id | |
| `avatar_id` | varchar | | |
| `mood` | varchar | | `joyful`, `calm`, `energized`, `anxious`, `sad`, `stressed`, `neutral` |
| `intensity` | integer | | 1–5 |
| `notes` | text | | Optional user notes |
| `avatar_response` | text | | AI-generated response |
| `created_at` | timestamp | default now | |

## podcast_batches

Batch podcast ingestion jobs.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | varchar | PK | |
| `status` | varchar | | `uploaded`, `classifying`, `classified`, `processing`, `completed`, `failed`, `cancelled` |
| `filename` | text | | ZIP filename |
| `total_episodes` | integer | | |
| `processed_episodes` | integer | | |
| `failed_episodes` | integer | | |
| `distill_mode` | varchar | | `'chunks'` or `'mentor_memory'` |
| `errors` | jsonb | | |
| `created_at` | timestamp | default now | |
| `updated_at` | timestamp | default now | |

## podcast_episodes

Individual podcast episodes in a batch.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | varchar | PK | |
| `batch_id` | varchar | FK → podcast_batches.id | |
| `filename` | text | | |
| `title` | text | | |
| `status` | varchar | | `pending`, `classifying`, `classified`, `processing`, `completed`, `failed` |
| `namespace` | varchar | | Target Pinecone namespace |
| `auto_namespace` | varchar | | AI-classified namespace |
| `chunks_created` | integer | | |
| `vectors_upserted` | integer | | |
| `error` | text | | |
| `transcript_preview` | text | | First ~500 chars |
| `created_at` | timestamp | default now | |
| `updated_at` | timestamp | default now | |
