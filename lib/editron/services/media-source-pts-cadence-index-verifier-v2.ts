import { createHash } from 'node:crypto';

import {
  parseExactRationalRateV1,
  type ExactRationalRateV1,
} from '../contracts/canonical-media-time-v1';

import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  parseMediaSourcePtsCadenceFrameBatchV2,
  type MediaSourcePtsCadenceFrameBatchPayloadV2,
} from './media-source-pts-cadence-frame-batch-v2';
import {
  parseMediaSourcePtsCadenceManifestIndexV2,
  type MediaSourcePtsCadenceFrameBatchSidecarV2,
  type MediaSourcePtsCadenceManifestIndexSerializationV2,
} from './media-source-pts-cadence-manifest-index-v2';

export const MEDIA_SOURCE_PTS_CADENCE_INDEX_VERIFIER_VERSION_V2 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_INDEX_VERIFIER_V2' as const;
export const MEDIA_SOURCE_PTS_CADENCE_PRESENTATION_WINDOW_KIND_V2 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_PRESENTATION_WINDOW_V2' as const;
export const MEDIA_SOURCE_PTS_CADENCE_PRESENTATION_WINDOW_ABSOLUTE_MAX_FRAMES_V2 = 100_000;
export const MEDIA_SOURCE_PTS_CADENCE_PRESENTATION_WINDOW_ABSOLUTE_MAX_BATCH_READS_V2 = 1_000;

export type MediaSourcePtsCadenceFrameBatchReaderV2 = {
  read(sidecar: Readonly<MediaSourcePtsCadenceFrameBatchSidecarV2>): Promise<Readonly<{
    canonicalJson: string;
    byteLength: number;
    contentSha256: string;
  }>>;
};

type IndexedSidecarFailureReasonV2 =
  | 'SIDECAR_READ_FAILED'
  | 'SIDECAR_READ_INVALID'
  | 'SIDECAR_BYTE_LENGTH_MISMATCH'
  | 'SIDECAR_CONTENT_HASH_MISMATCH'
  | 'SIDECAR_PAYLOAD_INVALID'
  | 'SIDECAR_INDEX_MISMATCH';

export type MediaSourcePtsCadenceIndexedBatchVerificationV2 =
  | Readonly<{
      disposition: 'INDEX_INTEGRITY_VERIFIED';
      verifierVersion: typeof MEDIA_SOURCE_PTS_CADENCE_INDEX_VERIFIER_VERSION_V2;
      mapBindingSha256: string;
      manifestIndexContentSha256: string;
      verifiedBatchCount: number;
      verifiedFrameCount: string;
      indexedRange: Readonly<{
        firstFrameOrdinal: string;
        endExclusiveFrameOrdinal: string;
        startPresentationTimestampTicks: string;
        endExclusivePresentationTimestampTicks: string;
      }>;
      observedCadence: Readonly<
        | { kind: 'UNIFORM_INDEXED_RANGE'; durationTicks: string }
        | { kind: 'VARIABLE_INDEXED_RANGE' }
      >;
      verificationSha256: string;
    }>
  | Readonly<{
      disposition: 'UNVERIFIABLE';
      reason:
        | 'MANIFEST_INDEX_INVALID'
        | IndexedSidecarFailureReasonV2;
      failedShardSequence: number | null;
    }>;

export type MediaSourcePtsCadencePresentationWindowResourcePolicyV2 = Readonly<{
  policyVersion: string;
  maxFrameRecords: number;
  maxBatchReads: number;
}>;

export type MediaSourcePtsCadencePresentationWindowV2 = Readonly<{
  schemaVersion: 2;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_PRESENTATION_WINDOW_KIND_V2;
  disposition: 'PRESENTATION_WINDOW_VERIFIED';
  verifierVersion: typeof MEDIA_SOURCE_PTS_CADENCE_INDEX_VERIFIER_VERSION_V2;
  evidenceStatus: 'HASH_VERIFIED_CONTIGUOUS_V2_INDEX_WINDOW';
  mapBindingSha256: string;
  manifestIndexContentSha256: string;
  sourceVersionSha256: string;
  videoStreamIndex: number;
  sourceTimebase: ExactRationalRateV1;
  firstFrameOrdinal: string;
  endExclusiveFrameOrdinal: string;
  startPresentationTimestampTicks: string;
  endExclusivePresentationTimestampTicks: string;
  verifiedBatchCount: number;
  verifiedBatches: readonly Readonly<{
    shardSequence: number;
    shardDescriptorSha256: string;
    contentSha256: string;
  }>[];
  frames: readonly Readonly<{
    sourceFrameOrdinal: string;
    presentationTimestampTicks: string;
    durationTicks: string;
  }>[];
  resourcePolicy: MediaSourcePtsCadencePresentationWindowResourcePolicyV2;
  presentationWindowEvidenceSha256: string;
}>;

