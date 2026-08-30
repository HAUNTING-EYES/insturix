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
  assertMediaSourcePtsCadenceEpochArtifactVerificationReceiptV3,
  assertMediaSourcePtsCadenceEpochIndexSidecarForVerificationV3,
  normalizeMediaSourcePtsCadenceEpochArtifactExpectedSourceV3,
  normalizeMediaSourcePtsCadenceEpochArtifactVerificationPolicyV3,
  type MediaSourcePtsCadenceEpochArtifactExpectedSourceV3,
  type MediaSourcePtsCadenceEpochArtifactVerificationPolicyV3,
  type MediaSourcePtsCadenceEpochArtifactVerificationReceiptV3,
} from './media-source-pts-cadence-epoch-artifact-verifier-v3';
import type { MediaSourcePtsCadenceEpochIndexSidecarV3 } from './media-source-pts-cadence-epoch-index-v3';
import type { MediaSourcePtsCadenceMapAssetStateInputV2 } from './media-source-pts-cadence-map-asset-state-v2';
import { assertMediaSourceVersionV1 } from './media-source-version-v1';

export const MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_RECORD_KIND_V3 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_RECORD_V3' as const;
export const MEDIA_SOURCE_PTS_CADENCE_MAP_TERMINAL_RECEIPT_KIND_V3 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_MAP_TERMINAL_RECEIPT_V3' as const;
export const MEDIA_SOURCE_PTS_CADENCE_MAP_CLAIM_MAX_MS_V3 = 60 * 60 * 1000;

export type MediaSourcePtsCadenceMapAssetStatusV3 =
  | 'PENDING'
  | 'VERIFYING'
  | 'COMPLETE'
  | 'UNVERIFIABLE';

export type MediaSourcePtsCadenceMapActiveClaimV3 = Readonly<{
  claimId: string;
  claimedAt: string;
  expiresAt: string;
}>;

export type MediaSourcePtsCadenceMapTerminalReceiptV3 = Readonly<{
  schemaVersion: 3;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_MAP_TERMINAL_RECEIPT_KIND_V3;
  disposition: 'PUBLISHED' | 'UNVERIFIABLE';
  sourceVersionSha256: string;
  storageVersionSha256: string;
  sourceBindingSha256: string;
  technicalObservationSha256: string;
  mapBindingSha256: string;
  epochIndexContentSha256: string;
  attemptCount: number;
  verificationSha256: string | null;
  completedAt: string;
  diagnostic: string | null;
  terminalReceiptSha256: string;
}>;

export type MediaSourcePtsCadenceMapAssetRecordV3 = Readonly<{
  schemaVersion: 3;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_RECORD_KIND_V3;
  status: MediaSourcePtsCadenceMapAssetStatusV3;
  source: MediaSourcePtsCadenceEpochArtifactExpectedSourceV3;
  epochIndexSidecar: MediaSourcePtsCadenceEpochIndexSidecarV3;
  verificationPolicy: MediaSourcePtsCadenceEpochArtifactVerificationPolicyV3;
  attemptCount: number;
  requestedAt: string;
  activeClaim: MediaSourcePtsCadenceMapActiveClaimV3 | null;
  verificationReceipt: MediaSourcePtsCadenceEpochArtifactVerificationReceiptV3 | null;
  terminalReceipt: MediaSourcePtsCadenceMapTerminalReceiptV3 | null;
  diagnostic: string | null;
}>;

export type MediaSourcePtsCadenceMapAssetStateV3 = Readonly<{
  sourcePtsCadenceMapV3: MediaSourcePtsCadenceMapAssetRecordV3;
  sourcePtsCadenceMapStateSha256V3: string;
}>;

export type MediaSourcePtsCadenceMapAssetStateInputV3 =
  MediaSourcePtsCadenceMapAssetStateInputV2 & Readonly<{
    sourcePtsCadenceMapV3?: unknown;
    sourcePtsCadenceMapStateSha256V3?: unknown;
  }>;

export type MediaSourcePtsCadenceMapAssetStoreResultV3 =
  | Readonly<{ disposition: 'APPLIED'; state: MediaSourcePtsCadenceMapAssetStateV3 }>
  | Readonly<{ disposition: 'UNCHANGED'; state: MediaSourcePtsCadenceMapAssetStateV3 }>
  | Readonly<{ disposition: 'RACE_LOST' }>
  | Readonly<{ disposition: 'SKIPPED'; reason: 'ASSET_NOT_FOUND' }>
  | Readonly<{
      disposition: 'REJECTED';
      reason:
        | 'EARLIER_STATE_PRESENT'
        | 'CURRENT_STATE_INVALID'
        | 'EXPECTED_STATE_MISMATCH'
        | 'NEXT_STATE_INVALID'
        | 'INVALID_TRANSITION';
    }>;

export type MediaSourcePtsCadenceMapAssetStorePortsV3 = Readonly<{
  load(assetId: string, userId: string): Promise<MediaSourcePtsCadenceMapAssetStateInputV3 | null>;
  replace(input: Readonly<{
    assetId: string;
    userId: string;
    expectedState: MediaSourcePtsCadenceMapAssetStateV3 | null;
    nextState: MediaSourcePtsCadenceMapAssetStateV3;
  }>): Promise<boolean>;
}>;

