/**
 * MG Codegen — prompt scaffolding. The pieces the codegen service assembles into the model prompt:
 * the primitive API the model may use, the foundational MG knowledge (what MGs ARE + purpose + craft +
 * range as PRIORS, ground-up — Rule 11), the grounding rule (compose ONLY from the licensed fact; decline
 * rather than fabricate), the hard rules the scan enforces, the composition guidance, and the vision judge.
 *
 * ★ Redesigned (2026-07-12) from the numeric-only E0 scope to type-free composition from a licensed fact +
 * context. The component declares its OWN `Data` type (no fixed MgData). Authored ground-up: the creative
 * knowledge graph is an editing engine, not MG-composition knowledge (verified) — its only "graphics" are the
 * Tier-1 templates Rule 11 exists to kill, so it is NOT used here.
 *
 * ★ NOT deployed here. The service wires + TUNES this via the eval harness before any real use (Rule 35).
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
 * NOTE for the compile/render step: bundle via esbuild (Remotion's bundler), which tolerates the unused imports
 * a given component won't reference — do NOT type-check these components with `noUnusedLocals`.
 */
export const KIT_IMPORT_PREAMBLE = `import React from 'react';
import {useCurrentFrame, useVideoConfig, interpolate, spring, AbsoluteFill, Sequence} from 'remotion';
import {Brand, withAlpha, dv} from './kit/brand';
import {Stage, Region, Corner, Bleed, useStage, useRegionSize} from './kit/stage';
import {FitHeadline, TextBlock, Chip} from './kit/fit-text';
import {phases, enter, exitOut, stagger, pulseAt, countUp, progress, travel, EASE} from './kit/choreo';`;

/**
 * Foundational MG knowledge (Layer 1) — STABLE across every moment, so the service caches it (prompt-cache
 * prefix). This is what a motion graphic IS, the purposes it serves, the craft that separates it from slop,
 * and the RANGE it can span — expressed as PRIORS the model composes from, never a menu it picks from (Rule 11).
 * Authored ground-up (the creative graph is not MG-composition knowledge).
 */
export const FOUNDATIONAL_MG_KNOWLEDGE = `<what_motion_graphics_are>
A motion graphic here is a TRANSPARENT, animated visual composed fresh for ONE moment — it sits over the footage
and makes a real thing the speaker said LAND. It is never a template, a lower-third, or a stat-counter from a
catalog. It is composed from the fact, the brand, and the moment.

PURPOSES it can serve (functions, NOT types — a moment may need one, several, or none):
- make a real quantity FELT (a figure grows, a proportion fills, a magnitude dwarfs);
- clarify a real relationship (a true before/after, a comparison at its real ratio, a refutation striking a false claim);
- land a key phrase or term (the words own the frame, one accent);
- reveal structure (a concept shown through spatial arrangement, a short ordered list);
- create emphasis and rhythm, timed to the speech.

CRAFT — what separates a crafted graphic from AI-slop:
- ONE focal point. Restraint = fewer, larger, better-placed elements; deliberate negative space; no dead quadrant.
- PERCEPTUAL HONESTY. The visual encodes the TRUE quantity — a value counts to its real figure, a proportion
  fills to its real fraction, a comparison shows the real ratio. Never exaggerate for drama.
- MOTION WITH INTENT. Every animation carries meaning (a reveal, a build, a landing), never decoration; it moves
  on every frame and ends settled.
- COMMAND. The key figure or word is large and confident. Timid type is slop.
- BRAND by construction — colour and type come only from the brand tokens.
- IT READS OVER FOOTAGE — placed where the frame has room, with a scrim/plate only where legibility needs it.

RANGE (priors, NOT a menu — never "pick one"): great graphics span a wide space — a single metric owning the
void; kinetic type where a phrase fills the frame with one accent word; two quantities as bars or rings at their
true ratio, the winner accented; a value filling a ring to its true fraction on its beat; a term revealed with
its context through spatial relationship; a false claim struck as the truth lands. Let the fact and the moment
suggest the form; compose it freshly. Two moments with the same KIND of fact should NOT look identical — the
brand, the intent, the screen, and the expressiveness make each its own.

AVOID (slop): keyword-highlighting; lower-third / name-tag templates; a number shown statically; decoration that
carries no meaning; muddy gradients; more than one focal point; a graphic that floats ignoring the footage beneath.
</what_motion_graphics_are>`;

