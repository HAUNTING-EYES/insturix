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
 * FAIL HONEST (R2N/R18N): every offered beat receives an explicit approved, declined, or unavailable disposition.
 * A missing/failed plan is never interpreted as permission for a second producer to invent a free-form design.
 */

import { runVideoDesignSession, type MgDesignerGenerate } from './design-session';
import type { MgDesignerMoment, MgDesignerSessionImages } from './designer-prompt';
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
  /** Multimodal session images (P5-1 Phase D): footage frames sampled across the video so the designer designs
   *  for the real palette/negative-space. Best-effort — absent → a valid text-only design session. */
  images?: MgDesignerSessionImages;
}

export type MgDesignPrepassDisposition =
  | { status: 'approved'; design: MgMomentDesign }
  | { status: 'declined'; reason: string }
  | { status: 'unavailable'; reason: string };

export interface MgDesignPrepassResult<K> {
  /** One explicit authority result per offered key. Absence means the beat was never offered. */
  dispositions: Map<K, MgDesignPrepassDisposition>;
  /** Session attempts made (0 when there were no beats). */
  attempts: number;
  /** Session-level diagnostic, including salvage or provider failure. */
  reason?: string;
}

/**
 * Run the video-level design pre-pass. Deterministic given the same model output. Never throws.
 */
export async function runDesignPrepass<K>(
  input: MgDesignPrepassInput<K>,
  deps: { generate: MgDesignerGenerate; maxAttempts?: number },
): Promise<MgDesignPrepassResult<K>> {
  const dispositions = new Map<K, MgDesignPrepassDisposition>();
  if (input.beats.length === 0) return { dispositions, attempts: 0 };

  const moments: MgDesignerMoment[] = input.beats.map((b) => b.moment);
  const contexts: MgDesignPlanMomentContext[] = input.beats.map((b) => b.context);

  const session = await runVideoDesignSession(
    {
      designer: { intent: input.intent, videoStyle: input.videoStyle, brand: input.brand, moments, budget: input.budget },
      contexts,
      images: input.images,
    },
    { generate: deps.generate, maxAttempts: deps.maxAttempts },
  );

  if (!session.plan) {
    const reason = session.reason ?? 'video-level MG design session produced no plan';
    for (const beat of input.beats) dispositions.set(beat.key, { status: 'unavailable', reason });
    return { dispositions, attempts: session.attempts, reason };
  }

  const brief: MgVideoDesignBrief = session.plan.brief;
  const planByMomentId = new Map(session.plan.moments.map((momentPlan) => [momentPlan.momentId, momentPlan]));
  const declineByMomentId = new Map(session.plan.declined.map((decline) => [decline.momentId, decline.reason]));
  for (const beat of input.beats) {
    const momentPlan = planByMomentId.get(beat.moment.momentId);
    if (momentPlan) {
      dispositions.set(beat.key, { status: 'approved', design: { plan: momentPlan, brief } });
      continue;
    }
    const declineReason = declineByMomentId.get(beat.moment.momentId);
    if (declineReason) {
      dispositions.set(beat.key, { status: 'declined', reason: declineReason });
      continue;
    }
    dispositions.set(beat.key, {
      status: 'unavailable',
      reason: `validated design plan omitted disposition for ${beat.moment.momentId}`,
    });
  }
  return {
    dispositions,
    attempts: session.attempts,
    ...(session.reason ? { reason: session.reason } : {}),
  };
}
