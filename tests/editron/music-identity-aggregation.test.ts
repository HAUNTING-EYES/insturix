import { describe, expect, it, vi } from 'vitest';
import { AppleMusicDiscoveryProvider } from '@/lib/editron/music-discovery/apple-music-provider';
import {
  MusicDiscoveryAggregateError,
  MusicDiscoveryAggregator,
} from '@/lib/editron/music-discovery/aggregate-provider';
import { MusicBrainzDiscoveryProvider } from '@/lib/editron/music-discovery/musicbrainz-provider';
import {
  MusicDiscoveryProviderError,
  type MusicDiscoveryIdentity,
  type MusicDiscoveryProvider,
  type MusicDiscoveryProviderName,
  type MusicDiscoverySearchQuery,
} from '@/lib/editron/music-discovery/types';

const query: MusicDiscoverySearchQuery = {
  term: 'Jai Ho',
  territory: 'IN',
  languages: ['hi'],
  limit: 20,
};

describe('AppleMusicDiscoveryProvider', () => {
  it('uses the requested storefront and normalizes official previews and ISRC identity', async () => {
    const fetchImpl = vi.fn(async (_input: URL, _init?: RequestInit) => Response.json({
      results: {
        songs: {
          data: [{
            id: 'apple_1',
            attributes: {
              name: 'Jai Ho',
              artistName: 'A. R. Rahman',
              durationInMillis: 305_400,
              artwork: { url: 'https://img.example/{w}x{h}{c}.{f}' },
              previews: [{ url: 'https://audio.example/preview.m4a' }],
              url: 'https://music.apple.com/in/song/jai-ho/apple_1',
              isrc: 'IN-A23-08-00001',
              contentRating: 'clean',
            },
          }],
        },
      },
    }));
    const provider = new AppleMusicDiscoveryProvider({
      developerToken: 'apple_token',
      fetchImpl,
    });

    const identities = await provider.search(query);

    const [requestUrl, requestInit] = fetchImpl.mock.calls[0] ?? [];
    expect(String(requestUrl)).toContain('/v1/catalog/in/search?');
    expect(String(requestUrl)).toContain('types=songs');
    expect(String(requestUrl)).toContain('l=hi');
    expect(requestInit?.headers).toMatchObject({
      Authorization: 'Bearer apple_token',
    });
    expect(identities).toEqual([expect.objectContaining({
      identityId: 'isrc:INA230800001',
      identityConfidence: 'canonical',
      title: 'Jai Ho',
      artists: ['A. R. Rahman'],
      artworkUrl: 'https://img.example/512x512bb.jpg',
      explicit: false,
      isrcs: ['INA230800001'],
      sources: [expect.objectContaining({
        provider: 'apple-music',
        previewUrl: 'https://audio.example/preview.m4a',
        previewCapability: 'provider-preview',
      })],
      availability: {
        audioAcquisition: 'not-provided',
        renderEligibility: 'requires-user-reference-upload',
      },
    })]);
  });

  it('fails with typed errors for authentication and malformed provider responses', async () => {
    const unauthorized = new AppleMusicDiscoveryProvider({
      developerToken: 'bad_token',
      fetchImpl: async () => new Response(null, { status: 401 }),
    });
    await expect(unauthorized.search(query)).rejects.toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
      detailCode: 'UPSTREAM_AUTH_FAILED',
      providerStatus: 401,
    });

    const malformed = new AppleMusicDiscoveryProvider({
      developerToken: 'apple_token',
      fetchImpl: async () => Response.json({ results: { songs: { data: [{}] } } }),
    });
    await expect(malformed.search(query)).rejects.toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
      detailCode: 'INVALID_UPSTREAM_RESPONSE',
    });
  });
});

