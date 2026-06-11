import type { BrandSignalProfile } from './brand-signal-profile';
import type {
  BrandSignalLifecycleOptions,
  BrandSignalProfileRecord,
} from './brand-signal-lifecycle';
import {
  createInMemoryBrandSignalProfileRepository,
  type BrandSignalProfileRepositoryResult,
} from './brand-signal-profile-repository';
import {
  createBrandVaultDraftReviewPayload,
  createBrandVaultWebsiteDraftJob,
  type BrandVaultSignalProfileStore,
  type BrandVaultStoreResult,
  type BrandVaultWebsiteDraftJobResult,
  type BrandVaultWebsiteDraftReviewPayload,
} from './brand-vault-draft-orchestrator';
import type {
  BrandEvidenceCandidate,
  BrandVaultCrawlOptions,
  BrandVaultUploadedAssetRole,
  BrandRefineryJob,
  BrandVaultSourceInput,
  FetchWebsiteBrandSnapshotOptions,
} from './brand-website-refinery-types';
import { createBrandVaultMongoRefineryStoreFromEnvironment } from './brand-vault-mongo-store';

export interface BrandVaultApiResult<TBody> {
  status: number;
  body: TBody;
}

export interface BrandVaultApiErrorBody {
  ok: false;
  error: {
    code:
      | 'invalid_json'
      | 'invalid_request'
      | 'not_found'
      | 'invalid_url'
      | 'validation_failed'
      | 'not_draft'
      | 'fetch_failed'
      | 'draft_creation_failed';
    message: string;
  };
}

export interface BrandVaultRefineryJobSnapshot {
  job: BrandRefineryJob;
  recordId?: string;
  normalizedUrl?: string;
  candidates: BrandEvidenceCandidate[];
  reviewPayload?: BrandVaultWebsiteDraftReviewPayload;
}

export interface BrandVaultRefineryStore extends BrandVaultSignalProfileStore {
  saveJobSnapshot(snapshot: BrandVaultRefineryJobSnapshot): BrandVaultStoreResult<BrandVaultRefineryJobSnapshot>;
  getJobSnapshot(jobId: string): BrandVaultStoreResult<BrandVaultRefineryJobSnapshot | null>;
  getJobSnapshotByRecordId(recordId: string): BrandVaultStoreResult<BrandVaultRefineryJobSnapshot | null>;
  updateJobStatusForRecord(
    recordId: string,
    status: BrandRefineryJob['status'],
    options?: BrandSignalLifecycleOptions,
  ): BrandVaultStoreResult<BrandVaultRefineryJobSnapshot | null>;
}

export type CreateBrandVaultRefineryJobBody = {
  websiteUrl?: unknown;
  brandId?: unknown;
  companyName?: unknown;
  socialLinks?: unknown;
  sourceEvidence?: unknown;
};

export type ReviewBrandVaultSignalProfileBody = {
  action?: unknown;
  reason?: unknown;
};

type ParsedCreateBody =
  | {
      ok: true;
      value: {
        websiteUrl: string;
        brandId?: string;
        companyName?: string;
        socialLinks: string[];
        sourceEvidence: BrandVaultSourceInput[];
      };
    }
  | {
      ok: false;
      result: BrandVaultApiResult<BrandVaultApiErrorBody>;
    };

export type CreateBrandVaultRefineryJobSuccessBody = {
  ok: true;
  job: BrandRefineryJob;
  record: BrandSignalProfileRecord;
  reviewPayload: BrandVaultWebsiteDraftReviewPayload;
  candidates: BrandEvidenceCandidate[];
};

export type GetBrandVaultRefineryJobSuccessBody = {
  ok: true;
  job: BrandRefineryJob;
  record: BrandSignalProfileRecord | null;
  reviewPayload: BrandVaultWebsiteDraftReviewPayload | null;
  candidates: BrandEvidenceCandidate[];
};

export type ReviewBrandVaultSignalProfileSuccessBody = {
  ok: true;
  record: BrandSignalProfileRecord;
  job: BrandRefineryJob | null;
  reviewPayload: BrandVaultWebsiteDraftReviewPayload | null;
  superseded: BrandSignalProfileRecord[];
};

