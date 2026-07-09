import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand} from './brand';
import {withAlpha} from './brand';

// FORM: "logo outro" — the close. Logo lockup + tagline + one CTA. Brand-driven; spring pace from motion.
export type LogoProps = {headline?: string; cta?: string};

export const LogoOutro: React.FC<{brand: Brand} & LogoProps> = ({brand, headline = 'Your vision. Not a version.', cta}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const c = brand.colors;
  const damping = interpolate(brand.motion.overshoot, [0, 1], [200, 90]);
  const pop = spring({frame, fps, config: {damping, mass: 0.6, stiffness: 170}});
  const headIn = interpolate(frame, [14, 34], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const ctaIn = interpolate(frame, [28, 48], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill style={{background: c.bg, fontFamily: brand.fontSans, justifyContent: 'center', alignItems: 'center'}}>
      {brand.decor.glow ? <AbsoluteFill style={{background: `radial-gradient(50% 50% at 50% 45%, ${withAlpha(c.accent, 0.16)}, transparent 62%)`}} /> : null}
      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 16, transform: `scale(${0.8 + Math.min(1, pop) * 0.2})`}}>
          <div style={{width: 64, height: 64, borderRadius: Math.max(10, brand.shape.radius), background: c.accent, boxShadow: brand.decor.glow ? `0 0 40px ${withAlpha(c.accent, 0.5)}` : 'none'}} />
          <span style={{fontSize: 52, fontWeight: 900, color: c.text, letterSpacing: brand.type.tracking}}>{brand.productName}</span>
        </div>
        <div style={{fontSize: 34, fontWeight: brand.type.headingWeight, color: c.text, opacity: headIn, transform: `translateY(${(1 - headIn) * 14}px)`, textAlign: 'center'}}>
          {headline.split(' ').map((w, i, arr) => (
            <span key={i} style={{color: i >= arr.length - 2 ? c.accent : c.text}}>{w}{i < arr.length - 1 ? ' ' : ''}</span>
          ))}
        </div>
        <div style={{marginTop: 6, padding: '14px 30px', borderRadius: 999, background: c.accent, color: c.accentText, fontSize: 20, fontWeight: 800, opacity: ctaIn, transform: `translateY(${(1 - ctaIn) * 12}px)`}}>
          {cta ?? `${brand.productName.toLowerCase()}.com`}
        </div>
      </div>
    </AbsoluteFill>
  );
};
