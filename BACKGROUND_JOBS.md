# Background Job Processing Setup

This application supports **background job processing** for document uploads using BullMQ and Redis. This offloads time-consuming document processing (chunking, embedding, Pinecone storage) to background workers, allowing API endpoints to return immediately.

## Architecture

### With Redis (Recommended for Production)
```
Client → GET /api/documents/upload-url → Server (returns presigned URL)
Client → PUT to presigned URL → Google Cloud Storage (direct upload)
Client → POST /api/documents/process → Server (enqueues job, returns jobId)
Client → GET /api/jobs/:jobId → Server (polls status)
Background Worker → Processes document → Updates job status
```

**Benefits:**
- API responds in <100ms (returns job ID immediately)
- Document processing happens in background (30+ seconds)
- Job persistence survives server restarts
- Automatic retry with exponential backoff (3 attempts)
- Progress tracking and error reporting

### Without Redis (Fallback Mode)
```
Client → GET /api/documents/upload-url → Server (returns presigned URL)
Client → PUT to presigned URL → Google Cloud Storage (direct upload)
Client → POST /api/documents/process → Server (processes synchronously, returns result)
```

**Limitations:**
- API blocks for 30+ seconds during processing
- No job persistence or retry logic
- No progress tracking

---

## Redis Setup (Required for Background Jobs)

### Option 1: Upstash Redis (Recommended - Free Tier Available)

