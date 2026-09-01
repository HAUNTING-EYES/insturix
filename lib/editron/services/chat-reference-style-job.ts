import { createHash, randomUUID } from 'node:crypto';

import { Client } from '@upstash/qstash';

import type { ChatAiEditTransaction } from '@/lib/editron/agent/chat-ai-edit-transaction-runtime';
import { verifyChatToolPostcondition } from '@/lib/editron/agent/chat-edit-postconditions';
import type {
  Checkpoint,
  CheckpointRollbackReceiptV1,
  CheckpointService,
  RestorableProjectState,
} from '@/lib/editron/services/checkpoint-service';
import { normalizeEditorialPreferences } from '@/lib/editron/production-brief/editorial-preferences';
import type { ProjectBrief } from '@/lib/editron/data/edit-profile-types';
import type { Phase0RenderedEvidenceDispatchResult } from '@/lib/editron/services/phase0-rendered-evidence-worker';
import type { ProjectMutationReceiptV1 } from '@/lib/editron/services/project-service';
import type { EditDNA } from '@/lib/editron/services/style-transfer-service';

export const CHAT_REFERENCE_STYLE_JOB_VERSION = 'editron-chat-reference-style-job-v1' as const;
export const CHAT_REFERENCE_STYLE_MAX_ATTEMPTS = 6;

const JOB_LEASE_MS = 15 * 60 * 1000;
const JOB_RETRY_DEADLINE_MS = 45 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 8 * 60 * 1000;
const MIN_TRANSIENT_RETRY_DELAY_MS = 15 * 1000;
const MIN_RATE_LIMIT_RETRY_DELAY_MS = 60 * 1000;
const JOB_RECOVERY_STALE_MS = 15 * 60 * 1000;
const JOB_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RECOVERABLE_STATUSES: ChatReferenceStyleJobStatus[] = [
  'created',
  'dispatching',
  'queued',
  'running',
  'retry_wait',
  'dispatch_failed',
];

export type ChatReferenceStyleJobStatus =
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

export interface ChatReferenceStyleJobRequest {
  projectId: string;
  userId: string;
  sessionId: string;
  operationId: string;
  referenceAssetId: string;
  strength: number;
  sourceName?: string;
}

export interface ChatReferenceStyleJob {
  _id: string;
  version: typeof CHAT_REFERENCE_STYLE_JOB_VERSION;
  idempotencyKey: string;
  status: ChatReferenceStyleJobStatus;
  projectId: string;
  userId: string;
  sessionId: string;
  operationId: string;
  referenceAssetId: string;
  strength: number;
  sourceName?: string;
  profileId?: string;
  attemptCount: number;
  nextAttemptAt?: Date | null;
  retryDeadlineAt?: Date | null;
  leaseId?: string | null;
  leaseExpiresAt?: Date | null;
  dispatchMessageId?: string | null;
  beforeCheckpointId?: string | null;
  afterCheckpointId?: string | null;
  renderOperationId?: string | null;
  renderVerification?: Phase0RenderedEvidenceDispatchResult | null;
  result?: Record<string, unknown> | null;
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date | null;
  expiresAt: Date;
}

export interface QueueChatReferenceStyleJobResult {
  status: 'queued' | 'already-queued' | 'completed' | 'declined' | 'failed';
  jobId: string;
  messageId?: string;
  reason?: string;
}

export interface RunChatReferenceStyleJobResult {
  status: 'completed' | 'completed_unverified' | 'declined' | 'failed' | 'retrying' | 'skipped';
  jobId: string;
  profileId?: string;
  reason?: string;
  retryAt?: string;
  renderVerification?: Phase0RenderedEvidenceDispatchResult;
}

export interface StyleExecutionResult {
  status: 'mutated' | 'declined';
  rawOutput: unknown;
  data: Record<string, unknown>;
  reason?: string;
}

interface ReferenceStyleDirectorResult {
  success: boolean;
  overlaysModified: number;
  warnings?: string[];
  actionsSkipped?: Array<{ action: string; reason: string }>;
  decisionAuthority?: Record<string, unknown>;
}

interface ReferenceStylePlannerDependencies {
  loadProfile(userId: string, profileId: string): Promise<EditDNA | null>;
  executeDirector(
    projectId: string,
    userId: string,
    profileId: string,
    brief: ProjectBrief,
  ): Promise<ReferenceStyleDirectorResult>;
}

interface InvokableStyleTool {
  invoke(input: Record<string, unknown>): Promise<unknown>;
}

export interface ChatReferenceStyleJobStore {
  createOrGet(job: ChatReferenceStyleJob): Promise<{ created: boolean; job: ChatReferenceStyleJob }>;
  find(jobId: string, userId: string): Promise<ChatReferenceStyleJob | null>;
  claimDispatch(jobId: string, userId: string, now: Date): Promise<boolean>;
  markPublished(jobId: string, userId: string, messageId: string | undefined, now: Date): Promise<void>;
  markDispatchFailed(jobId: string, userId: string, error: string, now: Date): Promise<void>;
  claimRun(jobId: string, userId: string, leaseId: string, now: Date): Promise<ChatReferenceStyleJob | null>;
  markProfileExtracted(jobId: string, userId: string, profileId: string, now: Date): Promise<void>;
  markCheckpointStarted(jobId: string, userId: string, checkpointId: string, now: Date): Promise<void>;
  clearInterruptedAttempt(jobId: string, userId: string, now: Date): Promise<void>;
  markDeclined(jobId: string, userId: string, result: Record<string, unknown>, now: Date): Promise<void>;
  markCompleted(input: {
    jobId: string;
    userId: string;
    afterCheckpointId: string;
    renderOperationId: string;
    renderVerification: Phase0RenderedEvidenceDispatchResult;
    result: Record<string, unknown>;
    now: Date;
  }): Promise<void>;
  markRetry(jobId: string, userId: string, error: string, nextAttemptAt: Date, now: Date): Promise<void>;
  markFailed(jobId: string, userId: string, error: string, rolledBack: boolean, now: Date): Promise<void>;
}