export class InMemoryBrandVaultRefineryStore implements BrandVaultRefineryStore {
  private readonly profiles = createInMemoryBrandSignalProfileRepository();
  private readonly jobs = new Map<string, BrandVaultRefineryJobSnapshot>();
  private readonly recordToJob = new Map<string, string>();

  saveRecord(record: BrandSignalProfileRecord, options: BrandSignalLifecycleOptions = {}): BrandSignalProfileRecord {
    return this.profiles.saveRecord(record, options);
  }

  getRecord(id: string): BrandSignalProfileRecord | null {
    return this.profiles.getRecord(id);
  }

  acceptDraft(id: string, options: BrandSignalLifecycleOptions = {}): BrandSignalProfileRepositoryResult {
    return this.profiles.acceptDraft(id, options);
  }

  rejectDraft(id: string, reason: string, options: BrandSignalLifecycleOptions = {}): BrandSignalProfileRepositoryResult {
    return this.profiles.rejectDraft(id, reason, options);
  }

  getLatestAcceptedProfile(filter: { brandId?: string; userId?: string }): BrandSignalProfile | null {
    return this.profiles.getLatestAcceptedProfile(filter);
  }

  saveJobSnapshot(snapshot: BrandVaultRefineryJobSnapshot): BrandVaultRefineryJobSnapshot {
    const next = cloneSnapshot(snapshot);
    this.jobs.set(next.job.id, next);
    if (next.recordId) this.recordToJob.set(next.recordId, next.job.id);
    return cloneSnapshot(next);
  }

  getJobSnapshot(jobId: string): BrandVaultRefineryJobSnapshot | null {
    const snapshot = this.jobs.get(jobId);
    return snapshot ? cloneSnapshot(snapshot) : null;
  }

  getJobSnapshotByRecordId(recordId: string): BrandVaultRefineryJobSnapshot | null {
    const jobId = this.recordToJob.get(recordId);
    return jobId ? this.getJobSnapshot(jobId) : null;
  }

  updateJobStatusForRecord(
    recordId: string,
    status: BrandRefineryJob['status'],
    options: BrandSignalLifecycleOptions = {},
  ): BrandVaultRefineryJobSnapshot | null {
    const jobId = this.recordToJob.get(recordId);
    const current = jobId ? this.jobs.get(jobId) : null;
    if (!jobId || !current) return null;

    const updatedJob = {
      ...current.job,
      status,
      updatedAt: options.now ?? new Date().toISOString(),
    };
    const record = this.getRecord(recordId);
    const reviewPayload = record
      ? createBrandVaultDraftReviewPayload({
          job: updatedJob,
          record,
          candidates: current.candidates,
          normalizedUrl: current.normalizedUrl ?? updatedJob.inputs.websiteUrl ?? '',
          warnings: updatedJob.warnings,
        })
      : current.reviewPayload;
    return this.saveJobSnapshot({
      ...current,
      job: updatedJob,
      reviewPayload,
    });
  }
}

export function createInMemoryBrandVaultRefineryStore(): InMemoryBrandVaultRefineryStore {
  return new InMemoryBrandVaultRefineryStore();
}

export function getDefaultBrandVaultRefineryStore(): BrandVaultRefineryStore {
  const globalStore = globalThis as typeof globalThis & {
    __brandVaultRefineryStore?: BrandVaultRefineryStore;
  };
  globalStore.__brandVaultRefineryStore ??=
    createBrandVaultMongoRefineryStoreFromEnvironment() ?? createInMemoryBrandVaultRefineryStore();
  return globalStore.__brandVaultRefineryStore;
}

