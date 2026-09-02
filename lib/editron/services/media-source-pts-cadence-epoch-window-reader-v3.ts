import { createHash } from 'node:crypto';

import {
  parseExactRationalRateV1,
  type ExactRationalRateV1,
  type PresentationEpochV1,
} from '../contracts/canonical-media-time-v1';

import {
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  parseMediaSourcePtsCadenceFrameBatchV2,
} from './media-source-pts-cadence-frame-batch-v2';
import type {
  MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3,
  MediaSourcePtsCadenceEpochArtifactVerificationReceiptV3,
} from './media-source-pts-cadence-epoch-artifact-verifier-v3';
import {
  MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_ABSOLUTE_MAX_BATCHES_V3,
  parseMediaSourcePtsCadenceEpochIndexV3,
  type MediaSourcePtsCadenceEpochIndexBatchEntryV3,
} from './media-source-pts-cadence-epoch-index-v3';
import {
  readMediaSourcePtsCadenceMapAssetStateV3,
  type MediaSourcePtsCadenceMapAssetStateInputV3,
} from './media-source-pts-cadence-map-asset-owner-v3';
import { assertMediaSourceVersionV1 } from './media-source-version-v1';

export const MEDIA_SOURCE_PTS_CADENCE_EPOCH_PRESENTATION_WINDOW_KIND_V3 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_EPOCH_PRESENTATION_WINDOW_V3' as const;
export const MEDIA_SOURCE_PTS_CADENCE_EPOCH_WINDOW_ABSOLUTE_MAX_FRAMES_V3 = 100_000;
export const MEDIA_SOURCE_PTS_CADENCE_EPOCH_WINDOW_ABSOLUTE_MAX_BYTES_V3 =
  16 * 1024 * 1024 * 1024;

export type MediaSourcePtsCadenceEpochWindowResourcePolicyV3 = Readonly<{
  policyVersion: string;
  maxFrameRecords: number;
  maxBatchReads: number;
  maxTotalReadBytes: number;
}>;

export type MediaSourcePtsCadenceEpochPresentationFrameV3 = Readonly<{
  sourceFrameOrdinal: string;
  epochId: string;
  presentationTimestampTicks: string;
  durationTicks: string;
}>;

export type MediaSourcePtsCadenceEpochPresentationWindowV3 = Readonly<{
  schemaVersion: 3;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_EPOCH_PRESENTATION_WINDOW_KIND_V3;
  disposition: 'EPOCH_PRESENTATION_WINDOW_VERIFIED';
  evidenceStatus: 'HASH_VERIFIED_SOURCE_BOUND_EPOCH_V3_WINDOW';
  assetId: string;
  sourceVersionSha256: string;
  storageVersionSha256: string;
  sourceBindingSha256: string;
  technicalObservationSha256: string;
  sourcePtsCadenceMapStateSha256V3: string;
  mapBindingSha256: string;
  terminalReceiptSha256: string;
  verificationSha256: string;
  epochIndexContentSha256: string;
  streamId: string;
  videoStreamIndex: number;
  sourceTimebase: ExactRationalRateV1;
  firstFrameOrdinal: string;
  endExclusiveFrameOrdinal: string;
  selectedBatchCount: number;
  selectedBatchBytes: number;
  epochs: readonly PresentationEpochV1[];
  frames: readonly MediaSourcePtsCadenceEpochPresentationFrameV3[];
  selectedBatches: readonly Readonly<{
    batchSequence: number;
    epochId: string;
    contentSha256: string;
    shardDescriptorSha256: string;
    firstFrameOrdinal: string;
    frameCount: string;
  }>[];
  resourcePolicy: MediaSourcePtsCadenceEpochWindowResourcePolicyV3;
  presentationWindowEvidenceSha256: string;
}>;

