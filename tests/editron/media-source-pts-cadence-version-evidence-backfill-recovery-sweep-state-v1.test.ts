import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import { createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptPolicyV1 }
  from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-recovery-attempt-policy-v1';
import {
  assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1,
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
  type MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1,
  type MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptResultV1,
} from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-recovery-sweep-v1';
import { createMediaSourcePtsCadenceVersionEvidenceBackfillRunRecordV1 }
  from '@/lib/editron/services/media-source-pts-cadence-version-evidence-backfill-run-record-v1';

const SELECTED_AT = '2026-08-30T19:05:00.000Z';
const HASH_A = 'a'.repeat(64);

describe('MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1', () => {
  it('creates one canonical pending state bound to intent and policy', () => {
    const state = initialState();

    expect(state).toMatchObject({
      sweepIntentSha256: intent().sweepIntentSha256,
      attemptPolicySha256: policy().policySha256,
      recordVersion: 1,
      status: 'PENDING',
      attemptCount: 0,
      lastAttemptSha256: null,
      nextAttemptAt: SELECTED_AT,
      claimToken: null,
      leaseExpiresAt: null,
      previousRecordSha256: null,
    });
    expect(Object.isFrozen(state)).toBe(true);
    expect(assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(
      structuredClone(state),
    )).toEqual(state);
  });

  it('claims due work with an exact policy lease and attempt binding', () => {
    const current = initialState();
    const claimed = claimMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(
      current,
      { claimToken: 'claim-a', claimedAt: SELECTED_AT },
    );

    expect(claimed.state).toMatchObject({
      recordVersion: 2,
      status: 'RUNNING',
      attemptCount: 0,
      claimToken: 'claim-a',
      claimedAt: SELECTED_AT,
      leaseExpiresAt: '2026-08-30T19:06:00.000Z',
      nextAttemptAt: null,
      previousRecordSha256: current.recordSha256,
    });
    expect(claimed.claim).toMatchObject({
      claimedRecordSha256: claimed.state.recordSha256,
      attemptNumber: 1,
      previousAttemptSha256: null,
      claimToken: 'claim-a',
    });
  });

  it('protects a live lease and reclaims an expired lease with a new fence', () => {
    const first = claimState(initialState(), 'claim-a', SELECTED_AT);

    expect(() => claimMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(
      first.state,
      {
        claimToken: 'claim-b',
        claimedAt: '2026-08-30T19:05:59.999Z',
      },
    )).toThrow('SWEEP_STATE_CLAIM_LEASE_HELD');

    const reclaimed = claimMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(
      first.state,
      {
        claimToken: 'claim-b',
        claimedAt: '2026-08-30T19:06:00.000Z',
      },
    );
    expect(reclaimed.state).toMatchObject({
      recordVersion: 3,
      status: 'RUNNING',
      attemptCount: 0,
      claimToken: 'claim-b',
      previousRecordSha256: first.state.recordSha256,
    });
    expect(reclaimed.claim.attemptNumber).toBe(1);
  });

  it('settles a confirmed attempt as terminal complete', () => {
    const claimed = claimState(initialState(), 'claim-a', SELECTED_AT);
    const attempt = attemptFor(
      claimed.claim,
      '2026-08-30T19:05:01.000Z',
      'DISPATCHED',
    );
    const settled = settleMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(
      claimed.state,
      { claimToken: 'claim-a', attempt },
    );

    expect(settled).toMatchObject({
      recordVersion: 3,
      status: 'COMPLETE',
      attemptCount: 1,
      lastAttemptSha256: attempt.attemptSha256,
      lastAttemptedAt: attempt.attemptedAt,
      nextAttemptAt: null,
      claimToken: null,
      claimedAt: null,
      leaseExpiresAt: null,
      previousRecordSha256: claimed.state.recordSha256,
    });
    expect(() => claimMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(
      settled,
      {
        claimToken: 'claim-terminal',
        claimedAt: '2026-08-30T19:10:00.000Z',
      },
    )).toThrow('SWEEP_STATE_CLAIM_TERMINAL');
  });

  it('waits for the exact retry boundary and exhausts at policy maximum', () => {
    const firstClaim = claimState(initialState(), 'claim-a', SELECTED_AT);
    const firstAttempt = attemptFor(
      firstClaim.claim,
      '2026-08-30T19:05:01.000Z',
      'UNCONFIRMED',
    );
    const retryWait = settleMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(
      firstClaim.state,
      { claimToken: 'claim-a', attempt: firstAttempt },
    );
    expect(retryWait).toMatchObject({
      status: 'RETRY_WAIT',
      attemptCount: 1,
      nextAttemptAt: '2026-08-30T19:05:02.000Z',
    });
    expect(() => claimMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(
      retryWait,
      {
        claimToken: 'claim-b',
        claimedAt: '2026-08-30T19:05:01.999Z',
      },
    )).toThrow('SWEEP_STATE_CLAIM_NOT_DUE');

    const secondClaim = claimState(
      retryWait,
      'claim-b',
      '2026-08-30T19:05:02.000Z',
    );
    expect(secondClaim.claim).toMatchObject({
      attemptNumber: 2,
      previousAttemptSha256: firstAttempt.attemptSha256,
    });
    const secondAttempt = attemptFor(
      secondClaim.claim,
      '2026-08-30T19:05:03.000Z',
      'UNCONFIRMED',
    );
    const exhausted = settleMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(
      secondClaim.state,
      { claimToken: 'claim-b', attempt: secondAttempt },
    );
    expect(exhausted).toMatchObject({
      status: 'RETRY_EXHAUSTED',
      attemptCount: 2,
      nextAttemptAt: null,
      lastAttemptSha256: secondAttempt.attemptSha256,
    });
  });

  it('can recover after an unconfirmed attempt and then complete', () => {
    const firstClaim = claimState(initialState(3), 'claim-a', SELECTED_AT);
    const firstAttempt = attemptFor(
      firstClaim.claim,
      '2026-08-30T19:05:01.000Z',
      'UNCONFIRMED',
    );
    const waiting = settleMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(
      firstClaim.state,
      { claimToken: 'claim-a', attempt: firstAttempt },
    );
    const secondClaim = claimState(
      waiting,
      'claim-b',
      '2026-08-30T19:05:02.000Z',
    );
    const secondAttempt = attemptFor(
      secondClaim.claim,
      '2026-08-30T19:05:03.000Z',
      'DEDUPLICATED',
    );

    expect(settleMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(
      secondClaim.state,
      { claimToken: 'claim-b', attempt: secondAttempt },
    )).toMatchObject({
      status: 'COMPLETE',
      attemptCount: 2,
      lastAttemptSha256: secondAttempt.attemptSha256,
    });
  });

  it('rejects an old claimant after lease reclamation', () => {
    const first = claimState(initialState(), 'claim-a', SELECTED_AT);
    const reclaimed = claimState(
      first.state,
      'claim-b',
      '2026-08-30T19:06:00.000Z',
    );
    const staleAttempt = attemptFor(
      first.claim,
      '2026-08-30T19:06:01.000Z',
      'DISPATCHED',
    );

    expect(() => settleMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(
      reclaimed.state,
      { claimToken: 'claim-a', attempt: staleAttempt },
    )).toThrow('SWEEP_STATE_SETTLEMENT_CLAIM_INVALID');
  });

  it('rejects an attempt timestamp that predates its claim', () => {
    const claimed = claimState(
      initialState(),
      'claim-a',
      '2026-08-30T19:05:10.000Z',
    );
    const earlyAttempt = attemptFor(
      claimed.claim,
      '2026-08-30T19:05:05.000Z',
      'DISPATCHED',
    );

    expect(() => settleMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(
      claimed.state,
      { claimToken: 'claim-a', attempt: earlyAttempt },
    )).toThrow('SWEEP_STATE_SETTLEMENT_ATTEMPT_INVALID');
  });

  it('rejects expanded, half-bound and wrong-retry self-rehashed states', () => {
    const initial = initialState();
    expect(() => assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1({
      ...initial,
      hiddenFallback: true,
    })).toThrow('SWEEP_STATE_FIELDS_INVALID');

    expect(() => assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(
      rehashState(initial, {
        lastAttemptSha256: HASH_A,
      }),
    )).toThrow('SWEEP_STATE_INVARIANT_INVALID');

    const firstClaim = claimState(initial, 'claim-a', SELECTED_AT);
    const retryAttempt = attemptFor(
      firstClaim.claim,
      '2026-08-30T19:05:01.000Z',
      'UNCONFIRMED',
    );
    const waiting = settleMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(
      firstClaim.state,
      { claimToken: 'claim-a', attempt: retryAttempt },
    );
    expect(() => assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(
      rehashState(waiting, {
        nextAttemptAt: '2026-08-30T19:05:02.001Z',
      }),
    )).toThrow('SWEEP_STATE_RETRY_WAIT_INVARIANT_INVALID');
  });

  it('fails deterministically when the transition version would overflow', () => {
    const claimed = claimState(initialState(), 'claim-a', SELECTED_AT);
    const forgedHighVersion = assertMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(
      rehashState(claimed.state, {
        recordVersion: Number.MAX_SAFE_INTEGER,
      }),
    );

    expect(() => claimMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(
      forgedHighVersion,
      {
        claimToken: 'claim-b',
        claimedAt: '2026-08-30T19:06:00.000Z',
      },
    )).toThrow('SWEEP_STATE_INTEGER_OVERFLOW');
  });
});

