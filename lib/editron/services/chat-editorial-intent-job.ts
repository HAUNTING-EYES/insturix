import { createHash, randomUUID } from 'node:crypto';

import { Client } from '@upstash/qstash';

import type { ChatAiEditTransaction } from '@/lib/editron/agent/chat-ai-edit-transaction-runtime';
import { verifyChatToolPostcondition } from '@/lib/editron/agent/chat-edit-postconditions';
import type { GroundedEditorialIntent } from '@/lib/editron/agent/chat-editorial-intent-tools';
import type { ProjectBrief } from '@/lib/editron/data/edit-profile-types';
import {
  EDITORIAL_FAMILIES,
  normalizeEditorialPreferences,
  type EditorialPreferences,
} from '@/lib/editron/production-brief/editorial-preferences';
import type {
  Checkpoint,
  CheckpointService,
  RestorableProjectState,
} from '@/lib/editron/services/checkpoint-service';
import type { Phase0RenderedEvidenceDispatchResult } from '@/lib/editron/services/phase0-rendered-evidence-worker';

export const CHAT_EDITORIAL_INTENT_JOB_VERSION = 'editron-chat-editorial-intent-job-v1' as const;
export const CHAT_EDITORIAL_INTENT_MAX_ATTEMPTS = 3;

const JOB_LEASE_MS = 12 * 60 * 1000;
const JOB_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type ChatEditorialIntentJobStatus =
  | 'created'
  | 'dispatching'
  | 'queued'
  | 'running'
  | 'retry_wait'
  | 'completed'
  | 'completed_unverified'
  | 'declined'
  | 'dispatch_failed'
  | 'failed'
  | 'rolled_back';

export interface ChatEditorialIntentJobRequest {
  projectId: string;
  userId: string;
  sessionId: string;
  operationId: string;
  intent: GroundedEditorialIntent;
}

export interface ChatEditorialIntentJob {
  _id: string;
  version: typeof CHAT_EDITORIAL_INTENT_JOB_VERSION;
  idempotencyKey: string;
  status: ChatEditorialIntentJobStatus;
  projectId: string;
  userId: string;
  sessionId: string;
  operationId: string;
  intent: GroundedEditorialIntent;
  attemptCount: number;
  leaseId?: string | null;
  leaseExpiresAt?: Date | null;
  dispatchMessageId?: string | null;
  beforeCheckpointId?: string | null;
  afterCheckpointId?: string | null;
  renderVerification?: Phase0RenderedEvidenceDispatchResult | null;
  result?: Record<string, unknown> | null;
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date | null;
  expiresAt: Date;
}

export interface QueueChatEditorialIntentJobResult {
  status: 'queued' | 'already-queued' | 'completed' | 'declined' | 'failed';
  jobId: string;
  messageId?: string;
  reason?: string;
}

export interface RunChatEditorialIntentJobResult {
  status: 'completed' | 'completed_unverified' | 'declined' | 'failed' | 'skipped';
  jobId: string;
  reason?: string;
  renderVerification?: Phase0RenderedEvidenceDispatchResult;
}

interface DirectorExecutionResult {
  success: boolean;
  overlaysModified: number;
  warnings: string[];
  actionsSkipped: Array<{ action: string; reason: string }>;
  decisionAuthority?: Record<string, unknown>;
}

