import { describe, expect, it } from 'vitest';
import { computeTrendRank, rankTrends, type RankableTrend } from '@/lib/trends/rank';

const near = (v: number, t: number) => Math.abs(v - t) < 1e-9;
const MS_PER_DAY = 86_400_000;

describe('computeTrendRank', () => {
  it('is trackerScore alone when fresh with no demand', () => {
    expect(near(computeTrendRank({ trackerScore: 0.8, demandCount: 0, ageDays: 0 }), 0.8)).toBe(true);
  });

  it('doubles at the demand threshold (100 ← §7.4)', () => {
    expect(near(computeTrendRank({ trackerScore: 0.8, demandCount: 100, ageDays: 0 }), 1.6)).toBe(true);
    expect(near(computeTrendRank({ trackerScore: 1, demandCount: 200, ageDays: 0 }), 3)).toBe(true);
  });

  it('halves rank each half-life (7 days)', () => {
    expect(near(computeTrendRank({ trackerScore: 1, demandCount: 0, ageDays: 7 }), 0.5)).toBe(true);
    expect(near(computeTrendRank({ trackerScore: 1, demandCount: 0, ageDays: 14 }), 0.25)).toBe(true);
  });

  it('combines all three factors', () => {
    // 1 × (1 + 200/100) × 0.5^(7/7) = 1 × 3 × 0.5 = 1.5
    expect(near(computeTrendRank({ trackerScore: 1, demandCount: 200, ageDays: 7 }), 1.5)).toBe(true);
  });

  it('clamps negative age (clock skew) and negative demand', () => {
    expect(near(computeTrendRank({ trackerScore: 1, demandCount: 0, ageDays: -5 }), 1)).toBe(true);
    expect(near(computeTrendRank({ trackerScore: 1, demandCount: -50, ageDays: 0 }), 1)).toBe(true);
  });

  it('respects overridden (dynamic) thresholds', () => {
    // threshold 50 → 50 requests doubles it
    expect(near(computeTrendRank({ trackerScore: 1, demandCount: 50, ageDays: 0 }, { demandThreshold: 50 }), 2)).toBe(true);
  });

  it('fails loud on invalid config (no silent fallback)', () => {
    expect(() => computeTrendRank({ trackerScore: 1, demandCount: 0, ageDays: 0 }, { demandThreshold: 0 })).toThrow();
    expect(() => computeTrendRank({ trackerScore: 1, demandCount: 0, ageDays: 0 }, { halfLifeDays: 0 })).toThrow();
  });
});

describe('rankTrends', () => {
  const NOW = 1_000_000_000_000;
  function trend(overrides: Partial<RankableTrend>): RankableTrend {
    return { trackerScore: 0.5, demandCount: 0, fetchedAtMs: NOW, ...overrides };
  }

  it('computes ageDays, sorts by rankScore desc, and ages out stale trends', () => {
    const fresh = trend({ trackerScore: 0.6, fetchedAtMs: NOW }); // rank 0.6
    const weekOld = trend({ trackerScore: 1, fetchedAtMs: NOW - 7 * MS_PER_DAY }); // rank 0.5
    const stale = trend({ trackerScore: 1, fetchedAtMs: NOW - 40 * MS_PER_DAY }); // age 40 > 30 → dropped

    const ranked = rankTrends([weekOld, stale, fresh], NOW);

    expect(ranked.map((r) => Math.round(r.rankScore * 100))).toEqual([60, 50]); // fresh before weekOld, stale gone
    expect(ranked[0].ageDays).toBe(0);
    expect(near(ranked[1].ageDays, 7)).toBe(true);
  });

  it('keeps a brand-new 0-demand trend visible (Rule 29: demand never zeroes it)', () => {
    const ranked = rankTrends([trend({ trackerScore: 0.4, demandCount: 0, fetchedAtMs: NOW })], NOW);
    expect(ranked).toHaveLength(1);
    expect(near(ranked[0].rankScore, 0.4)).toBe(true);
  });
});
