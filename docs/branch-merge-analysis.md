# Branch Merge Analysis: `main` vs `standalone`

**Date**: March 3, 2026
**Author**: Claude Code analysis
**Purpose**: Thorough comparison of both branches to inform merge strategy

---

## Branch Topology

```
origin/main (a13e4d5) — "Improve loading animations for a smoother user experience"
       │
       ├── main (375 total commits, 13 after divergence)
       │   └── c7a7ad8 "Add integration for AI assistant with Pinecone knowledge retrieval"
       │
       └── standalone (2,416 total commits, 2,041 after divergence + 2 cleanup commits)
            ├── bbb45aa "Improve fullscreen experience..."
            ├── 286949d "Remove media assets, uploads, databases..." (cleanup)
            └── cd646b4 "Add project documentation and update server config..." (docs + config)
```

**Key fact**: `main` has only 375 commits total (shorter, rewritten history). `standalone` has 2,416 commits (the full Replit development history). They diverged from the same point (`a13e4d5`) but took completely different paths.

---

## The 13 Commits on `main` Missing from `standalone`

### Feature Commits (6 — meaningful code changes)

| # | Commit | Message | Files Changed |
|---|--------|---------|---------------|
| 1 | `c7a7ad8` | **Add integration for AI assistant with Pinecone knowledge retrieval** | `server/mcpAssistant.ts` (NEW, 119 lines) |
| 2 | `2b578bb` | **Update avatar system to use new LiveAvatar SDK** | `avatar-chat.tsx` (-151/+103), `routes.ts` (+37/-37) |
| 3 | `3659c44` | **Enable users to interrupt the avatar during conversations** | `useAvatarSession.ts` (+13/-1) |
| 4 | `8f13287` | **Correctly handle and store all avatar knowledge base information** | `documentProcessor.ts`, `pineconeNamespaceService.ts` |
| 5 | `c7fb2dc` | **Fix issues with knowledge base uploads not appearing** | `documentProcessor.ts`, `pineconeNamespaceService.ts` |
| 6 | `43c2df9` | **Fix knowledge base uploads and improve fullscreen** | `avatar-chat.tsx`, `documentProcessor.ts`, `manifest.json` |

### Minor/Auto Commits (7 — low value)

| # | Commit | Message | Notes |
|---|--------|---------|-------|
| 7 | `c86bb9c` | Update avatar streaming to use LiveAvatar API | 2 one-line changes |
| 8 | `a12da47` | Use lower quality avatars to conserve streaming credits | 1 line change |
| 9 | `7663c2c` | Restored to `6068529` | Massive restore (re-added all bloat files) |
| 10 | `2859cd0` | Saved progress at the end of the loop | .replit only |
| 11 | `bca8866` | Published your App | Replit deploy marker |
| 12 | `fb0428f` | Improve audio interruption | No actual code diff |
| 13 | `e79b1ae` | Improve barge-in functionality | No actual code diff |

---

## File-by-File Conflict Analysis

### 1. `server/documentProcessor.ts` — CONFLICT: HIGH

**What's different:**

| Aspect | main | standalone |
|--------|------|-----------|
| Import | `import { pineconeService, PineconeIndexName }` | `import { pineconeService }` (no PineconeIndexName) |
| Max chunks | `100` | `15` (reduced for stability) |
| storeConversation call | `pineconeService.storeConversation(chunkId, chunk, embedding, cleanMetadata, targetNamespace, PineconeIndexName.ASK_ELXR)` | `pineconeService.storeConversation(chunkId, chunk, embedding, cleanMetadata)` (2 fewer params) |
| Default namespace | `metadata.namespace \|\| 'mark-kohl'` | No default namespace |
| Namespace list | Includes `'mark-kohl'` at start, uses hyphens: `'creativity-expression'` | Missing `'mark-kohl'`, uses triple-dashes: `'creativity---expression'` |
| Relevance threshold | `score > 0.5` | `score > 0.75` (stricter) |

**Assessment**: Main's namespace handling is more explicit and correct. Standalone's triple-dash namespaces (`creativity---expression`) look like a bug. However, standalone's chunk limit (15) and stricter threshold (0.75) may improve stability and quality.

**Recommendation**: Use main's namespace logic + standalone's chunk limit/threshold.

---

### 2. `server/pineconeNamespaceService.ts` — CONFLICT: CRITICAL

**What's different:**

