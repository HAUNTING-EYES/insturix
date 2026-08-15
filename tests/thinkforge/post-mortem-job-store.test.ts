import type { Collection } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import type { PostMortemPreparedPlan } from '@/lib/thinkforge/post-mortem/post-mortem-contract';
import {
  PostMortemJobCheckpointConflictError,
  PostMortemJobLeaseLostError,
  PostMortemJobResultConflictError,
  PostMortemJobResultMissingError,
  PostMortemJobStore,
  THINKFORGE_POST_MORTEM_JOB_INDEXES,
  THINKFORGE_POST_MORTEM_JOB_TTL_MS,
  createPostMortemJobDedupeKey,
  type PostMortemJobInput,
  type PostMortemJobRecord,
} from '@/lib/thinkforge/post-mortem/post-mortem-job-store';

const NOW = new Date('2026-08-16T10:00:00.000Z');
const input: PostMortemJobInput = {
  userId: 'user_1',
  orgId: 'org_1',
  sessionId: 'session_1',
  brandId: 'brand_1',
  deleteSessionOnCompletion: false,
};

function record(overrides: Partial<PostMortemJobRecord> = {}): PostMortemJobRecord {
  return {
    _id: 'postmortem_123',
    id: 'postmortem_123',
    version: 1,
    dedupeKey: createPostMortemJobDedupeKey(input),
    activeDedupeKey: createPostMortemJobDedupeKey(input),
    userId: input.userId,
    orgId: input.orgId ?? null,
    input: structuredClone(input),
    status: 'queued',
    attemptCount: 0,
    maxAttempts: 3,
    leaseExpiresAt: null,
    queueMessageId: null,
    checkpoint: null,
    checkpointHash: null,
    result: null,
    resultHash: null,
    error: null,
    createdAt: NOW,
    updatedAt: NOW,
    expiresAt: new Date(NOW.getTime() + THINKFORGE_POST_MORTEM_JOB_TTL_MS),
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
  } as unknown as Collection<PostMortemJobRecord>;
}

