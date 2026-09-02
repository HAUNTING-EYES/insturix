import { describe, expect, it } from 'vitest';

import {
  assertMediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1,
  createMediaProxyMasterTranscodeExecutionBudgetReservedRecordV1,
  createMediaProxyMasterTranscodeExecutionBudgetSettledRecordV1,
} from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-ledger-record-v1';
import {
  assertMediaProxyMasterTranscodeExecutionBudgetSettlementV1,
  createMediaProxyMasterTranscodeExecutionBudgetSettlementV1,
} from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-settlement-v1';
import {
  buildMediaProxyMasterTranscodeBudgetFixtureV1,
  mediaProxyMasterBudgetHashV1,
} from './helpers/media-proxy-master-transcode-budget-fixture';

describe('proxy transcode execution-budget settlement and record v1', () => {
  it('settles one exact trusted transcode and releases unused authorization', () => {
    const fixture = buildMediaProxyMasterTranscodeBudgetFixtureV1();
    const settlement = settle(fixture, {
      mode: 'METERED_TRUSTED_TRANSCODE',
      terminalEvidence: terminal(),
      usage: usage(),
    });
    expect(settlement).toMatchObject({
      authority: 'PROXY_TRANSCODE_INTERNAL_COST_SETTLEMENT_NO_CUSTOMER_CHARGE',
      settledNanoUsd: '6301',
      releasedNanoUsd: '896219',
      usage: { usageEvidenceSha256: settlement.terminalEvidenceSha256 },
    });
  });

  it('releases all only for cancellation before the first attempt', () => {
    const fixture = buildMediaProxyMasterTranscodeBudgetFixtureV1();
    const settlement = settle(fixture, {
      mode: 'RELEASED_NO_EXECUTION',
      terminalEvidence: terminal({
        jobStatus: 'cancelled',
        terminalDisposition: 'CANCELLED',
        attemptCount: 0,
      }),
      usage: null,
    });
    expect(settlement).toMatchObject({
      settledNanoUsd: '0',
      releasedNanoUsd: fixture.authorization.maximumCostNanoUsd,
      costReceiptSha256: null,
    });
  });

  it('uses the approved maximum for retries and unknown accounting', () => {
    const fixture = buildMediaProxyMasterTranscodeBudgetFixtureV1();
    for (const input of [
      {
        mode: 'CONSERVATIVE_MAX_PASS_RETRY_ACCOUNTING_UNKNOWN',
        terminalEvidence: terminal({ attemptCount: 2 }),
        usage: null,
      },
      {
        mode: 'CONSERVATIVE_MAX_ACCOUNTING_UNKNOWN',
        terminalEvidence: terminal({ terminalDisposition: 'UNVERIFIABLE' }),
        usage: null,
      },
      {
        mode: 'CONSERVATIVE_MAX_ACCOUNTING_UNKNOWN',
        terminalEvidence: terminal({
          jobStatus: 'dead_letter', terminalDisposition: null, attemptCount: 2,
        }),
        usage: null,
      },
    ] as const) {
      expect(settle(fixture, input)).toMatchObject({
        settledNanoUsd: fixture.authorization.maximumCostNanoUsd,
        releasedNanoUsd: '0',
        costReceiptSha256: fixture.authorization.maximumCostReceiptSha256,
      });
    }
  });

  it('rejects any exact meter beyond its authorization', () => {
    const fixture = buildMediaProxyMasterTranscodeBudgetFixtureV1();
    for (const meter of Object.keys(usage()) as Array<keyof ReturnType<typeof usage>>) {
      expect(() => settle(fixture, {
        mode: 'METERED_TRUSTED_TRANSCODE',
        terminalEvidence: terminal(),
        usage: {
          ...usage(),
          [meter]: (BigInt(fixture.authorization.maximumUsage[meter])
            + BigInt(1)).toString(),
        },
      })).toThrow('SETTLEMENT_USAGE_EXCEEDS_AUTHORIZATION');
    }
  });

  it.each([
    ['exact retry', {
      mode: 'METERED_TRUSTED_TRANSCODE',
      terminalEvidence: terminal({ attemptCount: 2 }), usage: usage(),
    }],
    ['release after execution', {
      mode: 'RELEASED_NO_EXECUTION',
      terminalEvidence: terminal({
        jobStatus: 'cancelled', terminalDisposition: 'CANCELLED', attemptCount: 1,
      }), usage: null,
    }],
    ['cheap unknown result', {
      mode: 'CONSERVATIVE_MAX_ACCOUNTING_UNKNOWN',
      terminalEvidence: terminal({ terminalDisposition: 'UNVERIFIABLE' }),
      usage: usage(),
    }],
    ['conservative clean pass', {
      mode: 'CONSERVATIVE_MAX_ACCOUNTING_UNKNOWN',
      terminalEvidence: terminal(), usage: null,
    }],
  ])('fails closed for %s', (_label, input) => {
    expect(() => settle(
      buildMediaProxyMasterTranscodeBudgetFixtureV1(),
      input,
    )).toThrow('MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_');
  });

  it('creates immutable RESERVED and SETTLED ledger record versions', () => {
    const fixture = buildMediaProxyMasterTranscodeBudgetFixtureV1();
    const reserved = createMediaProxyMasterTranscodeExecutionBudgetReservedRecordV1(
      fixture.policy,
      fixture.authorization,
      fixture.reservation,
    );
    const settlement = settle(fixture, {
      mode: 'METERED_TRUSTED_TRANSCODE',
      terminalEvidence: terminal(),
      usage: usage(),
    });
    const settled = createMediaProxyMasterTranscodeExecutionBudgetSettledRecordV1(
      fixture.policy,
      fixture.authorization,
      fixture.reservation,
      settlement,
    );
    expect(reserved).toMatchObject({ recordVersion: 1, status: 'RESERVED' });
    expect(settled).toMatchObject({ recordVersion: 2, status: 'SETTLED' });
    expect(settled.recordSha256).not.toBe(reserved.recordSha256);
    expect(assertMediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1(
      settled,
      fixture.policy,
    )).toEqual(settled);
    expect(() => assertMediaProxyMasterTranscodeExecutionBudgetLedgerRecordV1({
      ...settled,
      status: 'RESERVED',
    }, fixture.policy)).toThrow('LEDGER_RECORD_INVALID');
  });

  it('rejects forged or extra settlement state', () => {
    const fixture = buildMediaProxyMasterTranscodeBudgetFixtureV1();
    const settlement = settle(fixture, {
      mode: 'METERED_TRUSTED_TRANSCODE',
      terminalEvidence: terminal(),
      usage: usage(),
    });
    for (const forged of [
      { ...settlement, settlementSha256: mediaProxyMasterBudgetHashV1('forged') },
      { ...settlement, extra: true },
    ]) {
      expect(() => assertMediaProxyMasterTranscodeExecutionBudgetSettlementV1(
        forged,
        fixture.authorization,
        fixture.reservation,
        fixture.policy,
      )).toThrow('SETTLEMENT_INVALID');
    }
  });
});

function settle(
  fixture: ReturnType<typeof buildMediaProxyMasterTranscodeBudgetFixtureV1>,
  input: Readonly<Record<string, unknown>>,
) {
  return createMediaProxyMasterTranscodeExecutionBudgetSettlementV1({
    policy: fixture.policy,
    authorization: fixture.authorization,
    reservation: fixture.reservation,
    settledAt: '2026-08-30T00:20:00.000Z',
    ...input,
  } as never);
}

function terminal(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    jobId: 'dwj_proxy_1',
    jobStatus: 'completed',
    terminalDisposition: 'PASS',
    attemptCount: 1,
    terminalArtifactSha256: mediaProxyMasterBudgetHashV1('terminal-artifact'),
    ...overrides,
  };
}

function usage() {
  return {
    sourceBytesRead: '100000',
    encodedFrameAttempts: '300',
    processMilliseconds: '1000',
    artifactBytesWritten: '100000',
    artifactBytesVerified: '100000',
  };
}
