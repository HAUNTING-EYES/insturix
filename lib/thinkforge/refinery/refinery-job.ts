import { createHash, randomUUID } from 'node:crypto';
import { Client } from '@upstash/qstash';
import { MongoClient, type Collection, type Filter, type IndexDescription, type UpdateFilter } from 'mongodb';
import { getCreditCost } from '@/lib/config/creditCosts';
import type { WalletRef } from '@/lib/editron/services/project-ownership';
import { runRefineryAgent, type RefineryResult } from '@/lib/thinkforge/agents/refinery-agent';

export const THINKFORGE_REFINERY_JOB_VERSION = 1;
export const THINKFORGE_REFINERY_JOB_COLLECTION = 'thinkforge_refinery_jobs';
const MAX_ATTEMPTS = 3;
const LEASE_MS = 4 * 60_000;
export const THINKFORGE_REFINERY_JOB_TTL_MS = 14 * 24 * 60 * 60_000;
const RECOVERY_STALE_MS = 2 * 60_000;
export const THINKFORGE_REFINERY_JOB_INDEXES: IndexDescription[] = [
  { key: { idempotencyKey: 1 }, name: 'thinkforge_refinery_job_idempotency', unique: true },
  { key: { activeDedupeKey: 1 }, name: 'thinkforge_refinery_job_active_dedupe', unique: true, sparse: true },
  { key: { userId: 1, status: 1, updatedAt: -1 }, name: 'thinkforge_refinery_job_user_status' },
  { key: { status: 1, 'charge.status': 1, updatedAt: 1 }, name: 'thinkforge_refinery_job_reconciliation' },
  { key: { expiresAt: 1 }, name: 'thinkforge_refinery_job_ttl', expireAfterSeconds: 0 },
];

export type ThinkForgeRefineryJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'dead_letter';

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
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  queueMessageId: string | null;
  charge: {
    amount: number;
    wallet: WalletRef;
    transactionId: string | null;
    status: 'pending' | 'charged' | 'refunded' | 'refund_pending';
  };
  result: RefineryResult | null;
  error: { code: string; message: string; retryable: boolean } | null;
  deadLetteredAt: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

interface ThinkForgeRefineryJobDocument extends Omit<
  ThinkForgeRefineryJobSnapshot,
  'leaseToken' | 'deadLetteredAt' | 'expiresAt'
> {
  _id: string;
  /** Sparse unique index: unset only after a terminal outcome. */
  activeDedupeKey?: string;
  /** Optional for rows created before tokenized leases were introduced. */
  leaseToken?: string | null;
  /** Optional for rows created before the explicit dead-letter lifecycle. */
  deadLetteredAt?: string | null;
  /** Mongo TTL indexes require a BSON Date, never an ISO string. */
  expiresAt: Date;
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
  | { kind: 'skipped'; reason: 'not_found' | 'terminal' | 'lease_held' | 'attempts_exhausted' };

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

export function buildThinkForgeRefineryJobExpiry(now = new Date()): Date {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error('ThinkForge refinery expiry requires a valid date.');
  }
  return new Date(now.getTime() + THINKFORGE_REFINERY_JOB_TTL_MS);
}

export function serializeThinkForgeRefineryJobExpiry(expiresAt: Date): string {
  if (!(expiresAt instanceof Date) || !Number.isFinite(expiresAt.getTime())) {
    throw new Error('ThinkForge refinery job has an invalid BSON expiry date.');
  }
  return expiresAt.toISOString();
}

function toSnapshot(document: ThinkForgeRefineryJobDocument): ThinkForgeRefineryJobSnapshot {
  const { _id: _ignored, activeDedupeKey: _activeDedupeKey, expiresAt, ...snapshot } = document;
  return clone({
    ...snapshot,
    expiresAt: serializeThinkForgeRefineryJobExpiry(expiresAt),
    leaseToken: snapshot.leaseToken ?? null,
    deadLetteredAt: snapshot.deadLetteredAt ?? null,
    error: snapshot.error
      ? { ...snapshot.error, retryable: snapshot.error.retryable ?? false }
      : null,
  });
}

export interface ThinkForgeRefineryJobRetentionCollection {
  updateMany(
    filter: Record<string, unknown>,
    update: Record<string, unknown>[],
  ): Promise<unknown>;
  createIndexes(indexes: IndexDescription[]): Promise<unknown>;
}

export async function ensureThinkForgeRefineryJobRetention(
  collection: ThinkForgeRefineryJobRetentionCollection,
): Promise<void> {
  await collection.updateMany(
    {
      $or: [
        { expiresAt: { $type: 'string' } },
        { expiresAt: { $exists: false } },
        { expiresAt: null },
      ],
    },
    [{
      $set: {
        expiresAt: {
          $cond: [
            { $eq: [{ $type: '$expiresAt' }, 'string'] },
            { $convert: { input: '$expiresAt', to: 'date' } },
            {
              $dateAdd: {
                startDate: { $convert: { input: '$createdAt', to: 'date' } },
                unit: 'millisecond',
                amount: THINKFORGE_REFINERY_JOB_TTL_MS,
              },
            },
          ],
        },
      },
    }],
  );
  await collection.createIndexes(THINKFORGE_REFINERY_JOB_INDEXES);
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
    await ensureThinkForgeRefineryJobRetention(
      collection as unknown as ThinkForgeRefineryJobRetentionCollection,
    );
    indexesEnsured = true;
  }
  return collection;
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 11000);
}

