import type { BrandInputs } from "@/lib/editron/data/motion-theme-resolver";
import type { SaasExplainerBrandContext } from "@/lib/editron/saas-explainer/brand-context";
import type { SaasExplainerVoiceProfile } from "@/lib/editron/saas-explainer/brand-voice";
import type { NormalizedSaasExplainerIntake } from "@/lib/editron/saas-explainer/intake";
import type { SaasExplainerReferenceStyleBrief } from "@/lib/editron/saas-explainer/reference-analysis";
import type {
  SaasDirectorContract,
  SaasDirectorSceneBeat,
  SaasDirectorSceneFamily,
} from "@/lib/editron/saas-explainer/director-contract";
import { ROW } from "@/lib/pipeline/scene-to-editron";
import type { SceneDescriptor } from "@/lib/pipeline/schemas/storyboard";

type Dimensions = { fps: number; width: number; height: number };

export interface BuildSaasGeneratedSceneOverlaysInput {
  scenes: SceneDescriptor[];
  dimensions: Dimensions;
  input: NormalizedSaasExplainerIntake;
  brandContext: SaasExplainerBrandContext;
  voiceProfile?: SaasExplainerVoiceProfile;
  referenceStyleBrief?: SaasExplainerReferenceStyleBrief;
  directorContract?: SaasDirectorContract;
}

type ResolvedSaasVoice = Pick<SaasExplainerVoiceProfile, "voiceId" | "provider" | "providerVoiceId" | "contentType">;
export type SaasSceneFamily = SaasDirectorSceneFamily;

export type SaasSceneEvidenceSource = "brand_vault" | "script" | "product_url" | "reference_video" | "default_reference_video" | "structure_doctrine" | "scene_descriptor" | "director_contract";

export interface SaasSceneFamilyPlan {
  family: SaasSceneFamily;
  evidenceSource: SaasSceneEvidenceSource;
  sourcePaths: string[];
  visualGoal: string;
  productUiState: string;
  motionIntent: string;
  copyRole: string;
  claimMode: "evidence_backed" | "claim_locked" | "synthetic_demo_only";
  visualArchetype?: SaasDirectorSceneBeat["visualArchetype"];
  evidenceStatus?: SaasDirectorSceneBeat["evidenceStatus"];
  evidenceDuty?: string[];
  admissibleClaimIds?: string[];
  productAssetUse?: SaasDirectorSceneBeat["productAssetUse"];
  directorStructureId?: string;
  directorBeatIndex?: number;
  sourceFamilyExpression?: string;
}

export interface SaasGeneratedSceneElement {
  id: string;
  role: "headline" | "app-shell" | "panel" | "metric" | "caption" | "cta" | "logo-mark";
  text?: string;
  label?: string;
  value?: string;
  items?: string[];
  emphasis?: "primary" | "accent" | "muted";
}

export interface SaasGeneratedSceneAsset {
  kind: string;
  label: string;
  url: string;
  stored: boolean;
  signalPath?: string;
  sourceType?: string;
}

export interface SaasGeneratedSceneModel {
  schemaVersion: "saas-generated-scene/v1";
  sceneId: string;
  sceneIndex: number;
  title: string;
  productName: string;
  brand: {
    name: string;
    primaryColor: string;
    accentColor: string;
    backgroundColor: string;
    surfaceColor: string;
    textColor: string;
    mutedTextColor: string;
    fontFamily: string;
  };
  style: {
    category: "saas_product_demo";
    pacing: string;
    uiTreatment: string;
    motion: string;
  };
  familyPlan: SaasSceneFamilyPlan;
  assets: {
    logos: SaasGeneratedSceneAsset[];
    productImages: SaasGeneratedSceneAsset[];
    productUrl?: string;
    sourcePaths: string[];
  };
  brandContext: {
    source: SaasExplainerBrandContext["metadata"]["source"];
    acceptedProfile: boolean;
    defaultProductName?: string;
    productServices: string[];
    audience: string[];
    proofStyle?: string;
    visual: {
      colorCount: number;
      fontCount: number;
      logoAssetCount: number;
      productImageCount: number;
      signalPaths: string[];
    };
    motion: { signalPaths: string[] };
    missingInputs: string[];
  };
  voiceover: {
    script: string;
    status: "pending_tts" | "ready";
    audioUrl?: string;
    assetId?: string;
    audioDurationMs?: number;
    direction?: SaasExplainerVoiceProfile["direction"];
    resolvedVoice?: ResolvedSaasVoice;
  } | null;
  elements: SaasGeneratedSceneElement[];
  captionTracks: Array<{
    id: string;
    text: string;
    startMs: number;
    endMs: number;
  }>;
  qualityGates: {
    promptLeakChecked: true;
    brandTokensApplied: boolean;
    readableUiProof: true;
    productSpecificVisualProof: boolean;
    motionChoreographyPlanned: boolean;
    finalVisualProof: boolean;
  };
}

