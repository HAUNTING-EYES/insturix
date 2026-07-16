/**
 * MG Codegen kit — non-text marks & data-viz primitives (Wave-3 bespoke build, 2026-07-16).
 *
 * WHY: the kit was text-only (FitHeadline/TextBlock/Chip) and the prompt told the model to hand-roll every
 * non-text graphic in raw SVG — which a turbo model does unreliably (or avoids), so output collapsed to text.
 * Tier-A's engine already has a rich non-text vocabulary (data-viz, shapes, marks, rules, beat-reactive motion);
 * this ports the CORE of it into the codegen kit as COMPOSABLE, brand-locked, frame-animated primitives.
 *
 * Rule 11: these are PRIMITIVES the model composes, NOT chart templates. A bar chart = N <Bar>. A gauge = a
 * <Ring>. A trend = a <Plot>. Structure = <Rule>/<Plate>/<Dot>. Colour comes ONLY from brand tokens; motion ONLY
 * from the frame (grow() = brand-eased 0→1). Every value is a real 0..1 the caller passes (perceptual honesty).
 */
import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import type { Brand } from './brand';
import { withAlpha, dv } from './brand';
import { EASE } from './choreo';

type Tone = 'accent' | 'text' | 'muted';
const toneOf = (brand: Brand, t: Tone = 'accent'): string =>
  t === 'accent' ? brand.colors.accent : t === 'muted' ? brand.colors.muted : brand.colors.text;
const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/** Brand-eased 0→1 growth from frame `at` over `dur` frames. The one motion source for every mark here. */
const grow = (frame: number, at: number, dur: number): number =>
  interpolate(frame, [at, at + Math.max(1, dur)], [0, 1], { easing: EASE, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

/**
 * A value BAR that grows to `value` (0..1 of its track). Compose several for a bar chart / comparison.
 * Horizontal by default; `vertical` grows from the bottom. `track` draws the faint full-length rail behind it.
 */
export const Bar: React.FC<{
  brand: Brand; value: number; at?: number; dur?: number; tone?: Tone; thickness?: number; vertical?: boolean; track?: boolean; radius?: number;
}> = ({ brand, value, at = 0, dur = 18, tone = 'accent', thickness = 14, vertical = false, track = true, radius }) => {
  const frame = useCurrentFrame();
  const fill = grow(frame, at, dur) * clamp01(value);
  const color = toneOf(brand, tone);
  const r = radius ?? thickness / 2;
  const rail: React.CSSProperties = vertical
    ? { position: 'relative', width: thickness, height: '100%', borderRadius: r, background: track ? withAlpha(brand.colors.text, 0.1) : 'transparent' }
    : { position: 'relative', width: '100%', height: thickness, borderRadius: r, background: track ? withAlpha(brand.colors.text, 0.1) : 'transparent' };
  const bar: React.CSSProperties = vertical
    ? { position: 'absolute', bottom: 0, left: 0, width: '100%', height: `${fill * 100}%`, borderRadius: r, background: color }
    : { position: 'absolute', top: 0, left: 0, height: '100%', width: `${fill * 100}%`, borderRadius: r, background: color };
  return (
    <div style={rail}>
      <div style={bar} />
    </div>
  );
};

/**
 * A progress RING (arc gauge). Sweeps to `value` (0..1) of a full circle. Compose with a centred FitHeadline/
 * value for a "metric fills to its true fraction" moment. `gap` leaves the arc open at the bottom when < 1.
 */
export const Ring: React.FC<{
  brand: Brand; value: number; at?: number; dur?: number; tone?: Tone; size?: number; thickness?: number; track?: boolean;
}> = ({ brand, value, at = 0, dur = 22, tone = 'accent', size = 160, thickness = 12, track = true }) => {
  const frame = useCurrentFrame();
  const fill = grow(frame, at, dur) * clamp01(value);
  const color = toneOf(brand, tone);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {track && <circle cx={cx} cy={cx} r={r} fill="none" stroke={withAlpha(brand.colors.text, 0.12)} strokeWidth={thickness} />}
      <circle
        cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={thickness} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - fill)} transform={`rotate(-90 ${cx} ${cx})`}
      />
    </svg>
  );
};

/**
 * A PLOT — a line (optionally area-filled) that draws on left→right. `points` are y-values (any scale);
 * normalised internally. For a real trend, pass the true series. `area` fills under the line with a fade.
 */
