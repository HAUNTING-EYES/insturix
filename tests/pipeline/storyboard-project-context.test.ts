import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  findOne: vi.fn(),
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  getDatabase: mocks.getDatabase,
}));

import { getStoryboardForProjectContext } from '@/lib/pipeline/storyboard-db';

describe('getStoryboardForProjectContext', () => {
  beforeEach(() => {
    mocks.getDatabase.mockResolvedValue({
      collection: vi.fn(() => ({
        findOne: mocks.findOne,
      })),
    });
    mocks.findOne.mockReset();
  });

  it('prefers the direct sourceStoryboardId when present', async () => {
    const storyboard = { storyboardId: 'sb_direct', userId: 'user_1', scenes: [] };
    mocks.findOne.mockResolvedValueOnce(storyboard);

    const result = await getStoryboardForProjectContext({
      projectId: 'proj_1',
      sourceStoryboardId: 'sb_direct',
    }, 'user_1');

    expect(result).toBe(storyboard);
    expect(mocks.findOne).toHaveBeenCalledTimes(1);
    expect(mocks.findOne).toHaveBeenCalledWith({
      storyboardId: 'sb_direct',
      userId: 'user_1',
    });
  });

  it('falls back to the reverse projectId link when sourceStoryboardId is stale', async () => {
    const storyboard = { storyboardId: 'sb_project', projectId: 'proj_1', userId: 'user_1', scenes: [] };
    mocks.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(storyboard);

    const result = await getStoryboardForProjectContext({
      projectId: 'proj_1',
      sourceStoryboardId: 'sb_stale',
    }, 'user_1');

    expect(result).toBe(storyboard);
    expect(mocks.findOne).toHaveBeenNthCalledWith(1, {
      storyboardId: 'sb_stale',
      userId: 'user_1',
    });
    expect(mocks.findOne).toHaveBeenNthCalledWith(2, {
      projectId: 'proj_1',
      userId: 'user_1',
    });
  });

  it('falls back to sourceSessionId lineage when project linkage is missing', async () => {
    const storyboard = { storyboardId: 'sb_session', sourceSessionId: 'tf_session_1', userId: 'user_1', scenes: [] };
    mocks.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(storyboard);

    const result = await getStoryboardForProjectContext({
      projectId: 'proj_1',
      sourceStoryboardId: 'sb_stale',
      sourceSessionId: 'tf_session_1',
    }, 'user_1');

    expect(result).toBe(storyboard);
    expect(mocks.findOne).toHaveBeenNthCalledWith(3, {
      userId: 'user_1',
      $or: [
        { sourceSessionId: 'tf_session_1' },
        { projectId: 'tf_session_1' },
      ],
    });
  });

  it('keeps every lookup user scoped and returns null without a direct match', async () => {
    mocks.findOne.mockResolvedValueOnce(null);

    const result = await getStoryboardForProjectContext({
      sourceStoryboardId: '   ',
      projectId: 'proj_1',
    }, 'user_2');

    expect(result).toBeNull();
    expect(mocks.findOne).toHaveBeenCalledTimes(1);
    expect(mocks.findOne).toHaveBeenCalledWith({
      projectId: 'proj_1',
      userId: 'user_2',
    });
  });

  it('does not query when both storyboard and project ids are empty', async () => {
    const result = await getStoryboardForProjectContext({
      sourceStoryboardId: ' ',
      projectId: '',
    }, 'user_1');

    expect(result).toBeNull();
    expect(mocks.findOne).not.toHaveBeenCalled();
  });
});