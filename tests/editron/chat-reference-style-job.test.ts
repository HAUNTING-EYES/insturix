import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CHAT_REFERENCE_STYLE_JOB_VERSION,
  ChatReferenceStyleRetryableError,
  queueChatReferenceStyleJob,
  runChatReferenceStyleJob,
  type ChatReferenceStyleJob,
  type ChatReferenceStyleJobStore,
} from '@/lib/editron/services/chat-reference-style-job';
import type { Checkpoint, RestorableProjectState } from '@/lib/editron/services/checkpoint-service';

const NOW = new Date('2026-07-18T10:00:00.000Z');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('durable chat reference-style jobs', () => {
  it('queues one exact owned video idempotently and never republishes a duplicate operation', async () => {
    const store = new MemoryStore();
    const publish = vi.fn(async () => ({ messageId: 'qstash-1' }));
    const input = request();
    const dependencies = {
      store,
      loadProject: vi.fn(async () => project('before')),
      loadAsset: vi.fn(async () => ({ type: 'video', filename: 'reference.mp4' })),
      publish,
      now: () => NOW,
    };

    const first = await queueChatReferenceStyleJob(input, dependencies);
    const duplicate = await queueChatReferenceStyleJob(input, dependencies);

    expect(first).toMatchObject({ status: 'queued', messageId: 'qstash-1' });
    expect(duplicate).toMatchObject({ status: 'already-queued', jobId: first.jobId, messageId: 'qstash-1' });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith({ jobId: first.jobId, projectId: 'project-1', userId: 'user-1' });
    expect(store.jobs.get(first.jobId!)).toMatchObject({
      referenceAssetId: 'asset-reference',
      sourceName: 'reference.mp4',
      status: 'queued',
    });
  });

  it('fails before dispatch for missing ownership, non-video assets, and operation collisions', async () => {
    const publish = vi.fn(async () => ({ messageId: 'never' }));
    const missing = await queueChatReferenceStyleJob(request(), {
      store: new MemoryStore(),
      loadProject: async () => project('before'),
      loadAsset: async () => null,
      publish,
      now: () => NOW,
    });
    const wrongType = await queueChatReferenceStyleJob(request(), {
      store: new MemoryStore(),
      loadProject: async () => project('before'),
      loadAsset: async () => ({ type: 'image' }),
      publish,
      now: () => NOW,
    });
    const store = new MemoryStore();
    await queueChatReferenceStyleJob(request(), {
      store,
      loadProject: async () => project('before'),
      loadAsset: async () => ({ type: 'video' }),
      publish,
      now: () => NOW,
    });
    const collision = await queueChatReferenceStyleJob({ ...request(), referenceAssetId: 'asset-other' }, {
      store,
      loadProject: async () => project('before'),
      loadAsset: async () => ({ type: 'video' }),
      publish,
      now: () => NOW,
    });

    expect(missing).toMatchObject({ status: 'failed', reason: 'reference-asset-not-found-or-not-owned' });
    expect(wrongType).toMatchObject({ status: 'failed', reason: 'reference-asset-must-be-video:image' });
    expect(collision).toMatchObject({ status: 'failed', reason: 'operation-id-conflicts-with-another-reference-style-request' });
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('extracts, checkpoints immediately before mutation, applies through the existing owner, and dispatches rendered proof', async () => {
    const store = new MemoryStore(queuedJob());
    let currentProject = project('before');
    const checkpointOrder: string[] = [];
    const checkpoint = installCheckpointSpies(checkpointOrder);
    const extractProfile = vi.fn(async () => {
      checkpointOrder.push('extract');
      return 'style-profile-1';
    });
    const applyProfile = vi.fn(async () => {
      checkpointOrder.push('apply');
      currentProject = project('after');
      return { status: 'mutated' as const, rawOutput: '{}', data: { profileId: 'style-profile-1' } };
    });
    const dispatchRenderEvidence = vi.fn(async () => ({ dispatched: true, messageId: 'render-1' }));

    const result = await runChatReferenceStyleJob(workerPayload(), {
      store,
      loadProject: async () => structuredClone(currentProject),
      extractProfile,
      applyProfile,
      dispatchRenderEvidence,
      ...checkpoint.dependencies,
      now: () => NOW,
    });

    expect(result).toMatchObject({
      status: 'completed',
      profileId: 'style-profile-1',
      renderVerification: { dispatched: true, messageId: 'render-1' },
    });
    expect(checkpointOrder).toEqual(['extract', 'before-checkpoint', 'apply', 'after-checkpoint']);
    expect(store.jobs.get('job-style-1')).toMatchObject({
      status: 'completed',
      profileId: 'style-profile-1',
      renderVerification: { dispatched: true },
    });
    const attemptOperationId = checkpoint.claimChatEditOperation.mock.calls[0]?.[0].operationId;
    expect(attemptOperationId).toMatch(/^style_[a-f0-9]{32}$/);
    expect(checkpoint.createCheckpoint.mock.calls[0]?.[0].operationId).toBe(attemptOperationId);
    expect(dispatchRenderEvidence).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      userId: 'user-1',
      chatEditVerification: expect.objectContaining({
        operationId: attemptOperationId,
        modalities: ['visual'],
        targets: [expect.objectContaining({ overlayId: 'title-1', state: 'updated' })],
      }),
    }));
  });

  it('records a safe planner decline as a no-op without an after checkpoint or render dispatch', async () => {
    const store = new MemoryStore(queuedJob());
    const order: string[] = [];
    const checkpoint = installCheckpointSpies(order);
    const dispatchRenderEvidence = vi.fn();

    const result = await runChatReferenceStyleJob(workerPayload(), {
      store,
      loadProject: async () => project('before'),
      extractProfile: async () => 'style-profile-1',
      applyProfile: async () => ({
        status: 'declined',
        rawOutput: '{}',
        data: { reasons: ['no-safe-opportunity'] },
        reason: 'no-safe-opportunity',
      }),
      dispatchRenderEvidence,
      ...checkpoint.dependencies,
      now: () => NOW,
    });

    expect(result).toMatchObject({ status: 'declined', reason: 'no-safe-opportunity' });
    expect(store.jobs.get('job-style-1')?.status).toBe('declined');
    expect(checkpoint.createCheckpoint).not.toHaveBeenCalled();
    expect(checkpoint.updateChatEditOperation).toHaveBeenCalledWith(
      expect.any(String),
      'user-1',
      expect.any(String),
      { operationStatus: 'no-op', mutatingToolNames: [] },
    );
    expect(dispatchRenderEvidence).not.toHaveBeenCalled();
  });

  it('retries a transient extraction failure without creating or restoring a mutation checkpoint', async () => {
    const store = new MemoryStore(queuedJob());
    const checkpoint = installCheckpointSpies([]);

    await expect(runChatReferenceStyleJob(workerPayload(), {
      store,
      loadProject: async () => project('before'),
      extractProfile: async () => { throw new Error('Gemini 429 RESOURCE_EXHAUSTED'); },
      applyProfile: vi.fn(),
      dispatchRenderEvidence: vi.fn(),
      ...checkpoint.dependencies,
      now: () => NOW,
    })).rejects.toBeInstanceOf(ChatReferenceStyleRetryableError);

    expect(store.jobs.get('job-style-1')).toMatchObject({ status: 'retry_wait', attemptCount: 1 });
    expect(checkpoint.claimChatEditOperation).not.toHaveBeenCalled();
    expect(checkpoint.restoreProjectCheckpoint).not.toHaveBeenCalled();
  });

  it('rolls back and fails when a claimed style application reports success without changing canonical state', async () => {
    const store = new MemoryStore(queuedJob());
    const checkpoint = installCheckpointSpies([]);
    const dispatchRenderEvidence = vi.fn();

    const result = await runChatReferenceStyleJob(workerPayload(), {
      store,
      loadProject: async () => project('before'),
      extractProfile: async () => 'style-profile-1',
      applyProfile: async () => ({ status: 'mutated', rawOutput: '{}', data: {} }),
      dispatchRenderEvidence,
      ...checkpoint.dependencies,
      now: () => NOW,
    });

    expect(result).toMatchObject({ status: 'failed', reason: expect.stringContaining('reference-style-postcondition-failed') });
    expect(checkpoint.restoreProjectCheckpoint).toHaveBeenCalledTimes(1);
    expect(store.jobs.get('job-style-1')?.status).toBe('rolled_back');
    expect(dispatchRenderEvidence).not.toHaveBeenCalled();
  });

  it('persists completed-unverified instead of claiming success when the render worker cannot start', async () => {
    const store = new MemoryStore(queuedJob());
    let currentProject = project('before');
    const checkpoint = installCheckpointSpies([]);

    const result = await runChatReferenceStyleJob(workerPayload(), {
      store,
      loadProject: async () => structuredClone(currentProject),
      extractProfile: async () => 'style-profile-1',
      applyProfile: async () => {
        currentProject = project('after');
        return { status: 'mutated', rawOutput: '{}', data: {} };
      },
      dispatchRenderEvidence: async () => ({ dispatched: false, reason: 'missing-remotion-site' }),
      ...checkpoint.dependencies,
      now: () => NOW,
    });

    expect(result).toMatchObject({ status: 'completed_unverified', reason: 'missing-remotion-site' });
    expect(store.jobs.get('job-style-1')).toMatchObject({
      status: 'completed_unverified',
      error: 'missing-remotion-site',
    });
  });

  it('keeps the internal worker signed and fails closed outside tests when signing keys are absent', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/api/internal/workers/chat-reference-style/route.ts'),
      'utf8',
    );
    expect(source).toContain('verifySignatureAppRouter(handleChatReferenceStyleWorker)');
    expect(source).toContain("process.env.NODE_ENV === 'test'");
    expect(source).toContain('QStash signing keys are required for this internal worker');
  });
});

