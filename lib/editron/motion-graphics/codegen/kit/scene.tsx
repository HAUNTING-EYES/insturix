/**
 * MG Codegen kit — SCENE: the illustrated-world primitives (design-then-code Phase 4b-1).
 *
 * WHY (evidence, 2026-07-18): the pure vector kit's ceiling is "clean card" — the frame-armed judge rates it
 * form 4-5 vs the professional anchors' 8-9, and the #1 amateur tell is content sitting ON a container instead
 * of living IN a scene. The pros build the other way: illustrated STILL layers + ONE computed camera + masks
 * animating the meaning + type sharing the world's motion (the 2.5D/multiplane technique). These primitives give
 * the coder exactly that, deterministically:
 *
 *   <Scene brand src={backdropUrl} camera="push" strength={0.6}>   // the world + the camera
 *     <SceneLayer depth={1}> …far elements… </SceneLayer>          // full camera travel
 *     <SceneReveal at={ph.build} dur={20} origin={{x:0.6,y:0.4}}>  // meaning-motion: OUR mask, never generative
 *       …the tinted/highlight layer this moment REVEALS…
 *     </SceneReveal>
 *     <SceneGrade edge="bottom" />                                  // brand-shade gradient under type — the pro
 *     <SceneLayer depth={0.9}> …type/marks… </SceneLayer>           // alternative to a card
 *   </Scene>
 *
 * DIVISION OF LABOUR (proven live): generated imagery supplies the backdrop's material richness; Veo may supply
 * ambient WORLD motion later; but meaning-bearing motion (a region spreads, a line lands) is ALWAYS these
 * deterministic masks — generative video drifts content mid-shot (fabrication-by-drift, observed).
 *
 * Windowed vs full-frame is pure composition: Scene fills its parent — inside a <Region> it is a windowed scene
 * over footage; directly under <Stage> it is a full-frame world (which lands as an opaque video-track asset —
 * output-mode wiring is Phase 4b-3, not this file's concern).
 *
 * Deterministic by construction: every value derives from useCurrentFrame/useVideoConfig + brand tokens. Camera
 * magnitudes: slow-push practice is a 4-8% scale over a shot; lateral drift ≤4% — scaled by brand.motion.energy
 * and the strength knob (⚠ craft-tuned — calibrate on real renders). Overscan is DERIVED from the camera's own
 * maximum travel so motion can never reveal a backdrop edge.
 */

