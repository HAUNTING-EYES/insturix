import React from 'react';
import {ROOMS, theme} from '../theme';
import {MonoLabel} from './MonoLabel';

// THE signature asset: the "six rooms / one production floor" strip.
// `progress` (0..6) fills segments left→right (used while lighting up).
// `highlight` keeps the strip fully built but spotlights one room (used across the montage,
// so the strip holds position across cuts = match cut, only the glow + playhead travel).
export const PipelineStrip: React.FC<{
  progress: number;
  width?: number;
  showLabels?: boolean;
  highlight?: number | null;
}> = ({progress, width = 1400, showLabels = true, highlight = null}) => {
  const playheadPos =
    highlight !== null
      ? (highlight + 0.5) / 6
      : progress > 0.02 && progress < 5.98
        ? progress / 6
        : null;

  return (
    <div style={{width, position: 'relative'}}>
      <div style={{display: 'flex', gap: 12}}>
        {ROOMS.map((room, i) => {
          const fill = Math.max(0, Math.min(1, progress - i));
          const active = fill > 0;
          const isHi = highlight === i;
          const dim = highlight !== null && !isHi;
          return (
            <div key={room.key} style={{flex: 1}}>
              <div
                style={{
                  height: 10,
                  borderRadius: 5,
                  background: theme.colors.well,
                  border: `1px solid ${active ? room.color + (isHi ? 'cc' : '55') : theme.colors.border}`,
                  overflow: 'hidden',
                  boxShadow: isHi
                    ? `0 0 24px ${room.color}77`
                    : fill >= 1
                      ? `0 0 12px ${room.color}22`
                      : 'none',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${fill * 100}%`,
                    background: room.color,
                    opacity: dim ? 0.45 : 1,
                    borderRadius: 5,
                  }}
                />
              </div>
              {showLabels && (
                <div style={{marginTop: 12, textAlign: 'center'}}>
                  <MonoLabel
                    size={11}
                    tracking={0.16}
                    color={active ? room.color : theme.colors.textFaint}
                    style={{opacity: dim ? 0.45 : 1}}
                  >
                    {room.label}
                  </MonoLabel>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {playheadPos !== null && (
        <div style={{position: 'absolute', top: -6, left: `${playheadPos * 100}%`, transform: 'translateX(-50%)'}}>
          <div
            style={{
              width: 2,
              height: 22,
              margin: '0 auto',
              background: theme.colors.gold,
              boxShadow: `0 0 10px ${theme.colors.gold}aa`,
            }}
          />
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              marginTop: -1,
              background: theme.colors.gold,
              boxShadow: `0 0 12px ${theme.colors.gold}`,
            }}
          />
        </div>
      )}
    </div>
  );
};
