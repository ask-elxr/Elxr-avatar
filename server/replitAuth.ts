import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { pool } from "./db";

if (!process.env.REPLIT_DOMAINS) {
  throw new Error("Environment variable REPLIT_DOMAINS not provided");
}

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

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

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(
  claims: any,
) {
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  for (const domain of process.env
    .REPLIT_DOMAINS!.split(",")) {
    const strategy = new Strategy(
      {
        name: `replitauth:${domain}`,
        config,
        scope: "openid email profile offline_access",
        callbackURL: `https://${domain}/api/callback`,
      },
      verify,
    );
    passport.use(strategy);
  }

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", async (req, res, next) => {
    // Development mode: Allow localhost access with mock authentication
    if (process.env.NODE_ENV === 'development' && (req.hostname === 'localhost' || req.hostname === '127.0.0.1')) {
      const mockUser = {
        claims: {
          sub: 'dev-user-001',
          email: 'dev@localhost.dev',
          first_name: 'Dev',
          last_name: 'User',
          profile_image_url: null,
          exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days from now
        },
        access_token: 'dev-access-token',
        refresh_token: 'dev-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60),
      };
      
      await upsertUser(mockUser.claims);
      
      req.login(mockUser, (err) => {
        if (err) {
          return next(err);
        }
        res.redirect('/');
      });
      return;
    }

    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
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
  
  // Fallback: Check if user is authenticated and has admin role in DB
  const user = req.user as any;

  if (!req.isAuthenticated() || !user?.claims?.sub) {
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