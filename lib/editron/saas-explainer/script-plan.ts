/**
 * SaaS Explainer — SCRIPT PLAN spine for the PREMIUM (craft-agent) path.
 *
 * The existing generator (`createSaasExplainerProject`) runs seven build steps — brand context → evidence pack →
 * director contract → script draft → parse into scenes → ensure-min → THEN creates a full draft Editron project
 * (overlays + old TTS + persistence). The premium path wants ONLY the first steps: an editable script + the
 * director contract + the evidence pack, mapped into the craft worker's `plan.json` / `product-model.json` shape.
 * It never creates a draft project — the user finalizes into a bespoke Lambda render instead.
 *
 * This is a SEPARATE spine (not a refactor of the 926-line generator) so the live draft path is untouched. It
 * reuses the generator's exported building blocks (resolve brand context, build evidence pack, build director
 * contract, ScriptDraftAgent, parseScriptWithLLM, normalizeScenes, ensureMinimumSaasExplainerScenes) — no logic
 * is re-implemented; only the ORCHESTRATION front-half is expressed here without the project-creation tail.
 *
 * Plan is built SCENE-DRIVEN (one plan scene per storyboard scene, `vo` = the scene's narration) so every
 * rendered scene is guaranteed real spoken narration. The director contract supplies only the `form` vibe hint
 * per scene (aligned by index), never a constraint — the uncaged craft agent designs bespoke.
 */
import type { SceneDescriptor } from "@/lib/pipeline/schemas/storyboard";
import { isLLMParserAvailable, parseScriptWithLLM } from "@/lib/pipeline/llm-scene-parser";
import { ScriptDraftAgent } from "@/lib/thinkforge/agents/script-draft-agent";
import {
  buildSaasExplainerAuthorPrompt,
  buildSaasExplainerProjectSummary,
  type NormalizedSaasExplainerIntake,
} from "@/lib/editron/saas-explainer/intake";
import { resolveSaasExplainerBrandContext } from "@/lib/editron/saas-explainer/brand-context";
import {
  buildSaasProductEvidencePack,
  formatSaasProductEvidencePromptBlock,
  type SaasProductEvidencePack,
} from "@/lib/editron/saas-explainer/product-evidence-pack";
import {
  buildSaasDirectorContract,
  formatSaasDirectorPromptBlock,
  type SaasDirectorContract,
  type SaasDirectorSceneBeat,
} from "@/lib/editron/saas-explainer/director-contract";
import { resolveSaasStructureStyleBrief } from "@/lib/editron/saas-explainer/structure-doctrine";
import {
  ensureMinimumSaasExplainerScenes,
  normalizeScenes,
  SaasExplainerGenerationError,
} from "@/lib/editron/saas-explainer/generator";
import {
  evidencePackToProductModel,
  type ExplainerPlan,
  type ExplainerPlanScene,
  type ExplainerProductModel,
} from "@/lib/editron/saas-explainer/director-to-plan";

/** Premium-path fps (the craft worker's default; prep-audio re-fits per-scene duration to the VO at render). */
const PLAN_FPS = 60;

/** One editable script beat the front-end shows on the "script" screen. */
export interface ScriptPlanScene {
  index: number;
  title: string;
  /** The spoken VO line — this is what the user edits/regenerates. */
  narration: string;
  durationSec: number;
  /** Loose vibe hint (archetype/family) from the aligned director beat. */
  form: string;
  /** Optional user visual-edit directive ("make it bolder", "redo the layout") — the Claude craft agent honors it. */
  editDirective?: string;
}

export interface SaasExplainerScriptPlan {
  /** Editable, human-facing script beats (the "select / change / regenerate the script" surface). */
  scenes: ScriptPlanScene[];
  /** Craft-worker `plan.json` (vo already filled from narration). Re-derivable from edited scenes via rebuildPlan(). */
  plan: ExplainerPlan;
  /** Craft-worker `product-model.json`. */
  productModel: ExplainerProductModel;
  /** Underlying contracts, returned so the client can round-trip them back to /finalize. */
  directorContract: SaasDirectorContract;
  productEvidencePack: SaasProductEvidencePack;
  message: string;
  warnings: string[];
}

export interface BuildSaasExplainerScriptPlanInput {
  userId: string;
  orgId?: string | null;
  input: NormalizedSaasExplainerIntake;
  productUrl?: string;
  extraProductImageUrls?: string[];
  /** Extracted text from an uploaded doc/PDF (a new-product spec, brief, one-pager). Understood by the script
   *  agent as the video's TOPIC/source material — NOT quoted verbatim. Brand still supplies style/voice. */
  sourceMaterial?: string;
}

