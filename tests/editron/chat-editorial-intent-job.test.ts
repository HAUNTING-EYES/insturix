import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { CHAT_EDITORIAL_INTENT_VERSION } from '@/lib/editron/agent/chat-editorial-intent-tools';
import {
  shouldRunDirectorScopedEffect,
  shouldRunProfileActionWithinExecutionScope,
} from '@/lib/editron/agent/post-edl-action-policy';
import {
  CHAT_EDITORIAL_INTENT_JOB_VERSION,
  ChatEditorialIntentRetryableError,
  buildChatEditorialIntentProjectBrief,
  queueChatEditorialIntentJob,
  runChatEditorialIntentJob,
  type ChatEditorialIntentJob,
  type ChatEditorialIntentJobStore,
} from '@/lib/editron/services/chat-editorial-intent-job';
import type { Checkpoint, RestorableProjectState } from '@/lib/editron/services/checkpoint-service';

const NOW = new Date('2026-07-24T10:00:00.000Z');

describe('durable chat editorial-intent jobs', () => {
  it('queues an owned project intent once and returns the existing receipt on replay', async () => {
    const store = new MemoryStore();
    const publish = vi.fn(async () => ({ messageId: 'qstash-intent-1' }));
    const dependencies = {
      store,
      loadProject: vi.fn(async () => project('before')),
      publish,
      now: () => NOW,
    };

    const first = await queueChatEditorialIntentJob(request(), dependencies);
    const replay = await queueChatEditorialIntentJob(request(), dependencies);

    expect(first).toMatchObject({ status: 'queued', messageId: 'qstash-intent-1' });
    expect(replay).toMatchObject({
      status: 'already-queued',
      jobId: first.jobId,
      messageId: 'qstash-intent-1',
    });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(store.jobs.get(first.jobId)).toMatchObject({
      status: 'queued',
      projectId: 'project-1',
      intent: { goal: 'Make the pacing more intentional.' },
    });
  });

  it('rejects unowned projects and operation collisions before dispatch', async () => {
    const publish = vi.fn(async () => ({ messageId: 'never' }));
    const missing = await queueChatEditorialIntentJob(request(), {
      store: new MemoryStore(),
      loadProject: async () => null,
      publish,
      now: () => NOW,
    });
    const store = new MemoryStore();
    await queueChatEditorialIntentJob(request(), {
      store,
      loadProject: async () => project('before'),
      publish,
      now: () => NOW,
    });
    const collision = await queueChatEditorialIntentJob({
      ...request(),
      intent: { ...request().intent, intentId: 'intent-other', goal: 'A conflicting operation.' },
    }, {
      store,
      loadProject: async () => project('before'),
      publish,
      now: () => NOW,
    });

    expect(missing).toMatchObject({ status: 'failed', reason: 'project-not-found-or-not-owned' });
    expect(collision).toMatchObject({
      status: 'failed',
      reason: 'operation-id-conflicts-with-another-editorial-intent',
    });
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('checkpoints, executes the existing Director owner, and dispatches rendered proof', async () => {
    const store = new MemoryStore(queuedJob());
    let currentProject = project('before');
    const order: string[] = [];
    const checkpoint = checkpointRuntime(order);
    const dispatchRenderEvidence = vi.fn(async () => ({
      dispatched: true,
      messageId: 'render-intent-1',
    }));

    const result = await runChatEditorialIntentJob(workerPayload(), {
      store,
      loadProject: async () => structuredClone(currentProject),
      executeDirector: async () => {
        order.push('director');
        currentProject = project('after');
        return directorResult(1);
      },
      dispatchRenderEvidence,
      ...checkpoint.dependencies,
      now: () => NOW,
    });

    expect(result).toMatchObject({
      status: 'completed',
      renderVerification: { dispatched: true, messageId: 'render-intent-1' },
    });
    expect(order).toEqual(['before-checkpoint', 'director', 'after-checkpoint']);
    expect(store.jobs.get('job-intent-1')).toMatchObject({
      status: 'completed',
      renderVerification: { dispatched: true },
    });
    expect(dispatchRenderEvidence).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      userId: 'user-1',
      chatEditVerification: expect.objectContaining({
        operationId: 'operation-intent-1',
        modalities: ['visual'],
      }),
    }));
  });

  it('records a planner no-op as declined without claiming rendered success', async () => {
    const store = new MemoryStore(queuedJob());
    const checkpoint = checkpointRuntime([]);
    const dispatchRenderEvidence = vi.fn();

    const result = await runChatEditorialIntentJob(workerPayload(), {
      store,
      loadProject: async () => project('before'),
      executeDirector: async () => directorResult(0),
      dispatchRenderEvidence,
      ...checkpoint.dependencies,
      now: () => NOW,
    });

    expect(result).toMatchObject({
      status: 'declined',
      reason: 'unified-planner-produced-no-material-change',
    });
    expect(store.jobs.get('job-intent-1')?.status).toBe('declined');
    expect(checkpoint.createCheckpoint).not.toHaveBeenCalled();
    expect(dispatchRenderEvidence).not.toHaveBeenCalled();
  });

  it('rolls back a transient Director timeout and exposes a retryable worker failure', async () => {
    const store = new MemoryStore(queuedJob());
    const checkpoint = checkpointRuntime([]);

    await expect(runChatEditorialIntentJob(workerPayload(), {
      store,
      loadProject: async () => project('before'),
      executeDirector: async () => {
        throw new Error('Gemini timeout while planning');
      },
      dispatchRenderEvidence: vi.fn(),
      ...checkpoint.dependencies,
      now: () => NOW,
    })).rejects.toBeInstanceOf(ChatEditorialIntentRetryableError);

    expect(checkpoint.restoreProjectCheckpoint).toHaveBeenCalledTimes(1);
    expect(store.jobs.get('job-intent-1')).toMatchObject({
      status: 'retry_wait',
      attemptCount: 1,
      error: 'Gemini timeout while planning',
    });
  });

  it('persists completed-unverified when rendered evidence cannot be dispatched', async () => {
    const store = new MemoryStore(queuedJob());
    let currentProject = project('before');
    const checkpoint = checkpointRuntime([]);

    const result = await runChatEditorialIntentJob(workerPayload(), {
      store,
      loadProject: async () => structuredClone(currentProject),
      executeDirector: async () => {
        currentProject = project('after');
        return directorResult(1);
      },
      dispatchRenderEvidence: async () => ({ dispatched: false, reason: 'render-worker-unavailable' }),
      ...checkpoint.dependencies,
      now: () => NOW,
    });

    expect(result).toMatchObject({
      status: 'completed_unverified',
      reason: 'render-worker-unavailable',
    });
    expect(store.jobs.get('job-intent-1')).toMatchObject({
      status: 'completed_unverified',
      error: 'render-worker-unavailable',
    });
  });

  it('keeps the internal worker signed and fails closed outside tests when signing keys are absent', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/api/internal/workers/chat-editorial-intent/route.ts'),
      'utf8',
    );
    expect(source).toContain('verifySignatureAppRouter(handleChatEditorialIntentWorker)');
    expect(source).toContain("process.env.NODE_ENV === 'test'");
    expect(source).toContain('QStash signing keys are required for this internal worker');
    expect(source).toContain('export const maxDuration = 800');
  });

  it('isolates explicit family requests while preserving broad project goals', () => {
    const motionGraphicsBrief = buildChatEditorialIntentProjectBrief({
      ...request().intent,
      editorialPreferences: {
        families: {
          motionGraphics: { mode: 'prefer', frequency: 0.5, intensity: 0.7 },
        },
        notes: 'Keep the composition restrained.',
      },
    });

    expect(motionGraphicsBrief.executionScope).toEqual({
      version: 'editorial-execution-scope-v1',
      source: 'chat-editorial-intent',
      mode: 'explicit-families-only',
      families: ['motionGraphics'],
    });
    expect(motionGraphicsBrief.editorialPreferences).toEqual({
      families: {
        captions: { mode: 'off' },
        motionGraphics: { mode: 'prefer', frequency: 0.5, intensity: 0.7 },
        zoom: { mode: 'off' },
        transitions: { mode: 'off' },
        sfx: { mode: 'off' },
        music: { mode: 'off' },
      },
      notes: 'Keep the composition restrained.',
    });

    const broadBrief = buildChatEditorialIntentProjectBrief(request().intent);
    expect(broadBrief.executionScope).toBeUndefined();
    expect(broadBrief.editorialPreferences).toBeUndefined();
  });

  it('blocks collateral Director effects during a scoped MG request', () => {
    const executionScope = buildChatEditorialIntentProjectBrief({
      ...request().intent,
      editorialPreferences: {
        families: { motionGraphics: { mode: 'prefer' } },
      },
    }).executionScope;

    for (const effect of [
      'color-normalization',
      'transition-dedup',
      'beat-sync',
      'transition-sfx',
      'audio-ducking',
    ] as const) {
      expect(shouldRunDirectorScopedEffect({ effect, executionScope }).run).toBe(false);
    }
    expect(shouldRunDirectorScopedEffect({
      effect: 'quality-review',
      executionScope,
    }).run).toBe(true);
    expect(shouldRunProfileActionWithinExecutionScope({
      tool: 'add_captions',
      executionScope,
    }).run).toBe(false);
    expect(shouldRunProfileActionWithinExecutionScope({
      tool: 'add_motion_graphic',
      executionScope,
    })).toEqual({
      run: false,
      reason: 'legacy-action-not-owned-by-scoped-run',
    });

    const source = readFileSync(
      resolve(process.cwd(), 'lib/editron/agent/director-agent.ts'),
      'utf8',
    );
    expect(source).toContain("effect: 'color-normalization'");
    expect(source).toContain("effect: 'transition-dedup'");
    expect(source).toContain("effect: 'beat-sync'");
    expect(source).toContain("effect: 'transition-sfx'");
    expect(source).toContain("effect: 'audio-ducking'");
    expect(source).toContain('Legacy intelligence fallback disabled for scoped chat execution');
  });
});

