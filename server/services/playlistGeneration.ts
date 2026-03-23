import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { logger } from "../logger";

const log = logger.child({ service: "playlistGeneration" });

const anthropic = new Anthropic();

// --- Zod schemas ---

export const playlistSpecSchema = z.object({
  title: z.string().min(1).max(100),
  subtitle: z.string().max(500),
  goal: z.string().max(1000),
  durationMinutes: z.number().min(5).max(120),
  energyCurve: z.string().max(500),
  vocalPreference: z.string().max(300),
  moodTags: z.array(z.string()).min(1).max(10),
  seedSearches: z.array(z.string()).min(2).max(8),
  avatarExplanation: z.string().max(1000),
  coverImagePrompt: z.string().max(500),
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
  "avatarExplanation": "string",
  "coverImagePrompt": "string (max 200 chars) — a SHORT, concrete image description for an album cover. Describe a SPECIFIC physical scene with real objects. Examples: 'A vintage turntable on a wooden table with warm candlelight and whiskey glass', 'Rain drops on a neon-lit taxi window at night in Tokyo', 'A guitar leaning against a desert cactus at sunset with orange sky', 'Close-up of vinyl record grooves reflecting purple and blue light'. Be CONCRETE — name real objects, materials, and lighting. NO abstract concepts, NO blurry landscapes, NO soft-focus."
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
  // Use the LLM-generated prompt tailored to this specific playlist
  if (spec.coverImagePrompt) {
    return `${spec.coverImagePrompt}, photographed in sharp focus, cinematic lighting, album cover composition, no people, no faces, no text, no words`;
  }

  // Fallback if coverImagePrompt is missing (older specs)
  const objects: Record<string, string> = {
    calm: "A smooth stone balanced on a zen garden with raked sand, soft morning light",
    warm: "A steaming coffee cup on a wooden windowsill with golden afternoon light streaming in",
    night: "A neon sign reflected in a rain puddle on a dark city street",
    energy: "Electric sparks flying off a drum cymbal mid-strike, dramatic lighting",
    focus: "A single burning candle in a dark room with a stack of books",
    gentle: "Wildflowers in a mason jar on a rustic table with soft window light",
    dream: "A crescent moon reflected in still lake water with mist",
    motivation: "Running shoes on a wet track at dawn with golden light",
  };

  for (const tag of spec.moodTags) {
    const lower = tag.toLowerCase();
    if (objects[lower]) {
      return `${objects[lower]}, sharp focus, cinematic, album cover, no people, no text`;
    }
  }

  return `A vintage turntable with vinyl record in warm ambient light, sharp focus, cinematic, album cover, no people, no text`;
}
