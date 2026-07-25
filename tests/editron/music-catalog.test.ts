import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleMusicCatalogSearch } from '@/app/api/services/editron/music-catalog/search/route';
import { EpidemicMusicCatalogProvider } from '@/lib/editron/music-catalog/epidemic-provider';
import {
  MusicCatalogProviderError,
  type MusicCatalogProvider,
  type MusicCatalogSearchQuery,
} from '@/lib/editron/music-catalog/types';

type FetchMockArgs = [input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]];

const searchQuery: MusicCatalogSearchQuery = {
  term: 'focused technology',
  genres: ['electronic', 'ambient'],
  moods: ['hopeful'],
  vocalTypes: ['none'],
  bpmMin: 90,
  bpmMax: 120,
  limit: 12,
  offset: 24,
  sort: 'Relevance',
  order: 'asc',
};

function providerResponse(overrides: Record<string, unknown> = {}) {
  return {
    tracks: [
      {
        id: 'track_1',
        mainArtists: ['Example Artist'],
        featuredArtists: [],
        title: 'Focused Future',
        bpm: 110,
        length: 183,
        moods: [{ id: 'hopeful', name: 'Hopeful' }],
        genres: [{ id: 'electronic', name: 'Electronic' }],
        images: { M: 'https://cdn.example.com/cover.jpg' },
        waveformUrl: 'https://cdn.example.com/waveform.json',
        hasVocals: false,
        tierOption: 'FREE',
        isrc: 'TEST123',
        vocalType: 'NONE',
        isExplicit: false,
        isPreviewOnly: false,
        ...overrides,
      },
    ],
    pagination: { page: 3, limit: 12, offset: 24 },
    links: { next: '/v0/tracks/search?offset=36' },
  };
}

