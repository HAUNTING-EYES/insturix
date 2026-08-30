import { canonicalizeEditronJsonV1 } from './canonical-json-v1';
import {
  createMediaSourcePtsCadenceMapAssetStateV3,
  type MediaSourcePtsCadenceMapAssetStateInputV3,
  type MediaSourcePtsCadenceMapAssetStateV3,
} from './media-source-pts-cadence-map-asset-owner-v3';
import {
  readMediaSourcePtsCadenceMapAssetStateV2,
  type MediaSourcePtsCadenceMapAssetStateV2,
  type MediaSourcePtsCadenceStoredObjectReaderV2,
} from './media-source-pts-cadence-map-asset-state-v2';
import { mediaSourcePtsCadenceMapAssetCompareAndSetFilterV2 }
  from './media-source-pts-cadence-map-asset-store-v2';
import { createMediaSourcePtsCadenceR2RuntimePortsV1 }
  from './media-source-pts-cadence-r2-runtime-v1';
import type { MediaSourcePtsCadenceR2EpochIndexWriterV3 }
  from './media-source-pts-cadence-r2-epoch-index-writer-v3';
import type {
  MediaSourcePtsCadenceEpochArtifactVerificationPolicyV3,
} from './media-source-pts-cadence-epoch-artifact-verifier-v3';
import type { MediaSourcePtsCadenceEpochIndexResourcePolicyV3 }
  from './media-source-pts-cadence-epoch-index-v3';
import {
  prepareMediaSourcePtsCadenceV2ToV3MigrationV1,
  type MediaSourcePtsCadenceV2ToV3MigrationReceiptV1,
  type MediaSourcePtsCadenceV2ToV3MigrationResultV1,
} from './media-source-pts-cadence-v2-to-v3-migration-v1';

export type MediaSourcePtsCadenceV2ToV3MigrationAssetInputV1 =
  MediaSourcePtsCadenceMapAssetStateInputV3 & Readonly<{
    sourcePtsCadenceMapV2ToV3MigrationReceiptV1?: unknown;
    sourcePtsCadenceMapV2ToV3MigrationReceiptSha256V1?: unknown;
  }>;

type PreparationNotReadyV1 = Exclude<
  MediaSourcePtsCadenceV2ToV3MigrationResultV1,
  { disposition: 'MIGRATION_READY' }
>;

export type MediaSourcePtsCadenceV2ToV3MigrationStoreResultV1 =
  | PreparationNotReadyV1
  | Readonly<{ disposition: 'SKIPPED'; reason: 'ASSET_NOT_FOUND' }>
  | Readonly<{ disposition: 'RACE_LOST' }>
  | Readonly<{
      disposition: 'UNVERIFIABLE';
      reason:
        | 'NEXT_STATE_INVALID'
        | 'EPOCH_INDEX_WRITE_FAILED'
        | 'EPOCH_INDEX_WRITE_MISMATCH';
      detail: null;
    }>
  | Readonly<{
      disposition: 'MIGRATED';
      state: MediaSourcePtsCadenceMapAssetStateV3;
      receipt: MediaSourcePtsCadenceV2ToV3MigrationReceiptV1;
    }>;

export type MediaSourcePtsCadenceV2ToV3MigrationStorePortsV1 = Readonly<{
  load(assetId: string, userId: string): Promise<
    MediaSourcePtsCadenceV2ToV3MigrationAssetInputV1 | null
  >;
  replace(input: Readonly<{
    assetId: string;
    userId: string;
    expectedState: MediaSourcePtsCadenceMapAssetStateV2;
    nextState: MediaSourcePtsCadenceMapAssetStateV3;
    receipt: MediaSourcePtsCadenceV2ToV3MigrationReceiptV1;
  }>): Promise<boolean>;
  storedObjectReader: MediaSourcePtsCadenceStoredObjectReaderV2;
  epochIndexWriter: MediaSourcePtsCadenceR2EpochIndexWriterV3;
}>;

/**
 * Publishes a verified contiguous V2 map as V3 in one exact asset CAS. The V3
 * index is immutable and may be safely orphaned if a later CAS loses a race;
 * no asset can reference it unless every V2/source guard still matches.
 */
