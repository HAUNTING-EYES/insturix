import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {theme} from '../theme';
import {SNAP} from '../anim';

// Character-level reveal: each glyph pops up + scales from small + de-blurs on a snappy
// overshoot spring. Far less templated than a fade. Supports gradient fill + alignment.
export const StaggerChars: React.FC<{
  text: string;
  fontSize: number;
  weight?: number;
  color?: string;
  startAt?: number;
  stagger?: number;
  tracking?: number;
  gradient?: boolean;
  align?: 'left' | 'center';
}> = ({
  text,
  fontSize,
  weight = 800,
  color = theme.colors.textPrimary,
  startAt = 0,
  stagger = 1.5,
  tracking = -0.03,
  gradient = false,
  align = 'center',
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const chars = text.split('');
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'nowrap',
        whiteSpace: 'nowrap',
        justifyContent: align === 'left' ? 'flex-start' : 'center',
        fontFamily: theme.font.sans,
        fontSize,
        fontWeight: weight,
        letterSpacing: `${tracking}em`,
        lineHeight: 1.05,
      }}
    >
      {chars.map((c, i) => {
        const s = spring({frame: frame - startAt - i * stagger, fps, config: SNAP});
        const y = interpolate(s, [0, 1], [fontSize * 0.6, 0]);
        const sc = interpolate(s, [0, 1], [0.4, 1]); // overshoot >1 → tiny pop, then settle
        const blur = Math.max(0, interpolate(s, [0, 1], [10, 0], {extrapolateRight: 'clamp'}));
        const style: React.CSSProperties = {
          display: 'inline-block',
          whiteSpace: 'pre',
          transformOrigin: 'bottom center',
          transform: `translateY(${y}px) scale(${sc})`,
          opacity: Math.max(0, Math.min(1, s)),
          filter: `blur(${blur}px)`,
        };
        if (gradient) {
          style.backgroundImage = theme.wordmarkGradient;
          style.WebkitBackgroundClip = 'text';
          style.backgroundClip = 'text';
          style.WebkitTextFillColor = 'transparent';
          // background-clip:text only paints the gradient INSIDE the glyph's box; with a tight
          // line-height a descender (e.g. the tail of "y") falls below the box and renders
          // transparent = "cut off". Pad the box so the full glyph is painted.
          style.paddingTop = '0.06em';
          style.paddingBottom = '0.22em';
        } else {
          style.color = color;
        }
        return (
          <span key={i} style={style}>
            {c === ' ' ? ' ' : c}
          </span>
        );
      })}
    </div>
  );
};
