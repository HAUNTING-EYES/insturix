/**
 * MG Codegen — the VIDEO-LEVEL DESIGN SESSION (P5-1 Phase C, the brain in production).
 *
 * One session per video: the designer sees EVERY beat + the sampled footage + the density budget, then writes a
 * validated MgVideoDesignPlan (brief + per-moment designs + declines). This is the production entry point for the
 * design-then-code lane that, until now, ran only in scripts/prompt-optimization. The seam (edl-executor, next
 * commit) collects the video's licensed candidates, samples frames, provides the real Gemini `generate`, and
 * consumes the returned plans per moment.
 *
 * DEPENDENCY-INJECTED model call (same contract as imagery-client.ts, "testable with a fake, provider-swappable"):
 * the caller passes `generate`, so this module is pure orchestration — no key, no fetch, no Remotion — and unit-
 * testable without a network. It reuses buildDesignerParts (multimodal), extractDesignPlanJson, the Zod contract,
 * validateDesignPlan (form floor + grounding + lane guards + look axis + cutaway rules + budget), and retries once
 * with the rejection reason fed back (Rule 35 self-correction).
 *
 * FAIL HONEST (R2N/R18N): a model failure or an unfixable plan returns `{ plan: null, reason }` — never a
 * fabricated plan. The caller degrades to the per-moment path (today's production behaviour), so a bad design
 * session can never produce a worse video than shipping no design session at all.
 */

import { z } from 'zod';

import {
  buildDesignerParts,
  extractDesignPlanJson,
  type MgDesignerInput,
  type MgDesignerPart,
  type MgDesignerSessionImages,
} from './designer-prompt';
import {
  mgVideoDesignPlanSchema,
  validateDesignPlan,
  salvageDesignPlan,
  type MgDesignPlanMomentContext,
  type MgVideoDesignPlan,
} from './design-plan';

/** The injected model call: fully-built multimodal designer parts → the model's raw text response. */
export type MgDesignerGenerate = (parts: MgDesignerPart[]) => Promise<string>;

export interface MgDesignSessionInput {
  /** The designer prompt input: intent, videoStyle, brand, ALL beats as moments, and the density budget. */
  designer: MgDesignerInput;
  /** Validation contexts (one per offered beat) — factKind, contentProps, numericProps, startMs. */
  contexts: MgDesignPlanMomentContext[];
  /** Multimodal session images: the level moodboard (anchor frames) + THIS video's sampled footage frames. */
  images?: MgDesignerSessionImages;
}

export interface MgDesignSessionResult {
  /** The validated plan, or null when the model failed or produced an unfixable plan (caller falls back). */
  plan: MgVideoDesignPlan | null;
  /** Why the plan is null (logged) — model error or the last validation problems. Absent on success. */
  reason?: string;
  /** Attempts made (1 or 2). */
  attempts: number;
}

const designReviewSchema = z.object({
  accepted: z.boolean(),
  hardFailures: z.object({
    decorativeFormOnly: z.boolean(),
    primitiveChecklist: z.boolean(),
    missingVisualEncoding: z.boolean(),
    flatHierarchy: z.boolean(),
    decorativeMotionOnly: z.boolean(),
    repetitiveWithinVideo: z.boolean(),
    footageConflict: z.boolean(),
  }).strict(),
  issues: z.array(z.string().min(1).max(240)).max(12),
}).strict();

