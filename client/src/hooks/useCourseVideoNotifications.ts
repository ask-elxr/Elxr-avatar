import { useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "./use-toast";
import type { Course, Lesson, GeneratedVideo } from "@shared/schema";

interface CourseWithLessons extends Course {
  lessons: (Lesson & { video: GeneratedVideo | null })[];
}

const NOTIFICATION_WINDOW_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;
const SEEN_NOTIFICATIONS_KEY = "seen-course-video-notifications";
const GENERATING_VIDEOS_KEY = "generating-course-videos";

function getSeenNotifications(userId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const key = `${SEEN_NOTIFICATIONS_KEY}:${userId}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return new Set(parsed.map(String));
      }
    }
  } catch (e) {
    console.error("Error parsing seen course notifications:", e);
  }
  return new Set();
}

function addSeenNotification(userId: string, videoId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const key = `${SEEN_NOTIFICATIONS_KEY}:${userId}`;
    const seen = getSeenNotifications(userId);
    seen.add(String(videoId));
    const arr = Array.from(seen).slice(-100);
    localStorage.setItem(key, JSON.stringify(arr));
  } catch (e) {
    console.error("Error saving seen course notification:", e);
  }
}

function getGeneratingVideos(userId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const key = `${GENERATING_VIDEOS_KEY}:${userId}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return new Set(parsed.map(String));
      }
    }
  } catch (e) {
    console.error("Error parsing generating course videos:", e);
  }
  return new Set();
}

function setGeneratingVideos(userId: string, videoIds: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    const key = `${GENERATING_VIDEOS_KEY}:${userId}`;
    const arr = Array.from(videoIds).slice(-50);
    localStorage.setItem(key, JSON.stringify(arr));
  } catch (e) {
    console.error("Error saving generating course videos:", e);
  }
}

export function useCourseVideoNotifications(userId: string | null) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const previousStatusMapRef = useRef<Map<string, string>>(new Map());
  const isInitialLoadRef = useRef(true);
  const previousUserIdRef = useRef<string | null>(null);

  const { data: courses = [] } = useQuery<CourseWithLessons[]>({
    queryKey: ["courses-notifications", userId],
    queryFn: async () => {
      const res = await fetch("/api/courses", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch courses");
      return res.json();
    },
    enabled: !!userId,
    refetchInterval: userId ? POLL_INTERVAL_MS : false,
    staleTime: 0,
  });

  useEffect(() => {
    if (previousUserIdRef.current !== userId) {
      previousStatusMapRef.current.clear();
      isInitialLoadRef.current = true;
      previousUserIdRef.current = userId;
    }
  }, [userId]);

  useEffect(() => {
    if (!userId || courses.length === 0) {
      return;
    }

    const seenNotifications = getSeenNotifications(userId);
    const generatingVideos = getGeneratingVideos(userId);
    const now = Date.now();
    let hasNewCompletions = false;
    const currentGenerating = new Set<string>();

    courses.forEach((course) => {
      course.lessons?.forEach((lesson) => {
        const video = lesson.video;
        if (!video) return;

        const videoId = String(video.id);
        const previousStatus = previousStatusMapRef.current.get(videoId);
        const notAlreadySeen = !seenNotifications.has(videoId);

        if (video.status === "generating" || video.status === "queued" || video.status === "processing") {
          currentGenerating.add(videoId);
        }
        
        const wasGenerating = 
          (previousStatus === "generating" || previousStatus === "queued" || previousStatus === "processing") ||
          generatingVideos.has(videoId);

        const isNewlyCompleted = 
          video.status === "completed" && wasGenerating;

        const isRecentCompletion = 
          video.status === "completed" &&
          video.generatedAt &&
          (now - new Date(video.generatedAt).getTime()) < NOTIFICATION_WINDOW_MS;

        if (isNewlyCompleted && notAlreadySeen) {
          addSeenNotification(userId, videoId);
          toast({
            title: "Course Video Ready! 🎬",
            description: `"${lesson.title}" from "${course.title}" is ready to watch.`,
            duration: 10000,
          });
          hasNewCompletions = true;
          console.log(`[Notification] Course video completed: ${lesson.title}`);
        } else if (isInitialLoadRef.current && isRecentCompletion && notAlreadySeen) {
          addSeenNotification(userId, videoId);
          toast({
            title: "Course Video Ready! 🎬",
            description: `"${lesson.title}" from "${course.title}" is ready to watch.`,
            duration: 10000,
          });
          hasNewCompletions = true;
          console.log(`[Notification] Recent course video detected: ${lesson.title}`);
        }

        previousStatusMapRef.current.set(videoId, video.status);
      });
    });

    setGeneratingVideos(userId, currentGenerating);

    if (hasNewCompletions) {
      queryClient.invalidateQueries({ queryKey: ["courses-notifications", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/courses/chat-videos"] });
    }

    isInitialLoadRef.current = false;
  }, [courses, userId, toast, queryClient]);

  const pendingLessonVideos = courses.flatMap(course => 
    (course.lessons || [])
      .filter(lesson => lesson.video && (lesson.video.status === "queued" || lesson.video.status === "generating" || lesson.video.status === "processing"))
      .map(lesson => ({
        courseTitle: course.title,
        lessonTitle: lesson.title,
        video: lesson.video!,
      }))
  );

  const completedLessonVideos = courses.flatMap(course => 
    (course.lessons || [])
      .filter(lesson => lesson.video && lesson.video.status === "completed")
      .map(lesson => ({
        courseTitle: course.title,
        lessonTitle: lesson.title,
        video: lesson.video!,
      }))
  );

  return {
    pendingLessonVideos,
    completedLessonVideos,
    courses,
  };
}
