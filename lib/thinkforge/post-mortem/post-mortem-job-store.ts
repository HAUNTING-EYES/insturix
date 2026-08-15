import { createHash, randomUUID } from 'node:crypto';
import { MongoClient, type Collection } from 'mongodb';
import type { PostMortemPreparedPlan, PostMortemResult } from './post-mortem-contract';
import {
  PostMortemJobCheckpointConflictError,
  PostMortemJobLeaseLostError,
  THINKFORGE_POST_MORTEM_JOB_COLLECTION,
  THINKFORGE_POST_MORTEM_JOB_INDEXES,
  THINKFORGE_POST_MORTEM_JOB_LEASE_MS,
  THINKFORGE_POST_MORTEM_JOB_MAX_ATTEMPTS,
  THINKFORGE_POST_MORTEM_JOB_TTL_MS,
  THINKFORGE_POST_MORTEM_JOB_VERSION,
  type ClaimPostMortemJobResult,
  type PostMortemJobError,
  type PostMortemJobInput,
  type PostMortemJobRecord,
  type PostMortemJobSnapshot,
} from './post-mortem-job-contract';

export * from './post-mortem-job-contract';

let cachedMongoClient: Promise<MongoClient> | null = null;
let indexesEnsured = false;

async function mongoJobCollection(): Promise<Collection<PostMortemJobRecord>> {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.THINKFORGE_MONGODB_DB_NAME ?? 'thinkforge_db';
  if (!uri) throw new Error('ThinkForge post-mortem jobs require MONGODB_URI.');

  cachedMongoClient ??= new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 0,
    maxIdleTimeMS: 30_000,
    serverSelectionTimeoutMS: 5_000,
    connectTimeoutMS: 5_000,
  }).connect();
  const collection = (await cachedMongoClient)
    .db(dbName)
    .collection<PostMortemJobRecord>(THINKFORGE_POST_MORTEM_JOB_COLLECTION);
  if (!indexesEnsured) {
    await collection.createIndexes(THINKFORGE_POST_MORTEM_JOB_INDEXES);
    indexesEnsured = true;
  }
  return collection;
}

export class PostMortemJobStore {
  constructor(
    private readonly collectionProvider: () => Promise<Collection<PostMortemJobRecord>> = mongoJobCollection,
  ) {}

