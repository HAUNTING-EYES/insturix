import type { Collection } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import {
  PRODUCTION_CONTRACT_REFRESH_JOB_INDEXES,
  PRODUCTION_CONTRACT_REFRESH_JOB_TTL_MS,
  ProductionContractRefreshJobStore,
  ProductionContractRefreshJobTransitionError,
  createProductionContractRefreshJobDedupeKey,
  type ProductionContractRefreshJobInput,
  type ProductionContractRefreshJobRecord,
} from '@/lib/thinkforge/production-contract-refresh/job-store';

const NOW = new Date('2026-09-01T10:00:00.000Z');
const DOCUMENT_HASH = 'a'.repeat(64);

const input: ProductionContractRefreshJobInput = {
  userId: 'user_1',
  orgId: 'org_1',
  sessionId: 'session_1',
  scriptId: 'default',
  baseVersion: 2,
  documentHash: DOCUMENT_HASH,
};

function record(overrides: Partial<ProductionContractRefreshJobRecord> = {}): ProductionContractRefreshJobRecord {
  const dedupeKey = createProductionContractRefreshJobDedupeKey(input);
  return {
    _id: 'contractrefresh_1',
    id: 'contractrefresh_1',
    version: 1,
    dedupeKey,
    activeDedupeKey: dedupeKey,
    userId: input.userId,
    orgId: input.orgId,
    sessionId: input.sessionId,
    scriptId: input.scriptId,
    baseVersion: input.baseVersion,
    input: structuredClone(input),
    status: 'queued',
    stage: 'treatment',
    dispatchCount: 0,
    stageFailureCount: 0,
    maxStageFailures: 3,
    leaseExpiresAt: null,
    queueMessageId: null,
    treatmentCheckpoint: null,
    treatmentCheckpointHash: null,
    commitReceipt: null,
    billing: { status: 'pending', updatedAt: NOW, reason: null },
    error: null,
    createdAt: NOW,
    updatedAt: NOW,
    expiresAt: new Date(NOW.getTime() + PRODUCTION_CONTRACT_REFRESH_JOB_TTL_MS),
    ...overrides,
  };
}

function collectionMock() {
  return {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    insertOne: vi.fn(),
    updateOne: vi.fn(),
    find: vi.fn(),
  } as unknown as Collection<ProductionContractRefreshJobRecord>;
}

function successfulUpdate() {
  return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0, upsertedId: null };
}

