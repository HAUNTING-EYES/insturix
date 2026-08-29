import { describe, expect, it, vi } from 'vitest';

import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';
import {
  createNativeMediaFinalRenderArtifactV1,
  createNativeMediaFinalRenderSourceLeaseV1,
  prepareNativeMediaFinalRenderSourcesV1,
  type NativeMediaFinalRenderExactSourceRequestV1,
  type NativeMediaFinalRenderSourceMaterializerPortV1,
} from '@/lib/editron/services/native-media-final-render-source-preparation-v1';
import type { ProjectRevisionV1 } from '@/lib/editron/services/project-service';

const HASH = {
  overlay: '1'.repeat(64),
  asset: '2'.repeat(64),
  source: '3'.repeat(64),
  storage: '4'.repeat(64),
  binding: '5'.repeat(64),
  pts: '6'.repeat(64),
  transform: '7'.repeat(64),
  frames: '8'.repeat(64),
  compatibility: '9'.repeat(64),
  content: 'a'.repeat(64),
  audioMapping: 'b'.repeat(64),
  sourcePcm: 'c'.repeat(64),
  artifactPcm: 'd'.repeat(64),
  equivalence: 'e'.repeat(64),
};

const revision = Object.freeze({
  schemaVersion: 1 as const,
  value: 12,
  compatibilityUpdatedAt: '2026-08-29T00:00:00.000Z',
});

function video(overrides: Partial<Record<string, unknown>> = {}): Overlay {
  return {
    id: 41,
    type: 'video',
    content: 'https://media.example/original.mov',
    src: 'https://media.example/original.mov',
    assetId: 'asset-1',
    from: 90,
    durationInFrames: 60,
    row: 0,
    left: 0,
    top: 0,
    width: 1920,
    height: 1080,
    rotation: 0,
    isDragging: false,
    styles: { objectFit: 'cover', volume: 0.75 },
    sourceStartFrame: 120,
    sourceEndFrame: 180,
    speed: 1,
    hasNativeAudio: true,
    keyframeTracks: [{ property: 'speed', keyframes: [] }],
    ...overrides,
  } as Overlay;
}

function request(overrides: Partial<NativeMediaFinalRenderExactSourceRequestV1> = {}) {
  return Object.freeze({
    overlayId: '41',
    assetId: 'asset-1',
    overlayTimingSha256: HASH.overlay,
    assetTimingStateSha256: HASH.asset,
    sourceVersionSha256: HASH.source,
    storageVersionSha256: HASH.storage,
    sourceBindingSha256: HASH.binding,
    sourcePtsCadenceMapStateSha256V3: HASH.pts,
    renderNativeAudio: true,
    ...overrides,
  });
}

function artifact(
  exactRequest = request(),
  overrides: Partial<Parameters<typeof createNativeMediaFinalRenderArtifactV1>[0]> = {},
) {
  return createNativeMediaFinalRenderArtifactV1({
    schemaVersion: 1,
    kind: 'EDITRON_NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_V1',
    artifactHandle: 'artifact-1',
    projectId: 'project-1',
    sequenceId: 'main',
    projectRevision: revision,
    overlayId: exactRequest.overlayId,
    assetId: exactRequest.assetId,
    overlayTimingSha256: exactRequest.overlayTimingSha256,
    assetTimingStateSha256: exactRequest.assetTimingStateSha256,
    sourceVersionSha256: exactRequest.sourceVersionSha256,
    storageVersionSha256: exactRequest.storageVersionSha256,
    sourceBindingSha256: exactRequest.sourceBindingSha256,
    sourcePtsCadenceMapStateSha256V3: exactRequest.sourcePtsCadenceMapStateSha256V3,
    transformSha256: HASH.transform,
    projectRate: { numerator: '30', denominator: '1' },
    timelineStartFrame: '90',
    timelineFrameCount: '60',
    artifactProfile: 'EDITRON_EXACT_TIMESTAMP_AV_MEZZANINE_V1',
    container: 'mov',
    videoCodec: 'prores_ks',
    pixelFormat: 'yuv422p10le',
    videoFrameCount: '60',
    decodedFrameSequenceSha256: HASH.frames,
    remotionCompatibilityReceiptSha256: HASH.compatibility,
    audio: exactRequest.renderNativeAudio
      ? {
          disposition: 'EMBEDDED_EXACT_NATIVE_PCM',
          audioCodec: 'pcm_s32le',
          audioMappingSha256: HASH.audioMapping,
          sourceDecodedPcmSha256: HASH.sourcePcm,
          artifactDecodedPcmSha256: HASH.artifactPcm,
          decodedPcmEquivalenceReceiptSha256: HASH.equivalence,
          sampleRate: '48000',
          channelCount: 2,
          decodedSampleFrameCount: '96000',
        }
      : {
          disposition: 'NO_AUDIO_MAPPING_REQUESTED',
          audioCodec: null,
          audioMappingSha256: null,
          sourceDecodedPcmSha256: null,
          artifactDecodedPcmSha256: null,
          decodedPcmEquivalenceReceiptSha256: null,
          sampleRate: null,
          channelCount: null,
          decodedSampleFrameCount: null,
        },
    contentType: 'video/quicktime',
    artifactContentSha256: HASH.content,
    artifactByteLength: '123456',
    ...overrides,
  });
}

