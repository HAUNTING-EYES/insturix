import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  assertMediaProxyMasterTranscodeExecutionBudgetSettlementV2,
  createMediaProxyMasterTranscodeExecutionBudgetSettlementV2,
} from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-settlement-v2';
import { buildMediaProxyMasterTranscodeV2Fixture }
  from './helpers/media-proxy-master-transcode-v2-fixture';

describe('media proxy/master execution budget settlement V2', () => {
  it('meters a one-attempt trusted prepared-publication result', () => {
    const fixture = buildMediaProxyMasterTranscodeV2Fixture();
    const settlement = createSettlement(fixture, {
      mode: 'METERED_TRUSTED_TRANSCODE',
      terminalEvidence: terminalEvidence('completed', 'PASS', 1),
      usage: measuredUsage(fixture),
    });

    expect(BigInt(settlement.settledNanoUsd)).toBeGreaterThan(BigInt(0));
    expect(
      BigInt(settlement.settledNanoUsd) + BigInt(settlement.releasedNanoUsd),
    ).toBe(BigInt(fixture.budgetAuthorization.maximumCostNanoUsd));
    expect(settlement.artifactAccountingProfileSha256).toBe(
      fixture.budgetAuthorization.scope.artifactAccountingProfileSha256,
    );
    expect(assertMediaProxyMasterTranscodeExecutionBudgetSettlementV2(
      settlement,
      fixture.budgetAuthorization,
      fixture.budgetReservation,
      fixture.base.policy,
    )).toEqual(settlement);
  });

  it('rejects measured usage above the authorized V2 maximum', () => {
    const fixture = buildMediaProxyMasterTranscodeV2Fixture();
    const usage = measuredUsage(fixture);

    expect(() => createSettlement(fixture, {
      mode: 'METERED_TRUSTED_TRANSCODE',
      terminalEvidence: terminalEvidence('completed', 'PASS', 1),
      usage: {
        ...usage,
        artifactBytesVerified: (
          BigInt(fixture.budgetAuthorization.maximumUsage.artifactBytesVerified)
          + BigInt(1)
        ).toString(),
      },
    })).toThrow('SETTLEMENT_USAGE_EXCEEDS_AUTHORIZATION');
  });

  it('releases the reservation only for cancellation before execution', () => {
    const fixture = buildMediaProxyMasterTranscodeV2Fixture();
    const settlement = createSettlement(fixture, {
      mode: 'RELEASED_NO_EXECUTION',
      terminalEvidence: terminalEvidence('cancelled', 'CANCELLED', 0),
      usage: null,
    });

    expect(settlement.settledNanoUsd).toBe('0');
    expect(settlement.releasedNanoUsd).toBe(
      fixture.budgetAuthorization.maximumCostNanoUsd,
    );
  });

  it('uses the authorized maximum when retry accounting is not exact', () => {
    const fixture = buildMediaProxyMasterTranscodeV2Fixture();
    const settlement = createSettlement(fixture, {
      mode: 'CONSERVATIVE_MAX_PASS_RETRY_ACCOUNTING_UNKNOWN',
      terminalEvidence: terminalEvidence('completed', 'PASS', 2),
      usage: null,
    });

    expect(settlement.settledNanoUsd).toBe(
      fixture.budgetAuthorization.maximumCostNanoUsd,
    );
    expect(settlement.releasedNanoUsd).toBe('0');
  });

  it('rejects tampered receipt material', () => {
    const fixture = buildMediaProxyMasterTranscodeV2Fixture();
    const settlement = createSettlement(fixture, {
      mode: 'METERED_TRUSTED_TRANSCODE',
      terminalEvidence: terminalEvidence('completed', 'PASS', 1),
      usage: measuredUsage(fixture),
    });

    expect(() => assertMediaProxyMasterTranscodeExecutionBudgetSettlementV2(
      { ...settlement, releasedNanoUsd: '0' },
      fixture.budgetAuthorization,
      fixture.budgetReservation,
      fixture.base.policy,
    )).toThrow('SETTLEMENT_INVALID');
  });
});

function createSettlement(
  fixture: ReturnType<typeof buildMediaProxyMasterTranscodeV2Fixture>,
  input: Pick<
    Parameters<
      typeof createMediaProxyMasterTranscodeExecutionBudgetSettlementV2
    >[0],
    'mode' | 'terminalEvidence' | 'usage'
  >,
) {
  return createMediaProxyMasterTranscodeExecutionBudgetSettlementV2({
    policy: fixture.base.policy,
    authorization: fixture.budgetAuthorization,
    reservation: fixture.budgetReservation,
    ...input,
    settledAt: '2026-08-30T00:13:00.000Z',
  });
}

function measuredUsage(
  fixture: ReturnType<typeof buildMediaProxyMasterTranscodeV2Fixture>,
) {
  const artifact = BigInt(fixture.preparedArtifactReference.artifactByteLength);
  const manifest = BigInt(fixture.preparedArtifactReference.manifestByteLength);
  return {
    sourceBytesRead: String(
      fixture.contract.payload.command.masterSourceVersion.byteLength,
    ),
    encodedFrameAttempts:
      fixture.contract.payload.command.masterTimeMap.totalFrameCount,
    processMilliseconds: '60000',
    artifactBytesWritten: (artifact * BigInt(2) + manifest).toString(),
    artifactBytesVerified: (
      artifact * BigInt(3) + manifest * BigInt(2)
    ).toString(),
  };
}

function terminalEvidence(
  jobStatus: 'completed' | 'cancelled' | 'dead_letter',
  terminalDisposition: 'PASS' | 'UNVERIFIABLE' | 'CANCELLED' | null,
  attemptCount: number,
) {
  return {
    jobId: 'dwj_proxy_result_v2',
    jobStatus,
    terminalDisposition,
    attemptCount,
    terminalArtifactSha256: hashEditronCanonicalJsonV1({
      jobStatus,
      terminalDisposition,
      attemptCount,
    }),
  };
}
