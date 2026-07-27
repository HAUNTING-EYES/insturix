import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerplexityYouTubeTrendFetcher } from '@/lib/trends/fetchers/perplexity-youtube-trend-fetcher';
import type { ExemplarRef } from '@/lib/trends/fetcher';

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

function ytExemplar(id: string): ExemplarRef {
  return { platform: 'youtube', url: `https://www.youtube.com/watch?v=${id}`, platformId: id };
}

describe('PerplexityYouTubeTrendFetcher', () => {
  it('discovers topics, searches YouTube for exemplars, and drops topics with none', async () => {
    const discoverTopics = vi.fn(async () => [
      { title: 'Firefighter Method', searchQuery: 'firefighter method reel' },
      { title: 'GRWM Transition', searchQuery: 'grwm transition' },
    ]);
    const searchExemplars = vi.fn(async (q: string) =>
      q.includes('firefighter') ? [ytExemplar('dQw4w9WgXcQ')] : [],
    );

    const fetcher = new PerplexityYouTubeTrendFetcher({ discoverTopics, searchExemplars });
    const out = await fetcher.fetchCandidates({ region: 'India', limit: 5 });

    expect(discoverTopics).toHaveBeenCalledWith({ region: 'India', limit: 5 });
    expect(searchExemplars).toHaveBeenCalledWith('firefighter method reel', 5);

    // GRWM had no YouTube exemplars → skipped; only Firefighter survives.
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe('firefighter-method');
    expect(out[0].platform).toBe('youtube');
    expect(out[0].exemplars).toEqual([ytExemplar('dQw4w9WgXcQ')]);
    expect(out[0].trackerScore).toBe(1); // topic index 0 of 2
  });

  it('returns nothing when discovery finds no topics', async () => {
    const fetcher = new PerplexityYouTubeTrendFetcher({
      discoverTopics: async () => [],
      searchExemplars: vi.fn(),
    });
    expect(await fetcher.fetchCandidates({})).toEqual([]);
  });

  it('is available only when BOTH keys are set', () => {
    process.env.PERPLEXITY_API_KEY = 'p';
    process.env.YOUTUBE_API_KEY = 'y';
    expect(new PerplexityYouTubeTrendFetcher().available()).toBe(true);

    delete process.env.PERPLEXITY_API_KEY;
    expect(new PerplexityYouTubeTrendFetcher().available()).toBe(false);
  });
});