  async createOrGet(input: PostMortemJobInput, now = new Date()): Promise<{
    job: PostMortemJobSnapshot;
    created: boolean;
  }> {
    const collection = await this.collectionProvider();
    const dedupeKey = createPostMortemJobDedupeKey(input);
    const existing = await collection.findOne({ activeDedupeKey: dedupeKey });
    if (existing) {
      const upgraded = input.deleteSessionOnCompletion && !existing.input.deleteSessionOnCompletion
        ? await collection.findOneAndUpdate(
          { _id: existing._id, activeDedupeKey: dedupeKey, 'input.deleteSessionOnCompletion': false },
          { $set: { 'input.deleteSessionOnCompletion': true, updatedAt: now } },
          { returnDocument: 'after' },
        )
        : null;
      return { job: toSnapshot(upgraded ?? existing), created: false };
    }

    const id = `postmortem_${randomUUID().replace(/-/g, '')}`;
    const record: PostMortemJobRecord = {
      _id: id,
      id,
      version: THINKFORGE_POST_MORTEM_JOB_VERSION,
      dedupeKey,
      activeDedupeKey: dedupeKey,
      userId: input.userId,
      orgId: input.orgId ?? null,
      input: clone(input),
      status: 'queued',
      attemptCount: 0,
      maxAttempts: THINKFORGE_POST_MORTEM_JOB_MAX_ATTEMPTS,
      leaseExpiresAt: null,
      queueMessageId: null,
      checkpoint: null,
      checkpointHash: null,
      result: null,
      error: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + THINKFORGE_POST_MORTEM_JOB_TTL_MS),
    };
    try {
      await collection.insertOne(record);
      return { job: toSnapshot(record), created: true };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const concurrent = await collection.findOne({ activeDedupeKey: dedupeKey });
      if (!concurrent) throw error;
      return { job: toSnapshot(concurrent), created: false };
    }
  }

  async getAuthorized(jobId: string, userId: string, orgId: string | null): Promise<PostMortemJobSnapshot | null> {
    const record = await (await this.collectionProvider()).findOne({ _id: jobId, userId, orgId });
    return record ? toSnapshot(record) : null;
  }

  async claim(jobId: string, now = new Date()): Promise<ClaimPostMortemJobResult> {
    const collection = await this.collectionProvider();
    const leaseToken = randomUUID();
    const record = await collection.findOneAndUpdate(
      {
        _id: jobId,
        $expr: { $lt: ['$attemptCount', '$maxAttempts'] },
        $or: [
          { status: 'queued' },
          { status: 'running', leaseExpiresAt: { $lte: now } },
        ],
      },
      {
        $set: {
          status: 'running',
          leaseToken,
          leaseExpiresAt: new Date(now.getTime() + THINKFORGE_POST_MORTEM_JOB_LEASE_MS),
          updatedAt: now,
          error: null,
        },
        $inc: { attemptCount: 1 },
      },
      { returnDocument: 'after' },
    );
    if (record) return { kind: 'claimed', job: toSnapshot(record), leaseToken };

    const current = await collection.findOne({ _id: jobId });
    if (!current) return { kind: 'skipped', reason: 'not_found' };
    if (current.status === 'completed' || current.status === 'dead_letter') {
      return { kind: 'skipped', reason: 'terminal' };
    }
    if (current.status === 'running' && current.leaseExpiresAt && current.leaseExpiresAt > now) {
      return { kind: 'skipped', reason: 'lease_held' };
    }
    if (current.attemptCount >= current.maxAttempts) {
      await this.deadLetterExhausted(collection, current, now);
      return { kind: 'skipped', reason: 'attempts_exhausted' };
    }
    return { kind: 'skipped', reason: 'lease_held' };
  }

  async heartbeat(jobId: string, leaseToken: string, now = new Date()): Promise<void> {
    const result = await (await this.collectionProvider()).updateOne(
      { _id: jobId, status: 'running', leaseToken, leaseExpiresAt: { $gt: now } },
      { $set: { leaseExpiresAt: new Date(now.getTime() + THINKFORGE_POST_MORTEM_JOB_LEASE_MS), updatedAt: now } },
    );
    if (result.matchedCount !== 1) throw new PostMortemJobLeaseLostError();
  }

  async saveCheckpoint(jobId: string, leaseToken: string, checkpoint: PostMortemPreparedPlan, now = new Date()): Promise<void> {
    const collection = await this.collectionProvider();
    const checkpointHash = hashValue(checkpoint);
    const result = await collection.updateOne(
      { _id: jobId, status: 'running', leaseToken, checkpointHash: null },
      { $set: { checkpoint: clone(checkpoint), checkpointHash, updatedAt: now } },
    );
    if (result.matchedCount === 1) return;

    const current = await collection.findOne({ _id: jobId, status: 'running', leaseToken });
    if (!current) throw new PostMortemJobLeaseLostError();
    if (current.checkpointHash !== checkpointHash) throw new PostMortemJobCheckpointConflictError();
  }

  async complete(jobId: string, leaseToken: string, result: PostMortemResult, now = new Date()): Promise<void> {
    const update = await (await this.collectionProvider()).updateOne(
      { _id: jobId, status: 'running', leaseToken },
      {
        $set: { status: 'completed', result: clone(result), error: null, leaseExpiresAt: null, updatedAt: now },
        $unset: { activeDedupeKey: '', leaseToken: '' },
      },
    );
    if (update.matchedCount !== 1) throw new PostMortemJobLeaseLostError();
  }

  async retryOrDeadLetter(
    jobId: string,
    leaseToken: string,
    error: unknown,
    now = new Date(),
  ): Promise<'queued' | 'dead_letter'> {
    const collection = await this.collectionProvider();
    const current = await collection.findOne({ _id: jobId, status: 'running', leaseToken });
    if (!current) throw new PostMortemJobLeaseLostError();
    const jobError = normalizeJobError(error, current.attemptCount < current.maxAttempts);
    const terminal = current.attemptCount >= current.maxAttempts;
    const update = await collection.updateOne(
      { _id: jobId, status: 'running', leaseToken, attemptCount: current.attemptCount },
      terminal
        ? {
          $set: { status: 'dead_letter', error: { ...jobError, retryable: false }, leaseExpiresAt: null, updatedAt: now },
          $unset: { activeDedupeKey: '', leaseToken: '' },
        }
        : {
          $set: { status: 'queued', error: jobError, leaseExpiresAt: null, updatedAt: now },
          $unset: { leaseToken: '' },
        },
    );
    if (update.matchedCount !== 1) throw new PostMortemJobLeaseLostError();
    return terminal ? 'dead_letter' : 'queued';
  }

  async setQueueMessage(jobId: string, messageId: string, now = new Date()): Promise<void> {
    await (await this.collectionProvider()).updateOne(
      { _id: jobId, status: 'queued' },
      { $set: { queueMessageId: messageId, updatedAt: now } },
    );
  }

  async markDispatchFailed(jobId: string, error: unknown, now = new Date()): Promise<void> {
    await (await this.collectionProvider()).updateOne(
      { _id: jobId, status: 'queued' },
      { $set: { error: normalizeJobError(error, true), updatedAt: now } },
    );
  }

  async listRecoverable(staleBefore: Date, limit = 25): Promise<PostMortemJobSnapshot[]> {
    const records = await (await this.collectionProvider()).find({
      $or: [
        { status: 'queued', updatedAt: { $lte: staleBefore } },
        { status: 'running', leaseExpiresAt: { $lte: new Date() } },
      ],
    }).sort({ updatedAt: 1 }).limit(Math.max(1, Math.min(limit, 100))).toArray();
    return records.map(toSnapshot);
  }

  private async deadLetterExhausted(
    collection: Collection<PostMortemJobRecord>,
    current: PostMortemJobRecord,
    now: Date,
  ): Promise<void> {
    await collection.updateOne(
      { _id: current._id, status: current.status, attemptCount: current.attemptCount },
      {
        $set: {
          status: 'dead_letter',
          error: { code: 'attempts_exhausted', message: 'Post-mortem processing exhausted all attempts.', retryable: false },
          leaseExpiresAt: null,
          updatedAt: now,
        },
        $unset: { activeDedupeKey: '', leaseToken: '' },
      },
    );
  }
}

export const postMortemJobStore = new PostMortemJobStore();

export function createPostMortemJobDedupeKey(input: PostMortemJobInput): string {
  return createHash('sha256').update(JSON.stringify({
    version: THINKFORGE_POST_MORTEM_JOB_VERSION,
    userId: input.userId,
    orgId: input.orgId ?? null,
    sessionId: input.sessionId,
  })).digest('hex');
}

function toSnapshot(record: PostMortemJobRecord): PostMortemJobSnapshot {
  const { _id: _ignoredId, activeDedupeKey: _ignoredDedupe, leaseToken: _ignoredLease, ...rest } = record;
  return {
    ...clone(rest),
    leaseExpiresAt: record.leaseExpiresAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
  };
}

function normalizeJobError(error: unknown, retryable: boolean): PostMortemJobError {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
  return { code: error instanceof Error ? error.name || 'processing_failed' : 'processing_failed', message, retryable };
}

function hashValue(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 11000);
}
