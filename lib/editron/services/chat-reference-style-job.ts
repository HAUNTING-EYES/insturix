import { createHash, randomUUID } from 'node:crypto';

import { Client } from '@upstash/qstash';

import type { ChatAiEditTransaction } from '@/lib/editron/agent/chat-ai-edit-transaction-runtime';
import { verifyChatToolPostcondition } from '@/lib/editron/agent/chat-edit-postconditions';
import type {
  Checkpoint,
  CheckpointService,
  RestorableProjectState,
} from '@/lib/editron/services/checkpoint-service';
import type { Phase0RenderedEvidenceDispatchResult } from '@/lib/editron/services/phase0-rendered-evidence-worker';

export const CHAT_REFERENCE_STYLE_JOB_VERSION = 'editron-chat-reference-style-job-v1' as const;
export const CHAT_REFERENCE_STYLE_MAX_ATTEMPTS = 3;

const JOB_LEASE_MS = 12 * 60 * 1000;
const JOB_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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
  renderVerification?: Phase0RenderedEvidenceDispatchResult;
}

interface StyleExecutionResult {
  status: 'mutated' | 'declined';
  rawOutput: unknown;
  data: Record<string, unknown>;
  reason?: string;
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
}

interface QueueDependencies {
  store: ChatReferenceStyleJobStore;
  loadProject(userId: string, projectId: string): Promise<Record<string, unknown> | null>;
  loadAsset(assetId: string, userId: string): Promise<{ type?: string; filename?: string } | null>;
  publish(payload: { jobId: string; projectId: string; userId: string }): Promise<{ messageId?: string }>;
  now(): Date;
}

interface RunDependencies {
  store: ChatReferenceStyleJobStore;
  loadProject(userId: string, projectId: string): Promise<Record<string, unknown> | null>;
  extractProfile(job: ChatReferenceStyleJob): Promise<string>;
  applyProfile(job: ChatReferenceStyleJob, profileId: string): Promise<StyleExecutionResult>;
  checkpointService: Pick<
    CheckpointService,
    'claimChatEditOperation' | 'createCheckpoint' | 'updateChatEditOperation' | 'restoreProjectCheckpoint'
  >;
  captureProjectState(project: Record<string, unknown>): RestorableProjectState;
  buildRenderVerificationRequest: typeof import(
    '@/lib/editron/agent/chat-ai-edit-transaction-runtime'
  )['buildChatEditRenderVerificationRequest'];
  dispatchRenderEvidence: typeof import('@/lib/editron/services/phase0-rendered-evidence-worker')['dispatchPhase0RenderedEvidenceJob'];
  now(): Date;
}

export class ChatReferenceStyleRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatReferenceStyleRetryableError';
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
  if (!job) return { status: 'skipped', jobId: payload.jobId, reason: 'job-not-claimable' };
  if (job.projectId !== payload.projectId) {
    await deps.store.markFailed(job._id, job.userId, 'worker-project-scope-mismatch', false, deps.now());
    return { status: 'failed', jobId: job._id, reason: 'worker-project-scope-mismatch' };
  }

  let checkpoint: Checkpoint | null = null;
  let attemptOperationId = '';
  try {
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
    await deps.store.markCheckpointStarted(job._id, job.userId, beforeCheckpointId, deps.now());

    const applied = await deps.applyProfile(job, profileId);
    if (applied.status === 'declined') {
      await deps.checkpointService.updateChatEditOperation(
        checkpoint.checkpointId,
        job.userId,
        attemptOperationId,
        { operationStatus: 'no-op', mutatingToolNames: [] },
      );
      await deps.store.markDeclined(job._id, job.userId, applied.data, deps.now());
      return { status: 'declined', jobId: job._id, profileId, reason: applied.reason ?? 'unified-planner-declined' };
    }

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
      force: true,
    });
    if (!afterCheckpoint) throw new Error('reference-style-after-checkpoint-not-created');
    await deps.checkpointService.updateChatEditOperation(
      checkpoint.checkpointId,
      job.userId,
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
      const restored = await deps.checkpointService.restoreProjectCheckpoint(checkpoint.checkpointId, job.userId);
      rolledBack = restored.restored;
      await deps.checkpointService.updateChatEditOperation(
        checkpoint.checkpointId,
        job.userId,
        attemptOperationId,
        {
          operationStatus: rolledBack ? 'rolled-back' : 'failed',
          mutatingToolNames: ['apply_style'],
          operationError: rolledBack ? message : `rollback-failed:${restored.reason ?? 'unknown'}:${message}`,
        },
      );
      if (!rolledBack) {
        const failure = `reference-style-rollback-failed:${restored.reason ?? 'unknown'}:${message}`;
        await deps.store.markFailed(job._id, job.userId, failure, false, deps.now());
        return { status: 'failed', jobId: job._id, reason: failure };
      }
    }

    if (isRetryableFailure(message) && job.attemptCount < CHAT_REFERENCE_STYLE_MAX_ATTEMPTS) {
      await deps.store.markRetry(job._id, job.userId, message, deps.now());
      throw new ChatReferenceStyleRetryableError(message);
    }
    await deps.store.markFailed(job._id, job.userId, message, rolledBack, deps.now());
    return { status: 'failed', jobId: job._id, reason: message };
  }
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
    return claimed;
  }

  async markProfileExtracted(jobId: string, userId: string, profileId: string, now: Date) {
    await this.set(jobId, userId, { profileId, updatedAt: now });
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
      error: input.renderVerification.dispatched ? null : bounded(input.renderVerification.reason ?? 'render-verification-not-dispatched'),
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
    const result = await (await referenceStyleJobsCollection())
      .updateOne({ _id: jobId, userId }, { $set: fields });
    if (result.matchedCount !== 1) throw new Error(`reference-style-job-not-found:${jobId}`);
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
  return {
    store: overrides.store ?? new MongoChatReferenceStyleJobStore(),
    loadProject,
    extractProfile: overrides.extractProfile ?? extractProfileThroughLiveTool,
    applyProfile: overrides.applyProfile ?? applyProfileThroughLiveTool,
    checkpointService,
    captureProjectState,
    buildRenderVerificationRequest,
    dispatchRenderEvidence,
    now: overrides.now ?? (() => new Date()),
  };
}

