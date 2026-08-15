import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataBankEntry } from '@/lib/thinkforge/services/db';
import { runPostMortemAgent } from '@/lib/thinkforge/agents/post-mortem-agent';

const mocks = vi.hoisted(() => {
  const addGovernedDataBankEntry = vi.fn();
  const createModelByTier = vi.fn();
  const deleteEventsBySession = vi.fn();
  const deleteProjectScopedEntries = vi.fn();
  const embedDataBankEntry = vi.fn();
  const generateObject = vi.fn();
  const getEventsByScope = vi.fn();
  const getProjectScopedEntries = vi.fn();
  const getRecentInteractionEvents = vi.fn();
  const getSession = vi.fn();
  return {
    addGovernedDataBankEntry,
    createModelByTier,
    deleteEventsBySession,
    deleteProjectScopedEntries,
    embedDataBankEntry,
    generateObject,
    getEventsByScope,
    getProjectScopedEntries,
    getRecentInteractionEvents,
    getSession,
  };
});

vi.mock('ai', () => ({
  generateObject: mocks.generateObject,
}));

vi.mock('@/lib/thinkforge/agents/model-factory', () => ({
  createModelByTier: mocks.createModelByTier,
  ModelTier: { Structural: 'structural' },
}));

vi.mock('@/lib/shared/brand-events', () => ({
  getEventsByScope: mocks.getEventsByScope,
}));

vi.mock('@/lib/thinkforge/services/db', () => ({
  addGovernedDataBankEntry: mocks.addGovernedDataBankEntry,
  deleteEventsBySession: mocks.deleteEventsBySession,
  deleteProjectScopedEntries: mocks.deleteProjectScopedEntries,
  getProjectScopedEntries: mocks.getProjectScopedEntries,
  getRecentInteractionEvents: mocks.getRecentInteractionEvents,
  getSession: mocks.getSession,
}));

vi.mock('@/lib/thinkforge/services/embedding-service', () => ({
  embedDataBankEntry: mocks.embedDataBankEntry,
}));

const NOW = new Date('2026-06-09T00:00:00.000Z');

