/**
 * Live test — Perplexity→YouTube trend fetcher (real Sonar topics + real YouTube Search exemplars).
 *   Run with PERPLEXITY_API_KEY exported + .env.local providing YOUTUBE_API_KEY.
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

import { PerplexityYouTubeTrendFetcher } from '@/lib/trends/fetchers/perplexity-youtube-trend-fetcher';

async function main() {
  const fetcher = new PerplexityYouTubeTrendFetcher();
  console.log('available:', fetcher.available());
  if (!fetcher.available()) {
    console.error('need PERPLEXITY_API_KEY + YOUTUBE_API_KEY');
    process.exit(1);
  }

  const t0 = Date.now();
  const out = await fetcher.fetchCandidates({ region: 'India', limit: 5 });
  console.log(`fetched ${out.length} candidates (topic → real YouTube exemplars) in ${Date.now() - t0}ms`);
  for (const c of out) {
    console.log(`\n[${c.trackerScore.toFixed(2)}] ${c.title}  (${c.exemplars.length} exemplars)`);
    for (const ex of c.exemplars.slice(0, 3)) console.log(`   ${ex.url}`);
  }
  console.log('\nOK.');
}

main().catch((err) => {
  console.error('FAILED:', err?.message ?? err);
  process.exit(1);
});
