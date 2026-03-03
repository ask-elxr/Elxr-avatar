# API Reference

All endpoints are served from Express on port 5000. Base URL: `http://localhost:5000`

## Auth Legend
- **Public** — No authentication required
- **Auth** — `isAuthenticated` (any auth method, falls back to anonymous)
- **Member** — `requireMemberstackOrAdmin` (blocks anonymous users)
- **Admin** — `requireAdmin` (admin secret or admin DB role)
- **RL** — Rate limited (requests/window shown)

---

## Authentication

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/login` | Public | Initiates Replit OIDC login (dev: mock user) |
| GET | `/api/callback` | Public | OIDC callback |
| GET | `/api/logout` | Public | End session |
| GET | `/api/auth/user` | Auth | Get current user info |
| PATCH | `/api/auth/user/profile` | Auth | Update name |
| POST | `/api/admin/verify` | Public | Validate admin secret |

## Chat / AI

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/avatar/response` | Member, RL 20/60s | Main chat endpoint |
| POST | `/api/avatar/response/stream` | Member | Streaming chat response |
| POST | `/api/avatar/response/stream-audio` | Member | Audio streaming response |
| POST | `/api/audio` | Member | Full audio pipeline (Claude + TTS) |
| POST | `/api/audio/acknowledgments/precache` | Public | Pre-cache acknowledgment phrases |
| GET | `/api/audio/acknowledgment/:avatarId` | Public | Get cached acknowledgment audio |

## HeyGen / Streaming

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/heygen/token` | Member, RL 15/60s | Get HeyGen streaming token |
| POST | `/api/heygen/streaming-token` | Member, RL 15/60s | Get streaming avatar token |
| POST | `/api/liveavatar/app-token-test` | RL 10/60s | LiveAvatar token test |
| GET | `/api/heygen/available-avatars` | Admin | List available HeyGen avatars |
| GET | `/api/heygen/test-avatars` | Admin | Test avatar connectivity |
| POST | `/api/heygen/debug-mark-kohl` | Admin | Debug specific avatar |
| GET | `/api/heygen/credits` | Public | Check HeyGen credit balance |

## ElevenLabs

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/elevenlabs/credits` | Public | Check ElevenLabs credit balance |
| GET | `/api/elevenlabs/agent-config` | Public | Get agent config |
| POST | `/api/elevenlabs/tts` | Member | Text-to-speech (streaming) |
| POST | `/api/elevenlabs/tts-pcm` | Member | TTS as PCM audio |
| POST | `/api/elevenlabs/tts-base64` | Member | TTS as base64 |

## Claude AI

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/claude/credits` | Public | Check Claude credit balance |

## STT (Speech-to-Text)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/stt` | Public | Transcribe audio blob |

## Sessions

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/session/start` | Member | Start streaming session |
| POST | `/api/session/start-mobile` | Member | Start mobile session |
| POST | `/api/session/end` | Public | End streaming session |
| POST | `/api/session/end-all` | Public | End all sessions |
| POST | `/api/liveavatar/close-session` | Public | Close LiveAvatar session |
| POST | `/api/sessions` | Public | Create chat session |
| POST | `/api/sessions/:sessionId/messages` | Public | Add message to session |

## Conversations

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/conversations` | Public | Save conversation message |
| POST | `/api/conversations/search` | Public | Search conversations |
| DELETE | `/api/conversations/:id` | Public | Delete conversation |
| GET | `/api/conversations/history/:userId/:avatarId` | Public | Get conversation history |

## Memory (Mem0)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/memory/add` | Public | Add memory |
| POST | `/api/memory/search` | Public | Search memories |
| GET | `/api/memory/all` | Public | Get all memories |
| PUT | `/api/memory/:id` | Public | Update memory |
| DELETE | `/api/memory/:id` | Public | Delete memory |
| DELETE | `/api/memory/all/:userId` | Public | Delete all user memories |
| POST | `/api/memory/summarize` | Public | Summarize memories |

