import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: { loadProject: vi.fn() },
}));
vi.mock('@/lib/editron/services/gcs-service', () => ({
  deleteFromGCS: vi.fn(),
}));
vi.mock('@/lib/editron/services/r2-service', () => ({
  deleteFromR2: vi.fn(),
}));
vi.mock('@/lib/editron/services/upload-service', () => ({
  uploadMedia: vi.fn(),
}));

import { handleMusicCatalogIngest } from '@/app/api/services/editron/projects/[projectId]/music-catalog/ingest/route';
import { EpidemicMusicCatalogProvider } from '@/lib/editron/music-catalog/epidemic-provider';
import {
  ingestMusicCatalogTrack,
  MusicCatalogIngestError,
  type MusicCatalogIngestDependencies,
  type MusicCatalogIngestProvider,
  type MusicCatalogIngestStore,
  type StoredLibraryMusicAsset,
} from '@/lib/editron/music-catalog/ingest-service';
import type { MusicCatalogTrack } from '@/lib/editron/music-catalog/types';
import { getAudioRightsContractIssue } from '@/lib/editron/shared/render-request-payload';
import {
  inspectEncodedMusicAudio,
  MAX_AUDIO_CONDITIONING_INPUT_BYTES,
} from '@/lib/pipeline/audio-conditioning';

const NOW = new Date('2026-07-25T12:00:00.000Z');
const ENTITLEMENT_EXPIRES = new Date('2026-07-25T13:00:00.000Z');
const SOURCE_AUDIO = Buffer.from('mock-mp3-payload');

function track(overrides: Partial<MusicCatalogTrack> = {}): MusicCatalogTrack {
  return {
    provider: 'epidemic-sound',
    providerTrackId: 'track_123',
    title: 'Focused Future',
    artists: ['Example Artist'],
    featuredArtists: [],
    durationMs: 120_000,
    bpm: 112,
    moods: [{ id: 'hopeful', name: 'Hopeful' }],
    genres: [{ id: 'electronic', name: 'Electronic' }],
    vocalType: 'none',
    hasVocals: false,
    explicit: false,
    providerTier: 'free',
    catalogAvailability: 'download-candidate',
    rightsStatus: 'unverified',
    renderEligibility: 'requires-entitlement-and-ingest',
    ...overrides,
  };
}

function provider(overrides: Partial<MusicCatalogIngestProvider> = {}) {
  return {
    name: 'epidemic-sound' as const,
    available: vi.fn(() => true),
    getTrack: vi.fn(async () => track()),
    requestDownload: vi.fn(async () => ({
      provider: 'epidemic-sound' as const,
      providerTrackId: 'track_123',
      url: 'https://pdn.epidemicsound.com/download/source.mp3?token=secret',
      expiresAt: ENTITLEMENT_EXPIRES,
      format: 'mp3' as const,
      quality: 'high' as const,
      entitlementCheckedAt: NOW,
    })),
    ...overrides,
  } satisfies MusicCatalogIngestProvider;
}

function ingestStore(overrides: Partial<MusicCatalogIngestStore> = {}) {
  return {
    findAsset: vi.fn(async () => null),
    claim: vi.fn(async () => ({
      kind: 'claimed' as const,
      lease: { reservationId: 'reservation_1', leaseToken: 'lease_1' },
    })),
    saveAsset: vi.fn(async (asset: StoredLibraryMusicAsset) => asset),
    complete: vi.fn(async () => true),
    fail: vi.fn(async () => undefined),
    ...overrides,
  } satisfies MusicCatalogIngestStore;
}