describe('ProductionContractRefreshJobStore', () => {
  it('creates one immutable version-bound TTL job', async () => {
    const collection = collectionMock();
    vi.mocked(collection.findOne).mockResolvedValue(null);
    vi.mocked(collection.insertOne).mockResolvedValue({ acknowledged: true, insertedId: 'contractrefresh_1' });
    const store = new ProductionContractRefreshJobStore(async () => collection);

    const created = await store.createOrGet(input, NOW);
    const inserted = vi.mocked(collection.insertOne).mock.calls[0][0];

    expect(created.created).toBe(true);
    expect(inserted.input).toEqual(input);
    expect(inserted.billing.status).toBe('pending');
    expect(inserted.expiresAt).toEqual(new Date(NOW.getTime() + PRODUCTION_CONTRACT_REFRESH_JOB_TTL_MS));
    expect(PRODUCTION_CONTRACT_REFRESH_JOB_INDEXES).toContainEqual(expect.objectContaining({
      key: { activeDedupeKey: 1 },
      unique: true,
    }));
  });

  it('does not claim work until the charge is durably recorded', async () => {
    const collection = collectionMock();
    vi.mocked(collection.findOneAndUpdate).mockResolvedValue(null);
    vi.mocked(collection.findOne).mockResolvedValue(record());
    const store = new ProductionContractRefreshJobStore(async () => collection);

    await expect(store.claim('contractrefresh_1', NOW)).resolves.toEqual({
      kind: 'skipped',
      reason: 'billing_pending',
    });
  });

  it('claims charged work with a fenced lease', async () => {
    const collection = collectionMock();
    vi.mocked(collection.findOneAndUpdate).mockImplementation(async (_filter, update) => {
      const set = (update as { $set: { leaseToken: string; leaseExpiresAt: Date } }).$set;
      return record({
        status: 'running',
        billing: { status: 'charged', updatedAt: NOW, reason: null },
        dispatchCount: 1,
        leaseToken: set.leaseToken,
        leaseExpiresAt: set.leaseExpiresAt,
      });
    });
    const store = new ProductionContractRefreshJobStore(async () => collection);

    const claim = await store.claim('contractrefresh_1', NOW);
    expect(claim.kind).toBe('claimed');
    if (claim.kind !== 'claimed') throw new Error('Expected a claimed job.');
    expect(claim.job.dispatchCount).toBe(1);
    expect(claim.job).not.toHaveProperty('leaseToken');
  });

  it('dead-letters the third same-stage failure and requests a refund', async () => {
    const collection = collectionMock();
    vi.mocked(collection.findOne).mockResolvedValue(record({
      status: 'running',
      stage: 'sidecar',
      stageFailureCount: 2,
      leaseToken: 'lease_1',
      billing: { status: 'charged', updatedAt: NOW, reason: null },
    }));
    vi.mocked(collection.updateOne).mockResolvedValue(successfulUpdate());
    const store = new ProductionContractRefreshJobStore(async () => collection);

    await expect(store.retryOrDeadLetter(
      'contractrefresh_1',
      'lease_1',
      new Error('provider unavailable'),
      true,
      NOW,
    )).resolves.toBe('dead_letter');

    expect(collection.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ stageFailureCount: 2 }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'dead_letter',
          'billing.status': 'refund_pending',
        }),
      }),
    );
  });

  it('cannot complete without durable treatment and commit checkpoints', async () => {
    const collection = collectionMock();
    vi.mocked(collection.findOne).mockResolvedValue(record({
      status: 'running',
      leaseToken: 'lease_1',
      billing: { status: 'charged', updatedAt: NOW, reason: null },
    }));
    const store = new ProductionContractRefreshJobStore(async () => collection);

    await expect(store.complete('contractrefresh_1', 'lease_1', NOW))
      .rejects.toBeInstanceOf(ProductionContractRefreshJobTransitionError);
    expect(collection.updateOne).not.toHaveBeenCalled();
  });

  it('rejects a commit whose version or content differs from the queued document', async () => {
    const collection = collectionMock();
    vi.mocked(collection.findOne).mockResolvedValue(record({
      status: 'running',
      stage: 'sidecar',
      leaseToken: 'lease_1',
      billing: { status: 'charged', updatedAt: NOW, reason: null },
      treatmentCheckpoint: {} as never,
      treatmentCheckpointHash: 'b'.repeat(64),
    }));
    const store = new ProductionContractRefreshJobStore(async () => collection);

    await expect(store.saveCommitReceipt('contractrefresh_1', 'lease_1', {
      documentVersion: 3,
      contentHash: 'c'.repeat(64),
      committedAt: NOW.toISOString(),
    }, NOW)).rejects.toThrow(/changed the canonical visible document/i);
    expect(collection.updateOne).not.toHaveBeenCalled();
  });

  it('yields treatment work into a separately dispatchable sidecar stage', async () => {
    const collection = collectionMock();
    vi.mocked(collection.findOne).mockResolvedValue(record({
      status: 'running',
      stage: 'sidecar',
      leaseToken: 'lease_1',
      billing: { status: 'charged', updatedAt: NOW, reason: null },
      treatmentCheckpoint: {} as never,
      treatmentCheckpointHash: 'b'.repeat(64),
    }));
    vi.mocked(collection.updateOne).mockResolvedValue(successfulUpdate());
    const store = new ProductionContractRefreshJobStore(async () => collection);

    await store.yieldLease('contractrefresh_1', 'lease_1', NOW);

    expect(collection.updateOne).toHaveBeenCalledWith(
      { _id: 'contractrefresh_1', status: 'running', leaseToken: 'lease_1' },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'queued', stage: 'sidecar' }),
        $unset: { leaseToken: '' },
      }),
    );
  });
});
