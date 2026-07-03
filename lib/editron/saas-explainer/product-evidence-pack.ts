import {
  summarizeTextPresence,
  type NormalizedSaasExplainerIntake,
} from "@/lib/editron/saas-explainer/intake";
import { getSaasExplainerKnowledgeGraph } from "@/lib/editron/saas-explainer/knowledge-graph";
import type {
  SaasExplainerBrandContext,
  SaasExplainerBrandVisualAssetDefault,
} from "@/lib/editron/saas-explainer/brand-context";

export type SaasProductEvidenceSource =
  | "user_input"
  | "brand_vault"
  | "product_url"
  | "script"
  | "reference_video"
  | "not_available";

export type SaasProductEvidenceGap =
  | "product_name"
  | "product_url"
  | "brand_vault"
  | "logo"
  | "product_screenshots"
  | "product_capabilities"
  | "audience"
  | "proof_claims"
  | "script_or_outcome";

export type SaasProductEvidenceClaimType =
  | "product_url"
  | "positioning"
  | "capability"
  | "audience"
  | "pain"
  | "job"
  | "proof"
  | "script"
  | "outcome";

export type SaasProductEvidenceDegradationSeverity = "info" | "warning" | "blocker";

export interface SaasProductEvidenceAsset {
  kind: string;
  label: string;
  url: string;
  stored: boolean;
  signalPath?: string;
  sourceType?: string;
}

export interface SaasProductEvidenceClaim {
  id: string;
  claimType: SaasProductEvidenceClaimType;
  text: string;
  source: SaasProductEvidenceSource;
  admissible: boolean;
  signalPath?: string;
}

export interface SaasProductEvidenceDegradation {
  code: SaasProductEvidenceGap | "product_url_without_visual_capture";
  severity: SaasProductEvidenceDegradationSeverity;
  message: string;
}

export interface SaasProductEvidencePack {
  schemaVersion: "saas-product-evidence-pack/v1";
  doctrineVersion: string;
  product: {
    name?: string;
    nameSource: SaasProductEvidenceSource;
    productUrl?: string;
    productUrlSource: SaasProductEvidenceSource;
  };
  brief: {
    audience: string[];
    outcome: ReturnType<typeof summarizeTextPresence>;
    script: ReturnType<typeof summarizeTextPresence>;
    productServices: string[];
    valueDrivers: string[];
    painPoints: string[];
    jobsToBeDone: string[];
    proofStyle?: string;
  };
  visualIdentity: {
    colors: string[];
    fonts: string[];
    logoAssets: SaasProductEvidenceAsset[];
    productImages: SaasProductEvidenceAsset[];
    hasLogo: boolean;
    hasProductImages: boolean;
    sourcePaths: string[];
  };
  claimLedger: SaasProductEvidenceClaim[];
  coverage: {
    canUseBrandIdentity: boolean;
    canShowProductDemo: boolean;
    canUseProductUrl: boolean;
    canUseProofScenes: boolean;
    realProductEvidence: boolean;
    syntheticModeRequired: boolean;
    coverageScore: number;
    missingInputs: SaasProductEvidenceGap[];
    counts: {
      claims: number;
      admissibleClaims: number;
      logos: number;
      productImages: number;
      colors: number;
      fonts: number;
    };
  };
  degradations: SaasProductEvidenceDegradation[];
}

export interface BuildSaasProductEvidencePackInput {
  input: NormalizedSaasExplainerIntake;
  originalInput?: NormalizedSaasExplainerIntake;
  productUrl?: string;
  brandContext: SaasExplainerBrandContext;
}

