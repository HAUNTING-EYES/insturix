import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  getClickatronDb: vi.fn(),
  clickatronFindLean: vi.fn(),
  clickatronUpdateOne: vi.fn(),
  alyzitronFindToArray: vi.fn(),
  alyzitronUpdateOne: vi.fn(),
  handleTaskFailure: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
  refundCredits: vi.fn(),
  getCreditCost: vi.fn(),
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { MEDIA_ASSETS: 'media_assets' },
  getDatabase: mocks.getDatabase,
}));

vi.mock('@/lib/clickatron-mongo', () => ({
  getClickatronDb: mocks.getClickatronDb,
}));

vi.mock('@/schemas/Clickatron', () => ({
  ClickatronTask: {
    find: vi.fn(() => ({ lean: mocks.clickatronFindLean })),
    updateOne: mocks.clickatronUpdateOne,
  },
}));

vi.mock('@/app/api/services/alyzitron/utils/mongodb', () => ({
  getCollections: vi.fn(async () => ({
    analyses: {
      find: vi.fn(() => ({ toArray: mocks.alyzitronFindToArray })),
      updateOne: mocks.alyzitronUpdateOne,
    },
  })),
}));

vi.mock('@/app/api/services/alyzitron/utils/logger', () => ({
  logger: {
    info: mocks.loggerInfo,
    error: mocks.loggerError,
  },
}));

vi.mock('@/lib/services/creditsService', () => ({
  CreditsService: {
    refundCredits: mocks.refundCredits,
  },
}));

vi.mock('@/lib/config/creditCosts', () => ({
  getCreditCost: mocks.getCreditCost,
}));

vi.mock('@/lib/services/tasks/handle-failure', () => ({
  handleTaskFailure: mocks.handleTaskFailure,
}));

import { GET } from '@/app/api/cron/check-task-timeouts/route';

function cursor(items: any[]) {
  return {
    toArray: vi.fn().mockResolvedValue(items),
    sort: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue(items),
    }),
  };
}

describe('Editron video timeout watchdog reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-secret';
    mocks.getClickatronDb.mockResolvedValue(undefined);
    mocks.clickatronFindLean.mockResolvedValue([]);
    mocks.alyzitronFindToArray.mockResolvedValue([]);
    mocks.getCreditCost.mockReturnValue(3);
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('reconciles storyboard video evidence instead of failing a stale video job', async () => {
    const batch = {
      _id: 'vb_stale',
      userId: 'user_1',
      storyboardId: 'sb_1',
      totalScenes: 1,
      completed: 0,
      failed: 0,
      status: 'processing',
      createdAt: new Date('2026-07-03T23:00:00.000Z'),
      updatedAt: new Date('2026-07-03T23:00:00.000Z'),
      expiresAt: new Date('2026-07-05T00:00:00.000Z'),
    };
    const staleJob = {
      _id: 'vb_stale_s0',
      batchId: 'vb_stale',
      userId: 'user_1',
      storyboardId: 'sb_1',
      sceneIndex: 0,
      status: 'processing',
      videoModel: 'kling-2.1',
      attempts: 1,
      createdAt: new Date('2026-07-03T23:00:00.000Z'),
      expiresAt: batch.expiresAt,
    };
    const storyboard = {
      storyboardId: 'sb_1',
      userId: 'user_1',
      scenes: [{
        sceneIndex: 0,
        videoUrl: 'https://cdn.example.com/scene-0.mp4',
        videoAssetId: 'asset_scene_0',
        videoDurationMs: 5000,
      }],
    };

    const jobs = {
      find: vi.fn((query: any) => cursor(query?.batchId === 'vb_stale' ? [staleJob] : [staleJob])),
      updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const batches = {
      findOne: vi.fn().mockResolvedValue(batch),
      find: vi.fn(() => cursor([])),
      updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const storyboards = {
      findOne: vi.fn().mockResolvedValue(storyboard),
    };
    mocks.getDatabase.mockResolvedValue({
      collection: vi.fn((name: string) => {
        if (name === 'pipeline_video_jobs') return jobs;
        if (name === 'pipeline_video_batches') return batches;
        if (name === 'storyboards') return storyboards;
        throw new Error(`Unexpected collection ${name}`);
      }),
    });

    const response = await GET(new Request('http://test.local/api/cron/check-task-timeouts', {
      headers: { authorization: 'Bearer test-secret' },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.details).toContain('Editron video job vb_stale_s0 reconciled from storyboard evidence; timeout failure skipped');
    expect(jobs.updateOne).toHaveBeenCalledWith(
      { _id: 'vb_stale_s0', userId: 'user_1', batchId: 'vb_stale' },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'completed',
          videoUrl: 'https://cdn.example.com/scene-0.mp4',
          videoAssetId: 'asset_scene_0',
        }),
      }),
    );
    expect(jobs.updateOne.mock.calls.some(([, update]) => update?.$set?.status === 'failed')).toBe(false);
    expect(batches.updateOne).toHaveBeenCalledWith(
      { _id: 'vb_stale', userId: 'user_1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          completed: 1,
          failed: 0,
          status: 'completed',
        }),
      }),
    );
  });
});