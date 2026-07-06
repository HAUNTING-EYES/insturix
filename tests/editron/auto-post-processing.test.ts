import { describe, expect, it } from 'vitest';

import { applyFreezeFrameUnderGraphics } from '@/lib/editron/services/auto-post-processing';

describe('auto post-processing', () => {
  it('does not freeze-ramp video under graphics when native speech would be slowed', () => {
    const overlays: any[] = [
      videoOverlay({
        metadata: {
          nativeAudioEvidence: {
            hasNativeAudio: true,
            hasSpeech: true,
            source: 'transcription',
            wordCount: 4,
            speechCoverage: 0.6,
            regionCount: 1,
            speechRegions: [{
              sourceStartFrame: 0,
              sourceEndFrame: 180,
              startMs: 0,
              endMs: 6000,
            }],
          },
        },
      }),
      graphicOverlay(),
    ];

    const result = applyFreezeFrameUnderGraphics(overlays);

    expect(result.modified).toBe(0);
    expect(overlays[0].speedCurve).toBeUndefined();
  });

  it('still freezes silent visual footage under a large readable graphic', () => {
    const overlays: any[] = [
      videoOverlay({
        hasNativeAudio: false,
        metadata: {
          nativeAudioEvidence: {
            hasNativeAudio: false,
            hasSpeech: false,
            source: 'none',
            wordCount: 0,
            speechCoverage: 0,
            regionCount: 0,
            speechRegions: [],
          },
        },
      }),
      graphicOverlay(),
    ];

    const result = applyFreezeFrameUnderGraphics(overlays);

    expect(result.modified).toBe(1);
    expect(overlays[0].speedCurve).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 0.05 }),
    ]));
  });
});

function videoOverlay(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    type: 'video',
    from: 0,
    durationInFrames: 180,
    sourceStartFrame: 0,
    videoStartTime: 0,
    width: 1920,
    height: 1080,
    styles: { volume: 1 },
    ...overrides,
  };
}

function graphicOverlay(overrides: Record<string, unknown> = {}) {
  return {
    id: 2,
    type: 'html-scene',
    from: 30,
    durationInFrames: 60,
    width: 960,
    height: 540,
    content: '<div>Readable proof graphic</div>',
    metadata: {
      sourceType: 'edl-motion-graphic',
      graphicType: 'stat-counter',
    },
    ...overrides,
  };
}