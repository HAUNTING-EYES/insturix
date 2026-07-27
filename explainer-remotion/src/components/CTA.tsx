import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {theme} from '../theme';
import {MonoLabel} from './MonoLabel';
import {StaggerChars} from './StaggerChars';
import {useFade, reveal} from '../anim';
import {InsturixLogo} from './InsturixLogo';

// The one place words ARE the payoff. The gold pill springs in once and SETTLES — no beat-pulse
// (the heartbeat throb read as weird). Logo bookends the open.
export const CTA: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const fade = useFade(durationInFrames);

  const logo = spring({frame: frame - 2, fps, config: {damping: 14, mass: 0.7, stiffness: 150}});
  const wm = reveal(frame, 14, 38);
  const pill = spring({frame: frame - 96, fps, config: {damping: 13, mass: 0.72, stiffness: 140}});
  const pillScale = interpolate(pill, [0, 1], [0.9, 1]); // single settle, no heartbeat
  // a one-time glow bloom on arrival, then it rests — not a loop
  const bloom = interpolate(frame, [98, 112, 132], [0, 1, 0.45], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', opacity: fade, backgroundColor: theme.colors.canvas}}>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 56% 50% at 50% 46%, rgba(212,166,82,0.09), transparent 60%)'}} />
      <div style={{textAlign: 'center'}}>
        <div style={{opacity: logo, transform: `scale(${interpolate(logo, [0, 1], [0.8, 1])})`, marginBottom: 26}}>
          <InsturixLogo size={86} color={theme.colors.gold} />
        </div>
        <div style={{opacity: wm, marginBottom: 30}}>
          <MonoLabel size={15} tracking={0.34} color={theme.colors.textMuted}>
            Insturix
          </MonoLabel>
        </div>
        <StaggerChars text="Your vision." fontSize={126} weight={800} gradient startAt={22} stagger={2.2} />
        <div style={{height: 8}} />
        <StaggerChars text="Not a version." fontSize={126} weight={800} color={theme.colors.textPrimary} startAt={50} stagger={2.2} />
        <div
          style={{
            opacity: pill,
            transform: `scale(${pillScale})`,
            display: 'inline-block',
            marginTop: 50,
            padding: '20px 48px',
            borderRadius: 999,
            background: theme.colors.gold,
            color: theme.colors.canvas,
            fontFamily: theme.font.sans,
            fontWeight: 800,
            fontSize: 30,
            boxShadow: `0 16px 50px rgba(0,0,0,0.4), 0 0 ${24 + bloom * 26}px ${theme.colors.gold}55`,
          }}
        >
          insturix.com
        </div>
      </div>
    </AbsoluteFill>
  );
};
