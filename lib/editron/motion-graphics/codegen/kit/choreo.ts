/**
 * MG Codegen kit — Choreo (time as a computed quantity). PORTED VERBATIM from
 * explainer-remotion/src/bricks/choreo.ts. MG Codegen Lane E0, §5.
 *
 * A scene's arc is four PHASES derived from its duration and the brand's motion energy; elements anchor
 * to phases (never to hand-typed frame windows), enter through a small verb set whose physics come from
 * brand.motion, and hit on the beat grid. The model composes VERBS + ANCHORS; every number is derived.
 * (Rule 11: choreography is COMPUTED from tokens, never hardcoded frame windows.)
 */
import { Easing, interpolate, spring } from 'remotion';
import type { Brand } from './brand';

export const EASE = Easing.bezier(0.16, 1, 0.3, 1);

export type Phases = { intro: number; build: number; resolve: number; durF: number };

/** intro→build→hold→resolve, computed from duration + energy. Anchor everything to these. */
export const phases = (durF: number, brand: Brand): Phases => {
  const e = brand.motion.energy;
  const intro = Math.round(Math.min(28, Math.max(10, durF * (0.2 - 0.08 * e))));
  const build = Math.round(durF * (0.5 - 0.06 * e));
  const resolve = Math.round(durF * 0.84);
  return { intro, build, resolve, durF };
};

/** Per-index entrance offset from brand energy. */
export const stagger = (brand: Brand, i: number): number =>
  i * interpolate(brand.motion.energy, [0, 1], [6, 2.4]);

const springOf = (brand: Brand, frame: number, at: number, fps: number) =>
  spring({
    frame: frame - at,
    fps,
    config: {
      damping: interpolate(brand.motion.overshoot, [0, 1], [26, 11]),
      mass: 0.62,
      stiffness: 150 + brand.motion.energy * 70,
    },
  });

export type EnterKind = 'rise' | 'scale' | 'fade' | 'blurIn' | 'sweepL' | 'sweepR';

/** Entrance verb → style. All physics from brand.motion; distance scales with the element via `unit`. */
export const enter = (
  brand: Brand,
  frame: number,
  at: number,
  fps: number,
  kind: EnterKind = 'rise',
  unit = 24,
): React.CSSProperties => {
  const s = springOf(brand, frame, at, fps);
  const o = Math.max(0, Math.min(1, s));
  const d = (1 - s) * unit;
  switch (kind) {
    case 'scale':
      return { opacity: o, transform: `scale(${0.86 + 0.14 * s})` };
    case 'fade':
      return { opacity: o };
    case 'blurIn':
      return { opacity: o, filter: `blur(${(1 - o) * 14}px)`, transform: `scale(${1.03 - 0.03 * o})` };
    case 'sweepL':
      return { opacity: o, transform: `translateX(${-d * 2.2}px)` };
    case 'sweepR':
      return { opacity: o, transform: `translateX(${d * 2.2}px)` };
    default:
      return { opacity: o, transform: `translateY(${d}px)` };
  }
};

/** Scene-exit style: settle then release in the last beats. Compose onto the root Region. */
export const exitOut = (frame: number, ph: Phases, kind: 'fade' | 'rise' = 'fade'): React.CSSProperties => {
  const t = interpolate(frame, [ph.resolve + (ph.durF - ph.resolve) * 0.55, ph.durF], [0, 1], {
    easing: Easing.in(Easing.quad),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return kind === 'rise' ? { opacity: 1 - t, transform: `translateY(${-t * 26}px)` } : { opacity: 1 - t };
};

/** One-shot emphasis pop at a frame (word hit, beat hit). Multiply into a transform. */
export const pulseAt = (frame: number, at: number, strength = 0.06): number => {
  const t = frame - at;
  return t < 0 ? 0 : strength * Math.exp(-t / 7);
};

/** Eased integer count-up anchored to a phase. */
export const countUp = (frame: number, at: number, dur: number, to: number, from = 0): number =>
  Math.round(
    interpolate(frame, [at, at + Math.max(1, dur)], [from, to], {
      easing: EASE,
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );

/** 0..1 progress between two phase anchors, brand-eased. */
export const progress = (frame: number, from: number, to: number): number =>
  interpolate(frame, [from, to], [0, 1], { easing: EASE, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

/** Continuous camera travel (px) across the scene for rails/pans. */
export const travel = (frame: number, ph: Phases, distance: number): number =>
  interpolate(frame, [ph.intro * 0.5, ph.resolve], [0, -distance], {
    easing: Easing.bezier(0.3, 0, 0.25, 1),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
