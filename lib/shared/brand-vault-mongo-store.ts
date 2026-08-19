import {
  MongoClient,
  type ClientSession,
  type Collection,
  type Db,
  type Document,
  type Filter,
  type IndexDescription,
  type UpdateFilter,
} from 'mongodb';
import type { BrandSignalProfile } from './brand-signal-profile';
import {
  acceptBrandSignalProfileDraft,
  bindBrandSignalDraftToAcceptedRevision,
  brandSignalDraftMatchesAcceptedRevision,
  rejectBrandSignalProfileDraft,
  supersedeBrandSignalProfileRecord,
  type BrandSignalLifecycleOptions,
  type BrandSignalProfileRecord,
} from './brand-signal-lifecycle';
import {
  brandAccessKey,
  filterAccessibleBrands,
  normalizeBrandAccessUserIds,
  type BrandAccessGrants,
} from './brand-access';
import type {
  BrandSignalProfileRepositoryEvent,
  BrandSignalProfileRepositoryEventType,
  BrandSignalProfileRepositoryResult,
} from './brand-signal-profile-repository';
import {
  createBrandVaultDraftReviewPayload,
  type BrandVaultAcceptedProfileFilter,
} from './brand-vault-draft-orchestrator';
import type {
  BrandAccessAssignmentInput,
  BrandVaultAcceptedBrandListFilter,
  BrandVaultAcceptedBrandSummary,
  BrandVaultDraftProductUiPatch,
  BrandVaultRefineryJobListFilter,
  BrandVaultRefineryJobSnapshot,
  BrandVaultRefineryStore,
} from './brand-vault-refinery-api';
import type { BrandRefineryJob } from './brand-website-refinery-types';

export const BRAND_VAULT_COLLECTIONS = {
  profiles: 'brand_signal_profile_records',
  events: 'brand_signal_profile_events',
  jobs: 'brand_refinery_jobs',
  brandAccess: 'brand_access_grants',
} as const;

/** Agency ACL grant. _id = `${orgId}::${brandId}`. Empty userIds = restriction cleared (brand open). */
export interface BrandVaultMongoBrandAccessDocument {
  _id: string;
  orgId: string;
  brandId: string;
  userIds: string[];
  updatedAt: string;
}

export interface BrandVaultMongoProfileDocument {
  _id: string;
  record: BrandSignalProfileRecord;
  status: BrandSignalProfileRecord['status'];
  acceptedScopeKey?: string;
  brandId?: string;
  userId?: string;
  orgId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BrandVaultMongoEventDocument extends BrandSignalProfileRepositoryEvent {
  _id: string;
}

export interface BrandVaultMongoJobDocument {
  _id: string;
  snapshot: BrandVaultRefineryJobSnapshot;
  recordId?: string;
  userId: string;
  orgId?: string | null;
  brandId?: string;
  status: BrandRefineryJob['status'];
  createdAt: string;
  updatedAt: string;
}

export interface BrandVaultMongoCollections {
  profiles: BrandVaultMongoCollection<BrandVaultMongoProfileDocument>;
  events: BrandVaultMongoCollection<BrandVaultMongoEventDocument>;
  jobs: BrandVaultMongoCollection<BrandVaultMongoJobDocument>;
  /** Agency ACL grants. Optional only for legacy/test adapters; organization access fails closed when absent. */
  brandAccess?: BrandVaultMongoCollection<BrandVaultMongoBrandAccessDocument>;
}

export interface BrandVaultMongoCollection<TDocument extends { _id: string }> {
  createIndexes?(indexes: IndexDescription[]): Promise<unknown>;
  findOne(filter: Filter<TDocument>): Promise<TDocument | null>;
  find(filter: Filter<TDocument>): BrandVaultMongoCursor<TDocument>;
  updateOne(
    filter: Filter<TDocument>,
    update: { $set?: Partial<TDocument>; $setOnInsert?: Partial<TDocument> },
    options?: { upsert?: boolean },
  ): Promise<unknown>;
  deleteOne(filter: Filter<TDocument>): Promise<{ deletedCount?: number }>;
}

export interface BrandVaultMongoCursor<TDocument> {
  sort(sort: Record<string, 1 | -1>): BrandVaultMongoCursor<TDocument>;
  limit(limit: number): BrandVaultMongoCursor<TDocument>;
  toArray(): Promise<TDocument[]>;
}

export interface BrandVaultMongoStoreOptions {
  collections: BrandVaultMongoCollections | (() => Promise<BrandVaultMongoCollections>);
  /**
   * Production Mongo passes a transaction-bound collection set here. Keeping it
   * injectable lets the store remain testable without making in-memory tests pretend
   * to provide database isolation.
   */
  withTransaction?: <T>(operation: (collections: BrandVaultMongoCollections) => Promise<T>) => Promise<T>;
}

let cachedMongoClient: Promise<MongoClient> | null = null;

export class BrandVaultMongoRefineryStore implements BrandVaultRefineryStore {
  private ensuredIndexes = false;

