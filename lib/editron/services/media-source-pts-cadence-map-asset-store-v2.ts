import {
  createMediaSourcePtsCadenceMapAssetStateV2,
  readMediaSourcePtsCadenceMapAssetStateV2,
  type MediaSourcePtsCadenceMapAssetRecordV2,
  type MediaSourcePtsCadenceMapAssetStateInputV2,
  type MediaSourcePtsCadenceMapAssetStateV2,
} from './media-source-pts-cadence-map-asset-state-v2';

export type MediaSourcePtsCadenceMapAssetStoreResultV2 =
  | { disposition: 'APPLIED'; state: MediaSourcePtsCadenceMapAssetStateV2 }
  | { disposition: 'RACE_LOST' }
  | { disposition: 'SKIPPED'; reason: 'ASSET_NOT_FOUND' }
  | {
      disposition: 'REJECTED';
      reason:
        | 'LEGACY_V1_STATE_PRESENT'
        | 'CURRENT_STATE_INVALID'
        | 'EXPECTED_STATE_MISMATCH'
        | 'NEXT_STATE_INVALID';
    };

export type MediaSourcePtsCadenceMapAssetStorePortsV2 = Readonly<{
  load(assetId: string, userId: string): Promise<MediaSourcePtsCadenceMapAssetStateInputV2 | null>;
  replace(input: Readonly<{
    assetId: string;
    userId: string;
    expectedState: MediaSourcePtsCadenceMapAssetStateV2 | null;
    nextState: MediaSourcePtsCadenceMapAssetStateV2;
  }>): Promise<boolean>;
}>;

/**
 * The sole V2 write boundary on the existing MEDIA_ASSETS record. It refuses
 * to create a parallel V2 owner while a persisted V1 pair exists.
 */
export async function persistMediaSourcePtsCadenceMapAssetStateV2(input: {
  assetId: string;
  userId: string;
  expectedStateSha256: string | null;
  nextRecord: MediaSourcePtsCadenceMapAssetRecordV2;
}, ports: MediaSourcePtsCadenceMapAssetStorePortsV2): Promise<MediaSourcePtsCadenceMapAssetStoreResultV2> {
  const assetId = identifier(input.assetId, 'MEDIA_SOURCE_PTS_CADENCE_MAP_V2_ASSET_ID_INVALID');
  const userId = identifier(input.userId, 'MEDIA_SOURCE_PTS_CADENCE_MAP_V2_USER_ID_INVALID');
  const expectedStateSha256 = nullableSha256(
    input.expectedStateSha256,
    'MEDIA_SOURCE_PTS_CADENCE_MAP_V2_EXPECTED_STATE_HASH_INVALID',
  );
  const asset = await ports.load(assetId, userId);
  if (!asset) return { disposition: 'SKIPPED', reason: 'ASSET_NOT_FOUND' };
  if (hasLegacyV1State(asset)) {
    return { disposition: 'REJECTED', reason: 'LEGACY_V1_STATE_PRESENT' };
  }

  let currentState: MediaSourcePtsCadenceMapAssetStateV2 | null;
  try {
    currentState = readMediaSourcePtsCadenceMapAssetStateV2(asset);
  } catch {
    return { disposition: 'REJECTED', reason: 'CURRENT_STATE_INVALID' };
  }
  if ((currentState?.sourcePtsCadenceMapStateSha256V2 ?? null) !== expectedStateSha256) {
    return { disposition: 'REJECTED', reason: 'EXPECTED_STATE_MISMATCH' };
  }

  let nextState: MediaSourcePtsCadenceMapAssetStateV2;
  try {
    nextState = createMediaSourcePtsCadenceMapAssetStateV2({
      asset,
      record: input.nextRecord,
    });
  } catch {
    return { disposition: 'REJECTED', reason: 'NEXT_STATE_INVALID' };
  }
  if (!await ports.replace({ assetId, userId, expectedState: currentState, nextState })) {
    return { disposition: 'RACE_LOST' };
  }
  return { disposition: 'APPLIED', state: nextState };
}

/** Runs the V2 owner against the existing media collection, never another registry. */
export async function runMediaSourcePtsCadenceMapAssetStoreV2(input: {
  assetId: string;
  userId: string;
  expectedStateSha256: string | null;
  nextRecord: MediaSourcePtsCadenceMapAssetRecordV2;
}): Promise<MediaSourcePtsCadenceMapAssetStoreResultV2> {
  const { getDatabase, COLLECTIONS } = await import('../db/mongodb');
  const db = await getDatabase();
  return persistMediaSourcePtsCadenceMapAssetStateV2(input, {
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
          },
        },
      );
      return asset as MediaSourcePtsCadenceMapAssetStateInputV2 | null;
    },
    replace: async ({ assetId, userId, expectedState, nextState }) => {
      const result = await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
        mediaSourcePtsCadenceMapAssetCompareAndSetFilterV2({
          assetId,
          userId,
          expectedState,
          nextState,
        }),
        {
          $set: {
            sourcePtsCadenceMapV1: null,
            sourcePtsCadenceMapStateSha256V1: null,
            sourcePtsCadenceMapV2: nextState.sourcePtsCadenceMapV2,
            sourcePtsCadenceMapStateSha256V2: nextState.sourcePtsCadenceMapStateSha256V2,
          },
        },
      );
      return result.matchedCount === 1;
    },
  });
}

