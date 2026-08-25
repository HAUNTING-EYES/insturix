import { createHash } from 'node:crypto';

import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_ABSOLUTE_MAX_BYTES_V2,
  parseMediaSourcePtsCadenceFrameBatchV2,
  type MediaSourcePtsCadenceFrameBatchSerializationV2,
} from './media-source-pts-cadence-frame-batch-v2';

/** A recoverable index, not a terminal cadence conclusion or runtime state. */
export const MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_KIND_V2 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_V2' as const;
export const MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_SIDECAR_KIND_V2 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_SIDECAR_V2' as const;
export const MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_ABSOLUTE_MAX_BYTES_V2 = 8 * 1024 * 1024;
export const MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_ABSOLUTE_MAX_BATCHES_V2 = 100_000;

export type MediaSourcePtsCadenceManifestIndexResourcePolicyV2 = {
  policyVersion: string;
  maxCanonicalJsonBytes: number;
  maxBatchEntries: number;
};

export type MediaSourcePtsCadenceFrameBatchSidecarV2 = {
  schemaVersion: 2;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_SIDECAR_KIND_V2;
  storage: 'R2_PRIVATE' | 'GCS_PRIVATE';
  objectKey: string;
  byteLength: number;
  contentSha256: string;
};

export type MediaSourcePtsCadenceManifestIndexEntryV2 = {
  shardSequence: number;
  firstFrameOrdinal: string;
  frameCount: string;
  startPresentationTimestampTicks: string;
  endExclusivePresentationTimestampTicks: string;
  shardDescriptorSha256: string;
  sidecar: MediaSourcePtsCadenceFrameBatchSidecarV2;
};

export type MediaSourcePtsCadenceManifestIndexV2 = {
  schemaVersion: 2;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_KIND_V2;
  mapBindingSha256: string;
  resourcePolicy: MediaSourcePtsCadenceManifestIndexResourcePolicyV2;
  batches: readonly MediaSourcePtsCadenceManifestIndexEntryV2[];
};

export type MediaSourcePtsCadenceManifestIndexSerializationV2 = {
  index: Readonly<MediaSourcePtsCadenceManifestIndexV2>;
  canonicalJson: string;
  byteLength: number;
  contentSha256: string;
};

export function createMediaSourcePtsCadenceFrameBatchSidecarV2(input: {
  storage: MediaSourcePtsCadenceFrameBatchSidecarV2['storage'];
  serialization: Readonly<MediaSourcePtsCadenceFrameBatchSerializationV2>;
}): Readonly<MediaSourcePtsCadenceFrameBatchSidecarV2> {
  const batch = assertBatchSerialization(input.serialization);
  return frozen({
    schemaVersion: 2,
    kind: MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_SIDECAR_KIND_V2,
    storage: assertPrivateStorage(input.storage),
    objectKey: expectedMediaSourcePtsCadenceFrameBatchObjectKeyV2(
      batch.payload.mapBindingSha256,
      batch.payload.shard.shardSequence,
      batch.contentSha256,
    ),
    byteLength: batch.byteLength,
    contentSha256: batch.contentSha256,
  });
}

