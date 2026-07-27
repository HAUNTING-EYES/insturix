import React from 'react';
import {Audio, Sequence, staticFile} from 'remotion';

// One-shot SFX cue placed at a composition frame. Generated procedurally (scripts/gen-sfx.mjs).
export type SfxName = 'click' | 'tick' | 'pop' | 'whoosh' | 'impact' | 'riser' | 'success';
export type SfxCue = {name: SfxName; at: number; volume?: number};

export const Sfx: React.FC<SfxCue> = ({name, at, volume = 1}) => (
  <Sequence from={at} durationInFrames={130} layout="none">
    <Audio src={staticFile(`sfx/${name}.wav`)} volume={volume} />
  </Sequence>
);

export const SfxTrack: React.FC<{cues: SfxCue[]; offset?: number}> = ({cues, offset = 0}) => (
  <>
    {cues.map((c, i) => (
      <Sfx key={i} name={c.name} at={c.at + offset} volume={c.volume} />
    ))}
  </>
);