export interface ChatEditorialIntentJobStore {
  createOrGet(job: ChatEditorialIntentJob): Promise<{ created: boolean; job: ChatEditorialIntentJob }>;
  find(jobId: string, userId: string): Promise<ChatEditorialIntentJob | null>;
  claimDispatch(jobId: string, userId: string, now: Date): Promise<boolean>;
  markPublished(jobId: string, userId: string, messageId: string | undefined, now: Date): Promise<void>;
  markDispatchFailed(jobId: string, userId: string, error: string, now: Date): Promise<void>;
  claimRun(jobId: string, userId: string, leaseId: string, now: Date): Promise<ChatEditorialIntentJob | null>;
  markDeclined(jobId: string, userId: string, result: Record<string, unknown>, now: Date): Promise<void>;
  markCompleted(input: {
    jobId: string;
    userId: string;
    afterCheckpointId: string;
    renderVerification: Phase0RenderedEvidenceDispatchResult;
    result: Record<string, unknown>;
    now: Date;
  }): Promise<void>;
  markRetry(jobId: string, userId: string, error: string, now: Date): Promise<void>;
  markFailed(jobId: string, userId: string, error: string, rolledBack: boolean, now: Date): Promise<void>;
  markCheckpointStarted(jobId: string, userId: string, checkpointId: string, now: Date): Promise<void>;
}

interface QueueDependencies {
  store: ChatEditorialIntentJobStore;
  loadProject(userId: string, projectId: string): Promise<Record<string, unknown> | null>;
  publish(payload: { jobId: string; projectId: string; userId: string }): Promise<{ messageId?: string }>;
  now(): Date;
}

interface RunDependencies {
  store: ChatEditorialIntentJobStore;
  loadProject(userId: string, projectId: string): Promise<Record<string, unknown> | null>;
  executeDirector(job: ChatEditorialIntentJob): Promise<DirectorExecutionResult>;
  checkpointService: Pick<
    CheckpointService,
    'claimChatEditOperation' | 'createCheckpoint' | 'updateChatEditOperation' | 'restoreProjectCheckpoint'
  >;
  captureProjectState(project: Record<string, unknown>): RestorableProjectState;
  buildRenderVerificationRequest: typeof import(
    '@/lib/editron/agent/chat-ai-edit-transaction-runtime'
  )['buildChatEditRenderVerificationRequest'];
  dispatchRenderEvidence: typeof import(
    '@/lib/editron/services/phase0-rendered-evidence-worker'
  )['dispatchPhase0RenderedEvidenceJob'];
  now(): Date;
}

export class ChatEditorialIntentRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatEditorialIntentRetryableError';
  }
}

export async function queueChatEditorialIntentJob(
  raw: ChatEditorialIntentJobRequest,
  overrides: Partial<QueueDependencies> = {},
): Promise<QueueChatEditorialIntentJobResult> {
  const request = normalizeRequest(raw);
  const deps = await resolveQueueDependencies(overrides);
  const project = await deps.loadProject(request.userId, request.projectId);
  if (!project) return failedQueueResult(request, 'project-not-found-or-not-owned');

  const now = deps.now();
  const idempotencyKey = operationKey(request);
  const jobId = `chat_intent_${digest(idempotencyKey).slice(0, 24)}`;
  const proposed: ChatEditorialIntentJob = {
    _id: jobId,
    version: CHAT_EDITORIAL_INTENT_JOB_VERSION,
    idempotencyKey,
    status: 'created',
    ...request,
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + JOB_TTL_MS),
  };
  const existing = await deps.store.createOrGet(proposed);
  if (!sameRequest(existing.job, proposed)) {
    return { status: 'failed', jobId, reason: 'operation-id-conflicts-with-another-editorial-intent' };
  }
  if (!existing.created) {
    const terminal = terminalQueueResult(existing.job);
    if (terminal) return terminal;
  }

  const claimed = await deps.store.claimDispatch(jobId, request.userId, deps.now());
  if (!claimed) {
    const current = await deps.store.find(jobId, request.userId);
    return current
      ? terminalQueueResult(current) ?? {
          status: 'already-queued',
          jobId,
          messageId: current.dispatchMessageId ?? undefined,
        }
      : { status: 'failed', jobId, reason: 'editorial-intent-job-disappeared-before-dispatch' };
  }

  try {
    const published = await deps.publish({ jobId, projectId: request.projectId, userId: request.userId });
    await deps.store.markPublished(jobId, request.userId, published.messageId, deps.now());
    return { status: 'queued', jobId, ...(published.messageId ? { messageId: published.messageId } : {}) };
  } catch (error) {
    const message = errorMessage(error);
    await deps.store.markDispatchFailed(jobId, request.userId, message, deps.now());
    return { status: 'failed', jobId, reason: `editorial-intent-dispatch-failed:${message}` };
  }
}

