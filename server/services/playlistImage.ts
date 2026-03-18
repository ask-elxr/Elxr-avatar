import OpenAI from "openai";
import { logger } from "../logger";

const log = logger.child({ service: "playlistImage" });

const openai = new OpenAI();

/**
 * Generate a mood image for a playlist using DALL-E.
 * Returns the image URL or null on failure.
 */
export async function generatePlaylistImage(
  imagePrompt: string,
): Promise<string | null> {
  try {
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: imagePrompt,
      n: 1,
      size: "1024x1792", // Vertical editorial format
      quality: "standard",
      style: "natural",
    });

    const url = response.data?.[0]?.url || null;
    if (url) {
      log.info("Playlist image generated successfully");
    }
    return url;
  } catch (err) {
    log.error({ err }, "Failed to generate playlist image");
    return null;
  }
}

/**
 * Generate a CSS gradient fallback when image generation fails.
 * Returns a data URI of a gradient placeholder.
 */
export function getFallbackGradient(moodTags: string[]): string {
  const palettes: Record<string, string> = {
    calm: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    warm: "linear-gradient(135deg, #f5af19 0%, #f12711 100%)",
    night: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
    energy: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
    focus: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
    gentle: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
    grief: "linear-gradient(135deg, #2c3e50 0%, #4a6741 100%)",
    dream: "linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)",
    motivation: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
  };

  for (const tag of moodTags) {
    const lower = tag.toLowerCase();
    if (palettes[lower]) return palettes[lower];
  }

  // Default gradient
  return "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
}