interface QueueDependencies {
  store: ChatReferenceStyleJobStore;
  loadProject(userId: string, projectId: string): Promise<Record<string, unknown> | null>;
  loadAsset(assetId: string, userId: string): Promise<{ type?: string; filename?: string } | null>;
  publish(payload: { jobId: string; projectId: string; userId: string }): Promise<{ messageId?: string }>;
  now(): Date;
}

type ProjectMutationReceiptCapture = <T>(
  callback: () => Promise<T> | T,
  onSettled?: (receipts: readonly ProjectMutationReceiptV1[]) => void,
) => Promise<{ value: T; receipts: ProjectMutationReceiptV1[] }>;

interface RunDependencies {
  store: ChatReferenceStyleJobStore;
  loadProject(userId: string, projectId: string): Promise<Record<string, unknown> | null>;
  extractProfile(job: ChatReferenceStyleJob): Promise<string>;
  applyProfile(job: ChatReferenceStyleJob, profileId: string): Promise<StyleExecutionResult>;
  captureMutationReceipts: ProjectMutationReceiptCapture;
  checkpointService: Pick<
    CheckpointService,
    | 'claimChatEditOperation'
    | 'createCheckpoint'
    | 'getCheckpoint'
    | 'getRollbackReceipt'
    | 'recordRollbackExpectedRevision'
    | 'updateChatEditOperationScoped'
    | 'restoreProjectCheckpoint'
  >;
  captureProjectState(project: Record<string, unknown>): RestorableProjectState;
  buildRenderVerificationRequest: typeof import(
    '@/lib/editron/agent/chat-ai-edit-transaction-runtime'
  )['buildChatEditRenderVerificationRequest'];
  dispatchRenderEvidence: typeof import('@/lib/editron/services/phase0-rendered-evidence-worker')['dispatchPhase0RenderedEvidenceJob'];
  now(): Date;
}

export interface ChatReferenceStyleSweepResult {
  scanned: number;
  redispatched: number;
  terminalized: number;
  errors: number;
  details: string[];
}

export interface ChatReferenceStyleSweepDependencies {
  findCandidates(now: Date, limit: number): Promise<ChatReferenceStyleJob[]>;
  markTerminal(job: ChatReferenceStyleJob, reason: string, now: Date): Promise<boolean>;
  dispatch(job: ChatReferenceStyleJob, dedupSalt: string, now: Date): Promise<{ messageId?: string }>;
}

export class ChatReferenceStyleRetryableError extends Error {
  readonly retryAt: Date;

  constructor(message: string, retryAt: Date) {
    super(message);
    this.name = 'ChatReferenceStyleRetryableError';
    this.retryAt = retryAt;
  }
}

export async function queueChatReferenceStyleJob(
  raw: ChatReferenceStyleJobRequest,
  overrides: Partial<QueueDependencies> = {},
): Promise<QueueChatReferenceStyleJobResult> {
  const request = normalizeRequest(raw);
  const deps = await resolveQueueDependencies(overrides);
  const project = await deps.loadProject(request.userId, request.projectId);
  if (!project) return failedQueueResult(request, 'project-not-found-or-not-owned');

  const asset = await deps.loadAsset(request.referenceAssetId, request.userId);
  if (!asset) return failedQueueResult(request, 'reference-asset-not-found-or-not-owned');
  if (asset.type !== 'video') return failedQueueResult(request, `reference-asset-must-be-video:${asset.type ?? 'unknown'}`);

  const now = deps.now();
  const idempotencyKey = operationKey(request);
  const jobId = `chat_style_${digest(idempotencyKey).slice(0, 24)}`;
  const proposed: ChatReferenceStyleJob = {
    _id: jobId,
    version: CHAT_REFERENCE_STYLE_JOB_VERSION,
    idempotencyKey,
    status: 'created',
    ...request,
    sourceName: request.sourceName ?? asset.filename,
    attemptCount: 0,
    nextAttemptAt: now,
    retryDeadlineAt: new Date(now.getTime() + JOB_RETRY_DEADLINE_MS),
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + JOB_TTL_MS),
  };
  const existing = await deps.store.createOrGet(proposed);
  if (!sameRequest(existing.job, proposed)) {
    return { status: 'failed', jobId, reason: 'operation-id-conflicts-with-another-reference-style-request' };
  }
  if (!existing.created) {
    const terminal = terminalQueueResult(existing.job);
    if (terminal) return terminal;
  }

  const claimed = await deps.store.claimDispatch(jobId, request.userId, deps.now());
  if (!claimed) {
    const current = await deps.store.find(jobId, request.userId);
    return current
      ? terminalQueueResult(current) ?? { status: 'already-queued', jobId, messageId: current.dispatchMessageId ?? undefined }
      : { status: 'failed', jobId, reason: 'reference-style-job-disappeared-before-dispatch' };
  }

  try {
    const published = await deps.publish({ jobId, projectId: request.projectId, userId: request.userId });
    await deps.store.markPublished(jobId, request.userId, published.messageId, deps.now());
    return { status: 'queued', jobId, ...(published.messageId ? { messageId: published.messageId } : {}) };
  } catch (error) {
    const message = errorMessage(error);
    await deps.store.markDispatchFailed(jobId, request.userId, message, deps.now());
    return { status: 'failed', jobId, reason: `reference-style-dispatch-failed:${message}` };
  }
}

