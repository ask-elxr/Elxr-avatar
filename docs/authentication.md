# Authentication System

Complete reference for the Elxrai authentication architecture — how it used to work on Replit, the migration to Railway, and how it works today.

---

## Table of Contents

- [Overview](#overview)
- [How Auth Worked on Replit (Before)](#how-auth-worked-on-replit-before)
- [Migration to Railway (What Changed)](#migration-to-railway-what-changed)
- [Current Auth Architecture](#current-auth-architecture)
- [Three Access Models](#three-access-models)
- [Backend Middleware](#backend-middleware)
- [Session and Cookie Strategy](#session-and-cookie-strategy)
- [CORS and Iframe Embedding](#cors-and-iframe-embedding)
- [Frontend Auth Helpers](#frontend-auth-helpers)
- [WebSocket Authentication](#websocket-authentication)
- [Webflow + Memberstack Integration](#webflow--memberstack-integration)
- [Embed Routes](#embed-routes)
- [Database Schema](#database-schema)
- [Subscription and Billing](#subscription-and-billing)
- [Security Considerations](#security-considerations)
- [Local Development](#local-development)
- [File Reference](#file-reference)

---

## Overview

The app is designed to be **embedded in Webflow sites via iframes**. Authentication is handled externally by **Memberstack** (Webflow's membership/billing platform), which passes a `member_id` into the iframe URL. The backend uses this ID for user identification, chat history, memory persistence, and subscription management.

There are three access levels:
1. **Memberstack users** — identified by `X-Member-Id` header, can use all AI features
2. **Admin users** — identified by `X-Admin-Secret` header, full access including admin panel
3. **Anonymous guests** — can browse but cannot trigger AI endpoints (Claude, TTS, video)

---

## How Auth Worked on Replit (Before)

When hosted on Replit, the app used **Replit OIDC** (OpenID Connect) as its primary authentication provider. The old `server/replitAuth.ts` file (now deleted) contained:

### Replit OIDC Flow

1. **OIDC Discovery**: Connected to `https://replit.com/oidc` using the `openid-client` library
2. **Passport Strategies**: Created a Passport.js strategy for each domain in `REPLIT_DOMAINS` (comma-separated)
3. **Login**: `GET /api/login` redirected to Replit's OIDC authorization endpoint with scopes `openid email profile offline_access`
4. **Callback**: `GET /api/callback` handled the OIDC callback, extracted user claims (sub, email, first_name, last_name, profile_image_url), and created/updated the user in the database
5. **Logout**: `GET /api/logout` destroyed the session and redirected to Replit's end-session URL
6. **Session Serialization**: Passport serialized the full user object (claims + tokens) into the session

### Dependencies Used (Now Removed)

| Package | Purpose |
|---------|---------|
| `openid-client` | OIDC discovery and token exchange with Replit |
| `passport` | Authentication framework, strategy management |
| `memoizee` | Cached OIDC config discovery (1-hour TTL) |
| `@types/passport` | TypeScript types for Express.User augmentation |

### Key Functions (Now Deleted)

- `getOidcConfig()` — Memoized OIDC discovery from Replit
- `updateUserSession(user, tokens)` — Stored OIDC claims and tokens on the session
- `upsertUser(claims)` — Created or updated user in DB from OIDC claims
- Passport `serializeUser` / `deserializeUser` — Session serialization
- Passport strategies per-domain — One strategy per `REPLIT_DOMAINS` entry

### How It Worked with Webflow

Even on Replit, the primary user-facing auth was Memberstack (not Replit OIDC). Replit OIDC was used for:
- Admin users who accessed the app directly (not through Webflow)
- The `req.isAuthenticated()` check in `requireAdmin` middleware

For Webflow-embedded users, the `isAuthenticated` middleware already created synthetic users from `X-Member-Id` headers, bypassing Replit OIDC entirely.

---

## Migration to Railway (What Changed)

**Migration date**: March 2026
**Branch**: `standalone`

### What Was Removed

1. **`server/replitAuth.ts`** — Deleted entirely, replaced by `server/auth.ts`
2. **Replit OIDC code** — All passport strategies, OIDC discovery, token management
3. **Dependencies** — `openid-client`, `passport`, `memoizee`, `@types/passport`
4. **`isReplit` flag** — No longer needed; the app always runs in non-Replit mode

### What Was Created

1. **`server/auth.ts`** — Clean auth module with only what's needed:
   - Session management (PostgreSQL-backed, same cookie config)
   - `isAuthenticated` middleware (unchanged logic)
   - `requireMemberstackOrAdmin` middleware (unchanged logic)
   - `requireAdmin` middleware (simplified: removed `req.isAuthenticated()` Passport call)
   - `isValidAdminSecret` helper (unchanged)
   - Express Request type augmentation for `req.user` (previously provided by `@types/passport`)
   - Stub routes: `/api/login`, `/api/callback`, `/api/logout` redirect to `/`

2. **Updated imports** — 7 files changed from `./replitAuth` to `./auth`:
   - `server/routes.ts`
   - `server/index.ts`
   - `server/services/auth.ts`
   - `server/conversationWsService.ts`
   - `server/routes/subscription.ts`
   - `server/routes/avatars.ts`
   - `server/routes/courses.ts`

### What Stayed the Same

- Session cookie configuration (`sameSite: 'none'`, `secure: true`)
- All three middleware functions (same logic)
- Frontend auth helpers (`getMemberstackId`, `getAuthHeaders`, `buildAuthenticatedWsUrl`)
- CORS configuration (`frame-ancestors *`)
- WebSocket auth via query params
- Memberstack webhook endpoint

---

## Current Auth Architecture

### End-to-End Flow

```
Webflow Site (Memberstack handles login UI)
  |
  |  User logs in via Memberstack widget
  |  Memberstack JS SDK provides member.id
  |
  v
<iframe src="https://[railway-domain]/embed/chat/dexter?member_id=mem_abc123">
  |
  |  React app loads inside iframe
  |
  v
Frontend (client/src/lib/queryClient.ts)
  |  getMemberstackId() reads ?member_id from URL
  |  Stores in localStorage for persistence
  |
  |--- HTTP requests: X-Member-Id header via getAuthHeaders()
  |--- WebSocket connects: ?member_id query param via buildAuthenticatedWsUrl()
  |
  v
Backend (server/auth.ts)
  |  isAuthenticated middleware:
  |    1. Reads X-Member-Id header or member_id query param
  |    2. Creates user with id "ms_{memberstackId}"
  |    3. Stores userId in session for continuity
  |
  |--- requireMemberstackOrAdmin: Gates AI endpoints
  |--- requireAdmin: Gates admin endpoints
  |
  v
Database (users table)
  |  User record keyed by "ms_{memberstackId}"
  |  Chat history, memory, subscriptions all tied to this ID
```

### Auth Decision Tree

```
Request arrives
  |
  +-- Has X-Admin-Secret header?
  |     +-- Valid? -> Admin access (all endpoints)
  |     +-- Invalid? -> Continue checking
  |
  +-- Has X-Member-Id header or ?member_id param?
  |     +-- Yes -> User ID = "ms_{memberstackId}" (AI endpoints allowed)
  |
  +-- Has existing session.userId?
  |     +-- Starts with "ms_"? -> Memberstack user (AI endpoints allowed)
  |     +-- Starts with "webflow_"? -> Anonymous (browsing only)
  |
  +-- Nothing? -> Generate "webflow_{timestamp}_{random}" (browsing only)
```

---

## Three Access Models

### 1. Memberstack Users (Primary)

- **Identification**: `X-Member-Id` header or `?member_id` URL parameter
- **User ID format**: `ms_{memberstackId}` (e.g., `ms_mem_abc123`)
- **Capabilities**: All AI features (chat, TTS, video generation), memory persistence, subscription management
- **Memory**: Always enabled for Memberstack users (hardcoded in `conversationWsService.ts`)
- **Session**: userId stored in PostgreSQL session for continuity across requests

### 2. Admin Users

- **Identification**: `X-Admin-Secret` header matching `ADMIN_SECRET` env var
- **Multi-secret support**: `ADMIN_SECRET` supports comma-separated values for secret rotation
- **Capabilities**: All endpoints including admin panel, knowledge management, avatar configuration
- **Fallback**: If no admin secret, checks `users.role === 'admin'` in database

### 3. Anonymous Guests

- **Identification**: No Memberstack ID or admin secret provided
- **User ID format**: `webflow_{timestamp}_{random}` (e.g., `webflow_1709654321_k7x9m2`)
- **Capabilities**: Browse avatars, view courses, read content — but cannot trigger AI endpoints
- **Blocked from**: Chat (Claude), TTS (ElevenLabs), video generation (HeyGen), WebSocket conversations
- **Error**: `401: "Authentication required to chat with avatars. Please log in."`

---

## Backend Middleware

All middleware is defined in `server/auth.ts`.

### `setupAuth(app)`

Initializes session management and registers stub auth routes.

```typescript
export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);        // Trust Railway's reverse proxy
  app.use(getSession());             // PostgreSQL-backed sessions

  app.get("/api/login", (_req, res) => res.redirect("/"));
  app.get("/api/callback", (_req, res) => res.redirect("/"));
  app.get("/api/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/"));
  });
}
```

The login/callback/logout routes are kept as simple redirects for compatibility (in case any bookmark or code references them).

### `isAuthenticated`

Applied to most API routes. **Never rejects** — instead creates a synthetic user for every request.

**Logic:**
1. If `req.user` already exists (shouldn't happen without Passport), skip
2. Read `X-Member-Id` header or `?member_id` query param
3. If Memberstack ID found: `userId = "ms_{id}"`, save to session
4. If session already has a userId: reuse it
5. Otherwise: generate `"webflow_{timestamp}_{random}"`, save to session
6. Set `req.user = { claims: { sub: userId, ... } }`
7. Always calls `next()` (never rejects)

### `requireMemberstackOrAdmin`

Applied to AI-powered endpoints (chat, TTS, video generation). **Rejects anonymous users**.

**Logic (in order):**
1. `TEST_MODE=true` on localhost? Pass through (dev bypass)
2. Valid `X-Admin-Secret`? Pass through
3. Has `X-Member-Id` or `?member_id`? Pass through
4. `req.user.claims.sub` exists and doesn't start with `webflow_` or `temp_`? Pass through
5. Otherwise: `401 "Authentication required to chat with avatars. Please log in."`

### `requireAdmin`

Applied to admin panel endpoints.

**Logic (in order):**
1. Valid `X-Admin-Secret` header? Pass through
2. Has `req.user.claims.sub`? Look up user in DB, check `role === 'admin'`
3. No user: `401 "Unauthorized - Admin access required"`
4. User exists but not admin: `403 "Forbidden: Admin access required"`

### `isValidAdminSecret(secret)`

Helper function used by both middleware and WebSocket auth.

- Reads `ADMIN_SECRET` env var
- Splits by comma, trims whitespace
- Returns `true` if `secret` matches any value
- Supports secret rotation by having multiple comma-separated secrets

---

## Session and Cookie Strategy

### Configuration

```typescript
cookie: {
  httpOnly: true,                                               // Not accessible via JavaScript
  secure: process.env.NODE_ENV === 'production',                // HTTPS only in production
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',  // Cross-origin in production
  maxAge: 7 * 24 * 60 * 60 * 1000,                            // 1 week
}
```

### Why `sameSite: 'none'`

When the app is embedded in a Webflow iframe, the browser considers cookie requests to the Railway domain as "third-party" (the iframe's origin differs from the parent page's origin). `sameSite: 'none'` allows the session cookie to be sent in this cross-origin context. `secure: true` is required when using `sameSite: 'none'`.

### Session Store

- **Store**: PostgreSQL via `connect-pg-simple`
- **Table**: `sessions` (columns: `sid`, `sess` JSONB, `expire` timestamp)
- **TTL**: 7 days
- **Pool**: Shared Neon serverless pool from `server/db.ts`

### Safari ITP Caveat

Safari's Intelligent Tracking Prevention (ITP) blocks third-party cookies in iframes by default. This means the `express-session` cookie **may not persist in Safari**. The system handles this gracefully:

1. The `member_id` URL param is re-read on every iframe load from Webflow
2. It's stored in `localStorage` (accessible in iframes, unlike third-party cookies)
3. The `X-Member-Id` header is attached to every request from localStorage
4. The session cookie is a **bonus for anonymous user continuity**, not the primary auth mechanism

---

## CORS and Iframe Embedding

### CORS Middleware (`server/index.ts`, lines 51-73)

```typescript
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Secret, X-User-Id');
  res.setHeader('Content-Security-Policy', "frame-ancestors *");
  res.removeHeader('X-Frame-Options');

  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});
```

### Key Headers

| Header | Value | Purpose |
|--------|-------|---------|
| `Access-Control-Allow-Origin` | Request origin (or `*`) | Allow cross-origin requests from any Webflow domain |
| `Access-Control-Allow-Credentials` | `true` | Allow cookies in cross-origin requests |
| `Access-Control-Allow-Headers` | `Content-Type, Authorization, X-Admin-Secret, X-User-Id` | Custom headers for auth |
| `Content-Security-Policy` | `frame-ancestors *` | Allow embedding in any iframe |
| `X-Frame-Options` | Removed | CSP `frame-ancestors` takes precedence |

### Why Open CORS

The app can be embedded in any Webflow site (multiple client domains). Rather than maintaining an allowlist of domains that changes with each new client site, `frame-ancestors *` and origin-based CORS allow universal embedding.

---

## Frontend Auth Helpers

### `client/src/lib/queryClient.ts`

#### `getMemberstackId(): string | null`

Reads the Memberstack user ID from URL params or localStorage.

1. Check `?member_id` URL parameter (passed from Webflow)
2. If found, store in `localStorage.setItem('memberstack_id', id)` for persistence
3. If not in URL, check `localStorage.getItem('memberstack_id')`
4. Returns `null` if no ID found anywhere

#### `getAdminSecret(): string | null`

Same pattern as `getMemberstackId()` but for `?admin_secret` URL param and `localStorage.admin_secret`.

#### `getAuthHeaders(): Record<string, string>`

Returns an object with auth headers to attach to requests:
- `X-Member-Id: {memberstackId}` if available
- `X-Admin-Secret: {adminSecret}` if available

#### `buildAuthenticatedWsUrl(path: string): string`

Builds a WebSocket URL with auth query params:
```
wss://[host]/ws/conversation?member_id=mem_abc123&admin_secret=xxx
```

#### `apiRequest(url, method, data?)`

Wrapper around `fetch()` that automatically attaches:
- `X-Member-Id` header on all requests (if available)
- `X-Admin-Secret` header on admin/knowledge/document routes (if available)
- `credentials: "include"` for cookie sending

#### `getQueryFn({ on401 })`

React Query default query function with the same auth header injection.

### `client/src/hooks/useAuth.ts`

```typescript
export function useAuth() {
  // Fetches /api/auth/user
  return {
    user: embeddedUser,        // Real user or mock guest
    isLoading,
    isAuthenticated: true,     // Always true in embedded mode
    isAdmin: user?.role === 'admin',
    isEmbedded: true,
  };
}
```

**Design decision**: `isAuthenticated` is always `true` because the app is designed for embedded mode where everyone can browse. The backend enforces actual auth via `requireMemberstackOrAdmin` for AI endpoints.

---

## WebSocket Authentication

### HTTP Upgrade Auth (`server/routes.ts`)

```typescript
function checkWsAuth(request: any, url: URL): boolean {
  const adminSecret = url.searchParams.get('admin_secret') || request.headers['x-admin-secret'];
  if (adminSecret && isValidAdminSecret(adminSecret)) return true;
  const memberId = url.searchParams.get('member_id') || request.headers['x-member-id'];
  if (memberId) return true;
  return false;
}
```

**Applied to:**
- `/ws/elevenlabs-stt` — Speech-to-text (requires auth)
- `/ws/conversation` — Real-time conversation (requires auth)

**Not applied to:**
- `/ws/streaming-chat` — Text streaming (auth handled internally per message)
- `/ws/webrtc-streaming` — WebRTC (auth handled internally)

### Conversation WebSocket Auth (`server/conversationWsService.ts`)

Inside the WebSocket connection, auth is also checked at the message level:

1. `member_id` extracted from URL query params on connection (line 687)
2. Injected into every incoming JSON message if not already present (line 694)
3. `START_SESSION` message validates auth:
   - `adminSecret` present and valid? Allow
   - `memberstackId` present? Allow (user ID becomes `ms_{memberstackId}`)
   - `userId` present and not `webflow_*`/`temp_*`? Allow
   - Otherwise: Send error and close connection
4. Memberstack users always get memory enabled (line 743)

---

## Webflow + Memberstack Integration

### How Memberstack ID Gets Into the Iframe

In the Webflow site, custom code uses Memberstack's JS SDK to build the iframe URL:

```html
<script>
  MemberStack.onReady.then(function(member) {
    const iframe = document.getElementById('elxrai-iframe');
    if (member && member.id) {
      iframe.src = `https://[railway-domain]/embed/chat/dexter?member_id=${member.id}`;
    } else {
      // Anonymous visitor — no member_id, limited to browsing
      iframe.src = `https://[railway-domain]/embed/chat/dexter`;
    }
  });
</script>
```

### Iframe Permissions

```html
<iframe
  src="https://[railway-domain]/embed/chat/dexter?member_id=mem_abc123"
  frameborder="0"
  allow="camera; microphone; autoplay; encrypted-media; fullscreen"
  allowfullscreen
  style="width: 100%; height: 100vh;"
  title="Chat with Dexter">
</iframe>
```

Required permissions:
- `camera` / `microphone` — For voice conversations
- `autoplay` — For avatar video/audio playback
- `encrypted-media` — For secure media streams
- `fullscreen` — For full-screen mode

---

## Embed Routes

### Client-Side Routes (`client/src/App.tsx`)

| Route | View |
|-------|------|
| `/embed/dashboard` | Dashboard home |
| `/embed/chat` | Chat view |
| `/embed/chat/:avatarId` | Chat with specific avatar |
| `/embed/mentors` | Mentors list |
| `/embed/mentors/:avatarId` | Specific mentor |
| `/embed/videos` | Video gallery |
| `/embed/courses` | Course list |
| `/embed/courses/:courseId` | Course detail |
| `/embed/mood` | Mood tracker |
| `/embed/plan` | Subscription plan |
| `/embed/credits` | Credits |
| `/embed/settings` | Settings |
| `/embed/admin/*` | Admin panel (various sub-routes) |

### Embed Page Component (`client/src/pages/embed/index.tsx`)

A thin wrapper that renders Dashboard with `isEmbed={true}`:

```typescript
export default function EmbedPage({ view, avatarId, courseId }: EmbedPageProps) {
  return (
    <Dashboard isEmbed={true} embedView={view} embedAvatarId={avatarId} embedCourseId={courseId} />
  );
}
```

When `isEmbed` is true, Dashboard hides the sidebar, removes the dot-pattern background, and routes navigation to `/embed/` paths.

### API Embed Endpoint (`server/routes.ts`)

`GET /api/avatars/:id/embed` — Public endpoint (no auth) returning avatar configuration for embedding:
```json
{ "mentorId": "...", "sceneId": "...", "voiceConfig": {...}, "audioOnly": false }
```

---

## Database Schema

### Users Table (`shared/schema.ts`)

```typescript
export const users = pgTable("users", {
  id: varchar("id").primaryKey(),              // "ms_{memberstackId}" or UUID
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").default("user"),       // 'admin' or 'user'
  memberstackId: varchar("memberstack_id"),    // Memberstack member ID
  currentPlanSlug: varchar("current_plan_slug").default("free"),
  trialStartedAt: timestamp("trial_started_at"),
  lastActiveAt: timestamp("last_active_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### Sessions Table (`shared/schema.ts`)

```typescript
export const authSessions = pgTable("sessions", {
  sid: varchar("sid").primaryKey(),
  sess: jsonb("sess").notNull(),          // { userId: "ms_...", cookie: {...} }
  expire: timestamp("expire").notNull(),
});
```

---

## Subscription and Billing

### Memberstack Webhook

**Endpoint**: `POST /api/subscription/memberstack/webhook`

Handles plan lifecycle events from Memberstack:
- `member.plan.added` — New subscription
- `member.plan.updated` — Plan change
- `member.plan.removed` — Cancellation

### Subscription Middleware Flow

1. User accesses AI endpoint (e.g., `/api/avatar/response`)
2. `isAuthenticated` creates user identity from `X-Member-Id`
3. `requireMemberstackOrAdmin` verifies Memberstack ID is present
4. Route handler calls `subscriptionService.checkLimit(userId, type)` to verify plan limits
5. If within limits, request proceeds; otherwise returns limit error

### Upgrade Flow

`POST /api/subscription/upgrade` accepts `planSlug` and optional `memberstackSubscriptionId` to link the internal subscription record with Memberstack's external subscription.

---

## Security Considerations

### Memberstack ID Is Not a Secret

The `member_id` is passed as a URL parameter and HTTP header. Anyone who knows a member ID can impersonate that user. This is acceptable because:
- Memberstack ID is only used for **personalization** (memory, chat history, preferences)
- **Billing** is handled server-side via Memberstack webhooks with server-to-server communication
- **Admin access** requires a separate `ADMIN_SECRET` that is never exposed to clients

### Admin Secret Protection

- `ADMIN_SECRET` is stored server-side only (environment variable)
- Supports comma-separated values for rotation without downtime
- Never embedded in client code — only passed via URL param or header by authorized operators

### CORS Is Intentionally Open

`frame-ancestors *` and origin-based CORS allow embedding from any domain. This is a deliberate trade-off for flexibility across multiple Webflow client sites. All sensitive operations are protected by:
- `requireMemberstackOrAdmin` for AI endpoints
- `requireAdmin` for admin endpoints

### Rate Limiting

AI endpoints have rate limiting via `requireMemberstackOrAdmin` (blocks anonymous users) and subscription plan limits (caps usage per plan tier). Per-user rate limiting beyond plan limits is handled by `chatRateLimit.ts`.

---

## Local Development

### Running Without Memberstack

Set `TEST_MODE=true` to bypass `requireMemberstackOrAdmin` on localhost:

```bash
TEST_MODE=true npm run dev
```

This allows all AI endpoints to work without providing a Memberstack ID.

### Testing With a Fake Member ID

Navigate to any embed URL with a `?member_id` parameter:

```
http://localhost:5000/embed/chat/mark-kohl?member_id=test-user-123
```

The ID will be stored in localStorage and sent with all subsequent requests.

### Testing Admin Access

Navigate with an `?admin_secret` parameter:

```
http://localhost:5000/embed/admin?admin_secret=your-secret-here
```

### Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `SESSION_SECRET` | Yes | Signs session cookies |
| `ADMIN_SECRET` | Yes | Admin panel access (comma-separated for multiple) |
| `MEMBERSTACK_SECRET_KEY` | Yes | Server-side Memberstack API |
| `TEST_MODE` | No | Bypass auth on localhost (`true`/`false`) |
| `VITE_TEST_MODE` | No | Client-side subscription bypass (build-time) |

---

## File Reference

| File | Purpose |
|------|---------|
| `server/auth.ts` | All backend auth: session setup, 3 middleware, admin secret helper |
| `server/services/auth.ts` | Thin wrapper re-exporting `setupAuth`, `isAuthenticated`, plus `getUserIdFromRequest`, `getUserKey` helpers |
| `server/index.ts` | CORS middleware (lines 51-73) |
| `server/routes.ts` | `/api/auth/user` endpoint, `checkWsAuth()` for WebSocket upgrades |
| `server/conversationWsService.ts` | WebSocket-level auth for real-time conversations |
| `server/routes/subscription.ts` | Memberstack webhook endpoint, subscription management |
| `client/src/lib/queryClient.ts` | `getMemberstackId()`, `getAdminSecret()`, `getAuthHeaders()`, `buildAuthenticatedWsUrl()`, `apiRequest()` |
| `client/src/hooks/useAuth.ts` | `useAuth()` hook (always returns authenticated for embedded mode) |
| `client/src/pages/embed/index.tsx` | Embed page wrapper component |
| `shared/schema.ts` | `users` and `authSessions` table definitions |