function dependencies(
  overrides: Partial<MusicCatalogIngestDependencies> = {},
): MusicCatalogIngestDependencies {
  return {
    provider: provider(),
    providerAgreementId: 'agreement_prod_2026',
    loadProject: vi.fn(async () => ({ orgId: 'org_1' })),
    inspectAudio: vi.fn(async () => ({
      durationMs: 120_000,
      sampleRate: 48_000,
      channels: 2,
      measuredLufs: -16.2,
      truePeakDbtp: -1.4,
      clippingRisk: false,
    })),
    detectFileType: vi.fn(async () => ({ ext: 'mp3', mime: 'audio/mpeg' })),
    upload: vi.fn(async (_buffer, _userId, _filename, _contentType, options) => ({
      assetId: options.customAssetId,
      signedUrl: `https://media.example.com/${options.customAssetId}`,
      gcsPath: null,
      r2Key: options.customAssetId,
      urlExpiresAt: null,
      size: SOURCE_AUDIO.length,
      contentType: 'audio/mpeg',
    })),
    cleanupUpload: vi.fn(async () => undefined),
    store: ingestStore(),
    fetchImpl: vi.fn(async () =>
      new Response(SOURCE_AUDIO, {
        status: 200,
        headers: {
          'content-type': 'audio/mpeg',
          'content-length': String(SOURCE_AUDIO.length),
        },
      })),
    now: () => NOW,
    ...overrides,
  };
}

const request = {
  userId: 'user_1',
  projectId: 'proj_1',
  provider: 'epidemic-sound' as const,
  providerTrackId: 'track_123',
  idempotencyKey: 'ingest-request-123',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Epidemic catalog entitlement operations', () => {
  it('retrieves canonical metadata and a short-lived trusted download entitlement', async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(String(input));
      if (url.pathname === '/v0/tracks/metadata') {
        return Response.json([
          {
            id: 'track_123',
            mainArtists: ['Example Artist'],
            featuredArtists: [],
            title: 'Focused Future',
            bpm: 112,
            length: 120,
            moods: [{ id: 'hopeful', name: 'Hopeful' }],
            genres: [{ id: 'electronic', name: 'Electronic' }],
            hasVocals: false,
            tierOption: 'FREE',
            vocalType: 'NONE',
            isExplicit: false,
            isPreviewOnly: false,
          },
        ]);
      }
      return Response.json({
        url: 'https://pdn.epidemicsound.com/audio/source.mp3?token=short-lived',
        expires: '2099-07-25T13:00:00Z',
      });
    });
    const catalog = new EpidemicMusicCatalogProvider({
      apiKey: 'server-key',
      fetchImpl: fetchImpl as typeof fetch,
    });

    const metadata = await catalog.getTrack('track_123');
    const entitlement = await catalog.requestDownload('track_123', 'high');

    expect(metadata).toMatchObject({
      providerTrackId: 'track_123',
      catalogAvailability: 'download-candidate',
      rightsStatus: 'unverified',
    });
    expect(entitlement).toMatchObject({
      providerTrackId: 'track_123',
      format: 'mp3',
      quality: 'high',
    });
    const downloadRequest = new URL(String(fetchImpl.mock.calls[1]?.[0]));
    expect(downloadRequest.pathname).toBe('/v0/tracks/track_123/download');
    expect(downloadRequest.searchParams.get('quality')).toBe('high');
  });

  it('rejects provider download URLs outside the configured CDN allowlist', async () => {
    const catalog = new EpidemicMusicCatalogProvider({
      apiKey: 'server-key',
      fetchImpl: vi.fn(async () =>
        Response.json({
          url: 'https://attacker.example/audio.mp3',
          expires: '2099-07-25T13:00:00Z',
        })),
    });

    await expect(catalog.requestDownload('track_123')).rejects.toMatchObject({
      code: 'INVALID_UPSTREAM_RESPONSE',
      message: 'The music catalog returned an untrusted download URL',
    });
  });
});

