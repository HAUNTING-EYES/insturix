/**
 * MG Codegen kit — font loading (Wave-0 foundation, 2026-07-16). THE FIX for the "thin timid type" the vision
 * eval showed: the codegen render bundle loaded ZERO fonts, so Chromium fell back to its default sans.
 *
 * Mirrors the engine's `motion-graphics/mg-fonts.ts`: `loadFont()` from @remotion/google-fonts registers a
 * `delayRender` per weight at MODULE-EVAL time, so every face is guaranteed ready before the first frame renders
 * (no first-render-measures-the-fallback race, no blank-render risk — strictly safer than an async loader). In
 * Node (pipeline time, no `FontFace`) `loadFont` is a no-op, so importing this server-side is harmless.
 *
 * This module is COPIED into the isolated render workspace (frame-renderer KIT_FILES) and imported by the
 * scaffolded Root, so it evaluates INSIDE the render bundle. `@remotion/google-fonts/*` resolves via node_modules
 * walk-up from the workspace (the same package the engine render already uses on Lambda).
 *
 * LOADS:
 *  - the brand DEFAULT sans (Plus Jakarta Sans) + mono (JetBrains Mono) + neutral fallback (Inter) — so on-brand
 *    type replaces the fallback AND fit-text's advance metrics (avgAdvance, "Plus Jakarta-ish") finally match;
 *  - two IMPACT faces for headline/kinetic type toward the Hormozi bar: Anton (single-weight 400 ultra-heavy
 *    CONDENSED display — the classic bold-caps look) and Montserrat (700/800/900 heavy sans).
 * 16 total weight requests < the 20-request warning threshold. Exposing the impact faces to the MODEL (a
 * `fontDisplay` brand token + a FitHeadline face option) is Phase 2; dynamic brand/client-font loading is the
 * follow-up. This default+impact set covers the default brand today.
 */

import { loadFont as loadPlusJakartaSans } from '@remotion/google-fonts/PlusJakartaSans';
import { loadFont as loadJetBrainsMono } from '@remotion/google-fonts/JetBrainsMono';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadAnton } from '@remotion/google-fonts/Anton';
import { loadFont as loadMontserrat } from '@remotion/google-fonts/Montserrat';

const { fontFamily: sans } = loadPlusJakartaSans('normal', {
  // 200..800 = Plus Jakarta's full range → the type-weight axis (FitHeadline weight) spans ExtraLight→ExtraBold.
  weights: ['200', '300', '400', '500', '600', '700', '800'],
  subsets: ['latin'],
});
const { fontFamily: mono } = loadJetBrainsMono('normal', {
  weights: ['400', '700', '800'],
  subsets: ['latin'],
});
const { fontFamily: inter } = loadInter('normal', {
  weights: ['400', '600', '700'],
  subsets: ['latin'],
});
// Anton ships a single ultra-heavy CONDENSED weight (400) — the classic bold-caps display face.
const { fontFamily: displayCondensed } = loadAnton('normal', {
  weights: ['400'],
  subsets: ['latin'],
});
// Montserrat heavy weights for non-condensed impact headlines.
const { fontFamily: displayHeavy } = loadMontserrat('normal', {
  weights: ['700', '800', '900'],
  subsets: ['latin'],
});

/**
 * Resolved family names for the loaded codegen fonts. Exported so the kit's Brand can reference the real names
 * (so `measureText`/`avgAdvance` match the rendered face) and so the side-effecting loads above are retained by
 * the bundler.
 */
export const KIT_FONTS = {
  sans,
  mono,
  inter,
  displayCondensed,
  displayHeavy,
} as const;

/** True once this module has evaluated (i.e. the codegen fonts have been requested). */
export const KIT_FONTS_LOADED = true;
