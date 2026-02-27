#!/usr/bin/env tsx

import {
  extractArticleFromXML
} from '../server/offlinePubMedService';

// Sample XML article structure (simplified)
const sampleXMLArticle = {
  MedlineCitation: {
    PMID: '12345678',
    Article: {
      ArticleTitle: 'Sample PubMed Article Title About Vitamin D and Immune Function',
      Abstract: {
        AbstractText: 'This is a sample abstract discussing the relationship between vitamin D supplementation and immune system function in clinical trials.'
      },
      AuthorList: {
        Author: [
          {
            LastName: 'Smith',
            ForeName: 'John'
          },
          {
            LastName: 'Doe',
            ForeName: 'Jane'
          }
        ]
      },
      Journal: {
        Title: 'Journal of Immunology',
        ISOAbbreviation: 'J Immunol',
        JournalIssue: {
          PubDate: {
            Year: '2024'
          }
        }
      }
    },
    KeywordList: {
      Keyword: ['vitamin D', 'immune system', 'clinical trials']
    }
  }
};

async function testParsing() {
  console.log('🧪 Testing PubMed XML article extraction\n');
  console.log('Input XML structure:');
  console.log(JSON.stringify(sampleXMLArticle, null, 2));
  console.log('\n' + '='.repeat(80) + '\n');

  const extracted = extractArticleFromXML(sampleXMLArticle);

  if (!extracted) {
    console.error('❌ Failed to extract article');
    process.exit(1);
  }

  console.log('✅ Extracted article:');
  console.log(JSON.stringify(extracted, null, 2));
  console.log('\n' + '='.repeat(80) + '\n');

  // Validate extracted fields
  const checks = [
    { field: 'pmid', expected: '12345678', actual: extracted.pmid },
    { field: 'title', expected: 'Sample PubMed Article Title About Vitamin D and Immune Function', actual: extracted.title },
    { field: 'abstract', expected: true, actual: !!extracted.abstract },
    { field: 'authors', expected: 2, actual: extracted.authors.length },
    { field: 'journal', expected: 'Journal of Immunology', actual: extracted.journal },
    { field: 'year', expected: '2024', actual: extracted.year },
    { field: 'keywords', expected: 3, actual: extracted.keywords?.length || 0 }
  ];

  console.log('Validation checks:');
  let allPassed = true;
  for (const check of checks) {
    const passed = check.expected === check.actual;
    const status = passed ? '✅' : '❌';
    console.log(`${status} ${check.field}: expected ${check.expected}, got ${check.actual}`);
    if (!passed) allPassed = false;
  }

  console.log('\n' + '='.repeat(80) + '\n');
  
  if (allPassed) {
    console.log('🎉 All tests passed!');
    console.log('\nThe XML parser is working correctly.');
    console.log('You can now use the import script to process real PubMed XML dump files.');
  } else {
    console.error('❌ Some tests failed');
    process.exit(1);
  }
}

testParsing();