class MemoryStore implements ChatReferenceStyleJobStore {
  readonly jobs = new Map<string, ChatReferenceStyleJob>();

  constructor(initial?: ChatReferenceStyleJob) {
    if (initial) this.jobs.set(initial._id, structuredClone(initial));
  }

  async createOrGet(job: ChatReferenceStyleJob) {
    const existing = this.jobs.get(job._id);
    if (existing) return { created: false, job: structuredClone(existing) };
    this.jobs.set(job._id, structuredClone(job));
    return { created: true, job: structuredClone(job) };
  }

  async find(jobId: string, userId: string) {
    const job = this.jobs.get(jobId);
    return job?.userId === userId ? structuredClone(job) : null;
  }

  async claimDispatch(jobId: string, userId: string, now: Date) {
    const job = this.owned(jobId, userId);
    if (!['created', 'dispatch_failed'].includes(job.status)) return false;
    Object.assign(job, { status: 'dispatching', updatedAt: now });
    return true;
  }

  async markPublished(jobId: string, userId: string, messageId: string | undefined, now: Date) {
    Object.assign(this.owned(jobId, userId), { status: 'queued', dispatchMessageId: messageId, updatedAt: now });
  }

  async markDispatchFailed(jobId: string, userId: string, error: string, now: Date) {
    Object.assign(this.owned(jobId, userId), { status: 'dispatch_failed', error, updatedAt: now });
  }

