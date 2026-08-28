import { createHash } from 'node:crypto';

import {
  parseExactRationalRateV1,
  parsePresentationEpochV1,
  type ExactRationalRateV1,
  type PresentationEpochV1,
} from '../contracts/canonical-media-time-v1';

import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  createMediaSourcePtsCadenceEpochBoundaryV3,
  assertMediaSourcePtsCadenceEpochBoundaryV3,
  assertMediaSourcePtsCadenceEpochHandoffV3,
  type MediaSourcePtsCadenceBoundaryEvidenceSidecarV3,
  type MediaSourcePtsCadenceEpochBoundaryBasisV3,
  type MediaSourcePtsCadenceEpochBoundaryV3,
} from './media-source-pts-cadence-epoch-boundary-v3';
import {
  MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_ABSOLUTE_MAX_BYTES_V2,
  parseMediaSourcePtsCadenceFrameBatchV2,
  type MediaSourcePtsCadenceFrameBatchSerializationV2,
} from './media-source-pts-cadence-frame-batch-v2';
import {
  MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_SIDECAR_KIND_V2,
  createMediaSourcePtsCadenceFrameBatchSidecarV2,
  expectedMediaSourcePtsCadenceFrameBatchObjectKeyV2,
  type MediaSourcePtsCadenceFrameBatchSidecarV2,
} from './media-source-pts-cadence-manifest-index-v2';

export const MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_KIND_V3 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_V3' as const;
export const MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_SIDECAR_KIND_V3 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_SIDECAR_V3' as const;
export const MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_ABSOLUTE_MAX_BYTES_V3 = 8 * 1024 * 1024;
export const MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_ABSOLUTE_MAX_EPOCHS_V3 = 10_000;
export const MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_ABSOLUTE_MAX_BATCHES_V3 = 100_000;

export type MediaSourcePtsCadenceEpochIndexResourcePolicyV3 = Readonly<{
  policyVersion: string;
  maxCanonicalJsonBytes: number;
  maxEpochEntries: number;
  maxBatchEntries: number;
}>;

export type MediaSourcePtsCadenceEpochIndexBatchEntryV3 = Readonly<{
  batchSequence: number;
  epochId: string;
  firstFrameOrdinal: string;
  frameCount: string;
  startPresentationTimestampTicks: string;
  endExclusivePresentationTimestampTicks: string;
  shardDescriptorSha256: string;
  sidecar: MediaSourcePtsCadenceFrameBatchSidecarV2;
}>;

export type MediaSourcePtsCadenceEpochIndexEntryV3 = Readonly<{
  epoch: PresentationEpochV1;
  boundary: MediaSourcePtsCadenceEpochBoundaryV3;
  firstBatchSequence: number;
  endExclusiveBatchSequence: number;
  firstFrameOrdinal: string;
  endExclusiveFrameOrdinal: string;
}>;

export type MediaSourcePtsCadenceEpochIndexV3 = Readonly<{
  schemaVersion: 3;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_KIND_V3;
  sourceVersionSha256: string;
  mapBindingSha256: string;
  streamId: string;
  videoStreamIndex: number;
  sourceTimebase: ExactRationalRateV1;
  resourcePolicy: MediaSourcePtsCadenceEpochIndexResourcePolicyV3;
  epochs: readonly MediaSourcePtsCadenceEpochIndexEntryV3[];
  batches: readonly MediaSourcePtsCadenceEpochIndexBatchEntryV3[];
}>;

export type MediaSourcePtsCadenceEpochIndexSerializationV3 = Readonly<{
  index: MediaSourcePtsCadenceEpochIndexV3;
  canonicalJson: string;
  byteLength: number;
  contentSha256: string;
}>;

export type MediaSourcePtsCadenceEpochIndexSidecarV3 = Readonly<{
  schemaVersion: 3;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_SIDECAR_KIND_V3;
  storage: 'R2_PRIVATE' | 'GCS_PRIVATE';
  objectKey: string;
  byteLength: number;
  contentSha256: string;
  sourceVersionSha256: string;
  mapBindingSha256: string;
  epochCount: number;
  batchCount: number;
  endExclusiveFrameOrdinal: string;
}>;

