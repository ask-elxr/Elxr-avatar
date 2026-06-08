import { Router, Request, Response } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "../db.js";
import { messagingContacts } from "@shared/schema";
import { twilioService, normalizePhone } from "../twilioService.js";
import { mem0Service } from "../mem0Service.js";
import { runAvatarRAG } from "../services/rag.js";
import { getActiveAvatars } from "../services/avatars.js";
import { logger } from "../logger.js";

export const twilioRouter = Router();

const log = logger.child({ route: "twilio" });

const OPT_OUT_KEYWORDS = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit"];
const OPT_IN_KEYWORDS = ["start", "yes", "unstop"];

/** Reconstruct the exact public URL Twilio used to sign the request. */
function publicUrl(req: Request): string {
  const proto = ((req.headers["x-forwarded-proto"] as string) || req.protocol || "https").split(",")[0].trim();
  const host = (req.headers["x-forwarded-host"] as string) || req.get("host") || "";
  return `${proto}://${host}${req.originalUrl}`;
}

// The WhatsApp assistant answers as a single unified "Elxr" persona that draws on the
// COMBINED knowledge bases (Pinecone namespaces) of every active avatar.
const ELXR_AVATAR_ID = "elxr";
const ELXR_PERSONA =
  (process.env.WHATSAPP_PERSONA_PROMPT || "").trim() ||
  "You are Elxr, a warm, knowledgeable assistant for health, wellness, longevity, fitness, " +
    "nutrition, mindset, relationships, and personal growth. You draw on a broad library of " +
    "expert knowledge. Answer clearly and conversationally, grounded in the knowledge provided " +
    "to you. If something isn't covered by your knowledge, say so honestly.";