export function buildSaasProductEvidencePack(
  args: BuildSaasProductEvidencePackInput,
): SaasProductEvidencePack {
  const graph = getSaasExplainerKnowledgeGraph();
  const originalInput = args.originalInput ?? args.input;
  const brandDefaults = args.brandContext.defaults;
  const productUrl = args.productUrl || args.input.productUrl;
  const productName = args.input.productName || brandDefaults.brief.productName;
  const audience = collectUnique([
    args.input.audience,
    ...brandDefaults.brief.audience,
  ]);
  const productServices = collectUnique(brandDefaults.brief.productServices);
  const valueDrivers = collectUnique(brandDefaults.brief.valueDrivers);
  const painPoints = collectUnique(brandDefaults.brief.painPoints);
  const jobsToBeDone = collectUnique(brandDefaults.brief.jobsToBeDone);
  const logoAssets = normalizeAssets(brandDefaults.visual.logoAssets);
  const productImages = normalizeAssets(brandDefaults.visual.productImages);
  const colors = collectUnique(brandDefaults.visual.colors);
  const fonts = collectUnique(brandDefaults.visual.fonts);
  const visualSourcePaths = collectUnique([
    ...brandDefaults.visual.signalPaths,
    ...logoAssets.map((asset) => asset.signalPath),
    ...productImages.map((asset) => asset.signalPath),
  ]);

  const claimLedger = buildClaimLedger({
    input: args.input,
    originalInput,
    productUrl,
    productServices,
    valueDrivers,
    painPoints,
    jobsToBeDone,
    audience,
    proofStyle: brandDefaults.brief.proofStyle,
  });

  const missingInputs = collectMissingInputs({
    productName,
    productUrl,
    brandContext: args.brandContext,
    logoAssets,
    productImages,
    productServices,
    audience,
    valueDrivers,
    input: args.input,
  });
  const canUseBrandIdentity = logoAssets.length > 0 || colors.length > 0 || fonts.length > 0;
  const realProductEvidence = productImages.length > 0;
  const coverageChecks = [
    Boolean(productName),
    Boolean(productUrl),
    args.brandContext.metadata.acceptedProfile,
    canUseBrandIdentity,
    realProductEvidence,
    productServices.length > 0,
    audience.length > 0,
    claimLedger.some((claim) => claim.claimType === "proof" && claim.admissible),
    Boolean(args.input.script || args.input.outcome),
  ];
  const coverageScore = Math.round((coverageChecks.filter(Boolean).length / coverageChecks.length) * 100);
  const admissibleClaims = claimLedger.filter((claim) => claim.admissible);

  const pack: SaasProductEvidencePack = {
    schemaVersion: "saas-product-evidence-pack/v1",
    doctrineVersion: graph.meta.version,
    product: {
      name: productName,
      nameSource: resolveProductNameSource(originalInput, brandDefaults.brief.productName),
      productUrl,
      productUrlSource: productUrl ? "user_input" : "not_available",
    },
    brief: {
      audience,
      outcome: summarizeTextPresence(args.input.outcome),
      script: summarizeTextPresence(args.input.script),
      productServices,
      valueDrivers,
      painPoints,
      jobsToBeDone,
      proofStyle: brandDefaults.brief.proofStyle,
    },
    visualIdentity: {
      colors,
      fonts,
      logoAssets,
      productImages,
      hasLogo: logoAssets.length > 0,
      hasProductImages: productImages.length > 0,
      sourcePaths: visualSourcePaths,
    },
    claimLedger,
    coverage: {
      canUseBrandIdentity,
      canShowProductDemo: realProductEvidence,
      canUseProductUrl: Boolean(productUrl),
      canUseProofScenes: admissibleClaims.some((claim) => claim.claimType === "proof"),
      realProductEvidence,
      syntheticModeRequired: !realProductEvidence,
      coverageScore,
      missingInputs,
      counts: {
        claims: claimLedger.length,
        admissibleClaims: admissibleClaims.length,
        logos: logoAssets.length,
        productImages: productImages.length,
        colors: colors.length,
        fonts: fonts.length,
      },
    },
    degradations: buildDegradations({ missingInputs, productUrl, productImages }),
  };

  return pack;
}

