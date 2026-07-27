import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {INSTURIX} from './brand';
import {GEN_SCENES, GEN_META, type GenScene} from './gen/manifest';
import {matchCutVisual, clampP, type TransType} from './transitions';
import {AUDIO} from './gen/audio-config';

// Assembles the GLM-AUTHORED scenes (from the manifest) into ONE continuous film. Between scenes the camera
// does a MATCH CUT: it dives into the next scene's subject (focal point) while the current scene dissolves,
// and the next scene emerges from that same point. That's what makes it read as one take instead of "separate
// frames." Each GLM scene carries its own internal motion; this only owns the joins.

// Where the camera dives at each seam, per form (fractions of the frame). Product forms bias toward where the
// screenshot's subject sits; type/metric forms toward their visual mass. A per-scene `focus` in the manifest
// (Phase 2: vision-derived) overrides this when present.
const FORM_FOCUS: Record<string, {x: number; y: number}> = {
  'kinetic-statement': {x: 0.3, y: 0.44},
  'full-bleed-product': {x: 0.34, y: 0.4},
  annotate: {x: 0.62, y: 0.42},
  'data-beat': {x: 0.42, y: 0.48},
  transformation: {x: 0.5, y: 0.5},
  montage: {x: 0.5, y: 0.45},
  'process-rail': {x: 0.5, y: 0.46},
  'title-card': {x: 0.5, y: 0.5},
  logo: {x: 0.5, y: 0.5},
};

const focalPx = (scene: GenScene, W: number, H: number): {x: number; y: number} => {
  const f = (scene as GenScene & {focus?: {x: number; y: number}}).focus ?? FORM_FOCUS[scene.form] ?? {x: 0.5, y: 0.5};
  return {x: f.x * W, y: f.y * H};
};

// The outro fades; everything else dives. (Old code keyed off v1 form names like 'split' — dead now.)
const exitTypeFor = (form?: string): TransType => (form === 'logo' ? 'fade' : 'zoom');

const Clip: React.FC<{
  scene: GenScene;
  enterType: TransType;
  exitType: TransType;
  enterFocal: {x: number; y: number};
  exitFocal: {x: number; y: number};
  fadeIn: number;
  fadeOut: number;
}> = ({scene, enterType, exitType, enterFocal, exitFocal, fadeIn, fadeOut}) => {
  const frame = useCurrentFrame();
  const dur = scene.durationInFrames;
  let vis = {transform: 'none', transformOrigin: '50% 50%', opacity: 1};
  if (fadeIn > 0 && frame < fadeIn) vis = matchCutVisual(enterType, 'in', clampP(frame, 0, fadeIn), enterFocal);
  else if (fadeOut > 0 && frame > dur - fadeOut) vis = matchCutVisual(exitType, 'out', clampP(frame, dur - fadeOut, dur), exitFocal);
  const C = scene.Comp;
  return (
    <AbsoluteFill style={{transform: vis.transform, transformOrigin: vis.transformOrigin, opacity: vis.opacity}}>
      <C brand={INSTURIX} />
    </AbsoluteFill>
  );
};

export const genFilmDuration = (): number => {
  const T = GEN_META.transitionFrames;
  return Math.max(1, GEN_SCENES.reduce((a, s) => a + s.durationInFrames, 0) - T * Math.max(0, GEN_SCENES.length - 1));
};

export const GenFilm: React.FC = () => {
  const {width: W, height: H} = useVideoConfig();
  const T = GEN_META.transitionFrames;
  // Precompute each scene's start frame (transition overlap) so BOTH the visuals and the VO can anchor to it.
  const starts: number[] = [];
  {
    let a = 0;
    GEN_SCENES.forEach((s, i) => {
      starts.push(Math.max(0, a - T * i));
      a += s.durationInFrames;
    });
  }
  let acc = 0;
  return (
    <AbsoluteFill style={{backgroundColor: INSTURIX.colors.bg}}>
      {/* Music bed under the whole film (looped, low, ducked by ear). Silent if no prep-audio ran. */}
      {AUDIO.music ? <Audio src={staticFile(AUDIO.music)} volume={AUDIO.musicVolume ?? 0.16} loop /> : null}
      {/* Per-scene VO — Ava narration mounted at each scene's start (audio-first: scene ≥ its VO length). */}
      {AUDIO.voScenes.map((i) => (
        <Sequence key={`vo-${i}`} from={starts[i]} layout="none">
          <Audio src={staticFile(`audio/vo-${i}.mp3`)} />
        </Sequence>
      ))}
      {GEN_SCENES.map((s, i) => {
        const start = Math.max(0, acc - T * i);
        acc += s.durationInFrames;
        const next = GEN_SCENES[i + 1];
        // A seam shares ONE focal point (the incoming scene's subject): scene i dives toward scene i+1's
        // focal on exit, and scene i+1 emerges from its own focal on enter — so both sides of the cut agree.
        return (
          <Sequence key={i} from={start} durationInFrames={s.durationInFrames} layout="none">
            <Clip
              scene={s}
              enterType={exitTypeFor(GEN_SCENES[i - 1]?.form)}
              exitType={exitTypeFor(s.form)}
              enterFocal={focalPx(s, W, H)}
              exitFocal={focalPx(next ?? s, W, H)}
              fadeIn={i > 0 ? T : 0}
              fadeOut={i < GEN_SCENES.length - 1 ? T : 0}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
