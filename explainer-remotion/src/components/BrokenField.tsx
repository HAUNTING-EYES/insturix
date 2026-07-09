import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {theme} from '../theme';
import {MonoLabel} from './MonoLabel';
import {useFade} from '../anim';
import {useBeatGrid} from '../beat';

// The problem, as pure motion graphics: disconnected tool-nodes drifting in different colors,
// tangled with broken red links, jittering on every beat. No headline.
const COLORS = [
  theme.colors.danger,
  theme.colors.purple,
  theme.colors.cyan,
  theme.colors.gold,
  theme.colors.pink,
  theme.colors.success,
];
const NODES = Array.from({length: 9}, (_, i) => ({
  bx: 380 + ((i * 197) % 1180),
  by: 250 + ((i * 311) % 540),
  size: 34 + ((i * 13) % 22),
  color: COLORS[i % COLORS.length],
  amp: 14 + ((i * 7) % 16),
  period: 130 + ((i * 29) % 120),
  phase: (i * 41) % 100,
  cost: ['$55', '$295', '$13', '', '$80', '$50', '', '$120', ''][i],
}));
const LINKS = [
  [0, 3],
  [3, 5],
  [1, 4],
  [4, 7],
  [2, 6],
  [0, 8],
  [5, 1],
  [6, 4],
];

export const BrokenField: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const fade = useFade(durationInFrames, 16, 22);
  const {pulse} = useBeatGrid();

  const pos = NODES.map((n, i) => {
    const enter = interpolate(frame, [i * 5, 28 + i * 5], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const drift = Math.sin((frame + n.phase) * ((2 * Math.PI) / n.period)) * n.amp;
    const jx = (i % 2 ? 1 : -1) * pulse * 7;
    const jy = (i % 3 ? -1 : 1) * pulse * 6;
    return {...n, x: n.bx + drift + jx, y: n.by - drift * 0.6 + jy, enter};
  });

  return (
    <AbsoluteFill style={{opacity: fade}}>
      <svg width="1920" height="1080" style={{position: 'absolute', inset: 0}}>
        {LINKS.map(([a, b], i) => {
          const broken = i % 3 === 0;
          const A = pos[a];
          const B = pos[b];
          const op = (broken ? 0.12 + pulse * 0.5 : 0.16) * Math.min(A.enter, B.enter);
          return (
            <line
              key={i}
              x1={A.x + A.size / 2}
              y1={A.y + A.size / 2}
              x2={B.x + B.size / 2}
              y2={B.y + B.size / 2}
              stroke={broken ? theme.colors.danger : theme.colors.borderEmph}
              strokeWidth={broken ? 2 : 1.5}
              strokeDasharray={broken ? '6 9' : undefined}
              opacity={op}
            />
          );
        })}
      </svg>
      {pos.map((n, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: n.x,
            top: n.y,
            width: n.size,
            height: n.size,
            borderRadius: 9,
            background: `${n.color}22`,
            border: `1.5px solid ${n.color}aa`,
            transform: `scale(${n.enter})`,
            opacity: n.enter,
            boxShadow: `0 0 ${10 + pulse * 16}px ${n.color}45`,
          }}
        />
      ))}
      {pos.map((n, i) =>
        n.cost ? (
          <div
            key={`c${i}`}
            style={{position: 'absolute', left: n.x + n.size + 8, top: n.y + 4, opacity: n.enter * (0.35 + pulse * 0.35)}}
          >
            <MonoLabel size={13} tracking={0.05} color={theme.colors.textMuted}>
              {n.cost}
            </MonoLabel>
          </div>
        ) : null
      )}
      <div style={{position: 'absolute', bottom: 96, width: '100%', textAlign: 'center'}}>
        <MonoLabel size={15} tracking={0.4} color={theme.colors.textDim}>
          Disconnected · scattered · expensive
        </MonoLabel>
      </div>
    </AbsoluteFill>
  );
};
