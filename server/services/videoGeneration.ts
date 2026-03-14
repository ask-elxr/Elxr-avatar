import axios from "axios";
import { db } from "../db";
import { lessons, generatedVideos, avatarProfiles, courses, users } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { ElevenLabsClient } from "elevenlabs";
import { subscriptionService } from "./subscription";
import { formatVideoTitle } from "../utils/videoTitle";
import { emailService } from "./email";
import { getAvatarById } from "./avatars";
import type { Scene } from "./sceneSegmentation";
import { isFFmpegAvailable, getAudioDurationSec, postProcessBrollOverlay, type SceneTiming } from "./ffmpegPostProcess.js";

// HEYGEN_VIDEO_API_KEY is used for video creation (courses, chat videos)
const HEYGEN_VIDEO_API_KEY = process.env.HEYGEN_VIDEO_API_KEY;
// HEYGEN_API_KEY (main key) may have broader permissions for asset uploads
const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;
const HEYGEN_BASE_URL = "https://api.heygen.com/v2";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

const elevenLabsClient = ELEVENLABS_API_KEY ? new ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY }) : null;

// Track videos currently being polled to avoid duplicate polling
const activePollingSet = new Set<string>();

// Track count of videos in "generating" state to avoid unnecessary DB queries
// This allows the database to scale to zero when no videos are being generated
let knownGeneratingCount = 0;
let lastDbCheckTime = 0;
const DB_CHECK_INTERVAL_IDLE = 10 * 60 * 1000; // 10 minutes when idle (no known generating videos)
const DB_CHECK_INTERVAL_ACTIVE = 2 * 60 * 1000; // 2 minutes when active (videos being generated)

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
    "X-Api-Key": HEYGEN_API_KEY || HEYGEN_VIDEO_API_KEY || "",
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
        text: text.slice(0, 5000),
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.7,
          similarity_boost: 0.65,
        },
      });

      // Collect stream into buffer
      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        chunks.push(Buffer.from(chunk));
      }
      const audioBuffer = Buffer.concat(chunks);
      
      console.log(`✅ ElevenLabs audio generated: ${audioBuffer.length} bytes`);

      // Upload audio to HeyGen using the v1/asset endpoint
      // HeyGen expects RAW BINARY data, not multipart/form-data
      console.log(`📤 Uploading audio to HeyGen (${audioBuffer.length} bytes)...`);
      
      const uploadApiKey = HEYGEN_API_KEY || HEYGEN_VIDEO_API_KEY;
      console.log(`📤 Using API key: ${uploadApiKey?.slice(0, 8)}...`);
      
      const uploadResponse = await axios.post(
        "https://upload.heygen.com/v1/asset",
        audioBuffer,
        {
          headers: {
            "Content-Type": "audio/mpeg",
            "X-Api-Key": uploadApiKey,
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );

      const assetId = uploadResponse.data?.data?.asset_id || uploadResponse.data?.data?.id;
      if (assetId) {
        console.log(`✅ Audio uploaded to HeyGen: ${assetId}`);
        return assetId;
      }

      console.error("❌ No asset_id in HeyGen response:", uploadResponse.data);
      return null;
    } catch (error: any) {
      console.error("❌ Error generating/uploading ElevenLabs audio:", error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Generate ElevenLabs audio and upload to HeyGen, returning both the asset ID and raw buffer
   * Used in multi-scene mode to also measure audio duration for B-roll timing
   */
  private async generateElevenLabsAudioWithBuffer(text: string, voiceId: string, avatarName: string): Promise<{ assetId: string | null; audioBuffer: Buffer | null }> {
    if (!elevenLabsClient || !ELEVENLABS_API_KEY) {
      return { assetId: null, audioBuffer: null };
    }

    try {
      const audioStream = await elevenLabsClient.textToSpeech.convert(voiceId, {
        text: text.slice(0, 5000),
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.7,
          similarity_boost: 0.65,
        },
      });

      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        chunks.push(Buffer.from(chunk));
      }
      const audioBuffer = Buffer.concat(chunks);

      // Upload to HeyGen
      const uploadApiKey = HEYGEN_API_KEY || HEYGEN_VIDEO_API_KEY;
      const uploadResponse = await axios.post(
        "https://upload.heygen.com/v1/asset",
        audioBuffer,
        {
          headers: {
            "Content-Type": "audio/mpeg",
            "X-Api-Key": uploadApiKey,
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );

      const assetId = uploadResponse.data?.data?.asset_id || uploadResponse.data?.data?.id;
      if (assetId) {
        return { assetId, audioBuffer };
      }
      return { assetId: null, audioBuffer };
    } catch (error: any) {
      console.error("❌ Error generating/uploading ElevenLabs audio:", error.response?.data || error.message);
      return { assetId: null, audioBuffer: null };
    }
  }

  /**
   * Estimate script duration in seconds based on word count (~150 words/min)
   * Used as fallback when ffprobe is not available
   */
  private estimateScriptDuration(script: string): number {
    const wordCount = script.split(/\s+/).filter(w => w.length > 0).length;
    return (wordCount / 150) * 60;
  }

  /**
   * Upload an image URL to HeyGen and return the asset_id
   * HeyGen backgrounds require uploaded assets, not external URLs
   */
  private async uploadImageToHeyGen(imageUrl: string): Promise<string | null> {
    try {
      console.log(`🖼️ Downloading image for HeyGen upload: ${imageUrl.slice(0, 80)}...`);

      // Download the image
      const imageResponse = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        timeout: 30000,
      });

      const imageBuffer = Buffer.from(imageResponse.data);
      const contentType = imageResponse.headers["content-type"] || "image/jpeg";
      console.log(`🖼️ Image downloaded: ${imageBuffer.length} bytes (${contentType})`);

      // Upload to HeyGen
      const uploadApiKey = HEYGEN_API_KEY || HEYGEN_VIDEO_API_KEY;
      const uploadResponse = await axios.post(
        "https://upload.heygen.com/v1/asset",
        imageBuffer,
        {
          headers: {
            "Content-Type": contentType,
            "X-Api-Key": uploadApiKey,
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );

      const assetId = uploadResponse.data?.data?.asset_id || uploadResponse.data?.data?.id;
      if (assetId) {
        console.log(`✅ Image uploaded to HeyGen: ${assetId}`);
        return assetId;
      }

      console.error("❌ No asset_id in HeyGen image upload response:", uploadResponse.data);
      return null;
    } catch (error: any) {
      console.error("❌ Error uploading image to HeyGen:", error.response?.data || error.message);
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

      // Build video_inputs: multi-scene if scenes are defined, single scene otherwise
      const scenes = lesson.scenes as Scene[] | null;
      let videoInputs: any[];

      // Track per-scene timings for B-roll post-processing
      let sceneTimingsData: SceneTiming[] = [];

      if (scenes && Array.isArray(scenes) && scenes.length > 1) {
        // Multi-scene mode: build one HeyGen scene per segment
        const brollWithImages = scenes.filter(s => s.type === "broll" && s.brollImageUrl).length;
        const brollWithout = scenes.filter(s => s.type === "broll" && !s.brollImageUrl).length;
        console.log(`🎬 Building multi-scene video: ${scenes.length} scenes (${brollWithImages} B-roll with images, ${brollWithout} B-roll without images)`);
        videoInputs = [];

        for (let sceneIdx = 0; sceneIdx < scenes.length; sceneIdx++) {
          const scene = scenes[sceneIdx];
          // Each scene needs its own voice config with that scene's script
          let sceneVoice: any;
          let sceneDurationSec: number | null = null;
          if (voiceConfig.type === "audio") {
            // For ElevenLabs audio, generate separate audio per scene
            // Also capture the audio buffer to measure duration for B-roll timing
            const { assetId: sceneAudioAssetId, audioBuffer: sceneAudioBuffer } = await this.generateElevenLabsAudioWithBuffer(
              scene.script,
              avatar.elevenlabsVoiceId!,
              avatar.name
            );
            if (sceneAudioAssetId) {
              sceneVoice = { type: "audio", audio_asset_id: sceneAudioAssetId };
              // Measure audio duration for B-roll overlay timing
              if (sceneAudioBuffer && await isFFmpegAvailable()) {
                try {
                  sceneDurationSec = await getAudioDurationSec(sceneAudioBuffer);
                  console.log(`⏱️ Scene ${sceneIdx} audio duration: ${sceneDurationSec.toFixed(2)}s`);
                } catch (e: any) {
                  console.warn(`⚠️ Could not measure audio duration for scene ${sceneIdx}: ${e.message}`);
                }
              }
            } else {
              // Fallback to HeyGen TTS for this scene
              const fallbackVoiceId = avatar.heygenVideoVoiceId || avatar.heygenVoiceId;
              if (fallbackVoiceId) {
                sceneVoice = { type: "text", input_text: scene.script.slice(0, 5000), voice_id: fallbackVoiceId };
              } else {
                throw new Error(`Audio generation failed for scene and no HeyGen fallback voice`);
              }
            }
          } else {
            // HeyGen TTS: just use the scene's script text
            sceneVoice = { ...voiceConfig, input_text: scene.script.slice(0, 5000) };
          }

          // Record scene timing data
          sceneTimingsData.push({
            sceneIndex: sceneIdx,
            type: scene.type as "avatar" | "broll",
            durationSec: sceneDurationSec || this.estimateScriptDuration(scene.script),
            brollImageUrl: scene.brollImageUrl,
          });

          // For B-roll scenes, hide the avatar (shrink + push off-screen)
          // so only the background image + voiceover is visible
          const sceneCharacter = scene.type === "broll" && scene.brollImageUrl
            ? { ...characterConfig, scale: 0.01, offset: { x: -1, y: -1 } }
            : characterConfig;

          const sceneInput: any = {
            character: sceneCharacter,
            voice: sceneVoice,
          };

          // Add background image for B-roll scenes
          // Must upload to HeyGen first — external URLs are not supported
          if (scene.type === "broll" && scene.brollImageUrl) {
            const imageAssetId = await this.uploadImageToHeyGen(scene.brollImageUrl);
            if (imageAssetId) {
              sceneInput.background = {
                type: "image",
                image_asset_id: imageAssetId,
                fit: "crop",
              };
              console.log(`🖼️ B-roll scene: avatar hidden, background image: ${imageAssetId}`);
            } else {
              console.warn(`⚠️ Failed to upload B-roll image, scene will use default background`);
            }
          }

          videoInputs.push(sceneInput);
        }
      } else {
        // Single-scene mode (original behavior)
        videoInputs = [
          {
            character: characterConfig,
            voice: voiceConfig,
          },
        ];
      }

      const videoRequest = {
        video_inputs: videoInputs,
        dimension: {
          width: 1280,
          height: 720,
        },
        test: useTestMode,
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

      // Create generated video record (include scene timings for B-roll post-processing)
      const [generatedVideo] = await db
        .insert(generatedVideos)
        .values({
          lessonId,
          heygenVideoId: videoId,
          status: "generating",
          testVideo: useTestMode,
          sceneTimings: sceneTimingsData.length > 0 ? sceneTimingsData : null,
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

      // Track that we have a video generating (for smart background checker)
      this.incrementGeneratingCount();

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
          // Convert duration to integer (HeyGen returns decimal like 14.5)
          const durationInt = duration ? Math.round(duration) : null;

          // Update with HeyGen video URL first
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

          // Check if B-roll post-processing is needed
          let finalVideoUrl = video_url;
          const [videoRecord] = await db
            .select()
            .from(generatedVideos)
            .where(eq(generatedVideos.heygenVideoId, heygenVideoId));

          const timings = videoRecord?.sceneTimings as SceneTiming[] | null;
          const hasBrollScenes = timings?.some(s => s.type === "broll" && s.brollImageUrl);

          if (hasBrollScenes && await isFFmpegAvailable()) {
            try {
              console.log(`🎬 B-roll scenes detected — starting post-processing for ${heygenVideoId}`);
              await db
                .update(generatedVideos)
                .set({ status: "post-processing" })
                .where(eq(generatedVideos.heygenVideoId, heygenVideoId));

              const processedUrl = await postProcessBrollOverlay(video_url, timings!, lessonId);

              await db
                .update(generatedVideos)
                .set({ status: "completed", processedVideoUrl: processedUrl })
                .where(eq(generatedVideos.heygenVideoId, heygenVideoId));

              finalVideoUrl = processedUrl;
              console.log(`✅ B-roll post-processing completed: ${processedUrl}`);
            } catch (postErr: any) {
              console.error(`❌ B-roll post-processing failed, keeping raw HeyGen video:`, postErr.message);
              // Revert status to completed with raw video
              await db
                .update(generatedVideos)
                .set({ status: "completed" })
                .where(eq(generatedVideos.heygenVideoId, heygenVideoId));
            }
          }

          // Update lesson status
          await db
            .update(lessons)
            .set({ status: "completed" })
            .where(eq(lessons.id, lessonId));

          // Update course status if all lessons are completed
          await this.updateCourseStatusIfComplete(lessonId);

          activePollingSet.delete(heygenVideoId);
          this.decrementGeneratingCount();
          console.log(`✅ Video generation completed: ${heygenVideoId}`);

          // Send email notification for course video (await to ensure it completes)
          await this.sendCourseVideoReadyEmail(lessonId, finalVideoUrl, thumbnail_url, durationInt);
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
          this.decrementGeneratingCount();
          console.error(`❌ Video generation failed: ${heygenVideoId}`, error);
        } else if (attempts < maxAttempts) {
          // Still processing, check again in 5 seconds
          setTimeout(poll, 5000);
        } else {
          // Timeout - mark as timeout but don't delete from active set
          // Background checker will pick this up if it completes later
          console.log(`⏱️ Video generation timeout: ${heygenVideoId}`);
          activePollingSet.delete(heygenVideoId);
          this.decrementGeneratingCount();
        }
      } catch (error: any) {
        console.error("Error polling video status:", error.message);

        if (attempts < maxAttempts) {
          setTimeout(poll, 5000);
        } else {
          activePollingSet.delete(heygenVideoId);
          this.decrementGeneratingCount();
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
   * Increment known generating count when a video generation starts
   */
  incrementGeneratingCount(): void {
    knownGeneratingCount++;
    console.log(`📹 Video generating count: ${knownGeneratingCount}`);
  }

  /**
   * Decrement known generating count when a video completes or fails
   */
  decrementGeneratingCount(): void {
    knownGeneratingCount = Math.max(0, knownGeneratingCount - 1);
    console.log(`📹 Video generating count: ${knownGeneratingCount}`);
  }

  /**
   * Start background checker that periodically checks generating videos
   * Uses smart checking to avoid unnecessary DB queries when idle
   */
  startBackgroundChecker(): void {
    const check = async () => {
      const now = Date.now();
      
      // Skip check if we haven't waited long enough and no videos are generating
      // This allows the database to scale to zero when idle
      if (knownGeneratingCount === 0 && activePollingSet.size === 0 && 
          (now - lastDbCheckTime) < DB_CHECK_INTERVAL_IDLE) {
        return;
      }
      
      try {
        lastDbCheckTime = now;
        const generatingVideos = await db
          .select()
          .from(generatedVideos)
          .where(eq(generatedVideos.status, "generating"));

        // Sync our known count with reality
        knownGeneratingCount = generatingVideos.length;

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

    // Run initial check to sync state on startup
    check();
    
    // Use a single interval that respects the dynamic check logic
    setInterval(check, DB_CHECK_INTERVAL_ACTIVE);
    console.log("📹 Video background checker started (smart mode: 2min active / 10min idle)");
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
      videoUrl: video.processedVideoUrl || video.videoUrl || undefined,
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
