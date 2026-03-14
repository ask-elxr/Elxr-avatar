import axios from "axios";

const SUNO_API_KEY = process.env.SUNO_API_KEY;
const SUNO_BASE_URL = "https://api.sunoapi.org/api/v1";

export function isSunoConfigured(): boolean {
  return !!SUNO_API_KEY;
}

interface SunoTrack {
  id: string;
  audio_url: string;
  title: string;
  duration: number;
}

/**
 * Generate background instrumental music for a course lesson using Suno AI.
 * Uses the add-instrumental endpoint for fine-grained style control.
 * Returns the audio URL of the generated track.
 */
export async function generateBackgroundMusic(
  courseTitle: string,
  lessonTitle: string,
  durationHint: number,
): Promise<string | null> {
  if (!SUNO_API_KEY) {
    console.warn("SUNO_API_KEY not configured — background music unavailable");
    return null;
  }

  try {
    console.log(`🎵 Generating background music for: "${lessonTitle}"`);

    const response = await axios.post(
      `${SUNO_BASE_URL}/generate/add-instrumental`,
      {
        title: `${courseTitle} - ${lessonTitle}`,
        tags: "Soft Piano, Ambient, Peaceful, Lo-Fi, Gentle, Background Music",
        negativeTags: "Heavy Metal, Aggressive Drums, Loud, Intense, Vocals, Singing",
        styleWeight: 0.7,
        weirdnessConstraint: 0.3,
        audioWeight: 0.5,
        model: "V4_5PLUS",
      },
      {
        headers: {
          Authorization: `Bearer ${SUNO_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (response.data?.code !== 200) {
      console.error("❌ Suno API error:", response.data?.msg);
      return null;
    }

    const taskId = response.data.data.taskId;
    console.log(`🎵 Suno task created: ${taskId}`);

    // Poll for completion (max 5 minutes)
    const audioUrl = await pollSunoTask(taskId);
    if (audioUrl) {
      console.log(`✅ Background music generated: ${audioUrl.slice(0, 80)}...`);
    }
    return audioUrl;
  } catch (error: any) {
    console.error("❌ Suno music generation error:", error.message);
    return null;
  }
}

/**
 * Poll Suno API for task completion.
 */
async function pollSunoTask(taskId: string, maxWaitMs = 300000): Promise<string | null> {
  const startTime = Date.now();
  const pollInterval = 15000; // 15 seconds

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await axios.get(
        `${SUNO_BASE_URL}/generate/record-info?taskId=${taskId}`,
        {
          headers: {
            Authorization: `Bearer ${SUNO_API_KEY}`,
          },
        },
      );

      const data = response.data?.data;
      if (!data) continue;

      if (data.status === "SUCCESS") {
        const tracks = data.response?.data as SunoTrack[];
        if (tracks && tracks.length > 0) {
          return tracks[0].audio_url;
        }
        return null;
      }

      if (data.status === "FAILED") {
        console.error("❌ Suno task failed:", data.errorMessage);
        return null;
      }

      // Still generating, wait and retry
      console.log(`🎵 Suno still generating (${Math.round((Date.now() - startTime) / 1000)}s)...`);
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (error: any) {
      console.warn("⚠️ Suno poll error:", error.message);
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  console.warn("⚠️ Suno task timed out after 5 minutes");
  return null;
}
