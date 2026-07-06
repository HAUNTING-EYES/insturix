import {
  resolveEffectiveBrandWithProfile,
  type EffectiveBrandResolution,
  type ResolveEffectiveBrandOptions,
} from '@/lib/shared/brand-effective-resolver';
import {
  isBrandSignalActionable,
  type BrandSignal,
  type BrandSignalProfile,
} from '@/lib/shared/brand-signal-profile';
import { brandSignalProfileToCreativeSignalDefaults } from '@/lib/shared/brand-to-creative-signals';
import type { BrandCreativeSignalDefaults } from '@/lib/shared/brand-to-creative-signals';
import type {
  BrandVaultVisualAssetPreview,
  BrandVaultVisualIdentitySummary,
} from '@/lib/shared/brand-vault-visual-identity';
import {
  brandInputsFromBrandSignalProfile,
  brandVaultToMotionOverrides,
} from '@/lib/editron/motion-graphics/engine/brand-vault-to-motion';
import {
  BRAND_EVIDENCE_REQUIRED_REASON,
  cleanOptionalString,
  isBrandLogoReferenceSubject,
  requiresBrandReferenceEvidence,
  type BrandReferenceSubjectInput,
} from './reference-brand-evidence';

export type BrandProductionEvidenceSchemaVersion = 'brand-production-evidence-pack/v1';

export type BrandProductionEvidenceProvenance =
  | 'brand-vault'
  | 'website-screenshot'
  | 'uploaded'
  | 'connected-social';

export type BrandProductionEvidenceAssetRole =
  | 'logo'
  | 'product'
  | 'website-screenshot'
  | 'social-preview'
  | 'uploaded-reference';

export type BrandProductionEvidenceMissingInput =
  | 'accepted_profile'
  | 'brand_name'
  | 'brand_identity'
  | 'logo'
  | 'product_evidence';

export interface BrandProductionEvidenceAsset {
  id: string;
  role: BrandProductionEvidenceAssetRole;
  label: string;
  url: string;
  provenance: BrandProductionEvidenceProvenance;
  originalUrl?: string;
  thumbnailUrl?: string;
  sampledFrameUrls?: string[];
  mediaType?: string;
  sourceType?: string;
  sourceUrl?: string;
  signalPath?: string;
  evidenceIds: string[];
  confidence?: number;
  availability?: BrandVaultVisualAssetPreview['availability'];
  storage?: BrandVaultVisualAssetPreview['storage'];
}

export interface BrandProductionEvidenceDegradation {
  code: BrandProductionEvidenceMissingInput;
  severity: 'warning' | 'blocker';
  message: string;
}

export interface BrandProductionEvidencePack {
  schemaVersion: BrandProductionEvidenceSchemaVersion;
  generatedAt: string;
  brand: {
    brandId?: string;
    brandName?: string;
    source: EffectiveBrandResolution['source'];
    acceptedProfileId?: string;
    profileGeneratedAt?: string;
    subjectHints: string[];
  };
  visualIdentity: {
    colors: string[];
    fonts: string[];
    sourcePaths: string[];
  };
  assets: {
    logos: BrandProductionEvidenceAsset[];
    productEvidence: BrandProductionEvidenceAsset[];
    allVisualEvidence: BrandProductionEvidenceAsset[];
  };
  motionInputs: ReturnType<typeof brandInputsFromBrandSignalProfile>;
  motionTokenOverrides?: ReturnType<typeof brandVaultToMotionOverrides>;
  creativeSignalDefaults: BrandCreativeSignalDefaults | null;
  coverage: {
    acceptedProfile: boolean;
    canUseBrandIdentity: boolean;
    canShowLogo: boolean;
    canShowOwnedProduct: boolean;
    syntheticModeRequired: boolean;
    coverageScore: number;
    missingInputs: BrandProductionEvidenceMissingInput[];
    counts: {
      logos: number;
      productEvidence: number;
      colors: number;
      fonts: number;
      creativeSignals: number;
      motionInputs: number;
    };
  };
  degradations: BrandProductionEvidenceDegradation[];
  generationRules: string[];
}

export interface BrandSubjectEvidenceEvaluation {
  required: boolean;
  status: 'resolved' | 'missing' | 'not-required';
  role: 'logo' | 'product' | 'none';
  evidence: BrandProductionEvidenceAsset[];
  reason?: string;
}

