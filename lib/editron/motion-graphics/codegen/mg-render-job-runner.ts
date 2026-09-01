import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { Client } from '@upstash/qstash';
import { nanoid } from 'nanoid';
import { z } from 'zod';

import { COLLECTIONS, getDatabase } from '@/lib/editron/db/mongodb';
import {
  claimMgRenderJob,
  completeMgRenderJob,
  createOrGetMgRenderJob,
  failMgRenderJob,
  getMgRenderJobForOwner,
  type CreateMgRenderJobInput,
  type MgRenderJob,
  type MgRenderJobStatus,
} from './mg-render-job-service';
import { executeMgRenderInSandbox } from './sandbox-render-worker';
import { buildMgSequenceOverlay, upsertMgSequenceAsset } from './sequence-artifacts';
import type { MgRenderWorkerResult } from './worker-contract';

type EnvLike = Record<string, string | undefined>;
type MgRenderProjectMutationPort = Pick<
  typeof import('@/lib/editron/services/project-service').projectService,
  'loadProjectForMutation' | 'commitMgRenderDelivery'
>;

async function resolveProjectMutationPort(): Promise<MgRenderProjectMutationPort> {
  const { projectService } = await import('@/lib/editron/services/project-service');
  return projectService;
}

const storageAuthorizationClaimsSchema = z.object({
  version: z.literal(1),
  jobId: z.string().regex(/^mgr_[a-f0-9]{32}$/),
  leaseId: z.string().min(1).max(128),
  projectId: z.string().min(1).max(240),
  userId: z.string().min(1).max(240),
  orgId: z.string().min(1).max(240).nullable(),
  expiresAtMs: z.number().int().positive(),
}).strict();

export type MgStorageAuthorizationClaims = z.infer<typeof storageAuthorizationClaimsSchema>;

const DEFAULT_SANDBOX_TIMEOUT_MS = 20 * 60 * 1_000;
const MIN_SANDBOX_TIMEOUT_MS = 5 * 60 * 1_000;
const MAX_SANDBOX_TIMEOUT_MS = 45 * 60 * 1_000;
const LEASE_GRACE_MS = 5 * 60 * 1_000;
const MIN_AUTH_TTL_MS = 5 * 60 * 1_000;
const MAX_AUTH_TTL_MS = 60 * 60 * 1_000;
const DEFAULT_DIRECTOR_SAVE_BARRIER_TIMEOUT_MS = 90 * 1_000;
const MAX_DIRECTOR_SAVE_BARRIER_TIMEOUT_MS = 3 * 60 * 1_000;
const DIRECTOR_SAVE_BARRIER_POLL_MS = 2 * 1_000;
const DEFAULT_TRANSIENT_RETRY_BASE_MS = 15 * 1_000;
const DEFAULT_RATE_LIMIT_RETRY_BASE_MS = 60 * 1_000;
const DEFAULT_RETRY_MAX_MS = 8 * 60 * 1_000;
const RETRY_JITTER_RATIO = 0.2;

function required(env: EnvLike, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`MG render job runner: missing ${name}`);
  return value;
}

function authSecret(env: EnvLike): string {
  const secret = required(env, 'MG_RENDER_STORAGE_AUTH_SECRET');
  if (secret.length < 32) throw new Error('MG render job runner: MG_RENDER_STORAGE_AUTH_SECRET must be at least 32 characters');
  return secret;
}

function sandboxTimeoutMs(env: EnvLike): number {
  const parsed = Number(env.MG_RENDER_SANDBOX_TIMEOUT_MS);
  return Number.isInteger(parsed) && parsed >= MIN_SANDBOX_TIMEOUT_MS && parsed <= MAX_SANDBOX_TIMEOUT_MS
    ? parsed
    : DEFAULT_SANDBOX_TIMEOUT_MS;
}

