import React from 'react';
import type {Brand} from './brand';
import {withAlpha, dv} from './brand';

// BRICK: a browser/app window chrome that wraps any product UI. Corner roundness, border weight, chrome
// height and shadow all come from brand shape/density tokens — a sharp dense brand and a round airy brand
// get visibly different windows from the same code.
export const DeviceFrame: React.FC<{brand: Brand; label?: string; children?: React.ReactNode; style?: React.CSSProperties}> = ({
  brand,
  label,
  children,
  style,
}) => {
  const c = brand.colors;
  const bar = dv(brand, 46, 56); // airy chrome is slimmer
  return (
    <div
      style={{
        borderRadius: brand.shape.radius + 6,
        background: c.surface,
        border: `${brand.shape.border}px solid ${c.border}`,
        boxShadow: brand.decor.glow
          ? `0 40px 120px ${withAlpha('#000000', 0.45)}`
          : `0 30px 70px ${withAlpha('#0F1B2D', 0.14)}`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
    >
      <div style={{height: bar, display: 'flex', alignItems: 'center', gap: 9, padding: '0 20px', borderBottom: `1px solid ${c.border}`, flexShrink: 0}}>
        {[0, 1, 2].map((d) => (
          <span key={d} style={{width: 11, height: 11, borderRadius: 999, background: d === 0 ? c.accent : withAlpha(c.text, 0.16)}} />
        ))}
        <div
          style={{
            marginLeft: 16,
            flex: 1,
            height: 26,
            maxWidth: 320,
            borderRadius: 999,
            background: c.surfaceAlt,
            border: `1px solid ${c.border}`,
            display: 'flex',
            alignItems: 'center',
            padding: '0 14px',
            fontFamily: brand.fontSans,
            fontSize: 13,
            color: c.muted,
          }}
        >
          {label ?? `${brand.productName.toLowerCase()}.app`}
        </div>
      </div>
      <div style={{flex: 1, minHeight: 0, position: 'relative'}}>{children}</div>
    </div>
  );
};