export interface BuildBrandProductionEvidencePackInput {
  brandId?: string;
  resolution: EffectiveBrandResolution;
  visualIdentity?: BrandVaultVisualIdentitySummary | null;
  generatedAt?: string;
}

export type ResolveBrandProductionEvidencePackOptions =
  Omit<ResolveEffectiveBrandOptions, 'service' | 'strict'> & {
    service?: ResolveEffectiveBrandOptions['service'];
  };

type BrandSignalProfileWithLogoCandidates = BrandSignalProfile & {
  assets?: BrandSignalProfile['assets'] & {
    logoCandidates?: BrandSignal<string[]>;
  };
};

export async function resolveBrandProductionEvidencePack(
  userId: string,
  brandId: string,
  options: ResolveBrandProductionEvidencePackOptions = {},
): Promise<BrandProductionEvidencePack> {
  const { service = 'editron', ...resolverOptions } = options;
  const resolution = await resolveEffectiveBrandWithProfile(userId, brandId, {
    ...resolverOptions,
    service,
    strict: true,
  });
  return buildBrandProductionEvidencePack({ brandId, resolution });
}

export function buildBrandProductionEvidencePack(
  input: BuildBrandProductionEvidencePackInput,
): BrandProductionEvidencePack {
  const profile = input.resolution.acceptedProfile;
  const brandId = cleanOptionalString(input.brandId ?? profile?.brandId ?? input.resolution.brand?.brandId);
  const brandName = cleanOptionalString(input.resolution.brand?.name ?? profile?.identity.brandName.value);
  const visualIdentity = input.visualIdentity ?? input.resolution.acceptedReviewPayload?.visualIdentity ?? null;
  const logos = collectLogoAssets(profile, visualIdentity);
  const productEvidence = collectProductEvidenceAssets(profile, visualIdentity);
  const allVisualEvidence = dedupeAssets([
    ...logos,
    ...productEvidence,
    ...collectVisualIdentityImageAssets(visualIdentity),
  ]);
  const colors = collectColors(profile, visualIdentity);
  const fonts = collectFonts(visualIdentity);
  const motionInputs = brandInputsFromBrandSignalProfile(profile, input.resolution.brand);
  const motionTokenOverrides = brandVaultToMotionOverrides(profile);
  const creativeSignalDefaults = profile ? brandSignalProfileToCreativeSignalDefaults(profile) : null;
  const counts = {
    logos: logos.length,
    productEvidence: productEvidence.length,
    colors: colors.length,
    fonts: fonts.length,
    creativeSignals: Object.keys(creativeSignalDefaults?.signals ?? {}).length,
    motionInputs: Object.keys(motionInputs).length,
  };
  const canUseBrandIdentity = Boolean(profile && (counts.logos > 0 || counts.colors > 0 || counts.fonts > 0));
  const canShowOwnedProduct = counts.productEvidence > 0;
  const missingInputs = collectMissingInputs({
    acceptedProfile: Boolean(profile),
    brandName,
    canUseBrandIdentity,
    canShowLogo: counts.logos > 0,
    canShowOwnedProduct,
  });

  return {
    schemaVersion: 'brand-production-evidence-pack/v1',
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    brand: {
      brandId,
      brandName,
      source: input.resolution.source,
      acceptedProfileId: input.resolution.acceptedRecord?.id,
      profileGeneratedAt: profile?.generatedAt,
      subjectHints: subjectHints(profile, brandName),
    },
    visualIdentity: {
      colors,
      fonts,
      sourcePaths: collectSourcePaths(allVisualEvidence, colors, fonts),
    },
    assets: {
      logos,
      productEvidence,
      allVisualEvidence,
    },
    motionInputs,
    motionTokenOverrides,
    creativeSignalDefaults,
    coverage: {
      acceptedProfile: Boolean(profile),
      canUseBrandIdentity,
      canShowLogo: counts.logos > 0,
      canShowOwnedProduct,
      syntheticModeRequired: !canShowOwnedProduct,
      coverageScore: coverageScore([
        Boolean(profile),
        Boolean(brandName),
        canUseBrandIdentity,
        counts.logos > 0,
        canShowOwnedProduct,
        counts.creativeSignals > 0,
        counts.motionInputs > 0,
      ]),
      missingInputs,
      counts,
    },
    degradations: missingInputs.map(degradationFor),
    generationRules: buildGenerationRules({ hasLogo: counts.logos > 0, hasProductEvidence: canShowOwnedProduct }),
  };
}

