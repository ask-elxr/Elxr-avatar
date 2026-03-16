import { fal } from "@fal-ai/client";
import sharp from "sharp";

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
 * Overlay title text on a thumbnail image using sharp + SVG.
 * Uploads the result to fal.ai storage and returns a persistent CDN URL.
 */
async function overlayTitleOnImage(imageUrl: string, title: string, width: number, height: number): Promise<string> {
  // Fetch the generated image
  const response = await fetch(imageUrl);
  const imageBuffer = Buffer.from(await response.arrayBuffer());

  // Scale font size based on title length
  const maxFontSize = 72;
  const minFontSize = 36;
  const fontSize = Math.max(minFontSize, Math.min(maxFontSize, Math.floor(width / (title.length * 0.7))));

  // Escape XML special characters
  const escapedTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Create SVG text overlay with gradient background at bottom
  const svgOverlay = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(0,0,0,0)" />
          <stop offset="100%" stop-color="rgba(0,0,0,0.8)" />
        </linearGradient>
      </defs>
      <rect x="0" y="${height * 0.5}" width="${width}" height="${height * 0.5}" fill="url(#grad)" />
      <text
        x="${width / 2}"
        y="${height - fontSize * 0.6}"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${fontSize}"
        font-weight="bold"
        fill="white"
      >${escapedTitle}</text>
    </svg>
  `;

  const composited = await sharp(imageBuffer)
    .resize(width, height, { fit: "cover" })
    .composite([{
      input: Buffer.from(svgOverlay),
      top: 0,
      left: 0,
    }])
    .jpeg({ quality: 85 })
    .toBuffer();

  // Upload to fal.ai storage for a persistent CDN URL
  const file = new File([composited], "thumbnail.jpg", { type: "image/jpeg" });
  const cdnUrl = await fal.storage.upload(file);
  return cdnUrl;
}

/**
 * Generate a course thumbnail image.
 * Creates an AI background image and overlays the course title as crisp text.
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
        prompt: `A visually striking abstract scene representing the concept of ${courseTitle}. ${courseDescription}. Photorealistic, cinematic lighting, dramatic composition, rich colors, landscape orientation. Absolutely no text, no words, no letters, no writing, no watermarks, no logos.`,
        image_size: "landscape_16_9",
        num_images: 1,
      },
    });

    const image = (result.data as any)?.images?.[0];
    if (!image?.url) return null;

    const width = image.width || 1280;
    const height = image.height || 720;

    // Overlay the course title as crisp rendered text
    const cdnUrl = await overlayTitleOnImage(image.url, courseTitle, width, height);

    console.log(`✅ Thumbnail generated with title overlay for: "${courseTitle}"`);
    return {
      url: cdnUrl,
      width,
      height,
      content_type: "image/jpeg",
    };
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
