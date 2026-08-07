/**
 * Cut-error quantification with a DETERMINISTIC oracle (Battle-Testing Playbook §7).
 *
 * YouTube's anti-bot block is per-video: format 18 (legacy muxed MP4) still downloads for many
 * shorts without the signature solver. For every short that downloads, we get objective ground
 * truth from ffmpeg scene detection and compare it to the Gemini visual extractor's predicted cuts.
 * No human labelling, no circular Gemini-grades-Gemini. Shorts that don't download are skipped and
 * logged (no silent truncation).
 *
 *   ffmpeg scene>0.3  ← ffmpeg conventional hard-cut threshold (hard cuts reliably exceed it).
 *   match tolerance   ← 500ms: Gemini quantizes cut times to whole seconds, so a real detected cut
 *                       is up to ~500ms from truth; 500ms is the fair apples-to-apples window.
 *
 * Run: npx tsx scripts/cut-error-quantify.ts [maxVideos]
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

try {
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  /* env may already be set */
}

import { google } from 'googleapis';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { extractVisualFingerprint } from '@/lib/editron/reference-video/extract-visual-fingerprint';

const SCENE_THRESHOLD = 0.3; // ffmpeg conventional hard-cut threshold
const MATCH_TOLERANCE_MS = 500; // Gemini quantizes to whole seconds → 500ms fair window
const SEED = 1;

function run(cmd: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn(cmd, args);
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += String(d)));
    proc.on('error', reject);
    proc.on('close', (code) => resolvePromise({ code: code ?? -1, stderr }));
  });
}

/** Try format 18 (unsigned muxed). Returns true if the file exists and is non-trivial. */
async function tryDownload(videoId: string, outPath: string): Promise<boolean> {
  const { code } = await run('yt-dlp', [
    '--js-runtimes', 'node', '--no-warnings', '--no-playlist',
    '-f', '18', '-o', outPath, `https://www.youtube.com/watch?v=${videoId}`,
  ]);
  if (code !== 0) return false;
  try {
    return (await stat(outPath)).size > 10_000;
  } catch {
    return false;
  }
}

/** Deterministic ground-truth cut times (ms) via ffmpeg scene detection. */
async function ffmpegCuts(videoPath: string): Promise<number[]> {
  const { stderr } = await run(ffmpegInstaller.path, [
    '-i', videoPath, '-filter:v', `select='gt(scene,${SCENE_THRESHOLD})',showinfo`, '-f', 'null', '-',
  ]);
  return [...stderr.matchAll(/pts_time:([0-9.]+)/g)].map((m) => Math.round(Number(m[1]) * 1000)).filter((t) => Number.isFinite(t));
}

async function geminiCuts(videoId: string): Promise<number[]> {
  const fp = await extractVisualFingerprint(`https://www.youtube.com/watch?v=${videoId}`, { seed: SEED });
  return (fp.decisionStream ?? [])
    .filter((d) => String(d.family).startsWith('transition_'))
    .map((d) => d.anchor.tMs)
    .sort((a, b) => a - b);
}

/** Greedy 1-1 match within tolerance → tp/fp/fn + timing errors of matched pairs. */
function score(pred: number[], truth: number[]): { tp: number; fp: number; fn: number; errsMs: number[] } {
  const used = new Set<number>();
  let tp = 0;
  const errsMs: number[] = [];
  for (const p of pred) {
    let best = -1;
    let bestD = Infinity;
    truth.forEach((g, i) => {
      if (used.has(i)) return;
      const d = Math.abs(p - g);
      if (d <= MATCH_TOLERANCE_MS && d < bestD) { bestD = d; best = i; }
    });
    if (best >= 0) { used.add(best); tp += 1; errsMs.push(bestD); }
  }
  return { tp, fp: pred.length - tp, fn: truth.length - tp, errsMs };
}

