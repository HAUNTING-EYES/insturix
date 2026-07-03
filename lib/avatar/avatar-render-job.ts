import { randomUUID } from 'node:crypto';
import { MongoClient, type Db, type Filter, type IndexDescription } from 'mongodb';
import type { AvatarProviderId, AvatarProviderSelection } from './avatar-provider-adapter';
import { AVATAR_PROVIDER_DESCRIPTORS } from './avatar-provider-adapter';
import type { AvatarRenderRecipe } from './avatar-render-recipe';
import {
  planAvatarProfileRender,
  type AvatarVaultActorInput,
  type AvatarVaultApiResult,
} from './avatar-vault-api';
import type {
  AvatarStoreResult,
  AvatarVaultMongoCollection,
  AvatarVaultProfileStore,
} from './avatar-mongo-store';

export type AvatarRenderJobStatus = 'blocked' | 'queued' | 'running' | 'succeeded' | 'failed';

export type AvatarRenderJobDispatchCode =
  | 'provider_not_configured'
  | 'provider_adapter_not_implemented'
  | 'provider_stub_only';

export interface AvatarRenderJobSnapshot {
  id: string;
  recordId: string;
  avatarId: string;
  userId: string;
  orgId?: string | null;
  brandId?: string | null;
  providerId: AvatarProviderId;
  providerDisplayName: string;
  status: AvatarRenderJobStatus;
  dispatchCode: AvatarRenderJobDispatchCode;
  statusReason: string;
  recipe: AvatarRenderRecipe;
  providerPlan: AvatarProviderSelection;
  requestBody: Record<string, unknown>;
  providerRequestId?: string;
  resultUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AvatarRenderJobListFilter {
  recordId?: string;
  userId?: string;
  orgId?: string | null;
  status?: AvatarRenderJobStatus;
}

export interface AvatarRenderJobStore {
  saveJobSnapshot(snapshot: AvatarRenderJobSnapshot): AvatarStoreResult<AvatarRenderJobSnapshot>;
  getJobSnapshot(jobId: string): AvatarStoreResult<AvatarRenderJobSnapshot | null>;
  listJobSnapshots?(filter?: AvatarRenderJobListFilter): AvatarStoreResult<AvatarRenderJobSnapshot[]>;
}

export interface CreateAvatarRenderJobDependencies {
  profileStore?: AvatarVaultProfileStore;
  jobStore?: AvatarRenderJobStore;
  now?: () => string;
  idGenerator?: () => string;
  env?: Record<string, string | undefined>;
}

export interface CreateAvatarRenderJobSuccessBody {
  ok: true;
  job: AvatarRenderJobSnapshot;
  recipe: AvatarRenderRecipe;
  providerPlan: AvatarProviderSelection;
}

export interface AvatarRenderJobErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
    issues?: unknown[];
  };
}

interface AvatarRenderJobMongoDocument extends AvatarRenderJobSnapshot {
  _id: string;
}

const AVATAR_RENDER_JOB_COLLECTION = 'avatar_render_jobs';

let cachedRenderJobMongoClient: Promise<MongoClient> | null = null;

export class InMemoryAvatarRenderJobStore implements AvatarRenderJobStore {
  private readonly jobs = new Map<string, AvatarRenderJobSnapshot>();

  constructor(snapshots: AvatarRenderJobSnapshot[] = []) {
    for (const snapshot of snapshots) {
      this.jobs.set(snapshot.id, clone(snapshot));
    }
  }

  saveJobSnapshot(snapshot: AvatarRenderJobSnapshot): AvatarRenderJobSnapshot {
    this.jobs.set(snapshot.id, clone(snapshot));
    return clone(snapshot);
  }

  getJobSnapshot(jobId: string): AvatarRenderJobSnapshot | null {
    const snapshot = this.jobs.get(jobId);
    return snapshot ? clone(snapshot) : null;
  }

  listJobSnapshots(filter: AvatarRenderJobListFilter = {}): AvatarRenderJobSnapshot[] {
    return Array.from(this.jobs.values())
      .filter((snapshot) => matchesJobFilter(snapshot, filter))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(clone);
  }
}

export interface AvatarRenderJobMongoStoreOptions {
  collection: AvatarVaultMongoCollection<AvatarRenderJobMongoDocument> | (() => Promise<AvatarVaultMongoCollection<AvatarRenderJobMongoDocument>>);
}

export class AvatarRenderJobMongoStore implements AvatarRenderJobStore {
  private ensuredIndexes = false;

  constructor(private readonly options: AvatarRenderJobMongoStoreOptions) {}