export async function runChatEditorialIntentJob(
  payload: { jobId: string; projectId: string; userId: string },
  overrides: Partial<RunDependencies> = {},
): Promise<RunChatEditorialIntentJobResult> {
  const deps = await resolveRunDependencies(overrides);
  const leaseId = randomUUID();
  const job = await deps.store.claimRun(payload.jobId, payload.userId, leaseId, deps.now());
  if (!job) return { status: 'skipped', jobId: payload.jobId, reason: 'job-not-claimable' };
  if (job.projectId !== payload.projectId) {
    await deps.store.markFailed(job._id, job.userId, 'worker-project-scope-mismatch', false, deps.now());
    return { status: 'failed', jobId: job._id, reason: 'worker-project-scope-mismatch' };
  }

  let checkpoint: Checkpoint | null = null;
  let attemptOperationId = '';
  try {
    const beforeProject = await deps.loadProject(job.userId, job.projectId);
    if (!beforeProject) throw new Error('project-not-found-before-editorial-intent');

    attemptOperationId = attemptOperationKey(job);
    const beforeCheckpointId = checkpointId(job, 'before');
    const claim = await deps.checkpointService.claimChatEditOperation({
      checkpointId: beforeCheckpointId,
      operationId: attemptOperationId,
      operationStatus: 'running',
      sessionId: job.sessionId,
      projectId: job.projectId,
      userId: job.userId,
      overlays: Array.isArray(beforeProject.overlays) ? beforeProject.overlays as any[] : [],
      projectState: deps.captureProjectState(beforeProject),
      description: `Before durable editorial intent ${job.operationId}`,
      type: 'before-llm',
      force: true,
    });
    if (!claim.claimed) throw new Error('editorial-intent-attempt-checkpoint-already-claimed');
    checkpoint = claim.checkpoint;
    await deps.store.markCheckpointStarted(job._id, job.userId, beforeCheckpointId, deps.now());

    const director = await deps.executeDirector(job);
    if (!director.success) {
      throw new Error(`director-failed:${directorFailureReason(director)}`);
    }

    const afterProject = await deps.loadProject(job.userId, job.projectId);
    if (!afterProject) throw new Error('project-not-found-after-editorial-intent');
    const resultData = directorResultData(director);
    const postcondition = verifyChatToolPostcondition({
      toolName: 'apply_editorial_intent',
      args: { intentId: job.intent.intentId, goal: job.intent.goal },
      resultData,
      beforeProject,
      afterProject,
    });

    if (postcondition.status !== 'pass') {
      if (director.overlaysModified === 0) {
        await deps.checkpointService.updateChatEditOperation(
          checkpoint.checkpointId,
          job.userId,
          attemptOperationId,
          { operationStatus: 'no-op', mutatingToolNames: [] },
        );
        await deps.store.markDeclined(job._id, job.userId, {
          ...resultData,
          postconditionVerification: postcondition,
        }, deps.now());
        return {
          status: 'declined',
          jobId: job._id,
          reason: 'unified-planner-produced-no-material-change',
        };
      }
      throw new Error(`editorial-intent-postcondition-failed:${postcondition.reason}`);
    }

    const afterCheckpoint = await deps.checkpointService.createCheckpoint({
      checkpointId: checkpointId(job, 'after'),
      operationId: attemptOperationId,
      sessionId: job.sessionId,
      projectId: job.projectId,
      userId: job.userId,
      overlays: Array.isArray(afterProject.overlays) ? afterProject.overlays as any[] : [],
      projectState: deps.captureProjectState(afterProject),
      description: `After durable editorial intent ${job.operationId}`,
      type: 'after-llm',
      force: true,
    });
    if (!afterCheckpoint) throw new Error('editorial-intent-after-checkpoint-not-created');
    await deps.checkpointService.updateChatEditOperation(
      checkpoint.checkpointId,
      job.userId,
      attemptOperationId,
      {
        operationStatus: 'completed',
        mutatingToolNames: ['apply_editorial_intent'],
        afterCheckpointId: afterCheckpoint.checkpointId,
      },
    );

    const transaction: ChatAiEditTransaction = {
      operationId: job.operationId,
      sessionId: job.sessionId,
      projectId: job.projectId,
      userId: job.userId,
      beforeCheckpointId: checkpoint.checkpointId,
    };
    const renderRequest = deps.buildRenderVerificationRequest({
      transaction,
      afterCheckpointId: afterCheckpoint.checkpointId,
      project: afterProject,
      successfulCalls: [{
        call: {
          name: 'apply_editorial_intent',
          args: { intentId: job.intent.intentId, goal: job.intent.goal },
        },
        result: {
          toolName: 'apply_editorial_intent',
          result: JSON.stringify({
            status: 'success',
            data: { ...resultData, postconditionVerification: postcondition },
            error: null,
            nextAction: null,
          }),
        },
      }],
    });
    const renderVerification = await deps.dispatchRenderEvidence({
      projectId: job.projectId,
      userId: job.userId,
      requestedAt: deps.now().toISOString(),
      chatEditVerification: renderRequest,
    });
    await deps.store.markCompleted({
      jobId: job._id,
      userId: job.userId,
      afterCheckpointId: afterCheckpoint.checkpointId,
      renderVerification,
      result: { ...resultData, postconditionVerification: postcondition },
      now: deps.now(),
    });
    return {
      status: renderVerification.dispatched ? 'completed' : 'completed_unverified',
      jobId: job._id,
      renderVerification,
      ...(!renderVerification.dispatched
        ? { reason: renderVerification.reason ?? 'render-verification-not-dispatched' }
        : {}),
    };
  } catch (error) {
    const message = errorMessage(error);
    let rolledBack = false;
    if (checkpoint && attemptOperationId) {
      const restored = await deps.checkpointService.restoreProjectCheckpoint(
        checkpoint.checkpointId,
        job.userId,
      );
      rolledBack = restored.restored;
      await deps.checkpointService.updateChatEditOperation(
        checkpoint.checkpointId,
        job.userId,
        attemptOperationId,
        {
          operationStatus: rolledBack ? 'rolled-back' : 'failed',
          mutatingToolNames: ['apply_editorial_intent'],
          operationError: rolledBack
            ? message
            : `rollback-failed:${restored.reason ?? 'unknown'}:${message}`,
        },
      );
      if (!rolledBack) {
        const failure = `editorial-intent-rollback-failed:${restored.reason ?? 'unknown'}:${message}`;
        await deps.store.markFailed(job._id, job.userId, failure, false, deps.now());
        return { status: 'failed', jobId: job._id, reason: failure };
      }
    }

    if (isRetryableFailure(message) && job.attemptCount < CHAT_EDITORIAL_INTENT_MAX_ATTEMPTS) {
      await deps.store.markRetry(job._id, job.userId, message, deps.now());
      throw new ChatEditorialIntentRetryableError(message);
    }
    await deps.store.markFailed(job._id, job.userId, message, rolledBack, deps.now());
    return { status: 'failed', jobId: job._id, reason: message };
  }
}

