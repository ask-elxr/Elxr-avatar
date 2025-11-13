import client from 'prom-client';

const register = new client.Registry();

client.collectDefaultMetrics({ register });

const externalCallCounter = new client.Counter({
  name: 'external_api_calls_total',
  help: 'Total number of external API calls',
  labelNames: ['service', 'status'],
  registers: [register],
});

const externalCallDuration = new client.Histogram({
  name: 'external_api_call_duration_ms',
  help: 'Duration of external API calls in milliseconds',
  labelNames: ['service'],
  buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000],
  registers: [register],
});

const circuitBreakerState = new client.Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=half-open, 2=open)',
  labelNames: ['service'],
  registers: [register],
});

const circuitBreakerRejectionsCounter = new client.Counter({
  name: 'circuit_breaker_rejections_total',
  help: 'Total number of circuit breaker rejections',
  labelNames: ['service'],
  registers: [register],
});

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [register],
});

const pineconeQueryCacheHits = new client.Counter({
  name: 'pinecone_cache_hits_total',
  help: 'Total Pinecone query cache hits',
  registers: [register],
});

const pineconeQueryCacheMisses = new client.Counter({
  name: 'pinecone_cache_misses_total',
  help: 'Total Pinecone query cache misses',
  registers: [register],
});

const documentProcessingCounter = new client.Counter({
  name: 'documents_processed_total',
  help: 'Total documents processed',
  labelNames: ['status', 'type'],
  registers: [register],
});

const documentChunksCounter = new client.Counter({
  name: 'document_chunks_total',
  help: 'Total document chunks created',
  registers: [register],
});

export const metrics = {
  register,

  recordExternalCallSuccess(service: string) {
    externalCallCounter.inc({ service, status: 'success' });
  },

  recordExternalCallFailure(service: string, errorType: string) {
    externalCallCounter.inc({ service, status: 'failure' });
  },

  recordExternalCallTimeout(service: string) {
    externalCallCounter.inc({ service, status: 'timeout' });
  },

  recordExternalCallDuration(service: string, durationMs: number) {
    externalCallDuration.observe({ service }, durationMs);
  },

  recordCircuitBreakerStateChange(service: string, state: 'open' | 'half-open' | 'closed') {
    const stateValue = state === 'closed' ? 0 : state === 'half-open' ? 1 : 2;
    circuitBreakerState.set({ service }, stateValue);
  },

  recordCircuitBreakerRejection(service: string) {
    circuitBreakerRejectionsCounter.inc({ service });
  },

  recordHttpRequest(method: string, route: string, status: number, durationMs: number) {
    httpRequestsTotal.inc({ method, route, status: status.toString() });
    httpRequestDuration.observe({ method, route, status: status.toString() }, durationMs);
  },

  recordPineconeCacheHit() {
    pineconeQueryCacheHits.inc();
  },

  recordPineconeCacheMiss() {
    pineconeQueryCacheMisses.inc();
  },

  recordElevenLabsTTS(duration: number) {
    externalCallDuration.observe({ service: 'elevenlabs' }, duration);
    externalCallCounter.inc({ service: 'elevenlabs', status: 'success' });
  },

  recordDocumentProcessed(status: 'success' | 'failure', type: string) {
    documentProcessingCounter.inc({ status, type });
  },

  recordDocumentChunks(count: number) {
    documentChunksCounter.inc(count);
  },

  async getMetrics(): Promise<string> {
    return register.metrics();
  },
};
