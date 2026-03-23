-- Generated media items (playlists, audio, etc.)
CREATE TABLE IF NOT EXISTS "generated_media" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL,
  "type" varchar NOT NULL DEFAULT 'playlist',
  "source" varchar NOT NULL DEFAULT 'avatar',
  "avatar_name" varchar,
  "title" text NOT NULL,
  "subtitle" text,
  "description" text,
  "thumbnail_url" text,
  "external_url" text,
  "provider" varchar DEFAULT 'spotify',
  "provider_id" varchar,
  "status" varchar NOT NULL DEFAULT 'queued',
  "metadata_json" jsonb,
  "conversation_id" varchar,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Spotify OAuth tokens (encrypted at rest)
CREATE TABLE IF NOT EXISTS "spotify_tokens" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL UNIQUE,
  "access_token" text NOT NULL,
  "refresh_token" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "scopes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS "idx_generated_media_user_id" ON "generated_media" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_generated_media_status" ON "generated_media" ("status");
CREATE INDEX IF NOT EXISTS "idx_spotify_tokens_user_id" ON "spotify_tokens" ("user_id");
