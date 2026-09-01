import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadProject: vi.fn(),
  applyAutoEditAssemblyV1: vi.fn(),
  deleteOverlay: vi.fn(),
  addOverlayAtRevisionV1: vi.fn(),
  updateProject: vi.fn(),
}));

vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: mocks,
}));

vi.mock('@/lib/editron/services/media', () => ({
  getTranscription: vi.fn(),
}));

import { executeAutoEdit, type AutoEditPlan } from '@/lib/editron/services/auto-edit-service';

const PLAN: AutoEditPlan = {
  cuts: [
    {
      scriptSection: 'Opening line',
      sourceStartFrame: 0,
      sourceEndFrame: 60,
      score: 0.95,
      fillerCount: 0,
      silenceCount: 0,
    },
    {
      scriptSection: 'Proof point',
      sourceStartFrame: 120,
      sourceEndFrame: 210,
      score: 0.91,
      fillerCount: 0,
      silenceCount: 0,
    },
  ],
  totalDuration: 150,
  coveragePercent: 100,
  warnings: [],
};

describe('auto-edit atomic assembly caller', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it('submits one caller-bound assembly and never performs legacy partial writes', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_750_000_000_000);
    mocks.loadProject.mockResolvedValue({
      projectId: 'proj_auto',
      userId: 'user_auto',
      fps: 30,
      durationInFrames: 300,
      projectRevision: 7,
      updatedAt: new Date('2026-08-11T03:00:00.000Z'),
      overlays: [{
        id: 42,
        type: 'video',
        assetId: 'asset_raw',
        from: 0,
        durationInFrames: 300,
        videoStartTime: 0,
      }],
    } as any);
    mocks.applyAutoEditAssemblyV1.mockResolvedValue({
      clipIds: [1_750_000_000_000_000, 1_750_000_000_000_001],
      clipsCreated: 2,
      totalDurationInFrames: 150,
      mutationReceipt: {},
      timelineChangeReceipt: {},
    } as any);
    const result = await executeAutoEdit('proj_auto', 'user_auto', '42', PLAN);

    expect(result).toEqual({
      message: 'Auto-edit complete: created 2 clips from script, total 5s',
      clipsCreated: 2,
      totalDurationFrames: 150,
    });
    expect(mocks.applyAutoEditAssemblyV1).toHaveBeenCalledTimes(1);
    expect(mocks.applyAutoEditAssemblyV1).toHaveBeenCalledWith(
      'user_auto',
      'proj_auto',
      {
        expectedRevision: {
          schemaVersion: 1,
          value: 7,
          compatibilityUpdatedAt: '2026-08-11T03:00:00.000Z',
        },
        actorKind: 'SYSTEM',
        sourceOverlayId: 42,
        cuts: [
          {
            clipId: 1_750_000_000_000_000,
            sourceStartFrame: 0,
            sourceEndFrame: 60,
          },
          {
            clipId: 1_750_000_000_000_001,
            sourceStartFrame: 120,
            sourceEndFrame: 210,
          },
        ],
      },
    );
    expect(mocks.deleteOverlay).not.toHaveBeenCalled();
    expect(mocks.addOverlayAtRevisionV1).not.toHaveBeenCalled();
    expect(mocks.updateProject).not.toHaveBeenCalled();
  });

  it('rejects an ambiguous numeric and legacy string identity before mutation', async () => {
    mocks.loadProject.mockResolvedValue({
      projectId: 'proj_auto',
      userId: 'user_auto',
      fps: 30,
      durationInFrames: 300,
      projectRevision: 7,
      updatedAt: new Date('2026-08-11T03:00:00.000Z'),
      overlays: [
        { id: 42, type: 'video', from: 0, durationInFrames: 300 },
        { id: '42', type: 'video', from: 0, durationInFrames: 300 },
      ],
    } as any);
    await expect(
      executeAutoEdit('proj_auto', 'user_auto', '42', PLAN),
    ).rejects.toThrow('ambiguous across legacy identities');
    expect(mocks.applyAutoEditAssemblyV1).not.toHaveBeenCalled();
  });
});
