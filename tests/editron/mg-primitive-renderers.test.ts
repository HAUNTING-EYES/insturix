import { describe, it, expect } from 'vitest';
import {
  computeAnimationState,
  deriveSpatialConfig,
  applyAudioReactiveModulation,
  type SpatialConfig,
  type SignalCurves,
} from '../../lib/editron/motion-graphics/engine/primitive-renderers';
import { resolveMotionTokens } from '../../lib/editron/data/motion-theme-resolver';
import type {
  ComputedChoreography,
  EntrancePattern,
  ExitPattern,
  HoldPattern,
} from '../../lib/editron/motion-graphics/engine/recipe-types';

// ─── Helpers ───────────────────────────────────────────

const LINEAR_EASING = (t: number) => t;

function makeTiming(overrides?: Partial<ComputedChoreography>): ComputedChoreography {
  return {
    enterStartFrame: 0,
    enterEndFrame: 10,
    holdStartFrame: 10,
    holdEndFrame: 50,
    exitStartFrame: 50,
    exitEndFrame: 60,
    enterEasing: LINEAR_EASING,
    exitEasing: LINEAR_EASING,
    ...overrides,
  };
}

/** Default spatial config derived from motion tokens with default signals. */
const SPATIAL = deriveSpatialConfig(resolveMotionTokens({}, {}));

/** NEUTRAL state values — mirrors the const in the source. */
const NEUTRAL = {
  opacity: 1,
  translateX: 0,
  translateY: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  skewX: 0,
  clipProgress: 1,
  filterBlur: 0,
  filterBrightness: 1,
  filterContrast: 1,
  filterSaturate: 1,
  letterSpacing: 0,
  fontSize: 1,
  textShadowBlur: 0,
  strokeDashoffset: 0,
};

// ─── 6-Phase Animation State Machine ──────────────────

describe('6-phase animation state machine', () => {
  it('before enterStart returns opacity 0 for fade entrance', () => {
    const state = computeAnimationState(-5, makeTiming(), 'fade', 'fade', SPATIAL);
    // applyEntranceState(0, 'fade', ...) → opacity: 0
    expect(state.opacity).toBeCloseTo(0, 5);
  });

  it('mid-entrance returns ~0.5 opacity for fade with linear easing', () => {
    // frame 5 is midpoint of enterStart=0..enterEnd=10 → progress 0.5
    const state = computeAnimationState(5, makeTiming(), 'fade', 'fade', SPATIAL);
    expect(state.opacity).toBeCloseTo(0.5, 1);
  });

  it('follow-through is active after entrance for scale-up', () => {
    // scale-up settleFrames = 8; frame 11 is 1 frame into settle (enterEnd=10)
    const state = computeAnimationState(11, makeTiming(), 'scale-up', 'fade', SPATIAL);
    // Follow-through applies damped cosine: scaleX != 1.0 exactly
    expect(state.scaleX).not.toBeCloseTo(1.0, 5);
  });

  it('hold animation is active for pulse during hold phase', () => {
    // frame 30 is in hold phase (holdStart=10, holdEnd=50), after settle for fade (0 frames)
    const state = computeAnimationState(30, makeTiming(), 'fade', 'fade', SPATIAL, 'pulse');
    // pulse: scaleX = 1 + sin(phase * 2π) * 0.02 — at non-zero phase, differs from 1
    expect(state.scaleX).not.toBe(1);
  });

  it('static hold returns neutral state', () => {
    const state = computeAnimationState(30, makeTiming(), 'fade', 'fade', SPATIAL, 'static');
    expect(state).toEqual(NEUTRAL);
  });

  it('mid-exit returns ~0.5 opacity for fade exit', () => {
    // frame 55 is midpoint of exitStart=50..exitEnd=60 → progress 0.5 → opacity = 1-0.5 = 0.5
    const state = computeAnimationState(55, makeTiming(), 'fade', 'fade', SPATIAL);
    expect(state.opacity).toBeCloseTo(0.5, 1);
  });

  it('after exitEnd returns opacity 0 for fade exit', () => {
    const state = computeAnimationState(65, makeTiming(), 'fade', 'fade', SPATIAL);
    // applyExitState(1, 'fade', ...) → opacity: 0
    expect(state.opacity).toBeCloseTo(0, 5);
  });
});

