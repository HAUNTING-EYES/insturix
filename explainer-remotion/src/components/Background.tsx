import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {theme} from '../theme';

// Atmosphere on the field — STEADY (no audio reactivity: that strobed). Beat reactivity lives on
// the visuals themselves now. Gentle warm washes + a calm twinkling starfield + film grain.
const STARS = Array.from({length: 140}, (_, i) => ({
  x: (i * 137.508) % 100,
  y: (i * 47.31) % 100,
  r: 0.6 + ((i * 53) % 12) / 9,
  period: 90 + ((i * 37) % 160),
  phase: (i * 23) % 90,
  bright: i % 11 === 0,
}));

const GRAIN_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'>" +
  "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/></filter>" +
  "<rect width='100%' height='100%' filter='url(%23n)'/></svg>";

export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{backgroundColor: theme.colors.canvasDeep}}>
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 55% 48% at 50% 40%, rgba(212,166,82,0.055), transparent 62%),' +
            'radial-gradient(ellipse 44% 40% at 82% 72%, rgba(144,136,212,0.05), transparent 55%),' +
            'radial-gradient(ellipse 42% 38% at 16% 74%, rgba(92,184,204,0.045), transparent 55%)',
        }}
      />
      <svg width="100%" height="100%" style={{position: 'absolute', inset: 0}}>
        {STARS.map((s, i) => {
          const twinkle =
            0.18 + 0.42 * (0.5 + 0.5 * Math.sin((frame + s.phase) * ((2 * Math.PI) / s.period)));
          return (
            <circle
              key={i}
              cx={`${s.x}%`}
              cy={`${s.y}%`}
              r={s.r}
              fill={s.bright ? '#F1DDB0' : theme.colors.textDim}
              opacity={twinkle * 0.5}
            />
          );
        })}
      </svg>
      <AbsoluteFill
        style={{
          backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(GRAIN_SVG)}")`,
          opacity: 0.04,
          mixBlendMode: 'overlay',
        }}
      />
    </AbsoluteFill>
  );
};