class MongoChatEditorialIntentJobStore implements ChatEditorialIntentJobStore {
  async createOrGet(job: ChatEditorialIntentJob) {
    const collection = await editorialIntentJobsCollection();
    try {
      await collection.insertOne(job);
      return { created: true, job };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const existing = await this.find(job._id, job.userId);
      if (!existing) throw new Error('editorial-intent-idempotency-collision');
      return { created: false, job: existing };
    }
  }

  async find(jobId: string, userId: string) {
    return (await editorialIntentJobsCollection()).findOne({ _id: jobId, userId });
  }

  async claimDispatch(jobId: string, userId: string, now: Date) {
    const result = await (await editorialIntentJobsCollection()).updateOne(
      { _id: jobId, userId, status: { $in: ['created', 'dispatch_failed'] } },
      { $set: { status: 'dispatching', error: null, updatedAt: now } },
    );
    return result.modifiedCount === 1;
  }

  async markPublished(jobId: string, userId: string, messageId: string | undefined, now: Date) {
    await this.set(jobId, userId, {
      status: 'queued',
      dispatchMessageId: messageId ?? null,
      updatedAt: now,
    });
  }

  async markDispatchFailed(jobId: string, userId: string, error: string, now: Date) {
    await this.set(jobId, userId, {
      status: 'dispatch_failed',
      error: bounded(error),
      updatedAt: now,
    });
  }

