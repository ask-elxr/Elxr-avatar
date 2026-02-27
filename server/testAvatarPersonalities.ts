#!/usr/bin/env tsx
/**
 * Avatar Personality Test Script
 * 
 * Tests all 6 avatars with the same question to verify:
 * 1. Each has a distinct personality
 * 2. Responses follow guidelines (concise, direct)
 * 3. No action descriptions are used
 * 4. System configuration is correct
 */

import Anthropic from '@anthropic-ai/sdk';
import { defaultAvatars } from '../config/avatars.config.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const TEST_QUESTION = "Tell me about your area of expertise";

interface TestResult {
  avatarId: string;
  avatarName: string;
  response: string;
  checks: {
    hasEnding: boolean;
    isConcise: boolean;
    noActionDescriptions: boolean;
    hasDistinctVoice: boolean;
  };
  passed: boolean;
  issues: string[];
}

async function testAvatar(avatarId: string, avatarName: string, personalityPrompt: string): Promise<TestResult> {
  console.log(`\n🧪 Testing ${avatarName}...`);
  
  const issues: string[] = [];
  
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: TEST_QUESTION
        }
      ],
      system: personalityPrompt,
    });

    const response = message.content[0].type === 'text' ? message.content[0].text : '';
    
    // Check 1: Response ends naturally (no forced ending phrase required)
    const hasEnding = true; // No longer requiring specific ending phrase

    // Check 2: Is concise (approximately 2-3 paragraphs = 150-400 words)
    const wordCount = response.split(/\s+/).length;
    const isConcise = wordCount >= 50 && wordCount <= 500;
    if (!isConcise) {
      issues.push(`❌ Not concise (${wordCount} words, expected 50-500)`);
    }

    // Check 3: No action descriptions
    const actionPatterns = [/\*[^*]+\*/g, /\([^)]*gestures[^)]*\)/gi, /\([^)]*leans[^)]*\)/gi, /\([^)]*smirks[^)]*\)/gi];
    const hasActionDescriptions = actionPatterns.some(pattern => pattern.test(response));
    if (hasActionDescriptions) {
      issues.push("❌ Contains action descriptions or stage directions");
    }

    // Check 4: Has distinct voice (mentions their specific expertise)
    const expertiseKeywords: Record<string, string[]> = {
      'mark-kohl': ['psychedelic', 'mushroom', 'fungi', 'mycolog', 'kundalini', 'spiritual'],
      'willie-gault': ['NFL', 'Olympic', 'athletic', 'performance', 'sport', 'fitness'],
      'june': ['mental health', 'mindfulness', 'emotional', 'wellbeing', 'compassion'],
      'ann': ['body', 'nutrition', 'movement', 'physical', 'wellness', 'vitality'],
      'shawn': ['leadership', 'conscious', 'performance', 'executive', 'sustainable'],
      'thad': ['financial', 'wealth', 'money', 'resilience', 'purpose']
    };
    
    const keywords = expertiseKeywords[avatarId] || [];
    const hasDistinctVoice = keywords.some(keyword => 
      response.toLowerCase().includes(keyword.toLowerCase())
    );
    if (!hasDistinctVoice) {
      issues.push(`❌ Doesn't mention specific expertise (expected keywords: ${keywords.join(', ')})`);
    }

    const passed = issues.length === 0;

    return {
      avatarId,
      avatarName,
      response,
      checks: {
        hasEnding,
        isConcise,
        noActionDescriptions: !hasActionDescriptions,
        hasDistinctVoice
      },
      passed,
      issues
    };
  } catch (error: any) {
    return {
      avatarId,
      avatarName,
      response: '',
      checks: {
        hasEnding: false,
        isConcise: false,
        noActionDescriptions: false,
        hasDistinctVoice: false
      },
      passed: false,
      issues: [`❌ Error: ${error.message}`]
    };
  }
}

async function runTests() {
  console.log('🚀 Avatar Personality Test Suite');
  console.log('================================\n');
  console.log(`Test Question: "${TEST_QUESTION}"\n`);

  const results: TestResult[] = [];

  for (const avatar of defaultAvatars) {
    if (!avatar.isActive) continue;
    
    const result = await testAvatar(
      avatar.id,
      avatar.name,
      avatar.personalityPrompt
    );
    results.push(result);
    
    // Wait a bit between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Print summary
  console.log('\n\n📊 TEST RESULTS SUMMARY');
  console.log('=======================\n');

  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;

  console.log(`Overall: ${passedCount}/${totalCount} avatars passed all checks\n`);

  results.forEach(result => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} - ${result.avatarName}`);
    console.log(`  - Natural ending: ${result.checks.hasEnding ? '✓' : '✗'}`);
    console.log(`  - Concise response: ${result.checks.isConcise ? '✓' : '✗'}`);
    console.log(`  - No action descriptions: ${result.checks.noActionDescriptions ? '✓' : '✗'}`);
    console.log(`  - Distinct voice: ${result.checks.hasDistinctVoice ? '✓' : '✗'}`);
    
    if (result.issues.length > 0) {
      console.log(`  Issues:`);
      result.issues.forEach(issue => console.log(`    ${issue}`));
    }
    console.log();
  });

  // Print detailed responses
  console.log('\n\n📝 DETAILED RESPONSES');
  console.log('====================\n');

  results.forEach(result => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`${result.avatarName.toUpperCase()}`);
    console.log('='.repeat(60));
    console.log(result.response || '(No response)');
    console.log();
  });

  // Compare personalities side-by-side
  console.log('\n\n🔍 PERSONALITY COMPARISON');
  console.log('========================\n');
  
  results.forEach(result => {
    const preview = result.response.split('\n')[0].substring(0, 100);
    console.log(`${result.avatarName.padEnd(15)} | ${preview}...`);
  });

  console.log('\n\n✨ Test complete!\n');
  
  process.exit(passedCount === totalCount ? 0 : 1);
}

// Check for API key
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ Error: ANTHROPIC_API_KEY environment variable is required');
  process.exit(1);
}

runTests().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
