import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import axios from "axios";
import { uploadAsset, isConfigured as isGcsConfigured } from "../assetStorage.js";

const execFileAsync = promisify(execFile);

export interface SceneTiming {
  sceneIndex: number;
  type: "avatar" | "broll";
  durationSec: number;
  brollImageUrl?: string;
}

let ffmpegAvailableCache: boolean | null = null;

/**
 * Check if ffmpeg/ffprobe binaries are available on the system
 */
export async function isFFmpegAvailable(): Promise<boolean> {
  if (ffmpegAvailableCache !== null) return ffmpegAvailableCache;
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    await execFileAsync("ffprobe", ["-version"]);
    ffmpegAvailableCache = true;
  } catch {
    ffmpegAvailableCache = false;
  }
  return ffmpegAvailableCache;
}

/**
 * Get the duration of an audio buffer in seconds using ffprobe
 */
export async function getAudioDurationSec(audioBuffer: Buffer): Promise<number> {
  const tmpFile = path.join(os.tmpdir(), `elxr-audio-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
  try {
    fs.writeFileSync(tmpFile, audioBuffer);
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-show_entries", "format=duration",
      "-of", "csv=p=0",
      tmpFile,
    ]);
    return parseFloat(stdout.trim()) || 0;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

/**
 * Download a URL to a temp file, return the path
 */
async function downloadToTemp(url: string, ext: string): Promise<string> {
  const tmpFile = path.join(os.tmpdir(), `elxr-dl-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  const response = await axios.get(url, { responseType: "arraybuffer", timeout: 120000 });
  fs.writeFileSync(tmpFile, Buffer.from(response.data));
  return tmpFile;
}

/**
 * Post-process a HeyGen video to overlay B-roll images at the correct timestamps
 */
export async function postProcessBrollOverlay(
  videoUrl: string,
  sceneTimings: SceneTiming[],
  lessonId: string,
): Promise<string> {
  const tmpFiles: string[] = [];

  try {
    // 1. Download HeyGen video
    console.log(`🎬 Post-processing: downloading HeyGen video...`);
    const videoFile = await downloadToTemp(videoUrl, ".mp4");
    tmpFiles.push(videoFile);

    // 2. Probe video for resolution
    const { stdout: probeOut } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height",
      "-of", "csv=p=0",
      videoFile,
    ]);
    const [widthStr, heightStr] = probeOut.trim().split(",");
    const width = parseInt(widthStr) || 1280;
    const height = parseInt(heightStr) || 720;
    console.log(`🎬 Post-processing: video resolution ${width}x${height}`);

    // 3. Identify B-roll scenes and compute start/end times
    const brollOverlays: { imageFile: string; startSec: number; endSec: number }[] = [];
    let cumulativeSec = 0;

    for (const scene of sceneTimings) {
      const startSec = cumulativeSec;
      const endSec = cumulativeSec + scene.durationSec;

      if (scene.type === "broll" && scene.brollImageUrl) {
        const ext = scene.brollImageUrl.match(/\.(jpe?g|png|webp)/i)?.[0] || ".jpg";
        const imageFile = await downloadToTemp(scene.brollImageUrl, ext);
        tmpFiles.push(imageFile);
        brollOverlays.push({ imageFile, startSec, endSec });
        console.log(`🖼️ B-roll overlay: scene ${scene.sceneIndex} at ${startSec.toFixed(1)}s–${endSec.toFixed(1)}s`);
      }

      cumulativeSec = endSec;
    }

    if (brollOverlays.length === 0) {
      console.log(`🎬 No B-roll overlays needed`);
      return videoUrl;
    }

    // 4. Build ffmpeg filter_complex
    const inputArgs: string[] = ["-i", videoFile];
    for (const overlay of brollOverlays) {
      inputArgs.push("-i", overlay.imageFile);
    }

    let filterParts: string[] = [];
    let prevLabel = "0:v";

    for (let i = 0; i < brollOverlays.length; i++) {
      const inputIdx = i + 1; // 0 is the video, 1+ are images
      const overlay = brollOverlays[i];
      const scaledLabel = `b${i}`;
      const outLabel = i < brollOverlays.length - 1 ? `tmp${i}` : "out";

      // Scale image to match video dimensions
      filterParts.push(`[${inputIdx}:v]scale=${width}:${height},setsar=1[${scaledLabel}]`);
      // Overlay with time-based enable
      filterParts.push(
        `[${prevLabel}][${scaledLabel}]overlay=0:0:enable='between(t,${overlay.startSec.toFixed(3)},${overlay.endSec.toFixed(3)})'[${outLabel}]`
      );
      prevLabel = outLabel;
    }

    const filterComplex = filterParts.join(";\n");

    // 5. Run ffmpeg
    const outputFile = path.join(os.tmpdir(), `elxr-processed-${lessonId}-${Date.now()}.mp4`);
    tmpFiles.push(outputFile);

    const ffmpegArgs = [
      ...inputArgs,
      "-filter_complex", filterComplex,
      "-map", "[out]",
      "-map", "0:a",
      "-c:a", "copy",
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "23",
      "-movflags", "+faststart",
      "-y",
      outputFile,
    ];

    console.log(`🎬 Running ffmpeg with ${brollOverlays.length} overlay(s)...`);
    const { stderr } = await execFileAsync("ffmpeg", ffmpegArgs, { maxBuffer: 10 * 1024 * 1024 });

    // Verify output exists and has size
    const stat = fs.statSync(outputFile);
    if (stat.size < 1000) {
      throw new Error(`FFmpeg output too small (${stat.size} bytes), likely failed`);
    }
    console.log(`🎬 Post-processed video: ${(stat.size / 1024 / 1024).toFixed(1)}MB`);

    // 6. Upload or save locally
    let processedUrl: string;
    if (isGcsConfigured()) {
      const destFilename = `processed-videos/${lessonId}-${Date.now()}.mp4`;
      processedUrl = await uploadAsset(outputFile, destFilename, "video/mp4");
      console.log(`☁️ Uploaded processed video to GCS: ${processedUrl}`);
    } else {
      // Save to attached_assets locally
      const assetsDir = path.resolve(process.cwd(), "attached_assets");
      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
      }
      const localFilename = `processed-${lessonId}-${Date.now()}.mp4`;
      const localPath = path.join(assetsDir, localFilename);
      fs.copyFileSync(outputFile, localPath);
      processedUrl = `/attached_assets/${localFilename}`;
      console.log(`📁 Saved processed video locally: ${processedUrl}`);
    }

    return processedUrl;
  } finally {
    // Cleanup temp files
    for (const f of tmpFiles) {
      try { fs.unlinkSync(f); } catch {}
    }
  }
}
