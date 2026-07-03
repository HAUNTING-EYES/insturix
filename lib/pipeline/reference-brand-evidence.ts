import { resolveEffectiveBrandWithProfile } from '@/lib/shared/brand-effective-resolver';
import {
  isBrandSignalActionable,
  type BrandSignal,
  type BrandSignalProfile,
} from '@/lib/shared/brand-signal-profile';

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
  source: 'brand-vault-product-image' | 'website-screenshot';
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

export const BRAND_EVIDENCE_REQUIRED_REASON =
  'Brand-owned product/platform references require Brand Vault, website screenshot, or uploaded evidence before storyboard generation.';

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

export function brandReferenceEvidenceImages(
  profile: BrandSignalProfile | null | undefined,
  max = MAX_BRAND_REFERENCE_IMAGES,
): BrandReferenceEvidence[] {
  const productImages = actionableImageUrls(profile?.assets?.productImages, max).map((imageUrl) => ({
    imageUrl,
    referenceProvenance: 'brand-vault' as const,
    referenceProvenanceLabel: 'Brand Vault' as const,
    source: 'brand-vault-product-image' as const,
  }));
  const websiteScreenshots = actionableImageUrls(profile?.assets?.socialPreviewImages, max).map((imageUrl) => ({
    imageUrl,
    referenceProvenance: 'website-screenshot' as const,
    referenceProvenanceLabel: 'Website screenshot' as const,
    source: 'website-screenshot' as const,
  }));
  const seen = new Set<string>();
  return [...productImages, ...websiteScreenshots]
    .filter((evidence) => {
      if (seen.has(evidence.imageUrl)) return false;
      seen.add(evidence.imageUrl);
      return true;
    })
    .slice(0, Math.max(0, max));
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
    const { brand, acceptedProfile } = await resolveEffectiveBrandWithProfile(userId, brandId, {
      service: 'editron',
      strict: true,
    });
    return {
      brandId,
      brandName: cleanOptionalString(brand?.name),
      subjectHints: brandReferenceSubjectHints(acceptedProfile, brand?.name),
      evidence: brandReferenceEvidenceImages(acceptedProfile),
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