export function buildSaasGeneratedSceneOverlays(input: BuildSaasGeneratedSceneOverlaysInput): any[] {
  let overlayId = 1;
  let currentFrame = 0;
  const overlays: any[] = [];
  const brand = resolveBrandTokens(input.brandContext, input.input.productName);
  const style = resolveStyle(input.referenceStyleBrief);

  for (let sceneOrder = 0; sceneOrder < input.scenes.length; sceneOrder += 1) {
    const scene = input.scenes[sceneOrder];
    if (!scene) continue;
    const durationInFrames = Math.max(1, Math.round(scene.durationSeconds * input.dimensions.fps));
    const sceneId = `saas_scene_${scene.sceneIndex}`;
    const voiceoverScript = cleanVisibleText(scene.narration || "", 320);
    const directorBeat = resolveDirectorBeat(input.directorContract, scene, sceneOrder);
    const familyPlan = planSceneFamily({
      scene,
      sceneCount: input.scenes.length,
      input: input.input,
      brandContext: input.brandContext,
      referenceStyleBrief: input.referenceStyleBrief,
      ...(input.directorContract ? { directorContract: input.directorContract } : {}),
      ...(directorBeat ? { directorBeat } : {}),
    });
    const elements = buildSceneElements(scene, input.input, brand, input.brandContext, familyPlan);
    const captionTracks = voiceoverScript
      ? [{
          id: `${sceneId}_caption_0`,
          text: voiceoverScript,
          startMs: 0,
          endMs: Math.round((durationInFrames / input.dimensions.fps) * 1000),
        }]
      : [];
    const productSpecificVisualProof = hasProductSpecificVisualProof(input.brandContext, familyPlan);
    const motionChoreographyPlanned = hasMotionChoreographyPlan(input.brandContext, input.referenceStyleBrief);
    const finalVisualProof = productSpecificVisualProof && motionChoreographyPlanned && hasRenderableGeneratedSceneStructure(elements, captionTracks);
    const model: SaasGeneratedSceneModel = {
      schemaVersion: "saas-generated-scene/v1",
      sceneId,
      sceneIndex: scene.sceneIndex,
      title: cleanVisibleText(scene.title || `Scene ${scene.sceneIndex + 1}`, 72),
      productName: brand.name,
      brand,
      style,
      familyPlan,
      assets: buildSceneAssets(input.brandContext, input.input.productUrl),
      brandContext: buildSceneBrandContext(input.brandContext),
      voiceover: voiceoverScript
        ? {
            script: voiceoverScript,
            status: "pending_tts",
            ...(input.voiceProfile
              ? {
                  direction: input.voiceProfile.direction,
                  resolvedVoice: pickResolvedVoice(input.voiceProfile),
                }
              : {}),
          }
        : null,
      elements,
      captionTracks,
      qualityGates: {
        promptLeakChecked: true,
        brandTokensApplied: input.brandContext.metadata.acceptedProfile,
        readableUiProof: true,
        productSpecificVisualProof,
        motionChoreographyPlanned,
        finalVisualProof,
      },
    };

    overlays.push({
      id: overlayId++,
      type: "generated-scene",
      from: currentFrame,
      durationInFrames,
      row: ROW.VIDEO,
      left: 0,
      top: 0,
      width: input.dimensions.width,
      height: input.dimensions.height,
      isDragging: false,
      rotation: 0,
      content: model.title,
      sceneModel: model,
      sourceMap: buildSourceMap(scene, input.brandContext, familyPlan),
      styles: { opacity: 1 },
      metadata: {
        sourceType: "saas-explainer-generated-scene",
        sceneIndex: scene.sceneIndex,
        generatedSceneId: sceneId,
        schemaVersion: model.schemaVersion,
        validation: validateSaasGeneratedSceneModel(model),
        ...(familyPlan.directorBeatIndex !== undefined
          ? {
              directorStructureId: familyPlan.directorStructureId,
              directorBeatIndex: familyPlan.directorBeatIndex,
            }
          : {}),
      },
    });

    if (voiceoverScript) {
      overlays.push({
        id: overlayId++,
        type: "sound",
        from: currentFrame,
        durationInFrames,
        row: ROW.VOICEOVER,
        left: 0,
        top: 0,
        width: 200,
        height: 40,
        isDragging: false,
        rotation: 0,
        src: "",
        content: `VO pending: ${voiceoverScript.slice(0, 72)}`,
        styles: { opacity: 1, volume: 1 },
        metadata: {
          isVoiceover: true,
          sceneIndex: scene.sceneIndex,
          generatedSceneId: sceneId,
          narrationText: voiceoverScript,
          status: "pending_tts",
          ...(input.voiceProfile
            ? {
                voiceProfile: input.voiceProfile,
                tts: pickResolvedVoice(input.voiceProfile),
              }
            : {}),
        },
      });
    }

    currentFrame += durationInFrames;
  }

  return overlays;
}