export const Plot: React.FC<{
  brand: Brand; points: number[]; at?: number; dur?: number; tone?: Tone; width?: number; height?: number; area?: boolean; thickness?: number;
}> = ({ brand, points, at = 0, dur = 26, tone = 'accent', width = 320, height = 140, area = true, thickness = 3 }) => {
  const frame = useCurrentFrame();
  const p = grow(frame, at, dur);
  const color = toneOf(brand, tone);
  const id = React.useId().replace(/:/g, '');
  const vals = (points ?? []).filter((v) => Number.isFinite(v));
  if (vals.length < 2) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const pad = thickness + 2;
  const stepX = (width - pad * 2) / (vals.length - 1);
  const pts = vals.map((v, i) => ({ x: pad + i * stepX, y: pad + (height - pad * 2) * (1 - (v - min) / range) }));
  const d = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');
  const len = pts.reduce((acc, pt, i) => (i === 0 ? 0 : acc + Math.hypot(pt.x - pts[i - 1].x, pt.y - pts[i - 1].y)), 0);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {area && (
        <>
          <defs>
            <linearGradient id={`pf${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22 * p} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {p > 0.25 && <path d={`${d} L ${pts[pts.length - 1].x.toFixed(1)} ${height} L ${pts[0].x.toFixed(1)} ${height} Z`} fill={`url(#pf${id})`} opacity={Math.min(1, (p - 0.25) * 2)} />}
        </>
      )}
      <path d={d} fill="none" stroke={color} strokeWidth={thickness} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={len} strokeDashoffset={len * (1 - p)} />
    </svg>
  );
};

/** A RULE — a line that draws on (underline, divider, connector, axis). Horizontal by default. */
export const Rule: React.FC<{
  brand: Brand; at?: number; dur?: number; tone?: Tone; thickness?: number; vertical?: boolean;
}> = ({ brand, at = 0, dur = 14, tone = 'accent', thickness = 3, vertical = false }) => {
  const frame = useCurrentFrame();
  const p = grow(frame, at, dur);
  const color = toneOf(brand, tone);
  return (
    <div style={vertical
      ? { width: thickness, height: `${p * 100}%`, background: color, borderRadius: thickness }
      : { width: `${p * 100}%`, height: thickness, background: color, borderRadius: thickness }}
    />
  );
};

/**
 * A PLATE — a rounded brand surface / scrim that fades+lifts in. Backs a group or holds legibility.
 * `surface` = the SURFACE AXIS (atomize-the-style, axis 4) — a NAMED mode a style preset maps straight onto:
 *   flat    (default, unchanged): translucent brand scrim + hairline border.
 *   frosted (glass-LOOK): lighter fill + a top sheen + soft light border. ⚠ Does NOT blur the footage — the MG
 *           renders on transparent alpha, so there is nothing behind to blur; true footage-blur is a
 *           compositing-stage effect, not a kit knob. This is the panel LOOK, honestly.
 *   raised  (material elevation): opaque surfaceAlt fill + a soft drop shadow.
 *   glow    (neon / emphasis): brand-accent border + an accent halo that fades in with the plate.
 * The kit builds every treatment from brand tokens only — the model just picks the mode (scan-safe, brand-locked).
 */
export const Plate: React.FC<{
  brand: Brand; at?: number; dur?: number; opacity?: number; radius?: number;
  surface?: 'flat' | 'frosted' | 'raised' | 'glow'; children?: React.ReactNode;
}> = ({ brand, at = 0, dur = 12, opacity = 0.9, radius, surface = 'flat', children }) => {
  const frame = useCurrentFrame();
  const p = grow(frame, at, dur);
  const treatment: React.CSSProperties =
    surface === 'frosted'
      ? {
          background: withAlpha(brand.colors.surface, opacity * 0.55),
          backgroundImage: `linear-gradient(155deg, ${withAlpha(brand.colors.text, 0.06)}, transparent 55%)`,
          border: `${brand.shape.border}px solid ${withAlpha(brand.colors.text, 0.14)}`,
        }
      : surface === 'raised'
        ? {
            background: withAlpha(brand.colors.surfaceAlt, Math.min(1, opacity + 0.08)),
            border: `${brand.shape.border}px solid ${brand.colors.border}`,
            boxShadow: `0 ${dv(brand, 6, 10)}px ${dv(brand, 20, 34)}px rgba(0,0,0,0.34)`,
          }
        : surface === 'glow'
          ? {
              background: withAlpha(brand.colors.surface, opacity),
              border: `${brand.shape.border}px solid ${withAlpha(brand.colors.accent, 0.5)}`,
              boxShadow: `0 0 ${dv(brand, 22, 40)}px ${withAlpha(brand.colors.accent, 0.34 * p)}`,
            }
          : {
              background: withAlpha(brand.colors.surface, opacity),
              border: `${brand.shape.border}px solid ${brand.colors.border}`,
            };
  return (
    <div style={{
      ...treatment,
      borderRadius: radius ?? brand.shape.radius,
      opacity: p,
      transform: `translateY(${(1 - p) * 10}px)`,
    }}>
      {children}
    </div>
  );
};

/** A DOT — a small accent mark that pops in (annotation, bullet, node, beat mark). */
export const Dot: React.FC<{ brand: Brand; at?: number; dur?: number; tone?: Tone; size?: number }> = ({ brand, at = 0, dur = 8, tone = 'accent', size = 12 }) => {
  const frame = useCurrentFrame();
  const p = grow(frame, at, dur);
  return <div style={{ width: size, height: size, borderRadius: 999, background: toneOf(brand, tone), transform: `scale(${p})`, opacity: p }} />;
};

/** A REVEAL — clip-path wipe that unmasks its children over `dur` from `at`. `from` = the edge the wipe starts. */
export const Reveal: React.FC<{ at?: number; dur?: number; from?: 'left' | 'right' | 'up' | 'down'; children?: React.ReactNode }> = ({ at = 0, dur = 16, from = 'left', children }) => {
  const frame = useCurrentFrame();
  const inset = (1 - grow(frame, at, dur)) * 100;
  const clip =
    from === 'right' ? `inset(0 0 0 ${inset}%)`
      : from === 'up' ? `inset(0 0 ${inset}% 0)`
        : from === 'down' ? `inset(${inset}% 0 0 0)`
          : `inset(0 ${inset}% 0 0)`; // left (default)
  return <div style={{ clipPath: clip, WebkitClipPath: clip }}>{children}</div>;
};

/** PARTICLES — a DETERMINISTIC animated field (fills its positioned parent; for emphasis moments, not content).
 *  dust = slow rising motes; bokeh = soft blurred floats; sparks = burst outward + fade; confetti = fall + spin. */
export const Particles: React.FC<{ brand: Brand; kind?: 'dust' | 'bokeh' | 'sparks' | 'confetti'; count?: number; at?: number; tone?: Tone }> = ({ brand, kind = 'dust', count = 24, at = 0, tone = 'accent' }) => {
  const frame = useCurrentFrame();
  const color = toneOf(brand, tone);
  const t = Math.max(0, frame - at);
  const n = Math.max(1, Math.min(80, Math.round(count)));
  // deterministic pseudo-random from index (no Math.random — the scan bans it; renders identically every time).
  const rnd = (i: number, seed: number): number => { const v = Math.sin((i + 1) * seed) * 43758.5453; return v - Math.floor(v); };
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {Array.from({ length: n }, (_, i) => {
        const x = rnd(i, 12.9898) * 100;
        const baseY = rnd(i, 78.233) * 100;
        const cycle = 60 + rnd(i, 9.4) * 60;
        const prog = ((t + rnd(i, 3.17) * cycle) % cycle) / cycle;
        const size = kind === 'bokeh' ? 10 + rnd(i, 5.1) * 22 : kind === 'confetti' ? 6 + rnd(i, 7.7) * 6 : 2 + rnd(i, 2.3) * 3;
        const style: React.CSSProperties = { position: 'absolute', width: size, height: size, borderRadius: 999, background: color };
        if (kind === 'sparks') {
          const a = rnd(i, 4.4) * Math.PI * 2; const r = prog * 28;
          style.left = `${x + Math.cos(a) * r}%`; style.top = `${baseY + Math.sin(a) * r}%`; style.opacity = Math.max(0, 1 - prog);
        } else if (kind === 'confetti') {
          style.left = `${x}%`; style.top = `${baseY - 10 + prog * 45}%`; style.opacity = Math.max(0, 1 - prog);
          style.borderRadius = 2; style.transform = `rotate(${prog * 360}deg)`;
        } else if (kind === 'bokeh') {
          style.left = `${x}%`; style.top = `${baseY - prog * 6}%`; style.opacity = 0.08 + (0.5 + 0.5 * Math.sin(prog * Math.PI * 2)) * 0.16; style.filter = 'blur(2px)';
        } else { // dust
          style.left = `${x}%`; style.top = `${baseY - prog * 12}%`; style.opacity = 0.15 + (0.5 + 0.5 * Math.sin(prog * Math.PI * 2)) * 0.35;
        }
        return <div key={i} style={style} />;
      })}
    </div>
  );
};