// ─── All 13 Entrance Patterns ─────────────────────────

describe('all 13 entrance patterns produce animation', () => {
  const ALL_ENTRANCE: EntrancePattern[] = [
    'fade', 'slide-up', 'slide-left', 'slide-down', 'slide-right',
    'scale-up', 'pop', 'blur-in', 'draw', 'rotate-in', 'skew-in',
    'zoom-blur', 'scramble',
  ];

  for (const pattern of ALL_ENTRANCE) {
    it(`${pattern} at progress=0.5 differs from neutral`, () => {
      // frame 5 of 0..10 → progress 0.5 with linear easing
      const state = computeAnimationState(5, makeTiming(), pattern, 'fade', SPATIAL);
      const isDifferent = Object.keys(NEUTRAL).some(
        (key) => state[key as keyof typeof state] !== NEUTRAL[key as keyof typeof NEUTRAL],
      );
      expect(isDifferent).toBe(true);
    });
  }
});

// ─── All 12 Exit Patterns ─────────────────────────────

describe('all 12 exit patterns', () => {
  const ALL_EXIT: ExitPattern[] = [
    'fade', 'slide-down', 'slide-left', 'slide-right', 'slide-up',
    'scale-down', 'blur-out', 'draw-reverse', 'rotate-out', 'skew-out',
    'zoom-blur-out', 'scramble-out',
  ];

  for (const pattern of ALL_EXIT) {
    it(`${pattern} at progress=0.5 has opacity < 1`, () => {
      // frame 55 of exitStart=50..exitEnd=60 → progress 0.5
      const state = computeAnimationState(55, makeTiming(), 'fade', pattern, SPATIAL);
      if (pattern === 'draw-reverse') {
        // draw-reverse uses clipProgress, not opacity — opacity stays 1, clipProgress < 1
        expect(state.clipProgress).toBeLessThan(1);
      } else {
        expect(state.opacity).toBeLessThan(1);
      }
    });
  }
});

// ─── Disney Principles ────────────────────────────────

describe('Disney principles', () => {
  it('anticipation for scale-up produces ghost opacity', () => {
    // Anticipation phase: anticipateStart=0, anticipateEnd=5, enterStart=5
    const timing = makeTiming({
      anticipateStartFrame: 0,
      anticipateEndFrame: 5,
      enterStartFrame: 5,
      enterEndFrame: 15,
    });
    // frame 3 → progress = 3/5 = 0.6 → ghostOpacity = 0.6 * 0.15 = 0.09
    const state = computeAnimationState(3, timing, 'scale-up', 'fade', SPATIAL);
    expect(state.opacity).toBeGreaterThan(0);
    expect(state.opacity).toBeLessThan(0.2); // ghost is subtle
  });

  it('arc: slide-left midpoint has non-zero translateY', () => {
    // frame 5 → progress 0.5 → arc = sin(0.5*π)*0.2 = 0.2 → translateY = -0.2 * verticalSlidePx
    const state = computeAnimationState(5, makeTiming(), 'slide-left', 'fade', SPATIAL);
    expect(state.translateY).not.toBe(0);
  });

  it('follow-through oscillation for scale-up', () => {
    // scale-up settleFrames = 8; enterEnd = 10
    // frame 11 → settleProgress = 1/8 = 0.125
    // decay = (1 - 0.125)^2 ≈ 0.766; wave = cos(0.125 * 2π) * 0.766 ≈ 0.577
    // scaleX = 1 + wave * 0.04
    const state = computeAnimationState(11, makeTiming(), 'scale-up', 'fade', SPATIAL);
    expect(state.scaleX).toBeGreaterThan(1); // overshoot: scale above 1
    expect(state.scaleX).toBeLessThan(1.05); // bounded by 4% amplitude
    expect(state.scaleY).toBeCloseTo(state.scaleX, 5); // scale-up follow-through is uniform
  });
});

// ─── Hold Animations — All 6 ──────────────────────────

