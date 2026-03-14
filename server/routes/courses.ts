import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db";
import {
  courses,
  lessons,
  generatedVideos,
  chatGeneratedVideos,
  insertCourseSchema,
  updateCourseSchema,
  insertLessonSchema,
  updateLessonSchema,
  type Course,
  type Lesson,
  type GeneratedVideo,
} from "@shared/schema";
import { eq, and, desc, or } from "drizzle-orm";
import { videoGenerationService } from "../services/videoGeneration";
import { chatVideoService } from "../services/chatVideo";
import { subscriptionService } from "../services/subscription";
import { isAuthenticated } from "../auth";
// Lazy imports to prevent module initialization from breaking the router
const getSceneSegmentation = () => import("../services/sceneSegmentation.js");
const getStockImages = () => import("../services/stockImages.js");
const getFalAi = () => import("../services/falAi.js");

export const coursesRouter = Router();

// Middleware to ensure every request has a userId in session
// isAuthenticated runs first and sets req.user with the resolved userId
coursesRouter.use((req: Request, res: Response, next: NextFunction) => {
  if (!req.session) {
    req.session = {} as any;
  }

  // 1. Use userId already resolved by isAuthenticated middleware
  const user = (req as any).user;
  if (user?.claims?.sub) {
    req.session.userId = user.claims.sub;
  }
  // 2. Memberstack header (in case isAuthenticated didn't set req.user)
  else {
    const memberstackId = (req.headers['x-member-id'] as string) || (req.query.member_id as string);
    if (memberstackId) {
      req.session.userId = `ms_${memberstackId}`;
    } else if (!req.session.userId) {
      // 3. Generate a persistent temp userId for anonymous users
      req.session.userId = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    }
  }

  next();
});

// Get all courses
// Courses are created by admins and visible to all authenticated users
// Only completed courses are shown to end users; admins see all
coursesRouter.get("/", async (req: Request, res: Response) => {
  try {
    // Check if caller is admin (via X-Admin-Secret header)
    const adminSecret = req.headers['x-admin-secret'] as string | undefined;
    const validAdminSecrets = (process.env.ADMIN_SECRET || '').split(',').map(s => s.trim()).filter(Boolean);
    const isAdmin = adminSecret ? validAdminSecrets.includes(adminSecret) : false;

    const userCourses = isAdmin
      ? await db.select().from(courses).orderBy(desc(courses.createdAt))
      : await db.select().from(courses).where(eq(courses.status, "completed")).orderBy(desc(courses.createdAt));

    // Fetch lessons and videos for each course
    const coursesWithLessons = await Promise.all(
      userCourses.map(async (course) => {
        // Get all lessons for this course
        const courseLessons = await db
          .select()
          .from(lessons)
          .where(eq(lessons.courseId, course.id))
          .orderBy(lessons.order);

        // Get video generation status for each lesson
        // Prioritize completed videos, then most recent
        const lessonsWithVideos = await Promise.all(
          courseLessons.map(async (lesson) => {
            // First try to get a completed video
            const [completedVideo] = await db
              .select()
              .from(generatedVideos)
              .where(and(
                eq(generatedVideos.lessonId, lesson.id),
                eq(generatedVideos.status, "completed")
              ))
              .orderBy(desc(generatedVideos.createdAt))
              .limit(1);

            if (completedVideo) {
              return { ...lesson, video: completedVideo };
            }

            // If no completed video, get the most recent one
            const [latestVideo] = await db
              .select()
              .from(generatedVideos)
              .where(eq(generatedVideos.lessonId, lesson.id))
              .orderBy(desc(generatedVideos.createdAt))
              .limit(1);

            return {
              ...lesson,
              video: latestVideo || null,
            };
          })
        );

        return {
          ...course,
          lessons: lessonsWithVideos,
        };
      })
    );

    res.json(coursesWithLessons);
  } catch (error) {
    console.error("Error fetching courses:", error);
    res.status(500).json({ error: "Failed to fetch courses" });
  }
});

