import React from 'react';
import {AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {ROOMS, theme} from '../theme';
import {PipelineStrip} from './PipelineStrip';
import {RoomProof} from './RoomProof';
import {MonoLabel} from './MonoLabel';
import {useFade, SNAP} from '../anim';

// The hero: a "brief" flows through the six rooms, transforming at each (script → cut → score →
// thumbnails → platforms → link). The pipeline strip advances above; each room's proof slides in.
// Words are reduced to the verb + a mono room label — the visual carries the meaning.
const RW = 238; // ≈ 9 beats @ 60fps / 136 BPM

const RoomStage: React.FC<{index: number}> = ({index}) => {
  const room = ROOMS[index];
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame, fps, config: SNAP});
  const x = interpolate(enter, [0, 1], [140, 0]);
  const exit = interpolate(frame, [RW - 24, RW], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', opacity: Math.min(enter, exit)}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 80, transform: `translateX(${x}px)`, marginTop: 70}}>
        <div style={{width: 660}}>
          <MonoLabel size={15} tracking={0.22} color={room.color} style={{marginBottom: 18}}>
            {`ROOM 0${index + 1} · ${room.label}`}
          </MonoLabel>
          <div
            style={{
              fontFamily: theme.font.sans,
              fontWeight: 800,
              fontSize: 124,
              letterSpacing: '-0.04em',
              color: room.color,
              lineHeight: 1,
              whiteSpace: 'nowrap',
            }}
          >
            {room.verb}
          </div>
        </div>
        <RoomProof roomKey={room.key} color={room.color} />
      </div>
    </AbsoluteFill>
  );
};

export const TransformFlow: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const fade = useFade(durationInFrames, 16, 20);
  const current = Math.max(0, Math.min(5, Math.floor(frame / RW)));

  return (
    <AbsoluteFill style={{opacity: fade}}>
      <div style={{position: 'absolute', top: 120, left: (1920 - 1480) / 2, width: 1480}}>
        <PipelineStrip progress={6} highlight={current} width={1480} showLabels />
      </div>
      {ROOMS.map((_, i) => (
        <Sequence key={i} from={i * RW} durationInFrames={RW}>
          <RoomStage index={i} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