export async function createBrandVaultRefineryJobFromWebsite(
  args: {
    userId: string;
    body: unknown;
    actorId?: string;
  },
  dependencies: {
    store: BrandVaultRefineryStore;
    fetchOptions?: FetchWebsiteBrandSnapshotOptions;
    clock?: () => string;
  },
): Promise<BrandVaultApiResult<CreateBrandVaultRefineryJobSuccessBody | BrandVaultApiErrorBody>> {
  const parsed = parseCreateBody(args.body);
  if (!parsed.ok) return parsed.result;

  const result = await createBrandVaultWebsiteDraftJob(
    {
      userId: args.userId,
      websiteUrl: parsed.value.websiteUrl,
      brandId: parsed.value.brandId,
      companyName: parsed.value.companyName,
      socialLinks: parsed.value.socialLinks,
      sourceEvidence: parsed.value.sourceEvidence,
      actorId: args.actorId ?? args.userId,
      now: dependencies.clock?.(),
    },
    {
      repository: dependencies.store,
      fetchOptions: dependencies.fetchOptions,
      clock: dependencies.clock,
    },
  );

  if (!result.ok) {
    await dependencies.store.saveJobSnapshot({ job: result.job, candidates: [] });
    return {
      status: statusForDraftFailure(result),
      body: {
        ok: false,
        error: {
          code: result.error.code,
          message: result.error.message,
        },
      },
    };
  }

  await dependencies.store.saveJobSnapshot({
    job: result.job,
    recordId: result.record.id,
    normalizedUrl: result.normalizedUrl,
    candidates: result.candidates,
    reviewPayload: result.reviewPayload,
  });

  return {
    status: 201,
    body: {
      ok: true,
      job: result.job,
      record: result.record,
      reviewPayload: result.reviewPayload,
      candidates: result.candidates,
    },
  };
}

export async function getBrandVaultRefineryJob(
  args: { userId: string; jobId: string },
  dependencies: { store: BrandVaultRefineryStore },
): Promise<BrandVaultApiResult<GetBrandVaultRefineryJobSuccessBody | BrandVaultApiErrorBody>> {
  const jobId = args.jobId.trim();
  if (!jobId) return invalidRequest('Missing jobId.');

  const snapshot = await dependencies.store.getJobSnapshot(jobId);
  if (!snapshot || snapshot.job.userId !== args.userId) return notFound('Brand Vault refinery job was not found.');

  const record = snapshot.recordId ? await dependencies.store.getRecord(snapshot.recordId) : null;
  return {
    status: 200,
    body: {
      ok: true,
      job: snapshot.job,
      record,
      reviewPayload: record
        ? createBrandVaultDraftReviewPayload({
            job: snapshot.job,
            record,
            candidates: snapshot.candidates,
            normalizedUrl: snapshot.normalizedUrl ?? snapshot.job.inputs.websiteUrl ?? '',
            warnings: snapshot.job.warnings,
          })
        : snapshot.reviewPayload ?? null,
      candidates: snapshot.candidates,
    },
  };
}

export async function getBrandVaultSignalProfile(
  args: { userId: string; recordId: string },
  dependencies: { store: BrandVaultRefineryStore },
): Promise<BrandVaultApiResult<GetBrandVaultRefineryJobSuccessBody | BrandVaultApiErrorBody>> {
  const recordId = args.recordId.trim();
  if (!recordId) return invalidRequest('Missing record id.');

  const record = await dependencies.store.getRecord(recordId);
  if (!record || record.profile.userId !== args.userId) return notFound('Brand signal profile was not found.');

  const snapshot = await dependencies.store.getJobSnapshotByRecordId(recordId);
  const job = snapshot?.job ?? profileOnlyJob(record);
  return {
    status: 200,
    body: {
      ok: true,
      job,
      record,
      reviewPayload: createBrandVaultDraftReviewPayload({
        job,
        record,
        candidates: snapshot?.candidates ?? [],
        normalizedUrl: snapshot?.normalizedUrl ?? '',
        warnings: snapshot?.job.warnings ?? [],
      }),
      candidates: snapshot?.candidates ?? [],
    },
  };
}

