// MINIMAL proof root — registers ONLY the Gen-Proof composition (the per-scene render target the craft loop
// writes into gen/_proof.tsx). The full src/Root.tsx imports ~25 modules (every film, screen, editor), so bundling
// it for EVERY proof render cost ~1-2 min each. This entry pulls in only _proof + its brand/primitives, so the
// re-bundle drops to seconds — the single biggest speedup for the craft loop. (The final assembled film still
// renders from the full Root via Lambda; that's a one-time render, not per-proof.)
import React from 'react';
import {Composition} from 'remotion';
import {GlmScene as ProofScene} from './bricks/gen/_proof';
import {INSTURIX} from './bricks/brand';

export const ProofRoot: React.FC = () => (
  <Composition
    id="Gen-Proof"
    component={ProofScene}
    durationInFrames={400}
    fps={60}
    width={1920}
    height={1080}
    defaultProps={{brand: INSTURIX}}
  />
);