// ===== CHAT VIDEO ENDPOINTS =====
// NOTE: These must be defined BEFORE /:id to avoid "chat-videos" being matched as a course ID

// Get pending/generating videos (for notification polling)
coursesRouter.get("/chat-videos/pending", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;

    const pendingVideos = await db
      .select()
      .from(chatGeneratedVideos)
      .where(and(
        eq(chatGeneratedVideos.userId, userId),
        or(
          eq(chatGeneratedVideos.status, "pending"),
          eq(chatGeneratedVideos.status, "generating")
        )
      ))
      .orderBy(desc(chatGeneratedVideos.createdAt));

    res.json(pendingVideos);
  } catch (error) {
    console.error("Error fetching pending videos:", error);
    res.status(500).json({ error: "Failed to fetch pending videos" });
  }
});

// Get failed chat-generated videos with error details (diagnostic endpoint)
coursesRouter.get("/chat-videos/failed", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;

    const videos = await db
      .select()
      .from(chatGeneratedVideos)
      .where(and(
        eq(chatGeneratedVideos.userId, userId),
        eq(chatGeneratedVideos.status, "failed")
      ))
      .orderBy(desc(chatGeneratedVideos.updatedAt))
      .limit(20);

    res.json(videos);
  } catch (error) {
    console.error("Error fetching failed chat videos:", error);
    res.status(500).json({ error: "Failed to fetch failed videos" });
  }
});

// Get all chat-generated videos for a user
coursesRouter.get("/chat-videos", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    const { status, avatarId } = req.query;

    const videos = await db
      .select()
      .from(chatGeneratedVideos)
      .where(eq(chatGeneratedVideos.userId, userId))
      .orderBy(desc(chatGeneratedVideos.createdAt));

    // Filter by status and avatarId if provided
    let filtered = videos;
    if (status) {
      filtered = filtered.filter(v => v.status === status);
    }
    if (avatarId) {
      filtered = filtered.filter(v => v.avatarId === avatarId);
    }

    res.json(filtered);
  } catch (error) {
    console.error("Error fetching chat videos:", error);
    res.status(500).json({ error: "Failed to fetch videos" });
  }
});

// Get status of a specific chat-generated video
coursesRouter.get("/chat-videos/:videoId", async (req: Request, res: Response) => {
  try {
    const { videoId } = req.params;
    const userId = req.session.userId;

    const [video] = await db
      .select()
      .from(chatGeneratedVideos)
      .where(and(
        eq(chatGeneratedVideos.id, videoId),
        eq(chatGeneratedVideos.userId, userId)
      ));

    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    res.json(video);
  } catch (error) {
    console.error("Error fetching chat video:", error);
    res.status(500).json({ error: "Failed to fetch video" });
  }
});

// Delete a chat-generated video
coursesRouter.delete("/chat-videos/:videoId", async (req: Request, res: Response) => {
  try {
    const { videoId } = req.params;
    const userId = req.session.userId;

    const [video] = await db
      .select()
      .from(chatGeneratedVideos)
      .where(and(
        eq(chatGeneratedVideos.id, videoId),
        eq(chatGeneratedVideos.userId, userId)
      ));

    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    await db
      .delete(chatGeneratedVideos)
      .where(eq(chatGeneratedVideos.id, videoId));

    res.json({ success: true, message: "Video deleted" });
  } catch (error) {
    console.error("Error deleting chat video:", error);
    res.status(500).json({ error: "Failed to delete video" });
  }
});

// Search stock images for B-roll (Pexels + optional fal.ai generation)
// NOTE: Must be defined BEFORE /:id to avoid "broll-search" being matched as a course ID
coursesRouter.get("/broll-search", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    if (!query) return res.status(400).json({ error: "Search query required" });

    const { searchStockImages } = await getStockImages();
    const images = await searchStockImages(query, 8);
    res.json({ images });
  } catch (error: any) {
    console.error("Error searching B-roll:", error);
    res.status(500).json({ error: "Failed to search images" });
  }
});

