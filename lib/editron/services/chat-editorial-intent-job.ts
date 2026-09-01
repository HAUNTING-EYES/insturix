import { createHash, randomUUID } from 'node:crypto';

import { Client } from '@upstash/qstash';

import type { ChatAiEditTransaction } from '@/lib/editron/agent/chat-ai-edit-transaction-runtime';
import {
  verifyChatToolPostcondition,
  type ChatEditPostconditionVerification,
} from '@/lib/editron/agent/chat-edit-postconditions';
import type { GroundedEditorialIntent } from '@/lib/editron/agent/chat-editorial-intent-tools';
import type { ProjectBrief } from '@/lib/editron/data/edit-profile-types';
import { normalizeEditorialPreferences } from '@/lib/editron/production-brief/editorial-preferences';
import type {
  Checkpoint,
  CheckpointRollbackReceiptV1,
  CheckpointService,
  RestorableProjectState,
} from '@/lib/editron/services/checkpoint-service';
import type { Phase0RenderedEvidenceDispatchResult } from '@/lib/editron/services/phase0-rendered-evidence-worker';
import type { ProjectMutationReceiptV1 } from '@/lib/editron/services/project-service';

export const CHAT_EDITORIAL_INTENT_JOB_VERSION = 'editron-chat-editorial-intent-job-v1' as const;
export const CHAT_EDITORIAL_INTENT_MAX_ATTEMPTS = 3;

const JOB_LEASE_MS = 12 * 60 * 1000;
const JOB_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type ChatEditorialIntentJobStatus =
  | 'created'
  | 'dispatching'
  | 'queued'
  | 'running'
  | 'waiting_children'
  | 'reconciling_children'
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
  pendingChildJobIds?: string[];
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
  status: 'completed' | 'completed_unverified' | 'waiting_children' | 'declined' | 'failed' | 'skipped';
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
  pendingAsyncChildJobIds?: string[];
}

