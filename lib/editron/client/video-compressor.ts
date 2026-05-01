/**
 * Client-side video compression via ffmpeg.wasm (single-threaded).
 *
 * Single-threaded avoids SharedArrayBuffer headers that break Clerk/CDN/Remotion.
 * Compression is best-effort — falls back to original on failure.
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const COMPRESS_THRESHOLD_BYTES = 100 * 1024 * 1024; // 100MB
const MAX_COMPRESS_BYTES = 2 * 1024 * 1024 * 1024; // 2GB
const MIN_DEVICE_MEMORY_GB = 4;

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

const COMPRESS_TIMEOUT_MS = 5 * 60 * 1000; // 5 min max

/**
 * Best-effort compression. Returns original file on ANY failure.
 */
export async function compressToProxy(
  file: File,
  onProgress?: (ratio: number) => void,
): Promise<File> {
  try {
    const ffmpeg = await getFFmpeg(onProgress);

    const inputName = 'input' + getExtension(file.name);
    const outputName = 'proxy.mp4';

    await ffmpeg.writeFile(inputName, await fetchFile(file));

    const execPromise = ffmpeg.exec([
      '-i', inputName,
      '-vf', 'scale=-2:720',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-b:v', '1M',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      outputName,
    ]);

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Compression timed out')), COMPRESS_TIMEOUT_MS),
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

    // If proxy is larger than original, skip compression
    if (proxy.size >= file.size) {
      console.warn('[Compressor] Proxy larger than original, skipping');
      return file;
    }

    return proxy;
  } catch (err) {
    console.warn('[Compressor] Failed, using original:', err);
    return file;
  }
}

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot) : '.mp4';
}