export function createMediaSourcePtsCadenceMapAssetRecordV3(input: {
  source: MediaSourcePtsCadenceEpochArtifactExpectedSourceV3;
  epochIndexSidecar: MediaSourcePtsCadenceEpochIndexSidecarV3;
  verificationPolicy: MediaSourcePtsCadenceEpochArtifactVerificationPolicyV3;
  now: Date;
}): MediaSourcePtsCadenceMapAssetRecordV3 {
  const source = normalizeMediaSourcePtsCadenceEpochArtifactExpectedSourceV3(input.source);
  const epochIndexSidecar = assertMediaSourcePtsCadenceEpochIndexSidecarForVerificationV3(
    input.epochIndexSidecar,
  );
  if (epochIndexSidecar.sourceVersionSha256 !== source.sourceVersionSha256
    || epochIndexSidecar.mapBindingSha256 !== source.mapBindingSha256) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_INDEX_SOURCE_MISMATCH');
  }
  return assertMediaSourcePtsCadenceMapAssetRecordV3({
    schemaVersion: 3,
    kind: MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_RECORD_KIND_V3,
    status: 'PENDING',
    source,
    epochIndexSidecar,
    verificationPolicy: normalizeMediaSourcePtsCadenceEpochArtifactVerificationPolicyV3(
      input.verificationPolicy,
    ),
    attemptCount: 0,
    requestedAt: isoDate(input.now, 'MEDIA_SOURCE_PTS_CADENCE_MAP_V3_REQUESTED_AT_INVALID'),
    activeClaim: null,
    verificationReceipt: null,
    terminalReceipt: null,
    diagnostic: null,
  });
}

export function claimMediaSourcePtsCadenceMapAssetRecordV3(input: {
  record: MediaSourcePtsCadenceMapAssetRecordV3;
  claimId: string;
  now: Date;
  expiresAt: Date;
}): MediaSourcePtsCadenceMapAssetRecordV3 {
  const record = assertMediaSourcePtsCadenceMapAssetRecordV3(input.record);
  if (record.status === 'COMPLETE' || record.status === 'UNVERIFIABLE') {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_TERMINAL');
  }
  const claimedAt = isoDate(input.now, 'MEDIA_SOURCE_PTS_CADENCE_MAP_V3_CLAIMED_AT_INVALID');
  const expiresAt = isoDate(input.expiresAt, 'MEDIA_SOURCE_PTS_CADENCE_MAP_V3_EXPIRES_AT_INVALID');
  const claimStartMs = Date.parse(claimedAt);
  const claimEndMs = Date.parse(expiresAt);
  if (claimEndMs <= claimStartMs
    || claimEndMs - claimStartMs > MEDIA_SOURCE_PTS_CADENCE_MAP_CLAIM_MAX_MS_V3) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_CLAIM_WINDOW_INVALID');
  }
  if (record.status === 'VERIFYING'
    && record.activeClaim !== null
    && Date.parse(record.activeClaim.expiresAt) > claimStartMs) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_CLAIM_ACTIVE');
  }
  return assertMediaSourcePtsCadenceMapAssetRecordV3({
    ...record,
    status: 'VERIFYING',
    attemptCount: record.attemptCount + 1,
    activeClaim: {
      claimId: identifier(input.claimId, 'MEDIA_SOURCE_PTS_CADENCE_MAP_V3_CLAIM_ID_INVALID'),
      claimedAt,
      expiresAt,
    },
    verificationReceipt: null,
    terminalReceipt: null,
    diagnostic: null,
  });
}

/**
 * Extends the current claimant's bounded verification lease without creating
 * another attempt. `claimedAt` is the start of the current lease window, so a
 * renewal can remain bounded by the same maximum even across a long scan.
 */
export function renewMediaSourcePtsCadenceMapAssetClaimV3(input: {
  record: MediaSourcePtsCadenceMapAssetRecordV3;
  claimId: string;
  now: Date;
  expiresAt: Date;
}): MediaSourcePtsCadenceMapAssetRecordV3 {
  const record = assertActiveClaim(input.record, input.claimId, input.now);
  const claimedAt = isoDate(
    input.now,
    'MEDIA_SOURCE_PTS_CADENCE_MAP_V3_RENEWED_AT_INVALID',
  );
  const expiresAt = isoDate(
    input.expiresAt,
    'MEDIA_SOURCE_PTS_CADENCE_MAP_V3_RENEW_EXPIRES_AT_INVALID',
  );
  const leaseMs = Date.parse(expiresAt) - Date.parse(claimedAt);
  if (leaseMs <= 0 || leaseMs > MEDIA_SOURCE_PTS_CADENCE_MAP_CLAIM_MAX_MS_V3) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_RENEW_WINDOW_INVALID');
  }
  if (Date.parse(expiresAt) <= Date.parse(record.activeClaim!.expiresAt)) {
    return record;
  }
  return assertMediaSourcePtsCadenceMapAssetRecordV3({
    ...record,
    activeClaim: {
      claimId: record.activeClaim!.claimId,
      claimedAt,
      expiresAt,
    },
  });
}