export type MediaSourcePtsCadencePresentationWindowResultV2 =
  | MediaSourcePtsCadencePresentationWindowV2
  | Readonly<{
      disposition: 'UNVERIFIABLE';
      reason:
        | 'MANIFEST_INDEX_INVALID'
        | 'WINDOW_REQUEST_INVALID'
        | 'WINDOW_SOURCE_SCOPE_MISMATCH'
        | 'WINDOW_OUTSIDE_INDEX'
        | 'WINDOW_RESOURCE_LIMIT_EXCEEDED'
        | 'WINDOW_COVERAGE_INCOMPLETE'
        | IndexedSidecarFailureReasonV2;
      failedShardSequence: number | null;
    }>;

/**
 * Verifies every batch named by one immutable V2 index. It deliberately proves
 * only the listed range's integrity, not complete coverage of the source.
 */
export async function verifyMediaSourcePtsCadenceManifestIndexV2(input: {
  manifestIndex: Readonly<MediaSourcePtsCadenceManifestIndexSerializationV2>;
  reader: MediaSourcePtsCadenceFrameBatchReaderV2;
}): Promise<MediaSourcePtsCadenceIndexedBatchVerificationV2> {
  let manifest;
  try {
    manifest = assertManifestSerialization(input.manifestIndex);
  } catch {
    return unverifiable('MANIFEST_INDEX_INVALID', null);
  }

  let verifiedFrameCount = BigInt(0);
  let uniformDurationTicks: string | null = null;
  let hasVariableDuration = false;

  for (const entry of manifest.index.batches) {
    const read = await readVerifiedIndexedBatchV2(input.reader, manifest.index, entry);
    if (read.disposition === 'UNVERIFIABLE') {
      return unverifiable(read.reason, entry.shardSequence);
    }
    const payload = read.payload;
    verifiedFrameCount += BigInt(payload.frames.length);
    for (const frame of payload.frames) {
      if (uniformDurationTicks === null) uniformDurationTicks = frame.durationTicks;
      else if (frame.durationTicks !== uniformDurationTicks) hasVariableDuration = true;
    }
  }

  const first = manifest.index.batches[0]!;
  const last = manifest.index.batches[manifest.index.batches.length - 1]!;
  const material = {
    disposition: 'INDEX_INTEGRITY_VERIFIED' as const,
    verifierVersion: MEDIA_SOURCE_PTS_CADENCE_INDEX_VERIFIER_VERSION_V2,
    mapBindingSha256: manifest.index.mapBindingSha256,
    manifestIndexContentSha256: manifest.contentSha256,
    verifiedBatchCount: manifest.index.batches.length,
    verifiedFrameCount: verifiedFrameCount.toString(),
    indexedRange: {
      firstFrameOrdinal: first.firstFrameOrdinal,
      endExclusiveFrameOrdinal: (BigInt(last.firstFrameOrdinal) + BigInt(last.frameCount)).toString(),
      startPresentationTimestampTicks: first.startPresentationTimestampTicks,
      endExclusivePresentationTimestampTicks: last.endExclusivePresentationTimestampTicks,
    },
    observedCadence: hasVariableDuration
      ? { kind: 'VARIABLE_INDEXED_RANGE' as const }
      : { kind: 'UNIFORM_INDEXED_RANGE' as const, durationTicks: uniformDurationTicks! },
  };
  return frozen({ ...material, verificationSha256: hashEditronCanonicalJsonV1(material) });
}

/**
 * Reads only the immutable V2 batches intersecting one exact ordinal window.
 * V2 indexes represent one contiguous PTS epoch; this function does not invent
 * discontinuity epochs or claim complete-source/runtime-render readiness.
 */
