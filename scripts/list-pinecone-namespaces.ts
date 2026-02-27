import { pineconeService, PineconeIndexName } from '../server/pinecone.js';

async function listNamespaces() {
  try {
    console.log('\nFetching Pinecone index statistics...\n');
    
    const stats = await pineconeService.getStats(PineconeIndexName.ASK_ELXR);
    
    console.log('=== Pinecone Index Stats ===');
    console.log(`Total vectors: ${stats.totalRecordCount || 0}`);
    console.log(`Index dimension: ${stats.dimension || 'unknown'}`);
    console.log('\n=== Namespaces ===');
    
    if (stats.namespaces && Object.keys(stats.namespaces).length > 0) {
      Object.entries(stats.namespaces).forEach(([namespace, nsStats]) => {
        console.log(`\n📁 ${namespace}`);
        console.log(`   Vectors: ${nsStats.recordCount || 0}`);
      });
    } else {
      console.log('No namespaces found or index is empty.');
    }
    
    console.log('\n');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

listNamespaces();