function lease(exactRequest = request(), overrides: Partial<{
  issuedAtEpochMs: number;
  expiresAtEpochMs: number;
  sourceUrl: string;
}> = {}) {
  return createNativeMediaFinalRenderSourceLeaseV1({
    leaseId: 'lease-1',
    artifact: artifact(exactRequest),
    sourceUrl: overrides.sourceUrl ?? 'https://private.example/artifact.mov?signature=secret',
    issuedAtEpochMs: overrides.issuedAtEpochMs ?? 1_000_000,
    expiresAtEpochMs: overrides.expiresAtEpochMs ?? 1_600_000,
  });
}

function ports(
  exactRequest = request(),
  materializedLease = lease(exactRequest),
) {
  const materializer: NativeMediaFinalRenderSourceMaterializerPortV1 = {
    materialize: vi.fn(async () => ({
      disposition: 'SOURCE_MATERIALIZED' as const,
      lease: materializedLease,
    })),
  };
  const readTimingStateSha256 = vi.fn(async (
    _userId: string,
    _assetId: string,
  ): Promise<string | null> => exactRequest.assetTimingStateSha256);
  const getProjectRevision = vi.fn(async (
    _userId: string,
    _projectId: string,
  ): Promise<ProjectRevisionV1> => revision);
  return {
    materializer,
    assetStateReader: { readTimingStateSha256 },
    projectRevisionReader: { getProjectRevision },
  };
}

function prepare(overrides: Partial<Parameters<typeof prepareNativeMediaFinalRenderSourcesV1>[0]> = {}) {
  const exactRequest = request();
  const defaults = ports(exactRequest);
  return prepareNativeMediaFinalRenderSourcesV1({
    userId: 'user-1',
    projectId: 'project-1',
    sequenceId: 'main',
    projectRevision: revision,
    overlays: [video()],
    exactRequests: [exactRequest],
    minimumRemainingLeaseMs: 300_000,
    materializer: defaults.materializer,
    assetStateReader: defaults.assetStateReader,
    projectRevisionReader: defaults.projectRevisionReader,
    now: () => 1_000_000,
    ...overrides,
  });
}

