'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Overlay, KeyframeTrack, Keyframe } from '../../../types';
import { useEditorContext } from '../../../contexts/editor-context';
import { Select } from '@/components/primitives';

/**
 * KeyframeInspectorPanel — collapsible "Animation" section for any overlay.
 * Shows in the sidebar when an overlay is selected. Allows adding, editing,
 * and deleting keyframes on position, scale, opacity, rotation tracks.
 */

type AnimatableProperty = 'x' | 'y' | 'scale' | 'opacity' | 'rotation';

const PROPERTY_OPTIONS: { value: AnimatableProperty; label: string; color: string; unit: string }[] = [
  { value: 'x', label: 'Position X', color: '#3b82f6', unit: 'px' },
  { value: 'y', label: 'Position Y', color: '#3b82f6', unit: 'px' },
  { value: 'scale', label: 'Scale', color: '#22c55e', unit: 'x' },
  { value: 'opacity', label: 'Opacity', color: '#eab308', unit: '' },
  { value: 'rotation', label: 'Rotation', color: '#ef4444', unit: '°' },
];

const EASING_OPTIONS = [
  { value: 'linear', label: 'Linear' },
  { value: 'ease-in', label: 'Ease In' },
  { value: 'ease-out', label: 'Ease Out' },
  { value: 'ease-in-out', label: 'Ease In-Out' },
  { value: 'snap-out', label: 'Snap Out' },
];

const PRESETS = [
  { label: 'Fade In', tracks: [{ property: 'opacity' as const, keyframes: [{ frame: 0, value: 0, easing: 'ease-out' as const }, { frame: 20, value: 1, easing: 'linear' as const }] }] },
  { label: 'Fade Out', tracks: (dur: number) => [{ property: 'opacity' as const, keyframes: [{ frame: Math.max(0, dur - 20), value: 1, easing: 'ease-in' as const }, { frame: dur, value: 0, easing: 'linear' as const }] }] },
  { label: 'Slow Zoom In', tracks: (dur: number) => [{ property: 'scale' as const, keyframes: [{ frame: 0, value: 1, easing: 'ease-in-out' as const }, { frame: dur, value: 1.15, easing: 'linear' as const }] }] },
  { label: 'Slide Right', tracks: [{ property: 'x' as const, keyframes: [{ frame: 0, value: -200, easing: 'ease-out' as const }, { frame: 20, value: 0, easing: 'linear' as const }] }] },
  { label: 'Pulse', tracks: (dur: number) => [{ property: 'scale' as const, keyframes: [{ frame: 0, value: 1, easing: 'ease-in-out' as const }, { frame: Math.floor(dur / 2), value: 1.08, easing: 'ease-in-out' as const }, { frame: dur, value: 1, easing: 'linear' as const }] }] },
];

interface KeyframeInspectorPanelProps {
  overlay: Overlay;
}