function policy(maxAttempts = 2) {
  return createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptPolicyV1({
    maxAttempts,
    leaseMs: 60_000,
    retryBaseMs: 1_000,
    retryMaxMs: 4_000,
  });
}

function intent() {
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
  return selectMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepV1(controller, {
    candidates: [candidate],
    wrapped: false,
    staleBefore: '2026-08-30T19:00:00.000Z',
    selectedAt: SELECTED_AT,
  }).intent;
}

function initialState(maxAttempts = 2) {
  return createMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(
    intent(),
    policy(maxAttempts),
  );
}

function claimState(
  state: MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1,
  claimToken: string,
  claimedAt: string,
) {
  return claimMediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1(state, {
    claimToken,
    claimedAt,
  });
}

function attemptFor(
  claim: MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepClaimV1,
  attemptedAt: string,
  disposition: 'DISPATCHED' | 'DEDUPLICATED' | 'UNCONFIRMED',
): MediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1 {
  const entry = claim.intent.entries[0]!;
  return createMediaSourcePtsCadenceVersionEvidenceBackfillRecoveryAttemptV1(
    claim.intent,
    {
      attemptNumber: claim.attemptNumber,
      previousAttemptSha256: claim.previousAttemptSha256,
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
  disposition: 'DISPATCHED' | 'DEDUPLICATED' | 'UNCONFIRMED',
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
    messageId: `qstash-${migrationRunId}`,
    deduplicationId: HASH_A,
  };
}

function rehashState(
  state: MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1,
  changes: Partial<MediaSourcePtsCadenceVersionEvidenceBackfillRecoverySweepStateV1>,
) {
  const { recordSha256: _recordSha256, ...material } = state;
  const changed = { ...material, ...changes };
  return {
    ...changed,
    recordSha256: hashEditronCanonicalJsonV1(changed),
  };
}
