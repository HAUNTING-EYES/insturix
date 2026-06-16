import type {
  BrandSignal,
  BrandSignalAuthorityClass,
  BrandSignalProfile,
  BrandSignalTrustLevel,
} from './brand-signal-profile';
import type { BrandSignalProfileRecord } from './brand-signal-lifecycle';

export type BrandEvidenceCandidateSourceType =
  | 'website'
  | 'website_metadata'
  | 'json_ld'
  | 'css'
  | 'logo_asset'
  | 'manual_user'
  | 'social_profile'
  | 'social_post'
  | 'uploaded_guideline'
  | 'uploaded_asset'
  | 'crawl_seed'
  | 'legacy_brand_intelligence';

export type BrandEvidenceCandidateAuthority = 'manual' | 'official' | 'owned' | 'inferred';

export type BrandVaultSourceKind =
  | 'social_profile'
  | 'social_post'
  | 'uploaded_guideline'
  | 'uploaded_asset'
  | 'crawl_seed'
  | 'legacy_brand_intelligence';

export type BrandVaultSourcePlatform =
  | 'website'
  | 'linkedin'
  | 'instagram'
  | 'youtube'
  | 'tiktok'
  | 'x'
  | 'facebook'
  | 'other';

export interface BrandVaultCrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  includePaths?: string[];
  excludePaths?: string[];
}

export type BrandVaultUploadedAssetRole =
  | 'brand_book'
  | 'logo'
  | 'font'
  | 'color_palette'
  | 'creative_reference'
  | 'prior_work'
  | 'other';

export type BrandVaultSocialConnectionStatus =
  | 'connected'
  | 'connected_different_account'
  | 'scope_missing'
  | 'not_connected'
  | 'public_fallback_available';

export interface BrandVaultSocialConnectionEvidence {
  provider: 'uploaderx' | 'clerk_external_account' | 'alyzitron_apify';
  status: BrandVaultSocialConnectionStatus;
  accountId?: string;
  accountName?: string;
  accountHandle?: string;
  scopes?: string[];
  missingScopes?: string[];
  canReadProfile: boolean;
  canReadPosts: boolean;
  canReadPinned: boolean;
  matchStatus?: 'matched' | 'mismatched' | 'unverified';
}

export type BrandVaultSourceEvidenceOrigin =
  | 'user_supplied'
  | 'connected_metadata'
  | 'connected_fetch'
  | 'public_fallback';

export interface BrandVaultSocialMediaEvidence {
  mediaType?: 'image' | 'video' | 'carousel' | 'link' | 'unknown';
  mediaUrl?: string;
  thumbnailUrl?: string;
  sampledFrameUrls?: string[];
  ocrText?: string;
  transcript?: string;
  durationSeconds?: number;
}

export interface BrandVaultSocialMetricsEvidence {
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
  viewCount?: number;
  repostCount?: number;
  quoteCount?: number;
  engagementCount?: number;
}

export interface BrandVaultSocialProfileEvidence {
  bio?: string;
  category?: string;
  website?: string;
  followerCount?: number;
}

export interface BrandVaultSourceInput {
  kind: BrandVaultSourceKind;
  url?: string;
  name?: string;
  platform?: BrandVaultSourcePlatform;
  note?: string;
  crawl?: BrandVaultCrawlOptions;
  mimeType?: string;
  sizeBytes?: number;
  text?: string;
  dominantColors?: string[];
  assetRole?: BrandVaultUploadedAssetRole;
  pinned?: boolean;
  publishedAt?: string;
  media?: BrandVaultSocialMediaEvidence;
  metrics?: BrandVaultSocialMetricsEvidence;
  profile?: BrandVaultSocialProfileEvidence;
  evidenceOrigin?: BrandVaultSourceEvidenceOrigin;
  connection?: BrandVaultSocialConnectionEvidence;
}

export interface BrandEvidenceCandidate {
  id: string;
  brandId?: string;
  jobId?: string;
  sourceType: BrandEvidenceCandidateSourceType;
  sourceUrl?: string;
  sourceField: string;
  signalPath: string;
  rawValue: unknown;
  normalizedValue: unknown;
  excerpt?: string;
  confidence: number;
  authorityClass: BrandEvidenceCandidateAuthority;
  observedAt: string;
  extractorId: string;
}

