import type { BrandSignalProfile } from './brand-signal-profile';
import {
  brandAccessKey,
  filterAccessibleBrands,
  isBrandAccessible,
  mintBrandId,
  normalizeBrandAccessUserIds,
  type BrandAccessGrants,
} from './brand-access';
import {
  collectBrandSignals,
  type BrandSignalLifecycleOptions,
  type BrandSignalProfileRecord,
} from './brand-signal-lifecycle';
import {
  createInMemoryBrandSignalProfileRepository,
  type BrandSignalProfileRepositoryResult,
} from './brand-signal-profile-repository';
import {
  applyBrandVaultSignalValueEditsToDraftRecord,
  createBrandVaultDraftReviewPayload,
  createBrandVaultWebsiteDraftJob,
  type BrandVaultSignalProfileStore,
  type BrandVaultStoreResult,
  type BrandVaultAcceptedProfileFilter,
  type BrandVaultSignalValueEdit,
  type BrandVaultTextEvidenceCompiler,
  type BrandVaultWebsiteDraftJobResult,
  type BrandVaultWebsiteDraftReviewPayload,
} from './brand-vault-draft-orchestrator';
import {
  createBrandVaultVisualAssetStorageFromEnvironment,
  type BrandVaultVisualAssetStorageProvider,
} from './brand-vault-visual-asset-storage';
import {
  createBrandVaultSectionScreenshotCaptureFromEnvironment,
  createBrandVaultWebsiteScreenshotCaptureFromEnvironment,
  type CaptureBrandVaultSectionScreenshots,
  type CaptureBrandVaultWebsiteScreenshot,
} from './brand-vault-website-screenshot';
import {
  createBrandVaultVisionDecoderFromEnvironment,
  type DecodeBrandVaultProductUiModel,
} from './brand-vault-vision-decode';
import type {
  BrandEvidenceCandidate,
  BrandVaultCrawlOptions,
  BrandRefineryJob,
  BrandVaultSocialConnectionEvidence,
  BrandVaultSocialMediaEvidence,
  BrandVaultSocialMetricsEvidence,
  BrandVaultSocialProfileEvidence,
  BrandVaultSourceEvidenceOrigin,
  BrandVaultSourceInput,
  BrandVaultUploadedAssetRole,
  FetchWebsiteBrandSnapshotOptions,
} from './brand-website-refinery-types';
import { createBrandVaultMongoRefineryStoreFromEnvironment } from './brand-vault-mongo-store';
import {
  createBrandSignalLearningEvent,
  type BrandSignalLearningEvent,
} from './brand-signal-edit-weighting';

export type BrandVaultSourceEvidenceProviderResult = {
  sourceEvidence?: BrandVaultSourceInput[];
  warnings?: string[];
};

export type BrandVaultSourceEvidenceProvider = (args: {
  userId: string;
  orgId?: string;
  websiteUrl: string;
  brandId?: string;
  companyName?: string;
  socialLinks: string[];
  sourceEvidence: BrandVaultSourceInput[];
}) => BrandVaultStoreResult<BrandVaultSourceEvidenceProviderResult | null | undefined>;

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
      | 'conflict'
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

export type BrandVaultRefineryJobListFilter = {
  brandId?: string;
  userId?: string;
  orgId?: string | null;
  statuses?: BrandRefineryJob['status'][];
  updatedBefore?: string;
  limit?: number;
  sort?: 'updatedAtAsc' | 'updatedAtDesc';
};

export type BrandVaultAcceptedBrandListFilter = {
  orgId?: string | null;
  userId?: string;
  limit?: number;
  /** Org context only: when true the requester bypasses brand-access restrictions (agency admin). */
  isOrgAdmin?: boolean;
};

/** Agency ACL: assign a brand to specific org users. An empty userIds list CLEARS the restriction. */
export interface BrandAccessAssignmentInput {
  orgId: string;
  brandId: string;
  userIds: string[];
}

export interface BrandVaultAcceptedBrandSummary {
  brandId: string;
  name: string;
  recordId: string;
  orgId?: string;
  userId?: string;
  acceptedAt?: string;
  updatedAt: string;
}

/**
 * The only fields the slow visual-enrichment worker is allowed to add after a
 * draft has been persisted. Keeping this narrow prevents a stale scan result
 * from replacing reviewed brand truth.
 */
export type BrandVaultDraftProductUiPatch = {
  productUiModel?: BrandSignalProfile['productUiModel'];
  productUiModelDecodeAttemptedAt?: string;
};

