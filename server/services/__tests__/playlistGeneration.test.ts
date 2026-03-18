import { describe, it, expect } from "vitest";
import { playlistSpecSchema, playlistSuggestionSchema } from "../playlistGeneration";

describe("playlistSpecSchema", () => {
  it("validates a well-formed playlist spec", () => {
    const validSpec = {
      title: "Soft Landing",
      subtitle: "A gentle unwind for tonight",
      goal: "calm nervous system and transition into evening",
      durationMinutes: 35,
      energyCurve: "start soft, drift slower, end dreamy",
      vocalPreference: "light vocals",
      moodTags: ["calm", "warm", "night", "gentle"],
      seedSearches: [
        "ambient indie soft female vocals",
        "evening unwind mellow electronic",
        "gentle calming acoustic dream pop",
      ],
      avatarExplanation:
        "I made this to help you step down gradually instead of crashing.",
    };

    const result = playlistSpecSchema.safeParse(validSpec);
    expect(result.success).toBe(true);
  });

  it("rejects spec with empty title", () => {
    const invalidSpec = {
      title: "",
      subtitle: "test",
      goal: "test",
      durationMinutes: 35,
      energyCurve: "test",
      vocalPreference: "test",
      moodTags: ["calm"],
      seedSearches: ["a", "b"],
      avatarExplanation: "test",
    };

    const result = playlistSpecSchema.safeParse(invalidSpec);
    expect(result.success).toBe(false);
  });

  it("rejects spec with too few seed searches", () => {
    const invalidSpec = {
      title: "Test",
      subtitle: "test",
      goal: "test",
      durationMinutes: 35,
      energyCurve: "test",
      vocalPreference: "test",
      moodTags: ["calm"],
      seedSearches: ["only-one"],
      avatarExplanation: "test",
    };

    const result = playlistSpecSchema.safeParse(invalidSpec);
    expect(result.success).toBe(false);
  });

  it("rejects spec with duration out of range", () => {
    const invalidSpec = {
      title: "Test",
      subtitle: "test",
      goal: "test",
      durationMinutes: 200,
      energyCurve: "test",
      vocalPreference: "test",
      moodTags: ["calm"],
      seedSearches: ["a", "b"],
      avatarExplanation: "test",
    };

    const result = playlistSpecSchema.safeParse(invalidSpec);
    expect(result.success).toBe(false);
  });
});

describe("playlistSuggestionSchema", () => {
  it("validates a well-formed suggestion", () => {
    const suggestion = {
      shouldSuggest: true,
      suggestedType: "evening unwind",
      rationale: "User seems stressed and winding down",
      defaultDuration: 30,
      energyCurve: "start soft, drift slower",
    };

    const result = playlistSuggestionSchema.safeParse(suggestion);
    expect(result.success).toBe(true);
  });

  it("validates a negative suggestion", () => {
    const suggestion = {
      shouldSuggest: false,
      suggestedType: "",
      rationale: "User is asking a factual question, not seeking emotional support",
      defaultDuration: 0,
      energyCurve: "",
    };

    const result = playlistSuggestionSchema.safeParse(suggestion);
    expect(result.success).toBe(true);
  });
});
