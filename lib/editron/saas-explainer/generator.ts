import { COLLECTIONS, getDatabase } from "@/lib/editron/db/mongodb";
import {
  buildSaasExplainerAuthorPrompt,
  buildSaasExplainerProjectSummary,
  summarizeTextPresence,
  type NormalizedSaasExplainerIntake,
  type ValidReferenceVideoInput,
} from "@/lib/editron/saas-explainer/intake";
import {
  resolveSaasExplainerBrandContext,
  type SaasExplainerBrandContextMetadata,
} from "@/lib/editron/saas-explainer/brand-context";
import {
  analyzeSaasExplainerReference,
  type SaasExplainerReferenceStyleBrief,
} from "@/lib/editron/saas-explainer/reference-analysis";
import { projectService } from "@/lib/editron/services/project-service";
import { CreditsService } from "@/lib/services/creditsService";
import { isLLMParserAvailable, parseScriptWithLLM } from "@/lib/pipeline/llm-scene-parser";
import { scenesToOverlays, scenesToTotalFrames } from "@/lib/pipeline/scene-to-editron";
import type { SceneDescriptor } from "@/lib/pipeline/schemas/storyboard";
import { createProjectLink } from "@/lib/shared/project-links";
import { ScriptDraftAgent } from "@/lib/thinkforge/agents/script-draft-agent";

const FPS = 30;

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

export interface CreateSaasExplainerProjectInput {
  userId: string;
  orgId?: string | null;
  input: NormalizedSaasExplainerIntake;
  productUrl?: string;
  referenceVideo?: ValidReferenceVideoInput;
}

export interface SaasExplainerProjectResult {
  success: true;
  mode: "saas_explainer";
  status: "project_ready" | "draft_ready";
  autoEditMode: "saas_explainer";
  autoEditStatus: "complete" | "needs_generation";
  projectId: string;
  projectUrl: string;
  sceneCount: number;
  overlayCount: number;
  sourceSessionId: string;
  sourceScriptId: string;
  referenceVideoAnalysis: unknown;
  generationReadiness: SaasExplainerGenerationReadiness;
  brandContext: SaasExplainerBrandContextMetadata;
  warnings?: string[];
}

export interface SaasExplainerGenerationReadiness {
  ok: boolean;
  issues: Array<{
    code:
      | "empty_timeline"
      | "missing_renderable_visuals"
      | "placeholder_visuals"
      | "empty_voiceover"
      | "narration_text_placeholders"
      | "missing_captions";
    message: string;
    overlayIds?: number[];
  }>;
}