export type CreateMediaSourcePtsCadenceEpochIndexInputV3 = Readonly<{
  sourceVersionSha256: string;
  mapBindingSha256: string;
  videoStreamIndex: number;
  sourceTimebase: ExactRationalRateV1;
  resourcePolicy: MediaSourcePtsCadenceEpochIndexResourcePolicyV3;
  epochs: readonly Readonly<{
    epoch: PresentationEpochV1;
    boundary: Readonly<{
      classificationBasis: MediaSourcePtsCadenceEpochBoundaryBasisV3;
      detectorVersion: string;
      externalEvidence: MediaSourcePtsCadenceBoundaryEvidenceSidecarV3 | null;
    }>;
    batches: readonly Readonly<{
      serialization: MediaSourcePtsCadenceFrameBatchSerializationV2;
      sidecar: MediaSourcePtsCadenceFrameBatchSidecarV2;
    }>[];
  }>[];
}>;

/**
 * Builds a recoverable epoch/discontinuity index over immutable V2 frame
 * batches. V2 batch bytes remain unchanged and contiguous; V3 owns only their
 * epoch membership, exact canonical handoffs, and a new hash-bound index.
 */
export function createMediaSourcePtsCadenceEpochIndexV3(
  input: CreateMediaSourcePtsCadenceEpochIndexInputV3,
): MediaSourcePtsCadenceEpochIndexSerializationV3 {
  const sourceVersionSha256 = sha256(
    input.sourceVersionSha256,
    'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_SOURCE_VERSION_INVALID',
  );
  const mapBindingSha256 = sha256(
    input.mapBindingSha256,
    'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_MAP_BINDING_INVALID',
  );
  const videoStreamIndex = nonNegativeSafeInteger(
    input.videoStreamIndex,
    'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_STREAM_INDEX_INVALID',
  );
  const streamId = expectedMediaSourcePtsCadenceStreamIdV3(videoStreamIndex);
  const sourceTimebase = parseExactRationalRateV1(input.sourceTimebase);
  const resourcePolicy = assertResourcePolicy(input.resourcePolicy);
  if (!Array.isArray(input.epochs) || input.epochs.length === 0
    || input.epochs.length > resourcePolicy.maxEpochEntries) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_EPOCH_COUNT_INVALID');
  }

  const batches: MediaSourcePtsCadenceEpochIndexBatchEntryV3[] = [];
  const epochs: MediaSourcePtsCadenceEpochIndexEntryV3[] = [];
  let previousEpoch: PresentationEpochV1 | null = null;
  let previousBatchContentSha256: string | null = null;
  let nextFrameOrdinal = BigInt(0);

  for (const candidate of input.epochs) {
    const epoch = parsePresentationEpochV1(candidate.epoch);
    if (epoch.streamId !== streamId || !sameRate(epoch.secondsPerSourceTick, sourceTimebase)) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_EPOCH_SCOPE_MISMATCH');
    }
    if (!Array.isArray(candidate.batches) || candidate.batches.length === 0) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_EPOCH_BATCHES_EMPTY');
    }
    const firstBatchSequence = batches.length;
    const firstFrameOrdinal = nextFrameOrdinal.toString();
    let previousEpochBatchEnd: string | null = null;

    for (const candidateBatch of candidate.batches) {
      if (batches.length >= resourcePolicy.maxBatchEntries) {
        throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BATCH_COUNT_INVALID');
      }
      const serialization = assertBatchSerialization(candidateBatch.serialization);
      const shard = serialization.payload.shard;
      const expectedSidecar = createMediaSourcePtsCadenceFrameBatchSidecarV2({
        storage: candidateBatch.sidecar.storage,
        serialization,
      });
      if (canonicalizeEditronJsonV1(expectedSidecar)
        !== canonicalizeEditronJsonV1(candidateBatch.sidecar)) {
        throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BATCH_SIDECAR_MISMATCH');
      }
      if (serialization.payload.mapBindingSha256 !== mapBindingSha256
        || shard.sourceVersionSha256 !== sourceVersionSha256
        || shard.videoStreamIndex !== videoStreamIndex
        || !sameRate(shard.sourceTimebase, sourceTimebase)) {
        throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BATCH_SCOPE_MISMATCH');
      }
      if (shard.shardSequence !== batches.length
        || BigInt(shard.firstFrameOrdinal) !== nextFrameOrdinal) {
        throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BATCH_ORDER_INVALID');
      }
      if (previousEpochBatchEnd !== null
        && shard.startPresentationTimestampTicks !== previousEpochBatchEnd) {
        throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_UNDECLARED_DISCONTINUITY');
      }
      batches.push({
        batchSequence: shard.shardSequence,
        epochId: epoch.epochId,
        firstFrameOrdinal: shard.firstFrameOrdinal,
        frameCount: shard.frameCount,
        startPresentationTimestampTicks: shard.startPresentationTimestampTicks,
        endExclusivePresentationTimestampTicks: shard.endExclusivePresentationTimestampTicks,
        shardDescriptorSha256: hashEditronCanonicalJsonV1(shard),
        sidecar: expectedSidecar,
      });
      previousEpochBatchEnd = shard.endExclusivePresentationTimestampTicks;
      nextFrameOrdinal += BigInt(shard.frameCount);
    }

    const firstBatch = batches[firstBatchSequence]!;
    const lastBatch = batches[batches.length - 1]!;
    if (firstBatch.startPresentationTimestampTicks
      !== epoch.sourceStartPresentationTimestampTicks
      || lastBatch.endExclusivePresentationTimestampTicks
        !== epoch.sourceEndExclusivePresentationTimestampTicks) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_EPOCH_RANGE_MISMATCH');
    }
    const boundary = createMediaSourcePtsCadenceEpochBoundaryV3({
      epoch,
      previousEpoch,
      classificationBasis: candidate.boundary.classificationBasis,
      detectorVersion: candidate.boundary.detectorVersion,
      previousBatchContentSha256,
      nextBatchContentSha256: firstBatch.sidecar.contentSha256,
      externalEvidence: candidate.boundary.externalEvidence,
    });
    epochs.push({
      epoch,
      boundary,
      firstBatchSequence,
      endExclusiveBatchSequence: batches.length,
      firstFrameOrdinal,
      endExclusiveFrameOrdinal: nextFrameOrdinal.toString(),
    });
    previousEpoch = epoch;
    previousBatchContentSha256 = lastBatch.sidecar.contentSha256;
  }

  return serializeMediaSourcePtsCadenceEpochIndexV3({
    schemaVersion: 3,
    kind: MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_KIND_V3,
    sourceVersionSha256,
    mapBindingSha256,
    streamId,
    videoStreamIndex,
    sourceTimebase,
    resourcePolicy,
    epochs,
    batches,
  });
}

