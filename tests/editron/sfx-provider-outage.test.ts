import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  parseSfxCatalogManifest,
  type SfxCatalogManifest,
} from '@/lib/pipeline/sfx-catalog';
import {
  searchAndDownloadSFX,
  type SFXLibrarySearchReport,
} from '@/lib/pipeline/sfx-library-service';

function emptyCatalogManifest(): SfxCatalogManifest {
  return parseSfxCatalogManifest({
    version: 'sfx-catalog-v1',
    generatedAt: '2026-08-03T00:00:00.000Z',
    knowledgeGraphRefs: ['transition-sfx-pairing', 'true-peak-limiting'],
    qualityPolicy: {
      minimumSelectionScore: 0.6,
      silenceFloorLufs: -60,
      maxTruePeakDbtp: -1,
      minSampleRateHz: 44_100,
      allowedChannelCounts: [1, 2],
      blockedTags: ['vocal', 'speech', 'music', 'meme', 'noisy', 'comedic', 'distorted', 'clipping'],
    },
    entries: [],
  });
}

function freesoundResponse(): Response {
  return new Response(JSON.stringify({
    results: [{
      id: 42,
      name: 'Clean air transition sweep',
      duration: 0.8,
      previews: { 'preview-hq-mp3': 'https://cdn.example.com/air-sweep.mp3' },
      license: 'Creative Commons 0',
      tags: ['whoosh', 'transition', 'air'],
      avg_rating: 4.8,
    }],
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('SFX provider outage handling', () => {
  const originalFreesoundKey = process.env.FREESOUND_API_KEY;

  beforeEach(() => {
    process.env.FREESOUND_API_KEY = 'test-freesound-key';
  });

  afterEach(() => {
    if (originalFreesoundKey) process.env.FREESOUND_API_KEY = originalFreesoundKey;
    else delete process.env.FREESOUND_API_KEY;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('bounds metadata search and resolves an outage to an audited no-match', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      throw new DOMException('simulated metadata timeout', 'TimeoutError');
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const reports: SFXLibrarySearchReport[] = [];
    const result = await searchAndDownloadSFX(
      'editorial transition sweep',
      'user-outage',
      2,
      undefined,
      report => reports.push(report),
      emptyCatalogManifest(),
    );

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(reports).toEqual([
      expect.objectContaining({
        selectionLane: 'none',
        providerCandidateCount: 0,
        acceptedCandidateCount: 0,
        failureReason: 'no-provider-candidates',
      }),
    ]);
  });

  it('bounds selected provider audio download and reports a recoverable failure', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      if (String(input).startsWith('https://freesound.org/apiv2/search/')) {
        return freesoundResponse();
      }
      throw new DOMException('simulated audio timeout', 'TimeoutError');
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const reports: SFXLibrarySearchReport[] = [];
    const result = await searchAndDownloadSFX(
      'clean air transition sweep',
      'user-outage',
      2,
      undefined,
      report => reports.push(report),
      emptyCatalogManifest(),
    );

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(reports.at(-1)).toEqual(expect.objectContaining({
      selectionLane: 'provider',
      providerCandidateCount: 1,
      failureReason: 'download-failed',
    }));
  });
});
