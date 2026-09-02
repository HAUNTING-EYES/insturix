import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/editron/services/asset-resolver', () => ({
  assetResolver: { getAsset: vi.fn() },
}));
vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: {
    loadProject: vi.fn(),
    alignCutsToBeatsAtRevisionV1: vi.fn(),
  },
}));

import {
  executeChatBeatSync,
  type ChatBeatSyncDependencies,
} from '@/lib/editron/services/chat-beat-sync';
import type { MediaAsset } from '@/lib/editron/services/asset-resolver';

const UPDATED_AT = new Date('2026-08-01T09:00:00.000Z');

function mediaAsset(assetId: string, type: MediaAsset['type'], duration: number): MediaAsset {
  return {
    assetId,
    userId: 'user-1',
    type,
    filename: `${assetId}.${type === 'audio' ? 'wav' : 'mp4'}`,
    source: 'user-upload',
    gcsPath: null,
    cachedUrl: `https://cdn.test/${assetId}`,
    urlExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
    size: 1_000,
    duration,
    uploadedAt: UPDATED_AT,
  };
}

function project() {
  return {
    projectId: 'project-1',
    userId: 'user-1',
    fps: 30,
    updatedAt: UPDATED_AT,
    overlays: [
      {
        id: 1,
        type: 'video',
        row: 0,
        assetId: 'video-a',
        from: 0,
        durationInFrames: 60,
        sourceStartFrame: 0,
        videoStartTime: 0,
      },
      {
        id: 2,
        type: 'video',
        row: 0,
        assetId: 'video-b',
        from: 60,
        durationInFrames: 60,
        sourceStartFrame: 12,
        videoStartTime: 12,
      },
      {
        id: 3,
        type: 'sound',
        row: 1,
        assetId: 'music-a',
        from: 30,
        durationInFrames: 120,
        startFromSound: 30,
        mediaRole: 'music',
        beatGrid: {
          bpm: 120,
          bpmConfidence: 0.94,
          beats: [{ frame: 63, strength: 0.9, isDownbeat: true }],
          downbeats: [63],
        },
      },
      {
        id: 4,
        type: 'transition',
        row: 2,
        from: 60,
        durationInFrames: 6,
        clipAId: 1,
        clipBId: 2,
        boundaryFrame: 60,
      },
    ],
  };
}

function dependencies(options: {
  firstVideoDuration?: number;
  commitConflict?: boolean;
  commitSafeStop?: boolean;
} = {}) {
  type CommitInput = Parameters<ChatBeatSyncDependencies['commit']>[0];
  const commit = vi.fn(async (_input: CommitInput) => {
    if (options.commitConflict) {
      throw Object.assign(new Error('project changed'), { code: 'PROJECT_REVISION_CONFLICT' });
    }
    if (options.commitSafeStop) {
      return {
        disposition: 'SAFE_STOP' as const,
        reason: 'SOURCE_TIME_EVIDENCE_INCOMPLETE' as const,
        currentRevision: {
          schemaVersion: 1 as const,
          value: 0,
          compatibilityUpdatedAt: UPDATED_AT.toISOString(),
        },
        mutationReceipt: null,
        timelineChangeReceipt: null,
      };
    }
    return {
      disposition: 'APPLIED' as const,
      resolution: {
        sourceBeatCount: 1,
        timelineBeatCount: 1,
        alignment: {
          snappedCount: 1,
          trackOverlayIds: [1, 2],
          changes: [{
            clipAId: 1,
            clipBId: 2,
            originalFrame: 60,
            alignedFrame: 63,
            beatFrame: 63,
            shiftFrames: 3,
            transitionOverlayIds: [4],
          }],
          rejections: [],
        },
      },
      mutationReceipt: {},
      timelineChangeReceipt: {},
    } as any;
  });
  const analyzeAssetBeats = vi.fn(async () => ({ beats: [] }));
  const assets = new Map<string, MediaAsset>([
    ['video-a', mediaAsset('video-a', 'video', options.firstVideoDuration ?? 3)],
    ['video-b', mediaAsset('video-b', 'video', 3)],
    ['music-a', mediaAsset('music-a', 'audio', 8)],
  ]);
  const deps: ChatBeatSyncDependencies = {
    loadProject: vi.fn(async () => project()),
    loadAsset: vi.fn(async (assetId) => assets.get(assetId) ?? null),
    analyzeAssetBeats,
    commit,
  };
  return { deps, commit, analyzeAssetBeats };
}

describe('executeChatBeatSync', () => {
  it('projects persisted beats, shifts one existing boundary, and commits the linked timeline atomically', async () => {
    const { deps, commit, analyzeAssetBeats } = dependencies();

    const result = await executeChatBeatSync({
      userId: 'user-1',
      projectId: 'project-1',
      input: { beatFilter: 'downbeats', strengthThreshold: 0.6 },
    }, deps);

    expect(result.status).toBe('success');
    expect(analyzeAssetBeats).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledTimes(1);
    const write = commit.mock.calls[0]?.[0];
    if (!write) throw new Error('Expected one atomic beat-sync write');
    expect(write).toMatchObject({
      expectedRevision: {
        schemaVersion: 1,
        value: 0,
        compatibilityUpdatedAt: UPDATED_AT.toISOString(),
      },
      audioOverlayId: 3,
      evidenceSource: 'persisted-beat-grid',
      beatFilter: 'downbeats',
      strengthThreshold: 0.6,
    });
  });

  it('refuses a shift when the outgoing source has no trim handle', async () => {
    const { deps, commit } = dependencies({ firstVideoDuration: 2 });

    const result = await executeChatBeatSync({
      userId: 'user-1',
      projectId: 'project-1',
      input: { beatFilter: 'downbeats', strengthThreshold: 0.6 },
    }, deps);

    expect(result).toMatchObject({
      status: 'no-op',
      data: {
        reason: 'no-safe-boundary-alignment',
        rejections: expect.arrayContaining([
          expect.objectContaining({ reason: 'insufficient-source-handle' }),
        ]),
      },
    });
    expect(commit).not.toHaveBeenCalled();
  });

  it('reports a revision conflict instead of overwriting a newer timeline', async () => {
    const { deps, commit } = dependencies({ commitConflict: true });

    const result = await executeChatBeatSync({
      userId: 'user-1',
      projectId: 'project-1',
      input: { beatFilter: 'downbeats', strengthThreshold: 0.6 },
    }, deps);

    expect(result).toMatchObject({
      status: 'error',
      error: { code: 'BEAT_SYNC_PROJECT_CONFLICT' },
    });
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('reports an authoritative source-time safe stop without claiming success', async () => {
    const { deps, commit } = dependencies({ commitSafeStop: true });

    const result = await executeChatBeatSync({
      userId: 'user-1',
      projectId: 'project-1',
      input: { beatFilter: 'downbeats', strengthThreshold: 0.6 },
    }, deps);

    expect(result).toMatchObject({
      status: 'no-op',
      nextAction: 'stop',
      data: { reason: 'source-time-evidence-incomplete' },
    });
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