export function evaluateBrandSubjectEvidence(
  subject: BrandReferenceSubjectInput,
  pack: BrandProductionEvidencePack,
): BrandSubjectEvidenceEvaluation {
  const required = requiresBrandReferenceEvidence(subject, {
    brandId: pack.brand.brandId,
    subjectHints: pack.brand.subjectHints,
  });
  if (!required) {
    return { required: false, status: 'not-required', role: 'none', evidence: [] };
  }

  const logoSubject = isBrandLogoReferenceSubject(subject);
  const evidence = logoSubject ? pack.assets.logos : pack.assets.productEvidence;
  return {
    required: true,
    status: evidence.length > 0 ? 'resolved' : 'missing',
    role: logoSubject ? 'logo' : 'product',
    evidence,
    reason: evidence.length > 0 ? undefined : BRAND_EVIDENCE_REQUIRED_REASON,
  };
}

export function formatBrandProductionEvidencePromptBlock(pack: BrandProductionEvidencePack): string {
  const logos = pack.assets.logos.slice(0, 4).map(formatAssetForPrompt);
  const productEvidence = pack.assets.productEvidence.slice(0, 8).map(formatAssetForPrompt);

  return [
    '<brand_production_evidence_pack>',
    `Schema: ${pack.schemaVersion}`,
    `Brand: ${pack.brand.brandName || 'unknown'} (${pack.brand.brandId || 'no-brand-id'})`,
    `Brand Vault source: ${pack.brand.source}`,
    `Coverage score: ${pack.coverage.coverageScore}`,
    `Brand identity usable: ${pack.coverage.canUseBrandIdentity ? 'yes' : 'no'}`,
    `Logo evidence: ${pack.coverage.canShowLogo ? 'yes' : 'no'}`,
    `Owned product evidence: ${pack.coverage.canShowOwnedProduct ? 'yes' : 'no'}`,
    `Synthetic mode required: ${pack.coverage.syntheticModeRequired ? 'yes' : 'no'}`,
    `Colors: ${pack.visualIdentity.colors.join(', ') || 'none'}`,
    `Fonts: ${pack.visualIdentity.fonts.join(', ') || 'none'}`,
    `Logo assets: ${logos.join(' | ') || 'none'}`,
    `Product/platform evidence: ${productEvidence.join(' | ') || 'none'}`,
    `Missing evidence: ${pack.coverage.missingInputs.join(', ') || 'none'}`,
    'Rules:',
    ...pack.generationRules.map((rule) => `- ${rule}`),
    '</brand_production_evidence_pack>',
  ].join('\n');
}

function collectLogoAssets(
  profile: BrandSignalProfile | null | undefined,
  visualIdentity: BrandVaultVisualIdentitySummary | null | undefined,
): BrandProductionEvidenceAsset[] {
  const logoSignal = (profile as BrandSignalProfileWithLogoCandidates | null | undefined)?.assets?.logoCandidates;
  return dedupeAssets([
    ...assetsFromSignal(logoSignal, 'logo', 'Brand Vault logo', 'brand-vault', 'assets.logoCandidates'),
    ...(visualIdentity?.logos ?? []).flatMap((asset) => assetFromVisualIdentity(asset, 'logo')),
  ]);
}

function collectProductEvidenceAssets(
  profile: BrandSignalProfile | null | undefined,
  visualIdentity: BrandVaultVisualIdentitySummary | null | undefined,
): BrandProductionEvidenceAsset[] {
  return dedupeAssets([
    ...assetsFromSignal(profile?.assets?.productImages, 'product', 'Brand Vault product image', 'brand-vault', 'assets.productImages'),
    ...assetsFromSignal(profile?.assets?.socialPreviewImages, 'website-screenshot', 'Website screenshot', 'website-screenshot', 'assets.socialPreviewImages'),
    ...collectVisualIdentityImageAssets(visualIdentity).filter(isOwnedProductEvidenceAsset),
  ]);
}

function collectVisualIdentityImageAssets(
  visualIdentity: BrandVaultVisualIdentitySummary | null | undefined,
): BrandProductionEvidenceAsset[] {
  return (visualIdentity?.images ?? []).flatMap((asset) => assetFromVisualIdentity(asset, roleForVisualIdentityImage(asset)));
}

