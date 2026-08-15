import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claimDataBankEntriesForEmbedding: vi.fn(),
  claimDataBankEntryForEmbedding: vi.fn(),
  completeDataBankEmbedding: vi.fn(),
  failDataBankEmbedding: vi.fn(),
  vectorDelete: vi.fn(),
  vectorQuery: vi.fn(),
  vectorUpsert: vi.fn(),
}));

vi.mock('@upstash/vector', () => ({
  Index: class {
    delete = mocks.vectorDelete;
    query = mocks.vectorQuery;
    upsert = mocks.vectorUpsert;
  },
}));

vi.mock('@/lib/thinkforge/services/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/thinkforge/services/db')>();
  return {
    ...actual,
    claimDataBankEntriesForEmbedding: mocks.claimDataBankEntriesForEmbedding,
    claimDataBankEntryForEmbedding: mocks.claimDataBankEntryForEmbedding,
    completeDataBankEmbedding: mocks.completeDataBankEmbedding,
    failDataBankEmbedding: mocks.failDataBankEmbedding,
  };
});

import {
  buildClaimableDataBankEmbeddingQuery,
  buildDataBankEmbeddingLeaseFilter,
  type DataBankEntry,
} from '@/lib/thinkforge/services/db';
import {
  buildDataBankEmbeddingVectorId,
  DataBankEmbeddingAuthorityError,
  embedDataBankEntry,
  queryRelevantFacts,
} from '@/lib/thinkforge/services/embedding-service';

function claimedEntry(overrides: Partial<DataBankEntry> = {}): DataBankEntry {
  return {
    _id: 'entry_1',
    userId: 'user_1',
    ownerType: 'user',
    classification: 'business_confidential',
    consentStatus: 'not_required',
    lifecycleStatus: 'active',
    sessionId: 'session_1',
    projectId: 'session_1',
    type: 'atomic_fact',
    scope: 'project',
    memoryScope: 'project',
    provenanceStatus: 'verified',
    title: 'Verified fact',
    content: { claim: 'Use verified evidence.' },
    embeddingStatus: 'processing',
    embeddingAttempts: 1,
    embeddingLeaseId: 'lease_1',
    embeddingLeaseExpiresAt: new Date('2026-08-16T12:05:00.000Z'),
    createdAt: new Date('2026-08-16T00:00:00.000Z'),
    updatedAt: new Date('2026-08-16T12:00:00.000Z'),
    ...overrides,
  };
}

describe('DataBank embedding fencing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.UPSTASH_VECTOR_REST_URL = 'https://vector.example.test';
    process.env.UPSTASH_VECTOR_REST_TOKEN = 'test-token';
    mocks.vectorDelete.mockResolvedValue({ deleted: 1 });
    mocks.vectorUpsert.mockResolvedValue('Success');
    mocks.completeDataBankEmbedding.mockResolvedValue(true);
    mocks.failDataBankEmbedding.mockResolvedValue(true);
  });

  it('admits only current, governed records into the embedding claim query', () => {
    const now = new Date('2026-08-16T12:00:00.000Z');
    const query = buildClaimableDataBankEmbeddingQuery(now, 3);

    expect(query.$and).toEqual(expect.arrayContaining([
      { lifecycleStatus: 'active' },
      { classification: { $in: ['public', 'business_confidential', 'personal'] } },
      { consentStatus: { $in: ['not_required', 'granted'] } },
    ]));
    expect(JSON.stringify(query)).toContain('embeddingLeaseExpiresAt');
    expect(() => buildClaimableDataBankEmbeddingQuery(new Date('invalid'), 3)).toThrow(
      'DataBank read time must be valid.',
    );
  });

  it('builds an exact active-lease completion predicate', () => {
    expect(buildDataBankEmbeddingLeaseFilter(' entry_1 ', ' lease_1 ')).toEqual({
      _id: 'entry_1',
      provenanceStatus: 'verified',
      lifecycleStatus: 'active',
      embeddingStatus: 'processing',
      embeddingLeaseId: 'lease_1',
    });
  });

  it('replaces the old vector and commits only the claimed lease', async () => {
    mocks.claimDataBankEntryForEmbedding.mockResolvedValue(claimedEntry({ vectorId: 'entry_1' }));

    await expect(embedDataBankEntry(claimedEntry({
      embeddingLeaseId: undefined,
      embeddingStatus: 'pending',
    }))).resolves.toBe(true);

    const vectorId = 'tfdb:entry_1:lease_1';
    expect(mocks.vectorDelete).toHaveBeenCalledWith('entry_1');
    expect(mocks.vectorUpsert).toHaveBeenCalledWith(expect.objectContaining({
      id: vectorId,
      metadata: expect.objectContaining({ entryId: 'entry_1', metadataVersion: 3 }),
    }));
    expect(mocks.completeDataBankEmbedding).toHaveBeenCalledWith(
      'entry_1',
      vectorId,
      'lease_1',
    );
    expect(mocks.vectorDelete.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.vectorUpsert.mock.invocationCallOrder[0],
    );
  });

  it('deletes only the stale attempt vector when lease completion loses its CAS', async () => {
    mocks.claimDataBankEntryForEmbedding.mockResolvedValue(claimedEntry());
    mocks.completeDataBankEmbedding.mockResolvedValue(false);

    await expect(embedDataBankEntry(claimedEntry({
      embeddingLeaseId: undefined,
      embeddingStatus: 'pending',
    }))).resolves.toBe(false);

    expect(mocks.vectorDelete).toHaveBeenCalledWith('tfdb:entry_1:lease_1');
    expect(mocks.failDataBankEmbedding).not.toHaveBeenCalled();
  });

  it('fails before provider I/O when a claimed record has no lease', async () => {
    mocks.claimDataBankEntryForEmbedding.mockResolvedValue(claimedEntry({ embeddingLeaseId: undefined }));

    await expect(embedDataBankEntry(claimedEntry({
      embeddingLeaseId: undefined,
      embeddingStatus: 'pending',
    }))).rejects.toBeInstanceOf(DataBankEmbeddingAuthorityError);
    expect(mocks.vectorUpsert).not.toHaveBeenCalled();
  });

  it('records provider failure against only the claimed lease', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.claimDataBankEntryForEmbedding.mockResolvedValue(claimedEntry());
    mocks.vectorUpsert.mockRejectedValue(new Error('upstash unavailable'));

    await expect(embedDataBankEntry(claimedEntry({
      embeddingLeaseId: undefined,
      embeddingStatus: 'pending',
    }))).rejects.toThrow('upstash unavailable');
    expect(mocks.failDataBankEmbedding).toHaveBeenCalledWith('entry_1', 1, 'lease_1');
    errorSpy.mockRestore();
  });

  it('maps attempt-specific vector IDs back to canonical Mongo entry IDs', async () => {
    mocks.vectorQuery.mockResolvedValue([{
      id: buildDataBankEmbeddingVectorId('entry_1', 'lease_1'),
      score: 0.91,
      metadata: { entryId: 'entry_1' },
    }]);

    await expect(queryRelevantFacts(
      { userId: 'user_1' },
      'verified evidence',
      5,
      'project',
    )).resolves.toEqual([{
      id: 'entry_1',
      score: 0.91,
      metadata: { entryId: 'entry_1' },
    }]);
  });
});