export function serializeMediaSourcePtsCadenceEpochIndexV3(
  value: MediaSourcePtsCadenceEpochIndexV3,
): MediaSourcePtsCadenceEpochIndexSerializationV3 {
  const index = assertMediaSourcePtsCadenceEpochIndexV3(value);
  const canonicalJson = canonicalizeEditronJsonV1(index);
  const byteLength = Buffer.byteLength(canonicalJson, 'utf8');
  if (byteLength > index.resourcePolicy.maxCanonicalJsonBytes) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BYTE_LIMIT_EXCEEDED');
  }
  return frozen({ index, canonicalJson, byteLength, contentSha256: hashUtf8(canonicalJson) });
}

export function parseMediaSourcePtsCadenceEpochIndexV3(
  canonicalJson: string,
): MediaSourcePtsCadenceEpochIndexV3 {
  if (typeof canonicalJson !== 'string'
    || Buffer.byteLength(canonicalJson, 'utf8')
      > MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_ABSOLUTE_MAX_BYTES_V3) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_INPUT_TOO_LARGE');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(canonicalJson);
  } catch {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_JSON_INVALID');
  }
  const index = assertMediaSourcePtsCadenceEpochIndexV3(parsed);
  if (canonicalizeEditronJsonV1(index) !== canonicalJson) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_JSON_NON_CANONICAL');
  }
  if (Buffer.byteLength(canonicalJson, 'utf8') > index.resourcePolicy.maxCanonicalJsonBytes) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BYTE_LIMIT_EXCEEDED');
  }
  return index;
}

