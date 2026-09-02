import { createHash } from 'node:crypto';

import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  parseMediaSourcePtsCadenceFrameBatchV2,
  type MediaSourcePtsCadenceFrameBatchSerializationV2,
} from './media-source-pts-cadence-frame-batch-v2';
import type { MediaSourcePtsCadenceFrameBatchReaderV2 } from './media-source-pts-cadence-index-verifier-v2';
import {
  appendMediaSourcePtsCadenceMapShardV1,
  assertMediaSourcePtsCadenceMapRecordV1,
  claimMediaSourcePtsCadenceMapV1,
  completeMediaSourcePtsCadenceMapV1,
  createMediaSourcePtsCadenceMapCompletionReceiptV1,
  createMediaSourcePtsCadenceMapRecordV1,
  markMediaSourcePtsCadenceMapUnverifiableV1,
  prepareMediaSourcePtsCadenceMapCompletionV1,
  type MediaSourcePtsCadenceMapRecordV1,
  type MediaSourcePtsCadencePrivateSidecarV1,
} from './media-source-pts-cadence-map-lifecycle-v1';
import {
  createMediaSourcePtsCadenceMapAssetStateV1,
  type MediaSourcePtsCadenceMapAssetStateInputV1,
} from './media-source-pts-cadence-map-asset-state-v1';
import {
  expectedMediaSourcePtsCadenceManifestIndexObjectKeyV2,
  parseMediaSourcePtsCadenceManifestIndexV2,
  type MediaSourcePtsCadenceManifestIndexSerializationV2,
  type MediaSourcePtsCadenceManifestIndexV2,
} from './media-source-pts-cadence-manifest-index-v2';
import { serializeMediaSourcePtsCadenceManifestSidecarV1 } from './media-source-pts-cadence-private-sidecar-codec-v1';
import type { MediaSourcePtsCadenceShardV1 } from './media-source-pts-cadence-shard-v1';
import {
  verifyMediaSourcePtsCadenceSourceCoverageV2,
  type MediaSourcePtsCadenceSourceCoverageV2,
} from './media-source-pts-cadence-source-coverage-v2';

export const MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_RECORD_KIND_V2 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_RECORD_V2' as const;
export const MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_SIDECAR_KIND_V2 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_SIDECAR_V2' as const;
export const MEDIA_SOURCE_PTS_CADENCE_MAP_TERMINAL_RECEIPT_KIND_V2 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_MAP_TERMINAL_RECEIPT_V2' as const;
export const MEDIA_SOURCE_PTS_CADENCE_ASSET_OWNER_VERIFIER_VERSION_V2 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_ASSET_OWNER_VERIFIER_V2' as const;

export type MediaSourcePtsCadenceManifestIndexSidecarV2 = Readonly<{
  schemaVersion: 2;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_SIDECAR_KIND_V2;
  storage: 'R2_PRIVATE' | 'GCS_PRIVATE';
  objectKey: string;
  byteLength: number;
  contentSha256: string;
  mapBindingSha256: string;
  batchCount: number;
  nextFrameOrdinal: string;
  nextPresentationTimestampTicks: string;
}>;

export type MediaSourcePtsCadenceMapTerminalReceiptV2 = Readonly<{
  schemaVersion: 2;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_MAP_TERMINAL_RECEIPT_KIND_V2;
  mapBindingSha256: string;
  manifestIndex: MediaSourcePtsCadenceManifestIndexSidecarV2;
  sourceCadence: Readonly<
    | { kind: 'CFR'; durationTicks: string }
    | { kind: 'VFR' }
  >;
  sourceStartPresentationTimestampTicks: string;
  sourceEndExclusivePresentationTimestampTicks: string;
  sourcePresentationCoverageSha256: string;
  indexVerificationSha256: string;
  lifecycleCompletionReceiptSha256: string;
  verifierVersion: typeof MEDIA_SOURCE_PTS_CADENCE_ASSET_OWNER_VERIFIER_VERSION_V2;
  terminalReceiptSha256: string;
}>;

/**
 * V2 is one successor envelope on the existing media asset. It embeds the V1
 * lease/checkpoint lifecycle; it does not persist a second V1 lifecycle beside
 * it or create another media registry.
 */