const DESIGN_REVIEW_STABLE_PREFIX = `<role>
You are the independent motion-design PLAN critic. You do not write or repair the plan. Decide whether the plan
contains enough semantic visual thinking to justify expensive code generation. Judge the DESIGN, not rendered
pixels and not implementation details. Return strict JSON only.
</role>

<hard_failures>
- decorativeFormOnly: the purported form is merely a lone rule, dot, motif, texture, particles, or ornamental
  flourish beside text; it does not make the licensed meaning visually understandable.
- primitiveChecklist: elements are listed but do not form one composed visual system with deliberate relations.
- missingVisualEncoding: the plan never explains through its concept, roles, grouping, and data bindings how visual
  position, scale, quantity, sequence, contrast, or transformation carries the licensed meaning.
- flatHierarchy: the stated structure has no clear entry point and reading progression appropriate to the content.
- decorativeMotionOnly: motion adds activity but does not reveal, compare, transform, build, or land meaning.
- repetitiveWithinVideo: the video plan repeats substantially the same structure across moments despite claiming
  variety. A recurring motif is coherent; repeating the entire composition is not.
- footageConflict: placement/look ignores the supplied footage, subject, captions, or available negative space.
</hard_failures>

Do not reject restraint, minimalism, equal-weight members of a true set, or use of kit primitives. Reject shallow
design reasoning. The plan may use familiar primitives, but their relationships and choreography must be authored
for this fact, this moment, this footage, and this video. accepted may be true only when every hard failure is false.

Return exactly:
{"accepted":boolean,"hardFailures":{"decorativeFormOnly":boolean,"primitiveChecklist":boolean,
"missingVisualEncoding":boolean,"flatHierarchy":boolean,"decorativeMotionOnly":boolean,
"repetitiveWithinVideo":boolean,"footageConflict":boolean},"issues":[string]}`;

function designReviewParts(input: MgDesignSessionInput, plan: MgVideoDesignPlan): MgDesignerPart[] {
  const parts: MgDesignerPart[] = [{ kind: 'text', text: DESIGN_REVIEW_STABLE_PREFIX }];
  for (const [index, image] of (input.images?.moodboard ?? []).entries()) {
    parts.push({ kind: 'text', text: `PROFESSIONAL LEVEL REFERENCE ${index + 1}: judge investment only; never demand copied style.` });
    parts.push({ kind: 'image', mimeType: image.mimeType, data: image.data });
  }
  for (const [index, image] of (input.images?.footageFrames ?? []).entries()) {
    parts.push({ kind: 'text', text: `ACTUAL FOOTAGE FRAME ${index + 1}` });
    parts.push({ kind: 'image', mimeType: image.mimeType, data: image.data });
  }
  parts.push({
    kind: 'text',
    text: `<licensed_moments>${JSON.stringify(input.designer.moments)}</licensed_moments>\n<design_plan>${JSON.stringify(plan)}</design_plan>`,
  });
  return parts;
}

