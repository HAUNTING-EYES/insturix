/**
 * MG Font Loading — Phase 0.1 (the #1 render blocker)
 *
 * THE PROBLEM (grep-verified 2026-05-31): the motion-graphics render path loaded ZERO fonts.
 * Token families like 'Plus Jakarta Sans' / 'JetBrains Mono' flow all the way to the CSS
 * `fontFamily` (composition-planner → primitive-renderers) AND to the canvas `measureText`
 * fit calculation (composition-renderer.tsx:297-304), but the font files were never fetched —
 * so Chromium fell back to its default sans-serif. Every type/brand judgement (G-1/G-2 and all
 * of Phase B onward) was therefore measuring the wrong pixels, and G-1b's exact glyph measurement
 * silently measured the fallback font.
 *
 * THE FIX: load the MG default font families at MODULE-EVAL time, exactly like the sibling
 * text overlay does (components/.../overlays/text/text-layer-content.tsx:4-40). `loadFont()`
 * from @remotion/google-fonts registers a `delayRender` per weight at import time and
 * `continueRender`s when the FontFace is ready (node_modules/@remotion/google-fonts: base.ts).
 * Because the registration happens during module evaluation — before the first frame renders —
 * the fonts are guaranteed ready before any layout/measurement runs. This is what makes the
 * static top-level pattern strictly safer than an async/useEffect loader: no first-render-measures-
 * the-fallback race, no blank-render risk.
 *
 * In Node (pipeline time, no `FontFace`) `loadFont` is a no-op (base.ts:35 `if (typeof FontFace
 * === "undefined") continue;`), so importing this module server-side is harmless.
 *
 * LAMBDA-SAFE: every font specifies explicit `weights` + `subsets`, so the loader makes a bounded
 * number of network requests (12 total, < the 20-request warning threshold in base.ts:95). The
 * same @remotion/google-fonts mechanism already runs on this project's Lambda renderer for the
 * text overlay, so the network/cold-start path is proven.
 *
 * SCOPE: this loads the families the resolver emits TODAY (motion-theme-resolver.ts DEFAULT_BRAND:
 * Plus Jakarta Sans + JetBrains Mono; Inter is the data-viz / hard fallback). Brand-supplied and
 * material-library fonts are NOT wired into the MG tokens yet — that is Phase B's job (it owns
 * font SELECTION from the tagged material library), and it will extend this module to dynamically
 * load the selected family via @remotion/google-fonts `getAvailableFonts()`. Until then, no other
 * family reaches the render, so a hardcoded default set is complete for the current pipeline.
 *
 * Keep the family names here in sync with motion-theme-resolver.ts DEFAULT_BRAND.
 */

import { loadFont as loadPlusJakartaSans } from '@remotion/google-fonts/PlusJakartaSans';
import { loadFont as loadJetBrainsMono } from '@remotion/google-fonts/JetBrainsMono';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';

// Heading + body family (DEFAULT_BRAND.headingFont / bodyFont). Weights span the resolver's
// headingWeight range (lerp 800↔400 − warmth, clamp 300-900 → realistically 350-800) and
// bodyWeight (clamp 300-600); recipes also hardcode 800 (structural-moves.ts:135).
// Available weights for Plus Jakarta Sans: 200-800 (verified) — 900 would throw, so it is excluded.
const { fontFamily: plusJakartaSans } = loadPlusJakartaSans('normal', {
  weights: ['300', '400', '500', '600', '700', '800'],
  subsets: ['latin'],
});

// Mono family (DEFAULT_BRAND.monoFont; StatCounter digits use headingWeight). Available 100-800.
const { fontFamily: jetBrainsMono } = loadJetBrainsMono('normal', {
  weights: ['400', '700', '800'],
  subsets: ['latin'],
});

// Data-viz labels (weight 700, data-viz-renderers.tsx:174) + general/data-viz fallback ('Inter').
const { fontFamily: inter } = loadInter('normal', {
  weights: ['400', '600', '700'],
  subsets: ['latin'],
});

/**
 * The resolved family names for the loaded MG default fonts. The render reads font families
 * from the resolved tokens (which carry the same names), so this map is exported mainly so the
 * side-effecting load above is retained by the bundler and is available as an explicit fallback.
 */
export const MG_DEFAULT_FONTS = {
  sans: plusJakartaSans,
  mono: jetBrainsMono,
  inter,
} as const;

/** True once the module has evaluated (i.e. the MG default fonts have been requested). */
export const MG_FONTS_LOADED = true;