export type MediaSourcePtsCadenceMapAssetRecordV2 = Readonly<{
  schemaVersion: 2;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_RECORD_KIND_V2;
  lifecycleV1: Readonly<MediaSourcePtsCadenceMapRecordV1>;
  manifestIndex: MediaSourcePtsCadenceManifestIndexSidecarV2 | null;
  terminalReceipt: MediaSourcePtsCadenceMapTerminalReceiptV2 | null;
}>;

export type MediaSourcePtsCadenceMapAssetStateV2 = Readonly<{
  sourcePtsCadenceMapV2: MediaSourcePtsCadenceMapAssetRecordV2;
  sourcePtsCadenceMapStateSha256V2: string;
}>;

export type MediaSourcePtsCadenceMapAssetStateInputV2 =
  MediaSourcePtsCadenceMapAssetStateInputV1 & Readonly<{
    sourcePtsCadenceMapV2?: unknown;
    sourcePtsCadenceMapStateSha256V2?: unknown;
  }>;

export type MediaSourcePtsCadenceStoredObjectReaderV2 = Readonly<{
  read(sidecar: Readonly<{
    storage: 'R2_PRIVATE' | 'GCS_PRIVATE';
    objectKey: string;
    byteLength: number;
    contentSha256: string;
  }>): Promise<Readonly<{
    canonicalJson: string;
    byteLength: number;
    contentSha256: string;
  }>>;
}>;

export type MediaSourcePtsCadenceCheckpointResultV2 =
  | Readonly<{
      disposition: 'CHECKPOINTED';
      record: MediaSourcePtsCadenceMapAssetRecordV2;
    }>
  | Readonly<{
      disposition: 'UNVERIFIABLE';
      reason: 'MANIFEST_INDEX_NOT_STORED' | 'INDEX_INTEGRITY_UNVERIFIABLE';
      indexReason?: string;
    }>;

export type MediaSourcePtsCadenceTerminalResultV2 =
  | Readonly<{
      disposition: 'COMPLETED';
      record: MediaSourcePtsCadenceMapAssetRecordV2;
      receipt: MediaSourcePtsCadenceMapTerminalReceiptV2;
    }>
  | Readonly<{
      disposition: 'UNVERIFIABLE';
      reason: 'MANIFEST_INDEX_NOT_STORED' | 'LIFECYCLE_MANIFEST_NOT_STORED' | 'SOURCE_COVERAGE_UNVERIFIABLE';
      coverageReason?: string;
    }>;

export function createMediaSourcePtsCadenceMapAssetRecordV2(input: {
  bootstrapShard: MediaSourcePtsCadenceShardV1;
  now: Date;
}): MediaSourcePtsCadenceMapAssetRecordV2 {
  return normalizeRecord({
    schemaVersion: 2,
    kind: MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_RECORD_KIND_V2,
    lifecycleV1: createMediaSourcePtsCadenceMapRecordV1(input),
    manifestIndex: null,
    terminalReceipt: null,
  });
}

export function claimMediaSourcePtsCadenceMapAssetRecordV2(input: {
  record: MediaSourcePtsCadenceMapAssetRecordV2;
  claimId: string;
  now: Date;
  expiresAt: Date;
}): MediaSourcePtsCadenceMapAssetRecordV2 {
  const record = normalizeRecord(input.record);
  return normalizeRecord({
    ...record,
    lifecycleV1: claimMediaSourcePtsCadenceMapV1({
      record: record.lifecycleV1,
      claimId: input.claimId,
      now: input.now,
      expiresAt: input.expiresAt,
    }),
  });
}

/**
 * Advances one checkpoint only after the immutable V2 index is read back and
 * every batch it names passes the independent index verifier.
 */