function authTtlMs(env: EnvLike, minimumTtlMs: number): number {
  const parsed = Number(env.MG_RENDER_STORAGE_AUTH_TTL_MS);
  const requested = Number.isInteger(parsed) && parsed >= MIN_AUTH_TTL_MS && parsed <= MAX_AUTH_TTL_MS
    ? parsed
    : minimumTtlMs;
  return Math.min(MAX_AUTH_TTL_MS, Math.max(minimumTtlMs, requested));
}

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createMgStorageAuthorizationToken(
  claims: MgStorageAuthorizationClaims,
  env: EnvLike = process.env,
): string {
  const parsed = storageAuthorizationClaimsSchema.parse(claims);
  const payload = Buffer.from(JSON.stringify(parsed), 'utf8').toString('base64url');
  return `${payload}.${signature(payload, authSecret(env))}`;
}

export function verifyMgStorageAuthorizationToken(
  token: string,
  env: EnvLike = process.env,
  nowMs = Date.now(),
): MgStorageAuthorizationClaims {
  const [payload, suppliedSignature, extra] = token.split('.');
  if (!payload || !suppliedSignature || extra) throw new Error('invalid MG storage authorization token');
  const expectedSignature = signature(payload, authSecret(env));
  const actualBuffer = Buffer.from(suppliedSignature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new Error('invalid MG storage authorization signature');
  }
  const claims = storageAuthorizationClaimsSchema.parse(
    JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
  );
  if (claims.expiresAtMs <= nowMs) throw new Error('expired MG storage authorization token');
  return claims;
}

export function resolveMgRenderAppCommit(env: EnvLike = process.env): string {
  const commit = env.MG_RENDER_SANDBOX_APP_COMMIT?.trim() || env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (!commit) throw new Error('MG render job runner: missing VERCEL_GIT_COMMIT_SHA or MG_RENDER_SANDBOX_APP_COMMIT');
  return commit;
}

export function resolveMgStorageAuthorizationUrl(env: EnvLike = process.env): string {
  const explicit = env.MG_RENDER_CALLBACK_ORIGIN?.trim();
  const vercelHost = env.VERCEL_URL?.trim();
  const publicOrigin = env.NEXT_PUBLIC_APP_URL?.trim();
  const rawOrigin = explicit || (vercelHost ? `https://${vercelHost}` : publicOrigin);
  if (!rawOrigin) throw new Error('MG render job runner: missing MG_RENDER_CALLBACK_ORIGIN, VERCEL_URL, or NEXT_PUBLIC_APP_URL');
  const origin = new URL(rawOrigin);
  const localDev = origin.hostname === 'localhost' || origin.hostname === '127.0.0.1';
  if (origin.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && localDev)) {
    throw new Error('MG render job runner: callback origin must use HTTPS');
  }
  return new URL('/api/internal/workers/mg-render/storage-authorize', origin).toString();
}

class RetryableMgRenderResultError extends Error {
  readonly result: MgRenderWorkerResult;

  constructor(result: MgRenderWorkerResult) {
    const failure = result.receipt.failure;
    super(`MG render worker returned retryable provider failure (${failure?.provider ?? 'unknown'}/${failure?.code ?? 'unknown'})`);
    this.name = 'RetryableMgRenderResultError';
    this.result = result;
  }
}

function isRetryableMgRenderResult(result: MgRenderWorkerResult): boolean {
  return result.status === 'fallback' && result.receipt.failure?.disposition === 'retryable';
}

