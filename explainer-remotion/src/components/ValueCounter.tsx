import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {ROOMS, theme} from '../theme';
import {MonoLabel} from './MonoLabel';
import {useFade, reveal} from '../anim';
import {useCountUp} from '../anim-ui';

// Momentum beat (Lovable's live counter): a big gold-gradient number ticks up fast while the six
// room chips light in staggered. "videos shipped with Insturix".
export const ValueCounter: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const fade = useFade(durationInFrames);
  const n = useCountUp(12480, 8, 80, 7200);
  const label = reveal(frame, 72, 92);

  return (
    <AbsoluteFill style={{opacity: fade, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.canvas, flexDirection: 'column'}}>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 55% 46% at 50% 44%, rgba(212,166,82,0.10), transparent 60%)'}} />
      <div
        style={{
          fontFamily: theme.font.mono,
          fontSize: 200,
          fontWeight: 500,
          letterSpacing: '-0.04em',
          lineHeight: 1,
          backgroundImage: theme.wordmarkGradient,
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        {n.toLocaleString('en-US')}
      </div>
      <div style={{opacity: label, marginTop: 18}}>
        <MonoLabel size={16} tracking={0.3} color={theme.colors.textMuted}>
          videos shipped with Insturix
        </MonoLabel>
      </div>
      <div style={{display: 'flex', gap: 14, marginTop: 48}}>
        {ROOMS.map((r, i) => {
          const op = reveal(frame, 20 + i * 5, 36 + i * 5);
          return (
            <div
              key={r.key}
              style={{opacity: op, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 999, background: theme.colors.well, border: `1px solid ${r.color}55`}}
            >
              <div style={{width: 7, height: 7, borderRadius: 4, background: r.color, boxShadow: `0 0 8px ${r.color}`}} />
              <span style={{fontFamily: theme.font.sans, fontSize: 15, fontWeight: 500, color: theme.colors.textSecondary}}>
                {r.verb.replace('.', '')}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