export function formatSaasProductEvidencePromptBlock(pack: SaasProductEvidencePack): string {
  const claims = pack.claimLedger
    .filter((claim) => claim.admissible)
    .slice(0, 14)
    .map((claim) => `- ${claim.claimType} (${claim.source}): ${claim.text}`);
  const logos = pack.visualIdentity.logoAssets.slice(0, 4).map(formatAssetForPrompt);
  const productImages = pack.visualIdentity.productImages.slice(0, 6).map(formatAssetForPrompt);
  const productDemoRule = pack.coverage.realProductEvidence
    ? "Real product UI evidence is available; product-demo scenes may show/crop these verified assets."
    : "No verified product UI screenshots are available; do not pretend abstract/generated UI is the real product.";

  return [
    "<saas_product_evidence_pack>",
    `Schema: ${pack.schemaVersion}`,
    `Doctrine graph version: ${pack.doctrineVersion}`,
    `Product: ${pack.product.name || "unknown"} (${pack.product.nameSource})`,
    `Product URL: ${pack.product.productUrl || "not provided"}`,
    `Coverage score: ${pack.coverage.coverageScore}`,
    `Brand identity usable: ${pack.coverage.canUseBrandIdentity ? "yes" : "no"}`,
    `Real product UI evidence: ${pack.coverage.realProductEvidence ? "yes" : "no"}`,
    `Synthetic mode required: ${pack.coverage.syntheticModeRequired ? "yes" : "no"}`,
    `Colors: ${pack.visualIdentity.colors.join(", ") || "none"}`,
    `Fonts: ${pack.visualIdentity.fonts.join(", ") || "none"}`,
    `Logo assets: ${logos.join(" | ") || "none"}`,
    `Product UI/image assets: ${productImages.join(" | ") || "none"}`,
    `Product services: ${pack.brief.productServices.join(" | ") || "none"}`,
    `Audience: ${pack.brief.audience.join(" | ") || "none"}`,
    `Missing evidence: ${pack.coverage.missingInputs.join(", ") || "none"}`,
    "Admissible claim ledger:",
    claims.length > 0 ? claims.join("\n") : "- none",
    "Rules:",
    "- Use only admissible claim-ledger facts for visible copy and narration claims.",
    `- ${productDemoRule}`,
    "- If proof claims are weak or missing, use qualitative workflow proof instead of invented metrics.",
    "</saas_product_evidence_pack>",
  ].join("\n");
}

function buildClaimLedger(input: {
  input: NormalizedSaasExplainerIntake;
  originalInput: NormalizedSaasExplainerIntake;
  productUrl?: string;
  productServices: string[];
  valueDrivers: string[];
  painPoints: string[];
  jobsToBeDone: string[];
  audience: string[];
  proofStyle?: string;
}): SaasProductEvidenceClaim[] {
  const claims: SaasProductEvidenceClaim[] = [];
  addClaim(claims, "product_url", "product_url", input.productUrl, "product_url");
  addClaim(claims, "outcome", "outcome", input.input.outcome, input.originalInput.outcome ? "user_input" : "brand_vault");
  addClaim(claims, "script", "script", input.input.script, "script");
  input.productServices.forEach((text, index) => {
    addClaim(claims, `capability_${index + 1}`, "capability", text, "brand_vault", "brandContext.defaults.brief.productServices");
  });
  input.valueDrivers.forEach((text, index) => {
    addClaim(claims, `value_driver_${index + 1}`, "proof", text, "brand_vault", "brandContext.defaults.brief.valueDrivers");
  });
  input.painPoints.forEach((text, index) => {
    addClaim(claims, `pain_${index + 1}`, "pain", text, "brand_vault", "brandContext.defaults.brief.painPoints");
  });
  input.jobsToBeDone.forEach((text, index) => {
    addClaim(claims, `job_${index + 1}`, "job", text, "brand_vault", "brandContext.defaults.brief.jobsToBeDone");
  });
  input.audience.forEach((text, index) => {
    addClaim(claims, `audience_${index + 1}`, "audience", text, index === 0 && input.originalInput.audience ? "user_input" : "brand_vault");
  });
  addClaim(claims, "proof_style", "positioning", input.proofStyle, "brand_vault", "brandContext.defaults.brief.proofStyle");
  return claims;
}

