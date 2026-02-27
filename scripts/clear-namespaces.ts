import { pineconeService } from '../server/pinecone.js';

// Namespaces to clear (lowercase - as they actually exist in Pinecone)
// Protect Mark Kohl's namespace
const PROTECTED = ['mark-kohl'];
const NAMESPACES_TO_CLEAR = ['sexuality', 'life', 'transitions', 'mind', 'grief', 'addiction', 'work', 'body', 'longevity', 'nutrition', 'other', 'sleep', 'spirituality'];

async function clearNamespaces() {
  console.log('🧹 Starting namespace cleanup (protecting mark-kohl)...');
  
  for (const ns of NAMESPACES_TO_CLEAR) {
    if (PROTECTED.includes(ns)) {
      console.log(`⏭️ Skipping protected: ${ns}`);
      continue;
    }
    
    try {
      console.log(`🗑️ Clearing: ${ns}`);
      await pineconeService.deleteNamespaceAll(ns);
      console.log(`✅ Cleared: ${ns}`);
    } catch (error: any) {
      console.error(`❌ Failed ${ns}:`, error.message);
    }
  }
  
  console.log('🧹 Done! Only mark-kohl namespace remains.');
}

clearNamespaces().catch(console.error);
