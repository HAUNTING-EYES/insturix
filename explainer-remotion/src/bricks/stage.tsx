import React, {createContext, useContext} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand} from './brand';
import {withAlpha, dv} from './brand';

// STAGE — the composition coordinate system. Every scene mounts ONE <Stage>. It establishes the
// title-safe region (middle ~90%) and hands children a fraction-based coordinate space, so nothing
// authored through it can clip: positions are 0..1 of the SAFE region, and text primitives read
// their Region's pixel width to auto-fit. Imagery that should run edge-to-edge goes in <Bleed>
// (full frame, BEHIND safe content). Text inside <Bleed> is structurally impossible — the Fit*
// text primitives throw without a Region context.

const SAFE_X = 0.05; // 5% each side → middle 90%
const SAFE_Y = 0.06;

type StageInfo = {W: number; H: number; sx: number; sy: number; sw: number; sh: number};
const StageCtx = createContext<StageInfo | null>(null);
type RegionInfo = {wPx: number; hPx: number};
const RegionCtx = createContext<RegionInfo | null>(null);

export const useStage = (): StageInfo => {
  const s = useContext(StageCtx);
  if (!s) throw new Error('useStage() must be used inside <Stage>.');
  return s;
};
export const useRegionSize = (): RegionInfo => {
  const r = useContext(RegionCtx);
  if (!r) throw new Error('Text primitives must live inside a <Region> (never in <Bleed>).');
  return r;
};

/** Brand backdrop: bg field + optional editorial grid + gold breathing glow (from brand.decor). */
const Backplate: React.FC<{brand: Brand}> = ({brand}) => {
  const frame = useCurrentFrame();
  const glowPulse = 0.5 + 0.5 * Math.sin(frame * 0.017);
  return (
    <AbsoluteFill style={{backgroundColor: brand.colors.bg}}>
      {brand.decor.grid && (
        <AbsoluteFill
          style={{
            backgroundImage: `linear-gradient(${withAlpha(brand.colors.text, 0.03)} 1px, transparent 1px), linear-gradient(90deg, ${withAlpha(brand.colors.text, 0.03)} 1px, transparent 1px)`,
            backgroundSize: '72px 72px',
          }}
        />
      )}
      {brand.decor.glow && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(52% 42% at 50% 12%, ${withAlpha(brand.colors.accent, 0.05 + 0.03 * glowPulse)}, transparent 70%)`,
          }}
        />
      )}
    </AbsoluteFill>
  );
};

export const Stage: React.FC<{brand: Brand; backdrop?: boolean; children?: React.ReactNode}> = ({
  brand,
  backdrop = true,
  children,
}) => {
  const {width: W, height: H} = useVideoConfig();
  const info: StageInfo = {W, H, sx: W * SAFE_X, sy: H * SAFE_Y, sw: W * (1 - 2 * SAFE_X), sh: H * (1 - 2 * SAFE_Y)};
  return (
    <StageCtx.Provider value={info}>
      <AbsoluteFill style={{overflow: 'hidden', fontFamily: brand.fontSans}}>
        {backdrop && <Backplate brand={brand} />}
        {children}
      </AbsoluteFill>
    </StageCtx.Provider>
  );
};

/** Full-frame layer for IMAGERY only (product surfaces, fields, grids). Renders behind safe content
 *  by default. Text primitives refuse to render here. */
export const Bleed: React.FC<{children?: React.ReactNode; style?: React.CSSProperties}> = ({children, style}) => (
  <AbsoluteFill style={{overflow: 'hidden', ...style}}>{children}</AbsoluteFill>
);

/** A rectangle of the SAFE region in fractions (x,y = top-left; w,h = size; all 0..1 of safe area).
 *  Children are flex-stacked; text primitives inside auto-fit to this width. Cannot clip: the region
 *  is inside the safe area by construction, and Fit* text budgets against wPx. */
export const Region: React.FC<{
  brand: Brand;
  x: number;
  y: number;
  w: number;
  h?: number;
  align?: 'start' | 'center' | 'end'; // cross-axis (horizontal alignment of stacked items)
  justify?: 'start' | 'center' | 'end'; // main-axis (vertical distribution)
  gapScale?: number;
  children?: React.ReactNode;
}> = ({brand, x, y, w, h, align = 'start', justify = 'start', gapScale = 1, children}) => {
  const s = useStage();
  const cx = (v: number) => Math.max(0, Math.min(1, v));
  const left = s.sx + cx(x) * s.sw;
  const top = s.sy + cx(y) * s.sh;
  const wPx = cx(Math.min(w, 1 - cx(x))) * s.sw;
  const hPx = h == null ? s.sh - cx(y) * s.sh : cx(Math.min(h, 1 - cx(y))) * s.sh;
  const map = {start: 'flex-start', center: 'center', end: 'flex-end'} as const;
  return (
    <RegionCtx.Provider value={{wPx, hPx}}>
      <div
        style={{
          position: 'absolute',
          left,
          top,
          width: wPx,
          height: hPx,
          display: 'flex',
          flexDirection: 'column',
          alignItems: map[align],
          justifyContent: map[justify],
          gap: dv(brand, 22, 12) * gapScale,
        }}
      >
        {children}
      </div>
    </RegionCtx.Provider>
  );
};

/** Safe-corner chip anchor for full-bleed scenes: pins children to a corner of the SAFE region. */
export const Corner: React.FC<{
  brand: Brand;
  at: 'tl' | 'tr' | 'bl' | 'br';
  children?: React.ReactNode;
}> = ({brand, at, children}) => {
  const x = at === 'tr' || at === 'br' ? 0.62 : 0;
  const y = at === 'bl' || at === 'br' ? 0.84 : 0;
  const align = at === 'tr' || at === 'br' ? 'end' : 'start';
  const justify = at === 'bl' || at === 'br' ? 'end' : 'start';
  return (
    <Region brand={brand} x={x} y={y} w={0.38} h={0.16} align={align} justify={justify} gapScale={0.6}>
      {children}
    </Region>
  );
};
