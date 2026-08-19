import { describe, expect, it, vi } from 'vitest';
import {
  THINKFORGE_INTERACTION_EVENT_RETENTION_MS,
  THINKFORGE_INTERACTION_EVENT_TTL_INDEX,
  buildInteractionEventRetentionDates,
  ensureThinkForgeInteractionEventRetention,
} from '@/lib/thinkforge/services/db';

describe('ThinkForge interaction-event retention', () => {
  it('builds copied BSON dates for the 30-day hot-tier window', () => {
    const createdAt = new Date('2026-08-19T12:00:00.000Z');
    const retention = buildInteractionEventRetentionDates(createdAt);

    expect(retention.createdAt).toEqual(createdAt);
    expect(retention.createdAt).not.toBe(createdAt);
    expect(retention.expiresAt).toEqual(new Date(
      createdAt.getTime() + THINKFORGE_INTERACTION_EVENT_RETENTION_MS,
    ));
    expect(retention.expiresAt).toBeInstanceOf(Date);
  });

  it('rejects invalid retention dates', () => {
    expect(() => buildInteractionEventRetentionDates(new Date(Number.NaN)))
      .toThrow('valid creation date');
  });

  it('backfills only learning interactions before creating the TTL index', async () => {
    const collection = {
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 5 }),
      createIndex: vi.fn().mockResolvedValue(THINKFORGE_INTERACTION_EVENT_TTL_INDEX.name),
    };

    await ensureThinkForgeInteractionEventRetention(collection);

    const filter = collection.updateMany.mock.calls[0][0];
    const update = collection.updateMany.mock.calls[0][1];
    expect(filter).toEqual({
      type: {
        $in: [
          'content_deleted',
          'hook_rejected',
          'style_corrected',
          'regeneration_requested',
          'feedback_given',
        ],
      },
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }],
    });
    expect(filter.type.$in).not.toContain('project_created');
    expect(update).toEqual([{
      $set: {
        expiresAt: {
          $dateAdd: {
            startDate: { $convert: { input: '$createdAt', to: 'date' } },
            unit: 'millisecond',
            amount: THINKFORGE_INTERACTION_EVENT_RETENTION_MS,
          },
        },
      },
    }]);
    expect(collection.createIndex).toHaveBeenCalledWith(
      THINKFORGE_INTERACTION_EVENT_TTL_INDEX.key,
      {
        name: THINKFORGE_INTERACTION_EVENT_TTL_INDEX.name,
        expireAfterSeconds: 0,
      },
    );
    expect(collection.updateMany.mock.invocationCallOrder[0])
      .toBeLessThan(collection.createIndex.mock.invocationCallOrder[0]);
  });

  it('fails before index creation when legacy backfill is invalid', async () => {
    const collection = {
      updateMany: vi.fn().mockRejectedValue(new Error('legacy createdAt is invalid')),
      createIndex: vi.fn(),
    };

    await expect(ensureThinkForgeInteractionEventRetention(collection))
      .rejects.toThrow('legacy createdAt is invalid');
    expect(collection.createIndex).not.toHaveBeenCalled();
  });
});
