import { createHmac, timingSafeEqual } from 'node:crypto';

import { nanoid } from 'nanoid';
import { z } from 'zod';

import {
  claimMgRenderJob,
  completeMgRenderJob,
  createOrGetMgRenderJob,
  failMgRenderJob,
  getMgRenderJobForOwner,
  type CreateMgRenderJobInput,
  type MgRenderJob,
} from './mg-render-job-service';
import { executeMgRenderInSandbox } from './sandbox-render-worker';
import type { MgRenderWorkerResult } from './worker-contract';

type EnvLike = Record<string, string | undefined>;

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
  return !/missing MG_RENDER_|missing (?:its )?executable request|commit mismatch|does not match snapshot commit|storage_full|authorization denied|invalid MG storage/i.test(message);
}

interface MgRenderJobRunnerDependencies {
  createOrGetJob?: typeof createOrGetMgRenderJob;
  claimJob?: typeof claimMgRenderJob;
  completeJob?: typeof completeMgRenderJob;
  failJob?: typeof failMgRenderJob;
  getJob?: typeof getMgRenderJobForOwner;
  executeSandbox?: typeof executeMgRenderInSandbox;
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
  const executeSandbox = dependencies.executeSandbox ?? executeMgRenderInSandbox;

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

  try {
    if (!claimed.request) {
      throw new Error(`MG render job ${claimed._id} is missing its executable request`);
    }
    const authorizationClaims: MgStorageAuthorizationClaims = {
      version: 1,
      jobId: claimed._id,
      leaseId,
      projectId: claimed.projectId,
      userId: claimed.userId,
      orgId: claimed.orgId,
      expiresAtMs: now.getTime() + authTtlMs(env, leaseMs),
    };
    const storageAuthorization = {
      url: resolveMgStorageAuthorizationUrl(env),
      token: createMgStorageAuthorizationToken(authorizationClaims, env),
    };
    const result = await executeSandbox({
      request: claimed.request,
      executionId: leaseId,
      storageAuthorization,
      env,
    });
    if (isRetryableMgRenderResult(result)) throw new RetryableMgRenderResultError(result);
    const completed = await completeJob({ jobId: claimed._id, leaseId, result });
    if (!completed) throw new Error(`MG render job ${claimed._id} lost its lease before completion`);
    return result;
  } catch (error) {
    const disposition = await failJob({
      jobId: claimed._id,
      leaseId,
      error,
      retryable: retryableSandboxFailure(error),
    });
    throw new Error(
      `MG render job ${claimed._id} failed (${disposition}): ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
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
