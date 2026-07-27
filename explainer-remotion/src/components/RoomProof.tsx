import React from 'react';
import {useCurrentFrame} from 'remotion';
import {RoomKey, theme} from '../theme';
import {MonoLabel} from './MonoLabel';
import {reveal} from '../anim';

const CARD: React.CSSProperties = {
  width: 620,
  height: 420,
  background: theme.colors.deeper,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: 14,
  padding: 28,
  overflow: 'hidden',
};

// A small, color-themed "proof" visual for each room. Reveals on sequence-local frame.
export const RoomProof: React.FC<{roomKey: RoomKey; color: string}> = ({roomKey, color}) => {
  const frame = useCurrentFrame();
  return <div style={CARD}>{render(roomKey, color, frame)}</div>;
};

const Line: React.FC<{w: number; color?: string; delay: number; frame: number; h?: number}> = ({
  w,
  color = theme.colors.well,
  delay,
  frame,
  h = 12,
}) => {
  const p = reveal(frame, delay, delay + 16);
  return <div style={{height: h, width: `${w * p}%`, background: color, borderRadius: 4}} />;
};

const Bar: React.FC<{label: string; value: number; color: string; delay: number; frame: number}> = ({
  label,
  value,
  color,
  delay,
  frame,
}) => {
  const p = reveal(frame, delay, delay + 22);
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
      <div style={{width: 130}}>
        <MonoLabel size={11} tracking={0.1} color={theme.colors.textMuted}>
          {label}
        </MonoLabel>
      </div>
      <div style={{flex: 1, height: 12, borderRadius: 4, background: theme.colors.well, overflow: 'hidden'}}>
        <div style={{height: '100%', width: `${value * p}%`, background: color, borderRadius: 4}} />
      </div>
    </div>
  );
};

