import { BRAND_CONFIDENCE } from './brand-confidence';
import type {
  BrandSignal,
  BrandSignalEvidence,
  BrandSignalProfile,
  BrandSignalTrustLevel,
} from './brand-signal-profile';
import type { BrandEvidenceCandidate, BrandVaultSourceInput } from './brand-website-refinery-types';

export type BrandVaultVisualSwatchRole =
  | 'primary'
  | 'accent'
  | 'supporting'
  | 'neutral'
  | 'candidate';

export interface BrandVaultVisualSwatch {
  id: string;
  label: string;
  value: string;
  role: BrandVaultVisualSwatchRole;
  confidence: number;
  signalPath: string;
  sourceField?: string;
  sourceUrl?: string;
  sourceTrust?: BrandSignalTrustLevel;
  unsafeOnDark: boolean;
  unsafeOnLight: boolean;
}

export type BrandVaultFontPreviewRole = 'display' | 'body' | 'mono' | 'accent' | 'unknown';

export interface BrandVaultFontPreview {
  id: string;
  family: string;
  cssFontFamily: string;
  role: BrandVaultFontPreviewRole;
  sampleText: string;
  confidence: number;
  signalPath: string;
  sourceField?: string;
  sourceTrust?: BrandSignalTrustLevel;
}

export type BrandVaultVisualAssetKind = 'logo' | 'product' | 'website_preview' | 'social_media' | 'uploaded_asset';

export interface BrandVaultVisualAssetPreview {
  id: string;
  kind: BrandVaultVisualAssetKind;
  label: string;
  url: string;
  thumbnailUrl?: string;
  mediaType?: NonNullable<BrandVaultSourceInput['media']>['mediaType'];
  platform?: BrandVaultSourceInput['platform'];
  confidence: number;
  signalPath?: string;
  sourceField?: string;
  sourceUrl?: string;
  sourceType?: BrandEvidenceCandidate['sourceType'] | BrandVaultSourceInput['kind'];
  evidenceOrigin?: BrandVaultSourceInput['evidenceOrigin'];
  availability?: {
    status: 'available' | 'unavailable' | 'unknown';
    contentType?: string;
    httpStatus?: number;
  };
}

export interface BrandVaultVisualIdentitySummary {
  colors: BrandVaultVisualSwatch[];
  fonts: BrandVaultFontPreview[];
  logos: BrandVaultVisualAssetPreview[];
  images: BrandVaultVisualAssetPreview[];
}

const MAX_VISUAL_SWATCHES = 18;
const MAX_VISUAL_FONT_PREVIEWS = 8;
const MAX_VISUAL_LOGOS = 8;
const MAX_VISUAL_IMAGES = 18;
const GENERIC_FONT_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'ui-rounded',
  '-apple-system',
  'blinkmacsystemfont',
]);

export function createBrandVaultVisualIdentitySummary(args: {
  profile: BrandSignalProfile;
  candidates: BrandEvidenceCandidate[];
  sourceEvidence: BrandVaultSourceInput[];
}): BrandVaultVisualIdentitySummary {
  return {
    colors: createVisualSwatches(args.profile, args.candidates, args.sourceEvidence),
    fonts: createFontPreviews(args.profile),
    logos: createVisualAssetPreviews(args, 'logo').slice(0, MAX_VISUAL_LOGOS),
    images: createVisualAssetPreviews(args, 'image').slice(0, MAX_VISUAL_IMAGES),
  };
}

