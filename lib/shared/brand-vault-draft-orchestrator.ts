import { load } from 'cheerio';
import { BRAND_CONFIDENCE } from './brand-confidence';
import type {
  BrandSignal,
  BrandSignalEvidence,
  BrandSignalProfile,
  BrandSignalTrustLevel,
} from './brand-signal-profile';
import { isBrandSignalActionable, sanitizeEvidenceExcerpt } from './brand-signal-profile';
import {
  collectBrandSignals,
  getReviewReasons,
  type BrandSignalLifecycleOptions,
  type BrandSignalProfileRecord,
} from './brand-signal-lifecycle';
import type { BrandSignalProfileRepositoryResult } from './brand-signal-profile-repository';
import {
  createWebsiteBrandSignalProfileDraft,
  fetchWebsiteBrandSnapshot,
  normalizeBrandWebsiteUrl,
  verifyWebsiteBrandAssetCandidates,
} from './brand-website-refinery';
import { createBrandVaultSocialEvidenceCandidates } from './brand-vault-social-evidence';
import { inferAudience, parseWebsiteHtml } from './brand-website-refinery-utils';
import {
  createBrandVaultGeminiSocialOcrProvider,
  type BrandVaultSocialOcrProvider,
} from './brand-vault-social-ocr';
import {
  createBrandVaultVisualIdentitySummary,
  type BrandVaultVisualIdentitySummary,
} from './brand-vault-visual-identity';
import {
  mirrorBrandVaultVisualIdentityAssets,
  type BrandVaultVisualAssetStorageProvider,
} from './brand-vault-visual-asset-storage';
import type {
  BrandEvidenceCandidate,
  BrandVaultCrawlOptions,
  BrandRefineryJob,
  BrandVaultSourceInput,
  BrandWebsiteSnapshot,
  BrandWebsiteSupplementalTextEvidence,
  FetchWebsiteBrandSnapshotOptions,
} from './brand-website-refinery-types';

export type {
  BrandVaultFontPreview,
  BrandVaultFontPreviewRole,
  BrandVaultStoredVisualAssetState,
  BrandVaultVisualAssetKind,
  BrandVaultVisualAssetPreview,
  BrandVaultVisualIdentitySummary,
  BrandVaultVisualSwatch,
  BrandVaultVisualSwatchRole,
} from './brand-vault-visual-identity';

export type BrandVaultWebsiteDraftJobErrorCode = 'invalid_url' | 'fetch_failed' | 'draft_creation_failed';

export type BrandVaultSignalGroup = 'identity' | 'palette' | 'typography' | 'visual' | 'motion' | 'voice';

export interface BrandVaultSignalGroupCoverage {
  signalCount: number;
  actionableSignalCount: number;
  evidenceCount: number;
}

export type BrandVaultSignalDiagnosticStatus = 'ready' | 'weak' | 'missing' | 'fallback';

export type BrandVaultSignalEvidenceNeed =
  | 'website_crawl'
  | 'connected_social'
  | 'pinned_posts'
  | 'brand_uploads'
  | 'visual_scan'
  | 'prior_examples'
  | 'manual_review';

export interface BrandVaultSignalDiagnosticItem {
  path: string;
  group: BrandVaultSignalGroup;
  status: BrandVaultSignalDiagnosticStatus;
  confidence: number;
  trustLevel: BrandSignalTrustLevel;
  authorityClass: BrandSignalEvidence['authorityClass'];
  actionable: boolean;
  evidenceCount: number;
  candidateCount: number;
  valuePreview: string;
  reasons: string[];
  recommendedEvidence: BrandVaultSignalEvidenceNeed[];
}

export interface BrandVaultSignalDiagnosticGroupSummary {
  signalCount: number;
  readyCount: number;
  weakCount: number;
  missingCount: number;
  fallbackCount: number;
  evidenceCount: number;
  candidateCount: number;
}

export interface BrandVaultSignalDiagnosticsSummary {
  signalCount: number;
  readyCount: number;
  weakCount: number;
  missingCount: number;
  fallbackCount: number;
  reviewOnlyCount: number;
  evidenceCount: number;
  candidateCount: number;
  byGroup: Record<BrandVaultSignalGroup, BrandVaultSignalDiagnosticGroupSummary>;
}

export interface BrandVaultSignalDiagnostics {
  summary: BrandVaultSignalDiagnosticsSummary;
  items: BrandVaultSignalDiagnosticItem[];
  priorityItems: BrandVaultSignalDiagnosticItem[];
}

export type BrandVaultIntakeStageStatus =
  | 'complete'
  | 'needs_review'
  | 'needs_auth'
  | 'not_provided'
  | 'skipped'
  | 'failed';

export interface BrandVaultIntakeStageSummary {
  status: BrandVaultIntakeStageStatus;
  providedCount: number;
  sourceCount: number;
  candidateCount: number;
  evidenceCount: number;
  notes: string[];
}

export interface BrandVaultIntakeWebsiteSummary extends BrandVaultIntakeStageSummary {
  normalizedUrl: string;
  crawledPageCount: number;
}

export interface BrandVaultIntakeSocialSummary extends BrandVaultIntakeStageSummary {
  linksProvided: number;
  profileSourceCount: number;
  postSourceCount: number;
  connectedAccountCount: number;
  fetchedPostCount: number;
  publicFallbackPostCount: number;
  needsAuthCount: number;
  skippedCount: number;
  platforms: Array<{
    platform: NonNullable<BrandVaultSourceInput['platform']>;
    status: BrandVaultIntakeStageStatus;
    sourceCount: number;
    postSourceCount: number;
    connectedAccountCount: number;
    fetchedPostCount: number;
    publicFallbackPostCount: number;
    notes: string[];
  }>;
}

export interface BrandVaultIntakeUploadSummary extends BrandVaultIntakeStageSummary {
  guidelineCount: number;
  assetCount: number;
  parsedColorCandidateCount: number;
  parsedTextCandidateCount: number;
  logoCandidateCount: number;
}

export interface BrandVaultReviewEvidenceLane {
  id: 'website' | 'crawl' | 'social' | 'uploads' | 'legacy';
  label: string;
  status: BrandVaultIntakeStageStatus;
  sourceCount: number;
  candidateCount: number;
  evidenceCount: number;
  topSignalPaths: string[];
  notes: string[];
}

export interface BrandVaultReviewNextAction {
  id: 'review_candidates' | 'connect_social' | 'add_pinned_posts' | 'add_uploads' | 'review_crawl' | 'accept_or_reject';
  label: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
}

export interface BrandVaultIntakeSummary {
  website: BrandVaultIntakeWebsiteSummary;
  social: BrandVaultIntakeSocialSummary;
  uploads: BrandVaultIntakeUploadSummary;
  sources: {
    total: number;
    byKind: Partial<Record<BrandVaultSourceInput['kind'], number>>;
    byOrigin: Partial<Record<NonNullable<BrandVaultSourceInput['evidenceOrigin']>, number>>;
    byPlatform: Partial<Record<NonNullable<BrandVaultSourceInput['platform']>, number>>;
  };
  evidenceLanes: BrandVaultReviewEvidenceLane[];
  nextActions: BrandVaultReviewNextAction[];
}

export interface BrandVaultWebsiteDraftReviewPayload {
  jobId: string;
  recordId: string;
  status: BrandRefineryJob['status'];
  brandId?: string;
  userId?: string;
  normalizedUrl: string;
  candidateCount: number;
  evidenceCount: number;
  warnings: string[];
  reviewRequired: boolean;
  reviewReasons: string[];
  generatedAt: string;
  coverage: Record<BrandVaultSignalGroup, BrandVaultSignalGroupCoverage>;
  signalDiagnostics: BrandVaultSignalDiagnostics;
  intake: BrandVaultIntakeSummary;
  visualIdentity: BrandVaultVisualIdentitySummary;
}

export interface BrandVaultWebsiteDraftJobInput {
  userId: string;
  websiteUrl: string;
  brandId?: string;
  companyName?: string;
  socialLinks?: string[];
  sourceEvidence?: BrandVaultSourceInput[];
  jobId?: string;
  profileRecordId?: string;
  actorId?: string;
  now?: string;
}

export interface BrandVaultTextEvidenceCompilerInput {
  jobId: string;
  input: BrandVaultWebsiteDraftJobInput;
  website: BrandWebsiteSnapshot;
  crawlSnapshots: BrandWebsiteSnapshot[];
  sourceEvidence: BrandVaultSourceInput[];
  existingCandidates: BrandEvidenceCandidate[];
  observedAt: string;
}

export interface BrandVaultTextEvidenceCompilerResult {
  candidates: BrandEvidenceCandidate[];
  warnings?: string[];
}

export type BrandVaultTextEvidenceCompiler = (
  input: BrandVaultTextEvidenceCompilerInput,
) => BrandVaultTextEvidenceCompilerResult | Promise<BrandVaultTextEvidenceCompilerResult>;

export type BrandVaultStoreResult<T> = T | Promise<T>;

export interface BrandVaultSignalProfileStore {
  saveRecord(
    record: BrandSignalProfileRecord,
    options?: BrandSignalLifecycleOptions,
  ): BrandVaultStoreResult<BrandSignalProfileRecord>;
  getRecord(id: string): BrandVaultStoreResult<BrandSignalProfileRecord | null>;
  acceptDraft(id: string, options?: BrandSignalLifecycleOptions): BrandVaultStoreResult<BrandSignalProfileRepositoryResult>;
  rejectDraft(
    id: string,
    reason: string,
    options?: BrandSignalLifecycleOptions,
  ): BrandVaultStoreResult<BrandSignalProfileRepositoryResult>;
  getLatestAcceptedProfile(filter: { brandId?: string; userId?: string }): BrandVaultStoreResult<BrandSignalProfile | null>;
}

export interface SynchronousBrandVaultSignalProfileStore extends BrandVaultSignalProfileStore {
  saveRecord(record: BrandSignalProfileRecord, options?: BrandSignalLifecycleOptions): BrandSignalProfileRecord;
  getRecord(id: string): BrandSignalProfileRecord | null;
  acceptDraft(id: string, options?: BrandSignalLifecycleOptions): BrandSignalProfileRepositoryResult;
  rejectDraft(id: string, reason: string, options?: BrandSignalLifecycleOptions): BrandSignalProfileRepositoryResult;
  getLatestAcceptedProfile(filter: { brandId?: string; userId?: string }): BrandSignalProfile | null;
}

export interface BrandVaultWebsiteDraftJobDependencies {
  repository: BrandVaultSignalProfileStore;
  fetchSnapshot?: (websiteUrl: string, options?: FetchWebsiteBrandSnapshotOptions) => Promise<BrandWebsiteSnapshot>;
  fetchOptions?: FetchWebsiteBrandSnapshotOptions;
  websiteOcrProvider?: BrandVaultSocialOcrProvider | null;
  textEvidenceCompiler?: BrandVaultTextEvidenceCompiler;
  visualAssetStorage?: BrandVaultVisualAssetStorageProvider | null;
  clock?: () => string;
}

export type BrandVaultWebsiteDraftJobResult =
  | {
      ok: true;
      job: BrandRefineryJob;
      record: BrandSignalProfileRecord;
      profile: BrandSignalProfile;
      candidates: BrandEvidenceCandidate[];
      normalizedUrl: string;
      warnings: string[];
      reviewPayload: BrandVaultWebsiteDraftReviewPayload;
    }
  | {
      ok: false;
      job: BrandRefineryJob;
      warnings: string[];
      error: {
        code: BrandVaultWebsiteDraftJobErrorCode;
        message: string;
      };
    };

const SOCIAL_LINKS_STAGED_WARNING =
  'Social links without connected post evidence were staged for review; connect read scopes or add pinned posts for richer social language.';
const SOURCE_STAGING_EXTRACTOR = 'brand-vault-source-staging.v1';
const UPLOAD_EXTRACTOR = 'brand-vault-upload-evidence.v1';
const CRAWL_EXTRACTOR = 'brand-vault-crawler.v1';
const SOCIAL_EVIDENCE_EXTRACTOR = 'brand-vault-social-evidence.v1';
const TEXT_EVIDENCE_COMPILER_EXTRACTOR = 'brand-vault-text-evidence-compiler.v1';
const TEXT_EVIDENCE_COMPILER_CONFIDENCE_MAX = 0.68;
const PROMOTABLE_REVIEW_EXTRACTORS = new Set([
  UPLOAD_EXTRACTOR,
  SOCIAL_EVIDENCE_EXTRACTOR,
  CRAWL_EXTRACTOR,
  TEXT_EVIDENCE_COMPILER_EXTRACTOR,
]);
const PROMOTABLE_REVIEW_SIGNAL_PATHS = new Set([
  'palette.supporting',
  'voice.killList',
  'voice.recurringPhrases',
  'voice.hookArchetypes',
  'identity.audience',
  'identity.productServices',
  'identity.proofStyle',
  'voice.ctaDirectness',
]);
const PROMOTED_STRING_ARRAY_LIMITS: Record<string, number> = {
  'palette.supporting': 16,
  'voice.killList': 16,
  'voice.recurringPhrases': 12,
  'voice.hookArchetypes': 12,
  'identity.audience': 8,
  'identity.productServices': 14,
};
const DEFAULT_CRAWL_MAX_PAGES = 24;
const HARD_CRAWL_MAX_PAGES = 60;
const DEFAULT_CRAWL_MAX_DEPTH = 3;
const HARD_CRAWL_MAX_DEPTH = 3;
const SIGNAL_ACTION_CONFIDENCE = BRAND_CONFIDENCE.ACTIONABLE_SIGNAL;
const MAX_SIGNAL_DIAGNOSTIC_PRIORITY_ITEMS = 12;
const DEFAULT_CRAWL_EXCLUDE_PATHS = [
  '/legal',
  '/privacy',
  '/privacy-policy',
  '/terms',
  '/terms-and-conditions',
  '/refund-policy',
  '/cancellation-policy',
  '/login',
  '/sign-in',
  '/signin',
  '/signup',
  '/cart',
  '/checkout',
  '/account',
  '/careers',
  '/jobs',
  '/support',
  '/help',
];

