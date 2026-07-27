import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock('googleapis', () => ({
  google: { youtube: () => ({ videos: { list: mocks.list } }) },
}));

import { YouTubeChartsFetcher } from '@/lib/trends/fetchers/youtube-charts-fetcher';

beforeEach(() => {
  process.env.YOUTUBE_API_KEY = 'test_key';
  mocks.list.mockReset().mockResolvedValue({ data: { items: [] } });
});

describe('YouTubeChartsFetcher', () => {
  it('maps trending videos to candidates with position-based trackerScore', async () => {
    mocks.list.mockResolvedValue({
      data: {
        items: [
          { id: 'aaaaaaaaaaa', snippet: { title: 'A' } },
          { id: 'bbbbbbbbbbb', snippet: { title: 'B' } },
        ],
      },
    });

    const out = await new YouTubeChartsFetcher().fetchCandidates({ region: 'IN', limit: 10 });

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ key: 'aaaaaaaaaaa', platform: 'youtube', title: 'A', trackerScore: 1, source: 'youtube-charts' });
    expect(out[0].exemplars[0]).toMatchObject({
      platform: 'youtube',
      url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
      platformId: 'aaaaaaaaaaa',
    });
    expect(out[1].trackerScore).toBe(0.5);
    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({ chart: 'mostPopular', regionCode: 'IN', maxResults: 10 }),
    );
  });

  it('filters out items without a video id', async () => {
    mocks.list.mockResolvedValue({ data: { items: [{ id: 'aaaaaaaaaaa' }, { snippet: { title: 'no id' } }] } });
    expect(await new YouTubeChartsFetcher().fetchCandidates({})).toHaveLength(1);
  });

  it('is unavailable and never calls the API without a key', async () => {
    delete process.env.YOUTUBE_API_KEY;
    const f = new YouTubeChartsFetcher();
    expect(f.available()).toBe(false);
    expect(await f.fetchCandidates({})).toEqual([]);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