function createVisualSwatches(
  profile: BrandSignalProfile,
  candidates: BrandEvidenceCandidate[],
  sourceEvidence: BrandVaultSourceInput[],
): BrandVaultVisualSwatch[] {
  const evidenceById = new Map(profile.evidence.map((item) => [item.id, item]));
  const unsafeOnDark = new Set(normalizeColorValues(profile.palette.unsafeOnDark.value));
  const unsafeOnLight = new Set(normalizeColorValues(profile.palette.unsafeOnLight.value));
  const swatches = new Map<string, BrandVaultVisualSwatch>();

  const add = (swatch: Omit<BrandVaultVisualSwatch, 'id' | 'unsafeOnDark' | 'unsafeOnLight'>): void => {
    const color = normalizeHexColor(swatch.value);
    if (!color) return;
    const next: BrandVaultVisualSwatch = {
      ...swatch,
      id: `visual_color_${idPart(`${swatch.role}_${color}`, 'color')}`,
      value: color,
      unsafeOnDark: unsafeOnDark.has(color),
      unsafeOnLight: unsafeOnLight.has(color),
    };
    const existing = swatches.get(color);
    if (!existing || compareVisualSwatches(next, existing) < 0) swatches.set(color, next);
  };

  addSignalSwatches(add, profile, evidenceById, 'palette.primary', profile.palette.primary, 'primary', 'Primary');
  addSignalSwatches(add, profile, evidenceById, 'palette.accent', profile.palette.accent, 'accent', 'Accent');
  addSignalSwatches(add, profile, evidenceById, 'palette.supporting', profile.palette.supporting, 'supporting', 'Supporting');
  addSignalSwatches(add, profile, evidenceById, 'palette.neutrals', profile.palette.neutrals, 'neutral', 'Neutral');

  for (const candidate of candidates) {
    if (!candidate.signalPath.startsWith('palette.')) continue;
    const role = swatchRoleForSignalPath(candidate.signalPath);
    for (const color of colorsFromUnknown(candidate.normalizedValue)) {
      add({
        label: labelForCandidateColor(candidate, role),
        value: color,
        role,
        confidence: candidate.confidence,
        signalPath: candidate.signalPath,
        sourceField: candidate.sourceField,
        sourceUrl: candidate.sourceUrl,
      });
    }
  }

  for (const [index, source] of sourceEvidence.entries()) {
    for (const color of normalizeColorValues(source.dominantColors ?? [])) {
      add({
        label: source.kind === 'uploaded_asset' ? 'Uploaded asset color' : 'Source color',
        value: color,
        role: source.kind === 'uploaded_asset' ? 'supporting' : 'candidate',
        confidence: confidenceForSource(source.kind),
        signalPath: 'palette.supporting',
        sourceField: `sourceEvidence.${index}.${source.kind}.dominantColors`,
        sourceUrl: source.url,
        sourceTrust: source.evidenceOrigin === 'connected_fetch' ? 'connected_social_account' : undefined,
      });
    }
  }

  return [...swatches.values()]
    .sort(compareVisualSwatches)
    .slice(0, MAX_VISUAL_SWATCHES);
}

function addSignalSwatches(
  add: (swatch: Omit<BrandVaultVisualSwatch, 'id' | 'unsafeOnDark' | 'unsafeOnLight'>) => void,
  profile: BrandSignalProfile,
  evidenceById: Map<string, BrandSignalEvidence>,
  signalPath: string,
  signal: BrandSignal<string | string[]> | undefined,
  role: BrandVaultVisualSwatchRole,
  label: string,
): void {
  if (!signal) return;
  const evidence = firstSignalEvidence(signal, evidenceById);
  for (const color of colorsFromUnknown(signal.value)) {
    add({
      label,
      value: color,
      role,
      confidence: signal.confidence,
      signalPath,
      sourceField: evidence?.sourceField,
      sourceTrust: signal.trustLevel,
    });
  }
}

function createFontPreviews(profile: BrandSignalProfile): BrandVaultFontPreview[] {
  const rawSignal = profile.typography.raw;
  if (!rawSignal?.value) return [];
  const evidenceById = new Map(profile.evidence.map((item) => [item.id, item]));
  const evidence = firstSignalEvidence(rawSignal, evidenceById);
  const brandName = profile.identity.brandName.value || 'Brand sample';
  return uniqueStrings(rawSignal.value.split(',').map(cleanFontFamilyName).filter(isSpecificFontFamily))
    .slice(0, MAX_VISUAL_FONT_PREVIEWS)
    .map((family, index) => ({
      id: `visual_font_${idPart(family, `font_${index + 1}`)}`,
      family,
      cssFontFamily: `"${family}", ${fontFallbackForCategory(profile.typography.category.value)}`,
      role: fontPreviewRole(family, index),
      sampleText: index === 0 ? brandName : `${brandName} brand system`,
      confidence: rawSignal.confidence,
      signalPath: 'typography.raw',
      sourceField: evidence?.sourceField,
      sourceTrust: rawSignal.trustLevel,
    }));
}

