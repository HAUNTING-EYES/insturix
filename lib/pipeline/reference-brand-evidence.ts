import { resolveEffectiveBrandWithProfile } from '@/lib/shared/brand-effective-resolver';
import {
  isBrandSignalActionable,
  type BrandSignal,
  type BrandSignalProfile,
} from '@/lib/shared/brand-signal-profile';
import type {
  BrandVaultVisualAssetPreview,
  BrandVaultVisualIdentitySummary,
} from '@/lib/shared/brand-vault-visual-identity';

export type ReferenceProvenance =
  | 'brand-vault'
  | 'website-screenshot'
  | 'generated'
  | 'missing-brand-evidence';

export type BrandEvidenceStatus = 'resolved' | 'missing' | 'not-required';

export type BrandReferenceEvidence = {
  imageUrl: string;
  referenceProvenance: Extract<ReferenceProvenance, 'brand-vault' | 'website-screenshot'>;
  referenceProvenanceLabel: 'Brand Vault' | 'Website screenshot';
  source: 'brand-vault-product-image' | 'brand-vault-logo' | 'website-screenshot';
  assetRole: 'logo' | 'product' | 'website-screenshot';
  matchText?: string;
};

export type BrandReferenceSubjectInput = {
  name?: string;
  category?: string;
  visualDescription?: string;
};

export type BrandReferenceContext = {
  brandId?: string;
  brandName?: string;
  subjectHints: string[];
  evidence: BrandReferenceEvidence[];
};

const MAX_BRAND_REFERENCE_IMAGES = 4;

type BrandSignalProfileWithLogoCandidates = BrandSignalProfile & {
  assets?: BrandSignalProfile['assets'] & {
    logoCandidates?: BrandSignal<string[]>;
  };
};

export const BRAND_EVIDENCE_REQUIRED_REASON =
  'Brand-owned product/platform/logo references require Brand Vault, website screenshot, or uploaded evidence before storyboard generation.';

const BRAND_LOGO_CUES = [
  'logo',
  'logomark',
  'wordmark',
  'brandmark',
  'brand mark',
  'brand logo',
];

const BRAND_OWNED_CUES = [
  'product',
  'platform',
  'dashboard',
  'app',
  'application',
  'software',
  'tool',
  'portal',
  'console',
  'website',
  'site',
  'interface',
  'ui',
  'editor',
  'workspace',
  'studio',
  'system',
  'service',
  'logo',
  'brand identity',
  'brand system',
];

const WEBSITE_REFERENCE_CUES = ['website', 'site', 'landing page', 'homepage', 'web page'];
const PRODUCT_UI_REFERENCE_CUES = [
  'product',
  'platform',
  'dashboard',
  'app',
  'application',
  'software',
  'tool',
  'portal',
  'console',
  'interface',
  'ui',
  'editor',
  'workspace',
  'studio',
  'screenshot',
];

const MATCH_STOP_WORDS = new Set([
  'and',
  'brand',
  'image',
  'official',
  'reference',
  'screenshot',
  'the',
  'with',
]);

export function cleanOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function containsPhrase(text: string, phrase: string): boolean {
  const normalizedText = ` ${normalizeForMatch(text)} `;
  const normalizedPhrase = normalizeForMatch(phrase);
  if (normalizedPhrase.length < 3) return false;
  return normalizedText.includes(` ${normalizedPhrase} `);
}

function tokensForMatch(value: string): string[] {
  return normalizeForMatch(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !MATCH_STOP_WORDS.has(token));
}

function combinedSubjectText(subject: BrandReferenceSubjectInput): string {
  return [subject.name, subject.visualDescription]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
}

function actionableString(signal: BrandSignal<string> | undefined): string | undefined {
  if (!signal || !isBrandSignalActionable(signal)) return undefined;
  return cleanOptionalString(signal.value);
}

function actionableImageUrls(
  signal: BrandSignal<string[]> | undefined,
  max: number,
): string[] {
  if (!signal || !isBrandSignalActionable(signal)) return [];
  const urls = Array.isArray(signal.value) ? signal.value : [];
  return urls
    .filter((url): url is string => typeof url === 'string' && /^https?:\/\/\S+/i.test(url.trim()))
    .map((url) => url.trim())
    .slice(0, Math.max(0, max));
}

function visualIdentityLogoUrls(
  visualIdentity: BrandVaultVisualIdentitySummary | null | undefined,
  max: number,
): string[] {
  return (visualIdentity?.logos ?? [])
    .filter((logo) => logo.availability?.status !== 'unavailable')
    .filter((logo) => typeof logo.url === 'string' && /^https?:\/\/\S+/i.test(logo.url.trim()))
    .filter((logo) => typeof logo.confidence !== 'number' || logo.confidence >= 0.55)
    .map((logo) => logo.url.trim())
    .slice(0, Math.max(0, max));
}

