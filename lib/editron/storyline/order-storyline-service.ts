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
import { scenesFromAssetAnalyses } from './multi-asset-compose';
import { buildOrderingDigest } from './ordering-digest';
import { type OrderingValidation, validateOrderingPlan } from './ordering-plan';
import { buildOrderingPrompt, type OrderingPromptContext, parseOrderingResponse, type SequencingMovesMenu } from './ordering-prompt';
import type { EditronAssetContext } from './scene-adapter';
import type { Scene } from './scene';
import type { Storyline } from './storyline';

/** Complete a prompt with an LLM. Inject the app's Gemini client in prod; grok in the eval. */
export type LLMComplete = (prompt: string) => Promise<string>;

export type FallbackReason = 'too_few_clips' | 'llm_error' | 'parse_error' | 'invalid_plan';

export interface OrderStorylineOptions {
  ctx?: OrderingPromptContext;
  /** Override the ordering-move menu (defaults to the creative doc's SEQUENCING_MOVES). */
  moves?: SequencingMovesMenu;
  compose?: ComposeOptions;
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
}

/** Below this, ordering is moot (0/1 clip has exactly one order) - skip the LLM entirely. */
const MIN_CLIPS_FOR_LLM = 2;

function deterministic(
  scenes: Scene[],
  brief: ProductionBrief,
  opts: OrderStorylineOptions | undefined,
  fallbackReason: FallbackReason,
  validation?: OrderingValidation,
): OrderStorylineResult {
  return { storyline: composeStoryline(scenes, brief, opts?.compose), planApplied: false, fallbackReason, validation };
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
  const picked = selectAndFitScenes(scenes, brief, opts?.compose);
  if (picked.length < MIN_CLIPS_FOR_LLM) return deterministic(scenes, brief, opts, 'too_few_clips');

  const digests = buildOrderingDigest(picked);
  const prompt = buildOrderingPrompt(digests, opts?.ctx, opts?.moves);

  let raw: string;
  try {
    raw = await llm(prompt);
  } catch {
    return deterministic(scenes, brief, opts, 'llm_error');
  }

  const { plan } = parseOrderingResponse(raw, digests);
  if (!plan) return deterministic(scenes, brief, opts, 'parse_error');

  const validation = validateOrderingPlan(plan, picked, {
    targetDurationSec: brief.output.targetDurationSec,
    minClipDurationSec: opts?.compose?.minClipDurationSec,
  });
  if (!validation.valid) return deterministic(scenes, brief, opts, 'invalid_plan', validation);

  const storyline = composeStoryline(scenes, brief, { ...opts?.compose, orderingPlan: plan });
  return { storyline, planApplied: true, validation, rationale: plan.rationale };
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