export function validateSaasGeneratedSceneModel(model: SaasGeneratedSceneModel): {
  ok: boolean;
  issues: string[];
} {
  const visibleTexts = model.elements
    .flatMap((element) => [element.text, element.label, element.value, ...(element.items ?? [])])
    .filter((value): value is string => Boolean(value?.trim()));
  const issues: string[] = [];

  for (const text of visibleTexts) {
    if (isPromptLikeVisibleText(text)) issues.push(`prompt_like_visible_text:${text.slice(0, 80)}`);
    if (text.length > 120) issues.push(`visible_text_too_long:${text.slice(0, 80)}`);
  }

  if (!isHexColor(model.brand.primaryColor) || !isHexColor(model.brand.accentColor)) {
    issues.push("invalid_brand_colors");
  }

  return { ok: issues.length === 0, issues };
}

export function isPromptLikeVisibleText(value: string): boolean {
  return /(^|\b)(visual\s*:|voiceover\s*:|narration\s*:|audio\s*:|camera\s+direction\b|video\s+motion\b|visualdescription\b|audiodescription\b|videomotionprompt\b|scene\s+prompt\b|write\s+a\b|generate\s+a\b|source\s*map\b|metadata\b|llm\b)/i.test(value);
}

const FAMILY_SEQUENCE: SaasSceneFamily[] = [
  "hook",
  "problem",
  "workflow_demo",
  "feature_demo",
  "proof_metric",
  "cta",
  "logo_outro",
];

function planSceneFamily(input: {
  scene: SceneDescriptor;
  sceneCount: number;
  input: NormalizedSaasExplainerIntake;
  brandContext: SaasExplainerBrandContext;
  referenceStyleBrief?: SaasExplainerReferenceStyleBrief;
  directorContract?: SaasDirectorContract;
  directorBeat?: SaasDirectorSceneBeat;
}): SaasSceneFamilyPlan {
  if (input.directorBeat) {
    return planSceneFamilyFromDirector(input.directorBeat, input);
  }
  const evidenceSource = resolveEvidenceSource(input.input, input.brandContext, input.referenceStyleBrief);
  const detectedFamily = detectSceneFamily(input.scene, input.sceneCount);
  const family = constrainFamilyForEvidence(detectedFamily, evidenceSource, input.brandContext);
  const claimMode = evidenceSource === "scene_descriptor" || evidenceSource === "structure_doctrine" || evidenceSource === "default_reference_video" ? "synthetic_demo_only" : "evidence_backed";

  return {
    family,
    evidenceSource,
    sourcePaths: sourcePathsForEvidence(evidenceSource),
    visualGoal: familyVisualGoal(family, input.brandContext, claimMode),
    productUiState: familyProductUiState(family, input.brandContext),
    motionIntent: familyMotionIntent(family, input.brandContext, input.referenceStyleBrief),
    copyRole: familyCopyRole(family),
    claimMode,
  };
}

function resolveDirectorBeat(
  directorContract: SaasDirectorContract | undefined,
  scene: SceneDescriptor,
  sceneOrder: number,
): SaasDirectorSceneBeat | undefined {
  if (!directorContract) return undefined;
  return directorContract.sequence.find((beat) => beat.index === scene.sceneIndex) ?? directorContract.sequence[sceneOrder];
}

