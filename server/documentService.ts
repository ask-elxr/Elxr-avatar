import fs from 'fs';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { logger } from './logger.js';

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PINECONE_INDEX = process.env.PINECONE_INDEX || 'ask-elxr';

const DOCUMENTS_NAMESPACE = 'documents';
const VIDEO_TRANSCRIPTS_NAMESPACE = 'video-transcripts';

let pineconeClient: Pinecone | null = null;
let openaiClient: OpenAI | null = null;

if (PINECONE_API_KEY) {
  pineconeClient = new Pinecone({ apiKey: PINECONE_API_KEY });
  logger.info('Document service: Pinecone client initialized');
}

if (OPENAI_API_KEY) {
  openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  logger.info('Document service: OpenAI client initialized');
}

export interface DocumentChunk {
  id: string;
  text: string;
  embedding?: number[];
  metadata: {
    documentId: string;
    documentName: string;
    userId: string;
    chunkIndex: number;
    totalChunks: number;
    uploadDate: string;
    type: 'pdf' | 'video' | 'docx' | 'txt';
  };
}

export interface DocumentMetadata {
  id: string;
  name: string;
  type: 'pdf' | 'video' | 'docx' | 'txt';
  userId: string;
  uploadDate: string;
  totalChunks: number;
  textLength: number;
  filePath?: string;
}

export function isAvailable(): boolean {
  return pineconeClient !== null && openaiClient !== null;
}

export async function extractPDFText(filePath: string): Promise<string> {
  try {
    logger.info(
      { service: 'document', operation: 'extractPDFText', filePath },
      'Extracting text from PDF'
    );

    const dataBuffer = fs.readFileSync(filePath);
    
    const pdfParse = (await import('pdf-parse')).default;
    const pdfData = await pdfParse(dataBuffer);

    logger.info(
      {
        service: 'document',
        operation: 'extractPDFText',
        filePath,
        textLength: pdfData.text.length,
        pages: pdfData.numpages,
      },
      'PDF text extracted successfully'
    );

    return pdfData.text;
  } catch (error: any) {
    logger.error(
      { service: 'document', operation: 'extractPDFText', error: error.message },
      'Failed to extract PDF text'
    );
    throw new Error(`Failed to extract PDF text: ${error.message}`);
  }
}

export async function extractDOCXText(filePath: string): Promise<string> {
  try {
    logger.info(
      { service: 'document', operation: 'extractDOCXText', filePath },
      'Extracting text from DOCX'
    );

    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });

    logger.info(
      {
        service: 'document',
        operation: 'extractDOCXText',
        filePath,
        textLength: result.value.length,
      },
      'DOCX text extracted successfully'
    );

    return result.value;
  } catch (error: any) {
    logger.error(
      { service: 'document', operation: 'extractDOCXText', error: error.message },
      'Failed to extract DOCX text'
    );
    throw new Error(`Failed to extract DOCX text: ${error.message}`);
  }
}

export async function extractTXTText(filePath: string): Promise<string> {
  try {
    logger.info(
      { service: 'document', operation: 'extractTXTText', filePath },
      'Reading text from TXT file'
    );

    const text = fs.readFileSync(filePath, 'utf-8');

    logger.info(
      {
        service: 'document',
        operation: 'extractTXTText',
        filePath,
        textLength: text.length,
      },
      'TXT text read successfully'
    );

    return text;
  } catch (error: any) {
    logger.error(
      { service: 'document', operation: 'extractTXTText', error: error.message },
      'Failed to read TXT file'
    );
    throw new Error(`Failed to read TXT file: ${error.message}`);
  }
}

export function chunkText(text: string, chunkSize = 1000, overlap = 200): string[] {
  const chunks: string[] = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    const endIndex = Math.min(startIndex + chunkSize, text.length);
    const chunk = text.slice(startIndex, endIndex).trim();

    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    startIndex += chunkSize - overlap;
  }

  logger.info(
    {
      service: 'document',
      operation: 'chunkText',
      textLength: text.length,
      chunkSize,
      overlap,
      totalChunks: chunks.length,
    },
    'Text chunked successfully'
  );

  return chunks;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  if (!openaiClient) {
    throw new Error('OpenAI client not initialized');
  }

  try {
    const response = await openaiClient.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });

    return response.data[0].embedding;
  } catch (error: any) {
    logger.error(
      { service: 'document', operation: 'generateEmbedding', error: error.message },
      'Failed to generate embedding'
    );
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
}