  async claimRun(jobId: string, userId: string, leaseId: string, now: Date) {
    return (await editorialIntentJobsCollection()).findOneAndUpdate(
      {
        _id: jobId,
        userId,
        attemptCount: { $lt: CHAT_EDITORIAL_INTENT_MAX_ATTEMPTS },
        $or: [
          { status: { $in: ['dispatching', 'queued', 'retry_wait'] } },
          { status: 'running', leaseExpiresAt: { $lte: now } },
        ],
      },
      {
        $set: {
          status: 'running',
          leaseId,
          leaseExpiresAt: new Date(now.getTime() + JOB_LEASE_MS),
          error: null,
          updatedAt: now,
        },
        $inc: { attemptCount: 1 },
      },
      { returnDocument: 'after' },
    );
  }

  async markCheckpointStarted(jobId: string, userId: string, checkpointId: string, now: Date) {
    await this.set(jobId, userId, { beforeCheckpointId: checkpointId, updatedAt: now });
  }

  async markDeclined(jobId: string, userId: string, result: Record<string, unknown>, now: Date) {
    await this.finish(jobId, userId, { status: 'declined', result, error: null }, now);
  }

  async markCompleted(input: {
    jobId: string;
    userId: string;
    afterCheckpointId: string;
    renderVerification: Phase0RenderedEvidenceDispatchResult;
    result: Record<string, unknown>;
    now: Date;
  }) {
    await this.finish(input.jobId, input.userId, {
      status: input.renderVerification.dispatched ? 'completed' : 'completed_unverified',
      afterCheckpointId: input.afterCheckpointId,
      renderVerification: input.renderVerification,
      result: input.result,
      error: input.renderVerification.dispatched
        ? null
        : bounded(input.renderVerification.reason ?? 'render-verification-not-dispatched'),
    }, input.now);
  }

  async markRetry(jobId: string, userId: string, error: string, now: Date) {
    await this.set(jobId, userId, {
      status: 'retry_wait',
      leaseId: null,
      leaseExpiresAt: null,
      error: bounded(error),
      updatedAt: now,
    });
  }

  async markFailed(jobId: string, userId: string, error: string, rolledBack: boolean, now: Date) {
    await this.finish(jobId, userId, {
      status: rolledBack ? 'rolled_back' : 'failed',
      error: bounded(error),
    }, now);
  }

  private async set(jobId: string, userId: string, fields: Record<string, unknown>) {
    const result = await (await editorialIntentJobsCollection()).updateOne(
      { _id: jobId, userId },
      { $set: fields },
    );
    if (result.matchedCount !== 1) throw new Error(`editorial-intent-job-not-found:${jobId}`);
  }

  private async finish(jobId: string, userId: string, fields: Record<string, unknown>, now: Date) {
    await this.set(jobId, userId, {
      ...fields,
      leaseId: null,
      leaseExpiresAt: null,
      completedAt: now,
      updatedAt: now,
    });
  }
}

