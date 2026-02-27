import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "./use-toast";
import type { ChatGeneratedVideo } from "@shared/schema";

const NOTIFICATION_WINDOW_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;
const SEEN_NOTIFICATIONS_KEY = "seen-video-notifications";
const GENERATING_CHAT_VIDEOS_KEY = "generating-chat-videos";

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
    console.error("Error parsing seen notifications:", e);
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
    console.error("Error saving seen notification:", e);
  }
}

function getGeneratingVideos(userId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const key = `${GENERATING_CHAT_VIDEOS_KEY}:${userId}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return new Set(parsed.map(String));
      }
    }
  } catch (e) {
    console.error("Error parsing generating chat videos:", e);
  }
  return new Set();
}

function setGeneratingVideos(userId: string, videoIds: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    const key = `${GENERATING_CHAT_VIDEOS_KEY}:${userId}`;
    const arr = Array.from(videoIds).slice(-50);
    localStorage.setItem(key, JSON.stringify(arr));
  } catch (e) {
    console.error("Error saving generating chat videos:", e);
  }
}

export function useChatVideoNotifications(userId: string | null) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const previousStatusMapRef = useRef<Map<string, string>>(new Map());
  const isInitialLoadRef = useRef(true);
  const previousUserIdRef = useRef<string | null>(null);

  const { data: videos = [] } = useQuery<ChatGeneratedVideo[]>({
    queryKey: ["chat-videos-notifications", userId],
    queryFn: async () => {
      const res = await fetch("/api/courses/chat-videos", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch videos");
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
    if (!userId || videos.length === 0) {
      return;
    }

    const seenNotifications = getSeenNotifications(userId);
    const generatingVideos = getGeneratingVideos(userId);
    const now = Date.now();
    let hasNewCompletions = false;
    const currentGenerating = new Set<string>();
    
    videos.forEach((video) => {
      const videoId = String(video.id);
      const previousStatus = previousStatusMapRef.current.get(videoId);
      const notAlreadySeen = !seenNotifications.has(videoId);

      if (video.status === "generating" || video.status === "pending" || video.status === "processing") {
        currentGenerating.add(videoId);
      }

      const wasGenerating = 
        (previousStatus === "generating" || previousStatus === "pending" || previousStatus === "processing") ||
        generatingVideos.has(videoId);

      const isNewlyCompleted = 
        video.status === "completed" && wasGenerating;

      const isRecentCompletion = 
        video.status === "completed" &&
        video.completedAt &&
        (now - new Date(video.completedAt).getTime()) < NOTIFICATION_WINDOW_MS;

      if (isNewlyCompleted && notAlreadySeen) {
        addSeenNotification(userId, videoId);
        toast({
          title: "Video Ready! 🎬",
          description: `Your video about "${video.topic}" is ready!`,
          duration: 20000,
          onClick: video.videoUrl ? () => window.open(video.videoUrl!, '_blank') : undefined,
        } as any);
        hasNewCompletions = true;
        console.log(`[Notification] Chat video completed: ${video.topic}`, video.videoUrl);
      } else if (isInitialLoadRef.current && isRecentCompletion && notAlreadySeen) {
        addSeenNotification(userId, videoId);
        toast({
          title: "Video Ready! 🎬",
          description: `Your video about "${video.topic}" is ready!`,
          duration: 20000,
          onClick: video.videoUrl ? () => window.open(video.videoUrl!, '_blank') : undefined,
        } as any);
        hasNewCompletions = true;
        console.log(`[Notification] Recent chat video detected: ${video.topic}`, video.videoUrl);
      }

      previousStatusMapRef.current.set(videoId, video.status);
    });

    setGeneratingVideos(userId, currentGenerating);

    if (hasNewCompletions) {
      queryClient.invalidateQueries({ queryKey: ["chat-videos-notifications", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/courses/chat-videos"] });
    }

    isInitialLoadRef.current = false;
  }, [videos, userId, toast, queryClient]);

  return {
    pendingVideos: videos.filter(v => v.status === "pending" || v.status === "generating" || v.status === "processing"),
    completedVideos: videos.filter(v => v.status === "completed"),
  };
}
