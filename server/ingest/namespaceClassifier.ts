import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../logger.js';

const NAMESPACE_TAXONOMY = [
  { id: 'MIND', description: 'Meditation, neuroplasticity, consciousness, mental clarity, brain science, mindfulness, Joe Dispenza style content' },
  { id: 'ADDICTION', description: 'Substance abuse, recovery, behavioral addictions, sobriety, 12-step programs, relapse prevention' },
  { id: 'GRIEF', description: 'Loss, bereavement, death, mourning, processing emotional pain from loss' },
  { id: 'SPIRITUALITY', description: 'Religion, faith, spiritual practices, prayer, mysticism, divine connection, transcendence' },
  { id: 'SEXUALITY', description: 'Intimacy, relationships, sexual health, tantra, libido, erotic wellness' },
  { id: 'BODY', description: 'Physical health, exercise, movement, chronic pain, body awareness, somatic practices' },
  { id: 'NUTRITION', description: 'Diet, food, supplements, fasting, gut health, eating habits' },
  { id: 'LONGEVITY', description: 'Anti-aging, life extension, biohacking, longevity science, healthspan' },
  { id: 'MIDLIFE', description: 'Midlife transitions, menopause, andropause, empty nest, career pivots after 40' },
  { id: 'LIFE', description: 'General life advice, philosophy, purpose, meaning, self-improvement' },
  { id: 'SLEEP', description: 'Sleep hygiene, insomnia, dreams, circadian rhythm, rest and recovery' },
  { id: 'WORK', description: 'Career, productivity, leadership, entrepreneurship, professional development' },
  { id: 'TRANSITIONS', description: 'Major life changes, divorce, relocation, retirement, identity shifts' },
] as const;

export type NamespaceId = typeof NAMESPACE_TAXONOMY[number]['id'];

export interface ClassificationResult {
  primary: NamespaceId;
  secondary?: NamespaceId;
  confidence: number;
  rationale: string;
}

const CLASSIFICATION_PROMPT = `You are a content classifier for a wellness podcast platform. Classify the following transcript excerpt into the most appropriate namespace(s).

Available namespaces:
${NAMESPACE_TAXONOMY.map(n => `- ${n.id}: ${n.description}`).join('\n')}

Rules:
1. Choose exactly ONE primary namespace that best fits the main topic
2. Optionally choose ONE secondary namespace if the content significantly covers another area (at least 25% of content)
3. Confidence is 0.0-1.0 based on how clearly the content fits the category
4. If content is very general or doesn't fit well, use "LIFE" as primary

Return ONLY a JSON object in this exact format (no markdown, no explanation):
{"primary":"NAMESPACE_ID","secondary":"NAMESPACE_ID_OR_NULL","confidence":0.85,"rationale":"Brief 1-sentence explanation"}

Transcript excerpt to classify:`;

export async function classifyTranscript(
  transcriptText: string,
  filename: string
): Promise<ClassificationResult> {
  const log = logger.child({ service: 'namespace-classifier', filename });
  
  try {
    const anthropic = new Anthropic();
    
    const excerpt = transcriptText.substring(0, 4000);
    
    log.debug({ excerptLength: excerpt.length }, 'Classifying transcript');
    
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `${CLASSIFICATION_PROMPT}\n\n${excerpt}`
        }
      ]
    });
    
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }
    
    const jsonText = content.text.trim();
    const result = JSON.parse(jsonText);
    
    const validNamespaces = NAMESPACE_TAXONOMY.map(n => n.id);
    if (!validNamespaces.includes(result.primary)) {
      log.warn({ invalidPrimary: result.primary }, 'Invalid primary namespace, defaulting to LIFE');
      result.primary = 'LIFE';
    }
    
    if (result.secondary && !validNamespaces.includes(result.secondary)) {
      log.warn({ invalidSecondary: result.secondary }, 'Invalid secondary namespace, removing');
      result.secondary = null;
    }
    
    if (result.secondary === result.primary) {
      result.secondary = null;
    }
    
    log.info({
      primary: result.primary,
      secondary: result.secondary || 'none',
      confidence: result.confidence
    }, 'Classification complete');
    
    return {
      primary: result.primary,
      secondary: result.secondary || undefined,
      confidence: Math.min(1, Math.max(0, result.confidence)),
      rationale: result.rationale || 'No rationale provided'
    };
    
  } catch (error: any) {
    log.error({ error: error.message }, 'Classification failed, defaulting to LIFE');
    
    return {
      primary: 'LIFE',
      confidence: 0.3,
      rationale: `Classification failed: ${error.message}. Defaulted to LIFE.`
    };
  }
}

export async function classifyBatchTranscripts(
  transcripts: Array<{ filename: string; text: string }>
): Promise<Map<string, ClassificationResult>> {
  const results = new Map<string, ClassificationResult>();
  
  for (const { filename, text } of transcripts) {
    const result = await classifyTranscript(text, filename);
    results.set(filename, result);
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return results;
}

export function getNamespaceTaxonomy() {
  return NAMESPACE_TAXONOMY;
}