function planSceneFamilyFromDirector(
  beat: SaasDirectorSceneBeat,
  input: {
    brandContext: SaasExplainerBrandContext;
    referenceStyleBrief?: SaasExplainerReferenceStyleBrief;
    directorContract?: SaasDirectorContract;
  },
): SaasSceneFamilyPlan {
  const claimMode = beat.claimPolicy;
  return {
    family: beat.family,
    evidenceSource: "director_contract",
    sourcePaths: [
      `directorContract.sequence[${beat.index}]`,
      "saasExplainer.productEvidencePack.claimLedger",
      ...beat.admissibleClaimIds.map((claimId) => `claimLedger.${claimId}`),
    ],
    visualGoal: beat.evidenceDuty[0] || familyVisualGoal(beat.family, input.brandContext, claimMode),
    productUiState: familyProductUiState(beat.family, input.brandContext),
    motionIntent: familyMotionIntent(beat.family, input.brandContext, input.referenceStyleBrief),
    copyRole: beat.copyRole,
    claimMode,
    visualArchetype: beat.visualArchetype,
    evidenceStatus: beat.evidenceStatus,
    evidenceDuty: beat.evidenceDuty,
    admissibleClaimIds: beat.admissibleClaimIds,
    productAssetUse: beat.productAssetUse,
    ...(input.directorContract ? { directorStructureId: String(input.directorContract.selectedStructure.id) } : {}),
    directorBeatIndex: beat.index,
    sourceFamilyExpression: beat.sourceFamilyExpression,
  };
}

function resolveEvidenceSource(
  input: NormalizedSaasExplainerIntake,
  brandContext: SaasExplainerBrandContext,
  referenceStyleBrief?: SaasExplainerReferenceStyleBrief,
): SaasSceneEvidenceSource {
  if (input.script) return "script";
  if (input.productUrl) return "product_url";
  if (brandContext.metadata.acceptedProfile) return "brand_vault";
  if (referenceStyleBrief && input.referenceVideoUrl) return "reference_video";
  if (referenceStyleBrief) return "default_reference_video";
  return "scene_descriptor";
}

function detectSceneFamily(scene: SceneDescriptor, sceneCount: number): SaasSceneFamily {
  const text = [scene.title, scene.visualDescription, scene.narration, scene.videoMotionPrompt]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const index = Math.max(0, scene.sceneIndex);
  if (index === 0) return "hook";
  if (index >= sceneCount - 1 && /\b(logo|outro|end card|sign off|brand close)\b/.test(text)) return "logo_outro";
  if (index >= sceneCount - 1 || /\b(cta|book|start|get started|try|contact)\b/.test(text)) return "cta";
  if (/\b(problem|pain|friction|fragment|manual|spreadsheet|stuck|bottleneck|before)\b/.test(text)) return "problem";
  if (/\b(promise|positioning|reveal|introducing|introduce)\b/.test(text)) return "promise";
  if (/\b(ui proof|proof screen|screenshot|screen capture|verified ui)\b/.test(text)) return "ui_proof";
  if (/\b(objection|security|compliance|risk|procurement)\b/.test(text)) return "objection_handling";
  if (/\b(section|chapter|part)\b/.test(text)) return "section_header";
  if (/\b(compare|comparison|versus|vs\.?|before.*after|old.*new)\b/.test(text)) return "comparison";
  if (/\b(testimonial|social proof|trusted by|customer|teams trust|quote)\b/.test(text)) return "social_proof";
  if (/\b(proof|metric|result|percentage|percent|roi|faster|saved|ready)\b/.test(text)) return "proof_metric";
  if (/\b(feature|capability|automation|integration|analyze|design|distribute|share|edit)\b/.test(text)) return "feature_demo";
  if (/\b(workflow|flow|process|pipeline|workspace|step|handoff)\b/.test(text)) return "workflow_demo";
  return FAMILY_SEQUENCE[Math.min(index, FAMILY_SEQUENCE.length - 1)] ?? "workflow_demo";
}

function constrainFamilyForEvidence(
  family: SaasSceneFamily,
  evidenceSource: SaasSceneEvidenceSource,
  brandContext: SaasExplainerBrandContext,
): SaasSceneFamily {
  if (evidenceSource !== "scene_descriptor" && evidenceSource !== "structure_doctrine" && evidenceSource !== "default_reference_video") return family;
  if (["proof_metric", "social_proof", "comparison", "feature_demo", "ui_proof", "objection_handling"].includes(family)) return "workflow_demo";
  if (family === "logo_outro" && brandContext.defaults.visual.logoAssets.length === 0) return "cta";
  return family;
}

function sourcePathsForEvidence(source: SaasSceneEvidenceSource): string[] {
  if (source === "brand_vault") return ["brandContext.defaults.brief", "brandContext.defaults.visual", "brandContext.defaults.motion"];
  if (source === "script") return ["input.script", "SceneDescriptor"];
  if (source === "product_url") return ["input.productUrl", "SceneDescriptor"];
  if (source === "reference_video") return ["referenceStyleBrief", "SceneDescriptor"];
  if (source === "default_reference_video") return ["DefaultLovableStyleReference", "SaaSStructureDoctrine", "SceneDescriptor"];
  if (source === "structure_doctrine") return ["SaaSStructureDoctrine", "SceneDescriptor"];
  if (source === "director_contract") return ["directorContract.sequence", "productEvidencePack.claimLedger", "SceneDescriptor"];
  return ["SceneDescriptor"];
}