export interface BrandVaultRefineryStore extends BrandVaultSignalProfileStore {
  patchDraftProductUi(input: {
    recordId: string;
    expectedUpdatedAt: string;
    patch: BrandVaultDraftProductUiPatch;
    options?: BrandSignalLifecycleOptions;
  }): BrandVaultStoreResult<BrandSignalProfileRecord | null>;
  getLatestAcceptedRecord(filter: BrandVaultAcceptedProfileFilter): BrandVaultStoreResult<BrandSignalProfileRecord | null>;
  listAcceptedBrands?(filter?: BrandVaultAcceptedBrandListFilter): BrandVaultStoreResult<BrandVaultAcceptedBrandSummary[]>;
  /** Agency ACL: assign a brand to specific org users ([] clears). Optional — stores omitting it grant all. */
  setBrandAccess?(input: BrandAccessAssignmentInput): BrandVaultStoreResult<void>;
  /** Agency ACL: brand->users assignments for an org (only RESTRICTED brands appear). */
  getBrandAccessGrants?(orgId: string): BrandVaultStoreResult<BrandAccessGrants>;
  saveJobSnapshot(snapshot: BrandVaultRefineryJobSnapshot): BrandVaultStoreResult<BrandVaultRefineryJobSnapshot>;
  getJobSnapshot(jobId: string): BrandVaultStoreResult<BrandVaultRefineryJobSnapshot | null>;
  getJobSnapshotByRecordId(recordId: string): BrandVaultStoreResult<BrandVaultRefineryJobSnapshot | null>;
  listJobSnapshots?(filter?: BrandVaultRefineryJobListFilter): BrandVaultStoreResult<BrandVaultRefineryJobSnapshot[]>;
  /**
   * Delete a scan's job snapshot (the Recent-scans history entry). Owner-scoped: only the user who ran the
   * scan can delete it. NEVER touches the accepted brand profile (a separate record) — deleting a scan only
   * removes it from history. Returns true if a snapshot was deleted. Optional — stores may omit it.
   */
  deleteJobSnapshot?(
    jobId: string,
    scope: { userId: string; orgId: string | null },
  ): BrandVaultStoreResult<boolean>;
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
  signalEdits?: unknown;
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

export type CreateQueuedBrandVaultRefineryJobSuccessBody = {
  ok: true;
  job: BrandRefineryJob;
  record: null;
  reviewPayload: null;
  candidates: [];
};

export type QueuedBrandVaultRefineryJobStart =
  | {
      response: BrandVaultApiResult<CreateQueuedBrandVaultRefineryJobSuccessBody>;
      run: () => Promise<void>;
    }
  | {
      response: BrandVaultApiResult<BrandVaultApiErrorBody>;
      run?: undefined;
    };

export type GetBrandVaultRefineryJobSuccessBody = {
  ok: true;
  job: BrandRefineryJob;
  record: BrandSignalProfileRecord | null;
  reviewPayload: BrandVaultWebsiteDraftReviewPayload | null;
  candidates: BrandEvidenceCandidate[];
};

type GetBrandVaultRefineryJobDependencies = {
  store: BrandVaultRefineryStore;
  clock?: () => string;
  staleAfterMs?: number;
};

type BrandVaultRefineryJobExecutionDependencies = {
  store: BrandVaultRefineryStore;
  fetchOptions?: FetchWebsiteBrandSnapshotOptions;
  clock?: () => string;
  sourceEvidenceProvider?: BrandVaultSourceEvidenceProvider;
  textEvidenceCompiler?: BrandVaultTextEvidenceCompiler;
  visualAssetStorage?: BrandVaultVisualAssetStorageProvider | null;
  captureWebsiteScreenshot?: CaptureBrandVaultWebsiteScreenshot | null;
  captureSectionScreenshots?: CaptureBrandVaultSectionScreenshots | null;
  decodeProductUiModel?: DecodeBrandVaultProductUiModel | null;
};

export type ProcessQueuedBrandVaultRefineryJobResult = {
  processed: boolean;
  jobId?: string;
  status?: BrandRefineryJob['status'];
  reason?: 'store_does_not_support_listing' | 'empty_queue';
  error?: string;
};

export type ReviewBrandVaultSignalProfileSuccessBody = {
  ok: true;
  record: BrandSignalProfileRecord;
  job: BrandRefineryJob | null;
  reviewPayload: BrandVaultWebsiteDraftReviewPayload | null;
  superseded: BrandSignalProfileRecord[];
  learningEvents: BrandSignalLearningEvent[];
};

const DEFAULT_REFINERY_JOB_STALE_AFTER_MS = 10 * 60 * 1000;
const DEFAULT_REFINERY_RUNNING_RETRY_AFTER_MS = 6 * 60 * 1000;

export class InMemoryBrandVaultRefineryStore implements BrandVaultRefineryStore {
  private readonly profiles = createInMemoryBrandSignalProfileRepository();
  private readonly jobs = new Map<string, BrandVaultRefineryJobSnapshot>();
  private readonly recordToJob = new Map<string, string>();
  // Agency ACL: `${orgId}::${brandId}` -> allowed userIds. Only RESTRICTED brands are stored.
  private readonly brandAccess = new Map<string, string[]>();

  saveRecord(record: BrandSignalProfileRecord, options: BrandSignalLifecycleOptions = {}): BrandSignalProfileRecord {
    return this.profiles.saveRecord(record, options);
  }

