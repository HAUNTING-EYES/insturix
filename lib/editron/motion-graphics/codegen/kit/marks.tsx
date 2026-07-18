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
import type { Brand, SurfaceMode } from './brand';
import { withAlpha, dv, materialSurface } from './brand';
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
 *
 * `label` / `valueText` are the mark's OWN readout slots (matrix autopsy 2026-07-18: the #1 unfaithful class was
 * labels rendered WITHOUT their values — "Before s" — because composing Text beside a Bar by hand gets dropped).
 * The mark renders its bound name + REAL figure itself, brand-typed, fading in with the fill. Still a primitive:
 * the caller passes the strings (from `data`), the kit owns only the treatment (Rule 11).
 */
export const Bar: React.FC<{
  brand: Brand; value: number; at?: number; dur?: number; tone?: Tone; thickness?: number; vertical?: boolean; track?: boolean; radius?: number;
  label?: string; valueText?: string;
}> = ({ brand, value, at = 0, dur = 18, tone = 'accent', thickness = 14, vertical = false, track = true, radius, label, valueText }) => {
  const frame = useCurrentFrame();
  const p = grow(frame, at, dur);
  const fill = p * clamp01(value);
  const color = toneOf(brand, tone);
  const r = radius ?? thickness / 2;
  const rail: React.CSSProperties = vertical
    ? { position: 'relative', width: thickness, height: '100%', borderRadius: r, background: track ? withAlpha(brand.colors.text, 0.1) : 'transparent' }
    : { position: 'relative', width: '100%', height: thickness, borderRadius: r, background: track ? withAlpha(brand.colors.text, 0.1) : 'transparent' };
  const bar: React.CSSProperties = vertical
    ? { position: 'absolute', bottom: 0, left: 0, width: '100%', height: `${fill * 100}%`, borderRadius: r, background: color }
    : { position: 'absolute', top: 0, left: 0, height: '100%', width: `${fill * 100}%`, borderRadius: r, background: color };
  const railEl = (
    <div style={rail}>
      <div style={bar} />
    </div>
  );
  if (!label && !valueText) return railEl;
  // Readout treatment: label = quiet name (text tone), valueText = the figure in the bar's own tone (the claim
  // lands WITH the mark). Sizes density-scaled ⚠ craft-tuned; tabular numerals so counts don't jitter.
  const labelStyle: React.CSSProperties = { fontSize: dv(brand, 15, 13), color: withAlpha(brand.colors.text, 0.85), opacity: p, lineHeight: 1.2 };
  const valueStyle: React.CSSProperties = { fontSize: dv(brand, 18, 16), fontWeight: 600, color, opacity: p, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 };
  if (vertical) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: dv(brand, 8, 5), height: '100%' }}>
        {valueText ? <div style={valueStyle}>{valueText}</div> : null}
        <div style={{ flex: 1, display: 'flex', alignItems: 'stretch' }}>{railEl}</div>
        {label ? <div style={labelStyle}>{label}</div> : null}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: dv(brand, 6, 4), width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: dv(brand, 12, 8) }}>
        {label ? <div style={labelStyle}>{label}</div> : <div />}
        {valueText ? <div style={valueStyle}>{valueText}</div> : null}
      </div>
      {railEl}
    </div>
  );
};

/**
 * A progress RING (arc gauge). Sweeps to `value` (0..1) of a full circle. `label`/`valueText` render the mark's
 * own centred readout (name + REAL figure from `data`) — same faithfulness slots as Bar, same Rule-11 stance.
 */
