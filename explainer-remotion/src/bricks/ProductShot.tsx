import React from 'react';
import {Img, staticFile, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {type Brand, withAlpha} from './brand';
import {DeviceFrame} from './DeviceFrame';

// BRICK: a REAL product screenshot treated like a LIVE screen recording (Screen-Studio style), not a floating
// photo. A cursor glides to a focus hotspot, the camera TRACKS the cursor and dives into that region, a click
// pulses, and a soft spotlight/vignette keeps the eye on the action — so a static screenshot reads as a real
// product demo. `src` is a staticFile path (e.g. "product/app-editor.png") or an http URL.
//   focus  = the 0..1 {x,y} point the cursor moves to and the camera zooms into (the beat's subject).
//   zoom   = dive deeper (feature a detail) vs. a gentler hero push.
//   cursor = show the gliding pointer + click (default true); set false for a pure camera move.

// transform-origin / cursor target, unified so camera, cursor and spotlight all agree on the hotspot.
const parseOrigin = (o: string): {x: number; y: number} => {
  const pm = o.match(/(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%/);
  if (pm) return {x: +pm[1] / 100, y: +pm[2] / 100};
  const x = o.includes('left') ? 0.24 : o.includes('right') ? 0.76 : 0.5;
  const y = o.includes('top') ? 0.22 : o.includes('bottom') ? 0.8 : 0.46;
  return {x, y};
};

export const ProductShot: React.FC<{
  brand: Brand;
  src: string;
  label?: string;
  zoom?: boolean;
  origin?: string; // legacy: used as the hotspot when `focus` is not given
  focus?: {x: number; y: number}; // 0..1 subject the cursor targets + camera dives into
  cursor?: boolean;
  chrome?: boolean; // wrap in a browser DeviceFrame? default false — our app screens already carry their own window chrome
  style?: React.CSSProperties;
}> = ({brand, src, label, zoom = false, origin = 'top center', focus, cursor = true, chrome = false, style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {x: fx, y: fy} = focus ?? parseOrigin(origin);
  const originStr = `${(fx * 100).toFixed(1)}% ${(fy * 100).toFixed(1)}%`;
  // Choreography is anchored to ABSOLUTE frames (scenes run ~90-180f), so it reads identically whether this
  // brick renders standalone in the proof composition (400f), inside a Sequence, or in the full film.
  const CLICK = 72;

  // Camera: settle in → slow push → PUNCH into the focus on the click → keep a live drift after.
  const cam = interpolate(
    frame,
    [0, 42, CLICK, 120],
    [1.03, 1.06, zoom ? 1.28 : 1.12, zoom ? 1.33 : 1.15],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );
  const drift = Math.sin((frame / fps) * 0.7) * 0.5; // never a dead hold
  const enterOp = interpolate(frame, [0, 12], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  // Cursor: glides from a corner to the focus point (springy), dips on click.
  const glide = spring({frame: frame - 10, fps, config: {damping: 28, mass: 0.9, stiffness: 90}});
  const cx = interpolate(glide, [0, 1], [0.16, fx]);
  const cy = interpolate(glide, [0, 1], [0.86, fy]);
  const clickDip = interpolate(frame, [CLICK - 3, CLICK, CLICK + 7], [0, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const ring = interpolate(frame, [CLICK, CLICK + 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const ringOp = interpolate(frame, [CLICK, CLICK + 20], [0.55, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const vignette = interpolate(frame, [CLICK - 8, CLICK + 10], [0, 0.24], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  const url = src.startsWith('http') ? src : staticFile(src);
  const ringD = 12 + 64 * ring;

  const inner = (
    <div style={{position: 'absolute', inset: 0, overflow: 'hidden', opacity: enterOp}}>
      <Img
        src={url}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: originStr,
          transform: `scale(${cam}) translate(${drift}px, ${-drift}px)`,
          transformOrigin: originStr,
        }}
      />
      {/* spotlight/vignette: darken the edges toward the click so the eye lands on the subject */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: `radial-gradient(circle at ${originStr}, transparent 30%, rgba(0,0,0,${vignette}) 100%)`,
        }}
      />
      {cursor && (
        <>
          {/* click pulse ring */}
          <div
            style={{
              position: 'absolute',
              left: `${cx * 100}%`,
              top: `${cy * 100}%`,
              width: ringD,
              height: ringD,
              marginLeft: -ringD / 2,
              marginTop: -ringD / 2,
              borderRadius: '50%',
              border: `2px solid ${brand.colors.accent}`,
              boxShadow: `0 0 12px ${withAlpha(brand.colors.accent, 0.5)}`,
              opacity: ringOp,
              pointerEvents: 'none',
            }}
          />
          {/* pointer */}
          <div
            style={{
              position: 'absolute',
              left: `${cx * 100}%`,
              top: `${cy * 100}%`,
              transform: `translate(-2px, -2px) scale(${1 - 0.14 * clickDip})`,
              transformOrigin: 'top left',
              pointerEvents: 'none',
              filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.55))',
            }}
          >
            <svg width="27" height="27" viewBox="0 0 24 24" fill="none">
              <path d="M6 3 L6 20 L10.2 15.8 L12.8 21.2 L15 20.2 L12.4 14.9 L18.4 14.8 Z" fill="#ffffff" stroke="#0A0A0A" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
          </div>
        </>
      )}
    </div>
  );

  // A user's cropped UI (no window chrome) reads better inside a browser DeviceFrame; our full-window app
  // screens already have chrome, so present them frameless as one clean, premium panel (no double-framing).
  if (chrome) {
    return (
      <DeviceFrame brand={brand} label={label} style={{width: 'min(1040px, 82vw)', height: 600, ...style}}>
        {inner}
      </DeviceFrame>
    );
  }
  return (
    <div
      style={{
        position: 'relative',
        width: 'min(1120px, 86vw)',
        height: 630,
        borderRadius: brand.shape.radius * 1.5,
        overflow: 'hidden',
        border: `1px solid ${brand.colors.border}`,
        boxShadow: `0 40px 120px rgba(0,0,0,0.55), 0 0 0 1px ${withAlpha(brand.colors.accent, 0.06)}`,
        backgroundColor: brand.colors.surface,
        ...style,
      }}
    >
      {inner}
    </div>
  );
};
