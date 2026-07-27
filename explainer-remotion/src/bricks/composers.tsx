import React from 'react';
import {AbsoluteFill, Img, staticFile, interpolate, useCurrentFrame, useVideoConfig, spring} from 'remotion';
import type {Brand} from './brand';
import {withAlpha, dv} from './brand';
import {Bleed, useStage} from './stage';
import {fitSize} from './fit-text';
import {EASE, countUp, progress, pulseAt, stagger, travel, type Phases} from './choreo';

// COMPOSERS — scene-scale primitives that OWN their geometry. Each one is a spatial signature the
// old grammar couldn't say: the frame IS the product, one surface transforms in place, a grid
// breathes on the beat, a metric owns the void. No colour props, no fontSize props, no raw px
// positions — fractions in, brand tokens through, choreography computed.

// ─── Legibility scrim over full-bleed imagery ────────────────────────────────
export const Scrim: React.FC<{brand: Brand; side?: 'bottom' | 'left' | 'right' | 'top'; strength?: number}> = ({
  brand,
  side = 'bottom',
  strength = 0.82,
}) => {
  const dir = {bottom: '0deg', top: '180deg', left: '90deg', right: '270deg'}[side];
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${dir}, ${withAlpha(brand.colors.bg, strength)} 0%, ${withAlpha(brand.colors.bg, strength * 0.5)} 26%, transparent 58%)`,
      }}
    />
  );
};

// ─── Full-bleed product moment: the FRAME is the product ────────────────────
// Edge-to-edge screenshot, slow push, drift toward the focus point. No chrome, no card, no column.
export const FullBleedProduct: React.FC<{
  brand: Brand;
  src: string;
  focus?: {x: number; y: number};
  push?: number; // total extra scale across the scene (0.04–0.12)
  ph: Phases;
  scrim?: 'bottom' | 'left' | 'right' | 'none';
}> = ({brand, src, focus = {x: 0.5, y: 0.42}, push = 0.07, ph, scrim = 'bottom'}) => {
  const frame = useCurrentFrame();
  const p = progress(frame, 0, ph.durF);
  const settle = progress(frame, 0, ph.intro * 1.4);
  const scale = 1.02 + push * p;
  const dx = (0.5 - focus.x) * 46 * p;
  const dy = (0.5 - focus.y) * 34 * p;
  return (
    <Bleed>
      <Img
        src={staticFile(src)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: `${focus.x * 100}% ${focus.y * 100}%`,
          transform: `scale(${scale}) translate(${dx}px, ${dy}px)`,
          opacity: 0.35 + 0.65 * settle,
          filter: `saturate(${0.92 + 0.08 * settle})`,
        }}
      />
      {scrim !== 'none' && <Scrim brand={brand} side={scrim} />}
    </Bleed>
  );
};

// ─── Deixis: point AT the thing (circle / underline / box / arrow), drawn on ─
export const Deixis: React.FC<{
  brand: Brand;
  x: number; // frame fractions (decorates full-bleed imagery)
  y: number;
  kind?: 'circle' | 'box' | 'underline' | 'arrow';
  at: number;
  size?: number; // fraction of min(frame dim), default sensible
}> = ({brand, x, y, kind = 'circle', at, size}) => {
  const frame = useCurrentFrame();
  const {W, H} = useStage();
  const m = Math.min(W, H);
  const r = (size ?? 0.075) * m;
  const draw = progress(frame, at, at + 22);
  const settledPulse = 1 + pulseAt(frame, at + 22, 0.05);
  const stroke = brand.colors.accent;
  const sw = Math.max(2.5, brand.shape.border * 2.5);
  const common = {fill: 'transparent', stroke, strokeWidth: sw, strokeLinecap: 'round' as const};
  const cx = x * W;
  const cy = y * H;
  let el: React.ReactNode = null;
  if (kind === 'circle') {
    const C = 2 * Math.PI * r;
    el = <circle cx={cx} cy={cy} r={r} {...common} strokeDasharray={C} strokeDashoffset={C * (1 - draw)} transform={`rotate(-90 ${cx} ${cy})`} />;
  } else if (kind === 'box') {
    const w = r * 2.6;
    const h = r * 1.5;
    const P = 2 * (w + h);
    el = <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={brand.shape.radius * 0.6} {...common} strokeDasharray={P} strokeDashoffset={P * (1 - draw)} />;
  } else if (kind === 'underline') {
    const w = r * 2.4;
    el = <line x1={cx - w / 2} y1={cy} x2={cx - w / 2 + w * draw} y2={cy} {...common} strokeWidth={sw * 1.4} />;
  } else {
    const sxp = cx - r * 2.6;
    const syp = cy + r * 1.8;
    const L = Math.hypot(cx - sxp, cy - syp);
    el = (
      <g>
        <line x1={sxp} y1={syp} x2={cx} y2={cy} {...common} strokeDasharray={L} strokeDashoffset={L * (1 - draw)} />
        <path d={`M ${cx} ${cy} l ${-r * 0.34} ${r * 0.1} M ${cx} ${cy} l ${-r * 0.12} ${r * 0.34}`} {...common} opacity={draw > 0.92 ? 1 : 0} />
      </g>
    );
  }
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <svg width={W} height={H} style={{position: 'absolute', inset: 0, transform: `scale(${settledPulse})`, transformOrigin: `${cx}px ${cy}px`, filter: `drop-shadow(0 0 12px ${withAlpha(brand.colors.accent, 0.45)})`}}>
        {el}
      </svg>
    </AbsoluteFill>
  );
};

// ─── Metric hero: one number owns the frame ─────────────────────────────────
// Count-up on its anchor; sweep arc renders ONLY for a true 0–100 "%" (encoding honesty by construction).
export const MetricHero: React.FC<{
  brand: Brand;
  value: number;
  suffix?: string;
  label: string;
  at: number;
  regionWPx: number; // pass useRegionSize().wPx from the calling Region
}> = ({brand, value, suffix = '', label, at, regionWPx}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const n = countUp(frame, at, Math.round(fps * 0.9), value);
  const full = `${value}${suffix}`;
  const px = fitSize(full, regionWPx, 1, regionWPx * 0.34, 800, -0.03, false);
  const labelPx = fitSize(label, regionWPx, 2, px * 0.16, 600, 0.01, false);
  const s = spring({frame: frame - at, fps, config: {damping: 13, mass: 0.7, stiffness: 150}});
  const arcOK = suffix.trim() === '%' && value >= 0 && value <= 100;
  const R = px * 0.72;
  const C = 2 * Math.PI * R;
  const arcP = progress(frame, at, at + fps * 0.9) * (value / 100);
  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'inherit', gap: dv(brand, 20, 12), transform: `scale(${0.92 + 0.08 * Math.min(1, s)})`, opacity: Math.min(1, s)}}>
      <div style={{position: 'relative', display: 'inline-flex', alignItems: 'center', gap: px * 0.18}}>
        {arcOK && (
          <svg width={R * 2 + 18} height={R * 2 + 18} style={{position: 'absolute', left: -R * 0.6, top: '50%', transform: 'translateY(-50%) rotate(-90deg)', opacity: 0.9}}>
            <circle cx={R + 9} cy={R + 9} r={R} fill="transparent" stroke={withAlpha(brand.colors.text, 0.08)} strokeWidth={5} />
            <circle cx={R + 9} cy={R + 9} r={R} fill="transparent" stroke={brand.colors.accent} strokeWidth={5} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - arcP)} />
          </svg>
        )}
        <span style={{fontWeight: 800, fontSize: px, letterSpacing: '-0.03em', lineHeight: 1, color: brand.colors.text, fontVariantNumeric: 'tabular-nums'}}>
          {n}
          <span style={{color: brand.colors.accent}}>{suffix}</span>
        </span>
      </div>
      <span style={{fontWeight: 600, fontSize: labelPx, color: brand.colors.muted, lineHeight: 1.35}}>{label}</span>
    </div>
  );
};

// ─── Transform surface: before/after as ONE full-frame surface, not two cards ─
export const TransformSurface: React.FC<{
  brand: Brand;
  beforeSrc?: string;
  afterSrc?: string;
  ph: Phases;
}> = ({brand, beforeSrc, afterSrc, ph}) => {
  const frame = useCurrentFrame();
  const p = progress(frame, ph.intro, ph.resolve);
  const edge = p * 100;
  const surface = (src: string | undefined, kind: 'before' | 'after') => {
    if (src) {
      return (
        <Img
          src={staticFile(src)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: kind === 'before' ? 'grayscale(0.92) brightness(0.5) contrast(0.92)' : 'none',
          }}
        />
      );
    }
    // Asset-free fallback: two brand fields that read as chaos vs order.
    const lines = kind === 'before' ? 9 : 5;
    return (
      <AbsoluteFill style={{backgroundColor: kind === 'before' ? brand.colors.surface : brand.colors.surfaceAlt}}>
        {Array.from({length: lines}).map((_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${kind === 'before' ? 6 + ((i * 37) % 40) : 12}%`,
              top: `${10 + i * (78 / lines)}%`,
              width: `${kind === 'before' ? 24 + ((i * 23) % 46) : 76}%`,
              height: 10,
              borderRadius: 6,
              backgroundColor: kind === 'before' ? withAlpha(brand.colors.muted, 0.35) : withAlpha(brand.colors.accent, i === 0 ? 0.9 : 0.22),
              transform: kind === 'before' ? `rotate(${((i % 3) - 1) * 2.4}deg)` : 'none',
            }}
          />
        ))}
      </AbsoluteFill>
    );
  };
  return (
    <Bleed>
      <AbsoluteFill>{surface(afterSrc, 'after')}</AbsoluteFill>
      <AbsoluteFill style={{clipPath: `inset(0 ${edge}% 0 0)`}}>{surface(beforeSrc, 'before')}</AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${100 - edge}%`,
          width: 3,
          backgroundColor: brand.colors.accent,
          boxShadow: `0 0 22px ${withAlpha(brand.colors.accent, 0.7)}`,
          transform: 'translateX(-50%)',
        }}
      />
    </Bleed>
  );
};

// ─── Montage grid: 3–6 crops breathing on the stagger; one promotes to full-bleed ─
export const MontageGrid: React.FC<{
  brand: Brand;
  cells: {src: string; focus?: {x: number; y: number}}[];
  promote?: number; // index that takes over the frame in the resolve phase
  ph: Phases;
}> = ({brand, cells, promote, ph}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {W, H} = useStage();
  const n = Math.max(2, Math.min(6, cells.length));
  const cols = n <= 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const gap = dv(brand, 22, 12);
  const promoteP = promote == null ? 0 : progress(frame, ph.resolve, ph.resolve + Math.round(fps * 0.55));
  return (
    <Bleed style={{padding: gap, boxSizing: 'border-box'}}>
      {cells.slice(0, n).map((c, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cw = (W - gap * (cols + 1)) / cols;
        const chh = (H - gap * (rows + 1)) / rows;
        const x0 = gap + col * (cw + gap);
        const y0 = gap + row * (chh + gap);
        const s = spring({frame: frame - ph.intro * 0.4 - stagger(brand, i) * 2, fps, config: {damping: 15, mass: 0.6, stiffness: 170}});
        const o = Math.max(0, Math.min(1, s));
        const isP = i === promote;
        const L = isP ? interpolate(promoteP, [0, 1], [x0, 0], {easing: EASE}) : x0;
        const T = isP ? interpolate(promoteP, [0, 1], [y0, 0], {easing: EASE}) : y0;
        const Wd = isP ? interpolate(promoteP, [0, 1], [cw, W], {easing: EASE}) : cw;
        const Ht = isP ? interpolate(promoteP, [0, 1], [chh, H], {easing: EASE}) : chh;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: L,
              top: T,
              width: Wd,
              height: Ht,
              borderRadius: interpolate(promoteP, [0, 1], [brand.shape.radius, 0]) * (isP ? 1 : 0) + (isP ? 0 : brand.shape.radius),
              overflow: 'hidden',
              border: isP && promoteP > 0.5 ? 'none' : `${brand.shape.border}px solid ${brand.colors.border}`,
              opacity: isP ? o : o * (1 - promoteP),
              transform: `scale(${0.94 + 0.06 * o + pulseAt(frame, ph.build + i * 4, 0.02)})`,
              zIndex: isP ? 2 : 1,
              backgroundColor: brand.colors.surface,
            }}
          >
            <Img src={staticFile(c.src)} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${(c.focus?.x ?? 0.5) * 100}% ${(c.focus?.y ?? 0.45) * 100}%`}} />
          </div>
        );
      })}
    </Bleed>
  );
};

