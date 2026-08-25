import type { MediaSourcePtsCadenceFrameBatchSerializationV2 } from './media-source-pts-cadence-frame-batch-v2';
import { serializeMediaSourcePtsCadenceFrameBatchV2 } from './media-source-pts-cadence-frame-batch-v2';
import type { MediaSourcePtsCadencePrivateSidecarPortV1, MediaSourcePtsCadencePrivateSidecarV1 } from './media-source-pts-cadence-map-lifecycle-v1';
import { mediaSourcePtsCadenceMapBindingSha256V1 } from './media-source-pts-cadence-map-lifecycle-v1';
import {
  createMediaSourcePtsCadenceFrameBatchSidecarV2,
  type MediaSourcePtsCadenceFrameBatchSidecarV2,
} from './media-source-pts-cadence-manifest-index-v2';
import { serializeMediaSourcePtsCadenceShardSidecarV1 } from './media-source-pts-cadence-private-sidecar-codec-v1';
import type { MediaSourcePtsCadenceR2PrivateArtifactPortV2 } from './media-source-pts-cadence-r2-private-sidecar-v1';
import type { MediaSourcePtsCadenceScanStagingReaderV1 } from './media-source-pts-cadence-scan-r2-reader-v1';
import {
  assertMediaSourcePtsCadenceScanResultV1,
  type MediaSourcePtsCadenceScanResultBatchV1,
  type MediaSourcePtsCadenceScanResultV1,
} from './media-source-pts-cadence-scan-result-v1';
import { assertMediaSourcePtsCadenceScanRequestV1, type MediaSourcePtsCadenceScanRequestV1 } from './media-source-pts-cadence-scan-transport-v1';
import { createMediaSourcePtsCadenceShardV1, type MediaSourcePtsCadenceFrameInputV1 } from './media-source-pts-cadence-shard-v1';
import type { MediaSourceQualificationRecordV1 } from './media-source-qualification-v1';
import type { MediaSourceVersionV1 } from './media-source-version-v1';

export type PromotedMediaSourcePtsCadenceBatchV1 = Readonly<{
  serialization: Readonly<MediaSourcePtsCadenceFrameBatchSerializationV2>;
  frameSidecar: Readonly<MediaSourcePtsCadenceFrameBatchSidecarV2>;
  descriptorSidecar: Readonly<MediaSourcePtsCadencePrivateSidecarV1>;
}>;

export type PromoteMediaSourcePtsCadenceScanBatchResultV1 = Readonly<{
  batches: readonly PromotedMediaSourcePtsCadenceBatchV1[];
  nextShardSequence: number;
  nextFrameOrdinal: string;
}>;

/**
 * Converts one temporary scan batch into canonical, recoverable V2 artifacts.
 * It never advances lifecycle or MEDIA_ASSETS state; that remains the existing
 * owner checkpoint's responsibility after independent artifact verification.
 */
export async function promoteMediaSourcePtsCadenceScanBatchV1(input: {
  request: MediaSourcePtsCadenceScanRequestV1;
  result: MediaSourcePtsCadenceScanResultV1;
  scanBatchIndex: number;
  nextShardSequence: number;
  nextFrameOrdinal: string;
  sourceVersion: MediaSourceVersionV1;
  qualification: MediaSourceQualificationRecordV1;
  stagingReader: MediaSourcePtsCadenceScanStagingReaderV1;
  descriptorPort: MediaSourcePtsCadencePrivateSidecarPortV1;
  artifactPort: MediaSourcePtsCadenceR2PrivateArtifactPortV2;
}): Promise<PromoteMediaSourcePtsCadenceScanBatchResultV1> {
  const request = assertMediaSourcePtsCadenceScanRequestV1(input.request);
  const result = assertMediaSourcePtsCadenceScanResultV1(input.result);
  if (result.status !== 'COMPLETE') throw new Error('MEDIA_SOURCE_PTS_SCAN_PROMOTION_RESULT_INCOMPLETE');
  assertResultMatchesRequest(request, result);
  const summary = result.batches[input.scanBatchIndex];
  if (!summary) throw new Error('MEDIA_SOURCE_PTS_SCAN_PROMOTION_BATCH_MISSING');
  const nextFrameOrdinal = nonNegativeInteger(input.nextFrameOrdinal);
  if (nextFrameOrdinal !== summary.firstFrameOrdinal) {
    throw new Error('MEDIA_SOURCE_PTS_SCAN_PROMOTION_ORDINAL_MISMATCH');
  }
  const staging = await input.stagingReader.read(summary.sidecar);
  assertStagingMatches(request, summary, staging);

  const promoted: PromotedMediaSourcePtsCadenceBatchV1[] = [];
  const next = await promoteFrames({
    frames: staging.frames,
    sequence: safeSequence(input.nextShardSequence),
    firstOrdinal: nextFrameOrdinal,
    request,
    sourceVersion: input.sourceVersion,
    qualification: input.qualification,
    descriptorPort: input.descriptorPort,
    artifactPort: input.artifactPort,
    output: promoted,
  });
  return {
    batches: Object.freeze(promoted),
    nextShardSequence: next.sequence,
    nextFrameOrdinal: next.firstOrdinal,
  };
}

