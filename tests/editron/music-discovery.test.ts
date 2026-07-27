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
  YouTubeMusicTrendEnricher,
  type MusicTrendSnapshot,
  type MusicTrendSnapshotState,
  type MusicTrendSnapshotStore,
} from '@/lib/editron/music-discovery/youtube-music-trend-enricher';
import {
  MusicDiscoveryProviderError,
  type MusicDiscoveryIdentity,
  type MusicDiscoverySearchQuery,
  type MusicDiscoverySearchResult,
} from '@/lib/editron/music-discovery/types';
import { YouTubeMusicDiscoveryProvider } from '@/lib/editron/music-discovery/youtube-provider';
import type { TrendFetcher } from '@/lib/trends/fetcher';
import { YouTubeChartsFetcher } from '@/lib/trends/fetchers/youtube-charts-fetcher';
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

  it('requests the regional music chart with localized metadata', async () => {
    youtubeMocks.videosList.mockResolvedValue({
      data: {
        items: [{ id: 'abcdefghijk', snippet: { title: 'Chart Song' } }],
      },
    });
    const fetcher = new YouTubeChartsFetcher({
      apiKey: 'youtube_test',
      videoCategoryId: '10',
      language: 'hi',
      now: () => Date.parse('2026-07-26T12:00:00.000Z'),
    });

    const candidates = await fetcher.fetchCandidates({ region: 'IN', limit: 50 });

    expect(youtubeMocks.videosList).toHaveBeenCalledWith(expect.objectContaining({
      chart: 'mostPopular',
      regionCode: 'IN',
      videoCategoryId: '10',
      hl: 'hi',
      maxResults: 50,
    }));
    expect(candidates[0]).toMatchObject({
      key: 'abcdefghijk',
      fetchedAtMs: Date.parse('2026-07-26T12:00:00.000Z'),
    });
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
  function dependencies(search = vi.fn()) {
    return {
      authenticate: async () => ({ userId: 'user_1' }),
      searcher: { search },
      enrichTrends: async (result: MusicDiscoverySearchResult) => result,
    };
  }

  it('authenticates before validating or searching', async () => {
    const search = vi.fn();
    const deps = dependencies(search);
    const response = await handleMusicDiscoverySearch(
      new NextRequest('https://app.example.com/api/services/editron/music-discovery/search'),
      {
        ...deps,
        authenticate: async () => ({ userId: null }),
      },
    );

    expect(response.status).toBe(401);
    expect(search).not.toHaveBeenCalled();
  });

  it('normalizes global discovery filters and returns an acquisition boundary', async () => {
    const search = vi.fn(async (query: MusicDiscoverySearchQuery) => discoveryResult(query));
    const response = await handleMusicDiscoverySearch(
      new NextRequest(
        'https://app.example.com/api/services/editron/music-discovery/search'
        + '?q=punjabi+gym+music&region=in&language=pa&language=hi&limit=12',
      ),
      dependencies(search),
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
      failures: [],
      acquisitionNotice: expect.stringContaining('do not provide downloadable audio'),
    });
  });

  it('keeps successful discovery and receipts an unexpected trend failure', async () => {
    const search = vi.fn(async (query: MusicDiscoverySearchQuery) => discoveryResult(query));
    const response = await handleMusicDiscoverySearch(
      new NextRequest(
        'https://app.example.com/api/services/editron/music-discovery/search'
        + '?q=track&region=in&language=hi',
      ),
      {
        ...dependencies(search),
        enrichTrends: async () => {
          throw new Error('store detail that must not escape');
        },
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      trendCoverage: {
        status: 'unavailable',
        territory: 'IN',
        requestedLanguages: ['hi'],
        reasonCode: 'ENRICHMENT_FAILED',
      },
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
      dependencies(search),
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

describe('YouTubeMusicTrendEnricher', () => {
  const now = Date.parse('2026-07-26T12:30:00.000Z');

  it('attaches current and previous regional rank with velocity from a fresh snapshot', async () => {
    const current = snapshot('2026-07-26T12:00:00.000Z', 2);
    const previous = snapshot('2026-07-26T06:00:00.000Z', 5);
    const store = memoryStore({
      _id: 'youtube-most-popular-music:IN',
      current,
      previous,
    });
    const fetchCandidates = vi.fn();
    const enricher = new YouTubeMusicTrendEnricher({
      store,
      now: () => now,
      fetcherFactory: () => trendFetcher(fetchCandidates),
    });

    const result = await enricher.enrich(discoveryResult(musicQuery()));

    expect(fetchCandidates).not.toHaveBeenCalled();
    expect(result.identities[0]?.trendEvidence).toEqual([{
      source: 'youtube-most-popular-music',
      territory: 'IN',
      chart: 'youtube:mostPopular:music',
      rank: 2,
      previousRank: 5,
      rankDelta: 3,
      velocity: 0.5,
      velocityUnit: 'rank-positions-per-hour',
      observedAt: '2026-07-26T12:00:00.000Z',
    }]);
    expect(result.trendCoverage).toMatchObject({
      status: 'fresh',
      territory: 'IN',
      matchedIdentityCount: 1,
      previousObservedAt: '2026-07-26T06:00:00.000Z',
    });
  });

  it('refreshes a stale regional snapshot under a store lease', async () => {
    const stale = snapshot('2026-07-26T02:00:00.000Z', 4);
    const store = memoryStore({
      _id: 'youtube-most-popular-music:IN',
      current: stale,
    });
    const fetchCandidates = vi.fn(async () => [{
      key: 'abcdefghijk',
      platform: 'youtube' as const,
      title: 'Chart Song',
      trackerScore: 1,
      exemplars: [{
        platform: 'youtube' as const,
        url: 'https://www.youtube.com/watch?v=abcdefghijk',
        platformId: 'abcdefghijk',
      }],
      fetchedAtMs: now,
      source: 'youtube-charts',
    }]);
    const enricher = new YouTubeMusicTrendEnricher({
      store,
      now: () => now,
      fetcherFactory: () => trendFetcher(fetchCandidates),
    });

    const result = await enricher.enrich(discoveryResult(musicQuery()));

    expect(fetchCandidates).toHaveBeenCalledWith({ region: 'IN', limit: 50 });
    expect(store.commit).toHaveBeenCalledWith(expect.objectContaining({
      previous: stale,
      snapshot: expect.objectContaining({
        territory: 'IN',
        entries: [expect.objectContaining({ providerId: 'abcdefghijk', rank: 1 })],
      }),
    }));
    expect(result.identities[0]?.trendEvidence[0]).toMatchObject({
      rank: 1,
      previousRank: 4,
      rankDelta: 3,
    });
  });

  it('uses the fresh winner when another request completes the refresh lease', async () => {
    const stale = snapshot('2026-07-26T02:00:00.000Z', 4);
    const winner = snapshot('2026-07-26T12:00:00.000Z', 1);
    const store = memoryStore({
      _id: 'youtube-most-popular-music:IN',
      current: stale,
    });
    store.claim = vi.fn(async () => ({
      claimed: false,
      state: {
        _id: 'youtube-most-popular-music:IN',
        current: winner,
        previous: stale,
      },
    }));
    const fetchCandidates = vi.fn();
    const result = await new YouTubeMusicTrendEnricher({
      store,
      now: () => now,
      fetcherFactory: () => trendFetcher(fetchCandidates),
    }).enrich(discoveryResult(musicQuery()));

    expect(fetchCandidates).not.toHaveBeenCalled();
    expect(result.trendCoverage).toMatchObject({
      status: 'fresh',
      observedAt: '2026-07-26T12:00:00.000Z',
      previousObservedAt: '2026-07-26T02:00:00.000Z',
    });
  });

  it('requires a territory instead of inventing a global chart', async () => {
    const fetcherFactory = vi.fn();
    const result = await new YouTubeMusicTrendEnricher({
      store: memoryStore(null),
      fetcherFactory,
    }).enrich(discoveryResult({
      ...musicQuery(),
      territory: 'GLOBAL',
    }));

    expect(fetcherFactory).not.toHaveBeenCalled();
    expect(result.trendCoverage).toEqual({
      status: 'requires-territory',
      source: 'youtube-most-popular-music',
      territory: null,
      requestedLanguages: ['hi'],
      matchedIdentityCount: 0,
      reasonCode: 'TERRITORY_REQUIRED',
    });
  });
});

function musicQuery(): MusicDiscoverySearchQuery {
  return {
    term: 'Example Song',
    territory: 'IN',
    languages: ['hi'],
    limit: 20,
  };
}

function discoveryResult(query: MusicDiscoverySearchQuery): MusicDiscoverySearchResult {
  return {
    providers: ['youtube'],
    identities: [musicIdentity()],
    query,
    failures: [],
  };
}

function musicIdentity(): MusicDiscoveryIdentity {
  return {
    identityId: 'youtube:abcdefghijk',
    identityConfidence: 'provider-only',
    title: 'Example Song',
    artists: ['Example Artist'],
    durationMs: 180_000,
    artworkUrl: null,
    explicit: null,
    isrcs: [],
    languages: [],
    sources: [{
      provider: 'youtube',
      providerId: 'abcdefghijk',
      url: 'https://www.youtube.com/watch?v=abcdefghijk',
      previewCapability: 'official-embed',
    }],
    trendEvidence: [],
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
  };
}

function snapshot(observedAt: string, rank: number): MusicTrendSnapshot {
  return {
    source: 'youtube-most-popular-music',
    territory: 'IN',
    chart: 'youtube:mostPopular:music',
    observedAt,
    entries: [{
      providerId: 'abcdefghijk',
      title: 'Example Song',
      rank,
      trackerScore: 1,
    }],
  };
}

function trendFetcher(fetchCandidates: TrendFetcher['fetchCandidates']): TrendFetcher {
  return {
    name: 'youtube-charts',
    available: () => true,
    fetchCandidates,
  };
}

function memoryStore(initial: MusicTrendSnapshotState | null): MusicTrendSnapshotStore {
  let state = initial;
  return {
    read: vi.fn(async () => state),
    claim: vi.fn(async (input) => ({
      claimed: true,
      state: state
        ? {
          ...state,
          lease: { token: input.token, expiresAt: input.leaseExpiresAt },
        }
        : null,
    })),
    commit: vi.fn(async (input) => {
      state = {
        _id: input.key,
        current: input.snapshot,
        ...(input.previous ? { previous: input.previous } : {}),
      };
    }),
    release: vi.fn(async () => undefined),
  };
}
