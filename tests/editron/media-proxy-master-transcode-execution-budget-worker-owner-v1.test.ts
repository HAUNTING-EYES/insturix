import { describe, expect, it, vi } from 'vitest';

import type { DurableWorkflowJobSnapshotV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import { createMediaProxyMasterTranscodeExecutionBudgetReservedRecordV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-ledger-record-v1';
import type { MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-ledger-owner-v1';
import { mediaProxyMasterTranscodeExecutionBudgetReservationRefV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-reservation-v1';
import { createMediaProxyMasterTranscodeExecutionBudgetSettlementV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-settlement-v1';
import {
  createMediaProxyMasterTranscodeExecutionBudgetWorkerOwnerV1,
  resolveMediaProxyMasterTranscodeExecutionBudgetPreclaimV1,
} from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-worker-owner-v1';
import {
  buildMediaProxyMasterTranscodeDurableJobContractV1,
} from '@/lib/editron/services/media-proxy-master-transcode-durable-job-v1';
import {
  createMediaProxyMasterTranscodeDurableResultV1,
  createMediaProxyMasterTranscodeDurableResumeStateV1,
  createMediaProxyMasterTranscodeDurableTerminalReceiptV1,
} from '@/lib/editron/services/media-proxy-master-transcode-durable-result-v1';
import {
  buildMediaProxyMasterTranscodeBudgetFixtureV1,
  createMediaProxyMasterTranscodeBudgetTrustedReceiptV1,
  mediaProxyMasterBudgetHashV1,
} from './helpers/media-proxy-master-transcode-budget-fixture';

const NOW = '2026-08-30T00:15:00.000Z';

describe('proxy transcode execution-budget durable worker owner v1', () => {
  it('preclaims the exact queued reservation without settling it', async () => {
    const fixture = build();
    await expect(resolveMediaProxyMasterTranscodeExecutionBudgetPreclaimV1({
      ledgerOwner: fixture.ledgerOwner,
      jobInput: fixture.contract.payload,
      clock: () => new Date(NOW),
    })).resolves.toEqual(fixture.policy);
    expect(fixture.resolve).toHaveBeenCalledTimes(1);
    expect(fixture.settle).not.toHaveBeenCalled();
  });

  it('authorizes exact running attempts with one stable replay receipt', async () => {
    const fixture = build();
    const first = await fixture.owner.authorize({
      job: snapshot(fixture, { attemptCount: 1, remainingAttempts: 5 }),
      jobInput: fixture.contract.payload,
    });
    const retry = await fixture.owner.authorize({
      job: snapshot(fixture, { attemptCount: 2, remainingAttempts: 4 }),
      jobInput: fixture.contract.payload,
    });
    expect(first).toMatchObject({
      disposition: 'AUTHORIZED',
      reservationId: fixture.reservation.reservationId,
      reservationBindingSha256: fixture.reservation.reservationSha256,
    });
    expect(retry).toEqual(first);

    await expect(fixture.owner.authorize({
      job: snapshot(fixture, { attemptCount: 0, remainingAttempts: 6 }),
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

  it('meters one PASS entirely from persisted trusted receipt evidence', async () => {
    const fixture = build();
    const authorizationReceiptSha256 = await authorizeReceipt(fixture);
    const terminal = passSnapshot(fixture, 1, authorizationReceiptSha256);
    const settlement = await fixture.owner.settleTerminal(terminal) as {
      mode: string;
      usage: Record<string, string>;
    };
    expect(settlement).toMatchObject({
      mode: 'METERED_TRUSTED_TRANSCODE',
      usage: {
        sourceBytesRead: '100000',
        encodedFrameAttempts: '300',
        processMilliseconds: '60000',
        artifactBytesWritten: '40000',
        artifactBytesVerified: '40000',
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
  ] as const)('classifies cancellation after %i attempts as %s',
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

  it('uses conservative unknown accounting and rejects forged PASS resume', async () => {
    const fixture = build();
    await fixture.owner.settleTerminal(deadLetterSnapshot(fixture));
    expect(fixture.settle).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'CONSERVATIVE_MAX_ACCOUNTING_UNKNOWN',
      usage: null,
    }));

    const receipt = await authorizeReceipt(fixture);
    const forged = { ...passSnapshot(fixture, 1, receipt), resumeState: null };
    await expect(fixture.owner.settleTerminal(forged)).rejects.toThrow(
      'PASS_RESUME_EVIDENCE_INVALID',
    );
  });
});

function build(now = NOW) {
  const budget = buildMediaProxyMasterTranscodeBudgetFixtureV1();
  const contract = buildMediaProxyMasterTranscodeDurableJobContractV1({
    tenantId: 'tenant-a',
    userId: 'user-a',
    orgId: null,
    assetId: 'asset-a',
    command: budget.command,
    publicationPolicy: budget.publicationPolicy,
    runtimePolicy: budget.runtimePolicy,
    budgetReservation:
      mediaProxyMasterTranscodeExecutionBudgetReservationRefV1(
        budget.reservation,
      ),
  });
  const record =
    createMediaProxyMasterTranscodeExecutionBudgetReservedRecordV1(
      budget.policy,
      budget.authorization,
      budget.reservation,
    );
  const resolve = vi.fn(async () => ({ policy: budget.policy, record }));
  const settle = vi.fn(async (request: Parameters<
    MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1['settle']
  >[0]) => createMediaProxyMasterTranscodeExecutionBudgetSettlementV1({
    policy: budget.policy,
    authorization: budget.authorization,
    reservation: budget.reservation,
    ...request,
    settledAt: NOW,
  }));
  const ledgerOwner: MediaProxyMasterTranscodeExecutionBudgetLedgerOwnerV1 = {
    reserve: async () => budget.reservation,
    resolve,
    settle,
  };
  return {
    ...budget,
    contract,
    record,
    resolve,
    settle,
    ledgerOwner,
    owner: createMediaProxyMasterTranscodeExecutionBudgetWorkerOwnerV1({
      ledgerOwner,
      policy: budget.policy,
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
  const contract = fixture.contract;
  const attemptCount = overrides.attemptCount ?? 1;
  return {
    jobId: 'dwj_proxy_budget_1',
    version: 'EDITRON_DURABLE_WORKFLOW_JOB_V1_1',
    tenantId: contract.payload.tenantId,
    userId: contract.payload.userId,
    orgId: contract.payload.orgId,
    projectId: null,
    operationOwner: 'MEDIA_ASSETS',
    operationKind: 'media_proxy_master_trusted_transcode',
    operationId: contract.operationIdentity,
    parentCommandId: null,
    parentReceiptId: null,
    idempotencyKey: contract.operationIdentity,
    input: {
      schemaId: contract.payload.version,
      bindingSha256: contract.bindingSha256,
      payload: contract.payload,
    },
    dependencies: contract.dependencies,
    budgetReservation: contract.payload.budgetReservation,
    status: 'running',
    attemptCount,
    maxAttempts: 6,
    remainingAttempts: 6 - attemptCount,
    retryCursor: null,
    leaseOwnerId: 'worker-a',
    leaseExpiresAt: '2026-08-30T00:20:00.000Z',
    nextAttemptAt: null,
    cancelRequestedAt: null,
    cancelRequestedBy: null,
    cancelReason: null,
    resumeState: null,
    terminalReceipt: null,
    error: null,
    dispatchTransport: 'QSTASH',
    dispatchMessageId: 'message-a',
    dispatchCount: 1,
    createdAt: '2026-08-30T00:10:00.000Z',
    updatedAt: NOW,
    expiresAt: '2026-09-06T00:10:00.000Z',
    ...overrides,
  };
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
) {
  const result = createMediaProxyMasterTranscodeDurableResultV1({
    jobId: 'dwj_proxy_budget_1',
    operationId: fixture.contract.operationIdentity,
    jobInputBindingSha256: fixture.contract.bindingSha256,
    jobInput: fixture.contract.payload,
    budgetAuthorizationReceiptSha256: authorizationReceiptSha256,
    trustedTranscodeReceipt:
      createMediaProxyMasterTranscodeBudgetTrustedReceiptV1(fixture.command),
  });
  const resume = createMediaProxyMasterTranscodeDurableResumeStateV1({
    result,
    jobId: 'dwj_proxy_budget_1',
    operationId: fixture.contract.operationIdentity,
    jobInputBindingSha256: fixture.contract.bindingSha256,
    jobInput: fixture.contract.payload,
  });
  const terminal = createMediaProxyMasterTranscodeDurableTerminalReceiptV1({
    jobId: 'dwj_proxy_budget_1',
    operationId: fixture.contract.operationIdentity,
    jobInputBindingSha256: fixture.contract.bindingSha256,
    jobInput: fixture.contract.payload,
    result,
    completedAt: new Date('2026-08-30T00:12:03.000Z'),
  });
  return snapshot(fixture, {
    status: 'completed',
    attemptCount,
    remainingAttempts: 6 - attemptCount,
    leaseOwnerId: null,
    leaseExpiresAt: null,
    resumeState: { ...resume, sequence: 1, committedAt: NOW },
    terminalReceipt: {
      ...terminal,
      completedAt: terminal.completedAt.toISOString(),
    },
  });
}

function cancelledSnapshot(fixture: Fixture, attemptCount: number) {
  return snapshot(fixture, {
    status: 'cancelled',
    attemptCount,
    remainingAttempts: 6 - attemptCount,
    leaseOwnerId: null,
    leaseExpiresAt: null,
    terminalReceipt: {
      disposition: 'CANCELLED',
      receiptId: 'cancel-proxy-1',
      receiptSha256: mediaProxyMasterBudgetHashV1('cancelled'),
      proofReferences: [],
      completedAt: NOW,
    },
  });
}

function deadLetterSnapshot(fixture: Fixture) {
  return snapshot(fixture, {
    status: 'dead_letter',
    attemptCount: 1,
    remainingAttempts: 5,
    leaseOwnerId: null,
    leaseExpiresAt: null,
    error: {
      code: 'TRANSCODE_FAILED',
      message: 'TRANSCODE_FAILED',
      retryable: false,
      occurredAt: NOW,
    },
  });
}
