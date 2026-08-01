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
tint/shade(brand.colors.X, 0..1) — lighten / darken a brand colour IN-PALETTE (bright↔muted mood).  mix(brand.colors.A, brand.colors.B, 0..1) — blend two brand colours (duotone / gradient stop).

LAYOUT (positions are FRACTIONS of the title-safe region; px positioning is forbidden):
<Stage brand>...</Stage>                        // REQUIRED scene root. backdrop is FALSE (renders over footage) — never set backdrop={true}.
<Region brand x y w h? align? justify? gapScale?>...  // rect in SAFE-area fractions. x,y = TOP-LEFT (not centre). To fill horizontally use a wide region from the left (x=0.08 w=0.84); align/justify centre children WITHIN it.
<Corner brand at="tl|tr|bl|br">...              // chip anchor
<Bleed>...</Bleed>                              // full-frame layer for IMAGERY/SHAPES only — text is rejected inside

TEXT (the only way words render — size & colour COMPUTED, never passed):
<FitHeadline brand text accentWords={["word"]} face="sans|display" weight={100..900} size="display|xl|l|m|s" kinetic="rise|chars|words|none" wordsAt={data.wordFrames} startAt align widthFrac={0..1}/>  // face="display" = heavy CONDENSED ALL-CAPS impact (bold-statement/kinetic-punch); "sans"=brand sans (default). weight = sans thickness (light-editorial↔heavy); display is single-weight (ignores it). kinetic="words" = the KINETIC CAPTION: each word PUNCHES in on its own speech-onset frame — ALWAYS bind wordsAt={data.wordFrames} (the reserved system prop carrying the moment's word-onset frames); pair with face="display" + one accentWord for the retention-caption look
<TextBlock brand text tone="text|muted|accent" size="m|s" startAt align/>
<Chip brand text tone="ghost|accent" startAt/>

CHOREOGRAPHY (numbers are DERIVED — anchor to phases, never hand-type frame windows):
const ph = phases(durationInFrames, brand)      // ph.intro, ph.build, ph.resolve, ph.durF are PLAIN FRAME NUMBERS (integers), NOT objects. Use directly: ph.intro, ph.intro + 6, [ph.intro, ph.intro + 15]. NEVER ph.intro.start / ph.intro.end — those are undefined and throw "inputRange must contain only numbers" at render.
enter(brand, frame, at, fps, "rise|scale|pop|fade|blurIn|zoomBlur|sweepL|sweepR", unit?) -> style   // entrance verb
ambient(frame, at, "float|pulse|breathe|glow|drift", data.motionIntensity) -> style   // REQUIRED sustained hold-phase life. This reserved signal is resolved from brand×video×user context; never replace it with a literal/default.
exitOut(frame, ph, "fade|rise") -> style        stagger(brand, i)   pulseAt(frame, at, strength)
countUp(frame, at, dur, to, from?)              progress(frame, from, to)   travel(frame, ph, px)   EASE
useRegionSize() -> {wPx,hPx}   useStage() -> {W,H,...}

