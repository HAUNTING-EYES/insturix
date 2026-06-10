import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEventsByScope } from '@/lib/shared/brand-events';

const mocks = vi.hoisted(() => {
  const collection = vi.fn();
  const find = vi.fn();
  const getDatabase = vi.fn();
  const limit = vi.fn();
  const sort = vi.fn();
  const toArray = vi.fn();
  return { collection, find, getDatabase, limit, sort, toArray };
});

vi.mock('@/lib/editron/db/mongodb', () => ({
  getDatabase: mocks.getDatabase,
}));

vi.mock('@upstash/qstash', () => ({
  Client: vi.fn(),
}));

const NOW = new Date('2026-06-09T00:00:00.000Z');

describe('brand event scoped queries', () => {
  beforeEach(() => {
    mocks.collection.mockReset();
    mocks.find.mockReset();
    mocks.getDatabase.mockReset();
    mocks.limit.mockReset();
    mocks.sort.mockReset();
    mocks.toArray.mockReset();

    mocks.toArray.mockResolvedValue([]);
    mocks.limit.mockReturnValue({ toArray: mocks.toArray });
    mocks.sort.mockReturnValue({ limit: mocks.limit });
    mocks.find.mockReturnValue({ sort: mocks.sort });
    mocks.collection.mockReturnValue({ find: mocks.find });
    mocks.getDatabase.mockResolvedValue({ collection: mocks.collection });
  });

  it('uses project and session scope instead of widening to brand scope', async () => {
    await getEventsByScope('user_1', {
      projectId: 'project_1',
      sessionId: 'session_1',
      brandId: 'brand_1',
      since: NOW,
      limit: 50,
    });

    const filter = mocks.find.mock.calls[0][0] as Record<string, unknown>;

    expect(filter).toMatchObject({
      userId: 'user_1',
      createdAt: { $gte: NOW },
    });
    expect(filter.$or).toEqual(expect.arrayContaining([
      { projectId: 'project_1' },
      { 'payload.projectId': 'project_1' },
      { 'payload.editronProjectId': 'project_1' },
      { 'payload.sourceContext.projectId': 'project_1' },
      { 'payload.sessionId': 'session_1' },
      { 'payload.sourceSessionId': 'session_1' },
      { 'payload.sourceContext.sessionId': 'session_1' },
      { 'payload.sourceContext.sourceSessionId': 'session_1' },
    ]));
    expect(filter.$or).not.toContainEqual({ brandId: 'brand_1' });
    expect(mocks.limit).toHaveBeenCalledWith(50);
  });

  it('falls back to brand scope only when project and session scope are absent', async () => {
    await getEventsByScope('user_1', {
      brandId: 'brand_1',
      type: 'thumbnail_created',
      service: 'clickatron',
    });

    const filter = mocks.find.mock.calls[0][0] as Record<string, unknown>;

    expect(filter).toMatchObject({
      userId: 'user_1',
      type: 'thumbnail_created',
      service: 'clickatron',
    });
    expect(filter.$or).toEqual([
      { brandId: 'brand_1' },
      { 'payload.brandId': 'brand_1' },
      { 'payload.sourceContext.brandId': 'brand_1' },
    ]);
  });

  it('does not query user-wide events when no scope identifier exists', async () => {
    await expect(getEventsByScope('user_1', { since: NOW })).resolves.toEqual([]);

    expect(mocks.getDatabase).not.toHaveBeenCalled();
    expect(mocks.find).not.toHaveBeenCalled();
  });
});
