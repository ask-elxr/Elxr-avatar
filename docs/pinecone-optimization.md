# Pinecone RAG Analysis & Optimization Plan

## Context

Elxrai uses Pinecone serverless for RAG-powered knowledge retrieval across 20+ topic areas. This analysis examines the current implementation against 2026 best practices to identify optimization opportunities in chunking, retrieval, cost, and architecture.

---

## Current State Summary

### Indexes
| Index | Purpose |
|-------|---------|
| `avatar-chat-knowledge` | Legacy/avatar-specific vectors |
| `ask-elxr` | Primary index (default) |

Both: **1536 dims**, cosine similarity, serverless AWS us-east-1.

### Namespaces (21 defined in `shared/pineconeCategories.ts`)
- **16 topic categories**: ADDICTION, MIND, BODY, SEXUALITY, TRANSITIONS, SPIRITUALITY, SCIENCE, PSYCHEDELICS, NUTRITION, LIFE, LONGEVITY, GRIEF, MIDLIFE, MOVEMENT, WORK, SLEEP
- **3 personal**: MARK_KOHL, WILLIE_GAULT, NIGEL_WILLIAMS
- **1 fallback**: OTHER
- **Dynamic namespaces**: `{env}:mentor:{slug}:{kb}:v{version}` format for versioned knowledge bases

### Chunking (current)
- **350 tokens** with 60-token overlap (~17%)
- Splits by: markdown headings -> paragraphs -> character fallback with sentence boundaries
- File: `server/ingest/chunker.ts`

### Retrieval (current)
- top_k varies: 3 (RAG), 5 (avatar/conversation), 8 (lesson scripts), 12 (admin queries)
- No reranking
- No hybrid search
- Parallel multi-namespace queries via `Promise.all()`
- Latency cache for repeat queries
- Circuit breaker on embeddings (15s) and Pinecone (10s)

### Embedding
- `text-embedding-3-small` (1536 dims) -- correct, consistent across ingestion and retrieval
- Batch: 15-100 per batch depending on pipeline

### Ingestion Pipelines
1. **Basic text** (`server/ingest/ingestionService.ts`) -- chunker + embed + upsert
2. **Course transcript** (`server/ingest/courseIngestionService.ts`) -- personal namespaces only, verbatim
3. **Learning artifacts** (`server/ingest/learningArtifactService.ts`) -- Claude Haiku extracts 30-120 structured artifacts per lesson
4. **Podcast** (`server/ingest/podcastIngestionService.ts`) -- conversational chunking

---

## Key Findings & Recommendations

### 1. Chunking -- Increase to 400-512 tokens
**Current**: 350 tokens / 60 overlap
**Recommended**: 400-512 tokens / 15% overlap (60-75 tokens)

- Research shows 400-512 tokens hits ~82-94% recall, the sweet spot before the "context cliff" at ~2500 tokens
- Overlap at 15% improves dense retriever recall by up to 14.5%
- Current overlap (17%) is already good
- Consider **hierarchical chunking** for structured documents (PDFs, courses) that preserves headers/sections
- **Contextual retrieval** (Anthropic approach): prepend a short AI-generated context summary to each chunk before embedding -- reduces "lost context" significantly

**Files to modify**: `server/ingest/chunker.ts` (CHUNK_TOKENS default)

### 2. Retrieval -- Add Reranking (Biggest Win)
**Current**: Single-stage retrieval, no reranking
**Recommended**: Two-stage retrieve-then-rerank

- Retrieve top_k=20 -> rerank to top_n=5
- Cascading retrieval (dense + rerank) yields **24-48% better performance** vs dense-only
- Pinecone offers native reranking: `pinecone-rerank-v0` ($2/1000 requests)
- Alternative: `cohere-rerank-3.5` (better for longer docs, 4096 token context)

**Files to modify**: `server/pineconeNamespaceService.ts`

### 3. Hybrid Search -- Consider for Specialized Terminology
**Current**: Dense-only search
**Recommended**: Evaluate hybrid (dense + sparse) for domains with specialized vocabulary (psychedelics, nutrition, addiction)

- Requires index with `metric="dotproduct"` (currently cosine) -- would need new index
- Alpha weighting: start at 0.5, tune per domain
- Medium priority -- reranking alone may be sufficient

### 4. Embedding Model -- Stay with text-embedding-3-small
- Still viable and cost-effective ($0.02/M tokens vs $0.13/M for large)
- Upgrading to `text-embedding-3-large` requires **full re-embedding** of all vectors
- Only upgrade if retrieval quality proves insufficient after other optimizations
- **Dimension reduction** to 512 dims would save ~66% storage, but storage costs are tiny (~$0.20/mo)

### 5. Cost Analysis -- Likely Overpaying on Pinecone Minimum
**Estimated actual usage**: ~$2-5/mo
**Pinecone Standard minimum**: $50/mo
**You're paying ~10-25x actual usage**

Options:
- **Stay on Pinecone Standard** ($50/mo) -- simplest, good tooling
- **Downgrade to Starter** (free) -- 100 namespace limit (you have 21 defined + dynamic ones), 2GB storage, 5 indexes
- **Migrate to pgvector on Neon** -- zero additional infra cost (already using Neon), ~75% savings reported, but less sophisticated vector search

### 6. Namespace Strategy -- Already Good
- Per-domain namespaces align with Pinecone best practices
- Namespaces are dramatically more efficient than metadata filtering for isolation
- 100K namespace limit on Standard gives massive headroom
- Current parallel query pattern (`Promise.all`) is correct

### 7. Metadata Optimization
- **Disable indexing** on metadata fields never used for filtering (e.g., `text`, `text_preview`, `created_at` if not filtered on)
- Pinecone indexes ALL metadata by default, consuming extra memory
- Store large text externally if possible (text field is stored both in metadata AND as embeddings)

### 8. Prompt Engineering for RAG
- Put most relevant chunks **first and last** in context (U-shaped attention curve)
- Include source attribution in retrieved context
- Ask model to reason step-by-step through evidence before answering
- File: `server/claudeService.ts`, `server/engine/` (personality engine)

---

## Priority Action Items

| Priority | Action | Impact | Effort | Files |
|----------|--------|--------|--------|-------|
| **P0** | Add reranking to retrieval | 24-48% better results | Medium | `server/pineconeNamespaceService.ts` |
| **P1** | Increase chunk size to 400-512 tokens | Better recall | Low | `server/ingest/chunker.ts` |
| **P1** | Evaluate Starter plan vs Standard | Save $50/mo | Low | N/A (config change) |
| **P2** | Disable metadata indexing on non-filtered fields | Reduce storage/cost | Low | `server/pinecone.ts` |
| **P2** | Add contextual retrieval (prepend context summaries) | Better chunk relevance | Medium | `server/ingest/chunker.ts`, `server/ingest/embedder.ts` |
| **P3** | Evaluate hybrid search for specialized domains | Better terminology matching | High | New index needed |
| **P3** | Consider pgvector migration | Eliminate Pinecone cost | High | Major refactor |

---

## Verification

- Run `npm run check` after any code changes
- Query Pinecone stats endpoint to verify namespace counts and vector counts
- Compare retrieval quality before/after reranking with sample queries
- Monitor latency via circuit breaker metrics
- Test chunk size changes by re-ingesting a small knowledge base and comparing retrieval results