  patchDraftProductUi(input: {
    recordId: string;
    expectedUpdatedAt: string;
    patch: BrandVaultDraftProductUiPatch;
    options?: BrandSignalLifecycleOptions;
  }): BrandSignalProfileRecord | null {
    const current = this.profiles.getRecord(input.recordId);
    if (!current || current.status !== 'draft' || current.updatedAt !== input.expectedUpdatedAt) return null;

    return this.profiles.saveRecord(
      {
        ...current,
        profile: {
          ...current.profile,
          ...input.patch,
        },
        updatedAt: input.options?.now ?? new Date().toISOString(),
      },
      input.options,
    );
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

  getLatestAcceptedProfile(filter: BrandVaultAcceptedProfileFilter): BrandSignalProfile | null {
    return this.profiles.getLatestAcceptedProfile(filter);
  }

  getLatestAcceptedRecord(filter: BrandVaultAcceptedProfileFilter): BrandSignalProfileRecord | null {
    return this.profiles.getLatestAcceptedRecord(filter);
  }

  listAcceptedBrands(filter: BrandVaultAcceptedBrandListFilter = {}): BrandVaultAcceptedBrandSummary[] {
    const inOrg = filter.orgId !== undefined && filter.orgId !== null;
    const scopedUserId = inOrg ? undefined : filter.userId;
    const summaries = summarizeAcceptedBrandRecords(
      this.profiles.listRecords({ orgId: filter.orgId, userId: scopedUserId, status: 'accepted' }),
      // In an org we summarize broad, filter by access, THEN slice — so a restricted brand never eats a slot.
      inOrg ? undefined : filter.limit,
    );
    if (!inOrg) return summaries;
    const accessible = filterAccessibleBrands(summaries, this.readBrandAccessGrants(filter.orgId as string), {
      userId: filter.userId,
      isOrgAdmin: filter.isOrgAdmin,
    });
    return typeof filter.limit === 'number' ? accessible.slice(0, Math.max(1, filter.limit)) : accessible;
  }

  setBrandAccess(input: BrandAccessAssignmentInput): void {
    const key = brandAccessKey(input.orgId, input.brandId);
    const userIds = normalizeBrandAccessUserIds(input.userIds);
    if (userIds.length === 0) this.brandAccess.delete(key); // empty = reopen the brand to the whole org
    else this.brandAccess.set(key, userIds);
  }

  getBrandAccessGrants(orgId: string): BrandAccessGrants {
    return this.readBrandAccessGrants(orgId);
  }

  private readBrandAccessGrants(orgId: string): Map<string, string[]> {
    const prefix = brandAccessKey(orgId, '');
    const grants = new Map<string, string[]>();
    for (const [key, userIds] of this.brandAccess) {
      if (key.startsWith(prefix)) grants.set(key.slice(prefix.length), [...userIds]);
    }
    return grants;
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

  deleteJobSnapshot(jobId: string, scope: { userId: string; orgId: string | null }): boolean {
    const snapshot = this.jobs.get(jobId);
    if (!snapshot || snapshot.job.userId !== scope.userId) return false;
    this.jobs.delete(jobId);
    if (snapshot.recordId) this.recordToJob.delete(snapshot.recordId);
    return true;
  }

  listJobSnapshots(filter: BrandVaultRefineryJobListFilter = {}): BrandVaultRefineryJobSnapshot[] {
    const statuses = new Set(filter.statuses);
    const updatedBeforeMs = filter.updatedBefore ? Date.parse(filter.updatedBefore) : null;
    const limit = Math.max(1, Math.min(filter.limit ?? 25, 100));
    return Array.from(this.jobs.values())
      .filter((snapshot) => !filter.brandId || snapshot.job.brandId === filter.brandId)
      .filter((snapshot) => !filter.userId || snapshot.job.userId === filter.userId)
      .filter((snapshot) => filter.orgId === undefined || (snapshot.job.orgId ?? null) === filter.orgId)
      .filter((snapshot) => statuses.size === 0 || statuses.has(snapshot.job.status))
      .filter((snapshot) => {
        if (updatedBeforeMs === null || !Number.isFinite(updatedBeforeMs)) return true;
        const updatedAt = Date.parse(snapshot.job.updatedAt);
        return Number.isFinite(updatedAt) && updatedAt < updatedBeforeMs;
      })
      .sort((a, b) => {
        const delta = Date.parse(a.job.updatedAt) - Date.parse(b.job.updatedAt);
        return filter.sort === 'updatedAtDesc' ? -delta : delta;
      })
      .slice(0, limit)
      .map(cloneSnapshot);
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
          visualIdentity: current.reviewPayload?.visualIdentity,
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
  globalStore.__brandVaultRefineryStore ??= createBrandVaultMongoRefineryStoreFromEnvironment() ?? createDefaultRefineryStore();
  return globalStore.__brandVaultRefineryStore;
}

function createDefaultRefineryStore(): BrandVaultRefineryStore {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Brand Vault persistence is not configured. Set BRAND_VAULT_MONGODB_URI and BRAND_VAULT_MONGODB_DB_NAME before serving production traffic.',
    );
  }
  return createInMemoryBrandVaultRefineryStore();
}

export async function createBrandVaultRefineryJobFromWebsite(
  args: {
    userId: string;
    orgId?: string;
    body: unknown;
    actorId?: string;
    jobId?: string;
  },
  dependencies: BrandVaultRefineryJobExecutionDependencies,
): Promise<BrandVaultApiResult<CreateBrandVaultRefineryJobSuccessBody | BrandVaultApiErrorBody>> {
  const parsed = parseCreateBody(args.body);
  if (!parsed.ok) return parsed.result;

  const providerEvidence = await resolveSourceEvidenceProvider({
    provider: dependencies.sourceEvidenceProvider,
    userId: args.userId,
    orgId: args.orgId,
    websiteUrl: parsed.value.websiteUrl,
    brandId: parsed.value.brandId,
    companyName: parsed.value.companyName,
    socialLinks: parsed.value.socialLinks,
    sourceEvidence: parsed.value.sourceEvidence,
  });
  const sourceEvidence = [...parsed.value.sourceEvidence, ...providerEvidence.sourceEvidence];

  const result = await createBrandVaultWebsiteDraftJob(
    {
      userId: args.userId,
      orgId: args.orgId,
      websiteUrl: parsed.value.websiteUrl,
      brandId: parsed.value.brandId,
      companyName: parsed.value.companyName,
      socialLinks: parsed.value.socialLinks,
      sourceEvidence,
      actorId: args.actorId ?? args.userId,
      now: dependencies.clock?.(),
      jobId: args.jobId,
    },
    {
      repository: dependencies.store,
      fetchOptions: dependencies.fetchOptions,
      clock: dependencies.clock,
      textEvidenceCompiler: dependencies.textEvidenceCompiler,
      visualAssetStorage: resolveVisualAssetStorageProvider(dependencies),
      captureWebsiteScreenshot: resolveWebsiteScreenshotCapture(dependencies),
      captureSectionScreenshots: resolveSectionScreenshotCapture(dependencies),
    },
  );

  if (!result.ok) {
    const failedJob = appendWarningsToJob(result.job, providerEvidence.warnings);
    await dependencies.store.saveJobSnapshot({ job: failedJob, candidates: [] });
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

  const job = appendWarningsToJob(result.job, providerEvidence.warnings);
  const reviewPayload =
    job === result.job
      ? result.reviewPayload
      : createBrandVaultDraftReviewPayload({
          job,
          record: result.record,
          candidates: result.candidates,
          normalizedUrl: result.normalizedUrl,
          warnings: job.warnings,
          visualIdentity: result.reviewPayload.visualIdentity,
        });

  await dependencies.store.saveJobSnapshot({
    job,
    recordId: result.record.id,
    normalizedUrl: result.normalizedUrl,
    candidates: result.candidates,
    reviewPayload,
  });

  // Vision DECODE runs HERE — after the draft record + snapshot are persisted and the scan is already
  // reviewable — because it is slow (~45-100s, GLM vision) and pure enrichment. Keeping it off the scan's
  // critical path means a decode timeout can never lose the whole draft (it did, before). Fail-soft.
  const enrichedRecord = await runProductUiDecodeFollowUp({
    decoder: resolveVisionDecoder(dependencies),
    store: dependencies.store,
    record: result.record,
    sourceUrl: result.normalizedUrl,
    options: { actorId: args.actorId ?? args.userId, now: dependencies.clock?.() },
  });
  const currentRecord = enrichedRecord ?? await dependencies.store.getRecord(result.record.id) ?? result.record;

  return {
    status: 201,
    body: {
      ok: true,
      job,
      record: currentRecord,
      reviewPayload,
      candidates: result.candidates,
    },
  };
}

/**
 * Decode the draft's stored UI screenshots into a Product UI Model and attach it to the exact persisted draft.
 * Runs AFTER the draft is saved (so it never blocks review) and is best-effort: no decoder, no screenshots,
 * a null model, or any error all leave the already-saved draft untouched.
 */
async function runProductUiDecodeFollowUp(args: {
  decoder: DecodeBrandVaultProductUiModel | null;
  store: BrandVaultRefineryStore;
  record: BrandSignalProfileRecord;
  sourceUrl: string;
  options?: BrandSignalLifecycleOptions;
}): Promise<BrandSignalProfileRecord | null> {
  if (!args.decoder) return null;
  const screenshotUrls = args.record.profile.assets?.uiScreenshots?.value;
  if (!Array.isArray(screenshotUrls) || screenshotUrls.length === 0) return null;
  try {
    const productUiModel = await args.decoder({ url: args.sourceUrl, screenshotUrls });
    if (!productUiModel) return null;
    return await args.store.patchDraftProductUi({
      recordId: args.record.id,
      expectedUpdatedAt: args.record.updatedAt,
      patch: { productUiModel },
      options: args.options,
    });
  } catch (error) {
    console.warn(
      '[BrandVault:visionDecode] product UI decode follow-up skipped:',
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

// Cron backfill: re-decode drafts whose inline decode never landed (function killed mid-decode, or a
// transient GLM/network error). Retry no more than once per cooldown per record so a permanently
// un-decodable draft (e.g. its screenshots were pruned) can't starve the others.
const PRODUCT_UI_DECODE_RETRY_COOLDOWN_MS = 30 * 60 * 1000; // 30 min ← retry backoff; cron fires every minute
const PRODUCT_UI_DECODE_SCAN_LIMIT = 25; // ← matches listJobSnapshots default page size

export type ProcessPendingProductUiDecodeResult = {
  processed: boolean;
  recordId?: string;
  /** True when this pass produced a productUiModel; false when the attempt ran but decode returned nothing. */
  decoded?: boolean;
  reason?: 'decode_disabled' | 'store_does_not_support_listing' | 'nothing_pending';
};

/**
 * Find the oldest needs-review draft that captured UI screenshots but still has no productUiModel (its inline
 * decode never completed) and decode it. Best-effort + cooldown-gated: stamps the attempt BEFORE decoding and
 * persists it, so even a mid-decode function kill applies the cooldown instead of hot-looping on one record.
 */
export async function processNextPendingProductUiDecode(
  dependencies: BrandVaultRefineryJobExecutionDependencies,
): Promise<ProcessPendingProductUiDecodeResult> {
  const decoder = resolveVisionDecoder(dependencies);
  if (!decoder) return { processed: false, reason: 'decode_disabled' };
  if (!dependencies.store.listJobSnapshots) return { processed: false, reason: 'store_does_not_support_listing' };

  const now = dependencies.clock?.() ?? new Date().toISOString();
  const cooldownCutoffMs = Date.parse(now) - PRODUCT_UI_DECODE_RETRY_COOLDOWN_MS;
  const snapshots = await dependencies.store.listJobSnapshots({
    statuses: ['needs_review'],
    limit: PRODUCT_UI_DECODE_SCAN_LIMIT,
    sort: 'updatedAtAsc',
  });

  for (const snapshot of snapshots) {
    if (!snapshot.recordId) continue;
    const record = await dependencies.store.getRecord(snapshot.recordId);
    if (!record || !recordNeedsProductUiDecode(record, cooldownCutoffMs)) continue;

    // Stamp + persist the attempt BEFORE decoding: a kill mid-decode still applies the cooldown.
    const options: BrandSignalLifecycleOptions = { actorId: record.profile.userId ?? 'system', now };
    const marked = await dependencies.store.patchDraftProductUi({
      recordId: record.id,
      expectedUpdatedAt: record.updatedAt,
      patch: { productUiModelDecodeAttemptedAt: now },
      options,
    });
    if (!marked) continue;

    const decoded = await runProductUiDecodeFollowUp({
      decoder,
      store: dependencies.store,
      record: marked,
      sourceUrl: snapshot.normalizedUrl ?? snapshot.job.inputs.websiteUrl ?? '',
      options,
    });
    return { processed: true, recordId: snapshot.recordId, decoded: Boolean(decoded?.profile.productUiModel) };
  }
  return { processed: false, reason: 'nothing_pending' };
}

function recordNeedsProductUiDecode(record: BrandSignalProfileRecord, cooldownCutoffMs: number): boolean {
  const urls = record.profile.assets?.uiScreenshots?.value;
  if (!Array.isArray(urls) || urls.length === 0) return false; // nothing to decode
  if (record.profile.productUiModel) return false; // already decoded
  const attemptedAt = record.profile.productUiModelDecodeAttemptedAt;
  if (!attemptedAt) return true; // never attempted by the backfill
  const attemptedMs = Date.parse(attemptedAt);
  if (!Number.isFinite(attemptedMs)) return true; // unparseable marker -> allow a retry
  return !Number.isFinite(cooldownCutoffMs) || attemptedMs < cooldownCutoffMs; // cooldown elapsed
}

export async function startQueuedBrandVaultRefineryJobFromWebsite(
  args: {
    userId: string;
    orgId?: string;
    body: unknown;
    actorId?: string;
  },
  dependencies: BrandVaultRefineryJobExecutionDependencies,
): Promise<QueuedBrandVaultRefineryJobStart> {
  const parsed = parseCreateBody(args.body);
  if (!parsed.ok) return { response: parsed.result };

  const now = dependencies.clock?.() ?? new Date().toISOString();
  const jobId = createDefaultRefineryJobId({
    userId: args.userId,
    orgId: args.orgId,
    brandId: parsed.value.brandId,
    websiteUrl: parsed.value.websiteUrl,
    now,
  });
  const queuedJob: BrandRefineryJob = {
    id: jobId,
    userId: args.userId,
    orgId: args.orgId,
    brandId: parsed.value.brandId,
    status: 'queued',
    inputs: {
      websiteUrl: parsed.value.websiteUrl,
      companyName: parsed.value.companyName,
      socialLinks: parsed.value.socialLinks,
      sourceEvidence: parsed.value.sourceEvidence,
    },
    warnings: ['Brand Vault scan queued; refresh or poll this job id for review results.'],
    createdAt: now,
    updatedAt: now,
  };
  await dependencies.store.saveJobSnapshot({ job: queuedJob, candidates: [] });

  const run = async (): Promise<void> => {
    await runQueuedBrandVaultRefineryJobSnapshot({ job: queuedJob, candidates: [] }, dependencies);
  };

  return {
    response: {
      status: 202,
      body: {
        ok: true,
        job: queuedJob,
        record: null,
        reviewPayload: null,
        candidates: [],
      },
    },
    run,
  };
}

export async function processNextQueuedBrandVaultRefineryJob(
  dependencies: BrandVaultRefineryJobExecutionDependencies & { updatedBefore?: string },
): Promise<ProcessQueuedBrandVaultRefineryJobResult> {
  if (!dependencies.store.listJobSnapshots) {
    return { processed: false, reason: 'store_does_not_support_listing' };
  }

  const now = dependencies.clock?.() ?? new Date().toISOString();
  let snapshots = await dependencies.store.listJobSnapshots({
    statuses: ['queued'],
    updatedBefore: dependencies.updatedBefore ?? now,
    limit: 1,
  });
  if (!snapshots[0]) {
    snapshots = await dependencies.store.listJobSnapshots({
      statuses: ['running'],
      updatedBefore: isoBefore(now, DEFAULT_REFINERY_RUNNING_RETRY_AFTER_MS),
      limit: 1,
    });
  }
  const snapshot = snapshots[0];
  if (!snapshot) return { processed: false, reason: 'empty_queue' };

  try {
    const completed = await runQueuedBrandVaultRefineryJobSnapshot(snapshot, dependencies);
    return {
      processed: true,
      jobId: completed.job.id,
      status: completed.job.status,
    };
  } catch (error) {
    const failed = await dependencies.store.getJobSnapshot(snapshot.job.id);
    return {
      processed: true,
      jobId: snapshot.job.id,
      status: failed?.job.status ?? 'failed',
      error: errorMessage(error),
    };
  }
}

export async function runQueuedBrandVaultRefineryJobSnapshot(
  snapshot: BrandVaultRefineryJobSnapshot,
  dependencies: BrandVaultRefineryJobExecutionDependencies,
): Promise<BrandVaultRefineryJobSnapshot> {
  if (snapshot.recordId || !isActiveRefineryJobStatus(snapshot.job.status)) return snapshot;
  if (!snapshot.job.inputs.websiteUrl) {
    const failedAt = dependencies.clock?.() ?? new Date().toISOString();
    return dependencies.store.saveJobSnapshot({
      ...snapshot,
      job: {
        ...snapshot.job,
        status: 'failed',
        warnings: mergeWarnings(snapshot.job.warnings, [
          'Brand Vault scan could not run because the queued job is missing websiteUrl.',
        ]),
        updatedAt: failedAt,
      },
      candidates: [],
      reviewPayload: undefined,
    });
  }

  const runningAt = dependencies.clock?.() ?? new Date().toISOString();
  const runningJob: BrandRefineryJob = {
    ...snapshot.job,
    status: 'running',
    warnings: ['Brand Vault scan is running; refresh or poll this job id for review results.'],
    updatedAt: runningAt,
  };
  await dependencies.store.saveJobSnapshot({
    ...snapshot,
    job: runningJob,
    candidates: [],
    reviewPayload: undefined,
  });

  try {
    await createBrandVaultRefineryJobFromWebsite(
      {
        userId: runningJob.userId,
        orgId: runningJob.orgId,
        actorId: runningJob.userId,
        jobId: runningJob.id,
        body: {
          websiteUrl: runningJob.inputs.websiteUrl,
          brandId: runningJob.brandId,
          companyName: runningJob.inputs.companyName,
          socialLinks: runningJob.inputs.socialLinks,
          sourceEvidence: runningJob.inputs.sourceEvidence,
        },
      },
      dependencies,
    );
    return (await dependencies.store.getJobSnapshot(runningJob.id)) ?? { ...snapshot, job: runningJob };
  } catch (error) {
    const failedAt = dependencies.clock?.() ?? new Date().toISOString();
    await dependencies.store.saveJobSnapshot({
      job: {
        ...runningJob,
        status: 'failed',
        warnings: mergeWarnings(runningJob.warnings, [
          `Brand Vault scan failed after it started: ${errorMessage(error)}`,
        ]),
        updatedAt: failedAt,
      },
      candidates: [],
    });
    throw error;
  }
}

async function resolveSourceEvidenceProvider(args: {
  provider?: BrandVaultSourceEvidenceProvider;
  userId: string;
  orgId?: string;
  websiteUrl: string;
  brandId?: string;
  companyName?: string;
  socialLinks: string[];
  sourceEvidence: BrandVaultSourceInput[];
}): Promise<{ sourceEvidence: BrandVaultSourceInput[]; warnings: string[] }> {
  if (!args.provider) return { sourceEvidence: [], warnings: [] };
  try {
    const result = await args.provider({
      userId: args.userId,
      orgId: args.orgId,
      websiteUrl: args.websiteUrl,
      brandId: args.brandId,
      companyName: args.companyName,
      socialLinks: args.socialLinks,
      sourceEvidence: args.sourceEvidence,
    });
    return {
      sourceEvidence: result?.sourceEvidence?.slice(0, 20) ?? [],
      warnings: result?.warnings ?? [],
    };
  } catch (error) {
    return {
      sourceEvidence: [],
      warnings: [`Brand Vault connected social enrichment skipped: ${errorMessage(error)}`],
    };
  }
}

function appendWarningsToJob(job: BrandRefineryJob, warnings: string[]): BrandRefineryJob {
  if (warnings.length === 0) return job;
  return { ...job, warnings: mergeWarnings(job.warnings, warnings) };
}

function resolveVisualAssetStorageProvider(
  dependencies: BrandVaultRefineryJobExecutionDependencies,
): BrandVaultVisualAssetStorageProvider | null {
  if (dependencies.visualAssetStorage !== undefined) return dependencies.visualAssetStorage;
  return createBrandVaultVisualAssetStorageFromEnvironment();
}

function resolveWebsiteScreenshotCapture(
  dependencies: BrandVaultRefineryJobExecutionDependencies,
): CaptureBrandVaultWebsiteScreenshot | null {
  if (dependencies.captureWebsiteScreenshot !== undefined) return dependencies.captureWebsiteScreenshot;
  return createBrandVaultWebsiteScreenshotCaptureFromEnvironment() ?? null;
}

function resolveSectionScreenshotCapture(
  dependencies: BrandVaultRefineryJobExecutionDependencies,
): CaptureBrandVaultSectionScreenshots | null {
  if (dependencies.captureSectionScreenshots !== undefined) return dependencies.captureSectionScreenshots;
  return createBrandVaultSectionScreenshotCaptureFromEnvironment() ?? null;
}

function resolveVisionDecoder(
  dependencies: BrandVaultRefineryJobExecutionDependencies,
): DecodeBrandVaultProductUiModel | null {
  if (dependencies.decodeProductUiModel !== undefined) return dependencies.decodeProductUiModel;
  return createBrandVaultVisionDecoderFromEnvironment() ?? null;
}

function mergeWarnings(...groups: string[][]): string[] {
  return [...new Set(groups.flat().filter(Boolean))];
}

function createDefaultRefineryJobId(args: {
  userId: string;
  orgId?: string;
  brandId?: string;
  websiteUrl: string;
  now: string;
}): string {
  const owner = idPart(args.brandId ?? args.orgId ?? args.userId, 'brand');
  const website = idPart(args.websiteUrl, 'website');
  return `brand_refinery_job_${owner}_${website}_${Date.parse(args.now) || 0}`;
}

function idPart(value: string, fallback: string): string {
  const clean = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);
  return clean || fallback;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export async function getBrandVaultRefineryJob(
  args: { userId: string; orgId?: string; jobId: string },
  dependencies: GetBrandVaultRefineryJobDependencies,
): Promise<BrandVaultApiResult<GetBrandVaultRefineryJobSuccessBody | BrandVaultApiErrorBody>> {
  const jobId = args.jobId.trim();
  if (!jobId) return invalidRequest('Missing jobId.');

  const storedSnapshot = await dependencies.store.getJobSnapshot(jobId);
  const snapshot = storedSnapshot
    ? await failStaleActiveJobSnapshot(storedSnapshot, dependencies)
    : null;
  if (!snapshot || !matchesAuthenticatedBrandVaultScope(snapshot.job, args)) return notFound('Brand Vault refinery job was not found.');

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
            visualIdentity: snapshot.reviewPayload?.visualIdentity,
          })
        : snapshot.reviewPayload ?? null,
      candidates: snapshot.candidates,
    },
  };
}

async function failStaleActiveJobSnapshot(
  snapshot: BrandVaultRefineryJobSnapshot,
  dependencies: GetBrandVaultRefineryJobDependencies,
): Promise<BrandVaultRefineryJobSnapshot> {
  if (snapshot.recordId || !isActiveRefineryJobStatus(snapshot.job.status)) return snapshot;
  const now = dependencies.clock?.() ?? new Date().toISOString();
  const staleAfterMs = dependencies.staleAfterMs ?? DEFAULT_REFINERY_JOB_STALE_AFTER_MS;
  if (!isStaleRefineryJob(snapshot.job, now, staleAfterMs)) return snapshot;
  const staleMinutes = Math.max(1, Math.round(staleAfterMs / 60_000));
  return dependencies.store.saveJobSnapshot({
    ...snapshot,
    job: {
      ...snapshot.job,
      status: 'failed',
      warnings: mergeWarnings(snapshot.job.warnings, [
        `Brand Vault scan timed out after ${staleMinutes} minutes without progress. Start a new scan to retry.`,
      ]),
      updatedAt: now,
    },
  });
}

function isActiveRefineryJobStatus(status: BrandRefineryJob['status']): boolean {
  return status === 'queued' || status === 'running';
}

function isStaleRefineryJob(job: BrandRefineryJob, now: string, staleAfterMs: number): boolean {
  const updatedAt = Date.parse(job.updatedAt);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(updatedAt) || !Number.isFinite(nowMs)) return false;
  return nowMs - updatedAt >= staleAfterMs;
}

function isoBefore(now: string, deltaMs: number): string {
  const nowMs = Date.parse(now);
  return new Date((Number.isFinite(nowMs) ? nowMs : Date.now()) - deltaMs).toISOString();
}

export async function getBrandVaultSignalProfile(
  args: { userId: string; orgId?: string; isOrgAdmin?: boolean; recordId: string },
  dependencies: { store: BrandVaultRefineryStore },
): Promise<BrandVaultApiResult<GetBrandVaultRefineryJobSuccessBody | BrandVaultApiErrorBody>> {
  const recordId = args.recordId.trim();
  if (!recordId) return invalidRequest('Missing record id.');

  const record = await dependencies.store.getRecord(recordId);
  if (!record || !await canAccessBrandSignalProfile(record.profile, args, dependencies.store)) {
    return notFound('Brand signal profile was not found.');
  }

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
        visualIdentity: snapshot?.reviewPayload?.visualIdentity,
      }),
      candidates: snapshot?.candidates ?? [],
    },
  };
}

