import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  claimEventForConsumer,
  markEventConsumed,
  releaseEventClaim,
  type BrandEvent,
} from '@/lib/shared/brand-events';

const mocks = vi.hoisted(() => {
  const collection = vi.fn();
  const findOne = vi.fn();
  const findOneAndUpdate = vi.fn();
  const getDatabase = vi.fn();
  const updateOne = vi.fn();
  return { collection, findOne, findOneAndUpdate, getDatabase, updateOne };
});

vi.mock('@/lib/editron/db/mongodb', () => ({
  getDatabase: mocks.getDatabase,
}));

vi.mock('@upstash/qstash', () => ({
  Client: vi.fn(),
}));

const CONSUMER = 'brand-learning-worker';
const NOW = new Date('2026-06-09T00:00:00.000Z');
const LEASE_EXPIRES_AT = new Date('2026-06-09T00:01:00.000Z');

function brandEvent(overrides: Partial<BrandEvent> = {}): BrandEvent {
  return {
    eventId: 'event_1',
    userId: 'user_1',
    service: 'editron',
    type: 'brand_updated',
    payload: {},
    consumedBy: [],
    createdAt: NOW,
    ...overrides,
  };
}

describe('brand event claims', () => {
  beforeEach(() => {
    mocks.collection.mockReset();
    mocks.findOne.mockReset();
    mocks.findOneAndUpdate.mockReset();
    mocks.getDatabase.mockReset();
    mocks.updateOne.mockReset();

    mocks.collection.mockReturnValue({
      findOne: mocks.findOne,
      findOneAndUpdate: mocks.findOneAndUpdate,
      updateOne: mocks.updateOne,
    });
    mocks.getDatabase.mockResolvedValue({ collection: mocks.collection });
  });

  it('atomically claims an unconsumed event with an expired or absent lease', async () => {
    const event = brandEvent({ processingLeases: { [CONSUMER]: LEASE_EXPIRES_AT } });
    mocks.findOneAndUpdate.mockResolvedValue(event);

    const result = await claimEventForConsumer('event_1', CONSUMER, {
      now: NOW,
      leaseMs: 60_000,
    });

    expect(result).toEqual({ status: 'claimed', event });
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      {
        eventId: 'event_1',
        consumedBy: { $ne: CONSUMER },
        $or: [
          { [`processingLeases.${CONSUMER}`]: { $exists: false } },
          { [`processingLeases.${CONSUMER}`]: { $lte: NOW } },
        ],
      },
      { $set: { [`processingLeases.${CONSUMER}`]: LEASE_EXPIRES_AT } },
      { returnDocument: 'after' },
    );
    expect(mocks.findOne).not.toHaveBeenCalled();
  });

  it('reports already_consumed from the persisted event, not the QStash payload', async () => {
    const event = brandEvent({ consumedBy: [CONSUMER] });
    mocks.findOneAndUpdate.mockResolvedValue(null);
    mocks.findOne.mockResolvedValue(event);

    await expect(claimEventForConsumer('event_1', CONSUMER, { now: NOW })).resolves.toEqual({
      status: 'already_consumed',
      event,
    });
  });

  it('reports in_progress when another delivery holds an active lease', async () => {
    const event = brandEvent({
      processingLeases: {
        [CONSUMER]: new Date('2026-06-09T00:05:00.000Z'),
      },
    });
    mocks.findOneAndUpdate.mockResolvedValue(null);
    mocks.findOne.mockResolvedValue(event);

    await expect(claimEventForConsumer('event_1', CONSUMER, { now: NOW })).resolves.toEqual({
      status: 'in_progress',
      event,
    });
  });

  it('marks consumed and clears the active processing lease', async () => {
    await markEventConsumed('event_1', CONSUMER);

    expect(mocks.updateOne).toHaveBeenCalledWith(
      { eventId: 'event_1' },
      {
        $addToSet: { consumedBy: CONSUMER },
        $unset: { [`processingLeases.${CONSUMER}`]: '' },
      },
    );
  });

  it('releases a claim without marking the event consumed', async () => {
    await releaseEventClaim('event_1', CONSUMER);

    expect(mocks.updateOne).toHaveBeenCalledWith(
      { eventId: 'event_1' },
      { $unset: { [`processingLeases.${CONSUMER}`]: '' } },
    );
  });

  it('rejects unsafe consumer ids before building Mongo paths', async () => {
    await expect(claimEventForConsumer('event_1', 'bad.consumer', { now: NOW })).rejects.toThrow(
      'Invalid brand event consumer id',
    );
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
