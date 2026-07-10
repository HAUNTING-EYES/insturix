/**
 * SaaS Explainer — shared scene + error helpers.
 *
 * Extracted from the (now-deleted) draft generator so the PREMIUM path (script-plan.ts, /plan route) keeps its
 * scene normalization + minimum-scene padding + error type without depending on the old draft pipeline.
 */
import type { SceneDescriptor } from "@/lib/pipeline/schemas/storyboard";
import type { NormalizedSaasExplainerIntake } from "@/lib/editron/saas-explainer/intake";

const MIN_SAAS_GENERATED_SCENES = 4;
const MAX_SAAS_GENERATED_SCENES = 6;

export class SaasExplainerGenerationError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function normalizeScenes(scenes: Array<Record<string, unknown>>): SceneDescriptor[] {
  return scenes.map((scene, index) => ({
    ...(scene as Omit<SceneDescriptor, "sceneIndex">),
    sceneIndex: typeof scene.sceneIndex === "number" ? scene.sceneIndex : index,
  }));
}

export function ensureMinimumSaasExplainerScenes(
  scenes: SceneDescriptor[],
  input: NormalizedSaasExplainerIntake,
): SceneDescriptor[] {
  const desiredCount = Math.min(
    MAX_SAAS_GENERATED_SCENES,
    Math.max(MIN_SAAS_GENERATED_SCENES, Math.ceil(input.durationSec / 15)),
  );
  if (scenes.length >= desiredCount) {
    return scenes.map((scene, index) => ({ ...scene, sceneIndex: index }));
  }

  const seedScene = scenes[0];
  if (!seedScene) return scenes;
  const sceneDuration = Math.max(4, input.durationSec / desiredCount);
  const expanded = scenes.map((scene, index) => ({
    ...scene,
    sceneIndex: index,
    durationSeconds: sceneDuration,
  }));

  while (expanded.length < desiredCount) {
    expanded.push(buildMinimumSaasScene(expanded.length, input, seedScene, sceneDuration));
  }

  return expanded;
}

function buildMinimumSaasScene(
  index: number,
  input: NormalizedSaasExplainerIntake,
  source: SceneDescriptor,
  durationSeconds: number,
): SceneDescriptor {
  const product = input.productName || "the product";
  const outcome = input.outcome || `Show how ${product} turns the workflow into a clear SaaS demo.`;
  const blueprints = [
    {
      title: "Hook",
      narration: `${product} opens with the core product promise.`,
      visualDescription: `Show ${product} as a polished SaaS workspace with one clear active state.`,
      videoMotionPrompt: "Confident push toward the main workspace and active product state.",
    },
    {
      title: "Problem",
      narration: "Show the before-state friction the product removes.",
      visualDescription: "Show fragmented tasks resolving toward one organized product workflow.",
      videoMotionPrompt: "Stack friction cards, then shift focus into the product workspace.",
    },
    {
      title: "Workflow demo",
      narration: outcome,
      visualDescription: "Hold on a readable product workflow with step-by-step UI state changes.",
      videoMotionPrompt: "Move through the workflow with crisp UI state changes and proof-screen holds.",
    },
    {
      title: "CTA",
      narration: `Close with the next action for ${product}.`,
      visualDescription: `Resolve into a clean ${product} action panel and brand close.`,
      videoMotionPrompt: "Settle into the CTA panel, then a simple logo or product close.",
    },
  ] as const;
  const fallbackBlueprint = blueprints[3];
  const blueprint = blueprints[Math.min(index, blueprints.length - 1)] ?? fallbackBlueprint;

  return {
    ...source,
    sceneIndex: index,
    title: blueprint.title,
    narration: blueprint.narration,
    visualDescription: blueprint.visualDescription,
    videoMotionPrompt: blueprint.videoMotionPrompt,
    durationSeconds,
    mood: source.mood || "focused",
    imageQualityTokens: source.imageQualityTokens || "clean SaaS product UI, readable interface",
    videoQualityTokens: source.videoQualityTokens || "smooth product-demo motion, readable holds",
    generationUnitId: `saas_min_scene_${index}`,
    primaryVisualForUnit: true,
    sceneType: "continuous",
    assetRecommendation: source.assetRecommendation || "ai-video",
  };
}
