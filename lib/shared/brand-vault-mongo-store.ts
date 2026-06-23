import { MongoClient, type Db, type Filter, type IndexDescription } from 'mongodb';
import type { BrandSignalProfile } from './brand-signal-profile';
import {
  acceptBrandSignalProfileDraft,
  rejectBrandSignalProfileDraft,
  supersedeBrandSignalProfileRecord,
  type BrandSignalLifecycleOptions,
  type BrandSignalProfileRecord,
} from './brand-signal-lifecycle';
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
  BrandVaultRefineryJobListFilter,
  BrandVaultRefineryJobSnapshot,
  BrandVaultRefineryStore,
} from './brand-vault-refinery-api';
import type { BrandRefineryJob } from './brand-website-refinery-types';

export const BRAND_VAULT_COLLECTIONS = {
  profiles: 'brand_signal_profile_records',
  events: 'brand_signal_profile_events',
  jobs: 'brand_refinery_jobs',
} as const;

export interface BrandVaultMongoProfileDocument {
  _id: string;
  record: BrandSignalProfileRecord;
  status: BrandSignalProfileRecord['status'];
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
  brandId?: string;
  status: BrandRefineryJob['status'];
  createdAt: string;
  updatedAt: string;
}

export interface BrandVaultMongoCollections {
  profiles: BrandVaultMongoCollection<BrandVaultMongoProfileDocument>;
  events: BrandVaultMongoCollection<BrandVaultMongoEventDocument>;
  jobs: BrandVaultMongoCollection<BrandVaultMongoJobDocument>;
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
}

export interface BrandVaultMongoCursor<TDocument> {
  sort(sort: Record<string, 1 | -1>): BrandVaultMongoCursor<TDocument>;
  limit(limit: number): BrandVaultMongoCursor<TDocument>;
  toArray(): Promise<TDocument[]>;
}

export interface BrandVaultMongoStoreOptions {
  collections: BrandVaultMongoCollections | (() => Promise<BrandVaultMongoCollections>);
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
    await upsertRecord(collections.profiles, record);
    await appendEvent(collections.events, record.status === 'draft' ? 'draft_saved' : 'record_superseded', record, options);
    return clone(record);
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
    const collections = await this.getCollections();
    const draft = await this.getRecord(id);
    if (!draft) return failure('not_found', 'record', `Brand signal profile record "${id}" was not found.`);
    if (draft.status !== 'draft') {
      return failure('not_draft', 'status', `Only draft profiles can be accepted. Current status: ${draft.status}.`);
    }

    const accepted = acceptBrandSignalProfileDraft(draft, options);
    if (!accepted.ok) {
      await appendEvent(collections.events, 'draft_accept_failed', draft, options, { issues: accepted.issues });
      return { ok: false, code: 'validation_failed', issues: accepted.issues };
    }

    const superseded = await this.supersedeExistingAccepted(collections, accepted.record, options);
    await upsertRecord(collections.profiles, accepted.record);
    await appendEvent(collections.events, 'draft_accepted', accepted.record, options);
    return { ok: true, record: clone(accepted.record), superseded: superseded.map(clone) };
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
    const docs = await collections.profiles
      .find(toProfileFilter({ ...filter, status: 'accepted' }))
      .sort({ updatedAt: -1 })
      .limit(1)
      .toArray();
    return docs[0]?.record.profile ? clone(docs[0].record.profile) : null;
  }

  async getLatestAcceptedRecord(filter: BrandVaultAcceptedProfileFilter): Promise<BrandSignalProfileRecord | null> {
    const collections = await this.getCollections();
    const docs = await collections.profiles
      .find(toProfileFilter({ ...filter, status: 'accepted' }))
      .sort({ updatedAt: -1 })
      .limit(1)
      .toArray();
    return docs[0]?.record ? clone(docs[0].record) : null;
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

  async listJobSnapshots(filter: BrandVaultRefineryJobListFilter = {}): Promise<BrandVaultRefineryJobSnapshot[]> {
    const collections = await this.getCollections();
    const query: Record<string, unknown> = {};
    if (filter.statuses?.length) query.status = { $in: filter.statuses };
    if (filter.updatedBefore) query.updatedAt = { $lt: filter.updatedBefore };
    const limit = Math.max(1, Math.min(filter.limit ?? 25, 100));
    const docs = await collections.jobs
      .find(query as Filter<BrandVaultMongoJobDocument>)
      .sort({ updatedAt: 1 })
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
      .find(toProfileFilter({
        brandId: accepted.profile.brandId,
        userId: accepted.profile.userId,
        orgId: accepted.profile.orgId ?? null,
        status: 'accepted',
      }))
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
  });
}

async function getMongoCollections(uri: string, dbName: string): Promise<BrandVaultMongoCollections> {
  const client = await getMongoClient(uri);
  const db = client.db(dbName);
  return collectionsFromDb(db);
}

function collectionsFromDb(db: Db): BrandVaultMongoCollections {
  return {
    profiles: db.collection<BrandVaultMongoProfileDocument>(BRAND_VAULT_COLLECTIONS.profiles),
    events: db.collection<BrandVaultMongoEventDocument>(BRAND_VAULT_COLLECTIONS.events),
    jobs: db.collection<BrandVaultMongoJobDocument>(BRAND_VAULT_COLLECTIONS.jobs),
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
  ]);
  await collections.jobs.createIndexes?.([
    { key: { userId: 1, status: 1, updatedAt: -1 }, name: 'user_status_updatedAt' },
    { key: { recordId: 1 }, name: 'recordId', sparse: true },
  ]);
  await collections.events.createIndexes?.([
    { key: { recordId: 1, createdAt: -1 }, name: 'record_createdAt' },
    { key: { userId: 1, createdAt: -1 }, name: 'user_createdAt' },
    { key: { orgId: 1, userId: 1, createdAt: -1 }, name: 'org_user_createdAt' },
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
    brandId: record.profile.brandId,
    userId: record.profile.userId,
    orgId: record.profile.orgId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function jobDocument(snapshot: BrandVaultRefineryJobSnapshot): BrandVaultMongoJobDocument {
  return {
    _id: snapshot.job.id,
    snapshot: clone(snapshot),
    recordId: snapshot.recordId,
    userId: snapshot.job.userId,
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
