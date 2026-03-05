import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { pool } from "./db";

// Extend Express Request to include user (previously provided by @types/passport)
declare module "express-serve-static-core" {
  interface Request {
    user?: {
      claims?: {
        sub: string;
        email: string | null;
        first_name: string;
        last_name: string;
        profile_image_url: string | null;
      };
    };
  }
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    pool: pool, // Use the shared pool from db.ts which has cleaned DATABASE_URL
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: sessionTtl,
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  // Simple redirects (no OIDC — auth is handled by Memberstack via Webflow)
  app.get("/api/login", (_req, res) => res.redirect("/"));
  app.get("/api/callback", (_req, res) => res.redirect("/"));
  app.get("/api/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/"));
  });
}

// Authentication middleware for embedded Webflow mode
// All routes are accessible without login for browsing
// Memberstack user ID can be passed via X-Member-Id header or member_id query param for persistent memory
export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (!req.user) {
    const memberstackId = (req.headers['x-member-id'] as string) || (req.query.member_id as string);

    let userId: string;
    const session = req.session as any;
    if (memberstackId) {
      userId = `ms_${memberstackId}`;
      if (session) {
        session.userId = userId;
      }
    } else if (session?.userId) {
      userId = session.userId;
    } else {
      userId = `webflow_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      if (session) {
        session.userId = userId;
      }
    }

    (req as any).user = {
      claims: {
        sub: userId,
        email: null,
        first_name: 'Webflow',
        last_name: 'User',
        profile_image_url: null,
      },
    };
  }
  return next();
};

// Middleware that requires a Memberstack ID or admin secret for AI-powered endpoints
// This prevents anonymous users from triggering expensive Claude/TTS API calls
export const requireMemberstackOrAdmin: RequestHandler = async (req, res, next) => {
  // TEST_MODE: bypass subscription check on localhost
  if (process.env.TEST_MODE === 'true' && (req.hostname === 'localhost' || req.hostname === '127.0.0.1')) {
    return next();
  }

  const adminSecret = req.headers['x-admin-secret'] as string;
  if (isValidAdminSecret(adminSecret)) {
    return next();
  }

  const memberstackId = (req.headers['x-member-id'] as string) || (req.query.member_id as string);
  if (memberstackId) {
    return next();
  }

  const user = req.user as any;
  if (user?.claims?.sub && !user.claims.sub.startsWith('webflow_') && !user.claims.sub.startsWith('temp_')) {
    return next();
  }

  return res.status(401).json({ error: "Authentication required to chat with avatars. Please log in." });
};

// Helper to check if a secret is valid (supports multiple comma-separated secrets)
export function isValidAdminSecret(providedSecret: string): boolean {
  const envAdminSecret = process.env.ADMIN_SECRET;
  if (!envAdminSecret || !providedSecret) return false;

  // Support multiple admin secrets separated by commas
  const validSecrets = envAdminSecret.split(',').map(s => s.trim());
  return validSecrets.includes(providedSecret);
}

// Middleware to require admin role
// In embedded mode, admin access is controlled via ADMIN_SECRET header
// Supports multiple admin secrets (comma-separated in ADMIN_SECRET env var)
export const requireAdmin: RequestHandler = async (req, res, next) => {
  // Check for admin secret in header (for embedded/Webflow mode)
  const adminSecret = req.headers['x-admin-secret'] as string;

  // If admin secret is provided and matches one of the valid secrets, allow access
  if (isValidAdminSecret(adminSecret)) {
    return next();
  }

  // Fallback: Check if user has admin role in DB
  const user = req.user as any;

  if (!user?.claims?.sub) {
    return res.status(401).json({ message: "Unauthorized - Admin access required. Use X-Admin-Secret header or login as admin." });
  }

  try {
    const dbUser = await storage.getUser(user.claims.sub);
    if (!dbUser || dbUser.role !== 'admin') {
      return res.status(403).json({ message: "Forbidden: Admin access required" });
    }
    return next();
  } catch (error) {
    console.error('Error checking admin role:', error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
