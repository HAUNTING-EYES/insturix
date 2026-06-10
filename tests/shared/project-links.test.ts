import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROJECT_LINKS_COLLECTION,
  addProjectToLinkBySessionId,
  createProjectLink,
} from '@/lib/shared/project-links';

const dbMocks = vi.hoisted(() => {
  const insertOne = vi.fn();
  const updateOne = vi.fn();
  const collection = vi.fn();
  return { collection, insertOne, updateOne };
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
    dbMocks.collection.mockReset();
    dbMocks.collection.mockReturnValue({
      insertOne: dbMocks.insertOne,
      updateOne: dbMocks.updateOne,
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
});
