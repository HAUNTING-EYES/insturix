import { describe, expect, it, vi } from 'vitest';
import { runTrendPipeline, type RankedTrendCandidate } from '@/lib/trends/pipeline';
import type { TrendCandidate, TrendFetcher } from '@/lib/trends/fetcher';

const NOW = 1_000_000_000_000;

function cand(key: string, trackerScore: number): TrendCandidate {
  return { key, platform: 'youtube', trackerScore, exemplars: [], fetchedAtMs: NOW, source: 'mock' };
}

describe('runTrendPipeline', () => {
  it('fetches → attaches demand → ranks → persists', async () => {
    const fetcher: TrendFetcher = {
      name: 'mock',
      available: () => true,
      fetchCandidates: vi.fn(async () => [cand('k1', 0.5), cand('k2', 0.9)]),
    };
    const getDemandCounts = vi.fn(async () => new Map([['k1', 200]])); // k1 heavily demanded
    const saveRankedTrends = vi.fn(async (_trends: RankedTrendCandidate[]) => {});

    const result = await runTrendPipeline({ fetcher, getDemandCounts, saveRankedTrends }, { region: 'IN' }, {}, NOW);

    expect(fetcher.fetchCandidates).toHaveBeenCalledWith({ region: 'IN' });
    expect(getDemandCounts).toHaveBeenCalledWith(['k1', 'k2']);

    const saved = saveRankedTrends.mock.calls[0][0];
    expect(saved.find((t) => t.key === 'k1')?.demandCount).toBe(200);
    expect(saved.find((t) => t.key === 'k2')?.demandCount).toBe(0);
    // k1: 0.5 × (1 + 200/100) × 1 = 1.5  beats  k2: 0.9 × 1 × 1 = 0.9
    expect(saved[0].key).toBe('k1');
    expect(result).toEqual({ fetched: 2, ranked: 2, topKey: 'k1' });
  });

  it('handles an empty fetch without error', async () => {
    const fetcher: TrendFetcher = { name: 'mock', available: () => true, fetchCandidates: vi.fn(async () => []) };
    const saveRankedTrends = vi.fn(async (_trends: RankedTrendCandidate[]) => {});

    const result = await runTrendPipeline(
      { fetcher, getDemandCounts: vi.fn(async () => new Map()), saveRankedTrends },
      {},
      {},
      NOW,
    );

    expect(result).toEqual({ fetched: 0, ranked: 0, topKey: undefined });
    expect(saveRankedTrends).toHaveBeenCalledWith([]);
  });
});
