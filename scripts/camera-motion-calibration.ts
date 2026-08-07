/**
 * Camera-motion calibration (Battle-Testing Playbook §7 + Rule 29 adversarial).
 *
 * The user confirmed a systematic error on Short #1: the extractor reports cameraMotion="static"
 * when the camera is actually MOVING. The VISUAL_PROMPT fix adds the graph's optical-flow
 * discriminator (crg:1987, "uniform frame motion = camera") + a no-default-to-static rule.
 *
 * This measures the fix on the LIVE extractor (Gemini reads the YouTube URL directly — no download,
 * so it side-steps the YouTube anti-bot that blocks yt-dlp):
 *   PRIMARY   — Short #1 across seeds → "static" rate must drop to ~0 (user ground truth: moving).
 *   ADVERSARIAL — typically locked-off content across seeds → the prompt must STILL be able to emit
 *                 "static" (a fix that calls everything "moving" is just the opposite bug, Rule 29).
 *
 * Run: npx tsx scripts/camera-motion-calibration.ts
 */
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
import { extractVisualFingerprint } from '@/lib/editron/reference-video/extract-visual-fingerprint';

const PRIMARY = { id: 'HLWEt1lazRY', label: 'Short #1 (user: MOVING, not static)' };
const PRIMARY_SEEDS = [1, 2, 3, 4, 5];

/** Content types skewed toward a locked-off / tripod frame — the adversarial "can it still say static?" probe. */
const ADVERSARIAL_QUERIES = ['screen recording tutorial', 'podcast full episode clip'];
const ADVERSARIAL_SEEDS = [1, 2];

interface Run {
  seed: number;
  cameraMotion: string | undefined;
  shotScales: string[] | undefined;
  subjectPosition: string | undefined;
  error?: string;
}

async function runSeeds(url: string, seeds: number[]): Promise<Run[]> {
  const runs: Run[] = [];
  for (const seed of seeds) {
    try {
      const fp = await extractVisualFingerprint(url, { seed });
      runs.push({
        seed,
        cameraMotion: fp.performance?.cameraMotion,
        shotScales: fp.performance?.shotScales,
        subjectPosition: fp.performance?.subjectPosition,
      });
    } catch (e) {
      runs.push({ seed, cameraMotion: undefined, shotScales: undefined, subjectPosition: undefined, error: (e as Error).message });
    }
  }
  return runs;
}

function summarize(runs: Run[]): { staticRate: number; nonStaticRate: number; motions: Record<string, number> } {
  const valid = runs.filter((r) => !r.error && r.cameraMotion !== undefined);
  const motions: Record<string, number> = {};
  for (const r of valid) motions[r.cameraMotion!] = (motions[r.cameraMotion!] ?? 0) + 1;
  const n = valid.length || 1;
  const staticN = motions['static'] ?? 0;
  return { staticRate: staticN / n, nonStaticRate: (valid.length - staticN) / n, motions };
}

function printRuns(header: string, runs: Run[]) {
  console.log(header);
  for (const r of runs) {
    if (r.error) console.log(`  seed ${r.seed}: ERROR ${r.error}`);
    else console.log(`  seed ${r.seed}: cameraMotion=${r.cameraMotion ?? '(none)'}  shots=[${(r.shotScales ?? []).join(',')}]  subj=${r.subjectPosition ?? '(none)'}`);
  }
}

async function searchOneShort(query: string): Promise<{ url: string; title: string } | null> {
  const youtube = google.youtube({ version: 'v3', auth: process.env.YOUTUBE_API_KEY });
  const res = await youtube.search.list({
    part: ['id', 'snippet'], q: query, type: ['video'], videoDuration: 'short', maxResults: 1, order: 'relevance',
  });
  const item = (res.data.items ?? []).find((i) => i.id?.videoId);
  return item ? { url: `https://www.youtube.com/watch?v=${item.id!.videoId}`, title: item.snippet?.title ?? '' } : null;
}

async function main() {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!geminiKey || !process.env.YOUTUBE_API_KEY) {
    console.error('need GEMINI_API_KEY + YOUTUBE_API_KEY');
    process.exit(1);
  }

  // ── PRIMARY: the confirmed-moving case ──
  console.log(`\n════ PRIMARY — ${PRIMARY.label} ════`);
  console.log(`https://www.youtube.com/watch?v=${PRIMARY.id}`);
  const primaryRuns = await runSeeds(`https://www.youtube.com/watch?v=${PRIMARY.id}`, PRIMARY_SEEDS);
  printRuns('per-seed:', primaryRuns);
  const validPrimary = primaryRuns.filter((r) => !r.error && r.cameraMotion !== undefined);
  if (validPrimary.length === 0) {
    console.log(`  → VERDICT: INCONCLUSIVE — 0/${primaryRuns.length} seeds produced a value (all errored). Cannot judge.`);
  } else {
    const p = summarize(primaryRuns);
    console.log(`  → motions: ${JSON.stringify(p.motions)}  (from ${validPrimary.length}/${primaryRuns.length} valid seeds)`);
    console.log(`  → static rate: ${(p.staticRate * 100).toFixed(0)}%  (TARGET 0% — user says moving)`);
    console.log(`  → VERDICT: ${p.staticRate === 0 ? 'PASS (no false static)' : 'FAIL (still reports static)'}`);
  }

  // ── ADVERSARIAL: can it still emit static for genuinely locked content? ──
  console.log(`\n════ ADVERSARIAL — over-correction guard (Rule 29) ════`);
  for (const q of ADVERSARIAL_QUERIES) {
    const hit = await searchOneShort(q);
    if (!hit) { console.log(`  "${q}": no short found`); continue; }
    console.log(`\n  query="${q}" → ${hit.title}\n  ${hit.url}`);
    const runs = await runSeeds(hit.url, ADVERSARIAL_SEEDS);
    printRuns('  per-seed:', runs);
    const s = summarize(runs);
    console.log(`    → motions: ${JSON.stringify(s.motions)}`);
  }
  console.log('\nNOTE: adversarial content is NOT ground-truth-labelled — this only checks the prompt CAN still');
  console.log('emit static. A rigorous static-side gate needs a human-confirmed locked-off reference.');
}

main().catch((err) => {
  console.error('FAILED:', err?.message ?? err);
  process.exit(1);
});