## Avatars

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/avatars` | Public | List active avatars |
| GET | `/api/avatars/video-capable` | Public | List video-capable avatars |
| GET | `/api/avatar/config/:avatarId` | Public | Get avatar config |
| GET | `/api/avatar/greeting/:avatarId` | Public | Get avatar greeting |
| GET | `/api/avatars/:id/embed` | Public | Get avatar for embed |
| GET | `/api/admin/avatars` | Auth | List all avatars (admin) |
| POST | `/api/admin/avatars` | Auth | Create avatar |
| PUT | `/api/admin/avatars/:id` | Auth | Update avatar |
| DELETE | `/api/admin/avatars/:id` | Auth | Delete avatar |
| POST | `/api/admin/avatars/reorder` | Auth | Reorder avatars |
| GET | `/api/admin/avatars/pinecone-status` | Auth+Admin | Avatar Pinecone status |
| POST | `/api/admin/avatars/:id/generate-preview` | Auth | Generate preview GIF |
| POST | `/api/admin/avatars/generate-all-previews` | Auth | Generate all preview GIFs |

## Courses

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/courses/` | Public | List user's courses |
| GET | `/api/courses/:id` | Public | Get course detail |
| POST | `/api/courses/` | Auth | Create course |
| PUT | `/api/courses/:id` | Auth | Update course |
| DELETE | `/api/courses/:id` | Auth | Delete course |
| POST | `/api/courses/:courseId/lessons` | Auth | Add lesson |
| PUT | `/api/courses/lessons/:id` | Auth | Update lesson |
| DELETE | `/api/courses/lessons/:id` | Auth | Delete lesson |
| POST | `/api/courses/lessons/:id/generate-video` | Auth | Generate lesson video |
| GET | `/api/courses/lessons/:id/video-status` | Public | Check video generation status |
| POST | `/api/courses/generate-script` | Auth | AI-generate lesson script |

## Chat Videos

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/courses/chat-videos` | Public | List chat-generated videos |
| GET | `/api/courses/chat-videos/pending` | Public | List pending videos |
| GET | `/api/courses/chat-videos/:videoId` | Public | Get video detail |
| DELETE | `/api/courses/chat-videos/:videoId` | Public | Delete video |

## Mood Tracker

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/mood/` | Public | Log mood entry |
| GET | `/api/mood/` | Public | Get mood entries |
| GET | `/api/mood/stats` | Public | Get mood stats |

## Subscriptions

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/subscription/plans` | Public | List plans |
| GET | `/api/subscription/user-plan` | Auth | Get user's plan |
| GET | `/api/subscription/trial-time` | Auth | Get trial time remaining |
| POST | `/api/subscription/start-trial` | Auth | Start free trial |
| POST | `/api/subscription/select-avatar` | Auth | Select avatar for plan |
| GET | `/api/subscription/check-avatar/:avatarId` | Auth | Check avatar access |
| GET | `/api/subscription/check-limit/:type` | Auth | Check usage limit |
| POST | `/api/subscription/upgrade` | Auth | Upgrade plan |
| POST | `/api/subscription/cancel` | Auth | Cancel subscription |
| GET | `/api/subscription/admin/users` | Auth+Admin | List all subscriptions |
| POST | `/api/subscription/memberstack/webhook` | Public | Memberstack webhook |

## Documents

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/documents/process` | Auth+Admin | Process uploaded document |
| GET | `/api/documents` | Public | List all documents |
| GET | `/api/documents/user` | Public | List user's documents |
| GET | `/api/documents/user/:userId` | Auth | List specific user's docs |
| DELETE | `/api/documents/:id` | Public | Delete document |
| POST | `/api/documents/search` | Public | Search documents |
| POST | `/api/documents/url` | Public | Process URL |
| POST | `/api/documents/text` | Public | Process text |
| POST | `/api/documents/upload-zip` | Public | Upload ZIP archive |
| GET | `/api/jobs/:jobId` | Auth | Check job status |

## Pinecone (Admin)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/pinecone/stats` | Public | Get Pinecone stats |
| GET | `/api/pinecone/indexes` | Public | List indexes |
| POST | `/api/pinecone/test-query` | Public | Test query |
| POST | `/api/pinecone/raw-query` | Public | Raw vector query |
| POST | `/api/pinecone/bulk-namespace-upload` | Auth+Admin | Bulk upload |
| GET | `/api/pinecone/namespace-stats` | Auth+Admin | Namespace stats |
| POST | `/api/pinecone/check-existing-files` | Auth+Admin | Check for existing files |
| GET | `/api/admin/pinecone/namespaces` | Auth+Admin | List namespaces |
| GET | `/api/admin/pinecone/namespace/:ns/vectors` | Auth+Admin | List vectors in namespace |
| GET | `/api/admin/pinecone/namespace/:ns/vector/:id` | Auth+Admin | Get vector |
| PUT | `/api/admin/pinecone/namespace/:ns/vector/:id` | Auth+Admin | Update vector |
| POST | `/api/admin/pinecone/namespace/:ns/delete-vectors` | Auth+Admin | Delete vectors |
| DELETE | `/api/admin/pinecone/namespace/:ns` | Auth+Admin | Delete namespace |
| POST | `/api/admin/pinecone/migrate-namespace` | Auth+Admin | Migrate namespace |

