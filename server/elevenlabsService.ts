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
    languageCode?: string,
  ): Promise<Buffer> {
    if (!this.client) {
      throw new Error(
        "ElevenLabs client not initialized - check ELEVENLABS_API_KEY",
      );
    }

    // Normalize language code - ElevenLabs eleven_turbo_v2_5 only accepts ISO 639-1 codes (e.g., 'en', 'es')
    // Convert 'en-US', 'en-GB', etc. to 'en'
    const normalizedLanguageCode = languageCode 
      ? languageCode.split('-')[0].toLowerCase() 
      : undefined;

    const log = logger.child({
      service: "elevenlabs",
      operation: "generateSpeech",
      textLength: text.length,
      voiceId,
      languageCode: normalizedLanguageCode,
    });

    try {
      log.debug("Generating speech with ElevenLabs");
      const startTime = Date.now();

      const options: any = {
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.7, // Increased for warmer, smoother voice (less harsh)
          similarity_boost: 0.65, // Slightly reduced for softer tone
          style: 0.0,
          use_speaker_boost: true,
        },
      };

      // Add language code if specified (for multilingual models)
      if (normalizedLanguageCode) {
        options.language_code = normalizedLanguageCode;
      }

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

    // Normalize language code - ElevenLabs eleven_turbo_v2_5 only accepts ISO 639-1 codes (e.g., 'en', 'es')
    // Convert 'en-US', 'en-GB', etc. to 'en'
    const normalizedLanguageCode = languageCode 
      ? languageCode.split('-')[0].toLowerCase() 
      : undefined;

    const log = logger.child({
      service: "elevenlabs",
      operation: "generateSpeechPCM",
      textLength: text.length,
      voiceId,
      languageCode: normalizedLanguageCode,
    });

    try {
      log.debug("Generating PCM speech with ElevenLabs for HeyGen lip-sync");
      const startTime = Date.now();

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
            model_id: "eleven_turbo_v2_5",
            voice_settings: {
              stability: 0.7,
              similarity_boost: 0.65,
              style: 0.0,
              use_speaker_boost: true,
            },
            ...(normalizedLanguageCode && { language_code: normalizedLanguageCode }),
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
   * Helper to create WAV headers for PCM data
   * HeyGen repeatAudio() needs WAV format to play audio as single continuous clip
   */
  private createWavBuffer(pcmData: Buffer, sampleRate: number = 24000, channels: number = 1, bitsPerSample: number = 16): Buffer {
    const dataSize = pcmData.length;
    const headerSize = 44;
    const fileSize = headerSize + dataSize - 8;
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);
    
    const header = Buffer.alloc(headerSize);
    
    // RIFF header
    header.write('RIFF', 0);
    header.writeUInt32LE(fileSize, 4);
    header.write('WAVE', 8);
    
    // fmt subchunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    header.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    
    // data subchunk
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);
    
    return Buffer.concat([header, pcmData]);
  }

  /**
   * Convert plain text to SSML with short inter-sentence pauses
   * ElevenLabs inserts automatic silence after punctuation (., !, ?)
   * We replace punctuation+whitespace with punctuation+SSML break (70ms)
   * This gives smooth, continuous speech with natural short pauses
   */
  private textToSSML(text: string): string {
    // Replace punctuation followed by space/newline with punctuation + short SSML break
    // Using 70ms break for natural flow without long pauses
    const ssmlText = text
      .replace(/\.[\s\n]+/g, '.<break time="70ms"/>')   // Period + space/newline
      .replace(/![\s\n]+/g, '!<break time="70ms"/>')    // Exclamation + space/newline
      .replace(/\?[\s\n]+/g, '?<break time="70ms"/>');  // Question mark + space/newline
    
    return `<speak>${ssmlText}</speak>`;
  }

  /**
   * Generate WAV audio as base64 for LiveAvatar SDK's repeatAudio()
   * Makes a SINGLE TTS call for the FULL text - no sentence splitting
   * Uses SSML to reduce inter-sentence pauses for natural speech flow
   * Returns WAV format (24kHz, mono, 16-bit) with proper header
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

    const normalizedLanguageCode = languageCode 
      ? languageCode.split('-')[0].toLowerCase() 
      : undefined;

    const log = logger.child({
      service: "elevenlabs",
      operation: "generateSpeechBase64",
      textLength: text.length,
      voiceId,
      languageCode: normalizedLanguageCode,
    });

    try {
      const startTime = Date.now();
      
      // Convert to SSML with reduced inter-sentence breaks
      const ssmlText = this.textToSSML(text);
      log.debug({ ssmlLength: ssmlText.length }, "Generating SINGLE TTS call with SSML (reduced sentence pauses)");

      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=pcm_24000`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": this.apiKey,
          },
          body: JSON.stringify({
            text: ssmlText,
            model_id: "eleven_turbo_v2_5",
            voice_settings: {
              stability: 0.7,
              similarity_boost: 0.65,
              style: 0.0,
              use_speaker_boost: true,
            },
            use_ssml: true,
            ...(normalizedLanguageCode && { language_code: normalizedLanguageCode }),
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const pcmBuffer = Buffer.from(arrayBuffer);
      
      // Wrap PCM in WAV container so HeyGen SDK understands the audio format
      // WAV header contains sample rate (24kHz), bit depth (16-bit), channels (mono)
      const wavBuffer = this.createWavBuffer(pcmBuffer, 24000, 1, 16);
      const audioBase64 = wavBuffer.toString('base64');

      const duration = Date.now() - startTime;
      log.info(
        { 
          duration, 
          pcmSize: pcmBuffer.length,
          wavSize: wavBuffer.length,
          format: "wav_24000_base64" 
        },
        "Single-call WAV audio generated (with header for HeyGen SDK)",
      );
      metrics.recordElevenLabsTTS(duration);

      storage
        .logApiCall({
          serviceName: "elevenlabs",
          endpoint: "textToSpeech",
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
        "Error generating WAV speech",
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

    // Normalize language code - ElevenLabs scribe_v1 accepts ISO 639-1 codes (e.g., 'en', 'es')
    // Convert 'en-US', 'en-GB', etc. to 'en'
    const normalizedLanguageCode = languageCode 
      ? languageCode.split('-')[0].toLowerCase() 
      : undefined;

    const log = logger.child({
      service: "elevenlabs",
      operation: "transcribeSpeech",
      audioSize: audioBuffer.length,
      mimeType,
      languageCode: normalizedLanguageCode,
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
      
      if (normalizedLanguageCode) {
        formData.append('language_code', normalizedLanguageCode);
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
}

export const elevenlabsService = new ElevenLabsService();
