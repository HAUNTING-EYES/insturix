import {
  assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1,
} from './media-source-pts-cadence-version-evidence-backfill-recovery-sweep-state-v1';

type MongoRecord = Record<string, unknown>;

export const MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_SWEEP_COLLECTION_V1 =
  'editron_media_source_pts_cadence_version_evidence_backfill_recovery_sweeps_v1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_SWEEP_DOCUMENT_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_SWEEP_DOCUMENT_V1' as const;

const DOCUMENT_KEYS_V1 = Object.freeze([
  '_id',
  'attemptCount',
  'attemptPolicySha256',
  'controllerId',
  'controllerRecordVersion',
  'createdAt',
  'kind',
  'leaseExpiresAt',
  'nextAttemptAt',
  'recordSha256',
  'recordVersion',
  'schemaVersion',
  'state',
  'status',
  'sweepIntentSha256',
  'updatedAt',
] as const);

export class MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepMongoDocumentErrorV1
  extends Error {
  constructor(public readonly code: string) {
    super(
      'MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_SWEEP_MONGO_DOCUMENT_'
      + code,
    );
    this.name =
      'MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepMongoDocumentErrorV1';
  }
}

export function createMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepMongoDocumentV1(
  stateValue: unknown,
): Readonly<MongoRecord> {
  const state = assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(
    stateValue,
  );
  return Object.freeze({
    _id: state.sweepIntentSha256,
    schemaVersion: 1,
    kind:
      MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_SWEEP_DOCUMENT_KIND_V1,
    controllerId: state.intent.controllerId,
    controllerRecordVersion: state.intent.controllerRecordVersion,
    sweepIntentSha256: state.sweepIntentSha256,
    attemptPolicySha256: state.attemptPolicySha256,
    recordVersion: state.recordVersion,
    recordSha256: state.recordSha256,
    status: state.status,
    attemptCount: state.attemptCount,
    nextAttemptAt: nullableDate(state.nextAttemptAt),
    leaseExpiresAt: nullableDate(state.leaseExpiresAt),
    state,
    createdAt: new Date(state.createdAt),
    updatedAt: new Date(state.updatedAt),
  });
}

export function parseMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepMongoDocumentV1(
  value: unknown,
): MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1 {
  const document = objectRecord(value, 'DOCUMENT_INVALID');
  exactKeys(document, DOCUMENT_KEYS_V1, 'FIELDS_INVALID');
  const state = assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(
    document.state,
  );
  if (document._id !== state.sweepIntentSha256
    || document.schemaVersion !== 1
    || document.kind
      !== MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_SWEEP_DOCUMENT_KIND_V1
    || document.controllerId !== state.intent.controllerId
    || document.controllerRecordVersion
      !== state.intent.controllerRecordVersion
    || document.sweepIntentSha256 !== state.sweepIntentSha256
    || document.attemptPolicySha256 !== state.attemptPolicySha256
    || document.recordVersion !== state.recordVersion
    || document.recordSha256 !== state.recordSha256
    || document.status !== state.status
    || document.attemptCount !== state.attemptCount
    || nullableDateIso(document.nextAttemptAt, 'NEXT_ATTEMPT_AT_INVALID')
      !== state.nextAttemptAt
    || nullableDateIso(document.leaseExpiresAt, 'LEASE_EXPIRES_AT_INVALID')
      !== state.leaseExpiresAt
    || dateIso(document.createdAt, 'CREATED_AT_INVALID') !== state.createdAt
    || dateIso(document.updatedAt, 'UPDATED_AT_INVALID') !== state.updatedAt) {
    fail('ENVELOPE_INVALID');
  }
  return state;
}

function nullableDate(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

function dateIso(value: unknown, code: string): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail(code);
  return value.toISOString();
}

function nullableDateIso(value: unknown, code: string): string | null {
  return value === null ? null : dateIso(value, code);
}

function objectRecord(value: unknown, code: string): MongoRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as MongoRecord;
}

function exactKeys(
  record: MongoRecord,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(record).sort();
  const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length
    || actual.some((key, index) => key !== sortedExpected[index])) fail(code);
}

function fail(code: string): never {
  throw new MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepMongoDocumentErrorV1(
    code,
  );
}
