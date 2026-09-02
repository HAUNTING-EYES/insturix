import { describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import type { DurableWorkflowJobSnapshotV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import { createMediaProxyMasterTranscodeExecutionBudgetReservedRecordV2 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-ledger-record-v2';
import type { MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV2 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-ledger-owner-v2';
import { createMediaProxyMasterTranscodeExecutionBudgetSettlementV2 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-settlement-v2';
import {
  createMediaProxyMasterTranscodeExecutionBudgetWorkerOwnerV2,
  resolveMediaProxyMasterTranscodeExecutionBudgetPreclaimV2,
} from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-worker-owner-v2';
import {
  createMediaProxyMasterTranscodeDurablePreparedStateV2,
  createMediaProxyMasterTranscodeDurableResultV2,
  createMediaProxyMasterTranscodeDurableTerminalReceiptV2,
  createMediaProxyMasterTranscodePreparedResumeStateV2,
  createMediaProxyMasterTranscodeResultResumeStateV2,
  createMediaProxyMasterTrustedReceiptFromPersistedPreparationV2,
} from '@/lib/editron/services/media-proxy-master-transcode-durable-result-v2';
import {
  buildMediaProxyMasterTranscodeV2Fixture,
  withMediaProxyMasterTranscodeResumeV2Fixture as withResume,
} from './helpers/media-proxy-master-transcode-v2-fixture';

const NOW = '2026-08-30T00:15:00.000Z';

describe('proxy transcode execution-budget durable worker owner V2', () => {
  it('preclaims the exact queued V2 reservation without settling it', async () => {
    const fixture = build();

    await expect(resolveMediaProxyMasterTranscodeExecutionBudgetPreclaimV2({
      ledgerOwner: fixture.ledgerOwner,
      jobInput: fixture.contract.payload,
      clock: () => new Date(NOW),
    })).resolves.toEqual(fixture.base.policy);
    expect(fixture.resolve).toHaveBeenCalledTimes(1);
    expect(fixture.settle).not.toHaveBeenCalled();
  });

  it('authorizes exact running attempts with one stable replay receipt', async () => {
    const fixture = build();
    const first = await fixture.owner.authorize({
      job: snapshot(fixture),
      jobInput: fixture.contract.payload,
    });
    const retry = await fixture.owner.authorize({
      job: snapshot(fixture, {
        attemptCount: 2,
        remainingAttempts: fixture.job.maxAttempts - 2,
      }),
      jobInput: fixture.contract.payload,
    });

    expect(first).toMatchObject({
      disposition: 'AUTHORIZED',
      reservationId: fixture.budgetReservation.reservationId,
      reservationBindingSha256:
        fixture.budgetReservation.reservationSha256,
    });
    expect(retry).toEqual(first);

    await expect(fixture.owner.authorize({
      job: snapshot(fixture, {
        attemptCount: 0,
        remainingAttempts: fixture.job.maxAttempts,
      }),
      jobInput: fixture.contract.payload,
    })).resolves.toMatchObject({
      disposition: 'BLOCKED',
      retryable: false,
      proofSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      errorCode: expect.stringContaining('JOB_BINDING_MISMATCH'),
    });
  });

  it('blocks expired reservations and explicitly classified outages', async () => {
    const expired = build('2026-08-30T01:00:00.000Z');
    await expect(expired.owner.authorize({
      job: snapshot(expired),
      jobInput: expired.contract.payload,
    })).resolves.toMatchObject({
      disposition: 'BLOCKED',
      retryable: false,
      errorCode: expect.stringContaining('RESERVATION_EXPIRED'),
    });

    const outage = build();
    outage.resolve.mockRejectedValueOnce(new Error('ATLAS_UNAVAILABLE'));
    await expect(outage.owner.authorize({
      job: snapshot(outage),
      jobInput: outage.contract.payload,
    })).resolves.toMatchObject({
      disposition: 'BLOCKED',
      retryable: true,
      errorCode: 'PROXY_BUDGET_ATLAS_UNAVAILABLE',
    });
  });

  it('meters one PASS from persisted preparation and publication evidence', async () => {
    const fixture = build();
    const authorizationReceiptSha256 = await authorizeReceipt(fixture);
    const terminal = passSnapshot(
      fixture,
      1,
      authorizationReceiptSha256,
    );
    const settlement = await fixture.owner.settleTerminal(terminal) as {
      mode: string;
      usage: Record<string, string>;
    };
    const artifact = BigInt(
      fixture.preparedArtifactReference.artifactByteLength,
    );
    const manifest = BigInt(
      fixture.preparedArtifactReference.manifestByteLength,
    );

    expect(settlement).toMatchObject({
      mode: 'METERED_TRUSTED_TRANSCODE',
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
    });
  });

  it('settles successful retry conservatively without invented usage', async () => {
    const fixture = build();
    const receipt = await authorizeReceipt(fixture);
    await fixture.owner.settleTerminal(passSnapshot(fixture, 2, receipt));

    expect(fixture.settle).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'CONSERVATIVE_MAX_PASS_RETRY_ACCOUNTING_UNKNOWN',
      usage: null,
    }));
  });

  it.each([
    [0, 'RELEASED_NO_EXECUTION'],
    [1, 'CONSERVATIVE_MAX_ACCOUNTING_UNKNOWN'],
  ] as const)('classifies V2 cancellation after %i attempts as %s',
    async (attemptCount, mode) => {
      const fixture = build();
      await fixture.owner.settleTerminal(
        cancelledSnapshot(fixture, attemptCount),
      );
      expect(fixture.settle).toHaveBeenCalledWith(expect.objectContaining({
        mode,
        usage: null,
      }));
    });

  it('uses conservative accounting for dead-letter state', async () => {
    const fixture = build();
    await fixture.owner.settleTerminal(deadLetterSnapshot(fixture));

    expect(fixture.settle).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'CONSERVATIVE_MAX_ACCOUNTING_UNKNOWN',
      usage: null,
    }));
  });

  it('rejects wrong authorization binding and forged PASS terminal state', async () => {
    const fixture = build();
    const receipt = await authorizeReceipt(fixture);
    const wrongAuthorization = passSnapshot(
      fixture,
      1,
      fixture.preparedEvidence.evidenceSha256,
    );
    await expect(fixture.owner.settleTerminal(wrongAuthorization))
      .rejects.toThrow('PASS_RESUME_EVIDENCE_INVALID');

    const pass = passSnapshot(fixture, 1, receipt);
    await expect(fixture.owner.settleTerminal({
      ...pass,
      terminalReceipt: {
        ...pass.terminalReceipt!,
        receiptSha256: fixture.preparedEvidence.evidenceSha256,
      },
    })).rejects.toThrow('PASS_TERMINAL_RECEIPT_INVALID');
  });
});

