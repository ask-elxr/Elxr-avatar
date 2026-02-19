import Anthropic from '@anthropic-ai/sdk';
import { wrapServiceCall } from './circuitBreaker';
import { logger } from './logger';
import { storage } from './storage';
import { ELXR_CONTENT_POLICY } from './contentTaxonomy';
import { getBanterLevel, buildAvatarPrompt } from './warmthEngine';

// Switched from claude-opus-4-6 to claude-sonnet-4 to reduce costs (Opus was $289+ in Feb)
// Sonnet 4 is 5x cheaper and still high quality for conversations
const DEFAULT_MODEL_STR = "claude-sonnet-4-20250514";

const FAST_VOICE_MODEL = "claude-sonnet-4-20250514";

// Content policy is now imported from contentTaxonomy.ts for professional, taxonomy-based approach

export class ClaudeService {
  private anthropic: Anthropic | null;
  private createMessageBreaker: any;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      logger.warn({ service: 'claude' }, 'ANTHROPIC_API_KEY not found - Claude Sonnet features will be disabled');
      this.anthropic = null;
      return;
    }
    
    this.anthropic = new Anthropic({
      apiKey: apiKey,
    });

    this.createMessageBreaker = wrapServiceCall(
      async (params: any) => {
        if (!this.anthropic) {
          throw new Error('Anthropic client not initialized');
        }
        return await this.anthropic.messages.create(params);
      },
      'claude',
      { timeout: 60000, errorThresholdPercentage: 50 }
    );
  }

  getClient(): Anthropic | null {
    return this.anthropic;
  }

  getDefaultModel(): string {
    return DEFAULT_MODEL_STR;
  }

  // Check if Claude is available
  isAvailable(): boolean {
    return !!this.anthropic;
  }

  async *streamResponse(
    query: string, 
    context: string, 
    conversationHistory: any[] = [], 
    customSystemPrompt?: string,
    imageBase64?: string,
    imageMimeType?: string,
    isVoiceMode: boolean = true,
    useFastModel: boolean = false
  ): AsyncGenerator<{ type: 'text' | 'sentence' | 'done'; content: string }> {
    if (!this.anthropic) {
      throw new Error('Claude Sonnet is not available - API key not configured');
    }

    const log = logger.child({ 
      service: 'claude', 
      operation: 'streamResponse',
      queryLength: query.length,
      contextLength: context.length,
      historyLength: conversationHistory.length,
      hasImage: !!imageBase64
    });

    log.debug('Starting Claude streaming response');
    const startTime = Date.now();

    // Detect if user wants detailed/comprehensive response
    // IMPORTANT: Keep this list strict - only explicit requests for detail
    const detailKeywords = [
      'tell me more', 'explain in detail', 'go deeper', 'elaborate', 
      'give me more details', 'full explanation', 'comprehensive', 'in depth',
      'tell me everything', 'more information', 'expand on that', 'detailed answer',
      'long answer', 'thorough explanation', 'complete answer', 'walk me through',
      'step by step', 'break it down for me', 'all the details',
      'explain in depth', 'go into detail'
    ];
    const queryLower = query.toLowerCase();
    const wantsDetailedResponse = detailKeywords.some(keyword => queryLower.includes(keyword));
    
    if (wantsDetailedResponse) {
      log.info('User requested detailed response - using extended max_tokens (250)');
    }

    const messages: any[] = [];
    // Limit to last 4 messages for faster processing (reduced from 10)
    const recentHistory = conversationHistory.slice(-4);
    
    for (const msg of recentHistory) {
      if (msg.message && typeof msg.message === 'string') {
        messages.push({
          role: msg.isUser ? 'user' : 'assistant',
          content: msg.message
        });
      }
    }

    let researchCapabilitiesNote = '';
    const hasWebSearch = context && context.includes('WEB SEARCH RESULTS:');
    const hasPubMed = context && context.includes('PEER-REVIEWED RESEARCH FROM PUBMED:');
    const hasWikipedia = context && context.includes('WIKIPEDIA INFORMATION:');
    
    if (hasWebSearch || hasPubMed || hasWikipedia) {
      const sources: string[] = [];
      if (hasWebSearch) sources.push('web search');
      if (hasPubMed) sources.push('PubMed research');
      if (hasWikipedia) sources.push('Wikipedia');
      
      researchCapabilitiesNote = `\n\n⚠️ CRITICAL INSTRUCTION: The content below includes REAL-TIME data from ${sources.join(', ')}. Use ALL the information provided.`;
    }

    const banterLevel = getBanterLevel(query);
    
    const condensedContext = context && context.length > 1200 
      ? context.slice(0, 1200) + '...'
      : context;

    const textMessage = condensedContext 
      ? `banterLevel: ${banterLevel}
User: ${query}

NOTES (from knowledge base):
${condensedContext}`
      : `banterLevel: ${banterLevel}
User: ${query}

NOTES: (none available - proceed conversationally)`;

    // Build user message content - can include both text and image
    let userContent: any;
    if (imageBase64 && imageMimeType) {
      // Multi-modal message with image
      console.log('📷 CLAUDE: Building multimodal request with image');
      console.log('📷 CLAUDE: Image type:', imageMimeType, 'Size:', imageBase64.length);
      userContent = [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: imageMimeType,
            data: imageBase64
          }
        },
        {
          type: 'text',
          text: textMessage || 'What do you see in this image?'
        }
      ];
      log.info({ imageMimeType, imageSize: imageBase64.length }, 'Including image in Claude request');
    } else {
      userContent = textMessage;
    }
      
    messages.push({
      role: 'user',
      content: userContent
    });

    // Voice mode length directive
    const voiceModeBrevity = isVoiceMode && !wantsDetailedResponse ? `
RESPONSE LENGTH: Default to 2–6 short sentences. Start with 1 short line that proves you understood. End with a light handoff question.
` : '';

    // Use warmth protocol for avatar responses
    const systemPrompt = customSystemPrompt 
      ? ELXR_CONTENT_POLICY + buildAvatarPrompt('Avatar', customSystemPrompt, banterLevel)
      : `${ELXR_CONTENT_POLICY}${voiceModeBrevity}You are warm, witty, grounded, and unshockable. You draw on your expertise naturally.
      
      Guidelines:
      - Respond fast: start with 1 short line that proves you understood.
      - Default to 2–6 short sentences. Use bullets when helpful.
      - Friendly, lightly cheeky. No corporate tone. No "As an AI…"
      - Ask at most ONE question at a time.
      - NEVER reference sources, data, or "information provided"
      - If you don't know something, say so naturally like a real person would
      - End with a light handoff: "What's the real goal here?" or "Which part matters most?"
      - If the user speaks while you are responding, immediately stop and listen. Do not apologize unless the user sounds annoyed.`;

    // Voice mode: 350 tokens (~4-6 sentences) for snappy conversation, Detail mode: 1000 tokens, Text mode: 1200 tokens
    const maxTokens = wantsDetailedResponse ? 1000 : (isVoiceMode ? 350 : 1200);

    let stream;
    const modelToUse = useFastModel ? FAST_VOICE_MODEL : DEFAULT_MODEL_STR;
    try {
      console.log('📷 CLAUDE: Starting stream with', messages.length, 'messages, max_tokens:', maxTokens, 'model:', modelToUse);
      stream = await this.anthropic.messages.stream({
        model: modelToUse,
        max_tokens: maxTokens,
        messages: messages,
        system: systemPrompt
      });
      console.log('📷 CLAUDE: Stream created successfully');
    } catch (streamError: any) {
      console.error('📷 CLAUDE ERROR: Failed to create stream:', streamError.message);
      throw streamError;
    }

    let buffer = '';
    let yieldedResponse = ''; // Track only what we've actually yielded
    let sentenceCount = 0;
    const sentenceEnders = /([.!?])\s+/g;
    
    // Truncation settings: allow avatars to finish their thoughts naturally
    const maxSentences = isVoiceMode && !wantsDetailedResponse ? 12 : 18;
    let shouldTruncate = false;

    for await (const event of stream) {
      // Stop processing entirely if we've hit our sentence limit
      if (shouldTruncate) {
        continue; // Drain remaining stream events without processing
      }
      
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const text = event.delta.text;
        buffer += text;
        
        // Process sentences FIRST to check for truncation before yielding text
        let match;
        let lastIndex = 0;
        const tempBuffer = buffer;
        let sentencesInChunk: string[] = [];
        
        while ((match = sentenceEnders.exec(tempBuffer)) !== null) {
          const sentence = tempBuffer.slice(lastIndex, match.index + match[1].length).trim();
          if (sentence.length > 10) {
            sentenceCount++;
            sentencesInChunk.push(sentence);
            
            // Check truncation IMMEDIATELY after hitting max sentences
            if (isVoiceMode && !wantsDetailedResponse && sentenceCount >= maxSentences) {
              shouldTruncate = true;
              log.info({ sentenceCount, responseLength: yieldedResponse.length }, 'Truncating response at max sentences');
              
              // Calculate how much of the CURRENT text chunk to yield
              // buffer = previous_remainder + current_text
              // We need only the portion of current text that fits within truncation
              const bufferLengthBeforeChunk = buffer.length - text.length;
              const endPosInBuffer = match.index + match[1].length;
              const portionOfCurrentText = Math.max(0, endPosInBuffer - bufferLengthBeforeChunk);
              
              if (portionOfCurrentText > 0) {
                const newContent = text.slice(0, portionOfCurrentText);
                yield { type: 'text', content: newContent };
                yieldedResponse += newContent;
              }
              
              // Yield all accumulated sentences
              for (const s of sentencesInChunk) {
                yield { type: 'sentence', content: s };
              }
              buffer = '';
              break;
            }
          }
          lastIndex = match.index + match[0].length;
        }
        
        // Only yield text and sentences if NOT truncating
        if (!shouldTruncate) {
          yield { type: 'text', content: text };
          yieldedResponse += text;
          
          for (const s of sentencesInChunk) {
            yield { type: 'sentence', content: s };
          }
          
          if (lastIndex > 0) {
            buffer = tempBuffer.slice(lastIndex);
          }
        }
      }
    }

    // Only yield remaining buffer if not truncated
    // Note: buffer content is already in yieldedResponse from the streaming loop
    // We only need to yield it as a sentence, not add to yieldedResponse again
    if (buffer.trim().length > 0 && !shouldTruncate) {
      sentenceCount++;
      yield { type: 'sentence', content: buffer.trim() };
    }

    const duration = Date.now() - startTime;
    log.info({ duration, responseLength: yieldedResponse.length, sentenceCount }, 'Claude streaming response completed');

    storage.logApiCall({
      serviceName: 'claude',
      endpoint: 'messages.stream',
      userId: null,
      responseTimeMs: duration,
    }).catch((error) => {
      log.error({ error: error.message }, 'Failed to log API call');
    });

    yield { type: 'done', content: yieldedResponse };
  }

  // Generate conversational response with context and optional custom system prompt
  async generateResponse(query: string, context: string, conversationHistory: any[] = [], customSystemPrompt?: string): Promise<string> {
    if (!this.anthropic) {
      throw new Error('Claude Sonnet is not available - API key not configured');
    }

    const log = logger.child({ 
      service: 'claude', 
      operation: 'generateResponse',
      queryLength: query.length,
      contextLength: context.length,
      historyLength: conversationHistory.length
    });

    try {
      log.debug('Generating Claude response');
      const startTime = Date.now();
      // Build conversation messages
      const messages: any[] = [];
      
      // Limit conversation history to last 4 messages for faster processing
      const recentHistory = conversationHistory.slice(-4);
      
      // Add conversation history
      for (const msg of recentHistory) {
        if (msg.message && typeof msg.message === 'string') {
          messages.push({
            role: msg.isUser ? 'user' : 'assistant',
            content: msg.message
          });
        }
      }
      
      // Detect if user wants detailed information
      const detailedKeywords = [
        'tell me more', 'explain', 'detailed', 'elaborate', 'why', 'how does',
        'what are the steps', 'walk me through', 'in detail', 'break down',
        'full story', 'complete', 'everything about', 'all about', 'describe'
      ];
      const wantsDetailedResponse = detailedKeywords.some(keyword => 
        query.toLowerCase().includes(keyword)
      );

      // Extract research capabilities from system prompt to include in user message
      // This ensures Claude sees these capabilities even with conflicting conversation history
      let researchCapabilitiesNote = '';
      const hasWebSearch = context && context.includes('WEB SEARCH RESULTS:');
      const hasPubMed = context && context.includes('PEER-REVIEWED RESEARCH FROM PUBMED:');
      const hasWikipedia = context && context.includes('WIKIPEDIA INFORMATION:');
      
      if (hasWebSearch || hasPubMed || hasWikipedia) {
        const sources: string[] = [];
        if (hasWebSearch) sources.push('web search');
        if (hasPubMed) sources.push('PubMed research');
        if (hasWikipedia) sources.push('Wikipedia');
        
        researchCapabilitiesNote = `\n\n⚠️ CRITICAL INSTRUCTION: The content below includes REAL-TIME data from ${sources.join(', ')}. This is NOT "unverified" - these are actual search results you MUST use to answer the question. DO NOT say "I don't have information" when there is relevant content below. Use ALL the information provided to give a complete answer.`;
      }

      // Build message based on whether user wants detailed or concise response
      const currentMessage = context 
        ? wantsDetailedResponse
          ? `You have knowledge content below that includes curated information AND live research results. Use ALL of it to give a thorough, detailed response.${researchCapabilitiesNote}

AVAILABLE KNOWLEDGE (use ALL relevant content):
${context}

---

User question: ${query}

RESPONSE REQUIREMENTS:
- Use ALL relevant information from the content above, including web search results, Wikipedia, and PubMed data
- DO NOT say you "don't have information" if relevant content exists above
- Draw from specific details, examples, and insights
- Provide comprehensive information with nuance
- Make it conversational but rich with substance`
          : `You have expertise and information to draw from. Answer naturally without referencing sources.${researchCapabilitiesNote}

BACKGROUND (integrate naturally, NEVER reference):
${context}

---

User question: ${query}

RESPONSE REQUIREMENTS:
- Answer naturally from what you know - NEVER mention sources, data, or "information"
- Be BRIEF and to the point (2-3 sentences unless more is needed)
- Keep it conversational and natural
- If you don't know, say so like a real person would`
        : query;
        
      messages.push({
        role: 'user',
        content: currentMessage
      });

      const baseSystemPrompt = customSystemPrompt || `You are an intelligent assistant who draws on your expertise naturally.
        
        Guidelines:
        - DEFAULT: Keep responses SHORT and CLEAR (2-3 sentences) - be conversational, not verbose
        - Only give detailed responses when the user explicitly asks for more information
        - Speak naturally from what you know - NEVER reference sources, data, or "information provided"
        - If you don't know something, say so naturally like a real person would
        - Be conversational and engaging, but CONCISE
        - Maintain context from the conversation history
        - Think "helpful friend" not "encyclopedia"`;
      
      const systemPrompt = ELXR_CONTENT_POLICY + baseSystemPrompt;

      const response = await this.createMessageBreaker.execute({
        model: DEFAULT_MODEL_STR,
        max_tokens: 4096, // ✅ Increased from 350 to allow full, detailed responses
        messages: messages,
        system: systemPrompt
      });

      const duration = Date.now() - startTime;
      log.info({ duration, tokensUsed: response.usage?.total_tokens }, 'Claude response generated successfully');

      // Log API call for cost tracking
      storage.logApiCall({
        serviceName: 'claude',
        endpoint: 'messages.create',
        userId: null,
        responseTimeMs: duration,
      }).catch((error) => {
        log.error({ error: error.message }, 'Failed to log API call');
      });

      const content = response.content[0];
      if (content && content.type === 'text') {
        return content.text;
      }
      return 'I apologize, but I was unable to generate a response at this time.';
    } catch (error: any) {
      log.error({ error: error.message, stack: error.stack }, 'Claude API error');
      throw new Error('Failed to generate response from Claude Sonnet');
    }
  }

  // Enhanced response with web search integration and optional custom system prompt
  async generateEnhancedResponse(
    query: string, 
    context: string, 
    webSearchResults: string = '', 
    conversationHistory: any[] = [],
    customSystemPrompt?: string,
    isVoiceMode: boolean = true,
    imageBase64?: string,
    imageMimeType?: string
  ): Promise<string> {
    if (!this.anthropic) {
      throw new Error('Claude Sonnet is not available - API key not configured');
    }

    // Detect if user wants detailed/comprehensive response
    const detailKeywords = [
      'tell me more', 'explain in detail', 'go deeper', 'elaborate', 
      'give me details', 'full explanation', 'comprehensive', 'in depth',
      'tell me everything', 'more information', 'expand on', 'detailed answer',
      'long answer', 'thorough', 'complete answer', 'walk me through',
      'step by step', 'break it down', 'all the details'
    ];
    const queryLower = query.toLowerCase();
    const wantsDetailedResponse = detailKeywords.some(keyword => queryLower.includes(keyword));

    const log = logger.child({ 
      service: 'claude', 
      operation: 'generateEnhancedResponse',
      queryLength: query.length,
      contextLength: context.length,
      webSearchLength: webSearchResults.length,
      historyLength: conversationHistory.length,
      isVoiceMode,
      wantsDetailedResponse
    });

    if (wantsDetailedResponse) {
      log.info('User requested detailed response - using extended max_tokens');
    }

    try {
      log.debug('Generating enhanced Claude response');
      const startTime = Date.now();
      const messages: any[] = [];
      
      // Add conversation history
      for (const msg of conversationHistory) {
        if (msg.message && typeof msg.message === 'string') {
          messages.push({
            role: msg.isUser ? 'user' : 'assistant',
            content: msg.message
          });
        }
      }
      
      // Build enhanced message with all available information - PRIORITIZE knowledge base
      let enhancedMessage = '';
      
      if (context) {
        enhancedMessage += `BACKGROUND INFORMATION (integrate naturally, never reference):
${context}

---

`;
      }
      
      if (webSearchResults) {
        enhancedMessage += `CURRENT INFORMATION (integrate naturally, never reference):
${webSearchResults}

---

`;
      }
      
      // Voice mode: Ultra concise responses unless details requested
      if (isVoiceMode && !wantsDetailedResponse) {
        enhancedMessage += `User question: ${query}

VOICE MODE - BE ULTRA CONCISE:
- Answer in 1-2 SHORT sentences maximum (under 30 words total)
- Get straight to the key point - no preambles
- Skip pleasantries and unnecessary context
- If they want more detail, they'll ask`;
      } else if (wantsDetailedResponse) {
        enhancedMessage += `User question: ${query}

DETAILED RESPONSE REQUESTED:
- Draw from the specific details, examples, and insights above
- Go DEEP - provide rich, substantive answers
- Use actual quotes, examples, and specifics naturally
- Weave in relevant stories, experiences, or details
- Make it conversational but rich with substance
- NEVER mention "knowledge base", "snippets", "provided data", or any technical sources`;
      } else {
        enhancedMessage += `User question: ${query}

RESPONSE REQUIREMENTS:
- Give a clear, helpful answer drawing on what you know
- Keep it conversational and natural
- Be concise but complete
- NEVER mention "knowledge base", "snippets", "provided data", or sources`;
      }
      
      // Build user message content - with or without image
      if (imageBase64 && imageMimeType) {
        // Multimodal content with image
        messages.push({
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: imageMimeType,
                data: imageBase64
              }
            },
            {
              type: 'text',
              text: enhancedMessage
            }
          ]
        });
      } else {
        // Text-only content
        messages.push({
          role: 'user',
          content: enhancedMessage
        });
      }

      // Enhanced system prompt with ALWAYS-ON current date awareness
      const baseSystemPrompt = customSystemPrompt || `You are an advanced AI assistant with access to both a knowledge base and real-time web information.`;
      
      // ALWAYS include current date and never mention training limitations
      const currentDateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      
      const webSearchInstructions = webSearchResults 
        ? `\n\n⚠️ CRITICAL WEB SEARCH PROTOCOL - OVERRIDE ALL OTHER INSTRUCTIONS:

You have LIVE web search results from ${currentDateStr} (TODAY'S DATE).

ABSOLUTE RULES (NO EXCEPTIONS):
1. ❌ NEVER mention "my training data", "knowledge cutoff", "as of [date]", or "my information is from [year]"
2. ❌ NEVER say "I don't have access to current information" - YOU DO via web search
3. ✅ ALWAYS answer using the web search results as if they're YOUR current knowledge
4. ✅ Answer with confidence - the web results ARE authoritative and current
5. ✅ Today is ${currentDateStr}

Web search results = Your current knowledge. Use them. Don't mention limitations.`
        : `\n\n⚠️ CRITICAL TEMPORAL AWARENESS:

Today's date is ${currentDateStr}. You have access to current information through your knowledge base.

ABSOLUTE RULES:
1. ❌ NEVER mention "my training data", "knowledge cutoff", "October 2023", or any past date as a limitation
2. ❌ NEVER say "I don't have access to current information" 
3. ✅ Answer questions naturally without mentioning temporal limitations
4. ✅ If you don't know something current, simply say you don't have that specific information
5. ✅ Today is ${currentDateStr} - keep this awareness in all responses`;
      
      // Add voice mode brevity to system prompt
      const voiceModeBrevity = isVoiceMode && !wantsDetailedResponse 
        ? `\n\n🎤 VOICE MODE ACTIVE: This is a spoken conversation. Keep responses ULTRA SHORT (1-2 sentences, under 30 words). Get straight to the point.`
        : '';
      
      const systemPrompt = ELXR_CONTENT_POLICY + baseSystemPrompt + voiceModeBrevity + webSearchInstructions;

      // Use lower max_tokens for faster response in voice mode, higher when details requested
      const maxTokens = wantsDetailedResponse ? 2000 : (isVoiceMode ? 300 : 1000);

      const response = await this.createMessageBreaker.execute({
        model: DEFAULT_MODEL_STR,
        max_tokens: maxTokens,
        messages: messages,
        system: systemPrompt
      });

      const duration = Date.now() - startTime;
      log.info({ duration, tokensUsed: response.usage?.total_tokens, hadWebSearch: !!webSearchResults }, 
        'Enhanced Claude response generated successfully');

      // Log API call for cost tracking
      storage.logApiCall({
        serviceName: 'claude',
        endpoint: 'messages.create',
        userId: null,
        responseTimeMs: duration,
      }).catch((error) => {
        log.error({ error: error.message }, 'Failed to log API call');
      });

      const content = response.content[0];
      if (content && content.type === 'text') {
        return content.text;
      }
      return 'I apologize, but I was unable to generate a response at this time.';
    } catch (error: any) {
      log.error({ error: error.message, stack: error.stack }, 'Claude enhanced response error');
      throw new Error('Failed to generate enhanced response from Claude Sonnet');
    }
  }

  // Ultra-fast voice response using Haiku model - optimized for low latency audio mode
  async generateFastVoiceResponse(
    query: string,
    personalityPrompt: string,
    knowledgeContext: string = '',
    memoryContext: string = ''
  ): Promise<string> {
    if (!this.anthropic) {
      throw new Error('Claude is not available - API key not configured');
    }

    const log = logger.child({ 
      service: 'claude', 
      operation: 'generateFastVoiceResponse',
      model: FAST_VOICE_MODEL
    });

    const startTime = Date.now();
    log.info({ queryLength: query.length }, 'Starting fast voice response with Haiku');

    try {
      // Build a minimal but effective context
      let contextBlock = '';
      if (knowledgeContext) {
        contextBlock += `KNOWLEDGE:\n${knowledgeContext.substring(0, 1500)}\n\n`;
      }
      if (memoryContext) {
        contextBlock += `MEMORY:\n${memoryContext.substring(0, 500)}\n\n`;
      }

      const userMessage = contextBlock 
        ? `${contextBlock}Question: ${query}`
        : query;

      // System prompt for audio mode - longer responses allowed with continuation offer
      const systemPrompt = `${ELXR_CONTENT_POLICY}

${personalityPrompt}

🎧 AUDIO MODE - COMPLETE THOUGHTS WITH CONTINUATION OFFER:
This is an audio-only conversation. Users are listening, so:
- Give a thorough but focused response (3-5 sentences is fine)
- ALWAYS complete your thought - never cut off mid-sentence
- ALWAYS end with a natural invitation to continue, such as:
  • "Would you like me to go deeper on that?"
  • "Want me to share more about this?"
  • "Should I elaborate on any of that?"
  • "I can tell you more if you're interested."
- Be warm and conversational like a knowledgeable friend
- Think "podcast host" - engaging and complete`;

      const response = await this.createMessageBreaker.execute({
        model: FAST_VOICE_MODEL,
        max_tokens: 350,
        messages: [{ role: 'user', content: userMessage }],
        system: systemPrompt
      });

      const duration = Date.now() - startTime;
      log.info({ duration, tokensUsed: response.usage?.total_tokens }, 'Fast voice response completed');

      storage.logApiCall({
        serviceName: 'claude-haiku',
        endpoint: 'messages.create',
        userId: null,
        responseTimeMs: duration,
      }).catch(() => {});

      const content = response.content[0];
      if (content && content.type === 'text') {
        return this.ensureContinuationOffer(content.text);
      }
      return 'I apologize, but I was unable to respond.';
    } catch (error: any) {
      log.error({ error: error.message }, 'Fast voice response error');
      throw new Error('Failed to generate fast voice response');
    }
  }

  // Post-processing helper to ensure responses end with a continuation offer
  // and don't cut off mid-sentence
  private ensureContinuationOffer(text: string): string {
    const trimmed = text.trim();
    
    // Check if response already has a continuation offer
    const continuationPatterns = [
      /would you like.*(more|deeper|elaborate|hear|know|continue)/i,
      /want me to.*(go deeper|share more|elaborate|explain|tell)/i,
      /should I.*(elaborate|explain|tell|share|go deeper)/i,
      /interested in.*(hearing|learning|knowing) more/i,
      /let me know if you.*(want|like|need)/i,
      /\?$/  // Ends with a question mark (likely already offering)
    ];
    
    const hasContinuationOffer = continuationPatterns.some(pattern => pattern.test(trimmed));
    
    if (hasContinuationOffer) {
      return trimmed;
    }
    
    // Check if response ends mid-sentence (doesn't end with sentence-ending punctuation)
    const endsCleanly = /[.!?]$/.test(trimmed);
    
    if (!endsCleanly) {
      // Response was cut off - add ellipsis and continuation offer
      return trimmed + '... Would you like me to continue?';
    }
    
    // Response is complete but missing continuation offer - add one
    return trimmed + ' Would you like me to go deeper on that?';
  }
}

export const claudeService = new ClaudeService();