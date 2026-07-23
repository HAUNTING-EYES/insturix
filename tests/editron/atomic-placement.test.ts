import { describe, expect, it } from 'vitest';
import { resolveAtomicPlacement } from '../../lib/editron/services/atomic-placement';
import { buildAtomicMomentBundle } from '../../lib/editron/services/moment-bundle';
import type { SignalSnapshot } from '../../lib/editron/services/signal-registry';

describe('atomic placement resolver', () => {
  it('moves conflicted graphics into negative space from moment bundle facts', () => {
    const bundle = buildAtomicMomentBundle({
      frame: 90,
      fps: 30,
      snapshot: {
        frame: 90,
        timestampMs: 3_000,
        'visual.significance': 0.92,
        'visual.motion_intensity': 0.82,
        'visual.face_present': 1,
        'visual.eye_contact': 1,
        'visual.main_subject.x': 0.28,
        'visual.main_subject.y': 0.38,
        'visual.main_subject.width': 0.18,
        'visual.main_subject.height': 0.48,
        'visual.text_on_screen': 0.72,
        'visual.text_coverage': 0.24,
        'visual.negative_space.top': 0.82,
      } as SignalSnapshot,
    });

    const placement = resolveAtomicPlacement({
      family: 'graphic',
      momentBundle: bundle,
      requestedRegion: 'bottom-center',
    });

    expect(placement.version).toBe('atomic-placement-v1');
    expect(placement.requestedRegion).toBe('bottom-center');
    expect(placement.candidateRegion).toBe('top-center');
    expect(placement.changedRegion).toBe(true);
    expect(placement.reason).toBe('requested-conflicted');
    expect(placement.placementAdjustment.preferHits).toContain('negative-space');
    expect(placement.placementAdjustment.constraints).toEqual(expect.arrayContaining([
      'reduce-overlay-density',
      'protect-existing-text',
      'protect-human-attention',
    ]));
  });

  it('keeps a requested safe region when it does not conflict', () => {
    const placement = resolveAtomicPlacement({
      family: 'graphic',
      requestedRegion: 'top-left',
      signals: {
        visual_significance: 0.2,
        motion_intensity: 0.1,
        text_on_screen: 0,
        visual_complexity: 0.1,
      },
    });

    expect(placement.candidateRegion).toBe('top-left');
    expect(placement.changedRegion).toBe(false);
    expect(placement.reason).toBe('requested-safe');
  });

  it('uses primitive subject rectangles instead of only matching region labels', () => {
    const placement = resolveAtomicPlacement({
      family: 'graphic',
      requestedRegion: 'top-left',
      signals: {
        face_present: 1,
        visual_eye_contact: 1,
        visual_significance: 0.82,
        main_subject_x: 0.1,
        main_subject_y: 0.12,
        main_subject_width: 0.3,
        main_subject_height: 0.34,
        negative_space_right: 0.86,
      },
    });

    expect(placement.reason).toBe('requested-conflicted');
    expect(placement.candidateRegion).toBe('middle-right');
    expect(placement.placementAdjustment.avoidHits).not.toContain('face-attention');
    expect(placement.placementHints.avoid).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'face-attention', region: 'top-left' }),
    ]));
  });

  it('treats V-JEPA subject x/y as top-left coordinates', () => {
    const placement = resolveAtomicPlacement({
      family: 'graphic',
      signals: {
        visual_significance: 0.82,
        main_subject_x: 0.185,
        main_subject_y: 0.006,
        main_subject_width: 0.624,
        main_subject_height: 0.994,
        negative_space_left: 0.185,
        negative_space_right: 0.174,
      },
    });

    expect(placement.placementHints.avoid).toEqual([
      expect.objectContaining({
        reason: 'main-subject',
        x: 0.105,
        y: 0,
        width: 0.784,
        height: 1,
      }),
    ]);
  });
});
