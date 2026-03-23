import { db } from "../db";
import { generatedMedia } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "../logger";
import * as spotify from "./spotify";
import {
  generatePlaylistSpec,
  generateImagePrompt,
  type PlaylistSpec,
} from "./playlistGeneration";
import { generatePlaylistImage, getFallbackGradient } from "./playlistImage";

const log = logger.child({ service: "playlistOrchestrator" });

interface GeneratePlaylistInput {
  userId: string;
  conversationContext: string;
  avatarName: string;
  conversationId?: string;
  overrideGoal?: string;
  overrideDuration?: number;
  overrideMood?: string;
}

interface GeneratePlaylistResult {
  mediaItemId: string;
  title: string;
  thumbnailUrl: string | null;
  externalUrl: string | null;
  provider: string;
  status: string;
}

/**
 * Orchestrate the full playlist generation pipeline:
 * 1. Generate playlist spec from conversation context via LLM
 * 2. Create a DB record (status: generating)
 * 3. Search Spotify for tracks
 * 4. Create Spotify playlist and add tracks
 * 5. Generate mood image
 * 6. Update DB record with final data
 */
export async function generatePlaylist(
  input: GeneratePlaylistInput,
): Promise<GeneratePlaylistResult> {
  const {
    userId,
    conversationContext,
    avatarName,
    conversationId,
    overrideGoal,
    overrideDuration,
    overrideMood,
  } = input;

  // Step 1: Generate playlist spec
  log.info({ userId, avatarName }, "Generating playlist spec");
  const spec = await generatePlaylistSpec(conversationContext, {
    goal: overrideGoal,
    duration: overrideDuration,
    mood: overrideMood,
  });
  log.info({ title: spec.title, tracks: spec.seedSearches.length }, "Playlist spec generated");

  // Step 2: Create initial DB record
  const [mediaItem] = await db
    .insert(generatedMedia)
    .values({
      userId,
      type: "playlist",
      source: "avatar",
      avatarName,
      title: spec.title,
      subtitle: spec.subtitle,
      description: spec.avatarExplanation,
      status: "generating",
      provider: "spotify",
      conversationId,
      metadataJson: {
        playlistSpec: spec,
        moodTags: spec.moodTags,
        durationMinutes: spec.durationMinutes,
        generationStatus: "searching_tracks",
      },
    })
    .returning();

  const mediaItemId = mediaItem.id;

  try {
    // Step 3: Check Spotify connection — always use the admin Spotify account
    const spotifyUserId = "spotify_admin";
    const spotifyConnected = await spotify.isConnected(spotifyUserId);
    log.info({ userId, spotifyUserId, spotifyConnected }, "Spotify connection check");
    let externalUrl: string | null = null;
    let providerId: string | null = null;
    let trackCount = 0;
    let trackPreviews: any[] = [];
    let searchErrors = 0;
    let searchErrorDetails: string[] = [];

    if (spotifyConnected) {
      const accessToken = await spotify.getValidAccessToken(spotifyUserId);
      log.info({ spotifyUserId, hasToken: !!accessToken }, "Spotify access token check");
      if (!accessToken) {
        log.error({ userId }, "Spotify connected but token invalid/expired — cannot create playlist");
      }
      if (accessToken) {
        // Search for tracks using seed queries
        log.info({ seeds: spec.seedSearches.length, queries: spec.seedSearches, tokenLen: accessToken.length }, "Searching Spotify tracks");
        const allCandidates: spotify.SpotifyTrack[] = [];
        const seen = new Set<string>();
        searchErrors = 0;
        searchErrorDetails = [];

        for (const query of spec.seedSearches) {
          try {
            const tracks = await spotify.searchTracks(accessToken, query, 10);
            log.info({ query, results: tracks.length }, "Spotify search result");
            for (const track of tracks) {
              if (!seen.has(track.id)) {
                seen.add(track.id);
                allCandidates.push(track);
              }
            }
          } catch (err: any) {
            searchErrors++;
            searchErrorDetails.push(`${query}: ${err.message}`);
            log.error({ query, err: err.message }, "Spotify search query failed");
          }
        }

        log.info({ candidates: allCandidates.length, searchErrors }, "Total candidate tracks found");

        // If not enough tracks, broaden search
        if (allCandidates.length < 12) {
          const broadenedQueries = spec.moodTags.map((tag) => `${tag} music`);
          for (const query of broadenedQueries) {
            try {
              const tracks = await spotify.searchTracks(accessToken, query, 10);
              for (const track of tracks) {
                if (!seen.has(track.id)) {
                  seen.add(track.id);
                  allCandidates.push(track);
                }
              }
            } catch {
              // Continue on failure
            }
          }
        }

        // Rank and select tracks
        const ranked = rankTracks(allCandidates, spec);
        const targetTracks = calculateTrackCount(spec.durationMinutes);
        const selected = ranked.slice(0, targetTracks);
        log.info({ ranked: ranked.length, targetTracks, selected: selected.length }, "Track selection");

        if (selected.length > 0) {
          // Create the Spotify playlist
          log.info({ trackCount: selected.length }, "Creating Spotify playlist");
          const playlist = await spotify.createPlaylist(
            accessToken,
            spec.title,
            `${spec.subtitle} — Created by ${avatarName} on MUM`,
            false, // Private by default
          );

          await spotify.addTracksToPlaylist(
            accessToken,
            playlist.id,
            selected.map((t) => t.uri),
          );

          externalUrl = playlist.external_urls.spotify;
          providerId = playlist.id;
          trackCount = selected.length;
          trackPreviews = selected.slice(0, 10).map((t) => ({
            name: t.name,
            artist: t.artists.map((a) => a.name).join(", "),
            albumArt: t.album.images[0]?.url,
            duration_ms: t.duration_ms,
          }));

          log.info({ playlistId: playlist.id, trackCount, externalUrl }, "Spotify playlist created");
        } else {
          log.warn({ candidates: allCandidates.length }, "No tracks selected — playlist will be preview_only");
        }
      }
    }

    // Step 4: Update status
    await db
      .update(generatedMedia)
      .set({
        metadataJson: {
          ...(mediaItem.metadataJson as any),
          playlistSpec: spec,
          generationStatus: "generating_image",
          spotifyTrackCount: trackCount,
          trackPreviews,
        },
        updatedAt: new Date(),
      })
      .where(eq(generatedMedia.id, mediaItemId));

    // Step 5: Generate mood image
    log.info("Generating playlist cover image");
    const imagePrompt = generateImagePrompt(spec);
    let thumbnailUrl = await generatePlaylistImage(imagePrompt);

    // Use gradient fallback if image generation fails
    const fallbackGradient = !thumbnailUrl ? getFallbackGradient(spec.moodTags) : null;

    // Step 6: Final update
    const finalStatus = spotifyConnected && externalUrl ? "created" : "preview_only";
    log.info({ mediaItemId, finalStatus, spotifyConnected, hasExternalUrl: !!externalUrl, trackCount }, "Final status determination");

    await db
      .update(generatedMedia)
      .set({
        status: finalStatus,
        thumbnailUrl,
        externalUrl,
        providerId,
        metadataJson: {
          playlistSpec: spec,
          moodTags: spec.moodTags,
          durationMinutes: spec.durationMinutes,
          spotifyTrackCount: trackCount,
          trackPreviews,
          generationStatus: "complete",
          fallbackGradient,
          conversationId,
        },
        updatedAt: new Date(),
      })
      .where(eq(generatedMedia.id, mediaItemId));

    log.info({ mediaItemId, status: finalStatus }, "Playlist generation complete");

    return {
      mediaItemId,
      title: spec.title,
      thumbnailUrl,
      externalUrl,
      provider: "spotify",
      status: finalStatus,
      // Debug info
      _debug: { spotifyConnected, trackCount, hasExternalUrl: !!externalUrl, userId, seedSearches: spec.seedSearches, searchErrors: searchErrors ?? 0, searchErrorDetails: searchErrorDetails ?? [] },
    };
  } catch (err) {
    log.error({ mediaItemId, err }, "Playlist generation failed");

    // Mark as failed but preserve whatever we have
    await db
      .update(generatedMedia)
      .set({
        status: "failed",
        metadataJson: {
          ...(mediaItem.metadataJson as any),
          generationStatus: "failed",
          error: err instanceof Error ? err.message : "Unknown error",
        },
        updatedAt: new Date(),
      })
      .where(eq(generatedMedia.id, mediaItemId));

    throw err;
  }
}

