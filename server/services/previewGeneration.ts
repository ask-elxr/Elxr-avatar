import axios from "axios";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { db } from "../db";
import { avatarProfiles } from "@shared/schema";
import { eq } from "drizzle-orm";
import { logger } from "../logger";

// HEYGEN_VIDEO_API_KEY is used for video creation (courses, chat videos)
const HEYGEN_VIDEO_API_KEY = process.env.HEYGEN_VIDEO_API_KEY;
const HEYGEN_BASE_URL = "https://api.heygen.com/v2";

interface PreviewGenerationResult {
  success: boolean;
  avatarId: string;
  videoUrl?: string;
  gifPath?: string;
  error?: string;
}

interface HeyGenVideoResponse {
  error: any;
  data: {
    video_id: string;
  };
}

interface HeyGenVideoStatusResponse {
  error: any;
  data: {
    video_id: string;
    status: "pending" | "processing" | "completed" | "failed";
    video_url?: string;
    thumbnail_url?: string;
    duration?: number;
    error?: any;
  };
}

export class PreviewGenerationService {
  private headers = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "X-Api-Key": HEYGEN_VIDEO_API_KEY || "",
  };

  private outputDir = path.join(process.cwd(), "attached_assets");

  async generatePreviewForAvatar(avatarId: string): Promise<PreviewGenerationResult> {
    try {
      if (!HEYGEN_VIDEO_API_KEY) {
        throw new Error("HEYGEN_VIDEO_API_KEY is not configured");
      }

      const [avatar] = await db
        .select()
        .from(avatarProfiles)
        .where(eq(avatarProfiles.id, avatarId));

      if (!avatar) {
        throw new Error(`Avatar not found: ${avatarId}`);
      }

      const heygenAvatarId = avatar.heygenVideoAvatarId || avatar.heygenAvatarId;
      if (!heygenAvatarId) {
        throw new Error(`No HeyGen avatar ID configured for: ${avatarId}`);
      }

      logger.info({ avatarId, heygenAvatarId }, "Generating preview video");

      const greetingScript = `Hi, I'm ${avatar.name}. I'm here to help you on your wellness journey.`;

      const DEFAULT_VOICE_ID = "1bd001e7e50f421d891986aad5158bc8";

      // Known talking photo avatar IDs - these use a different API format than regular avatars
      // Talking photos are created from static images and require type: "talking_photo"
      const KNOWN_TALKING_PHOTOS = [
        "84f913285ac944188a35ce5b58ceb861", // Kelsey
        "5cd4e0726301493d9fed969a2464162c", // Kelsey (alternate)
        "1da3f06fc92a4a9bbbe10f81b3b6a498", // Cozy Bookstore Sage
        "a618fb75f718477781a208eddcb6538f", // Librarian
        "0fb714a20699440890fa92175cc56cf8", // Serene Sunset Sage
      ];
      
      // Check if this is a talking photo by explicit lookup
      const isTalkingPhoto = KNOWN_TALKING_PHOTOS.includes(heygenAvatarId);

      const character = isTalkingPhoto 
        ? {
            type: "talking_photo" as const,
            talking_photo_id: heygenAvatarId,
          }
        : {
            type: "avatar" as const,
            avatar_id: heygenAvatarId,
            avatar_style: "normal",
          };

      const videoRequest = {
        video_inputs: [
          {
            character,
            voice: {
              type: "text",
              input_text: greetingScript,
              voice_id: avatar.heygenVoiceId || DEFAULT_VOICE_ID,
            },
          },
        ],
        dimension: {
          width: 720,
          height: 720,
        },
        test: true,
        caption: false,
        title: `${avatar.name} Preview`,
      };

      logger.info({ avatarId, request: videoRequest }, "Sending preview request to HeyGen");

      const response = await axios.post<HeyGenVideoResponse>(
        `${HEYGEN_BASE_URL}/video/generate`,
        videoRequest,
        { headers: this.headers }
      );

      if (response.data.error) {
        throw new Error(JSON.stringify(response.data.error));
      }

      const heygenVideoId = response.data.data.video_id;
      logger.info({ avatarId, heygenVideoId }, "Preview video generation started");

      const videoResult = await this.pollForCompletion(heygenVideoId);

      if (!videoResult.success || !videoResult.videoUrl) {
        throw new Error(videoResult.error || "Video generation failed");
      }

      logger.info({ avatarId, videoUrl: videoResult.videoUrl }, "Video completed, converting to GIF");

      const gifPath = await this.convertVideoToGif(videoResult.videoUrl, avatarId);

      await db
        .update(avatarProfiles)
        .set({ profileImageUrl: `/attached_assets/${path.basename(gifPath)}` })
        .where(eq(avatarProfiles.id, avatarId));

      logger.info({ avatarId, gifPath }, "Preview GIF generated successfully");

      return {
        success: true,
        avatarId,
        videoUrl: videoResult.videoUrl,
        gifPath: `/attached_assets/${path.basename(gifPath)}`,
      };
    } catch (error: any) {
      logger.error({ avatarId, error: error.message }, "Failed to generate preview");
      return {
        success: false,
        avatarId,
        error: error.message,
      };
    }
  }

  private async pollForCompletion(heygenVideoId: string): Promise<{
    success: boolean;
    videoUrl?: string;
    error?: string;
  }> {
    const maxAttempts = 60;
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;
      await this.sleep(5000);

      try {
        const response = await axios.get<HeyGenVideoStatusResponse>(
          `https://api.heygen.com/v1/video_status.get?video_id=${heygenVideoId}`,
          { headers: this.headers }
        );

        const { status, video_url, error } = response.data.data;

        logger.debug({ heygenVideoId, status, attempts }, "Polling video status");

        if (status === "completed" && video_url) {
          return { success: true, videoUrl: video_url };
        } else if (status === "failed") {
          return { success: false, error: error || "Video generation failed" };
        }
      } catch (error: any) {
        logger.warn({ heygenVideoId, error: error.message }, "Error polling status");
      }
    }

    return { success: false, error: "Video generation timeout" };
  }

  private async convertVideoToGif(videoUrl: string, avatarId: string): Promise<string> {
    const timestamp = Date.now();
    const tempVideoPath = path.join(this.outputDir, `temp_${avatarId}_${timestamp}.mp4`);
    const outputGifPath = path.join(this.outputDir, `${avatarId}_preview_${timestamp}.gif`);

    const videoResponse = await axios.get(videoUrl, { responseType: "arraybuffer" });
    fs.writeFileSync(tempVideoPath, Buffer.from(videoResponse.data));

    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", [
        "-i", tempVideoPath,
        "-vf", "fps=12,scale=320:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse",
        "-loop", "0",
        "-t", "4",
        "-y",
        outputGifPath,
      ]);

      ffmpeg.stderr.on("data", (data) => {
        logger.debug({ output: data.toString() }, "ffmpeg output");
      });

      ffmpeg.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`ffmpeg exited with code ${code}`));
        }
      });

      ffmpeg.on("error", (err) => {
        reject(err);
      });
    });

    fs.unlinkSync(tempVideoPath);

    return outputGifPath;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async generateAllMissingPreviews(): Promise<PreviewGenerationResult[]> {
    const avatarsNeedingPreviews = ["judy", "dexter", "shawn", "kelsey"];
    const results: PreviewGenerationResult[] = [];

    for (const avatarId of avatarsNeedingPreviews) {
      logger.info({ avatarId }, "Generating preview for avatar");
      const result = await this.generatePreviewForAvatar(avatarId);
      results.push(result);

      if (!result.success) {
        logger.error({ avatarId, error: result.error }, "Failed to generate preview");
      }
    }

    return results;
  }
}

export const previewGenerationService = new PreviewGenerationService();
