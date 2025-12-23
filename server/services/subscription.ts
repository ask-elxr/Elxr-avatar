import { db } from "../db";
import { 
  subscriptionPlans, 
  userSubscriptions, 
  usagePeriods, 
  users,
  type SubscriptionPlan,
  type UserSubscription,
  type UsagePeriod,
  type User
} from "@shared/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { logger } from "../logger";

export interface UserPlanInfo {
  plan: SubscriptionPlan | null;
  subscription: UserSubscription | null;
  usage: UsagePeriod | null;
  isExpired: boolean;
  canUseFeatures: boolean;
  selectedAvatarId: string | null;
  limits: {
    videosRemaining: number | null;
    coursesRemaining: number | null;
    chatSessionsRemaining: number | null;
    maxLessonsPerCourse: number | null;
  };
}

class SubscriptionService {
  async initializePlans(): Promise<void> {
    const existingPlans = await db.select().from(subscriptionPlans);
    if (existingPlans.length > 0) {
      logger.info({ count: existingPlans.length }, "Subscription plans already exist");
      return;
    }

    const plans = [
      {
        slug: "free",
        name: "1-Hour Free Trial",
        description: "Try one avatar for 1 hour with limited features",
        priceMonthly: 0,
        durationHours: 1,
        avatarLimit: 1,
        videoLimit: 0,
        courseLimit: 2,
        courseLessonLimit: 2,
        chatSessionLimit: 100,
        features: { canViewContent: true, canCreateContent: true },
        isActive: true,
      },
      {
        slug: "basic",
        name: "Basic Plan",
        description: "One avatar with generous monthly limits",
        priceMonthly: 2900, // $29.00
        durationHours: null,
        avatarLimit: 1,
        videoLimit: 50,
        courseLimit: 50,
        courseLessonLimit: null, // No lesson limit per course
        chatSessionLimit: 1000,
        features: { canViewContent: true, canCreateContent: true, priority: false },
        isActive: true,
      },
      {
        slug: "pro",
        name: "Pro Plan",
        description: "Unlimited access to all avatars and features",
        priceMonthly: 4900, // $49.00
        durationHours: null,
        avatarLimit: null, // Unlimited
        videoLimit: null, // Unlimited
        courseLimit: null, // Unlimited
        courseLessonLimit: null,
        chatSessionLimit: null, // Unlimited
        features: { canViewContent: true, canCreateContent: true, priority: true, unlimited: true },
        isActive: true,
      },
    ];

    for (const plan of plans) {
      await db.insert(subscriptionPlans).values(plan);
    }

    logger.info({ count: plans.length }, "Initialized subscription plans");
  }

