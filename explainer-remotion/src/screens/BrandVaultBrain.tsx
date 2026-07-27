import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {ROOMS, theme} from '../theme';
import {EASE} from '../anim';
import {StudioStage} from '../components/StudioStage';
import {MonoLabel} from '../components/MonoLabel';
import {SfxCue} from '../audio';

// "One brain" — the scanned Brand Vault wires to all six rooms. The vault core (the brand we just
// scanned) sits centre; the six rooms pop in around it on a hex ring; connecting lines draw out and
// a pulse of brand DNA travels core → room. "Every tool shares one brain." Completes the Vault story.
const sans = theme.font.sans;
const CX = 960;
const CY = 588;
const R = 300;
const PALETTE = ['#6B4226', '#A9743F', '#D9B382', '#F2E6D0', '#D4A652'];

const nodeAt = (i: number) => {
  const ang = (-90 + i * 60) * (Math.PI / 180);
  return {x: CX + Math.cos(ang) * R, y: CY + Math.sin(ang) * R};
};

const LINK_AT = (i: number) => 26 + i * 5; // line draw start per room

export const BRANDBRAIN_SFX: SfxCue[] = [
  ...ROOMS.map((_, i): SfxCue => ({name: i === 0 ? 'pop' : 'tick', at: LINK_AT(i) + 8, volume: 0.4})),
  {name: 'success', at: LINK_AT(5) + 18, volume: 0.4},
];

export const BrandVaultBrain: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const headline = interpolate(frame, [4, 22], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
  const core = spring({frame: frame - 6, fps, config: {damping: 13, mass: 0.7, stiffness: 160}});
  const corePulse = 0.5 + 0.5 * Math.sin(frame * 0.12);

  return (
    <StudioStage>
      <div style={{position: 'absolute', top: 86, width: '100%', textAlign: 'center', opacity: headline}}>
        <MonoLabel size={14} tracking={0.32} color={theme.colors.gold}>The intelligence layer</MonoLabel>
        <div style={{fontFamily: sans, fontSize: 40, fontWeight: 700, color: theme.colors.textPrimary, letterSpacing: '-0.02em', marginTop: 12}}>
          Every tool shares <span style={{color: theme.colors.gold}}>one brain.</span>
        </div>
      </div>

      {/* links + traveling pulses */}
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
        {ROOMS.map((r, i) => {
          const n = nodeAt(i);
          const len = Math.hypot(n.x - CX, n.y - CY);
          const draw = interpolate(frame, [LINK_AT(i), LINK_AT(i) + 24], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
          const t = (((frame - LINK_AT(i)) % 40) / 40);
          const px = interpolate(t, [0, 1], [CX, n.x]);
          const py = interpolate(t, [0, 1], [CY, n.y]);
          const pOp = draw > 0.98 ? Math.sin(t * Math.PI) : 0;
          return (
            <g key={r.key}>
              <line x1={CX} y1={CY} x2={n.x} y2={n.y} stroke={r.color} strokeWidth={1.5} strokeOpacity={0.32} strokeDasharray={len} strokeDashoffset={len * (1 - draw)} />
              {pOp > 0.01 && <circle cx={px} cy={py} r={4} fill={r.color} opacity={pOp} />}
            </g>
          );
        })}
      </svg>

      {/* room nodes */}
      {ROOMS.map((r, i) => {
        const n = nodeAt(i);
        const s = spring({frame: frame - (LINK_AT(i) + 6), fps, config: {damping: 14, mass: 0.6, stiffness: 170}});
        return (
          <div key={r.key} style={{position: 'absolute', left: n.x, top: n.y, transform: `translate(-50%, -50%) scale(${interpolate(s, [0, 1], [0.6, 1])})`, opacity: s, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderRadius: 999, background: theme.colors.raised, border: `1px solid ${r.color}66`, boxShadow: `0 8px 26px rgba(0,0,0,0.4)`}}>
            <div style={{width: 9, height: 9, borderRadius: 5, background: r.color, boxShadow: `0 0 10px ${r.color}`}} />
            <span style={{fontFamily: sans, fontSize: 19, fontWeight: 600, color: theme.colors.textPrimary}}>{r.verb.replace('.', '')}</span>
          </div>
        );
      })}

      {/* vault core — the brand we scanned */}
      <div style={{position: 'absolute', left: CX, top: CY, transform: `translate(-50%, -50%) scale(${interpolate(core, [0, 1], [0.5, 1])})`, opacity: core, width: 188, height: 188, borderRadius: 28, background: 'radial-gradient(ellipse 80% 80% at 50% 40%, rgba(212,166,82,0.16), transparent 70%), #0F0F0E', border: `1px solid rgba(212,166,82,0.5)`, boxShadow: `0 0 ${40 + corePulse * 50}px rgba(212,166,82,${0.3 + corePulse * 0.25})`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16}}>
        <div style={{width: 64, height: 64, borderRadius: 32, background: theme.wordmarkGradient, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: sans, fontWeight: 800, fontSize: 32, color: theme.colors.canvas}}>M</div>
        <div style={{display: 'flex', gap: 7}}>
          {PALETTE.map((c) => (
            <div key={c} style={{width: 14, height: 14, borderRadius: 4, background: c}} />
          ))}
        </div>
        <MonoLabel size={10} tracking={0.22} color={theme.colors.textMuted}>Brand Vault</MonoLabel>
      </div>
    </StudioStage>
  );
};