describe('music catalog controlled ingest', () => {
  it('persists a controlled source asset with a durable rights and acoustic receipt', async () => {
    let persisted: StoredLibraryMusicAsset | undefined;
    const store = ingestStore({
      saveAsset: vi.fn(async (asset: StoredLibraryMusicAsset) => {
        persisted = asset;
        return asset;
      }),
    });
    const deps = dependencies({ store });

    const result = await ingestMusicCatalogTrack(request, deps);

    expect(result).toMatchObject({
      provider: 'epidemic-sound',
      providerTrackId: 'track_123',
      rightsStatus: 'licensed',
      renderEligibility: 'requires-audio-assignment-conditioning',
      idempotentReplay: false,
    });
    expect(persisted).toMatchObject({
      userId: 'user_1',
      orgId: 'org_1',
      projectId: 'proj_1',
      source: 'library',
      musicRights: {
        source: 'library',
        userChoice: 'attested',
        licensed: true,
        evidence: {
          kind: 'library-license',
          sourceAssetId: result.assetId,
          licenseId: result.licenseId,
        },
      },
      libraryLicenseReceipt: {
        version: 'editron-library-license-receipt-v1',
        providerTrackId: 'track_123',
        agreement: {
          reference: 'agreement_prod_2026',
          configuredBy: 'deployment-operator',
          authority: 'NEVER_AUTOMATED',
        },
        sourceObject: {
          size: SOURCE_AUDIO.length,
          contentType: 'audio/mpeg',
        },
        acousticAnalysis: {
          measuredLufs: -16.2,
          truePeakDbtp: -1.4,
        },
      },
    });
    expect(getAudioRightsContractIssue(persisted?.musicRights)).toBeNull();
    expect(JSON.stringify(persisted)).not.toContain('token=secret');
    expect(deps.upload).toHaveBeenCalledOnce();
    expect(store.complete).toHaveBeenCalledOnce();
  });

  it('rejects preview-only tracks before requesting or downloading audio', async () => {
    const catalog = provider({
      getTrack: vi.fn(async () =>
        track({ catalogAvailability: 'preview-only' })),
    });
    const deps = dependencies({ provider: catalog });

    await expect(ingestMusicCatalogTrack(request, deps)).rejects.toMatchObject({
      code: 'TRACK_NOT_ENTITLED',
    });
    expect(catalog.requestDownload).not.toHaveBeenCalled();
    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(deps.upload).not.toHaveBeenCalled();
  });

  it('rejects declared oversized downloads before buffering them', async () => {
    const deps = dependencies({
      fetchImpl: vi.fn(async () =>
        new Response(SOURCE_AUDIO, {
          status: 200,
          headers: {
            'content-length': String(MAX_AUDIO_CONDITIONING_INPUT_BYTES + 1),
          },
        })),
    });

    await expect(ingestMusicCatalogTrack(request, deps)).rejects.toMatchObject({
      code: 'INVALID_AUDIO',
    });
    expect(deps.inspectAudio).not.toHaveBeenCalled();
    expect(deps.upload).not.toHaveBeenCalled();
  });

  it('rolls controlled storage back when the durable asset receipt cannot persist', async () => {
    const store = ingestStore({
      findAsset: vi.fn(async () => null),
      saveAsset: vi.fn(async () => {
        throw new Error('mongo unavailable');
      }),
    });
    const cleanupUpload = vi.fn(async () => undefined);
    const deps = dependencies({ store, cleanupUpload });

    await expect(ingestMusicCatalogTrack(request, deps)).rejects.toMatchObject({
      code: 'PERSISTENCE_FAILED',
    });
    expect(cleanupUpload).toHaveBeenCalledOnce();
    expect(store.fail).toHaveBeenCalledOnce();
  });

  it('rejects and rolls back mismatched controlled-storage metadata', async () => {
    const cleanupUpload = vi.fn(async () => undefined);
    const deps = dependencies({
      cleanupUpload,
      upload: vi.fn(async () => ({
        assetId: 'wrong_asset_id',
        signedUrl: 'https://media.example.com/wrong_asset_id',
        gcsPath: null,
        r2Key: 'wrong_asset_id',
        urlExpiresAt: null,
        size: SOURCE_AUDIO.length,
        contentType: 'audio/mpeg',
      })),
    });

    await expect(ingestMusicCatalogTrack(request, deps)).rejects.toMatchObject({
      code: 'PERSISTENCE_FAILED',
    });
    expect(cleanupUpload).toHaveBeenCalledOnce();
    expect(deps.store.saveAsset).not.toHaveBeenCalled();
  });

  it('preserves controlled storage when the database persistence outcome is uncertain', async () => {
    const findAsset = vi.fn()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('mongo read unavailable'));
    const store = ingestStore({
      findAsset,
      saveAsset: vi.fn(async () => {
        throw new Error('mongo write response lost');
      }),
    });
    const cleanupUpload = vi.fn(async () => undefined);

    await expect(
      ingestMusicCatalogTrack(request, dependencies({ store, cleanupUpload })),
    ).rejects.toMatchObject({
      code: 'PERSISTENCE_FAILED',
      message: expect.stringContaining('could not be verified'),
    });
    expect(cleanupUpload).not.toHaveBeenCalled();
    expect(store.fail).toHaveBeenCalledOnce();
  });

  it('does not spend provider work when the idempotency lease is already active', async () => {
    const catalog = provider();
    const store = ingestStore({
      claim: vi.fn(async () => ({ kind: 'in-progress' as const })),
    });

    await expect(
      ingestMusicCatalogTrack(request, dependencies({ provider: catalog, store })),
    ).rejects.toMatchObject({
      code: 'INGEST_IN_PROGRESS',
    });
    expect(catalog.getTrack).not.toHaveBeenCalled();
    expect(catalog.requestDownload).not.toHaveBeenCalled();
  });

  it('fails closed when the operator-owned provider agreement is absent', async () => {
    const deps = dependencies({ providerAgreementId: '' });

    await expect(ingestMusicCatalogTrack(request, deps)).rejects.toMatchObject({
      code: 'NOT_CONFIGURED',
    });
    expect(deps.loadProject).not.toHaveBeenCalled();
    expect(deps.provider.getTrack).not.toHaveBeenCalled();
  });
});

