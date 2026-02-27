import { pineconeNamespaceService } from './pineconeNamespaceService.js';
import { logger } from './logger.js';

const log = logger.child({ service: 'cultivation-bypass' });

const CULTIVATION_PATTERNS = [
  /how\s+(do\s+(i|you)|to|can\s+(i|we))\s+(grow|cultivate|produce|make)\s+(psilocybin|mushroom|shroom|cannabis|weed|marijuana)/i,
  /grow(ing)?\s+(psilocybin|magic\s*mushroom|shroom|psilo)/i,
  /cultivat(e|ing|ion)\s+(psilocybin|mushroom|psilo)/i,
  /(psilocybin|magic\s*mushroom|shroom)\s+(grow|cultivat|produc)/i,
  /best\s+way\s+to\s+grow\s+(psilocybin|mushroom|shroom)/i,
  /grow(ing)?\s+(cannabis|weed|marijuana|pot)/i,
  /cultivat(e|ing)\s+(cannabis|weed|marijuana)/i,
  /(cannabis|weed|marijuana)\s+(grow|cultivat)/i,
  /how\s+(do\s+(i|you)|to)\s+make\s+(dmt|lsd|mdma)/i,
  /mushroom\s+(substrate|spawn|cultivation|growing)/i,
  /(steriliz|pressure\s+cook|autoclave).*(grain|substrate|spawn)/i,
  /(grain|substrate|spawn).*(steriliz|pressure\s+cook)/i,
  /monotub\s+(tek|technique|setup|build)/i,
  /(still\s+air\s+box|SAB|glovebox|laminar\s+flow)\s+(work|technique|setup)/i,
  /spore\s+(syringe|print|swab).*(inocul|inject)/i,
  /(inocul|inject).*(spore|grain|bag)/i,
  /fruiting\s+(chamber|conditions|stage)/i,
  /coloniz(e|ing|ation)\s+(substrate|grain|bag)/i,
];

const CULTIVATION_PHRASE_KEYWORDS = [
  'grow mushroom', 'growing mushroom', 'cultivate mushroom',
  'grow psilocybin', 'growing psilocybin', 'cultivate psilocybin',
  'grow magic mushroom', 'grow shroom', 'grow psilo',
  'mushroom substrate', 'bulk substrate', 'coir substrate',
  'spawn bag', 'grain spawn', 'liquid culture',
  'spore syringe', 'spore print', 'agar plate',
  'monotub tek', 'shotgun fruiting chamber', 'sgfc',
  'still air box', 'laminar flow hood',
  'inoculation technique', 'colonization time',
  'fruiting conditions', 'pinning stage',
  'sterilize grain', 'pressure cooker sterilization',
  'pasteurize substrate', 'hydrate substrate',
  'grow cannabis', 'growing cannabis', 'cultivate cannabis',
  'grow weed', 'growing weed', 'grow marijuana',
  'cannabis cultivation', 'marijuana growing',
];

export interface CultivationBypassResult {
  shouldBypass: boolean;
  kbContent: string;
  leadIn: string;
  reason?: string;
}

export function detectCultivationIntent(query: string): boolean {
  const queryLower = query.toLowerCase();
  
  for (const pattern of CULTIVATION_PATTERNS) {
    if (pattern.test(query)) {
      log.info({ query: query.substring(0, 100), matchedPattern: pattern.source }, 'Cultivation intent detected via regex');
      return true;
    }
  }
  
  for (const keyword of CULTIVATION_PHRASE_KEYWORDS) {
    if (queryLower.includes(keyword)) {
      log.info({ query: query.substring(0, 100), matchedKeyword: keyword }, 'Cultivation intent detected via keyword');
      return true;
    }
  }
  
  return false;
}

export async function handleCultivationQuery(
  query: string,
  namespaces: string[],
  avatarName: string
): Promise<CultivationBypassResult> {
  if (!detectCultivationIntent(query)) {
    return { shouldBypass: false, kbContent: '', leadIn: '' };
  }
  
  log.info({ query: query.substring(0, 100), namespaces }, 'Processing cultivation query via KB-direct bypass');
  
  if (!pineconeNamespaceService.isAvailable()) {
    log.warn('Pinecone not available for cultivation bypass');
    return {
      shouldBypass: true,
      kbContent: '',
      leadIn: "I'd love to help with that, but I don't have that specific information in my resources right now.",
      reason: 'pinecone_unavailable'
    };
  }
  
  try {
    const results = await pineconeNamespaceService.retrieveContext(query, 5, namespaces);
    
    if (results.length === 0) {
      log.info({ namespaces }, 'No cultivation content found in knowledge base');
      return {
        shouldBypass: true,
        kbContent: '',
        leadIn: "That's a great question. I don't have specific cultivation details in my knowledge base right now, but I can share what I know about the science and effects if you're interested.",
        reason: 'no_kb_results'
      };
    }
    
    const relevantResults = results.filter((r: { score: number }) => r.score > 0.65);
    
    if (relevantResults.length === 0) {
      log.info({ scores: results.map((r: { score: number }) => r.score.toFixed(3)) }, 'No high-relevance cultivation content');
      return {
        shouldBypass: true,
        kbContent: '',
        leadIn: "I don't have specific cultivation instructions in my materials, but I can discuss the science, effects, and harm reduction aspects if that would help.",
        reason: 'low_relevance'
      };
    }
    
    const kbContent = relevantResults
      .map((r: { text: string }) => r.text)
      .join('\n\n');
    
    const leadIns = [
      `Alright, here's what I know about that.`,
      `Great question. Let me share what I've learned.`,
      `Here's what I can tell you from my experience and research.`,
      `Good question. From what I know...`,
    ];
    const leadIn = leadIns[Math.floor(Math.random() * leadIns.length)];
    
    log.info({ 
      resultCount: relevantResults.length, 
      contentLength: kbContent.length,
      topScore: relevantResults[0]?.score?.toFixed(3)
    }, 'Cultivation bypass: returning KB content directly');
    
    return {
      shouldBypass: true,
      kbContent,
      leadIn,
      reason: 'kb_direct'
    };
    
  } catch (error: any) {
    log.error({ error: error.message }, 'Error in cultivation bypass');
    return {
      shouldBypass: true,
      kbContent: '',
      leadIn: "I'm having trouble accessing that information right now. Let me try to help in another way.",
      reason: 'error'
    };
  }
}

export function formatKBResponseForVoice(leadIn: string, kbContent: string): string {
  if (!kbContent) {
    return leadIn;
  }
  
  let cleaned = kbContent
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[-•]\s*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  const maxLength = 800;
  if (cleaned.length > maxLength) {
    const truncated = cleaned.substring(0, maxLength);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?')
    );
    if (lastSentenceEnd > maxLength * 0.6) {
      cleaned = truncated.substring(0, lastSentenceEnd + 1);
    } else {
      cleaned = truncated + '...';
    }
  }
  
  return `${leadIn} ${cleaned}`;
}
