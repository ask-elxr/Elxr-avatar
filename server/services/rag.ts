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

/**
 * Generate a video lesson script using avatar's knowledge base
 * Optimized for creating spoken content that avatars will deliver
 */
export async function generateLessonScript({
  avatarId,
  topic,
  lessonTitle,
  pineconeNamespaces = [],
  personalityPrompt,
  targetDuration = 60,
  additionalContext = '',
  hasImageContent = false
}: {
  avatarId: string;
  topic: string;
  lessonTitle: string;
  pineconeNamespaces?: string[];
  personalityPrompt?: string;
  targetDuration?: number;
  additionalContext?: string;
  hasImageContent?: boolean;
}) {
  // Auto-detect image content if not explicitly passed
  const containsImageAnalysis = hasImageContent || additionalContext.includes('Image Analysis:');
  // 1. Retrieve relevant context from Pinecone
  let pineconeContext: any[] = [];
  if (pineconeNamespaces && pineconeNamespaces.length > 0) {
    pineconeContext = await pineconeNamespaceService.retrieveContext(
      `${topic} ${lessonTitle}`,
      8,
      pineconeNamespaces
    );
  }

  // 2. Build knowledge context
  const contextParts: string[] = [];
  
  if (pineconeContext.length > 0) {
    const contextText = pineconeContext
      .map((match: any, i: number) => `[${i + 1}] ${match.metadata?.text || ''}`)
      .join('\n\n');
    contextParts.push(`KNOWLEDGE BASE CONTENT:\n${contextText}`);
  }
  
  if (additionalContext) {
    contextParts.push(`ADDITIONAL CONTEXT:\n${additionalContext}`);
  }

  const combinedContext = contextParts.join('\n\n---\n\n');

  // 3. Create script generation prompt
  const wordsPerMinute = 150;
  const targetWords = Math.round((targetDuration / 60) * wordsPerMinute);
  
  // Add image-specific instructions when image content is detected
  const imageInstructions = containsImageAnalysis ? `
CRITICAL - IMAGE CONTENT:
You have been provided with an "Image Analysis" section in the additional context. This contains a detailed description of an image the user uploaded.
- You MUST describe and discuss what is shown in the image based on this analysis
- Reference the visual elements, objects, people, or scenes described
- Connect the image content directly to your explanation
- Do NOT say "I cannot see the image" or "no image was provided" - the image analysis IS your view of the image
- Speak as if you are looking at and describing the image to the viewer
` : '';

  const scriptPrompt = `You are writing a video lesson script for "${lessonTitle}".

TOPIC: ${topic}
${imageInstructions}
TARGET LENGTH: Approximately ${targetWords} words (${targetDuration} seconds when spoken at natural pace)

SCRIPT REQUIREMENTS:
1. Write in first person as if you are the speaker delivering this lesson
2. Start with a brief, engaging introduction that hooks the viewer
3. Present the main content clearly and conversationally
4. Include specific examples, facts, or insights from the knowledge base${containsImageAnalysis ? ' AND the image analysis' : ''}
5. End with a clear takeaway or call to action
6. Write for SPOKEN delivery - use natural language, contractions, and conversational flow
7. Avoid bullet points, numbered lists, or written formatting - write flowing paragraphs
8. Do NOT include stage directions, camera cues, or "[pause]" markers
${containsImageAnalysis ? '9. You MUST reference and describe the image content based on the Image Analysis provided' : ''}

OUTPUT: Return ONLY the script text that the avatar will speak. No headers, no meta-commentary.`;

  // 4. Generate the script using Claude with the avatar's personality
  const systemPrompt = personalityPrompt 
    ? `${personalityPrompt}\n\nYou are now writing a video lesson script based on your expertise and knowledge.`
    : 'You are an expert educator creating engaging video lesson content.';

  const script = await claudeService.generateResponse(
    scriptPrompt,
    combinedContext,
    [],
    systemPrompt
  );

  return {
    script,
    sources: {
      pinecone: pineconeContext.length,
      hasAdditionalContext: !!additionalContext
    },
    metadata: {
      targetDuration,
      targetWords,
      estimatedDuration: Math.round((script.split(/\s+/).length / wordsPerMinute) * 60)
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