export function createMediaSourcePtsCadenceManifestIndexV2(input: {
  mapBindingSha256: string;
  resourcePolicy: MediaSourcePtsCadenceManifestIndexResourcePolicyV2;
  batches: readonly Readonly<{
    serialization: MediaSourcePtsCadenceFrameBatchSerializationV2;
    sidecar: MediaSourcePtsCadenceFrameBatchSidecarV2;
  }>[];
}): Readonly<MediaSourcePtsCadenceManifestIndexSerializationV2> {
  const mapBindingSha256 = sha256(
    input.mapBindingSha256,
    'MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_BINDING_INVALID',
  );
  const resourcePolicy = assertResourcePolicy(input.resourcePolicy);
  const entries = input.batches.map(({ serialization, sidecar }) => {
    const batch = assertBatchSerialization(serialization);
    if (batch.payload.mapBindingSha256 !== mapBindingSha256) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_BATCH_BINDING_MISMATCH');
    }
    if (batch.payload.resourcePolicy.policyVersion !== resourcePolicy.policyVersion) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_POLICY_BINDING_MISMATCH');
    }
    assertSidecar(
      sidecar,
      batch.payload.mapBindingSha256,
      batch.payload.shard.shardSequence,
      batch.contentSha256,
    );
    return {
      shardSequence: batch.payload.shard.shardSequence,
      firstFrameOrdinal: batch.payload.shard.firstFrameOrdinal,
      frameCount: batch.payload.shard.frameCount,
      startPresentationTimestampTicks: batch.payload.shard.startPresentationTimestampTicks,
      endExclusivePresentationTimestampTicks: batch.payload.shard.endExclusivePresentationTimestampTicks,
      shardDescriptorSha256: hashEditronCanonicalJsonV1(batch.payload.shard),
      sidecar,
    } satisfies MediaSourcePtsCadenceManifestIndexEntryV2;
  });
  return serializeMediaSourcePtsCadenceManifestIndexV2({
    schemaVersion: 2,
    kind: MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_KIND_V2,
    mapBindingSha256,
    resourcePolicy,
    batches: entries,
  });
}

export function serializeMediaSourcePtsCadenceManifestIndexV2(
  value: MediaSourcePtsCadenceManifestIndexV2,
): Readonly<MediaSourcePtsCadenceManifestIndexSerializationV2> {
  const index = assertMediaSourcePtsCadenceManifestIndexV2(value);
  const canonicalJson = canonicalizeEditronJsonV1(index);
  const byteLength = Buffer.byteLength(canonicalJson, 'utf8');
  if (byteLength > index.resourcePolicy.maxCanonicalJsonBytes) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_BYTE_LIMIT_EXCEEDED');
  }
  return frozen({ index, canonicalJson, byteLength, contentSha256: hashUtf8(canonicalJson) });
}

export function parseMediaSourcePtsCadenceManifestIndexV2(
  canonicalJson: string,
): Readonly<MediaSourcePtsCadenceManifestIndexV2> {
  if (typeof canonicalJson !== 'string'
    || Buffer.byteLength(canonicalJson, 'utf8') > MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_ABSOLUTE_MAX_BYTES_V2) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_INPUT_TOO_LARGE');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(canonicalJson);
  } catch {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_JSON_INVALID');
  }
  const index = assertMediaSourcePtsCadenceManifestIndexV2(parsed);
  if (canonicalizeEditronJsonV1(index) !== canonicalJson) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_JSON_NON_CANONICAL');
  }
  if (Buffer.byteLength(canonicalJson, 'utf8') > index.resourcePolicy.maxCanonicalJsonBytes) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_BYTE_LIMIT_EXCEEDED');
  }
  return index;
}

export function expectedMediaSourcePtsCadenceFrameBatchObjectKeyV2(
  mapBindingSha256: string,
  shardSequence: number,
  contentSha256: string,
): string {
  return `private/editron/media-source-pts-cadence/v2/${sha256(mapBindingSha256, 'MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_BINDING_INVALID')}/frame-batches/${nonNegativeSafeInteger(shardSequence, 'MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_SEQUENCE_INVALID')}/${sha256(contentSha256, 'MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_SIDECAR_HASH_INVALID')}.json`;
}

export function expectedMediaSourcePtsCadenceManifestIndexObjectKeyV2(
  mapBindingSha256: string,
  contentSha256: string,
): string {
  return `private/editron/media-source-pts-cadence/v2/${sha256(mapBindingSha256, 'MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_BINDING_INVALID')}/manifest-indexes/${sha256(contentSha256, 'MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_HASH_INVALID')}.json`;
}