export function completeMediaSourcePtsCadenceMapAssetRecordV3(input: {
  record: MediaSourcePtsCadenceMapAssetRecordV3;
  claimId: string;
  verificationReceipt: MediaSourcePtsCadenceEpochArtifactVerificationReceiptV3;
  now: Date;
}): MediaSourcePtsCadenceMapAssetRecordV3 {
  const record = assertActiveClaim(
    input.record,
    input.claimId,
    input.now,
  );
  const verificationReceipt = assertMediaSourcePtsCadenceEpochArtifactVerificationReceiptV3(
    input.verificationReceipt,
  );
  assertVerificationReceiptMatchesRecord(verificationReceipt, record);
  const completedAt = isoDate(input.now, 'MEDIA_SOURCE_PTS_CADENCE_MAP_V3_COMPLETED_AT_INVALID');
  const terminalReceipt = createTerminalReceipt({
    record,
    disposition: 'PUBLISHED',
    verificationSha256: verificationReceipt.verificationSha256,
    completedAt,
    diagnostic: null,
  });
  return assertMediaSourcePtsCadenceMapAssetRecordV3({
    ...record,
    status: 'COMPLETE',
    activeClaim: null,
    verificationReceipt,
    terminalReceipt,
    diagnostic: null,
  });
}

export function markMediaSourcePtsCadenceMapAssetRecordUnverifiableV3(input: {
  record: MediaSourcePtsCadenceMapAssetRecordV3;
  claimId: string;
  diagnostic: string;
  now: Date;
}): MediaSourcePtsCadenceMapAssetRecordV3 {
  const record = assertActiveClaim(input.record, input.claimId, input.now);
  const diagnostic = boundedDiagnostic(input.diagnostic);
  const completedAt = isoDate(input.now, 'MEDIA_SOURCE_PTS_CADENCE_MAP_V3_COMPLETED_AT_INVALID');
  const terminalReceipt = createTerminalReceipt({
    record,
    disposition: 'UNVERIFIABLE',
    verificationSha256: null,
    completedAt,
    diagnostic,
  });
  return assertMediaSourcePtsCadenceMapAssetRecordV3({
    ...record,
    status: 'UNVERIFIABLE',
    activeClaim: null,
    verificationReceipt: null,
    terminalReceipt,
    diagnostic,
  });
}

export function createMediaSourcePtsCadenceMapAssetStateV3(input: {
  asset: MediaSourcePtsCadenceMapAssetStateInputV3;
  record: unknown;
}): MediaSourcePtsCadenceMapAssetStateV3 {
  assertNoEarlierState(input.asset);
  const record = assertMediaSourcePtsCadenceMapAssetRecordV3(input.record);
  assertRecordMatchesAsset(record, input.asset);
  return frozen({
    sourcePtsCadenceMapV3: record,
    sourcePtsCadenceMapStateSha256V3: hashEditronCanonicalJsonV1(record),
  });
}

export function readMediaSourcePtsCadenceMapAssetStateV3(
  asset: MediaSourcePtsCadenceMapAssetStateInputV3,
): MediaSourcePtsCadenceMapAssetStateV3 | null {
  const hasRecord = !isAbsent(asset.sourcePtsCadenceMapV3);
  const hasHash = !isAbsent(asset.sourcePtsCadenceMapStateSha256V3);
  if (!hasRecord && !hasHash) return null;
  if (!hasRecord || !hasHash) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_STATE_V3_INCOMPLETE');
  }
  const state = createMediaSourcePtsCadenceMapAssetStateV3({
    asset,
    record: asset.sourcePtsCadenceMapV3,
  });
  if (asset.sourcePtsCadenceMapStateSha256V3 !== state.sourcePtsCadenceMapStateSha256V3) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_STATE_V3_HASH_MISMATCH');
  }
  return state;
}

