import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => {
  const updateOne = vi.fn();
  const countDocuments = vi.fn();
  const aggregate = vi.fn();
  const collection = vi.fn(() => ({ updateOne, countDocuments, aggregate }));
  return { collection, updateOne, countDocuments, aggregate };
});

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { TREND_REQUESTS: 'trend_requests' },
  getDatabase: vi.fn(async () => ({ collection: dbMocks.collection })),
}));

import { recordTrendRequest, getDemandCount, getDemandCounts } from '@/lib/trends/demand';

beforeEach(() => {
  dbMocks.collection.mockClear();
  dbMocks.updateOne.mockReset().mockResolvedValue({ upsertedCount: 1 });
  dbMocks.countDocuments.mockReset().mockResolvedValue(0);
  dbMocks.aggregate.mockReset().mockReturnValue({ toArray: async () => [] });
});

describe('recordTrendRequest', () => {
  it('upserts one (trendKey,userId) row idempotently', async () => {
    await recordTrendRequest('sound1', 'user_1');

    expect(dbMocks.collection).toHaveBeenCalledWith('trend_requests');
    const [filter, update, options] = dbMocks.updateOne.mock.calls[0];
    expect(filter).toEqual({ trendKey: 'sound1', userId: 'user_1' });
    expect(update.$setOnInsert).toEqual({ firstRequestedAt: expect.any(Date) });
    expect(update.$set).toEqual({ lastRequestedAt: expect.any(Date) });
    expect(options).toEqual({ upsert: true });
    // trendKey/userId must NOT be in $setOnInsert (would conflict with the filter equality)
    expect(update.$setOnInsert.trendKey).toBeUndefined();
  });
});

describe('getDemandCount', () => {
  it('returns the distinct-user count for a trend', async () => {
    dbMocks.countDocuments.mockResolvedValue(42);
    expect(await getDemandCount('sound1')).toBe(42);
    expect(dbMocks.countDocuments).toHaveBeenCalledWith({ trendKey: 'sound1' });
  });
});

describe('getDemandCounts', () => {
  it('batches counts into a map; absent trends mean zero requests', async () => {
    dbMocks.aggregate.mockReturnValue({
      toArray: async () => [
        { _id: 'k1', count: 5 },
        { _id: 'k2', count: 120 },
      ],
    });

    const counts = await getDemandCounts(['k1', 'k2', 'k3']);

    expect(counts.get('k1')).toBe(5);
    expect(counts.get('k2')).toBe(120);
    expect(counts.has('k3')).toBe(false);

    const [pipeline] = dbMocks.aggregate.mock.calls[0];
    expect(pipeline[0]).toEqual({ $match: { trendKey: { $in: ['k1', 'k2', 'k3'] } } });
    expect(pipeline[1]).toEqual({ $group: { _id: '$trendKey', count: { $sum: 1 } } });
  });

  it('short-circuits on an empty key list without querying', async () => {
    const counts = await getDemandCounts([]);
    expect(counts.size).toBe(0);
    expect(dbMocks.aggregate).not.toHaveBeenCalled();
  });
});
