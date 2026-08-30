import { describe, expect, it } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  assertMediaProxyMasterTranscodeExecutionBudgetLedgerRecordV2,
  createMediaProxyMasterTranscodeExecutionBudgetReservedRecordV2,
  createMediaProxyMasterTranscodeExecutionBudgetSettledRecordV2,
} from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-ledger-record-v2';
import { createMediaProxyMasterTranscodeExecutionBudgetSettlementV2 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-settlement-v2';
import { buildMediaProxyMasterTranscodeV2Fixture }
  from './helpers/media-proxy-master-transcode-v2-fixture';

describe('media proxy/master execution budget ledger record V2', () => {
  it('creates immutable RESERVED and SETTLED record versions', () => {
    const fixture = buildMediaProxyMasterTranscodeV2Fixture();
    const reserved = reservedRecord(fixture);
    const settled = createMediaProxyMasterTranscodeExecutionBudgetSettledRecordV2(
      fixture.base.policy,
      fixture.budgetAuthorization,
      fixture.budgetReservation,
      settlement(fixture),
    );

    expect(reserved).toMatchObject({ recordVersion: 1, status: 'RESERVED' });
    expect(settled).toMatchObject({ recordVersion: 2, status: 'SETTLED' });
    expect(settled.recordSha256).not.toBe(reserved.recordSha256);
    expect(Object.isFrozen(settled)).toBe(true);
    expect(assertMediaProxyMasterTranscodeExecutionBudgetLedgerRecordV2(
      settled,
      fixture.base.policy,
    )).toEqual(settled);
  });

  it('rejects forged or extra record state', () => {
    const fixture = buildMediaProxyMasterTranscodeV2Fixture();
    const record = reservedRecord(fixture);

    for (const forged of [
      { ...record, status: 'SETTLED' },
      { ...record, recordVersion: 2 },
      { ...record, recordSha256: fixture.preparedEvidence.evidenceSha256 },
      { ...record, unowned: true },
    ]) {
      expect(() => assertMediaProxyMasterTranscodeExecutionBudgetLedgerRecordV2(
        forged,
        fixture.base.policy,
      )).toThrow('BUDGET_V2_LEDGER_RECORD_INVALID');
    }
  });

  it('rejects a reservation from another V2 authorization', () => {
    const fixture = buildMediaProxyMasterTranscodeV2Fixture();
    const other = buildMediaProxyMasterTranscodeV2Fixture({
      maxOutputBytes: 3_000_000,
    });

    expect(() => createMediaProxyMasterTranscodeExecutionBudgetReservedRecordV2(
      fixture.base.policy,
      fixture.budgetAuthorization,
      other.budgetReservation,
    )).toThrow('BUDGET_V2_');
  });
});

function reservedRecord(
  fixture: ReturnType<typeof buildMediaProxyMasterTranscodeV2Fixture>,
) {
  return createMediaProxyMasterTranscodeExecutionBudgetReservedRecordV2(
    fixture.base.policy,
    fixture.budgetAuthorization,
    fixture.budgetReservation,
  );
}

function settlement(
  fixture: ReturnType<typeof buildMediaProxyMasterTranscodeV2Fixture>,
) {
  const artifact = BigInt(fixture.preparedArtifactReference.artifactByteLength);
  const manifest = BigInt(fixture.preparedArtifactReference.manifestByteLength);
  return createMediaProxyMasterTranscodeExecutionBudgetSettlementV2({
    policy: fixture.base.policy,
    authorization: fixture.budgetAuthorization,
    reservation: fixture.budgetReservation,
    mode: 'METERED_TRUSTED_TRANSCODE',
    terminalEvidence: {
      jobId: fixture.job.jobId,
      jobStatus: 'completed',
      terminalDisposition: 'PASS',
      attemptCount: 1,
      terminalArtifactSha256: hashEditronCanonicalJsonV1({
        jobId: fixture.job.jobId,
        status: 'PASS',
      }),
    },
    usage: {
      sourceBytesRead: String(
        fixture.contract.payload.command.masterSourceVersion.byteLength,
      ),
      encodedFrameAttempts:
        fixture.contract.payload.command.masterTimeMap.totalFrameCount,
      processMilliseconds: '60000',
      artifactBytesWritten: (
        artifact * BigInt(2) + manifest
      ).toString(),
      artifactBytesVerified: (
        artifact * BigInt(3) + manifest * BigInt(2)
      ).toString(),
    },
    settledAt: '2026-08-30T00:13:00.000Z',
  });
}
