'use client';

import React, { useCallback, useRef, useState } from 'react';
import { Overlay, KeyframeTrack } from '../../types';
import { useEditorContext } from '../../contexts/editor-context';

/**
 * Timeline Keyframe Diamonds
 *
 * Renders interactive colored diamond markers on the timeline item for each keyframe.
 * - Click: seek to keyframe position
 * - Drag: move keyframe to new frame position
 * - Right-click: delete the keyframe
 * - Hover: shows property, value, easing in tooltip
 */

const PROPERTY_COLORS: Record<string, string> = {
  x: '#3b82f6',        // blue
  y: '#3b82f6',        // blue
  scale: '#22c55e',    // green
  opacity: '#eab308',  // yellow
  rotation: '#ef4444', // red
  speed: '#a855f7',    // purple
};

const PROPERTY_LABELS: Record<string, string> = {
  x: 'Position X',
  y: 'Position Y',
  scale: 'Scale',
  opacity: 'Opacity',
  rotation: 'Rotation',
  speed: 'Speed',
};

// Human-readable descriptions of what each property does
const PROPERTY_HELP: Record<string, string> = {
  x: 'Moves the clip horizontally across the frame',
  y: 'Moves the clip vertically across the frame',
  scale: 'Zooms the clip in or out (1.0 = normal, 1.5 = 50% larger)',
  opacity: 'Controls visibility (0 = invisible, 1 = fully visible). Used for fade effects and transitions',
  rotation: 'Rotates the clip (in degrees)',
  speed: 'Changes playback speed (1 = normal, 0.5 = slow-mo, 2 = double speed)',
};

interface TimelineKeyframeDiamondsProps {
  overlay: Overlay;
  itemWidth: number;
  totalDuration?: number;
}