async function promoteFrames(input: {
  frames: readonly MediaSourcePtsCadenceFrameInputV1[];
  sequence: number;
  firstOrdinal: string;
  request: MediaSourcePtsCadenceScanRequestV1;
  sourceVersion: MediaSourceVersionV1;
  qualification: MediaSourceQualificationRecordV1;
  descriptorPort: MediaSourcePtsCadencePrivateSidecarPortV1;
  artifactPort: MediaSourcePtsCadenceR2PrivateArtifactPortV2;
  output: PromotedMediaSourcePtsCadenceBatchV1[];
}): Promise<{ sequence: number; firstOrdinal: string }> {
  const shard = createMediaSourcePtsCadenceShardV1({
    sourceVersion: input.sourceVersion,
    qualification: input.qualification,
    videoStreamIndex: input.request.mapBinding.videoStreamIndex,
    mapper: input.request.mapBinding.mapper,
    shardSequence: input.sequence,
    firstFrameOrdinal: input.firstOrdinal,
    frames: input.frames,
  });
  if (mediaSourcePtsCadenceMapBindingSha256V1(shard) !== input.request.mapBindingSha256) {
    throw new Error('MEDIA_SOURCE_PTS_SCAN_PROMOTION_SOURCE_BINDING_MISMATCH');
  }

  let serialization: Readonly<MediaSourcePtsCadenceFrameBatchSerializationV2>;
  try {
    serialization = serializeMediaSourcePtsCadenceFrameBatchV2({
      mapBindingSha256: input.request.mapBindingSha256,
      resourcePolicy: input.request.resourcePolicy,
      shard,
      frames: input.frames,
    });
  } catch (error) {
    if (!(error instanceof Error)
      || error.message !== 'MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_BYTE_LIMIT_EXCEEDED'
      || input.frames.length === 1) throw error;
    const midpoint = Math.floor(input.frames.length / 2);
    const first = await promoteFrames({ ...input, frames: input.frames.slice(0, midpoint) });
    return promoteFrames({
      ...input,
      frames: input.frames.slice(midpoint),
      sequence: first.sequence,
      firstOrdinal: first.firstOrdinal,
    });
  }

  const frameSidecar = createMediaSourcePtsCadenceFrameBatchSidecarV2({
    storage: 'R2_PRIVATE',
    serialization,
  });
  const descriptorSerialization = serializeMediaSourcePtsCadenceShardSidecarV1({
    storage: 'R2_PRIVATE',
    mapBindingSha256: input.request.mapBindingSha256,
    shard,
  });
  await input.artifactPort.writeImmutableFrameBatch({ serialization, expected: frameSidecar });
  const descriptorSidecar = await input.descriptorPort.writeImmutableShard({
    mapBindingSha256: input.request.mapBindingSha256,
    shard,
    expected: descriptorSerialization.sidecar,
  });
  input.output.push({ serialization, frameSidecar, descriptorSidecar });
  return {
    sequence: safeSequence(input.sequence + 1),
    firstOrdinal: (BigInt(input.firstOrdinal) + BigInt(input.frames.length)).toString(),
  };
}

function assertResultMatchesRequest(
  request: MediaSourcePtsCadenceScanRequestV1,
  result: MediaSourcePtsCadenceScanResultV1,
): void {
  if (result.mapBindingSha256 !== request.mapBindingSha256
    || result.ffprobeVersion !== request.mapBinding.mapper.ffprobeVersion
    || result.videoStreamIndex !== request.mapBinding.videoStreamIndex
    || !sameRational(result.sourceTimebase, request.mapBinding.sourceTimebase)
    || !samePolicy(result.resourcePolicy, request.resourcePolicy)) {
    throw new Error('MEDIA_SOURCE_PTS_SCAN_PROMOTION_RESULT_BINDING_MISMATCH');
  }
}

function assertStagingMatches(
  request: MediaSourcePtsCadenceScanRequestV1,
  summary: MediaSourcePtsCadenceScanResultBatchV1,
  staging: Awaited<ReturnType<MediaSourcePtsCadenceScanStagingReaderV1['read']>>,
): void {
  const last = staging.frames.at(-1)!;
  if (staging.mapBindingSha256 !== request.mapBindingSha256
    || !samePolicy(staging.resourcePolicy, request.resourcePolicy)
    || !sameRational(staging.sourceTimebase, request.mapBinding.sourceTimebase)
    || staging.shardSequence !== summary.shardSequence
    || staging.firstFrameOrdinal !== summary.firstFrameOrdinal
    || staging.previousBatchContentSha256 !== summary.previousBatchContentSha256
    || String(staging.frames.length) !== summary.frameCount
    || staging.frames[0]!.presentationTimestampTicks !== summary.startPresentationTimestampTicks
    || (BigInt(last.presentationTimestampTicks) + BigInt(last.durationTicks)).toString()
      !== summary.endExclusivePresentationTimestampTicks) {
    throw new Error('MEDIA_SOURCE_PTS_SCAN_PROMOTION_STAGING_MISMATCH');
  }
}

function samePolicy(left: { policyVersion: string; maxCanonicalJsonBytes: number; maxFrameRecords: number }, right: typeof left) {
  return left.policyVersion === right.policyVersion
    && left.maxCanonicalJsonBytes === right.maxCanonicalJsonBytes
    && left.maxFrameRecords === right.maxFrameRecords;
}

function sameRational(left: { numerator: string; denominator: string }, right: typeof left) {
  return left.numerator === right.numerator && left.denominator === right.denominator;
}

function safeSequence(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error('MEDIA_SOURCE_PTS_SCAN_PROMOTION_SEQUENCE_INVALID');
  }
  return Number(value);
}

function nonNegativeInteger(value: unknown): string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,127})$/.test(value)) {
    throw new Error('MEDIA_SOURCE_PTS_SCAN_PROMOTION_ORDINAL_INVALID');
  }
  return BigInt(value).toString();
}
