import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import type {Brand} from './brand';
import {withAlpha} from './brand';
import {DeviceFrame} from './DeviceFrame';
import {UIMock} from './UIMock';
import {useCursorZoomCamera} from '../anim-ui';

// FORM: "cursor walkthrough" — Screen-Studio shot. Camera zooms toward the cursor + tracks it; the pointer
// glides to a target and clicks (ripple). Copy prop-driven; chrome/colour/motion from brand.
export type CursorProps = {caption?: string; captionAccent?: string; navActive?: number};

const DEVICE = {left: 300, top: 150, width: 1320, height: 780};
const TARGET = {x: 700, y: 430};

const BrandCursor: React.FC<{brand: Brand; x: number; y: number; clickAt: number}> = ({brand, x, y, clickAt}) => {
  const frame = useCurrentFrame();
  const ripple = frame >= clickAt ? interpolate(frame, [clickAt, clickAt + 18], [0, 1], {extrapolateRight: 'clamp'}) : 0;
  const press = frame >= clickAt ? interpolate(frame, [clickAt, clickAt + 4, clickAt + 12], [1, 0.86, 1], {extrapolateRight: 'clamp'}) : 1;
  return (
    <div style={{position: 'absolute', left: x, top: y, zIndex: 60, transform: `scale(${press})`}}>
      {ripple > 0 && ripple < 1 ? (
        <div style={{position: 'absolute', left: -2, top: -2, width: 14 + ripple * 44, height: 14 + ripple * 44, marginLeft: -(7 + ripple * 22), marginTop: -(7 + ripple * 22), borderRadius: '50%', border: `2.5px solid ${brand.colors.accent}`, opacity: 1 - ripple}} />
      ) : null}
      <svg width="30" height="30" viewBox="0 0 24 24" style={{display: 'block', marginLeft: -5, marginTop: -3, filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.45))'}}>
        <path d="M5 3l14 8-6 1.6L9.6 18z" fill={brand.colors.text} stroke={brand.colors.bg} strokeWidth="1.1" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

export const CursorWalkthrough: React.FC<{brand: Brand} & CursorProps> = ({
  brand,
  caption = 'One click —',
  captionAccent = 'straight to the insight.',
  navActive = 2,
}) => {
  const frame = useCurrentFrame();
  const c = brand.colors;
  const clickAt = 46;
  const points = [
    {x: 1360, y: 840, at: 0},
    {x: TARGET.x, y: TARGET.y, at: clickAt, click: true},
  ];
  const cam = useCursorZoomCamera(points, {zoom: 1.42, zoomInStart: 6, zoomInEnd: clickAt, releaseAt: 400, center: true});
  const t = interpolate(frame, [0, clickAt], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const cx = interpolate(t, [0, 1], [points[0].x, points[1].x]);
  const cy = interpolate(t, [0, 1], [points[0].y, points[1].y]);
  const boom = interpolate(frame, [clickAt, clickAt + 3, clickAt + 16], [0, 0.4, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill style={{background: c.bg, fontFamily: brand.fontSans, overflow: 'hidden'}}>
      {brand.decor.grid ? (
        <AbsoluteFill style={{backgroundImage: `linear-gradient(90deg, ${withAlpha(c.text, 0.04)} 1px, transparent 1px), linear-gradient(0deg, ${withAlpha(c.text, 0.035)} 1px, transparent 1px)`, backgroundSize: '72px 72px', opacity: 0.5}} />
      ) : null}
      <div style={{position: 'absolute', inset: 0, ...cam}}>
        <div style={{position: 'absolute', left: DEVICE.left, top: DEVICE.top, width: DEVICE.width, height: DEVICE.height}}>
          <DeviceFrame brand={brand} style={{width: '100%', height: '100%'}}>
            <UIMock brand={brand} activeNav={navActive} />
          </DeviceFrame>
        </div>
        <BrandCursor brand={brand} x={cx} y={cy} clickAt={clickAt} />
      </div>
      {boom > 0.001 ? <AbsoluteFill style={{background: `radial-gradient(circle at ${TARGET.x}px ${TARGET.y}px, ${withAlpha(c.accent, boom)}, transparent 24%)`}} /> : null}
      <div style={{position: 'absolute', bottom: '6%', left: 0, right: 0, textAlign: 'center', opacity: interpolate(frame, [10, 26], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>
        <span style={{fontFamily: brand.fontSans, fontSize: 30, fontWeight: 700, color: c.text, background: withAlpha(c.bg, brand.decor.glow ? 0.5 : 0.0), padding: '10px 22px', borderRadius: brand.shape.radius}}>
          {caption} <span style={{color: c.accent}}>{captionAccent}</span>
        </span>
      </div>
    </AbsoluteFill>
  );
};