export async function runChatReferenceStyleJob(
  payload: { jobId: string; projectId: string; userId: string },
  overrides: Partial<RunDependencies> = {},
): Promise<RunChatReferenceStyleJobResult> {
  const deps = await resolveRunDependencies(overrides);
  const now = deps.now();
  const leaseId = randomUUID();
  const job = await deps.store.claimRun(payload.jobId, payload.userId, leaseId, now);
  if (!job) return resolveUnclaimableJob(payload, deps, now);
  if (job.projectId !== payload.projectId) {
    await deps.store.markFailed(job._id, job.userId, 'worker-project-scope-mismatch', false, deps.now());
    return { status: 'failed', jobId: job._id, reason: 'worker-project-scope-mismatch' };
  }

  let checkpoint: Checkpoint | null = null;
  let rollbackReceipt: CheckpointRollbackReceiptV1 | null = null;
  let writerIssuedReceipt: ProjectMutationReceiptV1 | undefined;
  let attemptOperationId = '';
  try {
    if (job.beforeCheckpointId) {
      const interruptedAttempt = Math.max(1, job.attemptCount - 1);
      const interruptedOperationId = attemptOperationKey(job, interruptedAttempt);
      const interruptedCheckpoint = await deps.checkpointService.getCheckpoint(
        job.beforeCheckpointId,
        job.userId,
        job.projectId,
      );
      if (
        !interruptedCheckpoint
        || interruptedCheckpoint.operationId !== interruptedOperationId
        || interruptedCheckpoint.sessionId !== job.sessionId
      ) {
        const failure = 'reference-style-interrupted-attempt-rollback-failed:checkpoint-identity-mismatch';
        await deps.store.markFailed(job._id, job.userId, failure, false, deps.now());
        return { status: 'failed', jobId: job._id, reason: failure };
      }
      rollbackReceipt = await deps.checkpointService.getRollbackReceipt(
        job.beforeCheckpointId,
        job.userId,
        job.projectId,
        referenceStyleRollbackReceiptId(job, interruptedAttempt),
      );
      if (!rollbackReceipt) {
        const failure = 'reference-style-interrupted-attempt-rollback-not-attempted:writer-issued-receipt-missing';
        await deps.checkpointService.updateChatEditOperationScoped(
          job.beforeCheckpointId,
          job.userId,
          job.projectId,
          interruptedOperationId,
          {
            operationStatus: 'failed',
            mutatingToolNames: ['apply_style'],
            operationError: failure,
          },
        );
        await deps.store.markFailed(job._id, job.userId, failure, false, deps.now());
        return { status: 'failed', jobId: job._id, reason: failure };
      }
      const restored = await deps.checkpointService.restoreProjectCheckpoint(job.beforeCheckpointId, job.userId, {
        projectId: job.projectId,
        expectedRevision: rollbackReceipt.expectedRevision,
        actorKind: 'SYSTEM',
      });
      if (!restored?.restored) {
        const failure = `reference-style-interrupted-attempt-rollback-failed:${restored?.reason ?? 'rollback-revision-receipt-missing'}`;
        await deps.store.markFailed(job._id, job.userId, failure, false, deps.now());
        return { status: 'failed', jobId: job._id, reason: failure };
      }
      await deps.checkpointService.updateChatEditOperationScoped(
        job.beforeCheckpointId,
        job.userId,
        job.projectId,
        interruptedOperationId,
        {
          operationStatus: 'rolled-back',
          mutatingToolNames: ['apply_style'],
          operationError: 'Recovered an interrupted durable reference-style attempt before retrying.',
        },
      );
      await deps.store.clearInterruptedAttempt(job._id, job.userId, deps.now());
      job.beforeCheckpointId = null;
    }

    const profileId = job.profileId ?? await deps.extractProfile(job);
    if (!job.profileId) await deps.store.markProfileExtracted(job._id, job.userId, profileId, deps.now());

    const beforeProject = await deps.loadProject(job.userId, job.projectId);
    if (!beforeProject) throw new Error('project-not-found-before-style-application');
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
      description: `Before durable reference-style application ${job.operationId}`,
      type: 'before-llm',
      force: true,
    });
    if (!claim.claimed) throw new Error('reference-style-attempt-checkpoint-already-claimed');
    checkpoint = claim.checkpoint;
    rollbackReceipt = null;
    await deps.store.markCheckpointStarted(job._id, job.userId, beforeCheckpointId, deps.now());

    const capturedApplication = await deps.captureMutationReceipts(
      () => deps.applyProfile(job, profileId),
      (receipts) => {
        writerIssuedReceipt = latestWriterReceiptForProject(receipts, job.projectId);
      },
    );
    const applied = capturedApplication.value;
    if (applied.status === 'declined') {
      const declineReason = applied.reason ?? 'unified-planner-declined';
      await deps.checkpointService.updateChatEditOperationScoped(
        checkpoint.checkpointId,
        job.userId,
        job.projectId,
        attemptOperationId,
        { operationStatus: 'no-op', mutatingToolNames: [] },
      );
      await deps.store.markDeclined(job._id, job.userId, {
        ...applied.data,
        reason: declineReason,
      }, deps.now());
      return { status: 'declined', jobId: job._id, profileId, reason: declineReason };
    }

    if (!writerIssuedReceipt) throw new Error('reference-style-writer-issued-receipt-missing');
    rollbackReceipt = await deps.checkpointService.recordRollbackExpectedRevision(
      checkpoint.checkpointId,
      job.userId,
      job.projectId,
      referenceStyleRollbackReceiptId(job),
      writerIssuedReceipt,
    );

    const afterProject = await deps.loadProject(job.userId, job.projectId);
    if (!afterProject) throw new Error('project-not-found-after-style-application');
    const postcondition = verifyChatToolPostcondition({
      toolName: 'apply_style',
      args: { profileId, strength: job.strength },
      resultData: applied.data,
      beforeProject,
      afterProject,
    });
    if (postcondition.status !== 'pass') {
      throw new Error(`reference-style-postcondition-failed:${postcondition.reason}`);
    }

    const afterCheckpointId = checkpointId(job, 'after');
    const afterCheckpoint = await deps.checkpointService.createCheckpoint({
      checkpointId: afterCheckpointId,
      operationId: attemptOperationId,
      sessionId: job.sessionId,
      projectId: job.projectId,
      userId: job.userId,
      overlays: Array.isArray(afterProject.overlays) ? afterProject.overlays as any[] : [],
      projectState: deps.captureProjectState(afterProject),
      description: `After durable reference-style application ${job.operationId}`,
      type: 'after-llm',
      capturedWriterReceipt: writerIssuedReceipt,
      force: true,
    });
    if (!afterCheckpoint) throw new Error('reference-style-after-checkpoint-not-created');
    await deps.checkpointService.updateChatEditOperationScoped(
      checkpoint.checkpointId,
      job.userId,
      job.projectId,
      attemptOperationId,
      {
        operationStatus: 'completed',
        mutatingToolNames: ['apply_style'],
        afterCheckpointId: afterCheckpoint.checkpointId,
      },
    );

    const transaction: ChatAiEditTransaction = {
      operationId: attemptOperationId,
      sessionId: job.sessionId,
      projectId: job.projectId,
      userId: job.userId,
      beforeCheckpointId: checkpoint.checkpointId,
    };
    const renderRequest = deps.buildRenderVerificationRequest({
      transaction,
      afterCheckpointId: afterCheckpoint.checkpointId,
      subjectReceipt: writerIssuedReceipt,
      project: afterProject,
      successfulCalls: [{
        call: { name: 'apply_style', args: { profileId, strength: job.strength } },
        result: {
          toolName: 'apply_style',
          result: JSON.stringify({
            status: 'success',
            data: { ...applied.data, postconditionVerification: postcondition },
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
      renderOperationId: attemptOperationId,
      renderVerification,
      result: applied.data,
      now: deps.now(),
    });
    return {
      status: renderVerification.dispatched ? 'completed' : 'completed_unverified',
      jobId: job._id,
      profileId,
      renderVerification,
      ...(!renderVerification.dispatched ? { reason: renderVerification.reason ?? 'render-verification-not-dispatched' } : {}),
    };
  } catch (error) {
    const message = errorMessage(error);
    let rolledBack = false;
    if (checkpoint && attemptOperationId) {
      if (!rollbackReceipt && writerIssuedReceipt) {
        rollbackReceipt = await deps.checkpointService.recordRollbackExpectedRevision(
          checkpoint.checkpointId,
          job.userId,
          job.projectId,
          referenceStyleRollbackReceiptId(job),
          writerIssuedReceipt,
        );
      }
      if (!rollbackReceipt) {
        const failure = 'reference-style-rollback-not-attempted:writer-issued-receipt-missing';
        await deps.checkpointService.updateChatEditOperationScoped(
          checkpoint.checkpointId,
          job.userId,
          job.projectId,
          attemptOperationId,
          {
            operationStatus: 'failed',
            mutatingToolNames: ['apply_style'],
            operationError: `${failure}:${message}`,
          },
        );
        await deps.store.markFailed(job._id, job.userId, failure, false, deps.now());
        return { status: 'failed', jobId: job._id, reason: failure };
      }
      const restored = await deps.checkpointService.restoreProjectCheckpoint(checkpoint.checkpointId, job.userId, {
        projectId: job.projectId,
        expectedRevision: rollbackReceipt.expectedRevision,
        actorKind: 'SYSTEM',
      });
      rolledBack = restored?.restored === true;
      await deps.checkpointService.updateChatEditOperationScoped(
        checkpoint.checkpointId,
        job.userId,
        job.projectId,
        attemptOperationId,
        {
          operationStatus: rolledBack ? 'rolled-back' : 'failed',
          mutatingToolNames: ['apply_style'],
          operationError: rolledBack
            ? message
            : `rollback-failed:${restored?.reason ?? 'rollback-revision-receipt-missing'}:${message}`,
        },
      );
      if (!rolledBack) {
        const failure = `reference-style-rollback-failed:${restored?.reason ?? 'rollback-revision-receipt-missing'}:${message}`;
        await deps.store.markFailed(job._id, job.userId, failure, false, deps.now());
        return { status: 'failed', jobId: job._id, reason: failure };
      }
    }

    const retryAt = nextRetryAt(job, message, deps.now());
    if (isRetryableFailure(message) && retryAt) {
      await deps.store.markRetry(job._id, job.userId, message, retryAt, deps.now());
      throw new ChatReferenceStyleRetryableError(message, retryAt);
    }
    await deps.store.markFailed(job._id, job.userId, message, rolledBack, deps.now());
    return { status: 'failed', jobId: job._id, reason: message };
  }
}

export async function sweepChatReferenceStyleJobs(
  input: { now?: Date; limit?: number; dedupSalt?: string } = {},
  overrides: Partial<ChatReferenceStyleSweepDependencies> = {},
): Promise<ChatReferenceStyleSweepResult> {
  const now = input.now ?? new Date();
  const limit = Math.max(1, Math.min(100, Math.round(input.limit ?? 50)));
  const dedupSalt = input.dedupSalt ?? `sweep:${Math.floor(now.getTime() / JOB_RECOVERY_STALE_MS)}`;
  const findCandidates = overrides.findCandidates ?? findReferenceStyleRecoveryCandidates;
  const markTerminal = overrides.markTerminal ?? markReferenceStyleRecoveryTerminal;
  const dispatch = overrides.dispatch ?? redispatchReferenceStyleJob;
  const candidates = await findCandidates(now, limit);
  const result: ChatReferenceStyleSweepResult = {
    scanned: candidates.length,
    redispatched: 0,
    terminalized: 0,
    errors: 0,
    details: [],
  };

  for (const job of candidates) {
    const exhaustedReason = job.attemptCount >= CHAT_REFERENCE_STYLE_MAX_ATTEMPTS
      ? 'reference-style-attempts-exhausted'
      : retryDeadline(job).getTime() <= now.getTime()
        ? 'reference-style-retry-deadline-exhausted'
        : null;
    if (exhaustedReason) {
      try {
        if (await markTerminal(job, exhaustedReason, now)) result.terminalized += 1;
      } catch (error) {
        result.errors += 1;
        result.details.push(`${job._id}:terminalize:${errorMessage(error)}`);
      }
      continue;
    }

    try {
      await dispatch(job, dedupSalt, now);
      result.redispatched += 1;
    } catch (error) {
      result.errors += 1;
      result.details.push(`${job._id}:redispatch:${errorMessage(error)}`);
    }
  }

  return result;
}

class MongoChatReferenceStyleJobStore implements ChatReferenceStyleJobStore {
  async createOrGet(job: ChatReferenceStyleJob) {
    const collection = await referenceStyleJobsCollection();
    try {
      await collection.insertOne(job);
      return { created: true, job };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const existing = await this.find(job._id, job.userId);
      if (!existing) throw new Error('reference-style-idempotency-collision');
      return { created: false, job: existing };
    }
  }

  async find(jobId: string, userId: string) {
    return (await referenceStyleJobsCollection()).findOne({ _id: jobId, userId });
  }

  async claimDispatch(jobId: string, userId: string, now: Date) {
    const result = await (await referenceStyleJobsCollection()).updateOne(
      { _id: jobId, userId, status: { $in: ['created', 'dispatch_failed'] } },
      { $set: { status: 'dispatching', error: null, updatedAt: now } },
    );
    return result.modifiedCount === 1;
  }

  async markPublished(jobId: string, userId: string, messageId: string | undefined, now: Date) {
    const collection = await referenceStyleJobsCollection();
    await collection.updateOne(
      { _id: jobId, userId },
      { $set: { dispatchMessageId: messageId ?? null, updatedAt: now } },
    );
    await collection.updateOne(
      { _id: jobId, userId, status: 'dispatching' },
      { $set: { status: 'queued', updatedAt: now } },
    );
  }

  async markDispatchFailed(jobId: string, userId: string, error: string, now: Date) {
    await this.set(jobId, userId, { status: 'dispatch_failed', error: bounded(error), updatedAt: now });
  }

  async claimRun(jobId: string, userId: string, leaseId: string, now: Date) {
    const claimed = await (await referenceStyleJobsCollection())
      .findOneAndUpdate(
        {
          _id: jobId,
          userId,
          attemptCount: { $lt: CHAT_REFERENCE_STYLE_MAX_ATTEMPTS },
          $and: [
            {
              $or: [
                { retryDeadlineAt: null },
                { retryDeadlineAt: { $gt: now } },
              ],
            },
            {
              $or: [
                { status: { $in: ['created', 'dispatch_failed', 'dispatching', 'queued'] } },
                {
                  status: 'retry_wait',
                  $or: [
                    { nextAttemptAt: null },
                    { nextAttemptAt: { $lte: now } },
                  ],
                },
                { status: 'running', leaseExpiresAt: { $lte: now } },
              ],
            },
          ],
        },
        {
          $set: {
            status: 'running',
            leaseId,
            leaseExpiresAt: new Date(now.getTime() + JOB_LEASE_MS),
            nextAttemptAt: null,
            error: null,
            updatedAt: now,
          },
          $inc: { attemptCount: 1 },
        },
        { returnDocument: 'after' },
      );
    return claimed;
  }

  async markProfileExtracted(jobId: string, userId: string, profileId: string, now: Date) {
    await this.set(jobId, userId, { profileId, updatedAt: now });
  }

  async markCheckpointStarted(jobId: string, userId: string, checkpointId: string, now: Date) {
    await this.set(jobId, userId, { beforeCheckpointId: checkpointId, updatedAt: now });
  }

  async clearInterruptedAttempt(jobId: string, userId: string, now: Date) {
    await this.set(jobId, userId, { beforeCheckpointId: null, updatedAt: now });
  }

  async markDeclined(jobId: string, userId: string, result: Record<string, unknown>, now: Date) {
    await this.finish(jobId, userId, { status: 'declined', result, error: null }, now);
  }

  async markCompleted(input: {
    jobId: string;
    userId: string;
    afterCheckpointId: string;
    renderOperationId: string;
    renderVerification: Phase0RenderedEvidenceDispatchResult;
    result: Record<string, unknown>;
    now: Date;
  }) {
    await this.finish(input.jobId, input.userId, {
      status: input.renderVerification.dispatched ? 'completed' : 'completed_unverified',
      afterCheckpointId: input.afterCheckpointId,
      renderOperationId: input.renderOperationId,
      renderVerification: input.renderVerification,
      result: input.result,
      error: input.renderVerification.dispatched ? null : bounded(input.renderVerification.reason ?? 'render-verification-not-dispatched'),
    }, input.now);
  }

  async markRetry(jobId: string, userId: string, error: string, nextAttemptAt: Date, now: Date) {
    await this.set(jobId, userId, {
      status: 'retry_wait',
      leaseId: null,
      leaseExpiresAt: null,
      beforeCheckpointId: null,
      nextAttemptAt,
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
    const result = await (await referenceStyleJobsCollection())
      .updateOne({ _id: jobId, userId }, { $set: fields });
    if (result.matchedCount !== 1) throw new Error(`reference-style-job-not-found:${jobId}`);
  }

  private async finish(jobId: string, userId: string, fields: Record<string, unknown>, now: Date) {
    await this.set(jobId, userId, {
      ...fields,
      leaseId: null,
      leaseExpiresAt: null,
      nextAttemptAt: null,
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
  const loadAsset = overrides.loadAsset ?? (async (assetId: string, userId: string) => {
    const { assetResolver } = await import('@/lib/editron/services/asset-resolver');
    return assetResolver.getAsset(assetId, userId);
  });
  return {
    store: overrides.store ?? new MongoChatReferenceStyleJobStore(),
    loadProject,
    loadAsset,
    publish: overrides.publish ?? publishReferenceStyleJob,
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
  const captureMutationReceipts = overrides.captureMutationReceipts
    ?? (overrides.applyProfile
      ? captureInjectedStyleApplicationWithoutWriterReceipts
      : await resolveProjectMutationReceiptCapture());
  return {
    store: overrides.store ?? new MongoChatReferenceStyleJobStore(),
    loadProject,
    extractProfile: overrides.extractProfile ?? extractProfileThroughLiveTool,
    applyProfile: overrides.applyProfile ?? applyReferenceStyleProfileThroughUnifiedPlanner,
    captureMutationReceipts,
    checkpointService,
    captureProjectState,
    buildRenderVerificationRequest,
    dispatchRenderEvidence,
    now: overrides.now ?? (() => new Date()),
  };
}

async function resolveProjectMutationReceiptCapture(): Promise<ProjectMutationReceiptCapture> {
  const { projectService } = await import('@/lib/editron/services/project-service');
  return projectService.captureMutationReceipts.bind(projectService);
}

async function captureInjectedStyleApplicationWithoutWriterReceipts<T>(
  callback: () => Promise<T> | T,
): Promise<{ value: T; receipts: ProjectMutationReceiptV1[] }> {
  return { value: await callback(), receipts: [] };
}

async function referenceStyleJobsCollection() {
  const { COLLECTIONS, getDatabase } = await import('@/lib/editron/db/mongodb');
  return (await getDatabase()).collection<ChatReferenceStyleJob>(COLLECTIONS.CHAT_REFERENCE_STYLE_JOBS);
}

async function publishReferenceStyleJob(payload: { jobId: string; projectId: string; userId: string }) {
  return publishReferenceStyleJobPayload(payload, process.env);
}

async function publishReferenceStyleJobPayload(
  payload: { jobId: string; projectId: string; userId: string },
  env: NodeJS.ProcessEnv,
  deduplicationId?: string,
) {
  const token = env.QSTASH_TOKEN;
  if (!token) throw new Error('QSTASH_TOKEN is required for durable reference-style execution');
  const baseUrl = env.VERCEL_URL
    ? `https://${env.VERCEL_URL}`
    : env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const client = new Client({ token, baseUrl: env.QSTASH_URL || undefined });
  const result = await client.publishJSON({
    url: `${baseUrl}/api/internal/workers/chat-reference-style`,
    body: payload,
    retries: CHAT_REFERENCE_STYLE_MAX_ATTEMPTS - 1,
    retryDelay: 'min(480000, max(60000, pow(2, retried) * 60000))',
    ...(deduplicationId ? { deduplicationId } : {}),
    headers: { 'Upstash-Timeout': '600s' },
  });
  return { messageId: (result as { messageId?: string }).messageId };
}

async function findReferenceStyleRecoveryCandidates(now: Date, limit: number): Promise<ChatReferenceStyleJob[]> {
  const staleBefore = new Date(now.getTime() - JOB_RECOVERY_STALE_MS);
  return (await referenceStyleJobsCollection()).find({
    status: { $in: RECOVERABLE_STATUSES },
    $or: [
      {
        status: 'retry_wait',
        $or: [
          { nextAttemptAt: null },
          { nextAttemptAt: { $lte: now } },
        ],
      },
      { status: 'running', leaseExpiresAt: { $lte: now } },
      {
        status: { $in: ['created', 'dispatch_failed', 'dispatching', 'queued'] },
        updatedAt: { $lte: staleBefore },
      },
    ],
  }).sort({ updatedAt: 1 }).limit(limit).toArray();
}

async function markReferenceStyleRecoveryTerminal(
  job: ChatReferenceStyleJob,
  reason: string,
  now: Date,
): Promise<boolean> {
  const result = await (await referenceStyleJobsCollection()).updateOne(
    { _id: job._id, userId: job.userId, status: { $in: RECOVERABLE_STATUSES } },
    {
      $set: {
        status: 'failed',
        error: bounded(reason),
        leaseId: null,
        leaseExpiresAt: null,
        nextAttemptAt: null,
        completedAt: now,
        updatedAt: now,
      },
    },
  );
  return result.modifiedCount === 1;
}

async function redispatchReferenceStyleJob(
  job: ChatReferenceStyleJob,
  dedupSalt: string,
  now: Date,
): Promise<{ messageId?: string }> {
  const payload = { jobId: job._id, projectId: job.projectId, userId: job.userId };
  const deduplicationId = `chat-style-${digest(`${job._id}:${job.attemptCount}:${dedupSalt}`).slice(0, 40)}`;
  const published = await publishReferenceStyleJobPayload(payload, process.env, deduplicationId);
  const collection = await referenceStyleJobsCollection();
  await collection.updateOne(
    { _id: job._id, userId: job.userId, status: { $in: RECOVERABLE_STATUSES } },
    { $set: { dispatchMessageId: published.messageId ?? null, updatedAt: now } },
  );
  await collection.updateOne(
    {
      _id: job._id,
      userId: job.userId,
      status: { $in: ['created', 'dispatch_failed', 'dispatching', 'queued'] },
    },
    { $set: { status: 'queued', updatedAt: now } },
  );
  return published;
}

async function extractProfileThroughLiveTool(job: ChatReferenceStyleJob): Promise<string> {
  const tool = await styleTool(job, 'extract_style');
  const envelope = parseToolOutput(await tool.invoke({
    assetId: job.referenceAssetId,
    ...(job.sourceName ? { sourceName: job.sourceName } : {}),
  }));
  assertToolSuccess(envelope, 'extract_style');
  const profileId = cleanString(envelope.profileId ?? asRecord(envelope.data).profileId);
  if (!profileId) throw new Error('extract_style-did-not-return-profile-id');
  return profileId;
}

export async function applyReferenceStyleProfileThroughUnifiedPlanner(
  job: ChatReferenceStyleJob,
  profileId: string,
  overrides: Partial<ReferenceStylePlannerDependencies> = {},
): Promise<StyleExecutionResult> {
  const loadStyleProfile = overrides.loadProfile ?? (async (userId: string, id: string) => {
    const { loadProfile } = await import('@/lib/editron/services/style-transfer-service');
    return loadProfile(userId, id);
  });
  const executeDirector = overrides.executeDirector ?? (async (
    projectId: string,
    userId: string,
    id: string,
    brief: ProjectBrief,
  ) => {
    const { executeDirectorPlan } = await import('@/lib/editron/agent/director-agent');
    return executeDirectorPlan(projectId, userId, 'A-01', brief) as Promise<ReferenceStyleDirectorResult>;
  });
  const profile = await loadStyleProfile(job.userId, profileId);
  if (!profile) throw new Error(`reference-style-profile-not-found:${profileId}`);

  const brief = buildReferenceStyleProjectBrief(profile, job.strength);
  const director = await executeDirector(job.projectId, job.userId, profileId, brief);
  const reasons = [
    ...(director.warnings ?? []),
    ...(director.actionsSkipped ?? []).map(
      (entry) => `${entry.action}:${entry.reason}`,
    ),
  ];
  const data = {
    profileId: profile.profileId,
    sourceName: profile.sourceName,
    appliedThrough: 'director-unified-planner',
    overlaysModified: director.overlaysModified,
    decisionAuthority: director.decisionAuthority ?? null,
    reasons,
    unappliedDimensions: ['project-wide-color-grade'],
  };
  if (!director.success) {
    throw new Error(`reference-style-director-failed:${reasons[0] ?? 'unknown'}`);
  }
  if (director.overlaysModified <= 0) {
    return {
      status: 'declined',
      rawOutput: data,
      data,
      reason: reasons[0] ?? 'unified-planner-produced-no-material-change',
    };
  }
  return { status: 'mutated', rawOutput: data, data };
}

export function buildReferenceStyleProjectBrief(
  profile: EditDNA,
  strength: number,
): ProjectBrief {
  const transitionMode = profile.transitions.frequency <= 0 ? 'off' : 'prefer';
  const graphicsMode = profile.graphicsDensity === 'heavy' ? 'prefer' : 'auto';
  const captionMode = profile.textStyle.frequency === 'minimal' ? 'auto' : 'prefer';
  const intent = [
    `Match the editorial language measured from reference "${profile.sourceName}" without copying renderer forms blindly.`,
    `Reference influence is ${Math.max(0, Math.min(1, strength)).toFixed(2)} and remains soft context, never execution confidence.`,
    `Pacing is ${profile.pacing.overall}; hook ${profile.pacing.hookSpeed}; body ${profile.pacing.mainSpeed}.`,
    `Measured cut rhythm is ${profile.cutRhythm.avgCutsPerMinute} cuts/min with ${profile.cutRhythm.avgClipDuration}s average clips and a ${profile.cutRhythm.pattern} arc.`,
    `Transition usage is ${profile.transitions.frequency}% with ${profile.transitions.dominant} as an observation, not a forced form.`,
    `Text usage is ${profile.textStyle.frequency}, ${profile.textStyle.fontWeight}, ${profile.textStyle.position}, ${profile.textStyle.animation}; family planners must resolve readable forms from the current video.`,
    `Music language is ${profile.musicStyle.tempo} ${profile.musicStyle.genre} at ${profile.musicStyle.energyLevel} energy.`,
    `Graphics density is ${profile.graphicsDensity}.`,
    `Color observation is ${profile.colorGrade.temperature}, ${profile.colorGrade.saturation}, ${profile.colorGrade.contrast}; preserve skin and product colors.`,
  ].join(' ');
  const editorialPreferences = normalizeEditorialPreferences({
    families: {
      captions: { mode: captionMode },
      motionGraphics: { mode: graphicsMode },
      transitions: { mode: transitionMode },
      music: { mode: 'prefer' },
    },
    pacing: { mode: 'prefer' },
    musicPrompt: `${profile.musicStyle.tempo} tempo ${profile.musicStyle.genre}, ${profile.musicStyle.energyLevel} energy, supporting dialogue`,
    notes: `Reference profile ${profile.profileId}. Reference labels are observations; existing signal-owned family planners retain form authority.`,
  });
  return {
    modifiers: [],
    intent,
    editorialPreferences,
  };
}

async function styleTool(job: ChatReferenceStyleJob, name: 'extract_style') {
  const { createTools } = await import('@/lib/editron/agent/tools');
  const selected = createTools(job.userId, job.projectId).find((candidate) => candidate.name === name);
  if (!selected) throw new Error(`live-style-tool-not-found:${name}`);
  return selected as unknown as InvokableStyleTool;
}

function normalizeRequest(raw: ChatReferenceStyleJobRequest): ChatReferenceStyleJobRequest {
  const request = {
    projectId: requiredIdentifier(raw.projectId, 'projectId'),
    userId: requiredIdentifier(raw.userId, 'userId'),
    sessionId: requiredIdentifier(raw.sessionId, 'sessionId'),
    operationId: requiredIdentifier(raw.operationId, 'operationId'),
    referenceAssetId: requiredIdentifier(raw.referenceAssetId, 'referenceAssetId'),
    strength: Number(raw.strength),
    ...(cleanString(raw.sourceName) ? { sourceName: cleanString(raw.sourceName) } : {}),
  };
  if (!/^[A-Za-z0-9:_-]{8,128}$/.test(request.operationId)) {
    throw new Error('operationId must be 8-128 safe identifier characters');
  }
  if (!Number.isFinite(request.strength) || request.strength < 0 || request.strength > 1) {
    throw new Error('reference style strength must be between 0 and 1');
  }
  return request;
}

function operationKey(request: ChatReferenceStyleJobRequest): string {
  return `${CHAT_REFERENCE_STYLE_JOB_VERSION}:${request.userId}:${request.projectId}:${request.operationId}`;
}

function sameRequest(left: ChatReferenceStyleJob, right: ChatReferenceStyleJob): boolean {
  return left.userId === right.userId
    && left.projectId === right.projectId
    && left.sessionId === right.sessionId
    && left.operationId === right.operationId
    && left.referenceAssetId === right.referenceAssetId
    && left.strength === right.strength;
}

function terminalQueueResult(job: ChatReferenceStyleJob): QueueChatReferenceStyleJobResult | null {
  if (job.status === 'completed' || job.status === 'completed_unverified') {
    return { status: 'completed', jobId: job._id, messageId: job.dispatchMessageId ?? undefined };
  }
  if (job.status === 'declined') {
    return {
      status: 'declined',
      jobId: job._id,
      reason: job.error ?? persistedDeclineReason(job.result) ?? 'reference-style-job-declined',
    };
  }
  if (job.status === 'failed' || job.status === 'rolled_back') {
    return { status: 'failed', jobId: job._id, reason: job.error ?? 'reference-style-job-failed' };
  }
  if (['dispatching', 'queued', 'running', 'retry_wait'].includes(job.status)) {
    return { status: 'already-queued', jobId: job._id, messageId: job.dispatchMessageId ?? undefined };
  }
  return null;
}

function persistedDeclineReason(result: Record<string, unknown> | null | undefined): string | null {
  if (!result) return null;
  const direct = cleanString(result.reason) ?? cleanString(result.message);
  if (direct) return direct;
  const reasons = Array.isArray(result.reasons) ? result.reasons : [];
  return cleanString(reasons[0]) ?? null;
}

function failedQueueResult(request: ChatReferenceStyleJobRequest, reason: string): QueueChatReferenceStyleJobResult {
  return { status: 'failed', jobId: `chat_style_${digest(operationKey(request)).slice(0, 24)}`, reason };
}

function checkpointId(job: ChatReferenceStyleJob, position: 'before' | 'after'): string {
  return `ckpt_chat_style_${position}_${digest(`${job._id}:${job.attemptCount}:${position}`).slice(0, 24)}`;
}

function attemptOperationKey(job: ChatReferenceStyleJob, attemptCount = job.attemptCount): string {
  return `style_${digest(`${job.operationId}:${attemptCount}`).slice(0, 32)}`;
}

function referenceStyleRollbackReceiptId(
  job: ChatReferenceStyleJob,
  attemptCount = job.attemptCount,
): string {
  return `chat-reference-style:${job._id}:attempt:${attemptCount}`;
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

async function resolveUnclaimableJob(
  payload: { jobId: string; projectId: string; userId: string },
  deps: RunDependencies,
  now: Date,
): Promise<RunChatReferenceStyleJobResult> {
  const current = await deps.store.find(payload.jobId, payload.userId);
  if (!current) return { status: 'skipped', jobId: payload.jobId, reason: 'reference-style-job-not-found' };
  if (current.projectId !== payload.projectId) {
    return { status: 'skipped', jobId: payload.jobId, reason: 'worker-project-scope-mismatch' };
  }
  if (isTerminalStatus(current.status)) {
    return { status: 'skipped', jobId: current._id, reason: `job-already-${current.status}` };
  }

  const deadline = retryDeadline(current);
  if (current.attemptCount >= CHAT_REFERENCE_STYLE_MAX_ATTEMPTS || deadline.getTime() <= now.getTime()) {
    const reason = current.attemptCount >= CHAT_REFERENCE_STYLE_MAX_ATTEMPTS
      ? 'reference-style-attempts-exhausted'
      : 'reference-style-retry-deadline-exhausted';
    await deps.store.markFailed(current._id, current.userId, reason, false, now);
    return { status: 'failed', jobId: current._id, reason };
  }

  const retryAt = futureRetryAt(current, now);
  return {
    status: 'retrying',
    jobId: current._id,
    reason: `job-not-claimable:${current.status}`,
    retryAt: retryAt.toISOString(),
  };
}

function nextRetryAt(job: ChatReferenceStyleJob, message: string, now: Date): Date | null {
  if (job.attemptCount >= CHAT_REFERENCE_STYLE_MAX_ATTEMPTS) return null;
  const deadline = retryDeadline(job);
  if (deadline.getTime() <= now.getTime()) return null;
  const rateLimited = /\b429\b|rate.?limit|resource_exhausted/i.test(message);
  const minimum = rateLimited ? MIN_RATE_LIMIT_RETRY_DELAY_MS : MIN_TRANSIENT_RETRY_DELAY_MS;
  const exponent = Math.max(0, job.attemptCount - 1);
  const rawDelay = Math.min(MAX_RETRY_DELAY_MS, minimum * (2 ** exponent));
  const jitterUnit = Number.parseInt(digest(`${job._id}:${job.attemptCount}:retry`).slice(0, 8), 16) / 0xffffffff;
  const delay = Math.min(MAX_RETRY_DELAY_MS, Math.round(rawDelay * (1 + (jitterUnit * 0.15))));
  const retryAt = new Date(now.getTime() + delay);
  return retryAt.getTime() < deadline.getTime() ? retryAt : null;
}

function retryDeadline(job: ChatReferenceStyleJob): Date {
  return job.retryDeadlineAt ?? new Date(job.createdAt.getTime() + JOB_RETRY_DEADLINE_MS);
}

function futureRetryAt(job: ChatReferenceStyleJob, now: Date): Date {
  const candidates = [job.nextAttemptAt, job.leaseExpiresAt]
    .filter((value): value is Date => value instanceof Date && value.getTime() > now.getTime())
    .sort((left, right) => left.getTime() - right.getTime());
  return candidates[0] ?? new Date(now.getTime() + MIN_TRANSIENT_RETRY_DELAY_MS);
}

function isTerminalStatus(status: ChatReferenceStyleJobStatus): boolean {
  return ['completed', 'completed_unverified', 'declined', 'failed', 'rolled_back'].includes(status);
}

function assertToolSuccess(envelope: Record<string, unknown>, toolName: string): void {
  if (envelope.status === 'success' && !envelope.error) return;
  const error = asRecord(envelope.error);
  const message = cleanString(error.message ?? envelope.message ?? envelope.error) ?? `${toolName}-failed`;
  throw new Error(`${toolName}-failed:${message}`);
}

function parseToolOutput(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value !== 'string') throw new Error('style-tool-returned-non-json-output');
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    throw new Error('style-tool-returned-invalid-json');
  }
}

function isRetryableFailure(message: string): boolean {
  return /\b(?:429|500|502|503|504)\b|rate.?limit|resource_exhausted|timeout|timed out|econnreset|temporar|socket hang up/i.test(message);
}

function requiredIdentifier(value: unknown, field: string): string {
  const clean = cleanString(value);
  if (!clean || clean.length > 160) throw new Error(`${field} is required and must be at most 160 characters`);
  return clean;
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim().replace(/[\u0000-\u001F\u007F]/g, ' ');
  return clean || undefined;
}

function errorMessage(error: unknown): string {
  return bounded(error instanceof Error ? error.message : String(error));
}

function bounded(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').slice(0, 800);
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: number }).code === 11000);
}
