import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { OverlayType } from '@/components/editron/editor/version-7.0.0/types';
import {
  CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
  type PresentationEpochV1,
} from '@/lib/editron/contracts/canonical-media-time-v1';
import {
  canonicalizeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from '@/lib/editron/services/canonical-json-v1';
import {
  createMediaSourceAudioSampleEpochMapV1,
  createMediaSourceAudioStreamBindingV1,
  MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_ADAPTER_VERSION_V1,
} from '@/lib/editron/services/media-source-audio-sample-epoch-map-v1';
import { createMediaSourcePtsCadenceBoundaryEvidenceSidecarV3 } from '@/lib/editron/services/media-source-pts-cadence-epoch-boundary-v3';
import {
  createMediaSourcePtsCadenceBoundarySemanticVerificationReceiptV3,
  verifyMediaSourcePtsCadenceEpochArtifactsV3,
  type MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3,
} from '@/lib/editron/services/media-source-pts-cadence-epoch-artifact-verifier-v3';
import {
  createMediaSourcePtsCadenceEpochIndexSidecarV3,
  createMediaSourcePtsCadenceEpochIndexV3,
} from '@/lib/editron/services/media-source-pts-cadence-epoch-index-v3';
import { serializeMediaSourcePtsCadenceFrameBatchV2 } from '@/lib/editron/services/media-source-pts-cadence-frame-batch-v2';
import {
  claimMediaSourcePtsCadenceMapAssetRecordV3,
  completeMediaSourcePtsCadenceMapAssetRecordV3,
  createMediaSourcePtsCadenceMapAssetRecordV3,
  createMediaSourcePtsCadenceMapAssetStateV3,
  type MediaSourcePtsCadenceMapAssetStateInputV3,
} from '@/lib/editron/services/media-source-pts-cadence-map-asset-owner-v3';
import { mediaSourcePtsCadenceMapBindingSha256V1 } from '@/lib/editron/services/media-source-pts-cadence-map-lifecycle-v1';
import { createMediaSourcePtsCadenceFrameBatchSidecarV2 } from '@/lib/editron/services/media-source-pts-cadence-manifest-index-v2';
import {
  createMediaSourcePtsCadenceShardV1,
  type MediaSourcePtsCadenceFrameInputV1,
} from '@/lib/editron/services/media-source-pts-cadence-shard-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';
import {
  materializeNativeMediaTimestampPreviewWindowV1,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZER_DEFAULT_POLICY_V1,
  type NativeMediaTimestampPreviewMaterializerPolicyV1,
} from '@/lib/editron/services/native-media-timestamp-preview-materializer-v1';
import {
  consumeNativeMediaTimestampTransformV1,
  NATIVE_MEDIA_TIMESTAMP_DECODER_BATCH_OUTPUT_KIND_V1,
  NATIVE_MEDIA_TIMESTAMP_DECODER_PORT_VERSION_V1,
  type NativeMediaTimestampDecoderBatchOutputV1,
  type NativeMediaTimestampDecoderBatchRequestV1,
  type NativeMediaTimestampMaterializingDecoderV1,
} from '@/lib/editron/services/native-media-timestamp-consumer-v1';
import type { Project } from '@/lib/editron/services/project-service';
import {
  assertVideoSourceTimestampConformV3,
  createVideoSourceTimestampConformFromVerifiedEpochIndexV3,
  createVideoSourceTimestampConformFromVerifiedEpochOrdinalV3,
  type VideoSourceTimestampConformV3,
} from '@/lib/editron/services/video-source-time-transform-v1';

describe('native media timestamp consumer V1', () => {
  it('consumes a verified VFR/reset/gap window with exact PTS, picture reuse, and separate audio', async () => {
    const fixture = await verifiedFixture('primary', { withAudio: true });
    const conform = await createConform(fixture);
    expect(conform.disposition).toBe('CONFORM_CREATED');
    if (conform.disposition !== 'CONFORM_CREATED') throw new Error(JSON.stringify(conform));
    expect(conform.transform.frameSelections.map(({ sourceFrameOrdinal }) => sourceFrameOrdinal))
      .toEqual(['0', '1', '2', '3', '3', '3', '4', '5']);
    expect(conform.transform.audioMapping).toMatchObject({
      kind: 'EDITRON_VERIFIED_AUDIO_SAMPLE_TIME_MAPPING_V3',
      streamId: 'audio-1',
      sampleRate: '48000',
      decodedSampleFrameCount: '288000',
      canonicalTimelineStartSamplePosition: {
        numerator: '0', denominator: '1', disposition: 'INTEGER_SAMPLE_FRAME',
      },
      canonicalTimelineEndExclusiveSamplePosition: {
        numerator: '384000', denominator: '1', disposition: 'INTEGER_SAMPLE_FRAME',
      },
      segments: [
        expect.objectContaining({ kind: 'PCM', audioEpochId: 'audio-1-epoch-000000' }),
        expect.objectContaining({ kind: 'PCM', audioEpochId: 'audio-1-epoch-000001' }),
        expect.objectContaining({
          kind: 'SILENCE', reason: 'DECLARED_SOURCE_GAP',
          precedingAudioEpochId: 'audio-1-epoch-000001',
          nextAudioEpochId: 'audio-1-epoch-000002',
        }),
        expect.objectContaining({ kind: 'PCM', audioEpochId: 'audio-1-epoch-000002' }),
      ],
    });

    const decodePictures = vi.fn(async (request: NativeMediaTimestampDecoderBatchRequestV1) => (
      decoderOutput(request)
    ));
    const releaseDecodedBatch = vi.fn(async () => undefined);
    const result = await consume(fixture, conform.transform, {
      decodePictures,
      releaseDecodedBatch,
    });

    expect(result.disposition).toBe('TIMESTAMP_MEDIA_CONSUMED');
    if (result.disposition !== 'TIMESTAMP_MEDIA_CONSUMED') throw new Error(JSON.stringify(result));
    expect(decodePictures).toHaveBeenCalledTimes(1);
    const request = decodePictures.mock.calls[0]![0];
    expect(request.pictureRequests).toHaveLength(6);
    expect(request.pictureRequests).toEqual(expect.arrayContaining([
      expect.objectContaining({ epochId: 'epoch-1', presentationTimestampTicks: '-2000' }),
      expect.objectContaining({ epochId: 'epoch-2', presentationTimestampTicks: '2000' }),
    ]));
    expect(request.sourceVersion.sourceVersionSha256).toBe(
      fixture.sourceVersion.sourceVersionSha256,
    );
    expect(result.receipt).toMatchObject({
      sourceBindingSha256: conform.transform.sourceBinding.bindingSha256,
      transformSha256: conform.transform.transformSha256,
      totalDecodedBytes: 96,
      audioOwnership: {
        kind: 'SEPARATE_NATIVE_SAMPLE_DOMAIN_V1',
        disposition: 'EXACT_SAMPLE_MAPPING_BOUND',
        decoderMaySupplyOrReplaceAudio: false,
      },
    });
    expect(result.receipt.timelinePictures).toHaveLength(8);
    expect(result.receipt.timelinePictures.slice(3, 6).map(({ pictureHandle }) => pictureHandle))
      .toEqual([result.receipt.timelinePictures[3]!.pictureHandle,
        result.receipt.timelinePictures[3]!.pictureHandle,
        result.receipt.timelinePictures[3]!.pictureHandle]);
    expect(result.receipt.receiptSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('preserves fractional audio phase and rejects evidence from another source', async () => {
    const fractional = await verifiedFixture('fractional-audio', {
      withAudio: true,
      fractionalAudioPhase: true,
    });
    const conform = await createConform(fractional);
    if (conform.disposition !== 'CONFORM_CREATED') throw new Error(JSON.stringify(conform));
    expect(conform.transform.audioMapping?.segments[0]).toEqual({
      kind: 'SILENCE',
      reason: 'LEADING_STREAM_OFFSET',
      precedingAudioEpochId: null,
      nextAudioEpochId: 'audio-1-epoch-000000',
      canonicalStartSamplePosition: {
        numerator: '0', denominator: '1', disposition: 'INTEGER_SAMPLE_FRAME',
      },
      canonicalEndExclusiveSamplePosition: {
        numerator: '8', denominator: '15', disposition: 'BETWEEN_SAMPLE_FRAMES',
      },
    });
    expect(() => assertVideoSourceTimestampConformV3(conform.transform)).not.toThrow();
    const tampered = structuredClone(conform.transform) as unknown as {
      audioMapping: null | {
        segments: Array<{
          canonicalEndExclusiveSamplePosition: { numerator: string };
        }>;
      };
    };
    if (tampered.audioMapping === null) throw new Error('TEST_AUDIO_MAPPING_REQUIRED');
    tampered.audioMapping.segments[0]!.canonicalEndExclusiveSamplePosition.numerator = '1';
    expect(() => assertVideoSourceTimestampConformV3(tampered)).toThrow(
      'VIDEO_SOURCE_TIMESTAMP_CONFORM_V3_AUDIO_SEGMENT_COVERAGE_INVALID',
    );

    const foreign = await verifiedFixture('foreign-audio', { withAudio: true });
    if (foreign.audioEvidence === null) throw new Error('TEST_AUDIO_EVIDENCE_REQUIRED');
    await expect(createConform(fractional, {
      audio: { evidence: foreign.audioEvidence, endExclusiveTimelineFrame: '8' },
    })).rejects.toThrow('VIDEO_SOURCE_CONFORM_AUDIO_SCOPE_MISMATCH');
  });

  it('derives a reset-side source anchor from the verified frame ordinal', async () => {
    const fixture = await verifiedFixture('ordinal-anchor');
    const input = {
      asset: fixture.asset,
      storedObjectReader: fixture.reader,
      firstFrameOrdinal: '0',
      endExclusiveFrameOrdinal: '6',
      windowResourcePolicy: {
        policyVersion: 'epoch-window-test-v3',
        maxFrameRecords: 10,
        maxBatchReads: 10,
        maxTotalReadBytes: 1_000_000,
      },
      projectRate: { numerator: '1', denominator: '1' },
      timelineStartFrame: '6',
      timelineFrameQueries: ['6', '7'],
      sourceAnchorFrameOrdinal: '4',
      resourcePolicy: {
        policyVersion: 'timestamp-conform-test-v3',
        maxSourceFrames: 10,
        maxFrameQueries: 10,
      },
    } as const;

    await expect(createVideoSourceTimestampConformFromVerifiedEpochOrdinalV3(input))
      .resolves.toMatchObject({
        disposition: 'CONFORM_CREATED',
        transform: {
          sourceAnchor: {
            epochId: 'epoch-2',
            presentationTimestampTicks: '2000',
          },
          frameSelections: [
            { timelineFrame: '6', sourceFrameOrdinal: '4' },
            { timelineFrame: '7', sourceFrameOrdinal: '5' },
          ],
        },
      });
    await expect(createVideoSourceTimestampConformFromVerifiedEpochOrdinalV3({
      ...input,
      sourceAnchorFrameOrdinal: '6',
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'WINDOW_COVERAGE_INCOMPLETE',
      diagnostic: 'VIDEO_SOURCE_CONFORM_ANCHOR_ORDINAL_NOT_IN_WINDOW',
    });
  });

  it('fails before decode for tampered bytes, oversized index reads, and unqualified proxies', async () => {
    const tampered = await verifiedFixture('tampered');
    const batchKey = tampered.batches[1]!.sidecar.objectKey;
    const storedBatch = tampered.objects.get(batchKey)!;
    tampered.objects.set(batchKey, { ...storedBatch, canonicalJson: `${storedBatch.canonicalJson} ` });
    await expect(createConform(tampered)).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE',
      reason: 'WINDOW_BATCH_BYTE_LENGTH_MISMATCH',
      failedBatchSequence: 1,
    });

    const overBudget = await verifiedFixture('budget');
    overBudget.reader.read.mockClear();
    await expect(createConform(overBudget, {
      windowResourcePolicy: {
        policyVersion: 'tiny-index-budget-v1',
        maxFrameRecords: 10,
        maxBatchReads: 10,
        maxTotalReadBytes: 1,
      },
    })).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE', reason: 'WINDOW_RESOURCE_LIMIT_EXCEEDED',
    });
    expect(overBudget.reader.read).not.toHaveBeenCalled();

    const proxy = await verifiedFixture('proxy');
    proxy.reader.read.mockClear();
    await expect(createConform(proxy, {
      proxyMasterMapping: {
        disposition: 'UNQUALIFIED', relationSha256: 'f'.repeat(64),
      },
    })).rejects.toThrow('VIDEO_SOURCE_CONFORM_PROXY_MASTER_MAPPING_REQUIRED');
    expect(proxy.reader.read).not.toHaveBeenCalled();
  });

  it('blocks stale sources and invalid decoder identity, resources, and execution', async () => {
    const primary = await verifiedFixture('source-a');
    const replacement = await verifiedFixture('source-b');
    const conform = await createConform(primary);
    if (conform.disposition !== 'CONFORM_CREATED') throw new Error(JSON.stringify(conform));

    const untouchedDecoder = vi.fn(async (request: NativeMediaTimestampDecoderBatchRequestV1) => (
      decoderOutput(request)
    ));
    await expect(consume(replacement, conform.transform, {
      decodePictures: untouchedDecoder,
      releaseDecodedBatch: vi.fn(async () => undefined),
    })).resolves.toMatchObject({ disposition: 'UNVERIFIABLE', reason: 'SOURCE_BINDING_STALE' });
    expect(untouchedDecoder).not.toHaveBeenCalled();

    const wrongPtsDecoder = {
      decodePictures: vi.fn(async (request: NativeMediaTimestampDecoderBatchRequestV1) => {
        const output = decoderOutput(request);
        return {
          ...output,
          pictures: output.pictures.map((picture, index) => index === 0
            ? { ...picture, presentationTimestampTicks: '999999' }
            : picture),
        };
      }),
      releaseDecodedBatch: vi.fn(async () => undefined),
    } satisfies NativeMediaTimestampMaterializingDecoderV1;
    await expect(consume(primary, conform.transform, wrongPtsDecoder)).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE', reason: 'DECODER_SCOPE_MISMATCH',
    });

    const tooLargeDecoder = {
      decodePictures: vi.fn(async (request: NativeMediaTimestampDecoderBatchRequestV1) => (
        decoderOutput(request, 32)
      )),
      releaseDecodedBatch: vi.fn(async () => undefined),
    } satisfies NativeMediaTimestampMaterializingDecoderV1;
    await expect(consume(primary, conform.transform, tooLargeDecoder, 64)).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE', reason: 'DECODER_RESOURCE_LIMIT_EXCEEDED',
    });

    const failedDecoder = {
      decodePictures: vi.fn(async () => {
        throw new Error('decoder details must not escape');
      }),
      releaseDecodedBatch: vi.fn(async () => undefined),
    } satisfies NativeMediaTimestampMaterializingDecoderV1;
    await expect(consume(primary, conform.transform, failedDecoder)).resolves.toEqual({
      disposition: 'UNVERIFIABLE', reason: 'DECODER_FAILED', diagnostic: null,
    });

    await expect(consume(
      primary,
      conform.transform,
      {
        decodePictures: untouchedDecoder,
        releaseDecodedBatch: vi.fn(async () => undefined),
      },
      1024,
      primary.baseAsset,
    )).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE', reason: 'CURRENT_SOURCE_NOT_VERIFIED',
    });
  });

  it('checks the live ProjectService revision before and after decode and releases stale output', async () => {
    const fixture = await verifiedFixture('revision');
    const conform = await createConform(fixture);
    if (conform.disposition !== 'CONFORM_CREATED') throw new Error(JSON.stringify(conform));
    const decodePictures = vi.fn(async (request: NativeMediaTimestampDecoderBatchRequestV1) => (
      decoderOutput(request)
    ));
    const releaseDecodedBatch = vi.fn(async () => undefined);
    const decoder = { decodePictures, releaseDecodedBatch };

    const staleBefore = vi.fn(async () => projectRevision(10));
    await expect(consume(
      fixture,
      conform.transform,
      decoder,
      1024,
      fixture.asset,
      staleBefore,
    )).resolves.toMatchObject({ disposition: 'UNVERIFIABLE', reason: 'PROJECT_REVISION_STALE' });
    expect(decodePictures).not.toHaveBeenCalled();

    const changesDuringDecode = vi.fn()
      .mockResolvedValueOnce(projectRevision(9))
      .mockResolvedValueOnce(projectRevision(10));
    await expect(consume(
      fixture,
      conform.transform,
      decoder,
      1024,
      fixture.asset,
      changesDuringDecode,
    )).resolves.toMatchObject({ disposition: 'UNVERIFIABLE', reason: 'PROJECT_REVISION_STALE' });
    expect(decodePictures).toHaveBeenCalledTimes(1);
    expect(releaseDecodedBatch).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/));
  });
});