interface CrawlPolicy {
  maxPages: number;
  maxDepth: number;
  includePaths: string[];
  excludePaths: string[];
}

interface CrawlQueueItem {
  url: string;
  depth: number;
  priority: number;
  discoveredFrom: string;
}

interface WebsiteOcrTarget {
  imageUrl: string;
  sourceField: string;
  confidence: number;
}

export async function createBrandVaultWebsiteDraftJob(
  input: BrandVaultWebsiteDraftJobInput,
  dependencies: BrandVaultWebsiteDraftJobDependencies,
): Promise<BrandVaultWebsiteDraftJobResult> {
  const startedAt = resolveNow(input.now, dependencies.clock);
  const socialLinks = input.socialLinks ?? [];
  const sourceEvidence = input.sourceEvidence ?? [];
  const jobId = input.jobId ?? createDefaultJobId(input, input.websiteUrl, startedAt);

  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeBrandWebsiteUrl(input.websiteUrl);
  } catch (error) {
    return failedResult({
      input,
      jobId,
      websiteUrl: input.websiteUrl,
      socialLinks,
      sourceEvidence,
      code: 'invalid_url',
      message: errorMessage(error),
      createdAt: startedAt,
      updatedAt: startedAt,
      warnings: ['Website URL could not be normalized into a supported HTTP(S) URL.'],
    });
  }

  const fetchSnapshotFn = dependencies.fetchSnapshot ?? fetchWebsiteBrandSnapshot;
  let snapshot: BrandWebsiteSnapshot;
  try {
    snapshot = await fetchSnapshotFn(normalizedUrl, {
      ...dependencies.fetchOptions,
      now: startedAt,
    });
  } catch (error) {
    return failedResult({
      input,
      jobId,
      websiteUrl: normalizedUrl,
      socialLinks,
      sourceEvidence,
      code: 'fetch_failed',
      message: errorMessage(error),
      createdAt: startedAt,
      updatedAt: resolveNow(input.now, dependencies.clock),
      warnings: [`Website fetch failed; Brand Vault could not create a website evidence draft. ${errorMessage(error)}`],
    });
  }

  try {
    const websiteOcr = await enrichWebsiteSnapshotWithImageOcr({
      snapshot,
      provider: resolveWebsiteOcrProvider(dependencies),
    });
    snapshot = websiteOcr.snapshot;
    const crawl = await fetchCrawlSnapshots({
      root: snapshot,
      sourceEvidence,
      fetchSnapshot: fetchSnapshotFn,
      fetchOptions: dependencies.fetchOptions,
      now: startedAt,
    });
    const draft = createWebsiteBrandSignalProfileDraft(
      {
        websiteUrl: snapshot.normalizedUrl,
        html: snapshot.html,
        stylesheets: snapshot.stylesheets,
        supplementalText: snapshot.supplementalText,
        renderedPrimitives: snapshot.renderedPrimitives,
        brandId: input.brandId,
        userId: input.userId,
        companyName: input.companyName,
        fetchedAt: snapshot.fetchedAt,
        jobId,
      },
      {
        id: input.profileRecordId ?? `${jobId}_profile`,
        now: snapshot.fetchedAt,
        actorId: input.actorId,
      },
    );
    const assetProbe = await verifyWebsiteBrandAssetCandidates(draft.candidates, {
      ...dependencies.fetchOptions,
      allowDefaultFetch: !dependencies.fetchSnapshot,
    });
    const stagedCandidates = createStagedSourceCandidates({
      input,
      jobId,
      socialLinks,
      sourceEvidence,
      observedAt: snapshot.fetchedAt,
    });
    const crawlCandidates = createCrawlCandidates({
      input,
      jobId,
      snapshots: crawl.snapshots,
      observedAt: snapshot.fetchedAt,
    });
    const baseCandidates = [...assetProbe.candidates, ...stagedCandidates, ...crawlCandidates];
    const compiled = await runTextEvidenceCompiler({
      compiler: dependencies.textEvidenceCompiler,
      jobId,
      input,
      website: snapshot,
      crawlSnapshots: crawl.snapshots,
      sourceEvidence,
      existingCandidates: baseCandidates,
      observedAt: snapshot.fetchedAt,
    });
    const enrichedRecord = applyReviewCandidatesToDraftRecord(
      draft.record,
      [...stagedCandidates, ...crawlCandidates, ...compiled.candidates],
      snapshot.fetchedAt,
    );
    const savedRecord = await dependencies.repository.saveRecord(enrichedRecord, {
      now: snapshot.fetchedAt,
      actorId: input.actorId,
    });
    const candidates = [...baseCandidates, ...compiled.candidates];
    const baseWarnings = mergeWarnings(
      draft.warnings,
      stylesheetWarningsForSnapshots([snapshot, ...crawl.snapshots]),
      websiteOcr.warnings,
      assetProbe.warnings,
      compiled.warnings ?? [],
      crawl.warnings,
      shouldWarnForStagedSocialLinks(socialLinks, sourceEvidence) ? [SOCIAL_LINKS_STAGED_WARNING] : [],
      stagedCandidates.length > 0 ? [stagedSourcesWarning(stagedCandidates.length)] : [],
    );
    let job = createJob({
      input,
      jobId,
      status: 'needs_review',
      websiteUrl: draft.normalizedUrl,
      socialLinks,
      sourceEvidence,
      warnings: baseWarnings,
      createdAt: startedAt,
      updatedAt: snapshot.fetchedAt,
    });
    const visualAssets = await mirrorBrandVaultVisualIdentityAssets({
      visualIdentity: createBrandVaultVisualIdentitySummary({
        profile: savedRecord.profile,
        candidates,
        sourceEvidence: job.inputs.sourceEvidence ?? [],
      }),
      job,
      provider: dependencies.visualAssetStorage,
    });
    if (visualAssets.warnings.length > 0) {
      job = {
        ...job,
        warnings: mergeWarnings(job.warnings, visualAssets.warnings),
      };
    }
    const reviewPayload = createBrandVaultDraftReviewPayload({
      job,
      record: savedRecord,
      candidates,
      normalizedUrl: draft.normalizedUrl,
      warnings: job.warnings,
      visualIdentity: visualAssets.visualIdentity,
    });

    return {
      ok: true,
      job,
      record: savedRecord,
      profile: savedRecord.profile,
      candidates,
      normalizedUrl: draft.normalizedUrl,
      warnings: job.warnings,
      reviewPayload,
    };
  } catch (error) {
    return failedResult({
      input,
      jobId,
      websiteUrl: snapshot.normalizedUrl,
      socialLinks,
      sourceEvidence,
      code: 'draft_creation_failed',
      message: errorMessage(error),
      createdAt: startedAt,
      updatedAt: snapshot.fetchedAt,
      warnings: ['Website evidence was fetched, but Brand Vault could not create a review draft.'],
    });
  }
}

export function createBrandVaultDraftReviewPayload(args: {
  job: BrandRefineryJob;
  record: BrandSignalProfileRecord;
  candidates: BrandEvidenceCandidate[];
  normalizedUrl: string;
  warnings?: string[];
  visualIdentity?: BrandVaultVisualIdentitySummary;
}): BrandVaultWebsiteDraftReviewPayload {
  return {
    jobId: args.job.id,
    recordId: args.record.id,
    status: args.job.status,
    brandId: args.record.profile.brandId,
    userId: args.record.profile.userId,
    normalizedUrl: args.normalizedUrl,
    candidateCount: args.candidates.length,
    evidenceCount: args.record.profile.evidence.length,
    warnings: args.warnings ?? [],
    reviewRequired: args.record.review.required,
    reviewReasons: args.record.review.reasons,
    generatedAt: args.record.profile.generatedAt,
    coverage: createSignalCoverage(args.record.profile),
    signalDiagnostics: createSignalDiagnostics(args.record.profile, args.candidates),
    intake: createIntakeSummary({
      job: args.job,
      profile: args.record.profile,
      candidates: args.candidates,
      normalizedUrl: args.normalizedUrl,
      warnings: args.warnings ?? [],
      reviewRequired: args.record.review.required,
    }),
    visualIdentity: args.visualIdentity ?? createBrandVaultVisualIdentitySummary({
      profile: args.record.profile,
      candidates: args.candidates,
      sourceEvidence: args.job.inputs.sourceEvidence ?? [],
    }),
  };
}

export function acceptBrandVaultSignalProfileDraft(
  repository: SynchronousBrandVaultSignalProfileStore,
  recordId: string,
  options: BrandSignalLifecycleOptions = {},
): BrandSignalProfileRepositoryResult {
  return repository.acceptDraft(recordId, options);
}

export function rejectBrandVaultSignalProfileDraft(
  repository: SynchronousBrandVaultSignalProfileStore,
  recordId: string,
  reason: string,
  options: BrandSignalLifecycleOptions = {},
): BrandSignalProfileRepositoryResult {
  return repository.rejectDraft(recordId, reason, options);
}

export function getLatestAcceptedBrandVaultProfile(
  repository: SynchronousBrandVaultSignalProfileStore,
  filter: { brandId?: string; userId?: string },
): BrandSignalProfile | null {
  return repository.getLatestAcceptedProfile(filter);
}

function createSignalCoverage(profile: BrandSignalProfile): Record<BrandVaultSignalGroup, BrandVaultSignalGroupCoverage> {
  const signals = collectBrandSignals(profile);
  return {
    identity: coverageForGroup(profile, signals, 'identity'),
    palette: coverageForGroup(profile, signals, 'palette'),
    typography: coverageForGroup(profile, signals, 'typography'),
    visual: coverageForGroup(profile, signals, 'visual'),
    motion: coverageForGroup(profile, signals, 'motion'),
    voice: coverageForGroup(profile, signals, 'voice'),
  };
}

function coverageForGroup(
  profile: BrandSignalProfile,
  signals: ReturnType<typeof collectBrandSignals>,
  group: BrandVaultSignalGroup,
): BrandVaultSignalGroupCoverage {
  const prefix = `${group}.`;
  const groupSignals = signals.filter((item) => item.path.startsWith(prefix));
  return {
    signalCount: groupSignals.length,
    actionableSignalCount: groupSignals.filter((item) => isBrandSignalActionable(item.signal)).length,
    evidenceCount: profile.evidence.filter((item) => item.signalPath.startsWith(prefix)).length,
  };
}

function createSignalDiagnostics(
  profile: BrandSignalProfile,
  candidates: BrandEvidenceCandidate[],
): BrandVaultSignalDiagnostics {
  const evidenceById = new Map(profile.evidence.map((item) => [item.id, item]));
  const candidateCounts = countCandidatesBySignalPath(candidates);
  const items = collectBrandSignals(profile).map(({ path, signal }) => {
    const evidenceCount = signal.evidenceIds.filter((id) => evidenceById.has(id)).length;
    const candidateCount = candidateCounts.get(path) ?? 0;
    const group = signalGroupForPath(path);
    const actionable = isBrandSignalActionable(signal, SIGNAL_ACTION_CONFIDENCE);
    const status = diagnosticStatusForSignal(signal, actionable);
    const reasons = diagnosticReasons({ signal, status, actionable, evidenceCount, candidateCount });
    return {
      path,
      group,
      status,
      confidence: signal.confidence,
      trustLevel: signal.trustLevel,
      authorityClass: signal.authorityClass,
      actionable,
      evidenceCount,
      candidateCount,
      valuePreview: signalValuePreview(signal.value),
      reasons,
      recommendedEvidence: recommendedEvidenceForSignal(path, group, status),
    };
  });
  return {
    summary: signalDiagnosticSummary(items),
    items,
    priorityItems: items
      .filter((item) => item.status !== 'ready')
      .sort(compareSignalDiagnostics)
      .slice(0, MAX_SIGNAL_DIAGNOSTIC_PRIORITY_ITEMS),
  };
}

function countCandidatesBySignalPath(candidates: BrandEvidenceCandidate[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const candidate of candidates) counts.set(candidate.signalPath, (counts.get(candidate.signalPath) ?? 0) + 1);
  return counts;
}

function signalGroupForPath(path: string): BrandVaultSignalGroup {
  const group = path.split('.', 1)[0];
  if (group === 'identity' || group === 'palette' || group === 'typography' || group === 'visual' || group === 'motion' || group === 'voice') {
    return group;
  }
  return 'identity';
}

function diagnosticStatusForSignal(
  signal: BrandSignal<unknown>,
  actionable: boolean,
): BrandVaultSignalDiagnosticStatus {
  if (signal.trustLevel === 'fallback_default') return 'fallback';
  if (isMissingSignalValue(signal.value)) return 'missing';
  if (!actionable || signal.confidence < SIGNAL_ACTION_CONFIDENCE) return 'weak';
  return 'ready';
}

function isMissingSignalValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (value === 'unknown') return true;
  return Array.isArray(value) && value.length === 0;
}