// Generate an AI B-roll image using fal.ai
coursesRouter.post("/broll-generate", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Prompt required" });

    const { generateBrollImage, isFalConfigured } = await getFalAi();
    if (!isFalConfigured()) {
      return res.status(503).json({ error: "AI image generation not configured" });
    }

    const image = await generateBrollImage(prompt);
    if (!image) {
      return res.status(500).json({ error: "Failed to generate image" });
    }

    res.json({ image });
  } catch (error: any) {
    console.error("Error generating B-roll:", error);
    res.status(500).json({ error: "Failed to generate image" });
  }
});

// Generate an AI course thumbnail using fal.ai
coursesRouter.post("/generate-thumbnail", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { title, description, avatarName } = req.body;
    if (!title) return res.status(400).json({ error: "Course title required" });

    const { generateCourseThumbnail, isFalConfigured } = await getFalAi();
    if (!isFalConfigured()) {
      return res.status(503).json({ error: "AI image generation not configured" });
    }

    const image = await generateCourseThumbnail(title, description || "", avatarName || "AI Avatar");
    if (!image) {
      return res.status(500).json({ error: "Failed to generate thumbnail" });
    }

    res.json({ image });
  } catch (error: any) {
    console.error("Error generating thumbnail:", error);
    res.status(500).json({ error: "Failed to generate thumbnail" });
  }
});

// Get a specific course with all lessons
coursesRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId;

    // Get course
    const [course] = await db
      .select()
      .from(courses)
      .where(and(eq(courses.id, id), eq(courses.userId, userId)));

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Get all lessons for this course
    const courseLessons = await db
      .select()
      .from(lessons)
      .where(eq(lessons.courseId, id))
      .orderBy(lessons.order);

    // Get video generation status for each lesson
    // Prioritize completed videos, then most recent
    const lessonsWithVideos = await Promise.all(
      courseLessons.map(async (lesson) => {
        // First try to get a completed video
        const [completedVideo] = await db
          .select()
          .from(generatedVideos)
          .where(and(
            eq(generatedVideos.lessonId, lesson.id),
            eq(generatedVideos.status, "completed")
          ))
          .orderBy(desc(generatedVideos.createdAt))
          .limit(1);

        if (completedVideo) {
          return { ...lesson, video: completedVideo };
        }

        // If no completed video, get the most recent one (pending/generating/failed)
        const [latestVideo] = await db
          .select()
          .from(generatedVideos)
          .where(eq(generatedVideos.lessonId, lesson.id))
          .orderBy(desc(generatedVideos.createdAt))
          .limit(1);

        return {
          ...lesson,
          video: latestVideo || null,
        };
      })
    );

    res.json({
      ...course,
      lessons: lessonsWithVideos,
    });
  } catch (error) {
    console.error("Error fetching course:", error);
    res.status(500).json({ error: "Failed to fetch course" });
  }
});

// Create a new course (user can create their own courses)
coursesRouter.post("/", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;

    const validatedData = insertCourseSchema.parse({
      ...req.body,
      userId,
    });

    const [newCourse] = await db
      .insert(courses)
      .values(validatedData)
      .returning();

    // Track usage for dashboard
    await subscriptionService.incrementUsage(userId, "course").catch(err => {
      console.warn("Failed to track course usage:", err.message);
    });

    // Auto-generate thumbnail in background (fire-and-forget)
    getFalAi().then(async ({ generateCourseThumbnail, isFalConfigured }) => {
      if (!isFalConfigured()) return;
      const image = await generateCourseThumbnail(
        newCourse.title,
        newCourse.description || "",
        req.body.avatarId || "AI Avatar",
      );
      if (image?.url) {
        await db.update(courses).set({ thumbnailUrl: image.url }).where(eq(courses.id, newCourse.id));
        console.log(`🎨 Auto-generated thumbnail for course "${newCourse.title}"`);
      }
    }).catch(err => console.warn("Thumbnail generation failed:", err.message));

    res.status(201).json(newCourse);
  } catch (error) {
    console.error("Error creating course:", error);
    res.status(400).json({ error: "Failed to create course" });
  }
});

