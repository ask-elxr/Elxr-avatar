# Mem0 Analysis & Optimization Plan

## Current State Summary

### Implementation
- **Two service files** (design debt):
  - `server/memoryService.ts` (active) -- simplified API wrapper, `Token` auth header
  - `server/mem0Service.ts` (legacy/unused) -- had dedup logic, `Bearer` auth header
- **API**: Mem0 managed platform (`api.mem0.ai/v1`)
- **Memory types**: `summary`, `note`, `preference`

### How It Works Today
```
User message -> [SYNC] search memories (limit:5, minScore:0.4)
             -> [PARALLEL] fetch RAG + history
             -> Build prompt with memories injected
             -> Claude generates response
             -> [FIRE & FORGET] store turn in Mem0
```

### Per-Message Cost: ~3 API calls
1. Search memories (before response)
2. Add memory (after response, fire-and-forget)
3. Occasional get-all/delete operations

### Integration Points
- `server/routes.ts` -- 6 memory API endpoints + conversation integration
- `server/conversationWsService.ts` -- real-time memory storage
- `client/src/components/MemoryViewer.tsx` -- frontend viewer
- Memory prompt injection includes ~200-300 token "NEVER DENY MEMORY" directive

---

## Key Findings

### Issues in Current Implementation

| Issue | Severity | Details |
|-------|----------|---------|
| **Dead code** (`mem0Service.ts`) | Low | Legacy service with useful dedup logic that's not being used |
| **No deduplication in active service** | Medium | `memoryService.ts` lacks the dedup check that `mem0Service.ts` had |
| **Fire-and-forget errors silenced** | Medium | `.catch(() => {})` swallows all storage failures |
| **No memory decay/weighting** | Medium | All memories treated equally regardless of age/relevance |
| **No pagination on getAllMemories** | Low | Could be problematic at scale |
| **Sync blocking on first message** | Low | 100-500ms added to first response latency |
| **No custom categories** | Medium | Using Mem0 default categories instead of domain-specific ones |
| **No custom extraction instructions** | High | Mem0 may store speculation as fact (dangerous for wellness/health context) |
| **Memory prompt always injected** | Low | ~200-300 extra tokens even when no memories found |

### Cost Analysis

| Option | Monthly Cost | Pros | Cons |
|--------|-------------|------|------|
| **Mem0 Free** | $0 | 10K memories | Limited |
| **Mem0 Pro** | $19/mo | Higher limits | Still limited |
| **Mem0 Business** | $249/mo | Unlimited, graph | Expensive jump |
| **Custom (pgvector on Neon)** | ~$5-20/mo | Full control, no vendor lock-in | 20-40h dev time |
| **Anthropic Memory Tool** | $0 (client-side) | Claude-native, ZDR eligible | Newer, less battle-tested |

### What Mem0 Does Well
- Automatic fact extraction + conflict resolution (ADD/UPDATE/DELETE/NOOP)
- Token-efficient (~7k tokens/conv vs 600k+ for alternatives like Zep)
- Graceful degradation (conversations work without it)

