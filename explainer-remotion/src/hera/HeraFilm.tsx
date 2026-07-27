import React from 'react';
import {AbsoluteFill, Sequence, interpolate, useCurrentFrame, spring, useVideoConfig} from 'remotion';
import {Stage, Region} from '../bricks/stage';
import {FitHeadline, Chip, TextBlock} from '../bricks/fit-text';
import {matchCutVisual, clampP} from '../bricks/transitions';
import {HERA, HERA_GRADIENT} from './brand';
import {HeraEditor} from './HeraEditor';

// BESPOKE Hera explainer — brand SCANNED from hera.video only (no priors, no templates, no GLM). A LIGHT
// brand end-to-end (white / navy / orange / gradient), the prompt→motion editor as the product moment.
const brand = HERA;
const T = 20;

const Clover: React.FC<{size?: number}> = ({size = 40}) => (
  <svg width={size} height={size} viewBox="0 0 40 40">
    <g fill={brand.colors.accent}>
      <circle cx="15" cy="15" r="9" />
      <circle cx="26" cy="15" r="9" />
      <circle cx="15" cy="26" r="9" />
      <circle cx="26" cy="26" r="9" />
    </g>
  </svg>
);

const Hook: React.FC = () => (
  <Stage brand={brand}>
    <Region brand={brand} x={0.09} y={0.32} w={0.82} h={0.4} align="start" justify="center">
      <FitHeadline brand={brand} text="Just describe it." size="display" kinetic="chars" align="left" />
      <FitHeadline brand={brand} text="Hera animates it." size="l" accentWords={['animates']} kinetic="rise" startAt={24} align="left" />
    </Region>
  </Stage>
);

const Editor: React.FC = () => (
  <AbsoluteFill style={{backgroundColor: '#EDEDF0'}}>
    <HeraEditor />
    <Stage brand={brand} backdrop={false}>
      <Region brand={brand} x={0.04} y={0.045} w={0.6} h={0.12} align="start" justify="center" gapScale={0.6}>
        <Chip brand={brand} text="Prompt → Motion" tone="accent" startAt={6} />
      </Region>
    </Stage>
  </AbsoluteFill>
);

const Logo: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: frame - 6, fps, config: {damping: 18, mass: 0.8, stiffness: 120}});
  const op = interpolate(frame, [6, 24], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <Stage brand={brand}>
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 24, opacity: op, transform: `scale(${0.9 + 0.1 * s})`}}>
          <Clover size={78} />
          <span style={{fontFamily: brand.fontSans, fontSize: 92, fontWeight: 700, color: brand.colors.text, letterSpacing: '-0.04em'}}>Hera</span>
        </div>
        <div style={{marginTop: 44, padding: '13px 30px', borderRadius: 999, background: HERA_GRADIENT, color: '#fff', fontFamily: brand.fontSans, fontWeight: 600, fontSize: 19, opacity: interpolate(frame, [26, 42], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}), transform: `translateY(${interpolate(frame, [26, 42], [10, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}px)`}}>
          Start creating
        </div>
      </AbsoluteFill>
      <Region brand={brand} x={0.25} y={0.72} w={0.5} h={0.08} align="center" justify="center">
        <TextBlock brand={brand} text="Your AI Motion Designer" tone="muted" size="m" startAt={44} align="center" />
      </Region>
    </Stage>
  );
};

type S = {Comp: React.FC; dur: number; focal: {x: number; y: number}};
const SCENES: S[] = [
  {Comp: Hook, dur: 150, focal: {x: 0.3, y: 0.46}},
  {Comp: Editor, dur: 240, focal: {x: 0.5, y: 0.42}},
  {Comp: Logo, dur: 200, focal: {x: 0.5, y: 0.46}},
];

export const heraFilmDuration = () => SCENES.reduce((a, s) => a + s.dur, 0) - T * (SCENES.length - 1);

const Clip: React.FC<{s: S; enterFocal: {x: number; y: number}; exitFocal: {x: number; y: number}; fadeIn: number; fadeOut: number}> = ({s, enterFocal, exitFocal, fadeIn, fadeOut}) => {
  const frame = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  let vis = {transform: 'none', transformOrigin: '50% 50%', opacity: 1};
  if (fadeIn > 0 && frame < fadeIn) vis = matchCutVisual('zoom', 'in', clampP(frame, 0, fadeIn), {x: enterFocal.x * W, y: enterFocal.y * H});
  else if (fadeOut > 0 && frame > s.dur - fadeOut) vis = matchCutVisual('zoom', 'out', clampP(frame, s.dur - fadeOut, s.dur), {x: exitFocal.x * W, y: exitFocal.y * H});
  const C = s.Comp;
  return (
    <AbsoluteFill style={{transform: vis.transform, transformOrigin: vis.transformOrigin, opacity: vis.opacity}}>
      <C />
    </AbsoluteFill>
  );
};

export const HeraFilm: React.FC = () => {
  let acc = 0;
  return (
    <AbsoluteFill style={{backgroundColor: brand.colors.bg}}>
      {SCENES.map((s, i) => {
        const start = Math.max(0, acc - T * i);
        acc += s.dur;
        const next = SCENES[i + 1];
        return (
          <Sequence key={i} from={start} durationInFrames={s.dur} layout="none">
            <Clip s={s} enterFocal={s.focal} exitFocal={(next ?? s).focal} fadeIn={i > 0 ? T : 0} fadeOut={i < SCENES.length - 1 ? T : 0} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
