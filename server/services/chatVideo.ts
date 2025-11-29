import axios from "axios";
import { db } from "../db";
import { chatGeneratedVideos, avatarProfiles, conversations } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import { generateLessonScript } from "./rag";
import { getUserAvatarMemory } from "./memory";
import { getAvatarById } from "./avatars";

const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;
const HEYGEN_BASE_URL = "https://api.heygen.com/v2";

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

      const DEFAULT_VOICE_ID = "1bd001e7e50f421d891986aad5158bc8";
      
      // Use video-specific voice ID if available, otherwise fall back to general HeyGen voice
      const videoVoiceId = avatar.heygenVideoVoiceId || avatar.heygenVoiceId || DEFAULT_VOICE_ID;
      
      const voiceConfig: any = {
        type: "text",
        input_text: scriptResult.script.slice(0, 5000),
        voice_id: videoVoiceId,
      };
      
      console.log(`🎙️ Using HeyGen voice for chat video (${avatar.name}): ${videoVoiceId}`);

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
}

export const chatVideoService = new ChatVideoService();