## Knowledge Base

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/knowledge-sources` | Auth+Admin | List KB sources |
| POST | `/api/knowledge-sources` | Auth+Admin | Create KB source |
| PUT | `/api/knowledge-sources/:id` | Auth+Admin | Update KB source |
| DELETE | `/api/knowledge-sources/:id` | Auth+Admin | Delete KB source |
| POST | `/api/knowledge-sources/:id/sync` | Auth+Admin | Sync KB source |

## Google Drive

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/google-drive/status` | Auth | Check Google Drive connection |
| GET | `/api/google-drive/folders` | Auth | List folders |
| GET | `/api/google-drive/shared-drives` | Auth | List shared drives |
| GET | `/api/google-drive/shared-drive/:driveId/folders` | Auth | List drive folders |
| GET | `/api/google-drive/folder/:folderId` | Auth | Get folder contents |
| GET | `/api/google-drive/search` | Auth | Search Drive |
| POST | `/api/google-drive/upload-to-pinecone` | Auth | Upload to Pinecone |
| GET | `/api/google-drive/folder-stats` | Auth | Get folder stats |
| GET | `/api/google-drive/topic-folders` | Auth+Admin | List topic folders |
| GET | `/api/google-drive/topic-folder/:folderId/files` | Auth+Admin | List topic folder files |
| POST | `/api/google-drive/topic-upload-single` | Auth+Admin | Upload single topic file |
| POST | `/api/google-drive/topic-upload-artifacts` | Auth+Admin | Upload as learning artifacts |
| POST | `/api/google-drive/bulk-ingest-start` | Public | Start bulk ingestion |
| GET | `/api/google-drive/bulk-ingest-status` | Public | Check bulk ingestion status |
| POST | `/api/google-drive/batch-upload` | Auth | Batch upload |

## Ingestion (Admin)

All require admin secret header.

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/admin/ingest/text` | Admin | Ingest text content |
| POST | `/api/admin/query` | Admin | Query ingested content |
| DELETE | `/api/admin/source/:source_id` | Admin | Delete source |
| GET | `/api/admin/health` | Admin | Health check |
| POST | `/api/admin/course/ingest` | Admin | Ingest course |
| GET | `/api/admin/course/stats/:namespace` | Admin | Course namespace stats |
| DELETE | `/api/admin/course/namespace/:namespace` | Admin | Delete namespace |
| POST | `/api/admin/course/extract-text` | Admin | Extract text from course |
| POST | `/api/admin/podcast/ingest` | Admin | Ingest podcast |
| GET | `/api/admin/podcast/namespaces/taxonomy` | Admin | Get namespace taxonomy |
| POST | `/api/admin/podcast/batch/upload` | Admin | Upload podcast batch (ZIP) |
| GET | `/api/admin/podcast/batch/:batchId` | Admin | Get batch status |
| GET | `/api/admin/podcast/batches` | Admin | List all batches |
| POST | `/api/admin/podcast/batch/:batchId/retry` | Admin | Retry failed batch |
| POST | `/api/admin/podcast/batch/resume-stuck` | Admin | Resume stuck batches |
| DELETE | `/api/admin/podcast/batch/:batchId` | Admin | Delete batch |
| POST | `/api/admin/podcast/batch/:batchId/cancel` | Admin | Cancel batch |
| POST | `/api/admin/podcast/batch/:batchId/classify` | Admin | Classify episodes |
| POST | `/api/admin/podcast/batch/:batchId/start-processing` | Admin | Start processing |
| PATCH | `/api/admin/podcast/episode/:episodeId/namespace` | Admin | Update episode namespace |
| GET | `/api/admin/learning-artifacts/kbs` | Admin | List knowledge bases |
| POST | `/api/admin/learning-artifacts/ingest` | Admin | Ingest learning artifacts |
| POST | `/api/admin/learning-artifacts/ingest-batch` | Admin | Batch ingest artifacts |
| POST | `/api/admin/learning-artifacts/ingest-full-course` | Admin | Full course ingestion |
| GET | `/api/admin/learning-artifacts/job/:jobId` | Admin | Get ingestion job status |
| GET | `/api/admin/learning-artifacts/jobs` | Admin | List ingestion jobs |
| GET | `/api/admin/learning-artifacts/stats/:namespace` | Admin | Artifact stats |
| DELETE | `/api/admin/learning-artifacts/:namespace/:courseId` | Admin | Delete course artifacts |
| GET | `/api/admin/namespaces` | Admin | List all namespaces |
| GET | `/api/admin/namespaces/duplicates` | Admin | Find duplicate namespaces |
| POST | `/api/admin/namespaces/consolidate` | Admin | Consolidate namespaces |

## Personas (Admin)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/admin/personas` | Auth | List personas |
| GET | `/api/admin/personas/:id` | Auth | Get persona |
| GET | `/api/admin/personas/:id/preview` | Auth | Preview assembled prompt |
| PUT | `/api/admin/personas/:id` | Auth | Update persona |
| POST | `/api/admin/personas` | Auth | Create persona |
| POST | `/api/admin/personas/:id/refresh` | Auth | Refresh persona |
| POST | `/api/admin/personas/refresh-all` | Auth | Refresh all personas |
| POST | `/api/admin/personas/:id/test-critic` | Auth | Test response critic |
| POST | `/api/admin/personas/:id/from-text` | Auth | Generate persona from text |
| POST | `/api/admin/personas/:id/from-document` | Auth | Generate persona from document |