/** Cap source material fed to the script agent (well above a one-pager, below prompt-bloat). */
const MAX_SOURCE_MATERIAL = 8_000;

/**
 * Produce the editable script + craft-worker plan/model from an intake — WITHOUT creating a draft project.
 * Mirrors the generator's front-half orchestration; reuses its exported building blocks.
 */
export async function buildSaasExplainerScriptPlan(
  args: BuildSaasExplainerScriptPlanInput,
): Promise<SaasExplainerScriptPlan> {
  const { userId, orgId, input, productUrl } = args;
  if (!isLLMParserAvailable()) {
    throw new SaasExplainerGenerationError(
      503,
      "scene_parser_unavailable",
      "SaaS explainer scripting requires the scene parser model to be configured.",
    );
  }

  const brandContext = await resolveSaasExplainerBrandContext({ userId, orgId, brandId: input.brandId });
  const generationInput = applyBrandDefaults(input, brandContext);
  const brandContextPrompt = brandContext.promptBlock || undefined;

  const productEvidencePack = buildSaasProductEvidencePack({
    input: generationInput,
    originalInput: input,
    productUrl,
    brandContext,
  });
  const productEvidencePrompt = formatSaasProductEvidencePromptBlock(productEvidencePack);

  // Premium path has no reference-video analysis step (that LLM pass belongs to the draft generator). Fall back to
  // the structure doctrine's default style brief — the same default the generator resolves when no reference exists.
  const effectiveStyleBrief = resolveSaasStructureStyleBrief(undefined);
  const directorContract = buildSaasDirectorContract({
    input: generationInput,
    productEvidencePack,
    referenceStyleBrief: effectiveStyleBrief,
    referenceProvided: false,
  });
  const directorPrompt = formatSaasDirectorPromptBlock(directorContract);

  const sourceSessionId = `saas_plan_${crypto.randomUUID()}`;
  const baseProjectSummary = buildSaasExplainerProjectSummary(generationInput, productUrl);
  const projectSummary = [baseProjectSummary, brandContextPrompt, productEvidencePrompt, directorPrompt]
    .filter(Boolean)
    .join("\n\n");
  const systemBrief = [
    "Author a production SaaS explainer; keep product UI proof readable and avoid unverifiable claims.",
    brandContextPrompt,
    productEvidencePrompt,
    directorPrompt,
  ]
    .filter(Boolean)
    .join("\n\n");

  // User-provided source material (uploaded doc/PDF about the product/topic) — the video is ABOUT this, in the
  // brand's voice. Understand it; do NOT copy it verbatim (it may be a spec/one-pager, not a script).
  const sourceMaterial = (args.sourceMaterial ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_SOURCE_MATERIAL);
  const sourceMaterialBlock = sourceMaterial
    ? `SOURCE MATERIAL the user provided about the product/topic this video is about. Base the script's SUBSTANCE on ` +
      `this (it may describe a new product). Understand and synthesize it into clear spoken narration in the brand's ` +
      `voice — do NOT quote it verbatim, do NOT invent facts beyond it:\n"""\n${sourceMaterial}\n"""`
    : "";

  const draft = await new ScriptDraftAgent({ maxTokens: 2600 }).generateScript({
    userPrompt: [
      buildSaasExplainerAuthorPrompt(generationInput, productUrl),
      sourceMaterialBlock,
      productEvidencePrompt,
      directorPrompt,
    ]
      .filter(Boolean)
      .join("\n\n"),
    sessionId: sourceSessionId,
    brandId: generationInput.brandId,
    generationMode: "manual",
    project: {
      idea: "SaaS explainer video",
      purpose: generationInput.outcome || "Create a clear SaaS explainer video.",
      style: "clear product-led SaaS demo",
      format: "video_script",
      platform: platformForAspectRatio(generationInput.aspectRatio),
      projectName: projectNameFor(generationInput, productUrl),
      originalPrompt: generationInput.outcome || generationInput.script || "SaaS explainer",
      brandId: generationInput.brandId,
    },
    context: { projectSummary, systemBrief },
  });

  const parsed = await parseScriptWithLLM(draft.content, {
    aspectRatio: generationInput.aspectRatio,
    artStyle: "SaaS product demo with readable UI proof moments",
    brandId: generationInput.brandId,
    userId,
  });
  const parsedScenes = normalizeScenes(parsed.scenes);
  if (parsedScenes.length === 0) {
    throw new SaasExplainerGenerationError(
      422,
      "no_scenes_generated",
      "The generated script did not produce valid scenes.",
    );
  }
  const storyboard = ensureMinimumSaasExplainerScenes(parsedScenes, generationInput);

  const message =
    generationInput.outcome ||
    baseProjectSummary ||
    `${generationInput.productName || "Your product"} — a clear SaaS explainer.`;

  const scriptScenes = storyboard.map((scene, order) =>
    toScriptPlanScene(scene, order, directorContract, generationInput),
  );
  const plan = scriptScenesToPlan(scriptScenes, message);
  const productModel = evidencePackToProductModel(productEvidencePack, args.extraProductImageUrls ?? []);

  const warnings = [
    ...(brandContext.metadata.acceptedProfile
      ? []
      : ["Brand Vault context is missing or not accepted; scripting continued with reduced brand context."]),
    ...productEvidencePack.degradations
      .filter((d) => d.severity !== "info")
      .map((d) => `SaaS product evidence: ${d.message}`),
    ...directorContract.evidenceAudit.degradations
      .filter((d) => d.severity !== "info")
      .map((d) => `SaaS director: ${d.message}`),
  ];

  return { scenes: scriptScenes, plan, productModel, directorContract, productEvidencePack, message, warnings };
}

