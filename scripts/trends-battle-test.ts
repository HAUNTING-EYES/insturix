/**
 * Battle test — runs the real YouTube fetcher through the fetcher composite + ranker, live.
 * Proves the fetcher loop end-to-end against the YouTube Data API (free, quota-limited).
 *   Run: npx tsx scripts/trends-battle-test.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env.local (no dotenv dependency). Imported modules don't read env at load, so this
// top-level block runs before main() constructs/calls the fetcher.
try {
  const envPath = resolve(process.cwd(), '.env.local');
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  /* env may already be set in the shell */
}

import { CompositeTrendFetcher } from '@/lib/trends/fetcher';
import { YouTubeChartsFetcher } from '@/lib/trends/fetchers/youtube-charts-fetcher';
import { rankTrends } from '@/lib/trends/rank';
import { runTrendPipeline } from '@/lib/trends/pipeline';

async function main() {
  const fetcher = new CompositeTrendFetcher([new YouTubeChartsFetcher()]);
  console.log('fetcher.available():', fetcher.available());
  if (!fetcher.available()) {
    console.error('YOUTUBE_API_KEY not found — cannot run the live test.');
    process.exit(1);
  }

  const t0 = Date.now();
  const candidates = await fetcher.fetchCandidates({ region: 'IN', limit: 10 });
  console.log(`fetched ${candidates.length} candidates in ${Date.now() - t0}ms`);

  const ranked = rankTrends(
    candidates.map((c) => ({ ...c, demandCount: 0 })),
    Date.now(),
  );
  console.log('\nrank   url                                             title');
  for (const r of ranked) {
    console.log(`${r.rankScore.toFixed(3)}  ${r.exemplars[0]?.url}  ${(r.title ?? '').slice(0, 55)}`);
  }
  // Full cron code path: fetch → demand → rank → save (fake demand on #1 + stub save prove the wiring).
  const saved: unknown[] = [];
  const result = await runTrendPipeline(
    {
      fetcher,
      getDemandCounts: async (keys) => new Map(keys.length ? [[keys[0], 250]] : []),
      saveRankedTrends: async (t) => {
        saved.push(...t);
      },
    },
    { region: 'IN', limit: 10 },
  );
  console.log(`\n[pipeline] fetched=${result.fetched} ranked=${result.ranked} topKey=${result.topKey} saved=${saved.length}`);

  console.log(`\nOK: ${ranked.length} ranked candidates.`);
}

main().catch((err) => {
  console.error('BATTLE TEST FAILED:', err?.message ?? err);
  process.exit(1);
});