function visualAssetPreviewUrl(asset: BrandVaultVisualAssetPreview): string | undefined {
  const imageUrl = asset.mediaType === 'video'
    ? asset.thumbnailUrl ?? asset.sampledFrameUrls?.[0]
    : asset.thumbnailUrl ?? asset.url;
  return typeof imageUrl === 'string' && /^https?:\/\/\S+/i.test(imageUrl.trim())
    ? imageUrl.trim()
    : undefined;
}

function visualAssetMatchText(asset: BrandVaultVisualAssetPreview): string {
  return [
    asset.kind,
    asset.label,
    asset.assetRole,
    asset.sourceField,
    asset.sourceUrl,
    asset.originalUrl,
    asset.thumbnailUrl,
    asset.url,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0).join(' ');
}

function visualIdentityImageEvidence(
  visualIdentity: BrandVaultVisualIdentitySummary | null | undefined,
  max: number,
): BrandReferenceEvidence[] {
  return (visualIdentity?.images ?? [])
    .filter((asset) => asset.availability?.status !== 'unavailable')
    .filter((asset) => typeof asset.confidence !== 'number' || asset.confidence >= 0.55)
    .flatMap((asset) => {
      const imageUrl = visualAssetPreviewUrl(asset);
      if (!imageUrl) return [];
      const assetRole = referenceEvidenceRoleForVisualAsset(asset);
      if (!assetRole) return [];
      const websiteEvidence = assetRole === 'website-screenshot';
      return [{
        imageUrl,
        referenceProvenance: websiteEvidence ? 'website-screenshot' as const : 'brand-vault' as const,
        referenceProvenanceLabel: websiteEvidence ? 'Website screenshot' as const : 'Brand Vault' as const,
        source: websiteEvidence ? 'website-screenshot' as const : 'brand-vault-product-image' as const,
        assetRole,
        matchText: visualAssetMatchText(asset),
      }];
    })
    .slice(0, Math.max(0, max));
}

function referenceEvidenceRoleForVisualAsset(asset: BrandVaultVisualAssetPreview): BrandReferenceEvidence['assetRole'] | null {
  if (asset.kind === 'website_preview' || asset.assetRole === 'website_screenshot') return 'website-screenshot';
  if (asset.kind === 'product' || asset.assetRole === 'product_ui') return 'product';
  if (
    asset.assetRole === 'team' ||
    asset.assetRole === 'abstract_reference' ||
    asset.assetRole === 'creative_reference' ||
    asset.assetRole === 'prior_work' ||
    asset.assetRole === 'other'
  ) {
    return null;
  }

  const matchText = visualAssetMatchText(asset);
  if (WEBSITE_REFERENCE_CUES.some((cue) => containsPhrase(matchText, cue))) return 'website-screenshot';
  if (PRODUCT_UI_REFERENCE_CUES.some((cue) => containsPhrase(matchText, cue))) return 'product';
  return null;
}

export function brandReferenceEvidenceImages(
  profile: BrandSignalProfile | null | undefined,
  max = MAX_BRAND_REFERENCE_IMAGES,
  visualIdentity?: BrandVaultVisualIdentitySummary | null,
): BrandReferenceEvidence[] {
  const logoSignal = (profile as BrandSignalProfileWithLogoCandidates | null | undefined)?.assets?.logoCandidates;
  const logoImages = [...actionableImageUrls(logoSignal, max), ...visualIdentityLogoUrls(visualIdentity, max)]
    .map((imageUrl) => ({
      imageUrl,
      referenceProvenance: 'brand-vault' as const,
      referenceProvenanceLabel: 'Brand Vault' as const,
      source: 'brand-vault-logo' as const,
      assetRole: 'logo' as const,
      matchText: imageUrl,
    }));
  const productImages = actionableImageUrls(profile?.assets?.productImages, max).map((imageUrl) => ({
    imageUrl,
    referenceProvenance: 'brand-vault' as const,
    referenceProvenanceLabel: 'Brand Vault' as const,
    source: 'brand-vault-product-image' as const,
    assetRole: 'product' as const,
    matchText: imageUrl,
  }));
  const visualIdentityImages = visualIdentityImageEvidence(visualIdentity, max);
  const websiteScreenshots = actionableImageUrls(profile?.assets?.socialPreviewImages, max).map((imageUrl) => ({
    imageUrl,
    referenceProvenance: 'website-screenshot' as const,
    referenceProvenanceLabel: 'Website screenshot' as const,
    source: 'website-screenshot' as const,
    assetRole: 'website-screenshot' as const,
    matchText: imageUrl,
  }));
  const seen = new Set<string>();
  return [...logoImages, ...productImages, ...visualIdentityImages, ...websiteScreenshots]
    .filter((evidence) => {
      if (seen.has(evidence.imageUrl)) return false;
      seen.add(evidence.imageUrl);
      return true;
    });
}