export function assertMediaSourcePtsCadenceEpochIndexV3(
  value: unknown,
): MediaSourcePtsCadenceEpochIndexV3 {
  const record = objectRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_INVALID');
  exactKeys(record, [
    'batches', 'epochs', 'kind', 'mapBindingSha256', 'resourcePolicy',
    'schemaVersion', 'sourceTimebase', 'sourceVersionSha256', 'streamId',
    'videoStreamIndex',
  ], 'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_FIELDS_INVALID');
  if (record.schemaVersion !== 3 || record.kind !== MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_KIND_V3) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_INVALID');
  }
  const sourceVersionSha256 = sha256(
    record.sourceVersionSha256,
    'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_SOURCE_VERSION_INVALID',
  );
  const mapBindingSha256 = sha256(
    record.mapBindingSha256,
    'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_MAP_BINDING_INVALID',
  );
  const videoStreamIndex = nonNegativeSafeInteger(
    record.videoStreamIndex,
    'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_STREAM_INDEX_INVALID',
  );
  const streamId = expectedMediaSourcePtsCadenceStreamIdV3(videoStreamIndex);
  if (record.streamId !== streamId) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_STREAM_ID_INVALID');
  }
  const sourceTimebase = parseExactRationalRateV1(record.sourceTimebase);
  const resourcePolicy = assertResourcePolicy(record.resourcePolicy);
  if (!Array.isArray(record.batches) || record.batches.length === 0
    || record.batches.length > resourcePolicy.maxBatchEntries) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BATCH_COUNT_INVALID');
  }
  const batches = record.batches.map((entry) => assertBatchEntry(entry, mapBindingSha256));
  let nextFrameOrdinal = BigInt(0);
  batches.forEach((batch, index) => {
    if (batch.batchSequence !== index || BigInt(batch.firstFrameOrdinal) !== nextFrameOrdinal) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BATCH_ORDER_INVALID');
    }
    nextFrameOrdinal += BigInt(batch.frameCount);
  });
  if (!Array.isArray(record.epochs) || record.epochs.length === 0
    || record.epochs.length > resourcePolicy.maxEpochEntries) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_EPOCH_COUNT_INVALID');
  }
  const epochs = record.epochs.map(assertEpochEntry);
  const seenEpochIds = new Set<string>();
  let previousEpoch: PresentationEpochV1 | null = null;
  let expectedFirstBatch = 0;
  let expectedFirstFrame = BigInt(0);

  epochs.forEach((entry) => {
    const epoch = entry.epoch;
    if (seenEpochIds.has(epoch.epochId)
      || epoch.streamId !== streamId
      || !sameRate(epoch.secondsPerSourceTick, sourceTimebase)
      || entry.firstBatchSequence !== expectedFirstBatch
      || BigInt(entry.firstFrameOrdinal) !== expectedFirstFrame
      || entry.endExclusiveBatchSequence <= entry.firstBatchSequence
      || entry.endExclusiveBatchSequence > batches.length) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_EPOCH_ORDER_OR_SCOPE_INVALID');
    }
    if (entry.boundary.externalEvidence !== null
      && entry.boundary.externalEvidence.mapBindingSha256 !== mapBindingSha256) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BOUNDARY_EVIDENCE_SCOPE_MISMATCH');
    }
    const epochBatches = batches.slice(
      entry.firstBatchSequence,
      entry.endExclusiveBatchSequence,
    );
    if (epochBatches.some(({ epochId }) => epochId !== epoch.epochId)) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BATCH_EPOCH_MISMATCH');
    }
    for (let index = 1; index < epochBatches.length; index += 1) {
      if (epochBatches[index]!.startPresentationTimestampTicks
        !== epochBatches[index - 1]!.endExclusivePresentationTimestampTicks) {
        throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_UNDECLARED_DISCONTINUITY');
      }
    }
    const firstBatch = epochBatches[0]!;
    const lastBatch = epochBatches[epochBatches.length - 1]!;
    const expectedEndFrame = BigInt(lastBatch.firstFrameOrdinal) + BigInt(lastBatch.frameCount);
    if (entry.firstFrameOrdinal !== firstBatch.firstFrameOrdinal
      || BigInt(entry.endExclusiveFrameOrdinal) !== expectedEndFrame
      || firstBatch.startPresentationTimestampTicks
        !== epoch.sourceStartPresentationTimestampTicks
      || lastBatch.endExclusivePresentationTimestampTicks
        !== epoch.sourceEndExclusivePresentationTimestampTicks
      || entry.boundary.nextBatchContentSha256 !== firstBatch.sidecar.contentSha256
      || entry.boundary.previousBatchContentSha256
        !== (entry.firstBatchSequence === 0
          ? null
          : batches[entry.firstBatchSequence - 1]!.sidecar.contentSha256)) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_EPOCH_RANGE_OR_EVIDENCE_MISMATCH');
    }
    assertMediaSourcePtsCadenceEpochHandoffV3({
      previousEpoch,
      epoch,
      boundary: entry.boundary,
    });
    seenEpochIds.add(epoch.epochId);
    previousEpoch = epoch;
    expectedFirstBatch = entry.endExclusiveBatchSequence;
    expectedFirstFrame = expectedEndFrame;
  });
  if (expectedFirstBatch !== batches.length || expectedFirstFrame !== nextFrameOrdinal) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_COVERAGE_INCOMPLETE');
  }
  return frozen({
    schemaVersion: 3,
    kind: MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_KIND_V3,
    sourceVersionSha256,
    mapBindingSha256,
    streamId,
    videoStreamIndex,
    sourceTimebase,
    resourcePolicy,
    epochs,
    batches,
  });
}

