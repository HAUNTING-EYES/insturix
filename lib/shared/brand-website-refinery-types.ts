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
  brandId?: string;
  userId?: string;
  companyName?: string;
  fetchedAt?: string;
  extractor?: string;
  jobId?: string;
}

export interface BrandWebsiteSnapshot {
  normalizedUrl: string;
  html: string;
  fetchedAt: string;
  contentType?: string;
}

export interface FetchWebsiteBrandSnapshotOptions {
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
  now?: string;
  userAgent?: string;
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
  logoCandidates: string[];
  bodyText: string;
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
