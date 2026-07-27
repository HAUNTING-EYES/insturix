import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {theme} from '../theme';
import {EASE, POP} from '../anim';
import {useCountUp} from '../anim-ui';
import {StudioStage} from '../components/StudioStage';
import {SfxCue} from '../audio';

// "Analyze" — know what works before you publish. Reworked Lovable/LangEase-style: a focused report on
// the warm stage (purple tint), not an edge-to-edge dashboard. The verdict REVEALS, beat-matched to 136
// BPM: score COUNTS 0→91 and lands green on beat 4 (success chime) → a "READY TO PUBLISH" pill snaps in
// (the LangEase "→ Done" beat) → "Strong hook. Ship it." → strengths ✓ pop in.
const sans = theme.font.sans;
const mono = theme.font.mono;

const B = 26.4706;
export const ANALYZE_LAND = Math.round(B * 4); // 106 — score lands on beat 4
const STRENGTH_AT = [70, 84, 98];

export const ANALYZE_SFX: SfxCue[] = [
  ...STRENGTH_AT.map((at): SfxCue => ({name: 'tick', at, volume: 0.45})),
  {name: 'riser', at: ANALYZE_LAND - 34, volume: 0.4},
  {name: 'impact', at: ANALYZE_LAND, volume: 0.6},
  {name: 'success', at: ANALYZE_LAND, volume: 0.7},
];

const Mono: React.FC<{children: React.ReactNode; color?: string; size?: number}> = ({children, color = theme.colors.textDim, size = 13}) => (
  <span style={{fontFamily: mono, fontSize: size, color, textTransform: 'uppercase', letterSpacing: '0.16em'}}>{children}</span>
);

const CONTENT_L = 230;
const CONTENT_W = 1460;
const CONTENT_T = 196;