async function resolveQueueDependencies(overrides: Partial<QueueDependencies>): Promise<QueueDependencies> {
  const loadProject = overrides.loadProject ?? (async (userId: string, projectId: string) => {
    const { projectService } = await import('@/lib/editron/services/project-service');
    return projectService.loadProject(userId, projectId) as Promise<Record<string, unknown> | null>;
  });
  return {
    store: overrides.store ?? new MongoChatEditorialIntentJobStore(),
    loadProject,
    publish: overrides.publish ?? publishEditorialIntentJob,
    now: overrides.now ?? (() => new Date()),
  };
}

async function resolveRunDependencies(overrides: Partial<RunDependencies>): Promise<RunDependencies> {
  const loadProject = overrides.loadProject ?? (async (userId: string, projectId: string) => {
    const { projectService } = await import('@/lib/editron/services/project-service');
    return projectService.loadProject(userId, projectId) as Promise<Record<string, unknown> | null>;
  });
  let checkpointService = overrides.checkpointService;
  let captureProjectState = overrides.captureProjectState;
  if (!checkpointService || !captureProjectState) {
    const checkpointModule = await import('@/lib/editron/services/checkpoint-service');
    checkpointService ??= checkpointModule.checkpointService;
    captureProjectState ??= checkpointModule.captureRestorableProjectState;
  }
  let dispatchRenderEvidence = overrides.dispatchRenderEvidence;
  if (!dispatchRenderEvidence) {
    dispatchRenderEvidence = (
      await import('@/lib/editron/services/phase0-rendered-evidence-worker')
    ).dispatchPhase0RenderedEvidenceJob;
  }
  let buildRenderVerificationRequest = overrides.buildRenderVerificationRequest;
  if (!buildRenderVerificationRequest) {
    buildRenderVerificationRequest = (
      await import('@/lib/editron/agent/chat-ai-edit-transaction-runtime')
    ).buildChatEditRenderVerificationRequest;
  }
  return {
    store: overrides.store ?? new MongoChatEditorialIntentJobStore(),
    loadProject,
    executeDirector: overrides.executeDirector ?? executeDirectorThroughLivePlanner,
    checkpointService,
    captureProjectState,
    buildRenderVerificationRequest,
    dispatchRenderEvidence,
    now: overrides.now ?? (() => new Date()),
  };
}

async function editorialIntentJobsCollection() {
  const { COLLECTIONS, getDatabase } = await import('@/lib/editron/db/mongodb');
  return (await getDatabase()).collection<ChatEditorialIntentJob>(
    COLLECTIONS.CHAT_EDITORIAL_INTENT_JOBS,
  );
}

async function publishEditorialIntentJob(payload: { jobId: string; projectId: string; userId: string }) {
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw new Error('QSTASH_TOKEN is required for durable editorial-intent execution');
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const client = new Client({ token, baseUrl: process.env.QSTASH_URL || undefined });
  const result = await client.publishJSON({
    url: `${baseUrl}/api/internal/workers/chat-editorial-intent`,
    body: payload,
    retries: CHAT_EDITORIAL_INTENT_MAX_ATTEMPTS - 1,
    headers: { 'Upstash-Timeout': '800s' },
  });
  return { messageId: (result as { messageId?: string }).messageId };
}

async function executeDirectorThroughLivePlanner(
  job: ChatEditorialIntentJob,
): Promise<DirectorExecutionResult> {
  const { executeDirectorPlan } = await import('@/lib/editron/agent/director-agent');
  const brief = buildChatEditorialIntentProjectBrief(job.intent);
  return executeDirectorPlan(job.projectId, job.userId, 'A-01', brief) as Promise<DirectorExecutionResult>;
}