export function mediaSourcePtsCadenceMapAssetCompareAndSetFilterV2(input: Readonly<{
  assetId: string;
  userId: string;
  expectedState: MediaSourcePtsCadenceMapAssetStateV2 | null;
  nextState: MediaSourcePtsCadenceMapAssetStateV2;
}>): Record<string, unknown> {
  const next = input.nextState.sourcePtsCadenceMapV2.lifecycleV1;
  const assetId = identifier(input.assetId, 'MEDIA_SOURCE_PTS_CADENCE_MAP_V2_ASSET_ID_INVALID');
  const filter: Record<string, unknown> = {
    assetId,
    userId: identifier(input.userId, 'MEDIA_SOURCE_PTS_CADENCE_MAP_V2_USER_ID_INVALID'),
    type: 'video',
    'sourceVersionV1.sourceVersionSha256': next.sourceVersionSha256,
    'sourceVersionV1.storageVersion.storageVersionSha256': next.storageVersionSha256,
    'sourceQualificationV1.status': 'MEASURED_TECHNICAL',
    'sourceQualificationV1.assetId': assetId,
    'sourceQualificationV1.sourceBindingSha256': next.sourceBindingSha256,
    'sourceQualificationV1.storageVersion.storageVersionSha256': next.storageVersionSha256,
    'sourceQualificationV1.observation.observationSha256': next.technicalObservationSha256,
    $and: [
      absentOrNull('sourcePtsCadenceMapV1'),
      absentOrNull('sourcePtsCadenceMapStateSha256V1'),
    ],
  };
  if (!input.expectedState) {
    (filter.$and as Record<string, unknown>[]).push(
      absentOrNull('sourcePtsCadenceMapV2'),
      absentOrNull('sourcePtsCadenceMapStateSha256V2'),
    );
    return filter;
  }

  const expected = input.expectedState.sourcePtsCadenceMapV2;
  filter.sourcePtsCadenceMapStateSha256V2 = input.expectedState.sourcePtsCadenceMapStateSha256V2;
  filter['sourcePtsCadenceMapV2.lifecycleV1.mapBindingSha256'] = expected.lifecycleV1.mapBindingSha256;
  filter['sourcePtsCadenceMapV2.lifecycleV1.status'] = expected.lifecycleV1.status;
  filter['sourcePtsCadenceMapV2.lifecycleV1.attemptCount'] = expected.lifecycleV1.attemptCount;
  filter['sourcePtsCadenceMapV2.lifecycleV1.checkpoint.nextShardSequence'] =
    expected.lifecycleV1.checkpoint.nextShardSequence;
  filter['sourcePtsCadenceMapV2.lifecycleV1.checkpoint.nextFrameOrdinal'] =
    expected.lifecycleV1.checkpoint.nextFrameOrdinal;
  filter['sourcePtsCadenceMapV2.lifecycleV1.checkpoint.nextPresentationTimestampTicks'] =
    expected.lifecycleV1.checkpoint.nextPresentationTimestampTicks;
  filter['sourcePtsCadenceMapV2.manifestIndex.contentSha256'] = expected.manifestIndex?.contentSha256 ?? null;
  filter['sourcePtsCadenceMapV2.terminalReceipt.terminalReceiptSha256'] =
    expected.terminalReceipt?.terminalReceiptSha256 ?? null;
  return filter;
}

function absentOrNull(field: string): Record<string, unknown> {
  return { $or: [{ [field]: { $exists: false } }, { [field]: null }] };
}

function hasLegacyV1State(asset: MediaSourcePtsCadenceMapAssetStateInputV2): boolean {
  return asset.sourcePtsCadenceMapV1 !== undefined && asset.sourcePtsCadenceMapV1 !== null
    || asset.sourcePtsCadenceMapStateSha256V1 !== undefined
      && asset.sourcePtsCadenceMapStateSha256V1 !== null;
}

function identifier(value: unknown, code: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) {
    throw new Error(code);
  }
  return value.trim();
}

function nullableSha256(value: unknown, code: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(code);
  return value;
}