export type MediaSourcePtsCadenceEpochWindowUnverifiableReasonV3 =
  | 'WINDOW_REQUEST_INVALID'
  | 'WINDOW_ASSET_STATE_INVALID'
  | 'WINDOW_ASSET_NOT_VERIFIED'
  | 'WINDOW_OUTSIDE_VERIFIED_INDEX'
  | 'WINDOW_RESOURCE_LIMIT_EXCEEDED'
  | 'WINDOW_INDEX_READ_FAILED'
  | 'WINDOW_INDEX_STORED_OBJECT_INVALID'
  | 'WINDOW_INDEX_BYTE_LENGTH_MISMATCH'
  | 'WINDOW_INDEX_CONTENT_HASH_MISMATCH'
  | 'WINDOW_INDEX_PAYLOAD_INVALID'
  | 'WINDOW_INDEX_SCOPE_MISMATCH'
  | 'WINDOW_VERIFICATION_RECEIPT_MISMATCH'
  | 'WINDOW_BATCH_READ_FAILED'
  | 'WINDOW_BATCH_STORED_OBJECT_INVALID'
  | 'WINDOW_BATCH_BYTE_LENGTH_MISMATCH'
  | 'WINDOW_BATCH_CONTENT_HASH_MISMATCH'
  | 'WINDOW_BATCH_PAYLOAD_INVALID'
  | 'WINDOW_BATCH_SCOPE_MISMATCH'
  | 'WINDOW_COVERAGE_INCOMPLETE';

export type MediaSourcePtsCadenceEpochPresentationWindowResultV3 = Readonly<
  | MediaSourcePtsCadenceEpochPresentationWindowV3
  | {
      disposition: 'UNVERIFIABLE';
      reason: MediaSourcePtsCadenceEpochWindowUnverifiableReasonV3;
      failedObjectKey: string | null;
      failedBatchSequence: number | null;
      diagnostic: string | null;
    }
>;

/**
 * Reads one bounded ordinal window only after the current MEDIA_ASSETS record
 * contains a terminal V3 verification receipt. The receipt proves the whole
 * immutable set; this reader still rechecks the exact index and batch bytes it
 * consumes so a stale or altered object cannot reach the time-transform owner.
 */
