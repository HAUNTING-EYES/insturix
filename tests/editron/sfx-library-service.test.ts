import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const updateOne = vi.fn(async () => ({ acknowledged: true }));
  const collection = vi.fn(() => ({ updateOne }));
  return {
    collection,
    inspectEncodedSfxAudio: vi.fn(),
    updateOne,
    uploadMedia: vi.fn(),
  };
});

vi.mock('@/lib/editron/services/upload-service', () => ({
  uploadMedia: mocks.uploadMedia,
}));

vi.mock('@/lib/pipeline/audio-conditioning', () => ({
  inspectEncodedSfxAudio: mocks.inspectEncodedSfxAudio,
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
  InvalidSfxCatalogManifestError,
  parseSfxCatalogManifest,
  selectSfxCatalogEntry,
  type SfxCatalogManifest,
} from '@/lib/pipeline/sfx-catalog';
import {
  ingestFreesoundSfxById,
  isSFXLibraryAvailable,
  searchAndDownloadSFX,
  type SFXLibrarySearchReport,
} from '@/lib/pipeline/sfx-library-service';
import { handleSfxLibraryIngest } from '@/app/api/services/editron/sfx-library/ingest/route';

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

function validCatalogManifest(): SfxCatalogManifest {
  const contentHash = 'a'.repeat(64);
  return parseSfxCatalogManifest({
    version: 'sfx-catalog-v1',
    generatedAt: '2026-07-25T00:00:00.000Z',
    knowledgeGraphRefs: ['transition-sfx-pairing', 'true-peak-limiting'],
    qualityPolicy: {
      minimumSelectionScore: 0.6,
      silenceFloorLufs: -60,
      maxTruePeakDbtp: -1,
      minSampleRateHz: 44100,
      allowedChannelCounts: [1, 2],
      blockedTags: ['vocal', 'speech', 'music', 'meme', 'noisy', 'comedic', 'distorted', 'clipping'],
    },
    entries: [{
      assetId: 'sfx_catalog_air_whoosh_001',
      title: 'Clean cinematic air whoosh',
      audioUrl: 'https://r2.example.com/sfx/air-whoosh-001.wav',
      storagePath: 'sfx/air-whoosh-001.wav',
      durationMs: 800,
      contentHashSha256: contentHash,
      mimeType: 'audio/wav',
      eventRoles: ['whoosh'],
      surfaces: ['transition', 'motion-graphic'],
      layerRole: 'oneshot',
      tags: ['whoosh', 'cinematic', 'smooth', 'transition'],
      negativeTags: [],
      energy: 0.7,
      brightness: 0.58,
      weight: 0.24,
      transientSharpness: 0.46,
      material: 'air',
      tailMs: 180,
      loopable: false,
      direction: 'neutral',
      motionSpeed: 'fast',
      trendTag: 'clean-editorial',
      measurement: {
        algorithm: 'ffmpeg-ebur128-v1',
        integratedLufs: -18,
        truePeakDbtp: -3,
        sampleRateHz: 48000,
        channelCount: 2,
        measuredAt: '2026-07-25T00:00:00.000Z',
        sourceHashSha256: contentHash,
      },
      provenance: {
        provider: 'sonniss',
        providerAssetId: 'sonniss-air-whoosh-001',
        licenseId: 'sonniss-game-audio-gdc-royalty-free',
        licenseUrl: 'https://sonniss.com/gameaudiogdc',
        attributionRequired: false,
      },
      audioRights: {
        mediaRole: 'sfx',
        source: 'library',
        userChoice: 'attested',
        licensed: true,
        evidence: {
          kind: 'library-license',
          sourceAssetId: 'sfx_catalog_air_whoosh_001',
          licenseId: 'sonniss-game-audio-gdc-royalty-free',
        },
      },
    }],
  });
}

describe('searchAndDownloadSFX provider candidate gate', () => {
  const originalFreesoundKey = process.env.FREESOUND_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FREESOUND_API_KEY = 'test-freesound-key';
    mocks.inspectEncodedSfxAudio.mockResolvedValue({
      durationMs: 800,
      sampleRate: 48_000,
      channels: 2,
      loudness: { metric: 'integrated-lufs', valueDb: -18 },
      truePeakDbtp: -3,
      clippingRisk: false,
    });
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
      selectionLane: 'provider',
      catalog: expect.objectContaining({
        decision: 'no-match',
        catalogEntryCount: 0,
      }),
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
      providerAssetId: '2',
      measurement: expect.objectContaining({
        version: 'sfx-acoustic-measurement-v1',
        loudnessMetric: 'integrated-lufs',
        loudnessDb: -18,
        sourceHashSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
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
          sfxAcousticMeasurement: expect.objectContaining({
            durationMs: 800,
            sourceHashSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          }),
        }),
      }),
      { upsert: true },
    );
    expect(mocks.inspectEncodedSfxAudio).toHaveBeenCalledWith(
      Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00]),
    );
  });

  it('rejects acoustically invalid provider bytes before upload or persistence', async () => {
    const audioBytes = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00]);
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const href = String(url);
      if (href.startsWith('https://freesound.org/apiv2/search/')) {
        return freesoundResponse([
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
        return new Response(audioBytes, {
          status: 200,
          headers: { 'content-type': 'audio/mpeg' },
        });
      }
      throw new Error(`unexpected fetch: ${href}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    mocks.inspectEncodedSfxAudio.mockRejectedValue(
      Object.assign(new Error('silent'), { code: 'AUDIO_SILENT' }),
    );
    const form = resolveAtomicSfxForm({
      params: { sfxCue: 'cinematic whoosh sweep transition' },
      frame: 30,
      sceneRemainingFrames: 90,
    });
    const reports: SFXLibrarySearchReport[] = [];

    const result = await searchAndDownloadSFX(
      'whoosh cinematic sweep',
      'user-1',
      2,
      form,
      report => reports.push(report),
    );

    expect(result).toBeNull();
    expect(reports.at(-1)).toEqual(expect.objectContaining({
      selectionLane: 'provider',
      failureReason: 'acoustic-rejected',
    }));
    expect(mocks.inspectEncodedSfxAudio).toHaveBeenCalledWith(audioBytes);
    expect(mocks.uploadMedia).not.toHaveBeenCalled();
    expect(mocks.updateOne).not.toHaveBeenCalled();
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
      selectionLane: 'none',
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

  it('uses a measured rights-cleared catalog asset without a provider or upload call', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('catalog hit must not make a provider or download request');
    });
    vi.stubGlobal('fetch', fetchMock);
    const form = resolveAtomicSfxForm({
      params: {
        sfxCue: 'cinematic whoosh sweep transition',
        sfxAnchor: 'transition',
        transitionFrame: 30,
      },
      frame: 30,
      sceneRemainingFrames: 90,
    });
    const reports: SFXLibrarySearchReport[] = [];

    const result = await searchAndDownloadSFX(
      'whoosh cinematic sweep',
      'user-1',
      2,
      form,
      report => reports.push(report),
      validCatalogManifest(),
    );

    expect(result).toEqual({
      audioUrl: 'https://r2.example.com/sfx/air-whoosh-001.wav',
      gcsPath: 'sfx/air-whoosh-001.wav',
      audioAssetId: 'sfx_catalog_air_whoosh_001',
      durationMs: 800,
      source: 'catalog',
      originalTitle: 'Clean cinematic air whoosh',
      audioRights: {
        mediaRole: 'sfx',
        source: 'library',
        userChoice: 'attested',
        licensed: true,
        evidence: {
          kind: 'library-license',
          sourceAssetId: 'sfx_catalog_air_whoosh_001',
          licenseId: 'sonniss-game-audio-gdc-royalty-free',
        },
      },
    });
    expect(reports).toEqual([
      expect.objectContaining({
        selectionLane: 'catalog',
        providerCandidateCount: 0,
        selectedCandidate: expect.objectContaining({
          source: 'catalog',
          accepted: true,
          decision: 'accept',
        }),
        catalog: expect.objectContaining({
          decision: 'selected',
          selectedAssetId: 'sfx_catalog_air_whoosh_001',
        }),
      }),
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.uploadMedia).not.toHaveBeenCalled();
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });

  it('fails loud on forged rights or audio measurements at catalog ingest', () => {
    const invalid = structuredClone(validCatalogManifest());
    invalid.entries[0].audioRights.evidence.sourceAssetId = 'sfx_catalog_other_asset';
    invalid.entries[0].measurement.truePeakDbtp = 0;

    expect(() => parseSfxCatalogManifest(invalid)).toThrow(InvalidSfxCatalogManifestError);
    expect(() => parseSfxCatalogManifest(invalid)).toThrow(/rights receipt belongs to another asset/);
    expect(() => parseSfxCatalogManifest(invalid)).toThrow(/true-peak ceiling/);
  });

  it('hard-rejects a semantically matching catalog asset carrying blocked tags', () => {
    const catalog = structuredClone(validCatalogManifest());
    catalog.entries[0].negativeTags = ['comedic boing'];
    const form = resolveAtomicSfxForm({
      params: {
        sfxCue: 'cinematic whoosh transition',
        sfxAnchor: 'transition',
        transitionFrame: 30,
      },
      frame: 30,
      sceneRemainingFrames: 90,
    });

    const selection = selectSfxCatalogEntry(catalog, {
      query: 'cinematic whoosh',
      maxDurationSec: 2,
      form,
    });

    expect(selection.entry).toBeNull();
    expect(selection.report).toEqual(expect.objectContaining({
      decision: 'no-match',
      acceptedCandidateCount: 0,
      rejectedCandidateCount: 1,
    }));
    expect(selection.report.candidates[0].reasons).toContain('blocked-tags:comedic');
  });

  it('ranks measured sonic features instead of relying on filenames', () => {
    const catalog = structuredClone(validCatalogManifest());
    const mismatched = structuredClone(catalog.entries[0]);
    mismatched.assetId = 'sfx_catalog_air_whoosh_mismatched';
    mismatched.contentHashSha256 = 'b'.repeat(64);
    mismatched.measurement.sourceHashSha256 = mismatched.contentHashSha256;
    mismatched.provenance.providerAssetId = 'sonniss-air-whoosh-mismatched';
    mismatched.audioRights.evidence.sourceAssetId = mismatched.assetId;
    mismatched.energy = 0.05;
    mismatched.brightness = 0.05;
    mismatched.weight = 0.95;
    mismatched.transientSharpness = 0.05;
    mismatched.motionSpeed = 'slow';
    catalog.entries.unshift(mismatched);
    const form = resolveAtomicSfxForm({
      params: {
        sfxCue: 'cinematic whoosh transition',
        sfxAnchor: 'transition',
        transitionFrame: 30,
      },
      signals: {
        motion_intensity: 0.82,
        cinematic_moment: 0.74,
      },
      frame: 30,
      sceneRemainingFrames: 90,
    });

    const selection = selectSfxCatalogEntry(catalog, {
      query: 'cinematic whoosh',
      maxDurationSec: 2,
      form,
    });

    expect(selection.entry?.assetId).toBe('sfx_catalog_air_whoosh_001');
    expect(selection.report.candidates[0].score).toBeGreaterThan(selection.report.candidates[1].score);
  });
});

describe('controlled Freesound SFX ingest', () => {
  const audioBytes = Buffer.from([
    0xff, 0xfb, 0x90, 0x64,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);

  function detailResponse(overrides: Record<string, unknown> = {}): Response {
    return new Response(JSON.stringify({
      id: 90210,
      name: 'Clean directional air whoosh',
      duration: 0.8,
      previews: {
        'preview-hq-mp3': 'https://cdn.freesound.org/previews/90/90210_1-hq.mp3',
      },
      license: 'https://creativecommons.org/publicdomain/zero/1.0/',
      tags: ['whoosh', 'air', 'transition'],
      ...overrides,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  function uploadResult() {
    return {
      assetId: 'sfx_fs_90210_selected',
      signedUrl: 'https://r2.example.com/asset/sfx_fs_90210_selected',
      gcsPath: null,
      r2Key: 'sfx_fs_90210_selected',
      urlExpiresAt: null,
      size: audioBytes.length,
      contentType: 'audio/mpeg',
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.inspectEncodedSfxAudio.mockResolvedValue({
      durationMs: 760,
      sampleRate: 48_000,
      channels: 2,
      loudness: { metric: 'integrated-lufs', valueDb: -18 },
      truePeakDbtp: -3,
      clippingRisk: false,
    });
  });

  it('re-fetches the exact provider asset, verifies CC0 and persists a durable rights receipt', async () => {
    const fetchImpl = vi.fn(async (
      input: string | URL | Request,
      _init?: RequestInit,
    ) => {
      const url = String(input);
      if (url.startsWith('https://freesound.org/apiv2/sounds/90210/')) {
        return detailResponse();
      }
      if (url === 'https://cdn.freesound.org/previews/90/90210_1-hq.mp3') {
        return new Response(audioBytes, {
          status: 200,
          headers: { 'content-type': 'audio/mpeg' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const upload = vi.fn(async () => uploadResult());
    const persist = vi.fn(async () => undefined);

    const result = await ingestFreesoundSfxById('90210', 'user-1', {
      apiKey: 'server-only-key',
      fetchImpl: fetchImpl as typeof fetch,
      upload,
      persist,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0][0])).toContain('/apiv2/sounds/90210/');
    expect(fetchImpl.mock.calls[0][1]).toEqual(expect.objectContaining({
      headers: { Authorization: 'Token server-only-key' },
    }));
    expect(upload).toHaveBeenCalledWith(
      audioBytes,
      'user-1',
      expect.stringMatching(/^sfx_fs_90210_[A-Za-z0-9_-]+\.mp3$/),
      'audio/mpeg',
      { customAssetId: expect.stringMatching(/^sfx_fs_90210_[A-Za-z0-9_-]+$/) },
    );
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      providerAssetId: '90210',
      provider: 'freesound',
      measurement: expect.objectContaining({
        version: 'sfx-acoustic-measurement-v1',
        algorithm: 'ffmpeg-ebur128-v1',
        loudnessMetric: 'integrated-lufs',
        loudnessDb: -18,
        truePeakDbtp: -3,
        sampleRateHz: 48_000,
        channelCount: 2,
        durationMs: 760,
        sourceHashSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      audioRights: {
        mediaRole: 'sfx',
        source: 'library',
        userChoice: 'attested',
        licensed: true,
        evidence: {
          kind: 'library-license',
          sourceAssetId: 'sfx_fs_90210_selected',
          licenseId: 'freesound:90210:creative-commons-0',
        },
      },
    }));
    expect(result).toEqual(expect.objectContaining({
      audioAssetId: 'sfx_fs_90210_selected',
      audioUrl: 'https://r2.example.com/asset/sfx_fs_90210_selected',
      durationMs: 760,
      providerAssetId: '90210',
      source: 'freesound',
      measurement: expect.objectContaining({
        loudnessMetric: 'integrated-lufs',
        sourceHashSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    }));
  });

  it.each([
    {
      label: 'acoustically silent bytes',
      inspect: async () => {
        throw Object.assign(new Error('silent'), { code: 'AUDIO_SILENT' });
      },
      code: 'SFX_AUDIO_SILENT',
    },
    {
      label: 'true peak above the catalog ceiling',
      inspect: async () => ({
        durationMs: 800,
        sampleRate: 48_000,
        channels: 2,
        loudness: { metric: 'integrated-lufs' as const, valueDb: -18 },
        truePeakDbtp: -0.2,
        clippingRisk: true,
      }),
      code: 'SFX_AUDIO_CLIPPING',
    },
    {
      label: 'sample rate below the catalog floor',
      inspect: async () => ({
        durationMs: 800,
        sampleRate: 22_050,
        channels: 2,
        loudness: { metric: 'integrated-lufs' as const, valueDb: -18 },
        truePeakDbtp: -3,
        clippingRisk: false,
      }),
      code: 'SFX_AUDIO_QUALITY_REJECTED',
    },
  ])('rejects $label before upload', async ({ inspect, code }) => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) =>
      String(input).includes('/apiv2/sounds/')
        ? detailResponse()
        : new Response(audioBytes, {
            status: 200,
            headers: { 'content-type': 'audio/mpeg' },
          }));
    const upload = vi.fn(async () => uploadResult());

    await expect(ingestFreesoundSfxById('90210', 'user-1', {
      apiKey: 'server-only-key',
      fetchImpl: fetchImpl as typeof fetch,
      inspectAudio: vi.fn(inspect),
      upload,
      persist: vi.fn(async () => undefined),
    })).rejects.toMatchObject({ code });

    expect(upload).not.toHaveBeenCalled();
  });

  it.each([
    ['a provider ID mismatch', { id: 90211 }, 'SFX_PROVIDER_ID_MISMATCH'],
    ['a non-CC0 license', { license: 'Attribution 4.0' }, 'SFX_LICENSE_NOT_EXPORTABLE'],
  ])('rejects %s before upload', async (_label, overrides, code) => {
    const fetchImpl = vi.fn(async () => detailResponse(overrides));
    const upload = vi.fn(async () => uploadResult());

    await expect(ingestFreesoundSfxById('90210', 'user-1', {
      apiKey: 'server-only-key',
      fetchImpl: fetchImpl as typeof fetch,
      upload,
      persist: vi.fn(async () => undefined),
    })).rejects.toMatchObject({ code });

    expect(upload).not.toHaveBeenCalled();
  });

  it('fails loud and cleans up when the durable receipt cannot be persisted', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) =>
      String(input).includes('/apiv2/sounds/')
        ? detailResponse()
        : new Response(audioBytes, {
            status: 200,
            headers: { 'content-type': 'audio/mpeg' },
          }));
    const cleanupUpload = vi.fn(async () => undefined);

    await expect(ingestFreesoundSfxById('90210', 'user-1', {
      apiKey: 'server-only-key',
      fetchImpl: fetchImpl as typeof fetch,
      upload: vi.fn(async () => uploadResult()),
      persist: vi.fn(async () => {
        throw new Error('database unavailable');
      }),
      cleanupUpload,
    })).rejects.toMatchObject({ code: 'SFX_RECEIPT_PERSIST_FAILED' });

    expect(cleanupUpload).toHaveBeenCalledWith(uploadResult());
  });

  it('passes only the authenticated user and provider ID across the HTTP boundary', async () => {
    const ingest = vi.fn(async () => ({
      audioUrl: 'https://r2.example.com/asset/sfx_fs_90210_selected',
      gcsPath: null,
      audioAssetId: 'sfx_fs_90210_selected',
      durationMs: 800,
      providerAssetId: '90210',
      source: 'freesound' as const,
      originalTitle: 'Clean directional air whoosh',
      audioRights: {
        mediaRole: 'sfx' as const,
        source: 'library' as const,
        userChoice: 'attested' as const,
        licensed: true,
        evidence: {
          kind: 'library-license' as const,
          sourceAssetId: 'sfx_fs_90210_selected',
          licenseId: 'freesound:90210:creative-commons-0',
        },
      },
    }));
    const request = new NextRequest('http://localhost/api/services/editron/sfx-library/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        providerAssetId: '90210',
        url: 'https://attacker.invalid/forged.mp3',
        license: 'CC0-1.0',
      }),
    });

    const response = await handleSfxLibraryIngest(request, {
      authenticate: async () => ({ userId: 'user-1' }),
      ingest,
    });

    expect(response.status).toBe(200);
    expect(ingest).toHaveBeenCalledOnce();
    expect(ingest).toHaveBeenCalledWith('90210', 'user-1');
  });
});