function familyVisualGoal(
  family: SaasSceneFamily,
  brandContext: SaasExplainerBrandContext,
  claimMode: SaasSceneFamilyPlan["claimMode"],
): string {
  const product = brandContext.defaults.brief.productName || brandContext.defaults.brief.productServices[0] || "the product";
  if (claimMode === "synthetic_demo_only") return `Show a clearly synthetic ${product} UI moment without numeric or customer claims.`;
  const goals: Record<SaasSceneFamily, string> = {
    hook: `Open with ${product} brand/product context and one readable product promise.`,
    problem: "Show the before-state friction without inventing metrics.",
    promise: "Compress the product promise into one sourced, readable statement.",
    workflow_demo: "Hold on a product workflow long enough to evaluate the UI state.",
    feature_demo: "Show one sourced product capability as a focused UI state.",
    ui_proof: "Make verified product UI evidence the subject of the beat.",
    proof_metric: "Show proof only from sourced brand, script, URL, or reference evidence.",
    comparison: "Show before/after contrast without fabricated competitor claims.",
    social_proof: "Show sourced trust evidence or downgrade to generic proof language.",
    objection_handling: "Answer one verified objection or keep the beat product-led.",
    cta: "Resolve into a next-step panel with the product and brand visible.",
    logo_outro: "Close on a simple logo/product end card with no complex animation.",
    section_header: "Introduce a section only when the next scene immediately proves it.",
  };
  return goals[family];
}

function familyProductUiState(family: SaasSceneFamily, brandContext: SaasExplainerBrandContext): string {
  const job = brandContext.defaults.brief.jobsToBeDone[0];
  const service = brandContext.defaults.brief.productServices[0];
  const base = job || service || "product workspace";
  const states: Record<SaasSceneFamily, string> = {
    hook: `${base} overview`,
    problem: "fragmented before-state board",
    promise: `${base} promise panel`,
    workflow_demo: `${base} workflow path`,
    feature_demo: `${base} feature focus`,
    ui_proof: `${base} verified UI proof`,
    proof_metric: "sourced proof panel",
    comparison: "before and after split view",
    social_proof: "trust evidence panel",
    objection_handling: "verified objection response panel",
    cta: "next-step action panel",
    logo_outro: "brand close card",
    section_header: "section title card",
  };
  return states[family];
}

function familyMotionIntent(
  family: SaasSceneFamily,
  brandContext: SaasExplainerBrandContext,
  referenceStyleBrief?: SaasExplainerReferenceStyleBrief,
): string {
  if (referenceStyleBrief?.motion) return cleanVisibleText(referenceStyleBrief.motion, 120);
  const energy = brandContext.defaults.motion.motionEnergy ?? 0.5;
  const tempo = energy > 0.65 ? "crisp" : energy < 0.35 ? "measured" : "balanced";
  const intents: Record<SaasSceneFamily, string> = {
    hook: `${tempo} push-in with brand reveal`,
    problem: `${tempo} friction stack reveal`,
    promise: `${tempo} promise turn with readable hold`,
    workflow_demo: `${tempo} stepwise UI state change`,
    feature_demo: `${tempo} focus highlight over one capability`,
    ui_proof: `${tempo} verified UI hold with light camera motion`,
    proof_metric: `${tempo} proof hold with restrained emphasis`,
    comparison: `${tempo} split-screen transition`,
    social_proof: `${tempo} trust-card reveal`,
    objection_handling: `${tempo} objection answer with evidence hold`,
    cta: `${tempo} settle into action panel`,
    logo_outro: "simple fade and scale logo close",
    section_header: `${tempo} type-led section card`,
  };
  return intents[family];
}

function familyCopyRole(family: SaasSceneFamily): string {
  const roles: Record<SaasSceneFamily, string> = {
    hook: "open the product promise",
    problem: "name the pain point",
    promise: "compress the product promise",
    workflow_demo: "explain the workflow step",
    feature_demo: "explain one sourced capability",
    ui_proof: "make verified UI evidence readable",
    proof_metric: "frame sourced proof without invention",
    comparison: "contrast before and after state",
    social_proof: "show trust evidence when sourced",
    objection_handling: "answer a sourced objection",
    cta: "ask for the next action",
    logo_outro: "leave brand recall",
    section_header: "set up the next proof beat",
  };
  return roles[family];
}

