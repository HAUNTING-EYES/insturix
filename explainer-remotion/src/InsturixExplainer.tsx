import React from 'react';
import {AbsoluteFill, Audio, interpolate, staticFile} from 'remotion';
import {TransitionSeries, linearTiming, springTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {slide} from '@remotion/transitions/slide';
import {Background} from './components/Background';
import {BrokenField} from './components/BrokenField';
import {Assemble} from './components/Assemble';
import {TransformFlow} from './components/TransformFlow';
import {OutputBurst} from './components/OutputBurst';
import {CTA} from './components/CTA';
import {EASE} from './anim';
import {HAS_MUSIC, MUSIC_FILE, MUSIC_VOLUME} from './timing';

// 60fps, cuts locked to the 136 BPM grid (beat ≈ 26.47f). Story is told as motion graphics:
// scattered/broken nodes → converge + ignite the pipeline → a brief transforms through the six
// rooms → bursts to every platform → payoff. Total = Σ scenes (3346) − Σ transitions (64) = 3282f (0:55).
export const TOTAL = 3282;
const fadeT = (d: number) => linearTiming({durationInFrames: d, easing: EASE});
const moveT = (d: number) => springTiming({config: {damping: 30, mass: 0.5, stiffness: 200}, durationInFrames: d});

const musicVolume = (f: number) =>
  MUSIC_VOLUME *
  interpolate(f, [0, 16, TOTAL - 52, TOTAL], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

export const InsturixExplainer: React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor: '#08080A'}}>
      <Background />
      {HAS_MUSIC && <Audio src={staticFile(MUSIC_FILE)} volume={musicVolume} />}

      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={492}>
          <BrokenField durationInFrames={492} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition timing={fadeT(16)} presentation={fade()} />

        <TransitionSeries.Sequence durationInFrames={493}>
          <Assemble durationInFrames={493} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition timing={fadeT(16)} presentation={fade()} />

        <TransitionSeries.Sequence durationInFrames={1445}>
          <TransformFlow durationInFrames={1445} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition timing={moveT(16)} presentation={slide({direction: 'from-bottom'})} />

        <TransitionSeries.Sequence durationInFrames={440}>
          <OutputBurst durationInFrames={440} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition timing={fadeT(16)} presentation={fade()} />

        <TransitionSeries.Sequence durationInFrames={476}>
          <CTA durationInFrames={476} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
