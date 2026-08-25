import type { MediaSourcePtsCadenceMapAssetRecordV2 }
  from './media-source-pts-cadence-map-asset-state-v2';
import {
  assertMediaSourcePtsCadenceMapRecordV1,
  type MediaSourcePtsCadenceMapRecordV1,
} from './media-source-pts-cadence-map-lifecycle-v1';

/**
 * Extends only the existing MEDIA_ASSETS cadence-map claim. It does not create
 * another lease, increment an attempt or grant a different claimant ownership.
 */
export function renewMediaSourcePtsCadenceMapClaimV1(input: Readonly<{
  record: MediaSourcePtsCadenceMapRecordV1;
  claimId: string;
  now: Date;
  expiresAt: Date;
}>): Readonly<MediaSourcePtsCadenceMapRecordV1> {
  const record = assertMediaSourcePtsCadenceMapRecordV1(input.record);
  const claimId = identifier(input.claimId);
  const now = validDate(input.now, 'MEDIA_SOURCE_PTS_CADENCE_MAP_RENEW_NOW_INVALID');
  const expiresAt = validDate(
    input.expiresAt,
    'MEDIA_SOURCE_PTS_CADENCE_MAP_RENEW_EXPIRY_INVALID',
  );
  const active = record.activeClaim;
  if (record.status !== 'MAPPING' || !active || active.claimId !== claimId
    || Date.parse(active.expiresAt) <= now.getTime()) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_RENEW_CLAIM_NOT_ACTIVE');
  }
  if (expiresAt.getTime() <= now.getTime()) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_RENEW_EXPIRY_INVALID');
  }
  if (expiresAt.getTime() <= Date.parse(active.expiresAt)) return record;
  return assertMediaSourcePtsCadenceMapRecordV1({
    ...record,
    activeClaim: { ...active, expiresAt: expiresAt.toISOString() },
  });
}

export function renewMediaSourcePtsCadenceMapAssetClaimV2(input: Readonly<{
  record: MediaSourcePtsCadenceMapAssetRecordV2;
  claimId: string;
  now: Date;
  expiresAt: Date;
}>): Readonly<MediaSourcePtsCadenceMapAssetRecordV2> {
  return Object.freeze({
    ...input.record,
    lifecycleV1: renewMediaSourcePtsCadenceMapClaimV1({
      record: input.record.lifecycleV1,
      claimId: input.claimId,
      now: input.now,
      expiresAt: input.expiresAt,
    }),
  });
}

function identifier(value: unknown): string {
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value.trim())) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_RENEW_CLAIM_ID_INVALID');
  }
  return value.trim();
}

function validDate(value: Date, code: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(code);
  }
  return value;
}