function build(now = NOW) {
  const budget = buildMediaProxyMasterTranscodeV2Fixture();
  const record =
    createMediaProxyMasterTranscodeExecutionBudgetReservedRecordV2(
      budget.base.policy,
      budget.budgetAuthorization,
      budget.budgetReservation,
    );
  const resolve = vi.fn(async () => ({
    policy: budget.base.policy,
    record,
  }));
  const settle = vi.fn(async (request: Parameters<
    MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV2['settle']
  >[0]) => createMediaProxyMasterTranscodeExecutionBudgetSettlementV2({
    policy: budget.base.policy,
    authorization: budget.budgetAuthorization,
    reservation: budget.budgetReservation,
    ...request,
    settledAt: NOW,
  }));
  const ledgerOwner: MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV2 = {
    reserve: async () => budget.budgetReservation,
    resolve,
    settle,
  };
  return {
    ...budget,
    record,
    resolve,
    settle,
    ledgerOwner,
    owner: createMediaProxyMasterTranscodeExecutionBudgetWorkerOwnerV2({
      ledgerOwner,
      policy: budget.base.policy,
      clock: () => new Date(now),
      classifyInfrastructureFailure: (error) => (
        error instanceof Error && error.message === 'ATLAS_UNAVAILABLE'
          ? { errorCode: 'PROXY_BUDGET_ATLAS_UNAVAILABLE', retryable: true }
          : null
      ),
    }),
  };
}