NON-TEXT PRIMITIVES (brand-locked, animated from the frame — compose these into charts / gauges / trends / structure):
<Bar brand value={0..1} at dur? tone="accent|text|muted" thickness? vertical? track? label? valueText?/>   // a value bar that grows; N Bars = a bar chart / comparison. label/valueText = the mark's OWN readout (bind the REAL name+figure from data — "Before" + data.fromDisplay) so the claim is ON SCREEN, never a bare label
<Ring brand value={0..1} at dur? tone? size? thickness? label? valueText?/>                                  // a progress arc / gauge that fills to its TRUE fraction; label/valueText = the centred readout (same slots)
<Plot brand points={[...]} at dur? tone? area? width? height?/>                            // a line / area trend that draws on
<Rule brand at dur? tone? thickness? vertical?/>    <Dot brand at dur? tone? size?/>       // a line (underline / divider / axis / connector); an accent dot
<Plate brand at dur? opacity? radius? surface="flat|gradient|frosted|raised|glow" emphasis={0..1} grain?>...</Plate>  // rounded brand surface with real MATERIAL depth (derived from brand tokens, not a named look): flat scrim · gradient (top-lit fill) · frosted (glass: rim+sheen) · raised (layered elevation shadow) · glow (accent-lit rim+halo). emphasis scales richness (hero→deeper); grain adds tactile noise. Prefer a designed surface over a flat box for premium/hero moments.
<Reveal at dur? from="left|right|up|down">...</Reveal>                                      // clip-path WIPE — unmask any children on
<Particles brand kind="dust|bokeh|sparks|confetti" count? at? tone?/>                       // deterministic emphasis field (fills its positioned parent)
<Texture brand kind="grain|scanline|grid|dots" strength? at?/>                              // atmosphere pattern BEHIND content (grain=cinematic · scanline=retro · grid/dots=editorial); fills its positioned parent
<Motif brand kind="chevrons|sunburst|zigzag" count? at? tone?/>                             // decorative accent ORNAMENT / flourish (retro / broadcast / editorial) — never content
ILLUSTRATED SCENE (2.5D world — when the design specifies an illustrated backdrop; the backdrop ALWAYS arrives as the reserved prop data.backdropSrc — it may be a STILL image or a LOOPING VIDEO clip, same contract either way; the kit detects and handles both):
<Scene brand src={data.backdropSrc} camera="push|pull|drift-l|drift-r|none" strength={0..1}>    // backdrop (still or living/moving world) + ONE computed camera ALL children share
  <SceneLayer depth={0..1}>…</SceneLayer>            // multiplane parallax: 1 = far world, 0 = screen-locked; type sits ~0.9
  <SceneReveal at dur origin={{x,y}}>…</SceneReveal> // radial unmask from a design-chosen origin — meaning-motion (a region
                                                     // spreads, a highlight lands) on OUR deterministic clock
  <SceneGrade brand edge="bottom|top|left|right"/>   // brand-shade gradient under type — in a Scene use THIS, never a Plate card
