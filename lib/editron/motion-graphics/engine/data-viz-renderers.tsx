/**
 * Data Visualization Renderers
 *
 * SVG-based animated chart components for Remotion rendering.
 * Launch set: bar chart, percentage ring, sparkline.
 *
 * Each renderer accepts numeric data + animation progress (0-1) and outputs SVG.
 * Animation is frame-driven via Remotion's useCurrentFrame/interpolate.
 *
 * Sources:
 *   creative_production_knowledge_v3:3886 "data visualization: authority, proof, dual-coding 2x retention"
 *   CRG technique:graphic.stat_counter (line 3073): text-based stat display (extended by these charts)
 *
 * All rendering parameters are ⚠️ INVENTED -- no CRG or creative doc covers chart specs.
 * Pure deterministic rendering. Same values + same frame = same SVG.
 */

import React from 'react';

// ─── Shared Types ───────────────────────────────────────

export interface DataVizProps {
  values: number[];
  labels?: string[];
  color: string;         // Primary chart color (from token:color.accent)
  textColor: string;     // Label color (from token:color.textPrimary)
  font: string;          // Label font family
  progress: number;      // Animation progress 0-1 (from frame/duration)
  width: number;         // Container width in px
  height: number;        // Container height in px
}

// ─── Bar Chart ──────────────────────────────────────────
// Horizontal bars that grow from left to right.
// ⚠️ ALL PARAMETERS INVENTED. Max 8 bars, 2px gap, animated grow.

const BAR_MAX_COUNT = 8;       // ← ⚠️ INVENTED. >8 bars unreadable at video resolution.
const BAR_GAP_PX = 4;         // ← ⚠️ INVENTED. Gap between bars.
const BAR_LABEL_WIDTH = 0.25; // ← ⚠️ INVENTED. 25% of width for labels.
const BAR_RADIUS = 3;
const TEXT_OUTLINE_COLOR = '#0B1224';
const TEXT_OUTLINE_WIDTH = 1.2;