async function fetchShorts(n: number): Promise<Array<{ id: string; title: string }>> {
  const yt = google.youtube({ version: 'v3', auth: process.env.YOUTUBE_API_KEY });
  const res = await yt.search.list({
    part: ['id', 'snippet'], q: 'trending shorts', type: ['video'], videoDuration: 'short', maxResults: n, regionCode: 'IN', order: 'viewCount',
  });
  const out: Array<{ id: string; title: string }> = [];
  for (const it of res.data.items ?? []) {
    if (it.id?.videoId) out.push({ id: it.id.videoId, title: (it.snippet?.title ?? '').slice(0, 50) });
  }
  return out;
}

async function main() {
  if (!process.env.YOUTUBE_API_KEY || !(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) {
    console.error('need YOUTUBE_API_KEY + GEMINI_API_KEY');
    process.exit(1);
  }
  const maxVideos = Number(process.argv[2] ?? 12);
  const shorts = await fetchShorts(maxVideos);
  console.log(`fetched ${shorts.length} shorts; attempting deterministic oracle on each\n`);

  const dir = await mkdtemp(join(tmpdir(), 'cutquant-'));
  const rows: Array<{ id: string; title: string; truth: number[]; pred: number[]; s: ReturnType<typeof score> }> = [];
  let skipped = 0;

  try {
    for (const v of shorts) {
      const path = join(dir, `${v.id}.mp4`);
      const ok = await tryDownload(v.id, path);
      if (!ok) { console.log(`  SKIP ${v.id} (${v.title}) — not downloadable`); skipped += 1; continue; }
      const truth = await ffmpegCuts(path);
      const pred = await geminiCuts(v.id);
      const s = score(pred, truth);
      rows.push({ id: v.id, title: v.title, truth, pred, s });
      console.log(`  OK   ${v.id} (${v.title})`);
      console.log(`         ffmpeg(truth)=${truth.length} @[${truth.map((t) => (t / 1000).toFixed(1)).join(',')}]`);
      console.log(`         gemini(pred) =${pred.length} @[${pred.map((t) => (t / 1000).toFixed(1)).join(',')}]`);
      console.log(`         tp=${s.tp} fp=${s.fp} fn=${s.fn}${s.errsMs.length ? ` timingErr=${Math.round(s.errsMs.reduce((a, b) => a + b, 0) / s.errsMs.length)}ms` : ''}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  const TP = rows.reduce((a, r) => a + r.s.tp, 0);
  const FP = rows.reduce((a, r) => a + r.s.fp, 0);
  const FN = rows.reduce((a, r) => a + r.s.fn, 0);
  const allErrs = rows.flatMap((r) => r.s.errsMs);
  const precision = TP + FP === 0 ? 1 : TP / (TP + FP);
  const recall = TP + FN === 0 ? 1 : TP / (TP + FN);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const countExact = rows.filter((r) => r.truth.length === r.pred.length).length;

  console.log(`\n════ AGGREGATE (${rows.length} videos scored, ${skipped} skipped, oracle=ffmpeg scene>${SCENE_THRESHOLD}, tol=${MATCH_TOLERANCE_MS}ms) ════`);
  console.log(`  cut-count exact match:  ${countExact}/${rows.length} videos`);
  console.log(`  timing precision: ${(precision * 100).toFixed(0)}%  recall: ${(recall * 100).toFixed(0)}%  F1: ${f1.toFixed(2)}`);
  console.log(`  mean timing error on matched cuts: ${allErrs.length ? Math.round(allErrs.reduce((a, b) => a + b, 0) / allErrs.length) + 'ms' : 'n/a'}`);
  console.log(`  → Rule-35 gate F1>=0.85: ${f1 >= 0.85 ? 'PASS (Gemini cuts are good enough)' : 'FAIL (deterministic detector justified)'}`);
}

main().catch((err) => {
  console.error('FAILED:', err?.message ?? err);
  process.exit(1);
});
