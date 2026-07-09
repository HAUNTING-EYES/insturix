import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import type {Brand} from './brand';
import {withAlpha, dv} from './brand';
import {KineticHeadline, Eyebrow} from './KineticHeadline';

// FORM: "before / after" — the transformation shot. Copy prop-driven; brand shape/type/colour throughout.
export type SplitProps = {
  eyebrow?: string;
  headline?: string;
  accentWord?: string;
  beforeLabel?: string;
  afterLabel?: string;
  beforeCaption?: string;
  afterCaption?: string;
};

const Pane: React.FC<{brand: Brand; side: 'before' | 'after'; startAt: number; label: string; caption: string}> = ({brand, side, startAt, label, caption}) => {
  const frame = useCurrentFrame();
  const c = brand.colors;
  const after = side === 'after';
  const inP = interpolate(frame, [startAt, startAt + 22], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const dir = after ? 1 : -1;
  return (
    <div
      style={{
        flex: 1,
        borderRadius: brand.shape.radius + 4,
        background: after ? withAlpha(c.accent, 0.1) : c.surface,
        border: `${brand.shape.border}px solid ${after ? withAlpha(c.accent, 0.4) : c.border}`,
        padding: dv(brand, 40, 30),
        opacity: inP,
        transform: `translateX(${(1 - inP) * dir * 40}px)`,
        display: 'flex',
        flexDirection: 'column',
        gap: dv(brand, 22, 16),
      }}
    >
      <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
        <span style={{width: 12, height: 12, borderRadius: 999, background: after ? c.accent : withAlpha(c.text, 0.3)}} />
        <span style={{fontFamily: brand.fontSans, fontSize: 20, fontWeight: 800, color: after ? c.accent : c.muted}}>{label}</span>
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{display: 'flex', alignItems: 'center', gap: 14}}>
          <div style={{width: 26, height: 26, borderRadius: after ? Math.max(6, brand.shape.radius - 6) : 4, background: after ? withAlpha(c.accent, 0.9) : withAlpha(c.text, 0.12), transform: after ? 'none' : `rotate(${(i % 2 === 0 ? -1 : 1) * 6}deg)`}} />
          <div style={{flex: 1, height: 14, borderRadius: 999, background: after ? withAlpha(c.accent, 0.28) : withAlpha(c.text, 0.14), maxWidth: after ? `${88 - i * 4}%` : `${64 + (i % 2) * 20}%`, transform: after ? 'none' : `translateX(${(i % 2) * 18}px)`}} />
        </div>
      ))}
      <div style={{marginTop: 'auto', fontFamily: brand.fontSans, fontSize: 17, color: after ? c.text : c.muted, fontWeight: after ? 700 : 500}}>{caption}</div>
    </div>
  );
};

export const SplitCompare: React.FC<{brand: Brand} & SplitProps> = ({
  brand,
  eyebrow = 'The shift',
  headline = 'From busywork to done.',
  accentWord = 'done',
  beforeLabel = 'Before',
  afterLabel,
  beforeCaption = 'Scattered across tabs and tools.',
  afterCaption = 'Organized, on-brand, one place.',
}) => {
  const c = brand.colors;
  return (
    <AbsoluteFill style={{background: c.bg, fontFamily: brand.fontSans}}>
      {brand.decor.glow ? <AbsoluteFill style={{background: `radial-gradient(60% 60% at 75% 30%, ${withAlpha(c.accent, 0.12)}, transparent 60%)`}} /> : null}
      <div style={{position: 'absolute', inset: '10% 8%', display: 'flex', flexDirection: 'column', gap: 34}}>
        <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
          <Eyebrow brand={brand} startAt={2}>{eyebrow}</Eyebrow>
          <KineticHeadline brand={brand} text={headline} accentWord={accentWord} startAt={6} fontSize={54} maxWidth={900} />
        </div>
        <div style={{flex: 1, display: 'flex', gap: 28, alignItems: 'stretch'}}>
          <Pane brand={brand} side="before" startAt={22} label={beforeLabel} caption={beforeCaption} />
          <Pane brand={brand} side="after" startAt={34} label={afterLabel ?? `With ${brand.productName}`} caption={afterCaption} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
