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
 * Get the GCS URL for an avatar's intro video
 */
export function getAvatarIntroVideoUrl(avatarSlug: string): string | null {
  const introVideoFiles: Record<string, string> = {
    "mark-kohl": "public/intro_videos/mark intro music.mp4",
    "mark": "public/intro_videos/mark intro music.mp4",
    "willie-gault": "public/intro_videos/willie music _2.mp4",
    "willie": "public/intro_videos/willie music _2.mp4",
    "june": "public/intro_videos/june intro music.mp4",
    "thad": "public/intro_videos/Thad intro music.mp4",
    "ann": "public/intro_videos/ann intro music.mp4",
    "kelsey": "public/intro_videos/kelsey intro music.mp4",
    "judy": "public/intro_videos/judy intro music2.mp4",
    "dexter": "public/intro_videos/dexter intro music _2.mp4",
    "shawn": "public/intro_videos/Shawn intro music.mp4",
  };

  const objectPath = introVideoFiles[avatarSlug];
  if (!objectPath) return null;

  const bucketName = process.env.GCS_BUCKET_NAME;
  if (!bucketName) return null;

  return `https://storage.googleapis.com/${bucketName}/${encodeURIComponent(objectPath)}`;
}

/**
 * Concatenate intro/outro videos with the main video using ffmpeg concat demuxer.
 * This is done as a separate step before overlay/music processing.
 */
async function concatIntroOutro(
  mainVideoFile: string,
  introUrl: string | null,
  outroUrl: string | null,
  tmpFiles: string[],
): Promise<string> {
  const segments: string[] = [];

  // Download intro if available
  if (introUrl) {
    try {
      const introFile = await downloadToTemp(introUrl, ".mp4");
      tmpFiles.push(introFile);
      segments.push(introFile);
      console.log(`🎬 Intro video downloaded`);
    } catch (e: any) {
      console.warn(`⚠️ Failed to download intro video: ${e.message}`);
    }
  }

  segments.push(mainVideoFile);

  // Download outro if available
  if (outroUrl) {
    try {
      const outroFile = await downloadToTemp(outroUrl, ".mp4");
      tmpFiles.push(outroFile);
      segments.push(outroFile);
      console.log(`🎬 Outro video downloaded`);
    } catch (e: any) {
      console.warn(`⚠️ Failed to download outro video: ${e.message}`);
    }
  }

  // If only the main video, no concat needed
  if (segments.length === 1) return mainVideoFile;

  // Re-encode all segments to same format for concat compatibility
  const normalizedSegments: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const normalized = path.join(os.tmpdir(), `elxr-norm-${i}-${Date.now()}.ts`);
    tmpFiles.push(normalized);
    await execFileAsync("ffmpeg", [
      "-i", segments[i],
      "-c:v", "libx264", "-preset", "fast", "-crf", "23",
      "-c:a", "aac", "-ar", "44100", "-ac", "2",
      "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",
      "-r", "25",
      "-y", normalized,
    ], { maxBuffer: 10 * 1024 * 1024, timeout: 120000 });
    normalizedSegments.push(normalized);
  }

  // Write concat list file
  const concatListFile = path.join(os.tmpdir(), `elxr-concat-${Date.now()}.txt`);
  tmpFiles.push(concatListFile);
  const concatContent = normalizedSegments.map(f => `file '${f}'`).join("\n");
  fs.writeFileSync(concatListFile, concatContent);

  // Concat
  const concatOutput = path.join(os.tmpdir(), `elxr-concat-out-${Date.now()}.mp4`);
  tmpFiles.push(concatOutput);
  await execFileAsync("ffmpeg", [
    "-f", "concat", "-safe", "0",
    "-i", concatListFile,
    "-c", "copy",
    "-movflags", "+faststart",
    "-y", concatOutput,
  ], { maxBuffer: 10 * 1024 * 1024, timeout: 120000 });

  console.log(`🎬 Concat complete: ${segments.length} segments`);
  return concatOutput;
}

/**
 * Post-process a HeyGen video:
 * - Prepend/append avatar intro/outro videos
 * - Overlay B-roll (video/image) at correct timestamps
 * - Mix in background music at low volume
 */
export async function postProcessBrollOverlay(
  videoUrl: string,
  sceneTimings: SceneTiming[],
  lessonId: string,
  backgroundMusicUrl?: string | null,
  avatarIntroUrl?: string | null,
  avatarOutroUrl?: string | null,
): Promise<string> {
  const tmpFiles: string[] = [];

  try {
    // 1. Download HeyGen video
    console.log(`🎬 Post-processing: downloading HeyGen video...`);
    let videoFile = await downloadToTemp(videoUrl, ".mp4");
    tmpFiles.push(videoFile);

    // 1b. Concat intro/outro if provided
    if (avatarIntroUrl || avatarOutroUrl) {
      videoFile = await concatIntroOutro(videoFile, avatarIntroUrl, avatarOutroUrl, tmpFiles);
    }

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
