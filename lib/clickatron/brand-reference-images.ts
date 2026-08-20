/**
 * Intent-gated brand reference images for Clickatron image generation (#4 - wire the asset island).
 *
 * The Brand Vault scan populates accepted product and logo evidence. This module feeds the brand's
 * OWN visual evidence into image generation as references, and refuses logo-bearing generations when
 * no accepted logo evidence exists. Text-only prompts are not allowed to become invented brand marks.
 */

import { resolveEffectiveBrandWithProfile, type EffectiveBrandResolution } from '@/lib/shared/brand-effective-resolver';
import { isBrandSignalActionable, type BrandSignal, type BrandSignalProfile } from '@/lib/shared/brand-signal-profile';
import type { BrandVaultVisualAssetPreview, BrandVaultVisualIdentitySummary } from '@/lib/shared/brand-vault-visual-identity';

/** The one visual mode that unambiguously wants the brand's product imagery. */
const VISUAL_MODE_PRODUCT_MOCKUP = 'product_mockup';
/** Cap so reference images steer, not swamp, the model. */
const MAX_BRAND_REFERENCE_IMAGES = 3;
const MIN_ACTIONABLE_ASSET_CONFIDENCE = 0.55;

export const CLICKATRON_MISSING_LOGO_EVIDENCE_REASON =
  'needs_user_input: Add or accept a real Brand Vault logo asset before generating Clickatron creative that requires a logo.';

export type ClickatronBrandImageIntent = 'product' | 'logo' | 'logo_and_product' | 'none';
export type ClickatronBrandReferenceAssetRole = 'product' | 'logo';
export type ClickatronBrandReferenceSource =
  | 'brand-vault-product-image'
  | 'brand-vault-logo'
  | 'brand-vault-logo-candidate';

export interface ClickatronBrandReferenceEvidence {
  url: string;
  assetRole: ClickatronBrandReferenceAssetRole;
  source: ClickatronBrandReferenceSource;
  confidence?: number;
  status?: 'available' | 'unknown';
  /** Present only for an accepted visual-identity asset persisted by Brand Vault. */
  isStoredAsset?: boolean;
  assetId?: string;
  storageKey?: string;
  storageProvider?: string;
  storageContentType?: string;
}

/**
 * The only logo evidence eligible for a locked post-render overlay. Candidate
 * URLs may guide a model in an edit flow, but they are never authoritative
 * enough to be stamped onto a delivered creative asset.
 */
export interface ClickatronAcceptedLogoOverlayEvidence extends ClickatronBrandReferenceEvidence {
  assetRole: 'logo';
  source: 'brand-vault-logo';
  isStoredAsset: true;
  assetId: string;
  storageKey: string;
  storageProvider: 'cloudflare_r2';
}

export interface ClickatronBrandReferenceIntent {
  requiresProduct: boolean;
  requiresLogo: boolean;
}

export interface ClickatronBrandReferenceResolution {
  intent: ClickatronBrandReferenceIntent;
  evidence: ClickatronBrandReferenceEvidence[];
  needsUserInput: boolean;
  needsUserInputReason?: string;
}

export interface ClickatronGenerationBrandEvidenceInput {
  hasParentImage: boolean;
  userReferenceImageCount: number;
  /** A locked post-render logo overlay replaces model logo references. */
  excludeLogoReferences?: boolean;
}