function diagnosticReasons(args: {
  signal: BrandSignal<unknown>;
  status: BrandVaultSignalDiagnosticStatus;
  actionable: boolean;
  evidenceCount: number;
  candidateCount: number;
}): string[] {
  const reasons: string[] = [];
  if (args.status === 'fallback') {
    reasons.push(args.signal.fallbackReason ?? 'Signal is still using fallback/default evidence.');
  }
  if (args.status === 'missing') {
    reasons.push('No concrete value was found for this signal.');
  }
  if (args.status === 'weak') {
    reasons.push(`Confidence ${formatConfidence(args.signal.confidence)} is below the ${formatConfidence(SIGNAL_ACTION_CONFIDENCE)} action threshold.`);
  }
  if (!args.actionable && args.status !== 'fallback') {
    reasons.push('Signal is review-only until stronger evidence is provided.');
  }
  if (args.evidenceCount === 0) {
    reasons.push('No linked profile evidence was found for this signal.');
  }
  if (args.candidateCount === 0) {
    reasons.push('No review candidate currently maps to this signal.');
  }
  return [...new Set(reasons)];
}

function recommendedEvidenceForSignal(
  path: string,
  group: BrandVaultSignalGroup,
  status: BrandVaultSignalDiagnosticStatus,
): BrandVaultSignalEvidenceNeed[] {
  if (status === 'ready') return [];
  if (path === 'voice.killList') return ['brand_uploads', 'manual_review'];
  if (path === 'voice.hookArchetypes') return ['connected_social', 'pinned_posts', 'prior_examples'];
  if (path === 'identity.proofStyle') return ['website_crawl', 'connected_social', 'pinned_posts'];
  if (group === 'palette' || group === 'typography') return ['brand_uploads', 'visual_scan'];
  if (group === 'visual') return ['visual_scan', 'brand_uploads', 'prior_examples'];
  if (group === 'motion') return ['visual_scan', 'prior_examples', 'brand_uploads'];
  if (group === 'voice') return ['connected_social', 'pinned_posts', 'brand_uploads', 'prior_examples'];
  return ['website_crawl', 'brand_uploads', 'manual_review'];
}

function signalDiagnosticSummary(items: BrandVaultSignalDiagnosticItem[]): BrandVaultSignalDiagnosticsSummary {
  const byGroup = emptySignalDiagnosticGroups();
  for (const item of items) {
    const group = byGroup[item.group];
    group.signalCount += 1;
    group.evidenceCount += item.evidenceCount;
    group.candidateCount += item.candidateCount;
    if (item.status === 'ready') group.readyCount += 1;
    if (item.status === 'weak') group.weakCount += 1;
    if (item.status === 'missing') group.missingCount += 1;
    if (item.status === 'fallback') group.fallbackCount += 1;
  }
  const readyCount = items.filter((item) => item.status === 'ready').length;
  const weakCount = items.filter((item) => item.status === 'weak').length;
  const missingCount = items.filter((item) => item.status === 'missing').length;
  const fallbackCount = items.filter((item) => item.status === 'fallback').length;
  return {
    signalCount: items.length,
    readyCount,
    weakCount,
    missingCount,
    fallbackCount,
    reviewOnlyCount: weakCount + missingCount + fallbackCount,
    evidenceCount: items.reduce((sum, item) => sum + item.evidenceCount, 0),
    candidateCount: items.reduce((sum, item) => sum + item.candidateCount, 0),
    byGroup,
  };
}

function emptySignalDiagnosticGroups(): Record<BrandVaultSignalGroup, BrandVaultSignalDiagnosticGroupSummary> {
  return {
    identity: emptySignalDiagnosticGroup(),
    palette: emptySignalDiagnosticGroup(),
    typography: emptySignalDiagnosticGroup(),
    visual: emptySignalDiagnosticGroup(),
    motion: emptySignalDiagnosticGroup(),
    voice: emptySignalDiagnosticGroup(),
  };
}

function emptySignalDiagnosticGroup(): BrandVaultSignalDiagnosticGroupSummary {
  return {
    signalCount: 0,
    readyCount: 0,
    weakCount: 0,
    missingCount: 0,
    fallbackCount: 0,
    evidenceCount: 0,
    candidateCount: 0,
  };
}

function compareSignalDiagnostics(
  left: BrandVaultSignalDiagnosticItem,
  right: BrandVaultSignalDiagnosticItem,
): number {
  return diagnosticSeverityRank(right.status) - diagnosticSeverityRank(left.status) ||
    left.confidence - right.confidence ||
    right.evidenceCount - left.evidenceCount ||
    left.path.localeCompare(right.path);
}

function diagnosticSeverityRank(status: BrandVaultSignalDiagnosticStatus): number {
  if (status === 'fallback') return 3;
  if (status === 'missing') return 2;
  if (status === 'weak') return 1;
  return 0;
}

function signalValuePreview(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return 'No value found';
    return sanitizeEvidenceExcerpt(value.slice(0, 5).map(String).join(', '), 160);
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value.toFixed(2) : 'No value found';
  if (typeof value === 'string') return sanitizeEvidenceExcerpt(value || 'No value found', 160);
  if (value === undefined || value === null) return 'No value found';
  return sanitizeEvidenceExcerpt(JSON.stringify(value), 160);
}

function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function createIntakeSummary(args: {
  job: BrandRefineryJob;
  profile: BrandSignalProfile;
  candidates: BrandEvidenceCandidate[];
  normalizedUrl: string;
  warnings: string[];
  reviewRequired: boolean;
}): BrandVaultIntakeSummary {
  const sourceEvidence = args.job.inputs.sourceEvidence ?? [];
  const websiteCandidates = args.candidates.filter((candidate) => isWebsiteCandidate(candidate) && !isCrawlCandidate(candidate));
  const crawlCandidates = args.candidates.filter(isCrawlCandidate);
  const crawlPageCandidates = crawlCandidates.filter(isCrawlPageCandidate);
  const socialSources = sourceEvidence.filter((source) => source.kind === 'social_profile' || source.kind === 'social_post');
  const socialCandidates = args.candidates.filter((candidate) => candidate.sourceType === 'social_profile' || candidate.sourceType === 'social_post');
  const uploadSources = sourceEvidence.filter((source) => source.kind === 'uploaded_guideline' || source.kind === 'uploaded_asset');
  const uploadCandidates = args.candidates.filter((candidate) => candidate.sourceType === 'uploaded_guideline' || candidate.sourceType === 'uploaded_asset');
  const uploadExtractorCandidates = uploadCandidates.filter((candidate) => candidate.extractorId === UPLOAD_EXTRACTOR);
  const legacyCandidates = args.candidates.filter((candidate) => candidate.sourceType === 'legacy_brand_intelligence');
  const websiteEvidenceCount = args.profile.evidence.filter(isRootWebsiteProfileEvidence).length;
  const websiteStatus: BrandVaultIntakeStageStatus = args.job.status === 'failed' ? 'failed' : 'complete';
  const social = createSocialIntakeSummary({
    socialLinks: args.job.inputs.socialLinks,
    sources: socialSources,
    candidates: socialCandidates,
    warnings: args.warnings,
  });
  const uploads = createUploadIntakeSummary({
    sources: uploadSources,
    candidates: uploadCandidates,
    uploadExtractorCandidates,
  });
  const evidenceLanes = [
    createEvidenceLane({
      id: 'website',
      label: 'Website',
      status: websiteStatus,
      sourceCount: args.normalizedUrl ? 1 : 0,
      candidates: websiteCandidates,
      evidenceCount: websiteEvidenceCount,
      notes: [`Fetched ${args.normalizedUrl}.`],
    }),
    createEvidenceLane({
      id: 'crawl',
      label: 'Crawled Pages',
      status: crawlPageCandidates.length > 0 ? 'complete' : 'skipped',
      sourceCount: crawlPageCandidates.length,
      candidates: crawlCandidates,
      evidenceCount: crawlCandidates.length,
      notes: crawlPageCandidates.length > 0
        ? [`Crawled ${crawlPageCandidates.length} additional page${crawlPageCandidates.length === 1 ? '' : 's'} and extracted ${crawlCandidates.length} page-level candidate${crawlCandidates.length === 1 ? '' : 's'}.`]
        : [],
    }),
    createEvidenceLane({
      id: 'social',
      label: 'Social Evidence',
      status: social.status,
      sourceCount: social.sourceCount,
      candidates: socialCandidates,
      evidenceCount: social.postSourceCount + social.profileSourceCount,
      notes: social.notes,
    }),
    createEvidenceLane({
      id: 'uploads',
      label: 'Uploads',
      status: uploads.status,
      sourceCount: uploads.sourceCount,
      candidates: uploadCandidates,
      evidenceCount: uploadExtractorCandidates.length,
      notes: uploads.notes,
    }),
    createEvidenceLane({
      id: 'legacy',
      label: 'Legacy Intelligence',
      status: legacyCandidates.length > 0 ? 'needs_review' : 'not_provided',
      sourceCount: sourceEvidence.filter((source) => source.kind === 'legacy_brand_intelligence').length,
      candidates: legacyCandidates,
      evidenceCount: legacyCandidates.length,
      notes: legacyCandidates.length > 0 ? ['Legacy Brand Intelligence was staged as supporting context.'] : [],
    }),
  ];

  return {
    website: {
      status: websiteStatus,
      normalizedUrl: args.normalizedUrl,
      providedCount: args.normalizedUrl ? 1 : 0,
      sourceCount: 1,
      candidateCount: websiteCandidates.length,
      evidenceCount: websiteEvidenceCount,
      crawledPageCount: crawlPageCandidates.length,
      notes: [`Website evidence fetched from ${args.normalizedUrl}.`],
    },
    social,
    uploads,
    sources: {
      total: sourceEvidence.length,
      byKind: countBy(sourceEvidence, (source) => source.kind),
      byOrigin: countBy(sourceEvidence, (source) => source.evidenceOrigin),
      byPlatform: countBy(sourceEvidence, (source) => source.platform),
    },
    evidenceLanes,
    nextActions: createNextActions({
      reviewRequired: args.reviewRequired,
      social,
      uploads,
      crawlCount: crawlPageCandidates.length,
    }),
  };
}

function createSocialIntakeSummary(args: {
  socialLinks: string[];
  sources: BrandVaultSourceInput[];
  candidates: BrandEvidenceCandidate[];
  warnings: string[];
}): BrandVaultIntakeSocialSummary {
  const profileSourceCount = args.sources.filter((source) => source.kind === 'social_profile').length;
  const postSourceCount = args.sources.filter((source) => source.kind === 'social_post').length;
  const connectedAccountCount = args.sources.filter((source) => source.connection?.status === 'connected').length;
  const fetchedPostCount = args.sources.filter((source) => source.kind === 'social_post' && source.evidenceOrigin === 'connected_fetch').length;
  const publicFallbackPostCount = args.sources.filter((source) => source.kind === 'social_post' && source.evidenceOrigin === 'public_fallback').length;
  const socialWarnings = args.warnings.filter(isSocialWarning);
  const needsAuthCount = args.sources.filter((source) =>
    source.connection?.status === 'scope_missing' || source.connection?.status === 'connected_different_account',
  ).length + socialWarnings.filter(isAuthWarning).length;
  const skippedCount = socialWarnings.filter((warning) => /\bskipped\b/i.test(warning)).length;
  const status = socialStatus({
    linksProvided: args.socialLinks.length,
    sourceCount: args.sources.length,
    fetchedPostCount,
    publicFallbackPostCount,
    connectedAccountCount,
    needsAuthCount,
  });
  const notes = socialNotes({
    linksProvided: args.socialLinks.length,
    connectedAccountCount,
    fetchedPostCount,
    publicFallbackPostCount,
    needsAuthCount,
    skippedCount,
  });

  return {
    status,
    providedCount: args.socialLinks.length,
    sourceCount: args.sources.length,
    candidateCount: args.candidates.length,
    evidenceCount: profileSourceCount + postSourceCount,
    notes,
    linksProvided: args.socialLinks.length,
    profileSourceCount,
    postSourceCount,
    connectedAccountCount,
    fetchedPostCount,
    publicFallbackPostCount,
    needsAuthCount,
    skippedCount,
    platforms: createSocialPlatformSummaries(args.socialLinks, args.sources),
  };
}

function createUploadIntakeSummary(args: {
  sources: BrandVaultSourceInput[];
  candidates: BrandEvidenceCandidate[];
  uploadExtractorCandidates: BrandEvidenceCandidate[];
}): BrandVaultIntakeUploadSummary {
  const guidelineCount = args.sources.filter((source) => source.kind === 'uploaded_guideline').length;
  const assetCount = args.sources.filter((source) => source.kind === 'uploaded_asset').length;
  const parsedColorCandidateCount = args.uploadExtractorCandidates.filter((candidate) => candidate.sourceField.endsWith('.colors')).length;
  const parsedTextCandidateCount = args.uploadExtractorCandidates.filter((candidate) =>
    candidate.sourceField.endsWith('.brandRules') || candidate.sourceField.endsWith('.voiceGuidelines'),
  ).length;
  const logoCandidateCount = args.uploadExtractorCandidates.filter((candidate) => candidate.sourceField.endsWith('.logoAsset')).length;
  const status: BrandVaultIntakeStageStatus =
    args.sources.length === 0 ? 'not_provided' : args.uploadExtractorCandidates.length > 0 ? 'complete' : 'needs_review';
  const notes =
    args.sources.length === 0
      ? ['No brand books, docs, PDFs, images, or assets were uploaded for this draft.']
      : [`Parsed ${args.uploadExtractorCandidates.length} upload-derived candidate${args.uploadExtractorCandidates.length === 1 ? '' : 's'}.`];
  return {
    status,
    providedCount: args.sources.length,
    sourceCount: args.sources.length,
    candidateCount: args.candidates.length,
    evidenceCount: args.uploadExtractorCandidates.length,
    notes,
    guidelineCount,
    assetCount,
    parsedColorCandidateCount,
    parsedTextCandidateCount,
    logoCandidateCount,
  };
}