/**
 * Regenerate a playlist using the same context but fresh tracks/image.
 */
export async function regeneratePlaylist(
  mediaItemId: string,
  userId: string,
): Promise<GeneratePlaylistResult> {
  // Try exact userId match first, then fall back to just the mediaItemId
  // This handles userId format mismatches (e.g., ms_mem_xxx vs temp_xxx)
  let [existing] = await db
    .select()
    .from(generatedMedia)
    .where(and(eq(generatedMedia.id, mediaItemId), eq(generatedMedia.userId, userId)));

  if (!existing) {
    // Fall back: find by ID only (the item might have been created with a different userId format)
    [existing] = await db
      .select()
      .from(generatedMedia)
      .where(eq(generatedMedia.id, mediaItemId));
  }

  if (!existing) throw new Error("Media item not found");

  const metadata = existing.metadataJson as any;
  const spec = metadata?.playlistSpec as PlaylistSpec;
  if (!spec) throw new Error("No playlist spec found for regeneration");

  // Create a new media item with the same conversation context
  return generatePlaylist({
    userId,
    conversationContext: `Previous playlist: ${spec.title} — ${spec.goal}. Mood: ${spec.moodTags.join(", ")}. Energy: ${spec.energyCurve}. Please create a fresh variation.`,
    avatarName: existing.avatarName || "MUM",
    conversationId: metadata?.conversationId,
  });
}

// --- Track ranking ---

function rankTracks(
  tracks: spotify.SpotifyTrack[],
  spec: PlaylistSpec,
): spotify.SpotifyTrack[] {
  // Simple ranking: prefer moderate popularity, non-explicit, reasonable duration
  return [...tracks].sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;

    // Prefer tracks with 20-70 popularity (not too obscure, not too mainstream)
    if (a.popularity >= 20 && a.popularity <= 70) scoreA += 2;
    if (b.popularity >= 20 && b.popularity <= 70) scoreB += 2;

    // Prefer non-explicit for wellness context
    if (!a.explicit) scoreA += 1;
    if (!b.explicit) scoreB += 1;

    // Prefer tracks between 2-6 minutes
    const durA = a.duration_ms / 60000;
    const durB = b.duration_ms / 60000;
    if (durA >= 2 && durA <= 6) scoreA += 1;
    if (durB >= 2 && durB <= 6) scoreB += 1;

    // Prefer tracks with preview URLs (indicates availability)
    if (a.preview_url) scoreA += 0.5;
    if (b.preview_url) scoreB += 0.5;

    return scoreB - scoreA;
  });
}

function calculateTrackCount(durationMinutes: number): number {
  // Average track ~3.5 minutes
  const estimated = Math.round(durationMinutes / 3.5);
  return Math.max(8, Math.min(estimated, 25));
}
