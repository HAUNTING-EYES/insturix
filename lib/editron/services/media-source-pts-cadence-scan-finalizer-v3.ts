import {
  CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
  parsePresentationEpochV1,
  type PresentationEpochV1,
} from '../contracts/canonical-media-time-v1';

import { deepFreezeEditronJsonV1 } from './canonical-json-v1';
import {
  deriveMediaSourcePtsCadenceEpochCanonicalStartTimeV3,
  type MediaSourcePtsCadenceDirectEpochBoundaryKindV3,
} from './media-source-pts-cadence-epoch-boundary-v3';
import {
  normalizeMediaSourcePtsCadenceEpochArtifactExpectedSourceV3,
  type MediaSourcePtsCadenceEpochArtifactExpectedSourceV3,
} from './media-source-pts-cadence-epoch-artifact-verifier-v3';
import {
  createMediaSourcePtsCadenceEpochIndexSidecarV3,
  createMediaSourcePtsCadenceEpochIndexV3,
  expectedMediaSourcePtsCadenceStreamIdV3,
  type CreateMediaSourcePtsCadenceEpochIndexInputV3,
  type MediaSourcePtsCadenceEpochIndexResourcePolicyV3,
  type MediaSourcePtsCadenceEpochIndexSerializationV3,
  type MediaSourcePtsCadenceEpochIndexSidecarV3,
} from './media-source-pts-cadence-epoch-index-v3';
import {
  assertMediaSourcePtsCadenceEpochScanRequestV3,
} from './media-source-pts-cadence-epoch-scan-transport-v3';
import type { MediaSourcePtsCadencePrivateSidecarPortV1 }
  from './media-source-pts-cadence-map-lifecycle-v1';
import type { MediaSourcePtsCadenceR2PrivateArtifactPortV2 }
  from './media-source-pts-cadence-r2-private-sidecar-v1';
import {
  assertMediaSourcePtsCadenceScanResultMatchesRequestV1,
  promoteMediaSourcePtsCadenceScanBatchV1,
  type PromotedMediaSourcePtsCadenceBatchV1,
} from './media-source-pts-cadence-scan-promoter-v1';
import type { MediaSourcePtsCadenceScanStagingReaderV1 }
  from './media-source-pts-cadence-scan-r2-reader-v1';
import {
  assertMediaSourcePtsCadenceEpochScanResultV3,
  type MediaSourcePtsCadenceScanResultV1,
} from './media-source-pts-cadence-scan-result-v1';
import type { MediaSourcePtsCadenceScanRequestV1 }
  from './media-source-pts-cadence-scan-transport-v1';
import type { MediaSourceQualificationRecordV1 } from './media-source-qualification-v1';
import type { MediaSourceVersionV1 } from './media-source-version-v1';

export const MEDIA_SOURCE_PTS_CADENCE_DIRECT_EPOCH_DETECTOR_VERSION_V3 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_EXACT_FRAME_DELTA_V3' as const;

export type MediaSourcePtsCadenceScanFinalizationPreparationResultV3 =
  | Readonly<{
      disposition: 'PREPARED';
      expectedSource: MediaSourcePtsCadenceEpochArtifactExpectedSourceV3;
      epochIndex: MediaSourcePtsCadenceEpochIndexSerializationV3;
      epochIndexSidecar: MediaSourcePtsCadenceEpochIndexSidecarV3;
      promotedBatchCount: number;
    }>
  | Readonly<{
      disposition: 'UNVERIFIABLE';
      reason: 'SCAN_RESULT_UNVERIFIABLE' | 'BOUNDARY_EVIDENCE_REQUIRED';
      diagnostic: string;
      promotedBatchCount: number;
    }>;

type EpochGroupV3 = {
  boundaryKind: MediaSourcePtsCadenceDirectEpochBoundaryKindV3;
  batches: PromotedMediaSourcePtsCadenceBatchV1[];
};

/**
 * Prepares, but does not publish, a direct V3 epoch index. Immutable promoted
 * batches may remain unreachable after a later failure or race; deletion is
 * deliberately left to a separately governed content-addressed GC owner.
 */
