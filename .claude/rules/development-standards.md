# Development Standards

IMPORTANT: Apply these standards to EVERY code change. Evaluate all modifications against these criteria before implementing.

## 1. Time & Space Complexity
- Evaluate algorithmic complexity of every change. Prefer O(n) over O(n^2).
- Flag any nested loops over collections or repeated array scans.
- Choose appropriate data structures (e.g., use Maps/objects for lookups instead of `array.find` in loops).

## 2. Database Query Efficiency
- Use `.where()` clauses and `.limit()` in Drizzle queries — never fetch entire tables.
- Avoid N+1 query patterns. Prefer joined queries using Drizzle's `with` relations or subqueries.
- Batch inserts/updates with `db.insert().values([...])` instead of multiple sequential calls.
- Never trigger queries inside loops or on every render cycle.
- Reuse data already available in React Query cache or component props before issuing new fetches.
- Use pagination (`limit`/`offset`) for large datasets instead of fetching everything.

## 3. AI & External API Cost Awareness
- Every call to Claude, OpenAI, Pinecone, HeyGen, ElevenLabs, and Mem0 has a cost. Minimize round-trips.
- Batch OpenAI embedding requests — embed multiple texts in a single API call, not one-by-one.
- Use Haiku 3.5 for bulk/ingestion tasks; reserve Opus for user-facing conversations.
- Cache RAG retrieval results when the same query is likely to repeat within a session.
- Set appropriate `topK` limits on Pinecone queries — don't retrieve more vectors than needed.
- Avoid re-embedding content that hasn't changed. Check for existing vectors before re-ingesting.
- For HeyGen/ElevenLabs, reuse session tokens and connections; don't create new sessions unnecessarily.

## 4. React Rendering Efficiency
- Avoid unnecessary re-renders: memoize expensive computations with `useMemo`.
- Use `useCallback` for stable function references passed as props.
- Don't create new objects/arrays inline in JSX when they cause child re-renders.
- Keep component state as local as possible — don't lift state unnecessarily.
- Leverage React Query's `staleTime: Infinity` — data doesn't auto-refresh, so trust the cache.

## 5. No Redundant API Calls
- Before adding a new fetch, check if the data is already available via `queryClient.getQueryData()`, props, or a parent component.
- Don't fetch the same data multiple times on the same page.
- If multiple components need the same data, fetch it once at a shared parent level or rely on React Query's deduplication.
- Invalidate queries manually (`queryClient.invalidateQueries()`) only when the underlying data has actually changed.

## 6. WebSocket & Real-Time Efficiency
- Don't open duplicate WebSocket connections. Reuse existing connections for `/ws/streaming-chat`, `/ws/webrtc-streaming`, `/ws/elevenlabs-stt`, `/ws/conversation`.
- Always clean up WebSocket connections on component unmount.
- Debounce high-frequency events (typing indicators, audio level meters) before sending over WS.
- Avoid sending large payloads over WebSocket — stream or chunk when necessary.

## 7. Bundle Size
- Don't add new npm dependencies when native JS or an existing utility in `client/src/lib/` can do the job.
- Prefer tree-shakeable imports (e.g., `import { specific } from 'lib'` not `import * as lib`).
- Check `client/src/lib/` for existing utilities before writing new ones.
- All route pages should remain lazy-loaded (already convention with wouter).
- Avoid importing large static assets inline — use dynamic imports or lazy loading.

## 8. Queue & Background Jobs
- BullMQ jobs must be idempotent — the same job running twice should produce the same result.
- Use bulk operations (`queue.addBulk()`) when enqueuing multiple jobs.
- Set appropriate TTLs and `removeOnComplete`/`removeOnFail` to prevent Redis memory bloat.
- Avoid blocking the Node.js event loop in workers — offload CPU-heavy work (ffmpeg, large file processing) to child processes.
- Don't enqueue duplicate jobs — check for existing jobs or use job IDs to deduplicate.
