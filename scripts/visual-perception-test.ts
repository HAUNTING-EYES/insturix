/**
 * Visual-perception bootstrap — fetch a couple of real Shorts, run the Gemini vision extractor,
 * and print DRAFT answer keys for a human to correct. The corrected drafts become the eval
 * harness ground truth (Rule 35). Run: npx tsx scripts/visual-perception-test.ts
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

async function main() {
  const ytKey = process.env.YOUTUBE_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  console.log('youtube key:', Boolean(ytKey), ' gemini key:', Boolean(geminiKey));
  if (!ytKey || !geminiKey) {
    console.error('need YOUTUBE_API_KEY + GEMINI_API_KEY');
    process.exit(1);
  }

  const youtube = google.youtube({ version: 'v3', auth: ytKey });
  const search = await youtube.search.list({
    part: ['id', 'snippet'],
    q: 'trending shorts',
    type: ['video'],
    videoDuration: 'short',
    maxResults: 2,
    regionCode: 'IN',
    order: 'viewCount',
  });
  const items = (search.data.items ?? []).filter((i) => i.id?.videoId);
  console.log(`found ${items.length} shorts\n`);

  for (const item of items) {
    const url = `https://www.youtube.com/watch?v=${item.id!.videoId}`;
    console.log(`=== ${item.snippet?.title ?? ''} ===`);
    console.log(url);
    const t0 = Date.now();
    try {
      const draft = await extractVisualFingerprint(url, { seed: 1 });
      console.log(`(analyzed in ${Date.now() - t0}ms) DRAFT:`);
      console.log(JSON.stringify(draft, null, 2));
    } catch (e) {
      console.error('extraction failed:', (e as Error).message);
    }
    console.log('');
  }
}

main().catch((err) => {
  console.error('FAILED:', err?.message ?? err);
  process.exit(1);
});
