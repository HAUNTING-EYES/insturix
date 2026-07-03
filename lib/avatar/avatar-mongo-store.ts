import { MongoClient, type Db, type Filter, type IndexDescription } from 'mongodb';
import {
  acceptAvatarProfileDraft,
  rejectAvatarProfileDraft,
  supersedeAvatarProfileRecord,
  type AvatarLifecycleOptions,
  type AvatarProfileRecord,
} from './avatar-lifecycle';
import {
  createInMemoryAvatarProfileRepository,
  type AvatarProfileListFilter,
  type AvatarProfileRepositoryEvent,
  type AvatarProfileRepositoryEventType,
  type AvatarProfileRepositoryResult,
} from './avatar-repository';
import type { AvatarProfile } from './avatar-profile';

export const AVATAR_VAULT_COLLECTIONS = {
  profiles: 'avatar_profile_records',
  events: 'avatar_profile_events',
} as const;

export interface AvatarVaultMongoProfileDocument {
  _id: string;
  record: AvatarProfileRecord;
  status: AvatarProfileRecord['status'];
  avatarId: string;
  brandId?: string | null;
  userId: string;
  orgId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AvatarVaultMongoEventDocument extends AvatarProfileRepositoryEvent {
  _id: string;
}

export interface AvatarVaultMongoCollections {
  profiles: AvatarVaultMongoCollection<AvatarVaultMongoProfileDocument>;
  events: AvatarVaultMongoCollection<AvatarVaultMongoEventDocument>;
}

export interface AvatarVaultMongoCollection<TDocument extends { _id: string }> {
  createIndexes?(indexes: IndexDescription[]): Promise<unknown>;
  findOne(filter: Filter<TDocument>): Promise<TDocument | null>;
  find(filter: Filter<TDocument>): AvatarVaultMongoCursor<TDocument>;
  updateOne(
    filter: Filter<TDocument>,
    update: { $set?: Partial<TDocument>; $setOnInsert?: Partial<TDocument> },
    options?: { upsert?: boolean },
  ): Promise<unknown>;
}

export interface AvatarVaultMongoCursor<TDocument> {
  sort(sort: Record<string, 1 | -1>): AvatarVaultMongoCursor<TDocument>;
  limit(limit: number): AvatarVaultMongoCursor<TDocument>;
  toArray(): Promise<TDocument[]>;
}

export interface AvatarVaultProfileStore {
  saveRecord(record: AvatarProfileRecord, options?: AvatarLifecycleOptions): AvatarStoreResult<AvatarProfileRecord>;
  getRecord(id: string): AvatarStoreResult<AvatarProfileRecord | null>;
  listRecords(filter?: AvatarProfileListFilter): AvatarStoreResult<AvatarProfileRecord[]>;
  getLatestAcceptedProfile(filter: Omit<AvatarProfileListFilter, 'status'>): AvatarStoreResult<AvatarProfile | null>;
  getLatestAcceptedRecord(filter: Omit<AvatarProfileListFilter, 'status'>): AvatarStoreResult<AvatarProfileRecord | null>;
  acceptDraft(id: string, options?: AvatarLifecycleOptions): AvatarStoreResult<AvatarProfileRepositoryResult>;
  rejectDraft(id: string, reason: string, options?: AvatarLifecycleOptions): AvatarStoreResult<AvatarProfileRepositoryResult>;
  listEvents?(recordId?: string): AvatarStoreResult<AvatarProfileRepositoryEvent[]>;
}

export type AvatarStoreResult<T> = T | Promise<T>;

export interface AvatarVaultMongoStoreOptions {
  collections: AvatarVaultMongoCollections | (() => Promise<AvatarVaultMongoCollections>);
}

let cachedMongoClient: Promise<MongoClient> | null = null;

export class AvatarVaultMongoProfileStore implements AvatarVaultProfileStore {
  private ensuredIndexes = false;

  constructor(private readonly options: AvatarVaultMongoStoreOptions) {}

  async saveRecord(
    record: AvatarProfileRecord,
    options: AvatarLifecycleOptions = {},
  ): Promise<AvatarProfileRecord> {
    const collections = await this.getCollections();
    await upsertRecord(collections.profiles, record);
    await appendEvent(collections.events, record.status === 'draft' ? 'draft_saved' : 'record_superseded', record, options);
    return clone(record);
  }

  async getRecord(id: string): Promise<AvatarProfileRecord | null> {
    const collections = await this.getCollections();
    const doc = await collections.profiles.findOne({ _id: id } as Filter<AvatarVaultMongoProfileDocument>);
    return doc ? clone(doc.record) : null;
  }