function render(roomKey: RoomKey, color: string, frame: number): React.ReactNode {
  switch (roomKey) {
    case 'script':
      return (
        <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
          {(['ACT I — HOOK', 'ACT II — BUILD', 'ACT III — CTA'] as const).map((act, a) => (
            <div key={act} style={{display: 'flex', flexDirection: 'column', gap: 10}}>
              <MonoLabel size={11} tracking={0.16} color={color}>
                {act}
              </MonoLabel>
              <Line w={92} delay={20 + a * 34} frame={frame} />
              <Line w={74} delay={28 + a * 34} frame={frame} />
            </div>
          ))}
        </div>
      );
    case 'edit':
      return (
        <div style={{display: 'flex', flexDirection: 'column', gap: 18, height: '100%'}}>
          <div
            style={{
              flex: 1,
              borderRadius: 10,
              background:
                'radial-gradient(ellipse 70% 60% at 50% 45%, rgba(212,166,82,0.05), transparent 65%), #060605',
              border: `1px solid ${theme.colors.border}`,
              position: 'relative',
            }}
          >
            <div style={{position: 'absolute', left: 22, bottom: 20}}>
              <div style={{width: 44, height: 3, background: theme.colors.gold, marginBottom: 10}} />
              <Line w={60} delay={26} frame={frame} h={14} color={theme.colors.borderEmph} />
            </div>
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{height: 12, borderRadius: 4, background: theme.colors.well, overflow: 'hidden'}}>
              <div
                style={{
                  height: '100%',
                  width: `${reveal(frame, 24 + i * 14, 60 + i * 14) * (90 - i * 12)}%`,
                  background: color,
                  opacity: 0.55,
                  borderRadius: 4,
                }}
              />
            </div>
          ))}
        </div>
      );
    case 'analyze': {
      const scoreP = reveal(frame, 18, 48);
      return (
        <div style={{display: 'flex', gap: 28, height: '100%', alignItems: 'center'}}>
          <div style={{textAlign: 'center'}}>
            <div
              style={{
                fontFamily: theme.font.sans,
                fontWeight: 800,
                fontSize: 130,
                lineHeight: 1,
                letterSpacing: '-0.04em',
                color,
                opacity: scoreP,
              }}
            >
              {Math.round(91 * scoreP)}
            </div>
            <MonoLabel size={11} tracking={0.16} color={theme.colors.textMuted} style={{marginTop: 6}}>
              Quality score
            </MonoLabel>
          </div>
          <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 16}}>
            <Bar label="Hook" value={88} color={color} delay={30} frame={frame} />
            <Bar label="Pacing" value={76} color={color} delay={42} frame={frame} />
            <Bar label="Retention" value={82} color={theme.colors.gold} delay={54} frame={frame} />
            <Bar label="CTA clarity" value={70} color={color} delay={66} frame={frame} />
          </div>
        </div>
      );
    }
    case 'design':
      return (
        <div style={{display: 'flex', gap: 18, height: '100%', alignItems: 'center', justifyContent: 'center'}}>
          {[0, 1, 2].map((i) => {
            const p = reveal(frame, 18 + i * 12, 44 + i * 12);
            const hero = i === 1;
            return (
              <div
                key={i}
                style={{
                  width: hero ? 220 : 170,
                  height: hero ? 240 : 200,
                  opacity: p,
                  transform: `translateY(${(1 - p) * 24}px)`,
                  borderRadius: 12,
                  background: `${color}14`,
                  border: `1px solid ${hero ? color : theme.colors.border}`,
                  boxShadow: hero ? `0 0 36px ${color}33` : 'none',
                  position: 'relative',
                }}
              >
                {hero && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      padding: '4px 10px',
                      borderRadius: 4,
                      background: color,
                      color: theme.colors.canvas,
                      fontFamily: theme.font.mono,
                      fontSize: 11,
                      fontWeight: 500,
                    }}
                  >
                    CTR 8.4%
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    case 'distribute': {
      const platforms = ['YouTube', 'Instagram', 'TikTok', 'LinkedIn', 'X', 'Facebook'];
      return (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 14,
            height: '100%',
            alignContent: 'center',
          }}
        >
          {platforms.map((p, i) => {
            const r = reveal(frame, 18 + i * 12, 40 + i * 12);
            return (
              <div
                key={p}
                style={{
                  opacity: 0.4 + 0.6 * r,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  borderRadius: 10,
                  background: theme.colors.well,
                  border: `1px solid ${r > 0.6 ? color + '55' : theme.colors.border}`,
                }}
              >
                <span
                  style={{
                    fontFamily: theme.font.sans,
                    fontWeight: 500,
                    fontSize: 18,
                    color: theme.colors.textSecondary,
                  }}
                >
                  {p}
                </span>
                <div style={{opacity: r, color, fontSize: 18, fontWeight: 800}}>✓</div>
              </div>
            );
          })}
        </div>
      );
    }
    case 'share':
      return (
        <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%'}}>
          <div
            style={{
              width: 300,
              padding: 24,
              borderRadius: 16,
              background: theme.colors.raised,
              border: `1px solid ${color}33`,
              opacity: reveal(frame, 16, 40),
            }}
          >
            <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8}}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  background: `linear-gradient(135deg, ${color}, ${theme.colors.gold})`,
                }}
              />
              <div
                style={{
                  fontFamily: theme.font.sans,
                  fontWeight: 800,
                  fontSize: 22,
                  color: theme.colors.textPrimary,
                }}
              >
                Acme Coffee
              </div>
              <MonoLabel size={10} tracking={0.12} color={theme.colors.textMuted}>
                insturix.link/acme
              </MonoLabel>
            </div>
            <div style={{display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18}}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    height: 40,
                    borderRadius: 8,
                    background: theme.colors.well,
                    border: `1px solid ${theme.colors.border}`,
                    opacity: reveal(frame, 30 + i * 10, 54 + i * 10),
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      );
    default:
      return null;
  }
}