  constructor(private readonly options: BrandVaultMongoStoreOptions) {}

  async saveRecord(
    record: BrandSignalProfileRecord,
    options: BrandSignalLifecycleOptions = {},
  ): Promise<BrandSignalProfileRecord> {
    const collections = await this.getCollections();
    let next = record;
    if (record.status === 'draft') {
      const existing = await collections.profiles.findOne({ _id: record.id } as Filter<BrandVaultMongoProfileDocument>);
      if (existing?.record.status === 'draft' && existing.record.baseAcceptedRevision !== undefined) {
        next = { ...record, baseAcceptedRevision: existing.record.baseAcceptedRevision };
      } else if (record.baseAcceptedRevision === undefined) {
        const accepted = await collections.profiles
          .find(toAcceptedScopeFilter(record))
          .sort({ updatedAt: -1 })
          .toArray();
        next = bindBrandSignalDraftToAcceptedRevision(record, accepted[0]?.record ?? null);
      }
    }
    await upsertRecord(collections.profiles, next);
    await appendEvent(collections.events, next.status === 'draft' ? 'draft_saved' : 'record_superseded', next, options);
    return clone(next);
  }

  async patchDraftProductUi(input: {
    recordId: string;
    expectedUpdatedAt: string;
    patch: BrandVaultDraftProductUiPatch;
    options?: BrandSignalLifecycleOptions;
  }): Promise<BrandSignalProfileRecord | null> {
    const collections = await this.getCollections();
    const filter = {
      _id: input.recordId,
      status: 'draft',
      updatedAt: input.expectedUpdatedAt,
    } as Filter<BrandVaultMongoProfileDocument>;
    const current = await collections.profiles.findOne(filter);
    if (!current) return null;

    const next: BrandSignalProfileRecord = {
      ...current.record,
      profile: {
        ...current.record.profile,
        ...input.patch,
      },
      updatedAt: input.options?.now ?? new Date().toISOString(),
    };
    const update = await collections.profiles.updateOne(filter, { $set: profileDocument(next) });
    if (!wasMatched(update)) return null;
    await appendEvent(collections.events, 'draft_saved', next, input.options ?? {});
    return clone(next);
  }

  async getRecord(id: string): Promise<BrandSignalProfileRecord | null> {
    const collections = await this.getCollections();
    const doc = await collections.profiles.findOne({ _id: id } as Filter<BrandVaultMongoProfileDocument>);
    return doc ? clone(doc.record) : null;
  }

