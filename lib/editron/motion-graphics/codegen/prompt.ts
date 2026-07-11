/**
 * MG Codegen — prompt scaffolding (E0 Phase B). The pieces the codegen service (Phase C) assembles
 * into the model prompt: the primitive API the model may use, the hard rules the scan enforces, the
 * E0 composition guidance (numeric/data license + signatures as PRIORS, never a required menu — Rule 11),
 * and the vision-judge prompt.
 *
 * Adapted from the render-proven explainer grammar (grammar-v2.mjs) to the Editron kit + E0 scope:
 *  - only the ported primitives (Stage/Region/Corner/Bleed, FitHeadline/TextBlock/Chip, choreo) — NO
 *    product-screenshot composers/ProductShot/VideoShot (E0 = vector, no external assets);
 *  - transparent over footage (Stage backdrop={false}); the graphic is COMPOSED fresh per moment.
 *
 * ★ NOT deployed here. Phase C wires + TUNES this via the eval harness before any real use (Rule 35).
 */

/** The primitive API — every symbol the model may use, imported ONLY from the kit (the scan enforces this). */
export const PRIMITIVE_API = `<primitive_api>
type Brand = { colors:{bg,surface,surfaceAlt,text,muted,border,accent,accentText}, fontSans, type:{headingWeight,tracking,lineHeight,eyebrowCase}, shape:{radius,border}, density, decor:{grid,glow}, motion:{energy,overshoot} }
withAlpha(brand.colors.X, 0..1) — the ONLY way to make a translucent brand colour.  dv(brand, airy, dense) — density-scaled number.

LAYOUT (positions are FRACTIONS of the title-safe region; px positioning is forbidden):
<Stage brand>...</Stage>                        // REQUIRED scene root. backdrop is FALSE (renders over footage) — never set backdrop={true}.
<Region brand x y w h? align? justify? gapScale?>...  // rect in SAFE-area fractions. x,y = TOP-LEFT (not centre). To fill horizontally use a wide region from the left (x=0.08 w=0.84); align/justify centre children WITHIN it.
<Corner brand at="tl|tr|bl|br">...              // chip anchor
<Bleed>...</Bleed>                              // full-frame layer for IMAGERY/SHAPES only — text is rejected inside

TEXT (the only way words render — size & colour COMPUTED, never passed):
<FitHeadline brand text accentWords={["word"]} size="display|xl|l|m|s" kinetic="rise|chars|none" startAt align/>
<TextBlock brand text tone="text|muted|accent" size="m|s" startAt align/>
<Chip brand text tone="ghost|accent" startAt/>

CHOREOGRAPHY (numbers are DERIVED — anchor to phases, never hand-type frame windows):
const ph = phases(durationInFrames, brand)      // {intro, build, resolve, durF}
enter(brand, frame, at, fps, "rise|scale|fade|blurIn|sweepL|sweepR", unit?) -> style
exitOut(frame, ph, "fade|rise") -> style        stagger(brand, i)   pulseAt(frame, at, strength)
countUp(frame, at, dur, to, from?)              progress(frame, from, to)   travel(frame, ph, px)   EASE
useRegionSize() -> {wPx,hPx}   useStage() -> {W,H,...}

NON-TEXT GRAPHICS (charts, arcs, bars, marks, particles, grids): compose them yourself with SVG / divs inside a
<Region>/<Bleed>, COLOURED ONLY with brand.colors.* / withAlpha, ANIMATED ONLY from the frame (countUp/progress/
interpolate). There is no chart/particle primitive — you draw it. This is the point: any graphic, composed fresh.
</primitive_api>`;

/**
 * The canonical import block. The MODEL never writes imports (it omits or mangles them ~half the time — the
 * eval proved it); the service PREPENDS this deterministically so every component compiles (Law 5: imports are
 * invariant, only the body varies). Every path is react/remotion/the kit, so the scan's import whitelist passes.
 * NOTE for the Phase-D compile/render step: bundle via esbuild (Remotion's bundler), which tolerates the unused
 * imports a given component won't reference — do NOT type-check these components with `noUnusedLocals`.
 */
export const KIT_IMPORT_PREAMBLE = `import React from 'react';
import {useCurrentFrame, useVideoConfig, interpolate, spring, AbsoluteFill, Sequence} from 'remotion';
import {Brand, withAlpha, dv} from './kit/brand';
import {Stage, Region, Corner, Bleed, useStage, useRegionSize} from './kit/stage';
import {FitHeadline, TextBlock, Chip} from './kit/fit-text';
import {phases, enter, exitOut, stagger, pulseAt, countUp, progress, travel, EASE} from './kit/choreo';`;