  async listRecords(filter: AvatarProfileListFilter = {}): Promise<AvatarProfileRecord[]> {
    const collections = await this.getCollections();
    const docs = await collections.profiles
      .find(toProfileFilter(filter))
      .sort({ updatedAt: -1 })
      .limit(250)
      .toArray();
    return docs.map((doc) => clone(doc.record));
  }

  async getLatestAcceptedProfile(filter: Omit<AvatarProfileListFilter, 'status'>): Promise<AvatarProfile | null> {
    return (await this.getLatestAcceptedRecord(filter))?.profile ?? null;
  }

  async getLatestAcceptedRecord(filter: Omit<AvatarProfileListFilter, 'status'>): Promise<AvatarProfileRecord | null> {
    const collections = await this.getCollections();
    const docs = await collections.profiles
      .find(toProfileFilter({ ...filter, status: 'accepted' }))
      .sort({ updatedAt: -1 })
      .limit(1)
      .toArray();
    return docs[0]?.record ? clone(docs[0].record) : null;
  }

  async acceptDraft(
    id: string,
    options: AvatarLifecycleOptions = {},
  ): Promise<AvatarProfileRepositoryResult> {
    const collections = await this.getCollections();
    const draft = await this.getRecord(id);
    if (!draft) return failure('not_found', 'record', `Avatar profile record "${id}" was not found.`);
    if (draft.status !== 'draft') {
      return failure('not_draft', 'status', `Only draft avatar profiles can be accepted. Current status: ${draft.status}.`);
    }

    const accepted = acceptAvatarProfileDraft(draft, options);
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
    options: AvatarLifecycleOptions = {},
  ): Promise<AvatarProfileRepositoryResult> {
    const collections = await this.getCollections();
    const draft = await this.getRecord(id);
    if (!draft) return failure('not_found', 'record', `Avatar profile record "${id}" was not found.`);
    if (draft.status !== 'draft') {
      return failure('not_draft', 'status', `Only draft avatar profiles can be rejected. Current status: ${draft.status}.`);
    }

    const rejected = rejectAvatarProfileDraft(draft, reason, options);
    await upsertRecord(collections.profiles, rejected);
    await appendEvent(collections.events, 'draft_rejected', rejected, options, { reason });
    return { ok: true, record: clone(rejected), superseded: [] };
  }

  async listEvents(recordId?: string): Promise<AvatarProfileRepositoryEvent[]> {
    const collections = await this.getCollections();
    const docs = await collections.events
      .find((recordId ? { recordId } : {}) as Filter<AvatarVaultMongoEventDocument>)
      .sort({ createdAt: 1 })
      .limit(250)
      .toArray();
    return docs.map(({ _id: _ignored, ...event }) => clone(event));
  }

  private async supersedeExistingAccepted(
    collections: AvatarVaultMongoCollections,
    accepted: AvatarProfileRecord,
    options: AvatarLifecycleOptions,
  ): Promise<AvatarProfileRecord[]> {
    const docs = await collections.profiles
      .find(toProfileFilter({
        avatarId: accepted.profile.avatarId,
        userId: accepted.profile.userId,
        orgId: accepted.profile.orgId ?? null,
        status: 'accepted',
      }))
      .sort({ updatedAt: -1 })
      .toArray();
    const superseded: AvatarProfileRecord[] = [];

    for (const doc of docs) {
      if (doc.record.id === accepted.id) continue;
      const next = supersedeAvatarProfileRecord(doc.record, options);
      await upsertRecord(collections.profiles, next);
      await appendEvent(collections.events, 'record_superseded', next, options);
      superseded.push(next);
    }

    return superseded;
  }