describe('catalog ingest route', () => {
  it('authenticates before parsing or invoking ingest', async () => {
    const ingest = vi.fn();
    const response = await handleMusicCatalogIngest(
      new NextRequest(
        'https://app.example.com/api/services/editron/projects/proj_1/music-catalog/ingest',
        { method: 'POST', body: '{broken-json' },
      ),
      { params: Promise.resolve({ projectId: 'proj_1' }) },
      {
        authenticate: async () => ({ userId: null }),
        ingest,
      },
    );

    expect(response.status).toBe(401);
    expect(ingest).not.toHaveBeenCalled();
  });

  it('returns typed ingest failures without exposing internal causes', async () => {
    const response = await handleMusicCatalogIngest(
      new NextRequest(
        'https://app.example.com/api/services/editron/projects/proj_1/music-catalog/ingest',
        {
          method: 'POST',
          body: JSON.stringify({
            provider: 'epidemic-sound',
            providerTrackId: 'track_123',
            idempotencyKey: 'ingest-request-123',
          }),
        },
      ),
      { params: Promise.resolve({ projectId: 'proj_1' }) },
      {
        authenticate: async () => ({ userId: 'user_1' }),
        ingest: async () => {
          throw new MusicCatalogIngestError(
            'TRACK_NOT_ENTITLED',
            'This catalog track is preview-only',
            403,
            { cause: new Error('provider secret') },
          );
        },
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'This catalog track is preview-only',
      code: 'TRACK_NOT_ENTITLED',
    });
  });
});

describe('encoded music acoustic inspection', () => {
  it('measures actual EBU R128 loudness on decoded audio', async () => {
    const inspection = await inspectEncodedMusicAudio(buildMonoWav({
      durationSeconds: 1,
      amplitude: 0.2,
    }));

    expect(inspection.durationMs).toBeCloseTo(1_000, 0);
    expect(inspection.sampleRate).toBe(48_000);
    expect(inspection.channels).toBe(1);
    expect(Number.isFinite(inspection.measuredLufs)).toBe(true);
    expect(Number.isFinite(inspection.truePeakDbtp)).toBe(true);
    expect(inspection.clippingRisk).toBe(false);
  });

  it('fails loud on acoustically silent provider audio', async () => {
    await expect(
      inspectEncodedMusicAudio(buildMonoWav({
        durationSeconds: 1,
        amplitude: 0,
      })),
    ).rejects.toMatchObject({
      code: 'AUDIO_SILENT',
    });
  });
});

function buildMonoWav(input: {
  durationSeconds: number;
  amplitude: number;
  sampleRate?: number;
}): Buffer {
  const sampleRate = input.sampleRate ?? 48_000;
  const samples = Math.round(input.durationSeconds * sampleRate);
  const dataBytes = samples * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < samples; index += 1) {
    const value = Math.sin((2 * Math.PI * 440 * index) / sampleRate) * input.amplitude;
    buffer.writeInt16LE(Math.round(value * 32_767), 44 + index * 2);
  }
  return buffer;
}
