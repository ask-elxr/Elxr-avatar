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
  brollVideoUrl?: string;
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
 * Post-process a HeyGen video:
 * - Overlay B-roll (video/image) at correct timestamps
 * - Mix in background music at low volume
 */
export async function postProcessBrollOverlay(
  videoUrl: string,
  sceneTimings: SceneTiming[],
  lessonId: string,
  backgroundMusicUrl?: string | null,
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
    const brollOverlays: { file: string; startSec: number; endSec: number; isVideo: boolean }[] = [];
    let cumulativeSec = 0;

    for (const scene of sceneTimings) {
      const startSec = cumulativeSec;
      const endSec = cumulativeSec + scene.durationSec;

      if (scene.type === "broll") {
        // Prefer video B-roll over image B-roll
        if (scene.brollVideoUrl) {
          const videoClipFile = await downloadToTemp(scene.brollVideoUrl, ".mp4");
          tmpFiles.push(videoClipFile);
          brollOverlays.push({ file: videoClipFile, startSec, endSec, isVideo: true });
          console.log(`🎬 B-roll video overlay: scene ${scene.sceneIndex} at ${startSec.toFixed(1)}s–${endSec.toFixed(1)}s`);
        } else if (scene.brollImageUrl) {
          const ext = scene.brollImageUrl.match(/\.(jpe?g|png|webp)/i)?.[0] || ".jpg";
          const imageFile = await downloadToTemp(scene.brollImageUrl, ext);
          tmpFiles.push(imageFile);
          brollOverlays.push({ file: imageFile, startSec, endSec, isVideo: false });
          console.log(`🖼️ B-roll image overlay: scene ${scene.sceneIndex} at ${startSec.toFixed(1)}s–${endSec.toFixed(1)}s`);
        }
      }

      cumulativeSec = endSec;
    }

    // Download background music if provided
    let musicFile: string | null = null;
    if (backgroundMusicUrl) {
      try {
        musicFile = await downloadToTemp(backgroundMusicUrl, ".mp3");
        tmpFiles.push(musicFile);
        console.log(`🎵 Background music downloaded for mixing`);
      } catch (e: any) {
        console.warn(`⚠️ Failed to download background music: ${e.message}`);
      }
    }

    if (brollOverlays.length === 0 && !musicFile) {
      console.log(`🎬 No post-processing needed`);
      return videoUrl;
    }

    // 4. Build ffmpeg filter_complex
    const inputArgs: string[] = ["-i", videoFile];
    for (const overlay of brollOverlays) {
      inputArgs.push("-i", overlay.file);
    }

    let filterParts: string[] = [];
    let prevLabel = "0:v";

    for (let i = 0; i < brollOverlays.length; i++) {
      const inputIdx = i + 1; // 0 is the video, 1+ are images/videos
      const overlay = brollOverlays[i];
      const scaledLabel = `b${i}`;
      const outLabel = i < brollOverlays.length - 1 ? `tmp${i}` : "out";

      if (overlay.isVideo) {
        // For video B-roll: scale, loop/trim to match scene duration, overlay at timestamp
        const duration = overlay.endSec - overlay.startSec;
        filterParts.push(
          `[${inputIdx}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,setpts=PTS+${overlay.startSec}/TB[${scaledLabel}]`
        );
      } else {
        // For image B-roll: scale to fill frame
        filterParts.push(`[${inputIdx}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1[${scaledLabel}]`);
      }
      // Overlay with time-based enable
      filterParts.push(
        `[${prevLabel}][${scaledLabel}]overlay=0:0:enable='between(t,${overlay.startSec.toFixed(3)},${overlay.endSec.toFixed(3)})'[${outLabel}]`
      );
      prevLabel = outLabel;
    }

    // Add background music input and audio mixing filter
    const musicInputIdx = 1 + brollOverlays.length; // after video + all B-roll inputs
    if (musicFile) {
      inputArgs.push("-i", musicFile);
      // Mix original voice (full volume) with background music (low volume ~12%)
      // -shortest ensures music doesn't extend beyond video length
      filterParts.push(
        `[0:a]volume=1.0[voice];[${musicInputIdx}:a]volume=0.12[bgm];[voice][bgm]amix=inputs=2:duration=shortest[aout]`
      );
    }

    const hasVideoFilter = brollOverlays.length > 0;
    const hasAudioFilter = !!musicFile;
    const filterComplex = filterParts.join(";\n");

    // 5. Run ffmpeg
    const outputFile = path.join(os.tmpdir(), `elxr-processed-${lessonId}-${Date.now()}.mp4`);
    tmpFiles.push(outputFile);

    const ffmpegArgs = [...inputArgs];

    if (filterParts.length > 0) {
      ffmpegArgs.push("-filter_complex", filterComplex);
    }

    // Map video: use overlay output if B-roll exists, otherwise copy original
    if (hasVideoFilter) {
      ffmpegArgs.push("-map", "[out]");
    } else {
      ffmpegArgs.push("-map", "0:v");
    }

    // Map audio: use mixed audio if music exists, otherwise copy original
    if (hasAudioFilter) {
      ffmpegArgs.push("-map", "[aout]");
    } else {
      ffmpegArgs.push("-map", "0:a", "-c:a", "copy");
    }

    ffmpegArgs.push(
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "23",
      "-movflags", "+faststart",
      "-y",
      outputFile,
    );

    console.log(`🎬 Running ffmpeg with ${brollOverlays.length} overlay(s)...`);
    const { stderr } = await execFileAsync("ffmpeg", ffmpegArgs, { maxBuffer: 10 * 1024 * 1024, timeout: 300000 });

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