export async function reviewBrandVaultSignalProfileDraft(
  args: {
    userId: string;
    orgId?: string;
    isOrgAdmin?: boolean;
    recordId: string;
    body: unknown;
    actorId?: string;
    now?: string;
  },
  dependencies: { store: BrandVaultRefineryStore },
): Promise<BrandVaultApiResult<ReviewBrandVaultSignalProfileSuccessBody | BrandVaultApiErrorBody>> {
  const record = await dependencies.store.getRecord(args.recordId);
  if (!record || !await canAccessBrandSignalProfile(record.profile, args, dependencies.store)) {
    return notFound('Brand signal profile was not found.');
  }

  const body = isObjectRecord(args.body) ? args.body : {};
  const action = typeof body.action === 'string' ? body.action.trim() : '';
  const now = args.now ?? new Date().toISOString();
  const options = { actorId: args.actorId ?? args.userId, now };
  const parsedSignalEdits = parseSignalValueEdits(body.signalEdits);
  if (!parsedSignalEdits.ok) return invalidRequest(parsedSignalEdits.message);
  if (action === 'accept' && !cleanString(record.profile.brandId)) {
    // First-run / pre-mint drafts can lack a brandId, which would make them PERMANENTLY un-acceptable
    // (and the user's review work unrecoverable — the old behavior just refused). Mint a stable one and
    // persist it BEFORE accept (which only flips status), so the accepted profile carries the brandId and
    // shows up in the switcher. Format matches the client scan-mint (`brand_<uuid>`).
    record.profile.brandId = mintBrandId();
    await dependencies.store.saveRecord(record, options);
  }

  const result =
    action === 'accept'
      ? await acceptDraft(record, parsedSignalEdits.value, dependencies.store, options)
      : action === 'reject'
        ? await rejectDraft(args.recordId, body, dependencies.store, options)
        : null;

  if (!result) return invalidRequest('Action must be "accept" or "reject".');
  if (!result.ok) {
    return {
      status: result.code === 'not_draft' || result.code === 'conflict' ? 409 : 422,
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
  const learningEvents = action === 'accept'
    ? createReviewedSignalEditLearningEvents({
        beforeRecord: record,
        afterRecord: result.record,
        signalEdits: parsedSignalEdits.value,
        options,
      })
    : [];
  const snapshot = await dependencies.store.updateJobStatusForRecord(args.recordId, status, options);
  return {
    status: 200,
    body: {
      ok: true,
      record: result.record,
      job: snapshot?.job ?? null,
      reviewPayload: snapshot?.reviewPayload ?? null,
      superseded: result.superseded,
      learningEvents,
    },
  };
}

function createReviewedSignalEditLearningEvents(args: {
  beforeRecord: BrandSignalProfileRecord;
  afterRecord: BrandSignalProfileRecord;
  signalEdits: BrandVaultSignalValueEdit[];
  options: BrandSignalLifecycleOptions;
}): BrandSignalLearningEvent[] {
  const edits = normalizeReviewedLearningEdits(args.signalEdits);
  if (edits.length === 0) return [];

  const beforeSignals = new Map(
    collectBrandSignals(args.beforeRecord.profile).map((entry) => [entry.path, entry.signal]),
  );
  const afterSignals = new Map(
    collectBrandSignals(args.afterRecord.profile).map((entry) => [entry.path, entry.signal]),
  );
  const observedAt = args.options.now ?? new Date().toISOString();
  const learningEvents: BrandSignalLearningEvent[] = [];

  for (const edit of edits) {
    const beforeSignal = beforeSignals.get(edit.path);
    const afterSignal = afterSignals.get(edit.path);
    if (!afterSignal) continue;

    const beforeValue = beforeSignal?.value;
    const afterValue = afterSignal.value;
    if (stableLearningValueKey(beforeValue) === stableLearningValueKey(afterValue)) continue;

    learningEvents.push(createBrandSignalLearningEvent({
      service: 'brand_vault',
      signalPath: edit.path,
      editType: 'direct_review_edit',
      scope: 'brand',
      polarity: 'replace',
      observedAt,
      actorId: args.options.actorId,
      context: {
        userId: args.afterRecord.profile.userId ?? args.beforeRecord.profile.userId,
        brandId: args.afterRecord.profile.brandId ?? args.beforeRecord.profile.brandId,
        sourceId: args.beforeRecord.id,
      },
      beforeValue,
      afterValue,
      observedValue: afterValue,
      note: 'Brand Vault review accepted this manual signal edit.',
    }));
  }

  return learningEvents;
}

function normalizeReviewedLearningEdits(edits: BrandVaultSignalValueEdit[]): BrandVaultSignalValueEdit[] {
  const byPath = new Map<string, BrandVaultSignalValueEdit>();
  for (const edit of edits) {
    const path = edit.path.trim();
    if (!path) continue;
    byPath.set(path, { path, value: edit.value });
  }
  return [...byPath.values()].slice(0, 100);
}

function stableLearningValueKey(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableLearningValueKey).join(',')}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableLearningValueKey(record[key])}`)
    .join(',')}}`;
}

