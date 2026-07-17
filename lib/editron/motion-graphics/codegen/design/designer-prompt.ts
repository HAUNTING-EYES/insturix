/**
 * MG Codegen — DESIGN-THEN-CODE Phase 2: the VIDEO-LEVEL DESIGNER prompt.
 *
 * The designer is a motion-design DIRECTOR, not a coder: it sees EVERY licensed moment of the video at once
 * (plus the brand, the style identity, and the intent) and authors ONE MgVideoDesignPlan — the video's coherent
 * graphic package. Seeing all moments lets it DISTRIBUTE form across the video (the anti-monotony fix at the
 * design level) and hold one motif language (broadcast-package coherence). Output is STRICT JSON parsed by the
 * Phase-1 Zod contract + validateDesignPlan — so a text-only design, a data-bearing generative lane, or a
 * phantom data prop dies deterministically before anything renders.
 *
 * PROVIDER-AGNOSTIC by design: plain-text JSON output (no vendor responseSchema), because the DESIGNER is the
 * step worth baking off across models (gemini / GLM / Kimi) — under design-then-code the coding step is
 * mechanical, the design step is where model quality bites.
 *
 * ANCHOR BARS AS TEXT, IMAGES STAY JUDGE-SIDE: showing reference stills to a GENERATOR invites copying
 * (rules-over-examples); the director gets the bars as archetype language, the frame-armed judge holds the
 * visual line downstream.
 *
 * GROUNDING AT DESIGN TIME: the moment block includes the fact's source text + prop NAMES + kinds — never
 * literal values in concepts; elements bind data BY PROP NAME. A value edit re-renders; it never re-designs.
 */

import type { Brand } from '../kit/brand';
import type { VideoStyle } from '../style/style-resolver';
import { MG_DESIGN_LANES, MG_ELEMENT_KINDS, MG_FORM_ELEMENTS, MG_TARGET_BARS } from './design-plan';

/** The per-moment context the designer needs — minimal + structural (R33), assembled by the caller/seam. */
export interface MgDesignerMoment {
  momentId: string;
  factKind: string;
  /** What the speaker actually said (creative context — concepts reference MEANING, never literal numbers). */
  sourceText: string;
  /** Visualizable data props: name + coarse kind ('number' | 'text' | 'list' | 'object'). */
  contentProps: Array<{ name: string; kind: string }>;
  tier: 'subtle' | 'standard' | 'hero';
  salience: number;
  /** Where the frame has room for this moment (prose from the placement resolution). */
  room: string;
  durationFrames: number;
}

export interface MgDesignerInput {
  intent?: string | null;
  videoStyle: VideoStyle;
  brand: Brand;
  moments: MgDesignerMoment[];
}

