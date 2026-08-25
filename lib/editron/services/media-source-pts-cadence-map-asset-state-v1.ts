import { deepFreezeEditronJsonV1 } from './canonical-json-v1';
import {
  assertMediaSourcePtsCadenceMapRecordV1,
  hashMediaSourcePtsCadenceMapRecordV1,
  type MediaSourcePtsCadenceMapRecordV1,
} from './media-source-pts-cadence-map-lifecycle-v1';
import { assertMediaSourceVersionV1 } from './media-source-version-v1';

/**
 * The exact pair persisted on the existing MEDIA_ASSETS record. The state
 * hash is a CAS token, not an independently authoritative media registry.
 */
export type MediaSourcePtsCadenceMapAssetStateV1 = Readonly<{
  sourcePtsCadenceMapV1: Readonly<MediaSourcePtsCadenceMapRecordV1>;
  sourcePtsCadenceMapStateSha256V1: string;
}>;

export type MediaSourcePtsCadenceMapAssetStateInputV1 = Readonly<{
  assetId?: unknown;
  type?: unknown;
  sourceVersionV1?: unknown;
  sourceQualificationV1?: unknown;
  sourcePtsCadenceMapV1?: unknown;
  sourcePtsCadenceMapStateSha256V1?: unknown;
}>;

/**
 * Creates an asset-owned state pair only when the map still binds to the
 * current source identity and measured technical observation.
 */
export function createMediaSourcePtsCadenceMapAssetStateV1(input: {
  asset: MediaSourcePtsCadenceMapAssetStateInputV1;
  record: unknown;
}): MediaSourcePtsCadenceMapAssetStateV1 {
  const record = assertMediaSourcePtsCadenceMapRecordV1(input.record);
  assertRecordMatchesAssetV1(record, input.asset);
  return deepFreezeEditronJsonV1({
    sourcePtsCadenceMapV1: record,
    sourcePtsCadenceMapStateSha256V1: hashMediaSourcePtsCadenceMapRecordV1(record),
  });
}

/**
 * Reads the optional persisted pair. A partial, stale or altered pair is an
 * error rather than a fallback to numeric FPS or an earlier source version.
 */
export function readMediaSourcePtsCadenceMapAssetStateV1(
  asset: MediaSourcePtsCadenceMapAssetStateInputV1,
): MediaSourcePtsCadenceMapAssetStateV1 | null {
  const hasRecord = !isAbsent(asset.sourcePtsCadenceMapV1);
  const hasStateHash = !isAbsent(asset.sourcePtsCadenceMapStateSha256V1);
  if (!hasRecord && !hasStateHash) return null;
  if (!hasRecord || !hasStateHash) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_STATE_INCOMPLETE');
  }
  const state = createMediaSourcePtsCadenceMapAssetStateV1({
    asset,
    record: asset.sourcePtsCadenceMapV1,
  });
  if (asset.sourcePtsCadenceMapStateSha256V1 !== state.sourcePtsCadenceMapStateSha256V1) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_STATE_HASH_MISMATCH');
  }
  return state;
}

function assertRecordMatchesAssetV1(
  record: Readonly<MediaSourcePtsCadenceMapRecordV1>,
  asset: MediaSourcePtsCadenceMapAssetStateInputV1,
): void {
  const assetId = boundedAssetId(asset.assetId);
  if (asset.type !== 'video') {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_MEDIA_KIND_INVALID');
  }

  let sourceVersion;
  try {
    sourceVersion = assertMediaSourceVersionV1(asset.sourceVersionV1);
  } catch {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_SOURCE_VERSION_INVALID');
  }
  if (
    sourceVersion.assetId !== assetId
    || sourceVersion.mediaKind !== 'video'
    || sourceVersion.sourceVersionSha256 !== record.sourceVersionSha256
    || sourceVersion.storageVersion.storageVersionSha256 !== record.storageVersionSha256
  ) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_SOURCE_VERSION_MISMATCH');
  }

  const qualification = objectRecord(asset.sourceQualificationV1);
  const storageVersion = objectRecord(qualification?.storageVersion);
  const observation = objectRecord(qualification?.observation);
  if (
    !qualification
    || qualification.status !== 'MEASURED_TECHNICAL'
    || qualification.assetId !== assetId
    || qualification.sourceBindingSha256 !== record.sourceBindingSha256
    || storageVersion?.storageVersionSha256 !== record.storageVersionSha256
    || observation?.observationSha256 !== record.technicalObservationSha256
  ) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_QUALIFICATION_MISMATCH');
  }
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedAssetId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_ID_INVALID');
  }
  return value.trim();
}

function isAbsent(value: unknown): boolean {
  return value === undefined || value === null;
}
