import {Easing, interpolate} from 'remotion';
import type {SceneSpec} from './scene-graph';

// Momentum transitions between scenes (ported/adapted from the explainer's one-take engine). Instead of a
// flat opacity crossfade, the outgoing scene pushes/slides off while the incoming pushes/slides in from the
// matching direction — movement carries across the cut. `zoom` = a push-through "dive" (reads like diving
// into the product); slides carry lateral momentum; fade is the calm close.
export type TransType = 'zoom' | 'up' | 'down' | 'left' | 'right' | 'fade';
export type Vis = {transform: string; transformOrigin: string; opacity: number};

const easeIn = Easing.bezier(0.5, 0, 0.75, 0.25);
const easeSettle = Easing.bezier(0.16, 1, 0.3, 1);
const easeMove = Easing.bezier(0.65, 0, 0.35, 1);

export const transVisual = (type: TransType, dir: 'in' | 'out', pRaw: number): Vis => {
  if (type === 'zoom') {
    if (dir === 'out') {
      const p = easeIn(pRaw);
      return {transform: `scale(${1 + 0.45 * p})`, transformOrigin: '62% 48%', opacity: 1 - Math.max(0, (pRaw - 0.3) / 0.7)};
    }
    const p = easeSettle(pRaw);
    return {transform: `scale(${1.12 - 0.12 * p})`, transformOrigin: '62% 48%', opacity: Math.min(1, pRaw / 0.5)};
  }
  if (type === 'fade') {
    const p = easeMove(pRaw);
    return {transform: `scale(${dir === 'out' ? 1 + 0.03 * p : 0.98 + 0.02 * p})`, transformOrigin: '50% 50%', opacity: dir === 'out' ? 1 - p : p};
  }
  const p = easeMove(pRaw);
  const out = dir === 'out';
  const d = (out ? p : 1 - p) * 42;
  let tx = 0;
  let ty = 0;
  if (type === 'up') ty = out ? -d : d;
  else if (type === 'down') ty = out ? d : -d;
  else if (type === 'left') tx = out ? -d : d;
  else tx = out ? d : -d;
  return {transform: `translate(${tx}%, ${ty}%)`, transformOrigin: '50% 50%', opacity: out ? 1 - p : p};
};

// MATCH-CUT transition (ported from the one-take engine): a real push-through dive whose transform-origin is
// the SUBJECT's pixel focal point, not a fixed spot. Outgoing scene dives HARD into `focal` while dissolving;
// incoming scene emerges FROM the same `focal`, growing to rest — so the camera reads as one continuous move
// into the next scene's subject instead of a generic cross-zoom. `focal` is in composition pixels.
export const matchCutVisual = (type: TransType, dir: 'in' | 'out', pRaw: number, focal: {x: number; y: number}): Vis => {
  const origin = `${focal.x}px ${focal.y}px`;
  if (type === 'zoom') {
    if (dir === 'out') {
      const p = easeIn(pRaw);
      return {transform: `scale(${1 + 2.6 * p})`, transformOrigin: origin, opacity: pRaw < 0.5 ? 1 : Math.max(0, 1 - (pRaw - 0.5) / 0.5)};
    }
    const p = easeSettle(pRaw);
    return {transform: `scale(${0.52 + 0.48 * p})`, transformOrigin: origin, opacity: Math.min(1, pRaw / 0.5)};
  }
  if (type === 'fade') {
    const p = easeMove(pRaw);
    return {transform: `scale(${dir === 'out' ? 1 + 0.04 * p : 0.97 + 0.03 * p})`, transformOrigin: origin, opacity: dir === 'out' ? 1 - p : p};
  }
  const p = easeMove(pRaw);
  const out = dir === 'out';
  const d = (out ? p : 1 - p) * 62;
  let tx = 0;
  let ty = 0;
  if (type === 'up') ty = out ? -d : d;
  else if (type === 'down') ty = out ? d : -d;
  else if (type === 'left') tx = out ? -d : d;
  else tx = out ? d : -d;
  return {transform: `translate(${tx}%, ${ty}%)`, transformOrigin: origin, opacity: out ? 1 - p : p};
};

// How each form hands off to the next: product scenes "dive" (zoom), comparison slides, the outro fades.
export const exitFor = (spec: SceneSpec | undefined): TransType => {
  if (!spec) return 'fade';
  if (spec.form === 'split') return 'left';
  if (spec.form === 'logo') return 'fade';
  return 'zoom'; // hero, cursor → push into the product
};

export const clampP = (frame: number, start: number, end: number): number =>
  interpolate(frame, [start, end], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
