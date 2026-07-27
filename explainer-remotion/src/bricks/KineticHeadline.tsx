import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand} from './brand';

// BRICK: per-word headline reveal. Weight/tracking/line-height from brand.type; stagger + springiness from
// brand.motion. Title-safe (wraps, never splits words). accentWord painted in the brand accent.
export const KineticHeadline: React.FC<{
  brand: Brand;
  text: string;
  accentWord?: string;
  startAt?: number;
  fontSize?: number;
  maxWidth?: number;
}> = ({brand, text, accentWord, startAt = 0, fontSize = 62, maxWidth = 560}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const words = text.split(' ');
  const stagger = interpolate(brand.motion.energy, [0, 1], [5, 2]);
  const damping = interpolate(brand.motion.overshoot, [0, 1], [200, 90]);

  return (
    <div style={{display: 'flex', flexWrap: 'wrap', maxWidth, fontFamily: brand.fontSans, fontWeight: brand.type.headingWeight, fontSize, lineHeight: brand.type.lineHeight, letterSpacing: brand.type.tracking}}>
      {words.map((w, i) => {
        const s = spring({frame: frame - startAt - i * stagger, fps, config: {damping, mass: 0.6, stiffness: 170}});
        const isAccent = accentWord ? w.replace(/[.,]/g, '') === accentWord : false;
        return (
          <span
            key={`${w}_${i}`}
            style={{
              display: 'inline-block',
              marginRight: fontSize * 0.24,
              color: isAccent ? brand.colors.accent : brand.colors.text,
              opacity: Math.max(0, Math.min(1, s)),
              transform: `translateY(${(1 - s) * fontSize * 0.5}px)`,
              whiteSpace: 'pre',
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

// BRICK: a small eyebrow/kicker above a headline — case + colour from brand.
export const Eyebrow: React.FC<{brand: Brand; children: React.ReactNode; startAt?: number}> = ({brand, children, startAt = 0}) => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [startAt, startAt + 12], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <div
      style={{
        fontFamily: brand.fontSans,
        fontSize: 15,
        fontWeight: 800,
        letterSpacing: brand.type.eyebrowCase === 'upper' ? '0.14em' : '0',
        textTransform: brand.type.eyebrowCase === 'upper' ? 'uppercase' : 'none',
        color: brand.colors.accent,
        opacity: op,
      }}
    >
      {children}
    </div>
  );
};