export const AnalyzeScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const score = useCountUp(91, 18, ANALYZE_LAND);
  const scoreColor = score >= 85 ? theme.colors.success : score >= 70 ? theme.colors.gold : theme.colors.danger;
  const landPulse = interpolate(frame, [ANALYZE_LAND, ANALYZE_LAND + 5, ANALYZE_LAND + 22], [0, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const scoreScale = 1 + landPulse * 0.06;
  const verdict = interpolate(frame, [ANALYZE_LAND + 4, ANALYZE_LAND + 22], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
  const delta = interpolate(frame, [ANALYZE_LAND + 14, ANALYZE_LAND + 30], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const readyS = spring({frame: frame - ANALYZE_LAND, fps, config: {damping: 12, mass: 0.7, stiffness: 170}});
  const eyebrow = interpolate(frame, [2, 14], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <StudioStage tint="rgba(144,136,212,0.10)" tintAt="88% 90%">
      {/* eyebrow */}
      <div style={{position: 'absolute', left: CONTENT_L, top: CONTENT_T - 56, display: 'flex', alignItems: 'center', gap: 12, opacity: eyebrow}}>
        <span style={{fontFamily: sans, fontSize: 20, fontWeight: 800, color: theme.colors.textPrimary, letterSpacing: '-0.02em'}}>Insturix</span>
        <Mono color={theme.colors.purple} size={13}>Analyze</Mono>
      </div>

      {/* hero: preview + score/verdict */}
      <div style={{position: 'absolute', left: CONTENT_L, top: CONTENT_T, width: CONTENT_W, display: 'flex', gap: 56, alignItems: 'center'}}>
        <div style={{width: 720, height: 405, borderRadius: 16, background: 'radial-gradient(ellipse 70% 60% at 50% 45%, rgba(212,166,82,0.07), transparent 65%), #0A0A09', border: `1px solid ${theme.colors.border}`, boxShadow: '0 30px 90px rgba(0,0,0,0.5)', position: 'relative', overflow: 'hidden', flexShrink: 0}}>
          <div style={{position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
            <div style={{fontFamily: sans, fontWeight: 800, fontSize: 60, letterSpacing: '-0.03em', backgroundImage: theme.wordmarkGradient, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent'}}>Q4 — Launch</div>
          </div>
          <div style={{position: 'absolute', left: 26, right: 26, bottom: 24}}>
            <div style={{height: 3, borderRadius: 2, background: theme.colors.well}}><div style={{width: '38%', height: '100%', background: theme.colors.gold, borderRadius: 2}} /></div>
            <div style={{display: 'flex', justifyContent: 'space-between', marginTop: 10}}>
              <Mono color={theme.colors.textMuted} size={12}>00:11</Mono>
              <Mono color={theme.colors.textDim} size={12}>00:30</Mono>
            </div>
          </div>
        </div>

        <div style={{flex: 1}}>
          <Mono size={14}>Quality score</Mono>
          <div style={{fontFamily: mono, fontSize: 210, fontWeight: 500, lineHeight: 0.84, letterSpacing: '-0.06em', color: scoreColor, marginTop: 10, transform: `scale(${scoreScale})`, transformOrigin: 'left center', textShadow: landPulse > 0.05 ? `0 0 ${landPulse * 46}px ${scoreColor}88` : 'none'}}>{score}</div>
          {/* LangEase "→ Done" beat: a READY pill snaps in when the score lands */}
          <div style={{display: 'inline-flex', alignItems: 'center', gap: 9, marginTop: 22, padding: '9px 16px', borderRadius: 10, background: `${theme.colors.success}1a`, border: `1px solid ${theme.colors.success}55`, opacity: Math.min(1, readyS), transform: `scale(${interpolate(Math.min(1, readyS), [0, 1], [0.8, 1])})`, transformOrigin: 'left center'}}>
            <span style={{color: theme.colors.success, fontSize: 16, fontWeight: 800}}>✓</span>
            <span style={{fontFamily: mono, fontSize: 14, color: theme.colors.success, letterSpacing: '0.1em', textTransform: 'uppercase'}}>Ready to publish</span>
          </div>
          <div style={{overflow: 'hidden', marginTop: 18}}>
            <div style={{fontFamily: sans, fontSize: 28, fontWeight: 600, color: theme.colors.textPrimary, opacity: verdict, transform: `translateY(${(1 - verdict) * 16}px)`}}>Strong hook. Ship it.</div>
          </div>
          <div style={{marginTop: 10, opacity: delta}}>
            <Mono color={theme.colors.success} size={13}>+18 vs your average</Mono>
          </div>
        </div>
      </div>

      {/* strengths + areas to improve */}
      <div style={{position: 'absolute', left: CONTENT_L, top: CONTENT_T + 470, width: CONTENT_W, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64}}>
        <div>
          <Mono color={theme.colors.success}>Strengths</Mono>
          <div style={{display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18}}>
            {['Hook lands in 1.8s', 'Pacing holds attention', 'One clear CTA'].map((str, i) => {
              const s = spring({frame: frame - STRENGTH_AT[i], fps, config: POP});
              return (
                <div key={str} style={{display: 'flex', alignItems: 'center', gap: 12, opacity: interpolate(s, [0, 0.4], [0, 1])}}>
                  <span style={{color: theme.colors.success, fontWeight: 800, fontSize: 18, transform: `scale(${interpolate(s, [0, 1], [0, 1])})`, display: 'inline-block'}}>✓</span>
                  <span style={{fontFamily: sans, fontSize: 18, color: theme.colors.textSecondary}}>{str}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <Mono color={theme.colors.gold}>Areas to improve</Mono>
          <div style={{display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18}}>
            {['Captions start 0.4s late', 'Slight mid-roll dip at 0:14'].map((str, i) => {
              const op = interpolate(frame, [ANALYZE_LAND + 8 + i * 8, ANALYZE_LAND + 22 + i * 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
              return (
                <div key={str} style={{display: 'flex', alignItems: 'center', gap: 12, opacity: op}}>
                  <span style={{color: theme.colors.gold, fontSize: 20, lineHeight: 1}}>•</span>
                  <span style={{fontFamily: sans, fontSize: 18, color: theme.colors.textSecondary}}>{str}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </StudioStage>
  );
};
