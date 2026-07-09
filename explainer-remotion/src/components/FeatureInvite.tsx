import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {theme} from '../theme';
import {MonoLabel} from './MonoLabel';
import {useFade, reveal} from '../anim';
import {Cursor, useCursorZoomCamera} from '../anim-ui';

// Focused feature shot (Lovable's "one big cursor interaction" model): the Multiplayer/Invite card.
// A cursor moves to Invite, clicks, and a new teammate pops into the list. Cause → effect. A subtle
// camera trails the cursor toward the Invite button so the shot feels alive (not a static screenshot).
const CARD_L = 632;
const CARD_T = 330;
const CARD_W = 656;
const CLICK = 66;
const CURSOR_POINTS = [
  {x: 1420, y: 760, at: 22},
  {x: 1205, y: 443, at: 60}, // tip on the Invite button centre
  {x: 1205, y: 443, at: CLICK, click: true},
];

const BASE = [
  {name: 'Jodie', sub: ' (you)', role: 'Owner', c: theme.colors.gold, i: 'J'},
  {name: 'Noah', sub: '', role: 'Editor', c: theme.colors.cyan, i: 'N'},
];

const Member: React.FC<{name: string; sub: string; role: string; c: string; i: string; appear: number}> = ({name, sub, role, c, i, appear}) => (
  <div style={{display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', opacity: appear, transform: `translateY(${interpolate(appear, [0, 1], [10, 0])}px)`}}>
    <div style={{width: 40, height: 40, borderRadius: 20, flexShrink: 0, background: `linear-gradient(135deg, ${c}, ${theme.colors.gold})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: theme.font.sans, fontWeight: 800, fontSize: 15, color: theme.colors.canvas}}>{i}</div>
    <div style={{flex: 1, fontFamily: theme.font.sans, fontSize: 18, fontWeight: 600, color: theme.colors.textPrimary}}>
      {name}<span style={{color: theme.colors.textMuted, fontWeight: 400}}>{sub}</span>
    </div>
    <div style={{fontFamily: theme.font.sans, fontSize: 15, color: theme.colors.textMuted}}>{role} <span style={{color: theme.colors.textDim}}>▾</span></div>
  </div>
);

export const FeatureInvite: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const fade = useFade(durationInFrames);
  const cardS = spring({frame: frame - 4, fps, config: {damping: 18, mass: 0.6, stiffness: 200}});
  const eyebrow = reveal(frame, 8, 24);
  const pressed = frame >= CLICK && frame < CLICK + 8;
  const newMember = spring({frame: frame - (CLICK + 4), fps, config: {damping: 14, mass: 0.7, stiffness: 130}});
  const cam = useCursorZoomCamera(CURSOR_POINTS, {zoom: 1.5, releaseAt: 84, releaseEnd: 112});
  const boom = interpolate(frame, [CLICK, CLICK + 3, CLICK + 18], [0, 0.5, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill style={{opacity: fade, backgroundColor: theme.colors.canvas}}>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 55% 55% at 50% 50%, rgba(212,166,82,0.07), transparent 62%)'}} />
      <AbsoluteFill style={cam}>

      <div style={{position: 'absolute', top: 220, width: '100%', textAlign: 'center', opacity: eyebrow}}>
        <MonoLabel size={15} tracking={0.3} color={theme.colors.gold}>Multiplayer · built for agencies</MonoLabel>
      </div>

      <div
        style={{
          position: 'absolute',
          left: CARD_L,
          top: CARD_T,
          width: CARD_W,
          opacity: cardS,
          transform: `scale(${interpolate(cardS, [0, 1], [0.95, 1])})`,
          transformOrigin: 'center top',
          background: theme.colors.raised,
          border: `1px solid ${theme.colors.borderEmph}`,
          borderRadius: 16,
          padding: 32,
          boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{fontFamily: theme.font.sans, fontSize: 26, fontWeight: 700, color: theme.colors.textPrimary, marginBottom: 22}}>Invite your team</div>
        <div style={{display: 'flex', gap: 12, marginBottom: 8}}>
          <div style={{flex: 1, padding: '14px 16px', borderRadius: 10, background: theme.colors.well, border: `1px solid ${theme.colors.border}`, fontFamily: theme.font.sans, fontSize: 17, color: theme.colors.textMuted}}>lucy@brand.com</div>
          <div style={{padding: '14px 26px', borderRadius: 10, background: theme.colors.gold, color: theme.colors.canvas, fontFamily: theme.font.sans, fontSize: 17, fontWeight: 800, transform: `scale(${pressed ? 0.94 : 1})`, boxShadow: pressed ? `0 0 22px ${theme.colors.gold}66` : 'none'}}>Invite</div>
        </div>
        <div style={{height: 1, background: theme.colors.border, margin: '16px 0 4px'}} />
        {BASE.map((m) => (
          <Member key={m.name} name={m.name} sub={m.sub} role={m.role} c={m.c} i={m.i} appear={1} />
        ))}
        {newMember > 0.01 && <Member name="Priya" sub="" role="Editor" c={theme.colors.pink} i="P" appear={newMember} />}
      </div>

        <Cursor points={CURSOR_POINTS} />
      </AbsoluteFill>
      {boom > 0.001 && <AbsoluteFill style={{background: `radial-gradient(circle at 1205px 443px, rgba(212,166,82,${boom}), transparent 32%)`}} />}
    </AbsoluteFill>
  );
};