export async function migrateMediaSourcePtsCadenceV2ToV3V1(input: {
  assetId: string;
  userId: string;
  epochIndexResourcePolicy: MediaSourcePtsCadenceEpochIndexResourcePolicyV3;
  verificationPolicy: MediaSourcePtsCadenceEpochArtifactVerificationPolicyV3;
  now: Date;
}, ports: MediaSourcePtsCadenceV2ToV3MigrationStorePortsV1): Promise<
  MediaSourcePtsCadenceV2ToV3MigrationStoreResultV1
> {
  const assetId = identifier(input.assetId, 'MEDIA_SOURCE_PTS_CADENCE_MIGRATION_ASSET_ID_INVALID');
  const userId = identifier(input.userId, 'MEDIA_SOURCE_PTS_CADENCE_MIGRATION_USER_ID_INVALID');
  const asset = await ports.load(assetId, userId);
  if (!asset) return { disposition: 'SKIPPED', reason: 'ASSET_NOT_FOUND' };

  const prepared = await prepareMediaSourcePtsCadenceV2ToV3MigrationV1({
    asset,
    storedObjectReader: ports.storedObjectReader,
    epochIndexResourcePolicy: input.epochIndexResourcePolicy,
    verificationPolicy: input.verificationPolicy,
    now: input.now,
  });
  if (prepared.disposition !== 'MIGRATION_READY') return prepared;

  let expectedState: MediaSourcePtsCadenceMapAssetStateV2;
  let nextState: MediaSourcePtsCadenceMapAssetStateV3;
  try {
    expectedState = readMediaSourcePtsCadenceMapAssetStateV2(asset)!;
    if (!expectedState
      || prepared.receipt.v2StateSha256
        !== expectedState.sourcePtsCadenceMapStateSha256V2) {
      throw new Error('MIGRATION_EXPECTED_V2_STATE_MISMATCH');
    }
    nextState = createMediaSourcePtsCadenceMapAssetStateV3({
      asset: withoutCadenceState(asset),
      record: prepared.pendingRecord,
    });
  } catch {
    return { disposition: 'UNVERIFIABLE', reason: 'NEXT_STATE_INVALID', detail: null };
  }

  let written;
  try {
    written = await ports.epochIndexWriter.writeImmutableEpochIndex({
      serialization: prepared.epochIndex,
      expected: prepared.epochIndexSidecar,
    });
  } catch {
    return { disposition: 'UNVERIFIABLE', reason: 'EPOCH_INDEX_WRITE_FAILED', detail: null };
  }
  if (canonicalizeEditronJsonV1(written)
    !== canonicalizeEditronJsonV1(prepared.epochIndexSidecar)) {
    return { disposition: 'UNVERIFIABLE', reason: 'EPOCH_INDEX_WRITE_MISMATCH', detail: null };
  }

  if (!await ports.replace({
    assetId,
    userId,
    expectedState,
    nextState,
    receipt: prepared.receipt,
  })) {
    return { disposition: 'RACE_LOST' };
  }
  return { disposition: 'MIGRATED', state: nextState, receipt: prepared.receipt };
}

/** Product composition over the dedicated private R2 runtime and MEDIA_ASSETS. */
export async function runMediaSourcePtsCadenceV2ToV3MigrationV1(input: {
  assetId: string;
  userId: string;
  epochIndexResourcePolicy: MediaSourcePtsCadenceEpochIndexResourcePolicyV3;
  verificationPolicy: MediaSourcePtsCadenceEpochArtifactVerificationPolicyV3;
  now: Date;
}): Promise<MediaSourcePtsCadenceV2ToV3MigrationStoreResultV1> {
  const storage = createMediaSourcePtsCadenceR2RuntimePortsV1();
  const database = await createMediaSourcePtsCadenceV2ToV3MigrationMongoPortsV1();
  return migrateMediaSourcePtsCadenceV2ToV3V1(input, {
    ...database,
    storedObjectReader: storage.artifactPort,
    epochIndexWriter: storage.epochIndexWriter,
  });
}

