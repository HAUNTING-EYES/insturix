import { createHash } from 'node:crypto';

import {
  CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
} from '../contracts/canonical-media-time-v1';
import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import type { MediaSourcePtsCadenceEpochArtifactVerificationPolicyV3 }
  from './media-source-pts-cadence-epoch-artifact-verifier-v3';
import {
  createMediaSourcePtsCadenceEpochIndexSidecarV3,
  createMediaSourcePtsCadenceEpochIndexV3,
  expectedMediaSourcePtsCadenceStreamIdV3,
  type MediaSourcePtsCadenceEpochIndexResourcePolicyV3,
  type MediaSourcePtsCadenceEpochIndexSerializationV3,
  type MediaSourcePtsCadenceEpochIndexSidecarV3,
} from './media-source-pts-cadence-epoch-index-v3';
import { parseMediaSourcePtsCadenceFrameBatchV2 }
  from './media-source-pts-cadence-frame-batch-v2';
import {
  verifyMediaSourcePtsCadenceManifestIndexV2,
  type MediaSourcePtsCadenceFrameBatchReaderV2,
} from './media-source-pts-cadence-index-verifier-v2';
import {
  createMediaSourcePtsCadenceMapAssetRecordV3,
  readMediaSourcePtsCadenceMapAssetStateV3,
  type MediaSourcePtsCadenceMapAssetRecordV3,
  type MediaSourcePtsCadenceMapAssetStateInputV3,
} from './media-source-pts-cadence-map-asset-owner-v3';
import {
  createMediaSourcePtsCadenceManifestIndexSidecarV2,
  readMediaSourcePtsCadenceMapAssetStateV2,
  type MediaSourcePtsCadenceStoredObjectReaderV2,
} from './media-source-pts-cadence-map-asset-state-v2';
import {
  parseMediaSourcePtsCadenceManifestIndexV2,
  type MediaSourcePtsCadenceManifestIndexSerializationV2,
} from './media-source-pts-cadence-manifest-index-v2';

export const MEDIA_SOURCE_PTS_CADENCE_V2_TO_V3_MIGRATION_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_V2_TO_V3_MIGRATION_V1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_V2_TO_V3_MIGRATION_OWNER_VERSION_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_V2_TO_V3_MIGRATION_OWNER_V1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_V2_MIGRATION_EPOCH_DETECTOR_VERSION_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_V2_CONTIGUOUS_EPOCH_V1' as const;

export type MediaSourcePtsCadenceV2ToV3MigrationReceiptV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_V2_TO_V3_MIGRATION_KIND_V1;
  ownerVersion: typeof MEDIA_SOURCE_PTS_CADENCE_V2_TO_V3_MIGRATION_OWNER_VERSION_V1;
  sourceVersionSha256: string;
  mapBindingSha256: string;
  v2StateSha256: string;
  v2TerminalReceiptSha256: string;
  v2ManifestIndexContentSha256: string;
  v2IndexVerificationSha256: string;
  v3EpochIndexContentSha256: string;
  v3PendingRecordSha256: string;
  migratedAt: string;
  migrationReceiptSha256: string;
}>;

export type MediaSourcePtsCadenceV2ToV3MigrationResultV1 = Readonly<
  | {
      disposition: 'MIGRATION_READY';
      epochIndex: MediaSourcePtsCadenceEpochIndexSerializationV3;
      epochIndexSidecar: MediaSourcePtsCadenceEpochIndexSidecarV3;
      pendingRecord: MediaSourcePtsCadenceMapAssetRecordV3;
      receipt: MediaSourcePtsCadenceV2ToV3MigrationReceiptV1;
    }
  | {
      disposition: 'NOT_APPLICABLE';
      reason: 'NO_V2_STATE' | 'V2_NOT_COMPLETE' | 'V3_ALREADY_PRESENT';
    }
  | {
      disposition: 'UNVERIFIABLE';
      reason:
        | 'CURRENT_STATE_INVALID'
        | 'PARALLEL_V2_V3_STATE'
        | 'STORED_READER_INVALID'
        | 'V2_MANIFEST_READ_FAILED'
        | 'V2_MANIFEST_INVALID'
        | 'V2_INDEX_INTEGRITY_UNVERIFIABLE'
        | 'V2_TERMINAL_SCOPE_MISMATCH'
        | 'V2_CADENCE_MISMATCH'
        | 'V3_CANDIDATE_INVALID';
      detail: string | null;
    }