// Update a course (user can update their own courses)
coursesRouter.put("/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId;

    const validatedData = updateCourseSchema.parse(req.body);

    const [updatedCourse] = await db
      .update(courses)
      .set({
        ...validatedData,
        updatedAt: new Date(),
      })
      .where(and(eq(courses.id, id), eq(courses.userId, userId)))
      .returning();

    if (!updatedCourse) {
      return res.status(404).json({ error: "Course not found" });
    }

    res.json(updatedCourse);
  } catch (error) {
    console.error("Error updating course:", error);
    res.status(400).json({ error: "Failed to update course" });
  }
});

// Delete a course (admin can delete any, users can delete their own)
coursesRouter.delete("/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId;

    // Check if caller is admin
    const adminSecret = req.headers['x-admin-secret'] as string | undefined;
    const validAdminSecrets = (process.env.ADMIN_SECRET || '').split(',').map(s => s.trim()).filter(Boolean);
    const isAdmin = adminSecret ? validAdminSecrets.includes(adminSecret) : false;

    const whereClause = isAdmin
      ? eq(courses.id, id)
      : and(eq(courses.id, id), eq(courses.userId, userId));

    const [deletedCourse] = await db
      .delete(courses)
      .where(whereClause)
      .returning();

    if (!deletedCourse) {
      return res.status(404).json({ error: "Course not found" });
    }

    res.json({ success: true, message: "Course deleted successfully" });
  } catch (error) {
    console.error("Error deleting course:", error);
    res.status(500).json({ error: "Failed to delete course" });
  }
});

// Add a lesson to a course (admin only)
coursesRouter.post("/:courseId/lessons", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { courseId } = req.params;
    const userId = req.session.userId;

    // Verify course ownership
    const [course] = await db
      .select()
      .from(courses)
      .where(and(eq(courses.id, courseId), eq(courses.userId, userId)));

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    const validatedData = insertLessonSchema.parse({
      ...req.body,
      courseId,
    });

    const [newLesson] = await db
      .insert(lessons)
      .values(validatedData)
      .returning();

    // Update course total lessons count
    await db
      .update(courses)
      .set({
        totalLessons: course.totalLessons + 1,
        updatedAt: new Date(),
      })
      .where(eq(courses.id, courseId));

    res.status(201).json(newLesson);
  } catch (error) {
    console.error("Error creating lesson:", error);
    res.status(400).json({ error: "Failed to create lesson" });
  }
});

// Update a lesson (admin only)
coursesRouter.put("/lessons/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId;

    // Verify ownership through course
    const [lesson] = await db
      .select()
      .from(lessons)
      .where(eq(lessons.id, id));

    if (!lesson) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    const [course] = await db
      .select()
      .from(courses)
      .where(and(eq(courses.id, lesson.courseId), eq(courses.userId, userId)));

    if (!course) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const validatedData = updateLessonSchema.parse(req.body);

    const [updatedLesson] = await db
      .update(lessons)
      .set({
        ...validatedData,
        updatedAt: new Date(),
      })
      .where(eq(lessons.id, id))
      .returning();

    res.json(updatedLesson);
  } catch (error) {
    console.error("Error updating lesson:", error);
    res.status(400).json({ error: "Failed to update lesson" });
  }
});