// Namespaces to exclude from the unified assistant (e.g. personal verbatim libraries such as
// mark-kohl / willie-gault). Comma-separated env override; empty by default (include everything).
const EXCLUDED_NAMESPACES = new Set(
  (process.env.WHATSAPP_EXCLUDED_NAMESPACES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

interface ElxrKnowledgeConfig {
  namespaces: string[];
  useWebSearch: boolean;
  usePubMed: boolean;
}

let cachedElxrConfig: ElxrKnowledgeConfig | null = null;

/** Aggregate every active avatar's Pinecone namespaces + research toggles into one config. */
async function resolveElxrConfig(): Promise<ElxrKnowledgeConfig> {
  if (cachedElxrConfig) return cachedElxrConfig;
  try {
    const active = await getActiveAvatars();
    const namespaces = Array.from(
      new Set(active.flatMap((a) => a.pineconeNamespaces || [])),
    ).filter((ns) => !EXCLUDED_NAMESPACES.has(ns));
    cachedElxrConfig = {
      namespaces,
      useWebSearch: active.some((a) => !!a.useGoogleSearch),
      usePubMed: active.some((a) => !!a.usePubMed),
    };
    log.info({ namespaceCount: namespaces.length }, "Aggregated Elxr knowledge bases");
  } catch (error) {
    log.warn({ error: (error as Error).message }, "Failed to aggregate avatar knowledge bases");
    cachedElxrConfig = { namespaces: [], useWebSearch: false, usePubMed: false };
  }
  return cachedElxrConfig;
}

interface ContactHistoryTurn {
  message: string;
  isUser: boolean;
}

async function upsertContactInbound(
  phone: string,
  profileName: string | undefined,
  avatarId: string | null,
): Promise<{ history: ContactHistoryTurn[]; optInStatus: string }> {
  const rows = await db
    .insert(messagingContacts)
    .values({
      phone,
      channel: "whatsapp",
      profileName: profileName || null,
      avatarId: avatarId || null,
      optInStatus: "opted_in",
      lastInboundAt: new Date(),
      messageCount: 1,
    })
    .onConflictDoUpdate({
      target: messagingContacts.phone,
      set: {
        profileName: profileName || sql`${messagingContacts.profileName}`,
        avatarId: avatarId || sql`${messagingContacts.avatarId}`,
        lastInboundAt: new Date(),
        messageCount: sql`${messagingContacts.messageCount} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning();

  const contact = rows[0];
  const metadata = (contact?.metadata as { history?: ContactHistoryTurn[] } | null) || {};
  return { history: metadata.history ?? [], optInStatus: contact?.optInStatus ?? "opted_in" };
}

async function persistTurn(phone: string, history: ContactHistoryTurn[], userText: string, reply: string) {
  const updated = [...history, { message: userText, isUser: true }, { message: reply, isUser: false }].slice(-8);
  await db
    .update(messagingContacts)
    .set({
      metadata: { history: updated },
      lastOutboundAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(messagingContacts.phone, phone));
}

async function setOptInStatus(phone: string, status: "opted_in" | "opted_out") {
  await db
    .update(messagingContacts)
    .set({ optInStatus: status, updatedAt: new Date() })
    .where(eq(messagingContacts.phone, phone));
}

/**
 * Generate the AI reply (Mem0 + RAG + Claude) and send it back over WhatsApp.
 * Runs detached from the HTTP response so Twilio's webhook returns immediately.
 */
async function handleInboundMessage(phone: string, userText: string, history: ContactHistoryTurn[]) {
  const { namespaces, useWebSearch, usePubMed } = await resolveElxrConfig();

  // Long-term memory keyed by the contact's phone number.
  let memorySnippets: string[] = [];
  if (mem0Service.isAvailable()) {
    try {
      const memories = await mem0Service.searchMemories(phone, userText, 5);
      memorySnippets = memories.map((m) => m.memory).filter(Boolean);
    } catch (error) {
      log.warn({ error: (error as Error).message }, "Mem0 search failed");
    }
  }

  let reply: string;
  try {
    const result = await runAvatarRAG({
      avatarId: ELXR_AVATAR_ID,
      message: userText,
      memorySnippets,
      pineconeNamespaces: namespaces,
      conversationHistory: history,
      personalityPrompt: ELXR_PERSONA,
      useWebSearch,
      usePubMed,
    });
    reply = result.answer?.trim() || "Sorry, I couldn't come up with a response just now.";
  } catch (error) {
    log.error({ error: (error as Error).message }, "RAG generation failed");
    reply = "Sorry, something went wrong while generating a response. Please try again.";
  }

  // WhatsApp message body limit is 1600 chars; trim defensively.
  if (reply.length > 1500) reply = reply.slice(0, 1497) + "...";

  await twilioService.sendWhatsApp(phone, reply);

  // Persist short-term turn history + long-term memory (non-blocking failures).
  try {
    await persistTurn(phone, history, userText, reply);
  } catch (error) {
    log.warn({ error: (error as Error).message }, "Failed to persist turn history");
  }
  if (mem0Service.isAvailable()) {
    mem0Service
      .addConversationMemory(phone, userText, reply, { channel: "whatsapp" })
      .catch((error) => log.warn({ error: (error as Error).message }, "Failed to save memory"));
  }
}

// Inbound WhatsApp webhook. Configure this URL in the Twilio console
// (Messaging > WhatsApp sender / sandbox > "When a message comes in").
twilioRouter.post("/whatsapp", async (req: Request, res: Response) => {
  const skipValidation = process.env.TWILIO_SKIP_SIGNATURE_VALIDATION === "true";
  const signature = req.headers["x-twilio-signature"] as string | undefined;

  if (!skipValidation) {
    const valid = twilioService.validateSignature(signature, publicUrl(req), req.body);
    if (!valid) {
      log.warn({ url: publicUrl(req) }, "Invalid Twilio signature - rejecting webhook");
      return res.status(403).type("text/xml").send("<Response></Response>");
    }
  }

  const from = req.body?.From as string | undefined;
  const body = ((req.body?.Body as string) || "").trim();
  const profileName = req.body?.ProfileName as string | undefined;

  if (!from) {
    return res.status(400).type("text/xml").send("<Response></Response>");
  }

  const phone = normalizePhone(from);
  const lower = body.toLowerCase();

  // Twilio auto-handles STOP/START for compliance, but mirror status locally.
  if (OPT_OUT_KEYWORDS.includes(lower)) {
    await setOptInStatus(phone, "opted_out").catch(() => {});
    return res.status(200).type("text/xml").send("<Response></Response>");
  }
  if (OPT_IN_KEYWORDS.includes(lower)) {
    await setOptInStatus(phone, "opted_in").catch(() => {});
    return res.status(200).type("text/xml").send("<Response></Response>");
  }

  let history: ContactHistoryTurn[] = [];
  try {
    const contact = await upsertContactInbound(phone, profileName, ELXR_AVATAR_ID);
    history = contact.history;
  } catch (error) {
    log.error({ error: (error as Error).message }, "Failed to upsert contact");
  }

  // Acknowledge immediately; reply is sent asynchronously via the REST API
  // (we're inside the 24h customer-service window, so free-form replies are allowed).
  res.status(200).type("text/xml").send("<Response></Response>");

  if (body) {
    handleInboundMessage(phone, body, history).catch((error) =>
      log.error({ error: (error as Error).message }, "Unhandled error in inbound handler"),
    );
  }
});

// Twilio status callbacks (delivery receipts). Optional but handy for debugging.
twilioRouter.post("/status", (req: Request, res: Response) => {
  log.debug(
    { sid: req.body?.MessageSid, status: req.body?.MessageStatus },
    "Twilio status callback",
  );
  res.status(204).end();
});

export default twilioRouter;