  async saveJobSnapshot(snapshot: AvatarRenderJobSnapshot): Promise<AvatarRenderJobSnapshot> {
    const collection = await this.getCollection();
    const doc = jobDocument(snapshot);
    await collection.updateOne(
      { _id: doc._id } as Filter<AvatarRenderJobMongoDocument>,
      { $set: doc },
      { upsert: true },
    );
    return clone(snapshot);
  }

  async getJobSnapshot(jobId: string): Promise<AvatarRenderJobSnapshot | null> {
    const collection = await this.getCollection();
    const doc = await collection.findOne({ _id: jobId } as Filter<AvatarRenderJobMongoDocument>);
    return doc ? clone(stripMongoId(doc)) : null;
  }

  async listJobSnapshots(filter: AvatarRenderJobListFilter = {}): Promise<AvatarRenderJobSnapshot[]> {
    const collection = await this.getCollection();
    const docs = await collection
      .find(toJobFilter(filter))
      .sort({ updatedAt: -1 })
      .limit(250)
      .toArray();
    return docs.map((doc) => clone(stripMongoId(doc)));
  }

  private async getCollection(): Promise<AvatarVaultMongoCollection<AvatarRenderJobMongoDocument>> {
    const collection = typeof this.options.collection === 'function'
      ? await this.options.collection()
      : this.options.collection;
    if (!this.ensuredIndexes) {
      await ensureJobIndexes(collection);
      this.ensuredIndexes = true;
    }
    return collection;
  }
}

export function createInMemoryAvatarRenderJobStore(
  snapshots: AvatarRenderJobSnapshot[] = [],
): InMemoryAvatarRenderJobStore {
  return new InMemoryAvatarRenderJobStore(snapshots);
}

export function createAvatarRenderJobMongoStoreFromEnvironment(): AvatarRenderJobMongoStore | null {
  const uri = process.env.AVATAR_VAULT_MONGODB_URI ?? process.env.MONGODB_URI;
  const dbName = process.env.AVATAR_VAULT_MONGODB_DB_NAME ?? process.env.EDITRON_MONGODB_DB_NAME ?? process.env.MONGODB_DB_NAME;
  if (!uri || !dbName || process.env.AVATAR_VAULT_PERSISTENCE === 'memory') return null;
  return new AvatarRenderJobMongoStore({
    collection: async () => collectionFromDb((await getMongoClient(uri)).db(dbName)),
  });
}

export function getDefaultAvatarRenderJobStore(): AvatarRenderJobStore {
  const globalStore = globalThis as typeof globalThis & {
    __avatarRenderJobStore?: AvatarRenderJobStore;
  };
  globalStore.__avatarRenderJobStore ??=
    createAvatarRenderJobMongoStoreFromEnvironment() ?? createInMemoryAvatarRenderJobStore();
  return globalStore.__avatarRenderJobStore;
}

export async function createAvatarRenderJobFromRequest(
  input: AvatarVaultActorInput & { recordId: string; body: unknown },
  dependencies: CreateAvatarRenderJobDependencies = {},
): Promise<AvatarVaultApiResult<CreateAvatarRenderJobSuccessBody | AvatarRenderJobErrorBody>> {
  const planResult = await planAvatarProfileRender(input, {
    store: dependencies.profileStore,
    now: dependencies.now,
  });
  if (!planResult.body.ok) {
    return { status: planResult.status, body: planResult.body as AvatarRenderJobErrorBody };
  }

  const { recipe, providerPlan } = planResult.body;
  if (!recipe.readiness.ready) {
    return fail(
      409,
      'recipe_not_ready',
      'Avatar render recipe must pass Avatar Vault readiness before a render job can be created.',
      recipe.readiness.errors,
    );
  }

  if (providerPlan.selectedProviderIds.length > 1) {
    return fail(
      409,
      'benchmark_execution_not_supported',
      'Benchmark planning is available, but V1 render jobs create one provider job at a time. Choose Single mode to generate.',
    );
  }

  const providerId = providerPlan.selectedProviderIds[0];
  if (!providerId) {
    return fail(
      409,
      'no_provider_selected',
      'No avatar video provider is ready for this render recipe. Adjust the inputs or choose another provider.',
      providerPlan.rejectedProviders,
    );
  }

  const now = dependencies.now?.() ?? new Date().toISOString();
  const dispatch = resolveProviderDispatch(providerId, dependencies.env ?? process.env);
  const job: AvatarRenderJobSnapshot = {
    id: dependencies.idGenerator?.() ?? `avatar_render_job_${randomUUID()}`,
    recordId: recipe.avatarRecordId,
    avatarId: recipe.avatarId,
    userId: recipe.userId,
    orgId: recipe.orgId ?? null,
    brandId: recipe.brandId ?? null,
    providerId,
    providerDisplayName: AVATAR_PROVIDER_DESCRIPTORS[providerId].displayName,
    status: dispatch.status,
    dispatchCode: dispatch.code,
    statusReason: dispatch.message,
    recipe,
    providerPlan,
    requestBody: asRecord(input.body) ?? {},
    createdAt: now,
    updatedAt: now,
  };

  const store = dependencies.jobStore ?? getDefaultAvatarRenderJobStore();
  await store.saveJobSnapshot(job);
  return {
    status: 201,
    body: {
      ok: true,
      job,
      recipe,
      providerPlan,
    },
  };
}

