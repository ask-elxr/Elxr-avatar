import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db";
import {
  courses,
  lessons,
  generatedVideos,
  insertCourseSchema,
  updateCourseSchema,
  insertLessonSchema,
  updateLessonSchema,
  type Course,
  type Lesson,
  type GeneratedVideo,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { videoGenerationService } from "../services/videoGeneration";

export const coursesRouter = Router();

// Middleware to ensure every request has a userId in session
coursesRouter.use((req: Request, res: Response, next: NextFunction) => {
  if (!req.session) {
    req.session = {} as any;
  }
  
  if (!req.session.userId) {
    // Generate a persistent temp userId for anonymous users
    req.session.userId = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
  
  next();
});

// Get all courses for a user
coursesRouter.get("/", async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    
    const userCourses = await db
      .select()
      .from(courses)
      .where(eq(courses.userId, userId))
      .orderBy(desc(courses.createdAt));

    res.json(userCourses);
  } catch (error) {
    console.error("Error fetching courses:", error);
    res.status(500).json({ error: "Failed to fetch courses" });
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
    const lessonsWithVideos = await Promise.all(
      courseLessons.map(async (lesson) => {
        const [video] = await db
          .select()
          .from(generatedVideos)
          .where(eq(generatedVideos.lessonId, lesson.id));

        return {
          ...lesson,
          video: video || null,
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

// Create a new course
coursesRouter.post("/", async (req: Request, res: Response) => {
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

    res.status(201).json(newCourse);
  } catch (error) {
    console.error("Error creating course:", error);
    res.status(400).json({ error: "Failed to create course" });
  }
});

// Update a course
coursesRouter.put("/:id", async (req: Request, res: Response) => {
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

// Delete a course
coursesRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId;

    const [deletedCourse] = await db
      .delete(courses)
      .where(and(eq(courses.id, id), eq(courses.userId, userId)))
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

// Add a lesson to a course
coursesRouter.post("/:courseId/lessons", async (req: Request, res: Response) => {
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

// Update a lesson
coursesRouter.put("/lessons/:id", async (req: Request, res: Response) => {
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

// Delete a lesson
coursesRouter.delete("/lessons/:id", async (req: Request, res: Response) => {
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

// Generate video for a lesson
coursesRouter.post("/lessons/:id/generate-video", async (req: Request, res: Response) => {
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