describe('native media final-render source preparation v1', () => {
  it('rewrites an exact overlay to a one-frame-per-project-frame leased artifact', async () => {
    const result = await prepare();

    expect(result.disposition).toBe('SOURCES_PREPARED');
    if (result.disposition !== 'SOURCES_PREPARED') return;
    const rewritten = result.overlays[0] as Overlay & {
      nativeMediaFinalRenderSourceV1: Record<string, unknown>;
    };
    expect(rewritten).toMatchObject({
      src: 'https://private.example/artifact.mov?signature=secret',
      content: 'https://private.example/artifact.mov?signature=secret',
      sourceStartFrame: 0,
      sourceEndFrame: 60,
      videoStartTime: 0,
      speed: 1,
      speedCurve: undefined,
      hasNativeAudio: true,
      nativeMediaFinalRenderSourceV1: {
        visualMapping: 'ONE_ARTIFACT_FRAME_PER_PROJECT_FRAME',
        audioDisposition: 'EMBEDDED_EXACT_NATIVE_PCM',
      },
    });
    expect(rewritten.keyframeTracks).toEqual([]);
    expect(result.receipt.exactOverlays[0]).not.toHaveProperty('sourceUrl');
    expect(result.receipt.receiptSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('passes through ordinary overlays without invoking the materializer', async () => {
    const materializer = { materialize: vi.fn() };
    const result = await prepare({ exactRequests: [], materializer });

    expect(result.disposition).toBe('SOURCES_PREPARED');
    expect(materializer.materialize).not.toHaveBeenCalled();
    if (result.disposition === 'SOURCES_PREPARED') {
      expect(result.overlays[0]).toEqual(video());
      expect(result.receipt.exactOverlays).toEqual([]);
    }
  });

  it('rejects a materialized artifact bound to another overlay range', async () => {
    const exactRequest = request();
    const stale = createNativeMediaFinalRenderSourceLeaseV1({
      leaseId: 'lease-stale',
      artifact: artifact(exactRequest, { timelineStartFrame: '91' }),
      sourceUrl: 'https://private.example/stale.mov?signature=secret',
      issuedAtEpochMs: 1_000_000,
      expiresAtEpochMs: 1_600_000,
    });
    const dependencies = ports(exactRequest, stale);

    const result = await prepare({
      materializer: dependencies.materializer,
      assetStateReader: dependencies.assetStateReader,
      projectRevisionReader: dependencies.projectRevisionReader,
    });

    expect(result).toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'SOURCE_LEASE_INVALID',
      overlayId: '41',
      assetId: 'asset-1',
      diagnostic: 'NATIVE_MEDIA_RENDER_ARTIFACT_SCOPE_MISMATCH',
    });
  });

  it('rejects a lease that cannot outlive the expected render', async () => {
    const exactRequest = request();
    const short = lease(exactRequest, { expiresAtEpochMs: 1_299_999 });
    const dependencies = ports(exactRequest, short);

    const result = await prepare({
      materializer: dependencies.materializer,
      assetStateReader: dependencies.assetStateReader,
      projectRevisionReader: dependencies.projectRevisionReader,
    });

    expect(result).toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'SOURCE_LEASE_INVALID',
      diagnostic: 'NATIVE_MEDIA_RENDER_LEASE_BINDING_INVALID',
    });
  });

  it('rejects a lease whose audio ownership contradicts the render request', async () => {
    const exactRequest = request({ renderNativeAudio: false });
    const withAudio = lease(request());
    const dependencies = ports(exactRequest, withAudio);

    const result = await prepare({
      exactRequests: [exactRequest],
      materializer: dependencies.materializer,
      assetStateReader: dependencies.assetStateReader,
      projectRevisionReader: dependencies.projectRevisionReader,
    });

    expect(result).toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'SOURCE_LEASE_INVALID',
      diagnostic: 'NATIVE_MEDIA_RENDER_ARTIFACT_SCOPE_MISMATCH',
    });
  });

  it('rejects an asset changed while the artifact was being prepared', async () => {
    const exactRequest = request();
    const dependencies = ports(exactRequest);
    dependencies.assetStateReader.readTimingStateSha256.mockResolvedValue('f'.repeat(64));

    const result = await prepare({
      materializer: dependencies.materializer,
      assetStateReader: dependencies.assetStateReader,
      projectRevisionReader: dependencies.projectRevisionReader,
    });

    expect(result).toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'ASSET_CHANGED_DURING_PREPARATION',
    });
  });

  it('rejects a project revision changed during preparation', async () => {
    const exactRequest = request();
    const dependencies = ports(exactRequest);
    dependencies.projectRevisionReader.getProjectRevision.mockResolvedValue({
      ...revision,
      value: revision.value + 1,
    });

    const result = await prepare({
      materializer: dependencies.materializer,
      assetStateReader: dependencies.assetStateReader,
      projectRevisionReader: dependencies.projectRevisionReader,
    });

    expect(result).toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'PROJECT_CHANGED_DURING_PREPARATION',
    });
  });

  it('rejects forged hash material and non-HTTPS leases', () => {
    const exactRequest = request();
    const valid = artifact(exactRequest);
    const forged = {
      ...valid,
      timelineFrameCount: '61',
    };
    expect(() => createNativeMediaFinalRenderSourceLeaseV1({
      leaseId: 'lease-forged',
      artifact: forged,
      sourceUrl: 'https://private.example/forged.mov',
      issuedAtEpochMs: 1_000_000,
      expiresAtEpochMs: 1_600_000,
    })).toThrow('NATIVE_MEDIA_RENDER_ARTIFACT_HASH_INVALID');
    expect(() => createNativeMediaFinalRenderSourceLeaseV1({
      leaseId: 'lease-http',
      artifact: valid,
      sourceUrl: 'http://private.example/artifact.mov',
      issuedAtEpochMs: 1_000_000,
      expiresAtEpochMs: 1_600_000,
    })).toThrow('NATIVE_MEDIA_RENDER_LEASE_URL_INVALID');
    expect(prepare({
      exactRequests: [exactRequest, exactRequest],
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'INPUT_INVALID',
      diagnostic: 'NATIVE_MEDIA_RENDER_PREPARATION_REQUEST_DUPLICATE',
    });
  });
});