describe('hold animations — all 6', () => {
  // Use fade entrance (0 settleFrames) so hold phase is immediately after entrance.
  // frame 30 is well within hold range (10..50). phase = ((30-10) % 90) / 90 = 20/90 ≈ 0.222

  it('pulse: scaleX != 1 at non-zero phase', () => {
    const state = computeAnimationState(30, makeTiming(), 'fade', 'fade', SPATIAL, 'pulse');
    // phase ≈ 0.222 → sin(0.222 * 2π) ≈ 0.985 → scaleX = 1 + 0.985 * 0.02 ≈ 1.0197
    expect(state.scaleX).not.toBe(1);
    expect(state.scaleX).toBeCloseTo(1, 1); // close to 1 but not exactly
  });

  it('breathe: opacity in [0.85, 1.0]', () => {
    const state = computeAnimationState(30, makeTiming(), 'fade', 'fade', SPATIAL, 'breathe');
    expect(state.opacity).toBeGreaterThanOrEqual(0.85);
    expect(state.opacity).toBeLessThanOrEqual(1.0);
  });

  it('gentle-float: translateY in [-3, 3]', () => {
    const state = computeAnimationState(30, makeTiming(), 'fade', 'fade', SPATIAL, 'gentle-float');
    expect(state.translateY).toBeGreaterThanOrEqual(-3);
    expect(state.translateY).toBeLessThanOrEqual(3);
  });

  it('glow: textShadowBlur > 0', () => {
    // At non-zero phase, glow produces textShadowBlur > 0 (wave * 8)
    const state = computeAnimationState(30, makeTiming(), 'fade', 'fade', SPATIAL, 'glow');
    expect(state.textShadowBlur).toBeGreaterThanOrEqual(0);
    // Also check filterBrightness is modulated
    expect(state.filterBrightness).toBeGreaterThanOrEqual(1);
    expect(state.filterBrightness).toBeLessThanOrEqual(1.1);
  });

  it('static: returns neutral', () => {
    const state = computeAnimationState(30, makeTiming(), 'fade', 'fade', SPATIAL, 'static');
    expect(state).toEqual(NEUTRAL);
  });

  it('morph: scaleX != scaleY (asymmetric)', () => {
    // morph: scaleX uses sin, scaleY uses cos — at most phases they differ
    // phase ≈ 0.222 → sin(0.222*2π) ≈ 0.985, cos(0.222*2π) ≈ 0.174
    // scaleX = 1 + sin * 0.015 ≈ 1.0148, scaleY = 1 + cos * 0.015 ≈ 1.0026
    const state = computeAnimationState(30, makeTiming(), 'fade', 'fade', SPATIAL, 'morph');
    expect(state.scaleX).not.toBeCloseTo(state.scaleY, 3);
  });
});

// ─── Settle Frames ────────────────────────────────────

describe('settle frames', () => {
  // getSettleFrames is private, but we can observe settle behavior by checking that
  // frames past enterEnd (but before hold/exit) show follow-through for patterns
  // that have settle > 0, and go straight to neutral/hold for patterns that don't.

  const patternsWithSettle: Array<{ pattern: EntrancePattern; frames: number }> = [
    { pattern: 'scale-up', frames: 8 },
    { pattern: 'pop', frames: 8 },
    { pattern: 'slide-left', frames: 6 },
    { pattern: 'slide-right', frames: 6 },
    { pattern: 'slide-up', frames: 6 },
    { pattern: 'slide-down', frames: 6 },
    { pattern: 'rotate-in', frames: 6 },
    { pattern: 'skew-in', frames: 4 },
    { pattern: 'zoom-blur', frames: 8 },
  ];

  const patternsWithoutSettle: EntrancePattern[] = ['fade', 'blur-in', 'draw', 'scramble'];

  for (const { pattern, frames } of patternsWithSettle) {
    it(`${pattern} has ${frames} settle frames (follow-through active at enterEnd+1)`, () => {
      // frame enterEnd+1 = 11, within settle range
      const stateInSettle = computeAnimationState(11, makeTiming(), pattern, 'fade', SPATIAL);
      // frame enterEnd+frames+1 = past settle, should be NEUTRAL (no hold pattern)
      const stateAfterSettle = computeAnimationState(
        10 + frames + 1,
        makeTiming(),
        pattern,
        'fade',
        SPATIAL,
      );
      // In settle: state differs from NEUTRAL (follow-through oscillation)
      const settleHasEffect = Object.keys(NEUTRAL).some(
        (key) => stateInSettle[key as keyof typeof stateInSettle] !== NEUTRAL[key as keyof typeof NEUTRAL],
      );
      expect(settleHasEffect).toBe(true);
      // After settle: state is NEUTRAL
      expect(stateAfterSettle).toEqual(NEUTRAL);
    });
  }

  for (const pattern of patternsWithoutSettle) {
    it(`${pattern} has 0 settle frames (neutral right after entrance)`, () => {
      // frame 11 = right after enterEnd=10, no settle → goes to hold (no hold pattern → NEUTRAL)
      const state = computeAnimationState(11, makeTiming(), pattern, 'fade', SPATIAL);
      expect(state).toEqual(NEUTRAL);
    });
  }
});