function createVisualAssetPreviews(
  args: {
    profile: BrandSignalProfile;
    candidates: BrandEvidenceCandidate[];
    sourceEvidence: BrandVaultSourceInput[];
  },
  mode: 'logo' | 'image',
): BrandVaultVisualAssetPreview[] {
  const previews = new Map<string, BrandVaultVisualAssetPreview>();
  const add = (preview: Omit<BrandVaultVisualAssetPreview, 'id'>): void => {
    const url = normalizeRenderableAssetUrl(preview.url);
    if (!url || preview.availability?.status === 'unavailable') return;
    const next: BrandVaultVisualAssetPreview = {
      ...preview,
      id: `visual_asset_${idPart(`${preview.kind}_${url}`, 'asset')}`,
      url,
    };
    const existing = previews.get(url);
    if (!existing || compareVisualAssets(next, existing) < 0) previews.set(url, next);
  };

  for (const candidate of args.candidates) {
    if (mode === 'logo' && candidate.signalPath === 'assets.logoCandidates') {
      const url = candidateAssetUrl(candidate);
      if (url) {
        add({
          kind: 'logo',
          label: candidateLogoLabel(candidate),
          url,
          confidence: candidate.confidence,
          signalPath: candidate.signalPath,
          sourceField: candidate.sourceField,
          sourceUrl: candidate.sourceUrl,
          sourceType: candidate.sourceType,
          evidenceOrigin: candidateEvidenceOrigin(candidate) as BrandVaultSourceInput['evidenceOrigin'] | undefined,
          availability: candidateAssetAvailability(candidate),
        });
      }
    }
    if (mode === 'image' && candidate.signalPath === 'assets.productImages') {
      const url = candidateAssetUrl(candidate);
      if (url) {
        add({
          kind: 'product',
          label: 'Product or service image',
          url,
          confidence: candidate.confidence,
          signalPath: candidate.signalPath,
          sourceField: candidate.sourceField,
          sourceUrl: candidate.sourceUrl,
          sourceType: candidate.sourceType,
          availability: candidateAssetAvailability(candidate),
        });
      }
    }
    if (mode === 'image' && candidate.signalPath === 'assets.socialPreviewImages') {
      const url = candidateAssetUrl(candidate);
      if (url) {
        add({
          kind: 'website_preview',
          label: 'Website preview image',
          url,
          confidence: candidate.confidence,
          signalPath: candidate.signalPath,
          sourceField: candidate.sourceField,
          sourceUrl: candidate.sourceUrl,
          sourceType: candidate.sourceType,
          availability: candidateAssetAvailability(candidate),
        });
      }
    }
  }

  if (mode === 'image') {
    for (const url of args.profile.assets?.productImages.value ?? []) {
      add({
        kind: 'product',
        label: 'Product or service image',
        url,
        confidence: args.profile.assets?.productImages.confidence ?? BRAND_CONFIDENCE.FALLBACK_SIGNAL,
        signalPath: 'assets.productImages',
        sourceType: 'website',
      });
    }
  }

  for (const [index, source] of args.sourceEvidence.entries()) {
    const sourceField = `sourceEvidence.${index}.${source.kind}`;
    if (mode === 'logo' && source.kind === 'uploaded_asset' && isLogoUpload(source) && source.url) {
      add({
        kind: 'logo',
        label: source.name ?? 'Uploaded logo',
        url: source.url,
        confidence: confidenceForSource(source.kind),
        sourceField,
        sourceUrl: source.url,
        sourceType: source.kind,
        evidenceOrigin: source.evidenceOrigin,
      });
    }
    if (mode === 'image' && source.kind === 'uploaded_asset' && source.url && !isLogoUpload(source) && isImageLikeSource(source)) {
      add({
        kind: 'uploaded_asset',
        label: source.name ?? 'Uploaded brand asset',
        url: source.url,
        confidence: confidenceForSource(source.kind),
        sourceField,
        sourceUrl: source.url,
        sourceType: source.kind,
        evidenceOrigin: source.evidenceOrigin,
      });
    }
    if (mode === 'image' && source.kind === 'social_post' && source.media) {
      const mediaUrl = source.media.mediaUrl ?? source.media.thumbnailUrl;
      if (mediaUrl) {
        add({
          kind: 'social_media',
          label: `${platformLabel(source.platform)} ${source.media.mediaType ?? 'media'} evidence`,
          url: mediaUrl,
          thumbnailUrl: source.media.thumbnailUrl,
          mediaType: source.media.mediaType,
          platform: source.platform,
          confidence: confidenceForSource(source.kind),
          sourceField: `${sourceField}.media`,
          sourceUrl: source.url,
          sourceType: source.kind,
          evidenceOrigin: source.evidenceOrigin,
        });
      }
    }
  }

  return [...previews.values()].sort(compareVisualAssets);
}