>;

/**
 * Rebuilds one explicit V3 INITIAL epoch from a complete contiguous V2 map.
 * It performs no storage or MEDIA_ASSETS write; a later owner must persist the
 * immutable index and atomically compare-and-set the exact V2 state to V3.
 */
export async function prepareMediaSourcePtsCadenceV2ToV3MigrationV1(input: {
  asset: MediaSourcePtsCadenceMapAssetStateInputV3;
  storedObjectReader: MediaSourcePtsCadenceStoredObjectReaderV2;
  epochIndexResourcePolicy: MediaSourcePtsCadenceEpochIndexResourcePolicyV3;
  verificationPolicy: MediaSourcePtsCadenceEpochArtifactVerificationPolicyV3;
  now: Date;
}): Promise<MediaSourcePtsCadenceV2ToV3MigrationResultV1> {
  const v2Pair = pairState(
    input.asset?.sourcePtsCadenceMapV2,
    input.asset?.sourcePtsCadenceMapStateSha256V2,
  );
  const v3Pair = pairState(
    input.asset?.sourcePtsCadenceMapV3,
    input.asset?.sourcePtsCadenceMapStateSha256V3,
  );
  if (v2Pair === 'PARTIAL' || v3Pair === 'PARTIAL') return failed('CURRENT_STATE_INVALID');
  if (v2Pair === 'PRESENT' && v3Pair === 'PRESENT') {
    return failed('PARALLEL_V2_V3_STATE');
  }
  if (v3Pair === 'PRESENT') {
    try {
      readMediaSourcePtsCadenceMapAssetStateV3(input.asset);
      return { disposition: 'NOT_APPLICABLE', reason: 'V3_ALREADY_PRESENT' };
    } catch {
      return failed('CURRENT_STATE_INVALID');
    }
  }
  if (v2Pair === 'ABSENT') {
    if (present(input.asset?.sourcePtsCadenceMapV1)
      || present(input.asset?.sourcePtsCadenceMapStateSha256V1)) {
      return failed('CURRENT_STATE_INVALID');
    }
    return { disposition: 'NOT_APPLICABLE', reason: 'NO_V2_STATE' };
  }

  let state: NonNullable<ReturnType<typeof readMediaSourcePtsCadenceMapAssetStateV2>>;
  try {
    state = readMediaSourcePtsCadenceMapAssetStateV2(input.asset)!;
  } catch {
    return failed('CURRENT_STATE_INVALID');
  }
  const record = state.sourcePtsCadenceMapV2;
  if (record.lifecycleV1.status !== 'COMPLETE'
    || record.manifestIndex === null
    || record.terminalReceipt === null) {
    return { disposition: 'NOT_APPLICABLE', reason: 'V2_NOT_COMPLETE' };
  }
  if (!input.storedObjectReader
    || typeof input.storedObjectReader.read !== 'function') {
    return failed('STORED_READER_INVALID');
  }

  const objects = new Map<string, StoredObjectV1>();
  let manifest: MediaSourcePtsCadenceManifestIndexSerializationV2;
  try {
    const storedManifest = await input.storedObjectReader.read(record.manifestIndex);
    if (!storedObjectMatches(storedManifest, record.manifestIndex)) {
      return failed('V2_MANIFEST_INVALID');
    }
    const index = parseMediaSourcePtsCadenceManifestIndexV2(
      storedManifest.canonicalJson,
    );
    manifest = {
      index,
      canonicalJson: storedManifest.canonicalJson,
      byteLength: storedManifest.byteLength,
      contentSha256: storedManifest.contentSha256,
    };
    const sidecar = createMediaSourcePtsCadenceManifestIndexSidecarV2({
      storage: record.manifestIndex.storage,
      manifestIndex: manifest,
    });
    if (canonicalizeEditronJsonV1(sidecar)
      !== canonicalizeEditronJsonV1(record.manifestIndex)) {
      return failed('V2_MANIFEST_INVALID');
    }
    objects.set(record.manifestIndex.objectKey, storedManifest);
  } catch {
    return failed('V2_MANIFEST_READ_FAILED');
  }

  const cachedReader: MediaSourcePtsCadenceFrameBatchReaderV2 = {
    read: async (sidecar) => {
      const cached = objects.get(sidecar.objectKey);
      if (cached) return cached;
      const stored = await input.storedObjectReader.read(sidecar);
      objects.set(sidecar.objectKey, stored);
      return stored;
    },
  };
  const verified = await verifyMediaSourcePtsCadenceManifestIndexV2({
    manifestIndex: manifest,
    reader: cachedReader,
  });
  if (verified.disposition !== 'INDEX_INTEGRITY_VERIFIED') {
    return failed('V2_INDEX_INTEGRITY_UNVERIFIABLE', verified.reason);
  }
  if (!terminalScopeMatches(state, verified)) {
    return failed('V2_TERMINAL_SCOPE_MISMATCH');
  }
  if (!cadenceMatches(record.terminalReceipt.sourceCadence, verified.observedCadence)) {
    return failed('V2_CADENCE_MISMATCH');
  }

  try {
    const lifecycle = record.lifecycleV1;
    const batches = manifest.index.batches.map((entry) => {
      const stored = objects.get(entry.sidecar.objectKey);
      if (!stored) throw new Error('VERIFIED_BATCH_NOT_CACHED');
      const payload = parseMediaSourcePtsCadenceFrameBatchV2(stored.canonicalJson);
      return {
        serialization: {
          payload,
          canonicalJson: stored.canonicalJson,
          byteLength: stored.byteLength,
          contentSha256: stored.contentSha256,
        },
        sidecar: entry.sidecar,
      };
    });
    const epochIndex = createMediaSourcePtsCadenceEpochIndexV3({
      sourceVersionSha256: lifecycle.sourceVersionSha256,
      mapBindingSha256: lifecycle.mapBindingSha256,
      videoStreamIndex: lifecycle.videoStreamIndex,
      sourceTimebase: lifecycle.sourceTimebase,
      resourcePolicy: input.epochIndexResourcePolicy,
      epochs: [{
        epoch: {
          schemaVersion: 1,
          contractVersion: CANONICAL_MEDIA_TIME_CONTRACT_VERSION_V1,
          kind: 'presentation-epoch',
          epochId: 'v2-contiguous-epoch-0',
          streamId: expectedMediaSourcePtsCadenceStreamIdV3(
            lifecycle.videoStreamIndex,
          ),
          secondsPerSourceTick: lifecycle.sourceTimebase,
          sourceStartPresentationTimestampTicks:
            record.terminalReceipt.sourceStartPresentationTimestampTicks,
          sourceEndExclusivePresentationTimestampTicks:
            record.terminalReceipt.sourceEndExclusivePresentationTimestampTicks,
          canonicalStartTime: { ticks: '0', timescale: '1' },
          boundaryKind: 'INITIAL',
        },
        boundary: {
          classificationBasis: 'FIRST_DECODED_PRESENTATION',
          detectorVersion:
            MEDIA_SOURCE_PTS_CADENCE_V2_MIGRATION_EPOCH_DETECTOR_VERSION_V1,
          externalEvidence: null,
        },
        batches,
      }],
    });
    const epochIndexSidecar = createMediaSourcePtsCadenceEpochIndexSidecarV3({
      storage: record.manifestIndex.storage,
      serialization: epochIndex,
    });
    const source = {
      sourceVersionSha256: lifecycle.sourceVersionSha256,
      storageVersionSha256: lifecycle.storageVersionSha256,
      sourceBindingSha256: lifecycle.sourceBindingSha256,
      technicalObservationSha256: lifecycle.technicalObservationSha256,
      mapBindingSha256: lifecycle.mapBindingSha256,
      videoStreamIndex: lifecycle.videoStreamIndex,
      sourceTimebase: lifecycle.sourceTimebase,
    };
    const pendingRecord = createMediaSourcePtsCadenceMapAssetRecordV3({
      source,
      epochIndexSidecar,
      verificationPolicy: input.verificationPolicy,
      now: input.now,
    });
    const material = {
      schemaVersion: 1 as const,
      kind: MEDIA_SOURCE_PTS_CADENCE_V2_TO_V3_MIGRATION_KIND_V1,
      ownerVersion: MEDIA_SOURCE_PTS_CADENCE_V2_TO_V3_MIGRATION_OWNER_VERSION_V1,
      sourceVersionSha256: lifecycle.sourceVersionSha256,
      mapBindingSha256: lifecycle.mapBindingSha256,
      v2StateSha256: state.sourcePtsCadenceMapStateSha256V2,
      v2TerminalReceiptSha256: record.terminalReceipt.terminalReceiptSha256,
      v2ManifestIndexContentSha256: record.manifestIndex.contentSha256,
      v2IndexVerificationSha256: verified.verificationSha256,
      v3EpochIndexContentSha256: epochIndex.contentSha256,
      v3PendingRecordSha256: hashEditronCanonicalJsonV1(pendingRecord),
      migratedAt: pendingRecord.requestedAt,
    };
    return frozen({
      disposition: 'MIGRATION_READY' as const,
      epochIndex,
      epochIndexSidecar,
      pendingRecord,
      receipt: {
        ...material,
        migrationReceiptSha256: hashEditronCanonicalJsonV1(material),
      },
    });
  } catch {
    return failed('V3_CANDIDATE_INVALID');
  }
}

