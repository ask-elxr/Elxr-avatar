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
  private thinkingSoundCache: Map<string, { audio: string; timestamp: number }> = new Map(); // voiceId -> { audio, timestamp }
  private readonly THINKING_CACHE_MAX_SIZE = 20; // Max number of thinking sounds to cache
  private readonly THINKING_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes TTL

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
    languageCode?: string,
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
      languageCode,
    });

    try {
      log.debug("Generating speech with ElevenLabs");
      const startTime = Date.now();

      // Use multilingual model for non-English languages, otherwise use fast flash model
      const isNonEnglish = languageCode && !languageCode.startsWith('en');
      const modelId = isNonEnglish ? "eleven_multilingual_v2" : "eleven_flash_v2_5";
      
      const options: any = {
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.7, // Increased for warmer, smoother voice (less harsh)
          similarity_boost: 0.65, // Slightly reduced for softer tone
          style: 0.0,
          use_speaker_boost: true,
        },
      };

      // Add language code if specified (for multilingual models)
      if (languageCode) {
        options.language_code = languageCode.split('-')[0]; // Use just "es" not "es-ES"
      }
      
      log.debug({ modelId, isNonEnglish, languageCode }, "Selected TTS model based on language");

      const audioStream = await this.ttsBreaker.execute({
        voiceId,
        options,
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

  /**
   * Generate PCM 24kHz 16-bit audio for HeyGen lip-sync
   * HeyGen's Audio-to-Video API requires this specific format
   */
  async generateSpeechPCM(
    text: string,
    voiceId: string = "21m00Tcm4TlvDq8ikWAM",
    languageCode?: string,
  ): Promise<Buffer> {
    if (!this.client) {
      throw new Error(
        "ElevenLabs client not initialized - check ELEVENLABS_API_KEY",
      );
    }

    const log = logger.child({
      service: "elevenlabs",
      operation: "generateSpeechPCM",
      textLength: text.length,
      voiceId,
      languageCode,
    });

    try {
      log.debug("Generating PCM speech with ElevenLabs for HeyGen lip-sync");
      const startTime = Date.now();

      // Use multilingual model for non-English languages
      const isNonEnglish = languageCode && !languageCode.startsWith('en');
      const modelId = isNonEnglish ? "eleven_multilingual_v2" : "eleven_turbo_v2_5";
      
      log.debug({ modelId, isNonEnglish, languageCode }, "Selected TTS model for PCM generation");
      
      // Use direct API call to specify PCM output format
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=pcm_24000`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": this.apiKey,
          },
          body: JSON.stringify({
            text,
            model_id: modelId,
            voice_settings: {
              stability: 0.7,
              similarity_boost: 0.65,
              style: 0.0,
              use_speaker_boost: true,
            },
            ...(languageCode && { language_code: languageCode.split('-')[0] }),
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = Buffer.from(arrayBuffer);

      const duration = Date.now() - startTime;
      log.info(
        { duration, audioSize: audioBuffer.length, format: "pcm_24000" },
        "PCM speech generated successfully for HeyGen",
      );
      metrics.recordElevenLabsTTS(duration);

      return audioBuffer;
    } catch (error: any) {
      log.error(
        { error: error.message, stack: error.stack },
        "Error generating PCM speech with ElevenLabs",
      );
      throw error;
    }
  }

  /**
   * Generate PCM 24kHz audio as base64 for LiveAvatar SDK's repeatAudio()
   * Uses /with-timestamps endpoint which returns audio_base64 directly
   * This is the exact format required by LiveAvatar SDK for lip-sync
   */
  async generateSpeechBase64(
    text: string,
    voiceId: string = "21m00Tcm4TlvDq8ikWAM",
    languageCode?: string,
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error(
        "ElevenLabs API key not configured - check ELEVENLABS_API_KEY",
      );
    }

    const log = logger.child({
      service: "elevenlabs",
      operation: "generateSpeechBase64",
      textLength: text.length,
      voiceId,
      languageCode,
    });

    try {
      log.debug("Generating base64 PCM speech for LiveAvatar SDK");
      const startTime = Date.now();

      // Check if text contains SSML tags to enable SSML parsing
      const containsSSML = text.includes('<break') || text.includes('<speak');
      
      // Use multilingual model for non-English languages
      const isNonEnglish = languageCode && !languageCode.startsWith('en');
      const modelId = isNonEnglish ? "eleven_multilingual_v2" : "eleven_turbo_v2_5";
      
      log.debug({ modelId, isNonEnglish, languageCode }, "Selected TTS model for base64 generation");
      
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=pcm_24000`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": this.apiKey,
          },
          body: JSON.stringify({
            text,
            model_id: modelId,
            voice_settings: {
              stability: 0.7,
              similarity_boost: 0.65,
              style: 0.0,
              use_speaker_boost: true,
            },
            ...(languageCode && { language_code: languageCode.split('-')[0] }),
            ...(containsSSML && { enable_ssml: true }),
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const audioBase64 = data.audio_base64;

      if (!audioBase64) {
        throw new Error("ElevenLabs API did not return audio_base64");
      }

      const duration = Date.now() - startTime;
      log.info(
        { duration, audioLength: audioBase64.length, format: "pcm_24000_base64" },
        "Base64 PCM speech generated for LiveAvatar",
      );
      metrics.recordElevenLabsTTS(duration);

      storage
        .logApiCall({
          serviceName: "elevenlabs",
          endpoint: "textToSpeech/with-timestamps",
          userId: null,
          responseTimeMs: duration,
        })
        .catch((error) => {
          log.error({ error: error.message }, "Failed to log API call");
        });

      return audioBase64;
    } catch (error: any) {
      log.error(
        { error: error.message, stack: error.stack },
        "Error generating base64 speech with ElevenLabs",
      );
      throw error;
    }
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
              stability: 0.7, // Increased for warmer, smoother voice (less harsh)
              similarity_boost: 0.65, // Slightly reduced for softer tone
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

  /**
   * Transcribe audio to text using ElevenLabs Speech-to-Text API (Scribe v1)
   * This is used as a fallback for mobile browsers that don't support Web Speech API
   * @param audioBuffer - Audio data as Buffer (supports various formats: mp3, wav, webm, mp4, etc.)
   * @param mimeType - MIME type of the audio (e.g., 'audio/webm', 'audio/mp4')
   * @param languageCode - Optional ISO 639-1 language code (e.g., 'en', 'es')
   * @param userId - Optional user ID for logging
   * @returns Transcribed text
   */
  async transcribeSpeech(
    audioBuffer: Buffer,
    mimeType: string = 'audio/webm',
    languageCode?: string,
    userId?: string,
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error(
        "ElevenLabs API key not configured - check ELEVENLABS_API_KEY",
      );
    }

    const log = logger.child({
      service: "elevenlabs",
      operation: "transcribeSpeech",
      audioSize: audioBuffer.length,
      mimeType,
      languageCode,
      userId,
    });

    try {
      log.debug("Transcribing audio with ElevenLabs STT");
      const startTime = Date.now();

      // Normalize MIME type by removing codec suffix (e.g., 'audio/mp4;codecs=mp4a.40.2' -> 'audio/mp4')
      const baseMimeType = mimeType.split(';')[0].trim().toLowerCase();
      
      // Determine file extension from base MIME type
      const extensionMap: Record<string, string> = {
        'audio/webm': 'webm',
        'audio/mp4': 'm4a',
        'audio/mpeg': 'mp3',
        'audio/wav': 'wav',
        'audio/ogg': 'ogg',
        'audio/x-m4a': 'm4a',
        'audio/aac': 'aac',
      };
      const extension = extensionMap[baseMimeType] || 'webm';
      const filename = `audio.${extension}`;
      
      log.debug({ originalMimeType: mimeType, baseMimeType, extension }, "Normalized MIME type");

      // Create form data with the audio file
      const formData = new FormData();
      
      // Create a Blob from the buffer for FormData with correct MIME type
      const audioBlob = new Blob([audioBuffer], { type: mimeType });
      formData.append('file', audioBlob, filename);
      formData.append('model_id', 'scribe_v1');
      
      if (languageCode) {
        formData.append('language_code', languageCode);
      }

      const response = await fetch(
        'https://api.elevenlabs.io/v1/speech-to-text',
        {
          method: 'POST',
          headers: {
            'xi-api-key': this.apiKey,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs STT API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const transcribedText = data.text || '';

      const duration = Date.now() - startTime;
      log.info(
        { duration, textLength: transcribedText.length, filename },
        "Audio transcribed successfully",
      );
      
      // Record metrics
      metrics.recordElevenLabsTTS(duration); // Reuse TTS metric for now

      // Log API call for cost tracking
      storage
        .logApiCall({
          serviceName: "elevenlabs",
          endpoint: "speech-to-text",
          userId: userId || null,
          responseTimeMs: duration,
        })
        .catch((error) => {
          log.error({ error: error.message }, "Failed to log API call");
        });

      return transcribedText;
    } catch (error: any) {
      log.error(
        { error: error.message, stack: error.stack },
        "Error transcribing audio with ElevenLabs",
      );
      throw error;
    }
  }

  /**
   * Check if STT is available (requires API key)
   */
  isSTTAvailable(): boolean {
    return !!this.apiKey;
  }

  /**
   * Generate and cache a soft "thinking" sound for masking initial latency
   * Uses a short, natural phrase that sounds like the avatar is processing
   */
  async getThinkingSound(voiceId: string, languageCode?: string): Promise<string | null> {
    if (!this.apiKey) return null;

    // Check cache first with TTL validation
    const cacheKey = `${voiceId}_${languageCode || 'en'}`;
    const cached = this.thinkingSoundCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.THINKING_CACHE_TTL_MS) {
      return cached.audio;
    }
    // Remove stale entry if exists
    if (cached) {
      this.thinkingSoundCache.delete(cacheKey);
    }

    const log = logger.child({
      service: "elevenlabs",
      operation: "getThinkingSound",
      voiceId,
      languageCode,
    });

    try {
      // Short, natural thinking sounds - SSML for natural delivery
      const thinkingPhrases = [
        "Hmm...",
        "Let me see...",
        "Mmm...",
      ];
      const phrase = thinkingPhrases[Math.floor(Math.random() * thinkingPhrases.length)];
      
      // Use multilingual model for non-English languages
      const isNonEnglish = languageCode && !languageCode.startsWith('en');
      const modelId = isNonEnglish ? "eleven_multilingual_v2" : "eleven_turbo_v2_5";
      
      log.debug({ phrase, modelId, isNonEnglish }, "Generating thinking sound");
      const startTime = Date.now();

      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=pcm_24000`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": this.apiKey,
          },
          body: JSON.stringify({
            text: `<speak><prosody rate="slow">${phrase}</prosody></speak>`,
            model_id: modelId,
            voice_settings: {
              stability: 0.8,
              similarity_boost: 0.6,
              style: 0.0,
              use_speaker_boost: true,
            },
            ...(languageCode && { language_code: languageCode.split('-')[0] }),
          }),
        }
      );

      if (!response.ok) {
        // Fallback to non-SSML if SSML fails
        const fallbackResponse = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=pcm_24000`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "xi-api-key": this.apiKey,
            },
            body: JSON.stringify({
              text: phrase,
              model_id: modelId,
              voice_settings: {
                stability: 0.8,
                similarity_boost: 0.6,
                style: 0.0,
                use_speaker_boost: true,
              },
              ...(languageCode && { language_code: languageCode.split('-')[0] }),
            }),
          }
        );

        if (!fallbackResponse.ok) {
          throw new Error(`ElevenLabs API error: ${fallbackResponse.status}`);
        }

        const fallbackData = await fallbackResponse.json();
        const audioBase64 = fallbackData.audio_base64;
        if (audioBase64) {
          this.evictThinkingCacheIfNeeded();
          this.thinkingSoundCache.set(cacheKey, { audio: audioBase64, timestamp: Date.now() });
          log.info({ duration: Date.now() - startTime }, "Thinking sound generated (fallback)");
          return audioBase64;
        }
        return null;
      }

      const data = await response.json();
      const audioBase64 = data.audio_base64;

      if (!audioBase64) {
        throw new Error("ElevenLabs API did not return audio_base64");
      }

      // Cache for reuse with TTL and size limit
      this.evictThinkingCacheIfNeeded();
      this.thinkingSoundCache.set(cacheKey, { audio: audioBase64, timestamp: Date.now() });

      const duration = Date.now() - startTime;
      log.info({ duration, audioLength: audioBase64.length }, "Thinking sound generated and cached");

      return audioBase64;
    } catch (error: any) {
      log.error({ error: error.message }, "Error generating thinking sound");
      return null;
    }
  }

  /**
   * Pre-cache thinking sound for a voice
   */
  async preCacheThinkingSound(voiceId: string, languageCode?: string): Promise<void> {
    await this.getThinkingSound(voiceId, languageCode);
  }

  /**
   * Check if thinking sound is cached for a voice (with TTL check)
   */
  hasThinkingSoundFor(voiceId: string, languageCode?: string): boolean {
    const cacheKey = `${voiceId}_${languageCode || 'en'}`;
    const cached = this.thinkingSoundCache.get(cacheKey);
    return !!cached && (Date.now() - cached.timestamp) < this.THINKING_CACHE_TTL_MS;
  }

  /**
   * Evict old entries if cache exceeds max size
   */
  private evictThinkingCacheIfNeeded(): void {
    if (this.thinkingSoundCache.size < this.THINKING_CACHE_MAX_SIZE) {
      return;
    }

    // Find and remove oldest entry
    let oldestKey: string | null = null;
    let oldestTime = Date.now();
    
    for (const [key, value] of this.thinkingSoundCache.entries()) {
      if (value.timestamp < oldestTime) {
        oldestTime = value.timestamp;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.thinkingSoundCache.delete(oldestKey);
      logger.debug({ 
        service: "elevenlabs", 
        operation: "evictThinkingCache",
        evictedKey: oldestKey 
      }, "Evicted oldest thinking sound from cache");
    }
  }

  async *streamSpeechPCM(
    text: string,
    voiceId: string = "21m00Tcm4TlvDq8ikWAM",
    languageCode?: string,
    signal?: AbortSignal,
  ): AsyncGenerator<Buffer> {
    if (!this.apiKey) {
      throw new Error("ElevenLabs API key not configured");
    }

    const log = logger.child({
      service: "elevenlabs",
      operation: "streamSpeechPCM",
      textLength: text.length,
      voiceId,
    });

    const isNonEnglish = languageCode && !languageCode.startsWith('en');
    const modelId = isNonEnglish ? "eleven_multilingual_v2" : "eleven_flash_v2_5";

    log.debug({ modelId }, "Starting streaming PCM TTS");
    const startTime = Date.now();

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=pcm_24000`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": this.apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: {
            stability: 0.7,
            similarity_boost: 0.65,
            style: 0.0,
            use_speaker_boost: true,
          },
          ...(languageCode && { language_code: languageCode.split('-')[0] }),
        }),
        signal,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs streaming TTS error: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error("No response body from ElevenLabs streaming TTS");
    }

    let totalBytes = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        if (signal?.aborted) break;
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        totalBytes += chunk.length;
        yield chunk;
      }
    } finally {
      reader.releaseLock();
    }

    const duration = Date.now() - startTime;
    log.info({ duration, totalBytes, format: "pcm_24000" }, "Streaming PCM TTS completed");
    metrics.recordElevenLabsTTS(duration);
  }
}

export const elevenlabsService = new ElevenLabsService();
