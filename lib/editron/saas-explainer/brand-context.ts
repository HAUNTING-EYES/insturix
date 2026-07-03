import type { BrandInputs } from "@/lib/editron/data/motion-theme-resolver";
import { brandInputsFromUnifiedBrandAtomic } from "@/lib/editron/motion-graphics/engine/brand-composition-rules";
import { brandInputsFromBrandSignalProfile } from "@/lib/editron/motion-graphics/engine/brand-vault-to-motion";
import { buildRichBrandContextBlock } from "@/lib/shared/brand-context-block";
import type { EffectiveBrandSource } from "@/lib/shared/brand-effective-resolver";
import { brandSignalProfileToUnifiedBrand } from "@/lib/shared/brand-signal-profile-adapter";
import type { BrandSignalProfileRecord } from "@/lib/shared/brand-signal-lifecycle";
import {
  isBrandSignalActionable,
  type BrandProofStyle,
  type BrandSignal,
  type BrandSignalProfile,
} from "@/lib/shared/brand-signal-profile";
import {
  createBrandVaultDraftReviewPayload,
  type BrandVaultWebsiteDraftReviewPayload,
} from "@/lib/shared/brand-vault-draft-orchestrator";
import {
  getDefaultBrandVaultRefineryStore,
  type BrandVaultRefineryJobSnapshot,
  type BrandVaultRefineryStore,
} from "@/lib/shared/brand-vault-refinery-api";
import type { BrandVaultVisualIdentitySummary } from "@/lib/shared/brand-vault-visual-identity";
import type { BrandEvidenceCandidate } from "@/lib/shared/brand-website-refinery-types";

export type SaasExplainerBrandMissingInput =
  | "brand_id"
  | "accepted_brand_vault_profile"
  | "brand_context_block"
  | "brand_review_payload"
  | "brand_source_evidence"
  | "brand_palette"
  | "brand_typography"
  | "brand_motion_tokens"
  | "brand_voice"
  | "brand_product_context"
  | "brand_product_images"
  | "brand_logo";

type SaasExplainerBrandVaultStore = Pick<
  BrandVaultRefineryStore,
  "getLatestAcceptedRecord" | "getJobSnapshotByRecordId"
>;

export interface ResolveSaasExplainerBrandContextInput {
  userId: string;
  brandId?: string;
  orgId?: string | null;
  store?: SaasExplainerBrandVaultStore;
}

export interface SaasExplainerBrandDefaultContractMetadata {
  productName?: string;
  productServices: number;
  audience: number;
  valueDrivers: number;
  painPoints: number;
  jobsToBeDone: number;
  proofStyle?: BrandProofStyle;
  outcomeHintProvided: boolean;
  colorCount: number;
  fontCount: number;
  logoAssetCount: number;
  productImageCount: number;
  visualSignalPaths: string[];
  motionSignalPaths: string[];
}

export interface SaasExplainerBrandContextMetadata {
  source: EffectiveBrandSource | "not_requested";
  brandId?: string;
  recordId?: string;
  jobId?: string;
  acceptedProfile: boolean;
  reviewPayloadProvided?: boolean;
  promptContextProvided: boolean;
  brandInputKeys: string[];
  missingInputs: SaasExplainerBrandMissingInput[];
  candidateCount?: number;
  evidenceCount?: number;
  visualIdentityCounts?: {
    colors: number;
    fonts: number;
    logos: number;
    images: number;
  };
  intakeStatuses?: {
    website?: string;
    social?: string;
    uploads?: string;
  };
  defaultContract?: SaasExplainerBrandDefaultContractMetadata;
  diagnosticSummary?: {
    signalCount: number;
    readyCount: number;
    weakCount: number;
    missingCount: number;
    fallbackCount: number;
    reviewOnlyCount: number;
  };
}

export interface SaasExplainerBrandVoiceSignals {
  assertiveness?: number;
  warmth?: number;
  jargonDensity?: number;
  humor?: number;
  defaultFormality?: number;
  ctaDirectness?: number;
  recurringPhrases?: string[];
  killList?: string[];
  hookArchetypes?: string[];
  signalPaths: string[];
}

export interface SaasExplainerBrandVisualAssetDefault {
  kind: string;
  label: string;
  url: string;
  stored: boolean;
  signalPath?: string;
  sourceType?: string;
}