// Delete a lesson (admin only)
coursesRouter.delete("/lessons/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId;

    // Verify ownership through course
    const [lesson] = await db
      .select()
      .from(lessons)
      .where(eq(lessons.id, id));

    if (!lesson) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    const [course] = await db
      .select()
      .from(courses)
      .where(and(eq(courses.id, lesson.courseId), eq(courses.userId, userId)));

    if (!course) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const [deletedLesson] = await db
      .delete(lessons)
      .where(eq(lessons.id, id))
      .returning();

    // Update course total lessons count
    await db
      .update(courses)
      .set({
        totalLessons: Math.max(0, course.totalLessons - 1),
        updatedAt: new Date(),
      })
      .where(eq(courses.id, lesson.courseId));

    res.json({ success: true, message: "Lesson deleted successfully" });
  } catch (error) {
    console.error("Error deleting lesson:", error);
    res.status(500).json({ error: "Failed to delete lesson" });
  }
});

// Generate video for a lesson (admin only)
coursesRouter.post("/lessons/:id/generate-video", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id: lessonId } = req.params;
    const userId = req.session.userId;

    // Verify ownership through course
    const [lesson] = await db
      .select()
      .from(lessons)
      .where(eq(lessons.id, lessonId));

    if (!lesson) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    const [course] = await db
      .select()
      .from(courses)
      .where(and(eq(courses.id, lesson.courseId), eq(courses.userId, userId)));

    if (!course) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Validate lesson has script
    if (!lesson.script || lesson.script.trim().length === 0) {
      return res.status(400).json({ error: "Lesson script is required" });
    }

    // Start video generation
    const result = await videoGenerationService.generateVideoForLesson(lessonId);

    if (!result.success) {
      // Check for HeyGen trial limit error
      const errorStr = result.error || "";
      if (errorStr.includes("trial_video_limit_exceeded") || errorStr.includes("daily api trial limit")) {
        return res.status(429).json({ 
          error: "Daily video limit reached",
          code: "HEYGEN_TRIAL_LIMIT",
          message: "You've reached HeyGen's daily limit of 5 test videos. This limit resets at midnight UTC. You can still generate videos using production avatars (Dexter, Ann, June, etc.) which don't have this limitation."
        });
      }
      return res.status(500).json({ error: result.error || "Failed to start video generation" });
    }

    res.json({
      success: true,
      message: "Video generation started",
      videoId: result.videoId,
    });
  } catch (error) {
    console.error("Error starting video generation:", error);
    res.status(500).json({ error: "Failed to start video generation" });
  }
});

// Get video status for a lesson
coursesRouter.get("/lessons/:id/video-status", async (req: Request, res: Response) => {
  try {
    const { id: lessonId } = req.params;
    const status = await videoGenerationService.getVideoStatus(lessonId);
    res.json(status);
  } catch (error) {
    console.error("Error getting video status:", error);
    res.status(500).json({ error: "Failed to get video status" });
  }
});

