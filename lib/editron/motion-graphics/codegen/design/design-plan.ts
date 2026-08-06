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
import { tasteConfidenceSchema } from '../taste/taste-schemas';

// ─── the three output lanes a designed moment can take ───
// overlay-kit:          pure kit composition over footage (transparent WebP sequence — the existing lane).
// illustrated-overlay:  a GENERATED backdrop image/clip (Omni/Veo — no text, no numbers) with the kit's designed
//                       type/data layer composited over it. The Vox/Iman-level formula: imagery from the
//                       generative engine, honest type/data from the deterministic kit.
// cutaway-scene:        a full-frame generated scene that REPLACES footage (opaque video asset on the video
//                       track — Veo has no alpha). NON-DATA moments only (hard guard below).
export const MG_DESIGN_LANES = ['overlay-kit', 'illustrated-overlay', 'cutaway-scene'] as const;
export type MgDesignLane = (typeof MG_DESIGN_LANES)[number];

/** The LOCAL, semantic communicative job each designed moment serves (brief §6.6). A communicative job is NOT a
 *  content-type label — it is the rhetorical move the graphic makes for ITS licensed fact. */
export const MG_COMMUNICATIVE_JOBS = [
  'identify', 'quantify', 'compare', 'sequence', 'locate', 'relate', 'explain_causality',
  'emphasize', 'quote', 'punctuate', 'transition', 'other',
] as const;
export type MgCommunicativeJob = (typeof MG_COMMUNICATIVE_JOBS)[number];

/** The QUALITY LENS a moment is judged through — clarity (does it read instantly), energy (is it alive), or
 *  restraint (is it considered). LENSES, NOT STYLES (founder-corrected 2026-07-18): naming them after creators
 *  made a 3-preset taxonomy — the exact Rule-11 failure one level up. A video's STYLE comes from its own 8-axis
 *  style identity (the style resolver) + the brief's motif language; the lens only tells the judge which failure
 *  mode matters most for THIS moment. Self-declared by the designer, verified by the frame-armed judge. */
export const MG_TARGET_BARS = ['clarity', 'energy', 'restraint'] as const;
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
  /** THE LOOK AXIS (P4, founder mandate made structural): 'integrated' = type lives IN the footage
   *  (shade()/halo, SceneGrade, scene-anchored marks — NO Plate cards); 'panel' = a surfaced card, allowed
   *  ONLY with a stated design reason (scorecard, data panel). Default integrated: boxless is the law,
   *  panel is the justified exception — enforced by validateDesignPlan, not by judge opinion. */
  look: z.enum(['integrated', 'panel']).default('integrated'),
  panelReason: boundedString(200).optional(),
  /** CUTAWAY ATTESTATION (founder-approved 2026-07-19): a cutaway-scene design must state why the footage
   *  does not already show this subject — cutting away to what's on screen is redundant B-roll. The designer
   *  demonstrably CAN judge this (live decline: "footage already contains a hardcoded lower-third"); this
   *  field forces the judgment to be explicit. VLM verification of the claim lands at P5. */
  footageRedundancy: boundedString(200).optional(),
  // ── Taste authority + communicative intent (brief §6.6, Phase 3) ──
  // The JUDGE verifies contract fidelity against these; the DESIGNER declares what the moment communicates.
  // NOTE (single-form-owner, AGENTS 12): hierarchy/geometry/motion "plans" are NOT re-listed here — they are
  // already owned by structure.* and motion. These fields are evidence + intent, never duplicated final form.
  primaryCommunicativeJob: z.enum(MG_COMMUNICATIVE_JOBS),
  secondaryCommunicativeJobs: z.array(z.enum(MG_COMMUNICATIVE_JOBS)).max(3).optional(),
  /** The video-level taste contract this moment inherits (Phase-4 wiring supplies it; required then). */
  tasteContractId: boundedString(240).optional(),
  tasteContractHash: boundedString(64).optional(),
  /** The meaning the design must encode — the judge checks semantic effectiveness against it (§6.6 semanticPayload). */
  semanticPayload: boundedString(240).optional(),
  intendedViewerResponse: boundedString(240).optional(),
  spokenBeatOrTimestamp: boundedString(160).optional(),
  visualMetaphor: boundedString(240).optional(),
  designConfidence: tasteConfidenceSchema.optional(),
  intentionalDeviations: z.array(z.object({
    property: boundedString(80),
    reason: boundedString(200),
  })).max(6).default([]),
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

