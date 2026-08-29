import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';

const mocks = vi.hoisted(() => ({
  resolveBinding: vi.fn(),
  createConform: vi.fn(),
  assertConform: vi.fn((value) => value),
  resolveAudio: vi.fn(),
}));

vi.mock('@/lib/editron/services/video-source-time-transform-v1', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/editron/services/video-source-time-transform-v1')
  >();
  return {
    ...actual,
    resolveVerifiedVideoSourceEpochTimeBindingV3: mocks.resolveBinding,
    createVideoSourceTimestampConformFromVerifiedEpochOrdinalV3: mocks.createConform,
    assertVideoSourceTimestampConformV3: mocks.assertConform,
  };
});

vi.mock('@/lib/editron/services/native-media-exact-audio-evidence-v1', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/editron/services/native-media-exact-audio-evidence-v1')
  >();
  return { ...actual, resolveNativeMediaExactAudioEvidenceV1: mocks.resolveAudio };
});

import {
  nativeMediaFinalRenderAssetTimingStateSha256V1,
  readNativeMediaFinalRenderVideoOverlayV1,
} from '@/lib/editron/services/native-media-final-render-admission-v1';
import {
  createNativeMediaFinalRenderSourceMaterializerV1,
  type NativeMediaFinalRenderEncodedArtifactV1,
} from '@/lib/editron/services/native-media-final-render-materializer-v1';
import {
  createNativeMediaFinalRenderSourceLeaseV1,
} from '@/lib/editron/services/native-media-final-render-source-preparation-v1';
import type { ProjectRevisionV1 } from '@/lib/editron/services/project-service';

const SHA = Object.freeze({
  source: '1'.repeat(64), storage: '2'.repeat(64), binding: '3'.repeat(64),
  pts: '4'.repeat(64), transform: '5'.repeat(64), frames: '6'.repeat(64),
  compatibility: '7'.repeat(64), content: '8'.repeat(64),
});
const revision = Object.freeze({
  schemaVersion: 1 as const,
  value: 9,
  compatibilityUpdatedAt: '2026-08-29T00:00:00.000Z',
});

function overlay(overrides: Partial<Record<string, unknown>> = {}): Overlay {
  return {
    id: 'video-1', type: 'video', assetId: 'asset-1', from: 30,
    durationInFrames: 3, sourceStartFrame: 10, sourceEndFrame: 13,
    content: '/api/assets/asset-1', styles: {}, ...overrides,
  } as unknown as Overlay;
}

function asset(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    assetId: 'asset-1', type: 'video' as const,
    sourceVersionV1: {
      sourceVersionSha256: SHA.source,
      storageVersion: { storageVersionSha256: SHA.storage },
    },
    sourcePtsCadenceMapV3: {},
    sourcePtsCadenceMapStateSha256V3: SHA.pts,
    ...overrides,
  };
}

function binding() {
  return {
    assetId: 'asset-1', sourceVersionSha256: SHA.source,
    storageVersionSha256: SHA.storage, sourceBindingSha256: SHA.binding,
    sourcePtsCadenceMapStateSha256V3: SHA.pts, bindingSha256: SHA.binding,
    totalSourceFrameCount: '100',
  };
}

function request(candidate = overlay(), currentAsset = asset()) {
  const normalized = readNativeMediaFinalRenderVideoOverlayV1(candidate);
  return {
    overlayId: normalized.overlayId,
    assetId: normalized.assetId,
    overlayTimingSha256: normalized.overlayTimingSha256,
    assetTimingStateSha256: nativeMediaFinalRenderAssetTimingStateSha256V1(currentAsset as never),
    sourceVersionSha256: SHA.source,
    storageVersionSha256: SHA.storage,
    sourceBindingSha256: SHA.binding,
    sourcePtsCadenceMapStateSha256V3: SHA.pts,
    renderNativeAudio: normalized.renderNativeAudio,
  };
}

function transform(audioMapping: Record<string, unknown> | null = null) {
  return {
    sourceBinding: { bindingSha256: SHA.binding },
    timelineStartFrame: '30', queryCount: '3',
    frameSelections: [{}, {}, {}], audioMapping,
    projectRate: { numerator: '30', denominator: '1' },
    transformSha256: SHA.transform,
  };
}

function encoded(
  audio: NativeMediaFinalRenderEncodedArtifactV1['audio'] = {
    disposition: 'NO_AUDIO_MAPPING_REQUESTED', audioCodec: null,
    audioMappingSha256: null, sourceDecodedPcmSha256: null,
    artifactDecodedPcmSha256: null, decodedPcmEquivalenceReceiptSha256: null,
    sampleRate: null, channelCount: null, decodedSampleFrameCount: null,
  },
): NativeMediaFinalRenderEncodedArtifactV1 {
  return {
    publishHandle: 'local-file-1', artifactHandle: 'artifact-1', container: 'matroska',
    videoCodec: 'ffv1', pixelFormat: 'bgra', videoFrameCount: '3',
    decodedFrameSequenceSha256: SHA.frames,
    remotionCompatibilityReceiptSha256: SHA.compatibility,
    audio, contentType: 'video/x-matroska', artifactContentSha256: SHA.content,
    artifactByteLength: '12345',
  };
}