describe('native media timestamp preview materializer V1', () => {
  it('binds the current project overlay to exact reset-side pictures and a conservative lease', async () => {
    const fixture = await verifiedFixture('materializer-success');
    const runtime = materializerPorts(fixture);

    const result = await materializeNativeMediaTimestampPreviewWindowV1(
      materializerInput(),
      runtime.ports,
    );

    expect(result).toMatchObject({
      disposition: 'WINDOW_MATERIALIZED',
      materializedPictureCount: 2,
      window: {
        overlayId: '42',
        overlayFromFrame: 10,
        windowLocalStartFrame: 0,
        windowDurationInFrames: 2,
        audioOwnership: { disposition: 'NO_AUDIO_MAPPING_REQUESTED' },
        lease: {
          issuedAtEpochMs: 1_000,
          renewAfterEpochMs: 3_301_000,
          expiresAtEpochMs: 3_601_000,
        },
        frames: [{ projectFrame: 10 }, { projectFrame: 11 }],
      },
    });
    expect(runtime.decodePictures).toHaveBeenCalledTimes(1);
    expect(runtime.decodePictures.mock.calls[0]![0].pictureRequests).toEqual([
      expect.objectContaining({
        sourceFrameOrdinal: '4', epochId: 'epoch-2', presentationTimestampTicks: '2000',
      }),
      expect.objectContaining({
        sourceFrameOrdinal: '5', epochId: 'epoch-2', presentationTimestampTicks: '3000',
      }),
    ]);
    expect(runtime.releaseDecodedBatch).not.toHaveBeenCalled();
  });

  it('blocks ambiguous rate, retime, source audio, and unbounded source extent before decode', async () => {
    const fixture = await verifiedFixture('materializer-preflight');
    const ambiguous = materializerPorts(fixture, {
      project: projectFixture(fixture.sourceVersion.assetId, { fps: 29.97 }),
    });
    await expect(materializeNativeMediaTimestampPreviewWindowV1(
      materializerInput(), ambiguous.ports,
    )).resolves.toMatchObject({ disposition: 'UNVERIFIABLE', reason: 'PROJECT_RATE_AMBIGUOUS' });

    const baseProject = projectFixture(fixture.sourceVersion.assetId);
    const baseVideo = baseProject.overlays[0]!;
    if (baseVideo.type !== OverlayType.VIDEO) throw new Error('TEST_VIDEO_OVERLAY_REQUIRED');
    const retimed = materializerPorts(fixture, {
      project: projectFixture(fixture.sourceVersion.assetId, {
        overlays: [{ ...baseVideo, speed: 2 }],
      }),
    });
    await expect(materializeNativeMediaTimestampPreviewWindowV1(
      materializerInput(), retimed.ports,
    )).resolves.toMatchObject({ disposition: 'UNVERIFIABLE', reason: 'OVERLAY_RETIME_UNSUPPORTED' });

    const audioFixture = await verifiedFixture('materializer-audio', { withAudio: true });
    const audio = materializerPorts(audioFixture);
    await expect(materializeNativeMediaTimestampPreviewWindowV1(
      materializerInput(), audio.ports,
    )).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE', reason: 'EXACT_AUDIO_MAPPING_REQUIRED',
    });

    const withoutEnd = {
      ...baseProject.overlays[0]!, sourceStartFrame: 0, sourceEndFrame: undefined,
    };
    const unbounded = materializerPorts(fixture, {
      project: projectFixture(fixture.sourceVersion.assetId, { overlays: [withoutEnd] }),
      policy: {
        ...NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZER_DEFAULT_POLICY_V1,
        epochWindow: {
          ...NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZER_DEFAULT_POLICY_V1.epochWindow,
          maxFrameRecords: 5,
        },
      },
    });
    await expect(materializeNativeMediaTimestampPreviewWindowV1(
      materializerInput(), unbounded.ports,
    )).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE', reason: 'SOURCE_WINDOW_REQUIRES_EXPLICIT_END',
    });
    expect(ambiguous.decodePictures).not.toHaveBeenCalled();
    expect(retimed.decodePictures).not.toHaveBeenCalled();
    expect(audio.decodePictures).not.toHaveBeenCalled();
    expect(unbounded.decodePictures).not.toHaveBeenCalled();
  });

  it('releases decoded surfaces on stale asset, late revision, or unusable lease', async () => {
    const fixture = await verifiedFixture('materializer-late-stop');
    const staleAsset = materializerPorts(fixture, {
      assetReads: [fixture.asset, fixture.baseAsset],
    });
    await expect(materializeNativeMediaTimestampPreviewWindowV1(
      materializerInput(), staleAsset.ports,
    )).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE', reason: 'ASSET_CHANGED_DURING_MATERIALIZATION',
    });
    expect(staleAsset.releaseDecodedBatch).toHaveBeenCalledTimes(1);

    const revisionReader = vi.fn()
      .mockResolvedValueOnce(projectRevision(9))
      .mockResolvedValueOnce(projectRevision(9))
      .mockResolvedValueOnce(projectRevision(10));
    const staleProject = materializerPorts(fixture, { getProjectRevision: revisionReader });
    await expect(materializeNativeMediaTimestampPreviewWindowV1(
      materializerInput(), staleProject.ports,
    )).resolves.toMatchObject({
      disposition: 'UNVERIFIABLE', reason: 'PROJECT_CHANGED_DURING_MATERIALIZATION',
    });
    expect(staleProject.releaseDecodedBatch).toHaveBeenCalledTimes(1);

    const shortLease = materializerPorts(fixture, { expiresInMs: 1_000 });
    await expect(materializeNativeMediaTimestampPreviewWindowV1(
      materializerInput(), shortLease.ports,
    )).resolves.toMatchObject({ disposition: 'UNVERIFIABLE', reason: 'LEASE_UNUSABLE' });
    expect(shortLease.releaseDecodedBatch).toHaveBeenCalledTimes(1);

    const cleanupFailure = materializerPorts(fixture, {
      assetReads: [fixture.asset, fixture.baseAsset],
      releaseFailure: true,
    });
    await expect(materializeNativeMediaTimestampPreviewWindowV1(
      materializerInput(), cleanupFailure.ports,
    )).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      reason: 'CLEANUP_FAILED',
      diagnostic: 'ASSET_CHANGED_DURING_MATERIALIZATION',
    });
  });
});