export async function createMediaSourcePtsCadenceV2ToV3MigrationMongoPortsV1(): Promise<
  Pick<MediaSourcePtsCadenceV2ToV3MigrationStorePortsV1, 'load' | 'replace'>
> {
  const { getDatabase, COLLECTIONS } = await import('../db/mongodb');
  const db = await getDatabase();
  return {
    load: async (assetId, userId) => {
      const asset = await db.collection(COLLECTIONS.MEDIA_ASSETS).findOne(
        { assetId, userId },
        {
          projection: {
            assetId: 1,
            type: 1,
            sourceVersionV1: 1,
            sourceQualificationV1: 1,
            sourcePtsCadenceMapV1: 1,
            sourcePtsCadenceMapStateSha256V1: 1,
            sourcePtsCadenceMapV2: 1,
            sourcePtsCadenceMapStateSha256V2: 1,
            sourcePtsCadenceMapV3: 1,
            sourcePtsCadenceMapStateSha256V3: 1,
            sourcePtsCadenceMapV2ToV3MigrationReceiptV1: 1,
            sourcePtsCadenceMapV2ToV3MigrationReceiptSha256V1: 1,
          },
        },
      );
      return asset as MediaSourcePtsCadenceV2ToV3MigrationAssetInputV1 | null;
    },
    replace: async ({ assetId, userId, expectedState, nextState, receipt }) => {
      const result = await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
        mediaSourcePtsCadenceV2ToV3MigrationCompareAndSetFilterV1({
          assetId, userId, expectedState,
        }),
        {
          $set: {
            sourcePtsCadenceMapV1: null,
            sourcePtsCadenceMapStateSha256V1: null,
            sourcePtsCadenceMapV2: null,
            sourcePtsCadenceMapStateSha256V2: null,
            sourcePtsCadenceMapV3: nextState.sourcePtsCadenceMapV3,
            sourcePtsCadenceMapStateSha256V3: nextState.sourcePtsCadenceMapStateSha256V3,
            sourcePtsCadenceMapV2ToV3MigrationReceiptV1: receipt,
            sourcePtsCadenceMapV2ToV3MigrationReceiptSha256V1:
              receipt.migrationReceiptSha256,
          },
        },
      );
      return result.matchedCount === 1;
    },
  };
}

export function mediaSourcePtsCadenceV2ToV3MigrationCompareAndSetFilterV1(input: Readonly<{
  assetId: string;
  userId: string;
  expectedState: MediaSourcePtsCadenceMapAssetStateV2;
}>): Record<string, unknown> {
  const filter = mediaSourcePtsCadenceMapAssetCompareAndSetFilterV2({
    assetId: input.assetId,
    userId: input.userId,
    expectedState: input.expectedState,
    nextState: input.expectedState,
  });
  const guards = filter.$and;
  if (!Array.isArray(guards)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MIGRATION_V2_FILTER_INVALID');
  }
  guards.push(
    absentOrNull('sourcePtsCadenceMapV3'),
    absentOrNull('sourcePtsCadenceMapStateSha256V3'),
    absentOrNull('sourcePtsCadenceMapV2ToV3MigrationReceiptV1'),
    absentOrNull('sourcePtsCadenceMapV2ToV3MigrationReceiptSha256V1'),
  );
  return filter;
}

function withoutCadenceState(
  asset: MediaSourcePtsCadenceV2ToV3MigrationAssetInputV1,
): MediaSourcePtsCadenceMapAssetStateInputV3 {
  return {
    ...asset,
    sourcePtsCadenceMapV1: null,
    sourcePtsCadenceMapStateSha256V1: null,
    sourcePtsCadenceMapV2: null,
    sourcePtsCadenceMapStateSha256V2: null,
    sourcePtsCadenceMapV3: null,
    sourcePtsCadenceMapStateSha256V3: null,
  };
}

function absentOrNull(field: string): Record<string, unknown> {
  return { $or: [{ [field]: { $exists: false } }, { [field]: null }] };
}

function identifier(value: unknown, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(normalized)) throw new Error(code);
  return normalized;
}
