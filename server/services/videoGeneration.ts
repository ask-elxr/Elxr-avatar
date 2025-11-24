import axios from "axios";
import { db } from "../db";
import { lessons, generatedVideos, avatarProfiles, courses } from "@shared/schema";
import { eq } from "drizzle-orm";

const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;
const HEYGEN_BASE_URL = "https://api.heygen.com/v2";

interface VideoGenerationRequest {
  lessonId: string;
  script: string;
  avatarHeyGenId: string;
  voiceId?: string;
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

export class VideoGenerationService {
  private headers = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "X-Api-Key": HEYGEN_API_KEY || "",
  };

  /**
   * Generate a video for a lesson
   */
  async generateVideoForLesson(lessonId: string): Promise<{
    success: boolean;
    videoId?: string;
    error?: string;
  }> {
    try {
      if (!HEYGEN_API_KEY) {
        throw new Error("HEYGEN_API_KEY is not configured");
      }

      // Get lesson details
      const [lesson] = await db
        .select()
        .from(lessons)
        .where(eq(lessons.id, lessonId));

      if (!lesson) {
        throw new Error("Lesson not found");
      }

      // Get avatar details (to find HeyGen avatar ID)
      const [course] = await db
        .select()
        .from(courses)
        .where(eq(courses.id, lesson.courseId));

      if (!course) {
        throw new Error("Course not found");
      }

      const [avatar] = await db
        .select()
        .from(avatarProfiles)
        .where(eq(avatarProfiles.id, course.avatarId));

      if (!avatar || !avatar.heygenVideoAvatarId) {
        throw new Error("Avatar video generation ID not configured");
      }

      // Create video generation request
      // Use configured voice or default to Sara - Cheerful (English female voice)
      const DEFAULT_VOICE_ID = "1bd001e7e50f421d891986aad5158bc8"; // Sara - Cheerful
      
      const voiceConfig: any = {
        type: "text",
        input_text: lesson.script.slice(0, 5000), // Max 5000 chars
        voice_id: avatar.heygenVoiceId || DEFAULT_VOICE_ID,
      };

      const videoRequest = {
        video_inputs: [
          {
            character: {
              type: "avatar",
              avatar_id: avatar.heygenVideoAvatarId, // Use Instant Avatar ID for video generation
              avatar_style: "normal",
            },
            voice: voiceConfig,
          },
        ],
        dimension: {
          width: 1920,
          height: 1080,
        },
        test: false, // Set to true for watermarked test videos
        caption: false,
        title: lesson.title,
      };

      // Call HeyGen API to generate video
      console.log("📹 Sending request to HeyGen:", JSON.stringify(videoRequest, null, 2));
      
      const response = await axios.post<HeyGenVideoResponse>(
        `${HEYGEN_BASE_URL}/video/generate`,
        videoRequest,
        { headers: this.headers }
      );

      console.log("✅ HeyGen response:", JSON.stringify(response.data, null, 2));

      if (response.data.error) {
        throw new Error(JSON.stringify(response.data.error));
      }

      const videoId = response.data.data.video_id;

      // Create generated video record
      const [generatedVideo] = await db
        .insert(generatedVideos)
        .values({
          lessonId,
          heygenVideoId: videoId,
          status: "generating",
        })
        .returning();

      // Update lesson status
      await db
        .update(lessons)
        .set({ status: "generating" })
        .where(eq(lessons.id, lessonId));

      // Start polling for completion (in background)
      this.pollVideoStatus(videoId, lessonId);

      return {
        success: true,
        videoId,
      };
    } catch (error: any) {
      console.error("❌ Error generating video:", error.message);
      
      // Log the detailed error response from HeyGen
      if (error.response?.data) {
        console.error("🔴 HeyGen API error details:", JSON.stringify(error.response.data, null, 2));
      }

      // Update lesson status to failed
      const errorMsg = error.response?.data?.error || error.message;
      await db
        .update(lessons)
        .set({
          status: "failed",
          errorMessage: typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg),
        })
        .where(eq(lessons.id, lessonId));

      return {
        success: false,
        error: typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg),
      };
    }
  }

  /**
   * Poll HeyGen API for video generation status
   */
  private async pollVideoStatus(heygenVideoId: string, lessonId: string): Promise<void> {
    const maxAttempts = 120; // 10 minutes (5 sec intervals)
    let attempts = 0;

    const poll = async () => {
      try {
        attempts++;

        // HeyGen status endpoint is v1, not v2
        const response = await axios.get<HeyGenVideoStatusResponse>(
          `https://api.heygen.com/v1/video_status.get?video_id=${heygenVideoId}`,
          { headers: this.headers }
        );

        const { status, video_url, thumbnail_url, duration, error } = response.data.data;

        if (status === "completed" && video_url) {
          // Update generated video record
          // Convert duration to integer (HeyGen returns decimal like 14.5)
          const durationInt = duration ? Math.round(duration) : null;
          
          await db
            .update(generatedVideos)
            .set({
              status: "completed",
              videoUrl: video_url,
              thumbnailUrl: thumbnail_url,
              duration: durationInt,
              generatedAt: new Date(),
            })
            .where(eq(generatedVideos.heygenVideoId, heygenVideoId));

          // Update lesson status
          await db
            .update(lessons)
            .set({ status: "completed" })
            .where(eq(lessons.id, lessonId));

          console.log(`Video generation completed: ${heygenVideoId}`);
        } else if (status === "failed") {
          // Update with error
          await db
            .update(generatedVideos)
            .set({
              status: "failed",
              errorMessage: error || "Video generation failed",
            })
            .where(eq(generatedVideos.heygenVideoId, heygenVideoId));

          await db
            .update(lessons)
            .set({
              status: "failed",
              errorMessage: error || "Video generation failed",
            })
            .where(eq(lessons.id, lessonId));

          console.error(`Video generation failed: ${heygenVideoId}`, error);
        } else if (attempts < maxAttempts) {
          // Still processing, check again in 5 seconds
          setTimeout(poll, 5000);
        } else {
          // Timeout
          await db
            .update(generatedVideos)
            .set({
              status: "failed",
              errorMessage: "Video generation timeout",
            })
            .where(eq(generatedVideos.heygenVideoId, heygenVideoId));

          await db
            .update(lessons)
            .set({
              status: "failed",
              errorMessage: "Video generation timeout",
            })
            .where(eq(lessons.id, lessonId));

          console.error(`Video generation timeout: ${heygenVideoId}`);
        }
      } catch (error: any) {
        console.error("Error polling video status:", error);

        if (attempts < maxAttempts) {
          setTimeout(poll, 5000);
        }
      }
    };

    // Start polling
    setTimeout(poll, 5000);
  }

  /**
   * Get video status for a lesson
   */
  async getVideoStatus(lessonId: string): Promise<{
    status: string;
    videoUrl?: string;
    thumbnailUrl?: string;
    error?: string;
  }> {
    const [video] = await db
      .select()
      .from(generatedVideos)
      .where(eq(generatedVideos.lessonId, lessonId));

    if (!video) {
      return { status: "not_started" };
    }

    return {
      status: video.status,
      videoUrl: video.videoUrl || undefined,
      thumbnailUrl: video.thumbnailUrl || undefined,
      error: video.errorMessage || undefined,
    };
  }
}

export const videoGenerationService = new VideoGenerationService();
