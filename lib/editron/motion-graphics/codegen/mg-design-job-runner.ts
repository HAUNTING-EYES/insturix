import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { Client } from '@upstash/qstash';
import { nanoid } from 'nanoid';
import type { Collection } from 'mongodb';

import { COLLECTIONS, getDatabase } from '@/lib/editron/db/mongodb';
import type { EditDecisionList } from '@/lib/editron/services/reactive-edit-engine';

type EnvLike = Record<string, string | undefined>;
export type MgDesignJobStatus = 'queued' | 'running' | 'completed' | 'failed';

const JOB_VERSION = 'mg-design-job-v1' as const;
const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_LEASE_MS = 12 * 60 * 1_000;
const DEFAULT_RETRY_WINDOW_MS = 2 * 60 * 60 * 1_000;
const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
const SAVE_BARRIER_TIMEOUT_MS = 2 * 60 * 1_000;
const SAVE_BARRIER_POLL_MS = 2_000;

export interface CreateMgDesignJobInput {
  projectId: string;
  userId: string;
  edl: EditDecisionList;
  canvas: { width: number; height: number };
  graphicsDensity?: 'heavy' | 'moderate' | 'minimal';
}

export interface MgDesignJob {
  _id: string;
  version: typeof JOB_VERSION;
  projectId: string;
  userId: string;
  edl: EditDecisionList;
  canvas: { width: number; height: number };
  graphicsDensity?: 'heavy' | 'moderate' | 'minimal';
  status: MgDesignJobStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  retryDeadlineAt: Date;
  leaseId: string | null;
  leaseExpiresAt: Date | null;
  lastError: string | null;
  result: MgDesignExecutionResult | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  expiresAt: Date;
}

export interface MgDesignExecutionResult {
  jobId: string;
  decisionsExecuted: number;
  decisionsSkipped: number;
  renderJobsQueued: number;
  approvedCount: number;
  declinedCount: number;
  unavailableCount: number;
  completedAt: string;
}

interface MgDesignJobState {
  status: MgDesignJobStatus | 'missing';
  projectId: string | null;
  userId: string | null;
  leaseExpiresAt: Date | null;
  nextAttemptAt: Date | null;
}

interface MgDesignJobDependencies {
  createOrGetJob?: (input: CreateMgDesignJobInput, now: Date) => Promise<MgDesignJob>;
  dispatchJob?: typeof dispatchMgDesignJob;
  getState?: (jobId: string) => Promise<MgDesignJobState>;
  waitForProjectReady?: (projectId: string, userId: string) => Promise<boolean>;
  claimJob?: (jobId: string, leaseId: string, now: Date) => Promise<MgDesignJob | null>;
  executeJob?: (job: MgDesignJob) => Promise<MgDesignExecutionResult>;
  completeJob?: (job: MgDesignJob, leaseId: string, result: MgDesignExecutionResult) => Promise<boolean>;
  failJob?: (job: MgDesignJob, leaseId: string, error: unknown, now: Date) => Promise<'queued' | 'failed' | 'stale-lease'>;
  /** Re-drive any chat editorial-intent parent waiting on this design child (adopts follow-on render jobs). */
  reconcileParent?: (input: { jobId: string; projectId: string; userId: string }) => Promise<void>;
}

let indexesPromise: Promise<unknown> | null = null;

function jobsCollection(): Promise<Collection<MgDesignJob>> {
  return getDatabase().then((db) => db.collection<MgDesignJob>(COLLECTIONS.MG_DESIGN_JOBS));
}

async function ensureIndexes(): Promise<void> {
  indexesPromise ??= jobsCollection().then((jobs) => jobs.createIndexes([
    { key: { status: 1, nextAttemptAt: 1 }, name: 'mg_design_status_retry' },
    { key: { expiresAt: 1 }, name: 'mg_design_ttl', expireAfterSeconds: 0 },
  ])).catch((error) => {
    indexesPromise = null;
    throw error;
  });
  await indexesPromise;
}

function requireEnv(env: EnvLike, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`MG design job runner: missing ${name}`);
  return value;
}

