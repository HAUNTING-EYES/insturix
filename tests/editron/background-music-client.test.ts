import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import {
  assignBackgroundMusicAsset,
  BackgroundMusicAssignmentClientError,
  createBackgroundMusicIdempotencyKey,
  ingestAndAssignMusicCatalogTrack,
  MUSIC_RIGHTS_ATTESTATION_VERSION,
  searchMusicCatalog,
} from '@/components/editron/editor/version-7.0.0/utils/background-music-assignment';
import type { MusicCatalogTrack } from '@/lib/editron/music-catalog/types';

const timelineSources = [
  readFileSync(
    new URL(
      '../../components/editron/editor/version-7.0.0/components/timeline/timeline-grid.tsx',
      import.meta.url,
    ),
    'utf8',
  ),
  readFileSync(
    new URL(
      '../../components/editron/editor/version-7.0.0/v2/timeline/v2-timeline-grid.tsx',
      import.meta.url,
    ),
    'utf8',
  ),
];

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const catalogTrack: MusicCatalogTrack = {
  provider: 'epidemic-sound',
  providerTrackId: 'track_licensed_1',
  title: 'Focused Future',
  artists: ['Example Artist'],
  featuredArtists: [],
  durationMs: 183_000,
  bpm: 110,
  moods: [{ id: 'focused', name: 'Focused' }],
  genres: [{ id: 'electronic', name: 'Electronic' }],
  vocalType: 'none',
  hasVocals: false,
  explicit: false,
  providerTier: 'paid',
  catalogAvailability: 'download-candidate',
  rightsStatus: 'unverified',
  renderEligibility: 'requires-entitlement-and-ingest',
};