export async function reviewBrandVaultSignalProfileDraft(
  args: {
    userId: string;
    recordId: string;
    body: unknown;
    actorId?: string;
    now?: string;
  },
  dependencies: { store: BrandVaultRefineryStore },
): Promise<BrandVaultApiResult<ReviewBrandVaultSignalProfileSuccessBody | BrandVaultApiErrorBody>> {
  const record = await dependencies.store.getRecord(args.recordId);
  if (!record || record.profile.userId !== args.userId) return notFound('Brand signal profile was not found.');

  const body = isObjectRecord(args.body) ? args.body : {};
  const action = typeof body.action === 'string' ? body.action.trim() : '';
  const now = args.now ?? new Date().toISOString();
  const options = { actorId: args.actorId ?? args.userId, now };
  const result =
    action === 'accept'
      ? await dependencies.store.acceptDraft(args.recordId, options)
      : action === 'reject'
        ? await rejectDraft(args.recordId, body, dependencies.store, options)
        : null;

  if (!result) return invalidRequest('Action must be "accept" or "reject".');
  if (!result.ok) {
    return {
      status: result.code === 'not_draft' ? 409 : 422,
      body: {
        ok: false,
        error: {
          code: result.code,
          message: result.issues[0]?.message ?? 'Brand signal profile review failed.',
        },
      },
    };
  }

  const status = action === 'accept' ? 'accepted' : 'rejected';
  const snapshot = await dependencies.store.updateJobStatusForRecord(args.recordId, status, options);
  return {
    status: 200,
    body: {
      ok: true,
      record: result.record,
      job: snapshot?.job ?? null,
      reviewPayload: snapshot?.reviewPayload ?? null,
      superseded: result.superseded,
    },
  };
}

function rejectDraft(
  recordId: string,
  body: Record<string, unknown>,
  store: BrandVaultRefineryStore,
  options: BrandSignalLifecycleOptions,
): BrandVaultStoreResult<BrandSignalProfileRepositoryResult | null> {
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason) return null;
  return store.rejectDraft(recordId, reason, options);
}

function parseCreateBody(body: unknown): ParsedCreateBody {
  if (!isObjectRecord(body)) return parseFailure('Request body must be an object.');

  const websiteUrl = cleanString(body.websiteUrl);
  if (!websiteUrl) return parseFailure('Missing websiteUrl.');

  const socialLinks = parseSocialLinks(body.socialLinks);
  if (!socialLinks) return parseFailure('socialLinks must be an array of strings when provided.');
  const sourceEvidence = parseSourceEvidence(body.sourceEvidence);
  if (!sourceEvidence) return parseFailure('sourceEvidence must be an array of supported source objects when provided.');

  return {
    ok: true,
    value: {
      websiteUrl,
      brandId: cleanString(body.brandId) || undefined,
      companyName: cleanString(body.companyName) || undefined,
      socialLinks,
      sourceEvidence,
    },
  };
}

function parseFailure(message: string): ParsedCreateBody {
  return { ok: false, result: invalidRequest(message) };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseSocialLinks(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const links = value.map(cleanString).filter(Boolean);
  return links.length === value.length && links.length <= 10 ? links : null;
}

const SOURCE_KINDS = new Set<BrandVaultSourceInput['kind']>([
  'social_profile',
  'social_post',
  'uploaded_guideline',
  'uploaded_asset',
  'crawl_seed',
  'legacy_brand_intelligence',
]);

const SOURCE_PLATFORMS = new Set<NonNullable<BrandVaultSourceInput['platform']>>([
  'website',
  'linkedin',
  'instagram',
  'youtube',
  'tiktok',
  'x',
  'facebook',
  'other',
]);

const UPLOADED_ASSET_ROLES = new Set<BrandVaultUploadedAssetRole>([
  'brand_book',
  'logo',
  'font',
  'color_palette',
  'creative_reference',
  'prior_work',
  'other',
]);

function parseSourceEvidence(value: unknown): BrandVaultSourceInput[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 30) return null;
  const sources = value.map(parseSourceEvidenceEntry);
  return sources.every(Boolean) ? (sources as BrandVaultSourceInput[]) : null;
}

