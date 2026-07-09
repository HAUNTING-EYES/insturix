import type {Brand} from './brand';
import {INSTURIX} from './brand';
import type {HeroProps} from './BrandRevealScene';
import type {CursorProps} from './CursorWalkthrough';
import type {SplitProps} from './SplitCompare';
import type {LogoProps} from './LogoOutro';

// THE CONTRACT. This is exactly what a GLM "director" emits (DATA, not code): pick a brand, then an ordered
// list of scenes — each a form + duration + copy. The film assembler turns it into a rendered video using
// the deterministic brick forms. Swapping the hand-written plan below for a GLM call is a one-function change.
// `vo` = the narration line for the scene (complements the on-screen copy, per the redundancy law). It is
// metadata for the voiceover builder; the visual forms ignore it.
export type SceneSpec =
  | {form: 'hero'; durationInFrames: number; vo?: string; props?: HeroProps}
  | {form: 'cursor'; durationInFrames: number; vo?: string; props?: CursorProps}
  | {form: 'split'; durationInFrames: number; vo?: string; props?: SplitProps}
  | {form: 'logo'; durationInFrames: number; vo?: string; props?: LogoProps};

export type SceneGraph = {
  brand: Brand;
  transitionFrames: number; // crossfade overlap between scenes
  scenes: SceneSpec[];
};

export const filmDuration = (g: SceneGraph): number =>
  g.scenes.reduce((sum, s) => sum + s.durationInFrames, 0) - g.transitionFrames * Math.max(0, g.scenes.length - 1);

// A sample plan — the shape a GLM director would return for "Insturix, 60fps hero explainer".
export const INSTURIX_PLAN: SceneGraph = {
  brand: INSTURIX,
  transitionFrames: 16,
  scenes: [
    {form: 'hero', durationInFrames: 120, props: {eyebrow: 'Meet Insturix', headline: 'Your whole workflow, in one place.', accentWord: 'place.', statValue: 92, statSuffix: '%', statLabel: 'less busywork', navActive: 1}},
    {form: 'cursor', durationInFrames: 120, props: {caption: 'One click —', captionAccent: 'straight to the insight.', navActive: 2}},
    {form: 'split', durationInFrames: 120, props: {eyebrow: 'The shift', headline: 'From busywork to done.', accentWord: 'done.', afterLabel: 'With Insturix'}},
    {form: 'logo', durationInFrames: 96, props: {headline: 'Your vision. Not a version.', cta: 'insturix.com'}},
  ],
};