export async function generateEmbeddings(chunks: string[]): Promise<number[][]> {
  if (!openaiClient) {
    throw new Error('OpenAI client not initialized');
  }

  try {
    logger.info(
      { service: 'document', operation: 'generateEmbeddings', chunkCount: chunks.length },
      'Generating embeddings for chunks'
    );

    const embeddings: number[][] = [];

    for (let i = 0; i < chunks.length; i++) {
      const embedding = await generateEmbedding(chunks[i]);
      embeddings.push(embedding);

      if ((i + 1) % 10 === 0) {
        logger.debug(
          { service: 'document', operation: 'generateEmbeddings', progress: `${i + 1}/${chunks.length}` },
          'Embedding generation progress'
        );
      }
    }

    logger.info(
      { service: 'document', operation: 'generateEmbeddings', totalEmbeddings: embeddings.length },
      'All embeddings generated successfully'
    );

    return embeddings;
  } catch (error: any) {
    logger.error(
      { service: 'document', operation: 'generateEmbeddings', error: error.message },
      'Failed to generate embeddings'
    );
    throw new Error(`Failed to generate embeddings: ${error.message}`);
  }
}

export async function storeInPinecone(
  documentId: string,
  documentName: string,
  userId: string,
  chunks: string[],
  embeddings: number[][],
  documentType: 'pdf' | 'video' | 'docx' | 'txt',
  namespace: string = DOCUMENTS_NAMESPACE
): Promise<void> {
  if (!pineconeClient) {
    throw new Error('Pinecone client not initialized');
  }

  try {
    logger.info(
      {
        service: 'document',
        operation: 'storeInPinecone',
        documentId,
        namespace,
        chunkCount: chunks.length,
      },
      'Storing document chunks in Pinecone'
    );

    const index = pineconeClient.index(PINECONE_INDEX);
    const vectors = chunks.map((chunk, i) => ({
      id: `${documentId}_chunk_${i}`,
      values: embeddings[i],
      metadata: {
        documentId,
        documentName,
        userId,
        chunkIndex: i,
        totalChunks: chunks.length,
        text: chunk,
        uploadDate: new Date().toISOString(),
        type: documentType,
      },
    }));

    const batchSize = 100;
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, Math.min(i + batchSize, vectors.length));
      await index.namespace(namespace).upsert(batch);

      logger.debug(
        {
          service: 'document',
          operation: 'storeInPinecone',
          progress: `${Math.min(i + batchSize, vectors.length)}/${vectors.length}`,
        },
        'Batch upsert progress'
      );
    }

    logger.info(
      {
        service: 'document',
        operation: 'storeInPinecone',
        documentId,
        namespace,
        totalVectors: vectors.length,
      },
      'Document chunks stored successfully in Pinecone'
    );
  } catch (error: any) {
    logger.error(
      {
        service: 'document',
        operation: 'storeInPinecone',
        documentId,
        error: error.message,
      },
      'Failed to store document chunks in Pinecone'
    );
    throw new Error(`Failed to store in Pinecone: ${error.message}`);
  }
}

export async function processPDFDocument(
  filePath: string,
  fileName: string,
  namespace: string,
  documentId: string,
  userId?: string
): Promise<DocumentMetadata> {
  try {
    logger.info(
      { service: 'document', operation: 'processPDFDocument', fileName, namespace, userId },
      'Processing PDF document'
    );

    const text = await extractPDFText(filePath);
    const chunks = chunkText(text);
    const embeddings = await generateEmbeddings(chunks);
    
    // Store in the specified category namespace with real user tracking
    const uploaderUserId = userId || 'system';
    await storeInPinecone(documentId, fileName, uploaderUserId, chunks, embeddings, 'pdf', namespace);

    const metadata: DocumentMetadata = {
      id: documentId,
      name: fileName,
      type: 'pdf',
      userId: uploaderUserId,
      uploadDate: new Date().toISOString(),
      totalChunks: chunks.length,
      textLength: text.length,
      filePath,
    };

    logger.info(
      {
        service: 'document',
        operation: 'processPDFDocument',
        documentId,
        totalChunks: chunks.length,
      },
      'PDF document processed successfully'
    );

    return metadata;
  } catch (error: any) {
    logger.error(
      { service: 'document', operation: 'processPDFDocument', error: error.message },
      'Failed to process PDF document'
    );
    throw error;
  }
}

