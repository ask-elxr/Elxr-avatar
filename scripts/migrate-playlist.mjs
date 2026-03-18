import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

// Manual .env parsing (no dotenv dependency needed)
const envContent = readFileSync(new URL('../.env', import.meta.url), 'utf-8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2];
  }
}

const sql = neon(process.env.DATABASE_URL);

async function migrate() {
  await sql`
    CREATE TABLE IF NOT EXISTS generated_media (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id varchar NOT NULL,
      type varchar NOT NULL DEFAULT 'playlist',
      source varchar NOT NULL DEFAULT 'avatar',
      avatar_name varchar,
      title text NOT NULL,
      subtitle text,
      description text,
      thumbnail_url text,
      external_url text,
      provider varchar DEFAULT 'spotify',
      provider_id varchar,
      status varchar NOT NULL DEFAULT 'queued',
      metadata_json jsonb,
      conversation_id varchar,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    )
  `;
  console.log('✅ generated_media table created');

  await sql`
    CREATE TABLE IF NOT EXISTS spotify_tokens (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id varchar NOT NULL UNIQUE,
      access_token text NOT NULL,
      refresh_token text NOT NULL,
      expires_at timestamp NOT NULL,
      scopes text,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    )
  `;
  console.log('✅ spotify_tokens table created');

  await sql`CREATE INDEX IF NOT EXISTS idx_generated_media_user_id ON generated_media (user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_generated_media_status ON generated_media (status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_spotify_tokens_user_id ON spotify_tokens (user_id)`;
  console.log('✅ Indexes created');
}

migrate().then(() => {
  console.log('🎉 Migration complete!');
  process.exit(0);
}).catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
