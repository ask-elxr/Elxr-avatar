import OpenAI from 'openai';
import { pineconeService, PineconeIndexName } from './pinecone.js';
import { pineconeAssistant } from './mcpAssistant.js';
import { latencyCache } from './cache.js';
import * as fs from 'fs';
import * as path from 'path';
// PDF parsing will be loaded dynamically to avoid import issues
import * as mammoth from 'mammoth';

class DocumentProcessor {
  private openai: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    
    this.openai = new OpenAI({
      apiKey: apiKey,
    });
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
        } catch (error) {
          console.warn('PDF parsing failed:', error);
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
    } catch (error) {
      console.error('Error extracting text from file:', error);
      throw error;
    }
  }

  // Transcribe audio using OpenAI Whisper
  async transcribeAudio(audioFilePath: string): Promise<string> {
    try {
      const audioFile = fs.createReadStream(audioFilePath);
      const response = await this.openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        response_format: 'text',
        language: 'en', // Can be made configurable
      });
      
      return response.toString();
    } catch (error) {
      console.error('Error transcribing audio:', error);
      throw error;
    }
  }

  // Generate embeddings for text using OpenAI with caching
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Check cache first for faster response
      const cached = latencyCache.getEmbedding(text);
      if (cached) {
        return cached;
      }

      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text,
      });

      const embedding = response.data[0].embedding;
      
      // Cache the result for future use
      latencyCache.setEmbedding(text, embedding);
      
      return embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }

  // Process document: extract text, chunk, embed, and store
  async processDocument(filePath: string, fileType: string, documentId: string, metadata: any = {}): Promise<{
    documentId: string;
    chunksProcessed: number;
    totalChunks: number;
  }> {
    try {
      console.log(`Processing document: ${documentId}`);
      
      // Extract text from document
      const text = await this.extractTextFromFile(filePath, fileType);
      console.log(`Extracted ${text.length} characters from document`);

      // Limit text size to prevent memory issues (max 500KB of text)
      const maxTextSize = 512 * 1024; // 500KB
      const limitedText = text.length > maxTextSize ? text.substring(0, maxTextSize) : text;
      if (text.length > maxTextSize) {
        console.warn(`Document ${documentId} truncated from ${text.length} to ${maxTextSize} characters`);
      }

      // Split into chunks
      const chunks = this.chunkText(limitedText);
      console.log(`Created ${chunks.length} chunks`);

      const maxChunks = 100;
      const limitedChunks = chunks.slice(0, maxChunks);
      if (chunks.length > maxChunks) {
        console.warn(`Document ${documentId} limited to ${maxChunks} chunks (was ${chunks.length})`);
      }

      let processedChunks = 0;

      // Process chunks in parallel for speed (but limit to prevent overload)
      const batchSize = 3;
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
            
            await pineconeService.storeConversation(chunkId, chunk, embedding, cleanMetadata, 'mark-kohl', PineconeIndexName.ASK_ELXR);

            processedChunks++;
            console.log(`Processed chunk ${i + 1}/${limitedChunks.length} for ${documentId}`);
          } catch (error) {
            console.error(`Error processing chunk ${i} for ${documentId}:`, error);
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

      console.log(`Document processing complete: ${documentId}`);
      return {
        documentId,
        chunksProcessed: processedChunks,
        totalChunks: limitedChunks.length
      };
    } catch (error) {
      console.error('Error processing document:', error);
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

      // Try to use Pinecone Assistant first (your MCP assistant)
      if (pineconeAssistant.isAvailable()) {
        try {
          console.log(`Trying Pinecone Assistant for query: "${query}"`);
          const assistantResults = await pineconeAssistant.retrieveContext(query, topK);
          
          if (assistantResults && assistantResults.length > 0) {
            console.log(`Pinecone Assistant found ${assistantResults.length} results`);
            // Cache the results
            latencyCache.setSearchResults(query, assistantResults);
            return assistantResults;
          }
        } catch (error) {
          console.log('Pinecone Assistant failed, falling back to vector search:', error);
        }
      }

      // Fallback to direct vector search if assistant is not available
      // Generate embedding for the query (will use cache if available)
      const queryEmbedding = await this.generateEmbedding(query);
      
      const searchNamespaces = ['mark-kohl', 'default'];
      
      const results = await pineconeService.searchSimilarConversations(queryEmbedding, topK * 2, searchNamespaces, PineconeIndexName.ASK_ELXR);
      
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
      
      const filteredResults = searchResults.filter(result => result.score > 0.5);
      
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