export const BarChart: React.FC<DataVizProps> = ({
  values,
  labels,
  color,
  textColor,
  font,
  progress,
  width,
  height,
}) => {
  if (values.length === 0) return null;

  const displayValues = values.slice(0, BAR_MAX_COUNT);
  const displayLabels = labels?.slice(0, BAR_MAX_COUNT);
  const maxVal = Math.max(...displayValues.filter(isFinite), 1);
  const barCount = displayValues.length;
  const barAreaWidth = width * (1 - BAR_LABEL_WIDTH);
  const labelAreaWidth = width * BAR_LABEL_WIDTH;
  const barHeight = Math.max(8, (height - BAR_GAP_PX * (barCount - 1)) / barCount);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {displayValues.map((val, i) => {
        const safeVal = isFinite(val) ? Math.max(0, val) : 0;
        const y = i * (barHeight + BAR_GAP_PX);
        const barWidth = (safeVal / maxVal) * barAreaWidth * progress;
        const label = displayLabels?.[i] || '';

        return (
          <g key={i}>
            {/* Label */}
            {label && (
              <text
                x={labelAreaWidth - 8}
                y={y + barHeight / 2 + 4}
                fill={textColor}
                stroke={TEXT_OUTLINE_COLOR}
                strokeWidth={TEXT_OUTLINE_WIDTH}
                paintOrder="stroke fill"
                fontFamily={font}
                fontSize={Math.min(14, barHeight * 0.6)}
                textAnchor="end"
                opacity={Math.min(1, progress * 3)}
              >
                {label}
              </text>
            )}
            {/* Bar */}
            <rect
              x={labelAreaWidth}
              y={y}
              width={Math.max(0, barWidth)}
              height={barHeight}
              rx={BAR_RADIUS}
              ry={BAR_RADIUS}
              fill={color}
              opacity={0.85}
            />
            {/* Value text */}
            {progress > 0.5 && (
              <text
                x={labelAreaWidth + barWidth + 6}
                y={y + barHeight / 2 + 4}
                fill={textColor}
                stroke={TEXT_OUTLINE_COLOR}
                strokeWidth={TEXT_OUTLINE_WIDTH}
                paintOrder="stroke fill"
                fontFamily={font}
                fontSize={Math.min(12, barHeight * 0.5)}
                opacity={Math.min(1, (progress - 0.5) * 4)}
              >
                {formatValue(safeVal)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

// ─── Percentage Ring ────────────────────────────────────
// Circular progress indicator with animated fill.
// ⚠️ ALL PARAMETERS INVENTED. 8px stroke, centered label.

const RING_STROKE_WIDTH = 8;     // ← ⚠️ INVENTED. Broadcast standard for progress indicators.
const RING_BG_OPACITY = 0.15;    // ← ⚠️ INVENTED. Background track opacity.

export const PercentageRing: React.FC<DataVizProps> = ({
  values,
  color,
  textColor,
  font,
  progress,
  width,
  height,
}) => {
  const value = isFinite(values[0]) ? Math.max(0, Math.min(100, values[0])) : 0;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const size = Math.min(width, height);
  const center = size / 2;
  const radius = center - RING_STROKE_WIDTH - 4;
  const circumference = 2 * Math.PI * radius;
  const fillPercent = (value / 100) * clampedProgress;
  const dashOffset = circumference * (1 - fillPercent);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Background track */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={RING_STROKE_WIDTH}
        opacity={RING_BG_OPACITY}
      />
      {/* Animated fill arc */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={RING_STROKE_WIDTH}
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
      />
      {/* Center percentage text */}
      <text
        x={center}
        y={center + 2}
        fill={textColor}
        stroke={TEXT_OUTLINE_COLOR}
        strokeWidth={TEXT_OUTLINE_WIDTH}
        paintOrder="stroke fill"
        fontFamily={font}
        fontSize={Math.round(radius * 0.5)}
        fontWeight={700}
        textAnchor="middle"
        dominantBaseline="middle"
        opacity={Math.min(1, progress * 2)}
      >
        {Math.round(value * progress)}%
      </text>
    </svg>
  );
};

// ─── Sparkline ──────────────────────────────────────────
// Minimal trend line chart. No axes, no labels -- just the shape.
// ⚠️ ALL PARAMETERS INVENTED. 2px stroke, animated draw-on.

const SPARK_STROKE_WIDTH = 2;    // ← ⚠️ INVENTED. Standard SVG stroke for video.
const SPARK_PADDING = 4;         // ← ⚠️ INVENTED. Internal padding.

export const Sparkline: React.FC<DataVizProps> = ({
  values,
  color,
  progress,
  width,
  height,
}) => {
  // Unique gradient id per instance (hook MUST precede the early return). A hardcoded global id
  // collides when two charts render in one frame: SVG resolves url(#id) to the FIRST match → wrong
  // fill, silently. useId is deterministic per render tree position.
  const fillId = `sparkFill-${React.useId().replace(/:/g, '')}`;
  if (values.length < 2) return null;

  const safeValues = values.map(v => isFinite(v) ? v : 0);
  const minVal = Math.min(...safeValues);
  const maxVal = Math.max(...safeValues);
  const range = maxVal - minVal || 1;

  const plotWidth = width - SPARK_PADDING * 2;
  const plotHeight = height - SPARK_PADDING * 2;
  const stepX = plotWidth / (safeValues.length - 1);

  const points = safeValues.map((v, i) => ({
    x: SPARK_PADDING + i * stepX,
    y: SPARK_PADDING + plotHeight - ((v - minVal) / range) * plotHeight,
  }));

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  // Animated draw-on: use stroke-dasharray + dashoffset
  const pathLength = estimatePathLength(points);
  const dashOffset = pathLength * (1 - progress);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* Gradient fill under the line */}
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2 * progress} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* Fill area (line to bottom-right, bottom-left, close) */}
      {progress > 0.3 && (
        <path
          d={`${pathD} L ${points[points.length - 1].x.toFixed(1)} ${height} L ${points[0].x.toFixed(1)} ${height} Z`}
          fill={`url(#${fillId})`}
          opacity={Math.min(1, (progress - 0.3) * 2)}
        />
      )}
      {/* Main line */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={SPARK_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={pathLength}
        strokeDashoffset={Math.max(0, dashOffset)}
      />
      {/* End dot */}
      {progress > 0.8 && (
        <circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r={3}
          fill={color}
          opacity={Math.min(1, (progress - 0.8) * 5)}
        />
      )}
    </svg>
  );
};

// ─── Utilities ──────────────────────────────────────────

function formatValue(val: number): string {
  if (!isFinite(val)) return '0';
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  if (val % 1 !== 0) return val.toFixed(1);
  return String(Math.round(val));
}

function estimatePathLength(points: Array<{ x: number; y: number }>): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    length += Math.sqrt(dx * dx + dy * dy);
  }
  return length;
}
