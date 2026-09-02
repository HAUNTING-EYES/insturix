import {
  createMediaSourcePtsCadenceMapAssetStateV1,
  readMediaSourcePtsCadenceMapAssetStateV1,
  type MediaSourcePtsCadenceMapAssetStateInputV1,
  type MediaSourcePtsCadenceMapAssetStateV1,
} from './media-source-pts-cadence-map-asset-state-v1';

export type MediaSourcePtsCadenceMapAssetStoreResultV1 =
  | { disposition: 'APPLIED'; state: MediaSourcePtsCadenceMapAssetStateV1 }
  | { disposition: 'RACE_LOST' }
  | { disposition: 'SKIPPED'; reason: 'ASSET_NOT_FOUND' }
  | {
      disposition: 'REJECTED';
      reason: 'CURRENT_STATE_INVALID' | 'EXPECTED_STATE_MISMATCH' | 'NEXT_STATE_INVALID';
    };

export type MediaSourcePtsCadenceMapAssetStorePortsV1 = Readonly<{
  load(assetId: string, userId: string): Promise<MediaSourcePtsCadenceMapAssetStateInputV1 | null>;
  replace(input: Readonly<{
    assetId: string;
    userId: string;
    expectedState: MediaSourcePtsCadenceMapAssetStateV1 | null;
    nextState: MediaSourcePtsCadenceMapAssetStateV1;
  }>): Promise<boolean>;
}>;

/**
 * The sole write boundary for a cadence-map state pair on an existing media
 * asset. Callers supply a lifecycle record; this owner proves it belongs to
 * the live source and performs one state-hash compare-and-set.
 */
export async function persistMediaSourcePtsCadenceMapAssetStateV1(input: {
  assetId: string;
  userId: string;
  expectedStateSha256: string | null;
  nextRecord: unknown;
}, ports: MediaSourcePtsCadenceMapAssetStorePortsV1): Promise<MediaSourcePtsCadenceMapAssetStoreResultV1> {
  const assetId = identifier(input.assetId, 'MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_ID_INVALID');
  const userId = identifier(input.userId, 'MEDIA_SOURCE_PTS_CADENCE_MAP_USER_ID_INVALID');
  const expectedStateSha256 = nullableSha256(
    input.expectedStateSha256,
    'MEDIA_SOURCE_PTS_CADENCE_MAP_EXPECTED_STATE_HASH_INVALID',
  );
  const asset = await ports.load(assetId, userId);
  if (!asset) return { disposition: 'SKIPPED', reason: 'ASSET_NOT_FOUND' };

  let currentState: MediaSourcePtsCadenceMapAssetStateV1 | null;
  try {
    currentState = readMediaSourcePtsCadenceMapAssetStateV1(asset);
  } catch {
    return { disposition: 'REJECTED', reason: 'CURRENT_STATE_INVALID' };
  }
  const currentStateSha256 = currentState
    ? currentState.sourcePtsCadenceMapStateSha256V1
    : null;
  if (currentStateSha256 !== expectedStateSha256) {
    return { disposition: 'REJECTED', reason: 'EXPECTED_STATE_MISMATCH' };
  }

  let nextState: MediaSourcePtsCadenceMapAssetStateV1;
  try {
    nextState = createMediaSourcePtsCadenceMapAssetStateV1({
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

/**
 * Runs the state owner against the existing MEDIA_ASSETS collection. This
 * function is intentionally not a worker or dispatch path; a future mapper
 * must invoke it through its own source-version-bound lifecycle.
 */
export async function runMediaSourcePtsCadenceMapAssetStoreV1(input: {
  assetId: string;
  userId: string;
  expectedStateSha256: string | null;
  nextRecord: unknown;
}): Promise<MediaSourcePtsCadenceMapAssetStoreResultV1> {
  const { getDatabase, COLLECTIONS } = await import('../db/mongodb');
  const db = await getDatabase();
  return persistMediaSourcePtsCadenceMapAssetStateV1(input, {
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
          },
        },
      );
      return asset as MediaSourcePtsCadenceMapAssetStateInputV1 | null;
    },
    replace: async ({ assetId, userId, expectedState, nextState }) => {
      const result = await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
        mediaSourcePtsCadenceMapAssetCompareAndSetFilterV1({
          assetId,
          userId,
          expectedState,
          nextState,
        }),
        {
          $set: {
            sourcePtsCadenceMapV1: nextState.sourcePtsCadenceMapV1,
            sourcePtsCadenceMapStateSha256V1: nextState.sourcePtsCadenceMapStateSha256V1,
          },
        },
      );
      return result.matchedCount === 1;
    },
  });
}

