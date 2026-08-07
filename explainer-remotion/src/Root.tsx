import React from 'react';
import {Composition} from 'remotion';
import {InsturixExplainer} from './InsturixExplainer';
import {ContactSheet} from './components/ContactSheet';
import {DashboardScreen} from './screens/DashboardScreen';
import {EditronScreen} from './screens/EditronScreen';
import {SegmentProof, SEGMENT_DURATION} from './SegmentProof';
import {DashboardProof} from './DashboardProof';
import {AnalyzeProof} from './AnalyzeProof';
import {InsturixFilm, FILM_DURATION} from './InsturixFilm';
import {HookScene, HOOK_DURATION} from './components/HookScene';
import {FormDemo} from './bricks/FormDemo';
import {INSTURIX, NORTHWIND} from './bricks/brand';
import {Film} from './bricks/Film';
import {INSTURIX_PLAN, filmDuration} from './bricks/scene-graph';
import type {SceneGraph} from './bricks/scene-graph';
import {GENERATED_SCENES} from './bricks/generated-plan';
import {GlmScene} from './bricks/glm-scene';
import {GlmScene as ProofScene} from './bricks/gen/_proof';
import {GenFilm, genFilmDuration} from './bricks/GenFilm';
import {ScreenTest} from './bricks/screen/_screentest';
import {DeployScreen} from './vercel/DeployScreen';
import {VercelFilm, vercelFilmDuration} from './vercel/VercelFilm';
import {HeraEditor} from './hera/HeraEditor';
import {HeraFilm, heraFilmDuration} from './hera/HeraFilm';

// GLM-directed plan → full SceneGraph (brand attached here; GLM only chose forms + copy + pacing).
const GENERATED_GRAPH: SceneGraph = {brand: INSTURIX, transitionFrames: 22, scenes: GENERATED_SCENES};

// fps 60, 1920x1080, 3282 frames ≈ 0:55. Cuts locked to the 136 BPM music grid. Motion-graphics arc.
const MAIN_DURATION = 3282;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="InsturixExplainer"
        component={InsturixExplainer}
        durationInFrames={MAIN_DURATION}
        fps={60}
        width={1920}
        height={1080}
      />
      {/* Evaluation aid: one still renders 20 frozen frames from across the film. */}
      <Composition
        id="ContactSheet"
        component={ContactSheet}
        durationInFrames={1}
        fps={60}
        width={1920}
        height={1080}
        defaultProps={{total: MAIN_DURATION}}
      />
      {/* WIP: real-product-UI screen recreations + one-take spine (P1–P2 of the rebuild) */}
      <Composition id="DashboardScreen" component={DashboardScreen} durationInFrames={150} fps={60} width={1920} height={1080} />
      <Composition id="EditronScreen" component={EditronScreen} durationInFrames={180} fps={60} width={1920} height={1080} />
      <Composition id="SegmentProof" component={SegmentProof} durationInFrames={SEGMENT_DURATION} fps={60} width={1920} height={1080} />
      <Composition id="DashboardProof" component={DashboardProof} durationInFrames={150} fps={60} width={1920} height={1080} />
      <Composition id="AnalyzeProof" component={AnalyzeProof} durationInFrames={160} fps={60} width={1920} height={1080} />
      {/* ★ The full one-take, real-product film (V8) */}
      <Composition id="InsturixFilm" component={InsturixFilm} durationInFrames={FILM_DURATION} fps={60} width={1920} height={1080} />
      <Composition id="HookScene" component={HookScene} durationInFrames={HOOK_DURATION} fps={60} width={1920} height={1080} defaultProps={{durationInFrames: HOOK_DURATION}} />
      {/* Brick-kit proof: 3 forms × 2 brands — same code, re-skinned by SHAPE/TYPE/DENSITY/DECOR tokens (not just colour). */}
      <Composition id="Brick-Hero-Insturix" component={FormDemo} durationInFrames={120} fps={60} width={1920} height={1080} defaultProps={{brand: INSTURIX, form: 'hero' as const}} />
      <Composition id="Brick-Hero-Northwind" component={FormDemo} durationInFrames={120} fps={60} width={1920} height={1080} defaultProps={{brand: NORTHWIND, form: 'hero' as const}} />
      <Composition id="Brick-Cursor-Insturix" component={FormDemo} durationInFrames={120} fps={60} width={1920} height={1080} defaultProps={{brand: INSTURIX, form: 'cursor' as const}} />
      <Composition id="Brick-Cursor-Northwind" component={FormDemo} durationInFrames={120} fps={60} width={1920} height={1080} defaultProps={{brand: NORTHWIND, form: 'cursor' as const}} />
      <Composition id="Brick-Split-Insturix" component={FormDemo} durationInFrames={120} fps={60} width={1920} height={1080} defaultProps={{brand: INSTURIX, form: 'split' as const}} />
      <Composition id="Brick-Split-Northwind" component={FormDemo} durationInFrames={120} fps={60} width={1920} height={1080} defaultProps={{brand: NORTHWIND, form: 'split' as const}} />
      {/* ★ Full film assembled from a director SceneGraph (the contract GLM emits) — plan → bricks → video. */}
      <Composition id="Film-Insturix" component={Film} durationInFrames={filmDuration(INSTURIX_PLAN)} fps={60} width={1920} height={1080} defaultProps={{graph: INSTURIX_PLAN}} />
      {/* ★★ GLM-DIRECTED film — GLM chose the forms/order/copy; the brick engine renders it. */}
      <Composition id="Film-Generated" component={Film} durationInFrames={filmDuration(GENERATED_GRAPH)} fps={60} width={1920} height={1080} defaultProps={{graph: GENERATED_GRAPH}} />
      {/* TEST: GLM writes this scene's bespoke motion code itself (harness: compile→render-proof→repair). */}
      <Composition id="GLM-Scene" component={GlmScene} durationInFrames={210} fps={60} width={1920} height={1080} defaultProps={{brand: INSTURIX}} />
      {/* Per-scene render-proof target (harness writes each scene into gen/_proof.tsx) */}
      <Composition id="Gen-Proof" component={ProofScene} durationInFrames={400} fps={60} width={1920} height={1080} defaultProps={{brand: INSTURIX}} />
      {/* ★★★ Full GLM-AUTHORED film — every scene's motion code written by GLM, assembled from the manifest. */}
      <Composition id="Gen-Film" component={GenFilm} durationInFrames={genFilmDuration()} fps={60} width={1920} height={1080} />
      {/* Screen Engine proof: a GENERATED live screen from a ScreenSpec (vs the hand-built DashboardScreen) */}
      <Composition id="Screen-Test" component={ScreenTest} durationInFrames={150} fps={60} width={1920} height={1080} />
      {/* Agent proof: a BESPOKE Vercel product screen (non-Insturix brand) crafted by the agent loop */}
      <Composition id="Vercel-Deploy" component={DeployScreen} durationInFrames={200} fps={60} width={1920} height={1080} />
      <Composition id="Vercel-Film" component={VercelFilm} durationInFrames={vercelFilmDuration()} fps={60} width={1920} height={1080} />
      <Composition id="Hera-Editor" component={HeraEditor} durationInFrames={160} fps={60} width={1920} height={1080} />
      <Composition id="Hera-Film" component={HeraFilm} durationInFrames={heraFilmDuration()} fps={60} width={1920} height={1080} />
    </>
  );
};
