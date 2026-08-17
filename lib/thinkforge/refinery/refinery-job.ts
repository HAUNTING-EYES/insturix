import { createHash, randomUUID } from 'node:crypto';
import { Client } from '@upstash/qstash';
import { MongoClient, type Collection, type Filter, type IndexDescription } from 'mongodb';
import { getCreditCost } from '@/lib/config/creditCosts';
import type { WalletRef } from '@/lib/editron/services/project-ownership';
import { runRefineryAgent, type RefineryResult } from '@/lib/thinkforge/agents/refinery-agent';

export const THINKFORGE_REFINERY_JOB_VERSION = 1;
export const THINKFORGE_REFINERY_JOB_COLLECTION = 'thinkforge_refinery_jobs';
const MAX_ATTEMPTS = 3;
const LEASE_MS = 3 * 60_000;
const JOB_TTL_MS = 14 * 24 * 60 * 60_000;
const RECOVERY_STALE_MS = 2 * 60_000;

export type ThinkForgeRefineryJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface ThinkForgeRefineryJobSnapshot {
  id: string;
  version: number;
  /** One user/session/URL-set can have one active job. Terminal jobs release this key. */
  dedupeKey: string;
  /** Unique billing operation key. Never reused after a refunded terminal job. */
  idempotencyKey: string;
  userId: string;
  orgId: string | null;
  sessionId: string;
  urls: string[];
  status: ThinkForgeRefineryJobStatus;
  attemptCount: number;
  maxAttempts: number;
  leaseExpiresAt: string | null;
  queueMessageId: string | null;
  charge: {
    amount: number;
    wallet: WalletRef;
    transactionId: string | null;
    status: 'pending' | 'charged' | 'refunded' | 'refund_pending';
  };
  result: RefineryResult | null;
  error: { code: string; message: string } | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

interface ThinkForgeRefineryJobDocument extends ThinkForgeRefineryJobSnapshot {
  _id: string;
  /** Sparse unique index: unset only after a terminal outcome. */
  activeDedupeKey?: string;
}

export interface CreateThinkForgeRefineryJobInput {
  userId: string;
  orgId: string | null;
  sessionId: string;
  urls: string[];
  wallet: WalletRef;
}

export type ClaimRefineryJobResult =
  | { kind: 'claimed'; job: ThinkForgeRefineryJobSnapshot }
  | { kind: 'skipped'; reason: 'not_found' | 'terminal' | 'lease_held' };

export type ChargeRefineryJobResult =
  | { ok: true; job: ThinkForgeRefineryJobSnapshot }
  | { ok: false; code: 'insufficient_credits' | 'charge_failed'; message: string };

let cachedMongoClient: Promise<MongoClient> | null = null;
let indexesEnsured = false;

function nowIso(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toSnapshot(document: ThinkForgeRefineryJobDocument): ThinkForgeRefineryJobSnapshot {
  const { _id: _ignored, activeDedupeKey: _activeDedupeKey, ...snapshot } = document;
  return clone(snapshot);
}

async function jobCollection(): Promise<Collection<ThinkForgeRefineryJobDocument>> {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.THINKFORGE_MONGODB_DB_NAME ?? 'thinkforge_db';
  if (!uri) throw new Error('ThinkForge refinery jobs require MONGODB_URI.');

  cachedMongoClient ??= new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 1,
    maxIdleTimeMS: 30_000,
    serverSelectionTimeoutMS: 5_000,
    connectTimeoutMS: 5_000,
  }).connect();

  const collection = (await cachedMongoClient).db(dbName).collection<ThinkForgeRefineryJobDocument>(THINKFORGE_REFINERY_JOB_COLLECTION);
  if (!indexesEnsured) {
    const indexes: IndexDescription[] = [
      { key: { idempotencyKey: 1 }, name: 'thinkforge_refinery_job_idempotency', unique: true },
      { key: { activeDedupeKey: 1 }, name: 'thinkforge_refinery_job_active_dedupe', unique: true, sparse: true },
      { key: { userId: 1, status: 1, updatedAt: -1 }, name: 'thinkforge_refinery_job_user_status' },
      { key: { expiresAt: 1 }, name: 'thinkforge_refinery_job_ttl', expireAfterSeconds: 0 },
    ];
    await collection.createIndexes(indexes);
    indexesEnsured = true;
  }
  return collection;
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 11000);
}