/** Exact Mongo filter for a single source-bound asset-state transition. */
export function mediaSourcePtsCadenceMapAssetCompareAndSetFilterV1(input: Readonly<{
  assetId: string;
  userId: string;
  expectedState: MediaSourcePtsCadenceMapAssetStateV1 | null;
  nextState: MediaSourcePtsCadenceMapAssetStateV1;
}>): Record<string, unknown> {
  const next = input.nextState.sourcePtsCadenceMapV1;
  const assetId = identifier(input.assetId, 'MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_ID_INVALID');
  const filter: Record<string, unknown> = {
    assetId,
    userId: identifier(input.userId, 'MEDIA_SOURCE_PTS_CADENCE_MAP_USER_ID_INVALID'),
    type: 'video',
    'sourceVersionV1.sourceVersionSha256': next.sourceVersionSha256,
    'sourceVersionV1.storageVersion.storageVersionSha256': next.storageVersionSha256,
    'sourceQualificationV1.status': 'MEASURED_TECHNICAL',
    'sourceQualificationV1.assetId': assetId,
    'sourceQualificationV1.sourceBindingSha256': next.sourceBindingSha256,
    'sourceQualificationV1.storageVersion.storageVersionSha256': next.storageVersionSha256,
    'sourceQualificationV1.observation.observationSha256': next.technicalObservationSha256,
  };
  if (!input.expectedState) {
    filter.$or = [
      {
        sourcePtsCadenceMapV1: { $exists: false },
        sourcePtsCadenceMapStateSha256V1: { $exists: false },
      },
      {
        sourcePtsCadenceMapV1: null,
        sourcePtsCadenceMapStateSha256V1: null,
      },
    ];
    return filter;
  }

  const expected = input.expectedState.sourcePtsCadenceMapV1;
  filter.sourcePtsCadenceMapStateSha256V1 = input.expectedState.sourcePtsCadenceMapStateSha256V1;
  filter['sourcePtsCadenceMapV1.mapBindingSha256'] = expected.mapBindingSha256;
  filter['sourcePtsCadenceMapV1.status'] = expected.status;
  filter['sourcePtsCadenceMapV1.attemptCount'] = expected.attemptCount;
  filter['sourcePtsCadenceMapV1.checkpoint.nextShardSequence'] = expected.checkpoint.nextShardSequence;
  filter['sourcePtsCadenceMapV1.checkpoint.nextFrameOrdinal'] = expected.checkpoint.nextFrameOrdinal;
  filter['sourcePtsCadenceMapV1.checkpoint.nextPresentationTimestampTicks'] = expected.checkpoint.nextPresentationTimestampTicks;
  filter['sourcePtsCadenceMapV1.checkpoint.appendedShardCount'] = expected.checkpoint.appendedShardCount;
  filter['sourcePtsCadenceMapV1.checkpoint.cumulativeShardBindingSha256'] = expected.checkpoint.cumulativeShardBindingSha256;
  filter['sourcePtsCadenceMapV1.activeClaim'] = expected.activeClaim;
  filter['sourcePtsCadenceMapV1.completedAt'] = expected.completedAt;
  filter['sourcePtsCadenceMapV1.diagnostic'] = expected.diagnostic;
  filter['sourcePtsCadenceMapV1.completion'] = expected.completion;
  return filter;
}

function identifier(value: unknown, code: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) {
    throw new Error(code);
  }
  return value.trim();
}

function nullableSha256(value: unknown, code: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(code);
  }
  return value;
}
