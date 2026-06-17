import { describe, expect, it } from 'vitest';
import {
  isAtomicTransitionForm,
  resolveDirectionalWipeClipPath,
  resolveTransitionRenderParams,
  resolveTransitionRenderStyle,
} from '@/lib/editron/services/transition-render-form';
import type { AtomicTransitionForm } from '@/lib/editron/services/transition-form';

const baseForm: AtomicTransitionForm = {
  version: 'atomic-transition-form-v1',
  job: 'match-motion',
  intent: 'motion-transfer',
  compatibilityType: 'whip-pan',
  evidence: {
    source: 'signal-atoms',
    reasonKeys: ['motion-direction', 'visual-motion', 'beat'],
    boundary: {
      hasAnchor: true,
      hasReason: true,
    },
  },
  direction: {
    x: -0.84,
    y: 0.12,
    magnitude: 0.84,
    axis: 'x',
    label: 'left',
  },
  durationFrames: 10,
  softness: 0.2,
  blurPx: 31,
  smear: 0.77,
  exposure: 0.18,
  maskFeather: 0.18,
  intensity: 0.9,
  visualPressure: 0.2,
  keyframeBased: false,
  sfxRole: 'fast-whoosh',
};

describe('transition render form adapter', () => {
  it('lets atomic form override the legacy transition shell', () => {
    expect(resolveTransitionRenderStyle('soft-cut', baseForm)).toBe('whip-pan');
  });

  it('projects atomic direction and strength into render parameters', () => {
    const params = resolveTransitionRenderParams('whip-pan', baseForm);

    expect(params.directionX).toBe(-1);
    expect(params.directionY).toBe(0);
    expect(params.directionLabel).toBe('left');
    expect(params.blurPx).toBe(31);
    expect(params.motionDistancePct).toBeGreaterThan(150);
    expect(params.zoomScaleDelta).toBeGreaterThan(0.3);
  });

  it('keeps legacy fallback behavior when no atomic form exists', () => {
    const params = resolveTransitionRenderParams('soft-cut');

    expect(params.directionX).toBe(1);
    expect(params.blurPx).toBe(3);
    expect(params.flashOpacityCap).toBe(1);
  });

  it('uses atomic direction for wipe clip paths instead of preset direction', () => {
    const params = resolveTransitionRenderParams('wipe-right', baseForm);

    expect(resolveDirectionalWipeClipPath(0.25, params, 'right')).toBe('inset(0 75% 0 0)');
  });

  it('rejects malformed metadata before render use', () => {
    expect(isAtomicTransitionForm({ version: 'legacy', direction: {} })).toBe(false);
    expect(isAtomicTransitionForm(baseForm)).toBe(true);
  });
});
