import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { OverlayType } from '@/components/editron/editor/version-7.0.0/types';
import {
  assertNativeMediaTimestampPreviewWindowV2,
  type NativeMediaTimestampPreviewWindowV2,
} from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-window-v2';
import type { MediaSourcePtsCadenceMapAssetStateInputV3 } from '@/lib/editron/services/media-source-pts-cadence-map-asset-owner-v3';
import {
  materializeNativeMediaTimestampPreviewWindowV1,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZER_DEFAULT_POLICY_V1,
  type NativeMediaTimestampPreviewMaterializerPortsV1,
} from '@/lib/editron/services/native-media-timestamp-preview-materializer-v1';
import {
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_KIND_V2,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V1,
  parseNativeMediaTimestampPreviewMaterializeCommandV2,
  parseNativeMediaTimestampPreviewReleaseCommandV1,
  releaseNativeMediaTimestampPreviewWindowV1,
} from '@/lib/editron/services/native-media-timestamp-preview-session-server-v1';
import type { NativeMediaTimestampPreviewSurfaceBindingV1 } from '@/lib/editron/services/native-media-timestamp-r2-preview-surface-v1';
import type { Project } from '@/lib/editron/services/project-service';

describe('native media timestamp preview session server V1', () => {
  it('parses exact materialize and release commands', () => {
    expect(parseNativeMediaTimestampPreviewMaterializeCommandV2({
      schemaVersion: 2,
      kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_KIND_V2,
      projectId: 'project-1',
      sequenceId: 'main',
      overlayId: '42',
      expectedProjectRevision: revision(),
      windowLocalStartFrame: 120,
      windowDurationInFrames: 120,
    }, 'user-1')).toEqual({
      userId: 'user-1',
      projectId: 'project-1',
      sequenceId: 'main',
      overlayId: '42',
      expectedProjectRevision: revision(),
      windowLocalStartFrame: 120,
      windowDurationInFrames: 120,
    });
    expect(() => parseNativeMediaTimestampPreviewMaterializeCommandV2({
      schemaVersion: 2,
      kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_KIND_V2,
      projectId: 'project-1',
      sequenceId: 'main',
      overlayId: '42',
      windowLocalStartFrame: 0,
      windowDurationInFrames: 120,
      ignored: true,
    }, 'user-1')).toThrow('NATIVE_MEDIA_PREVIEW_MATERIALIZE_COMMAND_V2_INVALID');

    expect(() => parseNativeMediaTimestampPreviewMaterializeCommandV2({
      schemaVersion: 1,
      kind: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZE_COMMAND_V1',
      projectId: 'project-1',
      sequenceId: 'main',
      overlayId: '42',
      windowLocalStartFrame: 120,
      windowDurationInFrames: 120,
    }, 'user-1')).toThrow('NATIVE_MEDIA_PREVIEW_MATERIALIZE_COMMAND_V2_INVALID');

    const window = previewWindow();
    expect(parseNativeMediaTimestampPreviewReleaseCommandV1({
      schemaVersion: 1,
      kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_RELEASE_COMMAND_KIND_V1,
      window,
    }).window).toEqual(window);
  });

  it('distinguishes ordinary assets from legacy timing state that requires migration', async () => {
    const ordinaryAsset: MediaSourcePtsCadenceMapAssetStateInputV3 = {
      assetId: 'asset-1', type: 'video',
    };
    await expect(materializeNativeMediaTimestampPreviewWindowV1(
      materializerInput(revision()), materializerPorts(ordinaryAsset),
    )).resolves.toEqual({
      disposition: 'NOT_APPLICABLE',
      reason: 'ASSET_NOT_TIMESTAMP_MANAGED',
      projectRevision: revision(),
    });
    await expect(materializeNativeMediaTimestampPreviewWindowV1(
      materializerInput(),
      materializerPorts({
        ...ordinaryAsset,
        sourcePtsCadenceMapV2: {},
        sourcePtsCadenceMapStateSha256V2: 'a'.repeat(64),
      }),
    )).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE', reason: 'LEGACY_TIME_MAP_MIGRATION_REQUIRED',
    });
  });

  it('rejects a stale expected project revision before reading the asset', async () => {
    const ports = materializerPorts({ assetId: 'asset-1', type: 'video' });
    await expect(materializeNativeMediaTimestampPreviewWindowV1(
      materializerInput({ ...revision(), value: 0 }),
      ports,
    )).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE', reason: 'PROJECT_REVISION_STALE',
    });
    expect(ports.assetReader.load).not.toHaveBeenCalled();
  });

  it('preflights every binding before deleting and treats missing pictures idempotently', async () => {
    const window = previewWindow();
    const reader = {
      readPicture: vi.fn(async (handle: string) => handle === window.frames[1]!.pictureHandle
        ? { disposition: 'NOT_FOUND' as const, pictureHandle: handle }
        : {
            disposition: 'AVAILABLE' as const,
            binding: surfaceBinding(window, 0),
            pngBytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
          }),
    };
    const deletePicture = vi.fn(async () => undefined);

    await expect(releaseNativeMediaTimestampPreviewWindowV1(
      { userId: 'user-1', window },
      { reader, deleter: { deletePicture } },
    )).resolves.toEqual({
      disposition: 'RELEASED', deletedPictureCount: 1, alreadyAbsentPictureCount: 1,
    });
    expect(deletePicture).toHaveBeenCalledWith(window.frames[0]!.pictureHandle);

    reader.readPicture.mockImplementation(async (handle: string) => ({
      disposition: 'AVAILABLE' as const,
      binding: { ...surfaceBinding(window, handle === window.frames[0]!.pictureHandle ? 0 : 1),
        userId: 'another-user' },
      pngBytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    }));
    deletePicture.mockClear();
    await expect(releaseNativeMediaTimestampPreviewWindowV1(
      { userId: 'user-1', window },
      { reader, deleter: { deletePicture } },
    )).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE', reason: 'SURFACE_SCOPE_MISMATCH',
    });
    expect(deletePicture).not.toHaveBeenCalled();
  });

  it('reports partial provider deletion without claiming release', async () => {
    const window = previewWindow();
    const reader = {
      readPicture: vi.fn(async (handle: string) => ({
        disposition: 'AVAILABLE' as const,
        binding: surfaceBinding(window, handle === window.frames[0]!.pictureHandle ? 0 : 1),
        pngBytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      })),
    };
    const deletePicture = vi.fn(async (handle: string) => {
      if (handle === window.frames[1]!.pictureHandle) throw new Error('PROVIDER_FAILED');
    });
    await expect(releaseNativeMediaTimestampPreviewWindowV1(
      { userId: 'user-1', window },
      { reader, deleter: { deletePicture } },
    )).resolves.toEqual({
      disposition: 'UNVERIFIABLE', reason: 'RELEASE_INCOMPLETE', failedPictureCount: 1,
    });
  });
});