export interface SaasExplainerBrandDefaultBrief {
  productName?: string;
  productServices: string[];
  audience: string[];
  valueDrivers: string[];
  painPoints: string[];
  jobsToBeDone: string[];
  proofStyle?: BrandProofStyle;
  outcomeHint?: string;
}

export interface SaasExplainerBrandVisualDefaults {
  colors: string[];
  fonts: string[];
  logoAssets: SaasExplainerBrandVisualAssetDefault[];
  productImages: SaasExplainerBrandVisualAssetDefault[];
  minimalism?: number;
  densityTolerance?: number;
  dataVizAffinity?: number;
  expressiveness?: number;
  cornerRadiusBias?: number;
  layoutSymmetry?: number;
  contrastPreference?: number;
  signalPaths: string[];
}

export interface SaasExplainerBrandMotionDefaults {
  motionEnergy?: number;
  overshootTolerance?: number;
  transitionSharpness?: number;
  rhythmRegularity?: number;
  anticipationStyle?: number;
  easingTaste?: number;
  pacePreference?: number;
  safeZones?: number;
  figureGroundRatio?: number;
  signalPaths: string[];
}

export interface SaasExplainerBrandDefaults {
  brief: SaasExplainerBrandDefaultBrief;
  visual: SaasExplainerBrandVisualDefaults;
  motion: SaasExplainerBrandMotionDefaults;
}

export interface SaasExplainerBrandContext {
  promptBlock: string;
  brandInputs: Partial<BrandInputs>;
  voiceSignals?: SaasExplainerBrandVoiceSignals;
  defaults: SaasExplainerBrandDefaults;
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

  const store = input.store ?? getDefaultBrandVaultRefineryStore();
  const record = await resolveAcceptedRecord(store, {
    brandId: input.brandId,
    userId: input.userId,
    orgId: input.orgId ?? null,
  });

  if (!record) {
    return emptyBrandContext({
      source: "none",
      brandId: input.brandId,
      missingInputs: ["accepted_brand_vault_profile"],
    });
  }

