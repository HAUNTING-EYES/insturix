/**
 * order-storyline-service - the IMPURE edge that turns a project's persisted analyses into an
 * LLM-ORDERED Storyline. This is the wiring that connects the (proven, pure) composer brain to
 * live uploads:
 *
 *   analyses (reader) -> scenes (adapter) -> select+fit -> digest -> LLM -> plan
 *     -> validate -> composeStoryline(scenes, brief, {orderingPlan})
 *
 * The ONLY impurity is injected: `llm` (complete a prompt) and, for the project entry, `db`
 * (read the analyses). Everything else is the pure lane. On ANY failure - LLM throws, bad
 * JSON, a plan that breaks a hard contract, or too few clips to order - it falls back to the
 * deterministic continuum order and reports why. It never throws and never blocks a cut on a
 * flaky model.
 *
 * A route provides `llm` (the app's Gemini client in prod; grok in the local eval) + `db` +
 * the per-asset contexts (resolved from mediaAssets). This file does not know about HTTP,
 * auth, or a specific provider.
 */

import type { ProductionBrief } from '../production-brief/production-brief';
import { type AnalysisReadDb, readComposableAssetAnalyses } from './asset-analysis-reader';
import { type ComposeOptions, composeStoryline, selectAndFitScenes } from './compose';
import type { CoverageVerify } from './coverage';
import { scenesFromAssetAnalyses } from './multi-asset-compose';
import { buildOrderingDigest } from './ordering-digest';
import { type OrderingValidation, validateOrderingPlan } from './ordering-plan';
import { type OrderingPolicy, resolveOrderingPolicy } from './ordering-policy';
import { buildOrderingPrompt, type OrderingPromptContext, parseOrderingResponse, type SequencingMovesMenu } from './ordering-prompt';
import type { EditronAssetContext } from './scene-adapter';
import type { Scene } from './scene';
import type { SceneEmbed } from './scene-embedding';
import { planStorylineFromScript, type ScriptBeatPlanResult } from './script-beat-planner';
import { enrichScenes, type NarrativeSignalSource } from './signal-enricher';
import type { Storyline } from './storyline';
import type { StorylinePromptComplete } from './storyline-llm';

/** Complete a prompt with an LLM. Inject the app's Gemini client in prod; grok in the eval. */
export type LLMComplete = StorylinePromptComplete;

export type FallbackReason =
  | 'too_few_clips'
  | 'llm_error'
  | 'parse_error'
  | 'invalid_plan'
  | 'script_planner_unavailable'
  | 'script_plan_failed';

export interface OrderStorylineOptions {
  ctx?: OrderingPromptContext;
  /** Override the ordering-move menu (defaults to the creative doc's SEQUENCING_MOVES). */
  moves?: SequencingMovesMenu;
  compose?: ComposeOptions;
  /**
   * Per-source narrative signals (from `narrativeSourceFromTimeline`), keyed by Scene.source.
   * When present, scenes get the full narrative report card (cta/topic-boundary/pressure/entities);
   * when absent, phase + position are still computed from the scenes themselves. Either way the
   * digest surfaces what exists, so the ordering LLM's SEQUENCING_MOVES have real signals to lean on.
   */
  narrativeSources?: ReadonlyMap<string, NarrativeSignalSource>;
  /** Order-intent priors (B7): explicit content-type (from analysis) + whether a script/order was
   *  imported. Drive the narrative-vs-procedural mode; absent = inferred from the content. */
  contentType?: string;
  hasScript?: boolean;
  /** Authoritative user script. When present, script beats own scene selection and ordering. */
  script?: string | null;
  /** Query embedder for beat-to-scene retrieval. Required when `script` is authoritative. */
  scriptQueryEmbed?: SceneEmbed;
  /** Exact-window visual verifier. Required when `script` is authoritative. */
  scriptCoverageVerify?: CoverageVerify;
}

export interface OrderStorylineResult {
  storyline: Storyline;
  /** true = the LLM plan validated and was applied; false = deterministic fallback. */
  planApplied: boolean;
  /** Why the LLM path was skipped/failed (present only when planApplied is false). */
  fallbackReason?: FallbackReason;
  validation?: OrderingValidation;
  /** The model's one-line narrative rationale, when a plan was applied. */
  rationale?: string;
  /** The order-intent policy that shaped the ordering (mode + confidence). Surface `lowConfidence`
   *  to the user when we could not order with conviction. */
  policy?: OrderingPolicy;
  /** Grounded script coverage and decision audit, when an authoritative script was supplied. */
  scriptPlan?: ScriptBeatPlanResult;
}

/** Below this, ordering is moot (0/1 clip has exactly one order) - skip the LLM entirely. */
const MIN_CLIPS_FOR_LLM = 2;

function deterministic(
  scenes: Scene[],
  brief: ProductionBrief,
  opts: OrderStorylineOptions | undefined,
  fallbackReason: FallbackReason,
  validation?: OrderingValidation,
  policy?: OrderingPolicy,
  scriptPlan?: ScriptBeatPlanResult,
): OrderStorylineResult {
  return {
    storyline: composeStoryline(scenes, brief, opts?.compose),
    planApplied: false,
    fallbackReason,
    validation,
    policy,
    scriptPlan,
  };
}

