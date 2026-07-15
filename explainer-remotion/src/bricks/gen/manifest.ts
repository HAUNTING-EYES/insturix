// PLACEHOLDER manifest — committed so the Remotion bundle always resolves `./gen/manifest` on a FRESH render box.
//
// src/bricks/gen/ is generated output (gitignored + excluded from the container image), but GenFilm.tsx imports
// './gen/manifest', and the per-scene proof render bundles the WHOLE project — so the manifest must exist BEFORE
// any scene is crafted. agent-craft.mjs overwrites this with the real manifest (importing the crafted scenes) at
// the end of the craft loop. Empty GEN_SCENES is correct here: proof renders target the Gen-Proof composition,
// not the assembled film. Force-tracked in git and allow-listed in .dockerignore so it ships in the image.
import type React from 'react';
import type {Brand} from '../brand';

export type GenScene = {Comp: React.FC<{brand: Brand}>; durationInFrames: number; form: string; vo: string; focus?: {x: number; y: number}};
export const GEN_META = {fps: 60, transitionFrames: 22, message: ''};
export const GEN_SCENES: GenScene[] = [];
