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
import { formatVideoTitle } from "../utils/videoTitle";
import Anthropic from "@anthropic-ai/sdk";
import { objectStorageClient } from "../objectStorage";

// HEYGEN_VIDEO_API_KEY is used for video creation (courses, chat videos)
const HEYGEN_VIDEO_API_KEY = process.env.HEYGEN_VIDEO_API_KEY;
// HEYGEN_API_KEY (main key) may have broader permissions for asset uploads
const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;
const HEYGEN_BASE_URL = "https://api.heygen.com/v2";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

const elevenLabsClient = ELEVENLABS_API_KEY ? new ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY }) : null;

// Track count of chat videos in "generating" state to avoid unnecessary DB queries
// This allows the database to scale to zero when no videos are being generated
let knownChatGeneratingCount = 0;
let lastChatDbCheckTime = 0;
const CHAT_DB_CHECK_INTERVAL_IDLE = 10 * 60 * 1000; // 10 minutes when idle
const CHAT_DB_CHECK_INTERVAL_ACTIVE = 2 * 60 * 1000; // 2 minutes when active

// Talking Photo IDs - these require different API format (type: "talking_photo" instead of "avatar")
const TALKING_PHOTO_IDS = new Set([
  "84f913285ac944188a35ce5b58ceb861",
  "1da3f06fc92a4a9bbbe10f81b3b6a498",
  "57d0eb901fe84211b92b0a9d91f2e5c0",
  "ee40f646802241e1902a93b5cf05575c",
  "93cea50f10a14444888832d07925a94d", // Mark Kohl - Photo Avatar from HeyGen UI
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
    "X-Api-Key": HEYGEN_VIDEO_API_KEY || "",
  };

  /**
   * Increment known generating count when a video generation starts
   */
  incrementGeneratingCount(): void {
    knownChatGeneratingCount++;
    console.log(`📹 Chat video generating count: ${knownChatGeneratingCount}`);
  }

  /**
   * Decrement known generating count when a video completes or fails
   */
  decrementGeneratingCount(): void {
    knownChatGeneratingCount = Math.max(0, knownChatGeneratingCount - 1);
    console.log(`📹 Chat video generating count: ${knownChatGeneratingCount}`);
  }

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
      
      const uploadApiKey = HEYGEN_VIDEO_API_KEY || HEYGEN_API_KEY;
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
   * Analyze an image using Claude to generate a detailed description for video script generation
   */
  private async analyzeImageForScript(imageBase64: string, imageMimeType: string, topic: string): Promise<string> {
    // Validate inputs
    if (!imageBase64 || !imageMimeType) {
      console.warn("⚠️ Image analysis skipped: missing imageBase64 or imageMimeType");
      return "";
    }

    // Validate mime type
    const validMimeTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!validMimeTypes.includes(imageMimeType)) {
      console.warn(`⚠️ Image analysis skipped: unsupported mime type "${imageMimeType}"`);
      return "";
    }

    const anthropic = new Anthropic();
    
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: imageMimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: `The user wants a video about this image. The topic they mentioned is: "${topic}"

Please analyze this image in detail and provide:
1. A comprehensive description of what's shown in the image
2. Key elements, objects, people, or scenes visible
3. Any text, labels, or important details
4. The context or setting of the image
5. How this image relates to the topic "${topic}"

Provide a thorough but concise description that will help generate an engaging video script about this image. Focus on factual observations that would be useful for creating spoken narration.`,
            },
          ],
        },
      ],
    });

    const textContent = response.content.find(c => c.type === "text");
    return textContent?.text || "Unable to analyze the image";
  }

  async createVideoFromChat(params: {
    userId: string;
    avatarId: string;
    requestText: string;
    topic: string;
    imageBase64?: string;
    imageMimeType?: string;
  }): Promise<{ success: boolean; videoRecordId?: string; error?: string }> {
    try {
      if (!HEYGEN_VIDEO_API_KEY) {
        throw new Error("HEYGEN_VIDEO_API_KEY is not configured");
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

      this.generateVideoAsync(videoRecord.id, params.userId, avatar, params.topic, params.imageBase64, params.imageMimeType);

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
    topic: string,
    imageBase64?: string,
    imageMimeType?: string
  ): Promise<void> {
    try {
      await db
        .update(chatGeneratedVideos)
        .set({ status: "generating", updatedAt: new Date() })
        .where(eq(chatGeneratedVideos.id, videoRecordId));

      let userName: string | undefined;
      if (userId && !userId.startsWith('temp_') && !userId.startsWith('webflow_')) {
        const [user] = await db
          .select({ firstName: users.firstName, email: users.email })
          .from(users)
          .where(eq(users.id, userId));
        userName = user?.firstName || user?.email?.split('@')[0];
      }

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

      // If image is provided, analyze it with Claude to get description
      let imageDescription = '';
      if (imageBase64 && imageMimeType) {
        console.log(`📷 Analyzing image for video script generation...`);
        console.log(`📷 Image details: mimeType=${imageMimeType}, base64Length=${imageBase64.length}`);
        try {
          imageDescription = await this.analyzeImageForScript(imageBase64, imageMimeType, topic);
          if (imageDescription && imageDescription.length > 0) {
            console.log(`📷 Image analysis complete (${imageDescription.length} chars): ${imageDescription.substring(0, 150)}...`);
          } else {
            console.warn(`⚠️ Image analysis returned empty description`);
          }
        } catch (imageError: any) {
          console.error(`❌ Failed to analyze image: ${imageError.message}`);
          console.error(`❌ Stack trace: ${imageError.stack}`);
        }
      } else if (imageBase64 && !imageMimeType) {
        console.warn(`⚠️ Image base64 provided but no mimeType - skipping analysis`);
      } else if (!imageBase64 && imageMimeType) {
        console.warn(`⚠️ Image mimeType provided but no base64 data - skipping analysis`);
      }

      const additionalContext = `
Recent conversation:
${conversationContext}

User memory context:
${memoryContext}
${imageDescription ? `\nImage Analysis:\n${imageDescription}` : ''}
      `.trim();

      // Enhance topic with image description if available
      const enhancedTopic = imageDescription 
        ? `${topic} - based on image showing: ${imageDescription.substring(0, 200)}`
        : topic;

      const hasImageContent = !!imageDescription && imageDescription.length > 0;
      console.log(`📝 Generating script with hasImageContent=${hasImageContent}, additionalContext length=${additionalContext.length}`);
      
      const scriptResult = await generateLessonScript({
        avatarId: avatar.id,
        topic: enhancedTopic,
        lessonTitle: `Video about ${topic}`,
        pineconeNamespaces: avatar.pineconeNamespaces || [],
        personalityPrompt: avatar.personalityPrompt,
        targetDuration: 60,
        additionalContext,
        hasImageContent,
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

      // Create voice config based on useHeygenVoiceForLive toggle
      // false = use ElevenLabs (default), true = use HeyGen voice
      let voiceConfig: any;
      const useHeygenVoice = avatar.useHeygenVoiceForLive === true;
      
      if (!useHeygenVoice && avatar.elevenlabsVoiceId && elevenLabsClient) {
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
          // If ElevenLabs failed, check for HeyGen fallback
          const videoVoiceId = avatar.heygenVideoVoiceId || avatar.heygenVoiceId;
          if (videoVoiceId) {
            voiceConfig = {
              type: "text",
              input_text: scriptResult.script.slice(0, 5000),
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
            input_text: scriptResult.script.slice(0, 5000),
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
          input_text: scriptResult.script.slice(0, 5000),
          voice_id: videoVoiceId,
        };
        
        console.log(`🎙️ Using HeyGen voice for chat video (${avatar.name}): ${videoVoiceId}${useHeygenVoice ? ' (toggle enabled)' : ''}`);
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

      const videoTitle = formatVideoTitle({
        avatarName: avatar.name,
        topic,
        userName,
        userId,
        type: 'chat',
      });

      const videoRequest = {
        video_inputs: [
          {
            character: characterConfig,
            voice: voiceConfig,
          },
        ],
        dimension: {
          width: 1280,
          height: 720,
        },
        test: false,
        caption: false,
        title: videoTitle,
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

      // Track that we have a video generating (for smart background checker)
      this.incrementGeneratingCount();
      
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

          this.decrementGeneratingCount();
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

          this.decrementGeneratingCount();
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

          this.decrementGeneratingCount();
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
   * Uses smart checking to avoid unnecessary DB queries when idle
   */
  startBackgroundChecker(): void {
    const check = async () => {
      const now = Date.now();
      
      // Skip check if we haven't waited long enough and no videos are generating
      if (knownChatGeneratingCount === 0 && 
          (now - lastChatDbCheckTime) < CHAT_DB_CHECK_INTERVAL_IDLE) {
        return;
      }
      
      try {
        lastChatDbCheckTime = now;
        const generatingVideos = await db
          .select()
          .from(chatGeneratedVideos)
          .where(eq(chatGeneratedVideos.status, "generating"));

        // Sync our known count with reality
        knownChatGeneratingCount = generatingVideos.length;

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

    // Run initial check to sync state on startup
    check();
    
    // Use a single interval that respects the dynamic check logic
    setInterval(check, CHAT_DB_CHECK_INTERVAL_ACTIVE);
    console.log("📹 Chat video background checker started (smart mode: 2min active / 10min idle)");
  }
}

export const chatVideoService = new ChatVideoService();