/** STABLE prefix — byte-identical across videos (provider prompt-cache prefix, same discipline as codegen). */
export const DESIGNER_STABLE_PREFIX = `<role>
You are the motion-design DIRECTOR for one video. You do NOT write code. You author the video's complete graphic
package as ONE strict-JSON design plan: a video-level BRIEF (the coherent graphic language) plus a DESIGN for
every licensed moment. A coder renders exactly what you specify; a ruthless visual judge then compares the result
against genuine professional motion design. Design at that level or the work is rejected.
</role>

<the_bar>
Every design must belong alongside professional motion design. Aim each moment at the ONE bar that fits it:
- vox-clarity (data/explainer): editorial restraint, one purposeful accent, designed structure that reads
  instantly — labelled maps, icon arrays, true-ratio charts, timelines. Clarity IS the aesthetic.
- hormozi-energy (hook/hero): heavy condensed display type, one high-contrast accent word, word/beat-synced pops.
  Alive, not merely tidy.
- gadzhi-restraint (premium/subtle): muted premium palette, refined type, soft depth, gentle motion — small but
  UNMISTAKABLY designed. Understatement with polish.
The competitive floor: rival AI tools already ship polished, varied hooks. Styled text on a panel is below the
floor everywhere.
</the_bar>

<design_rules>
- FORM IS MANDATORY. A design whose elements are only text (headline/text/chip) with no imagery is AUTOMATICALLY
  REJECTED by the system. Every moment gets designed structure: form elements (${MG_FORM_ELEMENTS.join(', ')})
  and/or generated imagery. A list is a designed structure (marked, carded, spatially arranged) — never text
  lines. A stat is a designed figure — never a printed value. Restraint changes the SIZE of the design, never
  whether there is one.
- ONE GRAPHIC LANGUAGE PER VIDEO. The brief's motifLanguage is a recurring device (an underline that draws, a
  dot marker system, a corner tick) present across moments; paletteMoves stays in-brand (tint/shade/mix leans).
  Coherence in language, VARIETY in form: state in formVariety how forms are distributed so adjacent moments
  never repeat a family.
- LANES. 'overlay-kit' = kit composition over footage (default). 'illustrated-overlay' = a GENERATED backdrop
  scene (no on-image text, no numbers, no logos — imagery only) with the kit's type/data layer over it — use it
  when a moment deserves illustrated richness the kit alone cannot draw. 'cutaway-scene' = a full-frame generated
  scene replacing footage — NEVER for a moment whose fact carries data (the system rejects it).
- GROUNDING. Elements bind real values by PROP NAME in dataProps (the coder reads data.<name>). Never write a
  literal number or quoted stat into a concept, role, or imagery prompt. Imagery prompts describe subject, mood,
  composition, palette — no text, no numbers, no logos, no real persons or brands.
- PLACEMENT. Each moment lists its ROOM — design inside it, clear of the subject and captions. Reading order is
  a deliberate choice; motion.enterOrder indexes into your elements array in build order.
- MOTION IS DESIGNED. entrances staggered with intent, a build that develops, a hold that stays alive (never
  frozen), sync chosen per moment (word-onsets for spoken lists/kinetic type, beats for rhythmic reveals,
  landing for one decisive hit, phases-only when quiet).
- ELEMENT VOCABULARY (the coder's kit — nothing else exists): ${MG_ELEMENT_KINDS.join(', ')}. Lanes: ${MG_DESIGN_LANES.join(' | ')}. Bars: ${MG_TARGET_BARS.join(' | ')}.
</design_rules>

<output_format>
Return ONLY one JSON object, no prose, no markdown fences, exactly this shape:
{"brief":{"styleName":string,"motifLanguage":string,"paletteMoves":string,"motionPersonality":string,"formVariety":string},
 "moments":[{"momentId":string,"lane":"overlay-kit"|"illustrated-overlay"|"cutaway-scene","concept":string,
   "targetBar":"vox-clarity"|"hormozi-energy"|"gadzhi-restraint",
   "structure":{"placement":string,"grouping":string,"readingOrder":string},
   "elements":[{"kind":string,"role":string,"dataProps":[string],"hints":{string:string}?}],
   "imagery":{"scenePrompt":string,"mode":"still"|"motion","paletteDirection":string}?,
   "motion":{"enterOrder":[int],"build":string,"hold":string,"syncTo":"word-onsets"|"beats"|"landing"|"phases-only"}}]}
Every licensed moment MUST have exactly one design. Strings are bounded — keep concepts one sentence.
</output_format>`;

function momentBlock(m: MgDesignerMoment): string {
  const props = m.contentProps.length
    ? m.contentProps.map((p) => `${p.name}: ${p.kind}`).join('; ')
    : 'none';
  return `- ${m.momentId} · factKind=${m.factKind} · tier=${m.tier} · salience=${m.salience.toFixed(2)} · ~${m.durationFrames}f
  said: "${m.sourceText.slice(0, 200)}"
  data props (bind by NAME): ${props}
  room: ${m.room.slice(0, 200)}`;
}

/** Assemble the full designer prompt: stable prefix first (cacheable), the video's volatile context LAST. */
export function buildDesignerPrompt(input: MgDesignerInput): string {
  const b = input.brand;
  const video = `<video>
intent: ${input.intent?.trim() || 'unspecified'}
style identity: "${input.videoStyle.styleName}" — ${input.videoStyle.personality}; motion ${input.videoStyle.motion}; weight ${input.videoStyle.weight}; density ${input.videoStyle.baseDensity}
brand: accent ${b.colors.accent} on ${b.colors.bg}; text ${b.colors.text}; sans "${b.fontSans.split(',')[0]}"; display "${(b.fontDisplay ?? 'Anton').split(',')[0]}"; corners ${b.shape.radius}px; motion energy ${b.motion.energy}
licensed moments (design EVERY one):
${input.moments.map(momentBlock).join('\n')}
</video>`;
  return `${DESIGNER_STABLE_PREFIX}\n\n${video}`;
}

/** Extract the design-plan JSON from a model response (tolerates fences/prose margins; parse errors throw —
 *  the caller owns retry). */
export function extractDesignPlanJson(response: string): unknown {
  const trimmed = response.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const body = (fence?.[1] ?? trimmed);
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('designer response contains no JSON object');
  return JSON.parse(body.slice(start, end + 1));
}