import React, { createContext, useContext } from 'react';
import { Easing, Img, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

import { withAlpha, shade, type Brand } from './brand';
import { EASE } from './choreo';

/** Gentle symmetric in-out for the camera — a documentary push accelerates and settles softly; the kit's EASE
 *  (a strong out-ease) is right for REVEALS but would front-load a camera move. */
const CAM_EASE = Easing.bezier(0.4, 0, 0.6, 1);

export type SceneCameraMove = 'push' | 'pull' | 'drift-l' | 'drift-r' | 'none';

/** The computed camera at the current frame — consumed by SceneLayer via context (multiplane parallax). */
interface SceneCameraState {
  scale: number; // 1 = rest
  xPct: number; // lateral travel, % of frame width
  yPct: number;
}

const SceneContext = createContext<SceneCameraState | null>(null);

// Camera magnitude ceilings (fractions of the frame) — slow cinematic practice, scaled by energy × strength.
const PUSH_MAX_SCALE = 0.08; // ≤8% scale over the clip ⚠ craft-tuned
const DRIFT_MAX_FRAC = 0.04; // ≤4% lateral travel ⚠ craft-tuned

function cameraAt(frame: number, durationInFrames: number, brand: Brand, move: SceneCameraMove, strength: number): SceneCameraState {
  if (move === 'none' || durationInFrames <= 1) return { scale: 1, xPct: 0, yPct: 0 };
  const p = CAM_EASE(Math.min(1, Math.max(0, frame / (durationInFrames - 1))));
  const drive = Math.min(1, Math.max(0, strength)) * (0.55 + 0.45 * brand.motion.energy);
  const scaleSpan = PUSH_MAX_SCALE * drive;
  const driftSpan = DRIFT_MAX_FRAC * drive * 100;
  switch (move) {
    case 'push': return { scale: 1 + scaleSpan * p, xPct: 0, yPct: 0 };
    case 'pull': return { scale: 1 + scaleSpan * (1 - p), xPct: 0, yPct: 0 };
    case 'drift-l': return { scale: 1 + scaleSpan * 0.4 * p, xPct: -driftSpan * p, yPct: 0 };
    case 'drift-r': return { scale: 1 + scaleSpan * 0.4 * p, xPct: driftSpan * p, yPct: 0 };
    default: return { scale: 1, xPct: 0, yPct: 0 };
  }
}

/** The maximum travel the camera will ever apply — the backdrop overscan needed so edges never show. */
function overscanFor(brand: Brand, move: SceneCameraMove, strength: number): number {
  if (move === 'none') return 1;
  const drive = Math.min(1, Math.max(0, strength)) * (0.55 + 0.45 * brand.motion.energy);
  return 1 + PUSH_MAX_SCALE * drive + DRIFT_MAX_FRAC * drive * 2;
}

export interface SceneProps {
  brand: Brand;
  /** The generated illustrated backdrop: an asset NAME from the render workspace (e.g. 'backdrop.jpg' /
   *  'backdrop.mp4' — resolved through staticFile), or a full data:/https: URL. A video backdrop (.mp4/.webm/
   *  .mov) renders as a muted looping OffthreadVideo — the Omni image→motion clip: ambient WORLD motion under
   *  OUR camera; meaning-motion stays deterministic (SceneReveal). Omit for a scene built purely from layers. */
  src?: string;
  camera?: SceneCameraMove;
  /** 0..1 — how far toward the camera ceilings this scene travels. */
  strength?: number;
  children?: React.ReactNode;
}

const isVideoSrc = (src: string): boolean => /\.(mp4|webm|mov)(\?.*)?$/i.test(src);
/** Asset NAMES resolve through staticFile (the workspace public dir); full URLs pass through unchanged. */
const resolveSrc = (src: string): string => (/^(data:|https?:|blob:)/.test(src) ? src : staticFile(src));

/**
 * The illustrated world. Renders the backdrop (auto-overscanned) under its children, all inside ONE computed
 * camera. Children read the camera via <SceneLayer depth>; the backdrop rides at depth 1. A video backdrop
 * loops muted (its clock is ambient — the moment's duration and every meaning-beat stay on OUR frames).
 */
export const Scene: React.FC<SceneProps> = ({ brand, src, camera = 'push', strength = 0.5, children }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const cam = cameraAt(frame, durationInFrames, brand, camera, strength);
  const overscan = overscanFor(brand, camera, strength);
  const fill: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' };
  return (
    <SceneContext.Provider value={cam}>
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        {src ? (
          <div style={{ position: 'absolute', inset: 0, transform: `scale(${cam.scale * overscan}) translate(${cam.xPct}%, ${cam.yPct}%)` }}>
            {isVideoSrc(src)
              // No `loop` — OffthreadVideo (this Remotion version) has no loop prop; a clip shorter than the
              // moment holds its last frame (ambient world settles — acceptable; real looping needs the clip's
              // measured duration and lands with the seam's asset metadata).
              ? <OffthreadVideo src={resolveSrc(src)} muted style={fill} />
              : <Img src={resolveSrc(src)} style={fill} />}
          </div>
        ) : null}
        {children}
      </div>
    </SceneContext.Provider>
  );
};

export interface SceneLayerProps {
  /** 1 = full camera travel (far world), 0 = screen-locked; between = multiplane parallax. Type sits ~0.85-0.95
   *  so it subtly belongs to the world without smearing readability. */
  depth?: number;
  children?: React.ReactNode;
}

/** A depth-multiplied layer inside the Scene's camera — the 2.5D parallax mechanism. */
export const SceneLayer: React.FC<SceneLayerProps> = ({ depth = 1, children }) => {
  const cam = useContext(SceneContext);
  const d = Math.min(1, Math.max(0, depth));
  const scale = cam ? 1 + (cam.scale - 1) * d : 1;
  const x = cam ? cam.xPct * d : 0;
  const y = cam ? cam.yPct * d : 0;
  return (
    <div style={{ position: 'absolute', inset: 0, transform: `scale(${scale}) translate(${x}%, ${y}%)` }}>
      {children}
    </div>
  );
};

export interface SceneRevealProps {
  /** Frame the reveal starts (anchor to phases — never hand-typed windows). */
  at: number;
  /** Reveal duration in frames. */
  dur?: number;
  /** Where the reveal grows FROM, as fractions of the scene. */
  origin?: { x: number; y: number };
  children?: React.ReactNode;
}

/**
 * MEANING-BEARING reveal: unmasks its children radially from an origin — "the region spreads", "the highlight
 * lands" — under OUR clock, beat-syncable, honest. (Generative video must never do this: content drifts.)
 * Radius runs 0→150% (150 ≥ √2·100: covers every corner from any origin).
 */
export const SceneReveal: React.FC<SceneRevealProps> = ({ at, dur = 24, origin = { x: 0.5, y: 0.5 }, children }) => {
  const frame = useCurrentFrame();
  const p = EASE(Math.min(1, Math.max(0, (frame - at) / Math.max(1, dur))));
  const r = 150 * p;
  return (
    <div style={{ position: 'absolute', inset: 0, clipPath: `circle(${r}% at ${origin.x * 100}% ${origin.y * 100}%)` }}>
      {children}
    </div>
  );
};

export interface SceneGradeProps {
  brand: Brand;
  /** Which edge darkens (where the type will sit). */
  edge?: 'bottom' | 'top' | 'left' | 'right';
  /** 0..1 opacity of the grade at its deep end. */
  strength?: number;
}

const GRADE_DIR: Record<NonNullable<SceneGradeProps['edge']>, string> = {
  bottom: 'to top', top: 'to bottom', left: 'to right', right: 'to left',
};

/**
 * The professional alternative to a card: a soft brand-shade gradient toward one edge so type reads over the
 * scene without a container. (Every documentary title you have ever read sat on one of these.)
 */
export const SceneGrade: React.FC<SceneGradeProps> = ({ brand, edge = 'bottom', strength = 0.55 }) => {
  const deep = withAlpha(shade(brand.colors.bg, 0.5), Math.min(1, Math.max(0, strength)));
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: `linear-gradient(${GRADE_DIR[edge]}, ${deep} 0%, transparent 55%)`,
      }}
    />
  );
};
