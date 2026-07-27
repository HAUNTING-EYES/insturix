import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {theme} from '../theme';
import {EASE} from '../anim';
import {MonoLabel} from '../components/MonoLabel';
import {useBeatGrid} from '../beat';
import {SfxCue} from '../audio';

// "Distribute → Every format" — ONE continuous beat. The "Q4 — Launch" card carries the WHOLE way:
// match-cuts in from Analyze's preview → migrates to centre → BURSTS to 6 platforms → platforms recede
// → the SAME card grows into the 16:9 and SPAWNS the 9:16 / 1:1 variants. The card never disappears.
const sans = theme.font.sans;
const mono = theme.font.mono;
const PLATFORMS = ['YouTube', 'Instagram', 'TikTok', 'LinkedIn', 'X', 'Facebook'];
const CX = 960;
const CY = 540;
const R = 360;

type Rect = {l: number; t: number; w: number; h: number; fs: number};
const START: Rect = {l: 230, t: 196, w: 720, h: 405, fs: 60}; // = Analyze preview (the match cut)
const CENTERR: Rect = {l: 790, t: 445, w: 340, h: 190, fs: 30}; // burst source (centre, small)
const FMT: Rect = {l: 725, t: 338, w: 470, h: 264, fs: 40}; // formats 16:9 (centre 960,470)
const lerpRect = (a: Rect, b: Rect, p: number): Rect => ({
  l: interpolate(p, [0, 1], [a.l, b.l]),
  t: interpolate(p, [0, 1], [a.t, b.t]),
  w: interpolate(p, [0, 1], [a.w, b.w]),
  h: interpolate(p, [0, 1], [a.h, b.h]),
  fs: interpolate(p, [0, 1], [a.fs, b.fs]),
});

const SIDE = [
  {key: 'v', w: 212, h: 376, cx: 596, cy: 492, rot: -11, appear: 216, fmt: '9:16', plat: 'Reels'},
  {key: 's', w: 322, h: 322, cx: 1346, cy: 492, rot: 11, appear: 228, fmt: '1:1', plat: 'Feed'},
];

const clampE = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};

export const DISTRIBUTE_SFX: SfxCue[] = [
  {name: 'tick', at: 50, volume: 0.4},
  {name: 'riser', at: 64, volume: 0.38}, // build into the burst (was a whoosh)
  {name: 'impact', at: 74, volume: 0.6},
  {name: 'pop', at: 118, volume: 0.5},
  {name: 'pop', at: 190, volume: 0.45}, // card grows to formats (was a whoosh)
  {name: 'pop', at: 216, volume: 0.45},
  {name: 'pop', at: 228, volume: 0.45},
];

