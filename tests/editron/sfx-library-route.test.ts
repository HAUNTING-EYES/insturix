import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

import {
  handleSfxLibrarySearch,
  resolveBrowseMaxDurationSec,
} from '@/app/api/services/editron/sfx-library/search/route';

type FetchMockArgs = [
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
];

function request(query = 'whoosh', limit = '12') {
  return new NextRequest(
    `https://app.example.com/api/services/editron/sfx-library/search?q=${encodeURIComponent(query)}&limit=${limit}`,
  );
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('SFX library search route', () => {
  it('requires authentication before spending provider quota', async () => {
    const fetchImpl = vi.fn<FetchMockArgs, ReturnType<typeof fetch>>();

    const response = await handleSfxLibrarySearch(request(), {
      authenticate: async () => ({ userId: null }),
      apiKey: 'freesound_test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(response.status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects malformed limits without contacting Freesound', async () => {
    const fetchImpl = vi.fn<FetchMockArgs, ReturnType<typeof fetch>>();

    const response = await handleSfxLibrarySearch(request('whoosh', '999'), {
      authenticate: async () => ({ userId: 'user_1' }),
      apiKey: 'freesound_test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns only verified CC0 candidates inside the spot-SFX duration ceiling', async () => {
    const fetchImpl = vi.fn<FetchMockArgs, ReturnType<typeof fetch>>(async () => jsonResponse({
      results: [
        {
          id: 101,
          name: 'Fast directional whoosh',
          duration: 1.34,
          license: 'Creative Commons 0',
          previews: { 'preview-hq-mp3': 'https://cdn.example.com/101.mp3' },
          tags: ['whoosh', 'fast', 'directional'],
        },
        {
          id: 102,
          name: 'Attribution whoosh',
          duration: 0.8,
          license: 'Attribution 4.0',
          previews: { 'preview-hq-mp3': 'https://cdn.example.com/102.mp3' },
        },
        {
          id: 103,
          name: 'Feature-length whoosh collection',
          duration: 185.5,
          license: 'Creative Commons 0',
          previews: { 'preview-hq-mp3': 'https://cdn.example.com/103.mp3' },
        },
        {
          id: 104,
          name: 'Missing preview',
          duration: 1,
          license: 'Creative Commons 0',
          previews: {},
        },
      ],
    }));

    const response = await handleSfxLibrarySearch(request('whoosh', '3'), {
      authenticate: async () => ({ userId: 'user_1' }),
      apiKey: 'freesound_test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const body = await response.json();
    const providerUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(providerUrl.pathname).toBe('/apiv2/search/text/');
    expect(providerUrl.searchParams.get('filter')).toBe(
      'license:"Creative Commons 0" duration:[0 TO 12]',
    );
    expect(providerUrl.searchParams.get('page_size')).toBe('6');
    expect(body.results).toEqual([
      {
        providerAssetId: '101',
        title: 'Fast directional whoosh',
        url: 'https://cdn.example.com/101.mp3',
        duration: 1.3,
        source: 'Freesound',
        tags: ['whoosh', 'fast', 'directional'],
        license: 'CC0-1.0',
        licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        attributionRequired: false,
        renderEligibility: 'requires-controlled-ingest',
      },
    ]);
    expect(body.policy).toEqual({
      license: 'CC0-1.0',
      attributionRequired: false,
      maxDurationSec: 12,
      renderEligibility: 'requires-controlled-ingest',
    });
  });

  it('uses the wider browse ceiling only for ambient sound families', () => {
    expect(resolveBrowseMaxDurationSec('office room tone')).toBe(30);
    expect(resolveBrowseMaxDurationSec('city ambience')).toBe(30);
    expect(resolveBrowseMaxDurationSec('impact hit')).toBe(12);
  });

  it('fails loud when the provider rejects the request', async () => {
    const fetchImpl = vi.fn<FetchMockArgs, ReturnType<typeof fetch>>(
      async () => jsonResponse({}, 429),
    );
    const response = await handleSfxLibrarySearch(request(), {
      authenticate: async () => ({ userId: 'user_1' }),
      apiKey: 'freesound_test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'SFX_PROVIDER_UNAVAILABLE',
    });
  });
});