export async function readMediaSourcePtsCadenceEpochPresentationWindowV3(input: {
  asset: MediaSourcePtsCadenceMapAssetStateInputV3;
  storedObjectReader: MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3;
  firstFrameOrdinal: string;
  endExclusiveFrameOrdinal: string;
  resourcePolicy: MediaSourcePtsCadenceEpochWindowResourcePolicyV3;
}): Promise<MediaSourcePtsCadenceEpochPresentationWindowResultV3> {
  let firstFrameOrdinal: string;
  let endExclusiveFrameOrdinal: string;
  let resourcePolicy: MediaSourcePtsCadenceEpochWindowResourcePolicyV3;
  try {
    firstFrameOrdinal = nonNegativeIntegerText(
      input.firstFrameOrdinal,
      'WINDOW_FIRST_FRAME_INVALID',
    );
    endExclusiveFrameOrdinal = positiveIntegerText(
      input.endExclusiveFrameOrdinal,
      'WINDOW_END_FRAME_INVALID',
    );
    if (BigInt(endExclusiveFrameOrdinal) <= BigInt(firstFrameOrdinal)
      || !input.storedObjectReader
      || typeof input.storedObjectReader.read !== 'function') {
      throw new Error('WINDOW_REQUEST_INVALID');
    }
    resourcePolicy = normalizeResourcePolicy(input.resourcePolicy);
    if (BigInt(endExclusiveFrameOrdinal) - BigInt(firstFrameOrdinal)
      > BigInt(resourcePolicy.maxFrameRecords)) {
      return unverifiable('WINDOW_RESOURCE_LIMIT_EXCEEDED', null, null, null);
    }
  } catch (error) {
    return unverifiable('WINDOW_REQUEST_INVALID', null, null, error);
  }

  let state: NonNullable<ReturnType<typeof readMediaSourcePtsCadenceMapAssetStateV3>>;
  let sourceVersion: ReturnType<typeof assertMediaSourceVersionV1>;
  try {
    const candidate = readMediaSourcePtsCadenceMapAssetStateV3(input.asset);
    sourceVersion = assertMediaSourceVersionV1(input.asset.sourceVersionV1);
    if (candidate === null) {
      return unverifiable('WINDOW_ASSET_NOT_VERIFIED', null, null, null);
    }
    state = candidate;
  } catch (error) {
    return unverifiable('WINDOW_ASSET_STATE_INVALID', null, null, error);
  }

  const record = state.sourcePtsCadenceMapV3;
  const verification = record.verificationReceipt;
  const terminal = record.terminalReceipt;
  if (record.status !== 'COMPLETE'
    || verification === null
    || terminal === null
    || terminal.disposition !== 'PUBLISHED'
    || terminal.verificationSha256 !== verification.verificationSha256) {
    return unverifiable('WINDOW_ASSET_NOT_VERIFIED', record.epochIndexSidecar.objectKey, null, null);
  }
  if (BigInt(endExclusiveFrameOrdinal)
    > BigInt(record.epochIndexSidecar.endExclusiveFrameOrdinal)) {
    return unverifiable(
      'WINDOW_OUTSIDE_VERIFIED_INDEX',
      record.epochIndexSidecar.objectKey,
      null,
      null,
    );
  }
  if (record.epochIndexSidecar.byteLength > resourcePolicy.maxTotalReadBytes) {
    return unverifiable(
      'WINDOW_RESOURCE_LIMIT_EXCEEDED',
      record.epochIndexSidecar.objectKey,
      null,
      null,
    );
  }

  const storedIndex = await readStoredObject(
    input.storedObjectReader,
    record.epochIndexSidecar,
    'INDEX',
  );
  if (storedIndex.disposition === 'UNVERIFIABLE') return storedIndex.result;
  let index: ReturnType<typeof parseMediaSourcePtsCadenceEpochIndexV3>;
  try {
    index = parseMediaSourcePtsCadenceEpochIndexV3(storedIndex.object.canonicalJson);
  } catch (error) {
    return unverifiable(
      'WINDOW_INDEX_PAYLOAD_INVALID',
      record.epochIndexSidecar.objectKey,
      null,
      error,
    );
  }
  if (index.sourceVersionSha256 !== record.source.sourceVersionSha256
    || index.mapBindingSha256 !== record.source.mapBindingSha256
    || index.videoStreamIndex !== record.source.videoStreamIndex
    || !sameRate(index.sourceTimebase, record.source.sourceTimebase)
    || index.streamId !== `video-${String(record.source.videoStreamIndex)}`) {
    return unverifiable(
      'WINDOW_INDEX_SCOPE_MISMATCH',
      record.epochIndexSidecar.objectKey,
      null,
      null,
    );
  }

  const first = BigInt(firstFrameOrdinal);
  const end = BigInt(endExclusiveFrameOrdinal);
  const selectedEntries = index.batches.filter((entry) => {
    const batchStart = BigInt(entry.firstFrameOrdinal);
    const batchEnd = batchStart + BigInt(entry.frameCount);
    return batchStart < end && batchEnd > first;
  });
  const selectedBatchBytes = selectedEntries.reduce(
    (sum, entry) => sum + entry.sidecar.byteLength,
    0,
  );
  if (selectedEntries.length === 0
    || selectedEntries.length > resourcePolicy.maxBatchReads
    || storedIndex.object.byteLength + selectedBatchBytes > resourcePolicy.maxTotalReadBytes) {
    return unverifiable(
      selectedEntries.length === 0
        ? 'WINDOW_COVERAGE_INCOMPLETE'
        : 'WINDOW_RESOURCE_LIMIT_EXCEEDED',
      record.epochIndexSidecar.objectKey,
      null,
      null,
    );
  }

  const receiptBySequence = new Map(
    verification.verifiedBatches.map((batch) => [batch.batchSequence, batch]),
  );
  const frames: MediaSourcePtsCadenceEpochPresentationFrameV3[] = [];
  const selectedBatches: MediaSourcePtsCadenceEpochPresentationWindowV3['selectedBatches'][number][] = [];
  for (const entry of selectedEntries) {
    const verifiedBatch = receiptBySequence.get(entry.batchSequence);
    if (!verifiedBatch || !verifiedBatchMatchesIndexEntry(verifiedBatch, entry)) {
      return unverifiable(
        'WINDOW_VERIFICATION_RECEIPT_MISMATCH',
        entry.sidecar.objectKey,
        entry.batchSequence,
        null,
      );
    }
    const storedBatch = await readStoredObject(
      input.storedObjectReader,
      entry.sidecar,
      'BATCH',
      entry.batchSequence,
    );
    if (storedBatch.disposition === 'UNVERIFIABLE') return storedBatch.result;
    let payload: ReturnType<typeof parseMediaSourcePtsCadenceFrameBatchV2>;
    try {
      payload = parseMediaSourcePtsCadenceFrameBatchV2(storedBatch.object.canonicalJson);
    } catch (error) {
      return unverifiable(
        'WINDOW_BATCH_PAYLOAD_INVALID',
        entry.sidecar.objectKey,
        entry.batchSequence,
        error,
      );
    }
    if (!batchMatchesIndexAndSource(payload, entry, record.source)) {
      return unverifiable(
        'WINDOW_BATCH_SCOPE_MISMATCH',
        entry.sidecar.objectKey,
        entry.batchSequence,
        null,
      );
    }
    const batchFirst = BigInt(entry.firstFrameOrdinal);
    payload.frames.forEach((frame, offset) => {
      const ordinal = batchFirst + BigInt(offset);
      if (ordinal >= first && ordinal < end) {
        frames.push({
          sourceFrameOrdinal: ordinal.toString(),
          epochId: entry.epochId,
          presentationTimestampTicks: frame.presentationTimestampTicks,
          durationTicks: frame.durationTicks,
        });
      }
    });
    selectedBatches.push({
      batchSequence: entry.batchSequence,
      epochId: entry.epochId,
      contentSha256: entry.sidecar.contentSha256,
      shardDescriptorSha256: entry.shardDescriptorSha256,
      firstFrameOrdinal: entry.firstFrameOrdinal,
      frameCount: entry.frameCount,
    });
  }

  if (BigInt(frames.length) !== end - first
    || frames.some((frame, indexInWindow) =>
      BigInt(frame.sourceFrameOrdinal) !== first + BigInt(indexInWindow))) {
    return unverifiable('WINDOW_COVERAGE_INCOMPLETE', null, null, null);
  }
  const selectedEpochIds = new Set(frames.map(({ epochId }) => epochId));
  const epochs = index.epochs
    .filter(({ epoch }) => selectedEpochIds.has(epoch.epochId))
    .map(({ epoch }) => epoch);
  if (epochs.length !== selectedEpochIds.size) {
    return unverifiable('WINDOW_COVERAGE_INCOMPLETE', null, null, null);
  }

  const material = {
    schemaVersion: 3 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_EPOCH_PRESENTATION_WINDOW_KIND_V3,
    disposition: 'EPOCH_PRESENTATION_WINDOW_VERIFIED' as const,
    evidenceStatus: 'HASH_VERIFIED_SOURCE_BOUND_EPOCH_V3_WINDOW' as const,
    assetId: sourceVersion.assetId,
    sourceVersionSha256: sourceVersion.sourceVersionSha256,
    storageVersionSha256: sourceVersion.storageVersion.storageVersionSha256,
    sourceBindingSha256: record.source.sourceBindingSha256,
    technicalObservationSha256: record.source.technicalObservationSha256,
    sourcePtsCadenceMapStateSha256V3: state.sourcePtsCadenceMapStateSha256V3,
    mapBindingSha256: record.source.mapBindingSha256,
    terminalReceiptSha256: terminal.terminalReceiptSha256,
    verificationSha256: verification.verificationSha256,
    epochIndexContentSha256: record.epochIndexSidecar.contentSha256,
    streamId: index.streamId,
    videoStreamIndex: index.videoStreamIndex,
    sourceTimebase: index.sourceTimebase,
    firstFrameOrdinal,
    endExclusiveFrameOrdinal,
    selectedBatchCount: selectedBatches.length,
    selectedBatchBytes,
    epochs,
    frames,
    selectedBatches,
    resourcePolicy,
  };
  return frozen({
    ...material,
    presentationWindowEvidenceSha256: hashEditronCanonicalJsonV1(material),
  });
}