export const DistributeFormats: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {downbeat} = useBeatGrid();

  // ---- the ONE continuous card ----
  let rect: Rect;
  if (frame < 48) rect = START;
  else if (frame < 70) rect = lerpRect(START, CENTERR, interpolate(frame, [48, 70], [0, 1], {...clampE, easing: EASE}));
  else if (frame < 190) rect = CENTERR;
  else if (frame < 218) rect = lerpRect(CENTERR, FMT, interpolate(frame, [190, 218], [0, 1], {...clampE, easing: EASE}));
  else rect = FMT;

  // ---- burst platforms (then recede) ----
  const burst = spring({frame: frame - 74, fps, config: {damping: 15, mass: 0.8, stiffness: 90}});
  const recede = interpolate(frame, [176, 200], [0, 1], {...clampE, easing: EASE}); // burst holds much longer
  const platVis = Math.min(1, burst * 1.5) * (1 - recede);
  const flash = interpolate(frame, [74, 80, 104], [0, 0.6, 0], clampE);
  // the line arrives AFTER the burst lands, as a distinct pop (not a fade)
  const pubS = spring({frame: frame - 116, fps, config: {damping: 13, mass: 0.7, stiffness: 160}});
  const pubVis = Math.min(1, pubS) * (1 - interpolate(frame, [186, 200], [0, 1], clampE));

  // ---- formats phase ----
  const scrubber = interpolate(frame, [56, 72], [1, 0], clampE); // analyze-style scrubber fades as it migrates
  const fmtTag = interpolate(frame, [214, 230], [0, 1], clampE);
  const eyebrowFmt = interpolate(frame, [196, 214], [0, 1], clampE);
  const chips = interpolate(frame, [230, 246], [0, 1], clampE);
  const caption = interpolate(frame, [248, 268], [0, 1], clampE);

  return (
    <AbsoluteFill style={{backgroundColor: theme.colors.canvas}}>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 60% 50% at 50% 46%, rgba(212,166,82,0.10), transparent 60%)'}} />
      <AbsoluteFill style={{background: `radial-gradient(circle at ${CX}px ${CY}px, rgba(212,166,82,${flash}), transparent 40%)`}} />

      {eyebrowFmt > 0.01 && (
        <div style={{position: 'absolute', top: 110, width: '100%', textAlign: 'center', opacity: eyebrowFmt}}>
          <MonoLabel size={14} tracking={0.34} color={theme.colors.gold}>Design · one edit, every format</MonoLabel>
        </div>
      )}

      {/* platform tiles bursting from the card, then receding */}
      {platVis > 0.01 && PLATFORMS.map((p, i) => {
        const ang = (i / PLATFORMS.length) * Math.PI * 2 - Math.PI / 2;
        const out = burst * (1 - recede);
        const x = interpolate(out, [0, 1], [CX, CX + Math.cos(ang) * R]);
        const y = interpolate(out, [0, 1], [CY, CY + Math.sin(ang) * R]);
        const check = interpolate(burst, [0.7, 1], [0, 1], clampE);
        return (
          <div key={p} style={{position: 'absolute', left: x - 95, top: y - 26, width: 190, transform: `scale(${interpolate(out, [0, 0.4, 1], [0, 0.6, 1])})`, opacity: platVis, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', borderRadius: 10, background: theme.colors.raised, border: `1px solid ${theme.colors.success}55`}}>
            <span style={{fontFamily: sans, fontWeight: 500, fontSize: 17, color: theme.colors.textSecondary}}>{p}</span>
            <span style={{color: theme.colors.success, fontWeight: 800, opacity: check}}>✓</span>
          </div>
        );
      })}

      {/* side format mockups — grow OUT of the card */}
      {SIDE.map((m) => {
        const s = Math.min(1, spring({frame: frame - m.appear, fps, config: {damping: 17, mass: 0.7, stiffness: 150}}));
        if (s <= 0.001) return null;
        const mx = interpolate(s, [0, 1], [CX, m.cx]);
        const my = interpolate(s, [0, 1], [CY - 70, m.cy]);
        const rot = interpolate(s, [0, 1], [0, m.rot]);
        const sc = interpolate(s, [0, 1], [0.4, 1]);
        return (
          <div key={m.key} style={{position: 'absolute', left: mx - m.w / 2, top: my - m.h / 2, width: m.w, height: m.h, opacity: s, transform: `rotate(${rot}deg) scale(${sc})`, borderRadius: 16, overflow: 'hidden', border: `1px solid ${theme.colors.borderEmph}`, boxShadow: '0 30px 80px rgba(0,0,0,0.55)', background: 'radial-gradient(ellipse 70% 60% at 50% 42%, rgba(212,166,82,0.14), transparent 68%), #0A0A09', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            <div style={{fontFamily: sans, fontWeight: 800, fontSize: m.w < 260 ? 26 : 34, letterSpacing: '-0.03em', backgroundImage: theme.wordmarkGradient, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', textAlign: 'center', padding: '0 14px'}}>Q4 — Launch</div>
            <div style={{position: 'absolute', top: 12, left: 14, display: 'flex', alignItems: 'center', gap: 7}}>
              <div style={{width: 6, height: 6, borderRadius: 3, background: theme.colors.gold}} />
              <span style={{fontFamily: mono, fontSize: 11, color: theme.colors.textSecondary, letterSpacing: '0.06em'}}>{m.plat} · {m.fmt}</span>
            </div>
          </div>
        );
      })}

      {/* THE continuous card */}
      <div style={{position: 'absolute', left: rect.l, top: rect.t, width: rect.w, height: rect.h, borderRadius: 16, background: 'radial-gradient(ellipse 70% 60% at 50% 45%, rgba(212,166,82,0.08), transparent 65%), #0A0A09', border: `1px solid ${theme.colors.border}`, boxShadow: `0 0 ${26 + downbeat * 24}px rgba(212,166,82,0.2), 0 30px 90px rgba(0,0,0,0.5)`, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <div style={{fontFamily: sans, fontWeight: 800, fontSize: rect.fs, letterSpacing: '-0.03em', backgroundImage: theme.wordmarkGradient, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent'}}>Q4 — Launch</div>
        {/* analyze-style scrubber (fades as the card leaves analyze) */}
        {scrubber > 0.01 && (
          <div style={{position: 'absolute', left: 26, right: 26, bottom: 24, opacity: scrubber}}>
            <div style={{height: 3, borderRadius: 2, background: theme.colors.well}}><div style={{width: '38%', height: '100%', background: theme.colors.gold, borderRadius: 2}} /></div>
          </div>
        )}
        {/* formats tag + CTR */}
        {fmtTag > 0.01 && (
          <>
            <div style={{position: 'absolute', top: 12, left: 14, display: 'flex', alignItems: 'center', gap: 7, opacity: fmtTag}}>
              <div style={{width: 6, height: 6, borderRadius: 3, background: theme.colors.gold}} />
              <span style={{fontFamily: mono, fontSize: 11, color: theme.colors.textSecondary, letterSpacing: '0.06em'}}>YouTube · 16:9</span>
            </div>
            <div style={{position: 'absolute', bottom: 12, right: 12, display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 7, background: `${theme.colors.success}22`, border: `1px solid ${theme.colors.success}55`, opacity: fmtTag}}>
              <span style={{color: theme.colors.success, fontSize: 11}}>▲</span>
              <span style={{fontFamily: mono, fontSize: 12, color: theme.colors.success}}>9.1% CTR</span>
            </div>
          </>
        )}
      </div>

      {/* labels */}
      <div style={{position: 'absolute', bottom: 92, width: '100%', textAlign: 'center', opacity: pubVis, transform: `scale(${interpolate(Math.min(1, pubS), [0, 1], [0.78, 1])})`}}>
        <span style={{fontFamily: sans, fontSize: 28, fontWeight: 700, color: theme.colors.textPrimary}}>One click. <span style={{color: theme.colors.gold}}>Posted everywhere.</span></span>
      </div>
      <div style={{position: 'absolute', top: 720, width: '100%', display: 'flex', justifyContent: 'center', gap: 14, opacity: chips}}>
        {['9:16 · Reels', '1:1 · Feed', '16:9 · YouTube', 'Thumbnails · CTR-ranked'].map((t) => (
          <div key={t} style={{padding: '9px 16px', borderRadius: 999, background: theme.colors.well, border: `1px solid ${theme.colors.border}`, fontFamily: sans, fontSize: 15, color: theme.colors.textSecondary}}>{t}</div>
        ))}
      </div>
      <div style={{position: 'absolute', top: 836, width: '100%', textAlign: 'center', opacity: caption}}>
        <span style={{fontFamily: sans, fontSize: 30, fontWeight: 700, color: theme.colors.textPrimary}}>One edit. <span style={{color: theme.colors.gold}}>Every format.</span></span>
      </div>
    </AbsoluteFill>
  );
};