function assetsFromSignal(
  signal: BrandSignal<string[]> | undefined,
  role: BrandProductionEvidenceAssetRole,
  labelPrefix: string,
  provenance: BrandProductionEvidenceProvenance,
  signalPath: string,
): BrandProductionEvidenceAsset[] {
  if (!signal || !isBrandSignalActionable(signal)) return [];
  return uniqueStrings(signal.value)
    .filter(isRenderableUrl)
    .map((url, index) => ({
      id: `${role}:${index + 1}:${stableUrlId(url)}`,
      role,
      label: `${labelPrefix} ${index + 1}`,
      url,
      provenance,
      signalPath,
      evidenceIds: signal.evidenceIds,
      confidence: signal.confidence,
    }));
}

function assetFromVisualIdentity(
  asset: BrandVaultVisualAssetPreview,
  role: BrandProductionEvidenceAssetRole,
): BrandProductionEvidenceAsset[] {
  const url = cleanOptionalString(asset.url);
  if (!url || !isRenderableUrl(url)) return [];
  if (asset.availability?.status === 'unavailable') return [];
  return [{
    id: asset.id || `${role}:${stableUrlId(url)}`,
    role,
    label: cleanOptionalString(asset.label) ?? labelForRole(role),
    url,
    provenance: provenanceForVisualAsset(asset),
    originalUrl: cleanOptionalString(asset.originalUrl),
    thumbnailUrl: cleanOptionalString(asset.thumbnailUrl),
    sampledFrameUrls: asset.sampledFrameUrls?.filter(isRenderableUrl),
    mediaType: cleanOptionalString(asset.mediaType),
    sourceType: cleanOptionalString(asset.sourceType),
    sourceUrl: cleanOptionalString(asset.sourceUrl),
    signalPath: cleanOptionalString(asset.signalPath),
    evidenceIds: [],
    confidence: asset.confidence,
    availability: asset.availability,
    storage: asset.storage,
  }];
}

function roleForVisualIdentityImage(asset: BrandVaultVisualAssetPreview): BrandProductionEvidenceAssetRole {
  if (
    asset.assetRole === 'team' ||
    asset.assetRole === 'abstract_reference' ||
    asset.assetRole === 'creative_reference' ||
    asset.assetRole === 'prior_work' ||
    asset.assetRole === 'other'
  ) {
    return 'uploaded-reference';
  }
  if (asset.kind === 'website_preview' || asset.assetRole === 'website_screenshot' || asset.signalPath === 'assets.socialPreviewImages') {
    return 'website-screenshot';
  }
  if (asset.kind === 'product' || asset.assetRole === 'product_ui' || asset.signalPath === 'assets.productImages') return 'product';
  if (asset.kind === 'social_media' || asset.kind === 'video') {
    return 'social-preview';
  }
  const matchText = [asset.kind, asset.label, asset.sourceField, asset.sourceUrl, asset.url]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();
  if (/\b(?:website|site|homepage|landing page|web page)\b/.test(matchText)) return 'website-screenshot';
  if (/\b(?:product|platform|dashboard|app|application|software|interface|ui|editor|workspace|console|portal|screenshot)\b/.test(matchText)) return 'product';
  return 'uploaded-reference';
}

function isOwnedProductEvidenceAsset(asset: BrandProductionEvidenceAsset): boolean {
  return asset.role === 'product' || asset.role === 'website-screenshot';
}

function provenanceForVisualAsset(asset: BrandVaultVisualAssetPreview): BrandProductionEvidenceProvenance {
  if (asset.kind === 'uploaded_asset' || asset.sourceType === 'uploaded_asset') return 'uploaded';
  if (asset.kind === 'website_preview' || asset.signalPath === 'assets.socialPreviewImages') return 'website-screenshot';
  if (asset.kind === 'social_media' || asset.kind === 'video' || asset.evidenceOrigin === 'connected_fetch') {
    return 'connected-social';
  }
  return 'brand-vault';
}

function collectColors(
  profile: BrandSignalProfile | null | undefined,
  visualIdentity: BrandVaultVisualIdentitySummary | null | undefined,
): string[] {
  return uniqueStrings([
    ...(visualIdentity?.colors ?? []).map((color) => color.value),
    actionableString(profile?.palette.primary),
    actionableString(profile?.palette.accent),
    ...actionableStringList(profile?.palette.supporting),
    ...actionableStringList(profile?.palette.neutrals),
  ]);
}

function collectFonts(visualIdentity: BrandVaultVisualIdentitySummary | null | undefined): string[] {
  return uniqueStrings((visualIdentity?.fonts ?? []).map((font) => font.family));
}

