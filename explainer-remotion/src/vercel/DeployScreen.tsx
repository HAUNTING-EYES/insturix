import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion';
import {VERCEL, VERCEL_MONO, VERCEL_GREEN} from './brand';

// BESPOKE Vercel product moment — the deployment building itself. A git push resolves into a live URL: the
// build log streams line by line, the status pill flips Building → Ready, the preview URL resolves, and a
// cursor clicks Visit. Hand-built for Vercel's stark black/white/mono aesthetic. Not an archetype — this is
// Vercel's actual product, dramatized. Deterministic on useCurrentFrame.
const c = VERCEL.colors;
const EASE = Easing.bezier(0.16, 1, 0.3, 1);
const mono = VERCEL_MONO;
const sans = VERCEL.fontSans;

type Line = {text: string; at: number; ok?: boolean; tri?: boolean; dim?: boolean};
const LINES: Line[] = [
  {text: 'Deploying acme-store', at: 8, tri: true},
  {text: 'Cloning github.com/acme/store (main: a3f9c2e)', at: 26, dim: true},
  {text: 'Installing dependencies...', at: 44, dim: true},
  {text: 'Detected Next.js 15.1.0', at: 60, dim: true},
  {text: 'Running "next build"', at: 76, dim: true},
  {text: 'Compiled successfully in 8.2s', at: 94, ok: true},
  {text: 'Deploying outputs to global edge...', at: 110, dim: true},
  {text: 'Ready — acme-store.vercel.app', at: 128, ok: true},
];
const READY_AT = 128;
const VISIT_AT = 158;

const Tri: React.FC<{size?: number; color?: string}> = ({size = 15, color = c.text}) => (
  <svg width={size} height={size} viewBox="0 0 24 22" style={{display: 'block'}}>
    <path d="M12 1 L23 21 L1 21 Z" fill={color} />
  </svg>
);

