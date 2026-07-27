import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {ROOMS} from '../theme';
import {PipelineStrip} from './PipelineStrip';
import {StaggerChars} from './StaggerChars';
import {useFade, reveal, EASE} from '../anim';
import {useBeatGrid} from '../beat';

// Chaos → order: the scattered nodes fly into a row and snap into the pipeline, which ignites
// on a downbeat. The brand emerges from the system. (Carries the colors in from BrokenField.)
const STARTS = [
  {x: 420, y: 300},
  {x: 1500, y: 360},
  {x: 700, y: 770},
  {x: 1300, y: 760},
  {x: 360, y: 620},
  {x: 1560, y: 600},
];
const STRIP_W = 1480;
const LEFT = (1920 - STRIP_W) / 2;
const GAP = 12;
const SEG = (STRIP_W - GAP * 5) / 6;
const TARGETS = ROOMS.map((_, i) => ({x: LEFT + i * (SEG + GAP) + SEG / 2, y: 596}));
const STRIP_TOP = 590;

export const Assemble: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const fade = useFade(durationInFrames);
  const {downbeat} = useBeatGrid();

  const converge = reveal(frame, 10, 70);
  const nodesOut = interpolate(frame, [66, 92], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const stripIn = reveal(frame, 72, 104);
  const ignite = stripIn * (0.35 + downbeat * 0.65);
  const wm = reveal(frame, 100, 134);

  return (
    <AbsoluteFill style={{opacity: fade}}>
      {ROOMS.map((room, i) => {
        const x = interpolate(converge, [0, 1], [STARTS[i].x, TARGETS[i].x], {easing: EASE});
        const y = interpolate(converge, [0, 1], [STARTS[i].y, TARGETS[i].y], {easing: EASE});
        const w = interpolate(converge, [0, 1], [46, SEG]);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x - w / 2,
              top: y - 6,
              width: w,
              height: 12,
              borderRadius: 6,
              background: room.color,
              opacity: nodesOut * 0.95,
              boxShadow: `0 0 18px ${room.color}66`,
            }}
          />
        );
      })}

      <div
        style={{
          position: 'absolute',
          top: STRIP_TOP,
          left: LEFT,
          width: STRIP_W,
          opacity: stripIn,
          filter: `brightness(${1 + ignite * 0.7})`,
        }}
      >
        <PipelineStrip progress={6} width={STRIP_W} showLabels />
      </div>

      <div style={{position: 'absolute', top: 360, width: '100%', textAlign: 'center', opacity: wm}}>
        <StaggerChars text="Insturix" fontSize={124} weight={800} gradient startAt={100} stagger={2.4} />
      </div>
    </AbsoluteFill>
  );
};
