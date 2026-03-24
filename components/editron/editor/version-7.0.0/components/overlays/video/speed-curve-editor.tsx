'use client';

import React, { useCallback } from 'react';
import { ClipOverlay, Keyframe } from '../../../types';
import { useEditorContext } from '../../../contexts/editor-context';

/**
 * SpeedCurveEditor — Speed ramping UI for video overlays.
 * Shows preset buttons and a mini SVG graph of the speed curve.
 */

const SPEED_PRESETS: { label: string; curve: Keyframe[] }[] = [
  { label: 'Normal', curve: [] },
  { label: 'Slow Mo (0.5x)', curve: [
    { frame: 0, value: 0.5, easing: 'linear' },
  ]},
  { label: 'Fast (2x)', curve: [
    { frame: 0, value: 2, easing: 'linear' },
  ]},
  { label: 'Ramp In', curve: [
    { frame: 0, value: 0.3, easing: 'ease-out' },
    { frame: 30, value: 1, easing: 'linear' },
  ]},
  { label: 'Ramp Out', curve: [
    { frame: 0, value: 1, easing: 'ease-in' },
    // Last keyframe frame will be set to overlay.durationInFrames
  ]},
  { label: 'Slow Mo Reveal', curve: [
    { frame: 0, value: 0.3, easing: 'ease-in-out' },
    { frame: 45, value: 0.3, easing: 'ease-in-out' },
    { frame: 60, value: 1, easing: 'linear' },
  ]},
  { label: 'Speed Ramp', curve: [
    { frame: 0, value: 1, easing: 'ease-in' },
    // Middle frame will be set dynamically
    { frame: 999, value: 1, easing: 'linear' },
  ]},
];

interface SpeedCurveEditorProps {
  overlay: ClipOverlay;
}

export const SpeedCurveEditor: React.FC<SpeedCurveEditorProps> = ({ overlay }) => {
  const { changeOverlay } = useEditorContext();
  const speedCurve: Keyframe[] = (overlay as any).speedCurve || [];
  const duration = overlay.durationInFrames;

  const applyPreset = useCallback((preset: typeof SPEED_PRESETS[0]) => {
    let curve = [...preset.curve];

    // Adjust dynamic frames
    if (preset.label === 'Ramp Out') {
      curve = [
        { frame: Math.max(0, duration - 30), value: 1, easing: 'ease-in' as const },
        { frame: duration, value: 0.3, easing: 'linear' as const },
      ];
    } else if (preset.label === 'Speed Ramp') {
      const mid = Math.floor(duration / 2);
      curve = [
        { frame: 0, value: 1, easing: 'ease-in' as const },
        { frame: mid - 15, value: 2.5, easing: 'ease-in-out' as const },
        { frame: mid + 15, value: 0.4, easing: 'ease-in-out' as const },
        { frame: duration, value: 1, easing: 'linear' as const },
      ];
    }

    if (curve.length === 0) {
      // Normal — clear speed curve
      changeOverlay(overlay.id, (o: any) => {
        const { speedCurve: _, speed: __, ...rest } = o;
        return rest;
      });
    } else if (curve.length === 1) {
      // Constant speed — use overlay.speed instead of speedCurve
      changeOverlay(overlay.id, (o: any) => ({
        ...o,
        speed: curve[0].value,
        speedCurve: undefined,
      }));
    } else {
      changeOverlay(overlay.id, (o: any) => ({
        ...o,
        speedCurve: curve,
        speed: undefined,
      }));
    }
  }, [changeOverlay, overlay.id, duration]);

  const currentSpeed = (overlay as any).speed || 1;
  const hasSpeedCurve = speedCurve.length > 1;

  return (
    <div className="border-t border-zinc-800 mt-3 pt-2">
      <div className="text-[11px] font-medium text-zinc-400 mb-2">Speed</div>

      {/* Preset buttons */}
      <div className="flex flex-wrap gap-1 mb-2">
        {SPEED_PRESETS.map(p => {
          const isActive = p.label === 'Normal' && !hasSpeedCurve && currentSpeed === 1;
          return (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className={`text-[10px] px-2 py-1 rounded transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Current speed indicator */}
      {!hasSpeedCurve && (
        <div className="text-[10px] text-zinc-500">
          Constant speed: {currentSpeed}x
        </div>
      )}

      {/* Mini SVG graph for speed curve */}
      {hasSpeedCurve && (
        <div className="h-12 bg-zinc-900 rounded border border-zinc-800 relative overflow-hidden">
          <svg width="100%" height="100%" viewBox={`0 0 ${duration} 100`} preserveAspectRatio="none">
            {/* Speed = 1.0 reference line */}
            <line
              x1={0} y1={75} x2={duration} y2={75}
              stroke="#555" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="4,4"
            />
            {/* Speed curve line */}
            <polyline
              points={speedCurve.map(kf => {
                // Map speed 0-4x to y 95-5 (inverted: higher speed = higher on graph)
                const y = 95 - Math.min(kf.value / 4, 1) * 90;
                return `${kf.frame},${y}`;
              }).join(' ')}
              fill="none"
              stroke="#a855f7"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            {/* Speed keyframe dots */}
            {speedCurve.map((kf, i) => {
              const y = 95 - Math.min(kf.value / 4, 1) * 90;
              return (
                <circle
                  key={i}
                  cx={kf.frame}
                  cy={y}
                  r={3}
                  fill="#a855f7"
                  stroke="#1e1e2e"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            {/* Labels */}
            <text x={2} y={12} fontSize="8" fill="#666" vectorEffect="non-scaling-stroke">4x</text>
            <text x={2} y={78} fontSize="8" fill="#666" vectorEffect="non-scaling-stroke">1x</text>
            <text x={2} y={96} fontSize="8" fill="#666" vectorEffect="non-scaling-stroke">0x</text>
          </svg>
        </div>
      )}
    </div>
  );
};

export default SpeedCurveEditor;
