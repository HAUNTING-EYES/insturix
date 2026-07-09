import React from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import {theme} from '../theme';
import {StaggerChars} from './StaggerChars';
import {useFade} from '../anim';
import {useBeatGrid} from '../beat';

// Lovable-grade kinetic-type HOOK on our warm-dark+gold brand: fast per-letter word-cuts that GRAB,
// over a GLOWING (not flat-black) wash that shifts color per line + pulses on the beat. Replaces the
// dim broken-nodes opening. Builds the pain, then turns.
type Phrase = {t: string; from: number; dur: number; color: string; glow: string; gradient?: boolean; size?: number};
const PHRASES: Phrase[] = [
  {t: 'A week.', from: 0, dur: 40, color: theme.colors.textPrimary, glow: theme.colors.cyan},
  {t: 'Ten tools.', from: 40, dur: 40, color: theme.colors.textPrimary, glow: theme.colors.purple},
  {t: '$2,000 a month.', from: 80, dur: 46, color: theme.colors.gold, glow: theme.colors.gold},
  {t: 'For one video?', from: 126, dur: 50, color: theme.colors.danger, glow: theme.colors.danger},
  {t: 'Not anymore.', from: 176, dur: 70, color: theme.colors.textPrimary, glow: theme.colors.gold, gradient: true, size: 150},
];

export const HOOK_DURATION = 246;

export const HookScene: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const fade = useFade(durationInFrames, 8, 16);
  const {pulse} = useBeatGrid();
  const cur = PHRASES.find((p) => frame >= p.from && frame < p.from + p.dur) ?? PHRASES[PHRASES.length - 1];
  const glowA = 0.16 + pulse * 0.12; // brighter, breathes on the beat

  return (
    <AbsoluteFill style={{opacity: fade, backgroundColor: theme.colors.canvas}}>
      {/* glowing wash — the energy. color shifts per line. */}
      <AbsoluteFill
        style={{
          background:
            `radial-gradient(ellipse 62% 52% at 50% 46%, ${cur.glow}${Math.round(glowA * 255).toString(16).padStart(2, '0')}, transparent 62%),` +
            `radial-gradient(ellipse 50% 40% at 78% 74%, ${cur.glow}14, transparent 60%)`,
        }}
      />
      {PHRASES.map((p) => (
        <Sequence key={p.t} from={p.from} durationInFrames={p.dur} layout="none">
          <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
            <StaggerChars
              text={p.t}
              fontSize={p.size ?? 120}
              weight={800}
              color={p.color}
              gradient={p.gradient}
              startAt={2}
              stagger={1.1}
              tracking={-0.035}
            />
          </AbsoluteFill>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