function terminalUpdate(now = nowIso()) {
  return { $unset: { activeDedupeKey: '' as const }, $set: { leaseExpiresAt: null, updatedAt: now } };
}

export function isThinkForgeRefineryWorkerConfigured(): boolean {
  const isDev = process.env.APP_ENV === 'development' || process.env.NODE_ENV === 'development';
  return Boolean(process.env.QSTASH_TOKEN) && (isDev || Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY));
}

function createThinkForgeRefineryDedupeKey(input: Pick<CreateThinkForgeRefineryJobInput, 'userId' | 'orgId' | 'sessionId' | 'urls'>): string {
  const payload = JSON.stringify({
    version: THINKFORGE_REFINERY_JOB_VERSION,
    userId: input.userId,
    orgId: input.orgId,
    sessionId: input.sessionId,
    urls: [...input.urls].sort(),
  });
  return createHash('sha256').update(payload).digest('hex');
}

export async function createOrGetQueuedThinkForgeRefineryJob(input: CreateThinkForgeRefineryJobInput): Promise<{ job: ThinkForgeRefineryJobSnapshot; created: boolean }> {
  const collection = await jobCollection();
  const dedupeKey = createThinkForgeRefineryDedupeKey(input);
  const existing = await collection.findOne({ activeDedupeKey: dedupeKey });
  if (existing) return { job: toSnapshot(existing), created: false };

  const createdAt = nowIso();
  const jobId = `refinery_${randomUUID().replace(/-/g, '')}`;
  const job: ThinkForgeRefineryJobDocument = {
    _id: jobId,
    id: jobId,
    version: THINKFORGE_REFINERY_JOB_VERSION,
    dedupeKey,
    idempotencyKey: `thinkforge:refinery:${randomUUID()}`,
    activeDedupeKey: dedupeKey,
    userId: input.userId,
    orgId: input.orgId,
    sessionId: input.sessionId,
    urls: [...input.urls],
    status: 'queued',
    attemptCount: 0,
    maxAttempts: MAX_ATTEMPTS,
    leaseExpiresAt: null,
    queueMessageId: null,
    charge: {
      amount: getCreditCost('thinkforge', 'chat_message'),
      wallet: clone(input.wallet),
      transactionId: null,
      status: 'pending',
    },
    result: null,
    error: null,
    createdAt,
    updatedAt: createdAt,
    expiresAt: new Date(Date.now() + JOB_TTL_MS).toISOString(),
  };
  try {
    await collection.insertOne(job);
    return { job: toSnapshot(job), created: true };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const concurrent = await collection.findOne({ activeDedupeKey: dedupeKey });
    if (!concurrent) throw error;
    return { job: toSnapshot(concurrent), created: false };
  }
}

export async function getThinkForgeRefineryJob(jobId: string, userId: string, orgId: string | null): Promise<ThinkForgeRefineryJobSnapshot | null> {
  const collection = await jobCollection();
  const document = await collection.findOne({ _id: jobId, userId, orgId });
  return document ? toSnapshot(document) : null;
}

async function setThinkForgeRefineryJobQueueMessage(jobId: string, queueMessageId: string): Promise<void> {
  const collection = await jobCollection();
  await collection.updateOne(
    { _id: jobId, status: 'queued' },
    { $set: { queueMessageId, updatedAt: nowIso() } },
  );
}

export async function markThinkForgeRefineryDispatchFailed(jobId: string, error: unknown): Promise<void> {
  const collection = await jobCollection();
  const message = error instanceof Error ? error.message : String(error);
  await collection.updateOne(
    { _id: jobId, status: 'queued', 'charge.status': 'pending' },
    {
      ...terminalUpdate(),
      $set: {
        leaseExpiresAt: null,
        error: { code: 'dispatch_failed', message },
        updatedAt: nowIso(),
        status: 'failed',
      },
    },
  );
}

