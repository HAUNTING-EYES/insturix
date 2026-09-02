import { describe, expect, it } from 'vitest';

import { createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptPolicyV1 }
  from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-recovery-attempt-policy-v1';
import {
  createMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepMongoDocumentV1,
  MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_SWEEP_COLLECTION_V1,
  MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_SWEEP_DOCUMENT_KIND_V1,
  parseMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepMongoDocumentV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-recovery-sweep-mongo-document-v1';
import {
  claimMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1,
  createMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1,
  settleMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepClaimV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-recovery-sweep-state-v1';
import {
  createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1,
  createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryControllerV1,
  selectMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptResultV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-recovery-sweep-v1';
import { createMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1 }
  from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-run-record-v1';

const SELECTED_AT = '2026-08-30T19:05:00.000Z';

describe('MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepMongoDocumentV1', () => {
  it('uses a collection isolated from other backfill families', () => {
    expect(
      MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_SWEEP_COLLECTION_V1,
    ).toBe(
      'editron_media_source_pts_cadence_version_evidence_backfill_recovery_sweeps_v1',
    );
  });

  it('round-trips every non-exhausted operational status', () => {
    const pending = initialState();
    const running = claim(pending, 'claim-running', SELECTED_AT);
    const retryAttempt = recoveryAttempt(
      running.claim,
      '2026-08-30T19:05:01.000Z',
      'UNCONFIRMED',
    );
    const retryWait = settleMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(
      running.state,
      { claimToken: 'claim-running', attempt: retryAttempt },
    );
    const completeClaim = claim(
      initialState(),
      'claim-complete',
      SELECTED_AT,
    );
    const completeAttempt = recoveryAttempt(
      completeClaim.claim,
      '2026-08-30T19:05:01.000Z',
      'DISPATCHED',
    );
    const complete = settleMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(
      completeClaim.state,
      { claimToken: 'claim-complete', attempt: completeAttempt },
    );

    for (const state of [pending, running.state, retryWait, complete]) {
      const document =
        createMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepMongoDocumentV1(
          state,
        );
      expect(parseMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepMongoDocumentV1(
        document,
      )).toEqual(state);
      expect(document).toMatchObject({
        _id: state.sweepIntentSha256,
        schemaVersion: 1,
        kind:
          MEDIA_SOURCE_PTS_CADENCE_VERSION_EVIDENCE_BACKFILL_RECOVERY_SWEEP_DOCUMENT_KIND_V1,
        status: state.status,
        recordVersion: state.recordVersion,
        recordSha256: state.recordSha256,
      });
    }
  });

  it('stores query times as Dates while preserving exact state timestamps', () => {
    const running = claim(initialState(), 'claim-a', SELECTED_AT).state;
    const document =
      createMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepMongoDocumentV1(
        running,
      );

    expect(document.createdAt).toEqual(new Date(running.createdAt));
    expect(document.updatedAt).toEqual(new Date(running.updatedAt));
    expect(document.nextAttemptAt).toBeNull();
    expect(document.leaseExpiresAt).toEqual(new Date(running.leaseExpiresAt!));
  });

  it('rejects field expansion and any outer-envelope drift', () => {
    const state = initialState();
    const document =
      createMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepMongoDocumentV1(
        state,
      );

    expect(() => parseMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepMongoDocumentV1({
      ...document,
      hiddenFallback: true,
    })).toThrow('SWEEP_MONGO_DOCUMENT_FIELDS_INVALID');
    expect(() => parseMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepMongoDocumentV1({
      ...document,
      status: 'COMPLETE',
    })).toThrow('SWEEP_MONGO_DOCUMENT_ENVELOPE_INVALID');
    expect(() => parseMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepMongoDocumentV1({
      ...document,
      recordSha256: 'f'.repeat(64),
    })).toThrow('SWEEP_MONGO_DOCUMENT_ENVELOPE_INVALID');
    expect(() => parseMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepMongoDocumentV1({
      ...document,
      nextAttemptAt: state.nextAttemptAt,
    })).toThrow('SWEEP_MONGO_DOCUMENT_NEXT_ATTEMPT_AT_INVALID');
  });

  it('rejects a corrupted embedded state even when its envelope is unchanged', () => {
    const state = initialState();
    const document =
      createMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepMongoDocumentV1(
        state,
      );

    expect(() => parseMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepMongoDocumentV1({
      ...document,
      state: { ...state, status: 'COMPLETE' },
    })).toThrow('SWEEP_STATE_SETTLED_INVARIANT_INVALID');
  });
});

function initialState() {
  const controller = createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryControllerV1({
    controllerId: 'global-pts-cadence-version-evidence-backfill-v1',
    createdAt: '2026-08-30T18:00:00.000Z',
  });
  const candidate = createMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1({
    migrationRunId: 'run-a',
    policyVersion: 'pts-cadence-version-evidence-backfill-policy-v1',
    upperBoundCursor: { assetId: 'asset-z', userId: 'user-z' },
    createdAt: '2026-08-30T18:10:00.000Z',
  });
  const intent = selectMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepV1(
    controller,
    {
      candidates: [candidate],
      wrapped: false,
      staleBefore: '2026-08-30T19:00:00.000Z',
      selectedAt: SELECTED_AT,
    },
  ).intent;
  const policy =
    createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptPolicyV1({
      maxAttempts: 2,
      leaseMs: 60_000,
      retryBaseMs: 1_000,
      retryMaxMs: 4_000,
    });
  return createMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(
    intent,
    policy,
  );
}

function claim(
  state: MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1,
  claimToken: string,
  claimedAt: string,
) {
  return claimMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(state, {
    claimToken,
    claimedAt,
  });
}

function recoveryAttempt(
  claimValue: MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepClaimV1,
  attemptedAt: string,
  disposition: 'DISPATCHED' | 'UNCONFIRMED',
) {
  const entry = claimValue.intent.entries[0]!;
  return createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1(
    claimValue.intent,
    {
      attemptNumber: claimValue.attemptNumber,
      previousAttemptSha256: claimValue.previousAttemptSha256,
      attemptedAt,
      results: [attemptResult(
        entry.migrationRunId,
        entry.expectedRecordSha256,
        disposition,
      )],
    },
  );
}

function attemptResult(
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