// Segment a lesson script into scenes with B-roll suggestions
coursesRouter.post("/lessons/:id/segment-scenes", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id: lessonId } = req.params;
    const userId = req.session.userId;

    // Verify ownership
    const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId));
    if (!lesson) return res.status(404).json({ error: "Lesson not found" });

    const [course] = await db.select().from(courses)
      .where(and(eq(courses.id, lesson.courseId), eq(courses.userId, userId)));
    if (!course) return res.status(403).json({ error: "Unauthorized" });

    if (!lesson.script || lesson.script.trim().length === 0) {
      return res.status(400).json({ error: "Lesson must have a script before segmenting into scenes" });
    }

    const { segmentScriptIntoScenes } = await getSceneSegmentation();
    const { searchStockImages } = await getStockImages();
    const { generateBrollImage, isFalConfigured } = await getFalAi();
    const scenes = await segmentScriptIntoScenes(lesson.script);

    // Auto-generate or search for B-roll images for each scene
    // Prefer AI-generated images (fal.ai) when available, fall back to Pexels stock
    for (const scene of scenes) {
      if (scene.type === "broll" && scene.brollDescription) {
        // Try AI generation first
        if (isFalConfigured()) {
          const aiImage = await generateBrollImage(scene.brollDescription);
          if (aiImage) {
            scene.brollImageUrl = aiImage.url;
            continue;
          }
        }
        // Fall back to Pexels stock search
        if (scene.brollSearchQuery) {
          const images = await searchStockImages(scene.brollSearchQuery, 1);
          if (images.length > 0) {
            scene.brollImageUrl = images[0].src.landscape;
          }
        }
      }
    }

    // Save scenes to lesson
    await db.update(lessons)
      .set({ scenes: scenes as any, updatedAt: new Date() })
      .where(eq(lessons.id, lessonId));

    res.json({ success: true, scenes });
  } catch (error: any) {
    console.error("Error segmenting scenes:", error);
    // Return a user-friendly message instead of raw error details
    const msg = error.message || "";
    if (msg.includes("Unauthorized") || msg.includes("authentication")) {
      res.status(503).json({ error: "Service temporarily unavailable. Please try again in a moment." });
    } else {
      res.status(500).json({ error: "Failed to segment scenes. Please try again." });
    }
  }
});

// Save scene data for a lesson
coursesRouter.put("/lessons/:id/scenes", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id: lessonId } = req.params;
    const userId = req.session.userId;
    const { scenes } = req.body;

    const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId));
    if (!lesson) return res.status(404).json({ error: "Lesson not found" });

    const [course] = await db.select().from(courses)
      .where(and(eq(courses.id, lesson.courseId), eq(courses.userId, userId)));
    if (!course) return res.status(403).json({ error: "Unauthorized" });

    await db.update(lessons)
      .set({ scenes: scenes as any, updatedAt: new Date() })
      .where(eq(lessons.id, lessonId));

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error saving scenes:", error);
    res.status(500).json({ error: "Failed to save scenes" });
  }
});


// Generate AI script for a lesson using avatar's knowledge base (admin only)
coursesRouter.post("/generate-script", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    const { avatarId, courseId, topic, lessonTitle, targetDuration, additionalContext } = req.body;

    if (!avatarId || !topic || !lessonTitle) {
      return res.status(400).json({ 
        error: "Missing required fields: avatarId, topic, and lessonTitle are required" 
      });
    }

    // Authorization: If courseId is provided, verify the user owns the course
    if (courseId) {
      const [course] = await db
        .select()
        .from(courses)
        .where(and(eq(courses.id, courseId), eq(courses.userId, userId)));

      if (!course) {
        return res.status(403).json({ error: "Unauthorized - you don't have access to this course" });
      }

      // Verify the course uses the requested avatar
      if (course.avatarId !== avatarId) {
        return res.status(400).json({ error: "Avatar does not match the course instructor" });
      }
    }

    // Import avatar service and RAG service
    const { getAvatarById } = await import("../services/avatars.js");
    const { generateLessonScript } = await import("../services/rag.js");

    // Get avatar configuration
    const avatar = await getAvatarById(avatarId);
    if (!avatar) {
      return res.status(404).json({ error: "Avatar not found" });
    }

    // Verify the avatar is active
    if (!avatar.isActive) {
      return res.status(400).json({ error: "Avatar is not active" });
    }

    // Generate script using avatar's knowledge base
    const result = await generateLessonScript({
      avatarId,
      topic,
      lessonTitle,
      pineconeNamespaces: avatar.pineconeNamespaces || [],
      personalityPrompt: avatar.personalityPrompt,
      targetDuration: targetDuration || 60,
      additionalContext: additionalContext || ''
    });

    res.json({
      success: true,
      script: result.script,
      sources: result.sources,
      metadata: result.metadata
    });
  } catch (error: any) {
    console.error("Error generating script:", error);
    res.status(500).json({ 
      error: error.message || "Failed to generate script" 
    });
  }
});
