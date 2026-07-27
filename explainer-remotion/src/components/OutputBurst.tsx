import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {theme} from '../theme';
import {MonoLabel} from './MonoLabel';
import {useFade, EASE} from '../anim';
import {useBeatGrid} from '../beat';

// "Distribute" — the scored video bursts to every platform. Opens as a MATCH CUT: the "Q4 — Launch"
// card is pixel-aligned to the Analyze preview (same rect / radius / text), so the pure-crossfade seam
// ('cut') reads as the SAME card persisting. It then migrates to center, shrinks, and detonates into
// the six platform tiles. (Distribute follows Analyze — "know what works BEFORE you publish".)
const PLATFORMS = ['YouTube', 'Instagram', 'TikTok', 'LinkedIn', 'X', 'Facebook'];
const CX = 960;
const CY = 540;
const R = 360;

// START rect = AnalyzeScreen preview (left 230, top 196, 720×405, font 60). END = small centre card.
const START = {l: 230, t: 196, w: 720, h: 405, fs: 60};
const END = {l: CX - 170, t: CY - 95, w: 340, h: 190, fs: 30};

export const OutputBurst: React.FC<{durationInFrames: number; title?: string}> = ({
  durationInFrames,
  title = 'Q4 — Launch',
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const fade = useFade(durationInFrames);
  const {downbeat} = useBeatGrid();

  // card migrates from the match rect to centre (after the crossfade seam completes at ~46)
  const m = interpolate(frame, [48, 70], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
  const cl = interpolate(m, [0, 1], [START.l, END.l]);
  const ct = interpolate(m, [0, 1], [START.t, END.t]);
  const cw = interpolate(m, [0, 1], [START.w, END.w]);
  const ch = interpolate(m, [0, 1], [START.h, END.h]);
  const cfs = interpolate(m, [0, 1], [START.fs, END.fs]);

  const burst = spring({frame: frame - 72, fps, config: {damping: 15, mass: 0.8, stiffness: 90}});
  const flash = interpolate(frame, [72, 80, 104], [0, 0.5, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const labelOp = interpolate(frame, [104, 126], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill style={{opacity: fade, backgroundColor: theme.colors.canvas}}>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 60% 46% at 50% 44%, rgba(212,166,82,0.10), transparent 60%)'}} />
      <AbsoluteFill style={{background: `radial-gradient(circle at ${CX}px ${CY}px, rgba(212,166,82,${flash}), transparent 40%)`}} />

      {/* platform tiles flying out to a ring */}
      {PLATFORMS.map((p, i) => {
        const ang = (i / PLATFORMS.length) * Math.PI * 2 - Math.PI / 2;
        const tx = CX + Math.cos(ang) * R;
        const ty = CY + Math.sin(ang) * R;
        const x = interpolate(burst, [0, 1], [CX, tx]);
        const y = interpolate(burst, [0, 1], [CY, ty]);
        const check = interpolate(burst, [0.7, 1], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
        return (
          <div
            key={p}
            style={{
              position: 'absolute',
              left: x - 95,
              top: y - 26,
              width: 190,
              transform: `scale(${interpolate(burst, [0, 0.4, 1], [0, 0.6, 1])})`,
              opacity: Math.min(1, burst * 1.5),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '11px 16px',
              borderRadius: 10,
              background: theme.colors.raised,
              border: `1px solid ${theme.colors.success}55`,
            }}
          >
            <span style={{fontFamily: theme.font.sans, fontWeight: 500, fontSize: 17, color: theme.colors.textSecondary}}>{p}</span>
            <span style={{color: theme.colors.success, fontWeight: 800, opacity: check}}>✓</span>
          </div>
        );
      })}

      {/* source card — pixel-aligned to the Analyze preview at the seam, then migrates to centre */}
      <div
        style={{
          position: 'absolute',
          left: cl,
          top: ct,
          width: cw,
          height: ch,
          borderRadius: 16,
          background: 'radial-gradient(ellipse 70% 60% at 50% 45%, rgba(212,166,82,0.07), transparent 65%), #0A0A09',
          border: `1px solid ${theme.colors.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 0 ${30 + downbeat * 30}px rgba(212,166,82,0.22), 0 30px 90px rgba(0,0,0,0.5)`,
        }}
      >
        <div style={{fontFamily: theme.font.sans, fontWeight: 800, fontSize: cfs, letterSpacing: '-0.03em', backgroundImage: theme.wordmarkGradient, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent'}}>{title}</div>
        {/* progress scrubber — matches the Analyze preview; fades as the card migrates */}
        <div style={{position: 'absolute', left: 26, right: 26, bottom: 24, opacity: 1 - m}}>
          <div style={{height: 3, borderRadius: 2, background: theme.colors.well}}><div style={{width: '38%', height: '100%', background: theme.colors.gold, borderRadius: 2}} /></div>
        </div>
      </div>

      <div style={{position: 'absolute', bottom: 96, width: '100%', textAlign: 'center', opacity: labelOp}}>
        <MonoLabel size={15} tracking={0.36} color={theme.colors.textDim}>Published everywhere · one click</MonoLabel>
      </div>
    </AbsoluteFill>
  );
};
