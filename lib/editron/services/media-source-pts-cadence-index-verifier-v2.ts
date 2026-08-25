import { createHash } from 'node:crypto';

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

export type MediaSourcePtsCadenceFrameBatchReaderV2 = {
  read(sidecar: Readonly<MediaSourcePtsCadenceFrameBatchSidecarV2>): Promise<Readonly<{
    canonicalJson: string;
    byteLength: number;
    contentSha256: string;
  }>>;
};

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
        | 'SIDECAR_READ_FAILED'
        | 'SIDECAR_READ_INVALID'
        | 'SIDECAR_BYTE_LENGTH_MISMATCH'
        | 'SIDECAR_CONTENT_HASH_MISMATCH'
        | 'SIDECAR_PAYLOAD_INVALID'
        | 'SIDECAR_INDEX_MISMATCH';
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
    let stored: Readonly<{ canonicalJson: string; byteLength: number; contentSha256: string }>;
    try {
      stored = await input.reader.read(entry.sidecar);
    } catch {
      return unverifiable('SIDECAR_READ_FAILED', entry.shardSequence);
    }
    const storedCheck = assertStoredSidecar(stored, entry.sidecar);
    if (storedCheck !== null) return unverifiable(storedCheck, entry.shardSequence);

    let payload: Readonly<MediaSourcePtsCadenceFrameBatchPayloadV2>;
    try {
      payload = parseMediaSourcePtsCadenceFrameBatchV2(stored.canonicalJson);
    } catch {
      return unverifiable('SIDECAR_PAYLOAD_INVALID', entry.shardSequence);
    }
    if (!payloadMatchesIndexEntry(payload, manifest.index, entry)) {
      return unverifiable('SIDECAR_INDEX_MISMATCH', entry.shardSequence);
    }
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
): Exclude<MediaSourcePtsCadenceIndexedBatchVerificationV2, { disposition: 'INDEX_INTEGRITY_VERIFIED' }>['reason'] | null {
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

function unverifiable(
  reason: Exclude<MediaSourcePtsCadenceIndexedBatchVerificationV2, { disposition: 'INDEX_INTEGRITY_VERIFIED' }>['reason'],
  failedShardSequence: number | null,
): MediaSourcePtsCadenceIndexedBatchVerificationV2 {
  return frozen({ disposition: 'UNVERIFIABLE', reason, failedShardSequence });
}

function hashUtf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(value) as Readonly<T>;
}