async function acceptDraft(
  record: BrandSignalProfileRecord,
  signalEdits: BrandVaultSignalValueEdit[],
  store: BrandVaultRefineryStore,
  options: BrandSignalLifecycleOptions,
): Promise<BrandSignalProfileRepositoryResult> {
  if (signalEdits.length === 0) return store.acceptDraft(record.id, options);

  const edited = applyBrandVaultSignalValueEditsToDraftRecord(record, signalEdits, options);
  if (!edited.ok) return edited;
  await store.saveRecord(edited.record, options);
  return store.acceptDraft(record.id, options);
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

type ParsedSignalValueEdits =
  | { ok: true; value: BrandVaultSignalValueEdit[] }
  | { ok: false; message: string };

function parseSignalValueEdits(value: unknown): ParsedSignalValueEdits {
  if (value === undefined) return { ok: true, value: [] };
  if (!Array.isArray(value)) return { ok: false, message: 'signalEdits must be an array when provided.' };
  if (value.length > 100) return { ok: false, message: 'signalEdits can include at most 100 edits.' };

  const edits: BrandVaultSignalValueEdit[] = [];
  for (const item of value) {
    if (!isObjectRecord(item)) return { ok: false, message: 'Each signal edit must be an object.' };
    const path = cleanString(item.path);
    if (!path) return { ok: false, message: 'Each signal edit must include a path.' };
    if (!('value' in item)) return { ok: false, message: 'Each signal edit must include a value.' };
    edits.push({ path, value: item.value });
  }
  return { ok: true, value: edits };
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

const SOURCE_EVIDENCE_ORIGINS = new Set<BrandVaultSourceEvidenceOrigin>([
  'user_supplied',
  'connected_metadata',
  'connected_fetch',
  'public_fallback',
]);

const SOCIAL_MEDIA_TYPES = new Set<NonNullable<BrandVaultSocialMediaEvidence['mediaType']>>([
  'image',
  'video',
  'carousel',
  'link',
  'unknown',
]);

const SOCIAL_CONNECTION_PROVIDERS = new Set<BrandVaultSocialConnectionEvidence['provider']>([
  'uploaderx',
  'clerk_external_account',
  'alyzitron_apify',
]);

const SOCIAL_CONNECTION_STATUSES = new Set<BrandVaultSocialConnectionEvidence['status']>([
  'connected',
  'connected_different_account',
  'scope_missing',
  'not_connected',
  'public_fallback_available',
]);

const SOCIAL_CONNECTION_MATCH_STATUSES = new Set<NonNullable<BrandVaultSocialConnectionEvidence['matchStatus']>>([
  'matched',
  'mismatched',
  'unverified',
]);

const UPLOADED_ASSET_ROLES = new Set<BrandVaultUploadedAssetRole>([
  'brand_book',
  'logo',
  'font',
  'color_palette',
  'product_ui',
  'website_screenshot',
  'team',
  'abstract_reference',
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
  const publishedAt = parseLimitedString(value.publishedAt, 120);
  const media = parseSocialMediaEvidence(value.media);
  const metrics = parseSocialMetricsEvidence(value.metrics);
  const profile = parseSocialProfileEvidence(value.profile);
  const evidenceOrigin = parseSourceEvidenceOrigin(value.evidenceOrigin);
  const connection = parseSocialConnectionEvidence(value.connection);
  if (crawl === null) return null;
  if (
    mimeType === null ||
    text === null ||
    sizeBytes === null ||
    dominantColors === null ||
    assetRole === null ||
    pinned === null ||
    publishedAt === null ||
    media === null ||
    metrics === null ||
    profile === null ||
    evidenceOrigin === null ||
    connection === null
  ) {
    return null;
  }
  const hasRichEvidence = Boolean(publishedAt || media || metrics || profile || evidenceOrigin || connection);
  if (!url && !name && !note && !text && !dominantColors?.length && !hasRichEvidence) return null;

  return {
    kind,
    url,
    name,
    platform,
    note,
    crawl,
    mimeType,
    sizeBytes,
    text,
    dominantColors,
    assetRole,
    pinned,
    publishedAt,
    media,
    metrics,
    profile,
    evidenceOrigin,
    connection,
  };
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

function parseSocialMediaEvidence(value: unknown): BrandVaultSocialMediaEvidence | undefined | null {
  if (value === undefined) return undefined;
  if (!isObjectRecord(value)) return null;
  const mediaTypeValue = cleanString(value.mediaType) as NonNullable<BrandVaultSocialMediaEvidence['mediaType']>;
  const mediaType = SOCIAL_MEDIA_TYPES.has(mediaTypeValue) ? mediaTypeValue : undefined;
  const mediaUrl = parseLimitedString(value.mediaUrl, 2048);
  const thumbnailUrl = parseLimitedString(value.thumbnailUrl, 2048);
  const sampledFrameUrls = parseLimitedStringList(value.sampledFrameUrls, 12, 2048);
  const ocrText = parseLimitedString(value.ocrText, 20_000);
  const transcript = parseLimitedString(value.transcript, 40_000);
  const durationSeconds = parseBoundedNumber(value.durationSeconds, 0, 43_200);
  if (
    mediaUrl === null ||
    thumbnailUrl === null ||
    sampledFrameUrls === null ||
    ocrText === null ||
    transcript === null ||
    durationSeconds === null ||
    (value.mediaType !== undefined && !mediaType)
  ) {
    return null;
  }
  if (!mediaType && !mediaUrl && !thumbnailUrl && !sampledFrameUrls?.length && !ocrText && !transcript && durationSeconds === undefined) {
    return null;
  }
  return { mediaType, mediaUrl, thumbnailUrl, sampledFrameUrls, ocrText, transcript, durationSeconds };
}

function parseSocialMetricsEvidence(value: unknown): BrandVaultSocialMetricsEvidence | undefined | null {
  if (value === undefined) return undefined;
  if (!isObjectRecord(value)) return null;
  const parsed = {
    likeCount: parseBoundedInteger(value.likeCount, 0, 1_000_000_000),
    commentCount: parseBoundedInteger(value.commentCount, 0, 1_000_000_000),
    shareCount: parseBoundedInteger(value.shareCount, 0, 1_000_000_000),
    viewCount: parseBoundedInteger(value.viewCount, 0, 1_000_000_000),
    repostCount: parseBoundedInteger(value.repostCount, 0, 1_000_000_000),
    quoteCount: parseBoundedInteger(value.quoteCount, 0, 1_000_000_000),
    engagementCount: parseBoundedInteger(value.engagementCount, 0, 1_000_000_000),
  };
  if (Object.values(parsed).some((metric) => metric === null)) return null;
  if (!Object.values(parsed).some((metric) => metric !== undefined)) return null;
  return parsed as BrandVaultSocialMetricsEvidence;
}

function parseSocialProfileEvidence(value: unknown): BrandVaultSocialProfileEvidence | undefined | null {
  if (value === undefined) return undefined;
  if (!isObjectRecord(value)) return null;
  const bio = parseLimitedString(value.bio, 5_000);
  const category = parseLimitedString(value.category, 200);
  const website = parseLimitedString(value.website, 2048);
  const followerCount = parseBoundedInteger(value.followerCount, 0, 1_000_000_000);
  if (bio === null || category === null || website === null || followerCount === null) return null;
  if (!bio && !category && !website && followerCount === undefined) return null;
  return { bio, category, website, followerCount };
}

function parseSourceEvidenceOrigin(value: unknown): BrandVaultSourceEvidenceOrigin | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return null;
  const origin = value.trim() as BrandVaultSourceEvidenceOrigin;
  return SOURCE_EVIDENCE_ORIGINS.has(origin) ? origin : null;
}

function parseSocialConnectionEvidence(value: unknown): BrandVaultSocialConnectionEvidence | undefined | null {
  if (value === undefined) return undefined;
  if (!isObjectRecord(value)) return null;
  const provider = cleanString(value.provider) as BrandVaultSocialConnectionEvidence['provider'];
  const status = cleanString(value.status) as BrandVaultSocialConnectionEvidence['status'];
  const accountId = parseLimitedString(value.accountId, 240);
  const accountName = parseLimitedString(value.accountName, 240);
  const accountHandle = parseLimitedString(value.accountHandle, 240);
  const scopes = parseLimitedStringList(value.scopes, 50, 200);
  const missingScopes = parseLimitedStringList(value.missingScopes, 50, 200);
  const canReadProfile = parseOptionalBoolean(value.canReadProfile);
  const canReadPosts = parseOptionalBoolean(value.canReadPosts);
  const canReadPinned = parseOptionalBoolean(value.canReadPinned);
  const matchStatusValue = cleanString(value.matchStatus) as NonNullable<BrandVaultSocialConnectionEvidence['matchStatus']>;
  const matchStatus = SOCIAL_CONNECTION_MATCH_STATUSES.has(matchStatusValue) ? matchStatusValue : undefined;
  if (
    !SOCIAL_CONNECTION_PROVIDERS.has(provider) ||
    !SOCIAL_CONNECTION_STATUSES.has(status) ||
    accountId === null ||
    accountName === null ||
    accountHandle === null ||
    scopes === null ||
    missingScopes === null ||
    canReadProfile === null ||
    canReadPosts === null ||
    canReadPinned === null ||
    canReadProfile === undefined ||
    canReadPosts === undefined ||
    canReadPinned === undefined ||
    (value.matchStatus !== undefined && !matchStatus)
  ) {
    return null;
  }
  return {
    provider,
    status,
    accountId,
    accountName,
    accountHandle,
    scopes,
    missingScopes,
    canReadProfile,
    canReadPosts,
    canReadPinned,
    matchStatus,
  };
}

function parseBoundedInteger(value: unknown, min: number, max: number): number | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  return value >= min && value <= max ? value : null;
}

function parseBoundedNumber(value: unknown, min: number, max: number): number | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value >= min && value <= max ? value : null;
}

function parseLimitedStringList(value: unknown, maxItems: number, maxLength: number): string[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const items = value.map((item) => parseLimitedString(item, maxLength));
  if (items.some((item) => item === null || item === undefined)) return null;
  return [...new Set(items as string[])];
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

function matchesAuthenticatedBrandVaultScope(
  owner: { userId?: string; orgId?: string },
  scope: { userId: string; orgId?: string },
): boolean {
  if (owner.userId !== scope.userId) return false;
  if (scope.orgId !== undefined && owner.orgId !== scope.orgId) return false;
  return true;
}

async function canAccessBrandSignalProfile(
  owner: { userId?: string; orgId?: string; brandId?: string },
  scope: { userId: string; orgId?: string; isOrgAdmin?: boolean },
  store: BrandVaultRefineryStore,
): Promise<boolean> {
  const ownerOrgId = cleanString(owner.orgId);
  const scopeOrgId = cleanString(scope.orgId);
  if (!ownerOrgId) return !scopeOrgId && owner.userId === scope.userId;
  if (!scopeOrgId || ownerOrgId !== scopeOrgId) return false;
  if (scope.isOrgAdmin) return true;

  const brandId = cleanString(owner.brandId);
  if (!brandId) return owner.userId === scope.userId;
  if (!store.getBrandAccessGrants) return true;
  const grants = await store.getBrandAccessGrants(scopeOrgId);
  return isBrandAccessible(brandId, grants, { userId: scope.userId });
}

function notFound(message: string): BrandVaultApiResult<BrandVaultApiErrorBody> {
  return { status: 404, body: { ok: false, error: { code: 'not_found', message } } };
}

function profileOnlyJob(record: BrandSignalProfileRecord): BrandRefineryJob {
  return {
    id: `profile_only_${record.id}`,
    userId: record.profile.userId ?? 'unknown',
    orgId: record.profile.orgId,
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

function summarizeAcceptedBrandRecords(
  records: BrandSignalProfileRecord[],
  limitInput?: number,
): BrandVaultAcceptedBrandSummary[] {
  const limit = Math.max(1, Math.min(limitInput ?? 100, 250));
  const seen = new Set<string>();
  const summaries: BrandVaultAcceptedBrandSummary[] = [];

  for (const record of records) {
    const brandId = record.profile.brandId?.trim();
    if (!brandId || seen.has(brandId)) continue;

    const name = record.profile.identity.brandName.value.trim() || brandId;
    seen.add(brandId);
    summaries.push({
      brandId,
      name,
      recordId: record.id,
      orgId: record.profile.orgId,
      userId: record.profile.userId,
      acceptedAt: record.review.acceptedAt,
      updatedAt: record.updatedAt,
    });
    if (summaries.length >= limit) break;
  }

  return summaries;
}