export async function readMediaSourcePtsCadencePresentationWindowV2(input: {
  manifestIndex: Readonly<MediaSourcePtsCadenceManifestIndexSerializationV2>;
  reader: MediaSourcePtsCadenceFrameBatchReaderV2;
  expectedSource: Readonly<{
    mapBindingSha256: string;
    sourceVersionSha256: string;
    videoStreamIndex: number;
    sourceTimebase: ExactRationalRateV1;
  }>;
  firstFrameOrdinal: string;
  endExclusiveFrameOrdinal: string;
  resourcePolicy: MediaSourcePtsCadencePresentationWindowResourcePolicyV2;
}): Promise<MediaSourcePtsCadencePresentationWindowResultV2> {
  let manifest: ReturnType<typeof assertManifestSerialization>;
  try {
    manifest = assertManifestSerialization(input.manifestIndex);
  } catch {
    return windowUnverifiable('MANIFEST_INDEX_INVALID', null);
  }

  let mapBindingSha256: string;
  let sourceVersionSha256: string;
  let videoStreamIndex: number;
  let sourceTimebase: ExactRationalRateV1;
  let firstFrameOrdinal: string;
  let endExclusiveFrameOrdinal: string;
  let resourcePolicy: MediaSourcePtsCadencePresentationWindowResourcePolicyV2;
  try {
    mapBindingSha256 = sha256Text(input.expectedSource.mapBindingSha256);
    sourceVersionSha256 = sha256Text(input.expectedSource.sourceVersionSha256);
    videoStreamIndex = nonNegativeSafeInteger(input.expectedSource.videoStreamIndex);
    sourceTimebase = parseExactRationalRateV1(input.expectedSource.sourceTimebase);
    firstFrameOrdinal = nonNegativeIntegerText(input.firstFrameOrdinal);
    endExclusiveFrameOrdinal = nonNegativeIntegerText(input.endExclusiveFrameOrdinal);
    resourcePolicy = normalizePresentationWindowPolicyV2(input.resourcePolicy);
  } catch {
    return windowUnverifiable('WINDOW_REQUEST_INVALID', null);
  }

  if (manifest.index.mapBindingSha256 !== mapBindingSha256) {
    return windowUnverifiable('WINDOW_SOURCE_SCOPE_MISMATCH', null);
  }
  const firstOrdinal = BigInt(firstFrameOrdinal);
  const endOrdinal = BigInt(endExclusiveFrameOrdinal);
  if (endOrdinal <= firstOrdinal) {
    return windowUnverifiable('WINDOW_REQUEST_INVALID', null);
  }
  const requestedFrameCount = endOrdinal - firstOrdinal;
  if (requestedFrameCount > BigInt(resourcePolicy.maxFrameRecords)) {
    return windowUnverifiable('WINDOW_RESOURCE_LIMIT_EXCEEDED', null);
  }
  const indexFirstOrdinal = BigInt(manifest.index.batches[0]!.firstFrameOrdinal);
  const indexLast = manifest.index.batches[manifest.index.batches.length - 1]!;
  const indexEndOrdinal = BigInt(indexLast.firstFrameOrdinal) + BigInt(indexLast.frameCount);
  if (firstOrdinal < indexFirstOrdinal || endOrdinal > indexEndOrdinal) {
    return windowUnverifiable('WINDOW_OUTSIDE_INDEX', null);
  }

  const selectedEntries = manifest.index.batches.filter((entry) => {
    const entryStart = BigInt(entry.firstFrameOrdinal);
    const entryEnd = entryStart + BigInt(entry.frameCount);
    return entryStart < endOrdinal && entryEnd > firstOrdinal;
  });
  if (selectedEntries.length === 0) {
    return windowUnverifiable('WINDOW_OUTSIDE_INDEX', null);
  }
  if (selectedEntries.length > resourcePolicy.maxBatchReads) {
    return windowUnverifiable('WINDOW_RESOURCE_LIMIT_EXCEEDED', null);
  }

  const frames: Array<{
    sourceFrameOrdinal: string;
    presentationTimestampTicks: string;
    durationTicks: string;
  }> = [];
  const verifiedBatches: Array<{
    shardSequence: number;
    shardDescriptorSha256: string;
    contentSha256: string;
  }> = [];
  for (const entry of selectedEntries) {
    const read = await readVerifiedIndexedBatchV2(input.reader, manifest.index, entry);
    if (read.disposition === 'UNVERIFIABLE') {
      return windowUnverifiable(read.reason, entry.shardSequence);
    }
    const shard = read.payload.shard;
    if (shard.sourceVersionSha256 !== sourceVersionSha256
      || shard.videoStreamIndex !== videoStreamIndex
      || !sameRateV2(shard.sourceTimebase, sourceTimebase)) {
      return windowUnverifiable('WINDOW_SOURCE_SCOPE_MISMATCH', entry.shardSequence);
    }
    const shardFirstOrdinal = BigInt(shard.firstFrameOrdinal);
    read.payload.frames.forEach((frame, index) => {
      const sourceFrameOrdinal = shardFirstOrdinal + BigInt(index);
      if (sourceFrameOrdinal >= firstOrdinal && sourceFrameOrdinal < endOrdinal) {
        frames.push({ sourceFrameOrdinal: sourceFrameOrdinal.toString(), ...frame });
      }
    });
    verifiedBatches.push({
      shardSequence: entry.shardSequence,
      shardDescriptorSha256: entry.shardDescriptorSha256,
      contentSha256: entry.sidecar.contentSha256,
    });
  }
  if (frames.length !== Number(requestedFrameCount)
    || frames.some((frame, index) => BigInt(frame.sourceFrameOrdinal) !== firstOrdinal + BigInt(index))) {
    return windowUnverifiable('WINDOW_COVERAGE_INCOMPLETE', null);
  }

  const firstFrame = frames[0]!;
  const lastFrame = frames[frames.length - 1]!;
  const material = {
    schemaVersion: 2 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_PRESENTATION_WINDOW_KIND_V2,
    disposition: 'PRESENTATION_WINDOW_VERIFIED' as const,
    verifierVersion: MEDIA_SOURCE_PTS_CADENCE_INDEX_VERIFIER_VERSION_V2,
    evidenceStatus: 'HASH_VERIFIED_CONTIGUOUS_V2_INDEX_WINDOW' as const,
    mapBindingSha256,
    manifestIndexContentSha256: manifest.contentSha256,
    sourceVersionSha256,
    videoStreamIndex,
    sourceTimebase,
    firstFrameOrdinal,
    endExclusiveFrameOrdinal,
    startPresentationTimestampTicks: firstFrame.presentationTimestampTicks,
    endExclusivePresentationTimestampTicks: (
      BigInt(lastFrame.presentationTimestampTicks) + BigInt(lastFrame.durationTicks)
    ).toString(),
    verifiedBatchCount: verifiedBatches.length,
    verifiedBatches,
    frames,
    resourcePolicy,
  };
  return frozen({
    ...material,
    presentationWindowEvidenceSha256: hashEditronCanonicalJsonV1(material),
  });
}