export async function persistMediaSourcePtsCadenceMapAssetStateV3(input: {
  assetId: string;
  userId: string;
  expectedStateSha256: string | null;
  nextRecord: MediaSourcePtsCadenceMapAssetRecordV3;
}, ports: MediaSourcePtsCadenceMapAssetStorePortsV3): Promise<MediaSourcePtsCadenceMapAssetStoreResultV3> {
  const assetId = identifier(input.assetId, 'MEDIA_SOURCE_PTS_CADENCE_MAP_V3_ASSET_ID_INVALID');
  const userId = identifier(input.userId, 'MEDIA_SOURCE_PTS_CADENCE_MAP_V3_USER_ID_INVALID');
  const expectedStateSha256 = nullableSha256(
    input.expectedStateSha256,
    'MEDIA_SOURCE_PTS_CADENCE_MAP_V3_EXPECTED_STATE_HASH_INVALID',
  );
  const asset = await ports.load(assetId, userId);
  if (!asset) return { disposition: 'SKIPPED', reason: 'ASSET_NOT_FOUND' };
  if (hasEarlierState(asset)) {
    return { disposition: 'REJECTED', reason: 'EARLIER_STATE_PRESENT' };
  }

  let currentState: MediaSourcePtsCadenceMapAssetStateV3 | null;
  try {
    currentState = readMediaSourcePtsCadenceMapAssetStateV3(asset);
  } catch {
    return { disposition: 'REJECTED', reason: 'CURRENT_STATE_INVALID' };
  }
  if ((currentState?.sourcePtsCadenceMapStateSha256V3 ?? null) !== expectedStateSha256) {
    return { disposition: 'REJECTED', reason: 'EXPECTED_STATE_MISMATCH' };
  }

  let nextState: MediaSourcePtsCadenceMapAssetStateV3;
  try {
    nextState = createMediaSourcePtsCadenceMapAssetStateV3({
      asset,
      record: input.nextRecord,
    });
  } catch {
    return { disposition: 'REJECTED', reason: 'NEXT_STATE_INVALID' };
  }
  if (currentState?.sourcePtsCadenceMapStateSha256V3
    === nextState.sourcePtsCadenceMapStateSha256V3) {
    return { disposition: 'UNCHANGED', state: currentState };
  }
  try {
    assertPersistedTransition(currentState?.sourcePtsCadenceMapV3 ?? null, nextState.sourcePtsCadenceMapV3);
  } catch {
    return { disposition: 'REJECTED', reason: 'INVALID_TRANSITION' };
  }
  if (!await ports.replace({ assetId, userId, expectedState: currentState, nextState })) {
    return { disposition: 'RACE_LOST' };
  }
  return { disposition: 'APPLIED', state: nextState };
}

export async function runMediaSourcePtsCadenceMapAssetStoreV3(input: {
  assetId: string;
  userId: string;
  expectedStateSha256: string | null;
  nextRecord: MediaSourcePtsCadenceMapAssetRecordV3;
}): Promise<MediaSourcePtsCadenceMapAssetStoreResultV3> {
  return persistMediaSourcePtsCadenceMapAssetStateV3(
    input,
    await createMediaSourcePtsCadenceMapAssetMongoPortsV3(),
  );
}

export async function createMediaSourcePtsCadenceMapAssetMongoPortsV3(
): Promise<MediaSourcePtsCadenceMapAssetStorePortsV3> {
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
          },
        },
      );
      return asset as MediaSourcePtsCadenceMapAssetStateInputV3 | null;
    },
    replace: async ({ assetId, userId, expectedState, nextState }) => {
      const result = await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
        mediaSourcePtsCadenceMapAssetCompareAndSetFilterV3({
          assetId,
          userId,
          expectedState,
          nextState,
        }),
        {
          $set: {
            sourcePtsCadenceMapV1: null,
            sourcePtsCadenceMapStateSha256V1: null,
            sourcePtsCadenceMapV2: null,
            sourcePtsCadenceMapStateSha256V2: null,
            sourcePtsCadenceMapV3: nextState.sourcePtsCadenceMapV3,
            sourcePtsCadenceMapStateSha256V3: nextState.sourcePtsCadenceMapStateSha256V3,
          },
        },
      );
      return result.matchedCount === 1;
    },
  };
}

export function mediaSourcePtsCadenceMapAssetCompareAndSetFilterV3(input: Readonly<{
  assetId: string;
  userId: string;
  expectedState: MediaSourcePtsCadenceMapAssetStateV3 | null;
  nextState: MediaSourcePtsCadenceMapAssetStateV3;
}>): Record<string, unknown> {
  const next = input.nextState.sourcePtsCadenceMapV3;
  const assetId = identifier(input.assetId, 'MEDIA_SOURCE_PTS_CADENCE_MAP_V3_ASSET_ID_INVALID');
  const filter: Record<string, unknown> = {
    assetId,
    userId: identifier(input.userId, 'MEDIA_SOURCE_PTS_CADENCE_MAP_V3_USER_ID_INVALID'),
    type: 'video',
    'sourceVersionV1.sourceVersionSha256': next.source.sourceVersionSha256,
    'sourceVersionV1.storageVersion.storageVersionSha256': next.source.storageVersionSha256,
    'sourceQualificationV1.status': 'MEASURED_TECHNICAL',
    'sourceQualificationV1.assetId': assetId,
    'sourceQualificationV1.sourceBindingSha256': next.source.sourceBindingSha256,
    'sourceQualificationV1.storageVersion.storageVersionSha256': next.source.storageVersionSha256,
    'sourceQualificationV1.observation.observationSha256': next.source.technicalObservationSha256,
    $and: [
      absentOrNull('sourcePtsCadenceMapV1'),
      absentOrNull('sourcePtsCadenceMapStateSha256V1'),
      absentOrNull('sourcePtsCadenceMapV2'),
      absentOrNull('sourcePtsCadenceMapStateSha256V2'),
    ],
  };
  if (!input.expectedState) {
    (filter.$and as Record<string, unknown>[]).push(
      absentOrNull('sourcePtsCadenceMapV3'),
      absentOrNull('sourcePtsCadenceMapStateSha256V3'),
    );
    return filter;
  }

  const expected = input.expectedState.sourcePtsCadenceMapV3;
  filter.sourcePtsCadenceMapStateSha256V3 = input.expectedState.sourcePtsCadenceMapStateSha256V3;
  filter['sourcePtsCadenceMapV3.source.sourceVersionSha256'] = expected.source.sourceVersionSha256;
  filter['sourcePtsCadenceMapV3.source.mapBindingSha256'] = expected.source.mapBindingSha256;
  filter['sourcePtsCadenceMapV3.status'] = expected.status;
  filter['sourcePtsCadenceMapV3.attemptCount'] = expected.attemptCount;
  filter['sourcePtsCadenceMapV3.activeClaim.claimId'] = expected.activeClaim?.claimId ?? null;
  filter['sourcePtsCadenceMapV3.activeClaim.expiresAt'] = expected.activeClaim?.expiresAt ?? null;
  filter['sourcePtsCadenceMapV3.epochIndexSidecar.contentSha256'] =
    expected.epochIndexSidecar.contentSha256;
  filter['sourcePtsCadenceMapV3.terminalReceipt.terminalReceiptSha256'] =
    expected.terminalReceipt?.terminalReceiptSha256 ?? null;
  return filter;
}

