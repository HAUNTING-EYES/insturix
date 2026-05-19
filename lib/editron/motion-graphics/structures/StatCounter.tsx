/**
 * StatCounter — Motion Graphics Structure Component
 *
 * Animated number counter with label and accent line. Renders via Remotion
 * native APIs (interpolate, Easing, useCurrentFrame). Theme-driven: all
 * visual properties read from MotionTokens via context.
 *
 * Animation phases:
 *   1. Entrance (card slides in + fades)
 *   2. Counter (number counts from 0 to target with easing)
 *   3. Accent line (draws from left to right)
 *   4. Hold (visible, no animation)
 *   5. Exit (fade out)
 *
 * CRG constraint: constant:typography.stat_counter_min_font = 64px
 * The number font size is max(64, 64 * theme.typography.sizeScale).
 *
 * Rendering: Remotion interpolate() + Easing.bezier(). No GSAP. No useEffect
 * for animation (Lambda-safe). All animation derived from useCurrentFrame().
 */

import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion';
import { useMotionTheme } from '../context/MotionThemeContext';
import type { StatCounterContent, StructureComponentProps } from '../types';

// CRG minimum: constant:typography.stat_counter_min_font = 64px
const CRG_MIN_STAT_FONT = 64;

// Map theme easing names to Remotion Easing functions
function resolveEasing(easingName: string): ((t: number) => number) {
  switch (easingName) {
    case 'power1.inOut': return Easing.bezier(0.4, 0, 0.6, 1);
    case 'power1.in': return Easing.bezier(0.4, 0, 1, 1);
    case 'power2.out': return Easing.bezier(0, 0, 0.58, 1);
    case 'power2.in': return Easing.bezier(0.42, 0, 1, 1);
    case 'power3.out': return Easing.bezier(0.16, 1, 0.3, 1);
    case 'power4.out': return Easing.bezier(0.08, 0.82, 0.17, 1);
    case 'elastic.out(1,0.5)': return Easing.elastic(1);
    case 'back.out(1.7)': return Easing.back(1.7);
    default: return Easing.bezier(0, 0, 0.58, 1);
  }
}

function formatNumber(num: number, prefix?: string, suffix?: string): string {
  const formatted = num >= 1000
    ? num.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : num % 1 !== 0
      ? num.toFixed(1)
      : String(num);
  return `${prefix || ''}${formatted}${suffix || ''}`;
}

export const StatCounter: React.FC<StructureComponentProps<StatCounterContent>> = ({
  content,
  durationInFrames,
}) => {
  const theme = useMotionTheme();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entranceFrames = Math.round((theme.animation.entranceDurationMs / 1000) * fps);
  const exitFrames = Math.round((theme.animation.exitDurationMs / 1000) * fps);
  const counterFrames = Math.round(1.5 * fps);
  const accentFrames = Math.round(0.5 * fps);

  const entranceEase = resolveEasing(theme.animation.entranceEasing);
  const exitEase = resolveEasing(theme.animation.exitEasing);
  const counterEase = resolveEasing(theme.animation.emphasisEasing);

  // Phase boundaries
  const entranceEnd = entranceFrames;
  const counterEnd = entranceEnd + counterFrames;
  const accentEnd = counterEnd + accentFrames;
  const exitStart = durationInFrames - exitFrames;

  // ── Entrance animation ──
  const entranceOpacity = interpolate(frame, [0, entranceEnd], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: entranceEase,
  });

  const entranceY = interpolate(frame, [0, entranceEnd], [20, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: entranceEase,
  });

  const entranceScale = interpolate(frame, [0, entranceEnd], [0.92, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: entranceEase,
  });

  // ── Counter animation (count from 0 to target) ──
  const numericValue = parseFloat(content.value.replace(/[^0-9.\-]/g, ''));
  const counterProgress = interpolate(
    frame,
    [entranceEnd, counterEnd],
    [0, isNaN(numericValue) ? 0 : numericValue],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: counterEase },
  );
  const displayNumber = isNaN(numericValue)
    ? content.value
    : formatNumber(Math.round(counterProgress), content.prefix, content.suffix);

  // ── Accent line draw ──
  const accentWidth = interpolate(
    frame,
    [entranceEnd, accentEnd],
    [0, 40],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: entranceEase },
  );

  // ── Exit animation ──
  const exitOpacity = frame >= exitStart
    ? interpolate(frame, [exitStart, durationInFrames], [1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: exitEase,
      })
    : 1;

  // ── Combined opacity ──
  const opacity = Math.min(entranceOpacity, exitOpacity);

  // ── Resolve styles from theme ──
  const numberFontSize = Math.max(CRG_MIN_STAT_FONT, Math.round(64 * theme.typography.sizeScale));
  const labelFontSize = Math.round(13 * theme.typography.sizeScale);
  const padding = `${Math.round(32 * theme.layout.paddingScale)}px ${Math.round(48 * theme.layout.paddingScale)}px`;

  const surfaceRgba = hexToRgba(theme.color.surfaceBase, theme.color.surfaceOpacity);
  const borderStyle = theme.surface.borderWeight > 0
    ? `${theme.surface.borderWeight}px solid rgba(255,255,255,${theme.surface.borderOpacity})`
    : 'none';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: theme.layout.alignment === 'center' ? 'center' : 'flex-start',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        padding: '24px',
      }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${entranceY}px) scale(${entranceScale})`,
          background: theme.surface.style === 'glass' || theme.surface.style === 'gradient'
            ? surfaceRgba
            : theme.surface.style === 'solid'
              ? theme.color.surfaceBase
              : 'transparent',
          backdropFilter: theme.surface.backdropBlur > 0
            ? `blur(${theme.surface.backdropBlur}px)`
            : 'none',
          WebkitBackdropFilter: theme.surface.backdropBlur > 0
            ? `blur(${theme.surface.backdropBlur}px)`
            : 'none',
          borderRadius: `${theme.surface.cornerRadius}px`,
          border: borderStyle,
          boxShadow: theme.surface.shadow,
          padding,
          display: 'flex',
          flexDirection: 'column',
          alignItems: theme.layout.alignment === 'center' ? 'center' : 'flex-start',
        }}
      >
        {/* Top accent line */}
        <div
          style={{
            width: `${accentWidth}px`,
            height: 3,
            background: theme.color.primary,
            borderRadius: 2,
            marginBottom: Math.round(16 * theme.layout.paddingScale),
          }}
        />

        {/* Number */}
        <div
          style={{
            color: theme.color.textPrimary,
            fontFamily: theme.typography.monoFamily,
            fontSize: numberFontSize,
            fontWeight: theme.typography.headingWeight,
            textAlign: theme.layout.alignment,
            letterSpacing: theme.typography.headingTracking,
            lineHeight: 1.1,
          }}
        >
          {displayNumber}
        </div>

        {/* Label */}
        {content.label && (
          <div
            style={{
              color: theme.color.textSecondary,
              fontFamily: theme.typography.bodyFamily,
              fontSize: labelFontSize,
              fontWeight: theme.typography.bodyWeight,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginTop: Math.round(12 * theme.layout.paddingScale),
            }}
          >
            {content.label}
          </div>
        )}

        {/* Bottom accent line */}
        <div
          style={{
            width: `${accentWidth}px`,
            height: 3,
            background: theme.color.accent,
            borderRadius: 2,
            marginTop: Math.round(16 * theme.layout.paddingScale),
          }}
        />
      </div>
    </div>
  );
};

function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(10,10,20,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}
