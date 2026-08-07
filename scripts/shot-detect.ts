/**
 * Eval oracle — DETERMINISTIC shot-boundary detection for visual-fingerprint ground truth.
 *
 * The codebase's "Layer 1 shot detection" actually uses Gemini Vision (five-track-analysis.ts:476,
 * "PySceneDetect not available on Vercel"), so it cannot grade the Gemini visual extractor without
 * being circular. This runs LOCALLY (eval only, no Vercel constraint): yt-dlp downloads the video,
 * ffmpeg's scene filter reports objective cut timestamps a human doesn't have to eyeball.
 * Playbook §7: deterministic checks for objective contracts.
 *
 * (@distube/ytdl-core is currently broken against YouTube's player script — "Could not parse
 * decipher function" → 403 — so we shell out to yt-dlp, which is installed.)
 *
 *   Run: npx tsx scripts/shot-detect.ts <youtube-url-or-id> [sceneThreshold]
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

/** ffmpeg scene score above which a frame is a cut. 0.3 = ffmpeg's conventional default (calibratable). */
const DEFAULT_SCENE_THRESHOLD = 0.3;

function run(cmd: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += String(d)));
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ code: code ?? -1, stderr }));
  });
}

async function downloadVideo(url: string, outPath: string): Promise<void> {
  const { code, stderr } = await run('yt-dlp', [
    '-f', 'best[height<=480][ext=mp4]/best[ext=mp4]/best',
    '--no-playlist',
    '-o', outPath,
    url,
  ]);
  if (code !== 0) throw new Error(`yt-dlp failed (${code}): ${stderr.slice(-300)}`);
}

/** ffmpeg select='gt(scene,T)',showinfo → pts_time of every detected cut. */
async function detectCuts(videoPath: string, threshold: number): Promise<number[]> {
  const { stderr } = await run(ffmpegInstaller.path, [
    '-i', videoPath,
    '-filter:v', `select='gt(scene,${threshold})',showinfo`,
    '-f', 'null', '-',
  ]);
  return [...stderr.matchAll(/pts_time:([0-9.]+)/g)].map((m) => Number(m[1])).filter((t) => Number.isFinite(t));
}

/** Total duration (seconds) via ffmpeg's Duration line — useful context for the ground truth. */
function parseDuration(stderr: string): number | null {
  const m = stderr.match(/Duration:\s*(\d+):(\d+):([0-9.]+)/);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('usage: npx tsx scripts/shot-detect.ts <youtube-url-or-id> [sceneThreshold]');
    process.exit(1);
  }
  const url = arg.startsWith('http') ? arg : `https://www.youtube.com/watch?v=${arg}`;
  const threshold = Number(process.argv[3] ?? DEFAULT_SCENE_THRESHOLD);

  const dir = await mkdtemp(join(tmpdir(), 'shotdetect-'));
  const videoPath = join(dir, 'v.mp4');
  try {
    console.log(`downloading ${url} ...`);
    const t0 = Date.now();
    await downloadVideo(url, videoPath);
    console.log(`downloaded in ${Date.now() - t0}ms`);

    const probe = await run(ffmpegInstaller.path, ['-i', videoPath]);
    const duration = parseDuration(probe.stderr);
    console.log(`duration: ${duration !== null ? duration.toFixed(2) + 's' : 'unknown'}`);

    console.log(`detecting cuts (ffmpeg scene > ${threshold}) ...`);
    const cuts = await detectCuts(videoPath, threshold);
    console.log(`\nOBJECTIVE CUTS (${cuts.length}):`);
    console.log(cuts.map((t) => `  ${t.toFixed(2)}s (${Math.round(t * 1000)}ms)`).join('\n') || '  (none)');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('FAILED:', err?.message ?? err);
  process.exit(1);
});