function materializerInput() {
  return {
    userId: 'user-1',
    projectId: 'project-1',
    sequenceId: 'main',
    overlayId: 42,
    windowLocalStartFrame: 0,
    windowDurationInFrames: 2,
  } as const;
}

function materializerPorts(
  fixture: VerifiedFixture,
  options: Readonly<{
    project?: Project;
    assetReads?: readonly (MediaSourcePtsCadenceMapAssetStateInputV3 | null)[];
    getProjectRevision?: () => Promise<ReturnType<typeof projectRevision>>;
    expiresInMs?: number;
    releaseFailure?: boolean;
    policy?: NativeMediaTimestampPreviewMaterializerPolicyV1;
  }> = {},
) {
  const project = options.project ?? projectFixture(fixture.sourceVersion.assetId);
  const assetReads = options.assetReads ?? [fixture.asset, fixture.asset];
  let assetReadIndex = 0;
  const decodePictures = vi.fn(async (request: NativeMediaTimestampDecoderBatchRequestV1) => (
    decoderOutput(request)
  ));
  const releaseDecodedBatch = options.releaseFailure
    ? vi.fn(async () => { throw new Error('TEST_RELEASE_FAILED'); })
    : vi.fn(async () => undefined);
  const decoder = { decodePictures, releaseDecodedBatch };
  return {
    decodePictures,
    releaseDecodedBatch,
    ports: {
      projectSnapshotReader: {
        loadProjectForMutation: vi.fn(async () => ({ project, revision: projectRevision(9) })),
      },
      projectRevisionReader: {
        getProjectRevision: options.getProjectRevision
          ?? vi.fn(async () => projectRevision(9)),
      },
      assetReader: {
        load: vi.fn(async () => {
          const value = assetReads[Math.min(assetReadIndex, assetReads.length - 1)] ?? null;
          assetReadIndex += 1;
          return value;
        }),
      },
      storedObjectReader: fixture.reader,
      createDecoder: vi.fn(({ materializationStartedAtEpochMs }) => ({
        decoder,
        surfaceExpiresAtEpochMs: materializationStartedAtEpochMs
          + (options.expiresInMs ?? 60 * 60 * 1_000),
      })),
      policy: options.policy ?? NATIVE_MEDIA_TIMESTAMP_PREVIEW_MATERIALIZER_DEFAULT_POLICY_V1,
      now: () => 1_000,
    },
  };
}

