#!/usr/bin/env tsx

import { existsSync, writeFileSync, readFileSync } from 'fs';
import { resolve } from 'path';
import {
  streamParseXMLFile,
  extractArticleFromXML,
  storeBatchInPinecone,
  type ImportProgress,
} from '../server/offlinePubMedService';

const BATCH_SIZE = 1000;
const PROGRESS_FILE = 'pubmed-import-progress.json';

interface ProgressState {
  currentFile: string;
  processedFiles: string[];
  lastProcessedPMID?: string;
  totalArticlesProcessed: number;
  totalSuccessCount: number;
  totalErrorCount: number;
  startTime: number;
}

function loadProgress(): ProgressState | null {
  if (existsSync(PROGRESS_FILE)) {
    try {
      const data = readFileSync(PROGRESS_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading progress file:', error);
      return null;
    }
  }
  return null;
}

function saveProgress(state: ProgressState): void {
  try {
    writeFileSync(PROGRESS_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('Error saving progress file:', error);
  }
}

async function processFile(
  filePath: string,
  state: ProgressState,
  resumeFromPMID?: string
): Promise<void> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Processing file: ${filePath}`);
  console.log(`${'='.repeat(80)}\n`);

  const startTime = Date.now();
  
  try {
    console.log('📖 Streaming XML file (memory-efficient mode)...');
    
    let articles: any[] = [];
    let totalExtracted = 0;
    let totalSkipped = 0;
    let shouldResume = resumeFromPMID ? true : false;
    let articleCount = 0;
    let batchPromiseChain = Promise.resolve();

    const progress: ImportProgress = {
      fileName: filePath,
      totalArticles: 0,
      processedArticles: 0,
      successCount: 0,
      errorCount: 0,
      startTime: Date.now(),
    };

    function queueBatch(batchArticles: any[]): Promise<void> {
      batchPromiseChain = batchPromiseChain.then(async () => {
        console.log(`\n📦 Processing batch of ${batchArticles.length} articles...`);
        const batchStart = Date.now();
        
        const result = await storeBatchInPinecone(batchArticles, progress);
        
        const batchDuration = ((Date.now() - batchStart) / 1000).toFixed(2);
        progress.successCount += result.success;
        progress.errorCount += result.errors;
        progress.processedArticles = totalExtracted;
        
        state.totalArticlesProcessed += result.success;
        state.totalSuccessCount += result.success;
        state.totalErrorCount += result.errors;
        state.lastProcessedPMID = progress.lastProcessedPMID;
        
        saveProgress(state);

        console.log(`✅ Batch complete in ${batchDuration}s`);
        console.log(`   - Success: ${result.success}`);
        console.log(`   - Errors: ${result.errors}`);
        console.log(`   - Extracted: ${totalExtracted} articles`);
        console.log(`   - Last PMID: ${progress.lastProcessedPMID}`);
      });
      
      return batchPromiseChain;
    }

    const totalArticlesProcessed = await streamParseXMLFile(filePath, async (xmlArticle) => {
      articleCount++;
      
      const article = extractArticleFromXML(xmlArticle);
      
      if (!article) {
        totalSkipped++;
        return;
      }

      if (shouldResume && article.pmid !== resumeFromPMID) {
        totalSkipped++;
        return;
      }
      
      if (shouldResume && article.pmid === resumeFromPMID) {
        console.log(`✅ Resuming from PMID: ${resumeFromPMID} (including this article)`);
        shouldResume = false;
      }

      articles.push(article);
      totalExtracted++;

      if (articles.length >= BATCH_SIZE) {
        const currentBatch = [...articles];
        articles = [];
        
        queueBatch(currentBatch);
      }

      if (articleCount % 100 === 0) {
        console.log(`📊 Progress: ${articleCount} articles scanned, ${totalExtracted} extracted`);
      }
    });

    progress.totalArticles = articleCount;

    if (articles.length > 0) {
      queueBatch(articles);
    }
    
    await batchPromiseChain;

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ File processing complete: ${filePath}`);
    console.log(`${'='.repeat(80)}`);
    console.log(`⏱️  Duration: ${duration}s`);
    console.log(`📊 Total articles in file: ${articleCount}`);
    console.log(`📊 Extracted: ${totalExtracted} articles`);
    console.log(`⏭️  Skipped: ${totalSkipped} articles`);
    console.log(`✅ Stored: ${progress.successCount} articles`);
    console.log(`❌ Errors: ${progress.errorCount} articles`);
    console.log(`💾 Memory-efficient: Streaming parser used`);
    console.log(`\n`);

    state.processedFiles.push(filePath);
    saveProgress(state);

  } catch (error: any) {
    console.error(`\n❌ Error processing file ${filePath}:`, error.message);
    console.error(error.stack);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error(`
Usage: tsx scripts/importPubMedDump.ts <file-path> [options]

Arguments:
  <file-path>         Path to PubMed XML dump file (.xml.gz)
                      Can be a single file or glob pattern

Options:
  --resume            Resume from last processed PMID
  --reset             Reset progress and start fresh

Examples:
  # Process a single file
  tsx scripts/importPubMedDump.ts data/pubmed24n0001.xml.gz

  # Resume interrupted import
  tsx scripts/importPubMedDump.ts data/pubmed24n0001.xml.gz --resume

  # Start fresh (ignore previous progress)
  tsx scripts/importPubMedDump.ts data/pubmed24n0001.xml.gz --reset

Note: Requires OPENAI_API_KEY and PINECONE_API_KEY environment variables.
`);
    process.exit(1);
  }

  const filePath = resolve(args[0]);
  const shouldResume = args.includes('--resume');
  const shouldReset = args.includes('--reset');

  if (!existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable not set');
    process.exit(1);
  }

  if (!process.env.PINECONE_API_KEY) {
    console.error('❌ PINECONE_API_KEY environment variable not set');
    process.exit(1);
  }

  let state: ProgressState;
  let resumeFromPMID: string | undefined;

  if (shouldReset || !shouldResume) {
    console.log('🔄 Starting fresh import...\n');
    state = {
      currentFile: filePath,
      processedFiles: [],
      totalArticlesProcessed: 0,
      totalSuccessCount: 0,
      totalErrorCount: 0,
      startTime: Date.now(),
    };
    saveProgress(state);
  } else {
    const savedState = loadProgress();
    if (savedState && savedState.lastProcessedPMID) {
      console.log(`🔄 Resuming from PMID: ${savedState.lastProcessedPMID}\n`);
      state = savedState;
      state.currentFile = filePath;
      resumeFromPMID = savedState.lastProcessedPMID;
    } else {
      console.log('⚠️  No previous progress found, starting fresh...\n');
      state = {
        currentFile: filePath,
        processedFiles: [],
        totalArticlesProcessed: 0,
        totalSuccessCount: 0,
        totalErrorCount: 0,
        startTime: Date.now(),
      };
      saveProgress(state);
    }
  }

  console.log(`${'='.repeat(80)}`);
  console.log(`🚀 PubMed Offline Import Tool`);
  console.log(`${'='.repeat(80)}`);
  console.log(`📁 File: ${filePath}`);
  console.log(`📊 Batch size: ${BATCH_SIZE} articles`);
  console.log(`🔄 Resume mode: ${shouldResume ? 'Yes' : 'No'}`);
  console.log(`\n`);

  try {
    await processFile(filePath, state, resumeFromPMID);

    const totalDuration = ((Date.now() - state.startTime) / 1000 / 60).toFixed(2);
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🎉 IMPORT COMPLETE`);
    console.log(`${'='.repeat(80)}`);
    console.log(`⏱️  Total duration: ${totalDuration} minutes`);
    console.log(`📁 Files processed: ${state.processedFiles.length}`);
    console.log(`📊 Total articles: ${state.totalArticlesProcessed}`);
    console.log(`✅ Success: ${state.totalSuccessCount}`);
    console.log(`❌ Errors: ${state.totalErrorCount}`);
    console.log(`\n`);

    console.log('✅ Progress file saved:', PROGRESS_FILE);
    console.log('\nYou can now use the offline PubMed search feature!');

  } catch (error: any) {
    console.error('\n❌ Import failed:', error.message);
    console.error('\n💾 Progress has been saved. You can resume using:');
    console.error(`   tsx scripts/importPubMedDump.ts ${filePath} --resume\n`);
    process.exit(1);
  }
}

main();
