import { describe, expect, it } from 'vitest';

import {
  createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptMongoDocumentV1,
  MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_COLLECTION_V1,
  MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_DOCUMENT_KIND_V1,
  parseMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptMongoDocumentV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-recovery-attempt-mongo-document-v1';
import {
  createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1,
  createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryControllerV1,
  selectMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptResultV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepIntentV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-recovery-sweep-v1';
import { createMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1 }
  from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-run-record-v1';

describe('MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptMongoDocumentV1', () => {
  it('uses a collection isolated from other backfill families', () => {
    expect(
      MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_COLLECTION_V1,
    ).toBe(
      'editron_media_source_pts_cadence_version_evidence_backfill_recovery_attempts_v1',
    );
  });

  it.each(['DISPATCHED', 'UNCONFIRMED'] as const)(
    'round-trips immutable %s attempt evidence',
    (disposition) => {
      const sweepIntent = intent('run-a');
      const attempt = recoveryAttempt(sweepIntent, disposition);
      const document =
        createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptMongoDocumentV1(
          attempt,
          sweepIntent,
        );

      expect(document).toMatchObject({
        _id: attempt.attemptSha256,
        schemaVersion: 1,
        kind:
          MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_ATTEMPT_DOCUMENT_KIND_V1,
        sweepIntentSha256: sweepIntent.sweepIntentSha256,
        attemptNumber: 1,
        disposition: attempt.disposition,
        attemptedAt: new Date(attempt.attemptedAt),
      });
      expect(parseMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptMongoDocumentV1(
        document,
        sweepIntent,
      )).toEqual(attempt);
    },
  );

  it('rejects field expansion and outer-envelope drift', () => {
    const sweepIntent = intent('run-a');
    const attempt = recoveryAttempt(sweepIntent, 'DISPATCHED');
    const document =
      createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptMongoDocumentV1(
        attempt,
        sweepIntent,
      );

    expect(() => parseMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptMongoDocumentV1({
      ...document,
      hiddenFallback: true,
    }, sweepIntent)).toThrow('ATTEMPT_MONGO_DOCUMENT_FIELDS_INVALID');
    expect(() => parseMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptMongoDocumentV1({
      ...document,
      attemptNumber: 2,
    }, sweepIntent)).toThrow('ATTEMPT_MONGO_DOCUMENT_ENVELOPE_INVALID');
    expect(() => parseMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptMongoDocumentV1({
      ...document,
      attemptedAt: attempt.attemptedAt,
    }, sweepIntent)).toThrow('ATTEMPT_MONGO_DOCUMENT_ATTEMPTED_AT_INVALID');
  });

  it('rejects embedded corruption and evidence from another sweep', () => {
    const sweepIntent = intent('run-a');
    const attempt = recoveryAttempt(sweepIntent, 'DISPATCHED');
    const document =
      createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptMongoDocumentV1(
        attempt,
        sweepIntent,
      );

    expect(() => parseMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptMongoDocumentV1({
      ...document,
      attempt: { ...attempt, confirmedCount: 0 },
    }, sweepIntent)).toThrow('ATTEMPT_INVARIANT_INVALID');
    expect(() => parseMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptMongoDocumentV1(
      document,
      intent('run-b'),
    )).toThrow('ATTEMPT_SWEEP_BINDING_INVALID');
  });
});

function intent(migrationRunId: string) {
  const controller = createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryControllerV1({
    controllerId: 'global-pts-cadence-version-evidence-backfill-v1',
    createdAt: '2026-08-30T18:00:00.000Z',
  });
  const candidate = createMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1({
    migrationRunId,
    policyVersion: 'pts-cadence-version-evidence-backfill-policy-v1',
    upperBoundCursor: { assetId: 'asset-z', userId: 'user-z' },
    createdAt: '2026-08-30T18:10:00.000Z',
  });
  return selectMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepV1(controller, {
    candidates: [candidate],
    wrapped: false,
    staleBefore: '2026-08-30T19:00:00.000Z',
    selectedAt: '2026-08-30T19:05:00.000Z',
  }).intent;
}

function recoveryAttempt(
  sweepIntent: MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepIntentV1,
  disposition: 'DISPATCHED' | 'UNCONFIRMED',
) {
  const entry = sweepIntent.entries[0]!;
  return createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1(
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
): MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptResultV1 {
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
