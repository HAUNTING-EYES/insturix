// Shared animation helpers so every scene uses the brand's signature easing and a consistent
// enter/exit fade. EASE mirrors the front-end's --ease-out: cubic-bezier(0.16, 1, 0.3, 1).
import {Easing, interpolate, useCurrentFrame} from 'remotion';

export const EASE = Easing.bezier(0.16, 1, 0.3, 1);

// Funky spring configs. POP overshoots hard (bouncy hero pops); SNAP is fast with a light
// overshoot (UI elements). Both read far more alive than the old critically-damped 200.
export const POP = {damping: 12, mass: 0.72, stiffness: 130};
export const SNAP = {damping: 20, mass: 0.6, stiffness: 200};

/** Opacity that fades in at the start of a scene and out at the end (frame is sequence-local). */
export const useFade = (durationInFrames: number, inFrames = 12, outFrames = 14): number => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, inFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const exit = interpolate(frame, [durationInFrames - outFrames, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return Math.min(enter, exit);
};

/** Eased 0→1 reveal between two frames. */
export const reveal = (frame: number, from: number, to: number): number =>
  interpolate(frame, [from, to], [0, 1], {
    easing: EASE,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

/** Slow sinusoidal "stay motion" so held shots breathe instead of freezing. Returns px offsets. */
export const useDrift = (ampX = 0, ampY = 6, period = 200, phase = 0): {x: number; y: number} => {
  const frame = useCurrentFrame();
  const t = (frame + phase) * ((2 * Math.PI) / period);
  return {x: Math.sin(t) * ampX, y: Math.cos(t) * ampY};
};