function projectFixture(assetId: string, overrides: Partial<Project> = {}): Project {
  return {
    projectId: 'project-1',
    userId: 'user-1',
    name: 'Timestamp preview fixture',
    overlays: [{
      id: 42,
      type: OverlayType.VIDEO,
      content: 'fixture-video',
      assetId,
      from: 10,
      durationInFrames: 2,
      sourceStartFrame: 4,
      sourceEndFrame: 6,
      width: 1920,
      height: 1080,
      left: 0,
      top: 0,
      row: 0,
      rotation: 0,
      isDragging: false,
      styles: {},
    }],
    aspectRatio: '16:9',
    playerDimensions: { width: 1920, height: 1080 },
    fps: 1,
    durationInFrames: 12,
    createdAt: new Date('2026-08-29T00:00:00.000Z'),
    updatedAt: new Date('2026-08-29T12:00:00.000Z'),
    projectRevision: 9,
    visibility: 'private',
    ...overrides,
  };
}

async function consume(
  fixture: VerifiedFixture,
  transform: VideoSourceTimestampConformV3,
  decoder: NativeMediaTimestampMaterializingDecoderV1,
  maxDecodedBytes = 1024,
  asset: MediaSourcePtsCadenceMapAssetStateInputV3 = fixture.asset,
  getProjectRevision = vi.fn(async () => projectRevision(9)),
) {
  return consumeNativeMediaTimestampTransformV1({
    userId: 'user-1',
    projectId: 'project-1',
    sequenceId: 'sequence-1',
    overlayId: 'overlay-1',
    projectRevision: projectRevision(9),
    asset,
    transform,
    decoder,
    decoderRelease: decoder,
    projectRevisionReader: { getProjectRevision },
    resourcePolicy: {
      policyVersion: 'native-decoder-test-v1',
      maxUniquePictures: 10,
      maxDecodedBytes,
      maxCodedDimension: 4096,
      maxDisplayDimension: 4096,
    },
  });
}

