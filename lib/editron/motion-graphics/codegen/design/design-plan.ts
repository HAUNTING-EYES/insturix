/**
 * MG Codegen — DESIGN-THEN-CODE, the design-plan contract (Phase 1 of the form fix, 2026-07-17).
 *
 * WHY THIS EXISTS (evidence, not theory): free-form "compose a component" prompting produced minimum-viable
 * text-lists for structural facts from BOTH GLM-5V and gemini-3.1-pro, even with mandates naming the exact kit
 * primitives; the frame-armed judge rates all such output form 4-5 vs the professional anchors' 8-9. The fix is
 * to make the model AUTHOR AN EXPLICIT DESIGN first — a validated plan that is gateable BEFORE any render — and
 * then code the approved plan (a far more constrained, mechanical task).
 *
 * One VIDEO-LEVEL design session produces this contract: a design brief (the video's coherent graphic language —
 * recurring motif, palette moves, motion personality) + a PER-MOMENT plan (lane, concept, structure, typed kit
 * elements with data bound BY PROP NAME, imagery for the generative lanes, motion beats, a target anchor bar).
 * Seeing every moment at once lets the designer DISTRIBUTE form across the video — the anti-monotony fix at the
 * design level — and the per-moment coding/rendering/judging then parallelizes as independent jobs.
 *
 * DETERMINISTIC FORM FLOOR (the lazy-list killer): `validateDesignPlan` REJECTS a plan whose moment has no
 * form-bearing element and no imagery — "three text lines on a panel" is now a CONTRACT VIOLATION, not a judge's
 * opinion. Likewise the grounding guard: a generative-imagery lane on a data-bearing fact is rejected outright
 * (generative models fabricate numbers; data stays in the deterministic kit).
 *
 * Zod-strict from day one — the contract⟷type parity corpse class (fontDisplay / videoStyle) is prevented at
 * birth: the schema and the types live together and every consumer parses.
 */

import { z } from 'zod';

// ─── the three output lanes a designed moment can take ───
// overlay-kit:          pure kit composition over footage (transparent WebP sequence — the existing lane).
// illustrated-overlay:  a GENERATED backdrop image/clip (Omni/Veo — no text, no numbers) with the kit's designed
//                       type/data layer composited over it. The Vox/Iman-level formula: imagery from the
//                       generative engine, honest type/data from the deterministic kit.
// cutaway-scene:        a full-frame generated scene that REPLACES footage (opaque video asset on the video
//                       track — Veo has no alpha). NON-DATA moments only (hard guard below).
export const MG_DESIGN_LANES = ['overlay-kit', 'illustrated-overlay', 'cutaway-scene'] as const;
export type MgDesignLane = (typeof MG_DESIGN_LANES)[number];

/** The anchor bar a moment's design aims at — self-declared by the designer, verified by the frame-armed judge. */
export const MG_TARGET_BARS = ['vox-clarity', 'hormozi-energy', 'gadzhi-restraint'] as const;
export type MgTargetBar = (typeof MG_TARGET_BARS)[number];

// ─── the element vocabulary — EXACTLY the kit's primitives (scan-safe by construction) ───
// TEXT elements alone cannot carry a design (the form floor below); FORM-bearing elements can.
export const MG_TEXT_ELEMENTS = ['headline', 'text', 'chip'] as const;
export const MG_FORM_ELEMENTS = ['bar', 'ring', 'plot', 'rule', 'dot', 'plate', 'reveal', 'particles', 'texture', 'motif'] as const;
export const MG_ELEMENT_KINDS = [...MG_TEXT_ELEMENTS, ...MG_FORM_ELEMENTS] as const;
export type MgElementKind = (typeof MG_ELEMENT_KINDS)[number];

const boundedString = (max: number) => z.string().min(1).max(max);

/** One designed element. `dataProps` binds real values BY NAME (grounding: the coder reads data.<prop>, never a
 *  literal). `role` says what this element DOES in the design ("step marker", "the true-ratio bar", "underline
 *  draw for the keyword") — the coder's intent, the judge's checklist. */