describe('background music client contract', () => {
  it('creates endpoint-valid idempotency keys and rejects unsafe fragments', () => {
    expect(createBackgroundMusicIdempotencyKey(
      () => '123e4567-e89b-12d3-a456-426614174000',
    )).toBe('bgm_123e4567-e89b-12d3-a456-426614174000');

    expect(() => createBackgroundMusicIdempotencyKey(() => 'bad value'))
      .toThrowError(expect.objectContaining({ code: 'IDEMPOTENCY_UNAVAILABLE' }));
    expect(() => createBackgroundMusicIdempotencyKey(() => {
      throw new Error('entropy unavailable');
    })).toThrowError(expect.objectContaining({ code: 'IDEMPOTENCY_UNAVAILABLE' }));
  });

  it('posts only the asset contract and returns the complete committed timeline', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      success: true,
      replayed: false,
      sourceAssetId: 'audio_1',
      derivativeAssetId: 'bgm_assignment_1',
      overlays: [
        { id: 1, type: 'video', row: 2 },
        { id: 2, type: 'sound', row: 1, assetId: 'bgm_assignment_1' },
      ],
      snappedCutCount: 2,
    })) as unknown as typeof fetch;

    const result = await assignBackgroundMusicAsset({
      projectId: 'project/with space',
      assetId: ' audio_1 ',
      idempotencyKey: 'bgm_request_001',
      fetchImpl,
    });

    expect(result).toMatchObject({
      derivativeAssetId: 'bgm_assignment_1',
      snappedCutCount: 2,
      overlays: [
        { id: 1, type: 'video', row: 2 },
        { id: 2, type: 'sound', row: 1 },
      ],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0];
    expect(url).toBe(
      '/api/services/editron/projects/project%2Fwith%20space/background-music',
    );
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      assetId: 'audio_1',
      idempotencyKey: 'bgm_request_001',
      rightsAttestation: {
        accepted: true,
        version: MUSIC_RIGHTS_ATTESTATION_VERSION,
      },
    });
    expect(JSON.parse(init?.body as string)).not.toHaveProperty('userId');
    expect(JSON.parse(init?.body as string)).not.toHaveProperty('projectId');
  });

  it('searches, ingests, then assigns catalog music without fabricating upload consent', async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.startsWith('/api/services/editron/music-catalog/search?')) {
        return jsonResponse({
          success: true,
          provider: 'epidemic-sound',
          tracks: [catalogTrack],
          recommendation: {
            providerTrackId: catalogTrack.providerTrackId,
            query: 'focused technology',
            evidenceSources: ['project.editorialPreferences.musicPrompt'],
            requiresExplicitUse: true,
          },
        });
      }
      if (url.endsWith('/music-catalog/ingest')) {
        return jsonResponse({
          success: true,
          assetId: 'library_audio_1',
          provider: 'epidemic-sound',
          providerTrackId: catalogTrack.providerTrackId,
          title: catalogTrack.title,
          durationMs: catalogTrack.durationMs,
          licenseId: 'license_1',
          rightsStatus: 'licensed',
          renderEligibility: 'requires-audio-assignment-conditioning',
          idempotentReplay: false,
        });
      }
      if (url.endsWith('/background-music')) {
        return jsonResponse({
          success: true,
          replayed: false,
          sourceAssetId: 'library_audio_1',
          derivativeAssetId: 'conditioned_audio_1',
          overlays: [{ id: 8, type: 'sound', row: 1, assetId: 'conditioned_audio_1' }],
          snappedCutCount: 3,
        });
      }
      return jsonResponse({ success: false, code: 'UNEXPECTED_URL' }, 500);
    }) as unknown as typeof fetch;

    const discovery = await searchMusicCatalog({
      mode: 'recommend',
      projectId: 'proj_1',
      limit: 6,
      fetchImpl,
    });
    const result = await ingestAndAssignMusicCatalogTrack({
      projectId: 'proj_1',
      track: discovery.tracks[0],
      idempotencyKey: 'bgm_catalog_001',
      fetchImpl,
    });

    expect(discovery.recommendation).toMatchObject({
      providerTrackId: catalogTrack.providerTrackId,
      requiresExplicitUse: true,
    });
    expect(result).toMatchObject({
      ingestedAssetId: 'library_audio_1',
      licenseId: 'license_1',
      assignment: {
        derivativeAssetId: 'conditioned_audio_1',
        snappedCutCount: 3,
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    const [searchUrl] = vi.mocked(fetchImpl).mock.calls[0];
    expect(String(searchUrl)).toContain('mode=recommend');
    expect(String(searchUrl)).toContain('projectId=proj_1');

    const [ingestUrl, ingestInit] = vi.mocked(fetchImpl).mock.calls[1];
    expect(ingestUrl).toBe(
      '/api/services/editron/projects/proj_1/music-catalog/ingest',
    );
    expect(JSON.parse(ingestInit?.body as string)).toEqual({
      provider: 'epidemic-sound',
      providerTrackId: catalogTrack.providerTrackId,
      idempotencyKey: 'bgm_catalog_001',
    });

    const [assignmentUrl, assignmentInit] = vi.mocked(fetchImpl).mock.calls[2];
    expect(assignmentUrl).toBe(
      '/api/services/editron/projects/proj_1/background-music',
    );
    expect(JSON.parse(assignmentInit?.body as string)).toEqual({
      assetId: 'library_audio_1',
      idempotencyKey: 'bgm_catalog_001',
    });
    expect(JSON.parse(assignmentInit?.body as string)).not.toHaveProperty(
      'rightsAttestation',
    );
  });

  it('never assigns a catalog response that lacks a licensed ingest receipt', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      success: true,
      assetId: 'library_audio_1',
      providerTrackId: catalogTrack.providerTrackId,
      licenseId: 'license_1',
      rightsStatus: 'unverified',
      renderEligibility: 'requires-audio-assignment-conditioning',
    })) as unknown as typeof fetch;

    await expect(ingestAndAssignMusicCatalogTrack({
      projectId: 'proj_1',
      track: catalogTrack,
      idempotencyKey: 'bgm_catalog_001',
      fetchImpl,
    })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('preserves typed server failures for actionable consent and conflict states', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      success: false,
      code: 'PROJECT_CONFLICT',
      error: 'The project changed while music was being prepared',
    }, 409)) as unknown as typeof fetch;

    await expect(assignBackgroundMusicAsset({
      projectId: 'project_1',
      assetId: 'audio_1',
      idempotencyKey: 'bgm_request_001',
      fetchImpl,
    })).rejects.toEqual(expect.objectContaining({
      name: 'BackgroundMusicAssignmentClientError',
      code: 'PROJECT_CONFLICT',
      httpStatus: 409,
      message: 'The project changed while music was being prepared',
    }));
  });

  it('rejects malformed success payloads instead of fabricating local overlays', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      success: true,
      sourceAssetId: 'audio_1',
      derivativeAssetId: 'bgm_assignment_1',
    })) as unknown as typeof fetch;

    await expect(assignBackgroundMusicAsset({
      projectId: 'project_1',
      assetId: 'audio_1',
      idempotencyKey: 'bgm_request_001',
      fetchImpl,
    })).rejects.toEqual(expect.objectContaining({ code: 'INVALID_RESPONSE' }));
  });

  it('names network failures and rejects incomplete requests before fetch', async () => {
    const networkFetch = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    await expect(assignBackgroundMusicAsset({
      projectId: 'project_1',
      assetId: 'audio_1',
      idempotencyKey: 'bgm_request_001',
      fetchImpl: networkFetch,
    })).rejects.toEqual(expect.objectContaining({ code: 'NETWORK_ERROR' }));

    const abortError = new Error('cancelled');
    abortError.name = 'AbortError';
    const abortedFetch = vi.fn(async () => {
      throw abortError;
    }) as unknown as typeof fetch;
    await expect(assignBackgroundMusicAsset({
      projectId: 'project_1',
      assetId: 'audio_1',
      idempotencyKey: 'bgm_request_001',
      fetchImpl: abortedFetch,
    })).rejects.toEqual(expect.objectContaining({ code: 'REQUEST_ABORTED' }));

    const unusedFetch = vi.fn() as unknown as typeof fetch;
    await expect(assignBackgroundMusicAsset({
      projectId: '',
      assetId: 'audio_1',
      idempotencyKey: 'bgm_request_001',
      fetchImpl: unusedFetch,
    })).rejects.toBeInstanceOf(BackgroundMusicAssignmentClientError);
    expect(unusedFetch).not.toHaveBeenCalled();
  });

  it('routes BGM-row audio through consent in both editors without a local overlay fallback', () => {
    for (const source of timelineSources) {
      const guardStart = source.indexOf(
        "asset.type === 'audio' && targetRow === ROW.BGM",
      );
      const genericOverlayStart = source.indexOf('let newOverlay', guardStart);
      expect(guardStart).toBeGreaterThan(-1);
      expect(genericOverlayStart).toBeGreaterThan(guardStart);

      const guardedBranch = source.slice(guardStart, genericOverlayStart);
      expect(guardedBranch).toContain('requestBackgroundMusicAssignment');
      expect(guardedBranch).toContain('return;');
      expect(guardedBranch).not.toContain('addOverlay');
      expect(source).toContain(
        '<BackgroundMusicAssignmentDialog controller={backgroundMusicAssignment} />',
      );
    }
  });
});