export function buildChatEditorialIntentProjectBrief(
  intent: GroundedEditorialIntent,
): ProjectBrief {
  const editorialPreferences = normalizeEditorialPreferences(intent.editorialPreferences);
  const explicitFamilies = EDITORIAL_FAMILIES.filter(
    (family) => editorialPreferences?.families?.[family] !== undefined,
  );
  if (explicitFamilies.length === 0) {
    return {
      modifiers: [],
      intent: intent.goal,
      editorialPreferences,
    };
  }

  const isolatedFamilies = Object.fromEntries(
    EDITORIAL_FAMILIES.map((family) => [
      family,
      editorialPreferences?.families?.[family] ?? { mode: 'off' as const },
    ]),
  ) as NonNullable<EditorialPreferences['families']>;

  return {
    modifiers: [],
    intent: intent.goal,
    editorialPreferences: {
      ...editorialPreferences,
      families: isolatedFamilies,
    },
    executionScope: {
      version: 'editorial-execution-scope-v1',
      source: 'chat-editorial-intent',
      mode: 'explicit-families-only',
      families: explicitFamilies,
    },
  };
}

function normalizeRequest(raw: ChatEditorialIntentJobRequest): ChatEditorialIntentJobRequest {
  const projectId = cleanString(raw.projectId);
  const userId = cleanString(raw.userId);
  const sessionId = cleanString(raw.sessionId);
  const operationId = cleanString(raw.operationId);
  if (!projectId || !userId || !sessionId || !operationId) {
    throw new Error('projectId, userId, sessionId, and operationId are required');
  }
  if (!raw.intent?.intentId || !raw.intent.goal) throw new Error('grounded editorial intent is required');
  return { projectId, userId, sessionId, operationId, intent: raw.intent };
}

function operationKey(request: ChatEditorialIntentJobRequest) {
  return [
    CHAT_EDITORIAL_INTENT_JOB_VERSION,
    request.userId,
    request.projectId,
    request.sessionId,
    request.operationId,
  ].join(':');
}

function attemptOperationKey(job: ChatEditorialIntentJob) {
  return `${job.operationId}:editorial-intent:attempt:${job.attemptCount}`;
}

function checkpointId(job: ChatEditorialIntentJob, stage: 'before' | 'after') {
  return `${job._id}:${stage}:attempt:${job.attemptCount}`;
}

function sameRequest(left: ChatEditorialIntentJob, right: ChatEditorialIntentJob) {
  return left.idempotencyKey === right.idempotencyKey
    && left.intent.intentId === right.intent.intentId
    && left.intent.goal === right.intent.goal;
}

function terminalQueueResult(job: ChatEditorialIntentJob): QueueChatEditorialIntentJobResult | null {
  if (job.status === 'completed' || job.status === 'completed_unverified') {
    return { status: 'completed', jobId: job._id, messageId: job.dispatchMessageId ?? undefined };
  }
  if (job.status === 'declined') return { status: 'declined', jobId: job._id };
  if (job.status === 'failed' || job.status === 'rolled_back') {
    return { status: 'failed', jobId: job._id, reason: job.error ?? job.status };
  }
  return null;
}

function failedQueueResult(
  request: ChatEditorialIntentJobRequest,
  reason: string,
): QueueChatEditorialIntentJobResult {
  const jobId = `chat_intent_${digest(operationKey(request)).slice(0, 24)}`;
  return { status: 'failed', jobId, reason };
}

function directorResultData(result: DirectorExecutionResult): Record<string, unknown> {
  return {
    overlaysModified: result.overlaysModified,
    decisionAuthority: result.decisionAuthority ?? null,
    warnings: result.warnings,
    actionsSkipped: result.actionsSkipped,
  };
}

function directorFailureReason(result: DirectorExecutionResult) {
  const reasons = [
    ...result.warnings,
    ...result.actionsSkipped.map((item) => item.reason),
  ].map(cleanString).filter(Boolean);
  return reasons.length > 0 ? reasons.join(' | ') : 'unknown-director-failure';
}

function isRetryableFailure(message: string) {
  return /(429|5\d\d|timeout|timed out|temporar|network|fetch failed|socket|ECONN|RESOURCE_EXHAUSTED|rate limit|overloaded)/i
    .test(message);
}

function isDuplicateKeyError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: number }).code === 11000);
}

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function cleanString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function bounded(value: string) {
  return value.slice(0, 2_000);
}
