import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {theme} from '../theme';
import {EASE} from '../anim';
import {SfxCue} from '../audio';

// Meta-reveal closer (the founder's idea): the film appears to be playing full-frame, then the CAMERA
// ZOOMS OUT to reveal it's a project IN the Insturix editor — "This too — was made by Insturix."
const WIN = {l: 360, t: 196, w: 1200, h: 675};
const CXC = WIN.l + WIN.w / 2; // 960
const CYC = WIN.t + WIN.h / 2; // 533.5
const ZOOM = 1920 / WIN.w; // 1.6 — at this scale the window's video fills the frame

export const META_SFX: SfxCue[] = [
  {name: 'pop', at: 32, volume: 0.4}, // reveal accent (was a whoosh)
  {name: 'success', at: 80, volume: 0.5},
];

export const MetaReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const out = interpolate(frame, [30, 72], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
  const scale = interpolate(out, [0, 1], [ZOOM, 1]);
  const chrome = interpolate(frame, [46, 72], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const line = interpolate(frame, [80, 100], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
  const prog = interpolate(frame, [0, 130], [0.18, 0.94], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill style={{backgroundColor: theme.colors.canvas}}>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 60% 50% at 50% 46%, rgba(212,166,82,0.10), transparent 60%)', opacity: chrome}} />

      <div style={{position: 'absolute', inset: 0, transform: `scale(${scale})`, transformOrigin: `${CXC}px ${CYC}px`}}>
        <div style={{position: 'absolute', left: WIN.l, top: WIN.t, width: WIN.w, height: WIN.h, borderRadius: 18, overflow: 'hidden', border: `1px solid ${theme.colors.borderEmph}`, boxShadow: '0 50px 130px rgba(0,0,0,0.6)', background: '#0A0A09'}}>
          {/* the "video" playing */}
          <AbsoluteFill style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, background: 'radial-gradient(ellipse 70% 60% at 50% 44%, rgba(212,166,82,0.10), transparent 62%)'}}>
            <div style={{fontFamily: theme.font.sans, fontWeight: 800, fontSize: 96, letterSpacing: '-0.03em', backgroundImage: theme.wordmarkGradient, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent'}}>Insturix</div>
            <div style={{fontFamily: theme.font.sans, fontSize: 24, color: theme.colors.textSecondary}}>One platform. Entire production.</div>
          </AbsoluteFill>

          {/* player chrome — fades in as we pull out */}
          <div style={{position: 'absolute', top: 0, left: 0, right: 0, height: 46, background: theme.colors.canvas, borderBottom: `1px solid ${theme.colors.border}`, display: 'flex', alignItems: 'center', padding: '0 18px', gap: 8, opacity: chrome}}>
            {[theme.colors.danger, theme.colors.gold, theme.colors.success].map((c) => (
              <div key={c} style={{width: 10, height: 10, borderRadius: 5, background: c, opacity: 0.85}} />
            ))}
            <span style={{marginLeft: 8, fontFamily: theme.font.mono, fontSize: 13, color: theme.colors.textMuted}}>insturix-launch-film.mp4</span>
            <span style={{marginLeft: 'auto', fontFamily: theme.font.mono, fontSize: 12, color: theme.colors.gold}}>Editron</span>
          </div>
          <div style={{position: 'absolute', bottom: 0, left: 0, right: 0, height: 56, background: 'linear-gradient(transparent, rgba(0,0,0,0.55))', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 14, opacity: chrome}}>
            <div style={{width: 30, height: 30, borderRadius: 15, background: theme.colors.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.colors.canvas, fontSize: 11}}>❚❚</div>
            <div style={{flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)'}}>
              <div style={{width: `${prog * 100}%`, height: '100%', borderRadius: 2, background: theme.colors.gold}} />
            </div>
            <span style={{fontFamily: theme.font.mono, fontSize: 12, color: theme.colors.textPrimary}}>01:08 / 01:12</span>
          </div>
        </div>
      </div>

      <div style={{position: 'absolute', bottom: 96, width: '100%', textAlign: 'center', opacity: line, transform: `translateY(${(1 - line) * 14}px)`}}>
        <span style={{fontFamily: theme.font.sans, fontSize: 36, fontWeight: 700, color: theme.colors.textPrimary, letterSpacing: '-0.01em'}}>This too — <span style={{color: theme.colors.gold}}>was made by Insturix.</span></span>
      </div>
    </AbsoluteFill>
  );
};
