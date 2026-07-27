/**
 * The referenceIds/briefId round-trip on project-links (§5.2.7).
 *
 * The architecture doc claimed this round-trip "is already tested against the real code and
 * passes" — it was NOT. This file is that test. It uses the repo's mocked-Mongo convention
 * (see project-links.test.ts); a smoke test against the real dev DB is the final gate before
 * user-facing, since there is no in-memory Mongo in this project.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => {
  const insertOne = vi.fn();
  const updateOne = vi.fn();
  const findOne = vi.fn();
  const collection = vi.fn();
  return { collection, insertOne, updateOne, findOne };
});

vi.mock('@/lib/editron/db/mongodb', () => ({
  getDatabase: vi.fn(async () => ({ collection: dbMocks.collection })),
}));

vi.mock('nanoid', () => ({ nanoid: () => 'fixed_link_id' }));

import {
  createProjectLink,
  addReferenceToLink,
  setBriefOnLink,
  findLinkByReferenceId,
} from '@/lib/shared/project-links';

beforeEach(() => {
  dbMocks.insertOne.mockReset().mockResolvedValue({ acknowledged: true });
  dbMocks.updateOne.mockReset().mockResolvedValue({ matchedCount: 1 });
  dbMocks.findOne.mockReset().mockResolvedValue(null);
  dbMocks.collection.mockReset().mockReturnValue({
    insertOne: dbMocks.insertOne,
    updateOne: dbMocks.updateOne,
    findOne: dbMocks.findOne,
  });
});

describe('project-links — referenceIds/briefId', () => {
  it('createProjectLink persists referenceIds + briefId as typed fields', async () => {
    const link = await createProjectLink('user_1', {
      sessionId: 'tf_1',
      briefId: 'brief_1',
      referenceIds: ['ref_1', 'ref_2'],
    });

    expect(link.referenceIds).toEqual(['ref_1', 'ref_2']);
    expect(link.briefId).toBe('brief_1');
    expect(dbMocks.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ referenceIds: ['ref_1', 'ref_2'], briefId: 'brief_1' }),
    );
  });

  it('ROUND-TRIP: referenceIds written at creation are read back by findLinkByReferenceId', async () => {
    const created = await createProjectLink('user_1', {
      briefId: 'brief_1',
      referenceIds: ['ref_1', 'ref_2'],
    });
    // The exact doc that "hit the DB" is what the DB "returns" on read.
    const persisted = dbMocks.insertOne.mock.calls[0][0];
    dbMocks.findOne.mockResolvedValue(persisted);

    const readBack = await findLinkByReferenceId('user_1', 'ref_1');

    expect(dbMocks.findOne).toHaveBeenCalledWith({ userId: 'user_1', referenceIds: 'ref_1' });
    expect(readBack?.referenceIds).toEqual(created.referenceIds);
    expect(readBack?.briefId).toBe('brief_1');
  });

  it('defaults referenceIds to [] and leaves briefId unset when omitted (existing callers unaffected)', async () => {
    const link = await createProjectLink('user_1', { projectId: 'p1' });

    expect(link.referenceIds).toEqual([]);
    expect(link.briefId).toBeUndefined();
    expect(dbMocks.insertOne).toHaveBeenCalledWith(expect.objectContaining({ referenceIds: [] }));
  });

  it('addReferenceToLink $addToSets by universalId', async () => {
    const ok = await addReferenceToLink('user_1', 'plink_x', 'ref_9');

    expect(ok).toBe(true);
    expect(dbMocks.updateOne).toHaveBeenCalledWith(
      { userId: 'user_1', universalId: 'plink_x' },
      { $addToSet: { referenceIds: 'ref_9' }, $set: { updatedAt: expect.any(Date) } },
    );
  });

  it('addReferenceToLink returns false when the link is not found', async () => {
    dbMocks.updateOne.mockResolvedValue({ matchedCount: 0 });
    expect(await addReferenceToLink('user_1', 'missing', 'ref_1')).toBe(false);
  });

  it('setBriefOnLink $sets the briefId', async () => {
    const ok = await setBriefOnLink('user_1', 'plink_x', 'brief_2');

    expect(ok).toBe(true);
    expect(dbMocks.updateOne).toHaveBeenCalledWith(
      { userId: 'user_1', universalId: 'plink_x' },
      { $set: { briefId: 'brief_2', updatedAt: expect.any(Date) } },
    );
  });

  it('findLinkByReferenceId queries by referenceIds membership scoped to the user', async () => {
    await findLinkByReferenceId('user_1', 'ref_1');
    expect(dbMocks.findOne).toHaveBeenCalledWith({ userId: 'user_1', referenceIds: 'ref_1' });
  });
});
