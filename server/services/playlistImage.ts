import { fal } from "@fal-ai/client";
import { logger } from "../logger";
import { isFalConfigured } from "./falAi";

const log = logger.child({ service: "playlistImage" });

/**
 * Generate a mood image for a playlist using fal.ai Flux.
 * Returns a persistent CDN URL or null on failure.
 */
export async function generatePlaylistImage(
  imagePrompt: string,
): Promise<string | null> {
  if (!isFalConfigured()) {
    log.warn("FAL_KEY not configured — playlist image generation unavailable");
    return null;
  }

  // Try flux/schnell first (fast, reliable), fall back to flux/dev
  const models = ["fal-ai/flux/schnell", "fal-ai/flux/dev"];

  for (const model of models) {
    try {
      log.info({ model, promptLength: imagePrompt.length }, "Generating playlist image");
      const result = await fal.subscribe(model, {
        input: {
          prompt: imagePrompt,
          image_size: "square",
          num_images: 1,
        },
      });

      const image = (result.data as any)?.images?.[0];
      if (image?.url) {
        log.info({ model }, "Playlist image generated successfully");
        return image.url;
      }

      log.warn({ model }, "No image in fal.ai response");
    } catch (err: any) {
      log.error({ model, err: err?.message || err }, "Image generation failed, trying next model");
    }
  }

  log.error("All image generation models failed");
  return null;
}

/**
 * Generate a CSS gradient fallback when image generation fails.
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

  return "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
}