  async claimRun(jobId: string, userId: string, leaseId: string, now: Date) {
    const job = this.owned(jobId, userId);
    if (!['dispatching', 'queued', 'retry_wait'].includes(job.status)) return null;
    job.status = 'running';
    job.leaseId = leaseId;
    job.leaseExpiresAt = new Date(now.getTime() + 60_000);
    job.attemptCount += 1;
    return structuredClone(job);
  }

  async markProfileExtracted(jobId: string, userId: string, profileId: string, now: Date) {
    Object.assign(this.owned(jobId, userId), { profileId, updatedAt: now });
  }

  async markCheckpointStarted(jobId: string, userId: string, checkpointId: string, now: Date) {
    Object.assign(this.owned(jobId, userId), { beforeCheckpointId: checkpointId, updatedAt: now });
  }

  async markDeclined(jobId: string, userId: string, result: Record<string, unknown>, now: Date) {
    Object.assign(this.owned(jobId, userId), { status: 'declined', result, completedAt: now, updatedAt: now });
  }

  async markCompleted(input: {
    jobId: string;
    userId: string;
    afterCheckpointId: string;
    renderVerification: { dispatched: boolean; messageId?: string; reason?: string };
    result: Record<string, unknown>;
    now: Date;
  }) {
    Object.assign(this.owned(input.jobId, input.userId), {
      status: input.renderVerification.dispatched ? 'completed' : 'completed_unverified',
      afterCheckpointId: input.afterCheckpointId,
      renderVerification: input.renderVerification,
      result: input.result,
      error: input.renderVerification.dispatched ? null : input.renderVerification.reason,
      completedAt: input.now,
      updatedAt: input.now,
    });
  }

  async markRetry(jobId: string, userId: string, error: string, now: Date) {
    Object.assign(this.owned(jobId, userId), { status: 'retry_wait', error, updatedAt: now });
  }

  async markFailed(jobId: string, userId: string, error: string, rolledBack: boolean, now: Date) {
    Object.assign(this.owned(jobId, userId), {
      status: rolledBack ? 'rolled_back' : 'failed',
      error,
      completedAt: now,
      updatedAt: now,
    });
  }