export async function processDOCXDocument(
  filePath: string,
  fileName: string,
  namespace: string,
  documentId: string,
  userId?: string
): Promise<DocumentMetadata> {
  try {
    logger.info(
      { service: 'document', operation: 'processDOCXDocument', fileName, namespace, userId },
      'Processing DOCX document'
    );

    const text = await extractDOCXText(filePath);
    const chunks = chunkText(text);
    const embeddings = await generateEmbeddings(chunks);
    
    const uploaderUserId = userId || 'system';
    await storeInPinecone(documentId, fileName, uploaderUserId, chunks, embeddings, 'docx', namespace);

    const metadata: DocumentMetadata = {
      id: documentId,
      name: fileName,
      type: 'docx',
      userId: uploaderUserId,
      uploadDate: new Date().toISOString(),
      totalChunks: chunks.length,
      textLength: text.length,
      filePath,
    };

    logger.info(
      {
        service: 'document',
        operation: 'processDOCXDocument',
        documentId,
        totalChunks: chunks.length,
      },
      'DOCX document processed successfully'
    );

    return metadata;
  } catch (error: any) {
    logger.error(
      { service: 'document', operation: 'processDOCXDocument', error: error.message },
      'Failed to process DOCX document'
    );
    throw error;
  }
}

export async function processTXTDocument(
  filePath: string,
  fileName: string,
  namespace: string,
  documentId: string,
  userId?: string
): Promise<DocumentMetadata> {
  try {
    logger.info(
      { service: 'document', operation: 'processTXTDocument', fileName, namespace, userId },
      'Processing TXT document'
    );

    const text = await extractTXTText(filePath);
    const chunks = chunkText(text);
    const embeddings = await generateEmbeddings(chunks);
    
    const uploaderUserId = userId || 'system';
    await storeInPinecone(documentId, fileName, uploaderUserId, chunks, embeddings, 'txt', namespace);

    const metadata: DocumentMetadata = {
      id: documentId,
      name: fileName,
      type: 'txt',
      userId: uploaderUserId,
      uploadDate: new Date().toISOString(),
      totalChunks: chunks.length,
      textLength: text.length,
      filePath,
    };

    logger.info(
      {
        service: 'document',
        operation: 'processTXTDocument',
        documentId,
        totalChunks: chunks.length,
      },
      'TXT document processed successfully'
    );

    return metadata;
  } catch (error: any) {
    logger.error(
      { service: 'document', operation: 'processTXTDocument', error: error.message },
      'Failed to process TXT document'
    );
    throw error;
  }
}

export async function transcribeVideo(filePath: string): Promise<string> {
  if (!openaiClient) {
    throw new Error('OpenAI client not initialized');
  }

  try {
    logger.info(
      { service: 'document', operation: 'transcribeVideo', filePath },
      'Transcribing video using Whisper API'
    );

    const fileStream = fs.createReadStream(filePath);

    const transcription = await openaiClient.audio.transcriptions.create({
      file: fileStream,
      model: 'whisper-1',
      response_format: 'text',
    });

    logger.info(
      {
        service: 'document',
        operation: 'transcribeVideo',
        filePath,
        transcriptLength: transcription.length,
      },
      'Video transcribed successfully'
    );

    return transcription;
  } catch (error: any) {
    logger.error(
      { service: 'document', operation: 'transcribeVideo', error: error.message },
      'Failed to transcribe video'
    );
    throw new Error(`Failed to transcribe video: ${error.message}`);
  }
}

export function processVideoTranscript(transcript: string): string {
  return transcript
    .replace(/\s+/g, ' ')
    .replace(/\[.*?\]/g, '')
    .trim();
}