function jsonResponse(value: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('content-type', 'application/json');
  return new Response(JSON.stringify(value), {
    status,
    headers: responseHeaders,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EpidemicMusicCatalogProvider', () => {
  it('normalizes search results but keeps every result non-renderable before ingest', async () => {
    const fetchMock = vi.fn<FetchMockArgs, ReturnType<typeof fetch>>(
      async () => jsonResponse(providerResponse()),
    );
    const provider = new EpidemicMusicCatalogProvider({
      apiKey: 'epidemic_live_test',
      baseUrl: 'https://partner-content-api.epidemicsound.com',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await provider.search(searchQuery);

    expect(result).toEqual({
      provider: 'epidemic-sound',
      tracks: [
        expect.objectContaining({
          providerTrackId: 'track_1',
          title: 'Focused Future',
          durationMs: 183_000,
          bpm: 110,
          vocalType: 'none',
          catalogAvailability: 'download-candidate',
          rightsStatus: 'unverified',
          renderEligibility: 'requires-entitlement-and-ingest',
        }),
      ],
      pagination: { limit: 12, offset: 24, nextOffset: 36 },
    });

    const [input, init] = fetchMock.mock.calls[0]!;
    const url = new URL(String(input));
    expect(url.origin).toBe('https://partner-content-api.epidemicsound.com');
    expect(url.pathname).toBe('/v0/tracks/search');
    expect(url.searchParams.getAll('genre')).toEqual(['electronic', 'ambient']);
    expect(url.searchParams.getAll('mood')).toEqual(['hopeful']);
    expect(url.searchParams.getAll('vocalType')).toEqual(['NONE']);
    expect(url.searchParams.get('bpmMin')).toBe('90');
    expect(url.searchParams.get('bpmMax')).toBe('120');
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer epidemic_live_test',
    );
  });

  it('defaults missing preview metadata to preview-only and still requires ingest', async () => {
    const fetchMock = vi.fn<FetchMockArgs, ReturnType<typeof fetch>>(
      async () => jsonResponse(providerResponse({ isPreviewOnly: undefined })),
    );
    const provider = new EpidemicMusicCatalogProvider({
      apiKey: 'epidemic_live_test',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await provider.search(searchQuery);

    expect(result.tracks[0]).toMatchObject({
      catalogAvailability: 'preview-only',
      rightsStatus: 'unverified',
      renderEligibility: 'requires-entitlement-and-ingest',
    });
  });

  it('fails loud when configuration or upstream response integrity is missing', async () => {
    const unconfigured = new EpidemicMusicCatalogProvider({ apiKey: '' });
    await expect(unconfigured.search(searchQuery)).rejects.toMatchObject({
      code: 'NOT_CONFIGURED',
    });

    const malformed = new EpidemicMusicCatalogProvider({
      apiKey: 'epidemic_live_test',
      fetchImpl: vi.fn(async () => jsonResponse({ tracks: 'not-an-array' })),
    });
    await expect(malformed.search(searchQuery)).rejects.toMatchObject({
      code: 'INVALID_UPSTREAM_RESPONSE',
    });
  });

  it('preserves provider rate-limit status without exposing response bodies', async () => {
    const provider = new EpidemicMusicCatalogProvider({
      apiKey: 'epidemic_live_test',
      fetchImpl: vi.fn(async () =>
        jsonResponse({ secret: 'provider-debug-data' }, 429, { 'retry-after': '17' })),
    });

    await expect(provider.search(searchQuery)).rejects.toMatchObject({
      code: 'UPSTREAM_RATE_LIMITED',
      providerStatus: 429,
      retryAfterSeconds: 17,
      message: 'The music catalog rate limit was reached',
    });
  });

  it('aborts a timed-out provider request and returns a typed failure', async () => {
    const fetchImpl = vi.fn(
      (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    );
    const provider = new EpidemicMusicCatalogProvider({
      apiKey: 'epidemic_live_test',
      timeoutMs: 1,
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(provider.search(searchQuery)).rejects.toMatchObject({
      code: 'UPSTREAM_TIMEOUT',
    });
  });
});

describe('music catalog search route', () => {
  function provider(search = vi.fn()): MusicCatalogProvider {
    return {
      name: 'epidemic-sound',
      available: () => true,
      search,
    };
  }

  it('authenticates before validation or provider access', async () => {
    const search = vi.fn();
    const response = await handleMusicCatalogSearch(
      new NextRequest('https://app.example.com/api/services/editron/music-catalog/search?limit=bad'),
      {
        authenticate: async () => ({ userId: null }),
        provider: provider(search),
      },
    );

    expect(response.status).toBe(401);
    expect(search).not.toHaveBeenCalled();
  });

  it('validates filters and forwards normalized repeated parameters', async () => {
    const search = vi.fn(async () => ({
      provider: 'epidemic-sound' as const,
      tracks: [],
      pagination: { limit: 20, offset: 0, nextOffset: null },
    }));
    const response = await handleMusicCatalogSearch(
      new NextRequest(
        'https://app.example.com/api/services/editron/music-catalog/search'
        + '?q=bright+launch&genre=pop&genre=electronic&vocalType=NONE&bpmMin=95&bpmMax=125',
      ),
      {
        authenticate: async () => ({ userId: 'user_1' }),
        provider: provider(search),
      },
    );

    expect(response.status).toBe(200);
    expect(search).toHaveBeenCalledWith({
      term: 'bright launch',
      genres: ['pop', 'electronic'],
      moods: [],
      vocalTypes: ['none'],
      bpmMin: 95,
      bpmMax: 125,
      limit: 20,
      offset: 0,
      sort: 'Relevance',
      order: 'asc',
    });
    expect(await response.json()).toMatchObject({
      success: true,
      provider: 'epidemic-sound',
      rightsNotice: expect.stringContaining('library-license receipt'),
    });
  });

  it('rejects an inverted BPM range before provider access', async () => {
    const search = vi.fn();
    const response = await handleMusicCatalogSearch(
      new NextRequest(
        'https://app.example.com/api/services/editron/music-catalog/search?bpmMin=160&bpmMax=80',
      ),
      {
        authenticate: async () => ({ userId: 'user_1' }),
        provider: provider(search),
      },
    );

    expect(response.status).toBe(400);
    expect(search).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      success: false,
      code: 'INVALID_QUERY',
    });
  });

  it('fails visibly when the catalog is unconfigured', async () => {
    const response = await handleMusicCatalogSearch(
      new NextRequest('https://app.example.com/api/services/editron/music-catalog/search'),
      {
        authenticate: async () => ({ userId: 'user_1' }),
        provider: {
          ...provider(),
          available: () => false,
        },
      },
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      success: false,
      code: 'MUSIC_CATALOG_NOT_CONFIGURED',
    });
  });

  it('maps typed upstream failures and preserves retry-after', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const search = vi.fn(async () => {
      throw new MusicCatalogProviderError(
        'UPSTREAM_RATE_LIMITED',
        'The music catalog rate limit was reached',
        429,
        11,
      );
    });
    const response = await handleMusicCatalogSearch(
      new NextRequest('https://app.example.com/api/services/editron/music-catalog/search'),
      {
        authenticate: async () => ({ userId: 'user_1' }),
        provider: provider(search),
      },
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('11');
    expect(await response.json()).toEqual({
      success: false,
      error: 'The music catalog rate limit was reached',
      code: 'MUSIC_CATALOG_RATE_LIMITED',
    });
  });
});
