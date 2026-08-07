/**
 * Live test — the Google Trends fetcher (keyless daily-trends → YouTube exemplars).
 *   Run: npx tsx scripts/google-trends-test.ts
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

import { GoogleTrendsFetcher } from '@/lib/trends/fetchers/google-trends-fetcher';

async function main() {
  const fetcher = new GoogleTrendsFetcher();
  console.log('available:', fetcher.available());
  const t0 = Date.now();
  const out = await fetcher.fetchCandidates({ region: 'US', limit: 5 });
  console.log(`fetched ${out.length} trend candidates in ${Date.now() - t0}ms\n`);
  for (const c of out) {
    console.log(`[${c.exemplars.length} exemplars] ${c.title}`);
    console.log(`   e.g. ${c.exemplars[0]?.url}`);
  }
  console.log('\nOK.');
}

main().catch((err) => {
  console.error('FAILED:', err?.message ?? err);
  process.exit(1);
});