/**
 * The grounding rule (Layer 1, cached) — the honesty gate. The model composes ONLY from the licensed fact and
 * never invents a value; qualitative facts get qualitative treatment; and it may DECLINE rather than fabricate
 * or force a broken graphic. Enforced again downstream by the judge (fabrication = auto-reject).
 */
export const GROUNDING_RULE = `<grounding>
You are given ONE licensed fact the speaker actually said, with its data. Compose a graphic that visualizes THAT
fact — and ONLY that fact.
- Visualize ONLY the values and words present in the fact's data. NEVER invent, extrapolate, or round a number,
  statistic, comparison, or claim that is not in the data. A fabricated quantity on someone's video is a lie.
- The numbers and words reach your component as \`data\` PROPS. Read them from \`data\` (e.g. data.value) — NEVER
  bake a literal fact value or word into the JSX. This keeps an edit ("20"->"18") a re-render, not a
  re-generation (Law 5), and makes fabrication impossible: you lay values out, you never write them.
- If the fact is qualitative (a concept, a term, a refutation with no number), visualize it qualitatively —
  kinetic type, emphasis, spatial relationship — NEVER as a fabricated quantity.
- If you cannot construct a faithful, honest visual for this fact, DECLINE: output exactly
  \`DECLINE: <one short reason>\` and nothing else. A missing graphic is correct; a dishonest or broken one is not.
</grounding>`;

/** The hard rules — the scan enforces these; the model must obey them exactly. `durF` = the clip's frame count. */
export const hardRules = (durF: number): string => `<hard_rules>
- Export EXACTLY: export const MgScene: React.FC<{brand: Brand; data: Data}> = ({brand, data}) => { ... }
  Declare \`type Data = {...}\` INLINE for exactly the values this fact needs (the data props listed in <moment>).
  Read every number/word from \`data\` (guard optionals: data.value ?? 0). NEVER bake a literal fact value into
  the JSX (Law 5 + grounding). Do NOT import Data.
- Do NOT write ANY import statements. React, the Remotion hooks/components (useCurrentFrame, useVideoConfig,
  interpolate, spring, AbsoluteFill, Sequence), and EVERY kit primitive in <primitive_api> are ALREADY IN SCOPE —
  the harness injects imports. Begin your output directly at \`type Data = {...}\` (or at \`DECLINE:\`).
- Scene root MUST be <Stage brand={brand}> (backdrop stays FALSE — over footage). All words via FitHeadline/
  TextBlock/Chip inside a <Region>/<Corner> — NEVER a raw text node in a styled div, NEVER a fontSize you type.
- COLOUR: only brand.colors.* / withAlpha(brand.colors.*, a) / 'transparent'. Any hex, rgb()/hsl(), or named CSS
  colour is an automatic rejection.
- FOOTAGE CONTRAST: critical text and marks must remain readable as the footage luminance changes. Use the least
  intrusive LOCAL brand-token protection needed (halo, outline, compact scrim, or bounded plate). Never solve this
  with an opaque or near-opaque full-frame field, and never turn the composition into a generic card.
- DETERMINISTIC: animate ONLY from useCurrentFrame()/useVideoConfig(). NEVER Math.random, Date, timers, fetch,
  window, document, eval, require, dynamic import, process. Math.sin/cos of the frame is encouraged.
- CHOREOGRAPHY IS COMPUTED: const {durationInFrames, fps} = useVideoConfig(); const ph = phases(durationInFrames, brand);
  anchor every entrance/exit/beat to ph.* (+ stagger). No hand-typed frame windows like [14, 38]. This clip is
  ~${durF} frames — but READ the length from useVideoConfig(). Motion on every frame; end settled via exitOut.
- Every interpolate(): {extrapolateLeft:'clamp', extrapolateRight:'clamp'}. spring() takes fps from useVideoConfig().
- Compose within the placement region given in <moment>; keep the AVOID regions clear (the subject/text are there).
  ONE focal point. Fill the region; no dead quadrant.
</hard_rules>`;