</Scene>
Pass REAL values (the true 0..1 fraction, the true series — perceptual honesty). For anything these don't cover you
MAY still hand-draw SVG/divs inside a <Region>/<Bleed>, coloured ONLY with brand.colors.*/withAlpha, animated ONLY
from the frame — but PREFER the primitives: they are brand- and motion-correct by construction. Make numbers FELT.
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
import {Brand, withAlpha, dv, tint, shade, mix} from './kit/brand';
import {Stage, Region, Corner, Bleed, useStage, useRegionSize} from './kit/stage';
import {FitHeadline, TextBlock, Chip} from './kit/fit-text';
import {Bar, Ring, Plot, Rule, Plate, Dot, Reveal, Particles, Texture, Motif} from './kit/marks';
import {Scene, SceneLayer, SceneReveal, SceneGrade} from './kit/scene';
import {phases, enter, exitOut, stagger, pulseAt, countUp, progress, travel, ambient, EASE} from './kit/choreo';`;

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
- HIERARCHY IS A READING ORDER. The eye must know where to ENTER and in what order to read. A single-point
  graphic earns that with ONE dominant element and deliberately smaller support. A Tier-B scene — a labelled map,
  an icon-array/pictogram chart, a compared set, an illustrated scene — earns it through GROUPING, ACCENT,
  POSITION and contrast: many co-equal labelled elements are CORRECT there, and forcing one to dominate would
  misrepresent the content. What is never acceptable is undifferentiated flatness (no entry point, everything one
  weight) or elements competing with no order. Restraint = fewer, better-placed elements and real negative space
  — not every element shouting at once.
- PERCEPTUAL HONESTY. The visual encodes the TRUE quantity — a value counts to its real figure, a proportion
  fills to its real fraction, a comparison shows the real ratio. Never exaggerate for drama.
- MOTION WITH INTENT. Every animation carries meaning (a reveal, a build, a landing), never decoration; it moves
  on every frame and ends settled.
- SCALE TO THE MOMENT. The focal element is exactly as prominent as THIS moment asks — read the expressiveness
  in <moment>: a hero beat can command the frame, a subtle beat is quiet and precise. Prominence is a deliberate
  choice per moment, never a default maximum. Bigger is not better; right-sized is better.
- IMPACT TYPE for the ONE phrase that must hit. When a key phrase is the payload (a punchline, a bold claim, a
  kinetic statement), set THAT phrase with FitHeadline face="display" (heavy CONDENSED ALL-CAPS) + one accent
  word — the bold-statement look. It is the focal element, not decoration; supporting copy stays face="sans".
- BRAND by construction — colour and type come only from the brand tokens.
- IT READS OVER FOOTAGE — the focal content sits in the frame's ROOM (the negative space named in <moment>),
  clear of the subject; use a LOCAL scrim/outline only where legibility needs it, never a field that hides footage.
- FORM INVESTMENT — every graphic is DESIGNED, never minimum-viable text. Words alone on a panel is a slide, not
  a motion graphic. Spend visual form matched to the moment: a list is a designed STRUCTURE (numbered/marked
  items — a Dot or Rule per item, staggered card plates, a spatial arrangement — not bare text lines); a stat is
  a designed FIGURE (a Ring/Bar making it felt, a display-face number with a motif — not a printed value); a
  term is designed TYPE (accent, underline-draw, reveal — not a plain word). The kit's marks (Bar, Ring, Plot,
  Rule, Dot, Plate, Reveal, Motif, Texture, Particles) exist to carry form — use them. Restraint changes the
  SIZE and volume of the design, never whether there is design: a quiet moment is a small DESIGNED graphic,
  not undesigned text.

RANGE (priors, NOT a menu — never "pick one"): great graphics span a wide space — a single metric owning the
void; kinetic type where a phrase fills the frame with one accent word; two quantities as bars or rings at their
true ratio, the winner accented; a value filling a ring to its true fraction on its beat; a term revealed with
its context through spatial relationship; a false claim struck as the truth lands. Let the fact and the moment
suggest the form; compose it freshly. Two moments with the same KIND of fact should NOT look identical — the
brand, the intent, the screen, and the expressiveness make each its own.

AVOID (slop): keyword-highlighting; lower-third / name-tag templates; a number shown statically; decoration that
carries no meaning; muddy gradients; an undifferentiated field with no entry point or reading order (note: co-equal
labelled elements are CORRECT when the content IS a set — a map, a list, a compared group — the slop is having no
order at all, not having many elements); MINIMUM-VIABLE TEXT — bare text lines on a plain panel where the kit's
marks could carry designed form (undesigned is not the same as restrained); a graphic that floats ignoring the
footage beneath.
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

/**
 * The hard rules — the scan enforces these; the model must obey them exactly. STABLE (byte-identical every call)
 * so it belongs to the cacheable prefix — the clip's frame count lives in <moment>, never interpolated here.
 */
export const HARD_RULES = `<hard_rules>
- Export EXACTLY: export const MgScene: React.FC<{brand: Brand; data: Data}> = ({brand, data}) => { ... }
  Declare \`type Data = {...}\` INLINE for exactly the values this fact needs (the data props listed in <moment>).
  Read every number/word from \`data\` (guard optionals: data.value ?? 0). NEVER bake a literal fact value into
  the JSX (Law 5 + grounding). Do NOT import Data.
- Do NOT write ANY import statements. React, the Remotion hooks/components (useCurrentFrame, useVideoConfig,
  interpolate, spring, AbsoluteFill, Sequence), and EVERY kit primitive in <primitive_api> are ALREADY IN SCOPE —
  the harness injects imports. Begin your output directly at \`type Data = {...}\` (or at \`DECLINE:\`).
- Scene root MUST be <Stage brand={brand}> (backdrop stays FALSE — over footage). All words via FitHeadline/
  TextBlock/Chip inside a <Region>/<Corner> — NEVER a raw text node in a styled div, NEVER a fontSize you type.
- COLOUR: only brand.colors.*, withAlpha/tint/shade(brand.colors.*, a), mix(brand.colors.*, brand.colors.*, t),
  or 'transparent'. A raw hex, rgb()/hsl(), or named CSS colour literal is an automatic rejection.
- FOOTAGE CONTRAST: critical text and marks must remain readable as the footage luminance changes. Use the least
  intrusive LOCAL brand-token protection needed (halo, outline, compact scrim, or bounded plate). Never solve this
  with an opaque or near-opaque full-frame field, and never turn the composition into a generic card.
- DETERMINISTIC: animate ONLY from useCurrentFrame()/useVideoConfig(). NEVER Math.random, Date, timers, fetch,
  window, document, eval, require, dynamic import, process. Math.sin/cos of the frame is encouraged.
- CHOREOGRAPHY IS COMPUTED: const {durationInFrames, fps} = useVideoConfig(); const ph = phases(durationInFrames, brand);
  anchor every entrance/exit/beat to ph.* (+ stagger). No hand-typed frame windows like [14, 38]. READ the clip
  length from useVideoConfig() (its value is stated in <moment>). The reserved system prop
  data.motionIntensity is always available: declare it in Data and drive the sustained hold with
  ambient(frame, at, kind, data.motionIntensity). Motion on every frame; end settled via exitOut.
- Every interpolate(): {extrapolateLeft:'clamp', extrapolateRight:'clamp'}. spring() takes fps from useVideoConfig().
- PLACEMENT IS GIVEN, NOT CHOSEN: if <moment> lists a SAFE PLACEMENT rect, your primary <Region> MUST use those
  exact x/y/w/h (it is already clear of the subject and every avoid-area) and EVERY element stays inside it — do
  NOT invent your own Region coordinates. ONE focal point with a clear scale hierarchy. Do NOT stretch an element
  to fill the frame — compose within the room the region gives you; negative space is intentional, not a dead
  quadrant to fill.
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
fact, THIS brand, THIS moment. Use the kit's Bar/Ring/Plot/Rule primitives for any chart/gauge/trend/mark — do NOT
hand-roll SVG (the primitives are brand- and motion-correct by construction). No templates, no keyword-highlighting,
no lower-thirds — a fresh composition every time.
</composition>

<reference_usage>
The block below shows CORRECT KIT USAGE ONLY — the SHAPE of a valid component, so your code COMPILES and calls the
kit right (inline Data decl, <Stage> root, a <Region> placed in the negative space, primitives fed the TRUE ratio
read from data, choreography anchored to phases, sustained motion via ambient nested on a wrapper). Do NOT copy the
composition — compose FRESHLY for your fact. It fixes your syntax, never your design.

type Data = { from: number; to: number; fromLabel: string; toLabel: string; unit: string; label: string; motionIntensity: number };
export const MgScene: React.FC<{brand: Brand; data: Data}> = ({brand, data}) => {
  const { durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  const ph = phases(durationInFrames, brand);
  const from = data.from ?? 0, to = data.to ?? 0, max = Math.max(from, to, 1);
  return (
    <Stage brand={brand}>
      <Region brand={brand} x={0.44} y={0.34} w={0.34} h={0.34} align="left" justify="center" gapScale={1.3}>
        <div style={ambient(frame, ph.build, 'float', data.motionIntensity)}>
          <FitHeadline brand={brand} text={data.label} face="display" size="m" accentWords={[data.toLabel]} startAt={ph.build}/>
        </div>
        <TextBlock brand={brand} text={data.fromLabel} tone="muted" size="s" startAt={ph.intro}/>
        <Bar brand={brand} value={from / max} at={ph.intro} tone="muted"/>
        <TextBlock brand={brand} text={data.toLabel} tone="accent" size="s" startAt={ph.intro + 6}/>
        <Bar brand={brand} value={to / max} at={ph.intro + 6} tone="accent"/>
      </Region>
    </Stage>
  );
};
</reference_usage>`;

