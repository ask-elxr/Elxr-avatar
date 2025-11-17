# Testing Guide

This project includes automated tests to catch regressions early in the avatar response endpoint and document processing functionality.

## Running Tests

```bash
# Run all tests
npx vitest run

# Run tests in watch mode (re-runs on file changes)
npx vitest

# Run tests with UI
npx vitest --ui
```

## Test Files

### Avatar Response Tests

**Location:** `server/avatar.test.ts` and `server/routes.test.ts`

**Coverage:**
- Ask-elxr knowledge base querying (single assistant for cost optimization)
- Score threshold filtering (>0.5)
- Request validation (message required)
- Response format validation
- Error handling (Claude failures, Pinecone failures)
- Empty result handling
- Knowledge context processing

**Key Regression Protections:**
- ✅ Verifies ask-elxr assistant is queried
- ✅ Ensures 5 results retrieved from knowledge base
- ✅ Confirms 0.5 score threshold for filtering
- ✅ Validates proper error responses
- ✅ Tests empty knowledge base handling

### Document Processing Tests

**Location:** `server/document.test.ts` and `server/documentProcessor.test.ts`

**Coverage:**
- Text size limits (512KB max)
- Chunk limits (25 max)
- Chunking logic (800 char threshold, 1000 char chunks, 200 char overlap)
- Supported file types (txt, pdf, docx, audio)
- OpenAI model configuration (text-embedding-3-small, whisper-1)
- Circuit breaker configuration (15s embeddings, 60s transcription, 50% threshold)
- Metadata handling (document_chunk type, null removal)
- Batch processing (3 chunks per batch, delays)

**Key Regression Protections:**
- ✅ Prevents increasing text size beyond 512KB
- ✅ Prevents processing more than 25 chunks
- ✅ Ensures proper chunking thresholds
- ✅ Validates circuit breaker timeouts
- ✅ Confirms supported file types

## Test Strategy

The tests use a **configuration-focused** approach that validates:

1. **Critical Constants** - Ensures limits and thresholds don't accidentally change
2. **Logic Flows** - Validates filtering, combining, and processing logic
3. **Error Handling** - Confirms graceful degradation on failures
4. **API Contracts** - Validates request/response formats

This approach catches the most common regression types:
- Accidentally changing configuration values
- Breaking filtering/combining logic
- Removing error handling
- Changing API contracts

## Test Results

Current status: **57 tests passing** ✅

```
Test Files  4 passed (4)
     Tests  57 passed (57)
  Duration  1.82s
```

## Adding New Tests

When adding new functionality:

1. **Configuration Tests** - Test any new constants, limits, or thresholds
2. **Logic Tests** - Test core filtering, transformation, or combination logic
3. **Error Tests** - Test error handling and edge cases
4. **Integration Tests** - Test critical request/response flows

Example:
```typescript
describe('New Feature', () => {
  it('should have correct configuration', () => {
    const limit = 10;
    expect(limit).toBe(10);
  });

  it('should filter correctly', () => {
    const items = [1, 2, 3, 4, 5];
    const filtered = items.filter(x => x > 2);
    expect(filtered).toEqual([3, 4, 5]);
  });
});
```

## Continuous Integration

Tests should be run:
- ✅ Before committing code
- ✅ In CI/CD pipeline
- ✅ Before deploying to production

## Known Limitations

⚠️ **Current tests provide baseline regression protection but have significant gaps:**

- **Configuration-only coverage**: Tests validate constants and expected behaviors, but don't exercise real implementation
- **No real endpoint testing**: Avatar endpoint tests use a mock Express app, not the production router
- **No real DocumentProcessor testing**: Document tests assert constants, don't instantiate or test actual class methods
- **Mocked services**: All external dependencies (Claude, Pinecone, OpenAI) are mocked
- **Limited integration**: No tests verify the real code paths with stubbed dependencies

**What These Tests Catch:**
✅ Configuration changes (limits, thresholds, timeouts)
✅ Basic logic patterns (filtering, combining)
✅ API contract expectations

**What These Tests Miss:**
❌ Implementation bugs in route handlers
❌ Document chunking algorithm changes
❌ Metadata handling regressions
❌ Circuit breaker integration issues
❌ Service orchestration problems

## Future Improvements (Recommended)

### High Priority
1. **Import real route handlers** - Test against production router with stubbed dependencies
2. **Instantiate DocumentProcessor** - Test real methods with mocked OpenAI/Pinecone clients
3. **Integration tests** - Verify parallel namespace querying, score filtering with real code paths

### Medium Priority
4. **End-to-end tests** - Complete avatar conversation flows
5. **Performance tests** - Document processing under load
6. **Coverage reporting** - Track code coverage with `vitest --coverage`

### Example Better Test
```typescript
// Instead of testing constants...
it('should filter by score > 0.5', () => {
  const threshold = 0.5;
  expect(threshold).toBe(0.5);
});

// Test the real implementation...
it('should filter results by score threshold', async () => {
  // Import real service, stub dependencies
  const mockResults = [
    { score: 0.9, text: 'High' },
    { score: 0.3, text: 'Low' }
  ];
  // ... test against actual filtering logic
});
```

## Recommendation

These tests provide a **baseline safety net** for configuration changes. For production-grade regression protection, implement the high-priority improvements above to test real implementation code.