export async function checkpointMediaSourcePtsCadenceMapAssetRecordV2(input: {
  record: MediaSourcePtsCadenceMapAssetRecordV2;
  claimId: string;
  frameBatch: MediaSourcePtsCadenceFrameBatchSerializationV2;
  descriptorSidecar: MediaSourcePtsCadencePrivateSidecarV1;
  manifestIndex: MediaSourcePtsCadenceManifestIndexSerializationV2;
  manifestIndexSidecar: MediaSourcePtsCadenceManifestIndexSidecarV2;
  previousManifestIndex: MediaSourcePtsCadenceManifestIndexSerializationV2 | null;
  storedObjectReader: MediaSourcePtsCadenceStoredObjectReaderV2;
  frameBatchReader: MediaSourcePtsCadenceFrameBatchReaderV2;
  now(): Date;
}): Promise<MediaSourcePtsCadenceCheckpointResultV2> {
  const record = normalizeRecord(input.record);
  const frameBatch = assertFrameBatchSerialization(input.frameBatch);
  const manifest = assertManifestSerialization(input.manifestIndex);
  const sidecar = createMediaSourcePtsCadenceManifestIndexSidecarV2({
    storage: input.manifestIndexSidecar.storage,
    manifestIndex: manifest,
  });
  if (!sameIndexSidecar(sidecar, input.manifestIndexSidecar)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V2_MANIFEST_SIDECAR_MISMATCH');
  }
  assertManifestExtension({
    record,
    frameBatch,
    manifest,
    previousManifestIndex: input.previousManifestIndex,
  });
  if (!await storedObjectMatches(sidecar, manifest.canonicalJson, input.storedObjectReader)) {
    return frozen({
      disposition: 'UNVERIFIABLE' as const,
      reason: 'MANIFEST_INDEX_NOT_STORED' as const,
    });
  }
  const { verifyMediaSourcePtsCadenceManifestIndexV2 } = await import(
    './media-source-pts-cadence-index-verifier-v2'
  );
  const verified = await verifyMediaSourcePtsCadenceManifestIndexV2({
    manifestIndex: manifest,
    reader: input.frameBatchReader,
  });
  if (verified.disposition !== 'INDEX_INTEGRITY_VERIFIED') {
    return frozen({
      disposition: 'UNVERIFIABLE' as const,
      reason: 'INDEX_INTEGRITY_UNVERIFIABLE' as const,
      indexReason: verified.reason,
    });
  }
  const lifecycleV1 = appendMediaSourcePtsCadenceMapShardV1({
    record: record.lifecycleV1,
    claimId: input.claimId,
    shard: frameBatch.payload.shard,
    privateSidecar: input.descriptorSidecar,
    now: input.now(),
  });
  assertManifestMatchesCheckpoint(manifest.index, lifecycleV1);
  return frozen({
    disposition: 'CHECKPOINTED',
    record: normalizeRecord({ ...record, lifecycleV1, manifestIndex: sidecar }),
  });
}

/**
 * Publishes a source-wide cadence result only after rereading the exact stored
 * index, every indexed frame batch and the V1 lifecycle manifest.
 */
export async function completeMediaSourcePtsCadenceMapAssetRecordV2(input: {
  record: MediaSourcePtsCadenceMapAssetRecordV2;
  claimId: string;
  coverage: MediaSourcePtsCadenceSourceCoverageV2;
  manifestIndex: MediaSourcePtsCadenceManifestIndexSerializationV2;
  lifecycleManifest: MediaSourcePtsCadencePrivateSidecarV1;
  storedObjectReader: MediaSourcePtsCadenceStoredObjectReaderV2;
  frameBatchReader: MediaSourcePtsCadenceFrameBatchReaderV2;
  now(): Date;
}): Promise<MediaSourcePtsCadenceTerminalResultV2> {
  const record = normalizeRecord(input.record);
  if (!record.manifestIndex) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V2_MANIFEST_MISSING');
  }
  const manifest = assertManifestSerialization(input.manifestIndex);
  const expectedIndexSidecar = createMediaSourcePtsCadenceManifestIndexSidecarV2({
    storage: record.manifestIndex.storage,
    manifestIndex: manifest,
  });
  if (!sameIndexSidecar(record.manifestIndex, expectedIndexSidecar)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V2_MANIFEST_STATE_MISMATCH');
  }
  if (!await storedObjectMatches(record.manifestIndex, manifest.canonicalJson, input.storedObjectReader)) {
    return frozen({
      disposition: 'UNVERIFIABLE' as const,
      reason: 'MANIFEST_INDEX_NOT_STORED' as const,
    });
  }
  const coverage = await verifyMediaSourcePtsCadenceSourceCoverageV2({
    coverage: input.coverage,
    manifestIndex: manifest,
    reader: input.frameBatchReader,
  });
  if (coverage.disposition !== 'SOURCE_PRESENTATION_COVERAGE_VERIFIED') {
    return frozen({
      disposition: 'UNVERIFIABLE' as const,
      reason: 'SOURCE_COVERAGE_UNVERIFIABLE' as const,
      coverageReason: coverage.reason,
    });
  }
  assertManifestMatchesCheckpoint(manifest.index, record.lifecycleV1);

  const lifecycleManifestSerialization = serializeMediaSourcePtsCadenceManifestSidecarV1({
    storage: input.lifecycleManifest.storage,
    mapBindingSha256: record.lifecycleV1.mapBindingSha256,
    checkpoint: record.lifecycleV1.checkpoint,
  });
  if (!sameLegacySidecar(lifecycleManifestSerialization.sidecar, input.lifecycleManifest)
    || !await storedObjectMatches(
      lifecycleManifestSerialization.sidecar,
      lifecycleManifestSerialization.canonicalJson,
      input.storedObjectReader,
    )) {
    return frozen({
      disposition: 'UNVERIFIABLE' as const,
      reason: 'LIFECYCLE_MANIFEST_NOT_STORED' as const,
    });
  }

  const terminalNow = input.now();
  const candidate = prepareMediaSourcePtsCadenceMapCompletionV1({
    record: record.lifecycleV1,
    claimId: input.claimId,
    privateManifest: input.lifecycleManifest,
    now: terminalNow,
  });
  const lifecycleReceipt = createMediaSourcePtsCadenceMapCompletionReceiptV1({
    candidate,
    verifierVersion: MEDIA_SOURCE_PTS_CADENCE_ASSET_OWNER_VERIFIER_VERSION_V2,
    coveragePolicyVersion: input.coverage.coveragePolicyVersion,
  });
  const lifecycleV1 = completeMediaSourcePtsCadenceMapV1({
    record: record.lifecycleV1,
    claimId: input.claimId,
    candidate,
    completionReceipt: lifecycleReceipt,
    now: terminalNow,
  });
  const receipt = createTerminalReceipt({
    lifecycleV1,
    manifestIndex: record.manifestIndex,
    coverage,
  });
  const completed = normalizeRecord({
    ...record,
    lifecycleV1,
    terminalReceipt: receipt,
  });
  return frozen({ disposition: 'COMPLETED', record: completed, receipt });
}

