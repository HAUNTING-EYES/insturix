import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataBankEntry } from '@/lib/thinkforge/services/db';
import { runPostMortemAgent } from '@/lib/thinkforge/agents/post-mortem-agent';

const mocks = vi.hoisted(() => {
  const addDataBankEntry = vi.fn();
  const createModelByTier = vi.fn();
  const deleteEventsBySession = vi.fn();
  const deleteProjectScopedEntries = vi.fn();
  const embedDataBankEntry = vi.fn();
  const generateObject = vi.fn();
  const getEventsByScope = vi.fn();
  const getProjectScopedEntries = vi.fn();
  const getRecentInteractionEvents = vi.fn();
  return {
    addDataBankEntry,
    createModelByTier,
    deleteEventsBySession,
    deleteProjectScopedEntries,
    embedDataBankEntry,
    generateObject,
    getEventsByScope,
    getProjectScopedEntries,
    getRecentInteractionEvents,
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
  addDataBankEntry: mocks.addDataBankEntry,
  deleteEventsBySession: mocks.deleteEventsBySession,
  deleteProjectScopedEntries: mocks.deleteProjectScopedEntries,
  getProjectScopedEntries: mocks.getProjectScopedEntries,
  getRecentInteractionEvents: mocks.getRecentInteractionEvents,
}));

vi.mock('@/lib/thinkforge/services/embedding-service', () => ({
  embedDataBankEntry: mocks.embedDataBankEntry,
}));

const NOW = new Date('2026-06-09T00:00:00.000Z');

describe('post-mortem memory promotion', () => {
  beforeEach(() => {
    mocks.addDataBankEntry.mockReset();
    mocks.createModelByTier.mockReset();
    mocks.deleteEventsBySession.mockReset();
    mocks.deleteProjectScopedEntries.mockReset();
    mocks.embedDataBankEntry.mockReset();
    mocks.generateObject.mockReset();
    mocks.getEventsByScope.mockReset();
    mocks.getProjectScopedEntries.mockReset();
    mocks.getRecentInteractionEvents.mockReset();

    mocks.createModelByTier.mockReturnValue('model');
    mocks.deleteEventsBySession.mockResolvedValue(3);
    mocks.deleteProjectScopedEntries.mockResolvedValue(2);
    mocks.embedDataBankEntry.mockResolvedValue(undefined);
    mocks.getEventsByScope.mockResolvedValue([]);
    mocks.getProjectScopedEntries.mockResolvedValue([]);
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
    mocks.addDataBankEntry.mockImplementation(
      async (sessionId: string, userId: string, entry: Partial<DataBankEntry>) => ({
        _id: `entry_${mocks.addDataBankEntry.mock.calls.length}`,
        sessionId,
        userId,
        createdAt: NOW,
        updatedAt: NOW,
        ...entry,
      }),
    );
  });

  it('keeps the summary project-scoped and promotes high-quality branded lessons', async () => {
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
    expect(mocks.deleteProjectScopedEntries.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.addDataBankEntry.mock.invocationCallOrder[0],
    );

    const summary = mocks.addDataBankEntry.mock.calls[0][2] as Partial<DataBankEntry>;
    expect(summary).toMatchObject({
      type: 'research',
      projectId: 'editron_project_1',
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

    const lesson = mocks.addDataBankEntry.mock.calls[1][2] as Partial<DataBankEntry>;
    expect(lesson).toMatchObject({
      type: 'brand_insight',
      projectId: 'editron_project_1',
      scope: 'global',
      content: {
        memoryScope: 'brand',
        promotionReason: 'quality_brand_outcome',
        projectId: 'editron_project_1',
        brandId: 'brand_1',
        qualityScore: 88,
        userPublished: false,
      },
    });
    expect(lesson.tags).toEqual(expect.arrayContaining([
      'memory:brand',
      'promotion:quality_brand_outcome',
      'voice_preference',
      'project:editron_project_1',
      'brand:brand_1',
    ]));
  });

  it('keeps low-quality branded lessons project-scoped', async () => {
    await runPostMortemAgent({
      userId: 'user_1',
      sessionId: 'tf_session_1',
      projectId: 'editron_project_1',
      brandId: 'brand_1',
      qualityScore: 62,
    });

    const lesson = mocks.addDataBankEntry.mock.calls[1][2] as Partial<DataBankEntry>;
    expect(lesson).toMatchObject({
      scope: 'project',
      content: {
        memoryScope: 'project',
        promotionReason: 'brand_without_quality_gate',
        qualityScore: 62,
      },
    });
    expect(lesson.tags).toEqual(expect.arrayContaining([
      'memory:project',
      'promotion:brand_without_quality_gate',
      'brand:brand_1',
    ]));
  });

  it('keeps unbranded lessons project-scoped even when the quality score is high', async () => {
    await runPostMortemAgent({
      userId: 'user_1',
      sessionId: 'tf_session_1',
      projectId: 'editron_project_1',
      qualityScore: 94,
    });

    const lesson = mocks.addDataBankEntry.mock.calls[1][2] as Partial<DataBankEntry>;
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
});