function createSocialPlatformSummaries(
  socialLinks: string[],
  sources: BrandVaultSourceInput[],
): BrandVaultIntakeSocialSummary['platforms'] {
  const platforms = new Set<NonNullable<BrandVaultSourceInput['platform']>>();
  for (const link of socialLinks) {
    const platform = inferSourcePlatform(link);
    if (platform) platforms.add(platform);
  }
  for (const source of sources) {
    if (source.platform) platforms.add(source.platform);
  }
  return [...platforms].sort().map((platform) => {
    const platformSources = sources.filter((source) => source.platform === platform);
    const connectedAccountCount = platformSources.filter((source) => source.connection?.status === 'connected').length;
    const fetchedPostCount = platformSources.filter((source) => source.kind === 'social_post' && source.evidenceOrigin === 'connected_fetch').length;
    const publicFallbackPostCount = platformSources.filter((source) => source.kind === 'social_post' && source.evidenceOrigin === 'public_fallback').length;
    const needsAuthCount = platformSources.filter((source) =>
      source.connection?.status === 'scope_missing' || source.connection?.status === 'connected_different_account',
    ).length;
    const postSourceCount = platformSources.filter((source) => source.kind === 'social_post').length;
    return {
      platform,
      status: socialStatus({
        linksProvided: socialLinks.some((link) => inferSourcePlatform(link) === platform) ? 1 : 0,
        sourceCount: platformSources.length,
        fetchedPostCount,
        publicFallbackPostCount,
        connectedAccountCount,
        needsAuthCount,
      }),
      sourceCount: platformSources.length,
      postSourceCount,
      connectedAccountCount,
      fetchedPostCount,
      publicFallbackPostCount,
      notes: socialNotes({
        linksProvided: socialLinks.some((link) => inferSourcePlatform(link) === platform) ? 1 : 0,
        connectedAccountCount,
        fetchedPostCount,
        publicFallbackPostCount,
        needsAuthCount,
        skippedCount: 0,
      }),
    };
  });
}

function createEvidenceLane(args: {
  id: BrandVaultReviewEvidenceLane['id'];
  label: string;
  status: BrandVaultIntakeStageStatus;
  sourceCount: number;
  candidates: BrandEvidenceCandidate[];
  evidenceCount: number;
  notes: string[];
}): BrandVaultReviewEvidenceLane {
  return {
    id: args.id,
    label: args.label,
    status: args.status,
    sourceCount: args.sourceCount,
    candidateCount: args.candidates.length,
    evidenceCount: args.evidenceCount,
    topSignalPaths: topValues(args.candidates.map((candidate) => candidate.signalPath), 5),
    notes: args.notes,
  };
}

function createNextActions(args: {
  reviewRequired: boolean;
  social: BrandVaultIntakeSocialSummary;
  uploads: BrandVaultIntakeUploadSummary;
  crawlCount: number;
}): BrandVaultReviewNextAction[] {
  const actions: BrandVaultReviewNextAction[] = [];
  if (args.reviewRequired) {
    actions.push({
      id: 'review_candidates',
      label: 'Review draft brand signals',
      priority: 'high',
      reason: 'Brand Vault produced candidate signals that need approval before becoming reusable brand truth.',
    });
  }
  if (args.social.needsAuthCount > 0 || (args.social.linksProvided > 0 && args.social.fetchedPostCount === 0)) {
    actions.push({
      id: 'connect_social',
      label: 'Connect or refresh social read access',
      priority: 'medium',
      reason: args.social.publicFallbackPostCount > 0
        ? 'Public social evidence is staged for review; connected read access would make account-matched posts trusted enough for generation.'
        : 'Social links are present, but Brand Vault does not yet have enough connected post evidence from every linked account.',
    });
  }
  if (args.social.linksProvided > 0 && args.social.fetchedPostCount === 0 && args.social.publicFallbackPostCount === 0) {
    actions.push({
      id: 'add_pinned_posts',
      label: 'Add pinned posts or examples',
      priority: 'medium',
      reason: 'Pinned social posts give stronger voice and proof-pattern evidence than profile URLs alone.',
    });
  }
  if (args.uploads.status === 'not_provided') {
    actions.push({
      id: 'add_uploads',
      label: 'Add brand books, docs, PDFs, or assets',
      priority: 'low',
      reason: 'Official uploads improve color, logo, voice, and constraint evidence.',
    });
  }
  if (args.crawlCount > 0) {
    actions.push({
      id: 'review_crawl',
      label: 'Review crawled pages',
      priority: 'low',
      reason: 'Crawled pages can include useful proof and positioning evidence, but should be checked for relevance.',
    });
  }
  actions.push({
    id: 'accept_or_reject',
    label: 'Accept, edit, or reject the draft',
    priority: args.reviewRequired ? 'high' : 'medium',
    reason: 'The approved Brand Vault profile is what downstream generation should consume.',
  });
  return dedupeActions(actions);
}

function socialStatus(args: {
  linksProvided: number;
  sourceCount: number;
  fetchedPostCount: number;
  publicFallbackPostCount: number;
  connectedAccountCount: number;
  needsAuthCount: number;
}): BrandVaultIntakeStageStatus {
  if (args.linksProvided === 0 && args.sourceCount === 0) return 'not_provided';
  if (args.fetchedPostCount > 0) return 'complete';
  if (args.publicFallbackPostCount > 0) return 'needs_review';
  if (args.needsAuthCount > 0 || (args.linksProvided > 0 && args.connectedAccountCount === 0)) return 'needs_auth';
  if (args.sourceCount > 0 || args.connectedAccountCount > 0) return 'needs_review';
  return 'skipped';
}

function socialNotes(args: {
  linksProvided: number;
  connectedAccountCount: number;
  fetchedPostCount: number;
  publicFallbackPostCount: number;
  needsAuthCount: number;
  skippedCount: number;
}): string[] {
  const notes: string[] = [];
  if (args.linksProvided > 0) notes.push(`${args.linksProvided} social link${args.linksProvided === 1 ? '' : 's'} provided.`);
  if (args.connectedAccountCount > 0) notes.push(`${args.connectedAccountCount} connected social source${args.connectedAccountCount === 1 ? '' : 's'} found.`);
  if (args.fetchedPostCount > 0) notes.push(`${args.fetchedPostCount} connected post sample${args.fetchedPostCount === 1 ? '' : 's'} fetched.`);
  if (args.publicFallbackPostCount > 0) {
    notes.push(`${args.publicFallbackPostCount} public fallback post sample${args.publicFallbackPostCount === 1 ? '' : 's'} staged for review.`);
  }
  if (args.publicFallbackPostCount > 0 && args.fetchedPostCount === 0) {
    notes.push('Connect matching social read access to promote reviewed public evidence into trusted account-matched evidence.');
  }
  if (args.needsAuthCount > 0) notes.push(`${args.needsAuthCount} social source${args.needsAuthCount === 1 ? '' : 's'} need auth, scopes, or account matching.`);
  if (args.skippedCount > 0) notes.push(`${args.skippedCount} social enrichment step${args.skippedCount === 1 ? '' : 's'} skipped.`);
  if (notes.length === 0) notes.push('No social evidence was provided for this draft.');
  return notes;
}

function shouldWarnForStagedSocialLinks(socialLinks: string[], sourceEvidence: BrandVaultSourceInput[]): boolean {
  if (socialLinks.length === 0) return false;
  return !sourceEvidence.some((source) =>
    source.kind === 'social_post' && (source.evidenceOrigin === 'connected_fetch' || source.evidenceOrigin === 'public_fallback'),
  );
}

function isWebsiteCandidate(candidate: BrandEvidenceCandidate): boolean {
  return isWebsiteEvidenceSource(candidate.sourceType);
}

function isCrawlCandidate(candidate: BrandEvidenceCandidate): boolean {
  return candidate.extractorId === CRAWL_EXTRACTOR || candidate.sourceField === 'crawl.page';
}

function isCrawlPageCandidate(candidate: BrandEvidenceCandidate): boolean {
  return candidate.extractorId === CRAWL_EXTRACTOR && candidate.sourceField === 'crawl.page';
}

function isCrawlProfileEvidence(evidence: BrandSignalEvidence): boolean {
  return evidence.extractor === CRAWL_EXTRACTOR || (evidence.sourceField ?? '').startsWith('crawl.page');
}

function isWebsiteEvidenceSource(sourceType: string): boolean {
  return ['website', 'website_metadata', 'json_ld', 'css', 'logo_asset'].includes(sourceType);
}

function isWebsiteProfileEvidenceSource(sourceType: string): boolean {
  return sourceType === 'first_party_website' || isWebsiteEvidenceSource(sourceType);
}

function isRootWebsiteProfileEvidence(evidence: BrandSignalEvidence): boolean {
  return isWebsiteProfileEvidenceSource(evidence.sourceType) && !isCrawlProfileEvidence(evidence);
}

function isAuthWarning(warning: string): boolean {
  return /\b(?:auth|scope|permission|token|connect|reconnect|expired|account)\b/i.test(warning);
}

function isSocialWarning(warning: string): boolean {
  if (/\bcrawler\b/i.test(warning)) return false;
  return /\b(?:social|uploaderx|x post|x api|twitter|linkedin|instagram|facebook|youtube|apify|token|scope|account|pinned)\b/i.test(warning);
}

function topValues(values: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value]) => value);
}

function countBy<TKey extends string>(
  values: BrandVaultSourceInput[],
  selectKey: (value: BrandVaultSourceInput) => TKey | undefined,
): Partial<Record<TKey, number>> {
  const counts: Partial<Record<TKey, number>> = {};
  for (const value of values) {
    const key = selectKey(value);
    if (!key) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function dedupeActions(actions: BrandVaultReviewNextAction[]): BrandVaultReviewNextAction[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    if (seen.has(action.id)) return false;
    seen.add(action.id);
    return true;
  });
}

function failedResult(args: {
  input: BrandVaultWebsiteDraftJobInput;
  jobId: string;
  websiteUrl: string;
  socialLinks: string[];
  sourceEvidence: BrandVaultSourceInput[];
  code: BrandVaultWebsiteDraftJobErrorCode;
  message: string;
  warnings: string[];
  createdAt: string;
  updatedAt: string;
}): BrandVaultWebsiteDraftJobResult {
  const job = createJob({
    input: args.input,
    jobId: args.jobId,
    status: 'failed',
    websiteUrl: args.websiteUrl,
    socialLinks: args.socialLinks,
    sourceEvidence: args.sourceEvidence,
    warnings: args.warnings,
    createdAt: args.createdAt,
    updatedAt: args.updatedAt,
  });
  return {
    ok: false,
    job,
    warnings: args.warnings,
    error: {
      code: args.code,
      message: args.message,
    },
  };
}

function createJob(args: {
  input: BrandVaultWebsiteDraftJobInput;
  jobId: string;
  status: BrandRefineryJob['status'];
  websiteUrl: string;
  socialLinks: string[];
  sourceEvidence: BrandVaultSourceInput[];
  warnings: string[];
  createdAt: string;
  updatedAt: string;
}): BrandRefineryJob {
  return {
    id: args.jobId,
    userId: args.input.userId,
    brandId: args.input.brandId,
    status: args.status,
    inputs: {
      websiteUrl: args.websiteUrl,
      companyName: args.input.companyName,
      socialLinks: args.socialLinks,
      sourceEvidence: args.sourceEvidence,
    },
    warnings: args.warnings,
    createdAt: args.createdAt,
    updatedAt: args.updatedAt,
  };
}

async function fetchCrawlSnapshots(args: {
  root: BrandWebsiteSnapshot;
  sourceEvidence: BrandVaultSourceInput[];
  fetchSnapshot: (websiteUrl: string, options?: FetchWebsiteBrandSnapshotOptions) => Promise<BrandWebsiteSnapshot>;
  fetchOptions?: FetchWebsiteBrandSnapshotOptions;
  now: string;
}): Promise<{ snapshots: BrandWebsiteSnapshot[]; warnings: string[] }> {
  const crawlSeeds = args.sourceEvidence.filter((source) => source.kind === 'crawl_seed');
  const policy = resolveCrawlPolicy(crawlSeeds);
  const rootUrl = new URL(args.root.normalizedUrl);
  const visited = new Set<string>([args.root.normalizedUrl]);
  const queue = new Map<string, CrawlQueueItem>();
  const snapshots: BrandWebsiteSnapshot[] = [];
  const warnings: string[] = [];

  enqueueDefaultBrandPages(queue, rootUrl, policy, args.root.normalizedUrl);
  for (const seed of crawlSeeds) {
    if (seed.url) enqueueCrawlUrl(queue, seed.url, rootUrl, policy, 0, args.root.normalizedUrl, true);
  }
  enqueueSitemapUrls(queue, args.root.html, rootUrl, policy, args.root.normalizedUrl);
  if (policy.maxDepth > 0) enqueueCrawlLinks(queue, args.root.html, rootUrl, policy, 1, args.root.normalizedUrl);

  while (snapshots.length < policy.maxPages) {
    const next = nextCrawlQueueItem(queue, visited);
    if (!next) break;
    visited.add(next.url);

    try {
      const snapshot = await args.fetchSnapshot(next.url, { ...args.fetchOptions, now: args.now });
      if (isSitemapSnapshot(snapshot)) {
        enqueueUrlsFromSitemap(queue, snapshot, rootUrl, policy);
        continue;
      }
      if (isSitemapPath(next.url)) continue;
      if (!isHtmlSnapshot(snapshot)) {
        warnings.push(`Brand Vault crawler skipped ${next.url}: non-HTML response${snapshot.contentType ? ` (${snapshot.contentType})` : ''}.`);
        continue;
      }
      if (isSoftNotFoundSnapshot(snapshot)) {
        warnings.push(`Brand Vault crawler skipped ${next.url}: page appeared to be a soft 404 or low-value placeholder.`);
        continue;
      }
      snapshots.push(snapshot);
      if (next.depth < policy.maxDepth) {
        enqueueCrawlLinks(queue, snapshot.html, new URL(snapshot.normalizedUrl), policy, next.depth + 1, snapshot.normalizedUrl);
      }
    } catch (error) {
      if (isSitemapPath(next.url)) continue;
      warnings.push(`Brand Vault crawler skipped ${next.url}: ${errorMessage(error)}`);
    }
  }

  if (snapshots.length > 0) {
    warnings.push(`Crawled ${snapshots.length} additional brand page${snapshots.length === 1 ? '' : 's'} for draft evidence.`);
  }
  return { snapshots, warnings };
}