function subjectHints(profile: BrandSignalProfile | null | undefined, fallbackBrandName?: string): string[] {
  return uniqueStrings([
    actionableString(profile?.identity.brandName),
    fallbackBrandName,
    ...(profile?.identity.productServices && isBrandSignalActionable(profile.identity.productServices)
      ? profile.identity.productServices.value
      : []),
  ]);
}

function collectMissingInputs(input: {
  acceptedProfile: boolean;
  brandName?: string;
  canUseBrandIdentity: boolean;
  canShowLogo: boolean;
  canShowOwnedProduct: boolean;
}): BrandProductionEvidenceMissingInput[] {
  const missing: BrandProductionEvidenceMissingInput[] = [];
  if (!input.acceptedProfile) missing.push('accepted_profile');
  if (!input.brandName) missing.push('brand_name');
  if (!input.canUseBrandIdentity) missing.push('brand_identity');
  if (!input.canShowLogo) missing.push('logo');
  if (!input.canShowOwnedProduct) missing.push('product_evidence');
  return missing;
}

function degradationFor(code: BrandProductionEvidenceMissingInput): BrandProductionEvidenceDegradation {
  const blocker = code === 'accepted_profile' || code === 'brand_name';
  return {
    code,
    severity: blocker ? 'blocker' : 'warning',
    message: degradationMessageFor(code),
  };
}

function degradationMessageFor(code: BrandProductionEvidenceMissingInput): string {
  switch (code) {
    case 'accepted_profile':
      return 'No accepted Brand Vault profile is available; generation must not fall back to an unverified brand.';
    case 'brand_name':
      return 'No brand name is available for brand-owned subject matching.';
    case 'brand_identity':
      return 'No usable brand identity evidence is available.';
    case 'logo':
      return 'No verified logo evidence is available.';
    case 'product_evidence':
      return 'No verified product, website, or uploaded reference evidence is available for owned product scenes.';
  }
}

function buildGenerationRules(input: { hasLogo: boolean; hasProductEvidence: boolean }): string[] {
  return [
    'Brand-owned product, platform, UI, website, and logo subjects require verified evidence before provider generation.',
    input.hasLogo
      ? 'Logo scenes must use verified logo evidence; do not generate or reinterpret brand marks.'
      : 'Logo scenes are blocked until verified logo evidence is attached.',
    input.hasProductEvidence
      ? 'Owned product scenes may use verified product, website, or uploaded evidence.'
      : 'Owned product scenes must use abstract/problem visuals or block; do not costume generated UI as the real product.',
  ];
}

function collectSourcePaths(
  assets: BrandProductionEvidenceAsset[],
  colors: string[],
  fonts: string[],
): string[] {
  return uniqueStrings([
    ...assets.map((asset) => asset.signalPath),
    ...(colors.length ? ['palette'] : []),
    ...(fonts.length ? ['typography'] : []),
  ]);
}

function coverageScore(checks: boolean[]): number {
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function actionableString(signal: BrandSignal<string> | undefined): string | undefined {
  return signal && isBrandSignalActionable(signal) ? cleanOptionalString(signal.value) : undefined;
}

function actionableStringList(signal: BrandSignal<string[]> | undefined): string[] {
  if (!signal || !isBrandSignalActionable(signal)) return [];
  return uniqueStrings(signal.value);
}


function dedupeAssets(assets: BrandProductionEvidenceAsset[]): BrandProductionEvidenceAsset[] {
  const seen = new Set<string>();
  const output: BrandProductionEvidenceAsset[] = [];
  for (const asset of assets) {
    const key = `${asset.role}:${asset.url.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(asset);
  }
  return output;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = cleanOptionalString(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

function isRenderableUrl(value: string | undefined): value is string {
  return typeof value === 'string' && /^https?:\/\/\S+/i.test(value.trim());
}

function stableUrlId(url: string): string {
  return url.toLowerCase().replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
}

function labelForRole(role: BrandProductionEvidenceAssetRole): string {
  switch (role) {
    case 'logo':
      return 'Logo evidence';
    case 'product':
      return 'Product evidence';
    case 'website-screenshot':
      return 'Website screenshot';
    case 'social-preview':
      return 'Social preview';
    case 'uploaded-reference':
      return 'Uploaded reference';
  }
}

function formatAssetForPrompt(asset: BrandProductionEvidenceAsset): string {
  const source = [asset.provenance, asset.signalPath].filter(Boolean).join(' via ');
  return `${asset.label} <${asset.url}>${source ? ` (${source})` : ''}`;
}