function familyPanelLabel(family: SaasSceneFamily): string {
  const labels: Record<SaasSceneFamily, string> = {
    hook: "Product promise",
    problem: "Before state",
    promise: "Promise",
    workflow_demo: "Workflow path",
    feature_demo: "Feature focus",
    ui_proof: "UI proof",
    proof_metric: "Sourced proof",
    comparison: "Before / after",
    social_proof: "Trust signal",
    objection_handling: "Objection",
    cta: "Next step",
    logo_outro: "Brand close",
    section_header: "Section",
  };
  return labels[family];
}

function familyMetricLabel(plan: SaasSceneFamilyPlan): string {
  if (plan.family === "problem") return "Friction";
  if (plan.family === "proof_metric") return "Proof";
  if (plan.family === "comparison") return "Contrast";
  if (plan.family === "promise") return "Promise";
  if (plan.family === "ui_proof") return "Verified";
  if (plan.family === "objection_handling") return "Answer";
  if (plan.family === "section_header") return "Section";
  if (plan.family === "cta") return "Action";
  if (plan.family === "logo_outro") return "Recall";
  return "Scene";
}

function familyMetricValue(plan: SaasSceneFamilyPlan, scene: SceneDescriptor): string {
  if (plan.claimMode === "synthetic_demo_only") return "Demo";
  if (plan.family === "workflow_demo") return "Flow";
  if (plan.family === "feature_demo") return "Focus";
  if (plan.family === "ui_proof") return "Verified";
  if (plan.family === "proof_metric") return "Sourced";
  if (plan.family === "comparison") return "Shift";
  if (plan.family === "promise") return "Clear";
  if (plan.family === "objection_handling") return "Answer";
  if (plan.family === "section_header") return "Next";
  if (plan.family === "cta") return "Next";
  if ((scene as { sceneType?: string }).sceneType === "montage") return "Multi-step";
  return "Product-led";
}

function familyCtaText(input: NormalizedSaasExplainerIntake, plan: SaasSceneFamilyPlan): string {
  if (plan.family === "cta" || plan.family === "logo_outro") return input.outcome || "Book a product walkthrough";
  return input.outcome || plan.copyRole;
}

function buildSceneElements(
  scene: SceneDescriptor,
  input: NormalizedSaasExplainerIntake,
  brand: SaasGeneratedSceneModel["brand"],
  brandContext: SaasExplainerBrandContext,
  familyPlan: SaasSceneFamilyPlan,
): SaasGeneratedSceneElement[] {
  const title = cleanVisibleText(scene.title || input.outcome || "Launch workflow", 72);
  const visual = cleanVisibleText(scene.visualDescription || familyPlan.visualGoal || input.outcome || "Product workflow", 96);
  const product = brand.name;

  return [
    { id: "brand_mark", role: "logo-mark", label: product, emphasis: "accent" },
    { id: "headline", role: "headline", text: title, emphasis: "primary" },
    {
      id: "product_shell",
      role: "app-shell",
      label: `${product} workspace`,
      items: deriveFlowItems(scene, input, brandContext),
      emphasis: "primary",
    },
    { id: "proof_panel", role: "panel", label: familyPanelLabel(familyPlan.family), text: visual, emphasis: "muted" },
    { id: "metric_0", role: "metric", label: familyMetricLabel(familyPlan), value: familyMetricValue(familyPlan, scene), emphasis: "accent" },
    { id: "cta", role: "cta", text: cleanVisibleText(familyCtaText(input, familyPlan), 90), emphasis: "accent" },
  ];
}

function resolveBrandTokens(
  brandContext: SaasExplainerBrandContext,
  fallbackProductName?: string,
): SaasGeneratedSceneModel["brand"] {
  const brandInputs: Partial<BrandInputs> = brandContext.brandInputs;
  const palette = Array.isArray(brandInputs.palette) ? brandInputs.palette.filter(isHexColor) : [];
  const primaryColor = firstHex(brandInputs.primaryColor, palette[0]) ?? "#0B0B0A";
  const accentColor = firstHex(brandInputs.accentColor, palette.find((color) => color.toLowerCase() !== primaryColor.toLowerCase())) ?? "#D4A652";
  const backgroundColor = firstHex(palette.find((color) => contrastHint(color) === "dark"), primaryColor) ?? "#0B0B0A";
  const surfaceColor = contrastHint(backgroundColor) === "dark" ? "#171A1F" : "#FFFFFF";
  const textColor = contrastHint(backgroundColor) === "dark" ? "#F7F4EA" : "#111111";
  const mutedTextColor = contrastHint(backgroundColor) === "dark" ? "#B9B2A3" : "#5E5E5E";
  const fontFamily = brandInputs.headingFont || brandInputs.bodyFont || brandInputs.typography || "Plus Jakarta Sans, Inter, sans-serif";

  return {
    name: cleanVisibleText(fallbackProductName || brandContext.defaults.brief.productName || "SaaS product", 44),
    primaryColor,
    accentColor,
    backgroundColor,
    surfaceColor,
    textColor,
    mutedTextColor,
    fontFamily,
  };
}

