import { describe, expect, it } from 'vitest';
import { scoreAllOverlays, scoreOverlay } from '../../lib/editron/engine/utility-scorer';
import type { OverlayDefinition, SignalSnapshot } from '../../lib/editron/engine/utility-types';
import { DEFAULT_CURVE_PARAMS } from '../../lib/editron/engine/utility-types';

function candidate(id: string, position?: string, category: OverlayDefinition['category'] = 'graphic'): OverlayDefinition {
  return {
    id,
    category,
    rank: 10,
    weight: 1,
    minScore: 0,
    minGapFrames: 0,
    considerations: [{
      signalId: 'speech_energy',
      curveType: 'linear',
      params: DEFAULT_CURVE_PARAMS,
      invert: false,
      description: 'same base score for placement-hint comparison',
    }],
    outputParams: position
      ? [{ name: 'position', mode: 'fixed', fixedValue: position }]
      : [],
  };
}

describe('utility scorer placement hints', () => {
  it('boosts preferred negative-space candidates over text/face collision candidates', () => {
    const signals: SignalSnapshot = {
      speech_energy: 0.8,
      visual_significance: 0.86,
      motion_intensity: 0.4,
      face_present: 1,
      visual_eye_contact: 1,
      main_subject_x: 0.1,
      main_subject_y: 0.1,
      main_subject_width: 0.2,
      main_subject_height: 0.25,
      text_on_screen: 0.72,
      text_coverage: 0.24,
      negative_space_right: 0.82,
    };

    const results = scoreAllOverlays([
      candidate('graphic.bottom-text-collision', 'bottom-center'),
      candidate('graphic.right-negative-space', 'middle-right'),
    ], signals, 'multiplicative');

    expect(results[0].overlayId).toBe('graphic.right-negative-space');
    expect(results[0].placementAdjustment).toEqual(expect.objectContaining({
      candidateRegion: 'middle-right',
      bonus: expect.any(Number),
      penalty: expect.any(Number),
      preferHits: ['negative-space'],
    }));
    expect(results[1].placementAdjustment).toEqual(expect.objectContaining({
      candidateRegion: 'bottom-center',
      penalty: expect.any(Number),
      avoidHits: ['text-occupancy'],
    }));
    expect(results[0].totalScore).toBeGreaterThan(results[1].totalScore);
  });

  it('leaves score unchanged when an unpositioned candidate has no visual pressure', () => {
    const signals: SignalSnapshot = {
      speech_energy: 0.8,
    };

    const result = scoreOverlay(candidate('graphic.no-region'), signals, 'multiplicative');

    expect(result.totalScore).toBeCloseTo(0.8, 5);
    expect(result.placementAdjustment).toBeUndefined();
  });

  it('penalizes unpositioned graphics when existing text makes the frame busy', () => {
    const signals: SignalSnapshot = {
      speech_energy: 0.8,
      text_on_screen: 0.72,
      text_coverage: 0.24,
      negative_space_right: 0.82,
    };

    const result = scoreOverlay(candidate('graphic.no-region'), signals, 'multiplicative');

    expect(result.totalScore).toBeLessThan(0.8);
    expect(result.placementAdjustment).toEqual(expect.objectContaining({
      candidateRegion: undefined,
      penalty: expect.any(Number),
      constraints: expect.arrayContaining(['protect-existing-text']),
    }));
  });

  it('penalizes kinetic candidates on high-motion human-attention frames without requiring a region', () => {
    const signals: SignalSnapshot = {
      speech_energy: 0.8,
      visual_significance: 0.9,
      motion_intensity: 0.88,
      face_present: 1,
      visual_eye_contact: 1,
      shot_scale: 0.8,
    };

    const calmSignals: SignalSnapshot = {
      speech_energy: 0.8,
      visual_significance: 0.2,
      motion_intensity: 0.15,
    };

    const highPressure = scoreOverlay(candidate('zoom.push-in', undefined, 'zoom'), signals, 'multiplicative');
    const calm = scoreOverlay(candidate('zoom.push-in', undefined, 'zoom'), calmSignals, 'multiplicative');

    expect(highPressure.totalScore).toBeLessThan(calm.totalScore);
    expect(highPressure.placementAdjustment).toEqual(expect.objectContaining({
      candidateRegion: undefined,
      penalty: expect.any(Number),
      constraints: expect.arrayContaining(['avoid-large-kinetic-overlays', 'protect-human-attention']),
    }));
  });

  it('penalizes physical subject overlap even when named regions differ', () => {
    const signals: SignalSnapshot = {
      speech_energy: 0.8,
      visual_significance: 0.82,
      face_present: 1,
      visual_eye_contact: 1,
      main_subject_x: 0.1,
      main_subject_y: 0.12,
      main_subject_width: 0.3,
      main_subject_height: 0.34,
      negative_space_right: 0.86,
    };

    const results = scoreAllOverlays([
      candidate('graphic.top-left-subject-overlap', 'top-left'),
      candidate('graphic.right-negative-space', 'middle-right'),
    ], signals, 'multiplicative');

    expect(results[0].overlayId).toBe('graphic.right-negative-space');
    expect(results[0].placementAdjustment).toEqual(expect.objectContaining({
      candidateRegion: 'middle-right',
      preferHits: ['negative-space'],
    }));
    expect(results[1].placementAdjustment).toEqual(expect.objectContaining({
      candidateRegion: 'top-left',
      avoidHits: ['face-attention'],
    }));
  });
});
