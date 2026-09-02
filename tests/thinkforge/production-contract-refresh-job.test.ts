import { describe, expect, it, vi } from 'vitest';

import {
  processProductionContractRefreshJob,
  type ProductionContractRefreshJobDependencies,
} from '@/lib/thinkforge/production-contract-refresh/job';
import type { ProductionContractRefreshJobSnapshot } from '@/lib/thinkforge/production-contract-refresh/job-store';
import { hashScriptDocumentContent } from '@/lib/thinkforge/persistence/script-sidecar-binding';
import { abstractExplainerTreatment } from '@/tests/fixtures/thinkforge-video-treatment';

const CONTENT = '# Durable script\n\nKeep this exact visible copy for production metadata refresh.';
const DOCUMENT_HASH = hashScriptDocumentContent(CONTENT);

function checkpoint(): NonNullable<ProductionContractRefreshJobSnapshot['treatmentCheckpoint']> {
  return {
    treatment: abstractExplainerTreatment,
    inputFingerprint: 'a'.repeat(64),
    source: 'generated',
    cacheStatus: 'miss',
    modelName: 'gemini-test',
    latencyMs: 120,
    writingContextCacheStatus: 'inline',
    writingKnowledgeVersion: 'writing-v1',
    editronCreativeGraphVersion: 'graph-v1',
  };
}

function job(
  overrides: Partial<ProductionContractRefreshJobSnapshot> = {},
): ProductionContractRefreshJobSnapshot {
  return {
    id: 'contractrefresh_1',
    version: 1,
    dedupeKey: 'dedupe_1',
    userId: 'user_1',
    orgId: 'org_1',
    sessionId: 'session_1',
    scriptId: 'default',
    baseVersion: 2,
    input: {
      userId: 'user_1',
      orgId: 'org_1',
      sessionId: 'session_1',
      scriptId: 'default',
      baseVersion: 2,
      documentHash: DOCUMENT_HASH,
    },
    status: 'running',
    stage: 'treatment',
    dispatchCount: 1,
    stageFailureCount: 0,
    maxStageFailures: 3,
    leaseExpiresAt: '2026-09-01T10:02:00.000Z',
    queueMessageId: null,
    treatmentCheckpoint: null,
    treatmentCheckpointHash: null,
    commitReceipt: null,
    billing: {
      status: 'charged',
      wallet: { type: 'org', clerkOrgId: 'org_1', actorUserId: 'user_1' },
      transactionId: 'txn_1',
      cost: 5,
      updatedAt: '2026-09-01T10:00:00.000Z',
      reason: null,
    },
    error: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    expiresAt: '2026-09-03T10:00:00.000Z',
    ...overrides,
  };
}

function storeFor(snapshot: ProductionContractRefreshJobSnapshot) {
  return {
    claim: vi.fn().mockResolvedValue({ kind: 'claimed', job: snapshot, leaseToken: 'lease_1' }),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    saveTreatment: vi.fn().mockResolvedValue(undefined),
    saveCommitReceipt: vi.fn().mockResolvedValue(undefined),
    yieldLease: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
    retryOrDeadLetter: vi.fn().mockResolvedValue('queued'),
    markRefunded: vi.fn().mockResolvedValue(undefined),
    setQueueMessage: vi.fn().mockResolvedValue(undefined),
    listRecoverable: vi.fn().mockResolvedValue([]),
    listRefundPending: vi.fn().mockResolvedValue([]),
  };
}

describe('production-contract refresh worker', () => {
  it('checkpoints treatment and dispatches sidecar work separately', async () => {
    const snapshot = job();
    const store = storeFor(snapshot);
    const plan = vi.fn().mockResolvedValue(checkpoint());
    const dispatch = vi.fn().mockResolvedValue('msg_2');

    const result = await processProductionContractRefreshJob(snapshot.id, {
      store,
      plan,
      dispatch,
    } as ProductionContractRefreshJobDependencies);

    expect(result).toEqual({ status: 'queued', reason: 'next_stage' });
    expect(store.saveTreatment).toHaveBeenCalledWith(snapshot.id, 'lease_1', checkpoint());
    expect(store.yieldLease).toHaveBeenCalledWith(snapshot.id, 'lease_1');
    expect(dispatch).toHaveBeenCalledWith(snapshot.id);
  });

  it('reuses the checkpoint, preserves content, and commits once', async () => {
    const snapshot = job({ stage: 'sidecar', treatmentCheckpoint: checkpoint() });
    const store = storeFor(snapshot);
    const revise = vi.fn().mockResolvedValue({
      version: 3,
      content: CONTENT,
      metadata: { productionContractRefreshJobId: snapshot.id },
    });

    const result = await processProductionContractRefreshJob(snapshot.id, {
      store,
      revise,
      loadScript: vi.fn().mockResolvedValue({ version: 2, content: CONTENT, metadata: {} }),
      dispatch: vi.fn(),
    } as ProductionContractRefreshJobDependencies);

    expect(result).toEqual({ status: 'completed', documentVersion: 3 });
    expect(revise).toHaveBeenCalledWith(expect.objectContaining({
      expectedVersion: 2,
      refreshJobId: snapshot.id,
      productionContractPlan: expect.objectContaining({ treatment: abstractExplainerTreatment }),
    }));
    expect(store.saveCommitReceipt).toHaveBeenCalledWith(
      snapshot.id,
      'lease_1',
      expect.objectContaining({ documentVersion: 3, contentHash: DOCUMENT_HASH }),
    );
    expect(store.complete).toHaveBeenCalledTimes(1);
  });

  it('recovers a crash after commit without invoking the writer again', async () => {
    const snapshot = job({ stage: 'sidecar', treatmentCheckpoint: checkpoint() });
    const store = storeFor(snapshot);
    const revise = vi.fn();

    await expect(processProductionContractRefreshJob(snapshot.id, {
      store,
      revise,
      loadScript: vi.fn().mockResolvedValue({
        version: 3,
        content: CONTENT,
        metadata: { productionContractRefreshJobId: snapshot.id },
      }),
      dispatch: vi.fn(),
    } as ProductionContractRefreshJobDependencies)).resolves.toEqual({
      status: 'completed',
      documentVersion: 3,
    });

    expect(revise).not.toHaveBeenCalled();
    expect(store.saveCommitReceipt).toHaveBeenCalledTimes(1);
  });

  it('dead-letters deterministic conflicts and refunds the exact charged wallet', async () => {
    const snapshot = job();
    const store = storeFor(snapshot);
    store.retryOrDeadLetter.mockResolvedValue('dead_letter');
    const refund = vi.fn().mockResolvedValue({ success: true });

    const result = await processProductionContractRefreshJob(snapshot.id, {
      store,
      plan: vi.fn().mockRejectedValue(new Error('Version conflict')),
      dispatch: vi.fn(),
      refund,
    } as ProductionContractRefreshJobDependencies);

    expect(result).toEqual({ status: 'dead_letter', error: 'Version conflict', refundPending: false });
    expect(store.retryOrDeadLetter).toHaveBeenCalledWith(
      snapshot.id,
      'lease_1',
      expect.any(Error),
      false,
    );
    expect(refund).toHaveBeenCalledWith(
      snapshot.billing.wallet,
      5,
      'Version conflict',
      expect.objectContaining({ originalTransactionId: 'txn_1' }),
    );
    expect(store.markRefunded).toHaveBeenCalledWith(snapshot.id, 'Version conflict');
  });
});
