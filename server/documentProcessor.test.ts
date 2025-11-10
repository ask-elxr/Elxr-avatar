import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DocumentProcessor } from './documentProcessor';
import * as pineconeService from './pineconeService';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

// Mock dependencies
vi.mock('./pineconeService');
vi.mock('openai');
vi.mock('./logger');
vi.mock('./metrics');
vi.mock('fs');

describe('Document Processor', () => {
  let processor: DocumentProcessor;
  let mockOpenAI: any;

  beforeEach(() => {
    // Create mock OpenAI instance
    mockOpenAI = {
      embeddings: {
        create: vi.fn(),
      },
      audio: {
        transcriptions: {
          create: vi.fn(),
        },
      },
    };

    processor = new DocumentProcessor(mockOpenAI as any);

    // Mock fs.readFileSync
    vi.mocked(fs.readFileSync).mockReturnValue('Mock file content');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Text Chunking', () => {
    it('should split text into chunks of appropriate size', () => {
      const longText = 'word '.repeat(500); // 500 words
      const chunks = processor.chunkText(longText);

      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach((chunk) => {
        expect(chunk.split(' ').length).toBeLessThanOrEqual(300);
      });
    });

    it('should handle short text without chunking', () => {
      const shortText = 'This is a short text.';
      const chunks = processor.chunkText(shortText);

      expect(chunks).toEqual([shortText]);
    });

    it('should preserve paragraph boundaries when chunking', () => {
      const text = 'Paragraph 1.\n\nParagraph 2.\n\nParagraph 3.';
      const chunks = processor.chunkText(text);

      // Each chunk should contain complete paragraphs
      chunks.forEach((chunk) => {
        expect(chunk.trim().length).toBeGreaterThan(0);
      });
    });
  });

  describe('Text Extraction', () => {
    it('should extract text from plain text files', async () => {
      const mockContent = 'This is plain text content';
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const result = await processor.extractTextFromFile(
        '/path/to/file.txt',
        'text/plain'
      );

      expect(result).toBe(mockContent);
    });

    it('should handle PDF extraction failures gracefully', async () => {
      const result = await processor.extractTextFromFile(
        '/path/to/file.pdf',
        'application/pdf'
      );

      // Should return error message, not throw
      expect(result).toContain('PDF Document');
      expect(result).toContain('extraction failed');
    });

    it('should reject unsupported file types', async () => {
      await expect(
        processor.extractTextFromFile('/path/to/file.xyz', 'application/xyz')
      ).rejects.toThrow('Unsupported file type');
    });
  });

  describe('Document Processing', () => {
    it('should process document and create embeddings', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      mockOpenAI.embeddings.create.mockResolvedValue({
        data: [{ embedding: mockEmbedding }],
      });

      vi.mocked(pineconeService.storeConversation).mockResolvedValue(undefined);

      const shortText = 'This is a test document.';
      vi.mocked(fs.readFileSync).mockReturnValue(shortText);

      const result = await processor.processDocument(
        '/path/to/file.txt',
        'text/plain',
        'doc-123',
        { title: 'Test Doc' }
      );

      expect(result.documentId).toBe('doc-123');
      expect(result.chunksProcessed).toBeGreaterThan(0);
      expect(mockOpenAI.embeddings.create).toHaveBeenCalled();
      expect(pineconeService.storeConversation).toHaveBeenCalled();
    });

    it('should truncate very large documents', async () => {
      const largeText = 'word '.repeat(200000); // > 500KB
      vi.mocked(fs.readFileSync).mockReturnValue(largeText);

      mockOpenAI.embeddings.create.mockResolvedValue({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
      });

      vi.mocked(pineconeService.storeConversation).mockResolvedValue(undefined);

      const result = await processor.processDocument(
        '/path/to/large.txt',
        'text/plain',
        'doc-large',
        {}
      );

      // Should complete despite large size (truncated)
      expect(result.documentId).toBe('doc-large');
      expect(result.chunksProcessed).toBeLessThanOrEqual(25); // Max chunks limit
    });

    it('should limit chunks to prevent memory overflow', async () => {
      const manyParagraphs = Array(100).fill('Paragraph content.\n\n').join('');
      vi.mocked(fs.readFileSync).mockReturnValue(manyParagraphs);

      mockOpenAI.embeddings.create.mockResolvedValue({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
      });

      vi.mocked(pineconeService.storeConversation).mockResolvedValue(undefined);

      const result = await processor.processDocument(
        '/path/to/many.txt',
        'text/plain',
        'doc-many',
        {}
      );

      // Should limit to max 25 chunks
      expect(result.totalChunks).toBeLessThanOrEqual(25);
    });

    it('should include metadata in stored chunks', async () => {
      mockOpenAI.embeddings.create.mockResolvedValue({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
      });

      const storeConversationMock = vi.mocked(pineconeService.storeConversation);
      storeConversationMock.mockResolvedValue(undefined);

      const shortText = 'Test content';
      vi.mocked(fs.readFileSync).mockReturnValue(shortText);

      await processor.processDocument(
        '/path/to/file.txt',
        'text/plain',
        'doc-123',
        { title: 'Test Title', author: 'Test Author' }
      );

      // Verify metadata was passed to Pinecone
      expect(storeConversationMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          documentId: 'doc-123',
          type: 'document_chunk',
          title: 'Test Title',
          author: 'Test Author',
        })
      );
    });

    it('should handle embedding generation errors', async () => {
      mockOpenAI.embeddings.create.mockRejectedValue(
        new Error('OpenAI API error')
      );

      const shortText = 'Test content';
      vi.mocked(fs.readFileSync).mockReturnValue(shortText);

      await expect(
        processor.processDocument('/path/to/file.txt', 'text/plain', 'doc-123', {})
      ).rejects.toThrow();
    });

    it('should continue processing remaining chunks if one fails', async () => {
      const text = 'Chunk 1.\n\nChunk 2.\n\nChunk 3.';
      vi.mocked(fs.readFileSync).mockReturnValue(text);

      // First call succeeds, second fails, third succeeds
      mockOpenAI.embeddings.create
        .mockResolvedValueOnce({ data: [{ embedding: [0.1] }] })
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({ data: [{ embedding: [0.2] }] });

      vi.mocked(pineconeService.storeConversation).mockResolvedValue(undefined);

      const result = await processor.processDocument(
        '/path/to/file.txt',
        'text/plain',
        'doc-123',
        {}
      );

      // Should process successfully despite one chunk failing
      expect(result.chunksProcessed).toBeGreaterThan(0);
      expect(result.chunksProcessed).toBeLessThan(result.totalChunks);
    });
  });

  describe('Audio Transcription', () => {
    it('should transcribe audio files using Whisper', async () => {
      const mockTranscription = 'This is the transcribed text';
      mockOpenAI.audio.transcriptions.create.mockResolvedValue({
        text: mockTranscription,
      });

      // Mock fs.createReadStream
      const mockStream = { path: '/path/to/audio.mp3' } as any;
      vi.spyOn(fs, 'createReadStream').mockReturnValue(mockStream);

      const result = await processor.transcribeAudio('/path/to/audio.mp3');

      expect(result).toBe(mockTranscription);
      expect(mockOpenAI.audio.transcriptions.create).toHaveBeenCalledWith({
        file: mockStream,
        model: 'whisper-1',
      });
    });

    it('should handle transcription errors', async () => {
      mockOpenAI.audio.transcriptions.create.mockRejectedValue(
        new Error('Whisper API error')
      );

      const mockStream = { path: '/path/to/audio.mp3' } as any;
      vi.spyOn(fs, 'createReadStream').mockReturnValue(mockStream);

      await expect(processor.transcribeAudio('/path/to/audio.mp3')).rejects.toThrow(
        'Whisper API error'
      );
    });
  });

  describe('Embedding Generation', () => {
    it('should generate embeddings for text', async () => {
      const mockEmbedding = Array(1536).fill(0.1);
      mockOpenAI.embeddings.create.mockResolvedValue({
        data: [{ embedding: mockEmbedding }],
      });

      const result = await processor.generateEmbedding('Test text');

      expect(result).toEqual(mockEmbedding);
      expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'Test text',
      });
    });

    it('should handle embedding API errors', async () => {
      mockOpenAI.embeddings.create.mockRejectedValue(
        new Error('Embedding failed')
      );

      await expect(processor.generateEmbedding('Test text')).rejects.toThrow(
        'Embedding failed'
      );
    });
  });
});
