import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {theme} from '../theme';
import {EASE} from '../anim';
import {useCountUp} from '../anim-ui';
import {MonoLabel} from '../components/MonoLabel';
import {SfxCue} from '../audio';

// THE MOAT — head-to-head + kill shot, paced to READ.
// ACT 1 (cold): templates make every brand look the SAME — one master stamps identical clones.
// SMASH → ACT 2 (warm): the engine COMPUTES a unique edit — a cascade of on-beat decisions to a number.
// "Everyone picks. We compute."
const sans = theme.font.sans;
const mono = theme.font.mono;

const A1_MASTER = 26;
const A1_STAMP = [44, 56, 68];
const A1_LABEL = 76;
const SMASH = 176; // ACT1 ("Same template. Same look.") holds ~1s longer before the smash
const CAS_START = 186;
const CAS_END = 274;
const SETTLE = 280;
const PAYOFF = 294;

const TL_L = 300;
const TL_W = 1320;
const TL_T = 398;
const TRACK_H = 48;
const TRACK_GAP = 12;
const TRACKS = [
  {label: 'VIDEO', color: theme.colors.purple},
  {label: 'CAPTIONS', color: theme.colors.cyan},
  {label: 'GRAPHICS', color: theme.colors.gold},
  {label: 'SFX', color: theme.colors.pink},
  {label: 'MUSIC', color: theme.colors.success},
];
const NBLOCKS = 56;
const BLOCKS = Array.from({length: NBLOCKS}, (_, i) => ({
  i,
  track: i % TRACKS.length,
  appear: CAS_START + (CAS_END - CAS_START) * Math.pow(i / NBLOCKS, 1.7),
  xFrac: ((i * 53) % 100) / 100,
  w: 28 + ((i * 17) % 76),
}));

const CLONES = ['BRAND A', 'BRAND B', 'BRAND C'];

export const MOAT_SFX: SfxCue[] = [
  {name: 'tick', at: A1_STAMP[0], volume: 0.4},
  {name: 'tick', at: A1_STAMP[1], volume: 0.4},
  {name: 'tick', at: A1_STAMP[2], volume: 0.4},
  {name: 'impact', at: A1_LABEL, volume: 0.35},
  {name: 'impact', at: SMASH, volume: 0.55}, // the head-to-head smash = an impact (was a whoosh)
  {name: 'riser', at: CAS_START + 2, volume: 0.5},
  {name: 'tick', at: 160, volume: 0.3},
  {name: 'tick', at: 190, volume: 0.35},
  {name: 'impact', at: CAS_END, volume: 0.7},
  {name: 'success', at: SETTLE + 2, volume: 0.55},
];

// a generic "template" card body — the SAME layout for master + every clone (that's the point).
// Kept BRIGHT/high-contrast so the sameness reads in a snap.
const TemplateBody: React.FC<{label: string; master?: boolean}> = ({label, master = false}) => (
  <div style={{width: 264, height: 166, borderRadius: 14, background: 'linear-gradient(135deg, #413b33, #211e1a)', border: `1.5px solid ${master ? '#7a7264' : '#544c42'}`, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 14, position: 'relative'}}>
    <div style={{position: 'absolute', top: 12, left: 16, fontFamily: mono, fontSize: 12, letterSpacing: '0.08em', color: master ? theme.colors.gold : '#b8b1a4'}}>{label}</div>
    <div style={{width: 74, height: 74, borderRadius: 999, background: '#6f675b'}} />
    <div style={{width: 150, height: 11, borderRadius: 3, background: '#5a5349'}} />
  </div>
);