type StoredObjectV1 = Readonly<{
  canonicalJson: string;
  byteLength: number;
  contentSha256: string;
}>;

function terminalScopeMatches(
  state: NonNullable<ReturnType<typeof readMediaSourcePtsCadenceMapAssetStateV2>>,
  verified: Extract<Awaited<ReturnType<
    typeof verifyMediaSourcePtsCadenceManifestIndexV2
  >>, { disposition: 'INDEX_INTEGRITY_VERIFIED' }>,
): boolean {
  const record = state.sourcePtsCadenceMapV2;
  const terminal = record.terminalReceipt!;
  const sidecar = record.manifestIndex!;
  return terminal.mapBindingSha256 === record.lifecycleV1.mapBindingSha256
    && terminal.manifestIndex.contentSha256 === sidecar.contentSha256
    && verified.mapBindingSha256 === terminal.mapBindingSha256
    && verified.manifestIndexContentSha256 === sidecar.contentSha256
    && verified.verifiedBatchCount === sidecar.batchCount
    && verified.verifiedFrameCount === sidecar.nextFrameOrdinal
    && verified.indexedRange.firstFrameOrdinal === '0'
    && verified.indexedRange.endExclusiveFrameOrdinal === sidecar.nextFrameOrdinal
    && verified.indexedRange.startPresentationTimestampTicks
      === terminal.sourceStartPresentationTimestampTicks
    && verified.indexedRange.endExclusivePresentationTimestampTicks
      === terminal.sourceEndExclusivePresentationTimestampTicks;
}