type Fixture = ReturnType<typeof build>;

function snapshot(
  fixture: Fixture,
  overrides: Partial<DurableWorkflowJobSnapshotV1> = {},
): DurableWorkflowJobSnapshotV1 {
  return { ...fixture.job, ...overrides };
}

async function authorizeReceipt(fixture: Fixture): Promise<string> {
  const result = await fixture.owner.authorize({
    job: snapshot(fixture),
    jobInput: fixture.contract.payload,
  });
  if (result.disposition !== 'AUTHORIZED') throw new Error('TEST_AUTH_BLOCKED');
  return result.authorizationReceiptSha256;
}

function passSnapshot(
  fixture: Fixture,
  attemptCount: number,
  authorizationReceiptSha256: string,
): DurableWorkflowJobSnapshotV1 {
  const running = snapshot(fixture);
  const preparedState = createMediaProxyMasterTranscodeDurablePreparedStateV2({
    job: running,
    budgetAuthorizationReceiptSha256: authorizationReceiptSha256,
    preparedEvidence: fixture.preparedEvidence,
    preparedArtifactReference: fixture.preparedArtifactReference,
  });
  const preparedResume = createMediaProxyMasterTranscodePreparedResumeStateV2({
    job: running,
    preparedState,
  });
  const preparedJob = withResume(
    running,
    1,
    preparedResume,
    '2026-08-30T00:12:01.750Z',
  );
  const trusted =
    createMediaProxyMasterTrustedReceiptFromPersistedPreparationV2({
      job: preparedJob,
      proxySourceVersion: fixture.seedReceipt.proxyEncode.sourceVersion,
      completedAt: fixture.seedReceipt.completedAt,
    });
  const result = createMediaProxyMasterTranscodeDurableResultV2({
    job: preparedJob,
    trustedTranscodeReceipt: trusted,
  });
  const resultResume = createMediaProxyMasterTranscodeResultResumeStateV2({
    job: preparedJob,
    result,
  });
  const resultJob = withResume(
    preparedJob,
    2,
    resultResume,
    '2026-08-30T00:12:02.500Z',
  );
  const terminal = createMediaProxyMasterTranscodeDurableTerminalReceiptV2({
    job: resultJob,
    completedAt: new Date('2026-08-30T00:12:03.000Z'),
  });
  return snapshot(fixture, {
    status: 'completed',
    attemptCount,
    remainingAttempts: fixture.job.maxAttempts - attemptCount,
    leaseOwnerId: null,
    leaseExpiresAt: null,
    resumeState: resultJob.resumeState,
    terminalReceipt: {
      ...terminal,
      completedAt: terminal.completedAt.toISOString(),
    },
    updatedAt: '2026-08-30T00:12:03.000Z',
  });
}

function cancelledSnapshot(
  fixture: Fixture,
  attemptCount: number,
): DurableWorkflowJobSnapshotV1 {
  const material = {
    jobId: fixture.job.jobId,
    disposition: 'CANCELLED',
    attemptCount,
  };
  return snapshot(fixture, {
    status: 'cancelled',
    attemptCount,
    remainingAttempts: fixture.job.maxAttempts - attemptCount,
    leaseOwnerId: null,
    leaseExpiresAt: null,
    terminalReceipt: {
      disposition: 'CANCELLED',
      receiptId: `cancel-v2-${attemptCount}`,
      receiptSha256: hashEditronCanonicalJsonV1(material),
      proofReferences: [],
      completedAt: NOW,
    },
    updatedAt: NOW,
  });
}

function deadLetterSnapshot(
  fixture: Fixture,
): DurableWorkflowJobSnapshotV1 {
  return snapshot(fixture, {
    status: 'dead_letter',
    attemptCount: 1,
    remainingAttempts: fixture.job.maxAttempts - 1,
    leaseOwnerId: null,
    leaseExpiresAt: null,
    terminalReceipt: null,
    error: {
      code: 'TRANSCODE_FAILED',
      message: 'TRANSCODE_FAILED',
      retryable: false,
      occurredAt: NOW,
    },
    updatedAt: NOW,
  });
}