/** A beat the designer chose NOT to design (the licensing half of the P3.5 door, founder decision 2026-07-18).
 *  Every undesigned beat must be declined WITH a reason — silence is a contract violation, not a decline. */
export const mgDesignDeclineSchema = z.object({
  momentId: boundedString(240),
  reason: boundedString(240),
}).strict();
export type MgDesignDecline = z.infer<typeof mgDesignDeclineSchema>;

export const mgVideoDesignPlanSchema = z.object({
  brief: mgVideoDesignBriefSchema,
  /** min(0): a designer may honestly decline every beat — no-MG beats a forced bad one. */
  moments: z.array(mgMomentDesignPlanSchema).min(0).max(24),
  /** Beats licensed away. Empty/absent under pre-licensed legacy input (every moment then needs a design).
   *  Cap ≤1000, not 48: the P3.5 door's coverage rule puts EVERY non-licensed beat here, so this must hold ~all
   *  beats a single-call video feeds. 48 rejected the designer's own valid plan for any video over ~4 min (found
   *  by the 8-min Hormozi stress test: 109 beats → 19 licensed + 90 declined → parse threw). 1000 ≈ ~70 min of
   *  dense speech at the measured ~14 beats/min; a genuinely long video (a 2h talk ≈ 1600 beats) exceeds this BY
   *  DESIGN and MUST window the design session per segment — the single designer call does not scale to feature
   *  length (context + cost). The cap still fails loud on runaway output (R18N). */
  declined: z.array(mgDesignDeclineSchema).max(1000).default([]),
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
  /** Names of the NUMERIC content props. When provided, quantitative elements (bar/ring/plot) must bind
   *  one — the designer-overreach class (a plot on a qualitative beat) becomes a plan-time reject instead
   *  of a wasted coder decline (3× live 2026-07-18). Absent → the rule is skipped (legacy callers). */
  numericProps?: string[];
  /** The beat's start on the timeline (ms). When provided, cutaway spacing is enforced (see validator).
   *  Absent → spacing rule skipped (legacy callers). */
  startMs?: number;
}

export interface MgDesignPlanValidation {
  ok: boolean;
  problems: string[];
}

/** The licensing envelope (P3.5 door): the designer designs AT MOST maxMoments of the offered beats. */
export interface MgDesignPlanBudget {
  maxMoments: number;
}

/**
 * Validate a video design plan against the moments/beats it was offered. Deterministic REJECT (never a
 * judge's call) for: a moment the plan missed / invented; a text-only design with no imagery (the lazy-list
 * killer — form is MANDATORY); a generative lane on a data-bearing fact (grounding); a dataProp that does not
 * exist on the candidate (fabrication-by-reference); a cutaway that binds data at all; enterOrder indices out of
 * range; duplicate moment plans. With a `budget` (beat-licensing input): every offered beat must be designed
 * XOR declined-with-reason, and the designed count must not exceed the budget.
 */
export function validateDesignPlan(
  plan: MgVideoDesignPlan,
  moments: MgDesignPlanMomentContext[],
  budget?: MgDesignPlanBudget,
): MgDesignPlanValidation {
  const problems: string[] = [];
  const byId = new Map(moments.map((m) => [m.momentId, m]));
  const seen = new Set<string>();

  const declined = new Set<string>();
  for (const d of plan.declined ?? []) {
    if (!byId.has(d.momentId)) { problems.push(`${d.momentId}: declines a beat that does not exist`); continue; }
    if (declined.has(d.momentId)) { problems.push(`${d.momentId}: duplicate decline`); continue; }
    declined.add(d.momentId);
  }
  if (budget && plan.moments.length > budget.maxMoments) {
    problems.push(`plan designs ${plan.moments.length} moments — over the density budget of ${budget.maxMoments}`);
  }

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
    // CUTAWAY ATTESTATION (founder-approved 2026-07-19): a cutaway must state why footage doesn't already
    // show its subject — redundant B-roll is a decline, not a design.
    if (mp.lane === 'cutaway-scene' && !mp.footageRedundancy) {
      problems.push(`${mp.momentId}: cutaway-scene without footageRedundancy — state why the footage does not already show this subject, or decline the beat`);
    }
    // The look axis has TEETH (P4): an integrated design may not even CONTAIN a plate element, and a
    // panel look must state its design reason — the boxless mandate is a contract, not a judge's opinion.
    if (mp.look === 'panel' && !mp.panelReason) {
      problems.push(`${mp.momentId}: look 'panel' without panelReason — a card is the exception and needs its design reason stated`);
    }
    if (mp.look === 'integrated' && mp.elements.some((e) => e.kind === 'plate')) {
      problems.push(`${mp.momentId}: look 'integrated' cannot contain a 'plate' element — either design scene-integrated (shade/halo/SceneGrade) or declare look 'panel' with a reason`);
    }
    const props = new Set(ctx.contentProps);
    for (const e of mp.elements) {
      for (const p of e.dataProps) {
        if (!props.has(p)) problems.push(`${mp.momentId}: element '${e.role}' binds unknown data prop '${p}' (fabrication-by-reference)`);
      }
    }
    // Quantitative marks need quantities (P4): bar/ring/plot on a beat with no numeric prop is designer
    // overreach — the coder would honestly decline ("cannot fabricate points"), wasting a full cycle.
    if (ctx.numericProps) {
      const numeric = new Set(ctx.numericProps);
      for (const e of mp.elements) {
        if ((e.kind === 'bar' || e.kind === 'ring' || e.kind === 'plot') && !e.dataProps.some((p) => numeric.has(p))) {
          problems.push(`${mp.momentId}: '${e.kind}' element '${e.role}' binds no numeric data prop — quantitative marks need real numbers; use type/rule/dot/motif for qualitative beats`);
        }
      }
    }
    // Taste-contract pairing (brief §6.6/§21): a designed moment must reference a contract by BOTH id and hash,
    // or neither. Half-provisioned provenance is a reproducibility violation, not a silent default.
    if (mp.tasteContractId != null || mp.tasteContractHash != null) {
      if (!mp.tasteContractId || !mp.tasteContractHash) {
        problems.push(`${mp.momentId}: tasteContractId and tasteContractHash must be provided together`);
      }
    }
    for (const idx of mp.motion.enterOrder) {
      if (idx >= mp.elements.length) problems.push(`${mp.momentId}: motion.enterOrder index ${idx} out of range (${mp.elements.length} elements)`);
    }
  }
  // CUTAWAY SPACING (founder-approved 2026-07-19: "max 1 cutaway per minute, never back-to-back" — direction
  // from B-roll pacing practice; cutaways interrupt the speaker, so they are spaced like scene changes, not
  // like overlays whose 3s spacing the density budget already carries). Enforced only when beats carry startMs.
  const CUTAWAY_MIN_SPACING_MS = 60_000;
  const cutaways = plan.moments
    .filter((mp) => mp.lane === 'cutaway-scene')
    .map((mp) => ({ id: mp.momentId, startMs: byId.get(mp.momentId)?.startMs }))
    .filter((c): c is { id: string; startMs: number } => typeof c.startMs === 'number')
    .sort((a, b) => a.startMs - b.startMs);
  for (let i = 1; i < cutaways.length; i += 1) {
    if (cutaways[i].startMs - cutaways[i - 1].startMs < CUTAWAY_MIN_SPACING_MS) {
      problems.push(`${cutaways[i].id}: cutaway within ${Math.round((cutaways[i].startMs - cutaways[i - 1].startMs) / 1000)}s of cutaway ${cutaways[i - 1].id} — cutaways are spaced ≥${CUTAWAY_MIN_SPACING_MS / 1000}s apart (one per minute, never adjacent)`);
    }
  }
  for (const mp of plan.moments) {
    if (declined.has(mp.momentId)) problems.push(`${mp.momentId}: both designed AND declined — pick one`);
  }
  for (const m of moments) {
    if (!seen.has(m.momentId) && !declined.has(m.momentId)) {
      problems.push(`${m.momentId}: beat has NO design and NO decline (every offered beat must be designed or declined with a reason)`);
    }
  }
  return { ok: problems.length === 0, problems };
}