export async function prepareMediaSourcePtsCadenceScanFinalizationV3(input: {
  request: MediaSourcePtsCadenceScanRequestV1;
  result: MediaSourcePtsCadenceScanResultV1;
  sourceVersion: MediaSourceVersionV1;
  qualification: MediaSourceQualificationRecordV1;
  epochIndexResourcePolicy: MediaSourcePtsCadenceEpochIndexResourcePolicyV3;
  stagingReader: MediaSourcePtsCadenceScanStagingReaderV1;
  descriptorPort: MediaSourcePtsCadencePrivateSidecarPortV1;
  artifactPort: MediaSourcePtsCadenceR2PrivateArtifactPortV2;
  lifecycle?: Readonly<{ heartbeat(): Promise<void> }>;
}): Promise<MediaSourcePtsCadenceScanFinalizationPreparationResultV3> {
  const request = assertMediaSourcePtsCadenceEpochScanRequestV3(input.request);
  const result = assertMediaSourcePtsCadenceEpochScanResultV3(input.result);
  assertMediaSourcePtsCadenceScanResultMatchesRequestV1(request, result);
  if (result.status !== 'COMPLETE') {
    return unverifiable('SCAN_RESULT_UNVERIFIABLE', result.diagnostic!, 0);
  }

  const groups: EpochGroupV3[] = [];
  let currentGroup: EpochGroupV3 | null = null;
  let previousBatch: PromotedMediaSourcePtsCadenceBatchV1 | null = null;
  let nextShardSequence = 0;
  let nextFrameOrdinal = '0';
  await heartbeat(input);

  for (let scanBatchIndex = 0;
    scanBatchIndex < result.batches.length;
    scanBatchIndex += 1) {
    await heartbeat(input);
    const promoted = await promoteMediaSourcePtsCadenceScanBatchV1({
      request,
      result,
      scanBatchIndex,
      nextShardSequence,
      nextFrameOrdinal,
      sourceVersion: input.sourceVersion,
      qualification: input.qualification,
      stagingReader: input.stagingReader,
      descriptorPort: input.descriptorPort,
      artifactPort: input.artifactPort,
    });
    nextShardSequence = promoted.nextShardSequence;
    nextFrameOrdinal = promoted.nextFrameOrdinal;

    for (const batch of promoted.batches) {
      const boundary = previousBatch === null
        ? 'INITIAL'
        : classifyExactBatchBoundary(previousBatch, batch);
      if (boundary === 'BOUNDARY_EVIDENCE_REQUIRED') {
        return unverifiable(
          'BOUNDARY_EVIDENCE_REQUIRED',
          'SCAN_BACKWARD_BOUNDARY_EVIDENCE_REQUIRED',
          nextShardSequence,
        );
      }
      if (boundary !== 'CONTIGUOUS') {
        currentGroup = { boundaryKind: boundary, batches: [] };
        groups.push(currentGroup);
      }
      if (currentGroup === null) {
        throw new Error('MEDIA_SOURCE_PTS_CADENCE_V3_FINALIZER_GROUP_MISSING');
      }
      currentGroup.batches.push(batch);
      previousBatch = batch;
    }
    await heartbeat(input);
  }

  if (nextFrameOrdinal !== result.totalFrameCount || groups.length === 0) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_V3_FINALIZER_PROGRESS_INCOMPLETE');
  }
  const epochIndex = createMediaSourcePtsCadenceEpochIndexV3({
    sourceVersionSha256: request.mapBinding.sourceVersionSha256,
    mapBindingSha256: request.mapBindingSha256,
    videoStreamIndex: request.mapBinding.videoStreamIndex,
    sourceTimebase: request.mapBinding.sourceTimebase,
    resourcePolicy: input.epochIndexResourcePolicy,
    epochs: createEpochCandidates(request, groups),
  });
  const epochIndexSidecar = createMediaSourcePtsCadenceEpochIndexSidecarV3({
    storage: 'R2_PRIVATE',
    serialization: epochIndex,
  });
  return frozen({
    disposition: 'PREPARED',
    expectedSource: expectedSource(request),
    epochIndex,
    epochIndexSidecar,
    promotedBatchCount: nextShardSequence,
  });
}

type ExactBatchBoundaryV3 =
  | 'CONTIGUOUS'
  | 'GAP'
  | 'OVERLAP'
  | 'BOUNDARY_EVIDENCE_REQUIRED';