function workerUrl(env: EnvLike): string {
  const explicit = env.MG_RENDER_CALLBACK_ORIGIN?.trim();
  const vercelHost = env.VERCEL_URL?.trim();
  const publicOrigin = env.NEXT_PUBLIC_APP_URL?.trim();
  const rawOrigin = explicit || (vercelHost ? `https://${vercelHost}` : publicOrigin);
  if (!rawOrigin) throw new Error('MG design job runner: missing worker origin');
  const origin = new URL(rawOrigin);
  const local = origin.hostname === 'localhost' || origin.hostname === '127.0.0.1';
  if (origin.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && local)) {
    throw new Error('MG design job runner: worker origin must use HTTPS');
  }
  return new URL('/api/internal/workers/mg-design', origin).toString();
}

function canonicalJobPayload(input: CreateMgDesignJobInput): string {
  return JSON.stringify({
    projectId: input.projectId,
    userId: input.userId,
    generatedAt: input.edl.generatedAt instanceof Date
      ? input.edl.generatedAt.toISOString()
      : String(input.edl.generatedAt),
    decisions: input.edl.decisions,
    canvas: input.canvas,
    graphicsDensity: input.graphicsDensity ?? null,
  });
}

export function buildMgDesignJobId(input: CreateMgDesignJobInput): string {
  return `mgd_${createHash('sha256').update(canonicalJobPayload(input)).digest('hex').slice(0, 32)}`;
}

async function createOrGetMgDesignJob(input: CreateMgDesignJobInput, now: Date): Promise<MgDesignJob> {
  await ensureIndexes();
  const job: MgDesignJob = {
    _id: buildMgDesignJobId(input),
    version: JOB_VERSION,
    projectId: input.projectId,
    userId: input.userId,
    edl: input.edl,
    canvas: input.canvas,
    ...(input.graphicsDensity ? { graphicsDensity: input.graphicsDensity } : {}),
    status: 'queued',
    attemptCount: 0,
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
    nextAttemptAt: now,
    retryDeadlineAt: new Date(now.getTime() + DEFAULT_RETRY_WINDOW_MS),
    leaseId: null,
    leaseExpiresAt: null,
    lastError: null,
    result: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    expiresAt: new Date(now.getTime() + DEFAULT_RETENTION_MS),
  };
  const stored = await (await jobsCollection()).findOneAndUpdate(
    { _id: job._id },
    { $setOnInsert: job },
    { upsert: true, returnDocument: 'after' },
  );
  if (!stored) throw new Error('MG design job upsert returned no document');
  return stored;
}

export async function dispatchMgDesignJob(
  job: Pick<MgDesignJob, '_id' | 'attemptCount' | 'nextAttemptAt'>,
  env: EnvLike = process.env,
): Promise<{ messageId: string | null }> {
  const qstash = new Client({
    token: requireEnv(env, 'QSTASH_TOKEN'),
    baseUrl: env.QSTASH_URL?.trim() || undefined,
  });
  const delaySeconds = Math.max(0, Math.ceil((job.nextAttemptAt.getTime() - Date.now()) / 1_000));
  const deduplicationId = createHash('sha256')
    .update(`${job._id}:${job.attemptCount}`)
    .digest('hex');
  const published = await qstash.publishJSON({
    url: workerUrl(env),
    body: { jobId: job._id },
    retries: 4,
    deduplicationId,
    ...(delaySeconds > 0 ? { delay: delaySeconds } : {}),
  });
  return { messageId: published.messageId ?? null };
}