export function createMediaSourcePtsCadenceEpochIndexSidecarV3(input: Readonly<{
  storage: MediaSourcePtsCadenceEpochIndexSidecarV3['storage'];
  serialization: MediaSourcePtsCadenceEpochIndexSerializationV3;
}>): MediaSourcePtsCadenceEpochIndexSidecarV3 {
  const serialization = assertEpochIndexSerialization(input.serialization);
  const lastEpoch = serialization.index.epochs[serialization.index.epochs.length - 1]!;
  return frozen({
    schemaVersion: 3,
    kind: MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_SIDECAR_KIND_V3,
    storage: privateStorage(input.storage),
    objectKey: expectedMediaSourcePtsCadenceEpochIndexObjectKeyV3(
      serialization.index.sourceVersionSha256,
      serialization.index.mapBindingSha256,
      serialization.contentSha256,
    ),
    byteLength: serialization.byteLength,
    contentSha256: serialization.contentSha256,
    sourceVersionSha256: serialization.index.sourceVersionSha256,
    mapBindingSha256: serialization.index.mapBindingSha256,
    epochCount: serialization.index.epochs.length,
    batchCount: serialization.index.batches.length,
    endExclusiveFrameOrdinal: lastEpoch.endExclusiveFrameOrdinal,
  });
}

export function expectedMediaSourcePtsCadenceEpochIndexObjectKeyV3(
  sourceVersionSha256: string,
  mapBindingSha256: string,
  contentSha256: string,
): string {
  return `private/editron/media-source-pts-cadence/v3/${sha256(
    sourceVersionSha256,
    'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_SOURCE_VERSION_INVALID',
  )}/${sha256(
    mapBindingSha256,
    'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_MAP_BINDING_INVALID',
  )}/epoch-indexes/${sha256(
    contentSha256,
    'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_CONTENT_HASH_INVALID',
  )}.json`;
}

export function expectedMediaSourcePtsCadenceStreamIdV3(videoStreamIndex: number): string {
  return `video-${nonNegativeSafeInteger(
    videoStreamIndex,
    'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_STREAM_INDEX_INVALID',
  )}`;
}

function assertBatchSerialization(
  value: MediaSourcePtsCadenceFrameBatchSerializationV2,
): MediaSourcePtsCadenceFrameBatchSerializationV2 {
  const payload = parseMediaSourcePtsCadenceFrameBatchV2(value.canonicalJson);
  const byteLength = Buffer.byteLength(value.canonicalJson, 'utf8');
  const contentSha256 = hashUtf8(value.canonicalJson);
  if (value.byteLength !== byteLength
    || value.contentSha256 !== contentSha256
    || canonicalizeEditronJsonV1(payload) !== value.canonicalJson) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BATCH_SERIALIZATION_INVALID');
  }
  return frozen({ payload, canonicalJson: value.canonicalJson, byteLength, contentSha256 });
}