class MemoryStore implements ChatEditorialIntentJobStore {
  readonly jobs = new Map<string, ChatEditorialIntentJob>();

  constructor(initial?: ChatEditorialIntentJob) {
    if (initial) this.jobs.set(initial._id, structuredClone(initial));
  }

  async createOrGet(job: ChatEditorialIntentJob) {
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
    Object.assign(this.owned(jobId, userId), {
      status: 'queued',
      dispatchMessageId: messageId,
      updatedAt: now,
    });
  }

  async markDispatchFailed(jobId: string, userId: string, error: string, now: Date) {
    Object.assign(this.owned(jobId, userId), { status: 'dispatch_failed', error, updatedAt: now });
  }

  async claimRun(jobId: string, userId: string, leaseId: string, now: Date) {
    const job = this.owned(jobId, userId);
    if (!['dispatching', 'queued', 'retry_wait'].includes(job.status)) return null;
    Object.assign(job, {
      status: 'running',
      leaseId,
      leaseExpiresAt: new Date(now.getTime() + 60_000),
      attemptCount: job.attemptCount + 1,
      updatedAt: now,
    });
    return structuredClone(job);
  }

  async markCheckpointStarted(jobId: string, userId: string, checkpointId: string, now: Date) {
    Object.assign(this.owned(jobId, userId), { beforeCheckpointId: checkpointId, updatedAt: now });
  }