/** Vision-judge prompt: the transparent graphic is composited on a real footage frame; the judge rates brand
 *  craft, legibility over content, AND faithfulness to the licensed fact (fabrication is an automatic reject). */
export const JUDGE_PROMPT = `You are the final ruthless motion-graphics craft and faithfulness judge.
The ordered images show ONE transparent animation. Judge the ADDED graphic only: brand fidelity, composition, visible motion development, mobile legibility, clipping, contrast, safe-region compliance, subject/caption obstruction, and faithfulness to the licensed fact.

IMAGE TRUTH:
- JUDGE IMAGES 1-3 are sequential full composites: intro, build, and settled hold, each over its matching real final edited-canvas frame. Inspect EACH image independently at useful resolution, then judge the progression. They are not simultaneous elements.
- The final judge image is one contrast-only stress sheet. Its columns are intro/build/settled-hold; its top row is dark and bottom row is light. Use it only for alpha and contrast, never for placement or subject-obstruction judgments.
- The three full composites are the authority for placement, hierarchy, subject/caption collision, and whether the graphic belongs in the shot. Check every subject and face in every phase.
- Reject a graphic that looks acceptable in the stress image but obscures a subject, existing text, or the visual point of any real-footage composite.

FAITHFULNESS:
- ALLOW transient interpolated numbers between licensed start/end values only when they are clearly animation states of an honest count-up, progress, or transition and settle on the licensed values. Intermediate motion states are not asserted facts.
- REJECT unsupported settled values, endpoints, labels, annotations, statistics, comparisons, or claims. A stable fabricated value is a lie on the video.

CRAFT DIMENSIONS — score EACH 0-10 by its guiding question. These are Swiss/Bauhaus craft LAWS a designer applies, NOT personal taste:
- hierarchy: does the eye know where to ENTER and in what order to read? A single-point graphic earns this with one dominant element + deliberately smaller support. ★ When the content IS A SET — a labelled map, an icon-array/pictogram chart, a compared group, a menu of options, an illustrated scene — then several elements of EQUAL visual weight are the CORRECT form. That is a SET, not "competing focal points": do NOT call it competing and do NOT mark hierarchy down for it. Forcing one member to dominate would misrepresent the content. For a set, judge instead: is it cleanly grouped, consistently styled, legibly labelled, and can the eye enter and read it in a sensible order? Low = undifferentiated flatness (no entry point at all, everything one weight with no grouping), or genuinely unrelated elements fighting each other.
- typography: is every word legible over the real footage at mobile size, well-set (weight, tracking, case), and never clipped or overflowing? Clipped / overflowing / illegible-over-footage = low.
- color: are ALL colours from the brand palette, with clean contrast and no muddy gradients? Any non-brand colour, weak contrast, or mud = low.
- composition: does the graphic sit in the frame's ROOM, clear of the subject and existing text/caption, with intentional negative space — not stretched to fill every quadrant? Subject/caption collision or dead-quadrant filling = low. The LICENSED FACT JSON carries the subject's bounding box (subject: {x,y,width,height} in frame fractions) when known — treat opaque graphic elements overlapping that box in any real-footage composite as a subject collision; type integrated over the subject with a halo is not a collision, an opaque plate/figure over it is.
- motion: across the three phases does it DEVELOP with intent (a real reveal / build / landing), moving on every frame and ending settled — not static, not decoration? No development across the phases, or decorative-only motion = low.
- form: is there DESIGNED visual form — structure, marks, motifs, spatial composition, drawn/figurative elements — matched to the moment, or is it MINIMUM-VIABLE TEXT (bare words on a plain panel)? A designed-minimal graphic (a considered dot, rule, texture, accent — small but composed) scores HIGH. Bare text lines where a professional would design a structure (a list with no markers/cards/spatial design; a stat printed instead of made felt; a term with no typographic treatment) = low. Words alone on a rectangle is a slide, not a motion graphic. BOXLESS IS THE PROFESSIONAL DEFAULT on footage: type integrated into the scene (halo/shade protection, deliberate negative space) reads as designed; an UNMOTIVATED card/panel wrapped around type that carries no surface-worthy content (no scorecard, no data panel, no framed fragment) is an amateur tell — mark form down for it.
RESTRAINT IS CRAFT, NOT TIMIDITY: a quiet, precise, small graphic at a subtle moment is CORRECT — never mark hierarchy or typography down for restraint. Size is right when it fits the moment, not when it is large. Reward deliberate negative space, one accent, and clean readability. But restraint means a SMALLER design, never NO design — judge \`form\` on design investment, not on size.
PROFESSIONAL BAR — the graphic must belong alongside professional motion design. Hold it to the ONE bar whose kind fits THIS moment (read the licensed fact + expressiveness), NOT a generic one:
- a DATA / EXPLAINER moment (a stat, comparison, chart, trend) → the clarity-and-restraint bar: muted palette with one purposeful accent, medium sans, flat surface, generous whitespace, calm motion that serves comprehension. A busy graphic that looks cool but does not READ fails this bar; a clean restrained one that reads instantly is 8+.
- a KINETIC / HERO moment (a hook, a bold claim, a punchline) → the energy-and-retention bar: heavy condensed ALL-CAPS display, one high-contrast accent keyword, word/beat-synced pop. A technically-clean but LIFELESS caption fails this bar.
- a PREMIUM / SUBTLE moment → the premium-restraint bar: muted-premium palette, refined type, soft depth, gentle motion, everything considered. An over-decorated graphic that mistakes loud for good fails this bar (restraint is the hard part — reward understatement).
- ALWAYS the competitive floor: a rival AI motion-graphics tool already ships polished, varied hooks; this must not look worse.
Ask holistically: does this belong alongside those professionals? Score against the FITTING bar — do not reward energy on a moment that needs clarity, or clarity on a moment that needs a hook.
AUTOMATIC REJECT (forces a reject-class score, and faithful=false for fabrication): unsupported asserted content; any colour outside brand tokens; clipped/overflowing/broken text — CHECK THE FRAME EDGES SPECIFICALLY: any text or panel touching or cut off by the right/left/bottom frame edge is CLIPPED even if it superficially resembles an intentional bleed; a keyword-highlight or lower-third-template look instead of a bespoke composition; an opaque full-canvas graphic that hides the footage; subject/caption obstruction in any real-footage composite; or a graphic that cannot read over the real footage and both stress backgrounds.
SCORING DISCIPLINE: \`score\` is a holistic 0-10 OVERALL that MUST be consistent with the dimensions and the issues — it is NOT their mean, but it can never exceed the lowest reject-class dimension. Any reject-class problem — fabrication (faithful=false), subject/caption interference, an opaque field hiding the footage, NO visible motion development across the three phases, clipped/broken text, unreadable contrast, a non-brand colour, or template-like form — forces its \`hardFailures\` field true, \`score\` to at most 4, AND the matching dimension to at most 4. Subject interference includes meaning-bearing type or marks crossing a face, hands, or the shot's visual point so that the subject and graphic compete, even when the graphic is transparent. Caption interference includes crowding or competing with existing caption text, not only literal pixel overlap. MINIMUM-VIABLE TEXT is a quality cap: if \`form\` ≤ 4 (undesigned bare-text output), \`score\` is at most 6 — clean execution cannot rescue an undesigned graphic. Never award 8+ while any dimension is ≤4, while any hard-failure field is true, or while you list a reject-class issue.
Return ONLY JSON: {"faithful":boolean,"hierarchy":0-10,"typography":0-10,"color":0-10,"composition":0-10,"motion":0-10,"form":0-10,"hardFailures":{"fabrication":boolean,"nonBrandColor":boolean,"clippedOrOverflowing":boolean,"subjectInterference":boolean,"captionOrExistingTextInterference":boolean,"unreadableContrast":boolean,"opaqueFootageOcclusion":boolean,"missingMotionDevelopment":boolean,"templateLikeForm":boolean},"score":0-10,"issues":["specific fixable issue"],"reasoning":"one sentence"}. score 8+ = genuinely premium AND faithful.`;