export function markMediaSourcePtsCadenceMapAssetRecordUnverifiableV2(input: {
  record: MediaSourcePtsCadenceMapAssetRecordV2;
  claimId: string;
  diagnostic: string;
  now: Date;
}): MediaSourcePtsCadenceMapAssetRecordV2 {
  const record = normalizeRecord(input.record);
  return normalizeRecord({
    ...record,
    lifecycleV1: markMediaSourcePtsCadenceMapUnverifiableV1({
      record: record.lifecycleV1,
      claimId: input.claimId,
      diagnostic: input.diagnostic,
      now: input.now,
    }),
    terminalReceipt: null,
  });
}

export function createMediaSourcePtsCadenceManifestIndexSidecarV2(input: {
  storage: 'R2_PRIVATE' | 'GCS_PRIVATE';
  manifestIndex: MediaSourcePtsCadenceManifestIndexSerializationV2;
}): MediaSourcePtsCadenceManifestIndexSidecarV2 {
  const manifest = assertManifestSerialization(input.manifestIndex);
  const last = manifest.index.batches[manifest.index.batches.length - 1]!;
  return frozen({
    schemaVersion: 2,
    kind: MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_SIDECAR_KIND_V2,
    storage: privateStorage(input.storage),
    objectKey: expectedMediaSourcePtsCadenceManifestIndexObjectKeyV2(
      manifest.index.mapBindingSha256,
      manifest.contentSha256,
    ),
    byteLength: manifest.byteLength,
    contentSha256: manifest.contentSha256,
    mapBindingSha256: manifest.index.mapBindingSha256,
    batchCount: manifest.index.batches.length,
    nextFrameOrdinal: (BigInt(last.firstFrameOrdinal) + BigInt(last.frameCount)).toString(),
    nextPresentationTimestampTicks: last.endExclusivePresentationTimestampTicks,
  });
}

export function createMediaSourcePtsCadenceMapAssetStateV2(input: {
  asset: MediaSourcePtsCadenceMapAssetStateInputV2;
  record: unknown;
}): MediaSourcePtsCadenceMapAssetStateV2 {
  assertNoParallelV1State(input.asset);
  const record = normalizeRecord(input.record);
  createMediaSourcePtsCadenceMapAssetStateV1({
    asset: input.asset,
    record: record.lifecycleV1,
  });
  return frozen({
    sourcePtsCadenceMapV2: record,
    sourcePtsCadenceMapStateSha256V2: hashEditronCanonicalJsonV1(record),
  });
}