export const KeyframeInspectorPanel: React.FC<KeyframeInspectorPanelProps> = ({ overlay }) => {
  const { changeOverlay, currentFrame } = useEditorContext();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<AnimatableProperty>('opacity');

  const tracks: KeyframeTrack[] = useMemo(() => overlay.keyframeTracks || [], [overlay.keyframeTracks]);

  const currentTrack = useMemo(
    () => tracks.find(t => t.property === selectedProperty),
    [tracks, selectedProperty],
  );

  const localFrame = currentFrame - overlay.from;

  const updateTracks = useCallback((newTracks: KeyframeTrack[]) => {
    changeOverlay(overlay.id, (o: Overlay) => ({
      ...o,
      keyframeTracks: newTracks.length > 0 ? newTracks : undefined,
    }));
  }, [changeOverlay, overlay.id]);

  const addKeyframe = useCallback(() => {
    const frame = Math.max(0, Math.min(localFrame, overlay.durationInFrames));
    const defaultValues: Record<AnimatableProperty, number> = {
      x: overlay.left,
      y: overlay.top,
      scale: 1,
      opacity: 1,
      rotation: overlay.rotation || 0,
    };
    const newKf: Keyframe = { frame, value: defaultValues[selectedProperty], easing: 'ease-in-out' };

    if (currentTrack) {
      // Add to existing track (sorted by frame)
      const kfs = [...currentTrack.keyframes, newKf].sort((a, b) => a.frame - b.frame);
      const updatedTracks = tracks.map(t => t.property === selectedProperty ? { ...t, keyframes: kfs } : t);
      updateTracks(updatedTracks);
    } else {
      // Create new track
      updateTracks([...tracks, { property: selectedProperty, keyframes: [newKf] }]);
    }
  }, [localFrame, overlay, selectedProperty, currentTrack, tracks, updateTracks]);

  const deleteKeyframe = useCallback((idx: number) => {
    if (!currentTrack) return;
    const kfs = currentTrack.keyframes.filter((_, i) => i !== idx);
    if (kfs.length === 0) {
      // Remove entire track
      updateTracks(tracks.filter(t => t.property !== selectedProperty));
    } else {
      updateTracks(tracks.map(t => t.property === selectedProperty ? { ...t, keyframes: kfs } : t));
    }
  }, [currentTrack, selectedProperty, tracks, updateTracks]);

  const updateKeyframeValue = useCallback((idx: number, field: 'frame' | 'value' | 'easing', val: any) => {
    if (!currentTrack) return;
    const kfs = currentTrack.keyframes.map((kf, i) => {
      if (i !== idx) return kf;
      return { ...kf, [field]: field === 'easing' ? val : Number(val) };
    });
    if (field === 'frame') kfs.sort((a, b) => a.frame - b.frame);
    updateTracks(tracks.map(t => t.property === selectedProperty ? { ...t, keyframes: kfs } : t));
  }, [currentTrack, selectedProperty, tracks, updateTracks]);

  const applyPreset = useCallback((preset: typeof PRESETS[0]) => {
    const presetTracks = typeof preset.tracks === 'function'
      ? preset.tracks(overlay.durationInFrames)
      : preset.tracks;
    // Merge with existing tracks (replace matching properties)
    const existingFiltered = tracks.filter(t => !presetTracks.some((pt: any) => pt.property === t.property));
    updateTracks([...existingFiltered, ...presetTracks]);
  }, [tracks, overlay.durationInFrames, updateTracks]);

  const clearAll = useCallback(() => updateTracks([]), [updateTracks]);

  const propInfo = PROPERTY_OPTIONS.find(p => p.value === selectedProperty)!;

  return (
    <div className="border-t border-zinc-800 mt-3 pt-2">
      {/* Collapsible header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full text-left px-1 py-1 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <span className="text-[10px]">{isOpen ? '▼' : '▶'}</span>
          Animation
          {tracks.length > 0 && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400">
              {tracks.reduce((n, t) => n + t.keyframes.length, 0)} keyframes
            </span>
          )}
        </span>
      </button>

      {isOpen && (
        <div className="mt-2 space-y-2 px-1">
          {/* Presets */}
          <div className="flex flex-wrap gap-1">
            {PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                className="text-[10px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                {p.label}
              </button>
            ))}
            {tracks.length > 0 && (
              <button
                onClick={clearAll}
                className="text-[10px] px-2 py-1 rounded bg-red-900/30 hover:bg-red-900/50 text-red-400 transition-colors"
              >
                Clear All
              </button>
            )}
          </div>

          {/* Property selector + Add button */}
          <div className="flex gap-1.5 items-center">
            <Select
              size="sm"
              className="flex-1"
              aria-label="Animated property"
              value={selectedProperty}
              onChange={v => setSelectedProperty(v as AnimatableProperty)}
              options={PROPERTY_OPTIONS.map(p => {
                const track = tracks.find(t => t.property === p.value);
                return { value: p.value, label: track ? `${p.label} (${track.keyframes.length})` : p.label };
              })}
            />
            <button
              onClick={addKeyframe}
              className="h-7 px-2 text-[10px] font-medium rounded bg-gold hover:bg-gold-hover text-gold-contrast transition-colors whitespace-nowrap"
            >
              + Frame {Math.round(localFrame)}
            </button>
          </div>

          {/* Keyframe table */}
          {currentTrack && currentTrack.keyframes.length > 0 && (
            <div className="border border-zinc-800 rounded overflow-hidden">
              <div className="grid grid-cols-[50px_70px_80px_24px] text-[9px] font-semibold text-zinc-500 uppercase bg-zinc-900 px-1 py-1">
                <span>Frame</span>
                <span>Value</span>
                <span>Easing</span>
                <span></span>
              </div>
              {currentTrack.keyframes.map((kf, i) => (
                <div key={i} className="grid grid-cols-[50px_70px_80px_24px] text-[10px] px-1 py-0.5 border-t border-zinc-800/50 items-center hover:bg-zinc-800/30">
                  <input
                    type="number"
                    value={kf.frame}
                    onChange={e => updateKeyframeValue(i, 'frame', e.target.value)}
                    className="w-full bg-transparent text-ds-secondary outline-none"
                    min={0}
                    max={overlay.durationInFrames}
                  />
                  <input
                    type="number"
                    value={Math.round(kf.value * 100) / 100}
                    onChange={e => updateKeyframeValue(i, 'value', e.target.value)}
                    step={selectedProperty === 'opacity' ? 0.1 : selectedProperty === 'scale' ? 0.05 : 1}
                    className="w-full bg-transparent text-ds-secondary outline-none"
                  />
                  <select
                    value={kf.easing}
                    onChange={e => updateKeyframeValue(i, 'easing', e.target.value)}
                    className="bg-transparent text-ds-muted outline-none text-[9px]"
                  >
                    {EASING_OPTIONS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                  </select>
                  <button
                    onClick={() => deleteKeyframe(i)}
                    className="text-red-500 hover:text-red-400 text-[11px]"
                    title="Delete keyframe"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Mini visualization */}
          {currentTrack && currentTrack.keyframes.length >= 2 && (
            <div className="h-8 bg-zinc-900 rounded border border-zinc-800 relative overflow-hidden">
              <svg width="100%" height="100%" viewBox={`0 0 ${overlay.durationInFrames} 100`} preserveAspectRatio="none">
                {/* Line connecting keyframes */}
                <polyline
                  points={currentTrack.keyframes.map(kf => {
                    const minVal = Math.min(...currentTrack.keyframes.map(k => k.value));
                    const maxVal = Math.max(...currentTrack.keyframes.map(k => k.value));
                    const range = maxVal - minVal || 1;
                    const y = 90 - ((kf.value - minVal) / range) * 80;
                    return `${kf.frame},${y}`;
                  }).join(' ')}
                  fill="none"
                  stroke={propInfo.color}
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
                {/* Diamond markers */}
                {currentTrack.keyframes.map((kf, i) => {
                  const minVal = Math.min(...currentTrack.keyframes.map(k => k.value));
                  const maxVal = Math.max(...currentTrack.keyframes.map(k => k.value));
                  const range = maxVal - minVal || 1;
                  const y = 90 - ((kf.value - minVal) / range) * 80;
                  return (
                    <polygon
                      key={i}
                      points={`${kf.frame},${y - 6} ${kf.frame + 3},${y} ${kf.frame},${y + 6} ${kf.frame - 3},${y}`}
                      fill={propInfo.color}
                    />
                  );
                })}
                {/* Playhead */}
                <line
                  x1={localFrame}
                  y1={0}
                  x2={localFrame}
                  y2={100}
                  stroke="#ef4444"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default KeyframeInspectorPanel;
