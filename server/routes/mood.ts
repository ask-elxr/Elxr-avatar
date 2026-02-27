import { Router, Request, Response } from "express";
import { db } from "../db";
import { moodEntries, insertMoodEntrySchema, moodTypeEnum } from "@shared/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import { moodResponseService } from "../services/moodResponse";
import { subscriptionService } from "../services/subscription";
import { logger } from "../logger";

export const moodRouter = Router();

moodRouter.use((req: Request, res: Response, next) => {
  if (!req.session) {
    req.session = {} as any;
  }
  
  const user = (req as any).user;
  if (user?.claims?.sub) {
    req.session.userId = user.claims.sub;
  } else if (!req.session.userId) {
    req.session.userId = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
  
  next();
});

moodRouter.post("/", async (req: Request, res: Response) => {
  const log = logger.child({ route: 'POST /api/mood', userId: req.session.userId });
  
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const parseResult = insertMoodEntrySchema.safeParse({
      ...req.body,
      userId,
    });

    if (!parseResult.success) {
      log.warn({ errors: parseResult.error.errors }, 'Invalid mood entry data');
      return res.status(400).json({ 
        error: "Invalid mood data", 
        details: parseResult.error.errors 
      });
    }

    const { mood, intensity, notes, avatarId } = parseResult.data;

    const user = (req as any).user;
    const userName = user?.claims?.first_name || undefined;

    log.info({ mood, intensity, avatarId }, 'Generating mood response');
    
    const avatarResponse = await moodResponseService.generateMoodResponse({
      mood,
      intensity: intensity || 3,
      notes: notes || undefined,
      avatarId: avatarId || undefined,
      userName,
    });

    const [entry] = await db
      .insert(moodEntries)
      .values({
        userId,
        avatarId: avatarId || null,
        mood,
        intensity: intensity || 3,
        notes: notes || null,
        avatarResponse,
      })
      .returning();

    // Track usage for dashboard
    await subscriptionService.incrementUsage(userId, "mood").catch(err => {
      log.warn({ error: err.message }, 'Failed to track mood usage');
    });

    log.info({ entryId: entry.id }, 'Mood entry created successfully');
    
    res.status(201).json(entry);
  } catch (error: any) {
    log.error({ error: error.message }, 'Error creating mood entry');
    res.status(500).json({ error: "Failed to log mood" });
  }
});

moodRouter.get("/", async (req: Request, res: Response) => {
  const log = logger.child({ route: 'GET /api/mood', userId: req.session.userId });
  
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const { range, limit: limitParam } = req.query;
    const limit = parseInt(limitParam as string) || 30;

    let dateFilter;
    if (range === '7d') {
      dateFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    } else if (range === '30d') {
      dateFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    const conditions = [eq(moodEntries.userId, userId)];
    if (dateFilter) {
      conditions.push(gte(moodEntries.createdAt, dateFilter));
    }

    const entries = await db
      .select()
      .from(moodEntries)
      .where(and(...conditions))
      .orderBy(desc(moodEntries.createdAt))
      .limit(limit);

    log.debug({ count: entries.length }, 'Fetched mood entries');
    
    res.json(entries);
  } catch (error: any) {
    log.error({ error: error.message }, 'Error fetching mood entries');
    res.status(500).json({ error: "Failed to fetch mood entries" });
  }
});

moodRouter.get("/stats", async (req: Request, res: Response) => {
  const log = logger.child({ route: 'GET /api/mood/stats', userId: req.session.userId });
  
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const recentEntries = await db
      .select()
      .from(moodEntries)
      .where(and(
        eq(moodEntries.userId, userId),
        gte(moodEntries.createdAt, sevenDaysAgo)
      ))
      .orderBy(desc(moodEntries.createdAt));

    const moodCounts: Record<string, number> = {};
    let totalIntensity = 0;
    let intensityCount = 0;

    for (const entry of recentEntries) {
      moodCounts[entry.mood] = (moodCounts[entry.mood] || 0) + 1;
      if (entry.intensity) {
        totalIntensity += entry.intensity;
        intensityCount++;
      }
    }

    const mostFrequentMood = Object.entries(moodCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || null;

    const stats = {
      totalEntries: recentEntries.length,
      averageIntensity: intensityCount > 0 ? Math.round((totalIntensity / intensityCount) * 10) / 10 : null,
      mostFrequentMood,
      moodDistribution: moodCounts,
      streak: calculateStreak(recentEntries),
    };

    log.debug(stats, 'Calculated mood stats');
    
    res.json(stats);
  } catch (error: any) {
    log.error({ error: error.message }, 'Error fetching mood stats');
    res.status(500).json({ error: "Failed to fetch mood stats" });
  }
});

function calculateStreak(entries: any[]): number {
  if (entries.length === 0) return 0;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let streak = 0;
  let currentDate = new Date(today);
  
  const entryDates = new Set(
    entries.map(e => {
      const d = new Date(e.createdAt);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    })
  );

  while (entryDates.has(currentDate.getTime())) {
    streak++;
    currentDate.setDate(currentDate.getDate() - 1);
  }
  
  return streak;
}