  async acceptDraft(
    id: string,
    options: BrandSignalLifecycleOptions = {},
  ): Promise<BrandSignalProfileRepositoryResult> {
    try {
      await this.getCollections();
      return await this.runInTransaction(async (collections) => {
        const current = await collections.profiles.findOne({ _id: id } as Filter<BrandVaultMongoProfileDocument>);
        const draft = current?.record;
        if (!draft) return failure('not_found', 'record', `Brand signal profile record "${id}" was not found.`);
        if (draft.status !== 'draft') {
          return failure('not_draft', 'status', `Only draft profiles can be accepted. Current status: ${draft.status}.`);
        }
        const acceptedDocs = await collections.profiles
          .find(toAcceptedScopeFilter(draft))
          .sort({ updatedAt: -1 })
          .toArray();
        if (!brandSignalDraftMatchesAcceptedRevision(draft, acceptedDocs[0]?.record ?? null)) {
          const result = failure(
            'conflict',
            'baseAcceptedRevision',
            'The accepted brand profile changed after this draft was created. Refresh and create a new draft from the current accepted revision.',
          );
          await appendEvent(collections.events, 'draft_accept_failed', draft, options, {
            issues: result.ok ? [] : result.issues,
          });
          return result;
        }

        const accepted = acceptBrandSignalProfileDraft(draft, options);
        if (!accepted.ok) {
          await appendEvent(collections.events, 'draft_accept_failed', draft, options, { issues: accepted.issues });
          return { ok: false, code: 'validation_failed', issues: accepted.issues };
        }

        // The unique accepted-scope index requires the old record to be superseded
        // first. A Mongo transaction makes that intermediate state invisible to readers.
        const superseded = await this.supersedeExistingAccepted(collections, accepted.record, options);
        await upsertRecord(collections.profiles, accepted.record);
        await appendEvent(collections.events, 'draft_accepted', accepted.record, options);
        return { ok: true, record: clone(accepted.record), superseded: superseded.map(clone) };
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const issues = [{
        severity: 'error' as const,
        code: 'review_required' as const,
        path: 'scope',
        message: 'Another reviewer accepted a profile for this brand scope first. Refresh the Brand Vault before accepting this draft.',
      }];
      const collections = await this.getCollections();
      const draft = await this.getRecord(id);
      if (draft?.status === 'draft') {
        await appendEvent(collections.events, 'draft_accept_failed', draft, options, { issues });
      }
      return { ok: false, code: 'conflict', issues };
    }
  }

  async rejectDraft(
    id: string,
    reason: string,
    options: BrandSignalLifecycleOptions = {},
  ): Promise<BrandSignalProfileRepositoryResult> {
    const collections = await this.getCollections();
    const draft = await this.getRecord(id);
    if (!draft) return failure('not_found', 'record', `Brand signal profile record "${id}" was not found.`);
    if (draft.status !== 'draft') {
      return failure('not_draft', 'status', `Only draft profiles can be rejected. Current status: ${draft.status}.`);
    }

    const rejected = rejectBrandSignalProfileDraft(draft, reason, options);
    await upsertRecord(collections.profiles, rejected);
    await appendEvent(collections.events, 'draft_rejected', rejected, options, { reason });
    return { ok: true, record: clone(rejected), superseded: [] };
  }

  async getLatestAcceptedProfile(filter: BrandVaultAcceptedProfileFilter): Promise<BrandSignalProfile | null> {
    const collections = await this.getCollections();
    const docs = await findAcceptedDocs(collections, filter, 1);
    return docs[0]?.record.profile ? clone(docs[0].record.profile) : null;
  }

  async getLatestAcceptedRecord(filter: BrandVaultAcceptedProfileFilter): Promise<BrandSignalProfileRecord | null> {
    const collections = await this.getCollections();
    const docs = await findAcceptedDocs(collections, filter, 1);
    return docs[0]?.record ? clone(docs[0].record) : null;
  }

  async listAcceptedBrands(filter: BrandVaultAcceptedBrandListFilter = {}): Promise<BrandVaultAcceptedBrandSummary[]> {
    const collections = await this.getCollections();
    const limit = Math.max(1, Math.min(filter.limit ?? 100, 250));
    const inOrg = filter.orgId !== undefined && filter.orgId !== null;
    const docs = await findAcceptedDocs(collections, { orgId: filter.orgId, userId: filter.userId }, limit * 4);
    // Org context: summarize broad (up to the 250 cap) so the access filter runs BEFORE the limit — a
    // restricted brand must never consume a returned slot. Personal context keeps the limit semantics.
    const summaries = summarizeAcceptedBrandRecords(docs.map((doc) => doc.record), inOrg ? 250 : limit);
    if (!inOrg) return summaries;
    const grants = await this.readBrandAccessGrants(collections, filter.orgId as string);
    const accessible = filterAccessibleBrands(summaries, grants, {
      userId: filter.userId,
      isOrgAdmin: filter.isOrgAdmin,
    });
    return accessible.slice(0, limit);
  }

  async setBrandAccess(input: BrandAccessAssignmentInput): Promise<void> {
    const collections = await this.getCollections();
    if (!collections.brandAccess) {
      throw new Error('Brand Vault organization access storage is unavailable.');
    }
    const userIds = normalizeBrandAccessUserIds(input.userIds);
    const _id = brandAccessKey(input.orgId, input.brandId);
    const now = new Date().toISOString();
    await collections.brandAccess.updateOne(
      { _id } as Filter<BrandVaultMongoBrandAccessDocument>,
      { $set: { _id, orgId: input.orgId, brandId: input.brandId, userIds, updatedAt: now } },
      { upsert: true },
    );
  }

  async getBrandAccessGrants(orgId: string): Promise<BrandAccessGrants> {
    return this.readBrandAccessGrants(await this.getCollections(), orgId);
  }

  private async readBrandAccessGrants(
    collections: BrandVaultMongoCollections,
    orgId: string,
  ): Promise<BrandAccessGrants> {
    if (!collections.brandAccess) {
      throw new Error('Brand Vault organization access storage is unavailable.');
    }
    const docs = await collections.brandAccess
      .find({ orgId } as Filter<BrandVaultMongoBrandAccessDocument>)
      .toArray();
    const grants = new Map<string, string[]>();
    for (const doc of docs) {
      const userIds = normalizeBrandAccessUserIds(doc.userIds);
      if (userIds.length > 0) grants.set(doc.brandId, userIds);
    }
    return grants;
  }

  async saveJobSnapshot(snapshot: BrandVaultRefineryJobSnapshot): Promise<BrandVaultRefineryJobSnapshot> {
    const collections = await this.getCollections();
    const doc = jobDocument(snapshot);
    await collections.jobs.updateOne({ _id: doc._id } as Filter<BrandVaultMongoJobDocument>, { $set: doc }, { upsert: true });
    return clone(snapshot);
  }

  async getJobSnapshot(jobId: string): Promise<BrandVaultRefineryJobSnapshot | null> {
    const collections = await this.getCollections();
    const doc = await collections.jobs.findOne({ _id: jobId } as Filter<BrandVaultMongoJobDocument>);
    return doc ? clone(doc.snapshot) : null;
  }

  async getJobSnapshotByRecordId(recordId: string): Promise<BrandVaultRefineryJobSnapshot | null> {
    const collections = await this.getCollections();
    const doc = await collections.jobs.findOne({ recordId } as Filter<BrandVaultMongoJobDocument>);
    return doc ? clone(doc.snapshot) : null;
  }

  async deleteJobSnapshot(jobId: string, scope: { userId: string; orgId: string | null }): Promise<boolean> {
    const collections = await this.getCollections();
    // Owner-scoped: only the user who ran the scan can delete its history entry. Never touches profiles.
    const result = await collections.jobs.deleteOne({ _id: jobId, userId: scope.userId } as Filter<BrandVaultMongoJobDocument>);
    return (result.deletedCount ?? 0) > 0;
  }

  async listJobSnapshots(filter: BrandVaultRefineryJobListFilter = {}): Promise<BrandVaultRefineryJobSnapshot[]> {
    const collections = await this.getCollections();
    const query: Record<string, unknown> = {};
    if (filter.brandId) query.brandId = filter.brandId;
    if (filter.userId) query.userId = filter.userId;
    if (filter.orgId !== undefined) query.orgId = filter.orgId;
    if (filter.statuses?.length) query.status = { $in: filter.statuses };
    if (filter.updatedBefore) query.updatedAt = { $lt: filter.updatedBefore };
    const limit = Math.max(1, Math.min(filter.limit ?? 25, 100));
    const sortDirection = filter.sort === 'updatedAtDesc' ? -1 : 1;
    const docs = await collections.jobs
      .find(query as Filter<BrandVaultMongoJobDocument>)
      .sort({ updatedAt: sortDirection })
      .limit(limit)
      .toArray();
    return docs.map((doc) => clone(doc.snapshot));
  }

  async updateJobStatusForRecord(
    recordId: string,
    status: BrandRefineryJob['status'],
    options: BrandSignalLifecycleOptions = {},
  ): Promise<BrandVaultRefineryJobSnapshot | null> {
    const current = await this.getJobSnapshotByRecordId(recordId);
    if (!current) return null;

    const updatedJob = {
      ...current.job,
      status,
      updatedAt: options.now ?? new Date().toISOString(),
    };
    const record = await this.getRecord(recordId);
    return this.saveJobSnapshot({
      ...current,
      job: updatedJob,
      reviewPayload: record
        ? createBrandVaultDraftReviewPayload({
            job: updatedJob,
            record,
            candidates: current.candidates,
            normalizedUrl: current.normalizedUrl ?? updatedJob.inputs.websiteUrl ?? '',
            warnings: updatedJob.warnings,
          })
        : current.reviewPayload,
    });
  }

  private async supersedeExistingAccepted(
    collections: BrandVaultMongoCollections,
    accepted: BrandSignalProfileRecord,
    options: BrandSignalLifecycleOptions,
  ): Promise<BrandSignalProfileRecord[]> {
    const docs = await collections.profiles
      .find(toAcceptedScopeFilter(accepted))
      .sort({ updatedAt: -1 })
      .toArray();
    const superseded: BrandSignalProfileRecord[] = [];

    for (const doc of docs) {
      if (doc.record.id === accepted.id) continue;
      const next = supersedeBrandSignalProfileRecord(doc.record, options);
      await upsertRecord(collections.profiles, next);
      await appendEvent(collections.events, 'record_superseded', next, options);
      superseded.push(next);
    }

    return superseded;
  }

  private async getCollections(): Promise<BrandVaultMongoCollections> {
    const collections = typeof this.options.collections === 'function'
      ? await this.options.collections()
      : this.options.collections;
    if (!this.ensuredIndexes) {
      await ensureIndexes(collections);
      this.ensuredIndexes = true;
    }
    return collections;
  }

  private async runInTransaction<T>(operation: (collections: BrandVaultMongoCollections) => Promise<T>): Promise<T> {
    if (this.options.withTransaction) return this.options.withTransaction(operation);
    return operation(await this.getCollections());
  }
}

export function createBrandVaultMongoRefineryStore(
  options: BrandVaultMongoStoreOptions,
): BrandVaultMongoRefineryStore {
  return new BrandVaultMongoRefineryStore(options);
}

export function createBrandVaultMongoRefineryStoreFromEnvironment(): BrandVaultMongoRefineryStore | null {
  const uri = process.env.BRAND_VAULT_MONGODB_URI ?? process.env.MONGODB_URI;
  const dbName = process.env.BRAND_VAULT_MONGODB_DB_NAME ?? process.env.EDITRON_MONGODB_DB_NAME ?? process.env.MONGODB_DB_NAME;
  if (!uri || !dbName || process.env.BRAND_VAULT_PERSISTENCE === 'memory') return null;
  return createBrandVaultMongoRefineryStore({
    collections: async () => getMongoCollections(uri, dbName),
    withTransaction: async (operation) => runMongoTransaction(uri, dbName, operation),
  });
}

async function getMongoCollections(uri: string, dbName: string): Promise<BrandVaultMongoCollections> {
  const client = await getMongoClient(uri);
  const db = client.db(dbName);
  return collectionsFromDb(db);
}

function collectionsFromDb(db: Db): BrandVaultMongoCollections {
  return {
    profiles: bindMongoCollection(db.collection<BrandVaultMongoProfileDocument>(BRAND_VAULT_COLLECTIONS.profiles)),
    events: bindMongoCollection(db.collection<BrandVaultMongoEventDocument>(BRAND_VAULT_COLLECTIONS.events)),
    jobs: bindMongoCollection(db.collection<BrandVaultMongoJobDocument>(BRAND_VAULT_COLLECTIONS.jobs)),
    brandAccess: bindMongoCollection(db.collection<BrandVaultMongoBrandAccessDocument>(BRAND_VAULT_COLLECTIONS.brandAccess)),
  };
}

async function runMongoTransaction<T>(
  uri: string,
  dbName: string,
  operation: (collections: BrandVaultMongoCollections) => Promise<T>,
): Promise<T> {
  const client = await getMongoClient(uri);
  const session = client.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await operation(collectionsFromDbWithSession(client.db(dbName), session));
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
    });
    return result;
  } finally {
    await session.endSession();
  }
}

