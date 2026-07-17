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
- SYNC: syncTo='word-onsets' → align reveals to the word anchors named in <moment>; 'beats' → the beat/landing
  anchors; 'landing' → land the key reveal on the landing beat; 'phases-only' → phases + stagger alone.
- STRUCTURE: structure.placement/grouping/readingOrder describe the layout inside the SAFE region given in
  <moment> — compose the elements to realize that structure (grouped, aligned, deliberate negative space).
- The video brief's motifLanguage/paletteMoves/motionPersonality apply WITHIN this component (the recurring
  motif element is part of the design; palette moves use tint/shade/mix on brand colours only).
- LEGIBILITY IS MANDATORY, EVERY LANE: the judge stress-tests every render over PURE LIGHT and PURE DARK
  backgrounds — never assume the footage is dark. EVERY text element carries local protection BY CONSTRUCTION:
  either sit it on a compact Plate scrim (surface="flat"/"frosted", tight to the text block), or wrap it with a
  halo (textShadow built from a brand shade, e.g. shade(brand.colors.bg, 0.2) at low alpha, 2-8px blur). Thin
  marks (Rule/Dot/Plot strokes) get the same treatment or sit on the plate. A render whose text dies on the
  light stress row is REJECTED regardless of everything else.
- For an 'illustrated-overlay' plan: implement ONLY the transparent kit layer (type/marks/data) — the generated
  backdrop is composited by the system underneath; the legibility rule above makes the layer read over ANY
  backdrop.
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
