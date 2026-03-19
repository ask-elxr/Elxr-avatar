import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { logger } from "../logger";

const log = logger.child({ service: "playlistGeneration" });

const anthropic = new Anthropic();

// --- Zod schemas ---

export const playlistSpecSchema = z.object({
  title: z.string().min(1).max(100),
  subtitle: z.string().max(200),
  goal: z.string().max(500),
  durationMinutes: z.number().min(5).max(120),
  energyCurve: z.string().max(200),
  vocalPreference: z.string().max(100),
  moodTags: z.array(z.string()).min(1).max(10),
  seedSearches: z.array(z.string()).min(2).max(8),
  avatarExplanation: z.string().max(500),
});

export type PlaylistSpec = z.infer<typeof playlistSpecSchema>;

export const playlistSuggestionSchema = z.object({
  shouldSuggest: z.boolean(),
  suggestedType: z.string().nullable().default(""),
  rationale: z.string().nullable().default(""),
  defaultDuration: z.number().nullable().default(30),
  energyCurve: z.string().nullable().default(""),
});

export type PlaylistSuggestion = z.infer<typeof playlistSuggestionSchema>;

// --- Suggestion detector ---

const SUGGESTION_SYSTEM_PROMPT = `You are an emotional wellness assistant analyzing a conversation.
Determine if suggesting a personalized music playlist would be helpful right now.

Consider:
- Is the user discussing sleep, focus, anxiety, grief, recovery, intimacy, motivation, relaxation, transitions, or emotional regulation?
- Would music genuinely help, or would it feel forced?
- Has the conversation naturally arrived at a point where a playlist offer would feel helpful?

Respond with valid JSON only. No markdown, no explanation outside the JSON.

Schema:
{
  "shouldSuggest": boolean,
  "suggestedType": "string (e.g. 'evening unwind', 'focus session', 'grief support', 'calming anxiety')",
  "rationale": "string (why this playlist would help)",
  "defaultDuration": number (minutes, 15-60),
  "energyCurve": "string (e.g. 'start soft, drift slower, end dreamy')"
}`;

export async function suggestPlaylistFromConversation(
  conversationContext: string,
): Promise<PlaylistSuggestion> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001", // Use Haiku for fast, cheap detection
    max_tokens: 300,
    system: SUGGESTION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Conversation context:\n${conversationContext}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text
    .replace(/^```json?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned);
  return playlistSuggestionSchema.parse(parsed);
}

// --- Playlist spec generation ---

const PLAYLIST_SPEC_SYSTEM_PROMPT = `You are a world-class music curator for MUM, a premium wellness platform.
Your job is to transform conversational context into a playlist concept.

Rules:
- Do not output song lyrics
- Do not mention copyright
- Do not be generic — make it personal and emotionally resonant
- Focus on emotional arc, pacing, and usefulness
- seedSearches should be Spotify-optimized search queries (genre + mood + descriptor)
- The title should be evocative and short (2-4 words)
- The subtitle should feel like a friend explaining it
- avatarExplanation should be warm, personal, and specific to the conversation

Return valid JSON only. No markdown fences, no explanation outside JSON.

Schema:
{
  "title": "string",
  "subtitle": "string",
  "goal": "string",
  "durationMinutes": number,
  "energyCurve": "string",
  "vocalPreference": "string",
  "moodTags": ["string"],
  "seedSearches": ["string"],
  "avatarExplanation": "string"
}`;

export async function generatePlaylistSpec(
  conversationContext: string,
  overrides?: {
    goal?: string;
    duration?: number;
    mood?: string;
  },
): Promise<PlaylistSpec> {
  let userPrompt = `Conversation context:\n${conversationContext}`;
  if (overrides?.goal) userPrompt += `\n\nUser override — goal: ${overrides.goal}`;
  if (overrides?.duration)
    userPrompt += `\nUser override — duration: ${overrides.duration} minutes`;
  if (overrides?.mood) userPrompt += `\nUser override — mood: ${overrides.mood}`;

  const tryGenerate = async (attempt: number): Promise<PlaylistSpec> => {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 800,
      system:
        PLAYLIST_SPEC_SYSTEM_PROMPT +
        (attempt > 1
          ? "\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY a JSON object, nothing else."
          : ""),
      messages: [{ role: "user", content: userPrompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Strip markdown fences if present
    const cleaned = text
      .replace(/^```json?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    return playlistSpecSchema.parse(parsed);
  };

  try {
    return await tryGenerate(1);
  } catch (err) {
    log.warn({ err }, "First playlist spec generation failed, retrying");
    return await tryGenerate(2);
  }
}

// --- Image prompt generation ---

export function generateImagePrompt(spec: PlaylistSpec): string {
  const timeHints = spec.moodTags.some((t) =>
    ["night", "evening", "sleep", "dream"].includes(t),
  )
    ? "nighttime scene, moody low-key lighting, deep blues and indigo tones"
    : spec.moodTags.some((t) => ["morning", "energy", "motivation"].includes(t))
      ? "golden hour light, warm amber and coral tones, sunrise atmosphere"
      : "soft diffused natural light, muted earth and sage tones";

  return [
    "Abstract atmospheric landscape photograph,",
    `evoking ${spec.moodTags.slice(0, 3).join(", ")},`,
    `${timeHints},`,
    "cinematic wide-angle composition, beautiful bokeh,",
    "dreamy ethereal quality, layered depth,",
    "premium editorial aesthetic, painterly feel,",
    "no people, no faces, no text, no words, no typography",
  ].join(" ");
}
