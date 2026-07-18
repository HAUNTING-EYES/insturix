/**
 * MG Codegen — DESIGN-THEN-CODE Phase 3: the PLAN→COMPONENT coder prompt.
 *
 * The coder IMPLEMENTS an approved MgMomentDesignPlan exactly — it does not redesign. This is the whole point of
 * the split: the free-form writer collapsed to minimum-viable text because "compose something" is an open
 * invitation to laziness; "render THIS dot-tracked timeline, bind `items`, build on word-onsets" is a
 * constrained mechanical task — which is also why cheap models become viable again at this step.
 *
 * The prompt is SMALLER than free-form codegen: the creative layers (FOUNDATIONAL_MG_KNOWLEDGE,
 * COMPOSITION_GUIDE) are gone — those decisions live in the plan. What remains: the kit API, the hard rules the
 * scan enforces, grounding, and a strict implementation contract (element→primitive mapping, enterOrder→phases,
 * syncTo→anchors). All shared blocks are IMPORTED from prompt.ts / codegen-service — never copied (the
 * stale-copy lesson).
 *
 * LANES: the coder only ever sees 'overlay-kit' and 'illustrated-overlay' plans. For illustrated-overlay the
 * component is STILL the transparent kit layer only — the generated backdrop is produced and composited by the
 * system (Phase 4), so the type/data layer stays deterministic and honest. 'cutaway-scene' has no component.
 */

import { GROUNDING_RULE, HARD_RULES, PRIMITIVE_API } from '../prompt';
import { buildMomentBlock } from '../codegen-service';
import type { MgMomentInput } from '../types';
import type { MgMomentDesignPlan, MgVideoDesignBrief } from './design-plan';

/** The element→kit mapping the coder must follow — one primitive per design element kind. */
const ELEMENT_MAP = `ELEMENT → KIT PRIMITIVE (implement each design element with EXACTLY its primitive):
headline→FitHeadline · text→TextBlock · chip→Chip · bar→Bar · ring→Ring · plot→Plot · rule→Rule · dot→Dot ·
plate→Plate · reveal→Reveal · particles→Particles · texture→Texture · motif→Motif.
Element \`hints\` are kit props to honour (face/size/surface/tone/accentWords/...). Element \`dataProps\` name the
\`data\` props that element renders — bind them exactly (data.<name>), never a literal.`;