export const MoatScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  // ---- ACT 1 — templates = sameness ----
  const a1 = interpolate(frame, [0, 10, SMASH - 8, SMASH], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const header = interpolate(frame, [4, 22], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
  const master = spring({frame: frame - A1_MASTER, fps, config: {damping: 16, mass: 0.6, stiffness: 180}});
  const labelOp = interpolate(frame, [A1_LABEL, A1_LABEL + 12], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  // ---- SMASH ----
  const smashFlash = interpolate(frame, [SMASH - 2, SMASH + 2, SMASH + 16], [0, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  // ---- ACT 2 ----
  const a2 = interpolate(frame, [SMASH, SMASH + 12], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const heat = interpolate(frame, [CAS_START, CAS_END], [0.06, 0.2], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const playheadX = TL_L + (((frame - CAS_START) * 24) % TL_W);
  const count = useCountUp(1268, CAS_START, CAS_END + 4);
  const climaxFlash = interpolate(frame, [CAS_END, CAS_END + 3, CAS_END + 18], [0, 0.7, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const ready = spring({frame: frame - SETTLE, fps, config: {damping: 14, mass: 0.6, stiffness: 170}});
  // the cascade recedes (scales/fades back) while the thesis line zooms IN — a transition into the payoff
  const resolve = interpolate(frame, [PAYOFF, PAYOFF + 22], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
  const payoffS = spring({frame: frame - PAYOFF, fps, config: {damping: 15, mass: 0.7, stiffness: 150}});

  return (
    <AbsoluteFill style={{backgroundColor: theme.colors.canvas}}>
      <AbsoluteFill style={{background: `radial-gradient(ellipse 64% 56% at 50% 46%, rgba(212,166,82,${heat}), transparent 62%)`, opacity: a2}} />

      {/* ===== ACT 1 — templates make everything the same ===== */}
      {a1 > 0.01 && (
        <AbsoluteFill style={{opacity: a1, justifyContent: 'flex-start', alignItems: 'center', flexDirection: 'column', paddingTop: 150}}>
          <div style={{opacity: header, marginBottom: 36, textAlign: 'center'}}>
            <span style={{fontFamily: sans, fontSize: 40, fontWeight: 600, color: theme.colors.textSecondary}}>Most “AI video” is a <span style={{color: theme.colors.textMuted}}>template</span>.</span>
          </div>

          {/* master template */}
          <div style={{opacity: Math.min(1, master), transform: `scale(${interpolate(Math.min(1, master), [0, 1], [0.85, 1])})`}}>
            <TemplateBody label="TEMPLATE" master />
          </div>

          {/* it stamps identical clones — same layout, every brand */}
          <div style={{marginTop: 26, height: 26}}>
            <MonoLabel size={12} tracking={0.2} color={theme.colors.textDim}>{frame >= A1_STAMP[0] ? 'applied to every brand →' : ''}</MonoLabel>
          </div>
          <div style={{display: 'flex', gap: 30, marginTop: 18}}>
            {CLONES.map((c, i) => {
              const s = spring({frame: frame - A1_STAMP[i], fps, config: {damping: 15, mass: 0.5, stiffness: 200}});
              if (s <= 0.001) return <div key={c} style={{width: 240}} />;
              const stampFlash = interpolate(frame, [A1_STAMP[i], A1_STAMP[i] + 3, A1_STAMP[i] + 12], [0, 0.5, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
              return (
                <div key={c} style={{position: 'relative', opacity: Math.min(1, s), transform: `translateY(${interpolate(Math.min(1, s), [0, 1], [-22, 0])}px) scale(${interpolate(Math.min(1, s), [0, 1], [0.9, 1])})`}}>
                  <TemplateBody label={c} />
                  <div style={{position: 'absolute', inset: 0, borderRadius: 14, background: theme.colors.textPrimary, opacity: stampFlash}} />
                </div>
              );
            })}
          </div>

          <div style={{marginTop: 44, opacity: labelOp, transform: `translateY(${(1 - labelOp) * 10}px)`}}>
            <span style={{fontFamily: sans, fontSize: 36, fontWeight: 800, color: theme.colors.danger}}>Same template. <span style={{color: '#E8857A'}}>Same look.</span></span>
          </div>
        </AbsoluteFill>
      )}

      {/* ===== ACT 2 — the engine (recedes as the thesis zooms in) ===== */}
      {a2 > 0.01 && (
        <AbsoluteFill style={{opacity: a2 * (1 - resolve * 0.85), transform: `scale(${1 - resolve * 0.06})`, transformOrigin: '50% 42%'}}>
          <div style={{position: 'absolute', top: 112, width: '100%', textAlign: 'center'}}>
            <MonoLabel size={14} tracking={0.34} color={theme.colors.gold}>Insturix · the editing engine</MonoLabel>
          </div>

          <div style={{position: 'absolute', top: 176, width: '100%', textAlign: 'center'}}>
            <span style={{fontFamily: mono, fontSize: 132, fontWeight: 500, letterSpacing: '-0.04em', lineHeight: 1, backgroundImage: theme.wordmarkGradient, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent'}}>
              {count.toLocaleString('en-US')}
            </span>
            <div style={{marginTop: 8}}>
              <MonoLabel size={14} tracking={0.3} color={theme.colors.textMuted}>edit decisions · computed for THIS video</MonoLabel>
            </div>
          </div>

          {TRACKS.map((tr, ti) => {
            const top = TL_T + ti * (TRACK_H + TRACK_GAP);
            return (
              <div key={tr.label}>
                <div style={{position: 'absolute', left: TL_L - 96, top, width: 88, height: TRACK_H, display: 'flex', alignItems: 'center', justifyContent: 'flex-end'}}>
                  <span style={{fontFamily: mono, fontSize: 11, letterSpacing: '0.08em', color: theme.colors.textDim}}>{tr.label}</span>
                </div>
                <div style={{position: 'absolute', left: TL_L, top, width: TL_W, height: TRACK_H, borderRadius: 8, background: theme.colors.raised, border: `1px solid ${theme.colors.border}`}} />
              </div>
            );
          })}

          {BLOCKS.map((b) => {
            const s = spring({frame: frame - b.appear, fps, config: {damping: 16, mass: 0.5, stiffness: 210}});
            if (s <= 0.001) return null;
            const tr = TRACKS[b.track];
            const top = TL_T + b.track * (TRACK_H + TRACK_GAP) + 8;
            const left = TL_L + 6 + b.xFrac * (TL_W - b.w - 12);
            return (
              <div key={b.i} style={{position: 'absolute', left, top, width: b.w, height: TRACK_H - 16, borderRadius: 5, background: `${tr.color}33`, border: `1px solid ${tr.color}aa`, opacity: Math.min(1, s), transform: `scale(${interpolate(Math.min(1, s), [0, 1], [0.4, 1])})`}} />
            );
          })}

          {frame >= CAS_START && frame < CAS_END && (
            <div style={{position: 'absolute', left: playheadX, top: TL_T - 6, width: 2, height: TRACKS.length * (TRACK_H + TRACK_GAP), background: theme.colors.gold, opacity: 0.7, boxShadow: `0 0 10px ${theme.colors.gold}`}} />
          )}

          {ready > 0.02 && (
            <div style={{position: 'absolute', top: TL_T + TRACKS.length * (TRACK_H + TRACK_GAP) + 32, width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 18, opacity: Math.min(1, ready), transform: `translateY(${interpolate(Math.min(1, ready), [0, 1], [14, 0])}px)`}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 9, padding: '9px 16px', borderRadius: 10, background: `${theme.colors.success}1a`, border: `1px solid ${theme.colors.success}55`}}>
                <span style={{color: theme.colors.success, fontSize: 15}}>✓</span>
                <span style={{fontFamily: mono, fontSize: 14, color: theme.colors.success, letterSpacing: '0.06em'}}>:30 ready · 4.0s</span>
              </div>
              <div style={{display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 999, background: theme.colors.well, border: `1px solid ${theme.colors.gold}55`}}>
                <div style={{width: 6, height: 6, borderRadius: 3, background: theme.colors.gold}} />
                <span style={{fontFamily: sans, fontSize: 14, fontWeight: 700, color: theme.colors.textPrimary}}>0 templates</span>
              </div>
            </div>
          )}

        </AbsoluteFill>
      )}

      {/* the thesis ZOOMS IN to centre as the cascade recedes — a transition into the payoff line */}
      {a2 > 0.01 && payoffS > 0.001 && (
        <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
          <div style={{opacity: Math.min(1, payoffS), transform: `scale(${interpolate(Math.min(1, payoffS), [0, 1], [0.5, 1])})`}}>
            <span style={{fontFamily: sans, fontSize: 60, fontWeight: 800, color: theme.colors.textPrimary, letterSpacing: '-0.01em'}}>Everyone picks. <span style={{color: theme.colors.gold}}>We compute.</span></span>
          </div>
        </AbsoluteFill>
      )}

      <AbsoluteFill style={{background: '#0B0B0A', opacity: smashFlash}} />
      <AbsoluteFill style={{background: `radial-gradient(circle at 50% 44%, rgba(212,166,82,${climaxFlash}), transparent 45%)`}} />
    </AbsoluteFill>
  );
};
