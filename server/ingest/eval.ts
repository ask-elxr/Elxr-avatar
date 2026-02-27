import { pineconeService, PineconeIndexName } from '../pinecone.js';
import { getEmbedder } from './embedder.js';
import fs from 'fs';
import path from 'path';

interface EvalQuery {
  query: string;
  kb: string;
  expectedTopics?: string[];
  expectedArtifactTypes?: string[];
}

interface EvalResult {
  query: string;
  kb: string;
  topK: number;
  results: Array<{
    score: number;
    id: string;
    title?: string;
    artifact_type?: string;
    topic?: string;
    confidence?: string;
    text_preview: string;
  }>;
  expectedTopics?: string[];
  expectedArtifactTypes?: string[];
  topicHitRate?: number;
  artifactTypeHitRate?: number;
}

const DEFAULT_EVAL_QUERIES: EvalQuery[] = [
  {
    query: "How do I prepare for a psychedelic experience?",
    kb: "psychedelics",
    expectedTopics: ["set and setting", "preparation", "safety"],
    expectedArtifactTypes: ["checklist", "heuristic", "principle"]
  },
  {
    query: "What are the warning signs of a bad trip?",
    kb: "psychedelics", 
    expectedTopics: ["bad trip", "difficult experience", "warning"],
    expectedArtifactTypes: ["failure_mode", "heuristic", "warning"]
  },
  {
    query: "How can I improve intimacy in my relationship?",
    kb: "sexuality",
    expectedTopics: ["intimacy", "connection", "relationship"],
    expectedArtifactTypes: ["principle", "heuristic", "mental_model"]
  },
  {
    query: "What should I do in the first weeks after losing someone?",
    kb: "grief",
    expectedTopics: ["grief", "loss", "coping"],
    expectedArtifactTypes: ["checklist", "heuristic", "principle"]
  }
];

async function runEvaluation(
  queries: EvalQuery[] = DEFAULT_EVAL_QUERIES,
  topK: number = 8
): Promise<EvalResult[]> {
  const embedder = getEmbedder();
  const results: EvalResult[] = [];
  
  console.log(`\n🔍 Running evaluation with ${queries.length} queries, topK=${topK}\n`);
  console.log('='.repeat(80));
  
  for (const evalQuery of queries) {
    try {
      console.log(`\n📝 Query: "${evalQuery.query}"`);
      console.log(`   KB: ${evalQuery.kb.toUpperCase()}`);
      
      const [queryEmbedding] = await embedder.embedBatch([evalQuery.query]);
      
      const index = await pineconeService.initializeIndex(PineconeIndexName.ASK_ELXR);
      const ns = index.namespace(evalQuery.kb.toUpperCase());
      
      const queryResult = await ns.query({
        vector: queryEmbedding,
        topK,
        includeMetadata: true
      });
      
      const matches = queryResult.matches || [];
      
      const formattedResults = matches.map(match => ({
        score: match.score || 0,
        id: match.id,
        title: (match.metadata?.title as string) || undefined,
        artifact_type: (match.metadata?.artifact_type as string) || undefined,
        topic: (match.metadata?.topic as string) || undefined,
        confidence: (match.metadata?.confidence as string) || undefined,
        text_preview: ((match.metadata?.text as string) || '').slice(0, 150) + '...'
      }));
      
      let topicHitRate = 0;
      let artifactTypeHitRate = 0;
      
      if (evalQuery.expectedTopics && evalQuery.expectedTopics.length > 0) {
        const matchedTopics = formattedResults.filter(r => 
          evalQuery.expectedTopics!.some(et => 
            r.topic?.toLowerCase().includes(et.toLowerCase()) ||
            r.text_preview.toLowerCase().includes(et.toLowerCase())
          )
        );
        topicHitRate = matchedTopics.length / formattedResults.length;
      }
      
      if (evalQuery.expectedArtifactTypes && evalQuery.expectedArtifactTypes.length > 0) {
        const matchedTypes = formattedResults.filter(r =>
          evalQuery.expectedArtifactTypes!.includes(r.artifact_type || '')
        );
        artifactTypeHitRate = matchedTypes.length / formattedResults.length;
      }
      
      const evalResult: EvalResult = {
        query: evalQuery.query,
        kb: evalQuery.kb,
        topK,
        results: formattedResults,
        expectedTopics: evalQuery.expectedTopics,
        expectedArtifactTypes: evalQuery.expectedArtifactTypes,
        topicHitRate,
        artifactTypeHitRate
      };
      
      results.push(evalResult);
      
      console.log(`\n   Results (${matches.length} matches):`);
      formattedResults.slice(0, 5).forEach((r, i) => {
        console.log(`\n   ${i + 1}. [${r.score.toFixed(3)}] ${r.title || 'Untitled'}`);
        console.log(`      Type: ${r.artifact_type || 'unknown'} | Topic: ${r.topic || 'unknown'} | Confidence: ${r.confidence || 'unknown'}`);
        console.log(`      "${r.text_preview}"`);
      });
      
      if (topicHitRate > 0 || artifactTypeHitRate > 0) {
        console.log(`\n   📊 Metrics:`);
        if (topicHitRate > 0) console.log(`      Topic Hit Rate: ${(topicHitRate * 100).toFixed(1)}%`);
        if (artifactTypeHitRate > 0) console.log(`      Artifact Type Hit Rate: ${(artifactTypeHitRate * 100).toFixed(1)}%`);
      }
      
    } catch (error) {
      console.error(`   ❌ Error: ${(error as Error).message}`);
      results.push({
        query: evalQuery.query,
        kb: evalQuery.kb,
        topK,
        results: []
      });
    }
    
    console.log('\n' + '-'.repeat(80));
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📈 SUMMARY');
  console.log('='.repeat(80));
  
  const avgTopicHitRate = results.reduce((sum, r) => sum + (r.topicHitRate || 0), 0) / results.length;
  const avgArtifactHitRate = results.reduce((sum, r) => sum + (r.artifactTypeHitRate || 0), 0) / results.length;
  const avgResultCount = results.reduce((sum, r) => sum + r.results.length, 0) / results.length;
  
  console.log(`Total Queries: ${results.length}`);
  console.log(`Average Results per Query: ${avgResultCount.toFixed(1)}`);
  console.log(`Average Topic Hit Rate: ${(avgTopicHitRate * 100).toFixed(1)}%`);
  console.log(`Average Artifact Type Hit Rate: ${(avgArtifactHitRate * 100).toFixed(1)}%`);
  
  return results;
}

async function loadQueriesFromFile(filePath: string): Promise<EvalQuery[]> {
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as EvalQuery[];
}

async function main() {
  const args = process.argv.slice(2);
  let queries = DEFAULT_EVAL_QUERIES;
  let topK = 8;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--queries' && args[i + 1]) {
      const queryFile = args[i + 1];
      queries = await loadQueriesFromFile(queryFile);
      i++;
    } else if (args[i] === '--topk' && args[i + 1]) {
      topK = parseInt(args[i + 1], 10);
      i++;
    }
  }
  
  const results = await runEvaluation(queries, topK);
  
  const outputPath = path.join(process.cwd(), 'eval_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to: ${outputPath}`);
}

export { runEvaluation, loadQueriesFromFile, EvalQuery, EvalResult };

if (process.argv[1]?.endsWith('eval.ts') || process.argv[1]?.endsWith('eval.js')) {
  main().catch(console.error);
}