function parseSourceEvidenceEntry(value: unknown): BrandVaultSourceInput | null {
  if (!isObjectRecord(value)) return null;
  const kind = cleanString(value.kind) as BrandVaultSourceInput['kind'];
  if (!SOURCE_KINDS.has(kind)) return null;

  const url = cleanString(value.url) || undefined;
  const name = cleanString(value.name) || undefined;
  const note = cleanString(value.note) || undefined;
  const platformValue = cleanString(value.platform) as NonNullable<BrandVaultSourceInput['platform']>;
  const platform = SOURCE_PLATFORMS.has(platformValue) ? platformValue : undefined;
  const crawl = kind === 'crawl_seed' ? parseCrawlOptions(value.crawl) : undefined;
  const mimeType = parseLimitedString(value.mimeType, 160);
  const text = parseLimitedString(value.text, 20_000);
  const sizeBytes = parseBoundedInteger(value.sizeBytes, 0, 250_000_000);
  const dominantColors = parseColorList(value.dominantColors);
  const assetRole = parseAssetRole(value.assetRole);
  const pinned = parseOptionalBoolean(value.pinned);
  if (crawl === null) return null;
  if (mimeType === null || text === null || sizeBytes === null || dominantColors === null || assetRole === null || pinned === null) return null;
  if (!url && !name && !note && !text && !dominantColors?.length) return null;

  return { kind, url, name, platform, note, crawl, mimeType, sizeBytes, text, dominantColors, assetRole, pinned };
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseLimitedString(value: unknown, maxLength: number): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  if (!cleaned) return undefined;
  return cleaned.length <= maxLength ? cleaned : null;
}

function parseCrawlOptions(value: unknown): BrandVaultCrawlOptions | undefined | null {
  if (value === undefined) return undefined;
  if (!isObjectRecord(value)) return null;

  const maxPages = parseBoundedInteger(value.maxPages, 1, 24);
  const maxDepth = parseBoundedInteger(value.maxDepth, 0, 3);
  const includePaths = parsePathList(value.includePaths);
  const excludePaths = parsePathList(value.excludePaths);
  if (maxPages === null || maxDepth === null || includePaths === null || excludePaths === null) return null;

  const crawl: BrandVaultCrawlOptions = {};
  if (maxPages !== undefined) crawl.maxPages = maxPages;
  if (maxDepth !== undefined) crawl.maxDepth = maxDepth;
  if (includePaths !== undefined) crawl.includePaths = includePaths;
  if (excludePaths !== undefined) crawl.excludePaths = excludePaths;
  return crawl;
}

function parseBoundedInteger(value: unknown, min: number, max: number): number | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  return value >= min && value <= max ? value : null;
}

function parsePathList(value: unknown): string[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 20) return null;
  const paths = value.map(cleanString).filter(Boolean);
  if (paths.length !== value.length) return null;
  return [...new Set(paths.map(normalizeCrawlPath))];
}

function normalizeCrawlPath(value: string): string {
  return value.startsWith('/') ? value : `/${value}`;
}

function parseColorList(value: unknown): string[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 24) return null;
  const colors = value.map((item) => normalizeHexColor(cleanString(item)));
  if (colors.some((color) => !color)) return null;
  return [...new Set(colors.filter((color): color is string => Boolean(color)))];
}

function normalizeHexColor(value: string): string | undefined {
  const hex = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/.test(hex)) return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  return undefined;
}

function parseAssetRole(value: unknown): BrandVaultUploadedAssetRole | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return null;
  const role = value.trim() as BrandVaultUploadedAssetRole;
  if (!role) return undefined;
  return UPLOADED_ASSET_ROLES.has(role) ? role : null;
}

function parseOptionalBoolean(value: unknown): boolean | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === 'boolean' ? value : null;
}

function statusForDraftFailure(result: Extract<BrandVaultWebsiteDraftJobResult, { ok: false }>): number {
  if (result.error.code === 'invalid_url') return 400;
  if (result.error.code === 'fetch_failed') return 422;
  return 500;
}

function invalidRequest(message: string): BrandVaultApiResult<BrandVaultApiErrorBody> {
  return { status: 400, body: { ok: false, error: { code: 'invalid_request', message } } };
}

function notFound(message: string): BrandVaultApiResult<BrandVaultApiErrorBody> {
  return { status: 404, body: { ok: false, error: { code: 'not_found', message } } };
}

function profileOnlyJob(record: BrandSignalProfileRecord): BrandRefineryJob {
  return {
    id: `profile_only_${record.id}`,
    userId: record.profile.userId ?? 'unknown',
    brandId: record.profile.brandId,
    status: record.status === 'accepted' ? 'accepted' : record.status === 'rejected' ? 'rejected' : 'needs_review',
    inputs: { socialLinks: [], sourceEvidence: [] },
    warnings: [],
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function cloneSnapshot(snapshot: BrandVaultRefineryJobSnapshot): BrandVaultRefineryJobSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as BrandVaultRefineryJobSnapshot;
}
