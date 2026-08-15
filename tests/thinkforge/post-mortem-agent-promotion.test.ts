import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataBankEntry } from '@/lib/thinkforge/services/db';
import {
  commitPostMortemPlan,
  preparePostMortemPlan,
  runPostMortemAgent,
} from '@/lib/thinkforge/agents/post-mortem-agent';

const mocks = vi.hoisted(() => {
  const putGovernedDataBankEntry = vi.fn();
  const createModelByTier = vi.fn();
  const deleteInteractionEventsByIds = vi.fn();
  const deleteProjectScopedEntries = vi.fn();
  const embedDataBankEntry = vi.fn();
  const generateObject = vi.fn();
  const getEventsByScope = vi.fn();
  const getProjectScopedEntries = vi.fn();
  const getRecentInteractionEvents = vi.fn();
  const getSession = vi.fn();
  const generateContentHash = vi.fn((value: unknown) => {
    const text = JSON.stringify(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) {
      hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0').repeat(8);
  });
  return {
    putGovernedDataBankEntry,
    createModelByTier,
    deleteInteractionEventsByIds,
    deleteProjectScopedEntries,
    embedDataBankEntry,
    generateObject,
    getEventsByScope,
    getProjectScopedEntries,
    getRecentInteractionEvents,
    getSession,
    generateContentHash,
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
  putGovernedDataBankEntry: mocks.putGovernedDataBankEntry,
  deleteInteractionEventsByIds: mocks.deleteInteractionEventsByIds,
  deleteProjectScopedEntries: mocks.deleteProjectScopedEntries,
  getProjectScopedEntries: mocks.getProjectScopedEntries,
  getRecentInteractionEvents: mocks.getRecentInteractionEvents,
  getSession: mocks.getSession,
  generateContentHash: mocks.generateContentHash,
}));

vi.mock('@/lib/thinkforge/services/embedding-service', () => ({
  embedDataBankEntry: mocks.embedDataBankEntry,
}));

const NOW = new Date('2026-06-09T00:00:00.000Z');

describe('post-mortem memory promotion', () => {
  beforeEach(() => {
    mocks.putGovernedDataBankEntry.mockReset();
    mocks.createModelByTier.mockReset();
    mocks.deleteInteractionEventsByIds.mockReset();
    mocks.deleteProjectScopedEntries.mockReset();
    mocks.embedDataBankEntry.mockReset();
    mocks.generateObject.mockReset();
    mocks.getEventsByScope.mockReset();
    mocks.getProjectScopedEntries.mockReset();
    mocks.getRecentInteractionEvents.mockReset();
    mocks.getSession.mockReset();

    mocks.createModelByTier.mockReturnValue('model');
    mocks.deleteInteractionEventsByIds.mockResolvedValue(3);
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
    mocks.putGovernedDataBankEntry.mockImplementation(
      async (_principal: unknown, sessionId: string, _operationKey: string, entry: Partial<DataBankEntry>) => ({
        _id: `entry_${mocks.putGovernedDataBankEntry.mock.calls.length}`,
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
    const lastWriteOrder = mocks.putGovernedDataBankEntry.mock.invocationCallOrder.at(-1);
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
      { userId: 'user_1', orgId: 'org_1' },
      ['source_entry_1'],
    );
    expect(mocks.deleteInteractionEventsByIds).toHaveBeenCalledWith(
      'tf_session_1',
      { userId: 'user_1', orgId: 'org_1' },
      ['event_1'],
    );
    const summaryOperationKey = mocks.putGovernedDataBankEntry.mock.calls[0][2] as string;
    const lessonOperationKey = mocks.putGovernedDataBankEntry.mock.calls[1][2] as string;
    expect(summaryOperationKey).toMatch(
      /^thinkforge:post-mortem:v1:tf_session_1:[a-f0-9]{64}:summary$/,
    );
    expect(lessonOperationKey).toBe(summaryOperationKey.replace(/:summary$/, ':lesson:0'));
    expect(mocks.embedDataBankEntry).toHaveBeenCalledWith(
      expect.any(Object),
      { alreadyClaimed: true },
    );

    expect(mocks.putGovernedDataBankEntry.mock.calls[0][0]).toEqual({ userId: 'user_1', orgId: 'org_1' });
    const summary = mocks.putGovernedDataBankEntry.mock.calls[0][3] as Partial<DataBankEntry>;
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

    const lesson = mocks.putGovernedDataBankEntry.mock.calls[1][3] as Partial<DataBankEntry>;
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

    const lesson = mocks.putGovernedDataBankEntry.mock.calls[1][3] as Partial<DataBankEntry>;
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

    const lesson = mocks.putGovernedDataBankEntry.mock.calls[1][3] as Partial<DataBankEntry>;
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

  it('reuses retry slots for identical evidence and advances them for new evidence', async () => {
    const input = {
      userId: 'user_1',
      sessionId: 'tf_session_1',
      projectId: 'editron_project_1',
      brandId: 'brand_1',
    };
    await runPostMortemAgent(input);
    const firstSummaryKey = mocks.putGovernedDataBankEntry.mock.calls[0][2] as string;

    await runPostMortemAgent(input);
    const retrySummaryKey = mocks.putGovernedDataBankEntry.mock.calls[2][2] as string;
    expect(retrySummaryKey).toBe(firstSummaryKey);

    mocks.getRecentInteractionEvents.mockResolvedValue([{
      _id: 'event_2',
      projectId: 'tf_session_1',
      userId: 'user_1',
      type: 'feedback_given',
      payload: { feedback: 'Use a more direct opening.' },
      createdAt: NOW,
    }]);
    await runPostMortemAgent(input);
    const newEvidenceSummaryKey = mocks.putGovernedDataBankEntry.mock.calls[4][2] as string;
    expect(newEvidenceSummaryKey).not.toBe(firstSummaryKey);
  });

  it('can checkpoint preparation and retry commit without another model call', async () => {
    const plan = await preparePostMortemPlan({
      userId: 'user_1',
      orgId: 'org_1',
      sessionId: 'tf_session_1',
      projectId: 'editron_project_1',
      brandId: 'brand_1',
    });
    expect(mocks.generateObject).toHaveBeenCalledTimes(1);

    await commitPostMortemPlan(plan);
    await commitPostMortemPlan(plan);

    expect(mocks.generateObject).toHaveBeenCalledTimes(1);
    expect(mocks.putGovernedDataBankEntry.mock.calls[2][2]).toBe(
      mocks.putGovernedDataBankEntry.mock.calls[0][2],
    );
    expect(mocks.putGovernedDataBankEntry.mock.calls[3][2]).toBe(
      mocks.putGovernedDataBankEntry.mock.calls[1][2],
    );
  });

  it('rejects a checkpoint after the session brand authority changes', async () => {
    const plan = await preparePostMortemPlan({
      userId: 'user_1',
      orgId: 'org_1',
      sessionId: 'tf_session_1',
      brandId: 'brand_1',
    });
    mocks.getSession.mockResolvedValue({
      _id: 'tf_session_1',
      userId: 'user_1',
      orgId: 'org_1',
      projectMeta: { brandId: 'brand_2' },
    });

    await expect(commitPostMortemPlan(plan)).rejects.toThrow(
      'Post-mortem prepared plan no longer matches the session authority.',
    );
    expect(mocks.putGovernedDataBankEntry).not.toHaveBeenCalled();
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

    expect(mocks.deleteInteractionEventsByIds).not.toHaveBeenCalled();
    expect(mocks.deleteProjectScopedEntries).not.toHaveBeenCalled();
  });
});
