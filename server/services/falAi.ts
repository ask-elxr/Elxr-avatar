import { fal } from "@fal-ai/client";

const FAL_KEY = process.env.FAL_KEY;

if (FAL_KEY) {
  fal.config({ credentials: FAL_KEY });
}

export function isFalConfigured(): boolean {
  return !!FAL_KEY;
}

export interface FalImage {
  url: string;
  width: number;
  height: number;
  content_type?: string;
}

/**
 * Generate a B-roll image using Flux (fast, high quality).
 * Returns a landscape image suitable for 1280x720 video backgrounds.
 */
export async function generateBrollImage(prompt: string): Promise<FalImage | null> {
  if (!FAL_KEY) {
    console.warn("FAL_KEY not configured — AI image generation unavailable");
    return null;
  }

  try {
    console.log(`🎨 Generating B-roll image: "${prompt.slice(0, 80)}..."`);

    const result = await fal.subscribe("fal-ai/flux/schnell", {
      input: {
        prompt: `${prompt}. Photorealistic, cinematic lighting, sharp focus, 4K quality, landscape orientation. No text, no watermarks, no logos.`,
        image_size: "landscape_16_9",
        num_images: 1,
      },
    });

    const image = (result.data as any)?.images?.[0];
    if (image?.url) {
      console.log(`✅ B-roll image generated: ${image.url.slice(0, 80)}...`);
      return {
        url: image.url,
        width: image.width || 1280,
        height: image.height || 720,
        content_type: image.content_type,
      };
    }

    console.warn("⚠️ No image in fal.ai response");
    return null;
  } catch (error: any) {
    console.error("❌ fal.ai image generation error:", error.message);
    return null;
  }
}

/**
 * Generate a course thumbnail image.
 * Creates an eye-catching thumbnail with the course theme.
 */
export async function generateCourseThumbnail(
  courseTitle: string,
  courseDescription: string,
  avatarName: string,
): Promise<FalImage | null> {
  if (!FAL_KEY) return null;

  try {
    console.log(`🎨 Generating thumbnail for course: "${courseTitle}"`);

    const result = await fal.subscribe("fal-ai/flux/schnell", {
      input: {
        prompt: `Professional course thumbnail for "${courseTitle}". ${courseDescription}. Modern, bold, eye-catching design with cinematic lighting. Landscape 16:9, suitable as a video course cover image. No text overlays.`,
        image_size: "landscape_16_9",
        num_images: 1,
      },
    });

    const image = (result.data as any)?.images?.[0];
    if (image?.url) {
      console.log(`✅ Thumbnail generated: ${image.url.slice(0, 80)}...`);
      return {
        url: image.url,
        width: image.width || 1280,
        height: image.height || 720,
        content_type: image.content_type,
      };
    }

    return null;
  } catch (error: any) {
    console.error("❌ fal.ai thumbnail generation error:", error.message);
    return null;
  }
}

/**
 * Generate a short B-roll video clip using Kling.
 * Returns a ~5 second video clip for use as B-roll in course videos.
 */
export async function generateBrollVideo(prompt: string): Promise<{ url: string } | null> {
  if (!FAL_KEY) return null;

  try {
    console.log(`🎬 Generating B-roll video clip: "${prompt.slice(0, 80)}..."`);

    const result = await fal.subscribe("fal-ai/kling-video/v2/master/text-to-video", {
      input: {
        prompt: `Cinematic B-roll footage for educational video: ${prompt}. Smooth camera movement, professional quality, no text.`,
        duration: "5",
        aspect_ratio: "16:9",
      },
      pollInterval: 5000,
      timeout: 300000, // 5 minute timeout for video generation
    });

    const video = (result.data as any)?.video?.url;
    if (video) {
      console.log(`✅ B-roll video generated: ${video.slice(0, 80)}...`);
      return { url: video };
    }

    console.warn("⚠️ No video in fal.ai response");
    return null;
  } catch (error: any) {
    console.error("❌ fal.ai video generation error:", error.message);
    return null;
  }
}