/**
 * SALVAGE a plan that failed validation instead of throwing the whole video's design away (finding #3 from the
 * 2026-07-19 Hormozi stress run: one bad moment — e.g. a ring bound to no number — aborted a 33-beat plan, and
 * production then fell back to free-form for EVERY decided graphic). A studio drops the one bad board and keeps
 * the rest; so do we. Every validator problem is prefixed `momentId:` (moment-attributable) or is the plan-level
 * budget overflow — so we can map problems to the moments that caused them, DECLINE those, keep the clean ones,
 * decline any budget overflow + coverage gaps, and re-validate. Returns null only when NOTHING survives (then the
 * caller degrades to free-form, exactly as before — never a regression).
 */
export function salvageDesignPlan(
  plan: MgVideoDesignPlan,
  moments: MgDesignPlanMomentContext[],
  budget?: MgDesignPlanBudget,
): { plan: MgVideoDesignPlan; dropped: string[] } | null {
  if (validateDesignPlan(plan, moments, budget).ok) return { plan, dropped: [] };

  const knownIds = new Set(moments.map((m) => m.momentId));
  // Map each problem to the moment that caused it (prefix before the first ':'), keeping the first reason seen.
  const bad = new Map<string, string>();
  for (const p of validateDesignPlan(plan, moments, budget).problems) {
    const colon = p.indexOf(':');
    if (colon < 0) continue; // plan-level (budget) — handled by the budget trim below
    const id = p.slice(0, colon).trim();
    if (knownIds.has(id) && !bad.has(id)) bad.set(id, p.slice(colon + 1).trim());
  }

  let kept = plan.moments.filter((m) => !bad.has(m.momentId));
  const overBudget: string[] = [];
  if (budget && kept.length > budget.maxMoments) {
    overBudget.push(...kept.slice(budget.maxMoments).map((m) => m.momentId));
    kept = kept.slice(0, budget.maxMoments);
  }

  const keptIds = new Set(kept.map((m) => m.momentId));
  const declines = new Map<string, string>();
  for (const d of plan.declined ?? []) if (knownIds.has(d.momentId) && !keptIds.has(d.momentId)) declines.set(d.momentId, d.reason);
  for (const [id, reason] of bad) if (!keptIds.has(id)) declines.set(id, `salvage: ${reason}`);
  for (const id of overBudget) declines.set(id, 'salvage: over the density budget');
  for (const m of moments) if (!keptIds.has(m.momentId) && !declines.has(m.momentId)) declines.set(m.momentId, 'salvage: not designed');

  const salvaged: MgVideoDesignPlan = {
    ...plan,
    moments: kept,
    declined: Array.from(declines, ([momentId, reason]) => ({ momentId, reason: reason.slice(0, 240) })),
  };
  return validateDesignPlan(salvaged, moments, budget).ok
    ? { plan: salvaged, dropped: [...bad.keys(), ...overBudget] }
    : null;
}

