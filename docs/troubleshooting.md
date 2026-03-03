# Troubleshooting Guide

## Quick Checks

Before diving into specific issues, verify these fundamentals:

```bash
# Check Node version (need 20+)
node --version

# Check TypeScript types
npm run check

# Test database connection
node test-db-connection.js

# Check service status (requires admin secret)
curl -H "X-Admin-Secret: YOUR_SECRET" http://localhost:5000/api/admin/service-status

# Check circuit breaker status
curl -H "X-Admin-Secret: YOUR_SECRET" http://localhost:5000/api/admin/circuit-breaker/status

# View Prometheus metrics
curl http://localhost:5000/metrics
```

---

## Database Issues

### Connection Refused / Timeout

**Symptoms**: Server crashes on startup, `ECONNREFUSED` or `ETIMEDOUT` errors.

**Causes & Fixes**:
1. **Missing DATABASE_URL**: Ensure `DATABASE_URL` is set in `.env` with `?sslmode=require` for Neon.
2. **Neon cold start**: Neon serverless databases can take a few seconds to wake. The first request after idle may timeout. Retry.
3. **SSL issues**: Neon requires SSL. Ensure connection string includes `sslmode=require`.
4. **Individual PG vars**: If `DATABASE_URL` is missing, the server auto-constructs it from `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGPORT`. Verify all are set.

### Schema Mismatch

**Symptoms**: `column does not exist`, `relation does not exist` errors.

**Fix**:
```bash
npm run db:push
```

This is non-destructive — it adds new tables/columns without dropping existing ones.

### Session Table Missing

**Symptoms**: `relation "sessions" does not exist` on auth endpoints.

**Fix**: Run `npm run db:push` to create the sessions table. The `connect-pg-simple` session store requires this table.

---

## Build Errors

### TypeScript Errors

```bash
npm run check
```

Common issues:
- **Path alias resolution**: Ensure `@/` maps to `client/src/` and `@shared/` to `shared/` in both `tsconfig.json` and `vite.config.ts`.
- **Missing types**: Install `@types/...` packages if needed (most are dev dependencies).

### Vite Build Failures

**Symptoms**: `npm run build` fails during frontend bundling.

**Common causes**:
- Import of server-only modules in client code
- Missing environment variables referenced at build time
- Large bundle size — check for accidental imports of entire libraries

### esbuild Bundle Failures

**Symptoms**: `npm run build` fails during server bundling.

**Note**: Server bundle uses `--packages=external`, so all node_modules must be installed in production. If deploying with `npm ci --production`, ensure all runtime dependencies are in `dependencies` (not `devDependencies`).

---

## Memory Issues

### High Memory Usage / OOM

**Symptoms**: Server crashes with `JavaScript heap out of memory`.

**Fixes**:
1. Ensure `NODE_OPTIONS=--max-old-space-size=4096` is set (currently in `.replit` shared env).
2. The server has a memory monitor that logs warnings when heap exceeds 1GB.
3. For ingestion operations, use the micro-batch pattern (small batches with delays between).
4. Podcast batch ingestion is specifically designed to avoid memory spikes.

### Memory Leak Symptoms

**Indicators**: Gradually increasing heap usage over time.

**Check**: Visit `/metrics` and look at `process_heap_bytes` Prometheus metric.

**Common sources**:
- Unclosed WebSocket connections
- Accumulated circuit breaker state
- Large conversation histories held in memory

---

## External Service Errors

### HeyGen

**"Insufficient credits"**: Check `HEYGEN_CREDIT_LIMIT` (default 1000). View credit usage at `GET /api/heygen/credits`.

**"Avatar not found"**: Verify `heygen_avatar_id`, `live_avatar_id`, or `heygen_video_avatar_id` in the avatar profile matches a valid HeyGen avatar.

**Streaming token failures**: Rate limited to 15 requests per 60 seconds. Check circuit breaker status.

**Stuck video generation**: The server automatically recovers stuck videos on startup (`server/services/videoGeneration.ts`). To manually check: `GET /api/courses/chat-videos/pending`.

### ElevenLabs

**"Quota exceeded"**: Check credits at `GET /api/elevenlabs/credits`.

**Voice not found**: Verify `elevenlabs_voice_id` or `audio_only_voice_id` in avatar profile.

**STT WebSocket disconnect**: The ElevenLabs STT WebSocket at `wss://api.elevenlabs.io/v1/speech-to-text/realtime` may disconnect on network issues. The client hook auto-reconnects.

### Claude (Anthropic)

**Rate limits**: Claude API has rate limits. The circuit breaker (`server/circuitBreaker.ts`) will open after repeated failures, preventing cascading errors.

**"Model not found"**: Verify `ANTHROPIC_API_KEY` is valid and has access to the specified model.

### Pinecone

**"Namespace not found"**: Namespaces are created on first upsert. If querying an empty namespace, you'll get zero results (not an error).

**Slow queries**: Check the latency cache at `GET /api/performance/cache`. The server caches Pinecone query results in memory.

