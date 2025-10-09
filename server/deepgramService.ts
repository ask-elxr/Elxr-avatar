import { createClient } from "@deepgram/sdk";

const deepgramApiKey = process.env.DEEPGRAM_API_KEY;

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  if (!deepgramApiKey) {
    throw new Error("DEEPGRAM_API_KEY not configured");
  }

  const deepgram = createClient(deepgramApiKey);

  try {
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      audioBuffer,
      {
        model: "nova-2",
        smart_format: true,
        language: "en",
      }
    );

    if (error) {
      throw new Error(`Deepgram error: ${error.message}`);
    }

    const transcript = result.results.channels[0].alternatives[0].transcript;
    return transcript;
  } catch (error) {
    console.error("Transcription error:", error);
    throw error;
  }
}
