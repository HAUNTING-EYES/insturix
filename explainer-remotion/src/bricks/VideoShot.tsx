import React from 'react';
import {AbsoluteFill, OffthreadVideo, staticFile, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {type Brand, withAlpha} from './brand';

// BRICK: a REAL product SCREEN RECORDING playing full-bleed — a user's screen capture, or (for our own demo)
// our animated UI screens rendered to video. The product actually MOVES (prompt types, clicks land, counters
// tick, timeline builds) instead of sitting as a frozen screenshot — which is the single biggest thing that
// separated our hand-built film and Lovable from the static-PNG output. Same Screen-Studio framing as
// FullBleedProduct: edge-to-edge, a slow push toward the focus point, and a legibility scrim for corner text.
export const VideoShot: React.FC<{
  brand: Brand;
  src: string; // staticFile path e.g. "product/motion/app-editor.mp4" (or an http url)
  focus?: {x: number; y: number}; // 0..1 subject the camera drifts toward (from the vision region map)
  push?: number; // extra scale across the scene (0.03–0.1)
  scrim?: 'bottom' | 'left' | 'right' | 'none';
}> = ({brand, src, focus = {x: 0.5, y: 0.42}, push = 0.06, scrim = 'bottom'}) => {
  const frame = useCurrentFrame();
  const {durationInFrames: D} = useVideoConfig();
  const p = interpolate(frame, [0, Math.max(1, D)], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const scale = 1.02 + push * p;
  const dx = (0.5 - focus.x) * 40 * p;
  const dy = (0.5 - focus.y) * 30 * p;
  const originStr = `${(focus.x * 100).toFixed(1)}% ${(focus.y * 100).toFixed(1)}%`;
  const enterOp = interpolate(frame, [0, 10], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const url = src.startsWith('http') ? src : staticFile(src);
  const dir = {bottom: '0deg', top: '180deg', left: '90deg', right: '270deg'}[scrim === 'none' ? 'bottom' : scrim];
  return (
    <AbsoluteFill style={{overflow: 'hidden', backgroundColor: brand.colors.bg, opacity: enterOp}}>
      <OffthreadVideo
        src={url}
        muted
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: originStr,
          transform: `scale(${scale}) translate(${dx}px, ${dy}px)`,
          transformOrigin: originStr,
        }}
      />
      {scrim !== 'none' && (
        <AbsoluteFill
          style={{background: `linear-gradient(${dir}, ${withAlpha(brand.colors.bg, 0.82)} 0%, ${withAlpha(brand.colors.bg, 0.4)} 26%, transparent 58%)`}}
        />
      )}
    </AbsoluteFill>
  );
};