// ─── Rail steps: the process as a journey the camera travels, full-frame ────
export const RailSteps: React.FC<{
  brand: Brand;
  steps: string[];
  ph: Phases;
}> = ({brand, steps, ph}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {W, H} = useStage();
  const n = Math.max(2, Math.min(6, steps.length));
  const cardW = W * 0.4;
  const gap = W * 0.06;
  const total = n * cardW + (n - 1) * gap;
  const tx = travel(frame, ph, Math.max(0, total - W * 0.86));
  const activeIdx = Math.max(0, Math.min(n - 1, Math.round(-tx / (cardW + gap) + 0.18)));
  return (
    <Bleed>
      <div style={{position: 'absolute', left: W * 0.07, top: '50%', height: 2, width: total, backgroundColor: withAlpha(brand.colors.text, 0.1), transform: `translate(${tx}px, -50%)`}} />
      <div style={{position: 'absolute', left: W * 0.07, top: '50%', transform: `translate(${tx}px, -50%)`, display: 'flex', gap}}>
        {steps.slice(0, n).map((label, i) => {
          const s = spring({frame: frame - ph.intro * 0.5 - stagger(brand, i) * 2.2, fps, config: {damping: 17, mass: 0.6, stiffness: 165}});
          const o = Math.max(0, Math.min(1, s));
          const active = i === activeIdx;
          const px = fitSize(label, cardW - dv(brand, 64, 44), 2, H * 0.052, 700, -0.01, false);
          return (
            <div
              key={i}
              style={{
                width: cardW,
                padding: dv(brand, 34, 22),
                boxSizing: 'border-box',
                borderRadius: brand.shape.radius * 1.2,
                backgroundColor: active ? brand.colors.surfaceAlt : brand.colors.surface,
                border: `${brand.shape.border}px solid ${active ? withAlpha(brand.colors.accent, 0.65) : brand.colors.border}`,
                boxShadow: active ? `0 12px 60px ${withAlpha(brand.colors.accent, 0.14)}` : 'none',
                opacity: o,
                transform: `translateY(${(1 - o) * 26}px) scale(${active ? 1.05 : 0.98})`,
                display: 'flex',
                flexDirection: 'column',
                gap: dv(brand, 16, 10),
              }}
            >
              <span style={{fontWeight: 800, fontSize: px * 0.62, color: brand.colors.accent, letterSpacing: '0.06em'}}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{fontWeight: 700, fontSize: px, color: brand.colors.text, lineHeight: 1.18}}>{label}</span>
            </div>
          );
        })}
      </div>
    </Bleed>
  );
};

// ─── Underline sweep for title cards ─────────────────────────────────────────
export const UnderlineSweep: React.FC<{brand: Brand; at: number; widthPx: number}> = ({brand, at, widthPx}) => {
  const frame = useCurrentFrame();
  const p = progress(frame, at, at + 20);
  return (
    <div style={{width: widthPx * p, height: Math.max(4, brand.shape.border * 4), borderRadius: 4, backgroundColor: brand.colors.accent, boxShadow: `0 0 18px ${withAlpha(brand.colors.accent, 0.55)}`}} />
  );
};
