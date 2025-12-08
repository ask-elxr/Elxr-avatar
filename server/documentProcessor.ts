import OpenAI from 'openai';
import { pineconeService } from './pinecone.js';
import { latencyCache } from './cache.js';
import { wrapServiceCall } from './circuitBreaker.js';
import { logger } from './logger.js';
import { metrics } from './metrics.js';
import * as fs from 'fs';
import * as path from 'path';
// PDF parsing will be loaded dynamically to avoid import issues
import * as mammoth from 'mammoth';

class DocumentProcessor {
  private openai?: OpenAI;
  private apiKey: string;
  private embeddingBreaker: any;
  private transcriptionBreaker: any;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    if (!this.apiKey) {
      console.warn('⚠️  OPENAI_API_KEY not set - Document processing will not be available');
      return;
    }
    
    this.openai = new OpenAI({
      apiKey: this.apiKey,
    });

    this.embeddingBreaker = wrapServiceCall(
      async (params: any) => {
        if (!this.openai) throw new Error('OpenAI client not initialized');
        return await this.openai.embeddings.create(params);
      },
      'openai-embeddings',
      { timeout: 15000, errorThresholdPercentage: 50 }
    );

    this.transcriptionBreaker = wrapServiceCall(
      async (params: any) => {
        if (!this.openai) throw new Error('OpenAI client not initialized');
        return await this.openai.audio.transcriptions.create(params);
      },
      'openai-transcription',
      { timeout: 60000, errorThresholdPercentage: 50 }
    );
  }

  isAvailable(): boolean {
    return !!this.apiKey && !!this.openai;
  }

  // Split text into chunks for processing - optimized for small files
  private chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
    // For very small texts, don't chunk at all
    if (text.length <= 800) {
      return [text.trim()];
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      const chunk = text.slice(start, end);
      chunks.push(chunk.trim());
      start = end - overlap;
    }

    return chunks.filter(chunk => chunk.length > 50); // Filter out very small chunks
  }

  // Extract text from different file types
  async extractTextFromFile(filePath: string, fileType: string): Promise<string> {
    try {
      if (fileType === 'text/plain') {
        return fs.readFileSync(filePath, 'utf-8');
      } else if (fileType === 'application/pdf') {
        // PDF extraction using pdf-parse (loaded dynamically)
        try {
          const pdfParse = await import('pdf-parse').then(m => m.default);
          const pdfBuffer = fs.readFileSync(filePath);
          const pdfData = await pdfParse(pdfBuffer);
          return pdfData.text || `[PDF Document: ${path.basename(filePath)}]\n\nText could not be extracted from this PDF file.`;
        } catch (error: any) {
          logger.warn({ error: error.message, file: filePath }, 'PDF parsing failed');
          return `[PDF Document: ${path.basename(filePath)}]\n\nText extraction failed - PDF may be image-based or corrupted.`;
        }
      } else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        // DOCX extraction using mammoth
        const docxBuffer = fs.readFileSync(filePath);
        const result = await mammoth.extractRawText({ buffer: docxBuffer });
        return result.value;
      } else if (fileType.startsWith('audio/')) {
        // Audio transcription using OpenAI Whisper
        return await this.transcribeAudio(filePath);
      } else {
        throw new Error(`Unsupported file type: ${fileType}`);
      }
    } catch (error: any) {
      logger.error({ error: error.message, filePath, fileType }, 'Error extracting text from file');
      throw error;
    }
  }

  // Transcribe audio using OpenAI Whisper
  async transcribeAudio(audioFilePath: string): Promise<string> {
    const log = logger.child({ 
      service: 'openai', 
      operation: 'transcribeAudio',
      file: path.basename(audioFilePath)
    });

    try {
      log.debug('Transcribing audio with Whisper');
      const audioFile = fs.createReadStream(audioFilePath);
      const response = await this.transcriptionBreaker.execute({
        file: audioFile,
        model: 'whisper-1',
        response_format: 'text',
        language: 'en',
      });
      
      log.info({ length: response.toString().length }, 'Audio transcription completed');
      return response.toString();
    } catch (error: any) {
      log.error({ error: error.message }, 'Error transcribing audio');
      throw error;
    }
  }

  // Generate embeddings for text using OpenAI with caching
  async generateEmbedding(text: string): Promise<number[]> {
    const log = logger.child({ 
      service: 'openai', 
      operation: 'generateEmbedding',
      textLength: text.length 
    });

    try {
      // Check cache first for faster response
      const cached = latencyCache.getEmbedding(text);
      if (cached) {
        log.debug('Embedding cache hit');
        return cached;
      }

      log.debug('Generating embedding via OpenAI');
      const response = await this.embeddingBreaker.execute({
        model: 'text-embedding-3-small',
        input: text,
      });

      const embedding = response.data[0].embedding;
      
      // Cache the result for future use
      latencyCache.setEmbedding(text, embedding);
      log.debug({ dimensions: embedding.length }, 'Embedding generated and cached');
      
      return embedding;
    } catch (error: any) {
      log.error({ error: error.message }, 'Error generating embedding');
      throw error;
    }
  }

  // Process document: extract text, chunk, embed, and store
  async processDocument(filePath: string, fileType: string, documentId: string, metadata: any = {}): Promise<{
    documentId: string;
    chunksProcessed: number;
    totalChunks: number;
  }> {
    const log = logger.child({ 
      service: 'documentProcessor', 
      operation: 'processDocument',
      documentId,
      fileType
    });

    try {
      log.info({ filePath }, 'Processing document');
      
      // Check file size before processing (max 5MB for documents)
      const stats = fs.statSync(filePath);
      const maxFileSize = 5 * 1024 * 1024; // 5MB
      if (stats.size > maxFileSize) {
        log.warn({ fileSize: stats.size, maxSize: maxFileSize }, 
          'File too large, skipping to prevent memory issues');
        return {
          documentId,
          chunksProcessed: 0,
          totalChunks: 0,
          skipped: true,
          reason: 'File too large (max 5MB)'
        };
      }
      
      // Extract text from document
      const text = await this.extractTextFromFile(filePath, fileType);
      log.debug({ textLength: text.length }, 'Extracted text from document');

      // Limit text size to prevent memory issues (max 200KB of text - reduced for stability)
      const maxTextSize = 200 * 1024; // 200KB
      const limitedText = text.length > maxTextSize ? text.substring(0, maxTextSize) : text;
      if (text.length > maxTextSize) {
        log.warn({ originalLength: text.length, truncatedLength: maxTextSize }, 
          'Document truncated to prevent memory overflow');
      }

      // Split into chunks
      const chunks = this.chunkText(limitedText);
      log.debug({ chunkCount: chunks.length }, 'Created text chunks');

      // Limit number of chunks to prevent memory overflow (max 15 chunks - reduced for stability)
      const maxChunks = 15;
      const limitedChunks = chunks.slice(0, maxChunks);
      if (chunks.length > maxChunks) {
        log.warn({ originalChunks: chunks.length, limitedChunks: maxChunks }, 
          'Chunk count limited to prevent memory overflow');
      }

      let processedChunks = 0;

      // Process chunks sequentially to minimize memory usage
      const batchSize = 1;
      for (let batchStart = 0; batchStart < limitedChunks.length; batchStart += batchSize) {
        const batch = limitedChunks.slice(batchStart, Math.min(batchStart + batchSize, limitedChunks.length));
        
        // Process batch in parallel but with limited concurrency
        await Promise.allSettled(batch.map(async (chunk, batchIndex) => {
          const i = batchStart + batchIndex;
          const chunkId = `${documentId}_chunk_${i}`;
          
          try {
            // Generate embedding for chunk
            const embedding = await this.generateEmbedding(chunk);
            
            // Clean metadata to avoid null values that Pinecone rejects
            const cleanMetadata = {
              documentId,
              chunkIndex: i,
              type: 'document_chunk',
              fileType,
              text: chunk,
              timestamp: new Date().toISOString(),
              ...metadata
            };
            
            // Remove any null values from metadata
            Object.keys(cleanMetadata).forEach(key => {
              if (cleanMetadata[key] === null || cleanMetadata[key] === undefined) {
                delete cleanMetadata[key];
              }
            });
            
            // Store in Pinecone
            await pineconeService.storeConversation(chunkId, chunk, embedding, cleanMetadata);

            processedChunks++;
            log.debug({ chunkIndex: i + 1, totalChunks: limitedChunks.length }, 
              'Processed chunk successfully');
          } catch (error: any) {
            log.error({ chunkIndex: i, error: error.message }, 'Error processing chunk');
          }
        }));
        
        // Force garbage collection between batches if available
        if (global.gc) {
          global.gc();
        }
        // Skip delay for small documents, minimal delay for larger ones
        if (batchStart + batchSize < limitedChunks.length) {
          const delay = limitedChunks.length <= 5 ? 50 : 200;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      log.info({ chunksProcessed: processedChunks, totalChunks: limitedChunks.length }, 
        'Document processing complete');
      
      // Invalidate Pinecone cache after successful document processing
      latencyCache.invalidatePineconeCache();
      
      metrics.recordDocumentProcessed('success', fileType);
      metrics.recordDocumentChunks(processedChunks);

      return {
        documentId,
        chunksProcessed: processedChunks,
        totalChunks: limitedChunks.length
      };
    } catch (error: any) {
      log.error({ error: error.message, stack: error.stack }, 'Error processing document');
      metrics.recordDocumentProcessed('failure', fileType);
      throw error;
    }
  }

  // Search for relevant document chunks based on query with caching
  async searchDocuments(query: string, topK: number = 3): Promise<any[]> {
    try {
      // Check search cache first
      const cachedResults = latencyCache.getSearchResults(query);
      if (cachedResults) {
        return cachedResults.filter(result => 
          (result.metadata?.type === 'document_chunk' || result.metadata?.type === 'text_input') &&
          (result.score || 0) > 0.1  // Lower threshold for more results
        ).map(result => ({
          text: result.metadata?.text,
          score: result.score,
          documentId: result.metadata?.documentId,
          chunkIndex: result.metadata?.chunkIndex,
          metadata: result.metadata
        }));
      }

      // Direct vector search using namespace service (more cost-effective than Pinecone Assistants)
      // Generate embedding for the query (will use cache if available)
      const queryEmbedding = await this.generateEmbedding(query);
      
      // Search across all category namespaces for now - in future could be more targeted
      const categoryNamespaces = [
        'default', 'mind', 'body', 'sexuality', 'transitions', 'spirituality', 'science', 
        'psychedelics', 'nutrition', 'life', 'longevity', 'grief', 'midlife', 
        'movement', 'work', 'sleep', 'addiction', 'menopause', 'creativity---expression',
        'relationships---connection', 'purpose---meaning', 'resilience---stress',
        'identity---self-discovery', 'habits---behavior-change', 'technology---digital-wellness',
        'nature---environment', 'aging-with-joy', 'other'
      ];
      
      // Search Pinecone for similar chunks across all category namespaces
      const results = await pineconeService.searchSimilarConversations(queryEmbedding, topK * 2, categoryNamespaces);
      
      // Cache the raw results
      latencyCache.setSearchResults(query, results);
      
      // Filter for document chunks only - debug scoring
      console.log(`Vector search found ${results.length} total results for query: "${query}"`);
      results.forEach((result, i) => {
        console.log(`Result ${i}: score=${result.score}, type=${result.metadata?.type}`);
      });
      
      return results.filter(result => 
        (result.metadata?.type === 'document_chunk' || result.metadata?.type === 'text_input') &&
        (result.score || 0) > 0.1  // Lower threshold for more results
      ).map(result => ({
        text: result.metadata?.text,
        score: result.score,
        documentId: result.metadata?.documentId,
        chunkIndex: result.metadata?.chunkIndex,
        metadata: result.metadata
      }));
    } catch (error) {
      console.error('Error searching documents:', error);
      throw error;
    }
  }

  // Get conversation context by combining query results with caching
  async getConversationContext(query: string, maxTokens: number = 1500): Promise<string> {
    try {
      // Check cache first for instant response
      const cached = latencyCache.getContext(query);
      if (cached) {
        return cached;
      }

      // Optimized search with fewer results for speed
      const searchResults = await this.searchDocuments(query, 3); // Reduced from 10 to 3
      
      let context = '';
      let tokenCount = 0;
      
      // Only use high-quality matches
      const filteredResults = searchResults.filter(result => result.score > 0.75);
      
      for (const result of filteredResults) {
        const chunkText = result.text;
        const estimatedTokens = Math.ceil(chunkText.length / 4); // Rough token estimation
        
        if (tokenCount + estimatedTokens <= maxTokens) {
          context += `${chunkText}\n\n`;
          tokenCount += estimatedTokens;
        } else {
          break;
        }
      }
      
      const finalContext = context.trim();
      
      // Cache the result
      latencyCache.setContext(query, finalContext);
      
      return finalContext;
    } catch (error) {
      console.error('Error getting conversation context:', error);
      return '';
    }
  }
}

export const documentProcessor = new DocumentProcessor();