function collectionsFromDbWithSession(db: Db, session: ClientSession): BrandVaultMongoCollections {
  return {
    profiles: bindMongoCollection(db.collection<BrandVaultMongoProfileDocument>(BRAND_VAULT_COLLECTIONS.profiles), session),
    events: bindMongoCollection(db.collection<BrandVaultMongoEventDocument>(BRAND_VAULT_COLLECTIONS.events), session),
    jobs: bindMongoCollection(db.collection<BrandVaultMongoJobDocument>(BRAND_VAULT_COLLECTIONS.jobs), session),
    brandAccess: bindMongoCollection(db.collection<BrandVaultMongoBrandAccessDocument>(BRAND_VAULT_COLLECTIONS.brandAccess), session),
  };
}

function bindMongoCollection<TDocument extends { _id: string }>(
  collection: Collection<TDocument & Document>,
  session?: ClientSession,
): BrandVaultMongoCollection<TDocument> {
  const sessionOptions = session ? { session } : {};
  return {
    createIndexes: (indexes) => collection.createIndexes(indexes),
    findOne: async (filter) => (
      await collection.findOne(filter as Filter<TDocument & Document>, sessionOptions)
    ) as TDocument | null,
    find: (filter) => collection.find(filter as Filter<TDocument & Document>, sessionOptions) as unknown as BrandVaultMongoCursor<TDocument>,
    updateOne: (filter, update, options) => collection.updateOne(
      filter as Filter<TDocument & Document>,
      update as UpdateFilter<TDocument & Document>,
      { ...options, ...sessionOptions },
    ),
    deleteOne: (filter) => collection.deleteOne(filter as Filter<TDocument & Document>, sessionOptions),
  };
}