export async function claimThinkForgeRefineryJob(jobId: string): Promise<ClaimRefineryJobResult> {
  const collection = await jobCollection();
  const current = await collection.findOne({ _id: jobId });
  if (!current) return { kind: 'skipped', reason: 'not_found' };
  if (current.status === 'completed' || current.status === 'failed') return { kind: 'skipped', reason: 'terminal' };

  const now = new Date();
  const leaseExpiresAt = current.leaseExpiresAt ? new Date(current.leaseExpiresAt) : null;
  if (current.status === 'running' && leaseExpiresAt && leaseExpiresAt > now) return { kind: 'skipped', reason: 'lease_held' };

  const filter: Filter<ThinkForgeRefineryJobDocument> = current.status === 'running'
    ? { _id: jobId, status: 'running', leaseExpiresAt: current.leaseExpiresAt }
    : { _id: jobId, status: 'queued' };
  const updated = await collection.findOneAndUpdate(
    filter,
    {
      $set: {
        status: 'running',
        leaseExpiresAt: new Date(now.getTime() + LEASE_MS).toISOString(),
        updatedAt: now.toISOString(),
        error: null,
      },
      $inc: { attemptCount: 1 },
    },
    { returnDocument: 'after' },
  );
  if (!updated) return { kind: 'skipped', reason: 'lease_held' };
  return { kind: 'claimed', job: toSnapshot(updated) };
}

export async function chargeThinkForgeRefineryJob(job: ThinkForgeRefineryJobSnapshot): Promise<ChargeRefineryJobResult> {
  if (job.charge.status === 'charged') return { ok: true, job };
  if (job.charge.status !== 'pending') {
    return { ok: false, code: 'charge_failed', message: `Refinery job charge is ${job.charge.status}.` };
  }

  if (job.charge.amount === 0) {
    const collection = await jobCollection();
    const updated = await collection.findOneAndUpdate(
      { _id: job.id, status: 'running', 'charge.status': 'pending' },
      { $set: { 'charge.status': 'charged', 'charge.transactionId': 'no_charge', updatedAt: nowIso() } },
      { returnDocument: 'after' },
    );
    return updated
      ? { ok: true, job: toSnapshot(updated) }
      : { ok: false, code: 'charge_failed', message: 'Unable to record the zero-cost refinery job.' };
  }

  const { CreditsService } = await import('@/lib/services/creditsService');
  const credit = await CreditsService.deductForWallet(
    job.charge.wallet,
    'thinkforge',
    'chat_message',
    { taskId: job.sessionId, idempotencyKey: job.idempotencyKey },
  );
  if (!credit.success || !credit.transactionId) {
    return { ok: false, code: 'insufficient_credits', message: credit.error || 'Insufficient credits for link analysis.' };
  }

  const collection = await jobCollection();
  const updated = await collection.findOneAndUpdate(
    { _id: job.id, status: 'running', 'charge.status': 'pending' },
    {
      $set: {
        'charge.status': 'charged',
        'charge.transactionId': credit.transactionId,
        updatedAt: nowIso(),
      },
    },
    { returnDocument: 'after' },
  );
  if (updated) return { ok: true, job: toSnapshot(updated) };

  // A crash between the debit and this write is recoverable: the next delivery uses the same
  // idempotency key and receives this transaction instead of charging the wallet again.
  return { ok: false, code: 'charge_failed', message: 'Unable to persist the refinery charge receipt.' };
}

async function completeThinkForgeRefineryJob(jobId: string, result: RefineryResult): Promise<void> {
  const collection = await jobCollection();
  await collection.updateOne(
    { _id: jobId, status: 'running' },
    {
      ...terminalUpdate(),
      $set: {
        leaseExpiresAt: null,
        updatedAt: nowIso(),
        status: 'completed',
        result: clone(result),
      },
    },
  );
}

export async function failThinkForgeRefineryJob(jobId: string, code: string, message: string): Promise<void> {
  const collection = await jobCollection();
  await collection.updateOne(
    { _id: jobId, status: { $in: ['queued', 'running'] } },
    {
      ...terminalUpdate(),
      $set: {
        leaseExpiresAt: null,
        updatedAt: nowIso(),
        status: 'failed',
        error: { code, message },
      },
    },
  );
}

export async function retryOrFailThinkForgeRefineryJob(job: ThinkForgeRefineryJobSnapshot, error: unknown): Promise<'retrying' | 'failed'> {
  const collection = await jobCollection();
  const message = error instanceof Error ? error.message : String(error);
  if (job.attemptCount < job.maxAttempts) {
    await collection.updateOne(
      { _id: job.id, status: 'running', attemptCount: job.attemptCount },
      {
        $set: {
          status: 'queued',
          leaseExpiresAt: null,
          error: { code: 'transient_failure', message },
          updatedAt: nowIso(),
        },
      },
    );
    return 'retrying';
  }
  await failThinkForgeRefineryJob(job.id, 'processing_failed', message);
  return 'failed';
}