  async markDeclined(jobId: string, userId: string, result: Record<string, unknown>, now: Date) {
    Object.assign(this.owned(jobId, userId), {
      status: 'declined',
      result,
      completedAt: now,
      updatedAt: now,
    });
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
    Object.assign(this.owned(jobId, userId), {
      status: 'retry_wait',
      leaseId: null,
      leaseExpiresAt: null,
      error,
      updatedAt: now,
    });
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
    sessionId: 'session-intent-1',
    operationId: 'operation-intent-1',
    intent: {
      version: CHAT_EDITORIAL_INTENT_VERSION,
      intentId: 'intent-1',
      goal: 'Make the pacing more intentional.',
      scope: { kind: 'project' as const },
      constraints: [],
      strength: 0.6,
      uncertainty: 0,
      evidenceQuery: 'Make the pacing more intentional.',
    },
  };
}

function workerPayload() {
  return { jobId: 'job-intent-1', projectId: 'project-1', userId: 'user-1' };
}

function queuedJob(): ChatEditorialIntentJob {
  return {
    _id: 'job-intent-1',
    version: CHAT_EDITORIAL_INTENT_JOB_VERSION,
    idempotencyKey: 'idem-intent-1',
    status: 'queued',
    ...request(),
    attemptCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    expiresAt: new Date(NOW.getTime() + 86_400_000),
  };
}

function directorResult(overlaysModified: number) {
  return {
    success: true,
    overlaysModified,
    warnings: [],
    actionsSkipped: [],
    decisionAuthority: { executableProducer: 'unified-planner', executedDecisions: overlaysModified },
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

function checkpointRuntime(order: string[]) {
  const claimChatEditOperation = vi.fn(async (input: Parameters<CheckpointRuntime['claimChatEditOperation']>[0]) => {
    order.push('before-checkpoint');
    return {
      claimed: true,
      checkpoint: checkpoint(input.checkpointId, input.operationId, input.projectState),
    };
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
    createCheckpoint,
    restoreProjectCheckpoint,
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
    sessionId: 'session-intent-1',
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
    type: checkpointId.includes(':after:') ? 'after-llm' : 'before-llm',
    createdAt: NOW,
  };
}
