import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export interface Scene {
  type: "avatar" | "broll";
  script: string;
  brollDescription?: string;
  brollSearchQuery?: string;
  brollImageUrl?: string;
  brollAssetId?: string;
}

/**
 * Uses Claude to segment a lesson script into avatar and B-roll scenes.
 * Avatar scenes show the talking avatar, B-roll scenes show an illustrative
 * background image while the avatar continues narrating.
 */
export async function segmentScriptIntoScenes(script: string): Promise<Scene[]> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are a video editor. Split this script into scenes for a course video.
Some scenes should be "avatar" (the speaker is shown talking) and some should be "broll" (an illustrative image is shown while the speaker continues narrating).

RULES:
- Start with an "avatar" scene (the speaker introduces themselves / the topic)
- Use "broll" scenes when the script describes something visual, gives examples, or explains a concept that benefits from illustration
- Keep "avatar" scenes for personal statements, introductions, transitions, and conclusions
- Each scene's script should be 1-4 sentences (15-60 seconds when spoken)
- Aim for roughly 40-60% broll scenes for visual variety
- The brollDescription should describe what image to show (e.g. "person meditating in nature", "brain neural pathways diagram")
- The brollSearchQuery should be a short stock photo search query (2-4 words)
- Preserve every word of the original script - the combined scripts must equal the original

Return ONLY valid JSON array, no markdown fences:
[
  {"type": "avatar", "script": "..."},
  {"type": "broll", "script": "...", "brollDescription": "...", "brollSearchQuery": "..."},
  ...
]

SCRIPT:
${script}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  try {
    // Parse JSON, handling potential markdown fences
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const scenes: Scene[] = JSON.parse(cleaned);

    // Validate structure
    if (!Array.isArray(scenes) || scenes.length === 0) {
      throw new Error("Invalid scenes array");
    }

    return scenes.map((s) => ({
      type: s.type === "broll" ? "broll" : "avatar",
      script: s.script || "",
      brollDescription: s.brollDescription,
      brollSearchQuery: s.brollSearchQuery,
    }));
  } catch (err) {
    console.error("Failed to parse scene segmentation:", err, "Raw:", text);
    // Fallback: return the entire script as a single avatar scene
    return [{ type: "avatar", script }];
  }
}
