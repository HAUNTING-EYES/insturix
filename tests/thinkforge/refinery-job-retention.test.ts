import { describe, expect, it, vi } from 'vitest';
import {
  THINKFORGE_REFINERY_JOB_INDEXES,
  THINKFORGE_REFINERY_JOB_TTL_MS,
  buildThinkForgeRefineryJobExpiry,
  ensureThinkForgeRefineryJobRetention,
  hashThinkForgeRefineryCheckpoint,
  serializeThinkForgeRefineryJobExpiry,
  verifyThinkForgeRefineryCheckpoint,
} from '@/lib/thinkforge/refinery/refinery-job';
import type { RefineryPreparedPlan } from '@/lib/thinkforge/agents/refinery-agent';

function checkpointFixture() {
  const checkpoint: RefineryPreparedPlan = {
    version: 1,
    operationKey: 'thinkforge:refinery:job_1',
    userId: 'user_1',
    orgId: 'org_1',
    sessionId: 'session_1',
    urls: ['https://example.com/research'],
    sources: [],
    errors: [],
  };
  return {
    checkpoint,
    job: {
      idempotencyKey: checkpoint.operationKey,
      userId: checkpoint.userId,
      orgId: checkpoint.orgId,
      sessionId: checkpoint.sessionId,
      urls: checkpoint.urls,
      checkpoint,
      checkpointHash: hashThinkForgeRefineryCheckpoint(checkpoint),
    },
  };
}

describe('ThinkForge refinery job retention', () => {
  it('stores a BSON expiry and serializes it only at the API boundary', () => {
    const now = new Date('2026-08-19T12:00:00.000Z');
    const expiresAt = buildThinkForgeRefineryJobExpiry(now);

    expect(expiresAt).toBeInstanceOf(Date);
    expect(expiresAt).toEqual(new Date(now.getTime() + THINKFORGE_REFINERY_JOB_TTL_MS));
    expect(serializeThinkForgeRefineryJobExpiry(expiresAt)).toBe(expiresAt.toISOString());
  });

  it('rejects invalid expiry dates instead of creating immortal jobs', () => {
    expect(() => buildThinkForgeRefineryJobExpiry(new Date(Number.NaN)))
      .toThrow('valid date');
    expect(() => serializeThinkForgeRefineryJobExpiry(new Date(Number.NaN)))
      .toThrow('invalid BSON expiry date');
  });

  it('migrates legacy expiry values before ensuring the TTL index', async () => {
    const collection = {
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 3 }),
      createIndexes: vi.fn().mockResolvedValue(['thinkforge_refinery_job_ttl']),
    };

    await ensureThinkForgeRefineryJobRetention(collection);

    expect(collection.updateMany).toHaveBeenCalledWith(
      {
        $or: [
          { expiresAt: { $type: 'string' } },
          { expiresAt: { $exists: false } },
          { expiresAt: null },
        ],
      },
      [{
        $set: {
          expiresAt: {
            $cond: [
              { $eq: [{ $type: '$expiresAt' }, 'string'] },
              { $convert: { input: '$expiresAt', to: 'date' } },
              {
                $dateAdd: {
                  startDate: { $convert: { input: '$createdAt', to: 'date' } },
                  unit: 'millisecond',
                  amount: THINKFORGE_REFINERY_JOB_TTL_MS,
                },
              },
            ],
          },
        },
      }],
    );
    expect(THINKFORGE_REFINERY_JOB_INDEXES).toContainEqual(expect.objectContaining({
      key: { expiresAt: 1 },
      name: 'thinkforge_refinery_job_ttl',
      expireAfterSeconds: 0,
    }));
    expect(collection.createIndexes).toHaveBeenCalledWith(THINKFORGE_REFINERY_JOB_INDEXES);
    expect(collection.updateMany.mock.invocationCallOrder[0])
      .toBeLessThan(collection.createIndexes.mock.invocationCallOrder[0]);
  });

  it('does not claim indexes are ready after migration failure', async () => {
    const collection = {
      updateMany: vi.fn().mockRejectedValue(new Error('invalid legacy expiry')),
      createIndexes: vi.fn(),
    };

    await expect(ensureThinkForgeRefineryJobRetention(collection))
      .rejects.toThrow('invalid legacy expiry');
    expect(collection.createIndexes).not.toHaveBeenCalled();
  });

  it('accepts only an untampered checkpoint bound to the durable job authority', () => {
    const { checkpoint, job } = checkpointFixture();

    expect(hashThinkForgeRefineryCheckpoint(checkpoint))
      .toBe(hashThinkForgeRefineryCheckpoint(structuredClone(checkpoint)));
    expect(verifyThinkForgeRefineryCheckpoint(job)).toEqual(checkpoint);
    expect(() => verifyThinkForgeRefineryCheckpoint({
      ...job,
      checkpointHash: '0'.repeat(64),
    })).toThrow('hash mismatch');
    expect(() => verifyThinkForgeRefineryCheckpoint({
      ...job,
      checkpoint: { ...checkpoint, operationKey: 'thinkforge:refinery:other' },
    })).toThrow('durable job authority');
  });

  it('rejects incomplete or unsupported checkpoint evidence', () => {
    const { checkpoint, job } = checkpointFixture();

    expect(() => verifyThinkForgeRefineryCheckpoint({ ...job, checkpointHash: null }))
      .toThrow('incomplete checkpoint evidence');
    expect(() => verifyThinkForgeRefineryCheckpoint({ ...job, checkpoint: null }))
      .toThrow('incomplete checkpoint evidence');
    expect(() => hashThinkForgeRefineryCheckpoint({ ...checkpoint, version: 2 }))
      .toThrow('Unsupported refinery prepared-plan version');
  });
});
