import type { BrandInputs } from "@/lib/editron/data/motion-theme-resolver";
import type { SaasExplainerBrandContext } from "@/lib/editron/saas-explainer/brand-context";
import type { SaasExplainerVoiceProfile } from "@/lib/editron/saas-explainer/brand-voice";
import type { NormalizedSaasExplainerIntake } from "@/lib/editron/saas-explainer/intake";
import type { SaasExplainerReferenceStyleBrief } from "@/lib/editron/saas-explainer/reference-analysis";
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
}

type ResolvedSaasVoice = Pick<SaasExplainerVoiceProfile, "voiceId" | "provider" | "providerVoiceId" | "contentType">;
export interface SaasGeneratedSceneElement {
  id: string;
  role: "headline" | "app-shell" | "panel" | "metric" | "caption" | "cta" | "logo-mark";
  text?: string;
  label?: string;
  value?: string;
  items?: string[];
  emphasis?: "primary" | "accent" | "muted";
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
    finalVisualProof: false;
  };
}

export function buildSaasGeneratedSceneOverlays(input: BuildSaasGeneratedSceneOverlaysInput): any[] {
  let overlayId = 1;
  let currentFrame = 0;
  const overlays: any[] = [];
  const brand = resolveBrandTokens(input.brandContext, input.input.productName);
  const style = resolveStyle(input.referenceStyleBrief);

  for (const scene of input.scenes) {
    const durationInFrames = Math.max(1, Math.round(scene.durationSeconds * input.dimensions.fps));
    const sceneId = `saas_scene_${scene.sceneIndex}`;
    const voiceoverScript = cleanVisibleText(scene.narration || "", 320);
    const model: SaasGeneratedSceneModel = {
      schemaVersion: "saas-generated-scene/v1",
      sceneId,
      sceneIndex: scene.sceneIndex,
      title: cleanVisibleText(scene.title || `Scene ${scene.sceneIndex + 1}`, 72),
      productName: brand.name,
      brand,
      style,
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
      elements: buildSceneElements(scene, input.input, brand, input.brandContext),
      captionTracks: voiceoverScript
        ? [{
            id: `${sceneId}_caption_0`,
            text: voiceoverScript,
            startMs: 0,
            endMs: Math.round((durationInFrames / input.dimensions.fps) * 1000),
          }]
        : [],
      qualityGates: {
        promptLeakChecked: true,
        brandTokensApplied: input.brandContext.metadata.acceptedProfile,
        readableUiProof: true,
        productSpecificVisualProof: hasProductSpecificVisualProof(input.brandContext),
        motionChoreographyPlanned: hasMotionChoreographyPlan(input.brandContext, input.referenceStyleBrief),
        finalVisualProof: false,
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
      sourceMap: buildSourceMap(scene, input.brandContext),
      styles: { opacity: 1 },
      metadata: {
        sourceType: "saas-explainer-generated-scene",
        sceneIndex: scene.sceneIndex,
        generatedSceneId: sceneId,
        schemaVersion: model.schemaVersion,
        validation: validateSaasGeneratedSceneModel(model),
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

function buildSceneElements(
  scene: SceneDescriptor,
  input: NormalizedSaasExplainerIntake,
  brand: SaasGeneratedSceneModel["brand"],
  brandContext: SaasExplainerBrandContext,
): SaasGeneratedSceneElement[] {
  const title = cleanVisibleText(scene.title || input.outcome || "Launch workflow", 72);
  const visual = cleanVisibleText(scene.visualDescription || input.outcome || "Product workflow", 96);
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
    { id: "proof_panel", role: "panel", label: "Proof moment", text: visual, emphasis: "muted" },
    { id: "metric_0", role: "metric", label: "Mode", value: productMetricLabel(scene), emphasis: "accent" },
    { id: "cta", role: "cta", text: cleanVisibleText(input.outcome || "Turn brand context into launch assets", 90), emphasis: "accent" },
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

function buildSourceMap(scene: SceneDescriptor, brandContext: SaasExplainerBrandContext): Record<string, unknown> {
  return {
    scene: {
      index: scene.sceneIndex,
      title: "SceneDescriptor.title",
      narration: scene.narration ? "SceneDescriptor.narration" : null,
      visual: scene.visualDescription ? "SceneDescriptor.visualDescription" : null,
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
      visualSignalPaths: brandContext.defaults.visual.signalPaths,
      motionSignalPaths: brandContext.defaults.motion.signalPaths,
      voiceSignalPaths: brandContext.voiceSignals?.signalPaths ?? [],
      missingInputs: brandContext.missingInputs,
    },
    renderer: {
      owner: "components/editron/editor/version-7.0.0/components/core/layer-content.tsx",
      contract: "saas-generated-scene/v1",
    },
  };
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

function hasProductSpecificVisualProof(brandContext: SaasExplainerBrandContext): boolean {
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

function productMetricLabel(scene: SceneDescriptor): string {
  if ((scene as any).sceneType === "montage") return "Multi-step";
  if (scene.mood === "energetic") return "Fast path";
  if (scene.mood === "serious") return "Control";
  return "Product-led";
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