export const mgDesignElementSchema = z.object({
  kind: z.enum(MG_ELEMENT_KINDS),
  role: boundedString(160),
  dataProps: z.array(z.string().min(1).max(80)).max(8).default([]),
  /** Optional kit-vocabulary hints the coder must honour (face/size/surface/tone/accentWords etc. — free-form
   *  keys but bounded values so the plan stays a PLAN, not code). */
  hints: z.record(z.string().max(40), z.string().max(120)).optional(),
}).strict();
export type MgDesignElement = z.infer<typeof mgDesignElementSchema>;

/** Generative imagery spec for the illustrated-overlay / cutaway-scene lanes. The prompt describes SUBJECT,
 *  MOOD, PALETTE — and must contain no text/numbers/logos instructions (the renderer-side rule; the validator
 *  enforces the lane/data guard, the judge sees the result). */
export const mgDesignImagerySchema = z.object({
  /** What the generated scene depicts (no on-image text, no numbers, no logos — type is the kit's job). */
  scenePrompt: boundedString(600),
  /** still = generated image backdrop (cheap, kit animates over it); motion = a Veo clip. */
  mode: z.enum(['still', 'motion']),
  /** Palette steering words derived from the brand (e.g. "warm gold accents on deep charcoal"). */
  paletteDirection: boundedString(200),
}).strict();
export type MgDesignImagery = z.infer<typeof mgDesignImagerySchema>;

/** Per-moment motion choreography INTENT (frames stay computed from phases at code time — never hard frames). */
export const mgDesignMotionSchema = z.object({
  /** The entrance order as element indices into `elements` (reading order = build order). */
  enterOrder: z.array(z.number().int().nonnegative()).max(12),
  /** What the build phase does ("stagger the three cards 4f apart, each rising"), and the settled hold's life. */
  build: boundedString(240),
  hold: boundedString(160),
  /** Sync targets: word onsets / beats / the landing frame (the coder anchors to anchors.* + phases). */
  syncTo: z.enum(['word-onsets', 'beats', 'landing', 'phases-only']),
}).strict();
export type MgDesignMotion = z.infer<typeof mgDesignMotionSchema>;

/** ONE moment's design. The gateable unit: concept + structure + elements + motion — judged BEFORE rendering. */
export const mgMomentDesignPlanSchema = z.object({
  momentId: boundedString(240),
  lane: z.enum(MG_DESIGN_LANES),
  /** The design idea in one sentence — "three steps as staggered numbered cards climbing the negative space". */
  concept: boundedString(240),
  targetBar: z.enum(MG_TARGET_BARS),
  /** Layout skeleton: where the composition sits and how the eye reads it. */
  structure: z.object({
    placement: boundedString(160),
    grouping: boundedString(240),
    readingOrder: boundedString(240),
  }).strict(),
  elements: z.array(mgDesignElementSchema).min(1).max(12),
  imagery: mgDesignImagerySchema.optional(),
  motion: mgDesignMotionSchema,
}).strict();
export type MgMomentDesignPlan = z.infer<typeof mgMomentDesignPlanSchema>;

/** The video-level brief — the coherent graphic language every moment composes within (broadcast-package
 *  coherence: one motif language per video, varied forms within it). */
export const mgVideoDesignBriefSchema = z.object({
  styleName: boundedString(80),
  /** The recurring graphic device for THIS video ("a thin gold rule that draws under every key term"). */
  motifLanguage: boundedString(240),
  paletteMoves: boundedString(240),
  motionPersonality: boundedString(160),
  /** How form is DISTRIBUTED across moments (the anti-monotony intent, stated so the gate can check it). */
  formVariety: boundedString(300),
}).strict();
export type MgVideoDesignBrief = z.infer<typeof mgVideoDesignBriefSchema>;

export const mgVideoDesignPlanSchema = z.object({
  brief: mgVideoDesignBriefSchema,
  moments: z.array(mgMomentDesignPlanSchema).min(1).max(24),
}).strict();
export type MgVideoDesignPlan = z.infer<typeof mgVideoDesignPlanSchema>;