/** STABLE prefix — byte-identical for every moment in every video (the provider cache prefix for the coder). */
export const CODER_STABLE_PREFIX = `<role>
You are a motion-graphics IMPLEMENTATION engineer. You receive an APPROVED design plan for ONE moment plus its
video brief. Render the design EXACTLY as one Remotion component using ONLY the kit: every element in the plan,
no extra elements, no redesigning, no substitutions. The design has already been judged — your job is faithful,
compilable execution. Return ONLY the component source (no prose, no fences), or exactly \`DECLINE: <reason>\` if
the plan is impossible to implement as specified.
</role>

${PRIMITIVE_API}

${GROUNDING_RULE}

${HARD_RULES}

<implementation_contract>
${ELEMENT_MAP}
- BUILD ORDER: motion.enterOrder lists element indices in entrance order — anchor entrances to phases (ph.intro,
  then stagger(brand, i) offsets in that order). motion.build describes the build phase; motion.hold is the
  settled hold's ambient life (nest ambient() on a wrapper — the graphic never freezes). End settled via exitOut.
- SYNC: syncTo='word-onsets' → the spoken phrase uses FitHeadline kinetic="words" wordsAt={data.wordFrames}
  (the reserved system prop carrying the moment's word-onset frames) so each word PUNCHES in as it is spoken;
  other elements may still stagger from phases. 'beats' → the beat/landing anchors; 'landing' → land the key
  reveal on the landing beat; 'phases-only' → phases + stagger alone.
- STRUCTURE: structure.placement/grouping/readingOrder describe the layout inside the SAFE region given in
  <moment> — compose the elements to realize that structure (grouped, aligned, deliberate negative space).
- REGION BOUNDS ARE EXACT: the primary <Region> uses EXACTLY the SAFE PLACEMENT coords given in <moment> —
  never widen, shift, or extend them (a wider region runs off-frame and over the subject; that render is
  auto-rejected).
- NESTED TEXT WIDTH (the clipping killer): FitHeadline/TextBlock fit themselves to the REGION width. If you
  nest one inside padding, columns, or beside a rail, its real container is NARROWER — you MUST pass
  widthFrac={fraction of region width the text container occupies} or the text overflows and clips.
  Worked example: Plate padding 6% each side + a rail column ~12% wide + 6% gap → the text column is
  ~1−0.12−0.12−0.06 ≈ 0.70 → widthFrac={0.7}. A direct region child needs no widthFrac.
- The video brief's motifLanguage/paletteMoves/motionPersonality apply WITHIN this component (the recurring
  motif element is part of the design; palette moves use tint/shade/mix on brand colours only).
- LEGIBILITY IS MANDATORY, EVERY LANE — BOXLESS FIRST: the judge stress-tests every render over PURE LIGHT and
  PURE DARK backgrounds — never assume the footage is dark. EVERY text element carries local protection BY
  CONSTRUCTION, and the DEFAULT is scene-integrated type: a halo (textShadow built from a brand shade, e.g.
  shade(brand.colors.bg, 0.2) at low alpha, 2-8px blur), strong enough to survive both stress rows. A Plate
  scrim is the EXCEPTION, used only when the plan's design calls for a surface (a scorecard, a data panel, a
  framed fragment — a plate element or hint in the plan says so); never add a card just because footage is
  busy. Thin marks (Rule/Dot/Plot strokes) get the same halo treatment. A render whose text dies on the light
  stress row is REJECTED regardless of everything else.
- EVERY kit element takes brand={brand} — no exceptions; a brandless tag is a construction-scan reject
  (the repair budget is too precious to spend on a missing prop).
- THE BUILD MUST MOVE: entrances SPAN frames (enter/stagger/Reveal with at + dur derived from phases),
  the composition visibly progresses between the intro and settled thirds, and the settled hold keeps
  ambient life. A render whose frames are near-identical dies on a deterministic motion floor before any
  judge sees it — motion is not decoration, it is admission.
- MOTION INTENSITY IS RESOLVED, NEVER HARDCODED: data.motionIntensity is the reserved system prop — the
  brand×video×user liveness (a number in [0.7, 1.0]). EVERY ambient() hold takes it as its strength arg
  (ambient(frame, ph.intro, kind, data.motionIntensity)), and entrance amplitude scales with it. Never pass
  a literal strength like 0.5 — a calm brand still reads alive at 0.7, a punchy one at 1.0, and both clear
  the floor by construction. The value already encodes how much life THIS video wants; honour it.
- THE LOOK IS LAW: plan.look 'integrated' → render NO Plate/card surface at all; legibility comes from the
  shade() text halo, a local SceneGrade darken behind the type region, and placement in calm footage areas
  (read the context frames you were shown). plan.look 'panel' → Plate is licensed for the stated panelReason
  only. Over BRIGHT or busy footage, integrated type raises its defence: shade() at double strength or a
  SceneGrade of strength ≥ 0.6 behind the text region — weak contrast over a bright area is a judge reject.
- NARRATIVE TEXT CHANNEL: for factKind 'narrative', data.line carries the beat's VERBATIM spoken words — the
  only licensed on-screen words for that moment. Render data.line, or a verbatim phrase from it derived IN CODE
  with a runtime guard (e.g. const phrase = /fake money/i.exec(String(data.line))?.[0] ?? String(data.line) —
  the literal is licensed ONLY because the guard verifies it against data.line at render time; unguarded
  hardcoded words remain forbidden). If the design demands words that are NOT verbatim in data.line, DECLINE.
- FAITHFUL DATA RENDERING: every dataProp an element binds MUST be VISIBLY RENDERED via {data.<name>} — a label
  without its value ("Before" with no figure) is an INCOMPLETE CLAIM and is judged unfaithful. Bar and Ring carry
  label/valueText slots for exactly this: bind the display value there (e.g. label="Before"
  valueText={\`\${data.from}\${data.unit}\`}) so the mark renders its own readout. Never render a unit without its
  number, never a name without its figure.
- For an 'illustrated-overlay' plan: compose the ILLUSTRATED SCENE in-component — <Scene brand
  src={data.backdropSrc} camera strength> is the root world (data.backdropSrc is the reserved system prop
  carrying the generated backdrop; always bind it, never a literal URL). Type/marks live in <SceneLayer
  depth={0.85..0.95}> so they share the camera (multiplane); meaning-bearing beats use <SceneReveal> anchored to
  phases; legibility over the backdrop comes from <SceneGrade> toward the edge where the type sits — in a Scene
  use SceneGrade, NEVER a Plate card (a card on a world is the amateur tell). When the backdrop image is shown to
  you in this session, place the type in ITS real negative space and aim reveals at its actual regions. A
  full-frame Scene is expected to render OPAQUE (the world replaces the frame); a windowed Scene (inside a
  <Region>) stays a transparent overlay outside its window.
</implementation_contract>`;