function compareVisualSwatches(left: BrandVaultVisualSwatch, right: BrandVaultVisualSwatch): number {
  return swatchRoleRank(left.role) - swatchRoleRank(right.role) ||
    right.confidence - left.confidence ||
    left.value.localeCompare(right.value);
}

function swatchRoleRank(role: BrandVaultVisualSwatchRole): number {
  if (role === 'primary') return 0;
  if (role === 'accent') return 1;
  if (role === 'supporting') return 2;
  if (role === 'neutral') return 3;
  return 4;
}

function swatchRoleForSignalPath(signalPath: string): BrandVaultVisualSwatchRole {
  if (signalPath === 'palette.primary') return 'primary';
  if (signalPath === 'palette.accent') return 'accent';
  if (signalPath === 'palette.neutrals') return 'neutral';
  if (signalPath === 'palette.supporting') return 'supporting';
  return 'candidate';
}

function labelForCandidateColor(candidate: BrandEvidenceCandidate, role: BrandVaultVisualSwatchRole): string {
  if (candidate.sourceType === 'uploaded_guideline') return 'Brand book color';
  if (candidate.sourceType === 'uploaded_asset') return 'Uploaded asset color';
  if (candidate.sourceType === 'css') return role === 'candidate' ? 'CSS color' : `${capitalizeLabel(role)} color`;
  return role === 'candidate' ? 'Candidate color' : `${capitalizeLabel(role)} color`;
}

function colorsFromUnknown(value: unknown): string[] {
  if (Array.isArray(value)) return uniqueStrings(value.flatMap(colorsFromUnknown));
  if (typeof value === 'string') {
    const direct = normalizeHexColor(value);
    return direct ? [direct] : colorsFromText(value);
  }
  if (isRecord(value)) return colorsFromText(JSON.stringify(value));
  return [];
}

function firstSignalEvidence<T>(
  signal: BrandSignal<T>,
  evidenceById: Map<string, BrandSignalEvidence>,
): BrandSignalEvidence | undefined {
  for (const id of signal.evidenceIds) {
    const evidence = evidenceById.get(id);
    if (evidence) return evidence;
  }
  return undefined;
}

