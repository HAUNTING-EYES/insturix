/**
 * MG Codegen — DESIGN-THEN-CODE Phase C 2/2 (production glue): the VIDEO-LEVEL DESIGN PRE-PASS.
 *
 * One design session per video, run ONCE before the executor's decision loop. The caller (edl-executor) derives a
 * "beat" per graphic decision — the designer's view of the moment (factKind/sourceText/props/tier/room) plus an
 * opaque KEY (the decision itself, by reference). This module fans those beats through runVideoDesignSession and
 * maps each returned per-moment design back to its key, so the loop can later look a plan up by the SAME decision.
 *
 * WHY key-by-caller-opaque-K (not the render momentId): the render-time momentId embeds the snapped frame, which
 * the executor only resolves inside the loop (against evolving overlay state). The design session runs BEFORE the
 * loop. Keying by the caller's stable handle (the decision reference) sidesteps that entirely — the designer moment
 * is only the design INPUT; the final render still uses the loop's own momentInput. Consistency is exact and needs
 * no shared resolution between the pre-pass and applyGraphic.
 *
 * FAIL HONEST (R2N/R18N): no beats, or a session that produced no plan (model failure / unfixable), returns an
 * EMPTY map — every decision then falls back to the free-form codegen path (today's behaviour), never a fabricated
 * design. The pre-pass can only ADD coherent designs, never make a video worse than shipping none.
 */

import { runVideoDesignSession, type MgDesignerGenerate } from './design-session';
import type { MgDesignerMoment } from './designer-prompt';
import type { MgDesignPlanMomentContext, MgVideoDesignBrief } from './design-plan';
import type { MgDensityBudget } from './density-budget';
import type { Brand } from '../kit/brand';
import type { VideoStyle } from '../style/style-resolver';
import type { MgMomentDesign } from '../types';

/** One offered graphic moment: the designer's view + an opaque KEY the caller uses to attach the plan later. */
export interface MgDesignPrepassBeat<K> {
  /** The caller's stable handle for this moment (the decision, by reference) — the plan is keyed back to it. */
  key: K;
  /** The designer's view of the moment (sourceText, props, tier, room, duration). momentId must be UNIQUE. */
  moment: MgDesignerMoment;
  /** The validation context (same momentId) — factKind, contentProps, numericProps, startMs. */
  context: MgDesignPlanMomentContext;
}

export interface MgDesignPrepassInput<K> {
  beats: MgDesignPrepassBeat<K>[];
  intent?: string | null;
  videoStyle: VideoStyle;
  /** The client's brand, already mapped to the kit Brand. */
  brand: Brand;
  /** The density budget (computeMgDensityBudget) — the designer licenses AT MOST maxMoments of the beats. */
  budget: MgDensityBudget;
}

export interface MgDesignPrepassResult<K> {
  /** Per-key approved designs. A key is ABSENT when the designer declined that beat (→ free-form fallback). */
  plans: Map<K, MgMomentDesign>;
  /** Session attempts made (0 when there were no beats). */
  attempts: number;
  /** Why no plan was produced (model failure / unfixable) — absent on success. All beats then fall back. */
  reason?: string;
}

/**
 * Run the video-level design pre-pass. Deterministic given the same model output. Never throws — a failed session
 * resolves to an empty map (all beats fall back to free-form codegen).
 */
export async function runDesignPrepass<K>(
  input: MgDesignPrepassInput<K>,
  deps: { generate: MgDesignerGenerate; maxAttempts?: number },
): Promise<MgDesignPrepassResult<K>> {
  const plans = new Map<K, MgMomentDesign>();
  if (input.beats.length === 0) return { plans, attempts: 0 };

  const moments: MgDesignerMoment[] = input.beats.map((b) => b.moment);
  const contexts: MgDesignPlanMomentContext[] = input.beats.map((b) => b.context);
  const momentIdToKey = new Map<string, K>();
  for (const beat of input.beats) momentIdToKey.set(beat.moment.momentId, beat.key);

  const session = await runVideoDesignSession(
    {
      designer: { intent: input.intent, videoStyle: input.videoStyle, brand: input.brand, moments, budget: input.budget },
      contexts,
    },
    { generate: deps.generate, maxAttempts: deps.maxAttempts },
  );

  if (!session.plan) return { plans, attempts: session.attempts, reason: session.reason };

  const brief: MgVideoDesignBrief = session.plan.brief;
  for (const momentPlan of session.plan.moments) {
    const key = momentIdToKey.get(momentPlan.momentId);
    if (key === undefined) continue; // a plan for an unknown momentId (defensive; validation already covers it)
    plans.set(key, { plan: momentPlan, brief });
  }
  return { plans, attempts: session.attempts };
}