export function parseMgVideoDesignPlan(value: unknown): MgVideoDesignPlan {
  return mgVideoDesignPlanSchema.parse(value);
}

/**
 * The single source of truth for MgDesignPlanMomentContext.numericProps: a content prop is NUMERIC (a valid
 * bind target for a bar/ring/plot) when its value is a scalar number OR an all-number array — a series's
 * `values: [12,34,58,91]` is legitimately plottable. Deriving this from a lossy 'list'|'number'|'text' kind
 * wrongly excludes numeric arrays and false-rejects a correct plot (caught in the P4 matrix, 2026-07-18);
 * always derive from the raw content values through this helper so every caller (harnesses + the P5 seam)
 * agrees.
 */
export function deriveNumericProps(content: Record<string, unknown>): string[] {
  const isNumeric = (v: unknown): boolean =>
    typeof v === 'number' || (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number'));
  return Object.entries(content).filter(([, v]) => isNumeric(v)).map(([k]) => k);
}

// ─── output-mode routing (4b-3) ───

/** How a designed moment's RENDER leaves the pipeline:
 *  - 'alpha-overlay': transparent WebP sequence composited over footage (the default, every overlay-kit moment
 *    and every WINDOWED illustrated scene — outside its window the frame stays transparent).
 *  - 'opaque-scene': a FULL-FRAME illustrated Scene — the generated backdrop fills the frame, so the render is
 *    legitimately opaque and lands as a video-track-style asset (cutaway plumbing). The alpha floor checks that
 *    veto near-opaque OVERLAYS must not veto this. */
export type MgDesignOutputMode = 'alpha-overlay' | 'opaque-scene';

/**
 * Derive the output mode DETERMINISTICALLY from the plan — never sniffed from rendered pixels (R18N: the
 * expectation is declared, so an overlay that accidentally renders opaque still fails loud). `placementRegion`
 * is the moment's resolved region (moment-input defaults it to 'full-frame' when the candidate names none).
 */
export function designOutputMode(plan: MgMomentDesignPlan, placementRegion?: string): MgDesignOutputMode {
  return plan.lane === 'illustrated-overlay' && (placementRegion ?? 'full-frame') === 'full-frame'
    ? 'opaque-scene'
    : 'alpha-overlay';
}
