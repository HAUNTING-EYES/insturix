import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import type {Brand} from './brand';
import {withAlpha, dv} from './brand';

// BRICK: a synthetic product dashboard. Density token changes how much is on screen (airy brand = fewer
// rows, roomier padding, bigger type; dense brand = compact + more rows). Shape/type/colour all brand-driven.
const NAV = ['Overview', 'Projects', 'Analytics', 'Team', 'Settings'];

export const UIMock: React.FC<{brand: Brand; activeNav?: number}> = ({brand, activeNav = 1}) => {
  const frame = useCurrentFrame();
  const c = brand.colors;
  const step = interpolate(brand.motion.energy, [0, 1], [9, 4]);
  const pad = dv(brand, 30, 22);
  const gap = dv(brand, 16, 12);
  const rows = brand.density > 0.55 ? 4 : 3; // dense brands pack more rows
  const railR = Math.max(6, brand.shape.radius - 6);

  return (
    <div style={{position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `${dv(brand, 224, 200)}px 1fr`, background: c.surface, fontFamily: brand.fontSans}}>
      {/* sidebar */}
      <div style={{borderRight: `1px solid ${c.border}`, padding: pad, background: c.surfaceAlt}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: dv(brand, 30, 22)}}>
          <div style={{width: 26, height: 26, borderRadius: railR, background: c.accent}} />
          <div style={{color: c.text, fontWeight: 800, fontSize: 16}}>{brand.productName}</div>
        </div>
        {NAV.map((item, i) => {
          const active = i === activeNav;
          const inAt = 10 + i * step;
          const op = interpolate(frame, [inAt, inAt + 12], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
          return (
            <div
              key={item}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: `${dv(brand, 12, 9)}px 12px`,
                marginBottom: 4,
                borderRadius: railR,
                background: active ? withAlpha(c.accent, 0.14) : 'transparent',
                color: active ? c.text : c.muted,
                fontWeight: active ? 700 : 500,
                fontSize: dv(brand, 15, 14),
                opacity: op,
                transform: `translateX(${(1 - op) * -10}px)`,
              }}
            >
              <span style={{width: 8, height: 8, borderRadius: 999, background: active ? c.accent : withAlpha(c.text, 0.22)}} />
              {item}
            </div>
          );
        })}
      </div>

      {/* content */}
      <div style={{padding: pad + 2}}>
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: dv(brand, 26, 20)}}>
          <div style={{color: c.text, fontSize: dv(brand, 26, 22), fontWeight: 800}}>{NAV[activeNav]}</div>
          <div style={{padding: '9px 16px', borderRadius: railR, background: c.accent, color: c.accentText, fontSize: 13, fontWeight: 800}}>New</div>
        </div>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap, marginBottom: gap + 6}}>
          {[0, 1, 2].map((i) => {
            const inAt = 22 + i * step;
            const op = interpolate(frame, [inAt, inAt + 14], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
            return (
              <div key={i} style={{borderRadius: brand.shape.radius, background: i === 0 ? withAlpha(c.accent, 0.12) : c.surfaceAlt, border: `${brand.shape.border}px solid ${i === 0 ? withAlpha(c.accent, 0.4) : c.border}`, padding: dv(brand, 18, 15), opacity: op, transform: `translateY(${(1 - op) * 14}px)`}}>
                <div style={{width: '48%', height: 10, borderRadius: 999, background: withAlpha(c.text, 0.18), marginBottom: 14}} />
                <div style={{color: i === 0 ? c.accent : c.text, fontSize: dv(brand, 28, 24), fontWeight: 900}}>{['98%', '1.2k', '24'][i]}</div>
              </div>
            );
          })}
        </div>
        <div style={{borderRadius: brand.shape.radius, border: `${brand.shape.border}px solid ${c.border}`, overflow: 'hidden'}}>
          {Array.from({length: rows}).map((_, i) => {
            const inAt = 34 + i * step;
            const op = interpolate(frame, [inAt, inAt + 14], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
            const active = i === 1;
            return (
              <div key={i} style={{display: 'flex', alignItems: 'center', gap: 14, padding: `${dv(brand, 16, 13)}px 18px`, borderBottom: i < rows - 1 ? `1px solid ${c.border}` : 'none', background: active ? withAlpha(c.accent, 0.08) : 'transparent', opacity: op}}>
                <div style={{width: 30, height: 30, borderRadius: railR, background: active ? c.accent : withAlpha(c.text, 0.1)}} />
                <div style={{flex: 1, height: 11, borderRadius: 999, background: withAlpha(c.text, active ? 0.32 : 0.16), maxWidth: `${70 - i * 8}%`}} />
                <div style={{width: 58, height: 22, borderRadius: 999, background: active ? withAlpha(c.accent, 0.2) : c.surfaceAlt, border: `1px solid ${active ? withAlpha(c.accent, 0.5) : c.border}`}} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