function resolveCrawlPolicy(seeds: BrandVaultSourceInput[]): CrawlPolicy {
  const options = seeds.map((seed) => seed.crawl).filter((value): value is BrandVaultCrawlOptions => Boolean(value));
  const maxPageOptions = options.map((option) => option.maxPages).filter((value): value is number => value !== undefined);
  const maxDepthOptions = options.map((option) => option.maxDepth).filter((value): value is number => value !== undefined);
  return {
    maxPages: clampInteger(maxPageOptions.length > 0 ? Math.max(...maxPageOptions) : DEFAULT_CRAWL_MAX_PAGES, 1, HARD_CRAWL_MAX_PAGES),
    maxDepth: clampInteger(maxDepthOptions.length > 0 ? Math.max(...maxDepthOptions) : DEFAULT_CRAWL_MAX_DEPTH, 0, HARD_CRAWL_MAX_DEPTH),
    includePaths: uniquePaths(options.flatMap((option) => option.includePaths ?? [])),
    excludePaths: uniquePaths([...DEFAULT_CRAWL_EXCLUDE_PATHS, ...options.flatMap((option) => option.excludePaths ?? [])]),
  };
}

function enqueueDefaultBrandPages(
  queue: Map<string, CrawlQueueItem>,
  rootUrl: URL,
  policy: CrawlPolicy,
  discoveredFrom: string,
): void {
  [
    '/about',
    '/about-us',
    '/company',
    '/story',
    '/mission',
    '/brand',
    '/services',
    '/solutions',
    '/product',
    '/customers',
    '/case-studies',
    '/work',
    '/portfolio',
    '/press',
    '/media-kit',
    '/resources',
  ].forEach((path) => enqueueCrawlUrl(queue, path, rootUrl, policy, 1, discoveredFrom, false));
}

function enqueueCrawlLinks(
  queue: Map<string, CrawlQueueItem>,
  html: string,
  baseUrl: URL,
  policy: CrawlPolicy,
  depth: number,
  discoveredFrom: string,
): void {
  const $ = load(html);
  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (href) enqueueCrawlUrl(queue, href, baseUrl, policy, depth, discoveredFrom, false);
  });
}

function enqueueSitemapUrls(
  queue: Map<string, CrawlQueueItem>,
  html: string,
  baseUrl: URL,
  policy: CrawlPolicy,
  discoveredFrom: string,
): void {
  const $ = load(html);
  const candidates = new Set<string>(['/sitemap.xml', '/sitemap_index.xml']);
  $('link[rel="sitemap"], a[href*="sitemap"]').each((_, element) => {
    const href = $(element).attr('href');
    if (href) candidates.add(href);
  });
  for (const href of candidates) enqueueCrawlUrl(queue, href, baseUrl, policy, 1, discoveredFrom, true);
}

function enqueueCrawlUrl(
  queue: Map<string, CrawlQueueItem>,
  href: string,
  baseUrl: URL,
  policy: CrawlPolicy,
  depth: number,
  discoveredFrom: string,
  explicitSeed: boolean,
): void {
  try {
    const normalizedHref = explicitSeed ? normalizeExplicitCrawlSeedHref(href, baseUrl) : href;
    const url = new URL(normalizedHref, baseUrl);
    url.hash = '';
    url.search = '';
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    if (url.origin !== baseUrl.origin) return;
    if (isBlockedCrawlAsset(url.pathname) && !isSitemapPath(url.pathname)) return;
    const path = normalizeCrawlPath(url.pathname);
    if (pathMatches(path, policy.excludePaths)) return;
    if (!explicitSeed && policy.includePaths.length > 0 && !pathMatches(path, policy.includePaths)) return;
    const priority = crawlPriority(url.href, explicitSeed);
    const existing = queue.get(url.href);
    if (!existing || priority > existing.priority || depth < existing.depth) {
      queue.set(url.href, { url: url.href, depth, priority, discoveredFrom });
    }
  } catch {
    return;
  }
}

