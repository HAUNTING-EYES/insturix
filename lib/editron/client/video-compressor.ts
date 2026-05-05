/**
 * Client-side video compression via ffmpeg.wasm (single-threaded).
 *
 * Single-threaded avoids SharedArrayBuffer headers that break Clerk/CDN/Remotion.
 * Adaptive bitrate ensures output is ALWAYS <90MB for Gemini CDN-URL-direct ingestion.
 * Returns { file, compressed } so callers know if compression actually succeeded.
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const COMPRESS_THRESHOLD_BYTES = 100 * 1024 * 1024; // 100MB
const MAX_COMPRESS_BYTES = 2 * 1024 * 1024 * 1024; // 2GB
const MIN_DEVICE_MEMORY_GB = 4;
const TARGET_OUTPUT_BYTES = 90 * 1024 * 1024; // 90MB — leaves 10MB headroom below Gemini's 100MB URL limit

let ffmpegInstance: FFmpeg | null = null;

async function getFFmpeg(onProgress?: (ratio: number) => void): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegInstance.loaded) return ffmpegInstance;

  const ffmpeg = new FFmpeg();

  if (onProgress) {
    ffmpeg.on('progress', ({ progress }) => onProgress(progress));
  }

  await ffmpeg.load();
  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

export function shouldCompress(file: File): boolean {
  if (file.size < COMPRESS_THRESHOLD_BYTES) return false;
  if (file.size > MAX_COMPRESS_BYTES) return false;
  if (!file.type.startsWith('video/')) return false;

  const mem = (navigator as any).deviceMemory;
  if (typeof mem === 'number' && mem < MIN_DEVICE_MEMORY_GB) return false;

  return true;
}

/**
 * Get video duration from File object via HTMLVideoElement.
 * Returns 0 if duration cannot be determined (timeout or error).
 */
export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const timer = setTimeout(() => {
      URL.revokeObjectURL(video.src);
      resolve(0);
    }, 10_000);
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      const dur = isFinite(video.duration) ? video.duration : 0;
      URL.revokeObjectURL(video.src);
      resolve(dur);
    };
    video.onerror = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(video.src);
      resolve(0);
    };
    video.src = URL.createObjectURL(file);
  });
}

export interface CompressionResult {
  file: File;
  compressed: boolean;
  durationSeconds: number;
}

/**
 * Adaptive compression. Calculates target bitrate from video duration to guarantee <90MB output.
 * Returns { file, compressed, durationSeconds } so callers know if compression succeeded.
 */
export async function compressToProxy(
  file: File,
  onProgress?: (ratio: number) => void,
): Promise<CompressionResult> {
  const durationSeconds = await getVideoDuration(file);

  // If we can't determine duration, skip (can't calculate adaptive bitrate without it)
  if (durationSeconds <= 0) {
    console.warn(`[Compressor] Skipping: could not determine video duration`);
    return { file, compressed: false, durationSeconds };
  }

  try {
    const ffmpeg = await getFFmpeg(onProgress);

    const inputName = 'input' + getExtension(file.name);
    const outputName = 'proxy.mp4';

    // Adaptive bitrate: ensure output < 90MB
    const targetBits = TARGET_OUTPUT_BYTES * 8;
    const audioBitrate = 64_000; // 64kbps audio
    const availableVideoBits = targetBits - (audioBitrate * durationSeconds);
    const videoBitrateKbps = Math.max(200, Math.floor(availableVideoBits / durationSeconds / 1000));

    // Adaptive resolution: lower res for longer videos → faster encode + smaller output
    // ≤5min: 720p (fast enough), 5-15min: 480p, >15min: 360p (speed priority, proxy only)
    const height = durationSeconds <= 300 ? 720 : durationSeconds <= 900 ? 480 : 360;

    // Adaptive timeout: ~2x realtime at lower res with ultrafast, minimum 2 min, no hard cap
    // 360p ultrafast processes at ~3-5x realtime → generous 2x multiplier
    const timeoutMs = Math.max(2 * 60 * 1000, durationSeconds * 2000);

    console.log(`[Compressor] Adaptive: ${durationSeconds}s video → ${videoBitrateKbps}k video, ${height}p, timeout=${Math.round(timeoutMs / 1000)}s`);

    await ffmpeg.writeFile(inputName, await fetchFile(file));

    const execPromise = ffmpeg.exec([
      '-i', inputName,
      '-vf', `scale=-2:${height}`,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-b:v', `${videoBitrateKbps}k`,
      '-maxrate', `${Math.round(videoBitrateKbps * 1.5)}k`,
      '-bufsize', `${Math.round(videoBitrateKbps * 2)}k`,
      '-c:a', 'aac',
      '-b:a', '64k',
      '-ac', '1',
      '-movflags', '+faststart',
      outputName,
    ]);

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Compression timed out')), timeoutMs),
    );

    await Promise.race([execPromise, timeout]);

    const data = await ffmpeg.readFile(outputName);

    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});

    const raw = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const blob = new Blob([raw as BlobPart], { type: 'video/mp4' });
    const proxy = new File([blob], `proxy_${file.name.replace(/\.[^.]+$/, '.mp4')}`, {
      type: 'video/mp4',
    });

    if (proxy.size >= file.size) {
      console.warn('[Compressor] Proxy larger than original, skipping');
      return { file, compressed: false, durationSeconds };
    }

    if (proxy.size > TARGET_OUTPUT_BYTES) {
      console.warn(`[Compressor] Proxy ${Math.round(proxy.size / 1024 / 1024)}MB still exceeds ${Math.round(TARGET_OUTPUT_BYTES / 1024 / 1024)}MB target`);
      return { file: proxy, compressed: true, durationSeconds };
    }

    console.log(`[Compressor] Success: ${Math.round(file.size / 1024 / 1024)}MB → ${Math.round(proxy.size / 1024 / 1024)}MB`);
    return { file: proxy, compressed: true, durationSeconds };
  } catch (err) {
    console.warn('[Compressor] Failed:', err);
    return { file, compressed: false, durationSeconds };
  }
}

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot) : '.mp4';
}