export const TimelineKeyframeDiamonds: React.FC<TimelineKeyframeDiamondsProps> = ({
  overlay,
  itemWidth,
  totalDuration,
}) => {
  const { changeOverlay, seekTo } = useEditorContext();
  const tracks = overlay.keyframeTracks;
  const [showLegend, setShowLegend] = useState(false);
  if (!tracks || tracks.length === 0) return null;

  const duration = overlay.durationInFrames || 1;
  const dragRef = useRef<{
    trackIndex: number;
    keyframeIndex: number;
    startX: number;
    startFrame: number;
  } | null>(null);

  // Click: seek to this keyframe's position
  const handleClick = useCallback((frame: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const globalFrame = overlay.from + frame;
    seekTo?.(globalFrame);
  }, [overlay.from, seekTo]);

  // Drag: move keyframe to new frame position
  const handleMouseDown = useCallback((trackIndex: number, keyframeIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const startFrame = tracks[trackIndex].keyframes[keyframeIndex].frame;
    dragRef.current = { trackIndex, keyframeIndex, startX, startFrame };

    const parentEl = (e.target as HTMLElement).closest('.absolute.bottom-0');
    const parentWidth = parentEl?.clientWidth || 100;

    const handleMouseMove = (moveE: MouseEvent) => {
      if (!dragRef.current) return;
      const deltaX = moveE.clientX - dragRef.current.startX;
      const deltaFrames = Math.round((deltaX / parentWidth) * duration);
      const newFrame = Math.max(0, Math.min(duration, dragRef.current.startFrame + deltaFrames));

      // Update the keyframe in place
      if (changeOverlay) {
        changeOverlay(overlay.id, (ov) => {
          const newTracks = [...(ov.keyframeTracks || [])];
          const track = { ...newTracks[dragRef.current!.trackIndex] };
          const keyframes = [...track.keyframes];
          keyframes[dragRef.current!.keyframeIndex] = {
            ...keyframes[dragRef.current!.keyframeIndex],
            frame: newFrame,
          };
          track.keyframes = keyframes;
          newTracks[dragRef.current!.trackIndex] = track;
          return { ...ov, keyframeTracks: newTracks };
        });
      }
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [tracks, overlay.id, overlay.keyframeTracks, duration, changeOverlay]);

  // Right-click: delete this keyframe
  const handleContextMenu = useCallback((trackIndex: number, keyframeIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!changeOverlay) return;

    // Don't delete if only 2 keyframes left (minimum for a track)
    const track = tracks[trackIndex];
    if (track.keyframes.length <= 2) return;

    changeOverlay(overlay.id, (ov) => {
      const newTracks = [...(ov.keyframeTracks || [])];
      const newTrack = { ...newTracks[trackIndex] };
      newTrack.keyframes = newTrack.keyframes.filter((_: any, i: number) => i !== keyframeIndex);
      newTracks[trackIndex] = newTrack;
      // Remove track entirely if no keyframes left
      return { ...ov, keyframeTracks: newTracks.filter(t => t.keyframes.length > 0) };
    });
  }, [tracks, overlay.id, changeOverlay]);

  // Get unique properties in this overlay for the legend
  const uniqueProperties = [...new Set(tracks.map(t => t.property))];

  return (
    <div
      className="absolute bottom-0 left-0 right-0 h-[10px] pointer-events-auto"
      style={{ zIndex: 50 }}
      onMouseEnter={() => setShowLegend(true)}
      onMouseLeave={() => setShowLegend(false)}
    >
      {/* Keyframe legend popover — shows on hover */}
      {showLegend && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2.5 py-1.5 rounded-md bg-zinc-900 border border-zinc-700 shadow-xl text-[9px] text-zinc-300 whitespace-nowrap pointer-events-none"
          style={{ zIndex: 100 }}
        >
          <div className="font-semibold text-zinc-100 mb-0.5">Keyframes — Animation Points</div>
          <div className="text-zinc-500 mb-1">Drag to move | Click to seek | Right-click to delete</div>
          {uniqueProperties.map(prop => (
            <div key={prop} className="flex items-center gap-1.5 leading-relaxed">
              <span
                className="inline-block w-2 h-2 rounded-[1px]"
                style={{
                  backgroundColor: PROPERTY_COLORS[prop] || '#888',
                  transform: 'rotate(45deg)',
                }}
              />
              <span className="text-zinc-200 font-medium">{PROPERTY_LABELS[prop] || prop}</span>
              <span className="text-zinc-500">— {PROPERTY_HELP[prop] || 'Animates this property over time'}</span>
            </div>
          ))}
        </div>
      )}

      {tracks.map((track: KeyframeTrack, ti: number) =>
        track.keyframes.map((kf, ki) => {
          const xPercent = (kf.frame / duration) * 100;
          const color = PROPERTY_COLORS[track.property] || '#888';
          const label = PROPERTY_LABELS[track.property] || track.property;
          const help = PROPERTY_HELP[track.property] || 'Animates this property';
          const valueStr = typeof kf.value === 'number' ? kf.value.toFixed(2) : String(kf.value);
          const timeStr = `${(kf.frame / 30).toFixed(1)}s`;

          return (
            <div
              key={`${ti}-${ki}`}
              className="absolute cursor-grab hover:scale-[2] active:scale-[2.5] active:cursor-grabbing transition-transform pointer-events-auto"
              style={{
                left: `${xPercent}%`,
                top: '50%',
                transform: 'translate(-50%, -50%) rotate(45deg)',
                width: 8,
                height: 8,
                backgroundColor: color,
                borderRadius: 1,
                border: '1px solid rgba(0,0,0,0.4)',
                boxShadow: `0 0 4px ${color}80`,
                zIndex: 51,
              }}
              title={`${label}: ${valueStr} at ${timeStr}\n${help}\nEasing: ${kf.easing || 'ease-in-out'}\n\nDrag to reposition | Right-click to delete`}
              onClick={(e) => handleClick(kf.frame, e)}
              onMouseDown={(e) => {
                if (e.button === 0) handleMouseDown(ti, ki, e);
              }}
              onContextMenu={(e) => handleContextMenu(ti, ki, e)}
            />
          );
        }),
      )}
    </div>
  );
};

export default TimelineKeyframeDiamonds;