export function readMediaSourcePtsCadenceMapAssetStateV2(
  asset: MediaSourcePtsCadenceMapAssetStateInputV2,
): MediaSourcePtsCadenceMapAssetStateV2 | null {
  const hasRecord = !isAbsent(asset.sourcePtsCadenceMapV2);
  const hasHash = !isAbsent(asset.sourcePtsCadenceMapStateSha256V2);
  if (!hasRecord && !hasHash) return null;
  if (!hasRecord || !hasHash) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_STATE_V2_INCOMPLETE');
  }
  const state = createMediaSourcePtsCadenceMapAssetStateV2({
    asset,
    record: asset.sourcePtsCadenceMapV2,
  });
  if (asset.sourcePtsCadenceMapStateSha256V2 !== state.sourcePtsCadenceMapStateSha256V2) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_STATE_V2_HASH_MISMATCH');
  }
  return state;
}

function normalizeRecord(value: unknown): MediaSourcePtsCadenceMapAssetRecordV2 {
  const record = objectRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_RECORD_V2_INVALID');
  exactKeys(record, [
    'kind', 'lifecycleV1', 'manifestIndex', 'schemaVersion', 'terminalReceipt',
  ], 'MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_RECORD_V2_FIELDS_INVALID');
  if (record.schemaVersion !== 2 || record.kind !== MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_RECORD_KIND_V2) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_RECORD_V2_INVALID');
  }
  const lifecycleV1 = assertMediaSourcePtsCadenceMapRecordV1(record.lifecycleV1);
  const manifestIndex = record.manifestIndex === null
    ? null
    : assertIndexSidecar(record.manifestIndex);
  const terminalReceipt = record.terminalReceipt === null
    ? null
    : assertTerminalReceipt(record.terminalReceipt, lifecycleV1, manifestIndex);
  if (manifestIndex === null && lifecycleV1.checkpoint.appendedShardCount !== '0') {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V2_CHECKPOINT_STATE_INVALID');
  }
  if (manifestIndex !== null && (
    String(manifestIndex.batchCount) !== lifecycleV1.checkpoint.appendedShardCount
    || manifestIndex.nextFrameOrdinal !== lifecycleV1.checkpoint.nextFrameOrdinal
    || manifestIndex.nextPresentationTimestampTicks
      !== lifecycleV1.checkpoint.nextPresentationTimestampTicks
    || manifestIndex.mapBindingSha256 !== lifecycleV1.mapBindingSha256
  )) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V2_CHECKPOINT_STATE_INVALID');
  }
  if ((lifecycleV1.status === 'COMPLETE') !== (terminalReceipt !== null)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V2_TERMINAL_STATE_INVALID');
  }
  if (lifecycleV1.status === 'UNVERIFIABLE' && terminalReceipt !== null) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V2_TERMINAL_STATE_INVALID');
  }
  return frozen({
    schemaVersion: 2,
    kind: MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_RECORD_KIND_V2,
    lifecycleV1,
    manifestIndex,
    terminalReceipt,
  });
}

function assertManifestExtension(input: {
  record: MediaSourcePtsCadenceMapAssetRecordV2;
  frameBatch: MediaSourcePtsCadenceFrameBatchSerializationV2;
  manifest: MediaSourcePtsCadenceManifestIndexSerializationV2;
  previousManifestIndex: MediaSourcePtsCadenceManifestIndexSerializationV2 | null;
}): void {
  const expectedCount = Number(input.record.lifecycleV1.checkpoint.appendedShardCount) + 1;
  if (!Number.isSafeInteger(expectedCount)
    || input.manifest.index.mapBindingSha256 !== input.record.lifecycleV1.mapBindingSha256
    || input.frameBatch.payload.mapBindingSha256 !== input.record.lifecycleV1.mapBindingSha256
    || input.manifest.index.batches.length !== expectedCount) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V2_MANIFEST_EXTENSION_INVALID');
  }
  const last = input.manifest.index.batches[input.manifest.index.batches.length - 1]!;
  if (last.shardSequence !== input.frameBatch.payload.shard.shardSequence
    || last.sidecar.contentSha256 !== input.frameBatch.contentSha256) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V2_MANIFEST_EXTENSION_INVALID');
  }
  if (!input.record.manifestIndex) {
    if (input.previousManifestIndex !== null || input.manifest.index.batches.length !== 1) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V2_PREVIOUS_MANIFEST_INVALID');
    }
    return;
  }
  if (!input.previousManifestIndex) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V2_PREVIOUS_MANIFEST_MISSING');
  }
  const previous = assertManifestSerialization(input.previousManifestIndex);
  const expectedPreviousSidecar = createMediaSourcePtsCadenceManifestIndexSidecarV2({
    storage: input.record.manifestIndex.storage,
    manifestIndex: previous,
  });
  if (!sameIndexSidecar(expectedPreviousSidecar, input.record.manifestIndex)
    || previous.index.batches.length + 1 !== input.manifest.index.batches.length
    || canonicalizeEditronJsonV1(previous.index.batches)
      !== canonicalizeEditronJsonV1(input.manifest.index.batches.slice(0, -1))) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V2_PREVIOUS_MANIFEST_INVALID');
  }
}