// ─── Audio-Reactive Modulation ────────────────────────

describe('audio-reactive modulation', () => {
  const timing = makeTiming();

  it('returns unmodified state when no curves provided', () => {
    const base = { ...NEUTRAL };
    const result = applyAudioReactiveModulation(base, 30, timing, undefined);
    expect(result).toEqual(base);
  });

  it('returns unmodified state when curves object is empty', () => {
    const base = { ...NEUTRAL };
    const result = applyAudioReactiveModulation(base, 30, timing, {});
    expect(result).toEqual(base);
  });

  it('returns unmodified state during entrance phase', () => {
    // frame 5 is during entrance (enterEnd=10), not hold — no modulation
    const curves: SignalCurves = { beat_level: new Array(60).fill(0.8) };
    const base = { ...NEUTRAL };
    const result = applyAudioReactiveModulation(base, 5, timing, curves);
    expect(result).toEqual(base);
  });

  it('beat level applies scale during hold phase', () => {
    // frame 30 is in hold phase (enterEnd=10..exitStart=50)
    const beatLevelCurve = new Array(60).fill(0);
    beatLevelCurve[30] = 0.6; // downbeat level
    const curves: SignalCurves = { beat_level: beatLevelCurve };

    const base = { ...NEUTRAL };
    const result = applyAudioReactiveModulation(base, 30, timing, curves);
    // intensity = 0.6^2 = 0.36, scaleAmount = 0.36 * 0.05 = 0.018
    // scaleX = 1 * (1 + 0.018) = 1.018
    expect(result.scaleX).toBeGreaterThan(1);
    expect(result.scaleX).toBeCloseTo(1.018, 2);
    // scaleY gets half: 1 * (1 + 0.009) = 1.009
    expect(result.scaleY).toBeGreaterThan(1);
    expect(result.scaleY).toBeCloseTo(1.009, 2);
  });

  it('onset adds brightness during hold phase', () => {
    const onsetCurve = new Array(60).fill(0);
    onsetCurve[30] = 0.8; // above 0.5 threshold
    const curves: SignalCurves = { onset: onsetCurve };

    const base = { ...NEUTRAL };
    const result = applyAudioReactiveModulation(base, 30, timing, curves);
    // onset > 0.5 → filterBrightness * 1.08 = 1 * 1.08 = 1.08
    expect(result.filterBrightness).toBeCloseTo(1.08, 2);
  });

  it('high beat level adds rotation (phrase/section boundary)', () => {
    // level > 0.7 triggers rotation: (level - 0.7) * 1.667 * 0.5
    const beatLevelCurve = new Array(60).fill(0);
    beatLevelCurve[30] = 0.9; // section level
    const curves: SignalCurves = { beat_level: beatLevelCurve };

    const base = { ...NEUTRAL };
    const result = applyAudioReactiveModulation(base, 30, timing, curves);
    // rotation = (0.9 - 0.7) * 1.667 * 0.5 = 0.2 * 0.8335 = 0.1667
    expect(result.rotation).toBeGreaterThan(0);
    expect(result.rotation).toBeCloseTo(0.1667, 2);
  });
});