```
// MAIN — normalizes to lowercase-kebab
normalizeNamespace(namespace: string): string {
  return namespace.toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
// "MARK_KOHL" → "mark-kohl"

// STANDALONE — normalizes to UPPERCASE_UNDERSCORE
normalizeNamespace(namespace: string): string {
  return namespace.toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}
// "mark-kohl" → "MARK_KOHL"
```

**Assessment**: This is a **data integrity issue**. If Pinecone namespaces are stored as `mark-kohl` (lowercase-kebab), then standalone's UPPERCASE normalization will query `MARK_KOHL` and **find nothing**. The correct format must match what's actually in Pinecone.

**Recommendation**: Check Pinecone directly to determine actual namespace format. Use whichever matches the stored data.

---

### 3. `client/src/hooks/useAvatarSession.ts` — CONFLICT: MEDIUM

**What's different:**

| Aspect | main | standalone |
|--------|------|-----------|
| `performBargeInRef` | Present — bridges barge-in from conversation WS callbacks | **Removed entirely** |
| Partial transcript barge-in | Calls `performBargeInRef.current()` on WS partials | Empty debounce timer (no action) |
| Final transcript barge-in | Calls `performBargeInRef.current()` on WS finals | No barge-in call |
| `hardStopAudio()` | Called during `performBargeIn` to stop WS audio pipeline | **Removed** |
| `performBargeIn` deps | `[conversationWs]` | `[]` (empty) |
| Ref sync | `performBargeInRef.current = performBargeIn;` at end | **Removed** |

**Assessment**: Main has a complete barge-in feature that lets users interrupt the avatar mid-speech via conversation WebSocket. Standalone stripped this out, which simplifies the code but removes a user-facing feature.

**Recommendation**: Keep main's barge-in feature — it's a meaningful UX improvement for real-time conversations.

---

### 4. `client/src/hooks/useFullscreen.ts` — CONFLICT: MEDIUM

**What's different:**

| Aspect | main | standalone |
|--------|------|-----------|
| iOS strategy | Early return to pseudo-fullscreen for all iOS | Three-tier: native → iOS video → pseudo-fullscreen |
| Android strategy | Try native after iOS check | Native Fullscreen API first (same) |
| Logging | Minimal | Detailed console logs with emojis at each stage |
| Dependencies | `[isIOS, applyPseudoFullscreen]` | `[isIOS, applyPseudoFullscreen, attachIOSVideoListeners]` |

**Assessment**: Standalone has a more robust three-strategy approach with better iOS handling (tries `webkitEnterFullscreen` on video element before falling back to CSS). Main takes a simpler shortcut for iOS.

**Recommendation**: Use standalone's version — more robust cross-device fullscreen handling.

---

### 5. `client/src/index.css` — CONFLICT: MEDIUM

**What's different:**

| Aspect | main | standalone |
|--------|------|-----------|
| `.pseudo-fullscreen` | Uses `right: 0; bottom: 0` + `env(safe-area-inset-*)` | Uses `width: 100vw; height: -webkit-fill-available` |
| Video positioning | `width: 100%; height: 100%; object-fit: cover` | `position: absolute; top: 0; left: 0; width: 100vw; z-index: 1` |
| Scrollbar hiding | After pseudo-fullscreen rules | Before pseudo-fullscreen rules (reordered) |
| Replit banner | Not addressed | `body.pseudo-fullscreen-active [data-replit-dev-banner] { display: none }` |
| Canvas support | Not present | `.pseudo-fullscreen canvas` styled alongside video |

**Assessment**: Standalone has more thorough CSS for fullscreen, including canvas support, Replit banner hiding, and `-webkit-fill-available` for iOS viewport bugs.

**Recommendation**: Use standalone's version.

---

### 6. `server/index.ts` — CONFLICT: LOW

| main | standalone |
|------|-----------|
| `reusePort: true` (always) | `...(process.platform === 'linux' ? { reusePort: true } : {})` |

**Recommendation**: Use standalone's conditional — required for macOS compatibility.

---

### 7. `server/replitAuth.ts` — CONFLICT: LOW

| main | standalone |
|------|-----------|
| Crashes without `REPLIT_DOMAINS` | Skips OIDC in development mode |
| Always sets up Replit OIDC | Wraps OIDC in `if (NODE_ENV !== 'development')` |

**Recommendation**: Use standalone's version — required for local development.

---

### 8. `server/mcpAssistant.ts` — NEW FILE (main only)