function normalizeExplicitCrawlSeedHref(href: string, baseUrl: URL): string {
  const clean = href.trim();
  if (!clean || hasUrlProtocol(clean) || clean.startsWith('//') || clean.startsWith('/')) return clean;

  const firstSegment = clean.split(/[/?#]/, 1)[0] ?? '';
  if (!firstSegment.includes('.')) return clean;

  try {
    const url = new URL(`${baseUrl.protocol}//${clean}`);
    if (sameCrawlHost(url.hostname, baseUrl.hostname)) {
      url.protocol = baseUrl.protocol;
      url.host = baseUrl.host;
    }
    return url.href;
  } catch {
    return clean;
  }
}

function hasUrlProtocol(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(value);
}

function sameCrawlHost(left: string, right: string): boolean {
  return stripWww(left) === stripWww(right);
}

function stripWww(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

function nextCrawlQueueItem(queue: Map<string, CrawlQueueItem>, visited: Set<string>): CrawlQueueItem | undefined {
  const next = [...queue.values()]
    .filter((item) => !visited.has(item.url))
    .sort((a, b) => b.priority - a.priority || a.depth - b.depth || a.url.localeCompare(b.url))[0];
  if (next) queue.delete(next.url);
  return next;
}

function crawlPriority(url: string, explicitSeed: boolean): number {
  if (explicitSeed) return 20;
  if (isSitemapPath(url)) return 12;
  if (/\/(about|company|story|brand|mission|team)\b/i.test(url)) return 9;
  if (/\/(case-studies|customers|work|portfolio|results)\b/i.test(url)) return 8;
  if (/\/(services|features|product|solutions|platform)\b/i.test(url)) return 7;
  if (/\/(pricing|plans)\b/i.test(url)) return 5;
  if (/\/(press|media-kit|resources|blog|guides)\b/i.test(url)) return 4;
  return 1;
}

function isHtmlSnapshot(snapshot: BrandWebsiteSnapshot): boolean {
  return !snapshot.contentType || /text\/html|application\/xhtml\+xml/i.test(snapshot.contentType);
}

function isSoftNotFoundSnapshot(snapshot: BrandWebsiteSnapshot): boolean {
  const $ = load(snapshot.html);
  const marker = [
    $('title').first().text(),
    $('h1').first().text(),
    $('[role="heading"]').first().text(),
  ].join(' ');
  return /\b(?:404|page not found|post not found|not found)\b/i.test(marker);
}

function isSitemapSnapshot(snapshot: BrandWebsiteSnapshot): boolean {
  return /(?:application|text)\/xml|application\/rss\+xml|application\/atom\+xml/i.test(snapshot.contentType ?? '') ||
    isSitemapPath(snapshot.normalizedUrl);
}

function enqueueUrlsFromSitemap(
  queue: Map<string, CrawlQueueItem>,
  snapshot: BrandWebsiteSnapshot,
  rootUrl: URL,
  policy: CrawlPolicy,
): void {
  const urls = [...snapshot.html.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => decodeHtmlEntities(match[1] ?? '').trim())
    .filter(Boolean);
  for (const url of urls) {
    enqueueCrawlUrl(queue, url, rootUrl, policy, 1, snapshot.normalizedUrl, false);
  }
}

function isBlockedCrawlAsset(pathname: string): boolean {
  return /\.(avif|gif|jpe?g|mp4|pdf|png|svg|webm|webp|zip|css|js|json|ico|woff2?|ttf|otf)$/i.test(pathname);
}

function isSitemapPath(value: string): boolean {
  return /(?:^|\/)sitemap(?:[-_a-z0-9]*)?\.xml(?:$|\?)/i.test(value);
}

function pathMatches(path: string, filters: string[]): boolean {
  return filters.some((filter) => path === filter || path.startsWith(`${filter}/`));
}

function uniquePaths(values: string[]): string[] {
  return [...new Set(values.map(normalizeCrawlPath).filter(Boolean))];
}

function normalizeCrawlPath(value: string): string {
  const clean = value.trim();
  if (!clean) return '/';
  return clean.startsWith('/') ? clean : `/${clean}`;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function stylesheetWarningsForSnapshots(snapshots: BrandWebsiteSnapshot[]): string[] {
  return snapshots.flatMap((snapshot) => [...(snapshot.fetchWarnings ?? []), ...(snapshot.stylesheetWarnings ?? [])]);
}

function resolveWebsiteOcrProvider(
  dependencies: BrandVaultWebsiteDraftJobDependencies,
): BrandVaultSocialOcrProvider | null {
  if (dependencies.websiteOcrProvider !== undefined) return dependencies.websiteOcrProvider;
  return createBrandVaultGeminiSocialOcrProvider({
    enabled: process.env.BRAND_VAULT_WEBSITE_OCR_ENABLED === 'true',
    fetchFn: dependencies.fetchOptions?.fetchFn ?? fetch,
  });
}

async function enrichWebsiteSnapshotWithImageOcr(args: {
  snapshot: BrandWebsiteSnapshot;
  provider: BrandVaultSocialOcrProvider | null;
}): Promise<{ snapshot: BrandWebsiteSnapshot; warnings: string[] }> {
  if (!args.provider) return { snapshot: args.snapshot, warnings: [] };

  const warnings: string[] = [];
  const supplementalText: BrandWebsiteSupplementalTextEvidence[] = [...(args.snapshot.supplementalText ?? [])];
  let extracted = 0;

  for (const target of websiteOcrTargets(args.snapshot)) {
    const result = await args.provider.readTextFromImage({
      imageUrl: target.imageUrl,
      sourceUrl: args.snapshot.normalizedUrl,
      platform: 'website',
      mediaType: 'image',
      sourceKind: 'website',
    });

    if (result.text) {
      supplementalText.push({
        sourceField: target.sourceField,
        sourceUrl: target.imageUrl,
        text: result.text,
        confidence: target.confidence,
      });
      extracted += 1;
    }
    if (result.warning) warnings.push(result.warning);
  }

  if (extracted === 0) return { snapshot: args.snapshot, warnings };
  warnings.push(`Brand Vault OCR extracted readable text from ${extracted} website image${extracted === 1 ? '' : 's'} for draft evidence review.`);
  return {
    snapshot: {
      ...args.snapshot,
      supplementalText,
    },
    warnings,
  };
}

function websiteOcrTargets(snapshot: BrandWebsiteSnapshot): WebsiteOcrTarget[] {
  const parsed = parseWebsiteHtml({
    websiteUrl: snapshot.normalizedUrl,
    html: snapshot.html,
    stylesheets: snapshot.stylesheets,
    supplementalText: snapshot.supplementalText,
    renderedPrimitives: snapshot.renderedPrimitives,
    fetchedAt: snapshot.fetchedAt,
  });
  const targets: WebsiteOcrTarget[] = [];
  const seen = new Set<string>();
  const add = (imageUrl: string, sourceField: string, confidence: number): void => {
    if (seen.has(imageUrl)) return;
    seen.add(imageUrl);
    targets.push({ imageUrl, sourceField, confidence });
  };

  for (const imageUrl of parsed.productImages) add(imageUrl, 'website.imageOcr.productImage', 0.57);
  for (const imageUrl of parsed.socialPreviewImages) add(imageUrl, 'website.imageOcr.socialPreviewImage', 0.5);
  return targets.slice(0, 3);
}

function createCrawlCandidates(args: {
  input: BrandVaultWebsiteDraftJobInput;
  jobId: string;
  snapshots: BrandWebsiteSnapshot[];
  observedAt: string;
}): BrandEvidenceCandidate[] {
  return args.snapshots.flatMap((snapshot, index) => createCrawlSnapshotCandidates({ ...args, snapshot, index }));
}

function createCrawlSnapshotCandidates(args: {
  input: BrandVaultWebsiteDraftJobInput;
  jobId: string;
  snapshot: BrandWebsiteSnapshot;
  index: number;
  observedAt: string;
}): BrandEvidenceCandidate[] {
  const pageNumber = args.index + 1;
  const pageId = idPart(args.snapshot.normalizedUrl, 'page');
  const content = extractCrawlPageContent(args.snapshot);
  const pageCandidate: BrandEvidenceCandidate = {
    id: `candidate_crawled_page_${pageNumber}_${pageId}`,
    brandId: args.input.brandId,
    jobId: args.jobId,
    sourceType: 'website',
    sourceUrl: args.snapshot.normalizedUrl,
    sourceField: 'crawl.page',
    signalPath: 'identity.proofStyle',
    rawValue: { url: args.snapshot.normalizedUrl, contentType: args.snapshot.contentType },
    normalizedValue: { url: args.snapshot.normalizedUrl, title: content.title, contentType: args.snapshot.contentType },
    excerpt: sanitizeEvidenceExcerpt(`Crawled page included in Brand Vault draft: ${args.snapshot.normalizedUrl}`),
    confidence: BRAND_CONFIDENCE.WEBSITE.CRAWL_PAGE_REFERENCE,
    authorityClass: 'owned',
    observedAt: args.observedAt,
    extractorId: CRAWL_EXTRACTOR,
  };
  return [
    pageCandidate,
    ...crawlSignalCandidates({
      input: args.input,
      jobId: args.jobId,
      snapshot: args.snapshot,
      pageNumber,
      pageId,
      content,
      observedAt: args.observedAt,
    }),
  ];
}

function crawlSignalCandidates(args: {
  input: BrandVaultWebsiteDraftJobInput;
  jobId: string;
  snapshot: BrandWebsiteSnapshot;
  pageNumber: number;
  pageId: string;
  content: CrawlPageContent;
  observedAt: string;
}): BrandEvidenceCandidate[] {
  const candidates: BrandEvidenceCandidate[] = [];
  const add = (item: {
    sourceField: string;
    signalPath: string;
    rawValue: unknown;
    normalizedValue: unknown;
    excerpt: string;
    confidence: number;
  }): void => {
    candidates.push({
      id: `candidate_crawled_signal_${args.pageNumber}_${candidates.length + 1}_${args.pageId}`,
      brandId: args.input.brandId,
      jobId: args.jobId,
      sourceType: 'website',
      sourceUrl: args.snapshot.normalizedUrl,
      sourceField: `crawl.page.${args.pageNumber}.${item.sourceField}`,
      signalPath: item.signalPath,
      rawValue: item.rawValue,
      normalizedValue: item.normalizedValue,
      excerpt: sanitizeEvidenceExcerpt(item.excerpt),
      confidence: item.confidence,
      authorityClass: 'owned',
      observedAt: args.observedAt,
      extractorId: CRAWL_EXTRACTOR,
    });
  };

  if (isLowValueCrawlSignalPage(args.snapshot.normalizedUrl, args.content.title)) return candidates;

  const promotableHeadings = args.content.headings.filter(isPromotableRecurringPhrase);
  if (promotableHeadings.length > 0) {
    add({
      sourceField: 'headings',
      signalPath: 'voice.recurringPhrases',
      rawValue: promotableHeadings,
      normalizedValue: promotableHeadings,
      excerpt: `Crawled page headings: ${promotableHeadings.join(' | ')}`,
      confidence: BRAND_CONFIDENCE.WEBSITE.CRAWL_RECURRING_PHRASES,
    });
  }

  const hookArchetypes = crawlHookArchetypes(args.content.headings);
  if (hookArchetypes.length > 0) {
    add({
      sourceField: 'hooks',
      signalPath: 'voice.hookArchetypes',
      rawValue: args.content.headings,
      normalizedValue: hookArchetypes,
      excerpt: `Crawled page hook language: ${args.content.headings.join(' | ')}`,
      confidence: BRAND_CONFIDENCE.WEBSITE.CRAWL_HOOK_ARCHETYPES,
    });
  }
  if (args.content.ctas.length > 0) {
    add({
      sourceField: 'ctas',
      signalPath: 'voice.ctaDirectness',
      rawValue: args.content.ctas,
      normalizedValue: crawlCtaDirectness(args.content.ctas),
      excerpt: `Crawled page CTAs: ${args.content.ctas.join(' | ')}`,
      confidence: BRAND_CONFIDENCE.WEBSITE.CRAWL_CTA_DIRECTNESS,
    });
  }
  if (args.content.proofSnippets.length > 0) {
    add({
      sourceField: 'proof',
      signalPath: 'identity.proofStyle',
      rawValue: args.content.proofSnippets,
      normalizedValue: crawlProofStyle(args.content.proofSnippets.join(' ')),
      excerpt: `Crawled proof evidence: ${args.content.proofSnippets.join(' | ')}`,
      confidence: BRAND_CONFIDENCE.WEBSITE.CRAWL_PROOF_STYLE,
    });
  }
  const audience = args.content.bodyText ? inferAudience(args.content.bodyText) : [];
  if (audience.length > 0 && args.content.bodyText) {
    add({
      sourceField: 'copy',
      signalPath: 'identity.audience',
      rawValue: args.content.bodyText,
      normalizedValue: audience,
      excerpt: args.content.bodyText,
      confidence: BRAND_CONFIDENCE.WEBSITE.CRAWL_AUDIENCE,
    });
  }

  return candidates.slice(0, 6);
}

interface CrawlPageContent {
  title?: string;
  headings: string[];
  ctas: string[];
  proofSnippets: string[];
  bodyText?: string;
}

function extractCrawlPageContent(snapshot: BrandWebsiteSnapshot): CrawlPageContent {
  const $ = load(snapshot.html);
  $('script,style,noscript,svg,template,iframe,nav,header,footer,aside,form').remove();
  const headings = crawlTexts($, 'h1,h2,h3', 8);
  const ctas = crawlTexts($, 'a,button', 8).filter((text) => /\b(?:book|start|get|try|request|contact|demo|buy|talk|schedule|join|download|learn)\b/i.test(text));
  const proofSnippets = uniqueStrings([
    ...crawlTexts($, '[class*="testimonial"],[class*="case"],[class*="customer"],[class*="proof"],blockquote', 8),
    ...crawlMetricSnippets($.text()),
  ]).slice(0, 8);

  const bodyText = crawlBodyText($);
  return {
    title: pageTitle(snapshot.html),
    headings,
    ctas,
    proofSnippets,
    bodyText: bodyText || undefined,
  };
}

function crawlBodyText($: ReturnType<typeof load>): string {
  const chunks = $('body')
    .find('h1,h2,h3,p,li,blockquote,a,button,section,article')
    .map((_, element) => {
      const clone = $(element).clone();
      clone.children().remove();
      return sanitizeEvidenceExcerpt(clone.text().replace(/\s+/g, ' ').trim(), 180);
    })
    .get()
    .filter((text) => text.length >= 3);
  const text = chunks.length > 0 ? chunks.join('. ') : $('body').text().replace(/\s+/g, ' ').trim();
  return sanitizeEvidenceExcerpt(text, 900);
}

function crawlTexts($: ReturnType<typeof load>, selector: string, limit: number): string[] {
  return uniqueStrings($(selector)
    .map((_, element) => sanitizeEvidenceExcerpt($(element).text().replace(/\s+/g, ' ').trim(), 180))
    .get()
    .filter((text) => text.length >= 3 && !isGenericCrawlSignalText(text)))
    .slice(0, limit);
}

function isLowValueCrawlSignalPage(url: string, title?: string): boolean {
  const pathname = safePathname(url);
  if (/\/resources\/(?:faq|support|tutorials?)(?:\/|$)/i.test(pathname)) return true;
  if (/\/resources\/blogs\/?$/i.test(pathname)) return true;
  if (/\/(?:contact(?:us)?|support-us|upgrade|pricing|showcase|newsroom)\/?$/i.test(pathname)) return true;
  return /\b(?:faq|help and troubleshooting|tutorials?|pricing|showcase|newsroom)\b/i.test(title ?? '');
}

function isGenericCrawlSignalText(value: string): boolean {
  const text = value.trim();
  if (/^(?:pro|free|newsroom|pricing|resources|products?|about|contact|support|login|sign in|faq|faqs)$/i.test(text)) return true;
  if (/^(?:choose your access level|stay in the loop|sponsor a room|build with us|back the mission|write for us|how can we help\??|frequently asked questions|learn the floor)$/i.test(text)) {
    return true;
  }
  if (/^(?:book|start|get|try|request|contact|demo|buy|talk|schedule|join|download|learn|choose|stay|sponsor|build|back|write|read|subscribe)\b/i.test(text) && text.split(/\s+/).length <= 5) {
    return true;
  }
  return false;
}

function safePathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function crawlMetricSnippets(text: string): string[] {
  return uniqueStrings(text
    .split(/(?<=[.!?])\s+/)
    .map((line) => sanitizeEvidenceExcerpt(line.replace(/\s+/g, ' ').trim(), 180))
    .filter((line) => /\b(?:trusted by|customers?|clients?|teams?|case stud|results?|roi|growth|revenue|\d+[%x+]|\d+\s*(?:k|m|b)?\+?)\b/i.test(line)))
    .slice(0, 6);
}

function crawlHookArchetypes(headings: string[]): string[] {
  const joined = headings.join(' ').toLowerCase();
  const hooks: string[] = [];
  if (/\b(?:how|why|what|when)\b/.test(joined)) hooks.push('question');
  if (/\b(?:fast|quick|days?|minutes?|instant|speed)\b/.test(joined)) hooks.push('speed');
  if (/\b(?:trusted|proof|results?|case|customers?)\b/.test(joined)) hooks.push('proof');
  if (/\b(?:one|platform|system|all-in-one|operating system)\b/.test(joined)) hooks.push('system');
  if (/\b(?:stop|avoid|without|instead)\b/.test(joined)) hooks.push('contrast');
  return hooks;
}

function crawlCtaDirectness(ctas: string[]): number {
  const text = ctas.join(' ').toLowerCase();
  const direct = scoreKeywordHits(text, ['start', 'get', 'book', 'buy', 'request', 'schedule', 'talk']);
  const soft = scoreKeywordHits(text, ['learn', 'explore', 'read', 'discover']);
  return Math.max(0, Math.min(1, 0.5 + direct * 0.12 - soft * 0.08));
}

function crawlProofStyle(text: string): BrandSignalProfile['identity']['proofStyle']['value'] {
  const lower = text.toLowerCase();
  if (/\b(?:\d+[%x+]|\d+\s*(?:k|m|b)?\+?|roi|revenue|growth|faster|saved)\b/.test(lower)) return 'metrics';
  if (/\b(?:testimonial|quote|said|loved|review)\b/.test(lower)) return 'testimonial';
  if (/\b(?:trusted by|customers?|clients?|community|teams?)\b/.test(lower)) return 'community';
  if (/\b(?:case stud|results?|portfolio|work)\b/.test(lower)) return 'demo';
  return 'editorial';
}

function scoreKeywordHits(text: string, keywords: string[]): number {
  return keywords.reduce((sum, keyword) => sum + (text.includes(keyword) ? 1 : 0), 0);
}

function pageTitle(html: string): string | undefined {
  return sanitizeEvidenceExcerpt(load(html)('title').first().text(), 120);
}

function createStagedSourceCandidates(args: {
  input: BrandVaultWebsiteDraftJobInput;
  jobId: string;
  socialLinks: string[];
  sourceEvidence: BrandVaultSourceInput[];
  observedAt: string;
}): BrandEvidenceCandidate[] {
  const candidates: BrandEvidenceCandidate[] = [];
  for (const [index, url] of args.socialLinks.entries()) {
    candidates.push(
      createStagedSourceCandidate({
        input: args.input,
        jobId: args.jobId,
        source: {
          kind: 'social_profile',
          url,
          platform: inferSourcePlatform(url),
          note: 'Social profile link staged for voice and proof-pattern extraction.',
        },
        sourceField: `socialLinks.${index}`,
        index: candidates.length,
        observedAt: args.observedAt,
      }),
    );
    candidates.push(
      ...createBrandVaultSocialEvidenceCandidates({
        brandId: args.input.brandId,
        jobId: args.jobId,
        source: {
          kind: 'social_profile',
          url,
          platform: inferSourcePlatform(url),
          note: 'Social profile link staged for voice and proof-pattern extraction.',
        },
        sourceField: `socialLinks.${index}`,
        startIndex: candidates.length,
        observedAt: args.observedAt,
      }),
    );
  }
  for (const [index, source] of args.sourceEvidence.entries()) {
    const sourceField = `sourceEvidence.${index}.${source.kind}`;
    candidates.push(
      createStagedSourceCandidate({
        input: args.input,
        jobId: args.jobId,
        source,
        sourceField,
        index: candidates.length,
        observedAt: args.observedAt,
      }),
    );
    candidates.push(
      ...createUploadedSourceCandidates({
        input: args.input,
        jobId: args.jobId,
        source,
        sourceField,
        startIndex: candidates.length,
        observedAt: args.observedAt,
      }),
    );
    candidates.push(
      ...createBrandVaultSocialEvidenceCandidates({
        brandId: args.input.brandId,
        jobId: args.jobId,
        source,
        sourceField,
        startIndex: candidates.length,
        observedAt: args.observedAt,
      }),
    );
  }
  return candidates;
}

function createStagedSourceCandidate(args: {
  input: BrandVaultWebsiteDraftJobInput;
  jobId: string;
  source: BrandVaultSourceInput;
  sourceField: string;
  index: number;
  observedAt: string;
}): BrandEvidenceCandidate {
  const label = args.source.name ?? args.source.url ?? args.source.note ?? args.source.kind;
  const normalizedValue = {
    kind: args.source.kind,
    url: args.source.url,
    name: args.source.name,
    platform: args.source.platform,
    note: args.source.note,
    mimeType: args.source.mimeType,
    sizeBytes: args.source.sizeBytes,
    textLength: args.source.text?.length,
    dominantColors: args.source.dominantColors,
    assetRole: args.source.assetRole,
    pinned: args.source.pinned,
    status: 'staged',
  };
  const sourceId = idPart(`${args.source.kind}_${label}`, `source_${args.index + 1}`);
  return {
    id: `candidate_staged_${args.index + 1}_${sourceId}`,
    brandId: args.input.brandId,
    jobId: args.jobId,
    sourceType: args.source.kind,
    sourceUrl: args.source.url,
    sourceField: args.sourceField,
    signalPath: signalPathForSource(args.source.kind),
    rawValue: normalizedValue,
    normalizedValue,
    excerpt: sanitizeEvidenceExcerpt(args.source.note ? `${label} - ${args.source.note}` : label),
    confidence: confidenceForSource(args.source.kind),
    authorityClass: authorityForSource(args.source.kind),
    observedAt: args.observedAt,
    extractorId: SOURCE_STAGING_EXTRACTOR,
  };
}

function createUploadedSourceCandidates(args: {
  input: BrandVaultWebsiteDraftJobInput;
  jobId: string;
  source: BrandVaultSourceInput;
  sourceField: string;
  startIndex: number;
  observedAt: string;
}): BrandEvidenceCandidate[] {
  if (args.source.kind !== 'uploaded_guideline' && args.source.kind !== 'uploaded_asset') return [];

  const candidates: BrandEvidenceCandidate[] = [];
  const colors = uniqueStrings([...normalizeColorValues(args.source.dominantColors ?? []), ...colorsFromText(args.source.text ?? '')]);
  if (colors.length > 0) {
    candidates.push(
      uploadCandidate({
        ...args,
        index: args.startIndex + candidates.length,
        sourceField: `${args.sourceField}.colors`,
        signalPath: 'palette.supporting',
        rawValue: colors,
        normalizedValue: colors,
        excerpt: `Uploaded ${uploadLabel(args.source)} color evidence: ${colors.join(', ')}`,
        confidence: args.source.kind === 'uploaded_guideline' ? BRAND_CONFIDENCE.UPLOAD.GUIDELINE_COLORS : BRAND_CONFIDENCE.UPLOAD.ASSET_COLORS,
      }),
    );
  }

  const rules = extractBrandRules(args.source.text);
  if (rules.length > 0) {
    candidates.push(
      uploadCandidate({
        ...args,
        index: args.startIndex + candidates.length,
        sourceField: `${args.sourceField}.brandRules`,
        signalPath: 'voice.killList',
        rawValue: rules,
        normalizedValue: rules,
        excerpt: rules.join(' | '),
        confidence: BRAND_CONFIDENCE.UPLOAD.BRAND_RULES,
      }),
    );
  }

  const voiceGuidelines = extractVoiceGuidelines(args.source.text);
  if (voiceGuidelines.length > 0) {
    candidates.push(
      uploadCandidate({
        ...args,
        index: args.startIndex + candidates.length,
        sourceField: `${args.sourceField}.voiceGuidelines`,
        signalPath: 'voice.recurringPhrases',
        rawValue: voiceGuidelines,
        normalizedValue: voiceGuidelines,
        excerpt: voiceGuidelines.join(' | '),
        confidence: args.source.kind === 'uploaded_guideline' ? BRAND_CONFIDENCE.UPLOAD.GUIDELINE_VOICE : BRAND_CONFIDENCE.UPLOAD.ASSET_VOICE,
      }),
    );
  }

  if (isLogoUpload(args.source)) {
    const logoValue = args.source.url ?? args.source.name ?? uploadLabel(args.source);
    candidates.push(
      uploadCandidate({
        ...args,
        index: args.startIndex + candidates.length,
        sourceField: `${args.sourceField}.logoAsset`,
        signalPath: 'assets.logoCandidates',
        rawValue: logoValue,
        normalizedValue: {
          url: args.source.url,
          name: args.source.name,
          mimeType: args.source.mimeType,
          assetRole: args.source.assetRole,
        },
        excerpt: `Uploaded logo asset candidate: ${logoValue}`,
        confidence: BRAND_CONFIDENCE.UPLOAD.LOGO_ASSET,
      }),
    );
  }

  if (args.source.kind === 'uploaded_asset' && candidates.length === 0) {
    candidates.push(
      uploadCandidate({
        ...args,
        index: args.startIndex,
        sourceField: `${args.sourceField}.assetReference`,
        signalPath: 'visual.expressiveness',
        rawValue: uploadLabel(args.source),
        normalizedValue: {
          url: args.source.url,
          name: args.source.name,
          mimeType: args.source.mimeType,
          sizeBytes: args.source.sizeBytes,
          assetRole: args.source.assetRole,
        },
        excerpt: `Uploaded brand asset reference: ${uploadLabel(args.source)}`,
        confidence: BRAND_CONFIDENCE.UPLOAD.ASSET_REFERENCE,
      }),
    );
  }

  return candidates;
}

function uploadCandidate(args: {
  input: BrandVaultWebsiteDraftJobInput;
  jobId: string;
  source: BrandVaultSourceInput;
  sourceField: string;
  signalPath: string;
  rawValue: unknown;
  normalizedValue: unknown;
  excerpt: string;
  confidence: number;
  index: number;
  observedAt: string;
}): BrandEvidenceCandidate {
  return {
    id: `candidate_upload_${args.index + 1}_${idPart(`${args.sourceField}_${args.signalPath}_${stringifyCandidateValue(args.normalizedValue)}`, 'upload')}`,
    brandId: args.input.brandId,
    jobId: args.jobId,
    sourceType: args.source.kind,
    sourceUrl: args.source.url,
    sourceField: args.sourceField,
    signalPath: args.signalPath,
    rawValue: args.rawValue,
    normalizedValue: args.normalizedValue,
    excerpt: sanitizeEvidenceExcerpt(args.excerpt),
    confidence: args.confidence,
    authorityClass: authorityForSource(args.source.kind),
    observedAt: args.observedAt,
    extractorId: UPLOAD_EXTRACTOR,
  };
}

async function runTextEvidenceCompiler(args: {
  compiler: BrandVaultTextEvidenceCompiler | undefined;
  jobId: string;
  input: BrandVaultWebsiteDraftJobInput;
  website: BrandWebsiteSnapshot;
  crawlSnapshots: BrandWebsiteSnapshot[];
  sourceEvidence: BrandVaultSourceInput[];
  existingCandidates: BrandEvidenceCandidate[];
  observedAt: string;
}): Promise<BrandVaultTextEvidenceCompilerResult> {
  if (!args.compiler) return { candidates: [], warnings: [] };

  try {
    const result = await args.compiler({
      jobId: args.jobId,
      input: args.input,
      website: args.website,
      crawlSnapshots: args.crawlSnapshots,
      sourceEvidence: args.sourceEvidence,
      existingCandidates: args.existingCandidates,
      observedAt: args.observedAt,
    });
    return {
      candidates: normalizeTextEvidenceCompilerCandidates(
        Array.isArray(result.candidates) ? result.candidates : [],
        args,
      ),
      warnings: result.warnings ?? [],
    };
  } catch (error) {
    return {
      candidates: [],
      warnings: [`Brand Vault text evidence compiler skipped: ${errorMessage(error)}`],
    };
  }
}

function normalizeTextEvidenceCompilerCandidates(
  candidates: BrandEvidenceCandidate[],
  args: {
    jobId: string;
    input: BrandVaultWebsiteDraftJobInput;
    observedAt: string;
  },
): BrandEvidenceCandidate[] {
  return candidates
    .filter((candidate) => PROMOTABLE_REVIEW_SIGNAL_PATHS.has(candidate.signalPath))
    .map((candidate, index) => {
      const sourceField = candidate.sourceField || `textEvidenceCompiler.${index + 1}`;
      const normalizedValue = candidate.normalizedValue ?? candidate.rawValue;
      const id = `candidate_text_compiler_${index + 1}_${idPart(`${sourceField}_${candidate.signalPath}_${stringifyCandidateValue(normalizedValue)}`, 'text')}`;
      const confidence = Number.isFinite(candidate.confidence) ? candidate.confidence : BRAND_CONFIDENCE.FALLBACK_SIGNAL;
      return {
        ...candidate,
        id,
        brandId: args.input.brandId,
        jobId: args.jobId,
        sourceField,
        rawValue: candidate.rawValue ?? normalizedValue,
        normalizedValue,
        excerpt: candidate.excerpt ? sanitizeEvidenceExcerpt(candidate.excerpt) : undefined,
        confidence: Math.min(Math.max(confidence, 0), TEXT_EVIDENCE_COMPILER_CONFIDENCE_MAX),
        authorityClass: 'inferred',
        observedAt: args.observedAt,
        extractorId: TEXT_EVIDENCE_COMPILER_EXTRACTOR,
      };
    });
}

function applyReviewCandidatesToDraftRecord(
  record: BrandSignalProfileRecord,
  candidates: BrandEvidenceCandidate[],
  observedAt: string,
): BrandSignalProfileRecord {
  const profile = cloneBrandSignalProfile(record.profile);
  let changed = false;

  for (const candidate of candidates) {
    if (!isPromotableReviewCandidate(candidate)) continue;
    changed = promoteCandidateToProfile(profile, candidate, observedAt) || changed;
  }

  if (!changed) return record;
  return {
    ...record,
    profile,
    review: {
      ...record.review,
      reasons: getReviewReasons(profile),
    },
  };
}

function isPromotableReviewCandidate(candidate: BrandEvidenceCandidate): boolean {
  if (!PROMOTABLE_REVIEW_EXTRACTORS.has(candidate.extractorId)) return false;
  return PROMOTABLE_REVIEW_SIGNAL_PATHS.has(candidate.signalPath);
}

function promoteCandidateToProfile(
  profile: BrandSignalProfile,
  candidate: BrandEvidenceCandidate,
  observedAt: string,
): boolean {
  const evidence = promotedEvidenceFromCandidate(profile, candidate, observedAt);
  if (!evidence) return false;

  if (candidate.signalPath === 'palette.supporting') {
    return mergeStringArraySignal(profile.palette.supporting, candidate, evidence, profile);
  }
  if (candidate.signalPath === 'voice.killList') {
    return mergeStringArraySignal(profile.voice.killList, candidate, evidence, profile);
  }
  if (candidate.signalPath === 'voice.recurringPhrases') {
    return mergeStringArraySignal(profile.voice.recurringPhrases, candidate, evidence, profile);
  }
  if (candidate.signalPath === 'voice.hookArchetypes') {
    return mergeStringArraySignal(profile.voice.hookArchetypes, candidate, evidence, profile);
  }
  if (candidate.signalPath === 'identity.audience') {
    return mergeStringArraySignal(profile.identity.audience, candidate, evidence, profile);
  }
  if (candidate.signalPath === 'identity.productServices') {
    profile.identity.productServices ??= emptyPromotableStringArraySignal('identity.productServices');
    return mergeStringArraySignal(profile.identity.productServices, candidate, evidence, profile);
  }
  if (candidate.signalPath === 'identity.proofStyle') {
    const proofStyle = normalizeProofStyleCandidate(candidate.normalizedValue);
    return proofStyle ? replaceSignalValue(profile.identity.proofStyle, proofStyle, candidate, evidence, profile) : false;
  }
  if (candidate.signalPath === 'voice.ctaDirectness') {
    const directness = normalizeNumberCandidate(candidate.normalizedValue);
    return directness === undefined
      ? false
      : replaceSignalValue(profile.voice.ctaDirectness, directness, candidate, evidence, profile);
  }

  return false;
}

function mergeStringArraySignal(
  signal: BrandSignal<string[]>,
  candidate: BrandEvidenceCandidate,
  evidence: BrandSignalEvidence,
  profile: BrandSignalProfile,
): boolean {
  const values = normalizePromotedStringArrayCandidate(candidate.signalPath, candidate.normalizedValue);
  if (values.length === 0) return false;

  const existing = normalizePromotedStringArrayCandidate(candidate.signalPath, signal.value);
  const candidateFirst = candidate.confidence >= signal.confidence || signal.trustLevel === 'fallback_default';
  const merged = limitPromotedStringArray(
    candidate.signalPath,
    uniqueStrings(candidateFirst ? [...values, ...existing] : [...existing, ...values]),
  );
  const hasNewValues = merged.length !== signal.value.length || merged.some((value, index) => value !== signal.value[index]);
  const hasStrongerEvidence = candidate.confidence > signal.confidence;
  if (!hasNewValues && !hasStrongerEvidence) return false;

  profile.evidence.push(evidence);
  signal.value = merged;
  signal.evidenceIds = uniqueStrings([...signal.evidenceIds, evidence.id]);
  adoptCandidateSignalAuthority(signal, candidate, evidence);
  return true;
}

function replaceSignalValue<T>(
  signal: BrandSignal<T>,
  value: T,
  candidate: BrandEvidenceCandidate,
  evidence: BrandSignalEvidence,
  profile: BrandSignalProfile,
): boolean {
  if (candidate.confidence < signal.confidence && signal.trustLevel !== 'fallback_default') return false;

  profile.evidence.push(evidence);
  signal.value = value;
  signal.evidenceIds = uniqueStrings([...signal.evidenceIds, evidence.id]);
  adoptCandidateSignalAuthority(signal, candidate, evidence);
  return true;
}

function adoptCandidateSignalAuthority<T>(
  signal: BrandSignal<T>,
  candidate: BrandEvidenceCandidate,
  evidence: BrandSignalEvidence,
): void {
  if (candidate.confidence >= signal.confidence || signal.trustLevel === 'fallback_default') {
    signal.confidence = candidate.confidence;
    signal.trustLevel = evidence.trustLevel;
    signal.authorityClass = evidence.authorityClass;
    delete signal.fallbackReason;
    return;
  }
  signal.confidence = Math.max(signal.confidence, candidate.confidence);
}

function promotedEvidenceFromCandidate(
  profile: BrandSignalProfile,
  candidate: BrandEvidenceCandidate,
  observedAt: string,
): BrandSignalEvidence | undefined {
  const trustLevel = trustLevelForPromotedCandidate(candidate);
  if (!trustLevel) return undefined;
  const id = `source_e${profile.evidence.length + 1}_${candidate.signalPath.replace(/[^a-z0-9]+/gi, '_')}`;
  return {
    id,
    signalPath: candidate.signalPath,
    sourceType: trustLevel,
    sourceField: candidate.sourceField,
    excerpt: candidate.excerpt ? sanitizeEvidenceExcerpt(candidate.excerpt) : undefined,
    confidence: candidate.confidence,
    trustLevel,
    authorityClass: authorityClassForPromotedCandidate(candidate),
    observedAt: candidate.observedAt || observedAt,
    extractor: candidate.extractorId,
  };
}

function trustLevelForPromotedCandidate(candidate: BrandEvidenceCandidate): BrandSignalTrustLevel | undefined {
  if (candidate.sourceType === 'uploaded_guideline') return 'uploaded_brand_guideline';
  if (candidate.extractorId === CRAWL_EXTRACTOR && candidate.sourceType === 'website') return 'first_party_website';
  if (candidate.extractorId === TEXT_EVIDENCE_COMPILER_EXTRACTOR && candidate.sourceType === 'website') return 'first_party_website';
  if (candidate.sourceType === 'social_post' || candidate.sourceType === 'social_profile') {
    return candidateEvidenceOrigin(candidate) === 'connected_fetch' ? 'connected_social_account' : 'public_social_page';
  }
  return undefined;
}

function candidateEvidenceOrigin(candidate: BrandEvidenceCandidate): string | undefined {
  for (const value of [candidate.normalizedValue, candidate.rawValue]) {
    if (isRecord(value) && typeof value.evidenceOrigin === 'string') return value.evidenceOrigin;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function authorityClassForPromotedCandidate(candidate: BrandEvidenceCandidate): BrandSignalEvidence['authorityClass'] {
  if (candidate.signalPath === 'voice.killList') return 'brand_constraint';
  if (candidate.extractorId === CRAWL_EXTRACTOR || candidate.extractorId === TEXT_EVIDENCE_COMPILER_EXTRACTOR) return 'inferred_hint';
  if (candidate.signalPath === 'identity.proofStyle' || candidate.signalPath === 'voice.ctaDirectness') return 'inferred_hint';
  if (candidate.sourceType === 'uploaded_guideline') return 'brand_preference';
  return 'voice_default';
}

function normalizeStringArrayCandidate(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function normalizePromotedStringArrayCandidate(signalPath: string, value: unknown): string[] {
  const rawValues = normalizeStringArrayCandidate(value);
  const values = rawValues
    .map(cleanPromotedPhrase)
    .filter((item): item is string => Boolean(item));

  if (signalPath === 'palette.supporting') return limitPromotedStringArray(signalPath, normalizeColorValues(values));
  if (signalPath === 'identity.audience') {
    return limitPromotedStringArray(
      signalPath,
      values
        .map(cleanPromotedAudiencePhrase)
        .filter((item): item is string => Boolean(item)),
    );
  }
  if (signalPath === 'identity.productServices') {
    return limitPromotedStringArray(
      signalPath,
      values
        .map(cleanPromotedProductServicePhrase)
        .filter((item): item is string => Boolean(item)),
    );
  }
  if (signalPath === 'voice.recurringPhrases') {
    return limitPromotedStringArray(signalPath, values.filter(isPromotableRecurringPhrase));
  }
  if (signalPath === 'voice.hookArchetypes') {
    return limitPromotedStringArray(signalPath, values.filter((item) => item.length >= 3 && item.length <= 72));
  }
  return limitPromotedStringArray(signalPath, rawValues);
}

function emptyPromotableStringArraySignal(path: string): BrandSignal<string[]> {
  return {
    value: [],
    confidence: 0,
    trustLevel: 'fallback_default',
    authorityClass: 'inferred_hint',
    evidenceIds: [],
    fallbackReason: `No reviewed evidence for ${path}.`,
  };
}

function cleanPromotedPhrase(value: string): string | undefined {
  const phrase = sanitizeEvidenceExcerpt(value, 180)
    .replace(/([.!?])(?=\S)/g, '$1 ')
    .replace(/([a-z])([A-Z]{2,}\b)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/^[\s,.;:|-]+|[\s,.;:|-]+$/g, '')
    .trim();
  return phrase || undefined;
}

function cleanPromotedProductServicePhrase(value: string): string | undefined {
  const phrase = cleanPromotedPhrase(value);
  if (!phrase || phrase.length < 4 || phrase.length > 96) return undefined;
  if (/^(?:products?|services?|solutions?|features?|collections?|home|about|contact|pricing)$/i.test(phrase)) return undefined;
  if (/\b(?:shop now|add to cart|buy now|wishlist|no reviews?|mrp|price|sale|discount|select size|checkout|cart)\b/i.test(phrase)) return undefined;
  if (/^https?:\/\//i.test(phrase) || /[{}<>]|(?:document\.|window\.|function\s*\(|=>)/.test(phrase)) return undefined;
  return phrase;
}

function cleanPromotedAudiencePhrase(value: string): string | undefined {
  let phrase = value
    .replace(/^(?:the|a|an|our|your)\s+/i, '')
    .replace(/^[\d,.]+\+?\s+/, '')
    .trim();
  phrase = phrase.split(/\s+(?:to|who|that|with|without|using|through|via|into|by|from|in|across|during|while)\s+/i)[0] ?? phrase;
  phrase = phrase.replace(/\s+(?:turn|build|launch|run|improve|ship|create|grow|manage|make|cut|drive|unlock|accept|optimise|optimize|enable|embed|monetise|monetize)\b.*$/i, '');
  phrase = cleanPromotedPhrase(phrase) ?? '';
  if (!phrase || phrase.length < 4 || phrase.length > 72) return undefined;
  if (/\b(?:and|or|to|for|with|without|by|from|into|through|via)$/i.test(phrase)) return undefined;
  if (/^(?:and|or|but|by|with|without|from|into|through|via|that|this|these|those|it|its|their|while|when|where|which|building|creating|shipping|scaling|accepting|optimizing|optimising|enabling|embedding|monetizing|monetising)\b/i.test(phrase)) return undefined;
  if (/\b(?:editing stage|production workflow connected|brand drift|handoffs?|path can be|can be informal|floor running|production floor|production-grade tools?)\b/i.test(phrase)) return undefined;
  if (/^multiple clients\b/i.test(phrase)) return undefined;
  if (/^(?:video|content|production|social|creative|marketing|sales|revenue|product|engineering|design|finance|support|ops|operations|payments?|billing)$/i.test(phrase)) return undefined;
  if (/\b(?:floor|running and accessible|accessible|tools?|tooling|standard)\b/i.test(phrase)) return undefined;
  if (/\bbrand$/i.test(phrase) && !/\b(?:brands|brand\s+(?:teams?|leaders?|managers?|owners?|marketers?|builders?|operators?))\b/i.test(phrase)) {
    return undefined;
  }
  if (!/\b(?:agenc(?:y|ies)|creative|revenue|sales|marketing|product|engineering|developer|design|ops|operations|saas|b2b|enterprises?|startups?|clients?|customers?|support|finance|founders?|operators?|creators?|creator houses?|in-house|studios?|filmmakers?|editorial|content|production|video|social|brands?|businesses?|teams?)\b/i.test(phrase)) {
    return undefined;
  }
  return phrase;
}

function isPromotableRecurringPhrase(value: string): boolean {
  const words = value.split(/\s+/).filter(Boolean);
  if (/^#[a-z][a-z0-9_]{2,40}$/i.test(value)) return true;
  if (value.length < 10 || value.length > 120) return false;
  if (words.length < 3 && !/\d/.test(value)) return false;
  if (/^(?:pro|free|newsroom|pricing|resources|products?|about|contact|login|sign in|faq|faqs)$/i.test(value)) return false;
  if (/^(?:choose your access level|stay in the loop|sponsor a room|build with us|back the mission|write for us|how can we help\??|frequently asked questions|learn the floor)$/i.test(value)) {
    return false;
  }
  if (/^(?:learn more about|learn more|get a demo|get started|get started free|start free|try free|book a demo|request demo|contact sales)\b/i.test(value)) {
    return false;
  }
  if (/^(?:book|start|get|try|request|contact|demo|buy|talk|schedule|join|download|learn|choose|stay|sponsor|build|back|write|read|subscribe)\b/i.test(value) && words.length <= 5) {
    return false;
  }
  return true;
}

function limitPromotedStringArray(signalPath: string, values: string[]): string[] {
  const limit = PROMOTED_STRING_ARRAY_LIMITS[signalPath];
  return limit ? uniqueStrings(values).slice(0, limit) : uniqueStrings(values);
}

function normalizeProofStyleCandidate(value: unknown): BrandSignalProfile['identity']['proofStyle']['value'] | undefined {
  if (
    value === 'testimonial' ||
    value === 'metrics' ||
    value === 'authority' ||
    value === 'community' ||
    value === 'demo' ||
    value === 'editorial' ||
    value === 'unknown'
  ) {
    return value;
  }
  return undefined;
}

function normalizeNumberCandidate(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : undefined;
}

function cloneBrandSignalProfile(profile: BrandSignalProfile): BrandSignalProfile {
  return JSON.parse(JSON.stringify(profile)) as BrandSignalProfile;
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

function extractBrandRules(text: string | undefined): string[] {
  return extractMeaningfulUploadLines(text)
    .filter((line) => /\b(?:do not|don't|dont|avoid|never|must not|prohibited|forbidden|no\s+(?:logo|logos|gradient|gradients|slang|emoji|emojis|stock|clipart|clip art))\b/i.test(line))
    .slice(0, 8);
}

function extractVoiceGuidelines(text: string | undefined): string[] {
  return extractMeaningfulUploadLines(text)
    .filter((line) => /\b(?:voice|tone|personality|tagline|headline|copy|messaging|we sound|we speak)\b/i.test(line))
    .slice(0, 8);
}

function extractMeaningfulUploadLines(text: string | undefined): string[] {
  if (!text) return [];
  return uniqueStrings(text.split(/\r?\n|[.;]\s+/).map((line) => sanitizeEvidenceExcerpt(line, 180)).filter((line) => line.length >= 8));
}

function isLogoUpload(source: BrandVaultSourceInput): boolean {
  const label = `${source.name ?? ''} ${source.url ?? ''} ${source.mimeType ?? ''}`.toLowerCase();
  return source.assetRole === 'logo' || /\b(?:logo|logomark|wordmark|brandmark)\b/.test(label);
}

function uploadLabel(source: BrandVaultSourceInput): string {
  return source.name ?? source.url ?? source.note ?? source.mimeType ?? source.kind;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function stringifyCandidateValue(value: unknown): string {
  if (Array.isArray(value)) return value.join('_');
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return Object.values(value).filter(Boolean).join('_');
  return String(value);
}

function signalPathForSource(kind: BrandVaultSourceInput['kind']): string {
  if (kind === 'social_profile' || kind === 'social_post') return 'voice.recurringPhrases';
  if (kind === 'uploaded_guideline') return 'voice.killList';
  if (kind === 'uploaded_asset') return 'visual.expressiveness';
  if (kind === 'crawl_seed') return 'identity.proofStyle';
  return 'identity.category';
}

function confidenceForSource(kind: BrandVaultSourceInput['kind']): number {
  if (kind === 'uploaded_guideline') return BRAND_CONFIDENCE.SOURCE_REFERENCE.UPLOADED_GUIDELINE;
  if (kind === 'uploaded_asset') return BRAND_CONFIDENCE.SOURCE_REFERENCE.UPLOADED_ASSET;
  if (kind === 'social_post') return BRAND_CONFIDENCE.SOURCE_REFERENCE.SOCIAL_POST;
  if (kind === 'social_profile') return BRAND_CONFIDENCE.SOURCE_REFERENCE.SOCIAL_PROFILE;
  if (kind === 'crawl_seed') return BRAND_CONFIDENCE.SOURCE_REFERENCE.CRAWL_SEED;
  return BRAND_CONFIDENCE.SOURCE_REFERENCE.DEFAULT;
}

function authorityForSource(kind: BrandVaultSourceInput['kind']): BrandEvidenceCandidate['authorityClass'] {
  if (kind === 'uploaded_guideline') return 'official';
  if (kind === 'legacy_brand_intelligence') return 'inferred';
  return 'owned';
}

function inferSourcePlatform(url: string): BrandVaultSourceInput['platform'] {
  const lower = url.toLowerCase();
  if (lower.includes('linkedin.com')) return 'linkedin';
  if (lower.includes('instagram.com')) return 'instagram';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (lower.includes('tiktok.com')) return 'tiktok';
  if (lower.includes('x.com') || lower.includes('twitter.com')) return 'x';
  if (lower.includes('facebook.com')) return 'facebook';
  return 'other';
}

function stagedSourcesWarning(count: number): string {
  return `${count} additional Brand Vault source${count === 1 ? '' : 's'} staged for enrichment and evidence review.`;
}

function mergeWarnings(...groups: string[][]): string[] {
  return [...new Set(groups.flat().filter(Boolean))];
}

function createDefaultJobId(input: BrandVaultWebsiteDraftJobInput, websiteUrl: string, now: string): string {
  const owner = idPart(input.brandId ?? input.userId, 'brand');
  const website = idPart(websiteUrl, 'website');
  return `brand_refinery_job_${owner}_${website}_${Date.parse(now) || 0}`;
}

function idPart(value: string, fallback: string): string {
  const clean = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);
  return clean || fallback;
}

function resolveNow(explicitNow: string | undefined, clock: (() => string) | undefined): string {
  return explicitNow ?? clock?.() ?? new Date().toISOString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