function assertManifestMatchesCheckpoint(
  index: Readonly<MediaSourcePtsCadenceManifestIndexV2>,
  lifecycleV1: Readonly<MediaSourcePtsCadenceMapRecordV1>,
): void {
  const last = index.batches[index.batches.length - 1]!;
  if (index.mapBindingSha256 !== lifecycleV1.mapBindingSha256
    || String(index.batches.length) !== lifecycleV1.checkpoint.appendedShardCount
    || (BigInt(last.firstFrameOrdinal) + BigInt(last.frameCount)).toString()
      !== lifecycleV1.checkpoint.nextFrameOrdinal
    || last.endExclusivePresentationTimestampTicks
      !== lifecycleV1.checkpoint.nextPresentationTimestampTicks) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V2_CHECKPOINT_MISMATCH');
  }
}

function createTerminalReceipt(input: {
  lifecycleV1: Readonly<MediaSourcePtsCadenceMapRecordV1>;
  manifestIndex: MediaSourcePtsCadenceManifestIndexSidecarV2;
  coverage: Extract<Awaited<ReturnType<typeof verifyMediaSourcePtsCadenceSourceCoverageV2>>, {
    disposition: 'SOURCE_PRESENTATION_COVERAGE_VERIFIED';
  }>;
}): MediaSourcePtsCadenceMapTerminalReceiptV2 {
  const lifecycleReceipt = input.lifecycleV1.completion?.receipt;
  if (!lifecycleReceipt) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V2_LIFECYCLE_RECEIPT_MISSING');
  }
  const material = {
    schemaVersion: 2 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_MAP_TERMINAL_RECEIPT_KIND_V2,
    mapBindingSha256: input.lifecycleV1.mapBindingSha256,
    manifestIndex: input.manifestIndex,
    sourceCadence: input.coverage.sourceCadence,
    sourceStartPresentationTimestampTicks: input.coverage.sourceStartPresentationTimestampTicks,
    sourceEndExclusivePresentationTimestampTicks: input.coverage.sourceEndExclusivePresentationTimestampTicks,
    sourcePresentationCoverageSha256: input.coverage.sourcePresentationCoverageSha256,
    indexVerificationSha256: input.coverage.indexVerificationSha256,
    lifecycleCompletionReceiptSha256: lifecycleReceipt.receiptSha256,
    verifierVersion: MEDIA_SOURCE_PTS_CADENCE_ASSET_OWNER_VERIFIER_VERSION_V2,
  };
  return frozen({ ...material, terminalReceiptSha256: hashEditronCanonicalJsonV1(material) });
}