function projectRevision(value: number) {
  return {
    schemaVersion: 1 as const,
    value,
    compatibilityUpdatedAt: '2026-08-29T12:00:00.000Z',
  };
}

function decoderOutput(
  request: NativeMediaTimestampDecoderBatchRequestV1,
  decodedByteLength = 16,
): NativeMediaTimestampDecoderBatchOutputV1 {
  return {
    schemaVersion: 1,
    kind: NATIVE_MEDIA_TIMESTAMP_DECODER_BATCH_OUTPUT_KIND_V1,
    decoderPortVersion: NATIVE_MEDIA_TIMESTAMP_DECODER_PORT_VERSION_V1,
    decoderRequestSha256: request.decoderRequestSha256,
    pictures: request.pictureRequests.map((picture) => ({
      decoderPictureRequestSha256: picture.decoderPictureRequestSha256,
      sourceVersionSha256: request.sourceVersion.sourceVersionSha256,
      storageVersionSha256: request.sourceVersion.storageVersion.storageVersionSha256,
      streamId: request.streamId,
      sourceFrameOrdinal: picture.sourceFrameOrdinal,
      epochId: picture.epochId,
      presentationTimestampTicks: picture.presentationTimestampTicks,
      pictureHandle: `nmpv1_${picture.decoderPictureRequestSha256}`,
      decodedPictureContentSha256: hashEditronCanonicalJsonV1({
        request: picture.decoderPictureRequestSha256,
      }),
      decodedByteLength,
      codedWidth: 1920,
      codedHeight: 1080,
      displayWidth: 1920,
      displayHeight: 1080,
      rotationDegrees: 0,
      pixelFormat: 'I420',
      colorSpace: {
        primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false,
      },
    })),
  };
}

