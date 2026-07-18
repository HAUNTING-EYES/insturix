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
      const plan = mgVideoDesignPlanSchema.parse(extractDesignPlanJson(text));
      const validation = validateDesignPlan(plan, input.contexts, budget ? { maxMoments: budget.maxMoments } : undefined);
      if (validation.ok) return { plan, attempts: attempt + 1 };
      lastReason = validation.problems.slice(0, 3).join(' | ') || 'plan failed validation';
    } catch (error) {
      lastReason = `plan parse/validation error: ${error instanceof Error ? error.message : String(error)}`.slice(0, 180);
    }
  }

  return { plan: null, reason: lastReason, attempts: maxAttempts };
}
