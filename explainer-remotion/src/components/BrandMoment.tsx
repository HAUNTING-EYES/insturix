import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {ROOMS, theme} from '../theme';
import {StaggerChars} from './StaggerChars';
import {MonoLabel} from './MonoLabel';
import {useFade, reveal} from '../anim';
import {useBeatGrid} from '../beat';
import {InsturixLogo} from './InsturixLogo';

// "Meet Insturix" — the brand reveal, now a real LOGO ANIMATION (mirrors the products-page scroll
// choreography in logo-condense.tsx): the six room-colour arcs spiral in → the logo draws on in gold →
// fills to off-white → the wordmark + tagline resolve. Warm-dark glow pulses on the beat.
const RING_R = 190;
const RING_BOX = 500;
const LOGO_SIZE = 336;

export const BrandMoment: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const fade = useFade(durationInFrames);
  const {downbeat} = useBeatGrid();
  const glow = 0.09 + downbeat * 0.07; // softer behind the mark so its edges stay crisp

  // arcs spiral in then fade as the logo takes over
  const arcSpin = interpolate(frame, [0, 44], [0, 540], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const arcScale = interpolate(frame, [0, 44], [1.8, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const arcOp = interpolate(frame, [0, 12, 36, 52], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  // logo draws (gold outline) then fills (off-white)
  const draw = interpolate(frame, [8, 48], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const fill = interpolate(frame, [44, 64], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  const word = reveal(frame, 64, 82);
  const tag = reveal(frame, 80, 98);

  const circ = 2 * Math.PI * RING_R;
  const arcLen = circ / ROOMS.length;
  const gap = 10;

  return (
    <AbsoluteFill style={{opacity: fade, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.canvas, flexDirection: 'column'}}>
      <AbsoluteFill
        style={{
          background:
            `radial-gradient(ellipse 58% 52% at 50% 44%, rgba(212,166,82,${glow}), transparent 58%),` +
            `radial-gradient(ellipse 44% 42% at 28% 70%, rgba(208,136,180,${glow * 0.7}), transparent 56%),` +
            `radial-gradient(ellipse 44% 42% at 74% 64%, rgba(92,184,204,${glow * 0.6}), transparent 56%)`,
        }}
      />

      {/* logo + spiraling room arcs */}
      <div style={{position: 'relative', width: RING_BOX, height: RING_BOX, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: -40}}>
        <svg width={RING_BOX} height={RING_BOX} viewBox={`0 0 ${RING_BOX} ${RING_BOX}`} style={{position: 'absolute', inset: 0, transform: `rotate(${arcSpin}deg) scale(${arcScale})`, opacity: arcOp}}>
          {ROOMS.map((r, i) => (
            <circle
              key={r.key}
              cx={RING_BOX / 2}
              cy={RING_BOX / 2}
              r={RING_R}
              fill="none"
              stroke={r.color}
              strokeWidth={5}
              strokeLinecap="round"
              strokeDasharray={`${arcLen - gap} ${circ - arcLen + gap}`}
              transform={`rotate(${(i / ROOMS.length) * 360} ${RING_BOX / 2} ${RING_BOX / 2})`}
            />
          ))}
        </svg>
        {/* gold outline drawing on — fully fades as the fill resolves so no gold rim remains */}
        <div style={{position: 'absolute', opacity: interpolate(frame, [46, 64], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>
          <InsturixLogo size={LOGO_SIZE} color={theme.colors.gold} draw={draw} fill={0} strokeWidth={7} />
        </div>
        {/* off-white fill resolving over it */}
        <div style={{position: 'absolute'}}>
          <InsturixLogo size={LOGO_SIZE} color={theme.colors.textPrimary} draw={0} fill={fill} />
        </div>
      </div>

      <div style={{textAlign: 'center', marginTop: 8}}>
        <div style={{opacity: word, transform: `translateY(${(1 - word) * 12}px)`}}>
          <StaggerChars text="Insturix" fontSize={96} weight={800} gradient startAt={64} stagger={1.6} tracking={-0.03} />
        </div>
        <div style={{opacity: tag, marginTop: 22}}>
          <MonoLabel size={15} tracking={0.3} color={theme.colors.textMuted}>
            The AI content engine for brands &amp; agencies
          </MonoLabel>
        </div>
      </div>
    </AbsoluteFill>
  );
};
