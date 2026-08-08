import { describe, expect, it } from 'vitest';

import {
  deriveSfxSelectionEvidence,
  quantizeMotionSpeed,
  SFX_SELECTION_EVIDENCE_VERSION,
} from '@/lib/pipeline/sfx-selection-evidence';

describe('S1 deriveSfxSelectionEvidence (pure, anti-fabrication)', () => {
  it('wipe-left produces surface=transition and direction=left', () => {
    const evidence = deriveSfxSelectionEvidence({
      surface: 'transition',
      transitionDirectionLabel: 'left',
      receiptKeys: ['atomic-transition-direction:left'],
    });
    expect(evidence.surface).toBe('transition');
    expect(evidence.direction).toBe('left');
    expect(evidence.evidenceKeys).toContain('atomic-transition-direction:left');
  });

  it('wipe-right produces direction=right', () => {
    const evidence = deriveSfxSelectionEvidence({ surface: 'transition', transitionDirectionLabel: 'right' });
    expect(evidence.direction).toBe('right');
  });

  it('whip-pan with real motion yields fast motionSpeed', () => {
    const evidence = deriveSfxSelectionEvidence({
      surface: 'transition',
      motion: { axis: 'x', x: 1, magnitude: 0.6 },
      durationMs: 120,
      receiptKeys: ['whip-pan'],
    });
    expect(evidence.motionSpeed).toBe('fast');
    expect(evidence.direction).toBe('right'); // positive x motion
  });

  it('dissolve stays neutral — no fabricated direction, no motion speed', () => {
    const evidence = deriveSfxSelectionEvidence({ surface: 'transition', transitionDirectionLabel: 'center' });
    expect(evidence.direction).toBeUndefined();
    expect(evidence.motionSpeed).toBeUndefined();
  });

  it('a centered/absent label never becomes a direction', () => {
    const evidence = deriveSfxSelectionEvidence({ surface: 'transition', transitionDirectionLabel: 'center' });
    expect(evidence.direction).toBeUndefined();
  });

  it('motion-graphic lower-third with genuine directional slide keeps real direction', () => {
    const evidence = deriveSfxSelectionEvidence({
      surface: 'motion-graphic',
      motion: { axis: 'x', x: -0.5, magnitude: 0.5 },
      durationMs: 300,
      receiptKeys: ['mg-kinetic-event:directional-swipe'],
    });
    expect(evidence.surface).toBe('motion-graphic');
    expect(evidence.direction).toBe('left'); // negative x
    expect(evidence.motionSpeed).toBeDefined();
  });

  it('static crop / static mask produce NO motion speed or direction', () => {
    const evidence = deriveSfxSelectionEvidence({ surface: 'scene' });
    expect(evidence.motionSpeed).toBeUndefined();
    expect(evidence.direction).toBeUndefined();
  });

  it('material stays absent when evidence is weak', () => {
    const evidence = deriveSfxSelectionEvidence({ surface: 'transition' });
    expect(evidence.material).toBeUndefined();
  });

  it('material flows through only when explicitly provided', () => {
    const evidence = deriveSfxSelectionEvidence({ surface: 'ui', material: 'digital' });
    expect(evidence.material).toBe('digital');
    expect(evidence.evidenceKeys).toContain('material');
  });

  it('emits the version and a confidence', () => {
    const evidence = deriveSfxSelectionEvidence({ surface: 'transition' });
    expect(SFX_SELECTION_EVIDENCE_VERSION).toBe('sfx-selection-evidence-v1');
    expect(evidence.confidence).toBeGreaterThan(0);
    expect(evidence.confidence).toBeLessThanOrEqual(1);
  });
});

describe('quantizeMotionSpeed helper (single documented quantizer)', () => {
  it('maps velocity to buckets', () => {
    expect(quantizeMotionSpeed(100, 100)).toBe('fast');   // 1000 px/s
    expect(quantizeMotionSpeed(1000, 300)).toBe('medium'); // 300 px/s
    expect(quantizeMotionSpeed(1000, 60)).toBe('slow');    // 60 px/s
    expect(quantizeMotionSpeed(1000, 5)).toBe('still');    // 5 px/s
  });

  it('falls back to duration-only buckets when distance absent', () => {
    expect(quantizeMotionSpeed(120, undefined)).toBe('fast');
    expect(quantizeMotionSpeed(500, undefined)).toBe('slow');   // 500ms per documented split (420< x <=1200)
    expect(quantizeMotionSpeed(2000, undefined)).toBe('still'); // 2s per documented split (slow ends at 1200)
  });

  it('returns undefined for non-positive duration', () => {
    expect(quantizeMotionSpeed(0, 5)).toBeUndefined();
  });
});