function classifyExactBatchBoundary(
  previous: PromotedMediaSourcePtsCadenceBatchV1,
  next: PromotedMediaSourcePtsCadenceBatchV1,
): ExactBatchBoundaryV3 {
  const previousLastFrame = previous.serialization.payload.frames.at(-1)!;
  const previousPresentationTimestamp = BigInt(
    previousLastFrame.presentationTimestampTicks,
  );
  const previousEnd = previousPresentationTimestamp
    + BigInt(previousLastFrame.durationTicks);
  const nextStart = BigInt(
    next.serialization.payload.frames[0]!.presentationTimestampTicks,
  );
  if (nextStart === previousEnd) return 'CONTIGUOUS';
  if (nextStart > previousEnd) return 'GAP';
  if (nextStart > previousPresentationTimestamp) return 'OVERLAP';
  return 'BOUNDARY_EVIDENCE_REQUIRED';
}

function createEpochCandidates(
  request: MediaSourcePtsCadenceScanRequestV1,
  groups: readonly EpochGroupV3[],
): CreateMediaSourcePtsCadenceEpochIndexInputV3['epochs'] {
  const streamId = expectedMediaSourcePtsCadenceStreamIdV3(
    request.mapBinding.videoStreamIndex,
  );
  let previousEpoch: PresentationEpochV1 | null = null;
  return groups.map((group) => {
    const first = group.batches[0]!.serialization.payload.shard;
    const last = group.batches.at(-1)!.serialization.payload.shard;
    const epoch = parsePresentationEpochV1({
      schemaVersion: 1,
      contractVersion: CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
      kind: 'presentation-epoch',
      epochId: `direct-v3-epoch-${first.firstFrameOrdinal}`,
      streamId,
      secondsPerSourceTick: request.mapBinding.sourceTimebase,
      sourceStartPresentationTimestampTicks: first.startPresentationTimestampTicks,
      sourceEndExclusivePresentationTimestampTicks:
        last.endExclusivePresentationTimestampTicks,
      canonicalStartTime: deriveMediaSourcePtsCadenceEpochCanonicalStartTimeV3({
        previousEpoch,
        boundaryKind: group.boundaryKind,
        nextStartPresentationTimestampTicks: first.startPresentationTimestampTicks,
      }),
      boundaryKind: group.boundaryKind,
    });
    const candidate = {
      epoch,
      boundary: {
        classificationBasis: group.boundaryKind === 'INITIAL'
          ? 'FIRST_DECODED_PRESENTATION' as const
          : 'PTS_DELTA' as const,
        detectorVersion: MEDIA_SOURCE_PTS_CADENCE_DIRECT_EPOCH_DETECTOR_VERSION_V3,
        externalEvidence: null,
      },
      batches: group.batches.map((batch) => ({
        serialization: batch.serialization,
        sidecar: batch.frameSidecar,
      })),
    };
    previousEpoch = epoch;
    return candidate;
  });
}

function expectedSource(
  request: MediaSourcePtsCadenceScanRequestV1,
): MediaSourcePtsCadenceEpochArtifactExpectedSourceV3 {
  const binding = request.mapBinding;
  return normalizeMediaSourcePtsCadenceEpochArtifactExpectedSourceV3({
    sourceVersionSha256: binding.sourceVersionSha256,
    storageVersionSha256: binding.storageVersionSha256,
    sourceBindingSha256: binding.sourceBindingSha256,
    technicalObservationSha256: binding.technicalObservationSha256,
    mapBindingSha256: request.mapBindingSha256,
    videoStreamIndex: binding.videoStreamIndex,
    sourceTimebase: binding.sourceTimebase,
  });
}

function heartbeat(
  input: Parameters<typeof prepareMediaSourcePtsCadenceScanFinalizationV3>[0],
): Promise<void> {
  return input.lifecycle?.heartbeat() ?? Promise.resolve();
}

function unverifiable(
  reason: Extract<
    MediaSourcePtsCadenceScanFinalizationPreparationResultV3,
    { disposition: 'UNVERIFIABLE' }
  >['reason'],
  diagnostic: string,
  promotedBatchCount: number,
): Extract<
  MediaSourcePtsCadenceScanFinalizationPreparationResultV3,
  { disposition: 'UNVERIFIABLE' }
> {
  return frozen({
    disposition: 'UNVERIFIABLE',
    reason,
    diagnostic,
    promotedBatchCount,
  });
}

function frozen<T extends object>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(value);
}