type CreateConformInput = Parameters<
  typeof createVideoSourceTimestampConformFromVerifiedEpochIndexV3
>[0];

function createConform(
  fixture: VerifiedFixture,
  overrides: Partial<CreateConformInput> = {},
) {
  return createVideoSourceTimestampConformFromVerifiedEpochIndexV3({
    asset: fixture.asset,
    storedObjectReader: fixture.reader,
    firstFrameOrdinal: '0',
    endExclusiveFrameOrdinal: '6',
    windowResourcePolicy: {
      policyVersion: 'epoch-window-test-v3',
      maxFrameRecords: 10,
      maxBatchReads: 10,
      maxTotalReadBytes: 1_000_000,
    },
    projectRate: { numerator: '1', denominator: '1' },
    timelineStartFrame: '0',
    timelineFrameQueries: ['0', '1', '2', '3', '4', '5', '6', '7'],
    sourceAnchor: {
      sourceVersionSha256: fixture.sourceVersion.sourceVersionSha256,
      streamId: 'video-0',
      epochId: 'epoch-0',
      presentationTimestampTicks: '10000',
      secondsPerSourceTick: { numerator: '1', denominator: '1000' },
    },
    resourcePolicy: {
      policyVersion: 'timestamp-conform-test-v3',
      maxSourceFrames: 10,
      maxFrameQueries: 10,
    },
    ...(fixture.audioEvidence === null ? {} : {
      audio: {
        evidence: fixture.audioEvidence,
        endExclusiveTimelineFrame: '8',
      },
    }),
    ...overrides,
  });
}

type StoredObject = Readonly<{
  canonicalJson: string;
  byteLength: number;
  contentSha256: string;
}>;

type VerifiedFixture = Awaited<ReturnType<typeof verifiedFixture>>;

