import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDedupeIdentity } from '@/lib/ledger/dedupe';
import type { LedgerEntry } from '@/lib/ledger/types';

const dbMocks = vi.hoisted(() => {
  const replaceOne = vi.fn();
  const findOne = vi.fn();
  const collection = vi.fn(() => ({ replaceOne, findOne }));
  return { collection, replaceOne, findOne };
});

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { LEDGER: 'ledger' },
  getDatabase: vi.fn(async () => ({ collection: dbMocks.collection })),
}));

// Imported AFTER the mock is declared so store.ts binds to the mocked module.
import { putEntry, getByReferenceId, findByDedupe } from '@/lib/ledger/store';

const YT = 'dQw4w9WgXcQ';

function baseEntry(): LedgerEntry {
  return {
    referenceId: 'ref_abc',
    owner: { userId: 'u1' },
    sourceKind: 'platform-video',
    dedupe: { platform: 'youtube', platformId: YT, normalizedUrl: 'https://youtu.be/' + YT },
    extracts: {},
    analyzedAt: '2026-07-10T00:00:00.000Z',
    schemaVersion: 1,
  };
}

const CLEAN_PROJECTION = { projection: { _id: 0, dedupeKeys: 0 } };

beforeEach(() => {
  dbMocks.collection.mockClear();
  dbMocks.replaceOne.mockReset().mockResolvedValue({ upsertedCount: 1, matchedCount: 0 });
  dbMocks.findOne.mockReset().mockResolvedValue(null);
});

describe('putEntry', () => {
  it('validates then upserts by referenceId with derived dedupeKeys', async () => {
    await putEntry(baseEntry());

    expect(dbMocks.collection).toHaveBeenCalledWith('ledger');
    expect(dbMocks.replaceOne).toHaveBeenCalledTimes(1);

    const [filter, doc, options] = dbMocks.replaceOne.mock.calls[0];
    expect(filter).toEqual({ referenceId: 'ref_abc' });
    expect(options).toEqual({ upsert: true });
    expect(doc.dedupeKeys).toEqual(['id:youtube:' + YT, 'url:https://youtu.be/' + YT]);
  });

  it('rejects an invalid entry and never writes', async () => {
    const bad = baseEntry();
    bad.dedupe = {}; // no dedupe identity → schema superRefine throws
    await expect(putEntry(bad)).rejects.toThrow();
    expect(dbMocks.replaceOne).not.toHaveBeenCalled();
  });
});

describe('getByReferenceId — owner scoping', () => {
  it('scopes by userId when no orgId', async () => {
    dbMocks.findOne.mockResolvedValue(baseEntry());
    const result = await getByReferenceId('ref_abc', { userId: 'u1' });

    const [filter, options] = dbMocks.findOne.mock.calls[0];
    expect(filter).toEqual({ referenceId: 'ref_abc', 'owner.userId': 'u1' });
    expect(options).toEqual(CLEAN_PROJECTION);
    expect(result?.referenceId).toBe('ref_abc');
  });

  it('scopes by orgId (agency-shared pool) when orgId is present', async () => {
    dbMocks.findOne.mockResolvedValue(baseEntry());
    await getByReferenceId('ref_abc', { userId: 'u1', orgId: 'o1' });

    const [filter] = dbMocks.findOne.mock.calls[0];
    expect(filter).toEqual({ referenceId: 'ref_abc', 'owner.orgId': 'o1' });
  });

  it('returns null on a miss', async () => {
    dbMocks.findOne.mockResolvedValue(null);
    expect(await getByReferenceId('nope', { userId: 'u1' })).toBeNull();
  });
});

describe('findByDedupe — the "seen before?" query', () => {
  it('matches on ANY dedupe key, scoped to the owner', async () => {
    dbMocks.findOne.mockResolvedValue(baseEntry());
    // A different URL shape for the SAME video — shares the id key with the stored entry.
    const identity = buildDedupeIdentity({ url: 'https://www.youtube.com/watch?v=' + YT + '&t=30s' });
    const result = await findByDedupe(identity, { userId: 'u1' });

    const [filter] = dbMocks.findOne.mock.calls[0];
    expect(filter).toEqual({
      'owner.userId': 'u1',
      dedupeKeys: { $in: ['id:youtube:' + YT, 'url:https://youtube.com/watch'] },
    });
    expect(result?.referenceId).toBe('ref_abc');
  });

  it('returns null WITHOUT querying when the identity has nothing to dedupe on', async () => {
    const result = await findByDedupe({}, { userId: 'u1' });
    expect(result).toBeNull();
    expect(dbMocks.findOne).not.toHaveBeenCalled();
  });

  it('returns null when nothing matches', async () => {
    dbMocks.findOne.mockResolvedValue(null);
    const result = await findByDedupe(buildDedupeIdentity({ url: 'https://youtu.be/' + YT }), { userId: 'u1' });
    expect(result).toBeNull();
  });
});
