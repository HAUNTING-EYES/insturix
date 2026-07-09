import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {theme} from '../theme';
import {EASE} from '../anim';
import {StudioStage} from '../components/StudioStage';
import {MonoLabel} from '../components/MonoLabel';
import {SfxCue} from '../audio';

// "Design + formats" — one edit, every format. The finished video fans out into 9:16 / 1:1 / 16:9
// mockups (LangEase fanned-mockup move), with a predicted-CTR badge (Design = thumbnails that get
// clicked). Minimal text; the fan is the visual.
const sans = theme.font.sans;
const CX = 960;
const CY = 540; // fan-start = the burst's "Q4 — Launch" card centre, for the match cut

type Mock = {key: string; w: number; h: number; cx: number; cy: number; rot: number; appear: number; fmt: string; plat: string; ctr?: string};
const MOCKS: Mock[] = [
  {key: 'h', w: 470, h: 264, cx: 960, cy: 470, rot: 0, appear: 0, fmt: '16:9', plat: 'YouTube', ctr: '9.1%'},
  {key: 'v', w: 212, h: 376, cx: 596, cy: 492, rot: -11, appear: 50, fmt: '9:16', plat: 'Reels'},
  {key: 's', w: 322, h: 322, cx: 1346, cy: 492, rot: 11, appear: 62, fmt: '1:1', plat: 'Feed'},
];

export const FORMATS_SFX: SfxCue[] = [
  {name: 'pop', at: 14, volume: 0.45},
  {name: 'whoosh', at: 30, volume: 0.4},
  {name: 'whoosh', at: 42, volume: 0.4},
  {name: 'tick', at: 60, volume: 0.4},
  {name: 'success', at: 88, volume: 0.4},
];

const MockFrame: React.FC<{m: Mock; fan: number}> = ({m, fan}) => {
  const cx = interpolate(fan, [0, 1], [CX, m.cx]);
  const cy = interpolate(fan, [0, 1], [CY, m.cy]);
  const rot = interpolate(fan, [0, 1], [0, m.rot]);
  const sc = interpolate(fan, [0, 1], [0.7, 1]);
  return (
    <div
      style={{
        position: 'absolute',
        left: cx - m.w / 2,
        top: cy - m.h / 2,
        width: m.w,
        height: m.h,
        opacity: Math.min(1, fan * 1.4),
        transform: `rotate(${rot}deg) scale(${sc})`,
        borderRadius: 16,
        overflow: 'hidden',
        border: `1px solid ${theme.colors.borderEmph}`,
        boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
        background: 'radial-gradient(ellipse 70% 60% at 50% 42%, rgba(212,166,82,0.14), transparent 68%), #0A0A09',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{fontFamily: sans, fontWeight: 800, fontSize: m.w < 260 ? 26 : 40, letterSpacing: '-0.03em', backgroundImage: theme.wordmarkGradient, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', textAlign: 'center', padding: '0 14px'}}>Q4 — Launch</div>
      <div style={{position: 'absolute', top: 12, left: 14, display: 'flex', alignItems: 'center', gap: 7}}>
        <div style={{width: 6, height: 6, borderRadius: 3, background: theme.colors.gold}} />
        <span style={{fontFamily: theme.font.mono, fontSize: 11, color: theme.colors.textSecondary, letterSpacing: '0.06em'}}>{m.plat} · {m.fmt}</span>
      </div>
      {m.ctr && (
        <div style={{position: 'absolute', bottom: 12, right: 12, display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 7, background: `${theme.colors.success}22`, border: `1px solid ${theme.colors.success}55`}}>
          <span style={{color: theme.colors.success, fontSize: 11}}>▲</span>
          <span style={{fontFamily: theme.font.mono, fontSize: 12, color: theme.colors.success}}>{m.ctr} CTR</span>
        </div>
      )}
    </div>
  );
};

export const FormatsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const eyebrow = interpolate(frame, [2, 14], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const labels = interpolate(frame, [58, 74], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const caption = interpolate(frame, [88, 106], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <StudioStage tint="rgba(92,184,204,0.07)" tintAt="88% 86%">
      <div style={{position: 'absolute', top: 110, width: '100%', textAlign: 'center', opacity: eyebrow}}>
        <MonoLabel size={14} tracking={0.34} color={theme.colors.gold}>Design · one edit, every format</MonoLabel>
      </div>

      {/* render side mocks first, center on top so they fan out from behind it */}
      {[MOCKS[1], MOCKS[2], MOCKS[0]].map((m) => {
        // the 16:9 holds at the burst-card rect through the crossfade (the match cut), then fans out;
        // the side mockups spring out after.
        const fan = m.key === 'h'
          ? interpolate(frame, [46, 84], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE})
          : Math.min(1, spring({frame: frame - m.appear, fps, config: {damping: 17, mass: 0.7, stiffness: 150}}));
        if (m.key !== 'h' && fan <= 0.001) return null;
        return <MockFrame key={m.key} m={m} fan={fan} />;
      })}

      {/* format chips */}
      <div style={{position: 'absolute', top: 720, width: '100%', display: 'flex', justifyContent: 'center', gap: 14, opacity: labels}}>
        {['9:16 · Reels', '1:1 · Feed', '16:9 · YouTube', 'Thumbnails · CTR-ranked'].map((t) => (
          <div key={t} style={{padding: '9px 16px', borderRadius: 999, background: theme.colors.well, border: `1px solid ${theme.colors.border}`, fontFamily: sans, fontSize: 15, color: theme.colors.textSecondary}}>{t}</div>
        ))}
      </div>

      <div style={{position: 'absolute', top: 836, width: '100%', textAlign: 'center', opacity: caption}}>
        <span style={{fontFamily: sans, fontSize: 30, fontWeight: 700, color: theme.colors.textPrimary}}>One edit. <span style={{color: theme.colors.gold}}>Every format.</span></span>
      </div>
    </StudioStage>
  );
};
