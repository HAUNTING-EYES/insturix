import { describe, expect, it } from 'vitest';

import { applyColorNormalization, applyDriftZoom, applyFreezeFrameUnderGraphics } from '@/lib/editron/services/auto-post-processing';

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


  it('stamps post-EDL drift zoom provenance for final-overlay choreography', () => {
    const overlays: any[] = [videoOverlay({ assetId: 'clip-1' })];

    const result = applyDriftZoom(overlays);

    expect(result.modified).toBe(1);
    expect(overlays[0].metadata).toEqual(expect.objectContaining({
      crossOverlayProducer: 'post-edl-drift-zoom',
      postProcessing: expect.objectContaining({
        driftZoom: expect.objectContaining({
          version: 'post-edl-drift-zoom-v1',
          source: 'auto-post-processing',
          calibrationStatus: 'invented-needs-calibration',
        }),
      }),
    }));
  });
  it('applies conservative signal-derived color normalization without selecting a filter preset', () => {
    const overlays: any[] = [videoOverlay({ assetId: 'clip-1' })];
    const analyses = new Map<string, any>([[
      'clip-1',
      {
        assetId: 'clip-1',
        keyframeAnalyses: [{ colorTemperatureK: 7200, dominantColors: ['#4A90E2'] }],
        subjectTracks: [{ category: 'person' }],
      },
    ]]);

    const result = applyColorNormalization(overlays, analyses, {
      color_temperature: 5200,
      formality: 0.4,
      energy_baseline: 0.55,
    });

    expect(result.modified).toBe(1);
    expect(overlays[0].styles.filter).toContain('sepia(');
    expect(overlays[0].styles.filter).not.toContain('warm-neutral');
    expect(overlays[0].metadata.autoColorNormalization).toMatchObject({
      version: 'auto-color-normalization-v1',
      source: 'auto-post-processing',
      currentColorTemperature: 7200,
      targetColorTemperature: 5200,
      deltaK: -500,
      skinToneProtected: true,
    });
  });

  it('does not overwrite manual filters during automatic color normalization', () => {
    const overlays: any[] = [videoOverlay({
      assetId: 'clip-1',
      styles: { volume: 1, filter: 'contrast(1.2)' },
    })];
    const analyses = new Map<string, any>([[
      'clip-1',
      { assetId: 'clip-1', keyframeAnalyses: [{ colorTemperatureK: 7000 }], subjectTracks: [] },
    ]]);

    const result = applyColorNormalization(overlays, analyses, { color_temperature: 5200 });

    expect(result.modified).toBe(0);
    expect(result.skippedExistingFilter).toBe(1);
    expect(overlays[0].styles.filter).toBe('contrast(1.2)');
    expect(overlays[0].metadata?.autoColorNormalization).toBeUndefined();
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