describe('PostMortemJobStore', () => {
  it('uses real BSON dates and a TTL index when creating a durable job', async () => {
    const collection = collectionMock();
    vi.mocked(collection.findOne).mockResolvedValue(null);
    vi.mocked(collection.insertOne).mockResolvedValue({ acknowledged: true, insertedId: 'postmortem_123' });
    const store = new PostMortemJobStore(async () => collection);

    const created = await store.createOrGet(input, NOW);
    const inserted = vi.mocked(collection.insertOne).mock.calls[0][0];

    expect(created.created).toBe(true);
    expect(inserted.createdAt).toBeInstanceOf(Date);
    expect(inserted.expiresAt).toEqual(new Date(NOW.getTime() + THINKFORGE_POST_MORTEM_JOB_TTL_MS));
    expect(THINKFORGE_POST_MORTEM_JOB_INDEXES).toContainEqual(expect.objectContaining({
      key: { expiresAt: 1 },
      expireAfterSeconds: 0,
    }));
  });

  it('deduplicates by actor and session while upgrading a pending deletion request', async () => {
    const collection = collectionMock();
    const existing = record();
    vi.mocked(collection.findOne).mockResolvedValue(existing);
    vi.mocked(collection.findOneAndUpdate).mockResolvedValue(record({
      input: { ...input, deleteSessionOnCompletion: true },
    }));
    const store = new PostMortemJobStore(async () => collection);

    const result = await store.createOrGet({ ...input, deleteSessionOnCompletion: true }, NOW);

    expect(result.created).toBe(false);
    expect(result.job.input.deleteSessionOnCompletion).toBe(true);
    expect(collection.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ activeDedupeKey: createPostMortemJobDedupeKey(input) }),
      expect.objectContaining({ $set: expect.objectContaining({ 'input.deleteSessionOnCompletion': true }) }),
      { returnDocument: 'after' },
    );
  });

  it('claims with a fenced lease token and rejects a stale heartbeat', async () => {
    const collection = collectionMock();
    vi.mocked(collection.findOneAndUpdate).mockImplementation(async (_filter, update) => {
      const set = (update as { $set: { leaseToken: string; leaseExpiresAt: Date } }).$set;
      return record({ status: 'running', attemptCount: 1, leaseToken: set.leaseToken, leaseExpiresAt: set.leaseExpiresAt });
    });
    vi.mocked(collection.updateOne).mockResolvedValueOnce({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0, upsertedId: null });
    const store = new PostMortemJobStore(async () => collection);

    const claim = await store.claim('postmortem_123', NOW);
    expect(claim.kind).toBe('claimed');
    if (claim.kind !== 'claimed') throw new Error('Expected a claimed job.');
    expect(claim.leaseToken).toBeTruthy();
    expect(claim.job).not.toHaveProperty('leaseToken');
    await expect(store.heartbeat('postmortem_123', 'stale-token', NOW)).rejects.toBeInstanceOf(PostMortemJobLeaseLostError);
  });

  it('accepts an identical checkpoint replay and rejects checkpoint drift', async () => {
    const checkpoint: PostMortemPreparedPlan = {
      version: 1,
      userId: 'user_1',
      orgId: 'org_1',
      sessionId: 'session_1',
      projectId: null,
      brandId: 'brand_1',
      projectTitle: null,
      qualityScore: null,
      userPublished: false,
      sourceEvidenceFingerprint: 'a'.repeat(64),
      sourceEventIds: [],
      sourceEntryIds: [],
      output: null,
    };
    const collection = collectionMock();
    vi.mocked(collection.updateOne)
      .mockResolvedValueOnce({ acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0, upsertedId: null })
      .mockResolvedValue({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0, upsertedId: null });
    const store = new PostMortemJobStore(async () => collection);

    await store.saveCheckpoint('postmortem_123', 'lease_1', checkpoint, NOW);
    const checkpointHash = (vi.mocked(collection.updateOne).mock.calls[0][1] as {
      $set: { checkpointHash: string };
    }).$set.checkpointHash;
    vi.mocked(collection.findOne).mockResolvedValueOnce(record({
      status: 'running',
      leaseToken: 'lease_1',
      checkpoint: structuredClone(checkpoint),
      checkpointHash,
    }));
    await expect(store.saveCheckpoint('postmortem_123', 'lease_1', {
      ...checkpoint,
      sourceEventIds: [...checkpoint.sourceEventIds],
    }, NOW)).resolves.toBeUndefined();

    vi.mocked(collection.findOne).mockResolvedValueOnce(record({
      status: 'running',
      leaseToken: 'lease_1',
      checkpoint: structuredClone(checkpoint),
      checkpointHash: 'different-hash',
    }));
    await expect(store.saveCheckpoint('postmortem_123', 'lease_1', checkpoint, NOW))
      .rejects.toBeInstanceOf(PostMortemJobCheckpointConflictError);

    vi.mocked(collection.findOne).mockResolvedValueOnce(null);
    await expect(store.saveCheckpoint('postmortem_123', 'lease_1', checkpoint, NOW))
      .rejects.toBeInstanceOf(PostMortemJobLeaseLostError);
  });

  it('does not dead-letter a final attempt while its lease is still active', async () => {
    const collection = collectionMock();
    vi.mocked(collection.findOneAndUpdate).mockResolvedValue(null);
    vi.mocked(collection.findOne).mockResolvedValue(record({
      status: 'running',
      attemptCount: 3,
      leaseToken: 'lease_1',
      leaseExpiresAt: new Date(NOW.getTime() + 30_000),
    }));
    const store = new PostMortemJobStore(async () => collection);

    await expect(store.claim('postmortem_123', NOW)).resolves.toEqual({
      kind: 'skipped',
      reason: 'lease_held',
    });
    expect(collection.updateOne).not.toHaveBeenCalled();
  });

  it('releases the active dedupe key only after terminal completion', async () => {
    const collection = collectionMock();
    vi.mocked(collection.updateOne).mockResolvedValue({ acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0, upsertedId: null });
    const store = new PostMortemJobStore(async () => collection);

    await store.saveResult('postmortem_123', 'lease_1', {
      summaryEntryId: 'summary_1',
      lessonsExtracted: 1,
      eventsDeleted: 2,
      entriesDeleted: 3,
    }, NOW);
    await store.complete('postmortem_123', 'lease_1', NOW);

    expect(collection.updateOne).toHaveBeenLastCalledWith(
      { _id: 'postmortem_123', status: 'running', leaseToken: 'lease_1', resultHash: { $ne: null } },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'completed' }),
        $unset: { activeDedupeKey: '', leaseToken: '' },
      }),
    );
  });

  it('accepts an identical committed-result replay and rejects result drift', async () => {
    const result = { summaryEntryId: 'summary_1', lessonsExtracted: 1, eventsDeleted: 2, entriesDeleted: 3 };
    const collection = collectionMock();
    vi.mocked(collection.updateOne)
      .mockResolvedValueOnce({ acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0, upsertedId: null })
      .mockResolvedValue({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0, upsertedId: null });
    const store = new PostMortemJobStore(async () => collection);

    await store.saveResult('postmortem_123', 'lease_1', result, NOW);
    const resultHash = (vi.mocked(collection.updateOne).mock.calls[0][1] as {
      $set: { resultHash: string };
    }).$set.resultHash;
    vi.mocked(collection.findOne).mockResolvedValueOnce(record({
      status: 'running', leaseToken: 'lease_1', result, resultHash,
    }));
    await expect(store.saveResult('postmortem_123', 'lease_1', { ...result }, NOW)).resolves.toBeUndefined();

    vi.mocked(collection.findOne).mockResolvedValueOnce(record({
      status: 'running', leaseToken: 'lease_1', result, resultHash: 'different-hash',
    }));
    await expect(store.saveResult('postmortem_123', 'lease_1', result, NOW))
      .rejects.toBeInstanceOf(PostMortemJobResultConflictError);
  });

  it('refuses to complete before the committed result is durable', async () => {
    const collection = collectionMock();
    vi.mocked(collection.updateOne).mockResolvedValue({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0, upsertedId: null });
    vi.mocked(collection.findOne).mockResolvedValue(record({ status: 'running', leaseToken: 'lease_1' }));
    const store = new PostMortemJobStore(async () => collection);

    await expect(store.complete('postmortem_123', 'lease_1', NOW))
      .rejects.toBeInstanceOf(PostMortemJobResultMissingError);
  });

  it('dead-letters the final fenced attempt instead of silently requeueing forever', async () => {
    const collection = collectionMock();
    vi.mocked(collection.findOne).mockResolvedValue(record({
      status: 'running',
      attemptCount: 3,
      leaseToken: 'lease_1',
    }));
    vi.mocked(collection.updateOne).mockResolvedValue({ acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0, upsertedId: null });
    const store = new PostMortemJobStore(async () => collection);

    const status = await store.retryOrDeadLetter('postmortem_123', 'lease_1', new Error('vector unavailable'), NOW);

    expect(status).toBe('dead_letter');
    expect(collection.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ leaseToken: 'lease_1', attemptCount: 3 }),
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'dead_letter', error: expect.objectContaining({ retryable: false }) }),
        $unset: { activeDedupeKey: '', leaseToken: '' },
      }),
    );
  });
});