export interface ChatEditorialIntentJobStore {
  createOrGet(job: ChatEditorialIntentJob): Promise<{ created: boolean; job: ChatEditorialIntentJob }>;
  find(jobId: string, userId: string): Promise<ChatEditorialIntentJob | null>;
  claimDispatch(jobId: string, userId: string, now: Date): Promise<boolean>;
  markPublished(jobId: string, userId: string, messageId: string | undefined, now: Date): Promise<void>;
  markDispatchFailed(jobId: string, userId: string, error: string, now: Date): Promise<void>;
  claimRun(jobId: string, userId: string, leaseId: string, now: Date): Promise<ChatEditorialIntentJob | null>;
  markWaitingChildren(
    jobId: string,
    userId: string,
    childJobIds: string[],
    result: Record<string, unknown>,
    now: Date,
  ): Promise<void>;
  findWaitingForChild(childJobId: string, projectId: string, userId: string): Promise<ChatEditorialIntentJob[]>;
  claimChildReconciliation(
    jobId: string,
    userId: string,
    leaseId: string,
    now: Date,
  ): Promise<ChatEditorialIntentJob | null>;
  releaseChildReconciliation(
    jobId: string,
    userId: string,
    leaseId: string,
    error: string,
    now: Date,
  ): Promise<void>;
  markDeclined(jobId: string, userId: string, result: Record<string, unknown>, now: Date): Promise<void>;
  markCompleted(input: {
    jobId: string;
    userId: string;
    afterCheckpointId?: string;
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

interface CompletionDependencies {
  store: ChatEditorialIntentJobStore;
  loadProject(userId: string, projectId: string): Promise<Record<string, unknown> | null>;
  checkpointService: Pick<
    CheckpointService,
    | 'claimChatEditOperation'
    | 'createCheckpoint'
    | 'getCheckpoint'
    | 'recordRollbackExpectedRevision'
    | 'updateChatEditOperationScoped'
    | 'restoreProjectCheckpoint'
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

interface MgRenderChildJobSnapshot {
  _id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  result?: Record<string, unknown> | null;
  lastError?: string | null;
  /** Which durable-job collection the child lives in (design runs first, then queues render). */
  kind?: 'design' | 'render';
}

type ProjectMutationReceiptCapture = <T>(
  callback: () => Promise<T> | T,
  onSettled?: (receipts: readonly ProjectMutationReceiptV1[]) => void,
) => Promise<{ value: T; receipts: ProjectMutationReceiptV1[] }>;

interface RunDependencies extends CompletionDependencies {
  executeDirector(job: ChatEditorialIntentJob): Promise<DirectorExecutionResult>;
  captureMutationReceipts: ProjectMutationReceiptCapture;
  loadChildJobs(jobIds: string[], projectId: string, userId: string): Promise<MgRenderChildJobSnapshot[]>;
}

interface ReconcileDependencies extends CompletionDependencies {
  loadChildJobs(jobIds: string[], projectId: string, userId: string): Promise<MgRenderChildJobSnapshot[]>;
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
  let rollbackReceipt: CheckpointRollbackReceiptV1 | null = null;
  let writerIssuedReceipt: ProjectMutationReceiptV1 | undefined;
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

    const capturedDirector = await deps.captureMutationReceipts(
      () => deps.executeDirector(job),
      (receipts) => {
        writerIssuedReceipt = latestWriterReceiptForProject(receipts, job.projectId);
      },
    );
    const director = capturedDirector.value;
    if (!director.success) {
      throw new Error(`director-failed:${directorFailureReason(director)}`);
    }
    if (director.overlaysModified > 0 && !writerIssuedReceipt) {
      throw new Error('A mutating editorial intent completed without a writer-issued mutation receipt.');
    }
    if (writerIssuedReceipt) {
      rollbackReceipt = await deps.checkpointService.recordRollbackExpectedRevision(
        checkpoint.checkpointId,
        job.userId,
        job.projectId,
        editorialIntentRollbackReceiptId(job),
        writerIssuedReceipt,
      );
    }

    const afterProject = await deps.loadProject(job.userId, job.projectId);
    if (!afterProject) throw new Error('project-not-found-after-editorial-intent');
    const resultData = directorResultData(director);
    const directorChildJobIds = (director.pendingAsyncChildJobIds ?? [])
      .filter((jobId): jobId is string => (
        typeof jobId === 'string' && /^mgd_[a-f0-9]{32}$/.test(jobId)
      ));
    const pendingChildJobIds = [
      ...new Set([...directorChildJobIds, ...pendingMgRenderJobIds(afterProject)]),
    ].sort().slice(0, 100);
    if (pendingChildJobIds.length > 0) {
      await deps.store.markWaitingChildren(
        job._id,
        job.userId,
        pendingChildJobIds,
        {
          ...resultData,
          pendingChildJobIds,
          lifecycle: 'waiting-for-async-mg-render',
        },
        deps.now(),
      );
      const waitingJob = await deps.store.find(job._id, job.userId);
      if (!waitingJob) throw new Error('editorial-intent-job-missing-after-child-wait');
      return reconcileWaitingParent(waitingJob, deps);
    }
    const postcondition = verifyChatToolPostcondition({
      toolName: 'apply_editorial_intent',
      args: { intentId: job.intent.intentId, goal: job.intent.goal },
      resultData,
      beforeProject,
      afterProject,
    });

    if (postcondition.status !== 'pass') {
      if (director.overlaysModified === 0) {
        await deps.checkpointService.updateChatEditOperationScoped(
          checkpoint.checkpointId,
          job.userId,
          job.projectId,
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

    return completeEditorialIntentMutation({
      job,
      beforeCheckpointId: checkpoint.checkpointId,
      afterProject,
      resultData,
      postcondition,
      writerIssuedReceipt,
      deps,
    });
  } catch (error) {
    const message = errorMessage(error);
    let rolledBack = false;
    if (checkpoint && attemptOperationId) {
      if (!writerIssuedReceipt) {
        const failure = `Rollback was not attempted because no writer-issued mutation receipt was captured: ${message}`;
        await deps.checkpointService.updateChatEditOperationScoped(
          checkpoint.checkpointId,
          job.userId,
          job.projectId,
          attemptOperationId,
          {
            operationStatus: 'failed',
            mutatingToolNames: ['apply_editorial_intent'],
            operationError: failure,
          },
        );
        await deps.store.markFailed(job._id, job.userId, failure, false, deps.now());
        return { status: 'failed', jobId: job._id, reason: failure };
      }
      const receipt = rollbackReceipt ?? await deps.checkpointService.recordRollbackExpectedRevision(
          checkpoint.checkpointId,
          job.userId,
          job.projectId,
          editorialIntentRollbackReceiptId(job),
          writerIssuedReceipt,
        );
      rollbackReceipt = receipt;
      const restored = await deps.checkpointService.restoreProjectCheckpoint(
        checkpoint.checkpointId,
        job.userId,
        { projectId: job.projectId, expectedRevision: receipt.expectedRevision },
      );
      rolledBack = restored?.restored === true;
      await deps.checkpointService.updateChatEditOperationScoped(
        checkpoint.checkpointId,
        job.userId,
        job.projectId,
        attemptOperationId,
        {
          operationStatus: rolledBack ? 'rolled-back' : 'failed',
          mutatingToolNames: ['apply_editorial_intent'],
          operationError: rolledBack
            ? message
            : `rollback-failed:${restored?.reason ?? 'revision-receipt-missing'}:${message}`,
        },
      );
      if (!rolledBack) {
        const failure = `editorial-intent-rollback-failed:${restored?.reason ?? 'revision-receipt-missing'}:${message}`;
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

export async function reconcileChatEditorialIntentMgChild(
  payload: { jobId: string; projectId: string; userId: string },
  overrides: Partial<ReconcileDependencies> = {},
): Promise<{ reconciled: number; waiting: number }> {
  const deps = await resolveReconcileDependencies(overrides);
  const parents = await deps.store.findWaitingForChild(
    payload.jobId,
    payload.projectId,
    payload.userId,
  );
  let reconciled = 0;
  let waiting = 0;
  for (const parent of parents) {
    const result = await reconcileWaitingParent(parent, deps);
    if (result.status === 'waiting_children' || result.status === 'skipped') waiting += 1;
    else reconciled += 1;
  }
  return { reconciled, waiting };
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

  async markWaitingChildren(
    jobId: string,
    userId: string,
    childJobIds: string[],
    result: Record<string, unknown>,
    now: Date,
  ) {
    if (childJobIds.length === 0) {
      throw new Error('editorial-intent-waiting-children-requires-child-job');
    }
    await this.set(jobId, userId, {
      status: 'waiting_children',
      pendingChildJobIds: childJobIds,
      result,
      leaseId: null,
      leaseExpiresAt: null,
      error: null,
      updatedAt: now,
    });
  }

  async findWaitingForChild(childJobId: string, projectId: string, userId: string) {
    return (await editorialIntentJobsCollection()).find({
      projectId,
      userId,
      status: { $in: ['waiting_children', 'reconciling_children'] },
      pendingChildJobIds: childJobId,
    }).toArray();
  }

  async claimChildReconciliation(jobId: string, userId: string, leaseId: string, now: Date) {
    return (await editorialIntentJobsCollection()).findOneAndUpdate(
      {
        _id: jobId,
        userId,
        $or: [
          { status: 'waiting_children' },
          { status: 'reconciling_children', leaseExpiresAt: { $lte: now } },
        ],
      },
      {
        $set: {
          status: 'reconciling_children',
          leaseId,
          leaseExpiresAt: new Date(now.getTime() + JOB_LEASE_MS),
          error: null,
          updatedAt: now,
        },
      },
      { returnDocument: 'after' },
    );
  }

  async releaseChildReconciliation(
    jobId: string,
    userId: string,
    leaseId: string,
    error: string,
    now: Date,
  ) {
    const result = await (await editorialIntentJobsCollection()).updateOne(
      { _id: jobId, userId, status: 'reconciling_children', leaseId },
      {
        $set: {
          status: 'waiting_children',
          leaseId: null,
          leaseExpiresAt: null,
          error: bounded(error),
          updatedAt: now,
        },
      },
    );
    if (result.matchedCount !== 1) {
      throw new Error(`editorial-intent-child-reconciliation-lease-lost:${jobId}`);
    }
  }

  async markDeclined(jobId: string, userId: string, result: Record<string, unknown>, now: Date) {
    await this.finish(jobId, userId, { status: 'declined', result, error: null }, now);
  }

  async markCompleted(input: {
    jobId: string;
    userId: string;
    afterCheckpointId?: string;
    renderVerification: Phase0RenderedEvidenceDispatchResult;
    result: Record<string, unknown>;
    now: Date;
  }) {
    await this.finish(input.jobId, input.userId, {
      status: input.renderVerification.dispatched ? 'completed' : 'completed_unverified',
      ...(input.afterCheckpointId ? { afterCheckpointId: input.afterCheckpointId } : {}),
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

async function resolveCompletionDependencies(
  overrides: Partial<CompletionDependencies>,
): Promise<CompletionDependencies> {
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
    checkpointService,
    captureProjectState,
    buildRenderVerificationRequest,
    dispatchRenderEvidence,
    now: overrides.now ?? (() => new Date()),
  };
}

async function resolveRunDependencies(overrides: Partial<RunDependencies>): Promise<RunDependencies> {
  const captureMutationReceipts = overrides.captureMutationReceipts
    ?? (overrides.executeDirector
      ? captureInjectedDirectorWithoutWriterReceipts
      : await resolveProjectMutationReceiptCapture());
  return {
    ...await resolveCompletionDependencies(overrides),
    executeDirector: overrides.executeDirector ?? executeDirectorThroughLivePlanner,
    captureMutationReceipts,
    loadChildJobs: overrides.loadChildJobs ?? loadMgRenderChildJobs,
  };
}

async function resolveProjectMutationReceiptCapture(): Promise<ProjectMutationReceiptCapture> {
  const { projectService } = await import('@/lib/editron/services/project-service');
  return projectService.captureMutationReceipts.bind(projectService);
}

async function captureInjectedDirectorWithoutWriterReceipts<T>(
  callback: () => Promise<T> | T,
): Promise<{ value: T; receipts: ProjectMutationReceiptV1[] }> {
  return { value: await callback(), receipts: [] };
}

async function resolveReconcileDependencies(
  overrides: Partial<ReconcileDependencies>,
): Promise<ReconcileDependencies> {
  return {
    ...await resolveCompletionDependencies(overrides),
    loadChildJobs: overrides.loadChildJobs ?? loadMgRenderChildJobs,
  };
}

async function editorialIntentJobsCollection() {
  const { COLLECTIONS, getDatabase } = await import('@/lib/editron/db/mongodb');
  return (await getDatabase()).collection<ChatEditorialIntentJob>(
    COLLECTIONS.CHAT_EDITORIAL_INTENT_JOBS,
  );
}

async function loadMgRenderChildJobs(
  jobIds: string[],
  projectId: string,
  userId: string,
): Promise<MgRenderChildJobSnapshot[]> {
  if (jobIds.length === 0) return [];
  const { COLLECTIONS, getDatabase } = await import('@/lib/editron/db/mongodb');
  const db = await getDatabase();
  const projection = { _id: 1, status: 1, result: 1, lastError: 1 } as const;
  const [renderJobs, designJobs] = await Promise.all([
    db.collection<MgRenderChildJobSnapshot>(
      COLLECTIONS.MG_RENDER_JOBS,
    ).find(
      { _id: { $in: jobIds }, projectId, userId },
      { projection },
    ).toArray(),
    // The deferred MG design job is an explicit Director-reported child and
    // retains its authoritative lifecycle in the dedicated durable collection.
    db.collection<MgRenderChildJobSnapshot>(
      COLLECTIONS.MG_DESIGN_JOBS,
    ).find(
      { _id: { $in: jobIds }, projectId, userId } as never,
      { projection },
    ).toArray(),
  ]);
  return [
    ...renderJobs.map((job) => ({ ...job, kind: 'render' as const })),
    ...designJobs.map((job) => ({ ...job, kind: 'design' as const })),
  ];
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
  return {
    modifiers: [],
    intent: intent.goal,
    editorialPreferences,
    ...(intent.executionScope ? { executionScope: intent.executionScope } : {}),
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

function editorialIntentRollbackReceiptId(job: ChatEditorialIntentJob) {
  return `chat-editorial-intent:${job._id}:attempt:${job.attemptCount}`;
}

function latestWriterReceiptForProject(
  receipts: readonly ProjectMutationReceiptV1[],
  projectId: string,
): ProjectMutationReceiptV1 | undefined {
  for (let index = receipts.length - 1; index >= 0; index -= 1) {
    const receipt = receipts[index];
    if (receipt?.projectId === projectId) return receipt;
  }
  return undefined;
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

function pendingMgRenderJobIds(project: Record<string, unknown>): string[] {
  const intelligence = objectRecord(project.intelligence);
  const mgCodegenRun = objectRecord(intelligence?.mgCodegenRun);
  const outcomes = Array.isArray(mgCodegenRun?.outcomes) ? mgCodegenRun.outcomes : [];
  const jobIds = outcomes.flatMap((outcome) => {
    const entry = objectRecord(outcome);
    const jobId = cleanString(entry?.jobId);
    return entry?.status === 'queued' && jobId ? [jobId] : [];
  });
  return [...new Set(jobIds)].sort();
}

async function reconcileWaitingParent(
  parent: ChatEditorialIntentJob,
  deps: ReconcileDependencies,
): Promise<RunChatEditorialIntentJobResult> {
  const pendingIds = [...new Set(parent.pendingChildJobIds ?? [])].sort();
  if (pendingIds.length === 0) {
    throw new Error(`editorial-intent-parent-${parent._id}-has-no-pending-children`);
  }
  const children = await deps.loadChildJobs(pendingIds, parent.projectId, parent.userId);
  const byId = new Map(children.map((child) => [child._id, child]));
  // A completed MG DESIGN child is not the end of the chain: it queues follow-on RENDER jobs
  // (intelligence.mgCodegenRun.outcomes[status=queued]) that the parent must keep waiting for. Discover and
  // adopt them here, otherwise the parent would decline while the render it asked for is still in flight.
  const designChildCompleted = children.some((child) => child.kind === 'design' && child.status === 'completed');
  if (designChildCompleted) {
    const project = await deps.loadProject(parent.userId, parent.projectId);
    const followOnRenderIds = project
      ? pendingMgRenderJobIds(project).filter((jobId) => !pendingIds.includes(jobId) && !jobId.startsWith('mgd_'))
      : [];
    if (followOnRenderIds.length > 0) {
      const extended = [...new Set([...pendingIds, ...followOnRenderIds])].sort();
      await deps.store.markWaitingChildren(
        parent._id,
        parent.userId,
        extended,
        {
          ...(objectRecord(parent.result) ?? {}),
          pendingChildJobIds: extended,
          lifecycle: 'waiting-for-async-mg-render',
        },
        deps.now(),
      );
      return {
        status: 'waiting_children',
        jobId: parent._id,
        reason: `waiting-for-async-mg-render:design-complete-follow-on:${followOnRenderIds.length}`,
      };
    }
  }
  const unresolved = pendingIds.filter((jobId) => {
    const child = byId.get(jobId);
    return !child || child.status === 'queued' || child.status === 'running';
  });
  if (unresolved.length > 0) {
    return {
      status: 'waiting_children',
      jobId: parent._id,
      reason: `waiting-for-async-mg-render:${unresolved.length}`,
    };
  }

  const leaseId = randomUUID();
  const claimed = await deps.store.claimChildReconciliation(
    parent._id,
    parent.userId,
    leaseId,
    deps.now(),
  );
  if (!claimed) {
    const current = await deps.store.find(parent._id, parent.userId);
    if (!current || isTerminalEditorialIntentStatus(current.status)) {
      return { status: 'skipped', jobId: parent._id, reason: 'parent-already-reconciled' };
    }
    throw new Error(`editorial-intent-child-reconciliation-busy:${parent._id}`);
  }

  try {
    const beforeCheckpointId = cleanString(claimed.beforeCheckpointId);
    if (!beforeCheckpointId) throw new Error('editorial-intent-parent-missing-before-checkpoint');
    const beforeCheckpoint = await deps.checkpointService.getCheckpoint(
      beforeCheckpointId,
      claimed.userId,
      claimed.projectId,
    );
    if (!beforeCheckpoint) throw new Error('editorial-intent-before-checkpoint-not-found');
    const afterProject = await deps.loadProject(claimed.userId, claimed.projectId);
    if (!afterProject) throw new Error('project-not-found-after-mg-child-render');

    const childOutcomes = pendingIds.map((jobId) => childAudit(byId.get(jobId)!));
    const generatedChildIds = children
      .filter((child) => child.status === 'completed' && objectRecord(child.result)?.status === 'generated')
      .map((child) => child._id)
      .sort();
    const missingGeneratedOverlays = generatedChildIds.filter(
      (jobId) => !projectHasMgRenderOverlay(afterProject, jobId),
    );
    const resultData = {
      ...(objectRecord(claimed.result) ?? {}),
      overlaysModified: Math.max(
        Number(objectRecord(claimed.result)?.overlaysModified) || 0,
        generatedChildIds.length,
      ),
      pendingChildJobIds: pendingIds,
      childOutcomes,
      generatedChildJobIds: generatedChildIds,
      lifecycle: 'async-mg-render-reconciled',
    };
    const attemptOperationId = attemptOperationKey(claimed);
    if (missingGeneratedOverlays.length > 0) {
      const reason = `generated-mg-child-missing-canonical-overlay:${missingGeneratedOverlays.join(',')}`;
      await deps.checkpointService.updateChatEditOperationScoped(
        beforeCheckpointId,
        claimed.userId,
        claimed.projectId,
        attemptOperationId,
        {
          operationStatus: 'failed',
          mutatingToolNames: ['apply_editorial_intent'],
          operationError: reason,
        },
      );
      await deps.store.markFailed(claimed._id, claimed.userId, reason, false, deps.now());
      return { status: 'failed', jobId: claimed._id, reason };
    }

    const postcondition = verifyChatToolPostcondition({
      toolName: 'apply_editorial_intent',
      args: { intentId: claimed.intent.intentId, goal: claimed.intent.goal },
      resultData,
      beforeProject: projectFromCheckpoint(beforeCheckpoint),
      afterProject,
    });
    if (postcondition.status !== 'pass') {
      await deps.checkpointService.updateChatEditOperationScoped(
        beforeCheckpointId,
        claimed.userId,
        claimed.projectId,
        attemptOperationId,
        { operationStatus: 'no-op', mutatingToolNames: [] },
      );
      await deps.store.markDeclined(claimed._id, claimed.userId, {
        ...resultData,
        postconditionVerification: postcondition,
      }, deps.now());
      return {
        status: 'declined',
        jobId: claimed._id,
        reason: 'all-async-mg-children-produced-no-material-change',
      };
    }

    return completeEditorialIntentMutation({
      job: claimed,
      beforeCheckpointId,
      afterProject,
      resultData,
      postcondition,
      deps,
    });
  } catch (error) {
    await deps.store.releaseChildReconciliation(
      claimed._id,
      claimed.userId,
      leaseId,
      errorMessage(error),
      deps.now(),
    );
    throw error;
  }
}

async function completeEditorialIntentMutation(input: {
  job: ChatEditorialIntentJob;
  beforeCheckpointId: string;
  afterProject: Record<string, unknown>;
  resultData: Record<string, unknown>;
  postcondition: ChatEditPostconditionVerification;
  writerIssuedReceipt?: ProjectMutationReceiptV1;
  deps: CompletionDependencies;
}): Promise<RunChatEditorialIntentJobResult> {
  const {
    job,
    beforeCheckpointId,
    afterProject,
    resultData,
    postcondition,
    writerIssuedReceipt,
    deps,
  } = input;
  const attemptOperationId = attemptOperationKey(job);
  const completionResult = { ...resultData, postconditionVerification: postcondition };
  if (!writerIssuedReceipt) {
    const reason = 'editorial-intent-mg-child-writer-receipt-missing';
    const renderVerification: Phase0RenderedEvidenceDispatchResult = {
      dispatched: false,
      reason,
    };
    await deps.checkpointService.updateChatEditOperationScoped(
      beforeCheckpointId,
      job.userId,
      job.projectId,
      attemptOperationId,
      {
        operationStatus: 'completed',
        mutatingToolNames: ['apply_editorial_intent'],
        operationError: reason,
      },
    );
    await deps.store.markCompleted({
      jobId: job._id,
      userId: job.userId,
      renderVerification,
      result: completionResult,
      now: deps.now(),
    });
    return {
      status: 'completed_unverified',
      jobId: job._id,
      renderVerification,
      reason,
    };
  }
  const expectedAfterCheckpointId = checkpointId(job, 'after');
  let afterCheckpoint = await deps.checkpointService.getCheckpoint(
    expectedAfterCheckpointId,
    job.userId,
    job.projectId,
  );
  if (afterCheckpoint && (
    afterCheckpoint.operationId !== attemptOperationId
    || afterCheckpoint.projectId !== job.projectId
    || afterCheckpoint.sessionId !== job.sessionId
  )) {
    throw new Error('editorial-intent-after-checkpoint-identity-mismatch');
  }
  afterCheckpoint ??= await deps.checkpointService.createCheckpoint({
    checkpointId: expectedAfterCheckpointId,
    operationId: attemptOperationId,
    sessionId: job.sessionId,
    projectId: job.projectId,
    userId: job.userId,
    overlays: Array.isArray(afterProject.overlays) ? afterProject.overlays as any[] : [],
    projectState: deps.captureProjectState(afterProject),
    description: `After durable editorial intent ${job.operationId}`,
    type: 'after-llm',
    capturedWriterReceipt: writerIssuedReceipt,
    force: true,
  });
  if (!afterCheckpoint) throw new Error('editorial-intent-after-checkpoint-not-created');
  await deps.checkpointService.updateChatEditOperationScoped(
    beforeCheckpointId,
    job.userId,
    job.projectId,
    attemptOperationId,
    {
      operationStatus: 'completed',
      mutatingToolNames: ['apply_editorial_intent'],
      afterCheckpointId: afterCheckpoint.checkpointId,
    },
  );

  const transaction: ChatAiEditTransaction = {
    operationId: attemptOperationId,
    sessionId: job.sessionId,
    projectId: job.projectId,
    userId: job.userId,
    beforeCheckpointId,
  };
  const renderRequest = deps.buildRenderVerificationRequest({
    transaction,
    afterCheckpointId: afterCheckpoint.checkpointId,
    subjectReceipt: writerIssuedReceipt,
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
    result: completionResult,
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
}

function projectFromCheckpoint(checkpoint: Checkpoint): Record<string, unknown> {
  if (!checkpoint.projectState) return { overlays: checkpoint.overlays ?? [] };
  return Object.fromEntries(
    checkpoint.projectState.presentFields.map((field) => [
      field,
      checkpoint.projectState?.fields[field],
    ]),
  );
}

function childAudit(child: MgRenderChildJobSnapshot): Record<string, unknown> {
  const result = objectRecord(child.result);
  const receipt = objectRecord(result?.receipt);
  return {
    jobId: child._id,
    jobStatus: child.status,
    outcome: result?.status ?? (child.status === 'failed' ? 'failed' : 'unknown'),
    ...(cleanString(result?.reason) ? { reason: cleanString(result?.reason) } : {}),
    ...(cleanString(child.lastError) ? { error: cleanString(child.lastError) } : {}),
    ...(receipt ? { receipt: childReceiptAudit(receipt) } : {}),
  };
}

function childReceiptAudit(receipt: Record<string, unknown>): Record<string, unknown> {
  const promptHash = cleanString(receipt.promptHash)?.slice(0, 128);
  const attempts = typeof receipt.attempts === 'number'
    && Number.isInteger(receipt.attempts)
    && receipt.attempts >= 0
    ? receipt.attempts
    : undefined;
  const compiled = typeof receipt.compiled === 'boolean' ? receipt.compiled : undefined;
  const scans = Array.isArray(receipt.scans)
    ? receipt.scans.slice(0, 32).flatMap((value) => {
      const scan = objectRecord(value);
      if (!scan || typeof scan.passed !== 'boolean') return [];
      const reason = cleanString(scan.reason);
      return [{
        passed: scan.passed,
        ...(reason ? { reason: bounded(reason) } : {}),
      }];
    })
    : [];
  const judgeScore = typeof receipt.judgeScore === 'number' && Number.isFinite(receipt.judgeScore)
    ? receipt.judgeScore
    : undefined;
  const judgeIssues = Array.isArray(receipt.judgeIssues)
    ? receipt.judgeIssues.flatMap((value) => {
      const issue = cleanString(value);
      return issue ? [bounded(issue)] : [];
    }).slice(0, 100)
    : [];
  return {
    ...(promptHash ? { promptHash } : {}),
    ...(attempts != null ? { attempts } : {}),
    ...(compiled != null ? { compiled } : {}),
    ...(scans.length > 0 ? { scans } : {}),
    ...(judgeScore != null ? { judgeScore } : {}),
    ...(judgeIssues.length > 0 ? { judgeIssues } : {}),
  };
}

function projectHasMgRenderOverlay(project: Record<string, unknown>, jobId: string): boolean {
  const overlays = Array.isArray(project.overlays) ? project.overlays : [];
  return overlays.some((overlay) => objectRecord(objectRecord(overlay)?.metadata)?.mgRenderJobId === jobId);
}

function isTerminalEditorialIntentStatus(status: ChatEditorialIntentJobStatus): boolean {
  return ['completed', 'completed_unverified', 'declined', 'failed', 'rolled_back'].includes(status);
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
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