type StoredSidecarV3 = Readonly<{
  storage: 'R2_PRIVATE' | 'GCS_PRIVATE';
  objectKey: string;
  byteLength: number;
  contentSha256: string;
}>;

type StoredReadResultV3 = Readonly<
  | {
      disposition: 'VERIFIED';
      object: Readonly<{ canonicalJson: string; byteLength: number; contentSha256: string }>;
    }
  | {
      disposition: 'UNVERIFIABLE';
      result: MediaSourcePtsCadenceEpochPresentationWindowResultV3;
    }
>;

async function readStoredObject(
  reader: MediaSourcePtsCadenceEpochArtifactStoredObjectReaderV3,
  sidecar: StoredSidecarV3,
  family: 'INDEX' | 'BATCH',
  batchSequence: number | null = null,
): Promise<StoredReadResultV3> {
  let stored: Readonly<{ canonicalJson: string; byteLength: number; contentSha256: string }>;
  try {
    stored = await reader.read(sidecar);
  } catch (error) {
    return {
      disposition: 'UNVERIFIABLE',
      result: unverifiable(
        family === 'INDEX' ? 'WINDOW_INDEX_READ_FAILED' : 'WINDOW_BATCH_READ_FAILED',
        sidecar.objectKey,
        batchSequence,
        error,
      ),
    };
  }
  if (!stored || typeof stored !== 'object'
    || typeof stored.canonicalJson !== 'string'
    || !Number.isSafeInteger(stored.byteLength)
    || stored.byteLength <= 0
    || typeof stored.contentSha256 !== 'string') {
    return {
      disposition: 'UNVERIFIABLE',
      result: unverifiable(
        family === 'INDEX'
          ? 'WINDOW_INDEX_STORED_OBJECT_INVALID'
          : 'WINDOW_BATCH_STORED_OBJECT_INVALID',
        sidecar.objectKey,
        batchSequence,
        null,
      ),
    };
  }
  if (stored.byteLength !== Buffer.byteLength(stored.canonicalJson, 'utf8')
    || stored.byteLength !== sidecar.byteLength) {
    return {
      disposition: 'UNVERIFIABLE',
      result: unverifiable(
        family === 'INDEX'
          ? 'WINDOW_INDEX_BYTE_LENGTH_MISMATCH'
          : 'WINDOW_BATCH_BYTE_LENGTH_MISMATCH',
        sidecar.objectKey,
        batchSequence,
        null,
      ),
    };
  }
  if (stored.contentSha256 !== hashUtf8(stored.canonicalJson)
    || stored.contentSha256 !== sidecar.contentSha256) {
    return {
      disposition: 'UNVERIFIABLE',
      result: unverifiable(
        family === 'INDEX'
          ? 'WINDOW_INDEX_CONTENT_HASH_MISMATCH'
          : 'WINDOW_BATCH_CONTENT_HASH_MISMATCH',
        sidecar.objectKey,
        batchSequence,
        null,
      ),
    };
  }
  return { disposition: 'VERIFIED', object: stored };
}