1. Go to [Upstash Console](https://console.upstash.com/)
2. Create account or log in
3. Click "Create Database"
4. Select:
   - **Type:** Regional
   - **Region:** Choose closest to your deployment
   - **Name:** `avatar-chat-jobs` (or any name)
5. Copy the **Redis URL** from the connection details
6. Add to Replit Secrets:
   ```
   Key: REDIS_URL
   Value: redis://default:your-password@region.upstash.io:6379
   ```

**Free Tier Limits:**
- 10,000 commands per day
- 256 MB max database size
- Sufficient for development and small production workloads

### Option 2: Redis Labs (Cloud Redis)

1. Go to [Redis Cloud](https://redis.io/try-free/)
2. Create free account
3. Create new database
4. Copy connection string
5. Add to Replit Secrets as `REDIS_URL`

### Option 3: Self-Hosted Redis (Advanced)

1. Deploy Redis on your infrastructure
2. Ensure it's accessible from Replit
3. Set `REDIS_URL` to your Redis connection string

---

## API Endpoints

### 1. Get Presigned Upload URL

**Endpoint:** `GET /api/documents/upload-url`

**Query Parameters:**
- `filename` - Original filename (e.g., "document.pdf")
- `fileType` - MIME type (e.g., "application/pdf")

**Response:**
```json
{
  "success": true,
  "uploadURL": "https://storage.googleapis.com/...",
  "documentId": "doc_1699123456789_xyz",
  "objectPath": "gs://bucket/path/to/object",
  "metadata": {
    "filename": "document.pdf",
    "fileType": "application/pdf"
  }
}
```

**Client Usage:**
```javascript
// 1. Get upload URL
const response = await fetch('/api/documents/upload-url?filename=test.pdf&fileType=application/pdf');
const { uploadURL, documentId, objectPath } = await response.json();

// 2. Upload file directly to storage
const file = document.getElementById('file-input').files[0];
await fetch(uploadURL, {
  method: 'PUT',
  body: file,
  headers: { 'Content-Type': 'application/pdf' }
});

// 3. Trigger processing
const processResponse = await fetch('/api/documents/process', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    documentId,
    filename: 'test.pdf',
    fileType: 'application/pdf',
    objectPath,
    indexName: 'ask-elxr',  // optional
    namespace: 'mark-kohl'   // optional
  })
});
```

### 2. Process Uploaded Document

**Endpoint:** `POST /api/documents/process`

**Request Body:**
```json
{
  "documentId": "doc_1699123456789_xyz",
  "filename": "document.pdf",
  "fileType": "application/pdf",
  "objectPath": "gs://bucket/path/to/object",
  "indexName": "ask-elxr",    // optional
  "namespace": "mark-kohl"     // optional
}
```

**Response (With Redis):**
```json
{
  "success": true,
  "jobId": "job_1699123456789_abc",
  "documentId": "doc_1699123456789_xyz",
  "processing": "async",
  "message": "Document processing started in background. Poll /api/jobs/:jobId for status."
}
```

**Response (Without Redis):**
```json
{
  "success": true,
  "documentId": "doc_1699123456789_xyz",
  "processing": "sync",
  "result": {
    "documentId": "doc_1699123456789_xyz",
    "chunksProcessed": 15,
    "totalChunks": 15
  },
  "message": "Document processed synchronously (Redis not configured)"
}
```

### 3. Poll Job Status

**Endpoint:** `GET /api/jobs/:jobId`

**Response (Processing):**
```json
{
  "success": true,
  "job": {
    "id": "job_1699123456789_abc",
    "status": "active",
    "progress": 0.45,
    "error": null,
    "result": null,
    "createdAt": "2025-11-10T12:00:00.000Z",
    "finishedAt": null
  }
}
```

**Response (Completed):**
```json
{
  "success": true,
  "job": {
    "id": "job_1699123456789_abc",
    "status": "completed",
    "progress": 1.0,
    "error": null,
    "result": {
      "success": true,
      "documentId": "doc_1699123456789_xyz",
      "chunksProcessed": 15,
      "totalChunks": 15
    },
    "createdAt": "2025-11-10T12:00:00.000Z",
    "finishedAt": "2025-11-10T12:00:32.000Z"
  }
}
```

**Response (Without Redis):**
```json
{
  "error": "Job queue not available - Redis not configured",
  "message": "Set REDIS_URL environment variable to enable background job processing"
}
```
**Status:** 503

---

## React Query Integration

Use TanStack React Query for polling:

```typescript
import { useQuery } from '@tanstack/react-query';

function useDocumentProcessing(jobId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: ['/api/jobs', jobId],
    enabled: enabled && !!jobId,
    refetchInterval: (data) => {
      // Stop polling if completed or failed
      if (data?.job?.status === 'completed' || data?.job?.status === 'failed') {
        return false;
      }
      return 2000; // Poll every 2 seconds
    },
  });
}

// Usage
function DocumentUpload() {
  const [jobId, setJobId] = useState<string | null>(null);
  const { data, isLoading } = useDocumentProcessing(jobId);

  async function handleUpload(file: File) {
    // 1. Get presigned URL
    const urlRes = await fetch(`/api/documents/upload-url?filename=${file.name}&fileType=${file.type}`);
    const { uploadURL, documentId, objectPath } = await urlRes.json();

    // 2. Upload to storage
    await fetch(uploadURL, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type }
    });

    // 3. Start processing
    const processRes = await fetch('/api/documents/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId,
        filename: file.name,
        fileType: file.type,
        objectPath
      })
    });

    const processData = await processRes.json();
    
    if (processData.processing === 'async') {
      setJobId(processData.jobId); // Start polling
    } else {
      // Synchronous processing - result available immediately
      console.log('Processing complete:', processData.result);
    }
  }

  return (
    <div>
      {data?.job?.status === 'active' && (
        <p>Processing: {Math.round(data.job.progress * 100)}%</p>
      )}
      {data?.job?.status === 'completed' && (
        <p>✓ Document processed successfully!</p>
      )}
    </div>
  );
}
```

---

## Job Queue Configuration

The BullMQ queue is configured with the following defaults:

- **Attempts:** 3 retries on failure
- **Backoff:** Exponential backoff (2s, 4s, 8s)
- **Concurrency:** 2 workers processing jobs simultaneously
- **Job Retention:**
  - Completed jobs: 24 hours (last 100 kept)
  - Failed jobs: 7 days
- **Timeout:** 45 seconds per job

These settings can be adjusted in `server/documentQueue.ts`.

---

## Monitoring

### Check Queue Health

Monitor Redis connection and job queue status in server logs:

```
✅ Connected to Redis for job queue
```

If Redis is not configured:
```
⚠️  REDIS_URL not set - background job queue disabled. Document processing will use synchronous processing.
   To enable background jobs: Set REDIS_URL environment variable (e.g., Upstash Redis)
```

### Job Status

- `pending` - Job queued, waiting for worker
- `active` - Job currently being processed
- `completed` - Job finished successfully
- `failed` - Job failed after all retry attempts

---

## Troubleshooting

### "Job queue not available - Redis not configured"

**Solution:** Set the `REDIS_URL` environment variable with your Redis connection string.

### Jobs not processing

1. Check Redis connection in server logs
2. Verify `REDIS_URL` is correct
3. Ensure Redis server is running and accessible
4. Check worker logs for errors

### Slow processing

- Check Pinecone API rate limits
- Verify OpenAI embedding API is responding
- Consider increasing worker concurrency (edit `server/documentQueue.ts`)

### Out of memory errors

- Reduce document chunk size limit (currently 25 chunks max)
- Reduce max text size (currently 500KB)
- Increase server memory allocation

---

## Cost Optimization

### Redis Costs
- **Upstash Free Tier:** 10,000 commands/day (sufficient for ~500 document uploads)
- **Upstash Pay-as-you-go:** $0.20 per 100K commands
- **Redis Labs:** Free tier available with 30MB storage

### Recommendations
- Use Upstash free tier for development
- Monitor command usage in Upstash dashboard
- Enable `removeOnComplete` to prevent unbounded growth
- Set shorter retention periods if needed

---

## Migration Path

### From Synchronous to Background Jobs

1. Set `REDIS_URL` in environment variables
2. Restart application
3. Confirm "✅ Connected to Redis for job queue" in logs
4. Update frontend to use polling (see React Query example above)
5. Test with sample document upload

### Rollback to Synchronous

1. Remove `REDIS_URL` environment variable
2. Restart application
3. Application automatically falls back to sync processing
4. No code changes needed

---

## Future Enhancements

- **URL Processing:** Background jobs for processing URLs (currently not implemented)
- **Bulk Uploads:** Queue multiple documents in a single request
- **Priority Queues:** Prioritize certain documents over others
- **Progress Webhooks:** Send webhook notifications when jobs complete
- **Bull Board UI:** Visual dashboard for monitoring jobs (optional)