  private owned(jobId: string, userId: string) {
    const job = this.jobs.get(jobId);
    if (!job || job.userId !== userId) throw new Error('missing job');
    return job;
  }
}

function request() {
  return {
    projectId: 'project-1',
    userId: 'user-1',
    sessionId: 'session-style-1',
    operationId: 'operation-style-1',
    referenceAssetId: 'asset-reference',
    strength: 0.65,
  };
}

function workerPayload() {
  return { jobId: 'job-style-1', projectId: 'project-1', userId: 'user-1' };
}

function queuedJob(): ChatReferenceStyleJob {
  return {
    _id: 'job-style-1',
    version: CHAT_REFERENCE_STYLE_JOB_VERSION,
    idempotencyKey: 'idem-1',
    status: 'queued',
    projectId: 'project-1',
    userId: 'user-1',
    sessionId: 'session-style-1',
    operationId: 'operation-style-1',
    referenceAssetId: 'asset-reference',
    strength: 0.65,
    attemptCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    expiresAt: new Date(NOW.getTime() + 86_400_000),
  };
}

function project(content: 'before' | 'after') {
  return {
    projectId: 'project-1',
    userId: 'user-1',
    fps: 30,
    durationInFrames: 300,
    overlays: [{
      id: 'title-1',
      type: 'text',
      from: 30,
      durationInFrames: 90,
      row: 2,
      content,
    }],
  };
}

function installCheckpointSpies(order: string[]) {
  const claimChatEditOperation = vi.fn(async (input: Parameters<CheckpointRuntime['claimChatEditOperation']>[0]) => {
    order.push('before-checkpoint');
    return { claimed: true, checkpoint: checkpoint(input.checkpointId, input.operationId, input.projectState) };
  });
  const createCheckpoint = vi.fn(async (input: Parameters<CheckpointRuntime['createCheckpoint']>[0]) => {
    order.push('after-checkpoint');
    return checkpoint(input.checkpointId!, input.operationId!, input.projectState!);
  });
  const updateChatEditOperation = vi.fn(async () => undefined);
  const restoreProjectCheckpoint = vi.fn(async (checkpointId: string) => ({
    restored: true,
    checkpointId,
    expectedStateHash: 'before',
    actualStateHash: 'before',
  }));
  const checkpointService = {
    claimChatEditOperation,
    createCheckpoint,
    updateChatEditOperation,
    restoreProjectCheckpoint,
  };
  return {
    ...checkpointService,
    dependencies: {
      checkpointService,
      captureProjectState: (value: Record<string, unknown>): RestorableProjectState => ({
        presentFields: ['overlays'],
        fields: { overlays: value.overlays ?? [] },
      }),
      buildRenderVerificationRequest: (input: {
        transaction: { operationId: string; sessionId: string; beforeCheckpointId: string };
        afterCheckpointId: string;
      }) => ({
        version: 'editron-chat-render-verification-v1' as const,
        operationId: input.transaction.operationId,
        sessionId: input.transaction.sessionId,
        beforeCheckpointId: input.transaction.beforeCheckpointId,
        afterCheckpointId: input.afterCheckpointId,
        requestedAt: NOW.toISOString(),
        modalities: ['visual' as const],
        targets: [{
          overlayId: 'title-1',
          overlayType: 'text',
          state: 'updated' as const,
          from: 30,
          endFrame: 120,
        }],
        sampleFrames: [30, 75, 119],
      }),
    },
  };
}

interface CheckpointRuntime {
  claimChatEditOperation(input: {
    checkpointId: string;
    operationId: string;
    projectState: RestorableProjectState;
  }): Promise<{ claimed: boolean; checkpoint: Checkpoint }>;
  createCheckpoint(input: {
    checkpointId?: string;
    operationId?: string;
    projectState?: RestorableProjectState;
  }): Promise<Checkpoint | null>;
}

function checkpoint(
  checkpointId: string,
  operationId: string,
  projectState: RestorableProjectState,
): Checkpoint {
  return {
    checkpointId,
    sessionId: 'session-style-1',
    projectId: 'project-1',
    userId: 'user-1',
    overlays: Array.isArray(projectState.fields.overlays)
      ? projectState.fields.overlays as Checkpoint['overlays']
      : [],
    projectState,
    operationId,
    operationStatus: 'running',
    timestamp: NOW,
    description: 'test checkpoint',
    type: checkpointId.includes('_after_') ? 'after-llm' : 'before-llm',
    createdAt: NOW,
  };
}