function verifiedBatchMatchesIndexEntry(
  receipt: MediaSourcePtsCadenceEpochArtifactVerificationReceiptV3['verifiedBatches'][number],
  entry: MediaSourcePtsCadenceEpochIndexBatchEntryV3,
): boolean {
  return receipt.batchSequence === entry.batchSequence
    && receipt.epochId === entry.epochId
    && receipt.byteLength === entry.sidecar.byteLength
    && receipt.contentSha256 === entry.sidecar.contentSha256
    && receipt.shardDescriptorSha256 === entry.shardDescriptorSha256
    && receipt.frameCount === entry.frameCount;
}

function batchMatchesIndexAndSource(
  payload: ReturnType<typeof parseMediaSourcePtsCadenceFrameBatchV2>,
  entry: MediaSourcePtsCadenceEpochIndexBatchEntryV3,
  source: MediaSourcePtsCadenceEpochArtifactVerificationReceiptV3['source'],
): boolean {
  const shard = payload.shard;
  return payload.mapBindingSha256 === source.mapBindingSha256
    && shard.sourceVersionSha256 === source.sourceVersionSha256
    && shard.videoStreamIndex === source.videoStreamIndex
    && sameRate(shard.sourceTimebase, source.sourceTimebase)
    && shard.shardSequence === entry.batchSequence
    && shard.firstFrameOrdinal === entry.firstFrameOrdinal
    && shard.frameCount === entry.frameCount
    && shard.startPresentationTimestampTicks === entry.startPresentationTimestampTicks
    && shard.endExclusivePresentationTimestampTicks === entry.endExclusivePresentationTimestampTicks
    && hashEditronCanonicalJsonV1(shard) === entry.shardDescriptorSha256;
}