async function verifiedFixture(
  tag: string,
  options: Readonly<{
    withAudio?: boolean;
    fractionalAudioPhase?: boolean;
  }> = {},
) {
  const assetId = `asset-${tag}`;
  const sourceTimebase = { numerator: '1', denominator: '1000' } as const;
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: `media/${tag}.mkv` },
    byteLength: 99_999,
    providerVersion: { kind: 'R2_ETAG', value: `etag-${tag}` },
  });
  const sourceVersion = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-1' },
    assetId,
    mediaKind: 'video',
    byteLength: 99_999,
    contentSha256: hashUtf8(`source-${tag}`),
    storageVersion,
  });
  const qualification = qualificationFixture(
    assetId,
    storageVersion,
    sourceTimebase,
    tag,
    options.withAudio ?? false,
    options.fractionalAudioPhase ?? false,
  );
  const audioEvidence = options.withAudio
    ? createFixtureAudioEvidence(
        sourceVersion,
        qualification,
        tag,
        options.fractionalAudioPhase ?? false,
      )
    : null;
  const mapper = {
    mapperVersion: 'pts-epoch-mapper-v3',
    ffprobeVersion: 'ffprobe-8.1',
    commandPolicyVersion: 'pts-epoch-policy-v3',
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP' as const,
  };
  const specs = [
    epochSpec('10000', ['1000', '1000'], '0', 'INITIAL'),
    epochSpec('-2000', ['500', '1500'], '2', 'TIMESTAMP_RESET'),
    epochSpec('2000', ['1000', '1000'], '6', 'GAP'),
  ] as const;
  let firstFrameOrdinal = BigInt(0);
  const shards = specs.map((spec, sequence) => {
    const frames = framesFromSpec(spec);
    const shard = createMediaSourcePtsCadenceShardV1({
      sourceVersion,
      qualification,
      videoStreamIndex: 0,
      mapper,
      shardSequence: sequence,
      firstFrameOrdinal: firstFrameOrdinal.toString(),
      frames,
    });
    firstFrameOrdinal += BigInt(frames.length);
    return { shard, frames };
  });
  const mapBindingSha256 = mediaSourcePtsCadenceMapBindingSha256V1(shards[0]!.shard);
  const batches = shards.map(({ shard, frames }) => {
    const serialization = serializeMediaSourcePtsCadenceFrameBatchV2({
      mapBindingSha256,
      resourcePolicy: {
        policyVersion: mapper.commandPolicyVersion,
        maxCanonicalJsonBytes: 64_000,
        maxFrameRecords: 100,
      },
      shard,
      frames,
    });
    return {
      serialization,
      sidecar: createMediaSourcePtsCadenceFrameBatchSidecarV2({
        storage: 'R2_PRIVATE', serialization,
      }),
    };
  });
  const evidenceMaterial = {
    schemaVersion: 3,
    evidenceContractVersion: 'boundary-evidence-test-v3',
    epochId: 'epoch-1',
    boundaryKind: 'TIMESTAMP_RESET',
    detectorVersion: 'epoch-detector-v3',
    demuxerMarker: { packetOrdinal: '200', marker: 'DISCONTINUITY' },
  };
  const evidenceCanonicalJson = canonicalizeEditronJsonV1(evidenceMaterial);
  const evidenceStored = {
    canonicalJson: evidenceCanonicalJson,
    byteLength: Buffer.byteLength(evidenceCanonicalJson, 'utf8'),
    contentSha256: hashUtf8(evidenceCanonicalJson),
  };
  const evidenceSidecar = createMediaSourcePtsCadenceBoundaryEvidenceSidecarV3({
    evidenceContractVersion: 'boundary-evidence-test-v3',
    storage: 'R2_PRIVATE',
    byteLength: evidenceStored.byteLength,
    contentSha256: evidenceStored.contentSha256,
    mapBindingSha256,
    epochId: 'epoch-1',
  });
  const epochs = specs.map((spec, index) => ({
    epoch: presentationEpoch(spec, index),
    boundary: {
      classificationBasis: spec.classificationBasis,
      detectorVersion: 'epoch-detector-v3',
      externalEvidence: index === 1 ? evidenceSidecar : null,
    },
    batches: [batches[index]!],
  }));
  const indexSerialization = createMediaSourcePtsCadenceEpochIndexV3({
    sourceVersionSha256: sourceVersion.sourceVersionSha256,
    mapBindingSha256,
    videoStreamIndex: 0,
    sourceTimebase,
    resourcePolicy: {
      policyVersion: 'pts-epoch-index-policy-v3',
      maxCanonicalJsonBytes: 1_000_000,
      maxEpochEntries: 100,
      maxBatchEntries: 100,
    },
    epochs,
  });
  const indexSidecar = createMediaSourcePtsCadenceEpochIndexSidecarV3({
    storage: 'R2_PRIVATE', serialization: indexSerialization,
  });
  const objects = new Map<string, StoredObject>([
    [indexSidecar.objectKey, stored(indexSerialization)],
    ...batches.map((batch) => [
      batch.sidecar.objectKey, stored(batch.serialization),
    ] as const),
    [evidenceSidecar.objectKey, evidenceStored],
  ]);
  const reader = {
    read: vi.fn(async (sidecar: Parameters<
      MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3['read']
    >[0]) => {
      const object = objects.get(sidecar.objectKey);
      if (!object) throw new Error('OBJECT_NOT_FOUND');
      return object;
    }),
  };
  const verificationPolicy = {
    policyVersion: 'epoch-artifact-verification-policy-v3',
    maxBatchReads: 100,
    maxBoundaryEvidenceReads: 100,
    maxTotalArtifactBytes: 10_000_000,
    boundaryEvidenceRegistryVersion: 'boundary-registry-v3',
  } as const;
  const expectedSource = {
    sourceVersionSha256: sourceVersion.sourceVersionSha256,
    storageVersionSha256: sourceVersion.storageVersion.storageVersionSha256,
    sourceBindingSha256: qualification.sourceBindingSha256,
    technicalObservationSha256: qualification.observation.observationSha256,
    mapBindingSha256,
    videoStreamIndex: 0,
    sourceTimebase,
  };
  const verification = await verifyMediaSourcePtsCadenceEpochArtifactsV3({
    epochIndexSidecar: indexSidecar,
    expectedSource,
    verificationPolicy,
    storedObjectReader: reader,
    boundarySemanticVerifier: {
      verify: vi.fn(async ({ boundary, sidecar }) => (
        createMediaSourcePtsCadenceBoundarySemanticVerificationReceiptV3({
          registryVersion: verificationPolicy.boundaryEvidenceRegistryVersion,
          verifierId: 'test-boundary-verifier',
          verifierVersion: 'test-boundary-verifier-v3',
          boundary,
          sidecar,
        })
      )),
    },
  });
  if (verification.disposition !== 'EPOCH_ARTIFACT_SET_VERIFIED') {
    throw new Error(JSON.stringify(verification));
  }
  const baseAsset: MediaSourcePtsCadenceMapAssetStateInputV3 = {
    assetId,
    type: 'video',
    sourceVersionV1: sourceVersion,
    sourceQualificationV1: qualification,
  };
  const pending = createMediaSourcePtsCadenceMapAssetRecordV3({
    source: expectedSource,
    epochIndexSidecar: indexSidecar,
    verificationPolicy,
    now: new Date('2026-08-29T00:00:00.000Z'),
  });
  const claimed = claimMediaSourcePtsCadenceMapAssetRecordV3({
    record: pending,
    claimId: `claim-${tag}`,
    now: new Date('2026-08-29T00:01:00.000Z'),
    expiresAt: new Date('2026-08-29T00:10:00.000Z'),
  });
  const completed = completeMediaSourcePtsCadenceMapAssetRecordV3({
    record: claimed,
    claimId: `claim-${tag}`,
    verificationReceipt: verification,
    now: new Date('2026-08-29T00:02:00.000Z'),
  });
  const state = createMediaSourcePtsCadenceMapAssetStateV3({ asset: baseAsset, record: completed });
  return {
    asset: { ...baseAsset, ...state },
    baseAsset,
    sourceVersion,
    audioEvidence,
    batches,
    objects,
    reader,
  };
}

type EpochSpec = Readonly<{
  start: string;
  durations: readonly string[];
  canonicalStart: string;
  boundaryKind: PresentationEpochV1['boundaryKind'];
  classificationBasis:
    | 'FIRST_DECODED_PRESENTATION'
    | 'PTS_DELTA'
    | 'DEMUXER_DISCONTINUITY_MARKER';
}>;

