import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claimDataBankEntriesForVectorDeletion: vi.fn(),
  completeDataBankVectorDeletion: vi.fn(),
  failDataBankVectorDeletion: vi.fn(),
  vectorDelete: vi.fn(),
}));

vi.mock('@upstash/vector', () => ({
  Index: class {
    delete = mocks.vectorDelete;
  },
}));

vi.mock('@/lib/thinkforge/services/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/thinkforge/services/db')>();
  return {
    ...actual,
    claimDataBankEntriesForVectorDeletion: mocks.claimDataBankEntriesForVectorDeletion,
    completeDataBankVectorDeletion: mocks.completeDataBankVectorDeletion,
    failDataBankVectorDeletion: mocks.failDataBankVectorDeletion,
  };
});

import {
  buildClaimableDataBankVectorDeletionQuery,
  buildDataBankVectorDeletionLeaseFilter,
  buildDataBankVectorDeletionTombstoneUpdate,
  shouldPurgeDataBankVectorTombstone,
  type DataBankEntry,
} from '@/lib/thinkforge/services/db';
import {
  processPendingVectorDeletions,
} from '@/lib/thinkforge/services/embedding-service';

function tombstone(overrides: Partial<DataBankEntry> = {}): DataBankEntry {
  return {
    _id: 'entry_1',
    userId: 'user_1',
    ownerType: 'user',
    classification: 'business_confidential',
    consentStatus: 'not_required',
    lifecycleStatus: 'superseded',
    type: 'atomic_fact',
    scope: 'project',
    memoryScope: 'project',
    provenanceStatus: 'verified',
    title: 'Deleted DataBank entry',
    content: {},
    tags: [],
    vectorId: 'legacy_vector_1',
    vectorDeletionStatus: 'processing',
    vectorDeletionAttempts: 2,
    vectorDeletionRequestedAt: new Date('2026-08-16T00:00:00.000Z'),
    vectorDeletionLeaseId: 'delete_lease_1',
    vectorDeletionLeaseExpiresAt: new Date('2026-08-16T00:15:00.000Z'),
    createdAt: new Date('2026-08-15T00:00:00.000Z'),
    updatedAt: new Date('2026-08-16T00:10:00.000Z'),
    ...overrides,
  };
}

describe('DataBank vector deletion outbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.UPSTASH_VECTOR_REST_URL = 'https://vector.example.test';
    process.env.UPSTASH_VECTOR_REST_TOKEN = 'test-token';
    mocks.vectorDelete.mockResolvedValue({ deleted: 1 });
    mocks.completeDataBankVectorDeletion.mockResolvedValue('deleted');
    mocks.failDataBankVectorDeletion.mockResolvedValue(true);
    mocks.claimDataBankEntriesForVectorDeletion.mockResolvedValue([tombstone()]);
  });

  it('scrubs user content immediately and delays external cleanup for in-flight workers', () => {
    const now = new Date('2026-08-16T12:00:00.000Z');
    const update = buildDataBankVectorDeletionTombstoneUpdate(now);

    expect(update.$set).toMatchObject({
      lifecycleStatus: 'superseded',
      title: 'Deleted DataBank entry',
      content: {},
      tags: [],
      vectorDeletionStatus: 'pending',
      vectorDeletionAttempts: 0,
      vectorDeletionRequestedAt: now,
      vectorDeletionNextRetryAt: new Date('2026-08-16T12:10:00.000Z'),
    });
    expect(update.$unset).toMatchObject({
      sessionId: '',
      projectId: '',
      brandId: '',
      sourceUrl: '',
      sourceEntryId: '',
      embedding: '',
    });
  });

  it('claims pending, failed, stale-processing, and due verification records only', () => {
    const now = new Date('2026-08-16T12:00:00.000Z');
    const query = buildClaimableDataBankVectorDeletionQuery(now);

    expect(query.lifecycleStatus).toEqual({ $in: ['superseded', 'expired'] });
    expect(JSON.stringify(query)).toContain('vectorDeletionNextRetryAt');
    expect(JSON.stringify(query)).toContain('vectorDeletionLeaseExpiresAt');
    expect(JSON.stringify(query)).toContain('deleted');
  });

  it('fences completion to the exact deletion lease', () => {
    expect(buildDataBankVectorDeletionLeaseFilter(' entry_1 ', ' delete_lease_1 ')).toEqual({
      _id: 'entry_1',
      lifecycleStatus: { $in: ['superseded', 'expired'] },
      vectorDeletionStatus: 'processing',
      vectorDeletionLeaseId: 'delete_lease_1',
    });
  });

  it('re-verifies for 24 hours before allowing tombstone purge', () => {
    const requestedAt = new Date('2026-08-16T12:00:00.000Z');
    expect(shouldPurgeDataBankVectorTombstone(
      requestedAt,
      new Date('2026-08-17T11:59:59.999Z'),
    )).toBe(false);
    expect(shouldPurgeDataBankVectorTombstone(
      requestedAt,
      new Date('2026-08-17T12:00:00.000Z'),
    )).toBe(true);
  });

  it('deletes every lease-specific vector plus explicit legacy IDs before completing', async () => {
    await expect(processPendingVectorDeletions(25)).resolves.toEqual({
      processed: 1,
      deleted: 1,
      purged: 0,
      stale: 0,
      failed: 0,
    });

    expect(mocks.claimDataBankEntriesForVectorDeletion).toHaveBeenCalledWith(25);
    expect(mocks.vectorDelete).toHaveBeenNthCalledWith(1, { prefix: 'tfdb:entry_1:' });
    expect(mocks.vectorDelete).toHaveBeenNthCalledWith(2, ['entry_1', 'legacy_vector_1']);
    expect(mocks.completeDataBankVectorDeletion).toHaveBeenCalledWith(
      'entry_1',
      'delete_lease_1',
    );
  });

  it('reports a purged tombstone distinctly', async () => {
    mocks.completeDataBankVectorDeletion.mockResolvedValue('purged');

    await expect(processPendingVectorDeletions(10)).resolves.toMatchObject({
      processed: 1,
      deleted: 0,
      purged: 1,
      failed: 0,
    });
  });

  it('records provider failure against the deletion lease for durable retry', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.vectorDelete.mockRejectedValueOnce(new Error('upstash unavailable'));

    await expect(processPendingVectorDeletions(10)).resolves.toMatchObject({
      processed: 1,
      failed: 1,
      deleted: 0,
      purged: 0,
    });
    expect(mocks.failDataBankVectorDeletion).toHaveBeenCalledWith(
      'entry_1',
      'delete_lease_1',
      2,
    );
    errorSpy.mockRestore();
  });
});