/**
 * Order a set of scenes into a Storyline via the LLM narrative pass, falling back to the
 * deterministic order on any failure. Impure only through `llm`. Never throws.
 */
export async function orderStorylineWithLLM(
  scenes: Scene[],
  brief: ProductionBrief,
  llm: LLMComplete,
  opts?: OrderStorylineOptions,
): Promise<OrderStorylineResult> {
  // Enrich BEFORE select+fit so phase/position use each source's TRUE arc (not the picked subset).
  // The narrative field rides along through select and into the digest the LLM reads. Ordering
  // behaviour is unchanged - composeStoryline ignores narrative; this only feeds the LLM.
  const enriched = enrichScenes(scenes, opts?.narrativeSources ? { sources: opts.narrativeSources } : undefined);

  // B7: decide HOW to order (narrative story vs procedural step sequence) BEFORE prompting, so the
  // ordering objective matches the content. Procedural content told to "tell the strongest story"
  // scrambles (a tutorial led with its result); the mode flips the prompt's objective.
  const policy = resolveOrderingPolicy(enriched, brief, { contentType: opts?.contentType, hasScript: opts?.hasScript });

  const script = opts?.script?.trim();
  if (script) {
    if (!opts?.scriptQueryEmbed || !opts.scriptCoverageVerify) {
      return deterministic(enriched, brief, opts, 'script_planner_unavailable', undefined, policy);
    }
    const scriptPlan = await planStorylineFromScript({
      scenes: enriched,
      script,
      brief,
      llm,
      queryEmbed: opts.scriptQueryEmbed,
      coverageVerify: opts.scriptCoverageVerify,
      language: opts.ctx?.language,
      minClipDurationSec: opts.compose?.minClipDurationSec,
    });
    if (scriptPlan.status === 'failed' || !scriptPlan.plan) {
      return deterministic(enriched, brief, opts, 'script_plan_failed', scriptPlan.validation, policy, scriptPlan);
    }

    const byId = new Map(enriched.map((scene) => [scene.id, scene]));
    const selected = scriptPlan.selectedSceneIds
      .map((sceneId) => byId.get(sceneId))
      .filter((scene): scene is Scene => Boolean(scene));
    const storyline = composeStoryline(selected, brief, {
      ...opts.compose,
      orderingPlan: scriptPlan.plan,
    });
    return {
      storyline,
      planApplied: true,
      validation: scriptPlan.validation,
      rationale: scriptPlan.rationale,
      policy,
      scriptPlan,
    };
  }

  const picked = selectAndFitScenes(enriched, brief, opts?.compose);
  if (picked.length < MIN_CLIPS_FOR_LLM) return deterministic(enriched, brief, opts, 'too_few_clips', undefined, policy);

  const digests = buildOrderingDigest(picked);
  const prompt = buildOrderingPrompt(digests, { ...opts?.ctx, mode: policy.mode }, opts?.moves);

  let raw: string;
  try {
    raw = await llm(prompt);
  } catch {
    return deterministic(enriched, brief, opts, 'llm_error', undefined, policy);
  }

  const { plan } = parseOrderingResponse(raw, digests);
  if (!plan) return deterministic(enriched, brief, opts, 'parse_error', undefined, policy);

  const validation = validateOrderingPlan(plan, picked, {
    targetDurationSec: brief.output.targetDurationSec,
    minClipDurationSec: opts?.compose?.minClipDurationSec,
  });
  if (!validation.valid) return deterministic(enriched, brief, opts, 'invalid_plan', validation, policy);

  const storyline = composeStoryline(enriched, brief, { ...opts?.compose, orderingPlan: plan });
  return { storyline, planApplied: true, validation, rationale: plan.rationale, policy };
}

export interface OrderStorylineProjectDeps {
  db: AnalysisReadDb;
  llm: LLMComplete;
}

export interface OrderStorylineProjectOptions extends OrderStorylineOptions {
  /** Per-asset context (source/thumbnail/createdAt/color) resolved from mediaAssets by the caller. */
  assetContexts?: ReadonlyMap<string, EditronAssetContext>;
}

/**
 * Project entry: read the project's composable analyses, build scenes, and LLM-order them into
 * a Storyline. The route injects `db` + `llm` and resolves `assetContexts` from mediaAssets.
 * Never throws; a project with no composable assets yields an empty (valid) storyline.
 */
export async function orderStorylineForProject(
  projectId: string,
  brief: ProductionBrief,
  deps: OrderStorylineProjectDeps,
  opts?: OrderStorylineProjectOptions,
): Promise<OrderStorylineResult> {
  const docs = await readComposableAssetAnalyses(deps.db, projectId);
  const scenes = scenesFromAssetAnalyses(docs, { assetContexts: opts?.assetContexts });
  return orderStorylineWithLLM(scenes, brief, deps.llm, opts);
}
