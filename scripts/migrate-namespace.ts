import { pineconeService, PineconeIndexName } from '../server/pinecone.js';

async function migrateNamespace() {
  const sourceNamespace = process.argv[2] || 'knowledge-assistant';
  const targetNamespace = process.argv[3] || 'mark-kohl';
  const deleteSource = process.argv[4] === 'true';

  console.log(`\nMigrating Pinecone namespace:`);
  console.log(`  Source: ${sourceNamespace}`);
  console.log(`  Target: ${targetNamespace}`);
  console.log(`  Delete source after migration: ${deleteSource}\n`);

  try {
    const result = await pineconeService.migrateNamespace(
      sourceNamespace,
      targetNamespace,
      PineconeIndexName.ASK_ELXR,
      deleteSource
    );

    console.log('\n✅ Migration completed successfully!');
    console.log(`   Migrated ${result.migratedCount} vectors`);
    console.log(`   From: ${result.sourceNamespace}`);
    console.log(`   To: ${result.targetNamespace}`);
    
    if (result.deletedSource) {
      console.log(`   ⚠️  Source namespace deleted`);
    }
  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

migrateNamespace();