/**
 * Composition guidance — type-free. Compose from the licensed fact + purpose + context. The fact's KIND tells
 * the model what is TRUE, not which template to use. Directions, never a menu (Rule 11).
 */
export const COMPOSITION_GUIDE = `<composition>
This moment carries the licensed fact in <moment> — its kind, its data, its context. Compose a bespoke
transparent graphic that makes THAT fact land, at the expressiveness the moment asks for, placed where the frame
has room, in the brand's voice. The fact's KIND tells you what is TRUE — not which template to use. A true
proportion invites a value filling to its real fraction; a comparison invites two quantities at their real ratio;
a magnitude invites a figure that dwarfs; a concept or term invites a spatial reveal or kinetic type; a refutation
invites the false claim struck as the truth lands. These are directions, not a menu — compose freshly for THIS
fact, THIS brand, THIS moment. Draw any bars/arcs/rings/marks yourself in SVG with brand tokens. No templates, no
keyword-highlighting, no lower-thirds — a fresh composition every time.
</composition>`;

/** Vision-judge prompt: the transparent graphic is composited on a real footage frame; the judge rates brand
 *  craft, legibility over content, AND faithfulness to the licensed fact (fabrication is an automatic reject). */
export const JUDGE_PROMPT = `You are the final ruthless motion-graphics craft and faithfulness judge.
The image is a 3-column by 3-row contact sheet of ONE transparent animation. Judge the ADDED graphic only: brand fidelity, composition, visible motion development, mobile legibility, clipping, contrast, safe-region compliance, subject/caption obstruction, and faithfulness to the licensed fact.

CONTACT-SHEET TRUTH:
- The three columns are sequential time samples (intro, build, settled hold), not simultaneous elements. Never penalize the same visual for appearing once in each time column.
- The TOP row composites each animation phase over its matching real final edited-canvas frame (before, anchor, after). This is the authority for placement, hierarchy, subject/caption collision, and whether the graphic belongs in the shot.
- The MIDDLE and BOTTOM rows repeat those phases over neutral dark and light stress backgrounds. They test alpha and contrast only. Never count row repetition as extra focal points.
- Reject a graphic that looks acceptable on neutral stress backgrounds but obscures a subject, existing text, or the visual point of the real footage row.

FAITHFULNESS:
- ALLOW transient interpolated numbers between licensed start/end values only when they are clearly animation states of an honest count-up, progress, or transition and settle on the licensed values. Intermediate motion states are not asserted facts.
- REJECT unsupported settled values, endpoints, labels, annotations, statistics, comparisons, or claims. A stable fabricated value is a lie on the video.

AUTOMATIC REJECT: unsupported asserted content; any colour outside brand tokens; clipped/overflowing/broken text; a keyword-highlight or lower-third-template look instead of a bespoke composition; an opaque full-canvas graphic that hides the footage; subject/caption obstruction in the real footage row; or a graphic that cannot read over the real footage and both stress backgrounds.
PENALIZE: more than one focal point; timid type; no visible development across sampled moments; static values; subject obstruction; muddy gradients; decorative motion without meaning.
REWARD: faithful settled content, honest interpolation, clear visual development, one focal point, one accent, deliberate negative space, and clean readability.
Return ONLY JSON: {"faithful":boolean,"score":0-10,"issues":["specific fixable issue"],"reasoning":"one sentence"}. 8+ = genuinely premium AND faithful.`;
