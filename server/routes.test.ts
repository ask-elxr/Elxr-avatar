import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { claudeService } from './claudeService';
import { pineconeNamespaceService } from './pineconeNamespaceService';

// Mock the services
vi.mock('./claudeService', () => ({
  claudeService: {
    generateResponse: vi.fn(),
    generateEnhancedResponse: vi.fn(),
  },
}));

vi.mock('./pineconeNamespaceService', () => ({
  pineconeNamespaceService: {
    queryNamespace: vi.fn(),
  },
}));

vi.mock('./logger');
vi.mock('./metrics');

describe('Avatar Response Endpoint', () => {
  let app: express.Application;

  beforeEach(() => {
    // Create a fresh Express app for testing
    app = express();
    app.use(express.json());

    // Define the avatar response endpoint (simplified version for testing)
    app.post('/api/avatar/response', async (req, res) => {
      try {
        const { message, sessionId } = req.body;

        if (!message) {
          return res.status(400).json({
            success: false,
            error: 'Message is required',
          });
        }

        // Query ask-elxr knowledge base
        const askElxrResults = await pineconeNamespaceService.queryNamespace('ask-elxr', message, 5);

        // Use results
        const allResults = askElxrResults;
        const knowledgeContext = allResults
          .filter((result) => result.score && result.score > 0.5)
          .map((result) => result.metadata?.text || '')
          .join('\n\n');

        // Generate response with Claude
        const response = await claudeService.generateResponse(message, knowledgeContext, sessionId);

        res.json({
          success: true,
          response: response.text,
          tokensUsed: response.usage?.input_tokens || 0,
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message || 'Failed to generate response',
        });
      }
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 when message is missing', async () => {
    const response = await request(app)
      .post('/api/avatar/response')
      .send({ sessionId: 'test-session' });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Message is required');
  });

  it('should query ask-elxr knowledge base', async () => {
    const mockAskElxrResults = [
      { metadata: { text: 'Ask ELXR result 1' }, score: 0.9 },
      { metadata: { text: 'Ask ELXR result 2' }, score: 0.8 },
    ];

    const mockQueryNamespace = vi.mocked(pineconeNamespaceService.queryNamespace);
    mockQueryNamespace.mockResolvedValue(mockAskElxrResults);

    const mockGenerateResponse = vi.mocked(claudeService.generateResponse);
    mockGenerateResponse.mockResolvedValue({
      text: 'Generated response',
      usage: { input_tokens: 100, output_tokens: 50 },
    } as any);

    const response = await request(app)
      .post('/api/avatar/response')
      .send({ message: 'Test question', sessionId: 'test-session' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.response).toBe('Generated response');
    expect(response.body.tokensUsed).toBe(100);

    // Verify ask-elxr was queried
    expect(pineconeNamespaceService.queryNamespace).toHaveBeenCalledWith(
      'ask-elxr',
      'Test question',
      5
    );
  });

  it('should filter results by score threshold (0.5)', async () => {
    const mockResults = [
      { metadata: { text: 'High score result' }, score: 0.8 },
      { metadata: { text: 'Low score result' }, score: 0.3 }, // Should be filtered
      { metadata: { text: 'Medium score result' }, score: 0.6 },
    ];

    const mockQueryNamespace = vi.mocked(pineconeNamespaceService.queryNamespace);
    mockQueryNamespace.mockResolvedValue(mockResults);

    const mockGenerateResponse = vi.mocked(claudeService.generateResponse);
    mockGenerateResponse.mockImplementation(async (message, context) => {
      // Verify the context only includes high-score results
      expect(context).toContain('High score result');
      expect(context).toContain('Medium score result');
      expect(context).not.toContain('Low score result');

      return {
        text: 'Generated response',
        usage: { input_tokens: 100, output_tokens: 50 },
      } as any;
    });

    await request(app)
      .post('/api/avatar/response')
      .send({ message: 'Test question', sessionId: 'test-session' });

    expect(claudeService.generateResponse).toHaveBeenCalled();
  });

  it('should handle Claude service errors gracefully', async () => {
    const mockQueryNamespace = vi.mocked(pineconeNamespaceService.queryNamespace);
    mockQueryNamespace.mockResolvedValue([]);
    
    const mockGenerateResponse = vi.mocked(claudeService.generateResponse);
    mockGenerateResponse.mockRejectedValue(new Error('Claude API timeout'));

    const response = await request(app)
      .post('/api/avatar/response')
      .send({ message: 'Test question', sessionId: 'test-session' });

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Claude API timeout');
  });

  it('should handle Pinecone service errors gracefully', async () => {
    const mockQueryNamespace = vi.mocked(pineconeNamespaceService.queryNamespace);
    mockQueryNamespace.mockRejectedValue(new Error('Pinecone connection failed'));

    const response = await request(app)
      .post('/api/avatar/response')
      .send({ message: 'Test question', sessionId: 'test-session' });

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('Pinecone');
  });

  it('should handle empty knowledge base results', async () => {
    const mockQueryNamespace = vi.mocked(pineconeNamespaceService.queryNamespace);
    mockQueryNamespace.mockResolvedValue([]);

    const mockGenerateResponse = vi.mocked(claudeService.generateResponse);
    mockGenerateResponse.mockResolvedValue({
      text: 'Response without context',
      usage: { input_tokens: 50, output_tokens: 30 },
    } as any);

    const response = await request(app)
      .post('/api/avatar/response')
      .send({ message: 'Test question', sessionId: 'test-session' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.response).toBe('Response without context');

    // Verify Claude was called with empty context
    expect(claudeService.generateResponse).toHaveBeenCalledWith(
      'Test question',
      '',
      'test-session'
    );
  });

  it('should process results from ask-elxr correctly', async () => {
    const mockAskElxrResults = [
      { metadata: { text: 'ELXR result 1' }, score: 0.9 },
      { metadata: { text: 'ELXR result 2' }, score: 0.85 },
    ];

    const mockQueryNamespace = vi.mocked(pineconeNamespaceService.queryNamespace);
    mockQueryNamespace.mockResolvedValue(mockAskElxrResults);

    const mockGenerateResponse = vi.mocked(claudeService.generateResponse);
    mockGenerateResponse.mockImplementation(async (message, context) => {
      // Verify ask-elxr results are in the context
      expect(context).toContain('ELXR result 1');
      expect(context).toContain('ELXR result 2');

      return {
        text: 'Response with context',
        usage: { input_tokens: 100, output_tokens: 50 },
      } as any;
    });

    await request(app)
      .post('/api/avatar/response')
      .send({ message: 'Test question', sessionId: 'test-session' });

    expect(claudeService.generateResponse).toHaveBeenCalled();
  });
});
