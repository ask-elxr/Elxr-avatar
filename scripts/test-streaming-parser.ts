#!/usr/bin/env tsx

import { writeFileSync, unlinkSync } from 'fs';
import { gzipSync } from 'zlib';
import {
  streamParseXMLFile,
  extractArticleFromXML
} from '../server/offlinePubMedService';

// Create a small test XML file with multiple authors and keywords
const testXML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE PubmedArticleSet PUBLIC "-//NLM//DTD PubMedArticle, 1st January 2024//EN" "https://dtd.nlm.nih.gov/ncbi/pubmed/out/pubmed_240101.dtd">
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID>11111111</PMID>
      <Article>
        <ArticleTitle>First Test Article About Vitamin D</ArticleTitle>
        <Abstract>
          <AbstractText>This is the first test abstract about vitamin D and health.</AbstractText>
        </Abstract>
        <AuthorList>
          <Author>
            <LastName>Smith</LastName>
            <ForeName>John</ForeName>
          </Author>
          <Author>
            <LastName>Doe</LastName>
            <ForeName>Jane</ForeName>
          </Author>
          <Author>
            <LastName>Brown</LastName>
            <ForeName>Bob</ForeName>
          </Author>
        </AuthorList>
        <Journal>
          <Title>Test Journal</Title>
          <JournalIssue>
            <PubDate>
              <Year>2024</Year>
            </PubDate>
          </JournalIssue>
        </Journal>
      </Article>
      <KeywordList>
        <Keyword>vitamin D</Keyword>
        <Keyword>health</Keyword>
        <Keyword>nutrition</Keyword>
      </KeywordList>
    </MedlineCitation>
  </PubmedArticle>
  <PubmedArticle>
    <MedlineCitation>
      <PMID>22222222</PMID>
      <Article>
        <ArticleTitle>Second Test Article</ArticleTitle>
        <Abstract>
          <AbstractText>This is the second test abstract.</AbstractText>
        </Abstract>
        <AuthorList>
          <Author>
            <LastName>Wilson</LastName>
            <ForeName>Alice</ForeName>
          </Author>
        </AuthorList>
        <Journal>
          <Title>Another Journal</Title>
          <JournalIssue>
            <PubDate>
              <Year>2023</Year>
            </PubDate>
          </JournalIssue>
        </Journal>
      </Article>
      <KeywordList>
        <Keyword>test</Keyword>
      </KeywordList>
    </MedlineCitation>
  </PubmedArticle>
</PubmedArticleSet>`;

async function testStreamingParser() {
  const testFile = '/tmp/test-pubmed.xml.gz';
  
  try {
    console.log('🧪 Testing Streaming PubMed XML Parser\n');
    console.log('='.repeat(80));
    
    // Create compressed test file
    console.log('\n📝 Creating test file...');
    const compressed = gzipSync(Buffer.from(testXML));
    writeFileSync(testFile, compressed);
    console.log(`✅ Created ${testFile} (${compressed.length} bytes compressed)`);
    
    // Stream parse the file
    console.log('\n📖 Streaming parse...');
    const articles: any[] = [];
    
    const totalArticles = await streamParseXMLFile(testFile, async (article) => {
      articles.push(article);
    });
    
    console.log(`✅ Parsed ${totalArticles} articles`);
    console.log(`✅ Collected ${articles.length} articles in callback`);
    
    // Validate articles
    console.log('\n' + '='.repeat(80));
    console.log('📊 VALIDATION RESULTS\n');
    
    let allPassed = true;
    
    // Test Article 1
    console.log('Article 1:');
    const article1 = extractArticleFromXML(articles[0]);
    if (!article1) {
      console.log('❌ Failed to extract article 1');
      allPassed = false;
    } else {
      const checks1 = [
        { name: 'PMID', expected: '11111111', actual: article1.pmid },
        { name: 'Title', expected: 'First Test Article About Vitamin D', actual: article1.title },
        { name: 'Authors count', expected: 3, actual: article1.authors.length },
        { name: 'First author', expected: 'Smith John', actual: article1.authors[0] },
        { name: 'Second author', expected: 'Doe Jane', actual: article1.authors[1] },
        { name: 'Third author', expected: 'Brown Bob', actual: article1.authors[2] },
        { name: 'Keywords count', expected: 3, actual: article1.keywords?.length || 0 },
        { name: 'First keyword', expected: 'vitamin D', actual: article1.keywords?.[0] || '' },
        { name: 'Year', expected: '2024', actual: article1.year },
      ];
      
      for (const check of checks1) {
        const passed = check.expected === check.actual;
        const status = passed ? '✅' : '❌';
        console.log(`  ${status} ${check.name}: ${check.actual} ${!passed ? `(expected: ${check.expected})` : ''}`);
        if (!passed) allPassed = false;
      }
    }
    
    // Test Article 2
    console.log('\nArticle 2:');
    const article2 = extractArticleFromXML(articles[1]);
    if (!article2) {
      console.log('❌ Failed to extract article 2');
      allPassed = false;
    } else {
      const checks2 = [
        { name: 'PMID', expected: '22222222', actual: article2.pmid },
        { name: 'Title', expected: 'Second Test Article', actual: article2.title },
        { name: 'Authors count', expected: 1, actual: article2.authors.length },
        { name: 'Author', expected: 'Wilson Alice', actual: article2.authors[0] },
        { name: 'Keywords count', expected: 1, actual: article2.keywords?.length || 0 },
        { name: 'Keyword', expected: 'test', actual: article2.keywords?.[0] || '' },
        { name: 'Year', expected: '2023', actual: article2.year },
      ];
      
      for (const check of checks2) {
        const passed = check.expected === check.actual;
        const status = passed ? '✅' : '❌';
        console.log(`  ${status} ${check.name}: ${check.actual} ${!passed ? `(expected: ${check.expected})` : ''}`);
        if (!passed) allPassed = false;
      }
    }
    
    console.log('\n' + '='.repeat(80));
    
    if (allPassed) {
      console.log('\n🎉 ALL TESTS PASSED!\n');
      console.log('The streaming parser correctly:');
      console.log('  ✅ Processes compressed .xml.gz files');
      console.log('  ✅ Preserves multiple authors as arrays');
      console.log('  ✅ Preserves multiple keywords as arrays');
      console.log('  ✅ Builds proper nested XML structures');
      console.log('  ✅ Works with extractArticleFromXML()');
      console.log('\nThe parser is ready for production use!');
    } else {
      console.log('\n❌ SOME TESTS FAILED\n');
      console.log('Review the XML structure building in streamParseXMLFile()');
      process.exit(1);
    }
    
    // Cleanup
    unlinkSync(testFile);
    
  } catch (error: any) {
    console.error('\n❌ Test failed with error:', error.message);
    console.error(error.stack);
    try {
      unlinkSync(testFile);
    } catch {}
    process.exit(1);
  }
}

testStreamingParser();