function normalizeResourcePolicy(
  value: MediaSourcePtsCadenceEpochWindowResourcePolicyV3,
): MediaSourcePtsCadenceEpochWindowResourcePolicyV3 {
  if (!value || typeof value !== 'object') throw new Error('WINDOW_RESOURCE_POLICY_INVALID');
  return frozen({
    policyVersion: boundedText(value.policyVersion, 'WINDOW_RESOURCE_POLICY_VERSION_INVALID'),
    maxFrameRecords: positiveSafeIntegerInRange(
      value.maxFrameRecords,
      MEDIA_SOURCE_PTS_CADENCE_EPOCH_WINDOW_ABSOLUTE_MAX_FRAMES_V3,
      'WINDOW_RESOURCE_POLICY_FRAMES_INVALID',
    ),
    maxBatchReads: positiveSafeIntegerInRange(
      value.maxBatchReads,
      MEDIA_SOURCE_PTS_CADENCE_EPOCH_INDEX_ABSOLUTE_MAX_BATCHES_V3,
      'WINDOW_RESOURCE_POLICY_BATCHES_INVALID',
    ),
    maxTotalReadBytes: positiveSafeIntegerInRange(
      value.maxTotalReadBytes,
      MEDIA_SOURCE_PTS_CADENCE_EPOCH_WINDOW_ABSOLUTE_MAX_BYTES_V3,
      'WINDOW_RESOURCE_POLICY_BYTES_INVALID',
    ),
  });
}

function unverifiable(
  reason: MediaSourcePtsCadenceEpochWindowUnverifiableReasonV3,
  failedObjectKey: string | null,
  failedBatchSequence: number | null,
  error: unknown,
): MediaSourcePtsCadenceEpochPresentationWindowResultV3 {
  return frozen({
    disposition: 'UNVERIFIABLE' as const,
    reason,
    failedObjectKey,
    failedBatchSequence,
    diagnostic: error === null
      ? null
      : boundedDiagnostic(error instanceof Error ? error.message : String(error)),
  });
}

function sameRate(left: ExactRationalRateV1, right: ExactRationalRateV1): boolean {
  const normalizedLeft = parseExactRationalRateV1(left);
  const normalizedRight = parseExactRationalRateV1(right);
  return normalizedLeft.numerator === normalizedRight.numerator
    && normalizedLeft.denominator === normalizedRight.denominator;
}

function boundedText(value: unknown, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

function nonNegativeIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,127})$/.test(value.trim())) {
    throw new Error(code);
  }
  return BigInt(value.trim()).toString();
}

function positiveIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,127}$/.test(value.trim())) {
    throw new Error(code);
  }
  return BigInt(value.trim()).toString();
}

function positiveSafeIntegerInRange(value: unknown, maximum: number, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0 || Number(value) > maximum) {
    throw new Error(code);
  }
  return Number(value);
}

function boundedDiagnostic(value: string): string {
  const normalized = value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  return (normalized || 'UNSPECIFIED').slice(0, 512);
}

function hashUtf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(value) as Readonly<T>;
}
