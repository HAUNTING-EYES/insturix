/**
 * Cut-error quantification (Battle-Testing Playbook §7) — dumps Gemini's PREDICTED cut times for a
 * few shorts across 2 seeds, so a human can label the REAL cuts and we can measure the extractor's
 * cut error before deciding whether a deterministic (ffmpeg/PySceneDetect) detector is worth building.
 * Seed-to-seed instability is itself fabrication evidence. Gemini reads the URL directly (no download).
 *
 * Run: npx tsx scripts/cut-predictions.ts
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

async function fetchTrending(n: number, exclude: string[]): Promise<Array<{ id: string; title: string }>> {
  const yt = google.youtube({ version: 'v3', auth: process.env.YOUTUBE_API_KEY });
  const res = await yt.search.list({
    part: ['id', 'snippet'], q: 'trending shorts', type: ['video'], videoDuration: 'short', maxResults: 8, regionCode: 'IN', order: 'viewCount',
  });
  const out: Array<{ id: string; title: string }> = [];
  for (const it of res.data.items ?? []) {
    const id = it.id?.videoId;
    if (id && !exclude.includes(id)) out.push({ id, title: it.snippet?.title ?? '' });
    if (out.length >= n) break;
  }
  return out;
}

async function cutsFor(url: string, seed: number): Promise<number[]> {
  const fp = await extractVisualFingerprint(url, { seed });
  return (fp.decisionStream ?? [])
    .filter((d) => String(d.family).startsWith('transition_'))
    .map((d) => d.anchor.tMs)
    .sort((a, b) => a - b);
}

async function main() {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!geminiKey || !process.env.YOUTUBE_API_KEY) {
    console.error('need GEMINI_API_KEY + YOUTUBE_API_KEY');
    process.exit(1);
  }

  const first = { id: 'HLWEt1lazRY', title: 'Short #1 (Sweetheart — user: camera moving)' };
  const more = await fetchTrending(2, [first.id]);
  const vids = [first, ...more];

  for (const v of vids) {
    const url = `https://www.youtube.com/watch?v=${v.id}`;
    console.log(`\n=== ${v.title} ===`);
    console.log(url);
    for (const seed of [1, 2]) {
      try {
        const cuts = await cutsFor(url, seed);
        console.log(`  seed ${seed}: ${cuts.length} cuts @ [${cuts.map((t) => (t / 1000).toFixed(1) + 's').join(', ')}]`);
      } catch (e) {
        console.log(`  seed ${seed}: ERROR ${(e as Error).message}`);
      }
    }
  }
}

main().catch((err) => {
  console.error('FAILED:', err?.message ?? err);
  process.exit(1);
});
