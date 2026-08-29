import { describe, expect, it, vi } from 'vitest';

import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';

const mocks = vi.hoisted(() => ({
  resolveBinding: vi.fn(),
}));

vi.mock('@/lib/editron/services/video-source-time-transform-v1', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/editron/services/video-source-time-transform-v1')
  >();
  return {
    ...actual,
    resolveVerifiedVideoSourceEpochTimeBindingV3: mocks.resolveBinding,
  };
});

import {
  admitNativeMediaFinalRenderV1,
  readNativeMediaFinalRenderProjectRevisionV1,
} from '@/lib/editron/services/native-media-final-render-admission-v1';
import {
  classifyMediaSourceTimestampManagementV1,
} from '@/lib/editron/services/media-source-timestamp-management-v1';

const revision = Object.freeze({
  schemaVersion: 1 as const,
  value: 7,
  compatibilityUpdatedAt: '2026-08-29T00:00:00.000Z',
});

describe('native media final-render admission V1', () => {
  it('derives the exact ProjectService-compatible revision from the loaded snapshot', () => {
    expect(readNativeMediaFinalRenderProjectRevisionV1({
      projectRevision: 7,
      updatedAt: new Date('2026-08-29T00:00:00.000Z'),
    })).toEqual(revision);
    expect(readNativeMediaFinalRenderProjectRevisionV1({
      updatedAt: '2026-08-29T00:00:00.000Z',
    })).toEqual({ ...revision, value: 0 });
    expect(() => readNativeMediaFinalRenderProjectRevisionV1({
      projectRevision: 7,
      updatedAt: 'not-a-date',
    })).toThrow('NATIVE_MEDIA_RENDER_PROJECT_REVISION_INVALID');
  });

  it('classifies absent, earlier, V3, and contradictory timestamp generations', () => {
    expect(classifyMediaSourceTimestampManagementV1({})).toBe('NONE');
    expect(classifyMediaSourceTimestampManagementV1({
      sourcePtsCadenceMapStateSha256V1: 'a'.repeat(64),
    })).toBe('EARLIER');
    expect(classifyMediaSourceTimestampManagementV1({
      sourcePtsCadenceMapStateSha256V3: 'b'.repeat(64),
    })).toBe('V3');
    expect(classifyMediaSourceTimestampManagementV1({
      sourcePtsCadenceMapV2: {},
      sourcePtsCadenceMapV3: {},
    })).toBe('CONFLICTING');
  });

  it('admits only stable ordinary assets under a deterministic revision-bound receipt', async () => {
    const load = vi.fn(async () => ordinaryAsset());

    const first = await admitNativeMediaFinalRenderV1({
      userId: 'user_1',
      projectId: 'project_1',
      sequenceId: 'main',
      projectRevision: revision,
      overlays: [videoOverlay()],
      assetReader: { load },
    });
    const second = await admitNativeMediaFinalRenderV1({
      userId: 'user_1',
      projectId: 'project_1',
      sequenceId: 'main',
      projectRevision: revision,
      overlays: [videoOverlay()],
      assetReader: { load: async () => ordinaryAsset() },
    });

    expect(first).toMatchObject({
      disposition: 'ADMITTED_ORDINARY_MEDIA',
      receipt: {
        projectId: 'project_1',
        sequenceId: 'main',
        projectRevision: revision,
        videoOverlays: [{
          overlayId: 'video_1',
          assetId: 'asset_1',
          decision: 'ORDINARY_FRAME_RATE_RENDER_PATH',
        }],
      },
    });
    expect(second).toEqual(first);
    expect(load).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenNthCalledWith(1, 'asset_1', 'user_1');
    expect(load).toHaveBeenNthCalledWith(2, 'asset_1', 'user_1');
  });

  it('admits a project with no native video without touching the asset store', async () => {
    const load = vi.fn();
    const result = await admitNativeMediaFinalRenderV1({
      userId: 'user_1',
      projectId: 'project_1',
      sequenceId: 'main',
      projectRevision: revision,
      overlays: [],
      assetReader: { load },
    });

    expect(result).toMatchObject({
      disposition: 'ADMITTED_ORDINARY_MEDIA',
      receipt: { videoOverlays: [] },
    });
    expect(load).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'an asset-less video',
      overlays: [{ ...videoOverlay(), assetId: undefined }],
      asset: ordinaryAsset(),
      reason: 'VIDEO_ASSET_ID_REQUIRED',
    },
    {
      name: 'duplicate overlay identities',
      overlays: [videoOverlay(), { ...videoOverlay(), assetId: 'asset_2' }],
      asset: ordinaryAsset(),
      reason: 'VIDEO_OVERLAY_ID_DUPLICATE',
    },
    {
      name: 'a legacy PTS generation',
      overlays: [videoOverlay()],
      asset: { ...ordinaryAsset(), sourcePtsCadenceMapStateSha256V2: 'a'.repeat(64) },
      reason: 'LEGACY_TIMESTAMP_MIGRATION_REQUIRED',
    },
    {
      name: 'contradictory timestamp generations',
      overlays: [videoOverlay()],
      asset: {
        ...ordinaryAsset(),
        sourcePtsCadenceMapV1: {},
        sourcePtsCadenceMapV3: {},
      },
      reason: 'TIMESTAMP_GENERATIONS_CONFLICT',
    },
  ])('blocks $name without an ordinary admission receipt', async ({ overlays, asset, reason }) => {
    const result = await admitNativeMediaFinalRenderV1({
      userId: 'user_1',
      projectId: 'project_1',
      sequenceId: 'main',
      projectRevision: revision,
      overlays: overlays as Overlay[],
      assetReader: { load: async () => asset as never },
    });

    expect(result).toMatchObject({ disposition: 'UNVERIFIABLE', reason });
    expect(result).not.toHaveProperty('receipt');
  });

  it('requires a dedicated exact render source for valid V3 media', async () => {
    mocks.resolveBinding.mockReturnValueOnce({ assetId: 'asset_1' });
    const result = await admitNativeMediaFinalRenderV1({
      userId: 'user_1',
      projectId: 'project_1',
      sequenceId: 'main',
      projectRevision: revision,
      overlays: [videoOverlay()],
      assetReader: {
        load: async () => ({
          ...ordinaryAsset(),
          sourcePtsCadenceMapV3: {},
          sourcePtsCadenceMapStateSha256V3: 'b'.repeat(64),
        }) as never,
      },
    });

    expect(result).toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'EXACT_TIMESTAMP_RENDER_SOURCE_REQUIRED',
      overlayId: 'video_1',
      assetId: 'asset_1',
      diagnostic: null,
    });
  });

  it('separates invalid V3 evidence from a missing exact render source', async () => {
    mocks.resolveBinding.mockImplementationOnce(() => {
      throw new Error('VIDEO_SOURCE_V3_BINDING_HASH_MISMATCH');
    });
    const result = await admitNativeMediaFinalRenderV1({
      userId: 'user_1',
      projectId: 'project_1',
      sequenceId: 'main',
      projectRevision: revision,
      overlays: [videoOverlay()],
      assetReader: {
        load: async () => ({
          ...ordinaryAsset(),
          sourcePtsCadenceMapV3: {},
        }) as never,
      },
    });

    expect(result).toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'V3_TIMESTAMP_STATE_INVALID',
      diagnostic: 'VIDEO_SOURCE_V3_BINDING_HASH_MISMATCH',
    });
  });

  it('rejects a timing-state change between classification and admission', async () => {
    const load = vi.fn()
      .mockResolvedValueOnce(ordinaryAsset())
      .mockResolvedValueOnce({
        ...ordinaryAsset(),
        sourcePtsCadenceMapStateSha256V3: 'c'.repeat(64),
      });
    const result = await admitNativeMediaFinalRenderV1({
      userId: 'user_1',
      projectId: 'project_1',
      sequenceId: 'main',
      projectRevision: revision,
      overlays: [videoOverlay()],
      assetReader: { load },
    });

    expect(result).toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'ASSET_CHANGED_DURING_ADMISSION',
      assetId: 'asset_1',
    });
  });

  it('rejects invalid revision and missing assets before any render authority exists', async () => {
    const invalid = await admitNativeMediaFinalRenderV1({
      userId: 'user_1',
      projectId: 'project_1',
      sequenceId: 'main',
      projectRevision: { ...revision, value: -1 },
      overlays: [videoOverlay()],
      assetReader: { load: async () => ordinaryAsset() },
    });
    const missing = await admitNativeMediaFinalRenderV1({
      userId: 'user_1',
      projectId: 'project_1',
      sequenceId: 'main',
      projectRevision: revision,
      overlays: [videoOverlay()],
      assetReader: { load: async () => null },
    });

    expect(invalid).toMatchObject({ disposition: 'UNVERIFIABLE', reason: 'INPUT_INVALID' });
    expect(missing).toMatchObject({ disposition: 'UNVERIFIABLE', reason: 'ASSET_UNAVAILABLE' });
  });
});

function videoOverlay(): Overlay {
  return {
    id: 'video_1',
    type: 'video',
    from: 0,
    durationInFrames: 90,
    assetId: 'asset_1',
    src: '/api/assets/asset_1',
    sourceStartFrame: 30,
    sourceEndFrame: 120,
  } as unknown as Overlay;
}

function ordinaryAsset() {
  return {
    assetId: 'asset_1',
    type: 'video' as const,
    sourceVersionV1: {
      sourceVersionSha256: 'd'.repeat(64),
      storageVersion: { storageVersionSha256: 'e'.repeat(64) },
    },
  };
}