/**
 * Rebuild the craft-worker plan from (possibly edited) script scenes — the /finalize route calls this after the
 * user edits narration on the script screen, so the render uses exactly what they approved.
 */
export function scriptScenesToPlan(scenes: ScriptPlanScene[], message: string): ExplainerPlan {
  const planScenes: ExplainerPlanScene[] = scenes.map((s) => ({
    form: s.form,
    durationInFrames: Math.max(1, Math.round(s.durationSec * PLAN_FPS)),
    vo: s.narration,
    props: {
      index: s.index,
      copyRole: s.form,
      // user visual-edit directive flows into the craft brief so Claude re-designs this scene honoring it.
      ...(s.editDirective && s.editDirective.trim() ? { editDirective: s.editDirective.trim() } : {}),
    },
  }));
  return {
    fps: PLAN_FPS,
    transitionFrames: Math.round(PLAN_FPS * 0.37),
    message,
    scenes: planScenes,
  };
}

function toScriptPlanScene(
  scene: SceneDescriptor,
  order: number,
  contract: SaasDirectorContract,
  input: NormalizedSaasExplainerIntake,
): ScriptPlanScene {
  const beat = resolveDirectorBeat(contract, scene, order);
  const form = beat ? `${beat.visualArchetype}/${beat.family}` : "TYPE_ONLY/hook";
  const sceneCount = Math.max(1, contract.sequence.length);
  const fallbackDuration = Math.max(3, Math.round(input.durationSec / sceneCount));
  const durationSec =
    typeof scene.durationSeconds === "number" && scene.durationSeconds > 0
      ? scene.durationSeconds
      : fallbackDuration;
  return {
    index: order,
    title: cleanLine(scene.title || `Scene ${order + 1}`, 72),
    narration: cleanLine(scene.narration || "", 320),
    durationSec,
    form,
  };
}

function resolveDirectorBeat(
  contract: SaasDirectorContract,
  scene: SceneDescriptor,
  order: number,
): SaasDirectorSceneBeat | undefined {
  return contract.sequence.find((beat) => beat.index === scene.sceneIndex) ?? contract.sequence[order];
}

// --- helpers mirrored from generator.ts (pure; kept local so the live draft path is untouched) ---

function applyBrandDefaults(
  input: NormalizedSaasExplainerIntake,
  brandContext: Awaited<ReturnType<typeof resolveSaasExplainerBrandContext>>,
): NormalizedSaasExplainerIntake {
  const brief = brandContext.defaults.brief;
  return {
    ...input,
    productName: input.productName || brief.productName,
    audience: input.audience || brief.audience.join(", ") || undefined,
    outcome: input.outcome || brief.outcomeHint,
  };
}

function projectNameFor(input: NormalizedSaasExplainerIntake, productUrl?: string): string {
  if (input.productName) return `${input.productName} SaaS Explainer`;
  if (productUrl) {
    try {
      return `${new URL(productUrl).hostname.replace(/^www\./, "")} SaaS Explainer`;
    } catch {
      return "SaaS Explainer";
    }
  }
  return "SaaS Explainer";
}

function platformForAspectRatio(aspectRatio: NormalizedSaasExplainerIntake["aspectRatio"]): string {
  if (aspectRatio === "9:16") return "short-form video";
  if (aspectRatio === "1:1") return "square social video";
  return "website and product demo video";
}

function cleanLine(value: string, maxLength: number): string {
  const cleaned = value
    .replace(/^\s*(visual|voiceover|vo|narration|audio|camera|motion)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}