export function assertMediaSourcePtsCadenceManifestIndexV2(
  value: unknown,
): Readonly<MediaSourcePtsCadenceManifestIndexV2> {
  const record = asRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_INVALID');
  exactKeys(record, ['batches', 'kind', 'mapBindingSha256', 'resourcePolicy', 'schemaVersion'], 'MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_FIELDS_INVALID');
  if (record.schemaVersion !== 2 || record.kind !== MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_KIND_V2) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_INVALID');
  }
  const mapBindingSha256 = sha256(record.mapBindingSha256, 'MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_BINDING_INVALID');
  const resourcePolicy = assertResourcePolicy(record.resourcePolicy);
  if (!Array.isArray(record.batches) || record.batches.length === 0 || record.batches.length > resourcePolicy.maxBatchEntries) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_BATCH_COUNT_INVALID');
  }
  const batches = record.batches.map((entry) => assertEntry(entry, mapBindingSha256));
  assertContiguousBatches(batches);
  return frozen({
    schemaVersion: 2,
    kind: MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_KIND_V2,
    mapBindingSha256,
    resourcePolicy,
    batches,
  });
}

function assertBatchSerialization(
  value: Readonly<MediaSourcePtsCadenceFrameBatchSerializationV2>,
): Readonly<MediaSourcePtsCadenceFrameBatchSerializationV2> {
  const payload = parseMediaSourcePtsCadenceFrameBatchV2(value.canonicalJson);
  const byteLength = Buffer.byteLength(value.canonicalJson, 'utf8');
  const contentSha256 = hashUtf8(value.canonicalJson);
  if (value.byteLength !== byteLength || value.contentSha256 !== contentSha256
    || canonicalizeEditronJsonV1(payload) !== value.canonicalJson) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_BATCH_SERIALIZATION_INVALID');
  }
  return frozen({ payload, canonicalJson: value.canonicalJson, byteLength, contentSha256 });
}

function assertEntry(value: unknown, mapBindingSha256: string): MediaSourcePtsCadenceManifestIndexEntryV2 {
  const record = asRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_ENTRY_INVALID');
  exactKeys(record, ['endExclusivePresentationTimestampTicks', 'firstFrameOrdinal', 'frameCount', 'shardDescriptorSha256', 'shardSequence', 'sidecar', 'startPresentationTimestampTicks'], 'MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_ENTRY_FIELDS_INVALID');
  const shardSequence = nonNegativeSafeInteger(record.shardSequence, 'MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_SEQUENCE_INVALID');
  const sidecar = assertSidecar(record.sidecar, mapBindingSha256, shardSequence);
  return {
    shardSequence,
    firstFrameOrdinal: nonNegativeIntegerText(record.firstFrameOrdinal, 'MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_ORDINAL_INVALID'),
    frameCount: positiveIntegerText(record.frameCount, 'MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_FRAME_COUNT_INVALID'),
    startPresentationTimestampTicks: signedIntegerText(record.startPresentationTimestampTicks, 'MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_START_PTS_INVALID'),
    endExclusivePresentationTimestampTicks: signedIntegerText(record.endExclusivePresentationTimestampTicks, 'MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_END_PTS_INVALID'),
    shardDescriptorSha256: sha256(record.shardDescriptorSha256, 'MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_DESCRIPTOR_HASH_INVALID'),
    sidecar,
  };
}

function assertSidecar(value: unknown, mapBindingSha256: string, shardSequence: number, contentSha256?: string): MediaSourcePtsCadenceFrameBatchSidecarV2 {
  const record = asRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_SIDECAR_INVALID');
  exactKeys(record, ['byteLength', 'contentSha256', 'kind', 'objectKey', 'schemaVersion', 'storage'], 'MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_SIDECAR_FIELDS_INVALID');
  const actualContentSha256 = sha256(record.contentSha256, 'MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_SIDECAR_HASH_INVALID');
  if (record.schemaVersion !== 2 || record.kind !== MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_SIDECAR_KIND_V2
    || actualContentSha256 !== (contentSha256 ?? actualContentSha256)
    || record.objectKey !== expectedMediaSourcePtsCadenceFrameBatchObjectKeyV2(mapBindingSha256, shardSequence, actualContentSha256)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_SIDECAR_BINDING_INVALID');
  }
  return {
    schemaVersion: 2,
    kind: MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_SIDECAR_KIND_V2,
    storage: assertPrivateStorage(record.storage),
    objectKey: record.objectKey,
    byteLength: positiveSafeIntegerInRange(
      record.byteLength,
      MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_ABSOLUTE_MAX_BYTES_V2,
      'MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_SIDECAR_SIZE_INVALID',
    ),
    contentSha256: actualContentSha256,
  };
}

