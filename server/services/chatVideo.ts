import axios from "axios";
import { db } from "../db";
import { chatGeneratedVideos, avatarProfiles, conversations, users } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import { generateLessonScript } from "./rag";
import { getUserAvatarMemory } from "./memory";
import { getAvatarById } from "./avatars";
import { emailService } from "./email";
import { ElevenLabsClient } from "elevenlabs";
import { subscriptionService } from "./subscription";

const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;
const HEYGEN_BASE_URL = "https://api.heygen.com/v2";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

const elevenLabsClient = ELEVENLABS_API_KEY ? new ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY }) : null;

const TALKING_PHOTO_IDS = new Set([
  "84f913285ac944188a35ce5b58ceb861",
  "1da3f06fc92a4a9bbbe10f81b3b6a498",
  "57d0eb901fe84211b92b0a9d91f2e5c0",
  "ee40f646802241e1902a93b5cf05575c",
  "84d6a3a8f0d545a9900bf16176c7b7ae", // Mark Kohl - talking photo
]);

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

export class ChatVideoService {
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
      console.log(`🎙️ Generating ElevenLabs audio for chat video (${avatarName}) with voice ${voiceId}...`);
      
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
      console.error("❌ Error generating ElevenLabs audio for chat video:", error.message);
      return null;
    }
  }

  async createVideoFromChat(params: {
    userId: string;
    avatarId: string;
    requestText: string;
    topic: string;
  }): Promise<{ success: boolean; videoRecordId?: string; error?: string }> {
    try {
      if (!HEYGEN_API_KEY) {
        throw new Error("HEYGEN_API_KEY is not configured");
      }

      const avatar = await getAvatarById(params.avatarId);
      if (!avatar) {
        throw new Error("Avatar not found");
      }

      if (!avatar.heygenVideoAvatarId) {
        throw new Error("Avatar video generation ID not configured");
      }

      const [videoRecord] = await db
        .insert(chatGeneratedVideos)
        .values({
          userId: params.userId,
          avatarId: params.avatarId,
          requestText: params.requestText,
          topic: params.topic,
          status: "pending",
        })
        .returning();

      // Track usage for dashboard
      await subscriptionService.incrementUsage(params.userId, "video").catch(err => {
        console.warn("Failed to track chat video usage:", err.message);
      });

      this.generateVideoAsync(videoRecord.id, params.userId, avatar, params.topic);

      return {
        success: true,
        videoRecordId: videoRecord.id,
      };
    } catch (error: any) {
      console.error("Error creating chat video:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  private async generateVideoAsync(
    videoRecordId: string,
    userId: string,
    avatar: any,
    topic: string
  ): Promise<void> {
    try {
      await db
        .update(chatGeneratedVideos)
        .set({ status: "generating", updatedAt: new Date() })
        .where(eq(chatGeneratedVideos.id, videoRecordId));

      const recentConversations = await db
        .select()
        .from(conversations)
        .where(and(
          eq(conversations.userId, userId),
          eq(conversations.avatarId, avatar.id)
        ))
        .orderBy(desc(conversations.createdAt))
        .limit(10);

      const conversationContext = recentConversations
        .reverse()
        .map(c => `${c.role}: ${c.text}`)
        .join("\n");

      const memorySnippets = await getUserAvatarMemory(userId, avatar.id);
      const memoryContext = memorySnippets.slice(0, 5).join("\n");

      const additionalContext = `
Recent conversation:
${conversationContext}

User memory context:
${memoryContext}
      `.trim();

      const scriptResult = await generateLessonScript({
        avatarId: avatar.id,
        topic: topic,
        lessonTitle: `Video about ${topic}`,
        pineconeNamespaces: avatar.pineconeNamespaces || [],
        personalityPrompt: avatar.personalityPrompt,
        targetDuration: 60,
        additionalContext,
      });

      if (!scriptResult.script) {
        throw new Error("Failed to generate video script");
      }

      await db
        .update(chatGeneratedVideos)
        .set({ 
          script: scriptResult.script,
          status: "generating",
          updatedAt: new Date()
        })
        .where(eq(chatGeneratedVideos.id, videoRecordId));

      // Create voice config - prefer ElevenLabs if avatar has it configured
      let voiceConfig: any;
      
      if (avatar.elevenlabsVoiceId && elevenLabsClient) {
        // Use ElevenLabs voice - generate audio and upload to HeyGen
        console.log(`🎙️ Using ElevenLabs voice for chat video (${avatar.name}): ${avatar.elevenlabsVoiceId}`);
        const audioAssetId = await this.generateElevenLabsAudio(
          scriptResult.script,
          avatar.elevenlabsVoiceId,
          avatar.name
        );
        
        if (audioAssetId) {
          voiceConfig = {
            type: "audio",
            audio_asset_id: audioAssetId,
          };
          console.log(`✅ Using ElevenLabs audio asset for chat video: ${audioAssetId}`);
        } else {
          // Fallback to HeyGen voice if ElevenLabs failed
          const DEFAULT_VOICE_ID = "1bd001e7e50f421d891986aad5158bc8"; // Sara - Cheerful
          const videoVoiceId = avatar.heygenVideoVoiceId || avatar.heygenVoiceId || DEFAULT_VOICE_ID;
          voiceConfig = {
            type: "text",
            input_text: scriptResult.script.slice(0, 5000),
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
          input_text: scriptResult.script.slice(0, 5000),
          voice_id: videoVoiceId,
        };
        
        console.log(`🎙️ Using HeyGen voice for chat video (${avatar.name}): ${videoVoiceId}`);
      }

      const isTalkingPhoto = TALKING_PHOTO_IDS.has(avatar.heygenVideoAvatarId);
      
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
        test: false,
        caption: false,
        title: `Chat Video: ${topic}`,
      };

      console.log(`📹 Generating chat video for topic: ${topic}`);
      
      const response = await axios.post<HeyGenVideoResponse>(
        `${HEYGEN_BASE_URL}/video/generate`,
        videoRequest,
        { headers: this.headers }
      );

      if (response.data.error) {
        throw new Error(JSON.stringify(response.data.error));
      }

      const heygenVideoId = response.data.data.video_id;

      await db
        .update(chatGeneratedVideos)
        .set({ 
          heygenVideoId,
          status: "generating",
          updatedAt: new Date()
        })
        .where(eq(chatGeneratedVideos.id, videoRecordId));

      this.pollVideoStatus(heygenVideoId, videoRecordId, userId, avatar.id, topic);

    } catch (error: any) {
      console.error("Error in async video generation:", error.message);
      
      await db
        .update(chatGeneratedVideos)
        .set({
          status: "failed",
          errorMessage: error.message,
          updatedAt: new Date(),
        })
        .where(eq(chatGeneratedVideos.id, videoRecordId));
    }
  }

  private async pollVideoStatus(
    heygenVideoId: string, 
    videoRecordId: string,
    userId: string,
    avatarId: string,
    topic: string
  ): Promise<void> {
    const maxAttempts = 120;
    let attempts = 0;

    const poll = async () => {
      try {
        attempts++;

        const response = await axios.get<HeyGenVideoStatusResponse>(
          `https://api.heygen.com/v1/video_status.get?video_id=${heygenVideoId}`,
          { headers: this.headers }
        );

        const { status, video_url, thumbnail_url, duration, error } = response.data.data;

        if (status === "completed" && video_url) {
          const durationInt = duration ? Math.round(duration) : null;
          const now = new Date();
          
          await db
            .update(chatGeneratedVideos)
            .set({
              status: "completed",
              videoUrl: video_url,
              thumbnailUrl: thumbnail_url,
              duration: durationInt,
              updatedAt: now,
              completedAt: now,
            })
            .where(eq(chatGeneratedVideos.id, videoRecordId));

          await db.insert(conversations).values({
            userId,
            avatarId,
            role: "assistant",
            text: `🎬 Your video about "${topic}" is ready! Click below to watch it.`,
            metadata: {
              type: "video-ready",
              videoRecordId,
              videoUrl: video_url,
              thumbnailUrl: thumbnail_url,
              duration: durationInt,
              topic,
            },
          });

          console.log(`✅ Chat video completed: ${heygenVideoId}`);
          
          // Send email notification if user has email
          this.sendVideoReadyEmail(userId, avatarId, topic, video_url, thumbnail_url, durationInt);
        } else if (status === "failed") {
          await db
            .update(chatGeneratedVideos)
            .set({
              status: "failed",
              errorMessage: error || "Video generation failed",
              updatedAt: new Date(),
            })
            .where(eq(chatGeneratedVideos.id, videoRecordId));

          await db.insert(conversations).values({
            userId,
            avatarId,
            role: "assistant",
            text: `I'm sorry, but I wasn't able to create the video about "${topic}". Would you like me to try again?`,
            metadata: {
              type: "video-failed",
              videoRecordId,
              topic,
            },
          });

          console.error(`❌ Chat video failed: ${heygenVideoId}`, error);
        } else if (attempts < maxAttempts) {
          setTimeout(poll, 5000);
        } else {
          await db
            .update(chatGeneratedVideos)
            .set({
              status: "failed",
              errorMessage: "Video generation timed out",
              updatedAt: new Date(),
            })
            .where(eq(chatGeneratedVideos.id, videoRecordId));

          console.error(`⏰ Chat video timed out: ${heygenVideoId}`);
        }
      } catch (error: any) {
        console.error("Error polling video status:", error.message);
        if (attempts < maxAttempts) {
          setTimeout(poll, 10000);
        }
      }
    };

    setTimeout(poll, 5000);
  }

  async getVideoStatus(videoRecordId: string): Promise<{
    status: string;
    videoUrl?: string;
    thumbnailUrl?: string;
    duration?: number;
    error?: string;
  }> {
    const [video] = await db
      .select()
      .from(chatGeneratedVideos)
      .where(eq(chatGeneratedVideos.id, videoRecordId));

    if (!video) {
      return { status: "not_found" };
    }

    return {
      status: video.status,
      videoUrl: video.videoUrl || undefined,
      thumbnailUrl: video.thumbnailUrl || undefined,
      duration: video.duration || undefined,
      error: video.errorMessage || undefined,
    };
  }

  async getUserVideos(userId: string): Promise<any[]> {
    const videos = await db
      .select()
      .from(chatGeneratedVideos)
      .where(eq(chatGeneratedVideos.userId, userId))
      .orderBy(desc(chatGeneratedVideos.createdAt));

    return videos;
  }

  private async sendVideoReadyEmail(
    userId: string,
    avatarId: string,
    topic: string,
    videoUrl: string,
    thumbnailUrl?: string | null,
    duration?: number | null
  ): Promise<void> {
    try {
      // Skip if email service not available
      if (!emailService.isAvailable()) {
        console.log('📧 Email service not available - skipping notification');
        return;
      }

      // Skip for anonymous/temp users
      if (userId.startsWith('temp_')) {
        console.log('📧 Skipping email for anonymous user');
        return;
      }

      // Get user email
      const [user] = await db
        .select({ email: users.email, firstName: users.firstName })
        .from(users)
        .where(eq(users.id, userId));

      if (!user?.email) {
        console.log(`📧 No email found for user ${userId} - skipping notification`);
        return;
      }

      // Get avatar name
      const avatar = await getAvatarById(avatarId);
      const avatarName = avatar?.name || 'AI Avatar';

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
        console.log(`📧 Video ready email sent to ${user.email}`);
      } else {
        console.error(`📧 Failed to send email: ${result.error}`);
      }
    } catch (error: any) {
      console.error('📧 Error sending video ready email:', error.message);
      // Don't throw - email failure shouldn't break the video completion flow
    }
  }

  /**
   * Check and update status for a specific chat video from HeyGen
   */
  async checkAndUpdateVideoStatus(heygenVideoId: string): Promise<boolean> {
    try {
      const response = await axios.get<HeyGenVideoStatusResponse>(
        `https://api.heygen.com/v1/video_status.get?video_id=${heygenVideoId}`,
        { headers: this.headers }
      );

      const { status, video_url, thumbnail_url, duration, error } = response.data.data;
      
      // Find the video record
      const [video] = await db
        .select()
        .from(chatGeneratedVideos)
        .where(eq(chatGeneratedVideos.heygenVideoId, heygenVideoId));
      
      if (!video) {
        console.log(`⚠️ No chat video record found for HeyGen ID: ${heygenVideoId}`);
        return false;
      }

      if (status === "completed" && video_url) {
        const durationInt = duration ? Math.round(duration) : null;
        const now = new Date();
        
        await db
          .update(chatGeneratedVideos)
          .set({
            status: "completed",
            videoUrl: video_url,
            thumbnailUrl: thumbnail_url,
            duration: durationInt,
            updatedAt: now,
            completedAt: now,
          })
          .where(eq(chatGeneratedVideos.id, video.id));

        // Add conversation message about video ready
        await db.insert(conversations).values({
          userId: video.userId,
          avatarId: video.avatarId,
          role: "assistant",
          text: `🎬 Your video about "${video.topic}" is ready! Click below to watch it.`,
          metadata: {
            type: "video-ready",
            videoRecordId: video.id,
            videoUrl: video_url,
            thumbnailUrl: thumbnail_url,
            duration: durationInt,
            topic: video.topic,
          },
        });

        console.log(`✅ Chat video recovered from stuck state: ${heygenVideoId}`);
        
        // Send email notification
        this.sendVideoReadyEmail(video.userId, video.avatarId, video.topic, video_url, thumbnail_url, durationInt);
        return true;
      } else if (status === "failed") {
        await db
          .update(chatGeneratedVideos)
          .set({
            status: "failed",
            errorMessage: error || "Video generation failed",
            updatedAt: new Date(),
          })
          .where(eq(chatGeneratedVideos.id, video.id));
        console.log(`❌ Chat video marked as failed: ${heygenVideoId}`);
        return true;
      }
      
      return false; // Still processing
    } catch (error: any) {
      console.error(`Error checking chat video status for ${heygenVideoId}:`, error.message);
      return false;
    }
  }

  /**
   * Start background checker that periodically checks generating chat videos
   */
  startBackgroundChecker(): void {
    const CHECK_INTERVAL = 2 * 60 * 1000; // 2 minutes

    const check = async () => {
      try {
        const generatingVideos = await db
          .select()
          .from(chatGeneratedVideos)
          .where(eq(chatGeneratedVideos.status, "generating"));

        if (generatingVideos.length > 0) {
          console.log(`🔄 Chat video background check: ${generatingVideos.length} videos in generating state`);
          
          for (const video of generatingVideos) {
            if (video.heygenVideoId) {
              await this.checkAndUpdateVideoStatus(video.heygenVideoId);
            }
          }
        }
      } catch (error: any) {
        console.error("Chat video background checker error:", error.message);
      }
    };

    // Run check immediately and then every 2 minutes
    check();
    setInterval(check, CHECK_INTERVAL);
    console.log("📹 Chat video background checker started (interval: 2 minutes)");
  }
}

export const chatVideoService = new ChatVideoService();