function terminalUpdate(
  fields: Partial<ThinkForgeRefineryJobDocument>,
  now = nowIso(),
): UpdateFilter<ThinkForgeRefineryJobDocument> {
  return {
    $unset: { activeDedupeKey: '' as const },
    $set: { ...fields, leaseToken: null, leaseExpiresAt: null, updatedAt: now },
  };
}

function refineryError(code: string, message: string, retryable: boolean) {
  return { code, message: message.trim().slice(0, 1_000), retryable };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function claimedLeaseFilter(job: ThinkForgeRefineryJobSnapshot): Filter<ThinkForgeRefineryJobDocument> {
  if (!job.leaseToken) throw new Error('Claimed refinery job is missing its lease token.');
  return {
    _id: job.id,
    status: 'running',
    attemptCount: job.attemptCount,
    leaseToken: job.leaseToken,
  };
}

async function deadLetterExhaustedRefineryJob(
  collection: Collection<ThinkForgeRefineryJobDocument>,
  job: ThinkForgeRefineryJobDocument,
  now: string,
): Promise<boolean> {
  const ownership: Filter<ThinkForgeRefineryJobDocument> = job.status === 'running'
    ? {
        _id: job.id,
        status: 'running',
        attemptCount: job.attemptCount,
        leaseExpiresAt: job.leaseExpiresAt,
      }
    : { _id: job.id, status: 'queued', attemptCount: job.attemptCount };
  const update = await collection.updateOne(
    ownership,
    terminalUpdate({
      status: 'dead_letter',
      deadLetteredAt: now,
      error: refineryError(
        'attempts_exhausted',
        'Research processing exhausted its delivery attempts.',
        false,
      ),
    }, now),
  );
  return update.matchedCount === 1;
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

  const createdAtDate = new Date();
  const createdAt = createdAtDate.toISOString();
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
    leaseToken: null,
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
    deadLetteredAt: null,
    createdAt,
    updatedAt: createdAt,
    expiresAt: buildThinkForgeRefineryJobExpiry(createdAtDate),
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

export async function recordThinkForgeRefineryDispatchFailure(
  jobId: string,
  error: unknown,
): Promise<ThinkForgeRefineryJobSnapshot | null> {
  const collection = await jobCollection();
  const updated = await collection.findOneAndUpdate(
    { _id: jobId, status: 'queued' },
    {
      $set: {
        error: refineryError('dispatch_failed', errorMessage(error), true),
        updatedAt: nowIso(),
      },
    },
    { returnDocument: 'after' },
  );
  return updated ? toSnapshot(updated) : null;
}

export async function claimThinkForgeRefineryJob(jobId: string): Promise<ClaimRefineryJobResult> {
  const collection = await jobCollection();
  const current = await collection.findOne({ _id: jobId });
  if (!current) return { kind: 'skipped', reason: 'not_found' };
  if (current.status === 'completed' || current.status === 'failed' || current.status === 'dead_letter') {
    return { kind: 'skipped', reason: 'terminal' };
  }

  const now = new Date();
  const leaseExpiresAt = current.leaseExpiresAt ? new Date(current.leaseExpiresAt) : null;
  if (current.status === 'running' && leaseExpiresAt && leaseExpiresAt > now) return { kind: 'skipped', reason: 'lease_held' };
  if (current.attemptCount >= current.maxAttempts) {
    await deadLetterExhaustedRefineryJob(collection, current, now.toISOString());
    return { kind: 'skipped', reason: 'attempts_exhausted' };
  }

  const leaseToken = randomUUID();
  const filter: Filter<ThinkForgeRefineryJobDocument> = current.status === 'running'
    ? { _id: jobId, status: 'running', attemptCount: current.attemptCount, leaseExpiresAt: current.leaseExpiresAt }
    : { _id: jobId, status: 'queued', attemptCount: current.attemptCount };
  const updated = await collection.findOneAndUpdate(
    filter,
    {
      $set: {
        status: 'running',
        leaseToken,
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
      { ...claimedLeaseFilter(job), 'charge.status': 'pending' },
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
    { ...claimedLeaseFilter(job), 'charge.status': 'pending' },
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

async function completeThinkForgeRefineryJob(job: ThinkForgeRefineryJobSnapshot, result: RefineryResult): Promise<void> {
  const collection = await jobCollection();
  const update = await collection.updateOne(
    claimedLeaseFilter(job),
    terminalUpdate({ status: 'completed', result: clone(result), error: null }),
  );
  if (update.matchedCount !== 1) throw new Error('Refinery job lease was lost before completion.');
}

export async function failThinkForgeRefineryJob(
  job: ThinkForgeRefineryJobSnapshot,
  code: string,
  message: string,
): Promise<void> {
  const collection = await jobCollection();
  const update = await collection.updateOne(
    claimedLeaseFilter(job),
    terminalUpdate({ status: 'failed', error: refineryError(code, message, false) }),
  );
  if (update.matchedCount !== 1) throw new Error('Refinery job lease was lost before failure was recorded.');
}

export function decideThinkForgeRefineryFailureTransition(
  job: Pick<ThinkForgeRefineryJobSnapshot, 'attemptCount' | 'maxAttempts'>,
): 'queued' | 'dead_letter' {
  return job.attemptCount < job.maxAttempts ? 'queued' : 'dead_letter';
}

export async function retryOrDeadLetterThinkForgeRefineryJob(
  job: ThinkForgeRefineryJobSnapshot,
  error: unknown,
): Promise<'queued' | 'dead_letter'> {
  const collection = await jobCollection();
  const message = errorMessage(error);
  if (decideThinkForgeRefineryFailureTransition(job) === 'queued') {
    const update = await collection.updateOne(
      claimedLeaseFilter(job),
      {
        $set: {
          status: 'queued',
          leaseToken: null,
          leaseExpiresAt: null,
          error: refineryError('transient_failure', message, true),
          updatedAt: nowIso(),
        },
      },
    );
    if (update.matchedCount !== 1) throw new Error('Refinery job lease was lost before retry was recorded.');
    return 'queued';
  }
  const update = await collection.updateOne(
    claimedLeaseFilter(job),
    terminalUpdate({
      status: 'dead_letter',
      deadLetteredAt: nowIso(),
      error: refineryError('processing_failed', message, false),
    }),
  );
  if (update.matchedCount !== 1) throw new Error('Refinery job lease was lost before dead letter was recorded.');
  return 'dead_letter';
}

export async function refundThinkForgeRefineryJob(jobId: string, reason: string): Promise<'refunded' | 'already_refunded' | 'refund_pending'> {
  const collection = await jobCollection();
  const job = await collection.findOne({ _id: jobId });
  if (!job || job.charge.status === 'refunded') {
    return job ? 'already_refunded' : 'refunded';
  }
  if (job.charge.amount === 0 || job.charge.transactionId === 'no_charge') {
    await collection.updateOne(
      { _id: jobId, 'charge.status': { $ne: 'refunded' } },
      { $set: { 'charge.status': 'refunded', updatedAt: nowIso() } },
    );
    return 'refunded';
  }
  const claimed = job.charge.status === 'refund_pending'
    ? job
    : await collection.findOneAndUpdate(
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
    operationKey: job.idempotencyKey,
    urls: job.urls,
  });
  if (result.processed === 0) {
    throw new Error('None of the supplied research sources could be analyzed.');
  }
  await completeThinkForgeRefineryJob(job, result);
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
  deadLettered: number;
  refundCandidates: number;
  refundsResolved: number;
  refundsPending: number;
}> {
  const workerConfigured = isThinkForgeRefineryWorkerConfigured();
  const collection = await jobCollection();
  const staleBefore = new Date(Date.now() - RECOVERY_STALE_MS).toISOString();
  const candidates = await collection.find({
    $or: [
      { status: 'queued', updatedAt: { $lte: staleBefore } },
      { status: 'running', leaseExpiresAt: { $lte: staleBefore } },
    ],
  }).sort({ updatedAt: 1 }).limit(Math.max(1, Math.min(limit, 100))).toArray();

  const exhausted = candidates.filter((candidate) => candidate.attemptCount >= candidate.maxAttempts);
  const deadLetterResults = await Promise.all(
    exhausted.map((candidate) => deadLetterExhaustedRefineryJob(collection, candidate, nowIso())),
  );
  const dispatchable = candidates.filter((candidate) => candidate.attemptCount < candidate.maxAttempts);
  const results = workerConfigured
    ? await Promise.allSettled(
        dispatchable.map((candidate) => dispatchThinkForgeRefineryJob(toSnapshot(candidate))),
      )
    : [];
  const refundable = await collection.find({
    status: { $in: ['failed', 'dead_letter'] },
    'charge.status': { $in: ['charged', 'refund_pending'] },
    'charge.transactionId': { $ne: 'no_charge' },
  }).sort({ updatedAt: 1 }).limit(Math.max(1, Math.min(limit, 100))).toArray();
  const refundResults = await Promise.allSettled(refundable.map((candidate) => (
    refundThinkForgeRefineryJob(candidate.id, 'ThinkForge research processing did not complete.')
  )));
  const refundStatuses = refundResults.map((result) => (
    result.status === 'fulfilled' ? result.value : 'refund_pending'
  ));
  if (!workerConfigured) {
    throw new Error('ThinkForge refinery worker is not configured.');
  }
  return {
    candidates: candidates.length,
    dispatched: results.filter((result) => result.status === 'fulfilled').length,
    failed: results.filter((result) => result.status === 'rejected').length,
    deadLettered: deadLetterResults.filter(Boolean).length,
    refundCandidates: refundable.length,
    refundsResolved: refundStatuses.filter((status) => status === 'refunded' || status === 'already_refunded').length,
    refundsPending: refundStatuses.filter((status) => status === 'refund_pending').length,
  };
}
