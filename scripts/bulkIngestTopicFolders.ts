/**
 * Bulk ingestion script for Google Drive topic folders
 * Processes all files through the new Claude-powered pipeline:
 * - Substance extraction (removes filler)
 * - Anonymization (removes sensitive info)
 * - Conversational chunking (creates searchable units)
 * - Pinecone upsert (stores in ask-elxr index)
 */

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const BASE_URL = 'http://localhost:5000';

// Protected namespaces that should not be modified
const PROTECTED_NAMESPACES = ['MARK_KOHL', 'mark-kohl'];

interface TopicFolder {
  id: string;
  name: string;
  namespace: string;
  fileCount: number;
  supportedFiles: number;
}

interface FileInfo {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getTopicFolders(): Promise<TopicFolder[]> {
  const response = await fetch(`${BASE_URL}/api/google-drive/topic-folders`, {
    headers: { 'X-Admin-Secret': ADMIN_SECRET || '' }
  });
  const data = await response.json();
  return data.folders || [];
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
  console.log('🚀 Starting bulk ingestion of Google Drive topic folders\n');
  
  const folders = await getTopicFolders();
  console.log(`📁 Found ${folders.length} topic folders\n`);
  
  const stats = {
    foldersProcessed: 0,
    filesProcessed: 0,
    filesSkipped: 0,
    filesFailed: 0,
    totalChunks: 0
  };
  
  for (const folder of folders) {
    // Skip protected namespaces
    if (PROTECTED_NAMESPACES.includes(folder.namespace) || 
        PROTECTED_NAMESPACES.some(p => folder.namespace.toLowerCase().includes(p.toLowerCase()))) {
      console.log(`⏭️  Skipping protected namespace: ${folder.name} (${folder.namespace})`);
      continue;
    }
    
    // Skip empty folders
    if (folder.supportedFiles === 0) {
      console.log(`⏭️  Skipping empty folder: ${folder.name}`);
      continue;
    }
    
    console.log(`\n📂 Processing folder: ${folder.name} (${folder.namespace}) - ${folder.supportedFiles} files`);
    
    const files = await getFolderFiles(folder.id);
    
    for (const file of files) {
      console.log(`  📄 Processing: ${file.name}`);
      
      const result = await uploadFile(file.id, file.name, folder.namespace);
      
      if (result.success) {
        console.log(`  ✅ Success: ${result.chunks} chunks created`);
        stats.filesProcessed++;
        stats.totalChunks += result.chunks || 0;
      } else if (result.error?.includes('too large') || result.error?.includes('skipped')) {
        console.log(`  ⏭️  Skipped: ${result.error}`);
        stats.filesSkipped++;
      } else {
        console.log(`  ❌ Failed: ${result.error}`);
        stats.filesFailed++;
      }
      
      // Rate limiting: 3 second delay between files
      await sleep(3000);
    }
    
    stats.foldersProcessed++;
    
    // 5 second delay between folders
    await sleep(5000);
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 BULK INGESTION COMPLETE');
  console.log('='.repeat(50));
  console.log(`Folders processed: ${stats.foldersProcessed}`);
  console.log(`Files processed:   ${stats.filesProcessed}`);
  console.log(`Files skipped:     ${stats.filesSkipped}`);
  console.log(`Files failed:      ${stats.filesFailed}`);
  console.log(`Total chunks:      ${stats.totalChunks}`);
}

main().catch(console.error);