async function getMongoClient(uri: string): Promise<MongoClient> {
  cachedMongoClient ??= new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 1,
    maxIdleTimeMS: 30000,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  }).connect();
  return cachedMongoClient;
}

async function ensureIndexes(collections: BrandVaultMongoCollections): Promise<void> {
  await collections.profiles.createIndexes?.([
    { key: { userId: 1, status: 1, updatedAt: -1 }, name: 'user_status_updatedAt' },
    { key: { brandId: 1, userId: 1, status: 1, updatedAt: -1 }, name: 'brand_user_status_updatedAt' },
    { key: { orgId: 1, brandId: 1, userId: 1, status: 1, updatedAt: -1 }, name: 'org_brand_user_status_updatedAt' },
    { key: { orgId: 1, status: 1, updatedAt: -1 }, name: 'org_status_updatedAt' },
    {
      key: { acceptedScopeKey: 1 },
      name: 'accepted_scope_unique',
      unique: true,
      partialFilterExpression: { status: 'accepted', acceptedScopeKey: { $exists: true } },
    },
  ]);
  await collections.jobs.createIndexes?.([
    { key: { userId: 1, status: 1, updatedAt: -1 }, name: 'user_status_updatedAt' },
    { key: { orgId: 1, brandId: 1, userId: 1, updatedAt: -1 }, name: 'org_brand_user_updatedAt' },
    { key: { recordId: 1 }, name: 'recordId', sparse: true },
  ]);
  await collections.events.createIndexes?.([
    { key: { recordId: 1, createdAt: -1 }, name: 'record_createdAt' },
    { key: { userId: 1, createdAt: -1 }, name: 'user_createdAt' },
    { key: { orgId: 1, userId: 1, createdAt: -1 }, name: 'org_user_createdAt' },
  ]);
  await collections.brandAccess?.createIndexes?.([
    { key: { orgId: 1, brandId: 1 }, name: 'org_brand', unique: true },
  ]);
}

