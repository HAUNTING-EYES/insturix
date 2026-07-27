import React from 'react';
import {AbsoluteFill, interpolate, Sequence, useCurrentFrame} from 'remotion';
import type {Brand} from './brand';
import type {SceneGraph, SceneSpec} from './scene-graph';
import {BrandRevealScene} from './BrandRevealScene';
import {CursorWalkthrough} from './CursorWalkthrough';
import {SplitCompare} from './SplitCompare';
import {LogoOutro} from './LogoOutro';
import {transVisual, exitFor, clampP, type TransType} from './transitions';

// THE ASSEMBLER. Renders a SceneGraph into a full video: each scene is a brick form. Between scenes it uses
// MOMENTUM transitions (push/slide, not a flat crossfade), and every scene gets a slow in-scene camera push
// so nothing sits static. This is the deterministic engine that executes a director's plan (GLM or hand).
const renderForm = (spec: SceneSpec, brand: Brand): React.ReactNode => {
  switch (spec.form) {
    case 'hero':
      return <BrandRevealScene brand={brand} {...spec.props} />;
    case 'cursor':
      return <CursorWalkthrough brand={brand} {...spec.props} />;
    case 'split':
      return <SplitCompare brand={brand} {...spec.props} />;
    case 'logo':
      return <LogoOutro brand={brand} {...spec.props} />;
  }
};

const SceneClip: React.FC<{spec: SceneSpec; brand: Brand; enterType: TransType; exitType: TransType; fadeIn: number; fadeOut: number}> = ({
  spec,
  brand,
  enterType,
  exitType,
  fadeIn,
  fadeOut,
}) => {
  const frame = useCurrentFrame();
  const dur = spec.durationInFrames;

  // transition transform: enter via the PREVIOUS scene's exit type, leave via own exit type
  let vis = {transform: 'none', transformOrigin: '50% 50%', opacity: 1};
  if (fadeIn > 0 && frame < fadeIn) vis = transVisual(enterType, 'in', clampP(frame, 0, fadeIn));
  else if (fadeOut > 0 && frame > dur - fadeOut) vis = transVisual(exitType, 'out', clampP(frame, dur - fadeOut, dur));

  // continuous in-scene camera push (skip cursor — it runs its own zoom camera)
  const push = spec.form === 'cursor' ? 1 : interpolate(frame, [0, dur], [1.0, 1.04], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill style={{transform: `scale(${push})`, transformOrigin: '50% 50%'}}>
      <AbsoluteFill style={{transform: vis.transform, transformOrigin: vis.transformOrigin, opacity: vis.opacity}}>
        {renderForm(spec, brand)}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const Film: React.FC<{graph: SceneGraph}> = ({graph}) => {
  const {scenes, transitionFrames: T, brand} = graph;
  let acc = 0;
  return (
    <AbsoluteFill style={{backgroundColor: brand.colors.bg}}>
      {scenes.map((s, i) => {
        const start = Math.max(0, acc - T * i);
        acc += s.durationInFrames;
        return (
          <Sequence key={i} from={start} durationInFrames={s.durationInFrames} layout="none">
            <SceneClip
              spec={s}
              brand={brand}
              enterType={exitFor(scenes[i - 1])}
              exitType={exitFor(s)}
              fadeIn={i > 0 ? T : 0}
              fadeOut={i < scenes.length - 1 ? T : 0}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
