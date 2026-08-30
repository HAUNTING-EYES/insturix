import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1,
  assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryControllerV1,
  assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepIntentV1,
  createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1,
  createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryControllerV1,
  selectMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptResultV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepIntentV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-recovery-sweep-v1';
import {
  createMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
  failMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-run-record-v1';

const CREATED_AT = '2026-08-30T18:00:00.000Z';
const STALE_BEFORE = '2026-08-30T19:00:00.000Z';
const SELECTED_AT = '2026-08-30T19:05:00.000Z';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

describe('media source pts cadence version evidence backfill recovery sweep V1', () => {
  it('creates one canonical empty recovery controller', () => {
    const initial = controller();

    expect(initial).toMatchObject({
      controllerId: 'global-pts-cadence-version-evidence-backfill-v1',
      recordVersion: 1,
      cursor: null,
      cycleCount: 0,
      selectedSweepCount: 0,
      selectedRunCount: 0,
      lastSweepIntentSha256: null,
      previousRecordSha256: null,
    });
    expect(assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryControllerV1(
      initial,
    )).toEqual(initial);
    expect(Object.isFrozen(initial)).toBe(true);
  });

  it('advances a hash-chained cursor only through a bounded stale page', () => {
    const first = run('run-a', '2026-08-30T18:10:00.000Z');
    const second = run('run-b', '2026-08-30T18:20:00.000Z');

    const selected = selectMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepV1(
      controller(),
      {
        candidates: [first, second],
        wrapped: false,
        staleBefore: STALE_BEFORE,
        selectedAt: SELECTED_AT,
      },
    );

    expect(selected.intent).toMatchObject({
      controllerRecordVersion: 1,
      cursorBefore: null,
      cursorAfter: {
        runUpdatedAt: second.updatedAt,
        migrationRunId: second.migrationRunId,
      },
      wrapped: false,
      previousSweepIntentSha256: null,
      entries: [{
        migrationRunId: first.migrationRunId,
        expectedRecordSha256: first.recordSha256,
      }, {
        migrationRunId: second.migrationRunId,
        expectedRecordSha256: second.recordSha256,
      }],
    });
    expect(selected.nextController).toMatchObject({
      recordVersion: 2,
      cycleCount: 0,
      selectedSweepCount: 1,
      selectedRunCount: 2,
      lastSweepIntentSha256: selected.intent.sweepIntentSha256,
      previousRecordSha256: selected.intent.controllerRecordSha256,
    });
    expect(assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepIntentV1(
      selected.intent,
    )).toEqual(selected.intent);
    expect(assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryControllerV1(
      selected.nextController,
    )).toEqual(selected.nextController);
  });

  it('moves forward before wrapping, then revisits the oldest stuck run', () => {
    const firstPage = selection();
    const later = run('run-c', '2026-08-30T18:30:00.000Z');
    const forward = selectMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepV1(
      firstPage.nextController,
      {
        candidates: [later],
        wrapped: false,
        staleBefore: STALE_BEFORE,
        selectedAt: '2026-08-30T19:06:00.000Z',
      },
    );
    const oldestStillStuck = run('run-a', '2026-08-30T18:10:00.000Z');
    const wrapped = selectMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepV1(
      forward.nextController,
      {
        candidates: [oldestStillStuck],
        wrapped: true,
        staleBefore: STALE_BEFORE,
        selectedAt: '2026-08-30T19:07:00.000Z',
      },
    );

    expect(forward.intent.previousSweepIntentSha256)
      .toBe(firstPage.intent.sweepIntentSha256);
    expect(wrapped.intent.wrapped).toBe(true);
    expect(wrapped.nextController.cycleCount).toBe(1);
    expect(wrapped.nextController.cursor).toEqual({
      runUpdatedAt: oldestStillStuck.updatedAt,
      migrationRunId: oldestStillStuck.migrationRunId,
    });
  });

  it('rejects invalid order, cursor direction, wrap, freshness and terminal runs', () => {
    const first = run('run-a', '2026-08-30T18:10:00.000Z');
    const second = run('run-b', '2026-08-30T18:20:00.000Z');
    expect(() => selectMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepV1(
      controller(),
      selectionInput([second, first]),
    )).toThrow('SWEEP_ENTRY_ORDER_INVALID');
    expect(() => selectMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepV1(
      controller(),
      { ...selectionInput([first]), wrapped: true },
    )).toThrow('SWEEP_WRAP_INVALID');

    const selected = selection();
    expect(() => selectMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepV1(
      selected.nextController,
      selectionInput([first]),
    )).toThrow('SWEEP_CURSOR_TRAVERSAL_INVALID');
    expect(() => selectMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepV1(
      controller(),
      selectionInput([run('run-fresh', '2026-08-30T19:01:00.000Z')]),
    )).toThrow('SELECTION_CANDIDATE_INVALID');
    const failed = failMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1(first, {
      failureCode: 'CANDIDATE_PAGE_INVALID',
      failedAt: '2026-08-30T18:11:00.000Z',
    });
    expect(() => selectMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepV1(
      controller(),
      selectionInput([failed]),
    )).toThrow('SELECTION_CANDIDATE_INVALID');
  });

  it('rejects self-rehashed sweep semantics rather than trusting the hash', () => {
    const { intent } = selection();
    const staleAfterEntry = rehashSweep(intent, {
      staleBefore: '2026-08-30T18:05:00.000Z',
    });
    const brokenFirstLink = rehashSweep(intent, {
      previousSweepIntentSha256: HASH_A,
    });

    expect(() => assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepIntentV1(
      staleAfterEntry,
    )).toThrow('SWEEP_INVARIANT_INVALID');
    expect(() => assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepIntentV1(
      brokenFirstLink,
    )).toThrow('SWEEP_INVARIANT_INVALID');
  });

  it('creates immutable complete dispatch-attempt evidence', () => {
    const { intent } = selection();
    const results = intent.entries.map((entry, index) => confirmed(
      entry.migrationRunId,
      entry.expectedRecordSha256,
      index === 0 ? 'DISPATCHED' : 'DEDUPLICATED',
      index === 0 ? HASH_A : HASH_B,
    ));

    const attempt = createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1(
      intent,
      {
        attemptNumber: 1,
        previousAttemptSha256: null,
        attemptedAt: '2026-08-30T19:05:01.000Z',
        results,
      },
    );

    expect(attempt).toMatchObject({
      disposition: 'COMPLETE',
      confirmedCount: 2,
      unconfirmedCount: 0,
      previousAttemptSha256: null,
    });
    expect(assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1(
      attempt,
      intent,
    )).toEqual(attempt);
  });

  it('hash-chains retry attempts without blocking later sweep selection', () => {
    const { intent } = selection();
    const firstAttempt = createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1(
      intent,
      {
        attemptNumber: 1,
        previousAttemptSha256: null,
        attemptedAt: '2026-08-30T19:05:01.000Z',
        results: intent.entries.map((entry) => unconfirmed(
          entry.migrationRunId,
          entry.expectedRecordSha256,
        )),
      },
    );
    const secondAttempt = createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1(
      intent,
      {
        attemptNumber: 2,
        previousAttemptSha256: firstAttempt.attemptSha256,
        attemptedAt: '2026-08-30T19:10:00.000Z',
        results: intent.entries.map((entry, index) => confirmed(
          entry.migrationRunId,
          entry.expectedRecordSha256,
          'DISPATCHED',
          index === 0 ? HASH_A : HASH_B,
        )),
      },
    );

    expect(firstAttempt).toMatchObject({
      disposition: 'RETRY_REQUIRED',
      confirmedCount: 0,
      unconfirmedCount: 2,
    });
    expect(secondAttempt).toMatchObject({
      disposition: 'COMPLETE',
      attemptNumber: 2,
      previousAttemptSha256: firstAttempt.attemptSha256,
    });
  });

  it('rejects attempt identity drift, false confirmation and semantic tampering', () => {
    const { intent } = selection();
    const validResults = intent.entries.map((entry, index) => confirmed(
      entry.migrationRunId,
      entry.expectedRecordSha256,
      'DISPATCHED',
      index === 0 ? HASH_A : HASH_B,
    ));
    expect(() => createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1(
      intent,
      {
        attemptNumber: 1,
        previousAttemptSha256: null,
        attemptedAt: '2026-08-30T19:05:01.000Z',
        results: [{
          ...validResults[0]!,
          expectedRecordSha256: HASH_B,
        }, validResults[1]!],
      },
    )).toThrow('ATTEMPT_RESULT_BINDING_INVALID');
    expect(() => createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1(
      intent,
      {
        attemptNumber: 1,
        previousAttemptSha256: null,
        attemptedAt: '2026-08-30T19:05:01.000Z',
        results: [{
          ...validResults[0]!,
          reason: 'QSTASH_PUBLISH_REJECTED',
        }, validResults[1]!] as MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptResultV1[],
      },
    )).toThrow('ATTEMPT_RESULT_INVALID');

    const valid = createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1(
      intent,
      {
        attemptNumber: 1,
        previousAttemptSha256: null,
        attemptedAt: '2026-08-30T19:05:01.000Z',
        results: validResults,
      },
    );
    const { attemptSha256: _hash, ...material } = valid;
    const forged = {
      ...material,
      confirmedCount: 1,
      unconfirmedCount: 1,
    };
    expect(() => assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1({
      ...forged,
      attemptSha256: hashEditronCanonicalJsonV1(forged),
    }, intent)).toThrow('ATTEMPT_INVARIANT_INVALID');
  });

  it('rejects controller tampering even when outer fields look plausible', () => {
    const current = selection().nextController;
    expect(() => assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryControllerV1({
      ...current,
      selectedRunCount: 999,
    })).toThrow('CONTROLLER_HASH_MISMATCH');
    expect(() => createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryControllerV1({
      controllerId: 'x'.repeat(201),
      createdAt: CREATED_AT,
    })).toThrow('IDENTIFIER_INVALID');
  });
});

function controller() {
  return createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryControllerV1({
    controllerId: 'global-pts-cadence-version-evidence-backfill-v1',
    createdAt: CREATED_AT,
  });
}

function selection() {
  return selectMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepV1(
    controller(),
    selectionInput([
      run('run-a', '2026-08-30T18:10:00.000Z'),
      run('run-b', '2026-08-30T18:20:00.000Z'),
    ]),
  );
}

function selectionInput(
  candidates: readonly MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1[],
) {
  return {
    candidates,
    wrapped: false,
    staleBefore: STALE_BEFORE,
    selectedAt: SELECTED_AT,
  };
}

function run(
  migrationRunId: string,
  createdAt: string,
): MediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1 {
  return createMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1({
    migrationRunId,
    policyVersion: 'pts-cadence-version-evidence-backfill-policy-v1',
    upperBoundCursor: { assetId: 'asset-z', userId: 'user-z' },
    createdAt,
  });
}

function confirmed(
  migrationRunId: string,
  expectedRecordSha256: string,
  disposition: 'DISPATCHED' | 'DEDUPLICATED',
  deduplicationId: string,
): MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptResultV1 {
  return {
    migrationRunId,
    expectedRecordSha256,
    disposition,
    reason: null,
    messageId: `qstash-${migrationRunId}`,
    deduplicationId,
  };
}

function unconfirmed(
  migrationRunId: string,
  expectedRecordSha256: string,
): MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptResultV1 {
  return {
    migrationRunId,
    expectedRecordSha256,
    disposition: 'UNCONFIRMED',
    reason: 'DISPATCH_RUNTIME_UNAVAILABLE',
    messageId: null,
    deduplicationId: null,
  };
}

function rehashSweep(
  intent: MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepIntentV1,
  changes: Partial<MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepIntentV1>,
) {
  const { sweepIntentSha256: _hash, ...material } = intent;
  const changed = { ...material, ...changes };
  return {
    ...changed,
    sweepIntentSha256: hashEditronCanonicalJsonV1(changed),
  };
}