export const Ring: React.FC<{
  brand: Brand; value: number; at?: number; dur?: number; tone?: Tone; size?: number; thickness?: number; track?: boolean;
  label?: string; valueText?: string;
}> = ({ brand, value, at = 0, dur = 22, tone = 'accent', size = 160, thickness = 12, track = true, label, valueText }) => {
  const frame = useCurrentFrame();
  const p = grow(frame, at, dur);
  const fill = p * clamp01(value);
  const color = toneOf(brand, tone);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const svg = (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {track && <circle cx={cx} cy={cx} r={r} fill="none" stroke={withAlpha(brand.colors.text, 0.12)} strokeWidth={thickness} />}
      <circle
        cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={thickness} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - fill)} transform={`rotate(-90 ${cx} ${cx})`}
      />
    </svg>
  );
  if (!label && !valueText) return svg;
  // Centred readout (the classic gauge): valueText = the figure, label = the quiet name under it. Sizes are
  // fractions of the ring's own diameter so the readout scales WITH the mark (deterministic, ⚠ craft-tuned).
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {svg}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: thickness * 1.5 }}>
        {valueText ? <div style={{ fontSize: size * 0.19, fontWeight: 600, color: brand.colors.text, opacity: p, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{valueText}</div> : null}
        {label ? <div style={{ fontSize: size * 0.1, color: withAlpha(brand.colors.text, 0.75), opacity: p, lineHeight: 1.2, marginTop: size * 0.02 }}>{label}</div> : null}
      </div>
    </div>
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
 * A PLATE — a rounded brand surface that fades+lifts in with real MATERIAL depth. Backs a group or holds
 * legibility. `surface` = the SURFACE AXIS (atomize-the-style, axis 4) — a PHYSICAL finish, not a named brand
 * look and not a free scalar; every finish is DERIVED from brand tokens by materialSurface (brand.ts):
 *   flat     translucent brand scrim + hairline border (default; byte-identical to the original Plate).
 *   gradient a top-lit brand gradient fill + specular rim — a considered panel, not a grey box.
 *   frosted  glass: translucent gradient + top rim + an inner sheen overlay. ⚠ Does NOT blur the footage (the MG
 *            renders on transparent alpha — nothing behind to blur); true footage-blur is a compositing-stage
 *            effect. This is the panel LOOK, honestly.
 *   raised   material elevation: opaque surfaceAlt fill + a LAYERED (ambient+key) shadow + rim.
 *   glow     accent-lit: gradient fill + accent rim border + an outer accent halo and inner accent glow.
 * `emphasis` (0..1) scales the depth (hero→richer/glossier, subtle→understated); `grain` adds tactile noise.
 * Depth reads on BOTH a dark brand (specular rims) and a light one (elevation shadow) — luminance-driven.
 */
export const Plate: React.FC<{
  brand: Brand; at?: number; dur?: number; opacity?: number; radius?: number;
  surface?: SurfaceMode; emphasis?: number; grain?: boolean; children?: React.ReactNode;
}> = ({ brand, at = 0, dur = 12, opacity = 0.9, radius, surface = 'flat', emphasis, grain, children }) => {
  const frame = useCurrentFrame();
  const p = grow(frame, at, dur);
  const mat = materialSurface(brand, surface, { emphasis, grain, opacity });
  const r = radius ?? brand.shape.radius;
  return (
    <div style={{
      position: 'relative',
      ...mat.base,
      borderRadius: r,
      opacity: p, // the entrance fade also fades the shadow/halo/overlays together (CSS opacity applies to all)
      transform: `translateY(${(1 - p) * 10}px)`,
    }}>
      {mat.overlays.map((ov, i) => (
        <div key={i} style={{ position: 'absolute', inset: 0, borderRadius: r, pointerEvents: 'none', ...ov }} />
      ))}
      {mat.overlays.length ? <div style={{ position: 'relative' }}>{children}</div> : children}
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

/**
 * TEXTURE — a DETERMINISTIC brand-token pattern filling its positioned parent (mood/atmosphere BEHIND content).
 * The TEXTURE half of the texture/ornament axis. grain = fine film noise (SVG feTurbulence, seeded → neutral,
 * identical every render); scanline = CRT/VHS lines; grid = editorial/technical lattice; dots = halftone field.
 * `strength` (0..1) scales presence. Pattern ink comes from brand.colors.text (scan-safe, brand-locked).
 */
export const Texture: React.FC<{ brand: Brand; kind?: 'grain' | 'scanline' | 'grid' | 'dots'; at?: number; dur?: number; strength?: number }> = ({ brand, kind = 'grid', at = 0, dur = 14, strength = 0.5 }) => {
  const frame = useCurrentFrame();
  const s = clamp01(strength) * grow(frame, at, dur);
  const ink = withAlpha(brand.colors.text, 0.08 * s);
  const common: React.CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none' };
  if (kind === 'grain') {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='7' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(#g)'/></svg>`;
    return <div style={{ ...common, opacity: 0.11 * s, backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`, backgroundSize: '120px 120px' }} />;
  }
  if (kind === 'scanline') {
    return <div style={{ ...common, backgroundImage: `repeating-linear-gradient(0deg, ${ink}, ${ink} 1px, transparent 1px, transparent 3px)` }} />;
  }
  if (kind === 'dots') {
    return <div style={{ ...common, backgroundImage: `radial-gradient(${withAlpha(brand.colors.text, 0.14 * s)} ${dv(brand, 1.2, 1.8)}px, transparent ${dv(brand, 1.7, 2.5)}px)`, backgroundSize: `${dv(brand, 22, 15)}px ${dv(brand, 22, 15)}px` }} />;
  }
  return <div style={{ ...common, backgroundImage: `linear-gradient(${ink} 1px, transparent 1px), linear-gradient(90deg, ${ink} 1px, transparent 1px)`, backgroundSize: `${dv(brand, 64, 40)}px ${dv(brand, 64, 40)}px` }} />;
};

/**
 * MOTIF — a DECORATIVE brand-accent ornament that draws/fades in (the ORNAMENT half of the axis; a flourish, NOT
 * content). chevrons = a row of > marks marching in; sunburst = radial rays growing from a centre (Art-Deco /
 * broadcast); zigzag = a running zig line drawing on (Memphis / retro). Colour is a brand tone; motion from frame.
 */
export const Motif: React.FC<{ brand: Brand; kind?: 'chevrons' | 'sunburst' | 'zigzag'; at?: number; dur?: number; tone?: Tone; count?: number }> = ({ brand, kind = 'chevrons', at = 0, dur = 16, tone = 'accent', count = 10 }) => {
  const frame = useCurrentFrame();
  const p = grow(frame, at, dur);
  const color = toneOf(brand, tone);
  const n = Math.max(2, Math.min(48, Math.round(count)));
  if (kind === 'sunburst') {
    return (
      <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', opacity: p, overflow: 'visible' }}>
        {Array.from({ length: n }, (_, i) => {
          const a = (i / n) * Math.PI * 2;
          const r1 = 14 + 34 * p;
          return <line key={i} x1={50 + Math.cos(a) * 14} y1={50 + Math.sin(a) * 14} x2={50 + Math.cos(a) * r1} y2={50 + Math.sin(a) * r1} stroke={color} strokeWidth={1.4} strokeLinecap="round" />;
        })}
      </svg>
    );
  }
  if (kind === 'zigzag') {
    const pts = Array.from({ length: n + 1 }, (_, i) => `${(i / n) * 100},${i % 2 === 0 ? 28 : 72}`).join(' ');
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%', opacity: p }}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" strokeDasharray={220} strokeDashoffset={(1 - p) * 220} />
      </svg>
    );
  }
  return (
    <div style={{ display: 'flex', gap: dv(brand, 10, 6), opacity: p }}>
      {Array.from({ length: n }, (_, i) => {
        const local = clamp01(p * n - i);
        return <div key={i} style={{ width: 12, height: 12, borderRight: `2px solid ${color}`, borderBottom: `2px solid ${color}`, transform: `rotate(-45deg) scale(${local})`, opacity: local }} />;
      })}
    </div>
  );
};