describe('post-mortem memory promotion', () => {
  beforeEach(() => {
    mocks.addGovernedDataBankEntry.mockReset();
    mocks.createModelByTier.mockReset();
    mocks.deleteEventsBySession.mockReset();
    mocks.deleteProjectScopedEntries.mockReset();
    mocks.embedDataBankEntry.mockReset();
    mocks.generateObject.mockReset();
    mocks.getEventsByScope.mockReset();
    mocks.getProjectScopedEntries.mockReset();
    mocks.getRecentInteractionEvents.mockReset();
    mocks.getSession.mockReset();

    mocks.createModelByTier.mockReturnValue('model');
    mocks.deleteEventsBySession.mockResolvedValue(3);
    mocks.deleteProjectScopedEntries.mockResolvedValue(2);
    mocks.embedDataBankEntry.mockResolvedValue(true);
    mocks.getSession.mockResolvedValue({
      _id: 'tf_session_1',
      userId: 'user_1',
      orgId: 'org_1',
      projectMeta: { brandId: 'brand_1' },
    });
    mocks.getEventsByScope.mockResolvedValue([]);
    mocks.getProjectScopedEntries.mockResolvedValue([{
      _id: 'source_entry_1',
      sessionId: 'tf_session_1',
      projectId: 'tf_session_1',
      userId: 'user_1',
      type: 'note',
      scope: 'project',
      memoryScope: 'project',
      title: 'Working note',
      content: { summary: 'Use a warmer opening.' },
      createdAt: NOW,
      updatedAt: NOW,
    }]);
    mocks.getRecentInteractionEvents.mockResolvedValue([
      {
        _id: 'event_1',
        sessionId: 'tf_session_1',
        userId: 'user_1',
        type: 'feedback_given',
        payload: { feedback: 'Warmer voice works better here.' },
        createdAt: NOW,
      },
    ]);
    mocks.generateObject.mockResolvedValue({
      object: {
        projectSummary: 'Launch cut focused on warmer direct response.',
        lessons: [
          {
            insight: 'Use a warmer brand voice when introducing the offer.',
            category: 'voice_preference',
          },
        ],
      },
    });
    mocks.addGovernedDataBankEntry.mockImplementation(
      async (_principal: unknown, sessionId: string, entry: Partial<DataBankEntry>) => ({
        _id: `entry_${mocks.addGovernedDataBankEntry.mock.calls.length}`,
        sessionId,
        userId: 'user_1',
        createdAt: NOW,
        updatedAt: NOW,
        ...entry,
      }),
    );
  });

  it('keeps score-derived lessons project-scoped until an owner promotes them', async () => {
    const result = await runPostMortemAgent({
      userId: 'user_1',
      sessionId: 'tf_session_1',
      projectId: 'editron_project_1',
      brandId: 'brand_1',
      projectTitle: 'Launch Cut',
      qualityScore: 88,
    });

    expect(result).toMatchObject({
      summaryEntryId: 'entry_1',
      lessonsExtracted: 1,
      eventsDeleted: 3,
      entriesDeleted: 2,
    });
    const lastWriteOrder = mocks.addGovernedDataBankEntry.mock.invocationCallOrder.at(-1);
    const lastEmbeddingOrder = mocks.embedDataBankEntry.mock.invocationCallOrder.at(-1);
    expect(lastWriteOrder).toBeDefined();
    expect(lastEmbeddingOrder).toBeDefined();
    expect(lastWriteOrder!).toBeLessThan(
      mocks.embedDataBankEntry.mock.invocationCallOrder[0],
    );
    expect(lastEmbeddingOrder!).toBeLessThan(
      mocks.deleteProjectScopedEntries.mock.invocationCallOrder[0],
    );
    expect(mocks.deleteProjectScopedEntries).toHaveBeenCalledWith(
      'tf_session_1',
      'user_1',
      ['source_entry_1'],
    );

    expect(mocks.addGovernedDataBankEntry.mock.calls[0][0]).toEqual({ userId: 'user_1', orgId: 'org_1' });
    const summary = mocks.addGovernedDataBankEntry.mock.calls[0][2] as Partial<DataBankEntry>;
    expect(summary).toMatchObject({
      type: 'research',
      projectId: 'tf_session_1',
      scope: 'project',
      content: {
        memoryScope: 'project',
        projectId: 'editron_project_1',
        brandId: 'brand_1',
      },
    });
    expect(summary.tags).toEqual(expect.arrayContaining([
      'memory:project',
      'promotion:project_summary',
      'project:editron_project_1',
      'brand:brand_1',
    ]));

    const lesson = mocks.addGovernedDataBankEntry.mock.calls[1][2] as Partial<DataBankEntry>;
    expect(lesson).toMatchObject({
      type: 'brand_insight',
      projectId: 'tf_session_1',
      scope: 'project',
      content: {
        memoryScope: 'project',
        promotionReason: 'awaiting_owner_promotion',
        projectId: 'editron_project_1',
        brandId: 'brand_1',
        qualityScore: 88,
        userPublished: false,
      },
    });
    expect(lesson.tags).toEqual(expect.arrayContaining([
      'memory:project',
      'promotion:awaiting_owner_promotion',
      'voice_preference',
      'project:editron_project_1',
      'brand:brand_1',
    ]));
  });

  it('does not invent a different promotion policy for lower scores', async () => {
    await runPostMortemAgent({
      userId: 'user_1',
      sessionId: 'tf_session_1',
      projectId: 'editron_project_1',
      brandId: 'brand_1',
      qualityScore: 62,
    });

    const lesson = mocks.addGovernedDataBankEntry.mock.calls[1][2] as Partial<DataBankEntry>;
    expect(lesson).toMatchObject({
      scope: 'project',
      content: {
        memoryScope: 'project',
        promotionReason: 'awaiting_owner_promotion',
        qualityScore: 62,
      },
    });
    expect(lesson.tags).toEqual(expect.arrayContaining([
      'memory:project',
      'promotion:awaiting_owner_promotion',
      'brand:brand_1',
    ]));
  });

  it('keeps unbranded lessons project-scoped even when the quality score is high', async () => {
    mocks.getSession.mockResolvedValue({
      _id: 'tf_session_1',
      userId: 'user_1',
      projectMeta: {},
    });

    await runPostMortemAgent({
      userId: 'user_1',
      sessionId: 'tf_session_1',
      projectId: 'editron_project_1',
      qualityScore: 94,
    });

    const lesson = mocks.addGovernedDataBankEntry.mock.calls[1][2] as Partial<DataBankEntry>;
    expect(lesson).toMatchObject({
      scope: 'project',
      content: {
        memoryScope: 'project',
        promotionReason: 'unbranded_project_only',
        brandId: undefined,
        qualityScore: 94,
      },
    });
    expect(lesson.tags).toEqual(expect.arrayContaining([
      'memory:project',
      'promotion:unbranded_project_only',
      'project:editron_project_1',
    ]));
  });

  it('preserves source evidence when replacement embedding fails', async () => {
    mocks.embedDataBankEntry.mockRejectedValueOnce(new Error('vector unavailable'));

    await expect(runPostMortemAgent({
      userId: 'user_1',
      orgId: 'org_1',
      sessionId: 'tf_session_1',
      brandId: 'brand_1',
      qualityScore: 88,
    })).rejects.toThrow('vector unavailable');

    expect(mocks.deleteEventsBySession).not.toHaveBeenCalled();
    expect(mocks.deleteProjectScopedEntries).not.toHaveBeenCalled();
  });
});