  const snapshot = await resolveJobSnapshot(store, record.id);
  const reviewPayload = buildReviewPayload(record, snapshot);
  const profile = record.profile;
  const brand = brandSignalProfileToUnifiedBrand(profile, null);
  const candidates = snapshot?.candidates ?? [];
  const brandInputs = compactBrandInputs({
    ...brandInputsFromUnifiedBrandAtomic(brand),
    ...brandInputsFromBrandSignalProfile(profile, brand),
    ...brandInputsFromVisualIdentity(reviewPayload?.visualIdentity),
  });
  const voiceSignals = brandVoiceSignalsFromProfile(profile);
  const defaults = buildBrandDefaults(profile, reviewPayload?.visualIdentity);
  const contextBlock = buildRichBrandContextBlock(profile, brand).trim();
  const missingInputs = collectMissingInputs({
    profile,
    contextBlock,
    brandInputs,
    voiceSignals,
    reviewPayload,
    candidates,
  });
  const renderTokenBlock = formatBrandRenderTokens(brandInputs);
  const voiceTokenBlock = formatBrandVoiceTokens(voiceSignals);
  const defaultBriefBlock = formatBrandDefaultBrief(defaults.brief);
  const visualDefaultsBlock = formatBrandVisualDefaults(defaults.visual);
  const motionDefaultsBlock = formatBrandMotionDefaults(defaults.motion);
  const visualIdentityBlock = formatVisualIdentityContext(reviewPayload?.visualIdentity);
  const evidenceBlock = formatEvidenceContext(reviewPayload, candidates);
  const diagnosticsBlock = formatDiagnosticsContext(reviewPayload);
  const promptBlock = [
    "<saas_explainer_brand_vault_context>",
    "Source: accepted Brand Vault profile plus review payload, visual identity, and evidence candidates. Treat as default product, voice, visual, and motion context unless the user explicitly overrides it.",
    contextBlock,
    defaultBriefBlock,
    renderTokenBlock,
    voiceTokenBlock,
    visualDefaultsBlock,
    motionDefaultsBlock,
    visualIdentityBlock,
    evidenceBlock,
    diagnosticsBlock,
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
    voiceSignals,
    defaults,
    missingInputs,
    metadata: {
      source: "brand_vault",
      brandId: input.brandId,
      recordId: record.id,
      jobId: snapshot?.job.id,
      acceptedProfile: true,
      reviewPayloadProvided: Boolean(reviewPayload),
      promptContextProvided: true,
      brandInputKeys: Object.keys(brandInputs).sort(),
      missingInputs,
      defaultContract: summarizeDefaultContract(defaults),
      candidateCount: reviewPayload?.candidateCount ?? candidates.length,
      evidenceCount: reviewPayload?.evidenceCount ?? profile.evidence.length,
      visualIdentityCounts: reviewPayload ? visualIdentityCounts(reviewPayload.visualIdentity) : undefined,
      intakeStatuses: reviewPayload
        ? {
            website: reviewPayload.intake.website.status,
            social: reviewPayload.intake.social.status,
            uploads: reviewPayload.intake.uploads.status,
          }
        : undefined,
      diagnosticSummary: reviewPayload?.signalDiagnostics.summary,
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
    defaults: emptyBrandDefaults(),
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

function emptyBrandDefaults(): SaasExplainerBrandDefaults {
  return {
    brief: { productServices: [], audience: [], valueDrivers: [], painPoints: [], jobsToBeDone: [] },
    visual: { colors: [], fonts: [], logoAssets: [], productImages: [], signalPaths: [] },
    motion: { signalPaths: [] },
  };
}

function buildBrandDefaults(profile: BrandSignalProfile, visualIdentity: BrandVaultVisualIdentitySummary | undefined): SaasExplainerBrandDefaults {
  const baseBrief: Omit<SaasExplainerBrandDefaultBrief, "outcomeHint"> = {
    productName: actionableValue(profile.identity.brandName),
    productServices: actionableList(profile.identity.productServices) ?? [],
    audience: actionableList(profile.identity.audience) ?? [],
    valueDrivers: actionableList(profile.identity.audiencePsychographics?.valueDrivers) ?? [],
    painPoints: actionableList(profile.identity.audiencePsychographics?.painPoints) ?? [],
    jobsToBeDone: actionableList(profile.identity.audiencePsychographics?.jobsToBeDone) ?? [],
    proofStyle: actionableValue(profile.identity.proofStyle),
  };
  return {
    brief: { ...baseBrief, outcomeHint: buildBrandOutcomeHint(baseBrief) },
    visual: brandVisualDefaultsFromProfile(profile, visualIdentity),
    motion: brandMotionDefaultsFromProfile(profile),
  };
}

function buildBrandOutcomeHint(brief: Omit<SaasExplainerBrandDefaultBrief, "outcomeHint">): string | undefined {
  const subject = brief.productServices[0] ?? brief.productName;
  if (!subject) return undefined;
  const audience = brief.audience[0] ? ` for ${brief.audience[0]}` : "";
  const painPoint = brief.painPoints[0] ? ` by addressing ${brief.painPoints[0]}` : "";
  const proof = brief.proofStyle && brief.proofStyle !== "unknown" ? ` Use ${brief.proofStyle} proof where evidence exists.` : "";
  return `Create a product-led SaaS explainer for ${subject}${audience}${painPoint}.${proof}`;
}

function brandVisualDefaultsFromProfile(profile: BrandSignalProfile, visualIdentity: BrandVaultVisualIdentitySummary | undefined): SaasExplainerBrandVisualDefaults {
  const visual: SaasExplainerBrandVisualDefaults = {
    colors: uniqueStrings([
      actionableValue(profile.palette.primary),
      actionableValue(profile.palette.accent),
      ...(actionableList(profile.palette.supporting) ?? []),
      ...(actionableList(profile.palette.neutrals) ?? []),
      ...(visualIdentity?.colors.map((color) => color.value) ?? []),
    ]).slice(0, 12),
    fonts: uniqueStrings(visualIdentity?.fonts.map((font) => font.cssFontFamily || font.family) ?? []).slice(0, 6),
    logoAssets: (visualIdentity?.logos ?? []).slice(0, 4).map(summarizeVisualAsset),
    productImages: [
      ...(visualIdentity?.images ?? []).slice(0, 6).map(summarizeVisualAsset),
      ...assetUrlsAsDefaults(actionableList(profile.assets?.productImages) ?? [], "product"),
      ...assetUrlsAsDefaults(actionableList(profile.assets?.socialPreviewImages) ?? [], "social_media"),
    ].slice(0, 8),
    signalPaths: [],
  };
  copyNumberDefault(profile.visual?.minimalism, "visual.minimalism", visual, (value) => { visual.minimalism = value; });
  copyNumberDefault(profile.visual?.densityTolerance, "visual.densityTolerance", visual, (value) => { visual.densityTolerance = value; });
  copyNumberDefault(profile.visual?.dataVizAffinity, "visual.dataVizAffinity", visual, (value) => { visual.dataVizAffinity = value; });
  copyNumberDefault(profile.visual?.expressiveness, "visual.expressiveness", visual, (value) => { visual.expressiveness = value; });
  copyNumberDefault(profile.visual?.cornerRadiusBias, "visual.cornerRadiusBias", visual, (value) => { visual.cornerRadiusBias = value; });
  copyNumberDefault(profile.visual?.layoutSymmetry, "visual.layoutSymmetry", visual, (value) => { visual.layoutSymmetry = value; });
  copyNumberDefault(profile.visual?.contrastPreference, "visual.contrastPreference", visual, (value) => { visual.contrastPreference = value; });
  return visual;
}

function brandMotionDefaultsFromProfile(profile: BrandSignalProfile): SaasExplainerBrandMotionDefaults {
  const motion: SaasExplainerBrandMotionDefaults = { signalPaths: [] };
  copyNumberDefault(profile.motion?.motionEnergy, "motion.motionEnergy", motion, (value) => { motion.motionEnergy = value; });
  copyNumberDefault(profile.motion?.overshootTolerance, "motion.overshootTolerance", motion, (value) => { motion.overshootTolerance = value; });
  copyNumberDefault(profile.motion?.transitionSharpness, "motion.transitionSharpness", motion, (value) => { motion.transitionSharpness = value; });
  copyNumberDefault(profile.motion?.rhythmRegularity, "motion.rhythmRegularity", motion, (value) => { motion.rhythmRegularity = value; });
  copyNumberDefault(profile.motion?.anticipationStyle, "motion.anticipationStyle", motion, (value) => { motion.anticipationStyle = value; });
  copyNumberDefault(profile.motion?.easingTaste, "motion.easingTaste", motion, (value) => { motion.easingTaste = value; });
  copyNumberDefault(profile.narrative?.pacePreference, "narrative.pacePreference", motion, (value) => { motion.pacePreference = value; });
  copyNumberDefault(profile.composition?.safeZones, "composition.safeZones", motion, (value) => { motion.safeZones = value; });
  copyNumberDefault(profile.composition?.figureGroundRatio, "composition.figureGroundRatio", motion, (value) => { motion.figureGroundRatio = value; });
  return motion;
}

function formatBrandDefaultBrief(brief: SaasExplainerBrandDefaultBrief): string {
  const lines = [
    "<brand_default_brief>",
    brief.productName ? `Default product name: ${brief.productName}` : null,
    brief.productServices.length ? `Products/services: ${brief.productServices.join(", ")}` : null,
    brief.audience.length ? `Audience: ${brief.audience.join(", ")}` : null,
    brief.valueDrivers.length ? `Audience value drivers: ${brief.valueDrivers.join(", ")}` : null,
    brief.painPoints.length ? `Audience pain points: ${brief.painPoints.join(", ")}` : null,
    brief.jobsToBeDone.length ? `Jobs to be done: ${brief.jobsToBeDone.join(", ")}` : null,
    brief.proofStyle && brief.proofStyle !== "unknown" ? `Proof style: ${brief.proofStyle}` : null,
    brief.outcomeHint ? `Default outcome: ${brief.outcomeHint}` : null,
    "</brand_default_brief>",
  ].filter(Boolean);
  return lines.length > 2 ? lines.join("\n") : "";
}

function formatBrandVisualDefaults(visual: SaasExplainerBrandVisualDefaults): string {
  const lines = [
    "<brand_visual_defaults>",
    visual.colors.length ? `Resolved colors: ${visual.colors.join(", ")}` : null,
    visual.fonts.length ? `Resolved fonts: ${visual.fonts.join(", ")}` : null,
    visual.logoAssets.length ? `Logo defaults: ${visual.logoAssets.map((asset) => `${asset.label} (${asset.url})`).join(" | ")}` : null,
    visual.productImages.length ? `Product image defaults: ${visual.productImages.map((asset) => `${asset.label} (${asset.url})`).join(" | ")}` : null,
    visual.signalPaths.length ? `Visual signal paths: ${visual.signalPaths.join(", ")}` : null,
    "</brand_visual_defaults>",
  ].filter(Boolean);
  return lines.length > 2 ? lines.join("\n") : "";
}

function formatBrandMotionDefaults(motion: SaasExplainerBrandMotionDefaults): string {
  if (motion.signalPaths.length === 0) return "";
  const values = [
    motion.motionEnergy !== undefined ? `motionEnergy=${motion.motionEnergy}` : null,
    motion.transitionSharpness !== undefined ? `transitionSharpness=${motion.transitionSharpness}` : null,
    motion.rhythmRegularity !== undefined ? `rhythmRegularity=${motion.rhythmRegularity}` : null,
    motion.anticipationStyle !== undefined ? `anticipationStyle=${motion.anticipationStyle}` : null,
    motion.easingTaste !== undefined ? `easingTaste=${motion.easingTaste}` : null,
    motion.pacePreference !== undefined ? `pacePreference=${motion.pacePreference}` : null,
    motion.safeZones !== undefined ? `safeZones=${motion.safeZones}` : null,
    motion.figureGroundRatio !== undefined ? `figureGroundRatio=${motion.figureGroundRatio}` : null,
  ].filter(Boolean);
  return ["<brand_motion_defaults>", values.length ? `Motion values: ${values.join(", ")}` : null, `Motion signal paths: ${motion.signalPaths.join(", ")}`, "</brand_motion_defaults>"].filter(Boolean).join("\n");
}

function summarizeDefaultContract(defaults: SaasExplainerBrandDefaults): SaasExplainerBrandDefaultContractMetadata {
  return {
    productName: defaults.brief.productName,
    productServices: defaults.brief.productServices.length,
    audience: defaults.brief.audience.length,
    valueDrivers: defaults.brief.valueDrivers.length,
    painPoints: defaults.brief.painPoints.length,
    jobsToBeDone: defaults.brief.jobsToBeDone.length,
    proofStyle: defaults.brief.proofStyle,
    outcomeHintProvided: Boolean(defaults.brief.outcomeHint),
    colorCount: defaults.visual.colors.length,
    fontCount: defaults.visual.fonts.length,
    logoAssetCount: defaults.visual.logoAssets.length,
    productImageCount: defaults.visual.productImages.length,
    visualSignalPaths: defaults.visual.signalPaths.slice(0, 12),
    motionSignalPaths: defaults.motion.signalPaths.slice(0, 12),
  };
}

function summarizeVisualAsset(asset: BrandVaultVisualIdentitySummary["images"][number]): SaasExplainerBrandVisualAssetDefault {
  return {
    kind: asset.kind,
    label: asset.label,
    url: asset.storage?.publicUrl || asset.thumbnailUrl || asset.url,
    stored: asset.storage?.status === "stored",
    signalPath: asset.signalPath,
    sourceType: asset.sourceType,
  };
}

function assetUrlsAsDefaults(urls: string[], kind: string): SaasExplainerBrandVisualAssetDefault[] {
  return urls.map((url, index) => ({ kind, label: `${kind} ${index + 1}`, url, stored: false, signalPath: kind === "product" ? "assets.productImages" : "assets.socialPreviewImages" }));
}

function copyNumberDefault<T extends { signalPaths: string[] }>(signal: BrandSignal<number> | undefined, path: string, target: T, apply: (value: number) => void): void {
  if (!signal || !isBrandSignalActionable(signal) || !Number.isFinite(signal.value)) return;
  apply(clamp01(signal.value));
  target.signalPaths.push(path);
}
function collectMissingInputs(input: {
  profile: BrandSignalProfile;
  contextBlock: string;
  brandInputs: Partial<BrandInputs>;
  voiceSignals?: SaasExplainerBrandVoiceSignals;
  reviewPayload: BrandVaultWebsiteDraftReviewPayload | null;
  candidates: BrandEvidenceCandidate[];
}): SaasExplainerBrandMissingInput[] {
  const { brandInputs, candidates, contextBlock, profile, reviewPayload, voiceSignals } = input;
  const missing = new Set<SaasExplainerBrandMissingInput>();
  if (!contextBlock) missing.add("brand_context_block");
  if (!reviewPayload) missing.add("brand_review_payload");
  if (!reviewPayload && profile.evidence.length === 0 && candidates.length === 0) missing.add("brand_source_evidence");
  if (!brandInputs.primaryColor && !brandInputs.accentColor && !brandInputs.palette?.length) missing.add("brand_palette");
  if (!brandInputs.headingFont && !brandInputs.bodyFont && !brandInputs.typography) missing.add("brand_typography");
  if (!hasAnyNumber(brandInputs.motionEnergy, brandInputs.transitionSharpness, brandInputs.pacePreference)) {
    missing.add("brand_motion_tokens");
  }
  if (!voiceSignals || voiceSignals.signalPaths.length === 0) missing.add("brand_voice");
  if (!actionableList(profile.identity.productServices)?.length) missing.add("brand_product_context");
  if (!actionableList(profile.assets?.productImages)?.length && !reviewPayload?.visualIdentity.images.length) {
    missing.add("brand_product_images");
  }
  if (!reviewPayload?.visualIdentity.logos.length && !hasCandidateFor(candidates, "assets.logoCandidates")) {
    missing.add("brand_logo");
  }
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

function formatBrandVoiceTokens(voiceSignals: SaasExplainerBrandVoiceSignals | undefined): string {
  if (!voiceSignals || voiceSignals.signalPaths.length === 0) return "";
  const lines = [
    voiceSignals.assertiveness !== undefined ? `Assertiveness: ${voiceSignals.assertiveness}` : null,
    voiceSignals.warmth !== undefined ? `Warmth: ${voiceSignals.warmth}` : null,
    voiceSignals.jargonDensity !== undefined ? `Jargon density: ${voiceSignals.jargonDensity}` : null,
    voiceSignals.humor !== undefined ? `Humor: ${voiceSignals.humor}` : null,
    voiceSignals.defaultFormality !== undefined ? `Default formality: ${voiceSignals.defaultFormality}` : null,
    voiceSignals.ctaDirectness !== undefined ? `CTA directness: ${voiceSignals.ctaDirectness}` : null,
    voiceSignals.recurringPhrases?.length ? `Recurring phrases: ${voiceSignals.recurringPhrases.join(", ")}` : null,
    voiceSignals.killList?.length ? `Avoid words: ${voiceSignals.killList.join(", ")}` : null,
    voiceSignals.hookArchetypes?.length ? `Hook archetypes: ${voiceSignals.hookArchetypes.join(", ")}` : null,
    `Accepted signal paths: ${voiceSignals.signalPaths.join(", ")}`,
  ].filter(Boolean);
  return ["<brand_voice_tokens>", ...lines, "</brand_voice_tokens>"].join("\n");
}

function brandVoiceSignalsFromProfile(profile: BrandSignalProfile): SaasExplainerBrandVoiceSignals | undefined {
  const signals: SaasExplainerBrandVoiceSignals = { signalPaths: [] };

  copyNumberSignal(profile.voice.assertiveness, "voice.assertiveness", signals, "assertiveness");
  copyNumberSignal(profile.voice.warmth, "voice.warmth", signals, "warmth");
  copyNumberSignal(profile.voice.jargonDensity, "voice.jargonDensity", signals, "jargonDensity");
  copyNumberSignal(profile.voice.humor, "voice.humor", signals, "humor");
  copyNumberSignal(profile.voice.defaultFormality, "voice.defaultFormality", signals, "defaultFormality");
  copyNumberSignal(profile.voice.ctaDirectness, "voice.ctaDirectness", signals, "ctaDirectness");
  copyStringListSignal(profile.voice.recurringPhrases, "voice.recurringPhrases", signals, "recurringPhrases");
  copyStringListSignal(profile.voice.killList, "voice.killList", signals, "killList");
  copyStringListSignal(profile.voice.hookArchetypes, "voice.hookArchetypes", signals, "hookArchetypes");

  return signals.signalPaths.length > 0 ? signals : undefined;
}

function copyNumberSignal(
  signal: BrandSignal<number> | undefined,
  path: string,
  target: SaasExplainerBrandVoiceSignals,
  key: keyof Pick<
    SaasExplainerBrandVoiceSignals,
    "assertiveness" | "warmth" | "jargonDensity" | "humor" | "defaultFormality" | "ctaDirectness"
  >,
): void {
  if (!signal || !isBrandSignalActionable(signal) || !Number.isFinite(signal.value)) return;
  target[key] = clamp01(signal.value);
  target.signalPaths.push(path);
}

function copyStringListSignal(
  signal: BrandSignal<string[]> | undefined,
  path: string,
  target: SaasExplainerBrandVoiceSignals,
  key: keyof Pick<SaasExplainerBrandVoiceSignals, "recurringPhrases" | "killList" | "hookArchetypes">,
): void {
  if (!signal || !isBrandSignalActionable(signal) || signal.value.length === 0) return;
  target[key] = uniqueStrings(signal.value).slice(0, 8);
  target.signalPaths.push(path);
}

async function resolveAcceptedRecord(
  store: SaasExplainerBrandVaultStore,
  filter: { brandId: string; userId: string; orgId?: string | null },
): Promise<BrandSignalProfileRecord | null> {
  try {
    return await store.getLatestAcceptedRecord(filter);
  } catch (error) {
    console.error("[saas-explainer-brand-context] accepted Brand Vault record read failed", error);
    return null;
  }
}

async function resolveJobSnapshot(
  store: SaasExplainerBrandVaultStore,
  recordId: string,
): Promise<BrandVaultRefineryJobSnapshot | null> {
  try {
    return await store.getJobSnapshotByRecordId(recordId);
  } catch (error) {
    console.error("[saas-explainer-brand-context] Brand Vault job snapshot read failed", error);
    return null;
  }
}

function buildReviewPayload(
  record: BrandSignalProfileRecord,
  snapshot: BrandVaultRefineryJobSnapshot | null,
): BrandVaultWebsiteDraftReviewPayload | null {
  if (!snapshot) return null;
  return snapshot.reviewPayload ?? createBrandVaultDraftReviewPayload({
    job: snapshot.job,
    record,
    candidates: snapshot.candidates,
    normalizedUrl: snapshot.normalizedUrl ?? "",
    warnings: snapshot.job.warnings,
  });
}

function brandInputsFromVisualIdentity(
  visualIdentity: BrandVaultVisualIdentitySummary | undefined,
): Partial<BrandInputs> {
  if (!visualIdentity?.fonts.length) return {};
  const display = visualIdentity.fonts.find((font) => font.role === "display") ?? visualIdentity.fonts[0];
  const body = visualIdentity.fonts.find((font) => font.role === "body") ?? display;
  const families = uniqueStrings(visualIdentity.fonts.map((font) => font.family)).slice(0, 4);
  return compactBrandInputs({
    headingFont: display?.cssFontFamily || display?.family,
    bodyFont: body?.cssFontFamily || body?.family,
    typography: families.length ? families.join(" / ") : undefined,
  });
}

function formatVisualIdentityContext(visualIdentity: BrandVaultVisualIdentitySummary | undefined): string {
  if (!visualIdentity) return "";
  const lines = [
    "<brand_visual_identity>",
    visualIdentity.colors.length
      ? `Colors: ${visualIdentity.colors.slice(0, 10).map((color) => `${color.label} ${color.value}`).join(", ")}`
      : null,
    visualIdentity.fonts.length
      ? `Fonts: ${visualIdentity.fonts.slice(0, 6).map((font) => `${font.family} (${font.role}, ${font.previewStatus})`).join(", ")}`
      : null,
    visualIdentity.logos.length
      ? `Logo assets: ${visualIdentity.logos.slice(0, 4).map(formatVisualAsset).join(" | ")}`
      : null,
    visualIdentity.images.length
      ? `Product/social/preview images: ${visualIdentity.images.slice(0, 6).map(formatVisualAsset).join(" | ")}`
      : null,
    "</brand_visual_identity>",
  ].filter(Boolean);
  return lines.length > 2 ? lines.join("\n") : "";
}

function formatEvidenceContext(
  reviewPayload: BrandVaultWebsiteDraftReviewPayload | null,
  candidates: BrandEvidenceCandidate[],
): string {
  if (!reviewPayload && candidates.length === 0) return "";
  const lines = [
    "<brand_vault_evidence>",
    reviewPayload
      ? `Evidence: ${reviewPayload.evidenceCount} accepted evidence items; ${reviewPayload.candidateCount} review candidates.`
      : `Evidence: ${candidates.length} review candidates; accepted review payload unavailable.`,
    reviewPayload
      ? `Intake: website=${reviewPayload.intake.website.status}; social=${reviewPayload.intake.social.status}; uploads=${reviewPayload.intake.uploads.status}.`
      : null,
    reviewPayload?.intake.sources.total
      ? `Source kinds: ${Object.entries(reviewPayload.intake.sources.byKind).map(([kind, count]) => `${kind}:${count}`).join(", ")}.`
      : null,
    reviewPayload?.intake.evidenceLanes.length
      ? `Evidence lanes: ${reviewPayload.intake.evidenceLanes.slice(0, 6).map((lane) => `${lane.label}=${lane.status}`).join(", ")}.`
      : null,
    reviewPayload?.warnings.length ? `Warnings: ${reviewPayload.warnings.slice(0, 4).join(" | ")}` : null,
    "</brand_vault_evidence>",
  ].filter(Boolean);
  return lines.length > 2 ? lines.join("\n") : "";
}

function formatDiagnosticsContext(reviewPayload: BrandVaultWebsiteDraftReviewPayload | null): string {
  if (!reviewPayload) return "";
  const summary = reviewPayload.signalDiagnostics.summary;
  const priority = reviewPayload.signalDiagnostics.priorityItems
    .slice(0, 6)
    .map((item) => `${item.path}=${item.status}${item.recommendedEvidence.length ? ` needs ${item.recommendedEvidence.join("/")}` : ""}`);
  return [
    "<brand_signal_diagnostics>",
    `Signals: ${summary.readyCount}/${summary.signalCount} ready; weak=${summary.weakCount}; missing=${summary.missingCount}; fallback=${summary.fallbackCount}; review_only=${summary.reviewOnlyCount}.`,
    priority.length ? `Priority gaps: ${priority.join("; ")}.` : null,
    "</brand_signal_diagnostics>",
  ].filter(Boolean).join("\n");
}

function formatVisualAsset(asset: BrandVaultVisualIdentitySummary["logos"][number]): string {
  const availability = asset.availability?.status ? `, ${asset.availability.status}` : "";
  const storage = asset.storage?.publicUrl ? ", stored" : "";
  return `${asset.kind}: ${asset.label} (${asset.url}${availability}${storage})`;
}

function visualIdentityCounts(visualIdentity: BrandVaultVisualIdentitySummary): NonNullable<SaasExplainerBrandContextMetadata["visualIdentityCounts"]> {
  return {
    colors: visualIdentity.colors.length,
    fonts: visualIdentity.fonts.length,
    logos: visualIdentity.logos.length,
    images: visualIdentity.images.length,
  };
}

function actionableList(signal: BrandSignal<string[]> | undefined): string[] | undefined {
  return signal && isBrandSignalActionable(signal) && signal.value.length > 0 ? signal.value : undefined;
}

function actionableValue<T>(signal: BrandSignal<T> | undefined): T | undefined {
  return signal && isBrandSignalActionable(signal) ? signal.value : undefined;
}

function hasAnyNumber(...values: Array<number | undefined>): boolean {
  return values.some((value) => typeof value === "number" && Number.isFinite(value));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function compactBrandInputs(inputs: Partial<BrandInputs>): Partial<BrandInputs> {
  const output: Partial<BrandInputs> = {};
  for (const [key, value] of Object.entries(inputs) as Array<[keyof BrandInputs, BrandInputs[keyof BrandInputs]]>) {
    if (value !== undefined && value !== "") output[key] = value as never;
  }
  return output;
}

function hasCandidateFor(candidates: BrandEvidenceCandidate[], signalPath: string): boolean {
  return candidates.some((candidate) => candidate.signalPath === signalPath);
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}