function assertBatchEntry(
  value: unknown,
  mapBindingSha256: string,
): MediaSourcePtsCadenceEpochIndexBatchEntryV3 {
  const record = objectRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BATCH_INVALID');
  exactKeys(record, [
    'batchSequence', 'endExclusivePresentationTimestampTicks', 'epochId',
    'firstFrameOrdinal', 'frameCount', 'shardDescriptorSha256', 'sidecar',
    'startPresentationTimestampTicks',
  ], 'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BATCH_FIELDS_INVALID');
  const batchSequence = nonNegativeSafeInteger(
    record.batchSequence,
    'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BATCH_SEQUENCE_INVALID',
  );
  const startPresentationTimestampTicks = signedIntegerText(
    record.startPresentationTimestampTicks,
    'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BATCH_START_INVALID',
  );
  const endExclusivePresentationTimestampTicks = signedIntegerText(
    record.endExclusivePresentationTimestampTicks,
    'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BATCH_END_INVALID',
  );
  if (BigInt(endExclusivePresentationTimestampTicks)
    <= BigInt(startPresentationTimestampTicks)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BATCH_RANGE_INVALID');
  }
  return {
    batchSequence,
    epochId: identifier(record.epochId, 'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BATCH_EPOCH_INVALID'),
    firstFrameOrdinal: nonNegativeIntegerText(
      record.firstFrameOrdinal,
      'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BATCH_ORDINAL_INVALID',
    ),
    frameCount: positiveIntegerText(
      record.frameCount,
      'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BATCH_FRAME_COUNT_INVALID',
    ),
    startPresentationTimestampTicks,
    endExclusivePresentationTimestampTicks,
    shardDescriptorSha256: sha256(
      record.shardDescriptorSha256,
      'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BATCH_DESCRIPTOR_HASH_INVALID',
    ),
    sidecar: assertBatchSidecar(record.sidecar, mapBindingSha256, batchSequence),
  };
}

function assertBatchSidecar(
  value: unknown,
  mapBindingSha256: string,
  batchSequence: number,
): MediaSourcePtsCadenceFrameBatchSidecarV2 {
  const record = objectRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BATCH_SIDECAR_INVALID');
  exactKeys(record, [
    'byteLength', 'contentSha256', 'kind', 'objectKey', 'schemaVersion', 'storage',
  ], 'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BATCH_SIDECAR_FIELDS_INVALID');
  const contentSha256 = sha256(
    record.contentSha256,
    'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BATCH_CONTENT_HASH_INVALID',
  );
  if (record.schemaVersion !== 2
    || record.kind !== MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_SIDECAR_KIND_V2
    || record.objectKey !== expectedMediaSourcePtsCadenceFrameBatchObjectKeyV2(
      mapBindingSha256,
      batchSequence,
      contentSha256,
    )) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BATCH_SIDECAR_BINDING_INVALID');
  }
  return {
    schemaVersion: 2,
    kind: MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_SIDECAR_KIND_V2,
    storage: privateStorage(record.storage),
    objectKey: record.objectKey,
    byteLength: positiveSafeIntegerInRange(
      record.byteLength,
      MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_ABSOLUTE_MAX_BYTES_V2,
      'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_BATCH_BYTES_INVALID',
    ),
    contentSha256,
  };
}

function assertEpochEntry(value: unknown): MediaSourcePtsCadenceEpochIndexEntryV3 {
  const record = objectRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_EPOCH_INVALID');
  exactKeys(record, [
    'boundary', 'endExclusiveBatchSequence', 'endExclusiveFrameOrdinal',
    'epoch', 'firstBatchSequence', 'firstFrameOrdinal',
  ], 'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_EPOCH_FIELDS_INVALID');
  return {
    epoch: parsePresentationEpochV1(record.epoch),
    boundary: assertMediaSourcePtsCadenceEpochBoundaryV3(record.boundary),
    firstBatchSequence: nonNegativeSafeInteger(
      record.firstBatchSequence,
      'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_EPOCH_BATCH_START_INVALID',
    ),
    endExclusiveBatchSequence: positiveSafeIntegerInRange(
      record.endExclusiveBatchSequence,
      MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_ABSOLUTE_MAX_BATCHES_V3,
      'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_EPOCH_BATCH_END_INVALID',
    ),
    firstFrameOrdinal: nonNegativeIntegerText(
      record.firstFrameOrdinal,
      'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_EPOCH_FRAME_START_INVALID',
    ),
    endExclusiveFrameOrdinal: positiveIntegerText(
      record.endExclusiveFrameOrdinal,
      'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_EPOCH_FRAME_END_INVALID',
    ),
  };
}