function assertManifestSerialization(
  value: Readonly<MediaSourcePtsCadenceManifestIndexSerializationV2>,
): Readonly<MediaSourcePtsCadenceManifestIndexSerializationV2> {
  const index = parseMediaSourcePtsCadenceManifestIndexV2(value.canonicalJson);
  const byteLength = Buffer.byteLength(value.canonicalJson, 'utf8');
  const contentSha256 = hashUtf8(value.canonicalJson);
  if (value.byteLength !== byteLength || value.contentSha256 !== contentSha256
    || canonicalizeEditronJsonV1(value.index) !== value.canonicalJson) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_INDEX_VERIFIER_MANIFEST_INVALID');
  }
  return frozen({ index, canonicalJson: value.canonicalJson, byteLength, contentSha256 });
}

function assertStoredSidecar(
  value: unknown,
  expected: Readonly<MediaSourcePtsCadenceFrameBatchSidecarV2>,
): IndexedSidecarFailureReasonV2 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'SIDECAR_READ_INVALID';
  const stored = value as Record<string, unknown>;
  if (typeof stored.canonicalJson !== 'string'
    || !Number.isSafeInteger(stored.byteLength)
    || typeof stored.contentSha256 !== 'string') return 'SIDECAR_READ_INVALID';
  if (stored.byteLength !== Buffer.byteLength(stored.canonicalJson, 'utf8')
    || stored.byteLength !== expected.byteLength) return 'SIDECAR_BYTE_LENGTH_MISMATCH';
  if (stored.contentSha256 !== hashUtf8(stored.canonicalJson)
    || stored.contentSha256 !== expected.contentSha256) return 'SIDECAR_CONTENT_HASH_MISMATCH';
  return null;
}

function payloadMatchesIndexEntry(
  payload: Readonly<MediaSourcePtsCadenceFrameBatchPayloadV2>,
  index: ReturnType<typeof parseMediaSourcePtsCadenceManifestIndexV2>,
  entry: ReturnType<typeof parseMediaSourcePtsCadenceManifestIndexV2>['batches'][number],
): boolean {
  const shard = payload.shard;
  return payload.mapBindingSha256 === index.mapBindingSha256
    && payload.resourcePolicy.policyVersion === index.resourcePolicy.policyVersion
    && shard.shardSequence === entry.shardSequence
    && shard.firstFrameOrdinal === entry.firstFrameOrdinal
    && shard.frameCount === entry.frameCount
    && shard.startPresentationTimestampTicks === entry.startPresentationTimestampTicks
    && shard.endExclusivePresentationTimestampTicks === entry.endExclusivePresentationTimestampTicks
    && hashEditronCanonicalJsonV1(shard) === entry.shardDescriptorSha256;
}

