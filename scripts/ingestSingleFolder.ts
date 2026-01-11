/**
 * Single folder ingestion script - processes one topic folder at a time
 * Usage: npx tsx scripts/ingestSingleFolder.ts <folderId> <namespace>
 */

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const BASE_URL = 'http://localhost:5000';

interface FileInfo {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getFolderFiles(folderId: string): Promise<FileInfo[]> {
  const response = await fetch(`${BASE_URL}/api/google-drive/topic-folder/${folderId}/files`, {
    headers: { 'X-Admin-Secret': ADMIN_SECRET || '' }
  });
  const data = await response.json();
  return data.files || [];
}

async function uploadFile(fileId: string, fileName: string, namespace: string): Promise<{success: boolean; error?: string; chunks?: number}> {
  try {
    const response = await fetch(`${BASE_URL}/api/google-drive/topic-upload-single`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Secret': ADMIN_SECRET || ''
      },
      body: JSON.stringify({ fileId, fileName, namespace })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return { success: false, error: data.error || `HTTP ${response.status}` };
    }
    
    return { success: true, chunks: data.chunksProcessed };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Usage: npx tsx scripts/ingestSingleFolder.ts <folderId> <namespace>');
    process.exit(1);
  }
  
  const [folderId, namespace] = args;
  
  console.log(`📂 Processing folder: ${namespace}`);
  console.log(`   Folder ID: ${folderId}\n`);
  
  const files = await getFolderFiles(folderId);
  console.log(`   Found ${files.length} files\n`);
  
  let processed = 0, skipped = 0, failed = 0, totalChunks = 0;
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    console.log(`[${i+1}/${files.length}] Processing: ${file.name}`);
    
    const result = await uploadFile(file.id, file.name, namespace);
    
    if (result.success) {
      console.log(`   ✅ Success: ${result.chunks} chunks`);
      processed++;
      totalChunks += result.chunks || 0;
    } else if (result.error?.includes('too large') || result.error?.includes('skipped')) {
      console.log(`   ⏭️  Skipped: ${result.error}`);
      skipped++;
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
      failed++;
    }
    
    // 5 second delay between files
    if (i < files.length - 1) {
      await sleep(5000);
    }
  }
  
  console.log('\n' + '='.repeat(40));
  console.log(`📊 ${namespace} COMPLETE`);
  console.log('='.repeat(40));
  console.log(`Files processed: ${processed}`);
  console.log(`Files skipped:   ${skipped}`);
  console.log(`Files failed:    ${failed}`);
  console.log(`Total chunks:    ${totalChunks}`);
}

main().catch(console.error);