// ─── deterministic validation beyond the schema (R18N: the floor is structural, not judged) ───

/** Quantitative fact kinds — the same set codegen-service treats as data (R7). Generative imagery lanes must
 *  never carry these (fabrication risk); their values render through the deterministic kit only. */
const DATA_FACT_KINDS = new Set(['weak-stat', 'bounded-stat', 'magnitude-stat', 'series', 'comparison']);

const FORM_KINDS = new Set<string>(MG_FORM_ELEMENTS);

export interface MgDesignPlanMomentContext {
  momentId: string;
  factKind: string;
  /** The candidate's visualizable content prop names — every element dataProp must exist here. */
  contentProps: string[];
}

export interface MgDesignPlanValidation {
  ok: boolean;
  problems: string[];
}

/**
 * Validate a video design plan against the licensed moments it claims to design. Deterministic REJECT (never a
 * judge's call) for: a moment the plan missed / invented; a text-only design with no imagery (the lazy-list
 * killer — form is MANDATORY); a generative lane on a data-bearing fact (grounding); a dataProp that does not
 * exist on the candidate (fabrication-by-reference); a cutaway that binds data at all; enterOrder indices out of
 * range; duplicate moment plans.
 */
export function validateDesignPlan(plan: MgVideoDesignPlan, moments: MgDesignPlanMomentContext[]): MgDesignPlanValidation {
  const problems: string[] = [];
  const byId = new Map(moments.map((m) => [m.momentId, m]));
  const seen = new Set<string>();

  for (const mp of plan.moments) {
    const ctx = byId.get(mp.momentId);
    if (!ctx) { problems.push(`${mp.momentId}: plan designs a moment that does not exist`); continue; }
    if (seen.has(mp.momentId)) { problems.push(`${mp.momentId}: duplicate design plan`); continue; }
    seen.add(mp.momentId);

    const hasForm = mp.elements.some((e) => FORM_KINDS.has(e.kind));
    if (!hasForm && !mp.imagery) {
      problems.push(`${mp.momentId}: TEXT-ONLY design (no form-bearing element, no imagery) — words on a panel is a slide, not a motion graphic`);
    }
    if (mp.lane !== 'overlay-kit' && !mp.imagery) {
      problems.push(`${mp.momentId}: lane '${mp.lane}' requires an imagery spec`);
    }
    if (mp.lane === 'overlay-kit' && mp.imagery) {
      problems.push(`${mp.momentId}: overlay-kit lane must not carry imagery (pick illustrated-overlay)`);
    }
    if (mp.lane === 'cutaway-scene' && DATA_FACT_KINDS.has(ctx.factKind)) {
      problems.push(`${mp.momentId}: cutaway-scene on data fact '${ctx.factKind}' — generative scenes never carry data (grounding)`);
    }
    if (mp.lane === 'cutaway-scene' && mp.elements.some((e) => e.dataProps.length > 0)) {
      problems.push(`${mp.momentId}: cutaway-scene elements must not bind data props`);
    }
    const props = new Set(ctx.contentProps);
    for (const e of mp.elements) {
      for (const p of e.dataProps) {
        if (!props.has(p)) problems.push(`${mp.momentId}: element '${e.role}' binds unknown data prop '${p}' (fabrication-by-reference)`);
      }
    }
    for (const idx of mp.motion.enterOrder) {
      if (idx >= mp.elements.length) problems.push(`${mp.momentId}: motion.enterOrder index ${idx} out of range (${mp.elements.length} elements)`);
    }
  }
  for (const m of moments) {
    if (!seen.has(m.momentId)) problems.push(`${m.momentId}: moment has NO design plan (every licensed moment must be designed or explicitly declined upstream)`);
  }
  return { ok: problems.length === 0, problems };
}

export function parseMgVideoDesignPlan(value: unknown): MgVideoDesignPlan {
  return mgVideoDesignPlanSchema.parse(value);
}