118 lines. Integrates Pinecone's Assistant API for RAG retrieval. Features:
- Creates Pinecone Assistant client (`knowledge-base-assistant`)
- `retrieveContext(query, topK)` — queries assistant via chat API
- Returns results with citations and usage metadata
- Error handling with fallback

**Recommendation**: Cherry-pick this file to standalone — it's a new feature with no conflicts.

---

### 9. `public/manifest.json` — IDENTICAL on both branches

No conflict.

---

### 10. `client/src/components/avatar-chat.tsx` — IDENTICAL on both branches

Despite main having 4 commits touching this file, the final state is identical. No conflict.

---

### 11. `server/routes.ts` — IDENTICAL on both branches

No conflict.

---

### 12. `package.json` — CONFLICT: LOW

| main | standalone |
|------|-----------|
| `"dev": "NODE_ENV=development tsx server/index.ts"` | `"dev": "node --env-file=.env --import tsx server/index.ts"` |

**Recommendation**: Use standalone's version — loads .env file for local development.

---

### 13. `.gitignore` — CONFLICT: LOW

| main | standalone |
|------|-----------|
| 6-line basic gitignore | 54-line comprehensive gitignore |

**Recommendation**: Use standalone's version — comprehensive coverage.

---

## Files Only on Standalone (Not on Main)

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project reference for Claude Code |
| `docs/api-reference.md` | Complete API endpoint documentation |
| `docs/architecture.md` | System design overview |
| `docs/avatar-system.md` | Avatar profiles, HeyGen, personality engine |
| `docs/database-schema.md` | All tables and relationships |
| `docs/deployment.md` | Build, deploy, environment setup |
| `docs/external-services.md` | Third-party integrations |
| `docs/frontend-guide.md` | Routes, components, hooks, styling |
| `docs/ingestion-pipelines.md` | Knowledge ingestion workflows |
| `docs/troubleshooting.md` | Common issues and debugging |
| `docs/commercial_proposal.txt` | Commercial proposal |
| `docs/proposal.txt` | Project proposal |
| `test/data/05-versions-space.pdf.txt` | Test fixture |

---

## Merge Risk Summary

| Risk Level | Files | Issue |
|------------|-------|-------|
| **CRITICAL** | `pineconeNamespaceService.ts` | Namespace format mismatch — could break all RAG retrieval |
| **HIGH** | `documentProcessor.ts` | Different function signatures, namespace lists, thresholds |
| **MEDIUM** | `useAvatarSession.ts` | Barge-in feature removed vs kept |
| **MEDIUM** | `useFullscreen.ts`, `index.css` | Different fullscreen strategies |
| **LOW** | `index.ts`, `replitAuth.ts`, `package.json`, `.gitignore` | Standalone versions clearly better |
| **NONE** | `avatar-chat.tsx`, `routes.ts`, `manifest.json` | Identical on both branches |

---

## Recommended Merge Strategy

**Use `standalone` as the base branch**, then bring in main's improvements:

### Step 1: Cherry-pick clean additions from main
- `server/mcpAssistant.ts` — new file, no conflicts

### Step 2: Manually merge with standalone preference
- `useFullscreen.ts` — keep standalone's three-tier strategy
- `index.css` — keep standalone's robust CSS
- `server/index.ts` — keep standalone's conditional reusePort
- `server/replitAuth.ts` — keep standalone's dev mode bypass
- `package.json` — keep standalone's --env-file dev script
- `.gitignore` — keep standalone's comprehensive rules

### Step 3: Resolve critical conflicts
- `pineconeNamespaceService.ts` — **verify actual Pinecone namespace format first**
- `documentProcessor.ts` — merge main's namespace logic + standalone's chunk limit/threshold
- `useAvatarSession.ts` — keep main's barge-in feature (restore what standalone removed)

### Step 4: Verify
- Check Pinecone namespace format (lowercase-kebab vs UPPERCASE_UNDERSCORE)
- Test barge-in interruption in a live avatar session
- Test fullscreen on iOS, Android, and desktop
- Run `npm run check` to verify TypeScript compiles
- Run `npm run dev` to verify local startup

---

## Pre-Merge Checklist

- [ ] Determine actual Pinecone namespace format
- [ ] Decide on relevance threshold (0.5 vs 0.75)
- [ ] Decide on max chunks (15 vs 100)
- [ ] Test barge-in feature works with conversation WS
- [ ] Verify `mcpAssistant.ts` doesn't need route registration
- [ ] Run TypeScript type check after merge
- [ ] Test local dev server startup
