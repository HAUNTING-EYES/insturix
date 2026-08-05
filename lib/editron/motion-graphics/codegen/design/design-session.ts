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
 * fabricated plan. The production caller declines those MG opportunities; it does not restore legacy graphic
 * authority or insert a fallback card.
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
  /** The validated plan, or null when the model failed or produced an unfixable plan (caller declines the MGs). */
  plan: MgVideoDesignPlan | null;
  /** Why the plan is null (logged) — model error or the last validation problems. Absent on success. */
  reason?: string;
  /** Attempts made (1 or 2). */
  attempts: number;
}

const momentDesignReviewSchema = z.object({
  momentId: z.string().min(1).max(240),
  accepted: z.boolean(),
  hardFailures: z.object({
    decorativeFormOnly: z.boolean(),
    primitiveChecklist: z.boolean(),
    genericPrimitiveStack: z.boolean(),
    missingVisualEncoding: z.boolean(),
    flatHierarchy: z.boolean(),
    decorativeMotionOnly: z.boolean(),
    footageConflict: z.boolean(),
  }).strict(),
  issues: z.array(z.string().min(1).max(1_000)).max(8),
}).strict();

const designReviewSchema = z.object({
  accepted: z.boolean(),
  packageFailures: z.object({ repetitiveWithinVideo: z.boolean() }).strict(),
  moments: z.array(momentDesignReviewSchema).max(24),
  issues: z.array(z.string().min(1).max(1_000)).max(12),
}).strict();

type RejectedDesignMoment = { momentId: string; reason: string };
type DesignReviewResult =
  | { accepted: true }
  | {
    accepted: false;
    reason: string;
    packageRejected: boolean;
    acceptedMomentIds: string[];
    rejectedMoments: RejectedDesignMoment[];
  };