export function assertMediaSourcePtsCadenceMapAssetRecordV3(
  value: unknown,
): MediaSourcePtsCadenceMapAssetRecordV3 {
  const record = objectRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_RECORD_V3_INVALID');
  exactKeys(record, [
    'activeClaim', 'attemptCount', 'diagnostic', 'epochIndexSidecar', 'kind',
    'requestedAt', 'schemaVersion', 'source', 'status', 'terminalReceipt',
    'verificationPolicy', 'verificationReceipt',
  ], 'MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_RECORD_V3_FIELDS_INVALID');
  if (record.schemaVersion !== 3 || record.kind !== MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_RECORD_KIND_V3) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_RECORD_V3_INVALID');
  }
  const source = normalizeMediaSourcePtsCadenceEpochArtifactExpectedSourceV3(record.source);
  const epochIndexSidecar = assertMediaSourcePtsCadenceEpochIndexSidecarForVerificationV3(
    record.epochIndexSidecar,
  );
  const verificationPolicy = normalizeMediaSourcePtsCadenceEpochArtifactVerificationPolicyV3(
    record.verificationPolicy,
  );
  if (epochIndexSidecar.sourceVersionSha256 !== source.sourceVersionSha256
    || epochIndexSidecar.mapBindingSha256 !== source.mapBindingSha256) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_INDEX_SOURCE_MISMATCH');
  }
  const normalized = {
    schemaVersion: 3 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_MAP_ASSET_RECORD_KIND_V3,
    status: status(record.status),
    source,
    epochIndexSidecar,
    verificationPolicy,
    attemptCount: nonNegativeSafeInteger(
      record.attemptCount,
      'MEDIA_SOURCE_PTS_CADENCE_MAP_V3_ATTEMPT_COUNT_INVALID',
    ),
    requestedAt: isoText(record.requestedAt, 'MEDIA_SOURCE_PTS_CADENCE_MAP_V3_REQUESTED_AT_INVALID'),
    activeClaim: record.activeClaim === null ? null : assertActiveClaimValue(record.activeClaim),
    verificationReceipt: record.verificationReceipt === null
      ? null
      : assertMediaSourcePtsCadenceEpochArtifactVerificationReceiptV3(record.verificationReceipt),
    terminalReceipt: record.terminalReceipt === null
      ? null
      : assertTerminalReceipt(record.terminalReceipt),
    diagnostic: record.diagnostic === null ? null : boundedDiagnostic(record.diagnostic),
  };
  assertRecordState(normalized);
  return frozen(normalized);
}

function assertRecordState(record: MediaSourcePtsCadenceMapAssetRecordV3): void {
  if (record.status === 'PENDING') {
    if (record.attemptCount !== 0 || record.activeClaim !== null
      || record.verificationReceipt !== null || record.terminalReceipt !== null
      || record.diagnostic !== null) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_PENDING_STATE_INVALID');
    }
    return;
  }
  if (record.status === 'VERIFYING') {
    if (record.attemptCount <= 0 || record.activeClaim === null
      || record.verificationReceipt !== null || record.terminalReceipt !== null
      || record.diagnostic !== null) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_VERIFYING_STATE_INVALID');
    }
    return;
  }
  if (record.activeClaim !== null || record.terminalReceipt === null) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_TERMINAL_STATE_INVALID');
  }
  assertTerminalReceiptMatchesRecord(record.terminalReceipt, record);
  if (record.status === 'COMPLETE') {
    if (record.verificationReceipt === null || record.diagnostic !== null
      || record.terminalReceipt.disposition !== 'PUBLISHED') {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_COMPLETE_STATE_INVALID');
    }
    assertVerificationReceiptMatchesRecord(record.verificationReceipt, record);
    if (record.terminalReceipt.verificationSha256
      !== record.verificationReceipt.verificationSha256) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_COMPLETE_RECEIPT_MISMATCH');
    }
    return;
  }
  if (record.verificationReceipt !== null || record.diagnostic === null
    || record.terminalReceipt.disposition !== 'UNVERIFIABLE'
    || record.terminalReceipt.diagnostic !== record.diagnostic
    || record.terminalReceipt.verificationSha256 !== null) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_UNVERIFIABLE_STATE_INVALID');
  }
}

