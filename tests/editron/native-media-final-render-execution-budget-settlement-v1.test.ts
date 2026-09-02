import { describe, expect, it } from 'vitest';

import { createNativeMediaFinalRenderExecutionBudgetPolicyV1 }
  from '@/lib/editron/services/native-media-final-render-execution-budget-policy-v1';
import {
  createNativeMediaFinalRenderExecutionBudgetAuthorizationV1,
  createNativeMediaFinalRenderExecutionBudgetReservationV1,
} from '@/lib/editron/services/native-media-final-render-execution-budget-reservation-v1';
import {
  assertNativeMediaFinalRenderExecutionBudgetSettlementV1,
  createNativeMediaFinalRenderExecutionBudgetSettlementV1,
} from '@/lib/editron/services/native-media-final-render-execution-budget-settlement-v1';

const HASH = (character: string) => character.repeat(64);

describe('native final-render execution-budget terminal settlement v1', () => {
  it('settles metered final-artifact usage and releases the unused envelope', () => {
    const fixture = build();
    const settlement = settle(fixture, {
      mode: 'METERED_FINAL_ARTIFACT',
      terminalEvidence: terminal(),
      usage: {
        encodedFrameAttempts: '200',
        artifactBytesWritten: '500',
        artifactBytesVerified: '500',
      },
    });
    expect(settlement).toMatchObject({
      authority: 'EXACT_RENDER_INTERNAL_COST_SETTLEMENT_NO_CUSTOMER_CHARGE',
      mode: 'METERED_FINAL_ARTIFACT',
      settledNanoUsd: '450',
      releasedNanoUsd: '300',
      usage: { usageEvidenceSha256: settlement.terminalEvidenceSha256 },
    });
  });

  it('releases all only when cancellation occurred before execution', () => {
    const fixture = build();
    const settlement = settle(fixture, {
      mode: 'RELEASED_NO_EXECUTION',
      terminalEvidence: terminal({
        jobStatus: 'cancelled', terminalDisposition: 'CANCELLED', attemptCount: 0,
      }),
      usage: null,
    });
    expect(settlement).toMatchObject({
      settledNanoUsd: '0', releasedNanoUsd: '750', costReceiptSha256: null,
    });
  });

  it('settles the conservative maximum when terminal accounting is unknown', () => {
    const fixture = build();
    const settlement = settle(fixture, {
      mode: 'CONSERVATIVE_MAX_ACCOUNTING_UNKNOWN',
      terminalEvidence: terminal({
        jobStatus: 'dead_letter', terminalDisposition: null, attemptCount: 2,
      }),
      usage: null,
    });
    expect(settlement).toMatchObject({
      settledNanoUsd: '750', releasedNanoUsd: '0',
      costReceiptSha256: fixture.authorization.maximumCostReceiptSha256,
    });
  });

  it('names successful retry accounting as conservative until attempts are metered', () => {
    const fixture = build();
    const settlement = settle(fixture, {
      mode: 'CONSERVATIVE_MAX_PASS_RETRY_ACCOUNTING_UNKNOWN',
      terminalEvidence: terminal({ attemptCount: 2 }),
      usage: null,
    });
    expect(settlement).toMatchObject({
      mode: 'CONSERVATIVE_MAX_PASS_RETRY_ACCOUNTING_UNKNOWN',
      settledNanoUsd: '750', releasedNanoUsd: '0', usage: null,
      costReceiptSha256: fixture.authorization.maximumCostReceiptSha256,
    });
  });

  it('rejects usage beyond any authorized meter even when the shape is valid', () => {
    const fixture = build();
    expect(() => settle(fixture, {
      mode: 'METERED_FINAL_ARTIFACT', terminalEvidence: terminal(),
      usage: {
        encodedFrameAttempts: '301',
        artifactBytesWritten: '1', artifactBytesVerified: '1',
      },
    })).toThrow('SETTLEMENT_USAGE_EXCEEDS_AUTHORIZATION');
  });

  it.each([
    ['release after an attempt', {
      mode: 'RELEASED_NO_EXECUTION',
      terminalEvidence: terminal({
        jobStatus: 'cancelled', terminalDisposition: 'CANCELLED', attemptCount: 1,
      }), usage: null,
    }],
    ['meter a failed terminal', {
      mode: 'METERED_FINAL_ARTIFACT',
      terminalEvidence: terminal({ terminalDisposition: 'FAIL' }),
      usage: { encodedFrameAttempts: '1', artifactBytesWritten: '1', artifactBytesVerified: '1' },
    }],
    ['meter a retry as exact', {
      mode: 'METERED_FINAL_ARTIFACT',
      terminalEvidence: terminal({ attemptCount: 2 }),
      usage: { encodedFrameAttempts: '1', artifactBytesWritten: '1', artifactBytesVerified: '1' },
    }],
    ['retry-unknown mode without a retry', {
      mode: 'CONSERVATIVE_MAX_PASS_RETRY_ACCOUNTING_UNKNOWN',
      terminalEvidence: terminal(), usage: null,
    }],
    ['conservative PASS', {
      mode: 'CONSERVATIVE_MAX_ACCOUNTING_UNKNOWN',
      terminalEvidence: terminal(), usage: null,
    }],
    ['unexpected usage', {
      mode: 'CONSERVATIVE_MAX_ACCOUNTING_UNKNOWN',
      terminalEvidence: terminal({
        jobStatus: 'dead_letter', terminalDisposition: null,
      }),
      usage: { encodedFrameAttempts: '1', artifactBytesWritten: '1', artifactBytesVerified: '1' },
    }],
  ])('fails closed for %s', (_label, input) => {
    expect(() => settle(build(), input as never)).toThrow(
      'NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_',
    );
  });

  it('rejects forged or extra settlement state', () => {
    const fixture = build();
    const settlement = settle(fixture, {
      mode: 'METERED_FINAL_ARTIFACT', terminalEvidence: terminal(),
      usage: { encodedFrameAttempts: '1', artifactBytesWritten: '1', artifactBytesVerified: '1' },
    });
    expect(() => assertNativeMediaFinalRenderExecutionBudgetSettlementV1({
      ...settlement, settlementSha256: HASH('9'),
    }, fixture.authorization, fixture.reservation, fixture.policy)).toThrow(
      'EXECUTION_BUDGET_SETTLEMENT_INVALID',
    );
    expect(() => assertNativeMediaFinalRenderExecutionBudgetSettlementV1({
      ...settlement, extra: true,
    }, fixture.authorization, fixture.reservation, fixture.policy)).toThrow(
      'EXECUTION_BUDGET_SETTLEMENT_INVALID',
    );
  });
});