**Dimension mismatch**: All vectors must be 1536 dimensions (from `text-embedding-3-small`). If you see dimension errors, ensure no `ada-002` embeddings are mixed in.

### Mem0

**Connection failures**: Mem0 API at `https://api.mem0.ai/v1` may have availability issues. Memory operations are non-critical — chat works without them (just without personalization).

---

## WebSocket Issues

### Connection Failures

**Symptoms**: WebSocket connections fail to establish.

**Debug**:
1. Check that the WebSocket URL includes auth params: `?member_id=...&admin_secret=...`
2. Verify the server is running and accessible
3. Check CORS headers — the server allows all origins
4. Browser dev tools → Network → WS tab shows connection attempts

### Conversation WebSocket Dropping

**Symptoms**: `/ws/conversation` disconnects mid-conversation.

**Causes**:
- Server timeout (10s default) — but conversation WS bypasses this
- Client network change (WiFi → cellular)
- Server restart during conversation

**The client hooks auto-reconnect**, but the conversation context may be lost.

### No Audio from Avatar

**Possible causes**:
1. Browser autoplay policy — user must interact with page first
2. AudioContext suspended — needs `audioContext.resume()` after user gesture
3. Volume set to 0 — check `avatar-volume` in localStorage
4. Wrong driver — check `streaming_platform` in avatar profile
5. iOS Safari — requires special handling (Web Worker for session start)

---

## Authentication Issues

### "Not authenticated" in Embed Mode

**Cause**: Missing `member_id` query parameter in Webflow embed URL.

**Fix**: Ensure the iframe URL includes `?member_id=MEMBERSTACK_ID`.

### Admin Panel Access Denied

**Cause**: Wrong admin secret.

**Fix**:
1. Check `ADMIN_SECRET` env var (supports comma-separated for multiple secrets)
2. Clear `admin_secret` from localStorage and re-enter
3. The admin panel stores the secret in localStorage as `admin_secret`

### Dev Mode Auth

In development (`NODE_ENV=development` on localhost), a mock user is auto-injected. If auth issues occur in dev:
1. Ensure `NODE_ENV=development` is set
2. Access via `localhost` (not `127.0.0.1` or other hostname)

---

## Stuck Jobs

### Stuck Video Generation

**Symptoms**: Videos stuck in `generating` status indefinitely.

**Auto-recovery**: The server runs `recoverStuckVideoGenerations()` on startup, which re-polls HeyGen for any videos in `generating` status.

**Manual fix**:
```bash
# Check pending videos
curl http://localhost:5000/api/courses/chat-videos/pending
```

### Stuck Ingestion Jobs

**Symptoms**: Ingestion job stuck in `processing` status.

**For podcast batches**:
```bash
# Resume stuck batches
curl -X POST -H "X-Admin-Secret: SECRET" \
  http://localhost:5000/api/admin/podcast/batch/resume-stuck
```

**For learning artifact jobs**: Check `ingestion_jobs` table. Jobs are designed to be resumable — they track `processed_lesson_ids` and skip already-completed lessons.

---

## Circuit Breakers

The circuit breaker wraps external service calls to prevent cascading failures.

**States**:
- **Closed** (normal) — Requests pass through
- **Open** (tripped) — Requests fail immediately without calling the service
- **Half-Open** — Testing if service recovered

**Check status**:
```bash
curl -H "X-Admin-Secret: SECRET" \
  http://localhost:5000/api/admin/circuit-breaker/status
```

**Reset manually**:
```bash
curl -X POST -H "X-Admin-Secret: SECRET" \
  http://localhost:5000/api/admin/circuit-breaker/reset
```

---

## Logging

### Pino Logger (`server/logger.ts`)

Structured JSON logging. In development, logs are human-readable. In production, JSON format for log aggregation.

**Log locations**:
- stdout — All server logs
- Request logger — Logs all API requests with method, path, status, duration

### Request Logging

The server patches `res.json` to log: `METHOD PATH STATUS DURATIONms :: responseBody`

Only logs `/api/*` routes to avoid noise from static file serving.

---

## Environment Variable Checklist

If the app isn't working, verify these are set:

| Variable | Test |
|----------|------|
| `DATABASE_URL` | `node test-db-connection.js` |
| `ANTHROPIC_API_KEY` | Chat with an avatar |
| `OPENAI_API_KEY` | Any ingestion operation |
| `PINECONE_API_KEY` | `GET /api/pinecone/stats` |
| `HEYGEN_API_KEY` | `GET /api/heygen/credits` |
| `ELEVENLABS_API_KEY` | `GET /api/elevenlabs/credits` |
| `MEM0_API_KEY` | `GET /api/memory/all` |
| `SESSION_SECRET` | Auth endpoints |
| `ADMIN_SECRET` | Admin panel access |
| `LIVEKIT_API_KEY` + `_SECRET` + `_URL` | Video streaming |
| `MEMBERSTACK_SECRET_KEY` | Subscription features |
| `GOOGLE_CLIENT_ID` + `_SECRET` | Google Drive features |
| `RESEND_API_KEY` | Email notifications |