export async function enqueueDurableMgDesignJob(
  input: CreateMgDesignJobInput,
  options: { env?: EnvLike; now?: Date; dependencies?: MgDesignJobDependencies } = {},
): Promise<{ jobId: string; status: 'queued' | 'running' | 'completed'; messageId: string | null }> {
  const now = options.now ?? new Date();
  const dependencies = options.dependencies ?? {};
  const stored = await (dependencies.createOrGetJob ?? createOrGetMgDesignJob)(input, now);
  if (stored.status === 'completed') {
    return { jobId: stored._id, status: 'completed', messageId: null };
  }
  if (stored.status === 'failed') {
    throw new Error(`MG design job ${stored._id} is terminal: ${stored.lastError ?? 'unknown failure'}`);
  }
  if (stored.status === 'running' && stored.leaseExpiresAt && stored.leaseExpiresAt > now) {
    return { jobId: stored._id, status: 'running', messageId: null };
  }
  const dispatched = await (dependencies.dispatchJob ?? dispatchMgDesignJob)(stored, options.env ?? process.env);
  await (await getDatabase()).collection(COLLECTIONS.PROJECTS).updateOne(
    { projectId: input.projectId, userId: input.userId },
    { $set: {
      'intelligence.mgDesignJob': {
        version: JOB_VERSION,
        jobId: stored._id,
        status: 'queued',
        decisionCount: input.edl.decisions.length,
        queuedAt: now,
      },
    } },
  );
  return { jobId: stored._id, status: 'queued', messageId: dispatched.messageId };
}

async function getMgDesignJobState(jobId: string): Promise<MgDesignJobState> {
  const job = await (await jobsCollection()).findOne(
    { _id: jobId },
    { projection: { status: 1, projectId: 1, userId: 1, leaseExpiresAt: 1, nextAttemptAt: 1 } },
  );
  return job ? {
    status: job.status,
    projectId: job.projectId,
    userId: job.userId,
    leaseExpiresAt: job.leaseExpiresAt,
    nextAttemptAt: job.nextAttemptAt,
  } : {
    status: 'missing',
    projectId: null,
    userId: null,
    leaseExpiresAt: null,
    nextAttemptAt: null,
  };
}

async function waitForDirectorSaveBarrier(projectId: string, userId: string): Promise<boolean> {
  const projects = (await getDatabase()).collection(COLLECTIONS.PROJECTS);
  const deadline = Date.now() + SAVE_BARRIER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const project = await projects.findOne(
      { projectId, userId },
      { projection: { autoEditStatus: 1 } },
    ) as { autoEditStatus?: string } | null;
    if (!project) throw new Error('MG design execution: project missing or ownership mismatch');
    if (project.autoEditStatus !== 'directing') return true;
    await delay(SAVE_BARRIER_POLL_MS);
  }
  return false;
}