export interface BrandRefineryJob {
  id: string;
  userId: string;
  brandId?: string;
  status: 'queued' | 'running' | 'needs_review' | 'accepted' | 'rejected' | 'failed';
  inputs: {
    websiteUrl?: string;
    companyName?: string;
    socialLinks: string[];
    sourceEvidence?: BrandVaultSourceInput[];
  };
  warnings: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BrandWebsiteDraftInput {
  websiteUrl: string;
  html: string;
  stylesheets?: BrandWebsiteStylesheetSnapshot[];
  supplementalText?: BrandWebsiteSupplementalTextEvidence[];
  brandId?: string;
  userId?: string;
  companyName?: string;
  fetchedAt?: string;
  extractor?: string;
  jobId?: string;
}

export interface BrandWebsiteStylesheetSnapshot {
  url: string;
  css: string;
  contentType?: string;
}

export interface BrandWebsiteSupplementalTextEvidence {
  sourceField: string;
  sourceUrl?: string;
  text: string;
  confidence?: number;
}

export type BrandWebsiteFetchFallbackReason =
  | 'http_blocked'
  | 'rate_limited'
  | 'server_error'
  | 'browser_challenge'
  | 'javascript_shell'
  | 'empty_html';

export interface BrandWebsiteBrowserFallbackInput {
  normalizedUrl: string;
  reason: BrandWebsiteFetchFallbackReason;
  httpStatus?: number;
  contentType?: string;
  htmlExcerpt?: string;
  now?: string;
  userAgent?: string;
}

export interface BrandWebsiteBrowserFallbackSnapshot {
  normalizedUrl?: string;
  html: string;
  contentType?: string;
  stylesheets?: BrandWebsiteStylesheetSnapshot[];
  supplementalText?: BrandWebsiteSupplementalTextEvidence[];
  stylesheetWarnings?: string[];
  fetchWarnings?: string[];
}

export interface BrandWebsiteSnapshot {
  normalizedUrl: string;
  html: string;
  fetchedAt: string;
  contentType?: string;
  stylesheets?: BrandWebsiteStylesheetSnapshot[];
  supplementalText?: BrandWebsiteSupplementalTextEvidence[];
  stylesheetWarnings?: string[];
  fetchWarnings?: string[];
  browserFallbackRequired?: boolean;
  fetchFallbackReason?: BrandWebsiteFetchFallbackReason;
}

export interface FetchWebsiteBrandSnapshotOptions {
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
  browserFallbackFetchFn?: (input: BrandWebsiteBrowserFallbackInput) => Promise<BrandWebsiteBrowserFallbackSnapshot | undefined>;
  timeoutMs?: number;
  now?: string;
  userAgent?: string;
  browserUserAgent?: string;
  disableBrowserLikeRetry?: boolean;
  fetchLinkedStylesheets?: boolean;
  maxLinkedStylesheets?: number;
  maxStylesheetBytes?: number;
  stylesheetTimeoutMs?: number;
}

export type BrandWebsiteAssetAvailabilityStatus = 'available' | 'unavailable' | 'unknown';

export interface BrandWebsiteAssetAvailability {
  status: BrandWebsiteAssetAvailabilityStatus;
  method: 'HEAD' | 'GET';
  httpStatus?: number;
  contentType?: string;
  reason?: string;
}

export interface BrandWebsiteAssetProbeOptions extends FetchWebsiteBrandSnapshotOptions {
  maxCandidates?: number;
  allowDefaultFetch?: boolean;
}

export interface BrandWebsiteAssetProbeResult {
  candidates: BrandEvidenceCandidate[];
  warnings: string[];
  checkedCount: number;
  unavailableCount: number;
  unknownCount: number;
}

export interface BrandWebsiteSignalProfileResult {
  profile: BrandSignalProfile;
  candidates: BrandEvidenceCandidate[];
  normalizedUrl: string;
  warnings: string[];
}

export interface BrandWebsiteDraftResult extends BrandWebsiteSignalProfileResult {
  record: BrandSignalProfileRecord;
}

export type BrandWebsiteLogoCandidateRole = 'logo' | 'icon';

export interface BrandWebsiteLogoCandidate {
  url: string;
  rawValue: string;
  sourceField: string;
  role: BrandWebsiteLogoCandidateRole;
  confidence: number;
}

export interface ParsedWebsiteEvidence {
  normalizedUrl: string;
  host: string;
  title?: string;
  metaDescription?: string;
  siteName?: string;
  schemaName?: string;
  schemaDescription?: string;
  schemaTypes: string[];
  colors: string[];
  fonts: string[];
  headings: string[];
  ctas: string[];
  proofSnippets: string[];
  logoCandidates: BrandWebsiteLogoCandidate[];
  socialPreviewImages: string[];
  bodyText: string;
  nextDataText: string[];
  supplementalText: BrandWebsiteSupplementalTextEvidence[];
}

export interface SignalSource {
  candidateSourceType: BrandEvidenceCandidateSourceType;
  sourceField: string;
  rawValue: unknown;
  normalizedValue: unknown;
  excerpt?: string;
  confidence: number;
  authorityClass: BrandSignalAuthorityClass;
  trustLevel?: BrandSignalTrustLevel;
}

export type MakeSignal = <T>(path: string, value: T, source: SignalSource) => BrandSignal<T>;

export type FallbackSignal = <T>(path: string, value: T, reason: string) => BrandSignal<T>;
