/**
 * RAG Service
 * 
 * Centralized service for Retrieval-Augmented Generation using Claude Sonnet + Pinecone.
 * This service combines knowledge retrieval with AI generation.
 */

import { claudeService } from '../claudeService.js';
import { pineconeService } from '../pinecone.js';
import { pineconeNamespaceService } from '../pineconeNamespaceService.js';
import { googleSearchService } from '../googleSearchService.js';
import * as pubmedService from '../pubmedService.js';
import { documentProcessor } from '../documentProcessor.js';

/**
 * Run RAG for a given avatar with multi-source knowledge retrieval
 */
export async function runAvatarRAG({
  avatarId,
  message,
  memorySnippets = [],
  pineconeNamespaces = [],
  conversationHistory = [],
  personalityPrompt,
  useWebSearch = false,
  usePubMed = false
}: {
  avatarId: string;
  message: string;
  memorySnippets?: string[];
  pineconeNamespaces?: string[];
  conversationHistory?: any[];
  personalityPrompt?: string;
  useWebSearch?: boolean;
  usePubMed?: boolean;
}) {
  // 1. Retrieve context from Pinecone if namespaces are provided
  let pineconeContext: any[] = [];
  if (pineconeNamespaces && pineconeNamespaces.length > 0) {
    pineconeContext = await pineconeNamespaceService.retrieveContext(
      message,
      5,
      pineconeNamespaces
    );
  }

  // 2. Optionally get web search results
  let webResults: string = '';
  if (useWebSearch && googleSearchService.isAvailable()) {
    webResults = await googleSearchService.search(message, 5);
  }

  // 3. Optionally get PubMed results
  let pubmedResults: string = '';
  if (usePubMed && pubmedService.isAvailable()) {
    const results = await pubmedService.searchHybrid(message, 3);
    if (results.formattedText) {
      pubmedResults = results.formattedText;
    }
  }

  // 4. Build combined context
  const contextParts: string[] = [];
  
  if (memorySnippets.length > 0) {
    contextParts.push(`CONVERSATION MEMORY:\n${memorySnippets.join('\n')}`);
  }
  
  if (pineconeContext.length > 0) {
    const contextText = pineconeContext
      .map((match: any, i: number) => `[${i + 1}] ${match.metadata?.text || ''}`)
      .join('\n\n');
    contextParts.push(`KNOWLEDGE BASE:\n${contextText}`);
  }
  
  if (webResults) {
    contextParts.push(`WEB SEARCH RESULTS:\n${webResults}`);
  }
  
  if (pubmedResults) {
    contextParts.push(`PUBMED RESEARCH:\n${pubmedResults}`);
  }

  const combinedContext = contextParts.join('\n\n---\n\n');

  // 5. Generate response using Claude
  const answer = await claudeService.generateResponse(
    message,
    combinedContext,
    conversationHistory,
    personalityPrompt
  );

  return {
    answer,
    context: combinedContext,
    sources: {
      pinecone: pineconeContext.length,
      web: webResults ? 1 : 0,
      pubmed: pubmedResults ? 1 : 0,
      memory: memorySnippets.length
    }
  };
}

// Re-export services for convenience
export { 
  claudeService, 
  pineconeService, 
  pineconeNamespaceService,
  googleSearchService,
  pubmedService,
  documentProcessor
};