async function reviewDesignPlan(
  input: MgDesignSessionInput,
  plan: MgVideoDesignPlan,
  generate: MgDesignerGenerate,
): Promise<{ accepted: true } | { accepted: false; reason: string }> {
  try {
    const raw = await generate(designReviewParts(input, plan));
    const review = designReviewSchema.parse(extractDesignPlanJson(raw));
    const failures = Object.entries(review.hardFailures)
      .filter(([, active]) => active)
      .map(([name]) => name);
    if (review.accepted && failures.length === 0) return { accepted: true };
    const reason = [...failures, ...review.issues].slice(0, 6).join('; ');
    return { accepted: false, reason: reason || 'plan critic rejected the design without a reason' };
  } catch (error) {
    return {
      accepted: false,
      reason: `plan critic failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 240),
    };
  }
}

/** Append the rejection reason to the volatile LAST text part (keeps data LAST, Rule 35) for the retry. */
function withFeedback(parts: MgDesignerPart[], reason: string): MgDesignerPart[] {
  const out = parts.slice();
  const lastIdx = out.length - 1;
  const last = out[lastIdx];
  if (last && last.kind === 'text') {
    out[lastIdx] = {
      kind: 'text',
      text: `${last.text}\n\n<previous_attempt_feedback>\nThe previous plan was rejected: ${reason}. Return the corrected complete JSON only.\n</previous_attempt_feedback>`,
    };
  }
  return out;
}

/**
 * F2 (2026-07-19): when the designer over-designs (> maxMoments), TRIM to the top-N beats by salience — moving the
 * overflow to `declined` — instead of voiding the WHOLE video's design. One over-design then forfeits only the
 * weakest moment(s), never every design. Preserves coverage (dropped beats become declined) so the plan still
 * validates. Salience comes from the OFFERED beats (the plan's moments don't carry it); an unknown id ranks 0.
 */
function trimPlanToBudget(
  plan: MgVideoDesignPlan,
  maxMoments: number,
  offered: MgDesignerInput['moments'],
): MgVideoDesignPlan {
  if (plan.moments.length <= maxMoments) return plan;
  const salienceById = new Map(offered.map((m) => [m.momentId, m.salience]));
  const ranked = [...plan.moments].sort((a, b) => (salienceById.get(b.momentId) ?? 0) - (salienceById.get(a.momentId) ?? 0));
  const keptIds = new Set(ranked.slice(0, maxMoments).map((m) => m.momentId));
  const dropped = ranked.slice(maxMoments);
  return {
    ...plan,
    moments: plan.moments.filter((m) => keptIds.has(m.momentId)), // keep original order among the survivors
    declined: [
      ...(plan.declined ?? []),
      ...dropped.map((m) => ({ momentId: m.momentId, reason: 'over budget — trimmed (lowest salience)' })),
    ],
  };
}

/**
 * Run one video-level design session. Deterministic given the same model output; retries once on a rejected plan
 * with the reason fed back. Never throws — every failure path resolves to { plan: null, reason }.
 */
export async function runVideoDesignSession(
  input: MgDesignSessionInput,
  deps: { generate: MgDesignerGenerate; maxAttempts?: number },
): Promise<MgDesignSessionResult> {
  const maxAttempts = Math.max(1, Math.min(3, deps.maxAttempts ?? 2));
  const budget = input.designer.budget;
  const baseParts = buildDesignerParts(input.designer, input.images ?? {});
  let lastReason = 'no attempt made';
  let lastPlan: MgVideoDesignPlan | null = null;
  let lastPlanPassedStructuralValidation = false;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const parts = attempt === 0 ? baseParts : withFeedback(baseParts, lastReason);
    let text: string;
    try {
      text = await deps.generate(parts);
    } catch (error) {
      lastReason = `designer model call failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 180);
      continue;
    }
    try {
      const parsed = mgVideoDesignPlanSchema.parse(extractDesignPlanJson(text));
      // F2: trim an over-budget plan to the top-N by salience rather than voiding it, THEN validate.
      const plan = budget ? trimPlanToBudget(parsed, budget.maxMoments, input.designer.moments) : parsed;
      lastPlan = plan;
      const validation = validateDesignPlan(plan, input.contexts, budget ? { maxMoments: budget.maxMoments } : undefined);
      lastPlanPassedStructuralValidation = validation.ok;
      if (validation.ok) {
        const review = await reviewDesignPlan(input, plan, deps.generate);
        if (review.accepted) return { plan, attempts: attempt + 1 };
        lastReason = `design-quality review rejected: ${review.reason}`;
        continue;
      }
      lastReason = validation.problems.slice(0, 3).join(' | ') || 'plan failed validation';
    } catch (error) {
      lastPlanPassedStructuralValidation = false;
      lastReason = `plan parse/validation error: ${error instanceof Error ? error.message : String(error)}`.slice(0, 180);
    }
  }

  // Fix A (2026-07-19): every attempt failed validation. Rather than forfeit the WHOLE video's design — which the
  // Hormozi stress run showed drops ALL decided graphics to free-form over one bad moment (e.g. a ring bound to no
  // number) — SALVAGE the last plan: keep the valid moments, decline the invalid ones. Only when NOTHING valid
  // survives do we return null and let the caller degrade to free-form (never worse than before this fix).
  if (lastPlan && !lastPlanPassedStructuralValidation) {
    const salvaged = salvageDesignPlan(lastPlan, input.contexts, budget ? { maxMoments: budget.maxMoments } : undefined);
    if (salvaged && salvaged.plan.moments.length > 0) {
      const review = await reviewDesignPlan(input, salvaged.plan, deps.generate);
      if (review.accepted) {
        return {
          plan: salvaged.plan,
          attempts: maxAttempts,
          reason: `salvaged: kept ${salvaged.plan.moments.length}, dropped ${salvaged.dropped.length}${salvaged.dropped.length ? ` [${salvaged.dropped.slice(0, 5).join(', ')}]` : ''}`,
        };
      }
      lastReason = `salvaged design-quality review rejected: ${review.reason}`;
    }
  }

  return { plan: null, reason: lastReason, attempts: maxAttempts };
}