type Maybe = Record<string, unknown> | null | undefined;
type BrandSignalProfileAssets = NonNullable<BrandSignalProfile['assets']>;
type BrandSignalProfileWithLogoCandidates = BrandSignalProfile & {
  assets?: BrandSignalProfileAssets & {
    logoCandidates?: BrandSignal<string[]>;
  };
};
type AcceptedBrandEvidence = Pick<EffectiveBrandResolution, 'acceptedProfile' | 'acceptedReviewPayload'>;

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function httpUrl(value: unknown): string | undefined {
  const url = cleanString(value);
  return url && /^https?:\/\/\S+/i.test(url) ? url : undefined;
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function textHasLogoIntent(value: unknown): boolean {
  const text = cleanString(value);
  if (!text) return false;

  const normalized = normalizeForMatch(text);
  const hasLogoCue = /\b(?:logos?|logomarks?|wordmarks?|brandmarks?|brand marks?)\b/.test(normalized);
  if (!hasLogoCue) return false;

  const negativeLogoCue = /\b(?:no|without|avoid|never|dont|don t|do not|must not|should not)\b(?: [a-z0-9]+){0,8} \b(?:logos?|logomarks?|wordmarks?|brandmarks?|brand marks?)\b/.test(normalized);
  return !negativeLogoCue;
}

function metadataIntentParts(metadata: Maybe): ClickatronBrandReferenceIntent {
  const root = record(metadata);
  if (!root) return { requiresProduct: false, requiresLogo: false };

  const spec =
    record(record(root.clickatron)?.creativeSpec) ??
    record(root.creativeSpec) ??
    root;
  const userIntent = record(spec.userIntent) ?? spec;
  const renderPlan = record(spec.renderPlan);
  const slideIntentValues = Array.isArray(renderPlan?.slides)
    ? renderPlan.slides.flatMap((slide) => {
        const slideRecord = record(slide);
        return slideRecord ? [slideRecord.title, slideRecord.imagePrompt] : [];
      })
    : [];

  const visualMode = cleanString(userIntent.visualMode);
  const requiresProduct = visualMode === VISUAL_MODE_PRODUCT_MOCKUP;
  const requiresLogo = [
    visualMode,
    userIntent.assetRole,
    userIntent.assetKind,
    userIntent.subject,
    userIntent.placement,
    userIntent.composition,
    spec.assetRole,
    spec.assetKind,
    spec.subject,
    root.assetRole,
    root.assetKind,
    root.subject,
    ...slideIntentValues,
  ].some(textHasLogoIntent) || [
    userIntent.requiresLogo,
    userIntent.logoRequired,
    userIntent.useBrandLogo,
    spec.requiresLogo,
    spec.logoRequired,
    root.requiresLogo,
    root.logoRequired,
  ].some((value) => value === true);

  return { requiresProduct, requiresLogo };
}

function referenceIntentFromInputs(metadata: Maybe, prompt?: string | null): ClickatronBrandReferenceIntent {
  const metadataIntent = metadataIntentParts(metadata);
  return {
    requiresProduct: metadataIntent.requiresProduct,
    requiresLogo: metadataIntent.requiresLogo || textHasLogoIntent(prompt),
  };
}

/**
 * Read the STRUCTURED creative intent from generation metadata. Returns 'product' only for an explicit
 * product-mockup spec, and returns logo intents only for explicit logo cues/flags. Product intent never
 * comes from free text; logo intent may come from the worker prompt via resolveClickatronBrandReferenceEvidence.
 */
export function clickatronBrandImageIntentFromMetadata(metadata: Maybe): ClickatronBrandImageIntent {
  const intent = metadataIntentParts(metadata);
  if (intent.requiresProduct && intent.requiresLogo) return 'logo_and_product';
  if (intent.requiresProduct) return 'product';
  if (intent.requiresLogo) return 'logo';
  return 'none';
}

function actionableSignalEvidence(
  signal: BrandSignal<string[]> | undefined,
  max: number,
  assetRole: ClickatronBrandReferenceAssetRole,
  source: ClickatronBrandReferenceSource,
): ClickatronBrandReferenceEvidence[] {
  if (!signal || !isBrandSignalActionable(signal)) return [];
  const urls = Array.isArray(signal.value) ? signal.value : [];
  return urls
    .flatMap((url) => {
      const normalized = httpUrl(url);
      return normalized
        ? [{ url: normalized, assetRole, source, confidence: signal.confidence, status: 'unknown' as const }]
        : [];
    })
    .slice(0, Math.max(0, max));
}

function visualAssetUrl(asset: BrandVaultVisualAssetPreview): string | undefined {
  const storedUrl = asset.storage?.status === 'stored' ? asset.storage.publicUrl : undefined;
  return httpUrl(storedUrl) ?? httpUrl(asset.url);
}

function visualIdentityLogoEvidence(
  visualIdentity: BrandVaultVisualIdentitySummary | null | undefined,
  max: number,
): ClickatronBrandReferenceEvidence[] {
  return (visualIdentity?.logos ?? [])
    .flatMap((logo) => {
      if (logo.availability?.status === 'unavailable') return [];
      if (typeof logo.confidence === 'number' && logo.confidence <= MIN_ACTIONABLE_ASSET_CONFIDENCE) return [];
      const url = visualAssetUrl(logo);
      if (!url) return [];
      const storageKey = cleanString(logo.storage?.storageKey);
      const storageProvider = cleanString(logo.storage?.provider);
      const assetId = cleanString(logo.id);
      const isStoredAsset = Boolean(
        logo.storage?.status === 'stored'
        && httpUrl(logo.storage.publicUrl)
        && storageKey
        && storageProvider === 'cloudflare_r2'
        && assetId,
      );
      return [{
        url,
        assetRole: 'logo' as const,
        source: 'brand-vault-logo' as const,
        confidence: logo.confidence,
        status: logo.availability?.status === 'available' ? 'available' as const : 'unknown' as const,
        ...(isStoredAsset ? {
          isStoredAsset: true as const,
          assetId,
          storageKey,
          storageProvider: 'cloudflare_r2' as const,
          storageContentType: cleanString(logo.storage?.contentType),
        } : {}),
      }];
    })
    .slice(0, Math.max(0, max));
}

function dedupeEvidence(
  evidence: ClickatronBrandReferenceEvidence[],
  max = MAX_BRAND_REFERENCE_IMAGES,
): ClickatronBrandReferenceEvidence[] {
  const seen = new Set<string>();
  return evidence
    .filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    })
    .slice(0, Math.max(0, max));
}