function assertActiveClaim(
  value: MediaSourcePtsCadenceMapAssetRecordV3,
  claimId: string,
  now: Date,
): MediaSourcePtsCadenceMapAssetRecordV3 {
  const record = assertMediaSourcePtsCadenceMapAssetRecordV3(value);
  const normalizedClaimId = identifier(
    claimId,
    'MEDIA_SOURCE_PTS_CADENCE_MAP_V3_CLAIM_ID_INVALID',
  );
  const nowMs = Date.parse(isoDate(now, 'MEDIA_SOURCE_PTS_CADENCE_MAP_V3_NOW_INVALID'));
  if (record.status !== 'VERIFYING' || record.activeClaim === null
    || record.activeClaim.claimId !== normalizedClaimId
    || Date.parse(record.activeClaim.claimedAt) > nowMs
    || Date.parse(record.activeClaim.expiresAt) <= nowMs) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_CLAIM_NOT_ACTIVE');
  }
  return record;
}

function assertActiveClaimValue(value: unknown): MediaSourcePtsCadenceMapActiveClaimV3 {
  const record = objectRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_MAP_V3_CLAIM_INVALID');
  exactKeys(record, ['claimId', 'claimedAt', 'expiresAt'], 'MEDIA_SOURCE_PTS_CADENCE_MAP_V3_CLAIM_FIELDS_INVALID');
  const claimedAt = isoText(record.claimedAt, 'MEDIA_SOURCE_PTS_CADENCE_MAP_V3_CLAIMED_AT_INVALID');
  const expiresAt = isoText(record.expiresAt, 'MEDIA_SOURCE_PTS_CADENCE_MAP_V3_EXPIRES_AT_INVALID');
  const leaseMs = Date.parse(expiresAt) - Date.parse(claimedAt);
  if (leaseMs <= 0 || leaseMs > MEDIA_SOURCE_PTS_CADENCE_MAP_CLAIM_MAX_MS_V3) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_CLAIM_WINDOW_INVALID');
  }
  return {
    claimId: identifier(record.claimId, 'MEDIA_SOURCE_PTS_CADENCE_MAP_V3_CLAIM_ID_INVALID'),
    claimedAt,
    expiresAt,
  };
}

function createTerminalReceipt(input: {
  record: MediaSourcePtsCadenceMapAssetRecordV3;
  disposition: MediaSourcePtsCadenceMapTerminalReceiptV3['disposition'];
  verificationSha256: string | null;
  completedAt: string;
  diagnostic: string | null;
}): MediaSourcePtsCadenceMapTerminalReceiptV3 {
  const material = {
    schemaVersion: 3 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_MAP_TERMINAL_RECEIPT_KIND_V3,
    disposition: input.disposition,
    sourceVersionSha256: input.record.source.sourceVersionSha256,
    storageVersionSha256: input.record.source.storageVersionSha256,
    sourceBindingSha256: input.record.source.sourceBindingSha256,
    technicalObservationSha256: input.record.source.technicalObservationSha256,
    mapBindingSha256: input.record.source.mapBindingSha256,
    epochIndexContentSha256: input.record.epochIndexSidecar.contentSha256,
    attemptCount: input.record.attemptCount,
    verificationSha256: input.verificationSha256,
    completedAt: input.completedAt,
    diagnostic: input.diagnostic,
  };
  return frozen({ ...material, terminalReceiptSha256: hashEditronCanonicalJsonV1(material) });
}

function assertTerminalReceipt(value: unknown): MediaSourcePtsCadenceMapTerminalReceiptV3 {
  const record = objectRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_MAP_V3_TERMINAL_RECEIPT_INVALID');
  exactKeys(record, [
    'attemptCount', 'completedAt', 'diagnostic', 'disposition',
    'epochIndexContentSha256', 'kind', 'mapBindingSha256', 'schemaVersion',
    'sourceBindingSha256', 'sourceVersionSha256', 'storageVersionSha256',
    'technicalObservationSha256', 'terminalReceiptSha256', 'verificationSha256',
  ], 'MEDIA_SOURCE_PTS_CADENCE_MAP_V3_TERMINAL_RECEIPT_FIELDS_INVALID');
  if (record.schemaVersion !== 3
    || record.kind !== MEDIA_SOURCE_PTS_CADENCE_MAP_TERMINAL_RECEIPT_KIND_V3
    || (record.disposition !== 'PUBLISHED' && record.disposition !== 'UNVERIFIABLE')) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_TERMINAL_RECEIPT_INVALID');
  }
  const material = {
    schemaVersion: 3 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_MAP_TERMINAL_RECEIPT_KIND_V3,
    disposition: record.disposition as MediaSourcePtsCadenceMapTerminalReceiptV3['disposition'],
    sourceVersionSha256: sha256(record.sourceVersionSha256, 'TERMINAL_SOURCE_VERSION_INVALID'),
    storageVersionSha256: sha256(record.storageVersionSha256, 'TERMINAL_STORAGE_VERSION_INVALID'),
    sourceBindingSha256: sha256(record.sourceBindingSha256, 'TERMINAL_SOURCE_BINDING_INVALID'),
    technicalObservationSha256: sha256(record.technicalObservationSha256, 'TERMINAL_OBSERVATION_INVALID'),
    mapBindingSha256: sha256(record.mapBindingSha256, 'TERMINAL_MAP_BINDING_INVALID'),
    epochIndexContentSha256: sha256(record.epochIndexContentSha256, 'TERMINAL_INDEX_INVALID'),
    attemptCount: positiveSafeInteger(record.attemptCount, 'TERMINAL_ATTEMPT_INVALID'),
    verificationSha256: nullableSha256(record.verificationSha256, 'TERMINAL_VERIFICATION_INVALID'),
    completedAt: isoText(record.completedAt, 'TERMINAL_COMPLETED_AT_INVALID'),
    diagnostic: record.diagnostic === null ? null : boundedDiagnostic(record.diagnostic),
  };
  if (record.terminalReceiptSha256 !== hashEditronCanonicalJsonV1(material)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_TERMINAL_RECEIPT_HASH_MISMATCH');
  }
  return frozen({ ...material, terminalReceiptSha256: record.terminalReceiptSha256 as string });
}

