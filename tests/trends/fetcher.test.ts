import { describe, expect, it } from 'vitest';
import {
  CompositeTrendFetcher,
  NullTrendFetcher,
  type TrendFetcher,
  type TrendCandidate,
  type ExemplarRef,
} from '@/lib/trends/fetcher';

function mockFetcher(
  name: string,
  candidates: TrendCandidate[],
  opts: { available?: boolean; throws?: boolean } = {},
): TrendFetcher {
  return {
    name,
    available: () => opts.available ?? true,
    fetchCandidates: async () => {
      if (opts.throws) throw new Error('boom');
      return candidates;
    },
  };
}

function cand(overrides: Partial<TrendCandidate> = {}): TrendCandidate {
  return { key: 'sound1', platform: 'youtube', trackerScore: 0.5, exemplars: [], fetchedAtMs: 1000, source: 's', ...overrides };
}

function ex(url: string): ExemplarRef {
  return { platform: 'youtube', url };
}

describe('CompositeTrendFetcher', () => {
  it('merges same-key candidates: max trackerScore, latest fetch, unioned exemplars', async () => {
    const a = mockFetcher('A', [cand({ trackerScore: 0.5, exemplars: [ex('https://youtu.be/aaaaaaaaaaa')], fetchedAtMs: 1000 })]);
    const b = mockFetcher('B', [cand({ trackerScore: 0.8, exemplars: [ex('https://youtu.be/bbbbbbbbbbb')], fetchedAtMs: 2000 })]);

    const out = await new CompositeTrendFetcher([a, b]).fetchCandidates({});

    expect(out).toHaveLength(1);
    expect(out[0].trackerScore).toBe(0.8);
    expect(out[0].fetchedAtMs).toBe(2000);
    expect(out[0].exemplars).toHaveLength(2);
  });

  it('dedupes the same exemplar across URL shapes via the Ledger identity', async () => {
    const a = mockFetcher('A', [cand({ exemplars: [ex('https://youtu.be/dQw4w9WgXcQ')] })]);
    const b = mockFetcher('B', [cand({ exemplars: [ex('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5s')] })]);

    const out = await new CompositeTrendFetcher([a, b]).fetchCandidates({});
    expect(out[0].exemplars).toHaveLength(1); // same video → one exemplar
  });

  it('is best-effort: a throwing fetcher is dropped, others still contribute', async () => {
    const bad = mockFetcher('bad', [], { throws: true });
    const good = mockFetcher('good', [cand({ key: 'k2' })]);

    const out = await new CompositeTrendFetcher([bad, good]).fetchCandidates({});
    expect(out.map((c) => c.key)).toEqual(['k2']);
  });

  it('treats candidate keys case-insensitively', async () => {
    const a = mockFetcher('A', [cand({ key: 'Sound1' })]);
    const b = mockFetcher('B', [cand({ key: 'sound1' })]);

    const out = await new CompositeTrendFetcher([a, b]).fetchCandidates({});
    expect(out).toHaveLength(1);
  });

  it('sorts by trackerScore desc and applies the limit', async () => {
    const f = mockFetcher('A', [
      cand({ key: 'k1', trackerScore: 0.3 }),
      cand({ key: 'k2', trackerScore: 0.9 }),
      cand({ key: 'k3', trackerScore: 0.6 }),
    ]);

    const out = await new CompositeTrendFetcher([f]).fetchCandidates({ limit: 2 });
    expect(out.map((c) => c.key)).toEqual(['k2', 'k3']);
  });

  it('skips unavailable fetchers and reports availability', async () => {
    const off = mockFetcher('off', [cand({ key: 'x' })], { available: false });
    const on = mockFetcher('on', [cand({ key: 'y' })]);
    const comp = new CompositeTrendFetcher([off, on]);

    expect(comp.available()).toBe(true);
    const out = await comp.fetchCandidates({});
    expect(out.map((c) => c.key)).toEqual(['y']);
  });
});

describe('NullTrendFetcher', () => {
  it('is unavailable and returns nothing (graceful degradation)', async () => {
    const n = new NullTrendFetcher();
    expect(n.available()).toBe(false);
    expect(await n.fetchCandidates()).toEqual([]);
    expect(new CompositeTrendFetcher([n]).available()).toBe(false);
  });
});
