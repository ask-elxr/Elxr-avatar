import OpenAI from 'openai';
import { logger } from '../logger.js';

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  getDimension(): number;
  getModelName(): string;
}

const BATCH_SIZE = 100;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class OpenAIEmbedder implements EmbeddingProvider {
  private client: OpenAI;
  private model: string;
  private dimension: number;

  constructor(apiKey?: string, model: string = 'text-embedding-3-small') {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OPENAI_API_KEY is required for embeddings');
    }
    
    this.client = new OpenAI({ apiKey: key });
    this.model = model;
    this.dimension = model === 'text-embedding-3-large' ? 3072 : 1536;
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const allEmbeddings: number[][] = [];
    
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      
      let lastError: Error | null = null;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const response = await this.client.embeddings.create({
            model: this.model,
            input: batch
          });
          
          const batchEmbeddings = response.data
            .sort((a, b) => a.index - b.index)
            .map(d => d.embedding);
          
          allEmbeddings.push(...batchEmbeddings);
          
          logger.debug({
            service: 'embedder',
            batchIndex: Math.floor(i / BATCH_SIZE),
            batchSize: batch.length,
            totalProcessed: allEmbeddings.length
          }, 'Embedded batch successfully');
          
          break;
        } catch (error) {
          lastError = error as Error;
          logger.warn({
            service: 'embedder',
            attempt: attempt + 1,
            error: lastError.message
          }, 'Embedding batch failed, retrying...');
          
          if (attempt < MAX_RETRIES - 1) {
            await sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
          }
        }
      }
      
      if (allEmbeddings.length < i + batch.length && lastError) {
        throw new Error(`Failed to embed batch after ${MAX_RETRIES} attempts: ${lastError.message}`);
      }
    }
    
    return allEmbeddings;
  }

  getDimension(): number {
    return this.dimension;
  }

  getModelName(): string {
    return this.model;
  }
}

let defaultEmbedder: EmbeddingProvider | null = null;

export function getEmbedder(): EmbeddingProvider {
  if (!defaultEmbedder) {
    defaultEmbedder = new OpenAIEmbedder();
  }
  return defaultEmbedder;
}

export function setEmbedder(embedder: EmbeddingProvider): void {
  defaultEmbedder = embedder;
}
