import { describe, expect, it } from 'vitest';

import {
  createMediaSourceAudioEvidenceBackfillRecoveryAttemptMongoDocumentV1,
  MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_DOCUMENT_KIND_V1,
  parseMediaSourceAudioEvidenceBackfillRecoveryAttemptMongoDocumentV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-recovery-attempt-mongo-document-v1';
import {
  createMediaSourceAudioEvidenceBackfillRecoveryAttemptV1,
  createMediaSourceAudioEvidenceBackfillRecoveryControllerV1,
  selectMediaSourceAudioEvidenceBackfillRecoverySweepV1,
  type MediaSourceAudioEvidenceBackfillRecoveryAttemptResultV1,
  type MediaSourceAudioEvidenceBackfillRecoverySweepIntentV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-recovery-sweep-v1';
import { createMediaSourceAudioEvidenceBackfillRunRecordV1 }
  from '@/lib/editron/services/media-source-audio-evidence-backfill-run-record-v1';

describe('MediaSourceAudioEvidenceBackfillRecoveryAttemptMongoDocumentV1', () => {
  it.each(['DISPATCHED', 'UNCONFIRMED'] as const)(
    'round-trips immutable %s attempt evidence',
    (disposition) => {
      const sweepIntent = intent('run-a');
      const attempt = recoveryAttempt(sweepIntent, disposition);
      const document =
        createMediaSourceAudioEvidenceBackfillRecoveryAttemptMongoDocumentV1(
          attempt,
          sweepIntent,
        );

      expect(document).toMatchObject({
        _id: attempt.attemptSha256,
        schemaVersion: 1,
        kind:
          MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_DOCUMENT_KIND_V1,
        sweepIntentSha256: sweepIntent.sweepIntentSha256,
        attemptNumber: 1,
        disposition: attempt.disposition,
        attemptedAt: new Date(attempt.attemptedAt),
      });
      expect(parseMediaSourceAudioEvidenceBackfillRecoveryAttemptMongoDocumentV1(
        document,
        sweepIntent,
      )).toEqual(attempt);
    },
  );

  it('rejects field expansion and outer-envelope drift', () => {
    const sweepIntent = intent('run-a');
    const attempt = recoveryAttempt(sweepIntent, 'DISPATCHED');
    const document =
      createMediaSourceAudioEvidenceBackfillRecoveryAttemptMongoDocumentV1(
        attempt,
        sweepIntent,
      );

    expect(() => parseMediaSourceAudioEvidenceBackfillRecoveryAttemptMongoDocumentV1({
      ...document,
      hiddenFallback: true,
    }, sweepIntent)).toThrow('ATTEMPT_MONGO_DOCUMENT_FIELDS_INVALID');
    expect(() => parseMediaSourceAudioEvidenceBackfillRecoveryAttemptMongoDocumentV1({
      ...document,
      attemptNumber: 2,
    }, sweepIntent)).toThrow('ATTEMPT_MONGO_DOCUMENT_ENVELOPE_INVALID');
    expect(() => parseMediaSourceAudioEvidenceBackfillRecoveryAttemptMongoDocumentV1({
      ...document,
      attemptedAt: attempt.attemptedAt,
    }, sweepIntent)).toThrow('ATTEMPT_MONGO_DOCUMENT_ATTEMPTED_AT_INVALID');
  });

  it('rejects embedded corruption and evidence from another sweep', () => {
    const sweepIntent = intent('run-a');
    const attempt = recoveryAttempt(sweepIntent, 'DISPATCHED');
    const document =
      createMediaSourceAudioEvidenceBackfillRecoveryAttemptMongoDocumentV1(
        attempt,
        sweepIntent,
      );

    expect(() => parseMediaSourceAudioEvidenceBackfillRecoveryAttemptMongoDocumentV1({
      ...document,
      attempt: { ...attempt, confirmedCount: 0 },
    }, sweepIntent)).toThrow('ATTEMPT_INVARIANT_INVALID');
    expect(() => parseMediaSourceAudioEvidenceBackfillRecoveryAttemptMongoDocumentV1(
      document,
      intent('run-b'),
    )).toThrow('ATTEMPT_SWEEP_BINDING_INVALID');
  });
});

function intent(migrationRunId: string) {
  const controller = createMediaSourceAudioEvidenceBackfillRecoveryControllerV1({
    controllerId: 'global-audio-backfill-v1',
    createdAt: '2026-08-30T18:00:00.000Z',
  });
  const candidate = createMediaSourceAudioEvidenceBackfillRunRecordV1({
    migrationRunId,
    policyVersion: 'audio-backfill-policy-v1',
    upperBoundCursor: { assetId: 'asset-z', userId: 'user-z' },
    createdAt: '2026-08-30T18:10:00.000Z',
  });
  return selectMediaSourceAudioEvidenceBackfillRecoverySweepV1(controller, {
    candidates: [candidate],
    wrapped: false,
    staleBefore: '2026-08-30T19:00:00.000Z',
    selectedAt: '2026-08-30T19:05:00.000Z',
  }).intent;
}

function recoveryAttempt(
  sweepIntent: MediaSourceAudioEvidenceBackfillRecoverySweepIntentV1,
  disposition: 'DISPATCHED' | 'UNCONFIRMED',
) {
  const entry = sweepIntent.entries[0]!;
  return createMediaSourceAudioEvidenceBackfillRecoveryAttemptV1(
    sweepIntent,
    {
      attemptNumber: 1,
      previousAttemptSha256: null,
      attemptedAt: '2026-08-30T19:05:01.000Z',
      results: [result(
        entry.migrationRunId,
        entry.expectedRecordSha256,
        disposition,
      )],
    },
  );
}

function result(
  migrationRunId: string,
  expectedRecordSha256: string,
  disposition: 'DISPATCHED' | 'UNCONFIRMED',
): MediaSourceAudioEvidenceBackfillRecoveryAttemptResultV1 {
  if (disposition === 'UNCONFIRMED') {
    return {
      migrationRunId,
      expectedRecordSha256,
      disposition,
      reason: 'DISPATCH_RUNTIME_UNAVAILABLE',
      messageId: null,
      deduplicationId: null,
    };
  }
  return {
    migrationRunId,
    expectedRecordSha256,
    disposition,
    reason: null,
    messageId: 'qstash-run-a',
    deduplicationId: 'a'.repeat(64),
  };
}
