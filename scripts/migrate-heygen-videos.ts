/**
 * Migration script: Persist expiring HeyGen video URLs to GCS.
 *
 * Scans `generated_videos` and `chat_generated_videos` for rows whose
 * videoUrl still points at HeyGen's CloudFront CDN.  For each, it attempts
 * to download the video and re-upload it to GCS under `processed_videos/`.
 *
 * Usage:
 *   npx tsx scripts/migrate-heygen-videos.ts            # live run
 *   npx tsx scripts/migrate-heygen-videos.ts --dry-run   # report only
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, like, isNull, and } from "drizzle-orm";
import ws from "ws";
import * as schema from "../shared/schema";
import { persistVideoFromUrl, isConfigured as isGcsConfigured } from "../server/assetStorage";

// Load .env
const envPath = resolve(import.meta.dirname, "..", ".env");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      let value = match[2].trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      // Convert double-escaped \\n to single \n (common in .env private keys)
      value = value.replace(/\\\\n/g, "\\n");
      process.env[match[1].trim()] = value;
    }
  }
} catch {}

neonConfig.webSocketConstructor = ws;

// ── DB setup (mirrors server/db.ts) ─────────────────────────────────
let databaseUrl = process.env.DATABASE_URL;
if (databaseUrl) databaseUrl = databaseUrl.replace(/^['"]|['"]$/g, "").trim();
if (!databaseUrl || !databaseUrl.startsWith("postgresql://")) {
  const { PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT } = process.env;
  if (PGHOST && PGUSER && PGPASSWORD && PGDATABASE) {
    const port = PGPORT || "5432";
    databaseUrl = `postgresql://${PGUSER}:${encodeURIComponent(PGPASSWORD)}@${PGHOST}:${port}/${PGDATABASE}?sslmode=require`;
  }
}
if (!databaseUrl) {
  console.error("❌ DATABASE_URL must be set.");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle({ client: pool, schema });

const DRY_RUN = process.argv.includes("--dry-run");

// ── Helpers ─────────────────────────────────────────────────────────
function isHeygenUrl(url: string | null | undefined): boolean {
  return !!url && (url.includes("heygen.ai") || url.includes("heygen.com"));
}

function extractExpiry(url: string): Date | null {
  const match = url.match(/Expires=(\d+)/);
  return match ? new Date(Number(match[1]) * 1000) : null;
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  HeyGen → GCS Video Migration${DRY_RUN ? " (DRY RUN)" : ""}`);
  console.log(`${"=".repeat(60)}\n`);

  if (!DRY_RUN && !isGcsConfigured()) {
    console.error("❌ GCS not configured (missing GCS_* env vars). Cannot upload.");
    process.exit(1);
  }

  // ── 1. Course videos (generated_videos) ──────────────────────────
  console.log("📹 Scanning course videos (generated_videos)...\n");

  const courseVideos = await db
    .select()
    .from(schema.generatedVideos)
    .where(
      and(
        like(schema.generatedVideos.videoUrl, "%heygen.ai%"),
        isNull(schema.generatedVideos.processedVideoUrl),
        eq(schema.generatedVideos.status, "completed"),
      )
    );

  console.log(`  Found ${courseVideos.length} course video(s) with HeyGen URLs and no processedVideoUrl\n`);

  let courseMigrated = 0;
  let courseSkipped = 0;
  let courseFailed = 0;

  for (const video of courseVideos) {
    const expiry = video.videoUrl ? extractExpiry(video.videoUrl) : null;
    const isExpired = expiry && expiry < new Date();
    const expiryStr = expiry ? expiry.toISOString() : "unknown";

    console.log(`  ─── Course Video: ${video.id} ───`);
    console.log(`    Lesson ID:    ${video.lessonId}`);
    console.log(`    HeyGen ID:    ${video.heygenVideoId || "N/A"}`);
    console.log(`    URL expires:  ${expiryStr}${isExpired ? " ⚠️  EXPIRED" : " ✅ still valid"}`);
    console.log(`    Video URL:    ${video.videoUrl?.substring(0, 80)}...`);

    if (DRY_RUN) {
      console.log(`    Action:       ${isExpired ? "SKIP (expired)" : "WOULD MIGRATE"}\n`);
      if (isExpired) courseSkipped++;
      else courseMigrated++;
      continue;
    }

    if (isExpired) {
      console.log(`    Action:       SKIPPED (URL expired)\n`);
      courseSkipped++;
      continue;
    }

    try {
      const gcsUrl = await persistVideoFromUrl(
        video.videoUrl!,
        `lesson-${video.lessonId}-${video.heygenVideoId || video.id}.mp4`,
      );

      await db
        .update(schema.generatedVideos)
        .set({ processedVideoUrl: gcsUrl })
        .where(eq(schema.generatedVideos.id, video.id));

      console.log(`    Action:       ✅ MIGRATED → ${gcsUrl}\n`);
      courseMigrated++;
    } catch (err: any) {
      console.log(`    Action:       ❌ FAILED — ${err.message}\n`);
      courseFailed++;
    }
  }

  // ── 2. Chat videos (chat_generated_videos) ───────────────────────
  console.log("\n💬 Scanning chat videos (chat_generated_videos)...\n");

  const chatVideos = await db
    .select()
    .from(schema.chatGeneratedVideos)
    .where(
      and(
        like(schema.chatGeneratedVideos.videoUrl, "%heygen.ai%"),
        eq(schema.chatGeneratedVideos.status, "completed"),
      )
    );

  console.log(`  Found ${chatVideos.length} chat video(s) with HeyGen URLs\n`);

  let chatMigrated = 0;
  let chatSkipped = 0;
  let chatFailed = 0;

  for (const video of chatVideos) {
    const expiry = video.videoUrl ? extractExpiry(video.videoUrl) : null;
    const isExpired = expiry && expiry < new Date();
    const expiryStr = expiry ? expiry.toISOString() : "unknown";

    console.log(`  ─── Chat Video: ${video.id} ───`);
    console.log(`    User ID:      ${video.userId}`);
    console.log(`    Avatar:       ${video.avatarId}`);
    console.log(`    Topic:        ${video.topic}`);
    console.log(`    HeyGen ID:    ${video.heygenVideoId || "N/A"}`);
    console.log(`    URL expires:  ${expiryStr}${isExpired ? " ⚠️  EXPIRED" : " ✅ still valid"}`);
    console.log(`    Video URL:    ${video.videoUrl?.substring(0, 80)}...`);

    if (DRY_RUN) {
      console.log(`    Action:       ${isExpired ? "SKIP (expired)" : "WOULD MIGRATE"}\n`);
      if (isExpired) chatSkipped++;
      else chatMigrated++;
      continue;
    }

    if (isExpired) {
      console.log(`    Action:       SKIPPED (URL expired)\n`);
      chatSkipped++;
      continue;
    }

    try {
      const gcsUrl = await persistVideoFromUrl(
        video.videoUrl!,
        `chat-${video.id}-${video.heygenVideoId || Date.now()}.mp4`,
      );

      await db
        .update(schema.chatGeneratedVideos)
        .set({ videoUrl: gcsUrl })
        .where(eq(schema.chatGeneratedVideos.id, video.id));

      console.log(`    Action:       ✅ MIGRATED → ${gcsUrl}\n`);
      chatMigrated++;
    } catch (err: any) {
      console.log(`    Action:       ❌ FAILED — ${err.message}\n`);
      chatFailed++;
    }
  }

  // ── Summary ──────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  SUMMARY${DRY_RUN ? " (DRY RUN)" : ""}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  Course videos:  ${courseMigrated} migrated, ${courseSkipped} skipped (expired), ${courseFailed} failed`);
  console.log(`  Chat videos:    ${chatMigrated} migrated, ${chatSkipped} skipped (expired), ${chatFailed} failed`);
  console.log(`  Total:          ${courseMigrated + chatMigrated} migrated, ${courseSkipped + chatSkipped} skipped, ${courseFailed + chatFailed} failed`);
  console.log(`${"=".repeat(60)}\n`);

  await pool.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