export interface MgCoderInput {
  plan: MgMomentDesignPlan;
  brief: MgVideoDesignBrief;
  /** The same validated moment input the free-form path uses — supplies placement/window/anchors via
   *  buildMomentBlock (imported, identical SAFE-placement mandate). */
  moment: MgMomentInput;
}

/** Assemble the coder prompt: stable prefix → video brief → the approved design → the moment DATA last. */
export function buildCoderPrompt(input: MgCoderInput): string {
  if (input.plan.lane === 'cutaway-scene') {
    throw new Error(`buildCoderPrompt: cutaway-scene has no component (momentId ${input.plan.momentId})`);
  }
  const brief = `<video_brief>
style: ${input.brief.styleName} · motif: ${input.brief.motifLanguage} · palette: ${input.brief.paletteMoves} · motion: ${input.brief.motionPersonality}
</video_brief>`;
  const design = `<design>
${JSON.stringify(input.plan)}
</design>`;
  return `${CODER_STABLE_PREFIX}\n\n${brief}\n\n${design}\n\n${buildMomentBlock(input.moment)}`;
}

// ─── multimodal session parts (4b-3: the coder SEES the actual generated backdrop it composes against) ───

/** Provider-neutral prompt part — same shape as the designer's (callers map to their provider). */
export type MgCoderPart = { kind: 'text'; text: string } | { kind: 'image'; mimeType: string; data: string };

const BACKDROP_FRAMING = `GENERATED BACKDROP — the following image IS this moment's scene backdrop. At render
time it is exactly \`data.backdropSrc\`. Compose against THIS image: place the type in its REAL negative space,
aim SceneReveal origins at its actual regions, and pick the SceneGrade edge where type would sit over busy
detail. Do not describe or re-imagine the backdrop — build the scene layer that belongs on it.`;

/**
 * Assemble the multimodal coder session: stable prefix → the actual backdrop image (illustrated lanes) → the
 * volatile brief/design/moment tail LAST (Rule 35). Reuses buildCoderPrompt's tail via prefix-slice — single
 * source, no drift. Text-only callers keep using buildCoderPrompt.
 */
export function buildCoderParts(input: MgCoderInput, backdrop?: { mimeType: string; data: string }): MgCoderPart[] {
  const parts: MgCoderPart[] = [{ kind: 'text', text: CODER_STABLE_PREFIX }];
  if (backdrop) {
    parts.push({ kind: 'text', text: BACKDROP_FRAMING });
    parts.push({ kind: 'image', mimeType: backdrop.mimeType, data: backdrop.data });
  }
  parts.push({ kind: 'text', text: buildCoderPrompt(input).slice(CODER_STABLE_PREFIX.length) });
  return parts;
}
