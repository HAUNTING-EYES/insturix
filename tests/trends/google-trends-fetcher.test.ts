import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleTrendsFetcher } from '@/lib/trends/fetchers/google-trends-fetcher';
import type { ExemplarRef } from '@/lib/trends/fetcher';

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

function yt(id: string): ExemplarRef {
  return { platform: 'youtube', url: `https://www.youtube.com/watch?v=${id}`, platformId: id };
}

describe('GoogleTrendsFetcher', () => {
  it('turns trending searches into candidates with exemplars, skipping terms YouTube cannot back', async () => {
    const getTrendingSearches = vi.fn(async () => ['ai music trend', 'obscure term']);
    const searchExemplars = vi.fn(async (q: string) => (q.includes('ai music') ? [yt('dQw4w9WgXcQ')] : []));

    const fetcher = new GoogleTrendsFetcher({ getTrendingSearches, searchExemplars });
    const out = await fetcher.fetchCandidates({ region: 'US', limit: 5 });

    expect(getTrendingSearches).toHaveBeenCalledWith('US');
    expect(out).toHaveLength(1); // 'obscure term' had no exemplars → skipped
    expect(out[0]).toMatchObject({ key: 'ai-music-trend', title: 'ai music trend', trackerScore: 1, source: 'google-trends' });
    expect(out[0].exemplars).toEqual([yt('dQw4w9WgXcQ')]);
  });

  it('maps region labels to geo codes (India→IN, default US)', async () => {
    const getTrendingSearches = vi.fn(async () => []);
    const fetcher = new GoogleTrendsFetcher({ getTrendingSearches, searchExemplars: vi.fn() });

    await fetcher.fetchCandidates({ region: 'India' });
    expect(getTrendingSearches).toHaveBeenCalledWith('IN');

    await fetcher.fetchCandidates({});
    expect(getTrendingSearches).toHaveBeenLastCalledWith('US');
  });

  it('is available only with YOUTUBE_API_KEY (Google Trends itself is keyless)', () => {
    process.env.YOUTUBE_API_KEY = 'y';
    expect(new GoogleTrendsFetcher().available()).toBe(true);
    delete process.env.YOUTUBE_API_KEY;
    expect(new GoogleTrendsFetcher().available()).toBe(false);
  });
});