function cadenceMatches(
  terminal: Readonly<{ kind: 'CFR'; durationTicks: string } | { kind: 'VFR' }>,
  verified: Readonly<
    | { kind: 'UNIFORM_INDEXED_RANGE'; durationTicks: string }
    | { kind: 'VARIABLE_INDEXED_RANGE' }
  >,
): boolean {
  return terminal.kind === 'CFR'
    ? verified.kind === 'UNIFORM_INDEXED_RANGE'
      && verified.durationTicks === terminal.durationTicks
    : verified.kind === 'VARIABLE_INDEXED_RANGE';
}

function storedObjectMatches(
  stored: StoredObjectV1,
  expected: Readonly<{ byteLength: number; contentSha256: string }>,
): boolean {
  return stored?.byteLength === expected.byteLength
    && stored.byteLength === Buffer.byteLength(stored.canonicalJson, 'utf8')
    && stored.contentSha256 === expected.contentSha256
    && stored.contentSha256
      === createHash('sha256').update(stored.canonicalJson, 'utf8').digest('hex');
}

function pairState(record: unknown, hash: unknown): 'ABSENT' | 'PARTIAL' | 'PRESENT' {
  const hasRecord = present(record);
  const hasHash = present(hash);
  return hasRecord && hasHash ? 'PRESENT' : hasRecord || hasHash ? 'PARTIAL' : 'ABSENT';
}

function present(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function failed(
  reason: Extract<MediaSourcePtsCadenceV2ToV3MigrationResultV1, {
    disposition: 'UNVERIFIABLE';
  }>['reason'],
  detail: string | null = null,
): MediaSourcePtsCadenceV2ToV3MigrationResultV1 {
  return { disposition: 'UNVERIFIABLE', reason, detail };
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(value) as Readonly<T>;
}
