import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const updateOne = vi.fn(async () => ({ acknowledged: true }));
  const collection = vi.fn(() => ({ updateOne }));
  return {
    collection,
    updateOne,
    uploadMedia: vi.fn(),
  };
});

vi.mock('@/lib/editron/services/upload-service', () => ({
  uploadMedia: mocks.uploadMedia,
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { MEDIA_ASSETS: 'mediaAssets' },
  getDatabase: vi.fn(async () => ({
    collection: mocks.collection,
  })),
}));

import { resolveAtomicSfxForm } from '@/lib/editron/services/sfx-form';
import { resolveRenderableAudio } from '@/lib/editron/shared/render-request-payload';
import {
  isSFXLibraryAvailable,
  searchAndDownloadSFX,
  type SFXLibrarySearchReport,
} from '@/lib/pipeline/sfx-library-service';

function freesoundResponse(results: Array<Record<string, unknown>>): Response {
  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function freesoundCandidate(input: {
  id: number;
  name: string;
  duration: number;
  previewUrl: string;
  tags?: string[];
  rating?: number;
}): Record<string, unknown> {
  return {
    id: input.id,
    name: input.name,
    duration: input.duration,
    previews: { 'preview-hq-mp3': input.previewUrl },
    license: 'Creative Commons 0',
    tags: input.tags ?? [],
    avg_rating: input.rating ?? 4,
  };
}

describe('searchAndDownloadSFX provider candidate gate', () => {
  const originalFreesoundKey = process.env.FREESOUND_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FREESOUND_API_KEY = 'test-freesound-key';
    mocks.uploadMedia.mockResolvedValue({
      assetId: 'sfx_lib_selected',
      signedUrl: 'https://r2.example.com/asset/sfx_lib_selected',
      gcsPath: null,
      r2Key: 'sfx_lib_selected',
      urlExpiresAt: null,
      size: 8,
      contentType: 'audio/mpeg',
    });
  });

  afterEach(() => {
    if (originalFreesoundKey) process.env.FREESOUND_API_KEY = originalFreesoundKey;
    else delete process.env.FREESOUND_API_KEY;
    vi.unstubAllGlobals();
  });

  it('reports library availability truthfully from its provider credential', () => {
    delete process.env.FREESOUND_API_KEY;
    expect(isSFXLibraryAvailable()).toBe(false);

    process.env.FREESOUND_API_KEY = 'configured';
    expect(isSFXLibraryAvailable()).toBe(true);
  });

  it('scores provider candidates before downloading and uploads only the accepted SFX', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const href = String(url);
      if (href.startsWith('https://freesound.org/apiv2/search/')) {
        return freesoundResponse([
          freesoundCandidate({
            id: 1,
            name: 'Cartoon coin pickup meme vocal noisy',
            duration: 0.7,
            previewUrl: 'https://cdn.example.com/bad.mp3',
            tags: ['meme', 'vocal', 'coin'],
            rating: 5,
          }),
          freesoundCandidate({
            id: 2,
            name: 'Air movement pass',
            duration: 0.8,
            previewUrl: 'https://cdn.example.com/good.mp3',
            tags: ['whoosh', 'cinematic', 'smooth', 'transition'],
            rating: 4.5,
          }),
        ]);
      }
      if (href === 'https://cdn.example.com/good.mp3') {
        return new Response(Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00]), {
          status: 200,
          headers: { 'content-type': 'audio/mpeg' },
        });
      }
      throw new Error(`unexpected fetch: ${href}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const form = resolveAtomicSfxForm({
      params: { sfxCue: 'cinematic whoosh sweep transition' },
      frame: 30,
      sceneRemainingFrames: 90,
    });

    const reports: SFXLibrarySearchReport[] = [];
    const result = await searchAndDownloadSFX('whoosh cinematic sweep', 'user-1', 2, form, report => reports.push(report));

    expect(reports).toHaveLength(1);
    expect(reports[0]).toEqual(expect.objectContaining({
      version: 'sfx-library-search-report-v1',
      query: 'whoosh cinematic sweep',
      atomicGate: true,
      providerCandidateCount: 2,
      acceptedCandidateCount: 1,
      rejectedCandidateCount: 1,
      selectedCandidate: expect.objectContaining({
        source: 'freesound',
        title: 'Air movement pass',
        accepted: true,
        decision: 'accept',
      }),
    }));
    expect(reports[0].candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Cartoon coin pickup meme vocal noisy', accepted: false, decision: 'reject' }),
      expect.objectContaining({ title: 'Air movement pass', accepted: true, decision: 'accept' }),
    ]));
    expect(result).toEqual(expect.objectContaining({
      audioUrl: 'https://r2.example.com/asset/sfx_lib_selected',
      audioAssetId: 'sfx_lib_selected',
      durationMs: 800,
      source: 'freesound',
      originalTitle: 'Air movement pass',
      audioRights: {
        mediaRole: 'sfx',
        source: 'library',
        userChoice: 'attested',
        licensed: true,
        evidence: {
          kind: 'library-license',
          sourceAssetId: 'sfx_lib_selected',
          licenseId: 'freesound:2:creative-commons-0',
        },
      },
    }));
    expect(resolveRenderableAudio({
      id: 'sfx-overlay',
      type: 'sound',
      audioRights: result?.audioRights,
    }).overlay).not.toBeNull();
    expect(mocks.uploadMedia).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith('https://cdn.example.com/bad.mp3');
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { assetId: 'sfx_lib_selected' },
      expect.objectContaining({
        $set: {
          audioRights: result?.audioRights,
        },
        $setOnInsert: expect.objectContaining({
          source: 'sfx-provider-freesound',
          cachedUrl: 'https://r2.example.com/asset/sfx_lib_selected',
          r2Key: 'sfx_lib_selected',
          originalTitle: 'Air movement pass',
          providerCandidateAccepted: true,
          assetQualityScore: expect.any(Number),
        }),
      }),
      { upsert: true },
    );
  });

  it('skips download/upload when provider candidates fail the atomic quality gate', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const href = String(url);
      if (href.startsWith('https://freesound.org/apiv2/search/')) {
        return freesoundResponse([
          freesoundCandidate({
            id: 3,
            name: 'Long noisy vocal meme ambience',
            duration: 5,
            previewUrl: 'https://cdn.example.com/rejected.mp3',
            tags: ['vocal', 'meme', 'noisy'],
          }),
        ]);
      }
      throw new Error(`download should not run for rejected SFX candidate: ${href}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const form = resolveAtomicSfxForm({
      params: { sfxCue: 'cinematic whoosh sweep transition' },
      frame: 30,
      sceneRemainingFrames: 90,
    });

    const reports: SFXLibrarySearchReport[] = [];
    const result = await searchAndDownloadSFX('whoosh cinematic sweep', 'user-1', 2, form, report => reports.push(report));

    expect(result).toBeNull();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toEqual(expect.objectContaining({
      version: 'sfx-library-search-report-v1',
      query: 'whoosh cinematic sweep',
      atomicGate: true,
      providerCandidateCount: 1,
      acceptedCandidateCount: 0,
      rejectedCandidateCount: 1,
      failureReason: 'all-candidates-rejected',
    }));
    expect(reports[0].candidates[0]).toEqual(expect.objectContaining({
      source: 'freesound',
      title: 'Long noisy vocal meme ambience',
      accepted: false,
      decision: 'reject',
      reasons: expect.any(Array),
    }));
    expect(mocks.uploadMedia).not.toHaveBeenCalled();
    expect(mocks.updateOne).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