async function upsertRecord(
  collection: BrandVaultMongoCollection<BrandVaultMongoProfileDocument>,
  record: BrandSignalProfileRecord,
): Promise<void> {
  const doc = profileDocument(record);
  await collection.updateOne({ _id: doc._id } as Filter<BrandVaultMongoProfileDocument>, { $set: doc }, { upsert: true });
}

async function appendEvent(
  collection: BrandVaultMongoCollection<BrandVaultMongoEventDocument>,
  type: BrandSignalProfileRepositoryEventType,
  record: BrandSignalProfileRecord,
  options: BrandSignalLifecycleOptions,
  extra: Pick<BrandSignalProfileRepositoryEvent, 'issues' | 'reason'> = {},
): Promise<void> {
  const createdAt = options.now ?? new Date().toISOString();
  const event: BrandVaultMongoEventDocument = {
    _id: eventId(type, record.id, createdAt, options.actorId),
    id: eventId(type, record.id, createdAt, options.actorId),
    type,
    recordId: record.id,
    brandId: record.profile.brandId,
    userId: record.profile.userId,
    orgId: record.profile.orgId,
    actorId: options.actorId,
    createdAt,
    ...extra,
  };
  await collection.updateOne({ _id: event._id } as Filter<BrandVaultMongoEventDocument>, { $setOnInsert: event }, { upsert: true });
}