function resolveStyle(styleBrief?: SaasExplainerReferenceStyleBrief): SaasGeneratedSceneModel["style"] {
  return {
    category: "saas_product_demo",
    pacing: cleanVisibleText(styleBrief?.pacing || "medium; readable proof beats", 96),
    uiTreatment: cleanVisibleText(styleBrief?.uiTreatment || "dashboard-led product UI with clear callouts", 96),
    motion: cleanVisibleText(styleBrief?.motion || "clean pushes, crisp cuts, and UI state changes", 96),
  };
}

function deriveFlowItems(
  scene: SceneDescriptor,
  input: NormalizedSaasExplainerIntake,
  brandContext: SaasExplainerBrandContext,
): string[] {
  const brief = brandContext.defaults.brief;
  const seeds = [
    brief.productServices[0],
    input.audience || brief.audience[0] ? `Audience: ${input.audience || brief.audience[0]}` : undefined,
    brief.jobsToBeDone[0],
    brief.proofStyle && brief.proofStyle !== "unknown" ? `${brief.proofStyle} proof` : undefined,
    scene.mood ? `${scene.mood} beat` : undefined,
    scene.assetRecommendation ? String(scene.assetRecommendation) : undefined,
    scene.videoMotionPrompt ? "UI state change" : undefined,
  ];

  return seeds
    .filter((value): value is string => Boolean(value))
    .map((value) => cleanVisibleText(value, 38))
    .filter(Boolean)
    .slice(0, 4)
    .concat(["Plan", "Generate", "Review", "Publish"])
    .slice(0, 4);
}

function buildSourceMap(scene: SceneDescriptor, brandContext: SaasExplainerBrandContext, familyPlan: SaasSceneFamilyPlan): Record<string, unknown> {
  return {
    scene: {
      index: scene.sceneIndex,
      title: "SceneDescriptor.title",
      narration: scene.narration ? "SceneDescriptor.narration" : null,
      visual: scene.visualDescription ? "SceneDescriptor.visualDescription" : null,
      familyPlan,
    },
    brand: {
      source: brandContext.metadata.source,
      acceptedProfile: brandContext.metadata.acceptedProfile,
      keys: brandContext.metadata.brandInputKeys,
      defaultProductName: brandContext.defaults.brief.productName,
      productServices: brandContext.defaults.brief.productServices,
      audience: brandContext.defaults.brief.audience,
      proofStyle: brandContext.defaults.brief.proofStyle,
      visualAssetCounts: {
        logos: brandContext.defaults.visual.logoAssets.length,
        productImages: brandContext.defaults.visual.productImages.length,
      },
      visualAssets: {
        logos: normalizeGeneratedSceneAssets(brandContext.defaults.visual.logoAssets).map((asset) => asset.url),
        productImages: normalizeGeneratedSceneAssets(brandContext.defaults.visual.productImages).map((asset) => asset.url),
      },
      visualSignalPaths: brandContext.defaults.visual.signalPaths,
      motionSignalPaths: brandContext.defaults.motion.signalPaths,
      voiceSignalPaths: brandContext.voiceSignals?.signalPaths ?? [],
      missingInputs: brandContext.missingInputs,
    },
    ...(familyPlan.directorBeatIndex !== undefined
      ? {
          director: {
            structureId: familyPlan.directorStructureId,
            beatIndex: familyPlan.directorBeatIndex,
            sourceFamilyExpression: familyPlan.sourceFamilyExpression,
            evidenceStatus: familyPlan.evidenceStatus,
            evidenceDuty: familyPlan.evidenceDuty,
            admissibleClaimIds: familyPlan.admissibleClaimIds,
            productAssetUse: familyPlan.productAssetUse,
          },
        }
      : {}),
    renderer: {
      owner: "components/editron/editor/version-7.0.0/components/core/layer-content.tsx",
      contract: "saas-generated-scene/v1",
    },
  };
}

