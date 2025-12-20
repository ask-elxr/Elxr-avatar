import axios from "axios";
import { db } from "../db";
import { lessons, generatedVideos, avatarProfiles, courses, users } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { ElevenLabsClient } from "elevenlabs";
import { subscriptionService } from "./subscription";
import { formatVideoTitle } from "../utils/videoTitle";
import { emailService } from "./email";
import { getAvatarById } from "./avatars";
import { objectStorageClient } from "../objectStorage";

// HEYGEN_VIDEO_API_KEY is used for video creation (courses, chat videos)
const HEYGEN_VIDEO_API_KEY = process.env.HEYGEN_VIDEO_API_KEY;
const HEYGEN_BASE_URL = "https://api.heygen.com/v2";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

const elevenLabsClient = ELEVENLABS_API_KEY ? new ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY }) : null;

// Replit sidecar endpoint for signing URLs
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

// Track videos currently being polled to avoid duplicate polling
const activePollingSet = new Set<string>();

// Talking Photo IDs - these require different API format (type: "talking_photo" instead of "avatar")
// Identified from HeyGen API: these are in the talking_photos category, not avatars
const TALKING_PHOTO_IDS = new Set([
  "84f913285ac944188a35ce5b58ceb861", // Kelsey
  "1da3f06fc92a4a9bbbe10f81b3b6a498", // Thad
  "57d0eb901fe84211b92b0a9d91f2e5c0", // Willie
  "93cea50f10a14444888832d07925a94d", // Mark Kohl - Photo Avatar from HeyGen UI
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
    "X-Api-Key": HEYGEN_VIDEO_API_KEY || "",
  };

  /**
   * Generate audio using ElevenLabs and upload to object storage
   * Returns a signed URL for the audio file that HeyGen can access
   */
  private async generateElevenLabsAudioUrl(text: string, voiceId: string, avatarName: string): Promise<string | null> {
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
          stability: 0.7, // Increased for warmer, smoother voice (less harsh)
          similarity_boost: 0.65, // Slightly reduced for softer tone
        },
      });

      // Collect stream into buffer
      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        chunks.push(Buffer.from(chunk));
      }
      const audioBuffer = Buffer.concat(chunks);
      
      console.log(`✅ ElevenLabs audio generated: ${audioBuffer.length} bytes`);

      // Upload audio to object storage (public directory for HeyGen access)
      const publicPaths = process.env.PUBLIC_OBJECT_SEARCH_PATHS?.split(",").map(p => p.trim()).filter(p => p) || [];
      if (publicPaths.length === 0) {
        console.error("❌ PUBLIC_OBJECT_SEARCH_PATHS not configured");
        return null;
      }

      const publicPath = publicPaths[0];
      console.log(`📂 Using public path: ${publicPath}`);
      
      const { bucketName, objectName: basePath } = this.parseObjectPath(publicPath);
      console.log(`📂 Parsed bucket: ${bucketName}, basePath: ${basePath}`);
      
      const audioFileName = `audio/video_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`;
      const fullObjectName = basePath ? `${basePath}/${audioFileName}` : audioFileName;
      console.log(`📂 Full object name: ${fullObjectName}`);

      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(fullObjectName);

      // Upload the audio buffer
      try {
        await file.save(audioBuffer, {
          contentType: "audio/mpeg",
          metadata: {
            cacheControl: "public, max-age=3600",
          },
        });
        console.log(`✅ Audio uploaded to object storage: ${bucketName}/${fullObjectName}`);
      } catch (uploadError: any) {
        console.error("❌ Object storage upload failed:", uploadError.message || uploadError);
        console.error("❌ Upload error details:", JSON.stringify(uploadError, null, 2));
        throw uploadError;
      }

      // Generate a signed URL for HeyGen to access (valid for 1 hour)
      try {
        const signedUrl = await this.signObjectURL({
          bucketName,
          objectName: fullObjectName,
          method: "GET",
          ttlSec: 3600, // 1 hour should be enough for video generation
        });
        console.log(`✅ Signed URL generated for HeyGen`);
        return signedUrl;
      } catch (signError: any) {
        console.error("❌ Signed URL generation failed:", signError.message || signError);
        throw signError;
      }
    } catch (error: any) {
      console.error("❌ Error generating ElevenLabs audio:", error.message || error);
      console.error("❌ Error stack:", error.stack);
      console.error("❌ Error code:", error.code);
      return null;
    }
  }

  private parseObjectPath(path: string): { bucketName: string; objectName: string } {
    if (!path.startsWith("/")) {
      path = `/${path}`;
    }
    const pathParts = path.split("/");
    if (pathParts.length < 2) {
      throw new Error("Invalid path: must contain at least a bucket name");
    }
    const bucketName = pathParts[1];
    const objectName = pathParts.slice(2).join("/");
    return { bucketName, objectName };
  }

  private async signObjectURL({
    bucketName,
    objectName,
    method,
    ttlSec,
  }: {
    bucketName: string;
    objectName: string;
    method: "GET" | "PUT" | "DELETE" | "HEAD";
    ttlSec: number;
  }): Promise<string> {
    const request = {
      bucket_name: bucketName,
      object_name: objectName,
      method,
      expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
    };
    const response = await fetch(
      `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      }
    );
    if (!response.ok) {
      throw new Error(
        `Failed to sign object URL, errorcode: ${response.status}`
      );
    }
    const { signed_url: signedURL } = await response.json();
    return signedURL;
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
      if (!HEYGEN_VIDEO_API_KEY) {
        throw new Error("HEYGEN_VIDEO_API_KEY is not configured");
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

      // Create voice config based on useHeygenVoiceForLive toggle
      // false = use ElevenLabs (default), true = use HeyGen voice
      let voiceConfig: any;
      const useHeygenVoice = avatar.useHeygenVoiceForLive === true;
      
      if (!useHeygenVoice && avatar.elevenlabsVoiceId && elevenLabsClient) {
        // Use ElevenLabs voice - generate audio and upload to object storage
        console.log(`🎙️ Using ElevenLabs voice for video (${avatar.name}): ${avatar.elevenlabsVoiceId}`);
        const audioUrl = await this.generateElevenLabsAudioUrl(
          lesson.script,
          avatar.elevenlabsVoiceId,
          avatar.name
        );
        
        if (audioUrl) {
          voiceConfig = {
            type: "audio",
            audio_url: audioUrl,
          };
          console.log(`✅ Using ElevenLabs audio URL for HeyGen`);
        } else {
          // If ElevenLabs failed, check for HeyGen fallback
          const videoVoiceId = avatar.heygenVideoVoiceId || avatar.heygenVoiceId;
          if (videoVoiceId) {
            voiceConfig = {
              type: "text",
              input_text: lesson.script.slice(0, 5000),
              voice_id: videoVoiceId,
            };
            console.log(`⚠️ ElevenLabs failed, using avatar's HeyGen voice: ${videoVoiceId}`);
          } else {
            throw new Error(`ElevenLabs audio generation failed for ${avatar.name} and no HeyGen fallback voice is configured`);
          }
        }
      } else if (!useHeygenVoice && avatar.elevenlabsVoiceId && !elevenLabsClient) {
        // Avatar wants ElevenLabs but client is not available
        const videoVoiceId = avatar.heygenVideoVoiceId || avatar.heygenVoiceId;
        if (videoVoiceId) {
          voiceConfig = {
            type: "text",
            input_text: lesson.script.slice(0, 5000),
            voice_id: videoVoiceId,
          };
          console.log(`⚠️ ElevenLabs not configured, using avatar's HeyGen voice: ${videoVoiceId}`);
        } else {
          throw new Error(`ELEVENLABS_API_KEY not configured and no HeyGen fallback voice for ${avatar.name}`);
        }
      } else {
        // Use HeyGen voice (either by toggle or no ElevenLabs configured)
        const videoVoiceId = avatar.heygenVideoVoiceId || avatar.heygenVoiceId;
        if (!videoVoiceId) {
          throw new Error(`No voice configured for avatar ${avatar.name}. Please set either elevenlabsVoiceId or heygenVideoVoiceId.`);
        }
        
        voiceConfig = {
          type: "text",
          input_text: lesson.script.slice(0, 5000),
          voice_id: videoVoiceId,
        };
        
        console.log(`🎙️ Using HeyGen voice for video (${avatar.name}): ${videoVoiceId}${useHeygenVoice ? ' (toggle enabled)' : ''}`);
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

          // Update course status if all lessons are completed
          await this.updateCourseStatusIfComplete(lessonId);

          activePollingSet.delete(heygenVideoId);
          console.log(`✅ Video generation completed: ${heygenVideoId}`);
          
          // Send email notification for course video (await to ensure it completes)
          await this.sendCourseVideoReadyEmail(lessonId, video_url, thumbnail_url, durationInt);
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

        // Update course status if all lessons are completed
        await this.updateCourseStatusIfComplete(video.lessonId);

        console.log(`✅ Background check: Video ${heygenVideoId} completed`);
        
        // Send email notification for recovered video (await to ensure it completes)
        await this.sendCourseVideoReadyEmail(video.lessonId, video_url, thumbnail_url, durationInt);
        
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

  /**
   * Send email notification when course video is ready
   */
  private async sendCourseVideoReadyEmail(
    lessonId: string,
    videoUrl: string,
    thumbnailUrl?: string | null,
    duration?: number | null
  ): Promise<void> {
    try {
      if (!emailService.isAvailable()) {
        console.log('📧 Email service not available - skipping course video notification');
        return;
      }

      // Get lesson details
      const [lesson] = await db
        .select()
        .from(lessons)
        .where(eq(lessons.id, lessonId));

      if (!lesson) {
        console.log('📧 Lesson not found for email notification');
        return;
      }

      // Get course details
      const [course] = await db
        .select()
        .from(courses)
        .where(eq(courses.id, lesson.courseId));

      if (!course) {
        console.log('📧 Course not found for email notification');
        return;
      }

      // Get user
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, course.userId));

      if (!user || !user.email) {
        console.log(`📧 No email found for user ${course.userId} - skipping notification`);
        return;
      }

      // Get avatar name
      const avatar = await getAvatarById(course.avatarId);
      const avatarName = avatar?.name || 'AI Avatar';

      // Build topic from lesson title (handle null title)
      const lessonTitle = lesson.title || `Lesson ${lesson.order + 1}`;
      const topic = `${course.title} - ${lessonTitle}`;

      // Send the email
      const result = await emailService.sendVideoReadyEmail({
        toEmail: user.email,
        userName: user.firstName || undefined,
        topic,
        videoUrl,
        thumbnailUrl: thumbnailUrl || undefined,
        avatarName,
        duration: duration || undefined,
      });

      if (result.success) {
        console.log(`📧 Course video ready email sent to ${user.email} for: ${topic}`);
      } else {
        console.error(`📧 Failed to send course video email: ${result.error}`);
      }
    } catch (error: any) {
      console.error('📧 Error sending course video email notification:', error.message);
    }
  }

  /**
   * Update course status to "completed" if all lessons have completed videos
   */
  private async updateCourseStatusIfComplete(lessonId: string): Promise<void> {
    try {
      // Get the lesson to find the course
      const [lesson] = await db
        .select()
        .from(lessons)
        .where(eq(lessons.id, lessonId));

      if (!lesson) {
        return;
      }

      // Get all lessons for this course
      const courseLessons = await db
        .select()
        .from(lessons)
        .where(eq(lessons.courseId, lesson.courseId));

      // Check if all lessons are completed
      const allCompleted = courseLessons.every(l => l.status === "completed");

      if (allCompleted && courseLessons.length > 0) {
        // Calculate total duration from all videos
        const videoRecords = await db
          .select()
          .from(generatedVideos)
          .where(inArray(generatedVideos.lessonId, courseLessons.map(l => l.id)));

        const totalDuration = videoRecords.reduce((sum, v) => sum + (v.duration || 0), 0);

        // Update course to completed
        await db
          .update(courses)
          .set({
            status: "completed",
            totalLessons: courseLessons.length,
            totalDuration,
            updatedAt: new Date(),
          })
          .where(eq(courses.id, lesson.courseId));

        console.log(`✅ Course ${lesson.courseId} marked as completed (${courseLessons.length} lessons, ${totalDuration}s total)`);
      }
    } catch (error: any) {
      console.error('Error updating course status:', error.message);
    }
  }
}

export const videoGenerationService = new VideoGenerationService();