  async getPlans(): Promise<SubscriptionPlan[]> {
    return db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true));
  }

  async getPlanBySlug(slug: string): Promise<SubscriptionPlan | null> {
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.slug, slug));
    return plan || null;
  }

  async getUserSubscription(userId: string): Promise<UserSubscription | null> {
    const [subscription] = await db
      .select()
      .from(userSubscriptions)
      .where(eq(userSubscriptions.userId, userId))
      .orderBy(desc(userSubscriptions.createdAt))
      .limit(1);
    return subscription || null;
  }

  async getCurrentUsagePeriod(userId: string): Promise<UsagePeriod | null> {
    const now = new Date();
    const [period] = await db
      .select()
      .from(usagePeriods)
      .where(
        and(
          eq(usagePeriods.userId, userId),
          lte(usagePeriods.periodStart, now),
          gte(usagePeriods.periodEnd, now)
        )
      );
    return period || null;
  }

  async createOrGetUsagePeriod(userId: string, subscriptionId: string | null): Promise<UsagePeriod> {
    let period = await this.getCurrentUsagePeriod(userId);
    if (period) return period;

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const [newPeriod] = await db
      .insert(usagePeriods)
      .values({
        userId,
        subscriptionId,
        periodStart,
        periodEnd,
      })
      .returning();

    return newPeriod;
  }

  async getUserPlanInfo(userId: string): Promise<UserPlanInfo> {
    const subscription = await this.getUserSubscription(userId);
    let plan: SubscriptionPlan | null = null;
    let usage: UsagePeriod | null = null;
    let isExpired = false;
    let canUseFeatures = true;

    if (subscription) {
      plan = await this.getPlanById(subscription.planId);
      usage = await this.getCurrentUsagePeriod(userId);

      if (subscription.expiresAt && new Date(subscription.expiresAt) < new Date()) {
        isExpired = true;
        canUseFeatures = plan?.slug === "free" ? false : true; // Free trial fully expires
      }

      if (subscription.status === "cancelled" || subscription.status === "expired") {
        isExpired = true;
        if (plan?.slug === "free") {
          canUseFeatures = false;
        }
      }
    } else {
      plan = await this.getPlanBySlug("free");
    }

    const limits = this.calculateRemainingLimits(plan, usage);

    return {
      plan,
      subscription,
      usage,
      isExpired,
      canUseFeatures,
      selectedAvatarId: subscription?.selectedAvatarId || null,
      limits,
    };
  }

  async getPlanById(planId: string): Promise<SubscriptionPlan | null> {
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId));
    return plan || null;
  }

  calculateRemainingLimits(plan: SubscriptionPlan | null, usage: UsagePeriod | null): UserPlanInfo["limits"] {
    if (!plan) {
      return {
        videosRemaining: 0,
        coursesRemaining: 0,
        chatSessionsRemaining: 0,
        maxLessonsPerCourse: 2,
      };
    }

    const videosRemaining = plan.videoLimit === null 
      ? null 
      : Math.max(0, plan.videoLimit - (usage?.videosCreated || 0));
    
    const coursesRemaining = plan.courseLimit === null 
      ? null 
      : Math.max(0, plan.courseLimit - (usage?.coursesCreated || 0));
    
    const chatSessionsRemaining = plan.chatSessionLimit === null 
      ? null 
      : Math.max(0, plan.chatSessionLimit - (usage?.chatSessionsUsed || 0));

    return {
      videosRemaining,
      coursesRemaining,
      chatSessionsRemaining,
      maxLessonsPerCourse: plan.courseLessonLimit,
    };
  }

  async startFreeTrial(userId: string, selectedAvatarId: string): Promise<UserSubscription> {
    const freePlan = await this.getPlanBySlug("free");
    if (!freePlan) {
      throw new Error("Free plan not found");
    }

    const existingSubscription = await this.getUserSubscription(userId);
    if (existingSubscription) {
      throw new Error("User already has a subscription");
    }

    // Ensure user exists in users table before creating subscription
    // This handles anonymous/webflow users who may not have a users record yet
    const [existingUser] = await db.select().from(users).where(eq(users.id, userId));
    if (!existingUser) {
      await db.insert(users).values({
        id: userId,
        role: "user",
      });
      logger.info({ userId }, "Created user record for subscription");
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + (freePlan.durationHours || 1) * 60 * 60 * 1000);

    const [subscription] = await db
      .insert(userSubscriptions)
      .values({
        userId,
        planId: freePlan.id,
        status: "trial",
        selectedAvatarId,
        expiresAt,
      })
      .returning();

    await db.update(users)
      .set({ 
        trialStartedAt: now,
        currentPlanSlug: "free",
        updatedAt: now,
      })
      .where(eq(users.id, userId));

    await this.createOrGetUsagePeriod(userId, subscription.id);

    logger.info({ userId, avatarId: selectedAvatarId }, "Started free trial");
    return subscription;
  }

  async selectAvatar(userId: string, avatarId: string): Promise<void> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) {
      throw new Error("No subscription found");
    }

    const plan = await this.getPlanById(subscription.planId);
    if (plan?.avatarLimit === null) {
      return;
    }

    await db
      .update(userSubscriptions)
      .set({ 
        selectedAvatarId: avatarId,
        updatedAt: new Date(),
      })
      .where(eq(userSubscriptions.id, subscription.id));

    logger.info({ userId, avatarId }, "Avatar selected for subscription");
  }

  async canAccessAvatar(userId: string, avatarId: string): Promise<boolean> {
    const planInfo = await this.getUserPlanInfo(userId);
    
    if (!planInfo.plan) return false;
    if (!planInfo.canUseFeatures) return false;

    if (planInfo.plan.avatarLimit === null) {
      return true;
    }

    if (!planInfo.selectedAvatarId) {
      return false;
    }

    return planInfo.selectedAvatarId === avatarId;
  }

  async incrementUsage(userId: string, type: "video" | "course" | "chat" | "mood", amount: number = 1): Promise<void> {
    const subscription = await this.getUserSubscription(userId);
    const period = await this.createOrGetUsagePeriod(userId, subscription?.id || null);

    const updates: Record<string, number> = {};
    switch (type) {
      case "video":
        updates.videosCreated = (period.videosCreated || 0) + amount;
        break;
      case "course":
        updates.coursesCreated = (period.coursesCreated || 0) + amount;
        break;
      case "chat":
        updates.chatSessionsUsed = (period.chatSessionsUsed || 0) + amount;
        break;
      case "mood":
        updates.moodEntriesLogged = (period.moodEntriesLogged || 0) + amount;
        break;
    }

    await db
      .update(usagePeriods)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(usagePeriods.id, period.id));
  }

  async checkLimit(userId: string, type: "video" | "course" | "chat"): Promise<{ allowed: boolean; remaining: number | null; message?: string }> {
    const planInfo = await this.getUserPlanInfo(userId);

    if (!planInfo.canUseFeatures) {
      return { 
        allowed: false, 
        remaining: 0, 
        message: planInfo.isExpired 
          ? "Your trial has expired. Please upgrade to continue using features." 
          : "You need an active subscription to use this feature."
      };
    }

    let remaining: number | null = null;
    let limitName = "";

    switch (type) {
      case "video":
        remaining = planInfo.limits.videosRemaining;
        limitName = "video";
        break;
      case "course":
        remaining = planInfo.limits.coursesRemaining;
        limitName = "course";
        break;
      case "chat":
        remaining = planInfo.limits.chatSessionsRemaining;
        limitName = "chat session";
        break;
    }

    if (remaining === null) {
      return { allowed: true, remaining: null };
    }

    if (remaining <= 0) {
      return { 
        allowed: false, 
        remaining: 0, 
        message: `You've reached your monthly ${limitName} limit. Upgrade to Pro for unlimited access.`
      };
    }

    return { allowed: true, remaining };
  }

  async updateUserLastActive(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ lastActiveAt: new Date() })
      .where(eq(users.id, userId));
  }

  async upgradeSubscription(userId: string, planSlug: string, memberstackSubscriptionId?: string): Promise<UserSubscription> {
    const plan = await this.getPlanBySlug(planSlug);
    if (!plan) {
      throw new Error(`Plan ${planSlug} not found`);
    }

    // Ensure user exists in database (handles anonymous sessions)
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    
    if (!existingUser) {
      // Create user record for anonymous session
      await db.insert(users).values({
        id: userId,
        role: "user",
        currentPlanSlug: "free",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      logger.info({ userId }, "Created user record for anonymous session");
    }

    const existingSubscription = await this.getUserSubscription(userId);
    
    const now = new Date();
    const renewsAt = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

    if (existingSubscription) {
      await db
        .update(userSubscriptions)
        .set({
          planId: plan.id,
          status: "active",
          memberstackSubscriptionId,
          selectedAvatarId: plan.avatarLimit === null ? null : existingSubscription.selectedAvatarId,
          expiresAt: null,
          renewsAt,
          updatedAt: now,
        })
        .where(eq(userSubscriptions.id, existingSubscription.id));

      const [updated] = await db
        .select()
        .from(userSubscriptions)
        .where(eq(userSubscriptions.id, existingSubscription.id));

      await db
        .update(users)
        .set({ currentPlanSlug: planSlug, updatedAt: now })
        .where(eq(users.id, userId));

      logger.info({ userId, planSlug }, "Subscription upgraded");
      return updated;
    } else {
      const [subscription] = await db
        .insert(userSubscriptions)
        .values({
          userId,
          planId: plan.id,
          memberstackSubscriptionId,
          status: "active",
          renewsAt,
        })
        .returning();

      await db
        .update(users)
        .set({ currentPlanSlug: planSlug, updatedAt: now })
        .where(eq(users.id, userId));

      await this.createOrGetUsagePeriod(userId, subscription.id);

      logger.info({ userId, planSlug }, "New subscription created");
      return subscription;
    }
  }

  async cancelSubscription(userId: string): Promise<void> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) {
      throw new Error("No subscription found");
    }

    await db
      .update(userSubscriptions)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(userSubscriptions.id, subscription.id));

    await db
      .update(users)
      .set({ currentPlanSlug: "free", updatedAt: new Date() })
      .where(eq(users.id, userId));

    logger.info({ userId }, "Subscription cancelled");
  }

  async getAdminUserStats(): Promise<any[]> {
    const allUsers = await db
      .select({
        user: users,
      })
      .from(users)
      .orderBy(desc(users.createdAt));

    const stats = await Promise.all(
      allUsers.map(async ({ user }) => {
        const subscription = await this.getUserSubscription(user.id);
        const plan = subscription ? await this.getPlanById(subscription.planId) : null;
        const usage = await this.getCurrentUsagePeriod(user.id);

        return {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          currentPlan: plan?.name || "No Plan",
          planSlug: plan?.slug || null,
          subscriptionStatus: subscription?.status || null,
          joinedAt: user.createdAt,
          lastActiveAt: user.lastActiveAt,
          trialStartedAt: user.trialStartedAt,
          selectedAvatarId: subscription?.selectedAvatarId,
          usage: {
            videosCreated: usage?.videosCreated || 0,
            coursesCreated: usage?.coursesCreated || 0,
            chatSessionsUsed: usage?.chatSessionsUsed || 0,
            moodEntriesLogged: usage?.moodEntriesLogged || 0,
            creditsUsed: usage?.creditsUsed || 0,
          },
        };
      })
    );

    return stats;
  }
}

export const subscriptionService = new SubscriptionService();
