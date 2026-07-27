import { describe, expect, it, vi } from 'vitest';

import {
  MusicDiscoveryClientError,
  officialPreviewSource,
  searchMusicDiscovery,
} from '@/components/editron/editor/version-7.0.0/utils/music-discovery';

describe('editor music discovery client', () => {
  it('forwards regional filters and accepts a complete discovery receipt', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) => (
      Response.json(discoveryPayload())
    ));

    const result = await searchMusicDiscovery({
      term: 'punjabi gym',
      territory: 'IN',
      languages: ['pa', 'hi'],
      limit: 15,
      fetchImpl,
    });

    const requestUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]), 'https://editron.example');
    expect(requestUrl.pathname).toBe('/api/services/editron/music-discovery/search');
    expect(requestUrl.searchParams.get('q')).toBe('punjabi gym');
    expect(requestUrl.searchParams.get('region')).toBe('IN');
    expect(requestUrl.searchParams.getAll('language')).toEqual(['pa', 'hi']);
    expect(result.identities[0]?.title).toBe('Reference Song');
    expect(officialPreviewSource(result.identities[0]!)).toMatchObject({
      provider: 'youtube',
      previewCapability: 'official-embed',
    });
  });

  it('rejects malformed successful responses instead of trusting the browser boundary', async () => {
    const fetchImpl = vi.fn(async () => Response.json({
      ...discoveryPayload(),
      identities: [{ title: 'missing every durable identity field' }],
    }));

    await expect(searchMusicDiscovery({
      term: 'song',
      territory: 'IN',
      languages: [],
      limit: 10,
      fetchImpl,
    })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      httpStatus: 200,
    });
  });

  it('preserves typed route failures without exposing arbitrary payload shapes', async () => {
    const fetchImpl = vi.fn(async () => Response.json(
      {
        success: false,
        code: 'MUSIC_DISCOVERY_RATE_LIMITED',
        error: 'Music search is temporarily busy',
      },
      { status: 503 },
    ));

    await expect(searchMusicDiscovery({
      term: 'song',
      territory: 'GLOBAL',
      languages: [],
      limit: 10,
      fetchImpl,
    })).rejects.toEqual(expect.objectContaining<Partial<MusicDiscoveryClientError>>({
      code: 'MUSIC_DISCOVERY_RATE_LIMITED',
      message: 'Music search is temporarily busy',
      httpStatus: 503,
    }));
  });

  it('fails before network I/O when the editor submits invalid filters', async () => {
    const fetchImpl = vi.fn();
    await expect(searchMusicDiscovery({
      term: '',
      territory: 'IND',
      languages: [],
      limit: 10,
      fetchImpl,
    })).rejects.toMatchObject({ code: 'INVALID_QUERY' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

function discoveryPayload() {
  return {
    success: true,
    providers: ['youtube'],
    identities: [{
      identityId: 'youtube:abcdefghijk',
      identityConfidence: 'provider-only',
      title: 'Reference Song',
      artists: ['Reference Artist'],
      durationMs: 180_000,
      artworkUrl: 'https://i.ytimg.com/example.jpg',
      explicit: null,
      isrcs: [],
      languages: [],
      sources: [{
        provider: 'youtube',
        providerId: 'abcdefghijk',
        url: 'https://www.youtube.com/watch?v=abcdefghijk',
        embedUrl: 'https://www.youtube.com/embed/abcdefghijk',
        attribution: 'Reference Artist',
        previewCapability: 'official-embed',
      }],
      trendEvidence: [{
        source: 'youtube-most-popular-music',
        territory: 'IN',
        chart: 'youtube:mostPopular:music',
        rank: 4,
        observedAt: '2026-07-26T12:00:00.000Z',
      }],
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
    }],
    query: {
      term: 'punjabi gym',
      territory: 'IN',
      languages: ['pa', 'hi'],
      limit: 15,
    },
    failures: [],
    trendCoverage: {
      status: 'fresh',
      source: 'youtube-most-popular-music',
      territory: 'IN',
      requestedLanguages: ['pa', 'hi'],
      matchedIdentityCount: 1,
      observedAt: '2026-07-26T12:00:00.000Z',
    },
    acquisitionNotice: 'Discovery does not provide downloadable audio.',
  };
}