### What Could Be Better
- No custom extraction instructions (speculation stored as fact)
- No domain-specific categories (wellness, education, avatar preferences)
- No graph memory usage (paying for basic vector search only)
- No temporal reasoning (can't track how facts change over time)

---

## Recommendations

### Option A: Optimize Current Mem0 (Quick Wins)
**Effort**: Low | **Impact**: Medium | **Cost**: Same

1. **Set custom categories** via Mem0 project settings:
   - `wellness_goals`, `health_info`, `learning_progress`, `personal_preferences`, `avatar_preferences`, `session_preferences`

2. **Add custom extraction instructions**:
   ```
   Only store confirmed facts and explicit preferences.
   Do NOT store: speculation ("I think", "maybe"),
   sensitive health data without confirmation,
   transient session preferences.
   For health/wellness topics, require explicit user confirmation before storing.
   ```

3. **Fix deduplication** -- port dedup logic from `mem0Service.ts` to `memoryService.ts`

4. **Delete `mem0Service.ts`** -- remove dead code

5. **Conditional memory prompt injection** -- only inject the "NEVER DENY MEMORY" directive when memories are actually found

6. **Log memory failures** instead of silencing them

### Option B: Migrate to Custom pgvector Memory (Medium-Term)
**Effort**: Medium (20-40h) | **Impact**: High | **Cost**: -$230/mo savings

1. **Add `user_memories` table** to Neon PostgreSQL:
   ```sql
   CREATE TABLE user_memories (
     id SERIAL PRIMARY KEY,
     user_id TEXT NOT NULL,
     content TEXT NOT NULL,
     embedding vector(1536),
     memory_type VARCHAR(50),  -- preference, fact, rule, identity
     metadata JSONB,
     confidence FLOAT DEFAULT 1.0,
     access_count INTEGER DEFAULT 0,
     last_accessed TIMESTAMP,
     created_at TIMESTAMP DEFAULT NOW()
   );
   ```

2. **Use Claude Haiku 3.5 for extraction** (cost: ~$0.25/M input tokens):
   ```
   Extract key facts/preferences from this exchange. Return JSON.
   Only confirmed facts, not speculation. Filter PII.
   ```

3. **Embed with text-embedding-3-small** (already using for RAG)

4. **Retrieve via pgvector** cosine similarity (top-5, threshold 0.4)

5. **Add memory decay**: weight by `recency * access_frequency * confidence`

6. **Run Mem0 in parallel** during migration for quality comparison

7. **Implement consolidation**: post-session merge of session memories into long-term

### Option C: Anthropic Memory Tool (Experimental)
**Effort**: Medium | **Impact**: High | **Cost**: $0 additional

- Claude natively decides what to remember/retrieve
- Client-side storage (full data control, ZDR eligible)
- Available on Claude Opus 4.6 (your primary model)
- Could replace both Mem0 AND custom extraction logic
- Worth prototyping but newer/less proven

---

## Recommended Path

### Phase 1: Quick Wins (Option A) -- This Week
- [ ] Set custom categories on Mem0 project
- [ ] Add custom extraction instructions
- [ ] Port dedup logic from `mem0Service.ts` -> `memoryService.ts`
- [ ] Delete `mem0Service.ts`
- [ ] Conditional memory prompt injection
- [ ] Log instead of swallow memory failures

### Phase 2: Custom Memory Layer (Option B) -- Next Sprint
- [ ] Add `user_memories` table with pgvector + Drizzle schema
- [ ] Build extraction service using Haiku 3.5
- [ ] Implement retrieval with decay scoring
- [ ] Run parallel with Mem0 for quality comparison
- [ ] Add GDPR-compliant deletion endpoint

### Phase 3: Evaluate & Cut Over
- [ ] Compare custom vs Mem0 retrieval quality over 2 weeks
- [ ] If custom matches or beats Mem0, remove Mem0 dependency
- [ ] Prototype Anthropic Memory Tool as future enhancement
- [ ] Estimated savings: $230+/month

---

## Privacy Considerations (GDPR)

- Never store: passwords, payment details, SSNs, full DOB
- Redact before storing: email, phone, addresses
- Implement right-to-erasure: `DELETE /api/users/:id/memories`
- Health/wellness data requires explicit consent before memory storage
- Document retention policies per memory type
- PII redaction during extraction, not just at query time

---

## Files to Modify

| File | Changes |
|------|---------|
| `server/memoryService.ts` | Add dedup, logging, conditional injection |
| `server/mem0Service.ts` | DELETE (after porting dedup) |
| `server/routes.ts` | Conditional memory prompt, improved error handling |
| `shared/schema.ts` | Add `user_memories` table (Phase 2) |
| `server/storage.ts` | Add memory CRUD operations (Phase 2) |
| `server/services/memoryExtraction.ts` | NEW -- Haiku-based extraction (Phase 2) |