export async function processVideoDocument(
  filePath: string,
  fileName: string,
  namespace: string,
  documentId: string,
  userId?: string
): Promise<DocumentMetadata> {
  try {
    logger.info(
      { service: 'document', operation: 'processVideoDocument', fileName, namespace, userId },
      'Processing video document'
    );

    const rawTranscript = await transcribeVideo(filePath);
    const cleanedTranscript = processVideoTranscript(rawTranscript);
    const chunks = chunkText(cleanedTranscript);
    const embeddings = await generateEmbeddings(chunks);
    
    // Store in the specified category namespace with real user tracking
    const uploaderUserId = userId || 'system';
    await storeInPinecone(
      documentId,
      fileName,
      uploaderUserId,
      chunks,
      embeddings,
      'video',
      namespace
    );

    const metadata: DocumentMetadata = {
      id: documentId,
      name: fileName,
      type: 'video',
      userId: uploaderUserId,
      uploadDate: new Date().toISOString(),
      totalChunks: chunks.length,
      textLength: cleanedTranscript.length,
      filePath,
    };

    logger.info(
      {
        service: 'document',
        operation: 'processVideoDocument',
        documentId,
        totalChunks: chunks.length,
      },
      'Video document processed successfully'
    );

    return metadata;
  } catch (error: any) {
    logger.error(
      { service: 'document', operation: 'processVideoDocument', error: error.message },
      'Failed to process video document'
    );
    throw error;
  }
}

export async function searchDocuments(
  query: string,
  userId: string,
  maxResults = 5,
  documentType?: 'pdf' | 'video'
): Promise<Array<{ text: string; documentName: string; score: number }>> {
  if (!pineconeClient || !openaiClient) {
    throw new Error('Pinecone or OpenAI client not initialized');
  }

  try {
    logger.info(
      { service: 'document', operation: 'searchDocuments', query, userId, maxResults },
      'Searching user documents'
    );

    const queryEmbedding = await generateEmbedding(query);
    
    // Use user-scoped namespaces for privacy
    const namespaces = documentType === 'video' 
      ? [`video-transcripts-${userId}`] 
      : documentType === 'pdf' 
      ? [`documents-${userId}`] 
      : [`documents-${userId}`, `video-transcripts-${userId}`];

    const results: Array<{ text: string; documentName: string; score: number }> = [];

    for (const namespace of namespaces) {
      const index = pineconeClient.index(PINECONE_INDEX);
      const queryResponse = await index.namespace(namespace).query({
        vector: queryEmbedding,
        topK: maxResults,
        includeMetadata: true,
        filter: { userId },
      });

      for (const match of queryResponse.matches) {
        if (match.metadata && match.score && match.score > 0.7) {
          results.push({
            text: match.metadata.text as string,
            documentName: match.metadata.documentName as string,
            score: match.score,
          });
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, maxResults);

    logger.info(
      {
        service: 'document',
        operation: 'searchDocuments',
        resultsFound: topResults.length,
      },
      'Document search completed'
    );

    return topResults;
  } catch (error: any) {
    logger.error(
      { service: 'document', operation: 'searchDocuments', error: error.message },
      'Failed to search documents'
    );
    throw error;
  }
}

export async function deleteDocumentFromPinecone(
  documentId: string,
  totalChunks: number,
  namespace: string
): Promise<void> {
  if (!pineconeClient) {
    throw new Error('Pinecone client not initialized');
  }

  try {
    logger.info(
      { service: 'document', operation: 'deleteDocumentFromPinecone', documentId, namespace },
      'Deleting document from Pinecone'
    );

    const index = pineconeClient.index(PINECONE_INDEX);
    const vectorIds = Array.from({ length: totalChunks }, (_, i) => `${documentId}_chunk_${i}`);

    await index.namespace(namespace).deleteMany(vectorIds);

    logger.info(
      {
        service: 'document',
        operation: 'deleteDocumentFromPinecone',
        documentId,
        deletedVectors: vectorIds.length,
      },
      'Document deleted from Pinecone successfully'
    );
  } catch (error: any) {
    logger.error(
      {
        service: 'document',
        operation: 'deleteDocumentFromPinecone',
        documentId,
        error: error.message,
      },
      'Failed to delete document from Pinecone'
    );
    throw error;
  }
}

export { DOCUMENTS_NAMESPACE, VIDEO_TRANSCRIPTS_NAMESPACE };
