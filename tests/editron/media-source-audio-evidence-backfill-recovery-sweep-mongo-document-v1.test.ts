import { describe, expect, it } from 'vitest';

import { createMediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1 }
  from '@/lib/editron/services/media-source-audio-evidence-backfill-recovery-attempt-policy-v1';
import {
  createMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1,
  MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_SWEEP_DOCUMENT_KIND_V1,
  parseMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-recovery-sweep-mongo-document-v1';
import {
  claimMediaSourceAudioEvidenceBackfillRecoverySweepStateV1,
  createMediaSourceAudioEvidenceBackfillRecoverySweepStateV1,
  settleMediaSourceAudioEvidenceBackfillRecoverySweepStateV1,
  type MediaSourceAudioEvidenceBackfillRecoverySweepClaimV1,
  type MediaSourceAudioEvidenceBackfillRecoverySweepStateV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-recovery-sweep-state-v1';
import {
  createMediaSourceAudioEvidenceBackfillRecoveryAttemptV1,
  createMediaSourceAudioEvidenceBackfillRecoveryControllerV1,
  selectMediaSourceAudioEvidenceBackfillRecoverySweepV1,
  type MediaSourceAudioEvidenceBackfillRecoveryAttemptResultV1,
} from '@/lib/editron/services/media-source-audio-evidence-backfill-recovery-sweep-v1';
import { createMediaSourceAudioEvidenceBackfillRunRecordV1 }
  from '@/lib/editron/services/media-source-audio-evidence-backfill-run-record-v1';

const SELECTED_AT = '2026-08-30T19:05:00.000Z';

describe('MediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1', () => {
  it('round-trips every non-exhausted operational status', () => {
    const pending = initialState();
    const running = claim(pending, 'claim-running', SELECTED_AT);
    const retryAttempt = recoveryAttempt(
      running.claim,
      '2026-08-30T19:05:01.000Z',
      'UNCONFIRMED',
    );
    const retryWait = settleMediaSourceAudioEvidenceBackfillRecoverySweepStateV1(
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
    const complete = settleMediaSourceAudioEvidenceBackfillRecoverySweepStateV1(
      completeClaim.state,
      { claimToken: 'claim-complete', attempt: completeAttempt },
    );

    for (const state of [pending, running.state, retryWait, complete]) {
      const document =
        createMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1(
          state,
        );
      expect(parseMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1(
        document,
      )).toEqual(state);
      expect(document).toMatchObject({
        _id: state.sweepIntentSha256,
        schemaVersion: 1,
        kind:
          MEDIA_SOURCE_AUDIO_EVIDENCE_BACKFILL_RECOVERY_SWEEP_DOCUMENT_KIND_V1,
        status: state.status,
        recordVersion: state.recordVersion,
        recordSha256: state.recordSha256,
      });
    }
  });

  it('stores query times as Dates while preserving exact state timestamps', () => {
    const running = claim(initialState(), 'claim-a', SELECTED_AT).state;
    const document =
      createMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1(
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
      createMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1(
        state,
      );

    expect(() => parseMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1({
      ...document,
      hiddenFallback: true,
    })).toThrow('SWEEP_MONGO_DOCUMENT_FIELDS_INVALID');
    expect(() => parseMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1({
      ...document,
      status: 'COMPLETE',
    })).toThrow('SWEEP_MONGO_DOCUMENT_ENVELOPE_INVALID');
    expect(() => parseMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1({
      ...document,
      recordSha256: 'f'.repeat(64),
    })).toThrow('SWEEP_MONGO_DOCUMENT_ENVELOPE_INVALID');
    expect(() => parseMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1({
      ...document,
      nextAttemptAt: state.nextAttemptAt,
    })).toThrow('SWEEP_MONGO_DOCUMENT_NEXT_ATTEMPT_AT_INVALID');
  });

  it('rejects a corrupted embedded state even when its envelope is unchanged', () => {
    const state = initialState();
    const document =
      createMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1(
        state,
      );

    expect(() => parseMediaSourceAudioEvidenceBackfillRecoverySweepMongoDocumentV1({
      ...document,
      state: { ...state, status: 'COMPLETE' },
    })).toThrow('SWEEP_STATE_SETTLED_INVARIANT_INVALID');
  });
});

function initialState() {
  const controller = createMediaSourceAudioEvidenceBackfillRecoveryControllerV1({
    controllerId: 'global-audio-backfill-v1',
    createdAt: '2026-08-30T18:00:00.000Z',
  });
  const candidate = createMediaSourceAudioEvidenceBackfillRunRecordV1({
    migrationRunId: 'run-a',
    policyVersion: 'audio-backfill-policy-v1',
    upperBoundCursor: { assetId: 'asset-z', userId: 'user-z' },
    createdAt: '2026-08-30T18:10:00.000Z',
  });
  const intent = selectMediaSourceAudioEvidenceBackfillRecoverySweepV1(
    controller,
    {
      candidates: [candidate],
      wrapped: false,
      staleBefore: '2026-08-30T19:00:00.000Z',
      selectedAt: SELECTED_AT,
    },
  ).intent;
  const policy =
    createMediaSourceAudioEvidenceBackfillRecoveryAttemptPolicyV1({
      maxAttempts: 2,
      leaseMs: 60_000,
      retryBaseMs: 1_000,
      retryMaxMs: 4_000,
    });
  return createMediaSourceAudioEvidenceBackfillRecoverySweepStateV1(
    intent,
    policy,
  );
}

function claim(
  state: MediaSourceAudioEvidenceBackfillRecoverySweepStateV1,
  claimToken: string,
  claimedAt: string,
) {
  return claimMediaSourceAudioEvidenceBackfillRecoverySweepStateV1(state, {
    claimToken,
    claimedAt,
  });
}

function recoveryAttempt(
  claimValue: MediaSourceAudioEvidenceBackfillRecoverySweepClaimV1,
  attemptedAt: string,
  disposition: 'DISPATCHED' | 'UNCONFIRMED',
) {
  const entry = claimValue.intent.entries[0]!;
  return createMediaSourceAudioEvidenceBackfillRecoveryAttemptV1(
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
