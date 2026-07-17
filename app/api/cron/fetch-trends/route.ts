/**
 * Cron — Insturix Trends fetch + rank (Master v1.1 §7.4, every ~3 days via vercel.json).
 *
 * Thin wrapper over the verified pipeline: fetch candidates → attach demand → rank → persist.
 * Auth mirrors the other cron routes (Bearer CRON_SECRET, or the vercel-cron user-agent).
 */
import { NextRequest, NextResponse } from 'next/server';
import { CompositeTrendFetcher } from '@/lib/trends/fetcher';
import { PerplexityYouTubeTrendFetcher } from '@/lib/trends/fetchers/perplexity-youtube-trend-fetcher';
import { GoogleTrendsFetcher } from '@/lib/trends/fetchers/google-trends-fetcher';
import { runTrendPipeline } from '@/lib/trends/pipeline';
import { getDemandCounts } from '@/lib/trends/demand';
import { saveRankedTrends } from '@/lib/trends/store';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = request.headers.get('user-agent')?.includes('vercel-cron');
  if (!isVercelCron && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Discovery signals: convergent formats/sounds (Perplexity→YouTube) + rising searches (Google Trends),
    // each backed by real YouTube exemplars. The YT mostPopular chart was dropped — it surfaced low-taste
    // viral one-offs, not replicable trends. Broad (no region) for a higher-taste pool.
    const fetcher = new CompositeTrendFetcher([new PerplexityYouTubeTrendFetcher(), new GoogleTrendsFetcher()]);
    const result = await runTrendPipeline({ fetcher, getDemandCounts, saveRankedTrends }, { limit: 15 });
    return NextResponse.json({ success: true, timestamp: new Date().toISOString(), ...result }, { status: 200 });
  } catch (error) {
    console.error('[cron/fetch-trends] failed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
