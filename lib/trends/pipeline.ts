/**
 * Insturix Trends — the cron job's work (Master v1.1 §7.4).
 *
 *   fetch candidates → attach the demand signal → rank (tracker × demand × recency) → persist.
 *
 * Dependencies are INJECTED so the orchestration is unit-testable without network or DB. The real
 * Vercel cron route wires: the CompositeTrendFetcher (YouTube + Perplexity/Apify), getDemandCounts
 * (the demand store), and saveRankedTrends (the trends store). `now` is injected for determinism.
 */

import type { TrendFetcher, TrendFetchQuery, TrendCandidate } from './fetcher';
import { rankTrends, type RankedTrend, type RankOptions } from './rank';

/** A candidate enriched with its demand count — the exact shape rankTrends consumes. */
export type RankableCandidate = TrendCandidate & { demandCount: number };
export type RankedTrendCandidate = RankedTrend<RankableCandidate>;

export interface TrendPipelineDeps {
  fetcher: TrendFetcher;
  getDemandCounts: (trendKeys: string[]) => Promise<Map<string, number>>;
  saveRankedTrends: (trends: RankedTrendCandidate[]) => Promise<void>;
}

export interface TrendPipelineResult {
  fetched: number;
  ranked: number;
  topKey?: string;
}

export async function runTrendPipeline(
  deps: TrendPipelineDeps,
  query: TrendFetchQuery = {},
  rankOptions: RankOptions = {},
  nowMs = Date.now(),
): Promise<TrendPipelineResult> {
  const candidates = await deps.fetcher.fetchCandidates(query);

  const demand = await deps.getDemandCounts(candidates.map((c) => c.key));
  const enriched: RankableCandidate[] = candidates.map((c) => ({ ...c, demandCount: demand.get(c.key) ?? 0 }));

  const ranked = rankTrends(enriched, nowMs, rankOptions);
  await deps.saveRankedTrends(ranked);

  return { fetched: candidates.length, ranked: ranked.length, topKey: ranked[0]?.key };
}