async function referenceStyleJobsCollection() {
  const { COLLECTIONS, getDatabase } = await import('@/lib/editron/db/mongodb');
  return (await getDatabase()).collection<ChatReferenceStyleJob>(COLLECTIONS.CHAT_REFERENCE_STYLE_JOBS);
}

async function publishReferenceStyleJob(payload: { jobId: string; projectId: string; userId: string }) {
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw new Error('QSTASH_TOKEN is required for durable reference-style execution');
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const client = new Client({ token, baseUrl: process.env.QSTASH_URL || undefined });
  const result = await client.publishJSON({
    url: `${baseUrl}/api/internal/workers/chat-reference-style`,
    body: payload,
    retries: CHAT_REFERENCE_STYLE_MAX_ATTEMPTS - 1,
    headers: { 'Upstash-Timeout': '600s' },
  });
  return { messageId: (result as { messageId?: string }).messageId };
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

async function applyProfileThroughLiveTool(job: ChatReferenceStyleJob, profileId: string): Promise<StyleExecutionResult> {
  const tool = await styleTool(job, 'apply_style');
  const rawOutput = await tool.invoke({ profileId, strength: job.strength });
  const envelope = parseToolOutput(rawOutput);
  if (envelope.status === 'advisory') {
    const data = asRecord(envelope.data);
    return {
      status: 'declined',
      rawOutput,
      data,
      reason: cleanString(data.message) ?? 'unified-planner-declined',
    };
  }
  assertToolSuccess(envelope, 'apply_style');
  return { status: 'mutated', rawOutput, data: asRecord(envelope.data) };
}

async function styleTool(job: ChatReferenceStyleJob, name: 'extract_style' | 'apply_style') {
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
  if (job.status === 'declined') return { status: 'declined', jobId: job._id, reason: job.error ?? undefined };
  if (job.status === 'failed' || job.status === 'rolled_back') {
    return { status: 'failed', jobId: job._id, reason: job.error ?? 'reference-style-job-failed' };
  }
  if (['dispatching', 'queued', 'running', 'retry_wait'].includes(job.status)) {
    return { status: 'already-queued', jobId: job._id, messageId: job.dispatchMessageId ?? undefined };
  }
  return null;
}

function failedQueueResult(request: ChatReferenceStyleJobRequest, reason: string): QueueChatReferenceStyleJobResult {
  return { status: 'failed', jobId: `chat_style_${digest(operationKey(request)).slice(0, 24)}`, reason };
}

function checkpointId(job: ChatReferenceStyleJob, position: 'before' | 'after'): string {
  return `ckpt_chat_style_${position}_${digest(`${job._id}:${job.attemptCount}:${position}`).slice(0, 24)}`;
}

function attemptOperationKey(job: ChatReferenceStyleJob): string {
  return `style_${digest(`${job.operationId}:${job.attemptCount}`).slice(0, 32)}`;
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
