import type { Collection } from 'mongodb';
import { nanoid } from 'nanoid';

import { COLLECTIONS, getDatabase } from '@/lib/editron/db/mongodb';
import type { MgMomentInput } from './types';
import {
  MG_RENDER_WORKER_CONTRACT_VERSION,
  buildMgRenderIdempotencyKey,
  buildMgRenderJobId,
  mgRenderWorkerRequestSchema,
  mgRenderWorkerResultSchema,
  type MgRenderWorkerRequest,
  type MgRenderWorkerResult,
} from './worker-contract';

export type MgRenderJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface MgRenderJob {
  _id: string;
  version: typeof MG_RENDER_WORKER_CONTRACT_VERSION;
  idempotencyKey: string;
  projectId: string;
  userId: string;
  orgId: string | null;
  request: MgRenderWorkerRequest;
  status: MgRenderJobStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  leaseId: string | null;
  leaseExpiresAt: Date | null;
  lastError: string | null;
  result: MgRenderWorkerResult | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  expiresAt: Date;
}

export interface CreateMgRenderJobInput {
  projectId: string;
  userId: string;
  orgId?: string | null;
  appCommit: string;
  input: MgMomentInput;
  canvas: { width: number; height: number };
  sequenceNamespace: string;
}

export interface MgRenderJobServiceOptions {
  collection?: Collection<MgRenderJob>;
  now?: Date;
  maxAttempts?: number;
  retentionMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const DEFAULT_LEASE_MS = 15 * 60 * 1_000;

async function collection(override?: Collection<MgRenderJob>): Promise<Collection<MgRenderJob>> {
  if (override) return override;
  return (await getDatabase()).collection<MgRenderJob>(COLLECTIONS.MG_RENDER_JOBS);
}

function boundedError(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value.slice(0, 8_000);
}

export function buildMgRenderWorkerRequest(
  input: CreateMgRenderJobInput,
  requestedAt = new Date(),
): MgRenderWorkerRequest {
  const idempotencyKey = buildMgRenderIdempotencyKey({
    projectId: input.projectId,
    userId: input.userId,
    orgId: input.orgId ?? null,
    appCommit: input.appCommit,
    moment: input.input,
    canvas: input.canvas,
    sequenceNamespace: input.sequenceNamespace,
  });
  return mgRenderWorkerRequestSchema.parse({
    version: MG_RENDER_WORKER_CONTRACT_VERSION,
    jobId: buildMgRenderJobId(idempotencyKey),
    idempotencyKey,
    projectId: input.projectId,
    userId: input.userId,
    orgId: input.orgId ?? null,
    appCommit: input.appCommit,
    input: input.input,
    canvas: input.canvas,
    sequenceNamespace: input.sequenceNamespace,
    requestedAt: requestedAt.toISOString(),
  });
}

export async function createOrGetMgRenderJob(
  input: CreateMgRenderJobInput,
  options: MgRenderJobServiceOptions = {},
): Promise<MgRenderJob> {
  const now = options.now ?? new Date();
  const request = buildMgRenderWorkerRequest(input, now);
  const jobs = await collection(options.collection);
  const job: MgRenderJob = {
    _id: request.jobId,
    version: MG_RENDER_WORKER_CONTRACT_VERSION,
    idempotencyKey: request.idempotencyKey,
    projectId: request.projectId,
    userId: request.userId,
    orgId: request.orgId,
    request,
    status: 'queued',
    attemptCount: 0,
    maxAttempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    nextAttemptAt: now,
    leaseId: null,
    leaseExpiresAt: null,
    lastError: null,
    result: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    expiresAt: new Date(now.getTime() + (options.retentionMs ?? DEFAULT_RETENTION_MS)),
  };
  const stored = await jobs.findOneAndUpdate(
    { _id: job._id },
    { $setOnInsert: job },
    { upsert: true, returnDocument: 'after' },
  );
  if (!stored) throw new Error('MG render job: upsert returned no document');
  return stored;
}

export async function claimMgRenderJob(input: {
  jobId: string;
  leaseId?: string;
  leaseMs?: number;
  now?: Date;
  collection?: Collection<MgRenderJob>;
}): Promise<MgRenderJob | null> {
  const now = input.now ?? new Date();
  const leaseId = input.leaseId ?? `mgl_${nanoid(16)}`;
  const jobs = await collection(input.collection);
  return jobs.findOneAndUpdate(
    {
      _id: input.jobId,
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
        leaseExpiresAt: new Date(now.getTime() + (input.leaseMs ?? DEFAULT_LEASE_MS)),
        startedAt: now,
        updatedAt: now,
        lastError: null,
      },
      $inc: { attemptCount: 1 },
    },
    { returnDocument: 'after' },
  );
}

export async function renewMgRenderJobLease(input: {
  jobId: string;
  leaseId: string;
  leaseMs?: number;
  now?: Date;
  collection?: Collection<MgRenderJob>;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const result = await (await collection(input.collection)).updateOne(
    { _id: input.jobId, status: 'running', leaseId: input.leaseId },
    { $set: { leaseExpiresAt: new Date(now.getTime() + (input.leaseMs ?? DEFAULT_LEASE_MS)), updatedAt: now } },
  );
  return result.modifiedCount === 1;
}

export async function completeMgRenderJob(input: {
  jobId: string;
  leaseId: string;
  result: MgRenderWorkerResult;
  now?: Date;
  collection?: Collection<MgRenderJob>;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const result = mgRenderWorkerResultSchema.parse(input.result);
  if (result.jobId !== input.jobId) throw new Error('MG render job result belongs to a different job');
  const update = await (await collection(input.collection)).updateOne(
    { _id: input.jobId, status: 'running', leaseId: input.leaseId },
    {
      $set: {
        status: 'completed',
        result,
        leaseId: null,
        leaseExpiresAt: null,
        completedAt: now,
        updatedAt: now,
      },
    },
  );
  return update.modifiedCount === 1;
}

export async function failMgRenderJob(input: {
  jobId: string;
  leaseId: string;
  error: unknown;
  retryable: boolean;
  retryDelayMs?: number;
  now?: Date;
  collection?: Collection<MgRenderJob>;
}): Promise<'queued' | 'failed' | 'stale-lease'> {
  const now = input.now ?? new Date();
  const jobs = await collection(input.collection);
  const baseFilter = { _id: input.jobId, status: 'running' as const, leaseId: input.leaseId };
  if (input.retryable) {
    const retry = await jobs.updateOne(
      { ...baseFilter, $expr: { $lt: ['$attemptCount', '$maxAttempts'] } },
      {
        $set: {
          status: 'queued',
          nextAttemptAt: new Date(now.getTime() + Math.max(0, input.retryDelayMs ?? 5_000)),
          leaseId: null,
          leaseExpiresAt: null,
          lastError: boundedError(input.error),
          updatedAt: now,
        },
      },
    );
    if (retry.modifiedCount === 1) return 'queued';
  }
  const terminal = await jobs.updateOne(
    baseFilter,
    {
      $set: {
        status: 'failed',
        leaseId: null,
        leaseExpiresAt: null,
        lastError: boundedError(input.error),
        completedAt: now,
        updatedAt: now,
      },
    },
  );
  return terminal.modifiedCount === 1 ? 'failed' : 'stale-lease';
}

export async function getMgRenderJobForOwner(input: {
  jobId: string;
  userId: string;
  projectId: string;
  collection?: Collection<MgRenderJob>;
}): Promise<MgRenderJob | null> {
  return (await collection(input.collection)).findOne({
    _id: input.jobId,
    userId: input.userId,
    projectId: input.projectId,
  });
}
