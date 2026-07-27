import React from 'react';
import {AbsoluteFill, Sequence, interpolate, useCurrentFrame, spring, useVideoConfig} from 'remotion';
import {Stage, Region} from '../bricks/stage';
import {FitHeadline, Chip, TextBlock} from '../bricks/fit-text';
import {matchCutVisual, clampP} from '../bricks/transitions';
import {VERCEL} from './brand';
import {DeployScreen} from './DeployScreen';

// A short BESPOKE Vercel explainer, crafted the agent way (not from templates, not from GLM): monochrome type
// that owns the frame, the live deployment screen as the product moment, a logo close — joined with match cuts.
// Proves the loop generalizes to a brand that is the opposite of Insturix (stark black/white/flat vs warm gold).
const brand = VERCEL;
const T = 20;

const Tri: React.FC<{size?: number; color?: string}> = ({size = 15, color = brand.colors.text}) => (
  <svg width={size} height={size * 0.92} viewBox="0 0 24 22"><path d="M12 1 L23 21 L1 21 Z" fill={color} /></svg>
);

// 1 — HOOK: monochrome kinetic type (Vercel emphasises with scale + the green deploy pop, not coloured words)
const Hook: React.FC = () => (
  <Stage brand={brand}>
    <Region brand={brand} x={0.08} y={0.3} w={0.84} h={0.4} align="start" justify="center">
      <FitHeadline brand={brand} text="git push." size="display" kinetic="chars" align="left" />
      <FitHeadline brand={brand} text="It's live." size="l" kinetic="rise" startAt={22} align="left" />
    </Region>
  </Stage>
);

// 2 — PRODUCT: the live deployment building itself, with the beat headline in the top void
const Deploy: React.FC = () => (
  <AbsoluteFill style={{backgroundColor: brand.colors.bg}}>
    <DeployScreen />
    <Stage brand={brand} backdrop={false}>
      <Region brand={brand} x={0.03} y={0.05} w={0.62} h={0.16} align="start" justify="center" gapScale={0.7}>
        <Chip brand={brand} text="Preview → Production" tone="ghost" startAt={6} />
        <FitHeadline brand={brand} text="From commit to live." size="l" kinetic="rise" startAt={12} align="left" />
      </Region>
    </Stage>
  </AbsoluteFill>
);

// 3 — LOGO: the mark + wordmark + the promise
const Logo: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: frame - 6, fps, config: {damping: 18, mass: 0.8, stiffness: 120}});
  const op = interpolate(frame, [6, 24], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <Stage brand={brand}>
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 22, opacity: op, transform: `scale(${0.9 + 0.1 * s})`}}>
          <Tri size={64} />
          <span style={{fontFamily: brand.fontSans, fontSize: 88, fontWeight: 600, color: brand.colors.text, letterSpacing: '-0.04em'}}>Vercel</span>
        </div>
      </AbsoluteFill>
      <Region brand={brand} x={0.2} y={0.62} w={0.6} h={0.1} align="center" justify="center">
        <TextBlock brand={brand} text="Develop. Preview. Ship." tone="muted" size="m" startAt={30} align="center" />
      </Region>
    </Stage>
  );
};

type S = {Comp: React.FC; dur: number; focal: {x: number; y: number}};
const SCENES: S[] = [
  {Comp: Hook, dur: 96, focal: {x: 0.28, y: 0.46}},
  {Comp: Deploy, dur: 190, focal: {x: 0.5, y: 0.42}},
  {Comp: Logo, dur: 110, focal: {x: 0.5, y: 0.5}},
];

export const vercelFilmDuration = () => SCENES.reduce((a, s) => a + s.dur, 0) - T * (SCENES.length - 1);

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

export const VercelFilm: React.FC = () => {
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