function assertTerminalReceiptMatchesRecord(
  receipt: MediaSourcePtsCadenceMapTerminalReceiptV3,
  record: MediaSourcePtsCadenceMapAssetRecordV3,
): void {
  if (receipt.sourceVersionSha256 !== record.source.sourceVersionSha256
    || receipt.storageVersionSha256 !== record.source.storageVersionSha256
    || receipt.sourceBindingSha256 !== record.source.sourceBindingSha256
    || receipt.technicalObservationSha256 !== record.source.technicalObservationSha256
    || receipt.mapBindingSha256 !== record.source.mapBindingSha256
    || receipt.epochIndexContentSha256 !== record.epochIndexSidecar.contentSha256
    || receipt.attemptCount !== record.attemptCount) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_TERMINAL_RECEIPT_SCOPE_MISMATCH');
  }
}

function assertVerificationReceiptMatchesRecord(
  receipt: MediaSourcePtsCadenceEpochArtifactVerificationReceiptV3,
  record: MediaSourcePtsCadenceMapAssetRecordV3,
): void {
  if (canonicalizeEditronJsonV1(receipt.source) !== canonicalizeEditronJsonV1(record.source)
    || canonicalizeEditronJsonV1(receipt.epochIndexSidecar)
      !== canonicalizeEditronJsonV1(record.epochIndexSidecar)
    || canonicalizeEditronJsonV1(receipt.verificationPolicy)
      !== canonicalizeEditronJsonV1(record.verificationPolicy)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_VERIFICATION_RECEIPT_SCOPE_MISMATCH');
  }
}

function assertPersistedTransition(
  current: MediaSourcePtsCadenceMapAssetRecordV3 | null,
  next: MediaSourcePtsCadenceMapAssetRecordV3,
): void {
  if (current === null) {
    if (next.status !== 'PENDING') throw new Error('INITIAL_STATE_MUST_BE_PENDING');
    return;
  }
  if (canonicalizeEditronJsonV1(current.source) !== canonicalizeEditronJsonV1(next.source)
    || canonicalizeEditronJsonV1(current.epochIndexSidecar)
      !== canonicalizeEditronJsonV1(next.epochIndexSidecar)
    || canonicalizeEditronJsonV1(current.verificationPolicy)
      !== canonicalizeEditronJsonV1(next.verificationPolicy)
    || current.requestedAt !== next.requestedAt) {
    throw new Error('IMMUTABLE_STATE_CHANGED');
  }
  if (current.status === 'PENDING') {
    if (next.status !== 'VERIFYING' || next.attemptCount !== 1) {
      throw new Error('PENDING_TRANSITION_INVALID');
    }
    return;
  }
  if (current.status === 'VERIFYING') {
    if (next.status === 'VERIFYING') {
      if (current.activeClaim === null || next.activeClaim === null) {
        throw new Error('VERIFYING_CLAIM_TRANSITION_INVALID');
      }
      if (next.attemptCount === current.attemptCount) {
        if (next.activeClaim.claimId !== current.activeClaim.claimId
          || Date.parse(next.activeClaim.claimedAt) < Date.parse(current.activeClaim.claimedAt)
          || Date.parse(next.activeClaim.claimedAt) >= Date.parse(current.activeClaim.expiresAt)
          || Date.parse(next.activeClaim.expiresAt) <= Date.parse(current.activeClaim.expiresAt)) {
          throw new Error('RENEW_TRANSITION_INVALID');
        }
        return;
      }
      if (next.attemptCount !== current.attemptCount + 1
        || Date.parse(next.activeClaim.claimedAt) < Date.parse(current.activeClaim.expiresAt)) {
        throw new Error('RECLAIM_TRANSITION_INVALID');
      }
      return;
    }
    if ((next.status === 'COMPLETE' || next.status === 'UNVERIFIABLE')
      && next.attemptCount === current.attemptCount) return;
    throw new Error('VERIFYING_TRANSITION_INVALID');
  }
  throw new Error('TERMINAL_STATE_IMMUTABLE');
}