export function isBrandLogoReferenceSubject(subject: BrandReferenceSubjectInput): boolean {
  const category = cleanOptionalString(subject.category)?.toLowerCase();
  if (category === 'logo') return true;
  const subjectText = combinedSubjectText(subject);
  return BRAND_LOGO_CUES.some((cue) => containsPhrase(subjectText, cue));
}

function commonEvidenceTokens(evidence: BrandReferenceEvidence[]): Set<string> {
  const evidenceTokenSets = evidence.map((item) => new Set(tokensForMatch(item.matchText ?? item.imageUrl)));
  const [firstTokenSet, ...restTokenSets] = evidenceTokenSets;
  if (!firstTokenSet) return new Set();
  return new Set([...firstTokenSet].filter((token) => restTokenSets.every((tokens) => tokens.has(token))));
}

function brandReferenceEvidenceScore(
  subject: BrandReferenceSubjectInput,
  evidence: BrandReferenceEvidence,
  commonTokens: Set<string>,
): number {
  const subjectText = combinedSubjectText(subject);
  const evidenceText = evidence.matchText ?? evidence.imageUrl;
  const subjectTokens = new Set(tokensForMatch(subjectText));
  const evidenceTokens = new Set(tokensForMatch(evidenceText));
  let score = 0;

  for (const token of subjectTokens) {
    if (!commonTokens.has(token) && evidenceTokens.has(token)) score += 8;
  }

  if (PRODUCT_UI_REFERENCE_CUES.some((cue) => containsPhrase(subjectText, cue)) && evidence.assetRole === 'product') {
    score += 4;
  }
  if (WEBSITE_REFERENCE_CUES.some((cue) => containsPhrase(subjectText, cue)) && evidence.assetRole === 'website-screenshot') {
    score += 6;
  }
  if (subject.category === 'product' && evidence.assetRole === 'product') {
    score += 2;
  }

  return score;
}

export function brandReferenceEvidenceForSubject(
  subject: BrandReferenceSubjectInput,
  evidence: BrandReferenceEvidence[],
): BrandReferenceEvidence[] {
  const logoSubject = isBrandLogoReferenceSubject(subject);
  const eligibleEvidence = evidence.filter((item) => logoSubject ? item.assetRole === 'logo' : item.assetRole !== 'logo');
  if (logoSubject || eligibleEvidence.length <= 1) return eligibleEvidence;

  const commonTokens = commonEvidenceTokens(eligibleEvidence);
  const scoredEvidence = eligibleEvidence
    .map((item, index) => ({ item, index, score: brandReferenceEvidenceScore(subject, item, commonTokens) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const bestScore = scoredEvidence[0]?.score ?? 0;

  return bestScore >= 8
    ? scoredEvidence.filter((entry) => entry.score === bestScore).map((entry) => entry.item)
    : eligibleEvidence;
}

function brandReferenceSubjectHints(
  profile: BrandSignalProfile | null | undefined,
  fallbackBrandName?: string,
): string[] {
  const hints = [
    actionableString(profile?.identity?.brandName),
    cleanOptionalString(fallbackBrandName),
  ].filter((hint): hint is string => Boolean(hint));

  return [...new Set(hints)];
}

export async function resolveBrandReferenceContext(
  userId: string,
  brandId: string | undefined,
  options: { logScope?: string } = {},
): Promise<BrandReferenceContext> {
  if (!brandId) {
    return { subjectHints: [], evidence: [] };
  }

  try {
    const { brand, acceptedProfile, acceptedReviewPayload } = await resolveEffectiveBrandWithProfile(userId, brandId, {
      service: 'editron',
      strict: true,
    });
    return {
      brandId,
      brandName: cleanOptionalString(brand?.name),
      subjectHints: brandReferenceSubjectHints(acceptedProfile, brand?.name),
      evidence: brandReferenceEvidenceImages(acceptedProfile, MAX_BRAND_REFERENCE_IMAGES, acceptedReviewPayload?.visualIdentity),
    };
  } catch (err) {
    console.error(`[${options.logScope ?? 'reference-brand-evidence'}] Brand Vault evidence resolution failed`, err);
    return { brandId, subjectHints: [], evidence: [] };
  }
}

export function requiresBrandReferenceEvidence(
  subject: BrandReferenceSubjectInput,
  context: Pick<BrandReferenceContext, 'brandId' | 'subjectHints'>,
): boolean {
  if (!context.brandId) return false;
  const category = cleanOptionalString(subject.category)?.toLowerCase();
  if (category === 'product') return true;

  const combinedText = [
    subject.name,
    subject.visualDescription,
  ].filter((value): value is string => typeof value === 'string').join(' ');
  if (!combinedText.trim()) return false;

  const mentionsBrand = context.subjectHints.some((hint) => containsPhrase(combinedText, hint));
  if (!mentionsBrand) return false;

  const hasOwnedCue = BRAND_OWNED_CUES.some((cue) => containsPhrase(combinedText, cue));
  return hasOwnedCue || category === 'object' || category === 'location';
}
