import type { BrandInputs } from "@/lib/editron/data/motion-theme-resolver";
import { brandInputsFromUnifiedBrandAtomic } from "@/lib/editron/motion-graphics/engine/brand-composition-rules";
import { brandInputsFromBrandSignalProfile } from "@/lib/editron/motion-graphics/engine/brand-vault-to-motion";
import { buildRichBrandContextBlock } from "@/lib/shared/brand-context-block";
import { resolveEffectiveBrandWithProfile, type EffectiveBrandSource } from "@/lib/shared/brand-effective-resolver";
import { isBrandSignalActionable, type BrandSignal, type BrandSignalProfile } from "@/lib/shared/brand-signal-profile";

export type SaasExplainerBrandMissingInput =
  | "brand_id"
  | "accepted_brand_vault_profile"
  | "brand_context_block"
  | "brand_palette"
  | "brand_typography"
  | "brand_motion_tokens"
  | "brand_product_context"
  | "brand_product_images"
  | "brand_logo";

export interface ResolveSaasExplainerBrandContextInput {
  userId: string;
  brandId?: string;
  orgId?: string | null;
}

export interface SaasExplainerBrandContextMetadata {
  source: EffectiveBrandSource | "not_requested";
  brandId?: string;
  acceptedProfile: boolean;
  promptContextProvided: boolean;
  brandInputKeys: string[];
  missingInputs: SaasExplainerBrandMissingInput[];
}

export interface SaasExplainerBrandContext {
  promptBlock: string;
  brandInputs: Partial<BrandInputs>;
  missingInputs: SaasExplainerBrandMissingInput[];
  metadata: SaasExplainerBrandContextMetadata;
}

export async function resolveSaasExplainerBrandContext(
  input: ResolveSaasExplainerBrandContextInput,
): Promise<SaasExplainerBrandContext> {
  if (!input.brandId) {
    return emptyBrandContext({
      source: "not_requested",
      missingInputs: ["brand_id", "accepted_brand_vault_profile"],
    });
  }

  const resolution = await resolveEffectiveBrandWithProfile(input.userId, input.brandId, {
    service: "editron",
    enabled: true,
    strict: true,
    orgId: input.orgId ?? null,
  });

  if (!resolution.acceptedProfile) {
    return emptyBrandContext({
      source: resolution.source,
      brandId: input.brandId,
      missingInputs: ["accepted_brand_vault_profile"],
    });
  }

  const brandInputs = compactBrandInputs({
    ...brandInputsFromUnifiedBrandAtomic(resolution.brand),
    ...brandInputsFromBrandSignalProfile(resolution.acceptedProfile, resolution.brand),
  });
  const contextBlock = buildRichBrandContextBlock(resolution.acceptedProfile, resolution.brand).trim();
  const missingInputs = collectMissingInputs(resolution.acceptedProfile, contextBlock, brandInputs);
  const renderTokenBlock = formatBrandRenderTokens(brandInputs);
  const promptBlock = [
    "<saas_explainer_brand_vault_context>",
    "Source: accepted Brand Vault profile. Treat as default product, voice, visual, and motion context unless the user explicitly overrides it.",
    contextBlock,
    renderTokenBlock,
    missingInputs.length > 0
      ? `Missing Brand Vault inputs: ${missingInputs.join(", ")}. Do not invent missing brand assets.`
      : null,
    "</saas_explainer_brand_vault_context>",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    promptBlock,
    brandInputs,
    missingInputs,
    metadata: {
      source: "brand_vault",
      brandId: input.brandId,
      acceptedProfile: true,
      promptContextProvided: true,
      brandInputKeys: Object.keys(brandInputs).sort(),
      missingInputs,
    },
  };
}

function emptyBrandContext(input: {
  source: SaasExplainerBrandContextMetadata["source"];
  brandId?: string;
  missingInputs: SaasExplainerBrandMissingInput[];
}): SaasExplainerBrandContext {
  return {
    promptBlock: "",
    brandInputs: {},
    missingInputs: input.missingInputs,
    metadata: {
      source: input.source,
      brandId: input.brandId,
      acceptedProfile: false,
      promptContextProvided: false,
      brandInputKeys: [],
      missingInputs: input.missingInputs,
    },
  };
}

function collectMissingInputs(
  profile: BrandSignalProfile,
  contextBlock: string,
  brandInputs: Partial<BrandInputs>,
): SaasExplainerBrandMissingInput[] {
  const missing = new Set<SaasExplainerBrandMissingInput>();
  if (!contextBlock) missing.add("brand_context_block");
  if (!brandInputs.primaryColor && !brandInputs.accentColor && !brandInputs.palette?.length) missing.add("brand_palette");
  if (!brandInputs.headingFont && !brandInputs.bodyFont && !brandInputs.typography) missing.add("brand_typography");
  if (!hasAnyNumber(brandInputs.motionEnergy, brandInputs.transitionSharpness, brandInputs.pacePreference)) {
    missing.add("brand_motion_tokens");
  }
  if (!actionableList(profile.identity.productServices)?.length) missing.add("brand_product_context");
  if (!actionableList(profile.assets?.productImages)?.length) missing.add("brand_product_images");
  missing.add("brand_logo");
  return [...missing];
}

function formatBrandRenderTokens(brandInputs: Partial<BrandInputs>): string {
  const lines = [
    brandInputs.primaryColor ? `Primary color: ${brandInputs.primaryColor}` : null,
    brandInputs.accentColor ? `Accent color: ${brandInputs.accentColor}` : null,
    brandInputs.palette?.length ? `Palette: ${brandInputs.palette.join(", ")}` : null,
    brandInputs.typography ? `Typography: ${brandInputs.typography}` : null,
    brandInputs.headingFont ? `Heading font: ${brandInputs.headingFont}` : null,
    brandInputs.bodyFont ? `Body font: ${brandInputs.bodyFont}` : null,
    brandInputs.motionEnergy !== undefined ? `Motion energy: ${brandInputs.motionEnergy}` : null,
    brandInputs.transitionSharpness !== undefined ? `Transition sharpness: ${brandInputs.transitionSharpness}` : null,
    brandInputs.pacePreference !== undefined ? `Pace preference: ${brandInputs.pacePreference}` : null,
    brandInputs.safeZones !== undefined ? `Safe zones: ${brandInputs.safeZones}` : null,
    brandInputs.figureGroundRatio !== undefined ? `Figure/ground ratio: ${brandInputs.figureGroundRatio}` : null,
  ].filter(Boolean);

  if (lines.length === 0) return "";
  return ["<brand_render_tokens>", ...lines, "</brand_render_tokens>"].join("\n");
}

function actionableList(signal: BrandSignal<string[]> | undefined): string[] | undefined {
  return signal && isBrandSignalActionable(signal) && signal.value.length > 0 ? signal.value : undefined;
}

function hasAnyNumber(...values: Array<number | undefined>): boolean {
  return values.some((value) => typeof value === "number" && Number.isFinite(value));
}

function compactBrandInputs(inputs: Partial<BrandInputs>): Partial<BrandInputs> {
  const output: Partial<BrandInputs> = {};
  for (const [key, value] of Object.entries(inputs) as Array<[keyof BrandInputs, BrandInputs[keyof BrandInputs]]>) {
    if (value !== undefined && value !== "") output[key] = value as never;
  }
  return output;
}