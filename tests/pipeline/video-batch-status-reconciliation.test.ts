import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn(),
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { MEDIA_ASSETS: 'media_assets' },
  getDatabase: mocks.getDatabase,
}));

import { getVideoBatchStatus } from '@/lib/pipeline/video-queue-service';

describe('video batch status reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('repairs stale job and batch status from storyboard scene and sub-shot video evidence', async () => {
    const now = new Date('2026-07-04T00:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const batch = {
      _id: 'vb_stale',
      userId: 'user_1',
      storyboardId: 'sb_1',
      totalScenes: 2,
      completed: 0,
      failed: 0,
      status: 'processing',
      createdAt: new Date('2026-07-03T23:00:00.000Z'),
      updatedAt: new Date('2026-07-03T23:00:00.000Z'),
      expiresAt: new Date('2026-07-05T00:00:00.000Z'),
    };
    const jobs = [
      {
        _id: 'vb_stale_s0',
        batchId: 'vb_stale',
        userId: 'user_1',
        storyboardId: 'sb_1',
        sceneIndex: 0,
        status: 'processing',
        videoModel: 'kling-2.1',
        attempts: 1,
        createdAt: batch.createdAt,
        expiresAt: batch.expiresAt,
      },
      {
        _id: 'vb_stale_s1_sub2',
        batchId: 'vb_stale',
        userId: 'user_1',
        storyboardId: 'sb_1',
        sceneIndex: 1,
        subShotIndex: 2,
        status: 'queued',
        videoModel: 'seedance-1.5-pro',
        attempts: 0,
        createdAt: batch.createdAt,
        expiresAt: batch.expiresAt,
      },
    ];
    const storyboard = {
      storyboardId: 'sb_1',
      userId: 'user_1',
      scenes: [
        {
          sceneIndex: 0,
          videoUrl: 'https://cdn.example.com/scene-0.mp4',
          videoAssetId: 'asset_scene_0',
          videoGcsPath: 'videos/scene-0.mp4',
          videoDurationMs: 5000,
        },
        {
          sceneIndex: 1,
          descriptor: {
            subShots: [
              {},
              {},
              {
                videoUrl: 'https://cdn.example.com/scene-1-sub-2.mp4',
                videoAssetId: 'asset_scene_1_sub_2',
                videoDurationMs: 4000,
              },
            ],
          },
        },
      ],
    };

    const batches = {
      findOne: vi.fn().mockResolvedValue(batch),
      updateOne: vi.fn(),
    };
    const jobsCollection = {
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue(jobs),
        }),
      }),
      updateOne: vi.fn(),
    };
    const storyboards = {
      findOne: vi.fn().mockResolvedValue(storyboard),
    };
    mocks.getDatabase.mockResolvedValue({
      collection: vi.fn((name: string) => {
        if (name === 'pipeline_video_batches') return batches;
        if (name === 'pipeline_video_jobs') return jobsCollection;
        if (name === 'storyboards') return storyboards;
        throw new Error(`Unexpected collection ${name}`);
      }),
    });

    const result = await getVideoBatchStatus('vb_stale', 'user_1');

    expect(result.batch).toMatchObject({
      _id: 'vb_stale',
      completed: 2,
      failed: 0,
      status: 'completed',
    });
    expect(result.jobs).toEqual([
      expect.objectContaining({
        _id: 'vb_stale_s0',
        status: 'completed',
        videoUrl: 'https://cdn.example.com/scene-0.mp4',
        videoAssetId: 'asset_scene_0',
      }),
      expect.objectContaining({
        _id: 'vb_stale_s1_sub2',
        status: 'completed',
        videoUrl: 'https://cdn.example.com/scene-1-sub-2.mp4',
        videoAssetId: 'asset_scene_1_sub_2',
      }),
    ]);
    expect(jobsCollection.updateOne).toHaveBeenCalledTimes(2);
    expect(batches.updateOne).toHaveBeenCalledWith(
      { _id: 'vb_stale', userId: 'user_1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          completed: 2,
          failed: 0,
          status: 'completed',
        }),
      }),
    );
  });
});