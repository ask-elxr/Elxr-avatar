import crypto from "crypto";
import { db } from "../db";
import { spotifyTokens } from "@shared/schema";
import { eq } from "drizzle-orm";
import { logger } from "../logger";

const log = logger.child({ service: "spotify" });

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID?.trim();
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET?.trim();
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI?.trim();
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY?.trim(); // 32-byte hex key

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

// Required scopes for playlist creation
const SCOPES = ["playlist-modify-public", "playlist-modify-private", "user-read-private"];

// --- Token encryption ---

function encrypt(text: string): string {
  if (!ENCRYPTION_KEY) return text; // Fallback: no encryption in dev
  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(text: string): string {
  if (!ENCRYPTION_KEY) return text;
  const [ivHex, encrypted] = text.split(":");
  if (!ivHex || !encrypted) return text;
  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// --- Spotify OAuth ---

export function getConnectUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID!,
    response_type: "code",
    redirect_uri: SPOTIFY_REDIRECT_URI!,
    scope: SCOPES.join(" "),
    state,
  });
  return `${SPOTIFY_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI!,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Spotify token exchange failed: ${err}`);
  }
  return res.json();
}

async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}> {
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Spotify token refresh failed: ${err}`);
  }
  return res.json();
}

// --- Token storage ---

export async function saveTokens(
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  scopes?: string,
): Promise<void> {
  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  const encAccess = encrypt(accessToken);
  const encRefresh = encrypt(refreshToken);

  const existing = await db
    .select()
    .from(spotifyTokens)
    .where(eq(spotifyTokens.userId, userId));

  if (existing.length > 0) {
    await db
      .update(spotifyTokens)
      .set({
        accessToken: encAccess,
        refreshToken: encRefresh,
        expiresAt,
        scopes: scopes || SCOPES.join(" "),
        updatedAt: new Date(),
      })
      .where(eq(spotifyTokens.userId, userId));
  } else {
    await db.insert(spotifyTokens).values({
      userId,
      accessToken: encAccess,
      refreshToken: encRefresh,
      expiresAt,
      scopes: scopes || SCOPES.join(" "),
    });
  }
  log.info({ userId }, "Spotify tokens saved");
}

export async function getValidAccessToken(userId: string, forceRefresh?: boolean): Promise<string | null> {
  const [row] = await db
    .select()
    .from(spotifyTokens)
    .where(eq(spotifyTokens.userId, userId));

  if (!row) return null;

  // Token still valid (with 60s buffer) and no force refresh
  if (!forceRefresh && row.expiresAt.getTime() > Date.now() + 60_000) {
    return decrypt(row.accessToken);
  }

  // Refresh the token
  try {
    const refreshToken = decrypt(row.refreshToken);
    const result = await refreshAccessToken(refreshToken);
    await saveTokens(
      userId,
      result.access_token,
      result.refresh_token || refreshToken,
      result.expires_in,
    );
    log.info({ userId }, "Spotify token refreshed successfully");
    return result.access_token;
  } catch (err) {
    log.error({ userId, err }, "Failed to refresh Spotify token");
    return null;
  }
}

export async function isConnected(userId: string): Promise<boolean> {
  const [row] = await db
    .select()
    .from(spotifyTokens)
    .where(eq(spotifyTokens.userId, userId));
  return !!row;
}

export async function disconnectUser(userId: string): Promise<void> {
  await db.delete(spotifyTokens).where(eq(spotifyTokens.userId, userId));
}

// --- Spotify API helpers ---

async function spotifyFetch(
  accessToken: string,
  path: string,
  options: RequestInit = {},
  _retried?: boolean,
): Promise<any> {
  const url = path.startsWith("http") ? path : `${SPOTIFY_API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("Retry-After") || "2", 10);
    log.warn({ retryAfter }, "Spotify rate limited, waiting");
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return spotifyFetch(accessToken, path, options);
  }
  // On 401, try refreshing the admin token once
  if (res.status === 401 && !_retried) {
    log.warn("Spotify 401 — attempting token refresh for spotify_admin");
    const newToken = await getValidAccessToken("spotify_admin", true);
    if (newToken && newToken !== accessToken) {
      return spotifyFetch(newToken, path, options, true);
    }
  }
  if (!res.ok) {
    const err = await res.text();
    log.error({ status: res.status, path, errorBody: err }, "Spotify API error");
    throw new Error(`Spotify API error ${res.status}: ${err}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
  uri: string;
  duration_ms: number;
  popularity: number;
  preview_url: string | null;
  explicit: boolean;
  external_urls: { spotify: string };
}

export async function searchTracks(
  accessToken: string,
  query: string,
  limit: number = 20,
): Promise<SpotifyTrack[]> {
  const params = new URLSearchParams({
    q: query,
    type: "track",
    limit: String(Math.min(limit, 50)),
  });
  const data = await spotifyFetch(accessToken, `/search?${params.toString()}`);
  return data?.tracks?.items || [];
}

export async function createPlaylist(
  accessToken: string,
  name: string,
  description: string,
  isPublic: boolean = false,
): Promise<{ id: string; external_urls: { spotify: string } }> {
  // Get current user ID
  const me = await spotifyFetch(accessToken, "/me");
  const playlist = await spotifyFetch(accessToken, `/users/${me.id}/playlists`, {
    method: "POST",
    body: JSON.stringify({ name, description, public: isPublic }),
  });
  return playlist;
}

export async function addTracksToPlaylist(
  accessToken: string,
  playlistId: string,
  uris: string[],
): Promise<void> {
  // Spotify allows max 100 tracks per request
  for (let i = 0; i < uris.length; i += 100) {
    const batch = uris.slice(i, i + 100);
    await spotifyFetch(accessToken, `/playlists/${playlistId}/tracks`, {
      method: "POST",
      body: JSON.stringify({ uris: batch }),
    });
  }
}

export function isConfigured(): boolean {
  return !!(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET && SPOTIFY_REDIRECT_URI);
}