function materializerInput(expectedProjectRevision?: ReturnType<typeof revision>) {
  return {
    userId: 'user-1', projectId: 'project-1', sequenceId: 'main', overlayId: '42',
    ...(expectedProjectRevision ? { expectedProjectRevision } : {}),
    windowLocalStartFrame: 0, windowDurationInFrames: 2,
  } as const;
}

function materializerPorts(
  asset: MediaSourcePtsCadenceMapAssetStateInputV3,
): NativeMediaTimestampPreviewMaterializerPortsV1 {
  const currentRevision = revision();
  return {
    projectSnapshotReader: {
      loadProjectForMutation: vi.fn(async () => ({
        project: projectFixture(), revision: currentRevision,
      })),
    },
    projectRevisionReader: { getProjectRevision: vi.fn(async () => currentRevision) },
    assetReader: { load: vi.fn(async () => asset) },
    storedObjectReader: { read: vi.fn(async () => { throw new Error('UNEXPECTED_READ'); }) },
    createDecoder: vi.fn(() => { throw new Error('UNEXPECTED_DECODE'); }),
    policy: NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZER_DEFAULT_POLICY_V1,
    now: () => 1_000,
  };
}

function revision() {
  return {
    schemaVersion: 1 as const,
    value: 1,
    compatibilityUpdatedAt: '2026-08-29T00:00:00.000Z',
  };
}

function projectFixture(): Project {
  return {
    projectId: 'project-1', userId: 'user-1', name: 'Session fixture',
    overlays: [{
      id: 42, type: OverlayType.VIDEO, content: 'video', assetId: 'asset-1',
      from: 0, durationInFrames: 2, sourceStartFrame: 0, sourceEndFrame: 2,
      width: 1920, height: 1080, left: 0, top: 0, row: 0, rotation: 0,
      isDragging: false, styles: {},
    }],
    aspectRatio: '16:9', playerDimensions: { width: 1920, height: 1080 }, fps: 30,
    durationInFrames: 2, createdAt: new Date(0), updatedAt: new Date(0),
    projectRevision: 1, visibility: 'private',
  };
}

function previewWindow(): NativeMediaTimestampPreviewWindowV2 {
  return assertNativeMediaTimestampPreviewWindowV2({
    schemaVersion: 2,
    kind: 'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_WINDOW_V2',
    receiptSha256: 'a'.repeat(64), decoderRequestSha256: 'b'.repeat(64),
    projectId: 'project-1', sequenceId: 'main', overlayId: '42',
    projectRevision: {
      schemaVersion: 1, value: 1, compatibilityUpdatedAt: '2026-08-29T00:00:00.000Z',
    },
    overlayFromFrame: 0, overlayDurationInFrames: 2,
    windowLocalStartFrame: 0, windowDurationInFrames: 2,
    lease: {
      leaseId: `nmpwl2_${'0'.repeat(64)}`,
      issuedAtEpochMs: 1_000, renewAfterEpochMs: 2_000, expiresAtEpochMs: 3_000,
    },
    audioOwnership: {
      disposition: 'NO_AUDIO_MAPPING_REQUESTED', audioMappingSha256: null,
      decoderMaySupplyOrReplaceAudio: false,
    },
    frames: [0, 1].map((localFrame) => ({
      localFrame, projectFrame: localFrame,
      pictureHandle: `nmpv1_${String(localFrame + 1).repeat(64)}`,
      decoderPictureRequestSha256: String(localFrame + 3).repeat(64),
      decodedPictureContentSha256: String(localFrame + 5).repeat(64),
    })),
  });
}

function surfaceBinding(
  window: NativeMediaTimestampPreviewWindowV2,
  frameIndex: number,
): NativeMediaTimestampPreviewSurfaceBindingV1 {
  const frame = window.frames[frameIndex]!;
  return {
    schemaVersion: 1, storage: 'R2_PRIVATE', pictureHandle: frame.pictureHandle,
    userId: 'user-1', projectId: window.projectId, projectRevision: window.projectRevision,
    sequenceIdSha256: digest(window.sequenceId), overlayIdSha256: digest(window.overlayId),
    decoderRequestSha256: window.decoderRequestSha256,
    decoderPictureRequestSha256: frame.decoderPictureRequestSha256,
    sourceVersionSha256: '7'.repeat(64), storageVersionSha256: '8'.repeat(64),
    decodedPictureContentSha256: frame.decodedPictureContentSha256,
    pngContentSha256: '9'.repeat(64), pngByteLength: 8, width: 1920, height: 1080,
    expiresAtEpochMs: window.lease.expiresAtEpochMs,
  };
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