function assertTerminalReceipt(
  value: unknown,
  lifecycleV1: Readonly<MediaSourcePtsCadenceMapRecordV1>,
  manifestIndex: MediaSourcePtsCadenceManifestIndexSidecarV2 | null,
): MediaSourcePtsCadenceMapTerminalReceiptV2 {
  const receipt = objectRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_MAP_TERMINAL_RECEIPT_V2_INVALID');
  exactKeys(receipt, [
    'indexVerificationSha256', 'kind', 'lifecycleCompletionReceiptSha256',
    'manifestIndex', 'mapBindingSha256', 'schemaVersion', 'sourceCadence',
    'sourceEndExclusivePresentationTimestampTicks',
    'sourcePresentationCoverageSha256', 'sourceStartPresentationTimestampTicks',
    'terminalReceiptSha256', 'verifierVersion',
  ], 'MEDIA_SOURCE_PTS_CADENCE_MAP_TERMINAL_RECEIPT_V2_FIELDS_INVALID');
  const normalizedManifest = assertIndexSidecar(receipt.manifestIndex);
  const sourceCadence = assertSourceCadence(receipt.sourceCadence);
  const material = {
    schemaVersion: 2 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_MAP_TERMINAL_RECEIPT_KIND_V2,
    mapBindingSha256: sha256(receipt.mapBindingSha256),
    manifestIndex: normalizedManifest,
    sourceCadence,
    sourceStartPresentationTimestampTicks: signedIntegerText(receipt.sourceStartPresentationTimestampTicks),
    sourceEndExclusivePresentationTimestampTicks: signedIntegerText(receipt.sourceEndExclusivePresentationTimestampTicks),
    sourcePresentationCoverageSha256: sha256(receipt.sourcePresentationCoverageSha256),
    indexVerificationSha256: sha256(receipt.indexVerificationSha256),
    lifecycleCompletionReceiptSha256: sha256(receipt.lifecycleCompletionReceiptSha256),
    verifierVersion: MEDIA_SOURCE_PTS_CADENCE_ASSET_OWNER_VERIFIER_VERSION_V2,
  };
  if (material.kind !== receipt.kind
    || receipt.schemaVersion !== 2
    || material.verifierVersion !== MEDIA_SOURCE_PTS_CADENCE_ASSET_OWNER_VERIFIER_VERSION_V2
    || material.mapBindingSha256 !== lifecycleV1.mapBindingSha256
    || material.lifecycleCompletionReceiptSha256 !== lifecycleV1.completion?.receipt.receiptSha256
    || !manifestIndex
    || !sameIndexSidecar(normalizedManifest, manifestIndex)
    || BigInt(material.sourceEndExclusivePresentationTimestampTicks)
      <= BigInt(material.sourceStartPresentationTimestampTicks)
    || receipt.terminalReceiptSha256 !== hashEditronCanonicalJsonV1(material)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_TERMINAL_RECEIPT_V2_INVALID');
  }
  return frozen({ ...material, terminalReceiptSha256: receipt.terminalReceiptSha256 as string });
}

function assertIndexSidecar(value: unknown): MediaSourcePtsCadenceManifestIndexSidecarV2 {
  const sidecar = objectRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_SIDECAR_V2_INVALID');
  exactKeys(sidecar, [
    'batchCount', 'byteLength', 'contentSha256', 'kind', 'mapBindingSha256',
    'nextFrameOrdinal', 'nextPresentationTimestampTicks', 'objectKey',
    'schemaVersion', 'storage',
  ], 'MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_SIDECAR_V2_FIELDS_INVALID');
  const normalized = {
    schemaVersion: 2 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_SIDECAR_KIND_V2,
    storage: privateStorage(sidecar.storage),
    objectKey: boundedObjectKey(sidecar.objectKey),
    byteLength: positiveSafeInteger(sidecar.byteLength),
    contentSha256: sha256(sidecar.contentSha256),
    mapBindingSha256: sha256(sidecar.mapBindingSha256),
    batchCount: positiveSafeInteger(sidecar.batchCount),
    nextFrameOrdinal: positiveIntegerText(sidecar.nextFrameOrdinal),
    nextPresentationTimestampTicks: signedIntegerText(sidecar.nextPresentationTimestampTicks),
  };
  if (sidecar.schemaVersion !== 2
    || sidecar.kind !== normalized.kind
    || normalized.objectKey !== expectedMediaSourcePtsCadenceManifestIndexObjectKeyV2(
      normalized.mapBindingSha256,
      normalized.contentSha256,
    )) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MANIFEST_INDEX_SIDECAR_V2_INVALID');
  }
  return frozen(normalized);
}

function assertFrameBatchSerialization(
  value: MediaSourcePtsCadenceFrameBatchSerializationV2,
): MediaSourcePtsCadenceFrameBatchSerializationV2 {
  const payload = parseMediaSourcePtsCadenceFrameBatchV2(value.canonicalJson);
  const byteLength = Buffer.byteLength(value.canonicalJson, 'utf8');
  const contentSha256 = hashUtf8(value.canonicalJson);
  if (value.byteLength !== byteLength
    || value.contentSha256 !== contentSha256
    || canonicalizeEditronJsonV1(payload) !== value.canonicalJson) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V2_FRAME_BATCH_INVALID');
  }
  return frozen({ payload, canonicalJson: value.canonicalJson, byteLength, contentSha256 });
}

