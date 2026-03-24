'use client';

import React from 'react';
import { Overlay, KeyframeTrack } from '../../types';

/**
 * Timeline Keyframe Diamonds
 *
 * Renders small colored diamond markers on the timeline item for each keyframe.
 * Shows as a thin strip at the bottom of the item when keyframeTracks exist.
 */

const PROPERTY_COLORS: Record<string, string> = {
  x: '#3b82f6',        // blue
  y: '#3b82f6',        // blue
  scale: '#22c55e',    // green
  opacity: '#eab308',  // yellow
  rotation: '#ef4444', // red
  speed: '#a855f7',    // purple
};

interface TimelineKeyframeDiamondsProps {
  overlay: Overlay;
  itemWidth: number;
  onSeekToFrame?: (frame: number) => void;
}

export const TimelineKeyframeDiamonds: React.FC<TimelineKeyframeDiamondsProps> = ({
  overlay,
  itemWidth,
  onSeekToFrame,
}) => {
  const tracks = overlay.keyframeTracks;
  if (!tracks || tracks.length === 0) return null;

  const duration = overlay.durationInFrames || 1;

  return (
    <div
      className="absolute bottom-0 left-0 right-0 h-[6px] pointer-events-auto"
      style={{ zIndex: 10 }}
    >
      {tracks.map((track: KeyframeTrack, ti: number) =>
        track.keyframes.map((kf, ki) => {
          const xPercent = (kf.frame / duration) * 100;
          const color = PROPERTY_COLORS[track.property] || '#888';

          return (
            <div
              key={`${ti}-${ki}`}
              className="absolute cursor-pointer hover:scale-150 transition-transform"
              style={{
                left: `${xPercent}%`,
                top: '50%',
                transform: 'translate(-50%, -50%) rotate(45deg)',
                width: 5,
                height: 5,
                backgroundColor: color,
                borderRadius: 1,
              }}
              title={`${track.property}: ${kf.value} at frame ${kf.frame} (${kf.easing})`}
              onClick={(e) => {
                e.stopPropagation();
                onSeekToFrame?.(overlay.from + kf.frame);
              }}
            />
          );
        }),
      )}
    </div>
  );
};

export default TimelineKeyframeDiamonds;