const DESIGN_REVIEW_STABLE_PREFIX = `<role>
You are the independent motion-design PLAN critic. You do not write or repair the plan. Decide whether the plan
contains enough semantic visual thinking to justify expensive code generation. Judge the DESIGN, not rendered
pixels and not implementation details. Return strict JSON only.
</role>

<moment_hard_failures>
- decorativeFormOnly: the purported form is merely a lone rule, dot, motif, texture, particles, or ornamental
  flourish beside text; it does not make the licensed meaning visually understandable.
- primitiveChecklist: elements are listed but do not form one composed visual system with deliberate relations.
- genericPrimitiveStack: the arrangement is a reusable stock skeleton (for example, one standard data mark plus
  a readout and label) whose visual relationships could be copied unchanged onto unrelated facts. Familiar marks
  are allowed, but their arrangement, motif, and choreography must materially express THIS moment; style
  adjectives, glow, and polish do not make a generic skeleton bespoke.
- missingVisualEncoding: the plan never explains through its concept, roles, grouping, and data bindings how visual
  position, scale, quantity, sequence, contrast, or transformation carries the licensed meaning.
- flatHierarchy: the stated structure has no clear entry point and reading progression appropriate to the content.
- decorativeMotionOnly: motion adds activity but does not reveal, compare, transform, build, or land meaning.
- footageConflict: placement/look ignores the supplied footage, subject, captions, or available negative space.
</moment_hard_failures>

<package_hard_failures>
- repetitiveWithinVideo: the video plan repeats substantially the same structure across moments despite claiming
  variety. A recurring motif is coherent; repeating the entire composition is not.
</package_hard_failures>

Do not reject restraint, minimalism, equal-weight members of a true set, or use of kit primitives. Reject shallow
design reasoning. The plan may use familiar primitives, but their relationships and choreography must be authored
for this fact, this moment, this footage, and this video. Review EVERY designed moment exactly once. A weak moment
must not erase independently strong siblings: mark only that moment rejected. Package failures reject the package.
Top-level accepted may be true only when the package and every moment are accepted with every hard failure false.

Return exactly:
{"accepted":boolean,"packageFailures":{"repetitiveWithinVideo":boolean},
"moments":[{"momentId":string,"accepted":boolean,"hardFailures":{"decorativeFormOnly":boolean,
"primitiveChecklist":boolean,"genericPrimitiveStack":boolean,"missingVisualEncoding":boolean,"flatHierarchy":boolean,
"decorativeMotionOnly":boolean,"footageConflict":boolean},"issues":[string]}],"issues":[string]}`;

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
): Promise<DesignReviewResult> {
  try {
    const raw = await generate(designReviewParts(input, plan));
    const review = designReviewSchema.parse(extractDesignPlanJson(raw));
    const expectedIds = new Set(plan.moments.map((moment) => moment.momentId));
    const reviewedIds = new Set<string>();
    const coverageProblems: string[] = [];
    for (const momentReview of review.moments) {
      if (!expectedIds.has(momentReview.momentId)) coverageProblems.push(`unknown moment ${momentReview.momentId}`);
      if (reviewedIds.has(momentReview.momentId)) coverageProblems.push(`duplicate moment ${momentReview.momentId}`);
      reviewedIds.add(momentReview.momentId);
    }
    for (const momentId of expectedIds) {
      if (!reviewedIds.has(momentId)) coverageProblems.push(`missing moment ${momentId}`);
    }
    if (coverageProblems.length > 0) {
      return {
        accepted: false,
        reason: `plan critic coverage invalid: ${coverageProblems.slice(0, 6).join('; ')}`,
        packageRejected: true,
        acceptedMomentIds: [],
        rejectedMoments: plan.moments.map((moment) => ({
          momentId: moment.momentId,
          reason: 'plan critic did not return a complete one-to-one review',
        })),
      };
    }

    const packageFailures = Object.entries(review.packageFailures)
      .filter(([, active]) => active)
      .map(([name]) => name);
    const rejectedMoments: RejectedDesignMoment[] = [];
    const acceptedMomentIds: string[] = [];
    for (const momentReview of review.moments) {
      const failures = Object.entries(momentReview.hardFailures)
        .filter(([, active]) => active)
        .map(([name]) => name);
      if (momentReview.accepted && failures.length === 0) {
        acceptedMomentIds.push(momentReview.momentId);
      } else {
        const reasonParts = momentReview.issues.length > 0
          ? [...failures.slice(0, 3), momentReview.issues[0]]
          : failures.slice(0, 4);
        rejectedMoments.push({
          momentId: momentReview.momentId,
          reason: reasonParts.join('; ')
            || 'plan critic rejected the moment without a reason',
        });
      }
    }
    const unexplainedPackageRejection = !review.accepted && rejectedMoments.length === 0;
    const packageRejected = packageFailures.length > 0
      || unexplainedPackageRejection
      || (review.issues.length > 0 && rejectedMoments.length === 0);
    if (review.accepted && !packageRejected && rejectedMoments.length === 0) return { accepted: true };
    const reason = [
      ...packageFailures,
      ...review.issues,
      ...rejectedMoments.map((moment) => `${moment.momentId}: ${moment.reason}`),
    ].slice(0, 8).join('; ');
    return {
      accepted: false,
      reason: reason || 'plan critic rejected the design without a reason',
      packageRejected,
      acceptedMomentIds: packageRejected ? [] : acceptedMomentIds,
      rejectedMoments,
    };
  } catch (error) {
    return {
      accepted: false,
      reason: `plan critic failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 240),
      packageRejected: true,
      acceptedMomentIds: [],
      rejectedMoments: plan.moments.map((moment) => ({
        momentId: moment.momentId,
        reason: 'plan critic failed before producing a trustworthy moment review',
      })),
    };
  }
}

function salvageQualityReviewedPlan(
  plan: MgVideoDesignPlan,
  contexts: MgDesignPlanMomentContext[],
  budget: { maxMoments: number } | undefined,
  review: Exclude<DesignReviewResult, { accepted: true }>,
): { plan: MgVideoDesignPlan; dropped: string[] } | null {
  // Fail-honest isolation (brief §7.2): a COMPLETE per-moment critic review with ZERO accepted must not void the
  // whole video into `unavailable`. Emit an all-declined plan (each designed-but-rejected beat declined with its
  // critic reason) so the pre-pass records per-moment DECLINED — a designer/quality rejection is a DECLINE (fail
  // honest), never a system-level failure. Only a package failure (or structurally broken plan) stays unavailable.
  if (review.packageRejected) return null;
  const accepted = new Set(review.acceptedMomentIds);
  const rejectedReasons = new Map(review.rejectedMoments.map((moment) => [moment.momentId, moment.reason]));
  const kept = plan.moments.filter((moment) => accepted.has(moment.momentId));
  const declines = new Map((plan.declined ?? []).map((decline) => [decline.momentId, decline.reason]));
  for (const moment of plan.moments) {
    if (!accepted.has(moment.momentId)) {
      declines.set(
        moment.momentId,
        `quality review: ${rejectedReasons.get(moment.momentId) ?? 'not independently accepted'}`.slice(0, 240),
      );
    }
  }
  const candidate: MgVideoDesignPlan = {
    ...plan,
    moments: kept,
    declined: Array.from(declines, ([momentId, reason]) => ({ momentId, reason })),
  };
  return validateDesignPlan(candidate, contexts, budget).ok
    ? {
      plan: candidate,
      dropped: plan.moments.filter((moment) => !accepted.has(moment.momentId)).map((moment) => moment.momentId),
    }
    : null;
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
  let lastQualityReview: Exclude<DesignReviewResult, { accepted: true }> | null = null;

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
        lastQualityReview = review;
        lastReason = `design-quality review rejected: ${review.reason}`;
        continue;
      }
      lastQualityReview = null;
      lastReason = validation.problems.slice(0, 3).join(' | ') || 'plan failed validation';
    } catch (error) {
      lastPlanPassedStructuralValidation = false;
      lastQualityReview = null;
      lastReason = `plan parse/validation error: ${error instanceof Error ? error.message : String(error)}`.slice(0, 180);
    }
  }

  // Preserve independently accepted moments when the final quality review rejects only their siblings. A package
  // failure still rejects everything; when nothing trustworthy survives, the caller declines instead of restoring
  // legacy/free-form graphic authority.
  if (lastPlan && lastPlanPassedStructuralValidation && lastQualityReview) {
    const salvaged = salvageQualityReviewedPlan(
      lastPlan,
      input.contexts,
      budget ? { maxMoments: budget.maxMoments } : undefined,
      lastQualityReview,
    );
    if (salvaged) {
      return {
        plan: salvaged.plan,
        attempts: maxAttempts,
        reason: `quality-salvaged: kept ${salvaged.plan.moments.length}, declined ${salvaged.dropped.length}${salvaged.dropped.length ? ` [${salvaged.dropped.slice(0, 5).join(', ')}]` : ''}`,
      };
    }
  }

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
