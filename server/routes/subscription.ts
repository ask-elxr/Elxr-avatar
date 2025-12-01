import { Router, Request, Response } from "express";
import { subscriptionService } from "../services/subscription";
import { isAuthenticated, requireAdmin } from "../replitAuth";
import { z } from "zod";
import { logger } from "../logger";

const router = Router();

router.get("/plans", async (req: Request, res: Response) => {
  try {
    const plans = await subscriptionService.getPlans();
    res.json(plans);
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to get plans");
    res.status(500).json({ message: "Failed to get plans" });
  }
});

router.get("/user-plan", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const planInfo = await subscriptionService.getUserPlanInfo(userId);
    
    await subscriptionService.updateUserLastActive(userId);

    res.json(planInfo);
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to get user plan info");
    res.status(500).json({ message: "Failed to get user plan info" });
  }
});

router.get("/trial-time", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const planInfo = await subscriptionService.getUserPlanInfo(userId);
    
    if (!planInfo.subscription || planInfo.plan?.slug !== "free") {
      return res.json({
        isTrialUser: false,
        remainingSeconds: null,
        remainingMinutes: null,
        expiresAt: null,
        isExpired: false,
      });
    }

    const now = new Date();
    const expiresAt = planInfo.subscription.expiresAt ? new Date(planInfo.subscription.expiresAt) : null;
    
    if (!expiresAt) {
      return res.json({
        isTrialUser: true,
        remainingSeconds: null,
        remainingMinutes: null,
        expiresAt: null,
        isExpired: false,
      });
    }

    const remainingMs = expiresAt.getTime() - now.getTime();
    const isExpired = remainingMs <= 0;
    const remainingSeconds = isExpired ? 0 : Math.floor(remainingMs / 1000);
    const remainingMinutes = isExpired ? 0 : Math.floor(remainingMs / 60000);

    res.json({
      isTrialUser: true,
      remainingSeconds,
      remainingMinutes,
      expiresAt: expiresAt.toISOString(),
      isExpired,
      totalDurationHours: planInfo.plan?.durationHours || 1,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to get trial time");
    res.status(500).json({ message: "Failed to get trial time" });
  }
});

router.post("/start-trial", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const schema = z.object({
      avatarId: z.string().min(1),
    });

    const { avatarId } = schema.parse(req.body);

    const subscription = await subscriptionService.startFreeTrial(userId, avatarId);
    const planInfo = await subscriptionService.getUserPlanInfo(userId);

    res.json({ subscription, planInfo });
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to start trial");
    
    if (error.message === "User already has a subscription") {
      return res.status(400).json({ message: error.message });
    }
    
    res.status(500).json({ message: "Failed to start trial" });
  }
});

router.post("/select-avatar", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const schema = z.object({
      avatarId: z.string().min(1),
    });

    const { avatarId } = schema.parse(req.body);

    await subscriptionService.selectAvatar(userId, avatarId);
    const planInfo = await subscriptionService.getUserPlanInfo(userId);

    res.json({ success: true, planInfo });
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to select avatar");
    res.status(500).json({ message: "Failed to select avatar" });
  }
});

router.get("/check-avatar/:avatarId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { avatarId } = req.params;
    const canAccess = await subscriptionService.canAccessAvatar(userId, avatarId);
    const planInfo = await subscriptionService.getUserPlanInfo(userId);

    res.json({ 
      canAccess, 
      selectedAvatarId: planInfo.selectedAvatarId,
      plan: planInfo.plan?.slug,
      isExpired: planInfo.isExpired,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to check avatar access");
    res.status(500).json({ message: "Failed to check avatar access" });
  }
});

router.get("/check-limit/:type", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const type = req.params.type as "video" | "course" | "chat";
    if (!["video", "course", "chat"].includes(type)) {
      return res.status(400).json({ message: "Invalid limit type" });
    }

    const result = await subscriptionService.checkLimit(userId, type);
    res.json(result);
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to check limit");
    res.status(500).json({ message: "Failed to check limit" });
  }
});

router.post("/upgrade", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const schema = z.object({
      planSlug: z.enum(["basic", "pro"]),
      memberstackSubscriptionId: z.string().optional(),
    });

    const { planSlug, memberstackSubscriptionId } = schema.parse(req.body);

    const subscription = await subscriptionService.upgradeSubscription(
      userId, 
      planSlug, 
      memberstackSubscriptionId
    );
    const planInfo = await subscriptionService.getUserPlanInfo(userId);

    res.json({ subscription, planInfo });
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to upgrade subscription");
    res.status(500).json({ message: "Failed to upgrade subscription" });
  }
});

router.post("/cancel", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    await subscriptionService.cancelSubscription(userId);
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to cancel subscription");
    res.status(500).json({ message: "Failed to cancel subscription" });
  }
});

router.get("/admin/users", isAuthenticated, requireAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await subscriptionService.getAdminUserStats();
    res.json(stats);
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to get admin user stats");
    res.status(500).json({ message: "Failed to get admin user stats" });
  }
});

router.post("/memberstack/webhook", async (req: Request, res: Response) => {
  try {
    const { event, data } = req.body;
    
    logger.info({ event }, "Received Memberstack webhook");

    switch (event) {
      case "member.plan.added":
      case "member.plan.updated":
        if (data.memberId && data.planConnection?.planId) {
          logger.info({ memberId: data.memberId, planId: data.planConnection.planId }, "Processing plan update");
        }
        break;
      case "member.plan.removed":
        if (data.memberId) {
          logger.info({ memberId: data.memberId }, "Processing plan removal");
        }
        break;
    }

    res.json({ received: true });
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to process webhook");
    res.status(500).json({ message: "Webhook processing failed" });
  }
});

export default router;
