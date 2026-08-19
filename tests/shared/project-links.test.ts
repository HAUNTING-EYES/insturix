import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROJECT_LINKS_COLLECTION,
  addProjectToLinkBySessionId,
  createProjectLink,
  detachThinkForgeSessionFromLinks,
} from '@/lib/shared/project-links';

const dbMocks = vi.hoisted(() => {
  const insertOne = vi.fn();
  const updateOne = vi.fn();
  const updateMany = vi.fn();
  const collection = vi.fn();
  return { collection, insertOne, updateOne, updateMany };
});

vi.mock('@/lib/editron/db/mongodb', () => ({
  getDatabase: vi.fn(async () => ({
    collection: dbMocks.collection,
  })),
}));

vi.mock('nanoid', () => ({
  nanoid: () => 'fixed_link_id',
}));

describe('project-links', () => {
  beforeEach(() => {
    dbMocks.insertOne.mockReset();
    dbMocks.updateOne.mockReset();
    dbMocks.updateMany.mockReset();
    dbMocks.collection.mockReset();
    dbMocks.collection.mockReturnValue({
      insertOne: dbMocks.insertOne,
      updateOne: dbMocks.updateOne,
      updateMany: dbMocks.updateMany,
    });
  });

  it('seeds projectIds when creating a project link for a script-stage project', async () => {
    dbMocks.insertOne.mockResolvedValue({ acknowledged: true });

    const link = await createProjectLink('user_1', {
      sessionId: 'tf_session_1',
      projectId: 'editron_project_1',
      brandId: 'brand_1',
    });

    expect(dbMocks.collection).toHaveBeenCalledWith(PROJECT_LINKS_COLLECTION);
    expect(link).toMatchObject({
      universalId: 'plink_fixed_link_id',
      userId: 'user_1',
      sessionId: 'tf_session_1',
      brandId: 'brand_1',
      projectIds: ['editron_project_1'],
    });
    expect(dbMocks.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        projectIds: ['editron_project_1'],
      }),
    );
  });

  it('adds a project to an existing session link idempotently', async () => {
    dbMocks.updateOne.mockResolvedValue({ matchedCount: 1 });

    const linked = await addProjectToLinkBySessionId(
      'user_1',
      'tf_session_1',
      'editron_project_1',
    );

    expect(linked).toBe(true);
    expect(dbMocks.updateOne).toHaveBeenCalledWith(
      { userId: 'user_1', sessionId: 'tf_session_1' },
      {
        $addToSet: { projectIds: 'editron_project_1' },
        $set: { updatedAt: expect.any(Date) },
      },
    );
  });

  it('detaches deleted ThinkForge lineage without deleting downstream asset IDs', async () => {
    dbMocks.updateMany
      .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 })
      .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 })
      .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });

    await expect(detachThinkForgeSessionFromLinks(' user_1 ', ' tf_session_1 ')).resolves.toEqual({
      topLevelLinksModified: 1,
      thumbnailCollectionsModified: 1,
      lastThumbnailLinksModified: 1,
    });

    expect(dbMocks.updateMany).toHaveBeenNthCalledWith(
      1,
      { userId: 'user_1', sessionId: 'tf_session_1' },
      {
        $unset: { sessionId: '', sourceScriptId: '' },
        $set: { updatedAt: expect.any(Date) },
      },
    );
    expect(dbMocks.updateMany).toHaveBeenNthCalledWith(
      2,
      {
        userId: 'user_1',
        'metadata.clickatron.committedThumbnails.sourceSessionId': 'tf_session_1',
      },
      expect.objectContaining({
        $unset: {
          'metadata.clickatron.committedThumbnails.$[thumbnail].sourceSessionId': '',
          'metadata.clickatron.committedThumbnails.$[thumbnail].sourceScriptId': '',
        },
      }),
      { arrayFilters: [{ 'thumbnail.sourceSessionId': 'tf_session_1' }] },
    );
    expect(dbMocks.updateMany).toHaveBeenNthCalledWith(
      3,
      {
        userId: 'user_1',
        'metadata.clickatron.lastCommittedThumbnail.sourceSessionId': 'tf_session_1',
      },
      expect.objectContaining({
        $unset: {
          'metadata.clickatron.lastCommittedThumbnail.sourceSessionId': '',
          'metadata.clickatron.lastCommittedThumbnail.sourceScriptId': '',
        },
      }),
    );

    const serializedWrites = JSON.stringify(dbMocks.updateMany.mock.calls);
    expect(serializedWrites).not.toContain('projectIds');
    expect(serializedWrites).not.toContain('storyboardIds');
    expect(serializedWrites).not.toContain('videoIds');
  });

  it('rejects broad project-link detachment without exact actor and session IDs', async () => {
    await expect(detachThinkForgeSessionFromLinks(' ', 'tf_session_1'))
      .rejects.toThrow('exact user and session identifiers');
    await expect(detachThinkForgeSessionFromLinks('user_1', ' '))
      .rejects.toThrow('exact user and session identifiers');
    expect(dbMocks.updateMany).not.toHaveBeenCalled();
  });
});
