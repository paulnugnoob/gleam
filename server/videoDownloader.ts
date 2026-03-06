import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { promisify } from "node:util";
import { exec, spawn } from "node:child_process";

const execAsync = promisify(exec);

export type ExtractionMode = "fixed_fps" | "scene_change";

export interface FrameExtractionConfig {
  mode: ExtractionMode;
  secondsPerFrame: number;
  minFrames: number;
  maxFrames: number;
  sceneChangeThreshold: number;
  minFrameSpacingSec: number;
}

export const DEFAULT_FRAME_CONFIG: FrameExtractionConfig = {
  mode: "scene_change",
  secondsPerFrame: 5,
  minFrames: 6,
  maxFrames: 40,
  sceneChangeThreshold: 0.3,
  minFrameSpacingSec: 2.0,
};

export const FIXED_FPS_CONFIG: FrameExtractionConfig = {
  mode: "fixed_fps",
  secondsPerFrame: 5,
  minFrames: 6,
  maxFrames: 40,
  sceneChangeThreshold: 0.3,
  minFrameSpacingSec: 2.0,
};

export function calculateFrameCount(
  durationSeconds: number,
  config: FrameExtractionConfig = DEFAULT_FRAME_CONFIG
): number {
  const calculatedFrames = Math.floor(durationSeconds / config.secondsPerFrame);
  return Math.max(config.minFrames, Math.min(calculatedFrames, config.maxFrames));
}

export interface VideoMetadata {
  title: string;
  description: string;
  duration: number;
  uploader: string;
  uploadDate: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  thumbnailUrl: string;
  platform: string;
  originalUrl: string;
}

export interface DownloadResult {
  videoPath: string;
  audioPath: string | null;
  metadata: VideoMetadata;
  transcription: string | null;
}

function detectPlatform(url: string): string {
  if (url.includes("tiktok.com")) return "TikTok";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "YouTube";
  if (url.includes("instagram.com")) return "Instagram";
  return "Unknown";
}