function profileDocument(record: BrandSignalProfileRecord): BrandVaultMongoProfileDocument {
  return {
    _id: record.id,
    record: clone(record),
    status: record.status,
    acceptedScopeKey: acceptedScopeKey(record),
    brandId: record.profile.brandId,
    userId: record.profile.userId,
    orgId: record.profile.orgId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toAcceptedScopeFilter(record: BrandSignalProfileRecord): Filter<BrandVaultMongoProfileDocument> {
  const brandId = record.profile.brandId;
  const orgId = record.profile.orgId;
  return toProfileFilter({
    brandId,
    userId: orgId ? undefined : record.profile.userId,
    orgId: orgId ?? null,
    status: 'accepted',
  });
}

function acceptedScopeKey(record: BrandSignalProfileRecord): string | undefined {
  if (record.status !== 'accepted') return undefined;
  const brandId = record.profile.brandId?.trim();
  const orgId = record.profile.orgId?.trim();
  const userId = record.profile.userId?.trim();
  if (!brandId || (!orgId && !userId)) return undefined;
  return orgId ? `org:${orgId}:brand:${brandId}` : `user:${userId}:brand:${brandId}`;
}

function wasMatched(result: unknown): boolean {
  if (!result || typeof result !== 'object' || !('matchedCount' in result)) return true;
  const matchedCount = (result as { matchedCount?: unknown }).matchedCount;
  return typeof matchedCount !== 'number' || matchedCount > 0;
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 11000,
  );
}

function summarizeAcceptedBrandRecords(
  records: BrandSignalProfileRecord[],
  limit: number,
): BrandVaultAcceptedBrandSummary[] {
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

function jobDocument(snapshot: BrandVaultRefineryJobSnapshot): BrandVaultMongoJobDocument {
  return {
    _id: snapshot.job.id,
    snapshot: clone(snapshot),
    recordId: snapshot.recordId,
    userId: snapshot.job.userId,
    orgId: snapshot.job.orgId ?? null,
    brandId: snapshot.job.brandId,
    status: snapshot.job.status,
    createdAt: snapshot.job.createdAt,
    updatedAt: snapshot.job.updatedAt,
  };
}

function toProfileFilter(filter: {
  brandId?: string;
  userId?: string;
  orgId?: string | null;
  status?: BrandSignalProfileRecord['status'];
}): Filter<BrandVaultMongoProfileDocument> {
  return Object.fromEntries(
    Object.entries(filter).filter(([, value]) => value !== undefined),
  ) as Filter<BrandVaultMongoProfileDocument>;
}

/**
 * R5 transitional read: accepted docs for the filter, org-first with a legacy fallback.
 *
 * Org-scoping was added after brands already existed, so a member's pre-stack (null-org) brands would
 * vanish from an org-scoped query. We read the org-owned rows first, then append the requesting user's
 * own legacy null-org rows — never replacing an org row (callers take the first match / dedupe by
 * brandId, so an org row always wins over a legacy one of the same brand). Reads only; supersede/write
 * paths keep exact scope via toProfileFilter. Drop the fallback once the R5 backfill stamps orgId on
 * every legacy record.
 */
async function findAcceptedDocs(
  collections: BrandVaultMongoCollections,
  filter: { brandId?: string; userId?: string; orgId?: string | null },
  perQueryLimit: number,
): Promise<BrandVaultMongoProfileDocument[]> {
  const hasOrg = filter.orgId !== undefined && filter.orgId !== null;

  // Primary scope: org-wide rows when in an org, else the user's own (incl. null-org) rows.
  const primary = await collections.profiles
    .find(toProfileFilter({
      brandId: filter.brandId,
      userId: hasOrg ? undefined : filter.userId,
      orgId: filter.orgId,
      status: 'accepted',
    }))
    .sort({ updatedAt: -1 })
    .limit(perQueryLimit)
    .toArray();

  // Legacy fallback only matters for an org member who still owns pre-stack (null-org) brands.
  if (!hasOrg || filter.userId === undefined) return primary;
  const legacy = await collections.profiles
    .find(toProfileFilter({ brandId: filter.brandId, userId: filter.userId, orgId: null, status: 'accepted' }))
    .sort({ updatedAt: -1 })
    .limit(perQueryLimit)
    .toArray();
  return [...primary, ...legacy];
}

function failure(
  code: Exclude<BrandSignalProfileRepositoryResult, { ok: true }>['code'],
  path: string,
  message: string,
): BrandSignalProfileRepositoryResult {
  return { ok: false, code, issues: [{ severity: 'error', code: 'review_required', path, message }] };
}

function eventId(type: string, recordId: string, createdAt: string, actorId?: string): string {
  return ['brand_signal_event', type, recordId, Date.parse(createdAt) || 0, actorId ?? 'system']
    .join('_')
    .replace(/[^a-zA-Z0-9_]/g, '_');
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