describe('MusicBrainzDiscoveryProvider', () => {
  it('identifies the client and normalizes recording credits and ISRCs', async () => {
    const fetchImpl = vi.fn(async (_input: URL, _init?: RequestInit) => Response.json({
      recordings: [{
        id: 'mbid_1',
        title: 'Jai Ho',
        length: 305_000,
        isrcs: ['IN-A23-08-00001'],
        'artist-credit': [
          { name: 'A. R. Rahman', artist: { name: 'Allah Rakha Rahman' } },
        ],
      }],
    }));
    const provider = new MusicBrainzDiscoveryProvider({
      userAgent: 'Editron/1.0 (engineering@editron.example)',
      fetchImpl,
    });

    const identities = await provider.search(query);

    const [requestUrl, requestInit] = fetchImpl.mock.calls[0] ?? [];
    expect(String(requestUrl)).toContain('/ws/2/recording?');
    expect(String(requestUrl)).toContain('query=Jai+Ho');
    expect(requestInit?.headers).toMatchObject({
      'User-Agent': 'Editron/1.0 (engineering@editron.example)',
    });
    expect(identities).toEqual([expect.objectContaining({
      identityId: 'isrc:INA230800001',
      identityConfidence: 'canonical',
      artists: ['A. R. Rahman'],
      durationMs: 305_000,
      isrcs: ['INA230800001'],
      sources: [expect.objectContaining({
        provider: 'musicbrainz',
        previewCapability: 'link-out',
      })],
    })]);
  });

  it('rejects anonymous clients before spending an upstream request', async () => {
    const fetchImpl = vi.fn();
    const provider = new MusicBrainzDiscoveryProvider({
      userAgent: 'anonymous',
      fetchImpl,
    });

    await expect(provider.search(query)).rejects.toMatchObject({
      code: 'NOT_CONFIGURED',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('MusicDiscoveryAggregator', () => {
  it('deduplicates canonical recordings and preserves a partial-provider failure receipt', async () => {
    const apple = provider('apple-music', [identity({
      identityId: 'isrc:INA230800001',
      title: 'Jai Ho',
      artists: ['A. R. Rahman'],
      durationMs: 305_400,
      artworkUrl: 'https://img.example/apple.jpg',
      explicit: false,
      isrcs: ['INA230800001'],
      sourceProvider: 'apple-music',
    })]);
    const musicBrainz = provider('musicbrainz', [identity({
      identityId: 'musicbrainz:mbid_1',
      title: 'Jai Ho',
      artists: ['A. R. Rahman'],
      durationMs: 305_000,
      isrcs: ['IN-A23-08-00001'],
      sourceProvider: 'musicbrainz',
    })]);
    const youtube = provider('youtube', new MusicDiscoveryProviderError(
      'UPSTREAM_RATE_LIMITED',
      'YouTube music discovery is rate limited',
      429,
      7,
    ));

    const result = await new MusicDiscoveryAggregator([
      youtube,
      musicBrainz,
      apple,
    ]).search(query);

    expect(result.providers).toEqual(['musicbrainz', 'apple-music']);
    expect(result.failures).toEqual([{
      provider: 'youtube',
      code: 'UPSTREAM_RATE_LIMITED',
      message: 'YouTube music discovery is rate limited',
      providerStatus: 429,
      retryAfterSeconds: 7,
    }]);
    expect(result.identities).toHaveLength(1);
    expect(result.identities[0]).toMatchObject({
      identityId: 'isrc:INA230800001',
      title: 'Jai Ho',
      artists: ['A. R. Rahman'],
      artworkUrl: 'https://img.example/apple.jpg',
      explicit: false,
      sources: [
        { provider: 'apple-music' },
        { provider: 'musicbrainz' },
      ],
    });
  });

  it('does not merge a remix with the original even when artist and duration are close', async () => {
    const aggregator = new MusicDiscoveryAggregator([
      provider('apple-music', [identity({
        identityId: 'apple-music:original',
        title: 'Jai Ho',
        artists: ['A. R. Rahman'],
        durationMs: 305_000,
        isrcs: ['INA230800001'],
        sourceProvider: 'apple-music',
      })]),
      provider('musicbrainz', [
        identity({
          identityId: 'musicbrainz:different-master',
          title: 'Jai Ho',
          artists: ['A. R. Rahman'],
          durationMs: 305_500,
          isrcs: ['INA230800002'],
          sourceProvider: 'musicbrainz',
        }),
        identity({
          identityId: 'musicbrainz:remix',
          title: 'Jai Ho (Remix)',
          artists: ['A. R. Rahman'],
          durationMs: 305_500,
          isrcs: ['not-an-isrc'],
          sourceProvider: 'musicbrainz',
        }),
      ]),
      provider('youtube', [identity({
        identityId: 'youtube:metadata-bridge',
        title: 'Jai Ho (Official Video)',
        artists: ['A. R. Rahman'],
        durationMs: 305_250,
        sourceProvider: 'youtube',
      })]),
    ]);

    const result = await aggregator.search(query);

    expect(result.identities).toHaveLength(3);
  });

  it('fails loud with all provider receipts when every configured provider fails', async () => {
    const aggregator = new MusicDiscoveryAggregator([
      provider('apple-music', new MusicDiscoveryProviderError(
        'UPSTREAM_TIMEOUT',
        'Apple Music discovery timed out',
      )),
      provider('musicbrainz', new MusicDiscoveryProviderError(
        'UPSTREAM_TIMEOUT',
        'MusicBrainz discovery timed out',
      )),
    ]);

    const promise = aggregator.search(query);

    await expect(promise).rejects.toBeInstanceOf(MusicDiscoveryAggregateError);
    await expect(promise).rejects.toMatchObject({
      code: 'UPSTREAM_TIMEOUT',
      failures: [
        { provider: 'apple-music', code: 'UPSTREAM_TIMEOUT' },
        { provider: 'musicbrainz', code: 'UPSTREAM_TIMEOUT' },
      ],
    });
  });
});

function provider(
  name: MusicDiscoveryProviderName,
  result: MusicDiscoveryIdentity[] | Error,
): MusicDiscoveryProvider {
  return {
    name,
    available: () => true,
    search: vi.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  };
}

function identity(input: {
  identityId: string;
  title: string;
  artists: string[];
  durationMs: number;
  sourceProvider: MusicDiscoveryProviderName;
  artworkUrl?: string;
  explicit?: boolean;
  isrcs?: string[];
}): MusicDiscoveryIdentity {
  return {
    identityId: input.identityId,
    identityConfidence: input.isrcs?.length ? 'canonical' : 'provider-only',
    title: input.title,
    artists: input.artists,
    durationMs: input.durationMs,
    artworkUrl: input.artworkUrl ?? null,
    explicit: input.explicit ?? null,
    isrcs: input.isrcs ?? [],
    languages: [],
    sources: [{
      provider: input.sourceProvider,
      providerId: input.identityId,
      url: `https://example.com/${input.identityId}`,
      previewCapability: 'link-out',
    }],
    trendEvidence: [],
    availability: {
      audioAcquisition: 'not-provided',
      renderEligibility: 'requires-user-reference-upload',
    },
    actions: ['provider-link-out', 'supply-reference-audio', 'add-on-platform'],
  };
}