function settle(fixture: ReturnType<typeof build>, input: Record<string, unknown>) {
  return createNativeMediaFinalRenderExecutionBudgetSettlementV1({
    policy: fixture.policy, authorization: fixture.authorization,
    reservation: fixture.reservation, settledAt: '2026-08-30T00:20:00.000Z',
    ...input,
  } as never);
}

function terminal(override: Record<string, unknown> = {}) {
  return {
    jobId: 'dwj_exact_1', jobStatus: 'completed', terminalDisposition: 'PASS',
    attemptCount: 1, terminalArtifactSha256: HASH('8'), ...override,
  };
}

function build() {
  const policy = createNativeMediaFinalRenderExecutionBudgetPolicyV1({
    ownerVersion: 'finance-render-v1',
    effectiveAt: '2026-08-30T00:00:00.000Z',
    expiresAt: '2026-09-01T00:00:00.000Z',
    encodedFrameAttempt: { nanoUsdNumerator: '3', unitsDenominator: '2' },
    artifactByteWritten: { nanoUsdNumerator: '1', unitsDenominator: '10' },
    artifactByteVerified: { nanoUsdNumerator: '2', unitsDenominator: '10' },
  });
  const authorization = createNativeMediaFinalRenderExecutionBudgetAuthorizationV1({
    policy,
    scope: {
      tenantId: 'tenant-a', userId: 'user-a', orgId: null,
      projectId: 'project-a', sequenceId: 'main',
      projectRevisionSha256: HASH('1'), admissionReceiptSha256: HASH('2'),
      exactSourceRequestSha256: HASH('3'),
    },
    maximumUsage: {
      encodedFrameAttempts: '300', artifactBytesWritten: '1000',
      artifactBytesVerified: '1000',
    },
    approvedBy: 'finance-admin', approvedAt: '2026-08-30T00:05:00.000Z',
    expiresAt: '2026-08-30T01:00:00.000Z',
  });
  const reservation = createNativeMediaFinalRenderExecutionBudgetReservationV1({
    policy, authorization, reservationId: 'nmfr_budget_1',
    reservedAt: '2026-08-30T00:10:00.000Z',
  });
  return { policy, authorization, reservation };
}
