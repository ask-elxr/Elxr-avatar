import { ElevenLabsClient } from "elevenlabs";
import { wrapServiceCall } from "./circuitBreaker.js";
import { logger } from "./logger.js";
import { metrics } from "./metrics.js";
import { storage } from "./storage.js";
import { getAvatarPhrases } from "./config/lineLibrary.js";

const DEFAULT_ACKNOWLEDGMENT_PHRASES = [
  "Let me think about that...",
  "Good question, give me a moment...",
  "Hmm, let me consider that...",
  "Interesting, let me look into that...",
  "Give me a moment...",
];

class ElevenLabsService {
  private client?: ElevenLabsClient;
  private apiKey: string;
  private ttsBreaker: any;
  private acknowledgmentCache: Map<string, Buffer[]> = new Map();
  private avatarPhraseCache: Map<string, string[]> = new Map();

  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY || "";
    if (!this.apiKey) {
      logger.warn(
        { service: "elevenlabs" },
        "ELEVENLABS_API_KEY not found - TTS features will be disabled",
      );
      return;
    }

    this.client = new ElevenLabsClient({
      apiKey: this.apiKey,
    });

    this.ttsBreaker = wrapServiceCall(
      async (params: any) => {
        if (!this.client) {
          throw new Error("ElevenLabs client not initialized");
        }
        return await this.client.textToSpeech.convert(
          params.voiceId,
          params.options,
        );
      },
      "elevenlabs-tts",
      { timeout: 30000, errorThresholdPercentage: 50 },
    );
  }

  async generateSpeech(
    text: string,
    voiceId: string = "21m00Tcm4TlvDq8ikWAM",
  ): Promise<Buffer> {
    if (!this.client) {
      throw new Error(
        "ElevenLabs client not initialized - check ELEVENLABS_API_KEY",
      );
    }

    const log = logger.child({
      service: "elevenlabs",
      operation: "generateSpeech",
      textLength: text.length,
      voiceId,
    });

    try {
      log.debug("Generating speech with ElevenLabs");
      const startTime = Date.now();

      const audioStream = await this.ttsBreaker.execute({
        voiceId,
        options: {
          text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        },
      });

      // Convert stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        chunks.push(Buffer.from(chunk));
      }
      const audioBuffer = Buffer.concat(chunks);

      const duration = Date.now() - startTime;
      log.info(
        { duration, audioSize: audioBuffer.length },
        "Speech generated successfully",
      );
      metrics.recordElevenLabsTTS(duration);

      // Log API call for cost tracking
      storage
        .logApiCall({
          serviceName: "elevenlabs",
          endpoint: "textToSpeech.convert",
          userId: null,
          responseTimeMs: duration,
        })
        .catch((error) => {
          log.error({ error: error.message }, "Failed to log API call");
        });

      return audioBuffer;
    } catch (error: any) {
      log.error(
        { error: error.message, stack: error.stack },
        "Error generating speech with ElevenLabs",
      );
      throw error;
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey && !!this.client;
  }

  async preCacheAcknowledgments(voiceId: string, avatarId?: string): Promise<void> {
    if (!this.client) return;
    
    const cacheKey = avatarId ? `${voiceId}_${avatarId}` : voiceId;
    
    if (this.acknowledgmentCache.has(cacheKey)) {
      logger.debug({ voiceId, avatarId }, "Acknowledgments already cached for voice/avatar");
      return;
    }

    const log = logger.child({
      service: "elevenlabs",
      operation: "preCacheAcknowledgments",
      voiceId,
      avatarId,
    });

    try {
      log.info("Pre-caching acknowledgment phrases for voice");
      const startTime = Date.now();
      const cachedBuffers: Buffer[] = [];

      // Get avatar-specific phrases or use defaults
      const phrases = avatarId 
        ? getAvatarPhrases(avatarId) 
        : DEFAULT_ACKNOWLEDGMENT_PHRASES;
      
      // Cache which phrases we're using for this avatar
      if (avatarId) {
        this.avatarPhraseCache.set(avatarId, phrases);
      }

      for (const phrase of phrases) {
        try {
          const audioStream = await this.client.textToSpeech.convert(voiceId, {
            text: phrase,
            model_id: "eleven_turbo_v2_5",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              style: 0.0,
              use_speaker_boost: true,
            },
          });

          const chunks: Buffer[] = [];
          for await (const chunk of audioStream) {
            chunks.push(Buffer.from(chunk));
          }
          cachedBuffers.push(Buffer.concat(chunks));
        } catch (phraseError) {
          log.warn({ phrase, error: phraseError }, "Failed to cache phrase");
        }
      }

      this.acknowledgmentCache.set(cacheKey, cachedBuffers);
      const duration = Date.now() - startTime;
      log.info({ duration, phraseCount: cachedBuffers.length, avatarId }, "Acknowledgments cached");
    } catch (error: any) {
      log.error({ error: error.message }, "Failed to pre-cache acknowledgments");
    }
  }

  getCachedAcknowledgment(voiceId: string, avatarId?: string): Buffer | null {
    // Try avatar-specific cache first, then fall back to voice-only cache
    const cacheKey = avatarId ? `${voiceId}_${avatarId}` : voiceId;
    let cached = this.acknowledgmentCache.get(cacheKey);
    
    // Fall back to voice-only cache if avatar-specific not found
    if (!cached && avatarId) {
      cached = this.acknowledgmentCache.get(voiceId);
    }
    
    if (!cached || cached.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * cached.length);
    return cached[randomIndex];
  }

  hasAcknowledgmentsFor(voiceId: string, avatarId?: string): boolean {
    const cacheKey = avatarId ? `${voiceId}_${avatarId}` : voiceId;
    const hasAvatarCache = this.acknowledgmentCache.has(cacheKey) && 
           (this.acknowledgmentCache.get(cacheKey)?.length ?? 0) > 0;
    
    // Also check voice-only cache as fallback
    if (!hasAvatarCache && avatarId) {
      return this.acknowledgmentCache.has(voiceId) && 
             (this.acknowledgmentCache.get(voiceId)?.length ?? 0) > 0;
    }
    
    return hasAvatarCache;
  }
}

export const elevenlabsService = new ElevenLabsService();