export async function refundThinkForgeRefineryJob(jobId: string, reason: string): Promise<'refunded' | 'already_refunded' | 'refund_pending'> {
  const collection = await jobCollection();
  const job = await collection.findOne({ _id: jobId });
  if (!job || job.charge.status === 'refunded' || job.charge.amount === 0 || job.charge.transactionId === 'no_charge') {
    return job?.charge.status === 'refunded' ? 'already_refunded' : 'refunded';
  }
  const claimed = await collection.findOneAndUpdate(
    { _id: jobId, 'charge.status': 'charged' },
    { $set: { 'charge.status': 'refund_pending', updatedAt: nowIso() } },
    { returnDocument: 'after' },
  );
  if (!claimed) return 'already_refunded';

  try {
    const { CreditsService } = await import('@/lib/services/creditsService');
    const result = await CreditsService.refundForWallet(
      claimed.charge.wallet,
      claimed.charge.amount,
      reason,
      {
        service: 'thinkforge',
        action: 'chat_message',
        originalTransactionId: claimed.charge.transactionId ?? undefined,
      },
    );
    if (!result.success) throw new Error(result.error || 'Credit refund failed.');
    await collection.updateOne(
      { _id: jobId, 'charge.status': 'refund_pending' },
      { $set: { 'charge.status': 'refunded', updatedAt: nowIso() } },
    );
    return 'refunded';
  } catch (refundError) {
    console.error('[ThinkForge:RefineryJob] Credit refund needs reconciliation:', {
      jobId,
      error: refundError instanceof Error ? refundError.message : 'unknown',
    });
    return 'refund_pending';
  }
}

export async function runClaimedThinkForgeRefineryJob(job: ThinkForgeRefineryJobSnapshot): Promise<void> {
  const result = await runRefineryAgent({
    userId: job.userId,
    orgId: job.orgId,
    sessionId: job.sessionId,
    urls: job.urls,
  });
  if (result.processed === 0) {
    throw new Error('None of the supplied research sources could be analyzed.');
  }
  await completeThinkForgeRefineryJob(job.id, result);
}

export async function dispatchThinkForgeRefineryJob(job: ThinkForgeRefineryJobSnapshot): Promise<string> {
  const qstash = new Client({ token: process.env.QSTASH_TOKEN!, baseUrl: process.env.QSTASH_URL || undefined });
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const dispatch = await qstash.publishJSON({
    url: `${base}/api/internal/workers/thinkforge/refinery`,
    body: { jobId: job.id },
    retries: MAX_ATTEMPTS - 1,
    // The Mongo lease is the execution authority. A unique QStash dispatch key
    // lets recovery safely redeliver a job when an earlier delivery was lost.
    deduplicationId: `${job.id}:${randomUUID()}`,
  });
  await setThinkForgeRefineryJobQueueMessage(job.id, dispatch.messageId);
  return dispatch.messageId;
}

export async function recoverStalledThinkForgeRefineryJobs(limit = 25): Promise<{
  candidates: number;
  dispatched: number;
  failed: number;
}> {
  if (!isThinkForgeRefineryWorkerConfigured()) {
    throw new Error('ThinkForge refinery worker is not configured.');
  }
  const collection = await jobCollection();
  const staleBefore = new Date(Date.now() - RECOVERY_STALE_MS).toISOString();
  const candidates = await collection.find({
    $or: [
      { status: 'queued', updatedAt: { $lte: staleBefore } },
      { status: 'running', leaseExpiresAt: { $lte: staleBefore } },
    ],
  }).sort({ updatedAt: 1 }).limit(Math.max(1, Math.min(limit, 100))).toArray();

  const results = await Promise.allSettled(candidates.map((candidate) => dispatchThinkForgeRefineryJob(toSnapshot(candidate))));
  return {
    candidates: candidates.length,
    dispatched: results.filter((result) => result.status === 'fulfilled').length,
    failed: results.filter((result) => result.status === 'rejected').length,
  };
}