export async function getVideoMetadata(videoUrl: string): Promise<VideoMetadata> {
  try {
    const { stdout } = await execAsync(
      `yt-dlp --dump-json --no-warnings "${videoUrl}"`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    
    const info = JSON.parse(stdout);
    
    return {
      title: info.title || "Untitled Video",
      description: info.description || "",
      duration: info.duration || 0,
      uploader: info.uploader || info.channel || "Unknown",
      uploadDate: info.upload_date || "",
      viewCount: info.view_count || 0,
      likeCount: info.like_count || 0,
      commentCount: info.comment_count || 0,
      thumbnailUrl: info.thumbnail || "",
      platform: detectPlatform(videoUrl),
      originalUrl: videoUrl,
    };
  } catch (error) {
    console.error("Error fetching video metadata:", error);
    return {
      title: "Untitled Video",
      description: "",
      duration: 0,
      uploader: "Unknown",
      uploadDate: "",
      viewCount: 0,
      likeCount: 0,
      commentCount: 0,
      thumbnailUrl: "",
      platform: detectPlatform(videoUrl),
      originalUrl: videoUrl,
    };
  }
}

export async function downloadVideo(videoUrl: string): Promise<DownloadResult> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gleam-video-"));
  const videoPath = path.join(tempDir, "video.mp4");
  const audioPath = path.join(tempDir, "audio.m4a");
  
  console.log(`Downloading video from: ${videoUrl}`);
  console.log(`Temp directory: ${tempDir}`);

  const metadata = await getVideoMetadata(videoUrl);

  try {
    await new Promise<void>((resolve, reject) => {
      const args = [
        videoUrl,
        "-f", "bestvideo[ext=mp4][height<=720]+bestaudio[ext=m4a]/best[ext=mp4][height<=720]/best[height<=720]/best",
        "-o", videoPath,
        "--no-playlist",
        "--no-warnings",
        "--socket-timeout", "60",
        "--retries", "3",
        "--merge-output-format", "mp4",
      ];

      console.log("yt-dlp args:", args.join(" "));

      const proc = spawn("yt-dlp", args);

      let stderr = "";

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
        console.log("yt-dlp:", data.toString().trim());
      });

      proc.stdout.on("data", (data) => {
        console.log("yt-dlp:", data.toString().trim());
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`));
        }
      });

      proc.on("error", (err) => {
        reject(err);
      });
    });

    if (!fs.existsSync(videoPath)) {
      const files = fs.readdirSync(tempDir);
      const videoFile = files.find(f => f.endsWith(".mp4") || f.endsWith(".webm") || f.endsWith(".mkv"));
      if (videoFile) {
        const actualPath = path.join(tempDir, videoFile);
        fs.renameSync(actualPath, videoPath);
      }
    }

    if (!fs.existsSync(videoPath)) {
      throw new Error("Video file was not created after download");
    }

    console.log("Video downloaded successfully");
  } catch (error) {
    console.error("Error downloading video:", error);
    throw new Error(`Failed to download video: ${error}`);
  }

  let extractedAudioPath: string | null = null;
  try {
    await execAsync(`ffmpeg -i "${videoPath}" -vn -acodec aac -ab 128k "${audioPath}" -y`);
    extractedAudioPath = audioPath;
    console.log("Audio extracted successfully");
  } catch (error) {
    console.warn("Could not extract audio:", error);
  }

  return {
    videoPath,
    audioPath: extractedAudioPath,
    metadata,
    transcription: null,
  };
}

export interface ExtractFramesResult {
  framePaths: string[];
  duration: number;
  frameCount: number;
  mode: ExtractionMode;
  sceneTimestamps?: number[];
}

async function getVideoDuration(videoPath: string): Promise<number> {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
  );
  return parseFloat(stdout.trim()) || 30;
}

async function detectSceneChanges(
  videoPath: string,
  threshold: number
): Promise<number[]> {
  try {
    const cmd = `ffmpeg -i "${videoPath}" -vf "select='gt(scene,${threshold})',showinfo" -f null - 2>&1`;
    const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });
    const output = stdout + stderr;
    
    const timestamps: number[] = [];
    const regex = /pts_time:(\d+\.?\d*)/g;
    let match;
    
    while ((match = regex.exec(output)) !== null) {
      timestamps.push(parseFloat(match[1]));
    }
    
    return timestamps;
  } catch (error) {
    console.warn("Scene detection failed, falling back to fixed FPS:", error);
    return [];
  }
}

function filterTimestamps(
  timestamps: number[],
  duration: number,
  config: FrameExtractionConfig
): number[] {
  if (timestamps.length === 0) return [];

  const allTimestamps = [0, ...timestamps];
  if (allTimestamps[allTimestamps.length - 1] < duration - 2) {
    allTimestamps.push(duration - 1);
  }

  const filtered: number[] = [];
  let lastTimestamp = -Infinity;

  for (const ts of allTimestamps) {
    if (ts - lastTimestamp >= config.minFrameSpacingSec) {
      filtered.push(ts);
      lastTimestamp = ts;
      
      if (filtered.length >= config.maxFrames) break;
    }
  }

  if (filtered.length < config.minFrames) {
    const interval = duration / (config.minFrames + 1);
    const evenlySpaced: number[] = [];
    for (let i = 1; i <= config.minFrames; i++) {
      evenlySpaced.push(interval * i);
    }
    return evenlySpaced;
  }

  return filtered;
}

async function extractFrameAtTimestamp(
  videoPath: string,
  timestamp: number,
  outputPath: string
): Promise<boolean> {
  try {
    await execAsync(
      `ffmpeg -ss ${timestamp} -i "${videoPath}" -vframes 1 -q:v 2 "${outputPath}" -y`
    );
    return fs.existsSync(outputPath);
  } catch {
    return false;
  }
}

async function extractFramesFixedFps(
  videoPath: string,
  duration: number,
  config: FrameExtractionConfig,
  framesDir: string
): Promise<ExtractFramesResult> {
  const frameCount = calculateFrameCount(duration, config);
  const interval = duration / (frameCount + 1);
  const framePaths: string[] = [];

  console.log(`[fixed_fps] Video: ${duration.toFixed(1)}s, extracting ${frameCount} frames (1 per ${config.secondsPerFrame}s)`);

  for (let i = 1; i <= frameCount; i++) {
    const timestamp = interval * i;
    const framePath = path.join(framesDir, `frame_${i.toString().padStart(3, "0")}.jpg`);
    
    if (await extractFrameAtTimestamp(videoPath, timestamp, framePath)) {
      framePaths.push(framePath);
    }
  }

  console.log(`[fixed_fps] Extracted ${framePaths.length} frames`);
  return { framePaths, duration, frameCount: framePaths.length, mode: "fixed_fps" };
}

async function extractFramesSceneChange(
  videoPath: string,
  duration: number,
  config: FrameExtractionConfig,
  framesDir: string
): Promise<ExtractFramesResult> {
  console.log(`[scene_change] Detecting scene changes (threshold: ${config.sceneChangeThreshold})...`);
  
  const rawTimestamps = await detectSceneChanges(videoPath, config.sceneChangeThreshold);
  console.log(`[scene_change] Found ${rawTimestamps.length} raw scene changes`);
  
  if (rawTimestamps.length === 0) {
    console.log(`[scene_change] No scenes detected, falling back to fixed FPS`);
    return extractFramesFixedFps(videoPath, duration, config, framesDir);
  }

  const timestamps = filterTimestamps(rawTimestamps, duration, config);
  console.log(`[scene_change] Filtered to ${timestamps.length} keyframes (min spacing: ${config.minFrameSpacingSec}s, max: ${config.maxFrames})`);

  const framePaths: string[] = [];
  
  for (let i = 0; i < timestamps.length; i++) {
    const timestamp = timestamps[i];
    const framePath = path.join(framesDir, `frame_${(i + 1).toString().padStart(3, "0")}.jpg`);
    
    if (await extractFrameAtTimestamp(videoPath, timestamp, framePath)) {
      framePaths.push(framePath);
    }
  }

  console.log(`[scene_change] Extracted ${framePaths.length} keyframes`);
  return {
    framePaths,
    duration,
    frameCount: framePaths.length,
    mode: "scene_change",
    sceneTimestamps: timestamps,
  };
}

export async function extractFrames(
  videoPath: string, 
  config: FrameExtractionConfig = DEFAULT_FRAME_CONFIG
): Promise<ExtractFramesResult> {
  const tempDir = path.dirname(videoPath);
  const framesDir = path.join(tempDir, "frames");
  fs.mkdirSync(framesDir, { recursive: true });

  try {
    const duration = await getVideoDuration(videoPath);
    
    if (config.mode === "scene_change") {
      return await extractFramesSceneChange(videoPath, duration, config, framesDir);
    } else {
      return await extractFramesFixedFps(videoPath, duration, config, framesDir);
    }
  } catch (error) {
    console.error("Error extracting frames:", error);
    return { framePaths: [], duration: 0, frameCount: 0, mode: config.mode };
  }
}

export function cleanupTempFiles(videoPath: string): void {
  try {
    const tempDir = path.dirname(videoPath);
    if (tempDir.includes("gleam-video-")) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log(`Cleaned up temp directory: ${tempDir}`);
    }
  } catch (error) {
    console.warn("Error cleaning up temp files:", error);
  }
}

export function readFileAsBase64(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return buffer.toString("base64");
}

export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".m4a": "audio/m4a",
    ".mp3": "audio/mp3",
    ".wav": "audio/wav",
  };
  return mimeTypes[ext] || "application/octet-stream";
}