  private async getCollections(): Promise<AvatarVaultMongoCollections> {
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

export function createAvatarVaultMongoProfileStore(
  options: AvatarVaultMongoStoreOptions,
): AvatarVaultMongoProfileStore {
  return new AvatarVaultMongoProfileStore(options);
}

export function createAvatarVaultMongoProfileStoreFromEnvironment(): AvatarVaultMongoProfileStore | null {
  const uri = process.env.AVATAR_VAULT_MONGODB_URI ?? process.env.MONGODB_URI;
  const dbName = process.env.AVATAR_VAULT_MONGODB_DB_NAME ?? process.env.EDITRON_MONGODB_DB_NAME ?? process.env.MONGODB_DB_NAME;
  if (!uri || !dbName || process.env.AVATAR_VAULT_PERSISTENCE === 'memory') return null;
  return createAvatarVaultMongoProfileStore({
    collections: async () => collectionsFromDb((await getMongoClient(uri)).db(dbName)),
  });
}

export function getDefaultAvatarProfileStore(): AvatarVaultProfileStore {
  const globalStore = globalThis as typeof globalThis & {
    __avatarProfileStore?: AvatarVaultProfileStore;
  };
  globalStore.__avatarProfileStore ??=
    createAvatarVaultMongoProfileStoreFromEnvironment() ?? createInMemoryAvatarProfileRepository();
  return globalStore.__avatarProfileStore;
}

function collectionsFromDb(db: Db): AvatarVaultMongoCollections {
  return {
    profiles: db.collection<AvatarVaultMongoProfileDocument>(AVATAR_VAULT_COLLECTIONS.profiles),
    events: db.collection<AvatarVaultMongoEventDocument>(AVATAR_VAULT_COLLECTIONS.events),
  };
}

function getMongoClient(uri: string): Promise<MongoClient> {
  cachedMongoClient ??= new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 1,
    maxIdleTimeMS: 30000,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  }).connect();
  return cachedMongoClient;
}

async function ensureIndexes(collections: AvatarVaultMongoCollections): Promise<void> {
  await collections.profiles.createIndexes?.([
    { key: { userId: 1, status: 1, updatedAt: -1 }, name: 'user_status_updatedAt' },
    { key: { userId: 1, orgId: 1, status: 1, updatedAt: -1 }, name: 'user_org_status_updatedAt' },
    { key: { avatarId: 1, userId: 1, orgId: 1, status: 1, updatedAt: -1 }, name: 'avatar_user_org_status_updatedAt' },
    { key: { brandId: 1, userId: 1, status: 1, updatedAt: -1 }, name: 'brand_user_status_updatedAt' },
  ]);
  await collections.events.createIndexes?.([
    { key: { recordId: 1, createdAt: -1 }, name: 'record_createdAt' },
    { key: { userId: 1, createdAt: -1 }, name: 'user_createdAt' },
    { key: { orgId: 1, userId: 1, createdAt: -1 }, name: 'org_user_createdAt' },
  ]);
}

async function upsertRecord(
  collection: AvatarVaultMongoCollection<AvatarVaultMongoProfileDocument>,
  record: AvatarProfileRecord,
): Promise<void> {
  const doc = profileDocument(record);
  await collection.updateOne({ _id: doc._id } as Filter<AvatarVaultMongoProfileDocument>, { $set: doc }, { upsert: true });
}

async function appendEvent(
  collection: AvatarVaultMongoCollection<AvatarVaultMongoEventDocument>,
  type: AvatarProfileRepositoryEventType,
  record: AvatarProfileRecord,
  options: AvatarLifecycleOptions,
  extra: Pick<AvatarProfileRepositoryEvent, 'issues' | 'reason'> = {},
): Promise<void> {
  const createdAt = options.now ?? new Date().toISOString();
  const id = eventId(type, record.id, createdAt, options.actorId);
  const event: AvatarVaultMongoEventDocument = {
    _id: id,
    id,
    type,
    recordId: record.id,
    avatarId: record.profile.avatarId,
    brandId: record.profile.brandId ?? null,
    userId: record.profile.userId,
    orgId: record.profile.orgId ?? null,
    actorId: options.actorId,
    createdAt,
    ...extra,
  };
  await collection.updateOne({ _id: event._id } as Filter<AvatarVaultMongoEventDocument>, { $setOnInsert: event }, { upsert: true });
}

function profileDocument(record: AvatarProfileRecord): AvatarVaultMongoProfileDocument {
  return {
    _id: record.id,
    record: clone(record),
    status: record.status,
    avatarId: record.profile.avatarId,
    brandId: record.profile.brandId ?? null,
    userId: record.profile.userId,
    orgId: record.profile.orgId ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toProfileFilter(filter: AvatarProfileListFilter): Filter<AvatarVaultMongoProfileDocument> {
  return Object.fromEntries(
    Object.entries(filter).filter(([, value]) => value !== undefined),
  ) as Filter<AvatarVaultMongoProfileDocument>;
}

function failure(
  code: Exclude<AvatarProfileRepositoryResult, { ok: true }>['code'],
  path: string,
  message: string,
): AvatarProfileRepositoryResult {
  return { ok: false, code, issues: [{ severity: 'error', code: 'review_required', path, message }] };
}

function eventId(type: string, recordId: string, createdAt: string, actorId?: string): string {
  return `${type}_${recordId}_${createdAt}_${actorId ?? 'system'}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
