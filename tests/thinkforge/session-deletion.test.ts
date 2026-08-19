import { describe, expect, it, vi } from 'vitest';
import { purgeThinkForgeSessionRecords } from '@/lib/thinkforge/session-deletion/session-deletion';

const INPUT = {
  sessionId: 'session_1',
  userId: 'user_1',
  orgId: 'org_1',
  deletionJobId: 'postmortem_delete_1',
  deletionJobLeaseToken: 'lease_1',
};

function cursor(documents: unknown[]) {
  return { toArray: vi.fn().mockResolvedValue(documents) };
}

function collectionMock() {
  return {
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockReturnValue(cursor([])),
    updateMany: vi.fn().mockResolvedValue({ matchedCount: 0, modifiedCount: 0 }),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 0 }),
  };
}

function fixture() {
  const collections = {
    thinkforge_sessions: collectionMock(),
    thinkforge_scripts: collectionMock(),
    thinkforge_chat: collectionMock(),
    thinkforge_rate_usage: collectionMock(),
    thinkforge_projects: collectionMock(),
    thinkforge_artifacts: collectionMock(),
    thinkforge_versions: collectionMock(),
    thinkforge_content_blocks: collectionMock(),
    thinkforge_version_edges: collectionMock(),
    thinkforge_events: collectionMock(),
    thinkforge_databank: collectionMock(),
    thinkforge_generation_receipts: collectionMock(),
    thinkforge_observer_jobs: collectionMock(),
    thinkforge_refinery_jobs: collectionMock(),
    thinkforge_post_mortem_jobs: collectionMock(),
  };
  const database = {
    collection: vi.fn((name: keyof typeof collections) => collections[name]),
  };
  return { collections, database };
}

