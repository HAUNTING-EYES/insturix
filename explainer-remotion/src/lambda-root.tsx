import React from 'react';
import {Composition} from 'remotion';
import {GenFilm, genFilmDuration} from './bricks/GenFilm';

// Minimal Lambda entry: registers ONLY the bespoke-scene film (Gen-Film) so the per-video deploy bundle pulls
// just Gen-Film's tree (custom bricks/transitions.ts) and NOT InsturixExplainer.tsx's @remotion/transitions dep,
// which editron's node_modules doesn't carry. This is the composition the explainer render path deploys+renders.
export const LambdaRoot: React.FC = () => (
  <Composition
    id="Gen-Film"
    component={GenFilm}
    durationInFrames={genFilmDuration()}
    fps={60}
    width={1920}
    height={1080}
  />
);
