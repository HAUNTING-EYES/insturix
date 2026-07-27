import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {theme} from '../theme';
import {MonoLabel} from './MonoLabel';
import {useFade, POP} from '../anim';

// Social proof beat (the research's #1 missing element). Crafted, specific reviews — not generic
// "great product" slop. Cards pop in staggered; a metric strip lands under them.
const REVIEWS = [
  {name: 'Maya Okonkwo', role: 'Founder, Tidepool Studio', initials: 'MO', color: theme.colors.gold,
    quote: 'Fourteen brands. Per-client turnaround went from three days to an afternoon — and nothing ships off-brand anymore.'},
  {name: 'Devin Russo', role: 'Head of Content, Lumen Robotics', initials: 'DR', color: theme.colors.cyan,
    quote: 'Analyze flagged a weak hook before we published. That edit did 2.3× our usual watch-through.'},
  {name: 'Priya Nair', role: 'Founder, Saffron & Salt', initials: 'PN', color: theme.colors.pink,
    quote: 'I described the video, dropped in my footage, and it published to six platforms while I made coffee.'},
];

export const ReviewsScene: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const fade = useFade(durationInFrames);
  const head = interpolate(frame, [0, 16], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const metric = interpolate(frame, [44, 64], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', opacity: fade, flexDirection: 'column'}}>
      <div style={{opacity: head, marginBottom: 42}}>
        <MonoLabel size={14} color={theme.colors.textMuted} tracking={0.3}>
          What teams are saying
        </MonoLabel>
      </div>
      <div style={{display: 'flex', gap: 24}}>
        {REVIEWS.map((r, i) => {
          const s = spring({frame: frame - 12 - i * 8, fps, config: POP});
          return (
            <div
              key={r.name}
              style={{
                width: 420,
                opacity: s,
                transform: `translateY(${interpolate(s, [0, 1], [44, 0])}px)`,
                background: theme.colors.raised,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: 16,
                padding: '30px 28px',
              }}
            >
              <div style={{display: 'flex', gap: 3, marginBottom: 18}}>
                {[0, 1, 2, 3, 4].map((k) => (
                  <span key={k} style={{color: theme.colors.gold, fontSize: 16}}>★</span>
                ))}
              </div>
              <div style={{fontFamily: theme.font.sans, fontSize: 21, lineHeight: 1.45, color: theme.colors.textPrimary, fontWeight: 500, marginBottom: 24, minHeight: 140}}>
                “{r.quote}”
              </div>
              <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                <div style={{width: 44, height: 44, borderRadius: 22, background: `linear-gradient(135deg, ${r.color}, ${theme.colors.gold})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: theme.font.sans, fontWeight: 800, fontSize: 15, color: theme.colors.canvas}}>
                  {r.initials}
                </div>
                <div>
                  <div style={{fontFamily: theme.font.sans, fontSize: 16, fontWeight: 700, color: theme.colors.textPrimary}}>{r.name}</div>
                  <div style={{fontFamily: theme.font.sans, fontSize: 13, color: theme.colors.textMuted}}>{r.role}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{opacity: metric, marginTop: 44}}>
        <MonoLabel size={14} color={theme.colors.textDim} tracking={0.22}>
          10,000+ videos shipped · 6 platforms · one workflow
        </MonoLabel>
      </div>
    </AbsoluteFill>
  );
};
