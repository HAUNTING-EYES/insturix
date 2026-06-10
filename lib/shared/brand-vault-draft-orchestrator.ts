import { load } from 'cheerio';
import type { BrandSignalProfile } from './brand-signal-profile';
import { isBrandSignalActionable, sanitizeEvidenceExcerpt } from './brand-signal-profile';
import {
  collectBrandSignals,
  type BrandSignalLifecycleOptions,
  type BrandSignalProfileRecord,
} from './brand-signal-lifecycle';
import type { BrandSignalProfileRepositoryResult } from './brand-signal-profile-repository';
import {
  createWebsiteBrandSignalProfileDraft,
  fetchWebsiteBrandSnapshot,
  normalizeBrandWebsiteUrl,
} from './brand-website-refinery';
import type {
  BrandEvidenceCandidate,
  BrandRefineryJob,
  BrandVaultSourceInput,
  BrandWebsiteSnapshot,
  FetchWebsiteBrandSnapshotOptions,
} from './brand-website-refinery-types';

export type BrandVaultWebsiteDraftJobErrorCode = 'invalid_url' | 'fetch_failed' | 'draft_creation_failed';

export type BrandVaultSignalGroup = 'identity' | 'palette' | 'typography' | 'visual' | 'motion' | 'voice';

export interface BrandVaultSignalGroupCoverage {
  signalCount: number;
  actionableSignalCount: number;
  evidenceCount: number;
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

const SOCIAL_LINKS_DEFERRED_WARNING =
  'Social links were captured for later Brand Vault enrichment; this website draft does not read social posts yet.';
const SOURCE_STAGING_EXTRACTOR = 'brand-vault-source-staging.v1';
const MAX_CRAWLED_PAGES = 4;

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
      warnings: ['Website fetch failed; Brand Vault could not create a website evidence draft.'],
    });
  }

  try {
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
        html: combineSnapshotHtml(snapshot, crawl.snapshots),
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
    const savedRecord = await dependencies.repository.saveRecord(draft.record, {
      now: snapshot.fetchedAt,
      actorId: input.actorId,
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
    const candidates = [...draft.candidates, ...stagedCandidates, ...crawlCandidates];
    const warnings = mergeWarnings(
      draft.warnings,
      crawl.warnings,
      socialLinks.length > 0 ? [SOCIAL_LINKS_DEFERRED_WARNING] : [],
      stagedCandidates.length > 0 ? [stagedSourcesWarning(stagedCandidates.length)] : [],
    );
    const job = createJob({
      input,
      jobId,
      status: 'needs_review',
      websiteUrl: draft.normalizedUrl,
      socialLinks,
      sourceEvidence,
      warnings,
      createdAt: startedAt,
      updatedAt: snapshot.fetchedAt,
    });
    const reviewPayload = createBrandVaultDraftReviewPayload({
      job,
      record: savedRecord,
      candidates,
      normalizedUrl: draft.normalizedUrl,
      warnings,
    });

    return {
      ok: true,
      job,
      record: savedRecord,
      profile: savedRecord.profile,
      candidates,
      normalizedUrl: draft.normalizedUrl,
      warnings,
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
  if (crawlSeeds.length === 0) return { snapshots: [], warnings: [] };

  const urls = crawlUrls(args.root, crawlSeeds);
  const snapshots: BrandWebsiteSnapshot[] = [];
  const warnings: string[] = [];
  for (const url of urls) {
    try {
      snapshots.push(await args.fetchSnapshot(url, { ...args.fetchOptions, now: args.now }));
    } catch (error) {
      warnings.push(`Brand Vault crawler skipped ${url}: ${errorMessage(error)}`);
    }
  }

  if (snapshots.length > 0) {
    warnings.push(`Crawled ${snapshots.length} additional brand page${snapshots.length === 1 ? '' : 's'} for draft evidence.`);
  }
  return { snapshots, warnings };
}

function crawlUrls(root: BrandWebsiteSnapshot, seeds: BrandVaultSourceInput[]): string[] {
  const rootUrl = new URL(root.normalizedUrl);
  const urls = new Set<string>();
  for (const seed of seeds) {
    if (seed.url) addCrawlUrl(urls, seed.url, rootUrl);
  }

  const $ = load(root.html);
  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (href) addCrawlUrl(urls, href, rootUrl);
  });

  return [...urls]
    .filter((url) => url !== root.normalizedUrl)
    .sort((a, b) => crawlPriority(b) - crawlPriority(a) || a.localeCompare(b))
    .slice(0, MAX_CRAWLED_PAGES);
}

function addCrawlUrl(urls: Set<string>, href: string, rootUrl: URL): void {
  try {
    const url = new URL(href, rootUrl);
    url.hash = '';
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    if (url.origin !== rootUrl.origin) return;
    if (/\.(avif|gif|jpe?g|mp4|pdf|png|svg|webm|webp|zip)$/i.test(url.pathname)) return;
    urls.add(url.href);
  } catch {
    return;
  }
}

function crawlPriority(url: string): number {
  if (/\/(about|company|story|brand)\b/i.test(url)) return 5;
  if (/\/(case-studies|customers|work|portfolio)\b/i.test(url)) return 4;
  if (/\/(services|features|product|solutions)\b/i.test(url)) return 3;
  if (/\/(press|media-kit|resources|blog)\b/i.test(url)) return 2;
  return 1;
}

function combineSnapshotHtml(root: BrandWebsiteSnapshot, snapshots: BrandWebsiteSnapshot[]): string {
  if (snapshots.length === 0) return root.html;
  return [root, ...snapshots]
    .map((snapshot) => `<!-- Brand Vault source: ${snapshot.normalizedUrl} -->\n${snapshot.html}`)
    .join('\n');
}

function createCrawlCandidates(args: {
  input: BrandVaultWebsiteDraftJobInput;
  jobId: string;
  snapshots: BrandWebsiteSnapshot[];
  observedAt: string;
}): BrandEvidenceCandidate[] {
  return args.snapshots.map((snapshot, index) => ({
    id: `candidate_crawled_page_${index + 1}_${idPart(snapshot.normalizedUrl, 'page')}`,
    brandId: args.input.brandId,
    jobId: args.jobId,
    sourceType: 'website',
    sourceUrl: snapshot.normalizedUrl,
    sourceField: 'crawl.page',
    signalPath: 'identity.proofStyle',
    rawValue: snapshot.normalizedUrl,
    normalizedValue: snapshot.normalizedUrl,
    excerpt: sanitizeEvidenceExcerpt(`Crawled page included in Brand Vault draft: ${snapshot.normalizedUrl}`),
    confidence: 0.45,
    authorityClass: 'owned',
    observedAt: args.observedAt,
    extractorId: 'brand-vault-crawler.v1',
  }));
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
  }
  for (const [index, source] of args.sourceEvidence.entries()) {
    candidates.push(
      createStagedSourceCandidate({
        input: args.input,
        jobId: args.jobId,
        source,
        sourceField: `sourceEvidence.${index}.${source.kind}`,
        index: candidates.length,
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

function signalPathForSource(kind: BrandVaultSourceInput['kind']): string {
  if (kind === 'social_profile' || kind === 'social_post') return 'voice.recurringPhrases';
  if (kind === 'uploaded_guideline') return 'voice.killList';
  if (kind === 'uploaded_asset') return 'visual.expressiveness';
  if (kind === 'crawl_seed') return 'identity.proofStyle';
  return 'identity.category';
}

function confidenceForSource(kind: BrandVaultSourceInput['kind']): number {
  if (kind === 'uploaded_guideline') return 0.72;
  if (kind === 'uploaded_asset') return 0.58;
  if (kind === 'social_post') return 0.42;
  if (kind === 'social_profile') return 0.32;
  if (kind === 'crawl_seed') return 0.25;
  return 0.3;
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