async function claimMgDesignJob(jobId: string, leaseId: string, now: Date): Promise<MgDesignJob | null> {
  return (await jobsCollection()).findOneAndUpdate(
    {
      _id: jobId,
      $expr: { $lt: ['$attemptCount', '$maxAttempts'] },
      $or: [
        { status: 'queued', nextAttemptAt: { $lte: now } },
        { status: 'running', leaseExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: {
        status: 'running',
        leaseId,
        leaseExpiresAt: new Date(now.getTime() + DEFAULT_LEASE_MS),
        startedAt: now,
        updatedAt: now,
        lastError: null,
      },
      $inc: { attemptCount: 1 },
    },
    { returnDocument: 'after' },
  );
}

function retryableFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b429\b|rate.?limit|resource_exhausted|timeout|timed out|fetch failed|econnreset|socket|temporar|provider unavailable|service unavailable/i.test(message)
    && !/project missing|ownership mismatch|invalid|configured brand could not be mapped/i.test(message);
}

function retryDelayMs(job: MgDesignJob): number {
  const exponent = Math.max(0, Math.min(job.attemptCount - 1, 6));
  return Math.min(8 * 60 * 1_000, 15_000 * (2 ** exponent));
}

async function failMgDesignJob(
  job: MgDesignJob,
  leaseId: string,
  error: unknown,
  now: Date,
): Promise<'queued' | 'failed' | 'stale-lease'> {
  const retryable = retryableFailure(error)
    && job.attemptCount < job.maxAttempts
    && now < job.retryDeadlineAt;
  const disposition = retryable ? 'queued' : 'failed';
  const update = await (await jobsCollection()).updateOne(
    { _id: job._id, status: 'running', leaseId },
    {
      $set: {
        status: disposition,
        nextAttemptAt: retryable ? new Date(now.getTime() + retryDelayMs(job)) : now,
        leaseId: null,
        leaseExpiresAt: null,
        lastError: error instanceof Error ? error.message : String(error),
        updatedAt: now,
        ...(retryable ? {} : { completedAt: now }),
      },
    },
  );
  if (update.matchedCount === 0) return 'stale-lease';
  await (await getDatabase()).collection(COLLECTIONS.PROJECTS).updateOne(
    { projectId: job.projectId, userId: job.userId },
    { $set: {
      'intelligence.mgDesignJob.status': disposition,
      'intelligence.mgDesignJob.lastError': error instanceof Error ? error.message : String(error),
      'intelligence.mgDesignJob.updatedAt': now,
    } },
  );
  return disposition;
}

function shouldRetryUnavailableDesign(summary: {
  approvedCount: number;
  unavailableCount: number;
  reason?: string;
} | undefined): boolean {
  return Boolean(
    summary
    && summary.approvedCount === 0
    && summary.unavailableCount > 0
    && summary.reason
    && retryableFailure(summary.reason),
  );
}

async function executeMgDesignJob(job: MgDesignJob): Promise<MgDesignExecutionResult> {
  const db = await getDatabase();
  const project = await db.collection(COLLECTIONS.PROJECTS).findOne(
    { projectId: job.projectId, userId: job.userId },
    { projection: { overlays: 1 } },
  ) as { overlays?: unknown[] } | null;
  if (!project) throw new Error('MG design execution: project missing or ownership mismatch');
  const overlays = Array.isArray(project.overlays) ? project.overlays : [];
  const assetIds = [...new Set(overlays.flatMap((overlay) => {
    if (!overlay || typeof overlay !== 'object') return [];
    const assetId = (overlay as Record<string, unknown>).assetId;
    return typeof assetId === 'string' && assetId ? [assetId] : [];
  }))];
  const analysisDocs = assetIds.length > 0
    ? await db.collection(COLLECTIONS.PROJECT_ASSET_ANALYSES).find({
      projectId: job.projectId,
      assetId: { $in: assetIds },
    }).toArray()
    : [];
  const analyses = new Map(analysisDocs.flatMap((doc) => (
    typeof doc.assetId === 'string' ? [[doc.assetId, doc] as const] : []
  )));
  const { executeEDL } = await import('@/lib/editron/services/edl-executor');
  const execution = await executeEDL(
    job.edl,
    job.projectId,
    job.userId,
    overlays as never[],
    job.canvas,
    analyses,
    job.graphicsDensity,
    { deferMgDesign: false },
  );
  if (shouldRetryUnavailableDesign(execution.mgDesignSummary)) {
    throw new Error(execution.mgDesignSummary?.reason ?? 'MG designer provider unavailable');
  }
  const outcomes = job.edl.decisions
    .map((decision) => decision.params?.mgCodegenOutcome)
    .filter((value) => value && typeof value === 'object');
  return {
    jobId: job._id,
    decisionsExecuted: execution.decisionsExecuted,
    decisionsSkipped: execution.decisionsSkipped,
    renderJobsQueued: outcomes.filter((value) => (value as { status?: string }).status === 'queued').length,
    approvedCount: execution.mgDesignSummary?.approvedCount ?? 0,
    declinedCount: execution.mgDesignSummary?.declinedCount ?? 0,
    unavailableCount: execution.mgDesignSummary?.unavailableCount ?? 0,
    completedAt: new Date().toISOString(),
  };
}

async function completeMgDesignJob(
  job: MgDesignJob,
  leaseId: string,
  result: MgDesignExecutionResult,
): Promise<boolean> {
  const completedAt = new Date(result.completedAt);
  const update = await (await jobsCollection()).updateOne(
    { _id: job._id, status: 'running', leaseId },
    { $set: {
      status: 'completed',
      result,
      leaseId: null,
      leaseExpiresAt: null,
      updatedAt: completedAt,
      completedAt,
    } },
  );
  if (update.matchedCount === 0) return false;
  await (await getDatabase()).collection(COLLECTIONS.PROJECTS).updateOne(
    { projectId: job.projectId, userId: job.userId },
    { $set: {
      'intelligence.mgDesignJob.status': 'completed',
      'intelligence.mgDesignJob.result': result,
      'intelligence.mgDesignJob.completedAt': completedAt,
    } },
  );
  return true;
}

async function reconcileChatEditorialIntentParentForDesign(input: {
  jobId: string;
  projectId: string;
  userId: string;
}): Promise<void> {
  const { reconcileChatEditorialIntentMgChild } = await import(
    '@/lib/editron/services/chat-editorial-intent-job'
  );
  await reconcileChatEditorialIntentMgChild(input);
}

export class MgDesignJobExecutionError extends Error {
  constructor(
    jobId: string,
    readonly disposition: 'queued' | 'failed' | 'stale-lease',
    error: unknown,
  ) {
    super(`MG design job ${jobId} failed (${disposition}): ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    this.name = 'MgDesignJobExecutionError';
  }
}

export async function executeQueuedMgDesignJob(
  jobId: string,
  options: { now?: Date; dependencies?: MgDesignJobDependencies } = {},
): Promise<
  | { status: 'completed'; result: MgDesignExecutionResult }
  | { status: 'not-claimed'; jobStatus: MgDesignJobStatus | 'missing'; leaseExpiresAt: Date | null; nextAttemptAt: Date | null }
> {
  const dependencies = options.dependencies ?? {};
  const state = await (dependencies.getState ?? getMgDesignJobState)(jobId);
  if (state.status === 'missing' || !state.projectId || !state.userId || state.status === 'completed' || state.status === 'failed') {
    return {
      status: 'not-claimed',
      jobStatus: state.status,
      leaseExpiresAt: state.leaseExpiresAt,
      nextAttemptAt: state.nextAttemptAt,
    };
  }
  if (state.status === 'queued') {
    const ready = await (dependencies.waitForProjectReady ?? waitForDirectorSaveBarrier)(state.projectId, state.userId);
    if (!ready) {
      return {
        status: 'not-claimed',
        jobStatus: state.status,
        leaseExpiresAt: state.leaseExpiresAt,
        nextAttemptAt: state.nextAttemptAt,
      };
    }
  }
  const now = options.now ?? new Date();
  const leaseId = `mgdl_${nanoid(20)}`;
  const claimed = await (dependencies.claimJob ?? claimMgDesignJob)(jobId, leaseId, now);
  if (!claimed) {
    const latest = await (dependencies.getState ?? getMgDesignJobState)(jobId);
    return {
      status: 'not-claimed',
      jobStatus: latest.status,
      leaseExpiresAt: latest.leaseExpiresAt,
      nextAttemptAt: latest.nextAttemptAt,
    };
  }
  const reconcileParent = dependencies.reconcileParent ?? reconcileChatEditorialIntentParentForDesign;
  try {
    const result = await (dependencies.executeJob ?? executeMgDesignJob)(claimed);
    const completed = await (dependencies.completeJob ?? completeMgDesignJob)(claimed, leaseId, result);
    if (!completed) throw new Error(`MG design job ${jobId} lost its lease before completion`);
    // Best-effort: a waiting chat editorial-intent parent adopts this design child's follow-on render jobs.
    await reconcileParent({ jobId: claimed._id, projectId: claimed.projectId, userId: claimed.userId })
      .catch((reconcileError) => console.warn(
        `[MGDesignJob] parent reconciliation failed for ${claimed._id}: ${reconcileError instanceof Error ? reconcileError.message : String(reconcileError)}`,
      ));
    return { status: 'completed', result };
  } catch (error) {
    const disposition = await (dependencies.failJob ?? failMgDesignJob)(claimed, leaseId, error, now);
    if (disposition === 'failed') {
      await reconcileParent({ jobId: claimed._id, projectId: claimed.projectId, userId: claimed.userId })
        .catch(() => undefined);
    }
    throw new MgDesignJobExecutionError(jobId, disposition, error);
  }
}