function assertRecordMatchesAsset(
  record: MediaSourcePtsCadenceMapAssetRecordV3,
  asset: MediaSourcePtsCadenceMapAssetStateInputV3,
): void {
  const assetId = identifier(asset.assetId, 'MEDIA_SOURCE_PTS_CADENCE_MAP_V3_ASSET_ID_INVALID');
  if (asset.type !== 'video') throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_MEDIA_KIND_INVALID');
  const sourceVersion = assertMediaSourceVersionV1(asset.sourceVersionV1);
  if (sourceVersion.assetId !== assetId || sourceVersion.mediaKind !== 'video'
    || sourceVersion.sourceVersionSha256 !== record.source.sourceVersionSha256
    || sourceVersion.storageVersion.storageVersionSha256 !== record.source.storageVersionSha256) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_SOURCE_VERSION_MISMATCH');
  }

  const qualification = objectRecord(
    asset.sourceQualificationV1,
    'MEDIA_SOURCE_PTS_CADENCE_MAP_V3_QUALIFICATION_INVALID',
  );
  const storageVersion = objectRecord(
    qualification.storageVersion,
    'MEDIA_SOURCE_PTS_CADENCE_MAP_V3_QUALIFICATION_STORAGE_INVALID',
  );
  const observation = objectRecord(
    qualification.observation,
    'MEDIA_SOURCE_PTS_CADENCE_MAP_V3_OBSERVATION_INVALID',
  );
  if (qualification.status !== 'MEASURED_TECHNICAL'
    || qualification.assetId !== assetId
    || qualification.sourceBindingSha256 !== record.source.sourceBindingSha256
    || storageVersion.storageVersionSha256 !== record.source.storageVersionSha256
    || observation.observationSha256 !== record.source.technicalObservationSha256) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_QUALIFICATION_MISMATCH');
  }
  const { observationSha256, ...observationMaterial } = observation;
  if (observationSha256 !== hashEditronCanonicalJsonV1(observationMaterial)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_OBSERVATION_HASH_MISMATCH');
  }
  if (!Array.isArray(observation.videoStreams)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_VIDEO_STREAMS_INVALID');
  }
  const stream = observation.videoStreams
    .map((candidate) => objectRecordOrNull(candidate))
    .find((candidate) => candidate?.streamIndex === record.source.videoStreamIndex);
  if (!stream || stream.sourceTimebase === null
    || !sameRate(stream.sourceTimebase, record.source.sourceTimebase)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_STREAM_TIMEBASE_MISMATCH');
  }
}

function assertNoEarlierState(asset: MediaSourcePtsCadenceMapAssetStateInputV3): void {
  if (hasEarlierState(asset)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_PARALLEL_EARLIER_STATE_FORBIDDEN');
  }
}

function hasEarlierState(asset: MediaSourcePtsCadenceMapAssetStateInputV3): boolean {
  return !isAbsent(asset.sourcePtsCadenceMapV1)
    || !isAbsent(asset.sourcePtsCadenceMapStateSha256V1)
    || !isAbsent(asset.sourcePtsCadenceMapV2)
    || !isAbsent(asset.sourcePtsCadenceMapStateSha256V2);
}

function status(value: unknown): MediaSourcePtsCadenceMapAssetStatusV3 {
  if (value === 'PENDING' || value === 'VERIFYING'
    || value === 'COMPLETE' || value === 'UNVERIFIABLE') return value;
  throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_STATUS_INVALID');
}

function sameRate(value: unknown, expected: ExactRationalRateV1): boolean {
  try {
    const parsed = parseExactRationalRateV1(value);
    const normalizedExpected = parseExactRationalRateV1(expected);
    return parsed.numerator === normalizedExpected.numerator
      && parsed.denominator === normalizedExpected.denominator;
  } catch {
    return false;
  }
}

function absentOrNull(field: string): Record<string, unknown> {
  return { $or: [{ [field]: { $exists: false } }, { [field]: null }] };
}

function objectRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function objectRecordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], code: string): void {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length || actual.some((key, index) => key !== sorted[index])) {
    throw new Error(code);
  }
}

function identifier(value: unknown, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(normalized)) throw new Error(code);
  return normalized;
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(code);
  return value;
}

function nullableSha256(value: unknown, code: string): string | null {
  return value === null ? null : sha256(value, code);
}

function nonNegativeSafeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(code);
  return Number(value);
}

function positiveSafeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error(code);
  return Number(value);
}

function isoDate(value: Date, code: string): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error(code);
  return value.toISOString();
}

function isoText(value: unknown, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new Error(code);
  return value;
}

function boundedDiagnostic(value: unknown): string {
  if (typeof value !== 'string') throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_DIAGNOSTIC_INVALID');
  const normalized = value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  if (!normalized || normalized.length > 512) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_MAP_V3_DIAGNOSTIC_INVALID');
  }
  return normalized;
}

function isAbsent(value: unknown): boolean {
  return value === undefined || value === null;
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(value) as Readonly<T>;
}
