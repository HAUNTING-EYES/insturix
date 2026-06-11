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
  BrandVaultCrawlOptions,
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
const UPLOAD_EXTRACTOR = 'brand-vault-upload-evidence.v1';
const DEFAULT_CRAWL_MAX_PAGES = 24;
const HARD_CRAWL_MAX_PAGES = 60;
const DEFAULT_CRAWL_MAX_DEPTH = 3;
const HARD_CRAWL_MAX_DEPTH = 3;
const DEFAULT_CRAWL_EXCLUDE_PATHS = [
  '/privacy',
  '/terms',
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
    const url = new URL(href, baseUrl);
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
    rawValue: { url: snapshot.normalizedUrl, contentType: snapshot.contentType },
    normalizedValue: { url: snapshot.normalizedUrl, title: pageTitle(snapshot.html), contentType: snapshot.contentType },
    excerpt: sanitizeEvidenceExcerpt(`Crawled page included in Brand Vault draft: ${snapshot.normalizedUrl}`),
    confidence: 0.45,
    authorityClass: 'owned',
    observedAt: args.observedAt,
    extractorId: 'brand-vault-crawler.v1',
  }));
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
        confidence: args.source.kind === 'uploaded_guideline' ? 0.78 : 0.62,
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
        confidence: 0.82,
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
        confidence: args.source.kind === 'uploaded_guideline' ? 0.76 : 0.58,
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
        confidence: 0.7,
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
        confidence: 0.54,
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
