import type { BrandInputs } from "@/lib/editron/data/motion-theme-resolver";
import { brandInputsFromUnifiedBrandAtomic } from "@/lib/editron/motion-graphics/engine/brand-composition-rules";
import { brandInputsFromBrandSignalProfile } from "@/lib/editron/motion-graphics/engine/brand-vault-to-motion";
import { buildRichBrandContextBlock } from "@/lib/shared/brand-context-block";
import type { EffectiveBrandSource } from "@/lib/shared/brand-effective-resolver";
import { brandSignalProfileToUnifiedBrand } from "@/lib/shared/brand-signal-profile-adapter";
import type { BrandSignalProfileRecord } from "@/lib/shared/brand-signal-lifecycle";
import { isBrandSignalActionable, type BrandSignal, type BrandSignalProfile } from "@/lib/shared/brand-signal-profile";
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
  diagnosticSummary?: {
    signalCount: number;
    readyCount: number;
    weakCount: number;
    missingCount: number;
    fallbackCount: number;
    reviewOnlyCount: number;
  };
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
  const contextBlock = buildRichBrandContextBlock(profile, brand).trim();
  const missingInputs = collectMissingInputs({
    profile,
    contextBlock,
    brandInputs,
    reviewPayload,
    candidates,
  });
  const renderTokenBlock = formatBrandRenderTokens(brandInputs);
  const visualIdentityBlock = formatVisualIdentityContext(reviewPayload?.visualIdentity);
  const evidenceBlock = formatEvidenceContext(reviewPayload, candidates);
  const diagnosticsBlock = formatDiagnosticsContext(reviewPayload);
  const promptBlock = [
    "<saas_explainer_brand_vault_context>",
    "Source: accepted Brand Vault profile plus review payload, visual identity, and evidence candidates. Treat as default product, voice, visual, and motion context unless the user explicitly overrides it.",
    contextBlock,
    renderTokenBlock,
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

function collectMissingInputs(input: {
  profile: BrandSignalProfile;
  contextBlock: string;
  brandInputs: Partial<BrandInputs>;
  reviewPayload: BrandVaultWebsiteDraftReviewPayload | null;
  candidates: BrandEvidenceCandidate[];
}): SaasExplainerBrandMissingInput[] {
  const { brandInputs, candidates, contextBlock, profile, reviewPayload } = input;
  const missing = new Set<SaasExplainerBrandMissingInput>();
  if (!contextBlock) missing.add("brand_context_block");
  if (!reviewPayload) missing.add("brand_review_payload");
  if (!reviewPayload && profile.evidence.length === 0 && candidates.length === 0) missing.add("brand_source_evidence");
  if (!brandInputs.primaryColor && !brandInputs.accentColor && !brandInputs.palette?.length) missing.add("brand_palette");
  if (!brandInputs.headingFont && !brandInputs.bodyFont && !brandInputs.typography) missing.add("brand_typography");
  if (!hasAnyNumber(brandInputs.motionEnergy, brandInputs.transitionSharpness, brandInputs.pacePreference)) {
    missing.add("brand_motion_tokens");
  }
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

function hasCandidateFor(candidates: BrandEvidenceCandidate[], signalPath: string): boolean {
  return candidates.some((candidate) => candidate.signalPath === signalPath);
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}