/** The hard rules — the scan enforces these; the model must obey them exactly. `durF` = the clip's frame count. */
export const hardRules = (durF: number): string => `<hard_rules>
- Export EXACTLY: export const MgScene: React.FC<{brand: Brand; data: MgData}> = ({brand, data}) => { ... }
  where MgData = { value?: number; suffix?: string; label?: string; comparison?: {label:string;value:number}[]; phrase?: string; accentWord?: string }.
  ★ The numbers/words come from \`data\` (PROPS): read data.value / data.label / data.phrase / etc. NEVER bake a
  literal number or word into the JSX — an edit ("42"->"48") must re-render from the SAME code with a new prop,
  never re-generate (Law 5). Guard optional fields (data.value ?? 0). Define \`type MgData = {...}\` inline (do NOT import it).
- Do NOT write ANY import statements. React, the Remotion hooks/components (useCurrentFrame, useVideoConfig,
  interpolate, spring, AbsoluteFill, Sequence), and EVERY kit primitive listed in <primitive_api> are ALREADY
  IN SCOPE — the harness injects the imports. Begin your output directly at \`type MgData = {...}\`.
- Scene root MUST be <Stage brand={brand}> (backdrop stays FALSE — over footage). All words via FitHeadline/
  TextBlock/Chip inside a <Region>/<Corner> — NEVER a raw text node in a styled div, NEVER a fontSize you type.
- COLOUR: only brand.colors.* / withAlpha(brand.colors.*, a) / 'transparent'. Any hex, rgb()/hsl(), or named
  CSS colour is an automatic rejection.
- DETERMINISTIC: animate ONLY from useCurrentFrame()/useVideoConfig(). NEVER Math.random, Date, timers, fetch,
  window, document, eval, require, dynamic import, process. Math.sin/cos of the frame is encouraged.
- CHOREOGRAPHY IS COMPUTED: const {durationInFrames, fps} = useVideoConfig(); const ph = phases(durationInFrames, brand);
  anchor every entrance/exit/beat to ph.* (+ stagger). No hand-typed frame windows like [14, 38]. This clip is
  ~${durF} frames — but READ the length from useVideoConfig() (a duration edit must NOT need a re-generate).
  Motion on every frame; end settled via exitOut.
- Every interpolate(): {extrapolateLeft:'clamp', extrapolateRight:'clamp'}. spring() takes fps from useVideoConfig().
- ONE focal point at a time. Restraint = FEWER, LARGER, better-placed elements. Fill the frame; no dead quadrant.
</hard_rules>`;

/**
 * E0 composition guidance. The moment is LICENSED by an explicit number/stat/comparison (E0 scope). Visualize
 * the DATA honestly. The signatures below are PRIORS you may lean on — NOT a menu you must pick from, and NOT
 * templates. Compose the graphic that best serves THIS number. (Rule 11: a system, not a component catalog.)
 */
export const E0_COMPOSITION_GUIDE = `<composition>
This moment carries a real number/statistic/comparison the speaker states. Build a graphic that makes that data
LAND — animated, on-brand, over the footage. Perceptual honesty: a value counts UP to its true figure; a sweep
arc/ring is used ONLY for a true percentage; a comparison shows the real ratio, never an exaggerated one.
Signatures you may lean on (compose freely, never force one):
- a single metric owning the void: a giant count-up + a small context line, deliberate negative space.
- kinetic type: the figure/phrase fills the frame, per-char/word reveal, one accent word.
- a comparison: two quantities as bars/rings whose sizes are the true ratio, the winner accented.
- a progress/ring: a value filling to its true fraction on its anchor.
Draw bars/arcs/rings yourself in SVG coloured with brand tokens. NO keyword-highlighting, NO lower-third
templates — a bespoke composition every time.
</composition>`;

/** Vision-judge prompt: the transparent graphic is composited on a dark checker + a real footage frame, so the
 *  judge rates LEGIBILITY OVER REAL CONTENT + brand craft — not a graphic floating in a void. */
export const JUDGE_PROMPT = `You are a ruthless senior motion/brand designer reviewing 2 frames of ONE motion-graphic composited OVER a real video frame (the transparent MG on top of the footage). Judge the ADDED graphic only — its brand fidelity, composition, motion, and legibility over real content.
AUTOMATIC <=4: any colour that is not a brand token (red/green/blue/neon where the brand's accent should be); clipped/overflowing/broken text; a keyword-highlight or lower-third-template look instead of a bespoke composition; a graphic that does not read over the footage (no scrim/shadow/plate where it needs one).
PENALIZE: more than one focal point; timid/small type that fails to command the frame; a dead frame (nothing moving); a number shown statically instead of animating; muddy gradients / AI-slop.
REWARD: the data landing (a clean count-up / honest comparison); type that owns the frame; exactly one accent; deliberate negative space; clean legibility over the footage.
Return ONLY JSON: {"score": <1-10>, "issues": ["specific fixable problem naming the element", ...]}. 8+ = genuinely premium.`;