function setup(overrides: Readonly<{
  projectOverlay?: Overlay;
  firstAsset?: ReturnType<typeof asset>;
  secondAsset?: ReturnType<typeof asset>;
  encodedArtifact?: NativeMediaFinalRenderEncodedArtifactV1;
  finalRevision?: ProjectRevisionV1;
}> = {}) {
  const projectOverlay = overrides.projectOverlay ?? overlay();
  const firstAsset = overrides.firstAsset ?? asset();
  const secondAsset = overrides.secondAsset ?? firstAsset;
  const encoder = { encode: vi.fn(async () => ({
    disposition: 'ARTIFACT_ENCODED' as const,
    encoded: overrides.encodedArtifact ?? encoded(),
  })) };
  const publisher = { publish: vi.fn(async ({ artifact, minimumExpiresAtEpochMs }) => ({
    disposition: 'SOURCE_PUBLISHED' as const,
    lease: createNativeMediaFinalRenderSourceLeaseV1({
      leaseId: 'lease-1', artifact,
      sourceUrl: 'https://private.example/exact.mkv?signature=secret',
      issuedAtEpochMs: 1_000_000,
      expiresAtEpochMs: minimumExpiresAtEpochMs + 60_000,
    }),
  })) };
  const loadAsset = vi.fn()
    .mockResolvedValueOnce(firstAsset)
    .mockResolvedValueOnce(secondAsset);
  const materializer = createNativeMediaFinalRenderSourceMaterializerV1({
    projectSnapshotReader: { loadProjectForMutation: vi.fn(async () => ({
      project: { projectId: 'project-1', fps: 30, overlays: [projectOverlay] },
      revision,
    })) },
    projectRevisionReader: {
      getProjectRevision: vi.fn(async () => overrides.finalRevision ?? revision),
    },
    assetReader: { load: loadAsset },
    storedObjectReader: { read: vi.fn() },
    encoder,
    publisher,
  } as never);
  return { materializer, encoder, publisher, loadAsset, projectOverlay, firstAsset };
}

async function materialize(setupResult = setup()) {
  return setupResult.materializer.materialize({
    userId: 'user-1', projectId: 'project-1', sequenceId: 'main',
    projectRevision: revision,
    request: request(setupResult.projectOverlay, setupResult.firstAsset),
    minimumExpiresAtEpochMs: 1_300_000,
  });
}

describe('native media final-render materializer v1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveBinding.mockReturnValue(binding());
    mocks.createConform.mockResolvedValue({
      disposition: 'CONFORM_CREATED', transform: transform(),
    });
    mocks.resolveAudio.mockResolvedValue({ disposition: 'NO_AUDIO_REQUESTED' });
  });

  it('rebuilds the exact conform and publishes a revision-bound render source', async () => {
    const runtime = setup();
    const result = await materialize(runtime);

    expect(result.disposition).toBe('SOURCE_MATERIALIZED');
    if (result.disposition !== 'SOURCE_MATERIALIZED') return;
    expect(result.lease.artifact).toMatchObject({
      projectId: 'project-1', overlayId: 'video-1', assetId: 'asset-1',
      transformSha256: SHA.transform, timelineStartFrame: '30',
      timelineFrameCount: '3', videoFrameCount: '3',
      audio: { disposition: 'NO_AUDIO_MAPPING_REQUESTED' },
    });
    expect(mocks.createConform).toHaveBeenCalledWith(expect.objectContaining({
      firstFrameOrdinal: '10', endExclusiveFrameOrdinal: '13',
      timelineFrameQueries: ['30', '31', '32'], sourceAnchorFrameOrdinal: '10',
    }));
    expect(runtime.encoder.encode).toHaveBeenCalledTimes(1);
    expect(runtime.publisher.publish).toHaveBeenCalledTimes(1);
    expect(runtime.loadAsset).toHaveBeenCalledTimes(2);
  });

  it('blocks retimed V3 overlays instead of approximating them', async () => {
    const runtime = setup({ projectOverlay: overlay({ speed: 2 }) });
    const result = await materialize(runtime);

    expect(result).toEqual({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'NATIVE_MEDIA_FINAL_RENDER_RETIME_UNSUPPORTED',
    });
    expect(runtime.encoder.encode).not.toHaveBeenCalled();
  });

  it('rejects an asset that changes while encoding', async () => {
    const runtime = setup({
      secondAsset: asset({ sourcePtsCadenceMapStateSha256V3: 'f'.repeat(64) }),
    });
    const result = await materialize(runtime);

    expect(result).toEqual({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'NATIVE_MEDIA_FINAL_RENDER_ASSET_CHANGED_DURING_MATERIALIZATION',
    });
  });

  it('rejects encoded audio that contradicts the exact audio mapping', async () => {
    const withAudio = overlay({ hasNativeAudio: true });
    const runtime = setup({ projectOverlay: withAudio });
    const audioMapping = {
      audioMappingSha256: 'a'.repeat(64), decodedPcmSha256: 'b'.repeat(64),
      sampleRate: '48000', channelCount: 2,
    };
    mocks.resolveAudio.mockResolvedValueOnce({
      disposition: 'EXACT_AUDIO_EVIDENCE_READY',
      selected: { assetStateSha256: 'c'.repeat(64), record: {}, evidence: {} },
    });
    mocks.createConform.mockResolvedValueOnce({
      disposition: 'CONFORM_CREATED', transform: transform(audioMapping),
    });

    const result = await materialize(runtime);

    expect(result).toEqual({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'NATIVE_MEDIA_FINAL_RENDER_ENCODED_ARTIFACT_SCOPE_MISMATCH',
    });
    expect(runtime.publisher.publish).not.toHaveBeenCalled();
  });

  it('rejects a project revision changed after publication', async () => {
    const runtime = setup({
      finalRevision: {
        ...revision,
        value: revision.value + 1,
        compatibilityUpdatedAt: '2026-08-29T00:00:01.000Z',
      },
    });
    const result = await materialize(runtime);

    expect(result).toEqual({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'NATIVE_MEDIA_FINAL_RENDER_PROJECT_CHANGED_DURING_MATERIALIZATION',
    });
    expect(runtime.publisher.publish).toHaveBeenCalledTimes(1);
  });
});
