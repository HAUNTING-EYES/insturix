import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import type {Brand} from './brand';
import {withAlpha} from './brand';

// BRICK: a proof/stat chip — big number counts up, label under it. Accent + shape from brand.
export const StatCard: React.FC<{brand: Brand; value: number | string; suffix?: string; label: string; startAt?: number}> = ({
  brand,
  value,
  suffix,
  label,
  startAt = 0,
}) => {
  const frame = useCurrentFrame();
  const c = brand.colors;
  // Defensive: a director/GLM may hand us "10x", "92%", "1.2k" or a number. Never crash — parse the number to
  // count up, and derive the unit as the suffix if one wasn't given explicitly.
  const raw = String(value ?? '').trim();
  const num = parseFloat(raw);
  const target = Number.isFinite(num) ? num : 0;
  const unit = raw.replace(/[\d.,\s-]/g, ''); // e.g. "x" from "10x", "%" from "92%", "k" from "1.2k"
  const effSuffix = suffix ?? unit;
  const op = interpolate(frame, [startAt, startAt + 16], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const shown = Math.round(interpolate(frame, [startAt, startAt + 34], [0, target], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        gap: 4,
        padding: '18px 22px',
        borderRadius: brand.shape.radius,
        background: withAlpha(c.accent, 0.1),
        border: `${brand.shape.border}px solid ${withAlpha(c.accent, 0.35)}`,
        fontFamily: brand.fontSans,
        opacity: op,
        transform: `translateY(${(1 - op) * 12}px)`,
      }}
    >
      <div style={{color: c.accent, fontSize: 44, fontWeight: 900, letterSpacing: '-0.02em'}}>
        {shown}
        {effSuffix}
      </div>
      <div style={{color: c.muted, fontSize: 15, fontWeight: 600}}>{label}</div>
    </div>
  );
};