## Games

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/games/play` | Public | Play a game (trivia, word-association, etc.) |

## Research

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/wikipedia/sync` | Public | Sync Wikipedia to Pinecone |
| GET | `/api/pubmed/status` | Public | PubMed status |
| POST | `/api/pubmed/search` | Public | Search PubMed |
| POST | `/api/test-pubmed-summary` | Public | Test PubMed summary |
| POST | `/api/pubmed/offline-search` | Public | Offline PubMed search |
| GET | `/api/pubmed/offline-stats` | Public | Offline PubMed stats |
| DELETE | `/api/pubmed/offline-clear` | Auth | Clear offline PubMed |

## Admin / Analytics

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/analytics/overview` | Public | Analytics overview |
| GET | `/api/admin/mood/analytics` | Auth+Admin | Mood analytics |
| GET | `/api/admin/users` | Auth+Admin | List users |
| PUT | `/api/admin/users/:userId/role` | Auth+Admin | Update user role |
| GET | `/api/admin/costs` | Auth+Admin | Cost tracking |
| GET | `/api/admin/sessions` | Auth+Admin | Session tracking |
| GET | `/api/admin/service-status` | Auth+Admin | Service health |
| POST | `/api/admin/circuit-breaker/reset` | Admin | Reset circuit breaker |
| GET | `/api/admin/circuit-breaker/status` | Admin | Circuit breaker status |

## Metrics / Misc

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/metrics` | Public | Prometheus metrics |
| GET | `/api/performance/cache` | Public | Cache performance |
| GET | `/api/public-storage/:filename` | Public | Serve file from object storage |
| GET | `/api/intro-video/:avatarId` | Public | Get avatar intro video |
| POST | `/api/admin/upload-asset` | Auth+Admin | Upload static asset |

## n8n Webhooks

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/webhook/n8n/list-files` | Public | List files for n8n |
| POST | `/api/webhook/n8n/ingest-file` | Public | Ingest file via n8n |
| GET | `/api/webhook/n8n/stats` | Public | n8n stats |
| POST | `/api/webhook/n8n/ingest-all` | Public | Ingest all via n8n |

## WebSocket Endpoints

| Path | Purpose |
|------|---------|
| `ws://host/ws/streaming-chat` | Streaming text + audio chat |
| `ws://host/ws/webrtc-streaming` | WebRTC/LiveKit video streaming |
| `ws://host/ws/elevenlabs-stt` | ElevenLabs real-time STT |
| `ws://host/ws/conversation` | Unified conversation pipe (primary) |

WebSocket URLs include auth params: `?member_id=...&admin_secret=...`
