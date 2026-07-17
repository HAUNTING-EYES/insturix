/**
 * Worker-side reference fetch (Master v1.1 §7) — puts a reference video on local disk so the
 * deterministic cut detector (detect-cuts-ffmpeg.ts) has bytes to analyze.
 *
 * Two cases:
 *   - URL (a Trends exemplar / pasted link) → yt-dlp downloads it to a temp dir. The YouTube
 *     anti-bot block is PER-VIDEO: `--js-runtimes node -f 18` (legacy muxed MP4, no remote code)
 *     pulls most shorts; 360p is plenty for scene detection. Undownloadable videos fail loud.
 *   - Local path (an uploaded file) → passthrough, no copy, no-op cleanup.
 *
 * The caller MUST `await cleanup()` in a finally — it removes the temp download (no-op for uploads).
 * `runDownload` is injected so the orchestration is testable without the network.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A downloaded file under this many bytes is treated as an error page / empty stream, not a video. */
const MIN_VIDEO_BYTES = 10_000; // ⚠️ INVENTED sanity floor — a real short is ≥100KB

/** Prefer the unsigned muxed 360p (fmt 18); fall back to any mp4, then anything yt-dlp can mux. */
const YTDLP_FORMAT = '18/best[ext=mp4]/best';

export interface FetchedReferenceVideo {
  filePath: string;
  source: 'download' | 'local';
  /** Removes the temp download; no-op for a local passthrough. Always call in a finally. */
  cleanup: () => Promise<void>;
}

export type RunDownload = (url: string, outPath: string) => Promise<{ code: number; stderr: string }>;

export interface FetchReferenceOptions {
  runDownload?: RunDownload;
  /** Base temp directory (override for tests). */
  tmpBase?: string;
}

function isUrl(reference: string): boolean {
  return /^https?:\/\//i.test(reference);
}

function realRunDownload(url: string, outPath: string): Promise<{ code: number; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn('yt-dlp', ['--js-runtimes', 'node', '--no-warnings', '--no-playlist', '-f', YTDLP_FORMAT, '-o', outPath, url]);
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += String(d)));
    proc.on('error', reject);
    proc.on('close', (code) => resolvePromise({ code: code ?? -1, stderr }));
  });
}

async function fileSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch {
    return -1;
  }
}

/**
 * Resolve a reference (URL or local path) to a local video file for ffmpeg. Fail-loud (R18N):
 * throws on a non-zero yt-dlp exit, a missing/too-small download, or a local path that isn't a file.
 */
export async function fetchReferenceVideoFile(reference: string, opts: FetchReferenceOptions = {}): Promise<FetchedReferenceVideo> {
  if (!isUrl(reference)) {
    const size = await fileSize(reference);
    if (size < 0) throw new Error(`reference video not found on disk: ${reference}`);
    return { filePath: reference, source: 'local', cleanup: async () => {} };
  }

  const run = opts.runDownload ?? realRunDownload;
  const dir = await mkdtemp(join(opts.tmpBase ?? tmpdir(), 'refvideo-'));
  const outPath = join(dir, 'video.mp4');
  const cleanup = async () => {
    await rm(dir, { recursive: true, force: true });
  };
  try {
    const { code, stderr } = await run(reference, outPath);
    if (code !== 0) throw new Error(`yt-dlp failed (exit ${code}) for ${reference}: ${stderr.slice(-300)}`);
    const size = await fileSize(outPath);
    if (size < MIN_VIDEO_BYTES) throw new Error(`download produced no usable video for ${reference} (${size} bytes)`);
    return { filePath: outPath, source: 'download', cleanup };
  } catch (err) {
    await cleanup(); // never leak the temp dir on failure
    throw err;
  }
}
