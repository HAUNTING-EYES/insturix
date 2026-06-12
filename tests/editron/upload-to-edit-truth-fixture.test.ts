import { describe, expect, it } from 'vitest';

const PROJECT_MAUC_TRUTH = {
  projectId: 'proj_MAUCt7cAXbCY',
  capturedAt: '2026-06-12T00:00:00.000+05:30',
  source: 'mongo:editron_prev.projects',
  fps: 30,
  durationInFrames: 16575,
  durationSeconds: 552.5,
  overlayCounts: {
    video: 43,
    caption: 43,
    motionGraphic: 5,
    transition: 2,
    sound: 3,
    htmlScene: 0,
  },
  cutContinuity: {
    midTimelineGaps: 0,
    overlaps: 0,
    firstStart: 0,
    tailGap: 0,
  },
  firstClips: [
    { from: 0, durationInFrames: 807, sourceStartFrame: 309 },
    { from: 807, durationInFrames: 655, sourceStartFrame: 1368 },
    { from: 1462, durationInFrames: 80, sourceStartFrame: 3233 },
    { from: 1542, durationInFrames: 232, sourceStartFrame: 3620 },
    { from: 1774, durationInFrames: 390, sourceStartFrame: 5012 },
    { from: 2164, durationInFrames: 124, sourceStartFrame: 5567 },
  ],
  downstreamSymptoms: {
    filteredVideoClips: 43,
    captionStyleSignatures: ['font-bungee-inline'],
    motionGraphicRecipes: [
      'composed-identity',
      'composed-quotation',
      'composed-numeric',
      'composed-structured',
      'composed-numeric',
    ],
  },
} as const;

describe('upload-to-edit truth fixture: proj_MAUCt7cAXbCY', () => {
  it('freezes the real cut timeline as contiguous before overlay fixes begin', () => {
    expect(PROJECT_MAUC_TRUTH.cutContinuity).toEqual({
      midTimelineGaps: 0,
      overlaps: 0,
      firstStart: 0,
      tailGap: 0,
    });

    for (let i = 0; i < PROJECT_MAUC_TRUTH.firstClips.length - 1; i++) {
      const clip = PROJECT_MAUC_TRUTH.firstClips[i];
      const next = PROJECT_MAUC_TRUTH.firstClips[i + 1];
      expect(clip.from + clip.durationInFrames).toBe(next.from);
    }
  });

  it('captures the current bad overlay symptoms separately from cut correctness', () => {
    expect(PROJECT_MAUC_TRUTH.overlayCounts).toMatchObject({
      video: 43,
      caption: 43,
      motionGraphic: 5,
      transition: 2,
      sound: 3,
      htmlScene: 0,
    });
    expect(PROJECT_MAUC_TRUTH.downstreamSymptoms.filteredVideoClips).toBe(
      PROJECT_MAUC_TRUTH.overlayCounts.video,
    );
    expect(PROJECT_MAUC_TRUTH.downstreamSymptoms.captionStyleSignatures).toHaveLength(1);
    expect(PROJECT_MAUC_TRUTH.downstreamSymptoms.motionGraphicRecipes).toEqual([
      'composed-identity',
      'composed-quotation',
      'composed-numeric',
      'composed-structured',
      'composed-numeric',
    ]);
  });
});