function assertContiguousBatches(batches: readonly MediaSourcePtsCadenceManifestIndexEntryV2[]): void {
  const first = batches[0]!;
  if (first.shardSequence !== 0 || first.firstFrameOrdinal !== '0') {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_BOOTSTRAP_INVALID');
  }
  for (let index = 1; index < batches.length; index += 1) {
    const previous = batches[index - 1]!;
    const current = batches[index]!;
    if (current.shardSequence !== previous.shardSequence + 1
      || BigInt(current.firstFrameOrdinal) !== BigInt(previous.firstFrameOrdinal) + BigInt(previous.frameCount)
      || BigInt(current.startPresentationTimestampTicks) !== BigInt(previous.endExclusivePresentationTimestampTicks)) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_NON_CONTIGUOUS');
    }
  }
  for (const batch of batches) {
    if (BigInt(batch.endExclusivePresentationTimestampTicks) <= BigInt(batch.startPresentationTimestampTicks)) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_RANGE_INVALID');
    }
  }
}

function assertResourcePolicy(value: unknown): MediaSourcePtsCadenceManifestIndexResourcePolicyV2 {
  const record = asRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_POLICY_INVALID');
  exactKeys(record, ['maxBatchEntries', 'maxCanonicalJsonBytes', 'policyVersion'], 'MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_POLICY_FIELDS_INVALID');
  return {
    policyVersion: boundedText(record.policyVersion, 'MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_POLICY_INVALID'),
    maxCanonicalJsonBytes: positiveSafeIntegerInRange(record.maxCanonicalJsonBytes, MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_ABSOLUTE_MAX_BYTES_V2, 'MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_POLICY_BYTES_INVALID'),
    maxBatchEntries: positiveSafeIntegerInRange(record.maxBatchEntries, MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_ABSOLUTE_MAX_BATCHES_V2, 'MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_POLICY_BATCHES_INVALID'),
  };
}

function asRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], code: string): void {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length || actual.some((key, index) => key !== sorted[index])) throw new Error(code);
}

function assertPrivateStorage(value: unknown): 'R2_PRIVATE' | 'GCS_PRIVATE' {
  if (value !== 'R2_PRIVATE' && value !== 'GCS_PRIVATE') throw new Error('MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_STORAGE_INVALID');
  return value;
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(code);
  return value;
}

function boundedText(value: unknown, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || /[\u0000-\u001F\u007F]/.test(normalized)) throw new Error(code);
  return normalized;
}

function positiveSafeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error(code);
  return Number(value);
}

function nonNegativeSafeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(code);
  return Number(value);
}

function positiveSafeIntegerInRange(value: unknown, maximum: number, code: string): number {
  const normalized = positiveSafeInteger(value, code);
  if (normalized > maximum) throw new Error(code);
  return normalized;
}

function positiveIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,127}$/.test(value.trim())) throw new Error(code);
  return BigInt(value.trim()).toString();
}

function nonNegativeIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,127})$/.test(value.trim())) throw new Error(code);
  return BigInt(value.trim()).toString();
}

function signedIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^-?(0|[1-9]\d{0,127})$/.test(value.trim())) throw new Error(code);
  return BigInt(value.trim()).toString();
}

function hashUtf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(value) as Readonly<T>;
}