async function readVerifiedIndexedBatchV2(
  reader: MediaSourcePtsCadenceFrameBatchReaderV2,
  index: ReturnType<typeof parseMediaSourcePtsCadenceManifestIndexV2>,
  entry: ReturnType<typeof parseMediaSourcePtsCadenceManifestIndexV2>['batches'][number],
): Promise<Readonly<
  | { disposition: 'VERIFIED'; payload: MediaSourcePtsCadenceFrameBatchPayloadV2 }
  | { disposition: 'UNVERIFIABLE'; reason: IndexedSidecarFailureReasonV2 }
>> {
  let stored: Readonly<{ canonicalJson: string; byteLength: number; contentSha256: string }>;
  try {
    stored = await reader.read(entry.sidecar);
  } catch {
    return { disposition: 'UNVERIFIABLE', reason: 'SIDECAR_READ_FAILED' };
  }
  const storedCheck = assertStoredSidecar(stored, entry.sidecar);
  if (storedCheck !== null) return { disposition: 'UNVERIFIABLE', reason: storedCheck };
  let payload: Readonly<MediaSourcePtsCadenceFrameBatchPayloadV2>;
  try {
    payload = parseMediaSourcePtsCadenceFrameBatchV2(stored.canonicalJson);
  } catch {
    return { disposition: 'UNVERIFIABLE', reason: 'SIDECAR_PAYLOAD_INVALID' };
  }
  return payloadMatchesIndexEntry(payload, index, entry)
    ? { disposition: 'VERIFIED', payload }
    : { disposition: 'UNVERIFIABLE', reason: 'SIDECAR_INDEX_MISMATCH' };
}

function unverifiable(
  reason: Exclude<MediaSourcePtsCadenceIndexedBatchVerificationV2, { disposition: 'INDEX_INTEGRITY_VERIFIED' }>['reason'],
  failedShardSequence: number | null,
): MediaSourcePtsCadenceIndexedBatchVerificationV2 {
  return frozen({ disposition: 'UNVERIFIABLE', reason, failedShardSequence });
}

function windowUnverifiable(
  reason: Exclude<MediaSourcePtsCadencePresentationWindowResultV2, MediaSourcePtsCadencePresentationWindowV2>['reason'],
  failedShardSequence: number | null,
): MediaSourcePtsCadencePresentationWindowResultV2 {
  return frozen({ disposition: 'UNVERIFIABLE', reason, failedShardSequence });
}

function normalizePresentationWindowPolicyV2(
  value: MediaSourcePtsCadencePresentationWindowResourcePolicyV2,
): MediaSourcePtsCadencePresentationWindowResourcePolicyV2 {
  if (!value || typeof value !== 'object') throw new Error('WINDOW_POLICY_INVALID');
  const policyVersion = typeof value.policyVersion === 'string' ? value.policyVersion.trim() : '';
  if (!policyVersion || policyVersion.length > 256) throw new Error('WINDOW_POLICY_INVALID');
  return {
    policyVersion,
    maxFrameRecords: positiveSafeIntegerInRange(
      value.maxFrameRecords,
      MEDIA_SOURCE_PTS_CADENCE_PRESENTATION_WINDOW_ABSOLUTE_MAX_FRAMES_V2,
    ),
    maxBatchReads: positiveSafeIntegerInRange(
      value.maxBatchReads,
      MEDIA_SOURCE_PTS_CADENCE_PRESENTATION_WINDOW_ABSOLUTE_MAX_BATCH_READS_V2,
    ),
  };
}

function sameRateV2(left: ExactRationalRateV1, right: ExactRationalRateV1): boolean {
  const normalizedLeft = parseExactRationalRateV1(left);
  const normalizedRight = parseExactRationalRateV1(right);
  return normalizedLeft.numerator === normalizedRight.numerator
    && normalizedLeft.denominator === normalizedRight.denominator;
}

function sha256Text(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('SHA256_INVALID');
  return value;
}

function nonNegativeSafeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error('INTEGER_INVALID');
  return Number(value);
}

function positiveSafeIntegerInRange(value: unknown, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0 || Number(value) > maximum) {
    throw new Error('INTEGER_INVALID');
  }
  return Number(value);
}

function nonNegativeIntegerText(value: unknown): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,127})$/.test(value)) {
    throw new Error('INTEGER_TEXT_INVALID');
  }
  return BigInt(value).toString();
}

function hashUtf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(value) as Readonly<T>;
}