function resolveProviderDispatch(
  providerId: AvatarProviderId,
  env: Record<string, string | undefined>,
): { status: AvatarRenderJobStatus; code: AvatarRenderJobDispatchCode; message: string } {
  const descriptor = AVATAR_PROVIDER_DESCRIPTORS[providerId];
  if (descriptor.integrationStatus === 'stub_only') {
    return {
      status: 'blocked',
      code: 'provider_stub_only',
      message: `${descriptor.displayName} is registered as a future stub and cannot receive V1 render jobs.`,
    };
  }

  const credentialKeys = credentialKeysForProvider(providerId);
  if (credentialKeys.length > 0 && !credentialKeys.some((key) => Boolean(env[key]?.trim()))) {
    return {
      status: 'blocked',
      code: 'provider_not_configured',
      message: `${descriptor.displayName} is selected, but ${credentialKeys.join(' or ')} is not configured. Job was saved but not dispatched.`,
    };
  }

  return {
    status: 'blocked',
    code: 'provider_adapter_not_implemented',
    message: `${descriptor.displayName} credentials are present, but Avatar Vault does not have the execution adapter wired in this build yet. Job was saved for provider wiring.`,
  };
}

function credentialKeysForProvider(providerId: AvatarProviderId): string[] {
  if (providerId === 'a2e') return ['AVATAR_A2E_API_KEY', 'A2E_API_KEY'];
  if (providerId === 'd_id') return ['AVATAR_D_ID_API_KEY', 'D_ID_API_KEY', 'DID_API_KEY'];
  return [];
}

function collectionFromDb(db: Db): AvatarVaultMongoCollection<AvatarRenderJobMongoDocument> {
  return db.collection<AvatarRenderJobMongoDocument>(AVATAR_RENDER_JOB_COLLECTION);
}

function getMongoClient(uri: string): Promise<MongoClient> {
  cachedRenderJobMongoClient ??= new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 1,
    maxIdleTimeMS: 30000,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  }).connect();
  return cachedRenderJobMongoClient;
}

async function ensureJobIndexes(
  collection: AvatarVaultMongoCollection<AvatarRenderJobMongoDocument>,
): Promise<void> {
  const indexes: IndexDescription[] = [
    { key: { userId: 1, updatedAt: -1 }, name: 'avatar_render_job_user_updatedAt' },
    { key: { recordId: 1, updatedAt: -1 }, name: 'avatar_render_job_record_updatedAt' },
    { key: { userId: 1, orgId: 1, status: 1, updatedAt: -1 }, name: 'avatar_render_job_user_org_status_updatedAt' },
  ];
  await collection.createIndexes?.(indexes);
}

function jobDocument(snapshot: AvatarRenderJobSnapshot): AvatarRenderJobMongoDocument {
  return { _id: snapshot.id, ...clone(snapshot) };
}

function stripMongoId(doc: AvatarRenderJobMongoDocument): AvatarRenderJobSnapshot {
  const { _id: _ignored, ...snapshot } = doc;
  return snapshot;
}

function toJobFilter(filter: AvatarRenderJobListFilter): Filter<AvatarRenderJobMongoDocument> {
  return Object.fromEntries(
    Object.entries(filter).filter(([, value]) => value !== undefined),
  ) as Filter<AvatarRenderJobMongoDocument>;
}

function matchesJobFilter(snapshot: AvatarRenderJobSnapshot, filter: AvatarRenderJobListFilter): boolean {
  if (filter.recordId && snapshot.recordId !== filter.recordId) return false;
  if (filter.userId && snapshot.userId !== filter.userId) return false;
  if (filter.orgId !== undefined && (snapshot.orgId ?? null) !== filter.orgId) return false;
  if (filter.status && snapshot.status !== filter.status) return false;
  return true;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? clone(value as Record<string, unknown>)
    : undefined;
}

function fail(
  status: number,
  code: string,
  message: string,
  issues?: unknown[],
): AvatarVaultApiResult<AvatarRenderJobErrorBody> {
  return {
    status,
    body: {
      ok: false,
      error: {
        code,
        message,
        ...(issues ? { issues } : {}),
      },
    },
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
