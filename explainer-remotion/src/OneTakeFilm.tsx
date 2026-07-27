import React from 'react';
import {AbsoluteFill, Audio, Easing, interpolate, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {SfxCue, SfxTrack} from './audio';

// One-take engine. Screens are full-frame "stations". Between them, a VARIED, directional transition
// carries momentum from one scene's elements into the next (+ a varied, subtle accent on moving seams) instead of a
// uniform zoom. `exit` per station picks the move: 'zoom' (push into a focal element), 'up'/'down'/
// 'left'/'right' (the camera pans — outgoing slides off, incoming slides in from the matching side =
// movement carries), or 'fade'. Each station animates ON ARRIVAL (local frame via Sequence).
export type Exit = 'zoom' | 'up' | 'down' | 'left' | 'right' | 'fade' | 'cut';
export type Station = {
  key: string;
  node: React.ReactNode;
  hold: number;
  focal?: {x: number; y: number};
  sfx?: SfxCue[];
  exit?: Exit;
};

export const Z = 46;
const DEF_FOCAL = {x: 960, y: 540};
const easeIn = Easing.bezier(0.5, 0, 0.75, 0.25);
const easeSettle = Easing.bezier(0.16, 1, 0.3, 1);
const easeMove = Easing.bezier(0.65, 0, 0.35, 1);

type Win = {inStart: number; holdStart: number; holdEnd: number; isLast: boolean};

export const computeLayout = (stations: Station[]): {wins: Win[]; total: number} => {
  const wins: Win[] = [];
  let t = 0;
  for (let i = 0; i < stations.length; i++) {
    const holdStart = i === 0 ? 0 : t + Z;
    const holdEnd = holdStart + stations[i].hold;
    wins.push({inStart: i === 0 ? 0 : t, holdStart, holdEnd, isLast: i === stations.length - 1});
    t = holdEnd;
  }
  return {wins, total: wins[wins.length - 1].holdEnd};
};

type Vis = {transform: string; transformOrigin: string; opacity: number};

// Compute a station's transform during a transition. dir 'out' = it's leaving; 'in' = it's arriving.
const visual = (type: Exit, dir: 'in' | 'out', pRaw: number, focal: {x: number; y: number}): Vis => {
  const origin = `${focal.x}px ${focal.y}px`;
  if (type === 'zoom') {
    if (dir === 'out') {
      const p = easeIn(pRaw);
      return {transform: `scale(${1 + 5.5 * p})`, transformOrigin: origin, opacity: pRaw < 0.45 ? 1 : Math.max(0, 1 - (pRaw - 0.45) / 0.55)};
    }
    const p = easeSettle(pRaw);
    return {transform: `scale(${0.34 + 0.66 * p})`, transformOrigin: origin, opacity: Math.min(1, pRaw / 0.55)};
  }
  if (type === 'fade') {
    const p = easeMove(pRaw);
    return {transform: `scale(${dir === 'out' ? 1 + 0.05 * p : 0.95 + 0.05 * p})`, transformOrigin: '50% 50%', opacity: dir === 'out' ? 1 - p : p};
  }
  if (type === 'cut') {
    // pure crossfade, NO transform — for match cuts where an element is pixel-aligned across the seam
    // (the aligned element appears to persist while everything else dissolves).
    const p = easeMove(pRaw);
    return {transform: 'none', transformOrigin: '50% 50%', opacity: dir === 'out' ? 1 - p : p};
  }
  // directional slides — outgoing slides off + fades while incoming slides in from the matching side
  // + fades up (shorter travel + crossfade = momentum carries with no empty midpoint).
  const p = easeMove(pRaw);
  const out = dir === 'out';
  const d = (out ? p : 1 - p) * 82;
  let tx = 0;
  let ty = 0;
  if (type === 'up') ty = out ? -d : d; // out goes up; in comes from below
  else if (type === 'down') ty = out ? d : -d;
  else if (type === 'left') tx = out ? -d : d; // out goes left; in comes from right
  else tx = out ? d : -d; // right
  return {transform: `translate(${tx}%, ${ty}%)`, transformOrigin: '50% 50%', opacity: out ? 1 - p : p};
};

export const OneTakeFilm: React.FC<{stations: Station[]; music?: string; musicVolume?: number}> = ({
  stations,
  music,
  musicVolume = 0.5,
}) => {
  const frame = useCurrentFrame();
  const {wins, total} = computeLayout(stations);

  // subtle, VARIED transition accents — only where there's real movement (fades/cuts stay clean/silent),
  // rotating through a few timbres so no single sound (esp. the whoosh) gets overused.
  const TRANS = ['impact', 'whoosh', 'pop'] as const;
  let ti = 0;
  const seamSfx: SfxCue[] = wins.slice(0, -1).flatMap((w, i) => {
    const ex = stations[i].exit ?? 'zoom';
    if (ex === 'fade' || ex === 'cut') return [];
    return [{name: TRANS[ti++ % TRANS.length], at: w.holdEnd - 5, volume: 0.3}];
  });

  return (
    <AbsoluteFill style={{backgroundColor: '#08080A'}}>
      {music && (
        <Audio
          src={staticFile(music)}
          volume={(f) => {
            const inF = interpolate(f, [0, 16], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
            // graceful ~1.4s eased resolve at the very end (squared taper to true silence) — a proper outro, not a hard cut
            const outF = interpolate(f, [total - 84, total], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
            return musicVolume * inF * outF * outF;
          }}
        />
      )}
      <SfxTrack cues={seamSfx} />
      {stations.map((st, i) => (st.sfx ? <SfxTrack key={`sfx-${st.key}`} cues={st.sfx} offset={wins[i].inStart} /> : null))}

      {stations.map((st, i) => {
        const w = wins[i];
        const outEnd = w.isLast ? w.holdEnd : w.holdEnd + Z;
        if (frame < w.inStart - 1 || frame > outEnd + 1) return null;

        let vis: Vis = {transform: 'none', transformOrigin: '50% 50%', opacity: 1};
        if (i > 0 && frame < w.holdStart) {
          const prev = stations[i - 1];
          vis = visual(prev.exit ?? 'zoom', 'in', interpolate(frame, [w.inStart, w.holdStart], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}), prev.focal ?? DEF_FOCAL);
        } else if (!w.isLast && frame > w.holdEnd) {
          vis = visual(st.exit ?? 'zoom', 'out', interpolate(frame, [w.holdEnd, w.holdEnd + Z], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}), st.focal ?? DEF_FOCAL);
        }

        return (
          <AbsoluteFill key={st.key} style={{transform: vis.transform, transformOrigin: vis.transformOrigin, opacity: vis.opacity}}>
            <Sequence from={w.inStart} durationInFrames={outEnd - w.inStart + 1} layout="none">
              {st.node}
            </Sequence>
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};
