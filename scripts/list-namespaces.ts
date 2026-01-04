import { pineconeService } from '../server/pinecone.js';

async function listNamespaces() {
  console.log('📊 Fetching Pinecone namespace stats...');
  const stats = await pineconeService.getNamespaceStats();
  console.log('\n📋 All namespaces:');
  for (const ns of stats.namespaces) {
    console.log(`  - ${ns.namespace}: ${ns.vectorCount} vectors`);
  }
  console.log(`\n📊 Total vectors: ${stats.totalVectorCount}`);
}

listNamespaces().catch(console.error);
