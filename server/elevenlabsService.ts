import { ElevenLabsClient } from "elevenlabs";
import { wrapServiceCall } from './circuitBreaker.js';
import { logger } from './logger.js';
import { metrics } from './metrics.js';

class ElevenLabsService {
  private client?: ElevenLabsClient;
  private apiKey: string;
  private ttsBreaker: any;

  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY || '';
    if (!this.apiKey) {
      logger.warn({ service: 'elevenlabs' }, 'ELEVENLABS_API_KEY not found - TTS features will be disabled');
      return;
    }

    this.client = new ElevenLabsClient({
      apiKey: this.apiKey,
    });

    this.ttsBreaker = wrapServiceCall(
      async (params: any) => {
        if (!this.client) {
          throw new Error('ElevenLabs client not initialized');
        }
        return await this.client.textToSpeech.convert(params.voiceId, params.options);
      },
      'elevenlabs-tts',
      { timeout: 30000, errorThresholdPercentage: 50 }
    );
  }

  async generateSpeech(text: string, voiceId: string = "21m00Tcm4TlvDq8ikWAM"): Promise<Buffer> {
    if (!this.client) {
      throw new Error('ElevenLabs client not initialized - check ELEVENLABS_API_KEY');
    }

    const log = logger.child({
      service: 'elevenlabs',
      operation: 'generateSpeech',
      textLength: text.length,
      voiceId,
    });

    try {
      log.debug('Generating speech with ElevenLabs');
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
            use_speaker_boost: true
          }
        }
      });

      // Convert stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        chunks.push(Buffer.from(chunk));
      }
      const audioBuffer = Buffer.concat(chunks);

      const duration = Date.now() - startTime;
      log.info({ duration, audioSize: audioBuffer.length }, 'Speech generated successfully');
      metrics.recordElevenLabsTTS(duration);

      return audioBuffer;
    } catch (error: any) {
      log.error({ error: error.message, stack: error.stack }, 'Error generating speech with ElevenLabs');
      throw error;
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey && !!this.client;
  }
}

export const elevenlabsService = new ElevenLabsService();
