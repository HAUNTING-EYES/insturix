import { beforeEach, describe, expect, it, vi } from 'vitest';

const projectServiceMock = vi.hoisted(() => ({
  loadProject: vi.fn(),
  saveProject: vi.fn(),
}));

vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: projectServiceMock,
}));

vi.mock('@/lib/editron/services/media', () => ({
  getTranscription: vi.fn(),
}));

import {
  buildPacingSplitActions,
  type SilenceRemovalAction,
  type TranscriptSegment,
} from '@/lib/editron/services/raw-footage-processor';
import { executeSilenceRemoval } from '@/lib/editron/services/silence-removal-executor';
import type { TranscriptionWord } from '@/lib/editron/services/media/types';

function segment(index: number, startMs: number, endMs: number): TranscriptSegment {
  const words: TranscriptionWord[] = [{
    word: `segment-${index}`,
    startMs,
    endMs,
    confidence: 0.95,
  }];
  return {
    text: `segment ${index}`,
    startMs,
    endMs,
    wordCount: words.length,
    words,
    fillerCount: 0,
    silenceGapCount: 0,
    avgWordGapMs: 0,
    index,
  };
}

describe('raw footage pacing splits', () => {
  beforeEach(() => {
    projectServiceMock.loadProject.mockReset();
    projectServiceMock.saveProject.mockReset();
  });

  it('plans non-destructive split boundaries from overheld transcript segment evidence', () => {
    const actions = buildPacingSplitActions(
      [
        segment(0, 0, 2500),
        segment(1, 3000, 5500),
        segment(2, 6500, 9000),
      ],
      [],
      10_000,
    );

    expect(actions.map((action) => action.startMs)).toEqual([3000, 6500]);
    expect(actions).toEqual([
      expect.objectContaining({
        action: 'split',
        reason: 'pacing-split',
        metadata: expect.objectContaining({
          kind: 'pacing-split',
          source: 'transcript-segment-boundary',
          calibrationStatus: 'invented-threshold',
          previousSegmentIndex: 0,
          nextSegmentIndex: 1,
        }),
      }),
      expect.objectContaining({
        action: 'split',
        reason: 'pacing-split',
        metadata: expect.objectContaining({
          previousSegmentIndex: 1,
          nextSegmentIndex: 2,
        }),
      }),
    ]);
  });

  it('does not create pacing split actions inside removed ranges', () => {
    const removals: SilenceRemovalAction[] = [{
      startMs: 2500,
      endMs: 7000,
      action: 'remove',
      reason: 'transcript-edit',
    }];

    const actions = buildPacingSplitActions(
      [
        segment(0, 0, 2200),
        segment(1, 3000, 5200),
        segment(2, 7500, 9800),
      ],
      removals,
      10_000,
    );

    expect(actions).toEqual([]);
  });

  it('executes split actions without deleting frames or breaking source offsets', async () => {
    projectServiceMock.loadProject.mockResolvedValue({
      fps: 30,
      durationInFrames: 300,
      overlays: [{
        id: 1,
        type: 'video',
        from: 0,
        row: 0,
        durationInFrames: 300,
        sourceStartFrame: 0,
        videoStartTime: 0,
        metadata: {},
      }],
    });

    const result = await executeSilenceRemoval('proj_split', 'user_1', [{
      startMs: 4000,
      endMs: 4000,
      action: 'split',
      reason: 'pacing-split',
      metadata: {
        kind: 'pacing-split',
        source: 'transcript-segment-boundary',
        calibrationStatus: 'invented-threshold',
        previousSegmentIndex: 0,
        nextSegmentIndex: 1,
      },
    }], 30);

    expect(result.totalFramesRemoved).toBe(0);
    expect(result.newDurationInFrames).toBe(300);
    expect(result.overlaysCreated).toBe(1);
    expect(result.ghostSegments).toEqual([]);

    const savedProject = projectServiceMock.saveProject.mock.calls[0][2];
    const videos = savedProject.overlays.filter((overlay: any) => overlay.type === 'video');
    expect(videos).toEqual([
      expect.objectContaining({
        from: 0,
        durationInFrames: 120,
        sourceStartFrame: 0,
        videoStartTime: 0,
        metadata: expect.objectContaining({
          sceneIndex: 0,
          pacingSplit: expect.objectContaining({ splitFrame: 120, nextSegmentIndex: 1 }),
        }),
      }),
      expect.objectContaining({
        from: 120,
        durationInFrames: 180,
        sourceStartFrame: 120,
        videoStartTime: 120,
        metadata: expect.objectContaining({
          sceneIndex: 1,
          pacingSplit: expect.objectContaining({ splitFrame: 120, nextSegmentIndex: 1 }),
        }),
      }),
    ]);
    expect(savedProject.durationInFrames).toBe(300);
  });
});