function buildSceneAssets(
  brandContext: SaasExplainerBrandContext,
  productUrl?: string,
): SaasGeneratedSceneModel["assets"] {
  const logos = normalizeGeneratedSceneAssets(brandContext.defaults.visual.logoAssets).slice(0, 3);
  const productImages = normalizeGeneratedSceneAssets(brandContext.defaults.visual.productImages).slice(0, 6);
  return {
    logos,
    productImages,
    ...(productUrl ? { productUrl } : {}),
    sourcePaths: [
      ...logos.map((asset) => asset.signalPath || "brandContext.defaults.visual.logoAssets"),
      ...productImages.map((asset) => asset.signalPath || "brandContext.defaults.visual.productImages"),
      ...(productUrl ? ["input.productUrl"] : []),
    ],
  };
}

function normalizeGeneratedSceneAssets(
  assets: SaasExplainerBrandContext["defaults"]["visual"]["logoAssets"],
): SaasGeneratedSceneAsset[] {
  return assets
    .map((asset) => ({
      kind: cleanVisibleText(asset.kind || "asset", 40),
      label: cleanVisibleText(asset.label || asset.kind || "Brand asset", 80),
      url: String(asset.url || "").trim(),
      stored: Boolean(asset.stored),
      ...(asset.signalPath ? { signalPath: asset.signalPath } : {}),
      ...(asset.sourceType ? { sourceType: asset.sourceType } : {}),
    }))
    .filter((asset) => isRenderableAssetUrl(asset.url));
}

function isRenderableAssetUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) || url.startsWith("/");
}

function buildSceneBrandContext(brandContext: SaasExplainerBrandContext): SaasGeneratedSceneModel["brandContext"] {
  return {
    source: brandContext.metadata.source,
    acceptedProfile: brandContext.metadata.acceptedProfile,
    defaultProductName: brandContext.defaults.brief.productName,
    productServices: brandContext.defaults.brief.productServices,
    audience: brandContext.defaults.brief.audience,
    proofStyle: brandContext.defaults.brief.proofStyle,
    visual: {
      colorCount: brandContext.defaults.visual.colors.length,
      fontCount: brandContext.defaults.visual.fonts.length,
      logoAssetCount: brandContext.defaults.visual.logoAssets.length,
      productImageCount: brandContext.defaults.visual.productImages.length,
      signalPaths: brandContext.defaults.visual.signalPaths,
    },
    motion: { signalPaths: brandContext.defaults.motion.signalPaths },
    missingInputs: brandContext.missingInputs,
  };
}

function hasRenderableGeneratedSceneStructure(
  elements: SaasGeneratedSceneElement[],
  captionTracks: SaasGeneratedSceneModel["captionTracks"],
): boolean {
  const roles = new Set(elements.map((element) => element.role));
  return roles.has("headline") && roles.has("app-shell") && roles.has("panel") && captionTracks.length > 0;
}

function hasProductSpecificVisualProof(
  brandContext: SaasExplainerBrandContext,
  familyPlan?: SaasSceneFamilyPlan,
): boolean {
  if (familyPlan?.claimMode === "synthetic_demo_only") return false;
  const brief = brandContext.defaults.brief;
  const visual = brandContext.defaults.visual;
  return Boolean(
    brandContext.metadata.acceptedProfile &&
      (brief.productName || brief.productServices.length > 0) &&
      (visual.logoAssets.length > 0 || visual.productImages.length > 0 || visual.colors.length > 0),
  );
}

function hasMotionChoreographyPlan(
  brandContext: SaasExplainerBrandContext,
  referenceStyleBrief?: SaasExplainerReferenceStyleBrief,
): boolean {
  return brandContext.defaults.motion.signalPaths.length > 0 || Boolean(referenceStyleBrief?.motion);
}
function pickResolvedVoice(profile: SaasExplainerVoiceProfile): ResolvedSaasVoice {
  return {
    voiceId: profile.voiceId,
    provider: profile.provider,
    providerVoiceId: profile.providerVoiceId,
    contentType: profile.contentType,
  };
}

function cleanVisibleText(value: string, maxLength: number): string {
  const cleaned = value
    .replace(/^\s*(visual|voiceover|vo|narration|audio|camera|motion)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function firstHex(...values: Array<string | undefined>): string | undefined {
  return values.find((value): value is string => Boolean(value && isHexColor(value)));
}

function isHexColor(value: string | undefined): value is string {
  return Boolean(value && /^#[0-9a-f]{6}$/i.test(value.trim()));
}

function contrastHint(hex: string): "dark" | "light" {
  const normalized = hex.replace("#", "");
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.45 ? "dark" : "light";
}