function assertManifestSerialization(
  value: MediaSourcePtsCadenceManifestIndexSerializationV2,
): MediaSourcePtsCadenceManifestIndexSerializationV2 {
  const index = parseMediaSourcePtsCadenceManifestIndexV2(value.canonicalJson);
  const byteLength = Buffer.byteLength(value.canonicalJson, 'utf8');
  const contentSha256 = hashUtf8(value.canonicalJson);
  if (value.byteLength !== byteLength
    || value.contentSha256 !== contentSha256
    || canonicalizeEditronJsonV1(index) !== value.canonicalJson) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V2_MANIFEST_INVALID');
  }
  return frozen({ index, canonicalJson: value.canonicalJson, byteLength, contentSha256 });
}

async function storedObjectMatches(
  sidecar: Readonly<{ storage: 'R2_PRIVATE' | 'GCS_PRIVATE'; objectKey: string; byteLength: number; contentSha256: string }>,
  canonicalJson: string,
  reader: MediaSourcePtsCadenceStoredObjectReaderV2,
): Promise<boolean> {
  try {
    const stored = await reader.read(sidecar);
    return stored.canonicalJson === canonicalJson
      && stored.byteLength === sidecar.byteLength
      && stored.byteLength === Buffer.byteLength(stored.canonicalJson, 'utf8')
      && stored.contentSha256 === sidecar.contentSha256
      && stored.contentSha256 === hashUtf8(stored.canonicalJson);
  } catch {
    return false;
  }
}

function assertNoParallelV1State(asset: MediaSourcePtsCadenceMapAssetStateInputV2): void {
  if (!isAbsent(asset.sourcePtsCadenceMapV1)
    || !isAbsent(asset.sourcePtsCadenceMapStateSha256V1)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_PARALLEL_V1_STATE_FORBIDDEN');
  }
}

function assertSourceCadence(value: unknown): MediaSourcePtsCadenceMapTerminalReceiptV2['sourceCadence'] {
  const cadence = objectRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_MAP_V2_SOURCE_CADENCE_INVALID');
  if (cadence.kind === 'VFR') {
    exactKeys(cadence, ['kind'], 'MEDIA_SOURCE_PTS_CADENCE_MAP_V2_SOURCE_CADENCE_INVALID');
    return { kind: 'VFR' };
  }
  if (cadence.kind === 'CFR') {
    exactKeys(cadence, ['durationTicks', 'kind'], 'MEDIA_SOURCE_PTS_CADENCE_MAP_V2_SOURCE_CADENCE_INVALID');
    return { kind: 'CFR', durationTicks: positiveIntegerText(cadence.durationTicks) };
  }
  throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V2_SOURCE_CADENCE_INVALID');
}

function sameIndexSidecar(
  left: Readonly<MediaSourcePtsCadenceManifestIndexSidecarV2>,
  right: Readonly<MediaSourcePtsCadenceManifestIndexSidecarV2>,
): boolean {
  return canonicalizeEditronJsonV1(left) === canonicalizeEditronJsonV1(right);
}

function sameLegacySidecar(
  left: Readonly<MediaSourcePtsCadencePrivateSidecarV1>,
  right: Readonly<MediaSourcePtsCadencePrivateSidecarV1>,
): boolean {
  return canonicalizeEditronJsonV1(left) === canonicalizeEditronJsonV1(right);
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
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V2_STORAGE_INVALID');
  }
  return value;
}

function boundedObjectKey(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 2_048) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V2_OBJECT_KEY_INVALID');
  }
  return value;
}

function sha256(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V2_SHA256_INVALID');
  }
  return value;
}

function positiveSafeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V2_INTEGER_INVALID');
  }
  return Number(value);
}

function positiveIntegerText(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,127}$/.test(value.trim())) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V2_INTEGER_TEXT_INVALID');
  }
  return BigInt(value.trim()).toString();
}

function signedIntegerText(value: unknown): string {
  if (typeof value !== 'string' || !/^-?(0|[1-9]\d{0,127})$/.test(value.trim())) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V2_SIGNED_INTEGER_TEXT_INVALID');
  }
  return BigInt(value.trim()).toString();
}

function hashUtf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function isAbsent(value: unknown): boolean {
  return value === undefined || value === null;
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(value) as Readonly<T>;
}