function epochSpec(
  start: string,
  durations: readonly string[],
  canonicalStart: string,
  boundaryKind: EpochSpec['boundaryKind'],
): EpochSpec {
  return {
    start,
    durations,
    canonicalStart,
    boundaryKind,
    classificationBasis: boundaryKind === 'INITIAL'
      ? 'FIRST_DECODED_PRESENTATION'
      : boundaryKind === 'TIMESTAMP_RESET'
        ? 'DEMUXER_DISCONTINUITY_MARKER'
        : 'PTS_DELTA',
  };
}

function presentationEpoch(spec: EpochSpec, index: number): PresentationEpochV1 {
  const end = spec.durations.reduce(
    (pts, duration) => pts + BigInt(duration),
    BigInt(spec.start),
  );
  return {
    schemaVersion: 1,
    contractVersion: CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
    kind: 'presentation-epoch',
    epochId: `epoch-${index}`,
    streamId: 'video-0',
    secondsPerSourceTick: { numerator: '1', denominator: '1000' },
    sourceStartPresentationTimestampTicks: spec.start,
    sourceEndExclusivePresentationTimestampTicks: end.toString(),
    canonicalStartTime: { ticks: spec.canonicalStart, timescale: '1' },
    boundaryKind: spec.boundaryKind,
  };
}

function framesFromSpec(spec: EpochSpec): readonly MediaSourcePtsCadenceFrameInputV1[] {
  let pts = BigInt(spec.start);
  return spec.durations.map((durationTicks) => {
    const frame = { presentationTimestampTicks: pts.toString(), durationTicks };
    pts += BigInt(durationTicks);
    return frame;
  });
}

function qualificationFixture(
  assetId: string,
  storageVersion: ReturnType<typeof createMediaSourceStorageVersionV1>,
  sourceTimebase: Readonly<{ numerator: string; denominator: string }>,
  tag: string,
  withAudio: boolean,
  fractionalAudioPhase: boolean,
) {
  const observation = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: 'ffprobe-8.1',
    formatName: 'matroska',
    durationMilliseconds: 20_000,
    startTimeMilliseconds: -2_000,
    videoStreams: [{
      streamIndex: 0,
      codec: 'h264',
      codedWidth: 1920,
      codedHeight: 1080,
      pixelFormat: 'yuv420p',
      sourceTimebase,
      sourceStartPts: '-2000',
      sourceDurationTicks: '20000',
      averageFrameRate: { numerator: '24', denominator: '1' },
      realFrameRate: { numerator: '24', denominator: '1' },
      frameCount: '6',
      colorSpace: 'bt709',
      colorTransfer: 'bt709',
      colorPrimaries: 'bt709',
      colorRange: 'tv',
      timecode: null,
      reelId: null,
    }],
    audioStreams: withAudio ? [{
      streamIndex: 1,
      codec: 'pcm_s16le',
      sampleRate: '48000',
      channelCount: 2,
      channelLayout: 'stereo',
      sourceTimebase: fractionalAudioPhase
        ? { numerator: '1', denominator: '90000' }
        : { numerator: '1', denominator: '48000' },
      sourceStartPts: fractionalAudioPhase ? '900001' : '480000',
      sourceDurationTicks: fractionalAudioPhase ? '720000' : '384000',
    }] : [],
  };
  return {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_QUALIFICATION_V1' as const,
    status: 'MEASURED_TECHNICAL' as const,
    assetId,
    locator: storageVersion.locator,
    sourceBindingSha256: hashUtf8(`source-binding-${tag}`),
    requestId: `epoch-index-${tag}`,
    attemptCount: 1,
    requestedAt: '2026-08-29T00:00:00.000Z',
    startedAt: '2026-08-29T00:00:01.000Z',
    completedAt: '2026-08-29T00:00:02.000Z',
    storageVersion,
    observation: { ...observation, observationSha256: hashEditronCanonicalJsonV1(observation) },
    diagnostic: null,
  };
}

function createFixtureAudioEvidence(
  sourceVersion: ReturnType<typeof createMediaSourceVersionV1>,
  qualification: ReturnType<typeof qualificationFixture>,
  tag: string,
  fractionalAudioPhase: boolean,
) {
  const binding = createMediaSourceAudioStreamBindingV1({
    sourceVersion,
    qualification,
    audioStreamIndex: 1,
  });
  const frames = fractionalAudioPhase
    ? [
        { presentationTimestampTicks: '900001', decodedSampleFrameCount: '96000' },
        { presentationTimestampTicks: '-179999', decodedSampleFrameCount: '96000' },
        { presentationTimestampTicks: '180001', decodedSampleFrameCount: '96000' },
      ]
    : [
        { presentationTimestampTicks: '480000', decodedSampleFrameCount: '96000' },
        { presentationTimestampTicks: '-96000', decodedSampleFrameCount: '96000' },
        { presentationTimestampTicks: '96000', decodedSampleFrameCount: '96000' },
      ];
  return createMediaSourceAudioSampleEpochMapV1({
    binding,
    toolchain: {
      adapterVersion: MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_ADAPTER_VERSION_V1,
      ffmpegVersion: 'ffmpeg-8.1',
      ffprobeVersion: 'ffprobe-8.1',
    },
    resourcePolicy: {
      policyVersion: 'audio-sample-epoch-test-v1',
      maxSourceBytes: 100_000,
      maxCanonicalJsonBytes: 1_000_000,
      maxDecodedFrameEntries: 10,
      maxEpochEntries: 10,
      maxDecodedSampleFrames: 1_000_000,
      maxDecodedPcmBytes: 3_000_000,
      timeoutMs: 10_000,
    },
    frames,
    pcm: {
      decodedByteLength: 2_304_000,
      decodedPcmSha256: hashUtf8(`decoded-pcm-${tag}`),
    },
  });
}

function stored(value: StoredObject): StoredObject {
  return {
    canonicalJson: value.canonicalJson,
    byteLength: value.byteLength,
    contentSha256: value.contentSha256,
  };
}

function hashUtf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