function cleanFontFamilyName(value: string): string {
  return value
    .replace(/!important\b/gi, '')
    .replace(/^['"]|['"]$/g, '')
    .trim();
}

function isSpecificFontFamily(value: string): boolean {
  const normalized = value.toLowerCase();
  if (!normalized || normalized.startsWith('var(')) return false;
  return !GENERIC_FONT_FAMILIES.has(normalized);
}

function fontFallbackForCategory(category: BrandSignalProfile['typography']['category']['value']): string {
  if (category === 'mono') return 'monospace';
  if (category === 'serif' || category === 'slab') return 'serif';
  return 'sans-serif';
}

function fontPreviewRole(family: string, index: number): BrandVaultFontPreviewRole {
  if (/\b(?:mono|code|jetbrains|fira code|source code|consolas)\b/i.test(family)) return 'mono';
  if (index === 0) return 'display';
  if (index === 1) return 'body';
  return 'accent';
}

function candidateAssetUrl(candidate: BrandEvidenceCandidate): string | undefined {
  return assetUrlFromUnknown(candidate.normalizedValue) ?? assetUrlFromUnknown(candidate.rawValue);
}

function assetUrlFromUnknown(value: unknown): string | undefined {
  if (typeof value === 'string') return normalizeRenderableAssetUrl(value);
  if (isRecord(value)) {
    for (const key of ['url', 'mediaUrl', 'thumbnailUrl']) {
      const nested = value[key];
      if (typeof nested === 'string') {
        const url = normalizeRenderableAssetUrl(nested);
        if (url) return url;
      }
    }
  }
  return undefined;
}

function normalizeRenderableAssetUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function candidateLogoLabel(candidate: BrandEvidenceCandidate): string {
  const role = candidateLogoRole(candidate);
  if (role === 'icon') return 'Icon candidate';
  if (candidate.sourceType === 'uploaded_asset') return 'Uploaded logo';
  return 'Logo candidate';
}

function candidateLogoRole(candidate: BrandEvidenceCandidate): string | undefined {
  for (const value of [candidate.rawValue, candidate.normalizedValue]) {
    if (isRecord(value) && typeof value.role === 'string') return value.role;
  }
  return undefined;
}

function candidateEvidenceOrigin(candidate: BrandEvidenceCandidate): string | undefined {
  for (const value of [candidate.normalizedValue, candidate.rawValue]) {
    if (isRecord(value) && typeof value.evidenceOrigin === 'string') return value.evidenceOrigin;
  }
  return undefined;
}

function candidateAssetAvailability(candidate: BrandEvidenceCandidate): BrandVaultVisualAssetPreview['availability'] {
  for (const value of [candidate.rawValue, candidate.normalizedValue]) {
    if (!isRecord(value) || !isRecord(value.availability)) continue;
    const status = value.availability.status;
    if (status !== 'available' && status !== 'unavailable' && status !== 'unknown') continue;
    return {
      status,
      contentType: typeof value.availability.contentType === 'string' ? value.availability.contentType : undefined,
      httpStatus: typeof value.availability.httpStatus === 'number' ? value.availability.httpStatus : undefined,
    };
  }
  return undefined;
}

function compareVisualAssets(left: BrandVaultVisualAssetPreview, right: BrandVaultVisualAssetPreview): number {
  return visualAssetKindRank(left.kind) - visualAssetKindRank(right.kind) ||
    right.confidence - left.confidence ||
    left.url.localeCompare(right.url);
}

function visualAssetKindRank(kind: BrandVaultVisualAssetKind): number {
  if (kind === 'logo') return 0;
  if (kind === 'product') return 1;
  if (kind === 'website_preview') return 2;
  if (kind === 'uploaded_asset') return 3;
  return 4;
}

function isLogoUpload(source: BrandVaultSourceInput): boolean {
  const label = `${source.name ?? ''} ${source.url ?? ''} ${source.mimeType ?? ''}`.toLowerCase();
  return source.assetRole === 'logo' || /\b(?:logo|logomark|wordmark|brandmark)\b/.test(label);
}

function isImageLikeSource(source: BrandVaultSourceInput): boolean {
  if (source.mimeType?.startsWith('image/')) return true;
  return source.assetRole === 'creative_reference' || source.assetRole === 'prior_work';
}

function confidenceForSource(kind: BrandVaultSourceInput['kind']): number {
  if (kind === 'uploaded_guideline') return BRAND_CONFIDENCE.SOURCE_REFERENCE.UPLOADED_GUIDELINE;
  if (kind === 'uploaded_asset') return BRAND_CONFIDENCE.SOURCE_REFERENCE.UPLOADED_ASSET;
  if (kind === 'social_post') return BRAND_CONFIDENCE.SOURCE_REFERENCE.SOCIAL_POST;
  if (kind === 'social_profile') return BRAND_CONFIDENCE.SOURCE_REFERENCE.SOCIAL_PROFILE;
  if (kind === 'crawl_seed') return BRAND_CONFIDENCE.SOURCE_REFERENCE.CRAWL_SEED;
  return BRAND_CONFIDENCE.SOURCE_REFERENCE.DEFAULT;
}

function colorsFromText(text: string): string[] {
  const colors: string[] = [];
  for (const match of text.matchAll(/#[0-9a-f]{3,6}\b/gi)) {
    const color = normalizeHexColor(match[0]);
    if (color) colors.push(color);
  }
  return colors;
}

function normalizeColorValues(values: string[]): string[] {
  return values.map(normalizeHexColor).filter((color): color is string => Boolean(color));
}

function normalizeHexColor(value: string): string | undefined {
  const hex = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/.test(hex)) return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  return undefined;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function platformLabel(platform: BrandVaultSourceInput['platform']): string {
  if (platform === 'x') return 'X';
  if (!platform) return 'Social';
  return capitalizeLabel(platform);
}

function capitalizeLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
}

function idPart(value: string, fallback: string): string {
  const clean = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);
  return clean || fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