function retryableSandboxFailure(error: unknown): boolean {
  if (error instanceof RetryableMgRenderResultError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return !/missing MG_RENDER_|missing (?:its )?executable request|commit mismatch|does not match snapshot commit|storage_full|authorization denied|invalid MG storage|project missing|ownership mismatch/i.test(message);
}

export interface MgRenderJobRunnerDependencies {
  createOrGetJob?: typeof createOrGetMgRenderJob;
  claimJob?: typeof claimMgRenderJob;
  completeJob?: typeof completeMgRenderJob;
  failJob?: typeof failMgRenderJob;
  getJob?: typeof getMgRenderJobForOwner;
  executeSandbox?: typeof executeMgRenderInSandbox;
  dispatchJob?: typeof dispatchMgRenderJob;
  deliverResult?: typeof deliverMgRenderJobResult;
  loadProjectForMutation?: MgRenderProjectMutationPort['loadProjectForMutation'];
  commitMgRenderDelivery?: MgRenderProjectMutationPort['commitMgRenderDelivery'];
  upsertSequenceAsset?: typeof upsertMgSequenceAsset;
  buildSequenceOverlay?: typeof buildMgSequenceOverlay;
  getJobState?: typeof getMgRenderJobState;
  waitForProjectReady?: typeof waitForDirectorSaveBarrier;
  reconcileParent?: typeof reconcileChatEditorialIntentParent;
}

export function resolveMgRenderRetryDelayMs(
  job: Pick<MgRenderJob, '_id' | 'attemptCount'>,
  error: unknown,
  env: EnvLike = process.env,
): number {
  const failureCode = error instanceof RetryableMgRenderResultError
    ? error.result.receipt.failure?.code
    : undefined;
  const message = error instanceof Error ? error.message : String(error);
  const rateLimited = failureCode === 'rate-limited' || /(?:\b429\b|rate.?limit|resource_exhausted)/i.test(message);
  const configuredBase = Number(env[
    rateLimited ? 'MG_RENDER_RATE_LIMIT_RETRY_BASE_MS' : 'MG_RENDER_TRANSIENT_RETRY_BASE_MS'
  ]);
  const defaultBase = rateLimited ? DEFAULT_RATE_LIMIT_RETRY_BASE_MS : DEFAULT_TRANSIENT_RETRY_BASE_MS;
  const baseMs = Number.isInteger(configuredBase) && configuredBase >= 1_000
    ? configuredBase
    : defaultBase;
  const configuredMax = Number(env.MG_RENDER_RETRY_MAX_MS);
  const maxMs = Number.isInteger(configuredMax) && configuredMax >= baseMs
    ? configuredMax
    : DEFAULT_RETRY_MAX_MS;
  const exponent = Math.max(0, Math.min(job.attemptCount - 1, 10));
  const exponentialMs = Math.min(maxMs, baseMs * (2 ** exponent));
  const jitterSeed = createHash('sha256')
    .update(`${job._id}:${job.attemptCount}`)
    .digest()
    .readUInt32BE(0) / 0xffffffff;
  return Math.round(Math.min(maxMs, exponentialMs * (1 + jitterSeed * RETRY_JITTER_RATIO)));
}

export class MgRenderJobExecutionError extends Error {
  readonly disposition: 'queued' | 'failed' | 'stale-lease';

  constructor(jobId: string, disposition: 'queued' | 'failed' | 'stale-lease', error: unknown) {
    super(
      `MG render job ${jobId} failed (${disposition}): ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
    this.name = 'MgRenderJobExecutionError';
    this.disposition = disposition;
  }
}

function renderWorkerUrl(env: EnvLike): string {
  return new URL('/api/internal/workers/mg-render', resolveMgStorageAuthorizationUrl(env)).toString();
}

export async function dispatchMgRenderJob(
  job: Pick<MgRenderJob, '_id' | 'attemptCount' | 'nextAttemptAt'>,
  env: EnvLike = process.env,
  // The sweeper (cron/sweep-mg-render-jobs) passes a per-lease-window salt so re-dispatching a stalled job at
  // the SAME attemptCount reaches QStash instead of being deduped against the original (lost) dispatch. Absent
  // → the director's original behavior: one message per (job, attempt), idempotent against director retries.
  dedupSalt?: string,
): Promise<{ messageId: string | null }> {
  const token = required(env, 'QSTASH_TOKEN');
  const now = Date.now();
  const delaySeconds = Math.max(0, Math.ceil((job.nextAttemptAt.getTime() - now) / 1_000));
  const qstash = new Client({ token, baseUrl: env.QSTASH_URL?.trim() || undefined });
  // QStash rejects punctuation such as `:` in deduplication IDs. Hash the structured identity instead of
  // sanitizing it so arbitrary sweeper salts remain safe and distinct while retries stay deterministic.
  const deduplicationId = createHash('sha256')
    .update(JSON.stringify([job._id, job.attemptCount, dedupSalt ?? null]))
    .digest('hex');
  const published = await qstash.publishJSON({
    url: renderWorkerUrl(env),
    body: { jobId: job._id },
    retries: 4,
    deduplicationId,
    ...(delaySeconds > 0 ? { delay: delaySeconds } : {}),
  });
  return { messageId: published.messageId ?? null };
}

export interface EnqueuedMgRenderJob {
  jobId: string;
  status: 'queued' | 'running' | 'completed';
  messageId: string | null;
  result?: MgRenderWorkerResult;
}

/** Persist the job and dispatch only its id. Director never executes Chromium/Sandbox work. */
export async function enqueueDurableMgRenderJob(
  input: CreateMgRenderJobInput,
  options: {
    env?: EnvLike;
    now?: Date;
    dependencies?: Pick<MgRenderJobRunnerDependencies, 'createOrGetJob' | 'dispatchJob'>;
  } = {},
): Promise<EnqueuedMgRenderJob> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const createOrGetJob = options.dependencies?.createOrGetJob ?? createOrGetMgRenderJob;
  const dispatchJob = options.dependencies?.dispatchJob ?? dispatchMgRenderJob;
  const stored = await createOrGetJob(input, { now });

  if (stored.status === 'completed' && stored.result) {
    return { jobId: stored._id, status: 'completed', messageId: null, result: stored.result };
  }
  if (stored.status === 'failed') {
    throw new Error(`MG render job ${stored._id} is terminal: ${stored.lastError ?? 'unknown failure'}`);
  }
  if (stored.status === 'running' && stored.leaseExpiresAt && stored.leaseExpiresAt > now) {
    return { jobId: stored._id, status: 'running', messageId: null };
  }

  const dispatch = await dispatchJob(stored, env);
  return { jobId: stored._id, status: 'queued', messageId: dispatch.messageId };
}

async function getMgRenderJobState(jobId: string): Promise<{
  status: MgRenderJobStatus | 'missing';
  leaseExpiresAt: Date | null;
  nextAttemptAt: Date | null;
  projectId: string | null;
  userId: string | null;
}> {
  const job = await (await getDatabase()).collection<MgRenderJob>(COLLECTIONS.MG_RENDER_JOBS).findOne(
    { _id: jobId },
    { projection: { status: 1, leaseExpiresAt: 1, nextAttemptAt: 1, projectId: 1, userId: 1 } },
  );
  return job
    ? {
      status: job.status,
      leaseExpiresAt: job.leaseExpiresAt,
      nextAttemptAt: job.nextAttemptAt,
      projectId: job.projectId,
      userId: job.userId,
    }
    : { status: 'missing', leaseExpiresAt: null, nextAttemptAt: null, projectId: null, userId: null };
}

async function reconcileChatEditorialIntentParent(input: {
  jobId: string;
  projectId: string;
  userId: string;
}): Promise<void> {
  const { reconcileChatEditorialIntentMgChild } = await import(
    '@/lib/editron/services/chat-editorial-intent-job'
  );
  await reconcileChatEditorialIntentMgChild(input);
}

function directorSaveBarrierTimeoutMs(env: EnvLike): number {
  const parsed = Number(env.MG_RENDER_DIRECTOR_SAVE_BARRIER_TIMEOUT_MS);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, MAX_DIRECTOR_SAVE_BARRIER_TIMEOUT_MS)
    : DEFAULT_DIRECTOR_SAVE_BARRIER_TIMEOUT_MS;
}

/**
 * Director still performs one final whole-overlay save after executeEDL. Starting or delivering an
 * async sequence before that save can erase the worker's overlay, so paid work waits for the
 * project's `directing` lock to clear. This is a persistence barrier, not an editorial decision.
 */
async function waitForDirectorSaveBarrier(
  projectId: string,
  userId: string,
  env: EnvLike = process.env,
): Promise<boolean> {
  const deadline = Date.now() + directorSaveBarrierTimeoutMs(env);
  const projects = (await getDatabase()).collection(COLLECTIONS.PROJECTS);
  while (Date.now() < deadline) {
    const project = await projects.findOne(
      { projectId, userId },
      { projection: { autoEditStatus: 1 } },
    ) as { autoEditStatus?: string } | null;
    if (!project) throw new Error('MG render execution: project missing or ownership mismatch');
    if (project.autoEditStatus !== 'directing') return true;
    await delay(DIRECTOR_SAVE_BARRIER_POLL_MS);
  }
  return false;
}

function asyncOverlayId(jobId: string): number {
  const hash = jobId.replace(/^mgr_/, '').slice(0, 12);
  if (!/^[a-f0-9]{12}$/.test(hash)) throw new Error(`MG render delivery: invalid job id ${jobId}`);
  return 8_000_000_000_000_000 + Number.parseInt(hash, 16);
}

interface PersistedMgKineticSfxContext {
  version: 'mg-kinetic-sfx-context-v1';
  momentId: string;
  policy: 'full' | 'subtle' | 'off';
  profileId: string;
  policySource: 'director-effective-profile';
  speechEnergy: number;
  speechSource: 'moment-signals' | 'wav2vec-segment';
}

function resolveMgKineticSfxContext(
  project: unknown,
  momentId: string,
): PersistedMgKineticSfxContext | null {
  if (!project || typeof project !== 'object') return null;
  const intelligence = (project as Record<string, unknown>).intelligence;
  if (!intelligence || typeof intelligence !== 'object') return null;
  const contexts = (intelligence as Record<string, unknown>).mgKineticSfxContexts;
  if (!Array.isArray(contexts)) return null;
  const context = contexts.find(item => (
    item
    && typeof item === 'object'
    && (item as Record<string, unknown>).momentId === momentId
  )) as Record<string, unknown> | undefined;
  if (!context || context.version !== 'mg-kinetic-sfx-context-v1') return null;
  const policy = context.policy;
  const speechEnergy = context.speechEnergy;
  const speechSource = context.speechSource;
  if ((policy !== 'full' && policy !== 'subtle' && policy !== 'off')
    || typeof context.profileId !== 'string'
    || context.policySource !== 'director-effective-profile'
    || typeof speechEnergy !== 'number'
    || !Number.isFinite(speechEnergy)
    || speechEnergy < 0
    || speechEnergy > 1
    || (speechSource !== 'moment-signals' && speechSource !== 'wav2vec-segment')) {
    return null;
  }
  return context as unknown as PersistedMgKineticSfxContext;
}

async function deliverMgRenderJobResult(
  job: MgRenderJob,
  result: MgRenderWorkerResult,
  dependencies: Pick<
    MgRenderJobRunnerDependencies,
    'loadProjectForMutation' | 'commitMgRenderDelivery' | 'upsertSequenceAsset' | 'buildSequenceOverlay'
  > = {},
): Promise<void> {
  if (!job.request) throw new Error(`MG render job ${job._id} is missing its executable request`);
  const request = job.request;
  const candidate = request.input.candidate;
  const projectMutationPort = dependencies.loadProjectForMutation && dependencies.commitMgRenderDelivery
    ? null
    : await resolveProjectMutationPort();
  const mutationTarget = await (dependencies.loadProjectForMutation ?? projectMutationPort!.loadProjectForMutation)(
    job.userId,
    job.projectId,
  );
  const commitDelivery = dependencies.commitMgRenderDelivery ?? projectMutationPort!.commitMgRenderDelivery;

  if (result.status !== 'generated') {
    const outcome = {
      jobId: job._id,
      status: result.status,
      candidateId: candidate.id,
      factKind: candidate.factKind,
      frame: request.input.window.startFrame,
      reason: result.reason,
      completedAt: new Date(result.completedAt),
    };
    await commitDelivery(job.userId, job.projectId, {
      expectedRevision: mutationTarget.revision,
      jobId: job._id,
      overlays: [],
      outcome,
    });
    return;
  }

  const outcome = {
    jobId: job._id,
    status: 'generated' as const,
    candidateId: candidate.id,
    factKind: candidate.factKind,
    frame: request.input.window.startFrame,
    sequenceId: result.sequence.address.sequenceId,
    completedAt: new Date(result.completedAt),
  };

  const { assetId } = await (dependencies.upsertSequenceAsset ?? upsertMgSequenceAsset)({
    sequence: result.sequence,
    receipt: result.receipt,
    candidate: { id: candidate.id, factKind: candidate.factKind },
    userId: job.userId,
    projectId: job.projectId,
    orgId: job.orgId,
    codegenContext: {
      window: request.input.window,
      expressiveness: request.input.expressiveness,
      placement: request.input.placement,
    },
  });
  const overlayId = asyncOverlayId(job._id);
  const kineticSfxContext = resolveMgKineticSfxContext(mutationTarget.project, request.input.momentId);
  let kineticService: typeof import('@/lib/editron/services/kinetic-sfx-service') | null = null;
  let kineticSfxEvents: import('@/lib/editron/services/kinetic-sfx-service').KineticSfxEvent[] = [];
  let kineticServiceError: string | null = null;
  if (kineticSfxContext) {
    try {
      kineticService = await import('@/lib/editron/services/kinetic-sfx-service');
      kineticSfxEvents = kineticService.deriveCodegenKineticSfxEvents(request.input, overlayId, {
        speechEnergy: kineticSfxContext.speechEnergy,
        evidence: [
          `policy:${kineticSfxContext.policy}`,
          `profile:${kineticSfxContext.profileId}`,
          `speech-source:${kineticSfxContext.speechSource}`,
        ],
      });
    } catch (error) {
      kineticServiceError = error instanceof Error ? error.message : String(error);
    }
  }
  const overlay = (dependencies.buildSequenceOverlay ?? buildMgSequenceOverlay)({
    sequence: result.sequence,
    receipt: result.receipt,
    candidate: { id: candidate.id, factKind: candidate.factKind },
    assetId,
    overlayId,
    snappedFrame: request.input.window.startFrame,
    canvas: request.canvas,
    metadata: {
      atomicPlacement: request.input.placement,
      mgExpressionAuthority: request.input.expressiveness,
      edlSource: 'async-mg-render-worker',
      edlReason: job._id,
      kineticSfxEvents,
    },
  });
  overlay.metadata = {
    ...overlay.metadata,
    mgRenderJobId: job._id,
    kineticSfxContext: kineticSfxContext ?? {
      version: 'mg-kinetic-sfx-context-v1',
      status: 'unavailable',
      momentId: request.input.momentId,
    },
  };
  const deliveryOverlays: any[] = [overlay];
  if (!kineticSfxContext) {
    overlay.metadata.kineticSfxDelivery = {
      status: 'suppressed',
      reason: 'durable-kinetic-sfx-context-unavailable',
    };
  } else if (kineticServiceError || !kineticService) {
    overlay.metadata.kineticSfxDelivery = {
      status: 'degraded',
      reason: kineticServiceError ?? 'kinetic-sfx-service-unavailable',
    };
  } else if (kineticSfxEvents.length === 0) {
    overlay.metadata.kineticSfxDelivery = {
      status: 'suppressed',
      reason: 'kinetic-event-not-licensed-by-evidence',
    };
  } else {
    try {
      const sfxResult = await kineticService.placeMotionGraphicKineticSFX(
        deliveryOverlays,
        job.userId,
        kineticSfxContext.policy,
      );
      overlay.metadata.kineticSfxDelivery = { status: 'completed', ...sfxResult };
    } catch (error) {
      overlay.metadata.kineticSfxDelivery = {
        status: 'degraded',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  await commitDelivery(job.userId, job.projectId, {
    expectedRevision: mutationTarget.revision,
    jobId: job._id,
    overlays: deliveryOverlays,
    outcome,
  });
}

async function executeClaimedMgRenderJob(
  claimed: MgRenderJob,
  leaseId: string,
  env: EnvLike,
  now: Date,
  dependencies: MgRenderJobRunnerDependencies,
  deliver: boolean,
): Promise<MgRenderWorkerResult> {
  const completeJob = dependencies.completeJob ?? completeMgRenderJob;
  const failJob = dependencies.failJob ?? failMgRenderJob;
  const executeSandbox = dependencies.executeSandbox ?? executeMgRenderInSandbox;
  const deliverResult = dependencies.deliverResult
    ?? ((job: MgRenderJob, result: MgRenderWorkerResult) => deliverMgRenderJobResult(job, result, dependencies));
  const reconcileParent = dependencies.reconcileParent ?? reconcileChatEditorialIntentParent;
  let result: MgRenderWorkerResult;

  try {
    if (!claimed.request) throw new Error(`MG render job ${claimed._id} is missing its executable request`);
    const leaseMs = sandboxTimeoutMs(env) + LEASE_GRACE_MS;
    const authorizationClaims: MgStorageAuthorizationClaims = {
      version: 1,
      jobId: claimed._id,
      leaseId,
      projectId: claimed.projectId,
      userId: claimed.userId,
      orgId: claimed.orgId,
      expiresAtMs: now.getTime() + authTtlMs(env, leaseMs),
    };
    result = await executeSandbox({
      request: claimed.request,
      executionId: leaseId,
      storageAuthorization: {
        url: resolveMgStorageAuthorizationUrl(env),
        token: createMgStorageAuthorizationToken(authorizationClaims, env),
      },
      env,
    });
    if (isRetryableMgRenderResult(result)) throw new RetryableMgRenderResultError(result);
    if (deliver) await deliverResult(claimed, result);
    const completed = await completeJob({ jobId: claimed._id, leaseId, result });
    if (!completed) throw new Error(`MG render job ${claimed._id} lost its lease before completion`);
  } catch (error) {
    const retryable = retryableSandboxFailure(error);
    const disposition = await failJob({
      jobId: claimed._id,
      leaseId,
      error,
      retryable,
      ...(retryable ? { retryDelayMs: resolveMgRenderRetryDelayMs(claimed, error, env) } : {}),
      retryDeadlineAt: claimed.retryDeadlineAt,
    });
    if (deliver && disposition === 'failed') {
      try {
        await reconcileParent({
          jobId: claimed._id,
          projectId: claimed.projectId,
          userId: claimed.userId,
        });
      } catch (reconciliationError) {
        throw new Error(
          `MG render job ${claimed._id} reached terminal failure but parent reconciliation failed: ${
            reconciliationError instanceof Error ? reconciliationError.message : String(reconciliationError)
          }`,
          { cause: reconciliationError },
        );
      }
    }
    throw new MgRenderJobExecutionError(claimed._id, disposition, error);
  }
  if (deliver) {
    await reconcileParent({
      jobId: claimed._id,
      projectId: claimed.projectId,
      userId: claimed.userId,
    });
  }
  return result;
}

async function tombstoneMissingProjectMgRenderJob(
  jobId: string,
  projectId: string,
  userId: string,
  cause: Error,
  now: Date,
): Promise<void> {
  await (await getDatabase()).collection<MgRenderJob>(COLLECTIONS.MG_RENDER_JOBS).updateOne(
    { _id: jobId },
    {
      $set: {
        status: 'failed',
        leaseId: null,
        leaseExpiresAt: null,
        lastError: `project-missing-tombstone: ${cause.message}`,
        completedAt: now,
        updatedAt: now,
      },
    },
  );
  console.warn(`[MGRenderWorker] ${jobId} tombstoned: project ${projectId} for user ${userId} no longer exists`);
}

export async function executeQueuedMgRenderJob(
  jobId: string,
  options: {
    env?: EnvLike;
    now?: Date;
    dependencies?: MgRenderJobRunnerDependencies;
  } = {},
): Promise<
  | { status: 'completed'; result: MgRenderWorkerResult }
  | {
    status: 'not-claimed';
    jobStatus: MgRenderJobStatus | 'missing';
    leaseExpiresAt: Date | null;
    nextAttemptAt: Date | null;
  }
> {
  const env = options.env ?? process.env;
  const dependencies = options.dependencies ?? {};
  const state = await (dependencies.getJobState ?? getMgRenderJobState)(jobId);
  if (state.status === 'missing' || !state.projectId || !state.userId) {
    return {
      status: 'not-claimed',
      jobStatus: state.status,
      leaseExpiresAt: state.leaseExpiresAt,
      nextAttemptAt: state.nextAttemptAt,
    };
  }
  if (state.status === 'completed' || state.status === 'failed') {
    await (dependencies.reconcileParent ?? reconcileChatEditorialIntentParent)({
      jobId,
      projectId: state.projectId,
      userId: state.userId,
    });
    return {
      status: 'not-claimed',
      jobStatus: state.status,
      leaseExpiresAt: state.leaseExpiresAt,
      nextAttemptAt: state.nextAttemptAt,
    };
  }
  if (state.status === 'queued') {
    let ready: boolean;
    try {
      ready = await (dependencies.waitForProjectReady ?? waitForDirectorSaveBarrier)(
        state.projectId,
        state.userId,
        env,
      );
    } catch (error) {
      // The project is gone (disposable fixture cleanup or user deletion) while this durable job was still
      // queued. Tombstone it terminally instead of throwing into a QStash 500 retry storm — the job can
      // never succeed without its project. Observed: grounded-process-mg matrix run, 2026-08-03.
      if (error instanceof Error && /project missing|ownership mismatch/i.test(error.message)) {
        await tombstoneMissingProjectMgRenderJob(jobId, state.projectId, state.userId, error, options.now ?? new Date());
        await (dependencies.reconcileParent ?? reconcileChatEditorialIntentParent)({
          jobId,
          projectId: state.projectId,
          userId: state.userId,
        }).catch(() => undefined);
        return {
          status: 'not-claimed',
          jobStatus: 'failed',
          leaseExpiresAt: null,
          nextAttemptAt: null,
        };
      }
      throw error;
    }
    if (!ready) {
      return {
        status: 'not-claimed',
        jobStatus: state.status,
        leaseExpiresAt: state.leaseExpiresAt,
        nextAttemptAt: state.nextAttemptAt,
      };
    }
  }
  const executionNow = options.now ?? new Date();
  const leaseId = `mgl_${nanoid(20)}`;
  const claimed = await (dependencies.claimJob ?? claimMgRenderJob)({
    jobId,
    leaseId,
    leaseMs: sandboxTimeoutMs(env) + LEASE_GRACE_MS,
    now: executionNow,
  });
  if (!claimed) {
    const latestState = await (dependencies.getJobState ?? getMgRenderJobState)(jobId);
    return {
      status: 'not-claimed',
      jobStatus: latestState.status,
      leaseExpiresAt: latestState.leaseExpiresAt,
      nextAttemptAt: latestState.nextAttemptAt,
    };
  }
  const result = await executeClaimedMgRenderJob(claimed, leaseId, env, executionNow, dependencies, true);
  return { status: 'completed', result };
}

export async function runDurableMgRenderJob(
  input: CreateMgRenderJobInput,
  options: {
    env?: EnvLike;
    now?: Date;
    dependencies?: MgRenderJobRunnerDependencies;
  } = {},
): Promise<MgRenderWorkerResult> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const dependencies = options.dependencies ?? {};
  const createOrGetJob = dependencies.createOrGetJob ?? createOrGetMgRenderJob;
  const claimJob = dependencies.claimJob ?? claimMgRenderJob;
  const completeJob = dependencies.completeJob ?? completeMgRenderJob;
  const failJob = dependencies.failJob ?? failMgRenderJob;
  const getJob = dependencies.getJob ?? getMgRenderJobForOwner;

  const stored = await createOrGetJob(input, { now });
  if (stored.status === 'completed' && stored.result) return stored.result;
  if (stored.status === 'failed') throw new Error(`MG render job ${stored._id} is terminal: ${stored.lastError ?? 'unknown failure'}`);

  const leaseId = `mgl_${nanoid(20)}`;
  const leaseMs = sandboxTimeoutMs(env) + LEASE_GRACE_MS;
  const claimed = await claimJob({ jobId: stored._id, leaseId, leaseMs, now });
  if (!claimed) {
    const latest = await getJob({ jobId: stored._id, userId: input.userId, projectId: input.projectId });
    if (latest?.status === 'completed' && latest.result) return latest.result;
    throw new Error(`MG render job ${stored._id} is already running or waiting for retry`);
  }

  return executeClaimedMgRenderJob(claimed, leaseId, env, now, {
    ...dependencies,
    completeJob,
    failJob,
  }, false);
}

export function isOwnedRunningMgRenderJob(job: MgRenderJob | null, claims: MgStorageAuthorizationClaims): boolean {
  return Boolean(
    job
    && job.status === 'running'
    && job.leaseId === claims.leaseId
    && job._id === claims.jobId
    && job.projectId === claims.projectId
    && job.userId === claims.userId
    && job.orgId === claims.orgId,
  );
}
