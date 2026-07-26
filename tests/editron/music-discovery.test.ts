import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const youtubeMocks = vi.hoisted(() => ({
  searchList: vi.fn(),
  videosList: vi.fn(),
}));

vi.mock('googleapis', () => ({
  google: {
    youtube: () => ({
      search: { list: youtubeMocks.searchList },
      videos: { list: youtubeMocks.videosList },
    }),
  },
}));

import { handleMusicDiscoverySearch } from '@/app/api/services/editron/music-discovery/search/route';
import {
  MusicDiscoveryProviderError,
  type MusicDiscoveryProvider,
} from '@/lib/editron/music-discovery/types';
import { YouTubeMusicDiscoveryProvider } from '@/lib/editron/music-discovery/youtube-provider';
import { searchYouTubeVideos } from '@/lib/trends/fetchers/youtube-search';

beforeEach(() => {
  youtubeMocks.searchList.mockReset();
  youtubeMocks.videosList.mockReset();
});

describe('YouTube video search owner', () => {
  it('forwards territory, language and music category and hydrates official preview metadata', async () => {
    youtubeMocks.searchList.mockResolvedValue({
      data: {
        items: [{
          id: { videoId: 'abcdefghijk' },
          snippet: {
            title: 'Example Song',
            channelTitle: 'Example Artist',
            description: 'Official music video',
            publishedAt: '2026-07-01T00:00:00Z',
            thumbnails: { high: { url: 'https://i.ytimg.com/example.jpg' } },
          },
        }],
      },
    });
    youtubeMocks.videosList.mockResolvedValue({
      data: {
        items: [{
          id: 'abcdefghijk',
          contentDetails: { duration: 'PT3M5.25S' },
          status: { embeddable: true },
        }],
      },
    });

    const results = await searchYouTubeVideos({
      query: 'example song',
      apiKey: 'youtube_test',
      limit: 10,
      regionCode: 'IN',
      relevanceLanguage: 'hi',
      videoCategoryId: '10',
      includeContentDetails: true,
    });

    expect(youtubeMocks.searchList).toHaveBeenCalledWith(expect.objectContaining({
      q: 'example song',
      regionCode: 'IN',
      relevanceLanguage: 'hi',
      videoCategoryId: '10',
      type: ['video'],
    }));
    expect(youtubeMocks.videosList).toHaveBeenCalledWith(expect.objectContaining({
      id: ['abcdefghijk'],
      part: ['contentDetails', 'status'],
    }));
    expect(results).toEqual([expect.objectContaining({
      videoId: 'abcdefghijk',
      title: 'Example Song',
      channelTitle: 'Example Artist',
      durationMs: 185_250,
      embeddable: true,
      embedUrl: 'https://www.youtube.com/embed/abcdefghijk',
    })]);
  });
});

describe('YouTubeMusicDiscoveryProvider', () => {
  it('marks discovered commercial music as previewable but not renderable audio', async () => {
    const searchVideos = vi.fn(async () => [{
      videoId: 'abcdefghijk',
      title: 'Example Song',
      channelTitle: 'Example Artist',
      description: '',
      publishedAt: null,
      thumbnailUrl: 'https://i.ytimg.com/example.jpg',
      durationMs: 185_250,
      embeddable: true,
      url: 'https://www.youtube.com/watch?v=abcdefghijk',
      embedUrl: 'https://www.youtube.com/embed/abcdefghijk',
    }]);
    const provider = new YouTubeMusicDiscoveryProvider({
      apiKey: 'youtube_test',
      searchVideos,
    });

    const identities = await provider.search({
      term: 'Example Song',
      territory: 'IN',
      languages: ['hi'],
      limit: 10,
    });

    expect(searchVideos).toHaveBeenCalledWith(expect.objectContaining({
      query: 'Example Song',
      regionCode: 'IN',
      relevanceLanguage: 'hi',
      videoCategoryId: '10',
      includeContentDetails: true,
    }));
    expect(identities[0]).toMatchObject({
      identityId: 'youtube:abcdefghijk',
      identityConfidence: 'provider-only',
      title: 'Example Song',
      artists: ['Example Artist'],
      availability: {
        audioAcquisition: 'not-provided',
        renderEligibility: 'requires-user-reference-upload',
      },
      actions: [
        'official-preview',
        'provider-link-out',
        'supply-reference-audio',
        'add-on-platform',
      ],
      trendEvidence: [],
    });
  });

  it('fails visibly when YouTube discovery has no configured key', async () => {
    const provider = new YouTubeMusicDiscoveryProvider({ apiKey: '' });
    expect(provider.available()).toBe(false);
    await expect(provider.search({
      term: 'song',
      territory: 'GLOBAL',
      languages: [],
      limit: 20,
    })).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  });
});

describe('music discovery search route', () => {
  function provider(search = vi.fn()): MusicDiscoveryProvider {
    return {
      name: 'youtube',
      available: () => true,
      search,
    };
  }

  it('authenticates before validating or searching', async () => {
    const search = vi.fn();
    const response = await handleMusicDiscoverySearch(
      new NextRequest('https://app.example.com/api/services/editron/music-discovery/search'),
      {
        authenticate: async () => ({ userId: null }),
        provider: provider(search),
      },
    );

    expect(response.status).toBe(401);
    expect(search).not.toHaveBeenCalled();
  });

  it('normalizes global discovery filters and returns an acquisition boundary', async () => {
    const search = vi.fn(async () => []);
    const response = await handleMusicDiscoverySearch(
      new NextRequest(
        'https://app.example.com/api/services/editron/music-discovery/search'
        + '?q=punjabi+gym+music&region=in&language=pa&language=hi&limit=12',
      ),
      {
        authenticate: async () => ({ userId: 'user_1' }),
        provider: provider(search),
      },
    );

    expect(response.status).toBe(200);
    expect(search).toHaveBeenCalledWith({
      term: 'punjabi gym music',
      territory: 'IN',
      languages: ['pa', 'hi'],
      limit: 12,
    });
    expect(await response.json()).toMatchObject({
      success: true,
      providers: ['youtube'],
      acquisitionNotice: expect.stringContaining('do not provide downloadable audio'),
    });
  });

  it('maps typed provider failures without exposing upstream bodies', async () => {
    const search = vi.fn(async () => {
      throw new MusicDiscoveryProviderError(
        'UPSTREAM_RATE_LIMITED',
        'YouTube music discovery is rate limited',
        429,
        9,
      );
    });
    const response = await handleMusicDiscoverySearch(
      new NextRequest(
        'https://app.example.com/api/services/editron/music-discovery/search?q=track',
      ),
      {
        authenticate: async () => ({ userId: 'user_1' }),
        provider: provider(search),
      },
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('9');
    expect(await response.json()).toEqual({
      success: false,
      error: 'YouTube music discovery is rate limited',
      code: 'MUSIC_DISCOVERY_RATE_LIMITED',
    });
  });
});