function assertEpochIndexSerialization(
  value: MediaSourcePtsCadenceEpochIndexSerializationV3,
): MediaSourcePtsCadenceEpochIndexSerializationV3 {
  const index = parseMediaSourcePtsCadenceEpochIndexV3(value.canonicalJson);
  const byteLength = Buffer.byteLength(value.canonicalJson, 'utf8');
  const contentSha256 = hashUtf8(value.canonicalJson);
  if (value.byteLength !== byteLength
    || value.contentSha256 !== contentSha256
    || canonicalizeEditronJsonV1(index) !== value.canonicalJson) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_SERIALIZATION_INVALID');
  }
  return frozen({ index, canonicalJson: value.canonicalJson, byteLength, contentSha256 });
}

function assertResourcePolicy(value: unknown): MediaSourcePtsCadenceEpochIndexResourcePolicyV3 {
  const record = objectRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_POLICY_INVALID');
  exactKeys(record, [
    'maxBatchEntries', 'maxCanonicalJsonBytes', 'maxEpochEntries', 'policyVersion',
  ], 'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_POLICY_FIELDS_INVALID');
  return {
    policyVersion: boundedText(
      record.policyVersion,
      'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_POLICY_VERSION_INVALID',
    ),
    maxCanonicalJsonBytes: positiveSafeIntegerInRange(
      record.maxCanonicalJsonBytes,
      MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_ABSOLUTE_MAX_BYTES_V3,
      'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_POLICY_BYTES_INVALID',
    ),
    maxEpochEntries: positiveSafeIntegerInRange(
      record.maxEpochEntries,
      MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_ABSOLUTE_MAX_EPOCHS_V3,
      'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_POLICY_EPOCHS_INVALID',
    ),
    maxBatchEntries: positiveSafeIntegerInRange(
      record.maxBatchEntries,
      MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_ABSOLUTE_MAX_BATCHES_V3,
      'MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_POLICY_BATCHES_INVALID',
    ),
  };
}

function sameRate(left: ExactRationalRateV1, right: ExactRationalRateV1): boolean {
  const normalizedLeft = parseExactRationalRateV1(left);
  const normalizedRight = parseExactRationalRateV1(right);
  return normalizedLeft.numerator === normalizedRight.numerator
    && normalizedLeft.denominator === normalizedRight.denominator;
}

function objectRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], code: string): void {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length || actual.some((key, index) => key !== sorted[index])) {
    throw new Error(code);
  }
}

function privateStorage(value: unknown): 'R2_PRIVATE' | 'GCS_PRIVATE' {
  if (value !== 'R2_PRIVATE' && value !== 'GCS_PRIVATE') {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_STORAGE_INVALID');
  }
  return value;
}

function identifier(value: unknown, code: string): string {
  return boundedText(value, code);
}

function boundedText(value: unknown, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(code);
  return value;
}

function nonNegativeSafeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(code);
  return Number(value);
}

function positiveSafeIntegerInRange(value: unknown, maximum: number, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0 || Number(value) > maximum) {
    throw new Error(code);
  }
  return Number(value);
}

function positiveIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,127}$/.test(value.trim())) {
    throw new Error(code);
  }
  return BigInt(value.trim()).toString();
}

function nonNegativeIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,127})$/.test(value.trim())) {
    throw new Error(code);
  }
  return BigInt(value.trim()).toString();
}

function signedIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^-?(0|[1-9]\d{0,127})$/.test(value.trim())) {
    throw new Error(code);
  }
  return BigInt(value.trim()).toString();
}

function hashUtf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function frozen<T extends object>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(value);
}
