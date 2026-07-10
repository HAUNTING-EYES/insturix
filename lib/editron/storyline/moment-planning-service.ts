/**
 * moment-planning-service - the impure edge for the "user names the moments they want" flow.
 * Turns a project's scenes + a shot list into a feasibility-aware EDIT PLAN: embed the requests
 * and the scenes (multimodal), vision-verify coverage per requested moment, then build the plan
 * with the coverage gaps folded in (the "film this" list). This is the edge caller the coverage/
 * feasibility/planner primitives need to be usable in the product - like orderStorylineForProject
 * for the ordering flow.
 *
 * The two impurities are injected (embed + vision verify), so it's testable and provider-neutral:
 * a route supplies the app's embedder + VLM. Never throws; an embed failure degrades that request
 * to no-embedding (coverage still verifies), not a crash.
 */

import type { ProductionBrief } from '../production-brief/production-brief';
import type { ComposeOptions } from './compose';
import { assessCoverage, type CoverageResult, type CoverageVerify } from './coverage';
import { assessFeasibility, type FeasibilityReport, type ShotRequest } from './feasibility';
import { buildEditPlan, type EditPlan } from './planner';
import { embedScenes, type SceneEmbed } from './scene-embedding';
import type { Scene } from './scene';

/** One moment the user asked for, as free text (+ whether it's essential). */
export interface MomentRequestInput {
  text: string;
  priority?: 'must' | 'nice';
}

export interface MomentPlanningDeps {
  /** Embed a text into a vector (the app's embedder). Used for both scenes and requests. */
  embed: SceneEmbed;
  /** Vision-confirm whether a scene's frame depicts a request (the app's VLM). */
  verify: CoverageVerify;
}

export interface MomentPlanResult {
  plan: EditPlan;
  feasibility: FeasibilityReport;
}

/** Embed the requested moments (never throwing per request) into ShotRequests. */
async function embedRequests(requests: readonly MomentRequestInput[], embed: SceneEmbed): Promise<ShotRequest[]> {
  const out: ShotRequest[] = [];
  for (let i = 0; i < requests.length; i++) {
    const r = requests[i];
    let embedding: number[] | undefined;
    if (r.text && r.text.trim().length > 0) {
      try {
        const v = await embed(r.text);
        embedding = Array.isArray(v) && v.length > 0 ? v : undefined;
      } catch {
        embedding = undefined;
      }
    }
    out.push({ id: `r${i}`, text: r.text, priority: r.priority, embedding });
  }
  return out;
}

/**
 * Plan the edit for a project against the moments the user wants: embed scenes + requests,
 * assess vision-verified coverage, and build the edit plan with coverage gaps folded in.
 * Impure only through `deps`; never throws. Empty requests -> a plan with no coverage gaps.
 */
export async function planProjectEdit(
  scenes: Scene[],
  brief: ProductionBrief,
  requests: readonly MomentRequestInput[],
  deps: MomentPlanningDeps,
  opts?: { compose?: ComposeOptions; topK?: number; partialSimilarity?: number },
): Promise<MomentPlanResult> {
  const embeddedScenes = await embedScenes(scenes, deps.embed);
  const shotRequests = await embedRequests(requests, deps.embed);
  const feasibility = await assessFeasibility(shotRequests, embeddedScenes, deps.verify, {
    topK: opts?.topK,
    partialSimilarity: opts?.partialSimilarity,
  });
  const plan = buildEditPlan(embeddedScenes, brief, { feasibility, compose: opts?.compose });
  return { plan, feasibility };
}

/**
 * Answer a single "do we have this shot?" for a project (the interactive coverage lookup). Embeds
 * the scenes + the query, then vision-verifies. Impure only through `deps`; never throws.
 */
export async function checkMomentCoverage(
  scenes: Scene[],
  query: string,
  deps: MomentPlanningDeps,
  opts?: { topK?: number; partialSimilarity?: number },
): Promise<CoverageResult> {
  const embeddedScenes = await embedScenes(scenes, deps.embed);
  let embedding: number[] | undefined;
  try {
    const v = await deps.embed(query);
    embedding = Array.isArray(v) && v.length > 0 ? v : undefined;
  } catch {
    embedding = undefined;
  }
  return assessCoverage({ text: query, embedding }, embeddedScenes, deps.verify, opts);
}