export function brandProductReferenceEvidence(
  profile: BrandSignalProfile | null | undefined,
  max = MAX_BRAND_REFERENCE_IMAGES,
): ClickatronBrandReferenceEvidence[] {
  return actionableSignalEvidence(profile?.assets?.productImages, max, 'product', 'brand-vault-product-image');
}

export function brandLogoReferenceEvidence(
  profile: BrandSignalProfile | null | undefined,
  visualIdentity: BrandVaultVisualIdentitySummary | null | undefined,
  max = MAX_BRAND_REFERENCE_IMAGES,
): ClickatronBrandReferenceEvidence[] {
  const logoSignal = (profile as BrandSignalProfileWithLogoCandidates | null | undefined)?.assets?.logoCandidates;
  return dedupeEvidence([
    ...visualIdentityLogoEvidence(visualIdentity, max),
    ...actionableSignalEvidence(logoSignal, max, 'logo', 'brand-vault-logo-candidate'),
  ], max);
}

/** Select exactly one stored, accepted Brand Vault logo for locked composition. */
export function selectClickatronAcceptedLogoOverlayEvidence(
  resolution: ClickatronBrandReferenceResolution,
): ClickatronAcceptedLogoOverlayEvidence | undefined {
  return resolution.evidence.find((item): item is ClickatronAcceptedLogoOverlayEvidence => (
    item.assetRole === 'logo'
    && item.source === 'brand-vault-logo'
    && item.isStoredAsset === true
    && typeof item.assetId === 'string'
    && item.assetId.length > 0
    && typeof item.storageKey === 'string'
    && item.storageKey.length > 0
    && item.storageProvider === 'cloudflare_r2'
  ));
}

/**
 * Actionable product-image URLs from an accepted profile, http(s)-validated and capped. Pure.
 * Returns [] when the signal is missing or below the actionable confidence floor (0.55).
 */
export function brandProductReferenceImages(
  profile: BrandSignalProfile | null | undefined,
  max = MAX_BRAND_REFERENCE_IMAGES,
): string[] {
  return brandProductReferenceEvidence(profile, max).map((item) => item.url);
}

export interface ResolveClickatronBrandReferenceImagesInput {
  userId: string;
  brandId: string | undefined;
  metadata: Maybe;
  prompt?: string | null;
  orgId?: string | null;
  max?: number;
  /** A persisted user-reviewed overlay requires a stored accepted logo even without free-text logo cues. */
  requiresAcceptedLogoOverlay?: boolean;
  /** Test seam: override the accepted-profile read (defaults to the shared effective-brand resolver). */
  resolveProfile?: (
    userId: string,
    brandId: string,
    orgId?: string | null,
  ) => Promise<BrandSignalProfile | null>;
  /** Test seam for accepted review payloads, including visualIdentity.logo previews. */
  resolveBrandEvidence?: (
    userId: string,
    brandId: string,
    orgId?: string | null,
  ) => Promise<AcceptedBrandEvidence>;
}

