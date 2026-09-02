import {
  assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepIntentV1,
} from './media-source-pts-cadence-version-evidence-backfill-recovery-sweep-v1';

type MongoRecord = Record<string, unknown>;

export const MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_COLLECTION_V1 =
  'editron_media_source_pts_cadence_version_evidence_backfill_recovery_attempts_v1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_DOCUMENT_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_DOCUMENT_V1' as const;

const DOCUMENT_KEYS_V1 = Object.freeze([
  '_id',
  'attempt',
  'attemptNumber',
  'attemptSha256',
  'attemptedAt',
  'createdAt',
  'disposition',
  'kind',
  'previousAttemptSha256',
  'schemaVersion',
  'sweepIntentSha256',
] as const);

export class MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptMongoDocumentErrorV1
  extends Error {
  constructor(public readonly code: string) {
    super(
      'MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_MONGO_DOCUMENT_'
      + code,
    );
    this.name =
      'MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptMongoDocumentErrorV1';
  }
}

export function createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptMongoDocumentV1(
  attemptValue: unknown,
  intent: MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepIntentV1,
): Readonly<MongoRecord> {
  const attempt = assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1(
    attemptValue,
    intent,
  );
  return Object.freeze({
    _id: attempt.attemptSha256,
    schemaVersion: 1,
    kind:
      MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_DOCUMENT_KIND_V1,
    sweepIntentSha256: attempt.sweepIntentSha256,
    attemptNumber: attempt.attemptNumber,
    previousAttemptSha256: attempt.previousAttemptSha256,
    disposition: attempt.disposition,
    attemptSha256: attempt.attemptSha256,
    attempt,
    attemptedAt: new Date(attempt.attemptedAt),
    createdAt: new Date(attempt.attemptedAt),
  });
}

export function parseMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptMongoDocumentV1(
  value: unknown,
  intent: MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepIntentV1,
): MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1 {
  const document = objectRecord(value, 'DOCUMENT_INVALID');
  exactKeys(document, DOCUMENT_KEYS_V1, 'FIELDS_INVALID');
  const attempt = assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1(
    document.attempt,
    intent,
  );
  if (document._id !== attempt.attemptSha256
    || document.schemaVersion !== 1
    || document.kind
      !== MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_DOCUMENT_KIND_V1
    || document.sweepIntentSha256 !== attempt.sweepIntentSha256
    || document.attemptNumber !== attempt.attemptNumber
    || document.previousAttemptSha256 !== attempt.previousAttemptSha256
    || document.disposition !== attempt.disposition
    || document.attemptSha256 !== attempt.attemptSha256
    || dateIso(document.attemptedAt, 'ATTEMPTED_AT_INVALID')
      !== attempt.attemptedAt
    || dateIso(document.createdAt, 'CREATED_AT_INVALID')
      !== attempt.attemptedAt) {
    fail('ENVELOPE_INVALID');
  }
  return attempt;
}

function dateIso(value: unknown, code: string): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail(code);
  return value.toISOString();
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
  throw new MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptMongoDocumentErrorV1(
    code,
  );
}
