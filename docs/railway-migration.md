# Railway Migration Guide

Complete reference for the Elxrai platform migration from Replit to Railway. This document covers every change made, the reasoning behind it, and how to operate the Railway deployment going forward.

---

## Table of Contents

- [Overview](#overview)
- [Architecture Before & After](#architecture-before--after)
- [Migration Changes by File](#migration-changes-by-file)
- [Docker Configuration](#docker-configuration)
- [Railway Configuration](#railway-configuration)
- [Firebase / GCS Asset Storage](#firebase--gcs-asset-storage)
- [Environment Variables](#environment-variables)
- [Deployment Workflow](#deployment-workflow)
- [Authentication on Railway](#authentication-on-railway)
- [Features & Graceful Degradation](#features--graceful-degradation)
- [Health Checks & Monitoring](#health-checks--monitoring)
- [Troubleshooting](#troubleshooting)
- [Operational Reference](#operational-reference)

---

## Overview

**Migration date:** March 2026
**Branch:** `standalone`
**Motivation:** Move off Replit to a portable Docker-based deployment on Railway for better control, cost optimization, and removal of Replit-specific dependencies.

**What stayed the same:**
- Neon serverless PostgreSQL (cloud DB, no change)
- All external API integrations (Claude, OpenAI, Pinecone, HeyGen, ElevenLabs, etc.)
- Upstash Redis (optional, same REDIS_URL)
- LiveKit WebRTC
- Memberstack billing
- Express + React + Vite stack

**What changed:**
- Hosting: Replit → Railway (Docker)
- Asset storage: Replit Object Storage → Firebase Storage (GCS)
- Auth: Replit OIDC → Mock auth / admin secret (Memberstack handles user identity)
- Build: Added Dockerfile, railway.toml
- Vite plugins: Replit plugins made conditional
- Object storage: Lazy-initialized, guarded for non-Replit

---

## Architecture Before & After

### Before (Replit)

```
Replit Container
├── Node.js server (port 5000)
├── Replit OIDC authentication
├── Replit Object Storage (sidecar at localhost:1106)
│   ├── Intro videos (MP4)
│   ├── Document uploads
│   └── Public files
├── attached_assets/ (local filesystem, ~631MB)
│   ├── Avatar GIFs
│   ├── Profile images
│   └── Demo media
├── Replit Connectors (Google Drive OAuth proxy)
└── Replit Vite plugins (error overlay, cartographer)
```

### After (Railway)

```
Railway Docker Container (node:20-slim)
├── Node.js server (PORT env var, 0.0.0.0)
├── Mock auth / Memberstack + Admin Secret
├── Replit Object Storage → DISABLED (503 responses)
│   ├── Intro videos → 503 (future: migrate to GCS)
│   ├── Document uploads → 503 (future: migrate to GCS)
│   └── Public files → 503
├── attached_assets/ → Firebase Storage (GCS)
│   ├── Redirects /attached_assets/* → storage.googleapis.com
│   ├── Admin uploads go to GCS bucket
│   └── Bucket: gs://mum-assets/attached_assets/
├── Google Drive → DISABLED (Replit Connectors removed)
└── Vite plugins → Conditional (only on Replit)
```

---

## Migration Changes by File

### New Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Docker build configuration for Railway |
| `.dockerignore` | Excludes node_modules, dist, .git, attached_assets from Docker context |
| `railway.toml` | Railway deployment configuration |
| `server/assetStorage.ts` | Firebase/GCS asset storage client |
| `client/public/mum-logo.gif` | Loading spinner asset (moved from attached_assets) |
| `client/public/mum-icon.png` | MUM icon asset (moved from attached_assets) |

### Modified Files

#### `server/index.ts` — Server Entry Point

**Changes:**
1. **Health check endpoint** registered early (before async initialization) so Railway healthcheck passes as soon as the server binds:
   ```typescript
   app.get("/api/health", (_req, res) => {
     res.json({ status: "ok", timestamp: new Date().toISOString() });
   });
   ```

2. **Asset storage redirect** — when GCS is configured, `/attached_assets/*` requests redirect to Firebase Storage public URLs. Falls back to local filesystem in development:
   ```typescript
   if (isAssetStorageConfigured()) {
     app.use('/attached_assets', (req, res) => {
       const filename = decodeURIComponent(req.path.slice(1));
       res.redirect(301, getPublicUrl(filename));
     });
   } else {
     app.use('/attached_assets', express.static(attachedAssetsPath));
   }
   ```

3. **Server listen before heavy init** — the server binds to the port immediately after routes are registered. Heavy initialization (DB seeding, Wikipedia sync, video recovery) runs after listen, so the healthcheck passes quickly.

#### `server/routes.ts` — Main API Routes

**Changes:**
1. **`@replit/object-storage` guarded** (~line 5947) — only imported when `REPLIT_DOMAINS` is set:
   ```typescript
   let objStorageClient: any = null;
   if (process.env.REPLIT_DOMAINS) {
     try {
       const { Client: ObjStorageClient } = await import("@replit/object-storage");
       objStorageClient = new ObjStorageClient();
     } catch (e) {
       console.warn("Replit object storage not available:", e);
     }
   }
   ```

2. **Intro video endpoint** (`GET /api/intro-video/:avatarId`) — returns 503 when not on Replit.

3. **Public storage endpoint** (`GET /api/public-storage/:filename`) — returns 503 when not on Replit.

4. **Document upload-url endpoint** (`GET /api/documents/upload-url`) — returns 503 when not on Replit.

5. **Document upload endpoint** (`POST /api/documents/upload`) — returns 503 when not on Replit.

6. **Admin asset upload** (`POST /api/admin/upload-asset`) — uploads to Firebase Storage when GCS is configured, falls back to local filesystem:
   ```typescript
   if (isAssetStorageConfigured()) {
     await uploadAsset(file.path, uniqueFileName, file.mimetype);
     await fs.promises.unlink(file.path);
   } else {
     await fs.promises.rename(file.path, destPath);
   }
   ```

#### `server/replitAuth.ts` — Authentication

**Changes:**
1. **Removed hard requirement** for `REPLIT_DOMAINS` env var — uses `const isReplit = !!process.env.REPLIT_DOMAINS` flag instead.

2. **OIDC setup conditional** — only initializes Replit OIDC passport strategies when running on Replit.

3. **Mock authentication** — when not on Replit, `/api/login` creates a mock dev user (`dev-user-001`) and logs them in automatically.

4. **Callback/logout guards** — `/api/callback` redirects home on non-Replit. `/api/logout` redirects home without OIDC end-session.

5. **TEST_MODE bypass** — `requireMemberstackOrAdmin` middleware skips subscription check on localhost when `TEST_MODE=true`.

#### `server/objectStorage.ts` — Replit Object Storage

**Changes:**
- Made lazy-initialized with Proxy pattern — the GCS client is only created when first accessed.
- Throws a descriptive error ("Object storage is only available on Replit") instead of crashing at import time.
- No code changes needed for consumers — they just get an error if they try to use it outside Replit.

#### `server/assetStorage.ts` — Firebase/GCS Client (NEW)

Purpose: Provides asset upload and public URL generation for Firebase Storage (which uses GCS under the hood).

**Exports:**
- `isConfigured()` — returns true if all `GCS_*` env vars are set
- `getBucket()` — returns the GCS Bucket instance
- `getPublicUrl(filename)` — returns `https://storage.googleapis.com/{bucket}/attached_assets/{filename}`
- `uploadAsset(filePath, destFilename, contentType?)` — uploads a file to the bucket

**Why separate from objectStorage.ts:** The existing `objectStorage.ts` is tightly coupled to Replit's sidecar auth. The new `assetStorage.ts` uses standard GCS service account credentials.

#### `vite.config.ts` — Build Configuration

**Changes:**
- Removed unconditional `import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal"` at the top.
- Both Replit plugins (`runtime-error-modal` and `cartographer`) are now loaded conditionally only when `REPL_ID` is defined:
  ```typescript
  ...(process.env.REPL_ID !== undefined
    ? [
        (await import("@replit/vite-plugin-runtime-error-modal")).default(),
        ...(process.env.NODE_ENV !== "production"
          ? [await import("@replit/vite-plugin-cartographer").then(m => m.cartographer())]
          : []),
      ]
    : []),
  ```

#### `client/src/components/loading-spinner.tsx`

**Change:** Replaced build-time asset import (`import mumLogo from "@assets/..."`) with static URL string (`src="/mum-logo.gif"`). The file was copied to `client/public/`.

#### `client/src/components/avatar-chat.tsx`

**Change:** Replaced build-time asset import (`import mumIconPath from "@assets/..."`) with URL constant (`const mumIconPath = "/mum-icon.png"`). The file was copied to `client/public/`.

#### `client/src/pages/Dashboard.tsx`

**Change:** Added `VITE_TEST_MODE` bypass for subscription lock checks (client-side).

#### `server/services/chatVideo.ts` & `server/services/videoGeneration.ts`

**Change:** Removed unused `import { objectStorageClient } from "../objectStorage"` (dead imports).

#### `server/services/previewGeneration.ts`

**Change:** After generating a preview GIF with ffmpeg, uploads it to Firebase Storage if configured:
```typescript
if (isAssetStorageConfigured()) {
  await uploadAsset(outputGifPath, gifFilename, "image/gif");
  fs.unlinkSync(outputGifPath); // Clean up local temp file
}
```

---

## Docker Configuration

### Dockerfile

```dockerfile
FROM node:20-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg imagemagick unzip && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 5000
CMD ["npm", "run", "start"]
```

**Key decisions:**
- **Single-stage build** — a multi-stage build with `--omit=dev` was attempted but failed due to an esbuild version conflict in `tsx`'s nested dependencies. Since the server bundle uses `--packages=external`, all node_modules must be present at runtime anyway.
- **System dependencies** — ffmpeg (video→GIF conversion), imagemagick (image processing), unzip (course ZIP ingestion).
- **`npm ci`** installs all deps including devDependencies, which is needed because the build step requires Vite, esbuild, TypeScript, etc.

### .dockerignore

```
node_modules
dist
.git
.claude
*.md
!README.md
attached_assets
```

**Critical:** `attached_assets` is excluded (631MB). Assets are served from Firebase Storage in production.

---

## Railway Configuration

### railway.toml

```toml
[build]
builder = "dockerfile"

[deploy]
healthcheckPath = "/api/health"
healthcheckTimeout = 120
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 5
```

**Key settings:**
- `healthcheckTimeout = 120` — 120 seconds because `registerRoutes()` does heavy initialization (auth setup, DB session store, etc.) before the server can respond. The health endpoint is registered before this, but the server must still bind its port.
- `restartPolicyMaxRetries = 5` — auto-restart on crash, max 5 attempts.

### Railway Dashboard Settings

- **Branch:** `standalone`
- **Build:** Dockerfile (auto-detected from railway.toml)
- **PORT:** Auto-set by Railway (the app reads `process.env.PORT` with fallback to 5000)
- **Region:** Choose closest to your users

---

## Firebase / GCS Asset Storage

### Overview

The `attached_assets/` folder (631MB, 634 files) contains avatar GIFs, profile images, intro videos, and demo media. These are too large for the Docker image, so they're hosted on Firebase Storage (which uses Google Cloud Storage under the hood).

**Bucket:** `gs://mum-assets/attached_assets/`
**Public URL pattern:** `https://storage.googleapis.com/mum-assets/attached_assets/{filename}`

### How It Works

1. **Request flow:** Browser requests `/attached_assets/avatar.gif` → Express redirects (301) → `https://storage.googleapis.com/mum-assets/attached_assets/avatar.gif`
2. **Admin uploads:** `POST /api/admin/upload-asset` → multer saves to temp `uploads/` dir → `assetStorage.uploadAsset()` uploads to GCS bucket → temp file deleted
3. **Preview generation:** Server generates GIF with ffmpeg → uploads to GCS → updates DB with `/attached_assets/{filename}` URL

### Firebase Setup (One-Time)

1. **Create project** at https://console.firebase.google.com
2. **Enable Storage** — default bucket (e.g., `mum-assets`)
3. **Set security rules** for public read:
   ```
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /attached_assets/{allPaths=**} {
         allow read: if true;
         allow write: if false;
       }
     }
   }
   ```
   Note: Write access is handled server-side via service account, not through Firebase rules.

4. **Generate service account key:**
   - Firebase Console → Project Settings → Service accounts → Generate new private key
   - Download the JSON file
   - Extract these values for env vars: `project_id`, `client_email`, `private_key`

5. **Upload assets manually** via Firebase Console (Storage → Upload folder) or gsutil:
   ```bash
   gsutil -m cp -r attached_assets/* gs://mum-assets/attached_assets/
   ```

### File Structure in Bucket

```
gs://mum-assets/
└── attached_assets/
    ├── MArk-kohl-loop_1763964600000.gif
    ├── Willie gault gif-low_1763964813725.gif
    ├── June-low_1764106896823.gif
    ├── ... (634 files total)
```

### Cost (Firebase Spark Free Plan)

| Resource | Free Tier | Current Usage |
|----------|-----------|---------------|
| Storage | 5 GB | ~631 MB (12%) |
| Downloads | 1 GB/day | Depends on traffic |
| Uploads | 600K/day | Minimal (admin only) |

No credit card required for the Spark plan.

---

## Environment Variables

### Required for Railway

| Variable | Purpose | Example |
|----------|---------|---------|
| `DATABASE_URL` | Neon PostgreSQL connection string | `postgresql://user:pass@host/db?sslmode=require` |
| `SESSION_SECRET` | Express session signing key | Random 32+ char string |
| `ADMIN_SECRET` | Admin panel auth (supports comma-separated) | `secret1,secret2` |
| `ANTHROPIC_API_KEY` | Claude AI (conversations) | `sk-ant-...` |
| `OPENAI_API_KEY` | Embeddings (text-embedding-3-small) | `sk-...` |
| `PINECONE_API_KEY` | Vector database | `...` |
| `HEYGEN_API_KEY` | Video avatars (streaming) | `...` |
| `ELEVENLABS_API_KEY` | Text-to-speech / Speech-to-text | `...` |
| `DEEPGRAM_API_KEY` | Speech-to-text (alternative) | `...` |
| `MEM0_API_KEY` | Persistent memory | `...` |
| `MEMBERSTACK_SECRET_KEY` | Subscription billing | `...` |

### Asset Storage (Firebase/GCS)

| Variable | Purpose | Example |
|----------|---------|---------|
| `GCS_BUCKET_NAME` | Firebase Storage bucket name | `mum-assets` |
| `GCS_PROJECT_ID` | Google Cloud project ID | `mum-project-12345` |
| `GCS_CLIENT_EMAIL` | Service account email | `firebase-adminsdk-xxx@project.iam.gserviceaccount.com` |
| `GCS_PRIVATE_KEY` | Service account private key | `-----BEGIN PRIVATE KEY-----\nMIIE...` |

**Note:** The `GCS_PRIVATE_KEY` value contains literal `\n` characters. Railway handles this correctly in env var settings.

### Optional

| Variable | Purpose | Default |
|----------|---------|---------|
| `REDIS_URL` | Upstash Redis (BullMQ queues) | Falls back to sync processing |
| `LIVEKIT_API_KEY` | WebRTC streaming | LiveKit features disabled |
| `LIVEKIT_API_SECRET` | WebRTC streaming | LiveKit features disabled |
| `LIVEKIT_URL` | WebRTC streaming | LiveKit features disabled |
| `GOOGLE_CLIENT_ID` | Google Drive OAuth | Drive ingestion disabled |
| `GOOGLE_CLIENT_SECRET` | Google Drive OAuth | Drive ingestion disabled |
| `RESEND_API_KEY` | Email sending | Emails disabled |
| `HEYGEN_VIDEO_API_KEY` | Video generation (courses) | Video generation disabled |
| `HEYGEN_CREDIT_LIMIT` | Daily HeyGen credit cap | No limit |
| `TEST_MODE` | Bypass Memberstack on localhost | `false` |
| `VITE_TEST_MODE` | Client-side subscription bypass | `false` (build-time only) |

### Do NOT Set

| Variable | Why |
|----------|-----|
| `REPLIT_DOMAINS` | Absence triggers non-Replit code paths |
| `REPL_ID` | Absence skips Replit Vite plugins |
| `REPL_IDENTITY` | Replit-specific token |
| `NODE_ENV` | Railway sets this automatically |
| `PORT` | Railway sets this automatically |

**Important:** `VITE_TEST_MODE` must be set at **build time** (it's baked into the client bundle by Vite). Set it as a Railway build variable, not just a runtime variable.

---

## Deployment Workflow

### Initial Setup

1. Create Railway project and link to GitHub repo
2. Set branch to `standalone`
3. Configure all environment variables in Railway dashboard
4. Railway auto-detects `railway.toml` → uses Dockerfile builder
5. First deploy triggers build + healthcheck

### Deploying Updates

```bash
# On standalone branch
git add .
git commit -m "Description of changes"
git push origin standalone
```

Railway auto-deploys on push to the configured branch.

### Build Process (Inside Docker)

1. `npm ci` — installs all dependencies (including devDependencies for build tools)
2. `npm run build` — two-step:
   - `vite build` — compiles React frontend → `dist/public/`
   - `esbuild server/index.ts` — bundles server → `dist/index.js`
3. `npm run start` — runs `NODE_ENV=production node dist/index.js`

### Server Startup Sequence

1. Express app created, middleware registered
2. Health endpoint registered (`/api/health`) — **responds immediately**
3. Asset storage redirect or static middleware configured
4. `registerRoutes(app)` — auth setup, all API routes, WebSocket servers
5. Modular routes registered (avatars, courses, mood, subscription, etc.)
6. Error handler + static file serving (Vite production build)
7. **Server binds to port** — healthcheck starts passing
8. Heavy initialization (non-blocking, after listen):
   - Seed default avatars
   - Initialize subscription plans
   - Recover stuck video generation jobs
   - Start background checkers
   - Sync Wikipedia to Pinecone
   - Resume stuck batch processing (5s delay)

---

## Authentication on Railway

### Current State

Without `REPLIT_DOMAINS`, the app uses **mock authentication**:
- `GET /api/login` creates a mock user (`dev-user-001`) and logs in
- `GET /api/callback` redirects to `/`
- `GET /api/logout` clears session and redirects to `/`

### Production Authentication

In the embedded Webflow deployment model:
- **Memberstack** handles user identity via `X-Member-Id` header
- **Admin access** uses `X-Admin-Secret` header
- **Anonymous users** get a temporary `webflow_*` session ID
- Sessions stored in PostgreSQL via `connect-pg-simple`

### Session Cookies

```typescript
cookie: {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',  // true on Railway
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,  // 1 week
}
```

`sameSite: 'none'` is required for cross-origin embedding in Webflow. `secure: true` works because Railway serves over HTTPS. `trust proxy: 1` is set for Railway's reverse proxy.

---

## Features & Graceful Degradation

### Fully Working on Railway

| Feature | Notes |
|---------|-------|
| Avatar chat (text + voice) | Claude + ElevenLabs TTS/STT |
| RAG knowledge retrieval | Pinecone + OpenAI embeddings |
| Course browsing & playback | DB-driven, no object storage needed |
| Admin panel | Via X-Admin-Secret header |
| WebSocket conversations | 4 WS servers on HTTP upgrade |
| Avatar GIFs & profile images | Via Firebase Storage redirect |
| Admin asset uploads | Upload to Firebase Storage |
| Preview GIF generation | ffmpeg + upload to Firebase |
| Subscription management | Memberstack integration |
| Memory persistence | Mem0 API |
| LiveKit WebRTC streaming | If LIVEKIT_* vars are set |

### Disabled on Railway (503 Responses)

| Feature | Endpoint | Reason |
|---------|----------|--------|
| Intro video streaming | `GET /api/intro-video/:avatarId` | Uses Replit Object Storage |
| Public file serving | `GET /api/public-storage/:filename` | Uses Replit Object Storage |
| Document upload (presigned URL) | `GET /api/documents/upload-url` | Uses Replit Object Storage |
| Document upload (direct) | `POST /api/documents/upload` | Uses Replit Object Storage |
| Google Drive ingestion | Admin panel | Uses Replit Connectors |

**Future work:** These features can be re-enabled by replacing Replit Object Storage with the Firebase/GCS storage (same `assetStorage.ts` pattern).

---

## Health Checks & Monitoring

### Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/health` | None | Railway healthcheck — returns `{"status":"ok","timestamp":"..."}` |
| `GET /api/admin/health` | Admin secret | Detailed backend health |
| `GET /api/admin/service-status` | Admin secret | External service connectivity |
| `GET /api/admin/circuit-breaker/status` | Admin secret | Circuit breaker states |
| `GET /metrics` | None | Prometheus metrics |

### Railway Healthcheck

- **Path:** `/api/health`
- **Timeout:** 120 seconds
- **Behavior:** The endpoint is registered on the Express app before any async initialization. It responds as soon as the HTTP server binds to the port.
- **Why 120s:** The `registerRoutes()` function performs auth setup (PostgreSQL session store), which requires a DB connection. If Neon is slow to wake up, this can take 10-30 seconds.

### Logs

Railway captures all stdout/stderr. The app logs:
- Request method, path, status code, and duration for all `/api/*` routes
- Startup tasks with emoji prefixes (⚠️ for warnings, ✓ for success)
- Memory warnings when heap exceeds 1GB

---

## Troubleshooting

### Issues Encountered During Migration

#### 1. Multi-Stage Docker Build Failed

**Error:** `Expected "0.23.1" but got "0.25.0"` in tsx's nested esbuild during `npm ci --omit=dev`.

**Cause:** `tsx` is in devDependencies but its nested `esbuild` conflicted with the root `esbuild@^0.25.0` during the production stage's `--omit=dev` install.

**Fix:** Reverted to single-stage Dockerfile. All deps (including devDependencies) are installed, which is needed because `esbuild` uses `--packages=external` (runtime node_modules must exist).

#### 2. Vite Build Failed — Missing attached_assets

**Error:** `ENOENT: no such file or directory, open '/app/attached_assets/mum_logo_small_*.gif'`

**Cause:** Two component files had build-time `import` statements from `@assets/` (the Vite alias for `attached_assets/`), but `.dockerignore` excludes `attached_assets`.

**Fix:** Moved the two required files (`mum-logo.gif`, `mum-icon.png`) to `client/public/` and replaced imports with URL strings. All other `attached_assets` references are runtime URL strings, not imports.

#### 3. Healthcheck Failed (30s Timeout)

**Error:** `1/1 replicas never became healthy! Healthcheck failed!`

**Cause:** The `/api/health` endpoint was registered inside `registerRoutes()`, which first calls `await setupAuth(app)` (PostgreSQL session store init). If the DB was slow, the endpoint wasn't ready within 30s.

**Fix:**
1. Moved health endpoint to `server/index.ts` before `registerRoutes()` — responds immediately.
2. Moved `server.listen()` before heavy init tasks (seeding, sync, recovery).
3. Increased `healthcheckTimeout` from 30s to 120s.

#### 4. Replit Object Storage Crash on Import

**Error:** `@replit/object-storage` Client constructor tried to connect to localhost:1106 sidecar.

**Fix:** Wrapped the dynamic import with `process.env.REPLIT_DOMAINS` guard. Endpoints that depend on it return 503 with descriptive error messages.

### Common Issues

#### App deploys but shows blank page
- Check that `dist/public/` was created during build (Vite output)
- Verify `serveStatic()` is called in production mode
- Check Railway build logs for Vite errors

#### Assets not loading (404)
- Verify `GCS_BUCKET_NAME`, `GCS_PROJECT_ID`, `GCS_CLIENT_EMAIL`, `GCS_PRIVATE_KEY` are all set in Railway
- Test the public URL directly: `curl https://storage.googleapis.com/mum-assets/attached_assets/FILENAME`
- Check Firebase Storage rules allow public read

#### Database connection issues
- Neon serverless PostgreSQL may take 5-10s to wake from cold start
- The app handles this gracefully (startup tasks log warnings but don't crash)
- Verify `DATABASE_URL` includes `?sslmode=require`

#### WebSocket connections failing
- Railway supports WebSockets natively on the same port
- Ensure the client connects to `wss://your-app.railway.app/ws/...` (not `ws://`)

---

## Operational Reference

### File Structure (Production Docker Image)

```
/app/
├── package.json
├── package-lock.json
├── node_modules/          # All dependencies (including dev)
├── dist/
│   ├── index.js           # Server bundle (esbuild output, ~1.2MB)
│   └── public/            # Client bundle (Vite output)
│       ├── index.html
│       ├── mum-logo.gif
│       ├── mum-icon.png
│       └── assets/        # JS/CSS chunks
├── shared/                # Shared schema (needed by server at runtime)
├── config/                # Avatar config (needed for seeding)
├── migrations/            # SQL migrations
├── drizzle.config.ts      # Drizzle config (for db:push)
└── uploads/               # Multer temp dir (ephemeral)
```

### Key Server Files (Source)

| File | Purpose |
|------|---------|
| `server/index.ts` | Entry point, middleware, startup sequence |
| `server/routes.ts` | Main API routes (~10K lines) |
| `server/replitAuth.ts` | Auth middleware (session, admin, memberstack) |
| `server/assetStorage.ts` | Firebase/GCS asset upload & URL generation |
| `server/objectStorage.ts` | Replit Object Storage (disabled on Railway) |
| `server/db.ts` | Neon + Drizzle connection |
| `server/storage.ts` | Data access layer (IStorage interface) |
| `server/vite.ts` | Dev server (Vite HMR) + production static serving |

### Database Commands

```bash
# Push schema changes (run locally with DATABASE_URL set)
npm run db:push

# Type check
npm run check
```

### Adding New Assets

**Via admin panel:** Use the asset upload in the admin interface. Files are uploaded to Firebase Storage automatically.

**Manual upload:** Use Firebase Console (Storage → Upload files) or gsutil:
```bash
gsutil cp new-file.gif gs://mum-assets/attached_assets/new-file.gif
```

Then reference in code as `/attached_assets/new-file.gif`.

### Updating Environment Variables

1. Go to Railway dashboard → your service → Variables
2. Add/update the variable
3. Railway will redeploy automatically (for runtime vars) or rebuild (for build-time vars like `VITE_TEST_MODE`)

### Rollback

Railway keeps previous deployments. To rollback:
1. Railway dashboard → Deployments tab
2. Click the previous successful deployment
3. Click "Rollback"

Or revert the git commit and push:
```bash
git revert HEAD
git push origin standalone
```

---

## Migration Commit History

```
ea0c2ca GCS implemented
e1b1247 Health check fixes
f006565 Assets initial fix
75ae744 Dockerfile updates
6e2420d Railway initial impl
```

All changes are on the `standalone` branch relative to `main`.
