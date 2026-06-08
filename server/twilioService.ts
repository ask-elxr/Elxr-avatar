// Twilio service: WhatsApp (and SMS) messaging + inbound webhook signature validation.
// Docs: https://www.twilio.com/docs/whatsapp
import twilio from "twilio";
import type { Twilio } from "twilio";
import { logger } from "./logger.js";

const log = logger.child({ service: "twilio" });

/**
 * Normalize a raw phone value to E.164-ish "+<digits>", stripping any
 * "whatsapp:" / "sms:" channel prefix Twilio adds to addresses.
 */
export function normalizePhone(raw: string): string {
  return raw.replace(/^(whatsapp:|sms:)/i, "").trim();
}

/** Wrap a bare E.164 number as a WhatsApp address ("whatsapp:+1...") if needed. */
export function toWhatsAppAddress(phone: string): string {
  const bare = normalizePhone(phone);
  return bare.startsWith("whatsapp:") ? bare : `whatsapp:${bare}`;
}

class TwilioService {
  private client: Twilio | null = null;
  private accountSid: string;
  private authToken: string;
  private whatsappFrom: string;
  private smsFrom: string;

  constructor() {
    this.accountSid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
    this.authToken = (process.env.TWILIO_AUTH_TOKEN || "").trim();
    // WhatsApp sender, e.g. "whatsapp:+14155238886" (Twilio sandbox) or an approved sender.
    this.whatsappFrom = (process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886").trim();
    this.smsFrom = (process.env.TWILIO_PHONE_NUMBER || "").trim();

    if (!this.accountSid || !this.authToken) {
      log.warn("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set - Twilio messaging disabled");
      return;
    }

    try {
      this.client = twilio(this.accountSid, this.authToken);
    } catch (error) {
      log.error({ error: (error as Error).message }, "Failed to initialize Twilio client");
    }
  }

  isAvailable(): boolean {
    return !!this.client;
  }

  getAuthToken(): string {
    return this.authToken;
  }

  /**
   * Validate an inbound Twilio webhook request signature.
   * `url` must be the exact, fully-qualified public URL Twilio called.
   * `params` are the POST body params (application/x-www-form-urlencoded).
   */
  validateSignature(signature: string | undefined, url: string, params: Record<string, any>): boolean {
    if (!this.authToken) return false;
    if (!signature) return false;
    try {
      return twilio.validateRequest(this.authToken, signature, url, params);
    } catch (error) {
      log.warn({ error: (error as Error).message }, "Signature validation threw");
      return false;
    }
  }

  /**
   * Send a WhatsApp message (text and/or media) to an E.164 number.
   * Free-form messages are only allowed inside the 24h customer-service window;
   * outside it, you must use an approved template.
   */
  async sendWhatsApp(to: string, body: string, mediaUrl?: string | string[]): Promise<string | null> {
    if (!this.client) {
      log.warn("sendWhatsApp called but Twilio client unavailable");
      return null;
    }
    try {
      const message = await this.client.messages.create({
        from: this.whatsappFrom,
        to: toWhatsAppAddress(to),
        body,
        ...(mediaUrl ? { mediaUrl: Array.isArray(mediaUrl) ? mediaUrl : [mediaUrl] } : {}),
      });
      log.info({ to: normalizePhone(to), sid: message.sid }, "WhatsApp message sent");
      return message.sid;
    } catch (error) {
      log.error({ to: normalizePhone(to), error: (error as Error).message }, "Failed to send WhatsApp message");
      return null;
    }
  }

  /** Send a plain SMS (used later for the SMS channel). */
  async sendSms(to: string, body: string): Promise<string | null> {
    if (!this.client) return null;
    if (!this.smsFrom) {
      log.warn("sendSms called but TWILIO_PHONE_NUMBER not set");
      return null;
    }
    try {
      const message = await this.client.messages.create({
        from: this.smsFrom,
        to: normalizePhone(to),
        body,
      });
      return message.sid;
    } catch (error) {
      log.error({ error: (error as Error).message }, "Failed to send SMS");
      return null;
    }
  }
}

export const twilioService = new TwilioService();