export const DeployScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const panelIn = interpolate(frame, [0, 16], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
  const ready = frame >= READY_AT;
  const spin = (frame * 6) % 360;

  const PANEL_W = 1180;
  const left = (1920 - PANEL_W) / 2;
  const top = 300;

  // cursor glides to the footer Visit button and clicks
  const btnX = left + PANEL_W - 72;
  const btnY = top + 33;
  const visitOp = interpolate(frame, [VISIT_AT - 18, VISIT_AT - 6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const cx = interpolate(frame, [VISIT_AT - 24, VISIT_AT], [btnX - 220, btnX], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
  const cy = interpolate(frame, [VISIT_AT - 24, VISIT_AT], [btnY + 140, btnY], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
  const clickPulse = interpolate(frame, [VISIT_AT, VISIT_AT + 4, VISIT_AT + 18], [0, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill style={{backgroundColor: c.bg, fontFamily: sans}}>
      {/* faint top vignette only — Vercel is otherwise pure flat black */}
      <AbsoluteFill style={{background: `radial-gradient(60% 50% at 50% 0%, rgba(255,255,255,0.04), transparent 70%)`}} />

      <div
        style={{
          position: 'absolute',
          left,
          top,
          width: PANEL_W,
          background: c.surface,
          border: `1px solid ${c.border}`,
          borderRadius: 12,
          opacity: panelIn,
          transform: `translateY(${(1 - panelIn) * 16}px)`,
          overflow: 'hidden',
          boxShadow: '0 30px 90px rgba(0,0,0,0.6)',
        }}
      >
        {/* panel header */}
        <div style={{display: 'flex', alignItems: 'center', gap: 14, padding: '22px 28px', borderBottom: `1px solid ${c.border}`}}>
          <Tri size={17} />
          <span style={{fontFamily: sans, fontSize: 19, fontWeight: 600, color: c.text, letterSpacing: '-0.02em'}}>acme-store</span>
          <span style={{fontFamily: mono, fontSize: 13, color: c.muted, padding: '3px 10px', border: `1px solid ${c.border}`, borderRadius: 999}}>main</span>
          <div style={{flex: 1}} />
          {/* status pill: Building → Ready */}
          <div style={{display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, border: `1px solid ${ready ? VERCEL_GREEN + '55' : c.border}`, background: ready ? VERCEL_GREEN + '14' : 'transparent'}}>
            {ready ? (
              <div style={{width: 8, height: 8, borderRadius: 4, background: VERCEL_GREEN, boxShadow: `0 0 10px ${VERCEL_GREEN}`}} />
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" style={{transform: `rotate(${spin}deg)`}}>
                <circle cx="12" cy="12" r="9" fill="none" stroke={c.muted} strokeWidth="3" strokeDasharray="14 40" strokeLinecap="round" />
              </svg>
            )}
            <span style={{fontFamily: sans, fontSize: 13.5, fontWeight: 500, color: ready ? VERCEL_GREEN : c.text}}>{ready ? 'Ready' : 'Building'}</span>
          </div>
          {/* Visit button — appears top-right on Ready (accurate to Vercel's deployment header) */}
          {visitOp > 0 && (
            <div style={{display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 8, background: c.accent, color: c.accentText, fontFamily: sans, fontWeight: 600, fontSize: 14, opacity: visitOp, transform: `scale(${1 - clickPulse * 0.06})`, boxShadow: `0 0 ${clickPulse * 34}px rgba(255,255,255,${clickPulse * 0.5})`}}>
              Visit ↗
            </div>
          )}
        </div>

        {/* commit row */}
        <div style={{display: 'flex', alignItems: 'center', gap: 12, padding: '16px 28px', borderBottom: `1px solid ${c.border}`}}>
          <div style={{width: 26, height: 26, borderRadius: 13, background: 'linear-gradient(135deg,#666,#222)', border: `1px solid ${c.border}`}} />
          <span style={{fontFamily: sans, fontSize: 15, color: c.text}}>fix: optimize checkout flow</span>
          <span style={{fontFamily: mono, fontSize: 13, color: c.muted}}>a3f9c2e</span>
          <div style={{flex: 1}} />
          <span style={{fontFamily: sans, fontSize: 13.5, color: c.muted}}>just now</span>
        </div>

        {/* build log */}
        <div style={{padding: '22px 28px', minHeight: 340, background: '#050505'}}>
          {LINES.map((ln, i) => {
            const op = interpolate(frame, [ln.at, ln.at + 12], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
            const y = interpolate(frame, [ln.at, ln.at + 12], [6, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE});
            if (op <= 0) return null;
            const isReadyLine = i === LINES.length - 1;
            return (
              <div key={i} style={{display: 'flex', alignItems: 'center', gap: 12, height: 34, opacity: op, transform: `translateY(${y}px)`}}>
                <span style={{width: 16, display: 'flex', justifyContent: 'center'}}>
                  {ln.tri ? <Tri size={12} /> : ln.ok ? <span style={{color: VERCEL_GREEN, fontSize: 15, fontFamily: mono}}>✓</span> : <span style={{color: c.muted, fontSize: 15, fontFamily: mono}}>›</span>}
                </span>
                <span style={{fontFamily: mono, fontSize: 15, letterSpacing: '-0.01em', color: ln.ok ? c.text : ln.dim ? c.muted : c.text}}>
                  {isReadyLine ? (
                    <>
                      Ready — <span style={{color: c.text, borderBottom: `1px solid ${c.muted}`}}>acme-store.vercel.app</span>
                    </>
                  ) : (
                    ln.text
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* cursor */}
      {frame >= VISIT_AT - 24 && (
        <div style={{position: 'absolute', left: cx, top: cy, zIndex: 50}}>
          {clickPulse > 0.01 && clickPulse < 1 && (
            <div style={{position: 'absolute', width: 14 + clickPulse * 34, height: 14 + clickPulse * 34, marginLeft: -(7 + clickPulse * 17), marginTop: -(7 + clickPulse * 17), borderRadius: '50%', border: `2px solid ${c.accent}`, opacity: 1 - clickPulse}} />
          )}
          <svg width="26" height="26" viewBox="0 0 24 24" style={{display: 'block', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))'}}>
            <path d="M5 3l14 8-6 1.6L9.6 18z" fill={c.text} stroke={c.bg} strokeWidth="1.1" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </AbsoluteFill>
  );
};
