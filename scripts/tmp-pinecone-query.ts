/**
 * Temporary script to query Pinecone for "Levitating pygmies" in both
 * "life" (lowercase) and "LIFE" (uppercase) namespaces to diagnose case mismatch.
 * Usage: npx tsx scripts/tmp-pinecone-query.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

// Load .env manually
const envPath = resolve(import.meta.dirname, '..', '.env');
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

const QUERY = 'Levitating pygmies';
const NAMESPACES = ['life', 'LIFE'];
const INDEX_NAME = 'ask-elxr';
const TOP_K = 5;

async function queryNamespace(
  index: ReturnType<Pinecone['index']>,
  namespace: string,
  embedding: number[]
) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`NAMESPACE: "${namespace}"`);
  console.log('='.repeat(60));

  const results = await index.namespace(namespace).query({
    vector: embedding,
    topK: TOP_K,
    includeMetadata: true,
  });

  if (!results.matches?.length) {
    console.log('  No results found.\n');
    return;
  }

  console.log(`  Found ${results.matches.length} results:\n`);
  for (const match of results.matches) {
    console.log(`  --- Score: ${match.score?.toFixed(4)} | ID: ${match.id}`);
    if (match.metadata) {
      const { text, content, title, source, documentName, ...rest } = match.metadata as Record<string, any>;
      if (title) console.log(`    Title: ${title}`);
      if (documentName) console.log(`    Document: ${documentName}`);
      if (source) console.log(`    Source: ${source}`);
      const textContent = text || content || '';
      if (textContent) {
        console.log(`    Text: ${String(textContent).slice(0, 200)}...`);
      }
    }
    console.log();
  }
}

async function main() {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

  console.log(`Generating embedding for: "${QUERY}"`);
  const embeddingRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: QUERY,
  });
  const embedding = embeddingRes.data[0].embedding;

  const index = pinecone.index(INDEX_NAME);

  for (const ns of NAMESPACES) {
    await queryNamespace(index, ns, embedding);
  }
}

main().catch(console.error);
