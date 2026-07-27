import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => {
  const bulkWrite = vi.fn();
  const toArray = vi.fn();
  const limit = vi.fn(() => ({ toArray }));
  const sort = vi.fn(() => ({ limit }));
  const find = vi.fn(() => ({ sort }));
  const collection = vi.fn(() => ({ bulkWrite, find }));
  return { collection, bulkWrite, find, sort, limit, toArray };
});

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { TRENDS: 'trends' },
  getDatabase: vi.fn(async () => ({ collection: dbMocks.collection })),
}));

import { saveRankedTrends, getTopTrends } from '@/lib/trends/store';
import type { RankedTrendCandidate } from '@/lib/trends/pipeline';

function ranked(key: string, rankScore: number): RankedTrendCandidate {
  return {
    key,
    platform: 'youtube',
    trackerScore: 1,
    demandCount: 0,
    exemplars: [],
    fetchedAtMs: 0,
    source: 's',
    rankScore,
    ageDays: 0,
  };
}

beforeEach(() => {
  dbMocks.collection.mockClear();
  dbMocks.bulkWrite.mockReset().mockResolvedValue({});
  dbMocks.find.mockClear();
  dbMocks.sort.mockClear();
  dbMocks.limit.mockClear();
  dbMocks.toArray.mockReset().mockResolvedValue([]);
});

describe('saveRankedTrends', () => {
  it('upserts each trend by its platform:key', async () => {
    await saveRankedTrends([ranked('k1', 1.5), ranked('k2', 0.9)]);

    expect(dbMocks.collection).toHaveBeenCalledWith('trends');
    const ops = dbMocks.bulkWrite.mock.calls[0][0];
    expect(ops).toHaveLength(2);
    expect(ops[0].replaceOne.filter).toEqual({ trendKey: 'youtube:k1' });
    expect(ops[0].replaceOne.upsert).toBe(true);
    expect(ops[0].replaceOne.replacement.trendKey).toBe('youtube:k1');
    expect(ops[0].replaceOne.replacement.rankScore).toBe(1.5);
    expect(typeof ops[0].replaceOne.replacement.rankedAt).toBe('string');
  });

  it('no-ops on empty input', async () => {
    await saveRankedTrends([]);
    expect(dbMocks.bulkWrite).not.toHaveBeenCalled();
  });
});

describe('getTopTrends', () => {
  it('reads top trends sorted by rankScore desc', async () => {
    dbMocks.toArray.mockResolvedValue([ranked('k2', 0.9)]);
    const out = await getTopTrends(5);

    expect(dbMocks.find).toHaveBeenCalledWith({}, { projection: { _id: 0 } });
    expect(dbMocks.sort).toHaveBeenCalledWith({ rankScore: -1 });
    expect(dbMocks.limit).toHaveBeenCalledWith(5);
    expect(out).toHaveLength(1);
  });
});
