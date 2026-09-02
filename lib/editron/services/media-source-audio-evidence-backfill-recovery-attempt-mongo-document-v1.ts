import {
  assertMediaSourceAudioEvidenceBackfillRecoveryAttemptV1,
  type MediaSourceAudioEvidenceBackfillRecoveryAttemptV1,
  type MediaSourceAudioEvidenceBackfillRecoverySweepIntentV1,
} from './media-source-audio-evidence-backfill-recovery-sweep-v1';

type MongoRecord = Record<string, unknown>;

export const MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_COLLECTION_V1 =
  'editron_media_source_audio_evidence_backfill_recovery_attempts_v1' as const;
export const MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_DOCUMENT_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_DOCUMENT_V1' as const;

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

export class MediaSourceAudioEvidenceBackfillRecoveryAttemptMongoDocumentErrorV1
  extends Error {
  constructor(public readonly code: string) {
    super(
      'MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_MONGO_DOCUMENT_'
      + code,
    );
    this.name =
      'MediaSourceAudioEvidenceBackfillRecoveryAttemptMongoDocumentErrorV1';
  }
}

export function createMediaSourceAudioEvidenceBackfillRecoveryAttemptMongoDocumentV1(
  attemptValue: unknown,
  intent: MediaSourceAudioEvidenceBackfillRecoverySweepIntentV1,
): Readonly<MongoRecord> {
  const attempt = assertMediaSourceAudioEvidenceBackfillRecoveryAttemptV1(
    attemptValue,
    intent,
  );
  return Object.freeze({
    _id: attempt.attemptSha256,
    schemaVersion: 1,
    kind:
      MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_DOCUMENT_KIND_V1,
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

export function parseMediaSourceAudioEvidenceBackfillRecoveryAttemptMongoDocumentV1(
  value: unknown,
  intent: MediaSourceAudioEvidenceBackfillRecoverySweepIntentV1,
): MediaSourceAudioEvidenceBackfillRecoveryAttemptV1 {
  const document = objectRecord(value, 'DOCUMENT_INVALID');
  exactKeys(document, DOCUMENT_KEYS_V1, 'FIELDS_INVALID');
  const attempt = assertMediaSourceAudioEvidenceBackfillRecoveryAttemptV1(
    document.attempt,
    intent,
  );
  if (document._id !== attempt.attemptSha256
    || document.schemaVersion !== 1
    || document.kind
      !== MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_DOCUMENT_KIND_V1
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
  throw new MediaSourceAudioEvidenceBackfillRecoveryAttemptMongoDocumentErrorV1(
    code,
  );
}