describe('ThinkForge transactional session deletion', () => {
  it('purges session data, scrubs jobs, and preserves only still-shared blocks', async () => {
    const { collections, database } = fixture();
    const now = new Date('2026-08-19T00:00:00.000Z');
    const mongoSession = { id: 'mongo_session_1' };
    collections.thinkforge_post_mortem_jobs.findOne.mockResolvedValue({ _id: INPUT.deletionJobId });
    collections.thinkforge_sessions.findOne.mockResolvedValue({
      _id: INPUT.sessionId,
      userId: INPUT.userId,
      orgId: INPUT.orgId,
    });
    collections.thinkforge_artifacts.find.mockReturnValue(cursor([{ _id: 'artifact_1' }]));
    collections.thinkforge_versions.find.mockImplementation((query) => (
      'artifactId' in query
        ? cursor([{ _id: 'version_1', contentBlockRefs: ['block_orphan', 'block_shared'] }])
        : cursor([{ _id: 'version_other', contentBlockRefs: ['block_shared'] }])
    ));
    collections.thinkforge_databank.updateMany
      .mockResolvedValueOnce({ matchedCount: 2, modifiedCount: 2 })
      .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    collections.thinkforge_observer_jobs.updateMany.mockImplementation((_query, update) => Promise.resolve({
      matchedCount: 1,
      modifiedCount: update?.$set?.status === 'dead_letter' ? 1 : 0,
    }));
    collections.thinkforge_refinery_jobs.updateMany.mockImplementation((_query, update) => Promise.resolve({
      matchedCount: 1,
      modifiedCount: update?.$set?.status === 'dead_letter' ? 1 : 0,
    }));
    collections.thinkforge_post_mortem_jobs.updateMany.mockImplementation((_query, update) => Promise.resolve({
      matchedCount: 1,
      modifiedCount: update?.$set?.status === 'dead_letter' ? 1 : 0,
    }));
    collections.thinkforge_events.deleteMany.mockResolvedValue({ deletedCount: 4 });
    collections.thinkforge_generation_receipts.deleteMany.mockResolvedValue({ deletedCount: 2 });
    collections.thinkforge_scripts.deleteMany.mockResolvedValue({ deletedCount: 3 });
    collections.thinkforge_chat.deleteMany.mockResolvedValue({ deletedCount: 8 });
    collections.thinkforge_artifacts.deleteMany.mockResolvedValue({ deletedCount: 1 });
    collections.thinkforge_content_blocks.deleteMany.mockResolvedValue({ deletedCount: 1 });
    collections.thinkforge_sessions.deleteOne.mockResolvedValue({ deletedCount: 1 });

    await expect(purgeThinkForgeSessionRecords(
      database as never,
      mongoSession as never,
      INPUT,
      now,
    )).resolves.toEqual({
      sessionDeleted: true,
      scriptsDeleted: 3,
      chatMessagesDeleted: 8,
      eventsDeleted: 4,
      receiptsDeleted: 2,
      projectMemoriesTombstoned: 2,
      approvedMemoriesDetached: 1,
      observerJobsCancelled: 1,
      refineryJobsCancelled: 1,
      postMortemJobsCancelled: 1,
      artifactsDeleted: 1,
      versionsDeleted: 1,
      orphanBlocksDeleted: 1,
    });

    expect(collections.thinkforge_post_mortem_jobs.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: INPUT.deletionJobId,
        leaseToken: INPUT.deletionJobLeaseToken,
        status: 'running',
        'input.sessionId': INPUT.sessionId,
        'input.deleteSessionOnCompletion': true,
      }),
      { session: mongoSession },
    );
    expect(collections.thinkforge_databank.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ scope: 'project' }),
      expect.objectContaining({
        $set: expect.objectContaining({ vectorDeletionStatus: 'pending', content: {} }),
      }),
      { session: mongoSession },
    );
    expect(collections.thinkforge_databank.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ scope: 'global' }),
      expect.objectContaining({ $unset: { sessionId: '', projectId: '' } }),
      { session: mongoSession },
    );
    expect(collections.thinkforge_observer_jobs.updateMany).toHaveBeenCalledWith(
      { 'input.sessionId': INPUT.sessionId },
      expect.objectContaining({
        $set: expect.objectContaining({ 'input.text': '', checkpoint: null, result: null }),
      }),
      { session: mongoSession },
    );
    expect(collections.thinkforge_refinery_jobs.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: INPUT.sessionId,
        'charge.status': 'charged',
        'charge.amount': { $gt: 0 },
      }),
      { $set: { 'charge.status': 'refund_pending' } },
      { session: mongoSession },
    );
    expect(collections.thinkforge_content_blocks.deleteMany).toHaveBeenCalledWith(
      { _id: { $in: ['block_orphan'] } },
      { session: mongoSession },
    );
  });

  it('rejects a missing or stale deletion-job lease before reading session data', async () => {
    const { collections, database } = fixture();

    await expect(purgeThinkForgeSessionRecords(
      database as never,
      {} as never,
      INPUT,
    )).rejects.toThrow('active durable deletion-job lease');

    expect(collections.thinkforge_sessions.findOne).not.toHaveBeenCalled();
    expect(collections.thinkforge_databank.updateMany).not.toHaveBeenCalled();
  });

  it('rejects when the durable job actor conflicts with the stored session owner', async () => {
    const { collections, database } = fixture();
    collections.thinkforge_post_mortem_jobs.findOne.mockResolvedValue({ _id: INPUT.deletionJobId });
    collections.thinkforge_sessions.findOne.mockResolvedValue({
      _id: INPUT.sessionId,
      userId: 'other_user',
      orgId: INPUT.orgId,
    });

    await expect(purgeThinkForgeSessionRecords(
      database as never,
      {} as never,
      INPUT,
    )).rejects.toThrow('authority no longer matches');

    expect(collections.thinkforge_databank.updateMany).not.toHaveBeenCalled();
    expect(collections.thinkforge_sessions.deleteOne).not.toHaveBeenCalled();
  });
});