export async function createSaasExplainerProject(
  args: CreateSaasExplainerProjectInput,
): Promise<SaasExplainerProjectResult> {
  const { input, orgId, productUrl, referenceVideo, userId } = args;
  if (!isLLMParserAvailable()) {
    throw new SaasExplainerGenerationError(
      503,
      "scene_parser_unavailable",
      "SaaS explainer generation requires the scene parser model to be configured.",
    );
  }

  const generationStartedAt = new Date();
  const referenceLabel = referenceVideo ? `${referenceVideo.sourceKind} reference video` : undefined;
  const brandContext = await resolveSaasExplainerBrandContext({
    userId,
    orgId,
    brandId: input.brandId,
  });
  const brandContextPrompt = brandContext.promptBlock || undefined;
  const referenceScriptSummary = [
    input.script || input.outcome || buildSaasExplainerProjectSummary(input, productUrl, referenceLabel),
    brandContextPrompt,
  ].filter(Boolean).join("\n\n");
  const reference = await analyzeSaasExplainerReference({
    input,
    userId,
    productUrl,
    scriptSummary: referenceScriptSummary,
    referenceType: referenceVideo?.sourceKind,
  });
  if (!reference.ok) {
    throw new SaasExplainerGenerationError(reference.status, reference.code, reference.error, reference.details);
  }

  const referenceStyleEvidence = formatReferenceStyleEvidence(reference.analysis?.styleBrief);
  const sourceSessionId = `saas_${crypto.randomUUID()}`;
  const sourceScriptId = `script_${sourceSessionId}`;
  const baseProjectSummary = buildSaasExplainerProjectSummary(input, productUrl, referenceLabel, referenceStyleEvidence);
  const projectSummary = [baseProjectSummary, brandContextPrompt].filter(Boolean).join("\n\n");
  const systemBrief = [
    "Author a production SaaS explainer; keep product UI proof readable and avoid unverifiable claims.",
    brandContextPrompt,
  ].filter(Boolean).join("\n\n");
  const draft = await new ScriptDraftAgent({ maxTokens: 2600 }).generateScript({
    userPrompt: buildSaasExplainerAuthorPrompt(input, productUrl, referenceLabel, referenceStyleEvidence),
    sessionId: sourceSessionId,
    brandId: input.brandId,
    generationMode: "manual",
    project: {
      idea: "SaaS explainer video",
      purpose: input.outcome || "Create a clear SaaS explainer video.",
      style: "clear product-led SaaS demo",
      format: "video_script",
      platform: platformForAspectRatio(input.aspectRatio),
      projectName: projectNameFor(input, productUrl),
      originalPrompt: input.outcome || input.script || "SaaS explainer",
      brandId: input.brandId,
    },
    context: {
      projectSummary,
      systemBrief,
    },
  });

  const parsed = await parseScriptWithLLM(draft.content, {
    aspectRatio: input.aspectRatio,
    artStyle: "SaaS product demo with readable UI proof moments",
    brandId: input.brandId,
    userId,
  });
  const scenes = normalizeScenes(parsed.scenes);
  if (scenes.length === 0) {
    throw new SaasExplainerGenerationError(
      422,
      "no_scenes_generated",
      "The generated script did not produce valid scenes.",
    );
  }


  const creditResult = await CreditsService.deductCredits(userId, "pipeline", "script_import", {
    quantity: 1,
  });
  if (!creditResult.success) {
    throw new SaasExplainerGenerationError(
      402,
      "insufficient_credits",
      creditResult.error || "Not enough credits to create this Editron project.",
    );
  }

  const projectName = projectNameFor(input, productUrl);
  const project = await projectService.createProject(userId, projectName, {
    brandId: input.brandId,
    sourceSessionId,
  });
  const dimensions = dimensionsForAspectRatio(input.aspectRatio);
  const overlays = scenesToOverlays(scenes, dimensions);
  const totalFrames = scenesToTotalFrames(scenes, FPS);
  const generationReadiness = analyzeGenerationReadiness(overlays);
  const projectStatus = generationReadiness.ok ? "project_ready" : "draft_ready";
  const autoEditStatus = generationReadiness.ok ? "complete" : "needs_generation";

  await projectService.saveProject(userId, project.projectId, {
    overlays,
    aspectRatio: input.aspectRatio as never,
    playerDimensions: { width: dimensions.width, height: dimensions.height },
    fps: FPS,
    durationInFrames: totalFrames,
  });

  const linkWarnings = await createLinkWarnings({
    userId,
    sourceSessionId,
    sourceScriptId,
    projectId: project.projectId,
    brandId: input.brandId,
  });

  const finishedAt = new Date();
  const generationWarnings = generationReadiness.ok
    ? []
    : [
        "Draft ready, but final SaaS explainer generation is not complete. Renderable visuals, voiceover, and captions still need generation.",
      ];
  const brandWarnings = brandContext.metadata.acceptedProfile
    ? []
    : ["Brand Vault context is missing or not accepted; generation continued without default brand context."];
  const warnings = [...generationWarnings, ...brandWarnings, ...linkWarnings];
  const db = await getDatabase();
  await db.collection(COLLECTIONS.PROJECTS).updateOne(
    { userId, projectId: project.projectId },
    {
      $set: {
        pipelineStage: "edit",
        autoEditMode: "saas_explainer",
        autoEditStatus,
        autoEditStartedAt: generationStartedAt,
        ...(generationReadiness.ok ? { autoEditCompletedAt: finishedAt } : { autoEditDraftedAt: finishedAt }),
        sourceSessionId,
        sourceScriptId,
        generationReadiness,
        saasExplainer: {
          status: projectStatus,
          productUrl,
          productName: input.productName,
          audience: input.audience,
          outcome: summarizeTextPresence(input.outcome),
          script: summarizeTextPresence(input.script),
          durationSec: input.durationSec,
          aspectRatio: input.aspectRatio,
          brandContext: brandContext.metadata,
          referenceVideo: input.referenceVideoUrl
            ? { provided: true, type: referenceVideo?.sourceKind, url: input.referenceVideoUrl }
            : { provided: false },
        },
        ...(reference.editDNA ? { referenceEditDNA: reference.editDNA } : {}),
        ...(reference.analysis ? { referenceVideoAnalysis: reference.analysis } : {}),
      },
    },
  );

  return {
    success: true,
    mode: "saas_explainer",
    status: projectStatus,
    autoEditMode: "saas_explainer",
    autoEditStatus,
    projectId: project.projectId,
    projectUrl: `/dashboard/editron?project=${encodeURIComponent(project.projectId)}`,
    sceneCount: scenes.length,
    overlayCount: overlays.length,
    sourceSessionId,
    sourceScriptId,
    referenceVideoAnalysis: reference.analysis ?? { status: "not_provided" },
    generationReadiness,
    brandContext: brandContext.metadata,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

function formatReferenceStyleEvidence(styleBrief?: SaasExplainerReferenceStyleBrief): string | undefined {
  if (!styleBrief) return undefined;

  const lines = [
    `Summary: ${styleBrief.summary}`,
    `Category: ${styleBrief.category}`,
    `Pacing: ${styleBrief.pacing}`,
    `UI treatment: ${styleBrief.uiTreatment}`,
    styleBrief.visualLanguage.length > 0 ? `Visual language: ${styleBrief.visualLanguage.join("; ")}` : undefined,
    `Typography: ${styleBrief.typography}`,
    styleBrief.colorPalette.length > 0 ? `Palette: ${styleBrief.colorPalette.join("; ")}` : undefined,
    `Motion language: ${styleBrief.motion}`,
    styleBrief.transferBoundaries.length > 0 ? `Transfer boundaries: ${styleBrief.transferBoundaries.join("; ")}` : undefined,
  ];

  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

function normalizeScenes(scenes: Array<Record<string, unknown>>): SceneDescriptor[] {
  return scenes.map((scene, index) => ({
    ...(scene as Omit<SceneDescriptor, "sceneIndex">),
    sceneIndex: typeof scene.sceneIndex === "number" ? scene.sceneIndex : index,
  }));
}

function analyzeGenerationReadiness(overlays: any[]): SaasExplainerGenerationReadiness {
  const issues: SaasExplainerGenerationReadiness["issues"] = [];
  if (overlays.length === 0) {
    issues.push({
      code: "empty_timeline",
      message: "No overlays were generated.",
    });
  }

  const placeholderVisualIds = overlays
    .filter((overlay) => overlay.type === "html-scene" || hasPlaceholderReceipt(overlay))
    .map(overlayId)
    .filter((id): id is number => typeof id === "number");
  if (placeholderVisualIds.length > 0) {
    issues.push({
      code: "placeholder_visuals",
      message: "The visual track contains placeholder HTML scenes instead of generated scene/media output.",
      overlayIds: placeholderVisualIds,
    });
  }

  if (!overlays.some(isRenderableVisualOverlay)) {
    issues.push({
      code: "missing_renderable_visuals",
      message: "No renderable video, image, or GeneratedScene visual output is present.",
    });
  }

  const emptyVoiceoverIds = overlays
    .filter((overlay) => overlay.type === "sound" && isVoiceoverSlot(overlay) && !hasMediaSource(overlay))
    .map(overlayId)
    .filter((id): id is number => typeof id === "number");
  if (emptyVoiceoverIds.length > 0) {
    issues.push({
      code: "empty_voiceover",
      message: "Voiceover overlays are reserved but have no generated audio source.",
      overlayIds: emptyVoiceoverIds,
    });
  }

  const narrationTextIds = overlays
    .filter((overlay) => overlay.type === "text" && overlay.metadata?.isNarrationCaption === true)
    .map(overlayId)
    .filter((id): id is number => typeof id === "number");
  if (narrationTextIds.length > 0) {
    issues.push({
      code: "narration_text_placeholders",
      message: "Narration is present as plain text overlays instead of validated caption output.",
      overlayIds: narrationTextIds,
    });
  }

  if (!overlays.some(hasValidatedCaptionOutput)) {
    issues.push({
      code: "missing_captions",
      message: "No validated caption output is present.",
    });
  }

  return { ok: issues.length === 0, issues };
}

function hasPlaceholderReceipt(overlay: any): boolean {
  const receipts = [
    overlay.metadata?.atomicOverlayReceipt,
    ...(Array.isArray(overlay.metadata?.atomicOverlayReceipts) ? overlay.metadata.atomicOverlayReceipts : []),
  ].filter(Boolean);

  return receipts.some((receipt) => {
    const intent = String(receipt.intent ?? "").toLowerCase();
    const reason = String(receipt.reason ?? "").toLowerCase();
    return intent.includes("placeholder") || reason.includes("placeholder");
  });
}

function isRenderableVisualOverlay(overlay: any): boolean {
  if ((overlay.type === "video" || overlay.type === "image") && hasMediaSource(overlay)) {
    return true;
  }

  if (overlay.type === "generated-scene" && overlay.sceneModel && overlay.sourceMap) {
    return true;
  }

  return false;
}

function isVoiceoverSlot(overlay: any): boolean {
  return overlay.metadata?.isVoiceover === true || String(overlay.content ?? "").startsWith("VO:");
}

function hasMediaSource(overlay: any): boolean {
  return Boolean(overlay.src || overlay.url || overlay.assetId || overlay.publicUrl);
}

function hasValidatedCaptionOutput(overlay: any): boolean {
  if (overlay.type === "caption") return true;
  if (overlay.type !== "generated-scene") return false;

  const model = overlay.sceneModel;
  return Boolean(
    (Array.isArray(model?.captions) && model.captions.length > 0) ||
      (Array.isArray(model?.captionTracks) && model.captionTracks.length > 0) ||
      (Array.isArray(model?.elements) && model.elements.some((element: any) => element?.role === "caption")),
  );
}

function overlayId(overlay: any): number | undefined {
  return typeof overlay.id === "number" ? overlay.id : undefined;
}

function projectNameFor(input: NormalizedSaasExplainerIntake, productUrl?: string): string {
  if (input.productName) return `${input.productName} SaaS Explainer`;
  if (productUrl) return `${new URL(productUrl).hostname.replace(/^www\./, "")} SaaS Explainer`;
  return "SaaS Explainer";
}

function platformForAspectRatio(aspectRatio: NormalizedSaasExplainerIntake["aspectRatio"]): string {
  if (aspectRatio === "9:16") return "short-form video";
  if (aspectRatio === "1:1") return "square social video";
  return "website and product demo video";
}

function dimensionsForAspectRatio(aspectRatio: NormalizedSaasExplainerIntake["aspectRatio"]): {
  width: number;
  height: number;
  fps: number;
} {
  if (aspectRatio === "9:16") return { width: 1080, height: 1920, fps: FPS };
  if (aspectRatio === "1:1") return { width: 1080, height: 1080, fps: FPS };
  return { width: 1920, height: 1080, fps: FPS };
}

async function createLinkWarnings(input: {
  userId: string;
  sourceSessionId: string;
  sourceScriptId: string;
  projectId: string;
  brandId?: string;
}): Promise<string[]> {
  try {
    await createProjectLink(input.userId, {
      sessionId: input.sourceSessionId,
      sourceScriptId: input.sourceScriptId,
      projectId: input.projectId,
      brandId: input.brandId,
    });
    return [];
  } catch (error) {
    return [error instanceof Error ? error.message : "Project link creation failed."];
  }
}
