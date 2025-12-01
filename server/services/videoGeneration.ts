import axios from "axios";
import { db } from "../db";
import { lessons, generatedVideos, avatarProfiles, courses, users } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { ElevenLabsClient } from "elevenlabs";
import { subscriptionService } from "./subscription";

function formatVideoTitle(params: {
  avatarName: string;
  topic: string;
  userName?: string;
  userId?: string;
  type: 'course' | 'chat';
}): string {
  const date = new Date().toISOString().slice(0, 10);
  const userLabel = params.userName || (params.userId ? `User-${params.userId.slice(0, 8)}` : 'Anonymous');
  const typeLabel = params.type === 'course' ? 'Course' : 'Chat';
  return `[${typeLabel}] ${params.avatarName} - ${params.topic} - ${userLabel} - ${date}`;
}

const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;
const HEYGEN_BASE_URL = "https://api.heygen.com/v2";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

const elevenLabsClient = ELEVENLABS_API_KEY ? new ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY }) : null;

// Track videos currently being polled to avoid duplicate polling
const activePollingSet = new Set<string>();

// Talking Photo IDs - these require different API format (type: "talking_photo" instead of "avatar")
// Identified from HeyGen API: these are in the talking_photos category, not avatars
const TALKING_PHOTO_IDS = new Set([
  "84f913285ac944188a35ce5b58ceb861", // Kelsey
  "1da3f06fc92a4a9bbbe10f81b3b6a498", // Thad
  "57d0eb901fe84211b92b0a9d91f2e5c0", // Willie
  "84d6a3a8f0d545a9900bf16176c7b7ae", // Mark Kohl - talking photo from HeyGen UI
]);

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
   * Generate audio using ElevenLabs and upload to HeyGen
   * Returns the HeyGen asset_id for the uploaded audio
   */
  private async generateElevenLabsAudio(text: string, voiceId: string, avatarName: string): Promise<string | null> {
    if (!elevenLabsClient || !ELEVENLABS_API_KEY) {
      console.log("⚠️ ElevenLabs not configured, falling back to HeyGen voice");
      return null;
    }

    try {
      console.log(`🎙️ Generating ElevenLabs audio for ${avatarName} with voice ${voiceId}...`);
      
      // Generate audio with ElevenLabs
      const audioStream = await elevenLabsClient.textToSpeech.convert(voiceId, {
        text: text.slice(0, 5000), // ElevenLabs has its own limits
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      });

      // Collect stream into buffer
      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        chunks.push(Buffer.from(chunk));
      }
      const audioBuffer = Buffer.concat(chunks);
      
      console.log(`✅ ElevenLabs audio generated: ${audioBuffer.length} bytes`);

      // Upload audio to HeyGen
      const FormData = (await import("form-data")).default;
      const formData = new FormData();
      formData.append("file", audioBuffer, {
        filename: `audio_${Date.now()}.mp3`,
        contentType: "audio/mpeg",
      });

      const uploadResponse = await axios.post(
        "https://api.heygen.com/v1/asset",
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            "X-Api-Key": HEYGEN_API_KEY || "",
          },
        }
      );

      if (uploadResponse.data?.data?.asset_id) {
        console.log(`✅ Audio uploaded to HeyGen: ${uploadResponse.data.data.asset_id}`);
        return uploadResponse.data.data.asset_id;
      }

      console.error("❌ Failed to get asset_id from HeyGen upload response");
      return null;
    } catch (error: any) {
      console.error("❌ Error generating ElevenLabs audio:", error.message);
      return null;
    }
  }

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

      let userName: string | undefined;
      if (course.userId) {
        const [user] = await db
          .select({ firstName: users.firstName, email: users.email })
          .from(users)
          .where(eq(users.id, course.userId));
        userName = user?.firstName || user?.email?.split('@')[0];
      }

      // Production mode - no test limits on paid HeyGen plan
      // All avatars (public and custom) use production mode for watermark-free videos
      const useTestMode = false;

      // Create voice config - prefer ElevenLabs if avatar has it configured
      let voiceConfig: any;
      
      if (avatar.elevenlabsVoiceId && elevenLabsClient) {
        // Use ElevenLabs voice - generate audio and upload to HeyGen
        console.log(`🎙️ Using ElevenLabs voice for video (${avatar.name}): ${avatar.elevenlabsVoiceId}`);
        const audioAssetId = await this.generateElevenLabsAudio(
          lesson.script,
          avatar.elevenlabsVoiceId,
          avatar.name
        );
        
        if (audioAssetId) {
          voiceConfig = {
            type: "audio",
            audio_asset_id: audioAssetId,
          };
          console.log(`✅ Using ElevenLabs audio asset: ${audioAssetId}`);
        } else {
          // Fallback to HeyGen voice if ElevenLabs failed
          const DEFAULT_VOICE_ID = "1bd001e7e50f421d891986aad5158bc8"; // Sara - Cheerful
          const videoVoiceId = avatar.heygenVideoVoiceId || avatar.heygenVoiceId || DEFAULT_VOICE_ID;
          voiceConfig = {
            type: "text",
            input_text: lesson.script.slice(0, 5000),
            voice_id: videoVoiceId,
          };
          console.log(`⚠️ ElevenLabs failed, falling back to HeyGen voice: ${videoVoiceId}`);
        }
      } else {
        // Use HeyGen voice - video-specific voice ID if available, otherwise fall back
        const DEFAULT_VOICE_ID = "1bd001e7e50f421d891986aad5158bc8"; // Sara - Cheerful
        const videoVoiceId = avatar.heygenVideoVoiceId || avatar.heygenVoiceId || DEFAULT_VOICE_ID;
        
        voiceConfig = {
          type: "text",
          input_text: lesson.script.slice(0, 5000), // Max 5000 chars
          voice_id: videoVoiceId,
        };
        
        console.log(`🎙️ Using HeyGen voice for video (${avatar.name}): ${videoVoiceId}`);
      }

      // Detect if this is a Talking Photo (requires different API format)
      const isTalkingPhoto = TALKING_PHOTO_IDS.has(avatar.heygenVideoAvatarId);
      
      // Build character config based on avatar type
      const characterConfig = isTalkingPhoto
        ? {
            type: "talking_photo",
            talking_photo_id: avatar.heygenVideoAvatarId,
          }
        : {
            type: "avatar",
            avatar_id: avatar.heygenVideoAvatarId,
            avatar_style: "normal",
          };

      console.log(`📹 Avatar type: ${isTalkingPhoto ? 'TALKING_PHOTO' : 'AVATAR'} (${avatar.heygenVideoAvatarId})`);

      const videoTitle = formatVideoTitle({
        avatarName: avatar.name,
        topic: lesson.title,
        userName,
        userId: course.userId || undefined,
        type: 'course',
      });

      const videoRequest = {
        video_inputs: [
          {
            character: characterConfig,
            voice: voiceConfig,
          },
        ],
        dimension: {
          width: 1920,
          height: 1080,
        },
        test: useTestMode, // Use test mode for Instant Avatars, production for public avatars
        caption: false,
        title: videoTitle,
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
          testVideo: useTestMode, // Track whether this is a test video
        })
        .returning();

      // Track usage for dashboard (course has userId)
      if (course.userId) {
        await subscriptionService.incrementUsage(course.userId, "video").catch(err => {
          console.warn("Failed to track video usage:", err.message);
        });
      }

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
    // Skip if already being polled
    if (activePollingSet.has(heygenVideoId)) {
      console.log(`⏭️ Video ${heygenVideoId} is already being polled, skipping`);
      return;
    }
    
    activePollingSet.add(heygenVideoId);
    const maxAttempts = 240; // 20 minutes (5 sec intervals) for longer videos
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
        
        // Log every 12 attempts (every minute) or on status change
        if (attempts === 1 || attempts % 12 === 0) {
          console.log(`📹 Polling ${heygenVideoId}: attempt ${attempts}/240, status=${status}`);
        }

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

          activePollingSet.delete(heygenVideoId);
          console.log(`✅ Video generation completed: ${heygenVideoId}`);
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

          activePollingSet.delete(heygenVideoId);
          console.error(`❌ Video generation failed: ${heygenVideoId}`, error);
        } else if (attempts < maxAttempts) {
          // Still processing, check again in 5 seconds
          setTimeout(poll, 5000);
        } else {
          // Timeout - mark as timeout but don't delete from active set
          // Background checker will pick this up if it completes later
          console.log(`⏱️ Video generation timeout: ${heygenVideoId}`);
          activePollingSet.delete(heygenVideoId);
        }
      } catch (error: any) {
        console.error("Error polling video status:", error.message);

        if (attempts < maxAttempts) {
          setTimeout(poll, 5000);
        } else {
          activePollingSet.delete(heygenVideoId);
        }
      }
    };

    // Start polling
    setTimeout(poll, 5000);
  }

  /**
   * Check a single video's status directly from HeyGen
   * Used by recovery and background checker
   */
  async checkAndUpdateVideoStatus(heygenVideoId: string): Promise<{
    status: string;
    updated: boolean;
  }> {
    try {
      const response = await axios.get<HeyGenVideoStatusResponse>(
        `https://api.heygen.com/v1/video_status.get?video_id=${heygenVideoId}`,
        { headers: this.headers }
      );

      const { status, video_url, thumbnail_url, duration, error } = response.data.data;

      // Get the video record
      const [video] = await db
        .select()
        .from(generatedVideos)
        .where(eq(generatedVideos.heygenVideoId, heygenVideoId));

      if (!video) {
        return { status: "not_found", updated: false };
      }

      // Already in final state
      if (video.status === "completed" || video.status === "failed") {
        return { status: video.status, updated: false };
      }

      if (status === "completed" && video_url) {
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

        await db
          .update(lessons)
          .set({ status: "completed" })
          .where(eq(lessons.id, video.lessonId));

        console.log(`✅ Background check: Video ${heygenVideoId} completed`);
        return { status: "completed", updated: true };
      } else if (status === "failed") {
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
          .where(eq(lessons.id, video.lessonId));

        console.log(`❌ Background check: Video ${heygenVideoId} failed`);
        return { status: "failed", updated: true };
      }

      return { status: status, updated: false };
    } catch (error: any) {
      console.error(`Error checking video ${heygenVideoId}:`, error.message);
      return { status: "error", updated: false };
    }
  }

  /**
   * Recovery check for videos stuck in 'generating' state
   * Called on server startup
   */
  async recoverStuckVideos(): Promise<void> {
    try {
      // Find all videos stuck in generating state
      const stuckVideos = await db
        .select()
        .from(generatedVideos)
        .where(eq(generatedVideos.status, "generating"));

      if (stuckVideos.length > 0) {
        console.log(`📹 Found ${stuckVideos.length} videos in generating state, checking status...`);

        for (const video of stuckVideos) {
          if (video.heygenVideoId) {
            const result = await this.checkAndUpdateVideoStatus(video.heygenVideoId);
            if (result.updated) {
              console.log(`📹 Updated stuck video ${video.heygenVideoId} to ${result.status}`);
            } else if (result.status === "pending" || result.status === "processing") {
              // Still processing, start polling again
              const [lesson] = await db
                .select()
                .from(lessons)
                .where(eq(lessons.id, video.lessonId));
              
              if (lesson) {
                console.log(`📹 Resuming polling for video ${video.heygenVideoId}`);
                this.pollVideoStatus(video.heygenVideoId, video.lessonId);
              }
            }
          }
        }
      }

      // Also check for orphaned lessons (lessons stuck in generating with no video record)
      const stuckLessons = await db
        .select()
        .from(lessons)
        .where(eq(lessons.status, "generating"));

      for (const lesson of stuckLessons) {
        // Check if there's a matching video record
        const [video] = await db
          .select()
          .from(generatedVideos)
          .where(eq(generatedVideos.lessonId, lesson.id));

        if (!video) {
          // Orphaned lesson - reset to draft status
          console.log(`📹 Found orphaned lesson ${lesson.id} (${lesson.title}) - resetting to draft`);
          await db
            .update(lessons)
            .set({ status: "draft", errorMessage: "Generation was interrupted. Please try again." })
            .where(eq(lessons.id, lesson.id));
        }
      }

      if (stuckVideos.length === 0) {
        console.log("📹 No stuck videos found");
      }
    } catch (error: any) {
      console.error("Error recovering stuck videos:", error.message);
    }
  }

  /**
   * Start background checker that periodically checks generating videos
   */
  startBackgroundChecker(): void {
    const CHECK_INTERVAL = 2 * 60 * 1000; // 2 minutes

    const check = async () => {
      try {
        const generatingVideos = await db
          .select()
          .from(generatedVideos)
          .where(eq(generatedVideos.status, "generating"));

        if (generatingVideos.length > 0) {
          console.log(`🔄 Background check: ${generatingVideos.length} videos in generating state`);
          
          for (const video of generatingVideos) {
            if (video.heygenVideoId && !activePollingSet.has(video.heygenVideoId)) {
              await this.checkAndUpdateVideoStatus(video.heygenVideoId);
            }
          }
        }
      } catch (error: any) {
        console.error("Background video checker error:", error.message);
      }
    };

    // Run check immediately and then every 2 minutes
    check();
    setInterval(check, CHECK_INTERVAL);
    console.log("📹 Video background checker started (interval: 2 minutes)");
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