function missingLogoResolution(intent: ClickatronBrandReferenceIntent): ClickatronBrandReferenceResolution {
  return {
    intent,
    evidence: [],
    needsUserInput: true,
    needsUserInputReason: CLICKATRON_MISSING_LOGO_EVIDENCE_REASON,
  };
}

async function readAcceptedBrandEvidence(
  input: ResolveClickatronBrandReferenceImagesInput,
  brandId: string,
): Promise<AcceptedBrandEvidence> {
  if (input.resolveBrandEvidence) return input.resolveBrandEvidence(input.userId, brandId, input.orgId);
  if (input.resolveProfile) {
    return {
      acceptedProfile: await input.resolveProfile(input.userId, brandId, input.orgId),
      acceptedReviewPayload: null,
    };
  }
  return resolveEffectiveBrandWithProfile(input.userId, brandId, {
    service: 'clickatron',
    strict: true,
    ...(input.orgId !== undefined ? { orgId: input.orgId } : {}),
  });
}

export async function resolveClickatronBrandReferenceEvidence(
  input: ResolveClickatronBrandReferenceImagesInput,
): Promise<ClickatronBrandReferenceResolution> {
  const rawIntent = referenceIntentFromInputs(input.metadata, input.prompt);
  const intent: ClickatronBrandReferenceIntent = {
    ...rawIntent,
    requiresLogo: rawIntent.requiresLogo || input.requiresAcceptedLogoOverlay === true,
  };
  if (!intent.requiresProduct && !intent.requiresLogo) {
    return { intent, evidence: [], needsUserInput: false };
  }

  const brandId = input.brandId?.trim();
  if (!brandId) {
    return intent.requiresLogo ? missingLogoResolution(intent) : { intent, evidence: [], needsUserInput: false };
  }

  try {
    const { acceptedProfile, acceptedReviewPayload } = await readAcceptedBrandEvidence(input, brandId);
    const max = input.max ?? MAX_BRAND_REFERENCE_IMAGES;
    const logoEvidence = intent.requiresLogo
      ? brandLogoReferenceEvidence(acceptedProfile, acceptedReviewPayload?.visualIdentity, max)
      : [];

    if (intent.requiresLogo && logoEvidence.length === 0) {
      return missingLogoResolution(intent);
    }

    const productEvidence = intent.requiresProduct
      ? brandProductReferenceEvidence(acceptedProfile, max)
      : [];

    return {
      intent,
      evidence: dedupeEvidence([...logoEvidence, ...productEvidence], max),
      needsUserInput: false,
    };
  } catch (err) {
    console.error('[Clickatron] brand reference evidence resolution failed', err);
    return intent.requiresLogo ? missingLogoResolution(intent) : { intent, evidence: [], needsUserInput: false };
  }
}

/**
 * Select the accepted Brand Vault evidence that will actually be sent to the
 * image provider. Keep this policy shared by request preflight and the worker so
 * model selection, billing, and execution always count the same references.
 */
export function selectClickatronGenerationBrandEvidence(
  resolution: ClickatronBrandReferenceResolution,
  input: ClickatronGenerationBrandEvidenceInput,
): ClickatronBrandReferenceEvidence[] {
  const canUseLogoAsGenerationReference =
    input.hasParentImage || input.userReferenceImageCount > 0;
  const shouldSeedProductImages =
    !input.hasParentImage && input.userReferenceImageCount === 0;

  return resolution.evidence.filter(
    (item) =>
      (item.assetRole === 'logo' && !input.excludeLogoReferences && canUseLogoAsGenerationReference) ||
      (item.assetRole === 'product' && shouldSeedProductImages),
  );
}

/**
 * Back-compat wrapper for existing callers that only need image_urls. New generation code should use
 * resolveClickatronBrandReferenceEvidence so missing required logo evidence can block explicitly.
 */
export async function resolveClickatronBrandReferenceImages(
  input: ResolveClickatronBrandReferenceImagesInput,
): Promise<string[]> {
  const resolution = await resolveClickatronBrandReferenceEvidence(input);
  return resolution.evidence.map((item) => item.url);
}