function addClaim(
  claims: SaasProductEvidenceClaim[],
  id: string,
  claimType: SaasProductEvidenceClaimType,
  text: string | undefined,
  source: SaasProductEvidenceSource,
  signalPath?: string,
): void {
  const normalized = text?.trim();
  if (!normalized) return;
  claims.push({
    id,
    claimType,
    text: normalized,
    source,
    admissible: source !== "not_available",
    signalPath,
  });
}

function collectMissingInputs(input: {
  productName?: string;
  productUrl?: string;
  brandContext: SaasExplainerBrandContext;
  logoAssets: SaasProductEvidenceAsset[];
  productImages: SaasProductEvidenceAsset[];
  productServices: string[];
  audience: string[];
  valueDrivers: string[];
  input: NormalizedSaasExplainerIntake;
}): SaasProductEvidenceGap[] {
  const missing: SaasProductEvidenceGap[] = [];
  if (!input.productName) missing.push("product_name");
  if (!input.productUrl) missing.push("product_url");
  if (!input.brandContext.metadata.acceptedProfile) missing.push("brand_vault");
  if (input.logoAssets.length === 0) missing.push("logo");
  if (input.productImages.length === 0) missing.push("product_screenshots");
  if (input.productServices.length === 0) missing.push("product_capabilities");
  if (input.audience.length === 0) missing.push("audience");
  if (input.valueDrivers.length === 0) missing.push("proof_claims");
  if (!input.input.script && !input.input.outcome) missing.push("script_or_outcome");
  return missing;
}

function buildDegradations(input: {
  missingInputs: SaasProductEvidenceGap[];
  productUrl?: string;
  productImages: SaasProductEvidenceAsset[];
}): SaasProductEvidenceDegradation[] {
  const degradations: SaasProductEvidenceDegradation[] = input.missingInputs.map((gap) => ({
    code: gap,
    severity: gap === "script_or_outcome" || gap === "product_name" ? "blocker" : "warning",
    message: degradationMessageFor(gap),
  }));
  if (input.productUrl && input.productImages.length === 0) {
    degradations.push({
      code: "product_url_without_visual_capture",
      severity: "info",
      message: "A product URL is present, but there are no verified product UI screenshots yet.",
    });
  }
  return degradations;
}

function degradationMessageFor(gap: SaasProductEvidenceGap): string {
  switch (gap) {
    case "product_name":
      return "No product name is available from user input or Brand Vault.";
    case "product_url":
      return "No public product URL is available for website/product capture.";
    case "brand_vault":
      return "No accepted Brand Vault profile is available.";
    case "logo":
      return "No approved logo asset is available.";
    case "product_screenshots":
      return "No verified product screenshots or product images are available.";
    case "product_capabilities":
      return "No grounded product capability list is available.";
    case "audience":
      return "No grounded audience description is available.";
    case "proof_claims":
      return "No grounded value driver or proof claim is available.";
    case "script_or_outcome":
      return "No script or outcome is available to direct the explainer.";
  }
}

function resolveProductNameSource(
  originalInput: NormalizedSaasExplainerIntake,
  brandProductName?: string,
): SaasProductEvidenceSource {
  if (originalInput.productName) return "user_input";
  if (brandProductName) return "brand_vault";
  return "not_available";
}

function normalizeAssets(assets: SaasExplainerBrandVisualAssetDefault[]): SaasProductEvidenceAsset[] {
  return assets
    .map((asset) => ({
      kind: asset.kind,
      label: asset.label,
      url: asset.url,
      stored: asset.stored,
      signalPath: asset.signalPath,
      sourceType: asset.sourceType,
    }))
    .filter((asset) => asset.url.trim().length > 0);
}

function collectUnique(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const collected: string[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    collected.push(normalized);
  }
  return collected;
}

function formatAssetForPrompt(asset: SaasProductEvidenceAsset): string {
  return `${asset.label || asset.kind} <${asset.url}>${asset.signalPath ? ` via ${asset.signalPath}` : ""}`;
}
