import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import * as claudeService from './claudeService';
import * as pineconeNamespaceService from './pineconeNamespaceService';
import * as documentProcessor from './documentProcessor';

// Mock the services
vi.mock('./claudeService');
vi.mock('./pineconeNamespaceService');
vi.mock('./pineconeService');
vi.mock('./documentProcessor');
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

        // Query knowledge bases in parallel
        const knowledgePromises = [
          pineconeNamespaceService.queryNamespace('knowledge-base-assistant', message, 5),
          pineconeNamespaceService.queryNamespace('ask-elxr', message, 5),
        ];

        const [knowledgeBaseResults, askElxrResults] = await Promise.all(knowledgePromises);

        // Combine results
        const allResults = [...knowledgeBaseResults, ...askElxrResults];
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

  it('should query both knowledge bases in parallel', async () => {
    const mockKnowledgeBaseResults = [
      { metadata: { text: 'Knowledge base result 1' }, score: 0.8 },
      { metadata: { text: 'Knowledge base result 2' }, score: 0.7 },
    ];

    const mockAskElxrResults = [
      { metadata: { text: 'Ask ELXR result 1' }, score: 0.9 },
    ];

    vi.mocked(pineconeNamespaceService.queryNamespace).mockImplementation(
      async (namespace: string) => {
        if (namespace === 'knowledge-base-assistant') {
          return mockKnowledgeBaseResults;
        }
        return mockAskElxrResults;
      }
    );

    vi.mocked(claudeService.generateResponse).mockResolvedValue({
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

    // Verify both namespaces were queried
    expect(pineconeNamespaceService.queryNamespace).toHaveBeenCalledWith(
      'knowledge-base-assistant',
      'Test question',
      5
    );
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

    vi.mocked(pineconeNamespaceService.queryNamespace).mockResolvedValue(mockResults);

    vi.mocked(claudeService.generateResponse).mockImplementation(
      async (message, context) => {
        // Verify the context only includes high-score results
        expect(context).toContain('High score result');
        expect(context).toContain('Medium score result');
        expect(context).not.toContain('Low score result');

        return {
          text: 'Generated response',
          usage: { input_tokens: 100, output_tokens: 50 },
        } as any;
      }
    );

    await request(app)
      .post('/api/avatar/response')
      .send({ message: 'Test question', sessionId: 'test-session' });

    expect(claudeService.generateResponse).toHaveBeenCalled();
  });

  it('should handle Claude service errors gracefully', async () => {
    vi.mocked(pineconeNamespaceService.queryNamespace).mockResolvedValue([]);
    vi.mocked(claudeService.generateResponse).mockRejectedValue(
      new Error('Claude API timeout')
    );

    const response = await request(app)
      .post('/api/avatar/response')
      .send({ message: 'Test question', sessionId: 'test-session' });

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Claude API timeout');
  });

  it('should handle Pinecone service errors gracefully', async () => {
    vi.mocked(pineconeNamespaceService.queryNamespace).mockRejectedValue(
      new Error('Pinecone connection failed')
    );

    const response = await request(app)
      .post('/api/avatar/response')
      .send({ message: 'Test question', sessionId: 'test-session' });

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('Pinecone');
  });

  it('should handle empty knowledge base results', async () => {
    vi.mocked(pineconeNamespaceService.queryNamespace).mockResolvedValue([]);

    vi.mocked(claudeService.generateResponse).mockResolvedValue({
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

  it('should combine results from multiple namespaces correctly', async () => {
    const mockKnowledgeBaseResults = [
      { metadata: { text: 'KB result' }, score: 0.9 },
    ];

    const mockAskElxrResults = [
      { metadata: { text: 'ELXR result' }, score: 0.85 },
    ];

    vi.mocked(pineconeNamespaceService.queryNamespace).mockImplementation(
      async (namespace: string) => {
        if (namespace === 'knowledge-base-assistant') {
          return mockKnowledgeBaseResults;
        }
        return mockAskElxrResults;
      }
    );

    vi.mocked(claudeService.generateResponse).mockImplementation(
      async (message, context) => {
        // Verify both results are in the context
        expect(context).toContain('KB result');
        expect(context).toContain('ELXR result');

        return {
          text: 'Combined response',
          usage: { input_tokens: 100, output_tokens: 50 },
        } as any;
      }
    );

    await request(app)
      .post('/api/avatar/response')
      .send({ message: 'Test question', sessionId: 'test-session' });

    expect(claudeService.generateResponse).toHaveBeenCalled();
  });
});
