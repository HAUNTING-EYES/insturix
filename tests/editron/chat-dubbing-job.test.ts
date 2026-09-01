import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import type { ChatAiEditTransaction } from '@/lib/editron/agent/chat-ai-edit-transaction-runtime';
import {
  verifyChatToolPostcondition,
} from '@/lib/editron/agent/chat-edit-postconditions';
import {
  TerminalDubbingError,
  queueChatDubbingJob,
  resolveChatDubbingJob,
  runChatDubbingJob,
  type ChatDubbingCompletion,
  type ChatDubbingJob,
  type ChatDubbingJobStore,
  type ChatDubbingProgress,
} from '@/lib/editron/services/chat-dubbing-job';
import type {
  ChatEditOperationUpdate,
  Checkpoint,
  CheckpointRollbackReceiptV1,
  CheckpointInput,
  RestorableProjectState,
} from '@/lib/editron/services/checkpoint-service';
import type {
  ProjectMutationReceiptV1,
  ProjectRevisionV1,
} from '@/lib/editron/services/project-service';
import type { ChatEditRenderVerificationRequest } from '@/lib/editron/services/phase0-rendered-evidence-worker';

class MemoryStore implements ChatDubbingJobStore {
  jobs = new Map<string, ChatDubbingJob>();
  async createOrGet(job: ChatDubbingJob) {
    const existing = Array.from(this.jobs.values()).find((candidate) => candidate.idempotencyKey === job.idempotencyKey);
    if (existing) return { created: false, job: existing };
    this.jobs.set(job._id, structuredClone(job));
    return { created: true, job: structuredClone(job) };
  }
  async find(jobId: string, userId: string) { const job = this.jobs.get(jobId); return job?.userId === userId ? structuredClone(job) : null; }
  async claimDispatch(jobId: string, userId: string, now: Date) {
    const job = this.jobs.get(jobId);
    if (!job || job.userId !== userId || !['resolved', 'dispatch_failed', 'retry_wait'].includes(job.status)) return false;
    Object.assign(job, { status: 'dispatching', updatedAt: now }); return true;
  }
  async markPublished(jobId: string, _userId: string, messageId: string | undefined, now: Date) { Object.assign(this.jobs.get(jobId)!, { status: 'queued', dispatchMessageId: messageId, updatedAt: now }); }
  async markDispatchFailed(jobId: string, _userId: string, error: string, now: Date) { Object.assign(this.jobs.get(jobId)!, { status: 'dispatch_failed', error, updatedAt: now }); }
  async claimRun(jobId: string, userId: string, leaseId: string, now: Date) {
    const job = this.jobs.get(jobId);
    if (!job || job.userId !== userId || !['queued', 'retry_wait', 'dispatch_failed'].includes(job.status)) return null;
    Object.assign(job, { status: 'running', leaseId, runCount: job.runCount + 1, updatedAt: now }); return structuredClone(job);
  }
  async markProgress(jobId: string, _userId: string, progress: ChatDubbingProgress, now: Date) { Object.assign(this.jobs.get(jobId)!, { status: 'resolved', progress, updatedAt: now }); }
  async markCompleted(completion: ChatDubbingCompletion) {
    Object.assign(this.jobs.get(completion.jobId)!, {
      status: 'completed',
      result: completion.result,
      afterCheckpointId: completion.afterCheckpointId,
      renderVerification: completion.renderVerification,
      updatedAt: completion.now,
    });
  }
  async markRetry(jobId: string, _userId: string, error: string, now: Date) { const job = this.jobs.get(jobId)!; Object.assign(job, { status: 'retry_wait', failureCount: job.failureCount + 1, error, updatedAt: now }); }
  async markFailed(jobId: string, _userId: string, status: 'failed' | 'stale', error: string, now: Date) { Object.assign(this.jobs.get(jobId)!, { status, error, updatedAt: now }); }
}

const now = new Date('2026-07-23T00:00:00.000Z');
const ROLLBACK_REVISION: ProjectRevisionV1 = {
  schemaVersion: 1,
  value: 2,
  compatibilityUpdatedAt: '2026-07-23T00:00:01.000Z',
};
const WRITER_ISSUED_RECEIPT: ProjectMutationReceiptV1 = {
  schemaVersion: 1,
  projectId: 'proj-1',
  revision: {
    schemaVersion: 1,
    value: 3,
    compatibilityUpdatedAt: '2026-07-23T00:00:02.000Z',
  },
  committedAt: '2026-07-23T00:00:02.000Z',
};
const project = {
  projectId: 'proj-1',
  userId: 'user-1',
  fps: 30,
  durationInFrames: 600,
  overlays: [{ id: 11, type: 'video', assetId: 'asset-1', from: 60, durationInFrames: 300, videoStartTime: 90, speed: 1 }],
};

const buildCheckpointId = (
  input: Pick<ChatAiEditTransaction, 'operationId' | 'sessionId' | 'projectId' | 'userId'>,
  position: 'before' | 'after',
) => `ckpt_chat_${position}_${createHash('sha256')
  .update(`${input.userId}:${input.projectId}:${input.sessionId}:${input.operationId}:${position}`)
  .digest('hex')
  .slice(0, 28)}`;

function captureProjectState(value: Record<string, unknown>): RestorableProjectState {
  return {
    presentFields: ['overlays', 'fps', 'durationInFrames'],
    fields: {
      overlays: structuredClone(value.overlays ?? []),
      fps: value.fps,
      durationInFrames: value.durationInFrames,
    },
  };
}

function fingerprintProjectState(state: RestorableProjectState): string {
  return createHash('sha256').update(JSON.stringify(state)).digest('hex');
}

async function resolved(
  store: MemoryStore,
  request: Partial<Parameters<typeof resolveChatDubbingJob>[0]> = {},
) {
  return resolveChatDubbingJob({
    projectId: 'proj-1',
    userId: 'user-1',
    sessionId: 'session-1',
    operationId: 'operation-1',
    overlayId: 11,
    targetLanguage: 'English',
    ...request,
  }, {
    store,
    loadProject: vi.fn(async () => project),
    buildProjectRevision: vi.fn(() => 'revision-1'),
    buildCheckpointId,
    now: () => now,
  });
}

function createCheckpointHarness(job: ChatDubbingJob, beforeProject = project) {
  const checkpoints = new Map<string, Checkpoint>();
  const beforeState = captureProjectState(beforeProject);
  const beforeCheckpoint: Checkpoint = {
    checkpointId: job.beforeCheckpointId!,
    sessionId: job.sessionId!,
    operationId: job.operationId,
    operationStatus: 'no-op',
    projectId: job.projectId,
    userId: job.userId,
    overlays: beforeProject.overlays as any[],
    projectState: beforeState,
    stateHash: fingerprintProjectState(beforeState),
    stateHashVersion: 2,
    capturedProjectRevision: ROLLBACK_REVISION,
    timestamp: now,
    description: 'before dubbing',
    type: 'before-llm',
    createdAt: now,
    updatedAt: now,
  };
  checkpoints.set(beforeCheckpoint.checkpointId, beforeCheckpoint);

  const checkpointService = {
    getCheckpoint: vi.fn(async (checkpointId: string, userId: string, projectId?: string) => {
      const checkpoint = checkpoints.get(checkpointId);
      return checkpoint?.userId === userId && (!projectId || checkpoint.projectId === projectId)
        ? checkpoint
        : null;
    }),
    createCheckpoint: vi.fn(async (input: CheckpointInput) => {
      const state = input.projectState ?? captureProjectState({ overlays: input.overlays });
      const checkpoint: Checkpoint = {
        checkpointId: input.checkpointId!,
        sessionId: input.sessionId,
        operationId: input.operationId,
        projectId: input.projectId,
        userId: input.userId,
        overlays: input.overlays,
        projectState: state,
        stateHash: fingerprintProjectState(state),
        stateHashVersion: 2,
        timestamp: now,
        description: input.description,
        type: input.type,
        createdAt: now,
        updatedAt: now,
      };
      checkpoints.set(checkpoint.checkpointId, checkpoint);
      return checkpoint;
    }),
    getRollbackReceipt: vi.fn(async (
      checkpointId: string,
      userId: string,
      projectId: string,
      receiptId: string,
    ): Promise<CheckpointRollbackReceiptV1 | null> => {
      const checkpoint = checkpoints.get(checkpointId);
      return checkpoint?.userId === userId && checkpoint.projectId === projectId
        ? { schemaVersion: 1, receiptId, expectedRevision: ROLLBACK_REVISION }
        : null;
    }),
    recordRollbackExpectedRevision: vi.fn(async (
      checkpointId: string,
      userId: string,
      projectId: string,
      receiptId: string,
      writerIssuedReceipt?: ProjectMutationReceiptV1,
    ): Promise<CheckpointRollbackReceiptV1> => {
      const checkpoint = checkpoints.get(checkpointId);
      if (!checkpoint || checkpoint.userId !== userId || checkpoint.projectId !== projectId) {
        throw new Error('checkpoint rollback receipt scope mismatch');
      }
      if (!writerIssuedReceipt) {
        throw new Error('writer-issued rollback receipt required');
      }
      return {
        schemaVersion: 1,
        receiptId,
        expectedRevision: writerIssuedReceipt.revision,
      };
    }),
    updateChatEditOperationScoped: vi.fn(async (
      checkpointId: string,
      userId: string,
      projectId: string,
      operationId: string,
      update: ChatEditOperationUpdate,
    ) => {
      const checkpoint = checkpoints.get(checkpointId);
      if (!checkpoint || checkpoint.userId !== userId || checkpoint.projectId !== projectId || checkpoint.operationId !== operationId) {
        throw new Error('checkpoint identity mismatch');
      }
      Object.assign(checkpoint, update);
    }),
    restoreProjectCheckpoint: vi.fn(async (
      checkpointId: string,
      _userId: string,
      options: { projectId: string; expectedRevision: ProjectRevisionV1 },
    ) => ({
      restored: true,
      checkpointId,
      expectedStateHash: checkpoints.get(checkpointId)?.stateHash ?? '',
      beforeRevision: options.expectedRevision,
      restoredRevision: options.expectedRevision,
    })),
  };
  return {
    checkpointService,
    captureProjectState,
    fingerprintProjectState,
    buildRenderVerificationRequest: vi.fn((input: {
      transaction: ChatAiEditTransaction;
      afterCheckpointId: string;
      subjectReceipt?: ProjectMutationReceiptV1;
    }): ChatEditRenderVerificationRequest => ({
      version: 'editron-chat-render-verification-v1',
      operationId: input.transaction.operationId,
      sessionId: input.transaction.sessionId,
      beforeCheckpointId: input.transaction.beforeCheckpointId,
      afterCheckpointId: input.afterCheckpointId,
      subjectReceipt: input.subjectReceipt,
      requestedAt: now.toISOString(),
      modalities: ['audio'],
      expectedEffect: 'mutation-delta',
      targets: [],
      sampleFrames: [60],
    })),
    dispatchRenderEvidence: vi.fn(async () => ({ dispatched: true, messageId: 'render-msg-1' })),
    verifyPostcondition: verifyChatToolPostcondition,
    checkpoints,
  };
}

function runHarness(store: MemoryStore, jobId: string) {
  return createCheckpointHarness(store.jobs.get(jobId)!);
}

describe('durable chat dubbing job', () => {
  it('pins selected clip, source coordinates, language, and project revision idempotently', async () => {
    const store = new MemoryStore();
    const first = await resolved(store);
    const second = await resolved(store);
    expect(first).toMatchObject({ created: true, status: 'resolved' });
    expect(second).toMatchObject({ jobId: first.jobId, created: false, status: 'resolved' });
    expect(await store.find(first.jobId, 'user-1')).toMatchObject({
      overlayId: '11', assetId: 'asset-1', targetLanguage: 'en', projectRevision: 'revision-1',
      sessionId: 'session-1', operationId: 'operation-1',
      beforeCheckpointId: expect.stringMatching(/^ckpt_chat_before_/),
      voiceId: 'af_heart',
      speechCapability: {
        language: 'en',
        displayName: 'English',
        provider: 'fal-ai',
        model: 'fal-ai/kokoro/american-english',
        voiceId: 'af_heart',
      },
      timelineStartFrame: 60, timelineEndFrame: 360, sourceStartFrame: 90, sourceEndFrame: 390,
    });
  });

  it('pins Hindi as a licensed canonical capability and rejects unsupported languages before provider work', async () => {
    const store = new MemoryStore();
    const hindi = await resolved(store, { targetLanguage: 'Hindi' });
    expect(await store.find(hindi.jobId, 'user-1')).toMatchObject({
      targetLanguage: 'hi',
      voiceId: 'hf_alpha',
      speechCapability: {
        language: 'hi',
        displayName: 'Hindi',
        provider: 'fal-ai',
        model: 'fal-ai/kokoro/hindi',
        voiceId: 'hf_alpha',
      },
    });
    await expect(resolveChatDubbingJob({
      projectId: 'proj-1', userId: 'user-1', sessionId: 'session-1', operationId: 'operation-unsupported',
      overlayId: 11, targetLanguage: 'French',
    }, {
      store: new MemoryStore(), loadProject: async () => project, buildProjectRevision: () => 'r', buildCheckpointId, now: () => now,
    })).rejects.toMatchObject({ code: 'unsupported-target-language' });
  });

  it('rejects retimed clips before provider work', async () => {
    await expect(resolveChatDubbingJob({
      projectId: 'proj-1', userId: 'user-1', sessionId: 'session-1', operationId: 'operation-retimed', overlayId: 11,
    }, {
      store: new MemoryStore(), loadProject: async () => ({ ...project, overlays: [{ ...project.overlays[0], speed: 1.2 }] }), buildProjectRevision: () => 'r', buildCheckpointId, now: () => now,
    })).rejects.toMatchObject({ code: 'retimed-clip-unsupported' });
  });

  it('continues resumable stages without spending failure budget', async () => {
    const store = new MemoryStore();
    const { jobId } = await resolved(store);
    const publish = vi.fn(async () => ({ messageId: 'msg-1' }));
    const deps = { store, loadProject: vi.fn(async () => project), buildProjectRevision: vi.fn(() => 'revision-1'), buildCheckpointId, now: () => now, publish };
    expect(await queueChatDubbingJob({ jobId, projectId: 'proj-1', userId: 'user-1' }, deps)).toMatchObject({ status: 'queued' });
    const result = await runChatDubbingJob({ jobId, projectId: 'proj-1', userId: 'user-1' }, {
      ...deps,
      ...runHarness(store, jobId),
      execute: vi.fn(async () => ({ status: 'continue' as const, reason: 'translated', progress: { stage: 'separate' as const, nextPhraseIndex: 0 } })),
      cleanup: vi.fn(async () => undefined),
    });
    expect(result).toMatchObject({ status: 'continuing', reason: 'translated' });
    expect(await store.find(jobId, 'user-1')).toMatchObject({ status: 'queued', failureCount: 0, runCount: 1, progress: { stage: 'separate' } });
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it('reports terminal queue state instead of pretending dead work is queued', async () => {
    const store = new MemoryStore();
    const { jobId } = await resolved(store);
    Object.assign(store.jobs.get(jobId)!, { status: 'failed', error: 'no-spoken-dialogue' });
    const publish = vi.fn();
    const result = await queueChatDubbingJob({ jobId, projectId: 'proj-1', userId: 'user-1' }, {
      store,
      loadProject: vi.fn(async () => project),
      buildProjectRevision: vi.fn(() => 'revision-1'),
      buildCheckpointId,
      now: () => now,
      publish,
    });
    expect(result).toEqual({ status: 'failed', jobId, reason: 'no-spoken-dialogue' });
    expect(publish).not.toHaveBeenCalled();
  });

  it('retries transient provider failures but terminal failures clean up and stop', async () => {
    const transientStore = new MemoryStore();
    const { jobId } = await resolved(transientStore);
    const shared = { loadProject: vi.fn(async () => project), buildProjectRevision: vi.fn(() => 'revision-1'), buildCheckpointId, now: () => now, publish: vi.fn(async () => ({ messageId: 'msg' })) };
    await queueChatDubbingJob({ jobId, projectId: 'proj-1', userId: 'user-1' }, { ...shared, store: transientStore });
    const retry = await runChatDubbingJob({ jobId, projectId: 'proj-1', userId: 'user-1' }, {
      ...shared, ...runHarness(transientStore, jobId), store: transientStore, execute: vi.fn(async () => { const error = Object.assign(new Error('provider timeout'), { status: 503 }); throw error; }), cleanup: vi.fn(),
    });
    expect(retry.status).toBe('retrying');
    expect(await transientStore.find(jobId, 'user-1')).toMatchObject({ status: 'retry_wait', failureCount: 1 });

    const terminalStore = new MemoryStore();
    const terminal = await resolved(terminalStore);
    await queueChatDubbingJob({ jobId: terminal.jobId, projectId: 'proj-1', userId: 'user-1' }, { ...shared, store: terminalStore });
    const cleanup = vi.fn(async () => undefined);
    const failed = await runChatDubbingJob({ jobId: terminal.jobId, projectId: 'proj-1', userId: 'user-1' }, {
      ...shared, ...runHarness(terminalStore, terminal.jobId), store: terminalStore, execute: vi.fn(async () => { throw new TerminalDubbingError('no-spoken-dialogue', 'nothing to dub'); }), cleanup,
    });
    expect(failed.status).toBe('failed');
    expect(cleanup).toHaveBeenCalledOnce();
    expect(await terminalStore.find(terminal.jobId, 'user-1')).toMatchObject({ status: 'failed', failureCount: 0 });
  });

  it('marks a job stale and cleans generated assets if the project changes', async () => {
    const store = new MemoryStore();
    const { jobId } = await resolved(store);
    const publish = vi.fn(async () => ({ messageId: 'msg' }));
    await queueChatDubbingJob({ jobId, projectId: 'proj-1', userId: 'user-1' }, { store, loadProject: async () => project, buildProjectRevision: () => 'revision-1', buildCheckpointId, now: () => now, publish });
    const cleanup = vi.fn(async () => undefined);
    const result = await runChatDubbingJob({ jobId, projectId: 'proj-1', userId: 'user-1' }, {
      store, ...runHarness(store, jobId), loadProject: async () => project, buildProjectRevision: () => 'revision-2', buildCheckpointId, now: () => now, publish, execute: vi.fn(), cleanup,
    });
    expect(result.status).toBe('stale');
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('keeps advanced progress retryable when continuation dispatch fails', async () => {
    const store = new MemoryStore();
    const { jobId } = await resolved(store);
    const loadProject = vi.fn(async () => project);
    const buildProjectRevision = vi.fn(() => 'revision-1');
    const publish = vi.fn()
      .mockResolvedValueOnce({ messageId: 'initial' })
      .mockRejectedValueOnce(new Error('qstash unavailable'))
      .mockResolvedValue({ messageId: 'continued' });
    await queueChatDubbingJob({ jobId, projectId: 'proj-1', userId: 'user-1' }, {
      store, loadProject, buildProjectRevision, buildCheckpointId, now: () => now, publish,
    });
    const result = await runChatDubbingJob({ jobId, projectId: 'proj-1', userId: 'user-1' }, {
      store,
      loadProject,
      buildProjectRevision,
      buildCheckpointId,
      now: () => now,
      publish,
      ...runHarness(store, jobId),
      execute: vi.fn(async () => ({
        status: 'continue' as const,
        reason: 'translated',
        progress: { stage: 'separate' as const, generatedAssetIds: ['generated-1'] },
      })),
      cleanup: vi.fn(),
    });
    expect(result).toMatchObject({ status: 'retrying', reason: expect.stringContaining('dubbing-dispatch-failed') });
    expect(await store.find(jobId, 'user-1')).toMatchObject({
      status: 'dispatch_failed',
      progress: { stage: 'separate', generatedAssetIds: ['generated-1'] },
      failureCount: 0,
    });

    const retry = await runChatDubbingJob({ jobId, projectId: 'proj-1', userId: 'user-1' }, {
      store,
      loadProject,
      buildProjectRevision,
      buildCheckpointId,
      now: () => now,
      publish,
      ...runHarness(store, jobId),
      execute: vi.fn(async () => ({
        status: 'continue' as const,
        reason: 'separated',
        progress: { stage: 'commit' as const, generatedAssetIds: ['generated-1'] },
      })),
      cleanup: vi.fn(),
    });
    expect(retry).toMatchObject({ status: 'continuing', reason: 'separated' });
  });

  it('completes against canonical checkpoints and dispatches audio render evidence', async () => {
    const store = new MemoryStore();
    const { jobId } = await resolved(store);
    const job = store.jobs.get(jobId)!;
    Object.assign(job, { status: 'queued', progress: { stage: 'commit', generatedAssetIds: [] } });
    const checkpoint = createCheckpointHarness(job);
    type TestProject = Omit<typeof project, 'overlays'> & { overlays: Array<Record<string, unknown>> };
    let currentProject: TestProject = structuredClone(project);
    const afterProject: TestProject = {
      ...structuredClone(project),
      overlays: [{ ...project.overlays[0], sourceAudioMuted: true }],
    };
    const result = await runChatDubbingJob({ jobId, projectId: 'proj-1', userId: 'user-1' }, {
      store,
      loadProject: vi.fn(async () => currentProject),
      buildProjectRevision: vi.fn(() => 'revision-1'),
      buildCheckpointId,
      now: () => now,
      publish: vi.fn(async () => ({ messageId: 'unused' })),
      execute: vi.fn(async () => {
        currentProject = afterProject;
        return {
          status: 'completed' as const,
          result: {
            committed: true,
            audioOverlayIds: [],
            projectMutationReceipt: WRITER_ISSUED_RECEIPT,
          },
        };
      }),
      cleanup: vi.fn(),
      ...checkpoint,
    });

    expect(result).toMatchObject({
      status: 'completed',
      result: {
        committed: true,
        postconditionVerification: { status: 'pass' },
        renderVerification: { dispatched: true, messageId: 'render-msg-1' },
      },
    });
    const stored = await store.find(jobId, 'user-1');
    expect(stored).toMatchObject({
      status: 'completed',
      afterCheckpointId: expect.stringMatching(/^ckpt_dub_/),
      renderVerification: { dispatched: true, messageId: 'render-msg-1' },
      result: { postconditionVerification: { status: 'pass' } },
    });
    expect(checkpoint.dispatchRenderEvidence).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'proj-1',
      userId: 'user-1',
      chatEditVerification: expect.objectContaining({
        operationId: 'operation-1',
        sessionId: 'session-1',
        subjectReceipt: WRITER_ISSUED_RECEIPT,
        modalities: ['audio'],
        beforeCheckpointId: job.beforeCheckpointId,
        afterCheckpointId: stored?.afterCheckpointId,
      }),
    }));
    expect(checkpoint.checkpoints.get(job.beforeCheckpointId!)).toMatchObject({
      operationStatus: 'completed',
      mutatingToolNames: ['dub_selected_dialogue'],
      afterCheckpointId: stored?.afterCheckpointId,
    });
    const afterCheckpointInput = checkpoint.checkpointService.createCheckpoint.mock.calls
      .map(([input]) => input)
      .find((input) => input.type === 'after-llm');
    expect(afterCheckpointInput).toEqual(expect.objectContaining({
      capturedWriterReceipt: WRITER_ISSUED_RECEIPT,
    }));
  });

  it('blocks provider commit when the originating chat checkpoint is missing', async () => {
    const store = new MemoryStore();
    const { jobId } = await resolved(store);
    const job = store.jobs.get(jobId)!;
    Object.assign(job, { status: 'queued', progress: { stage: 'commit', generatedAssetIds: [] } });
    const checkpoint = createCheckpointHarness(job);
    checkpoint.checkpoints.clear();
    const execute = vi.fn();

    const result = await runChatDubbingJob({ jobId, projectId: 'proj-1', userId: 'user-1' }, {
      store,
      loadProject: vi.fn(async () => project),
      buildProjectRevision: vi.fn(() => 'revision-1'),
      buildCheckpointId,
      now: () => now,
      publish: vi.fn(async () => ({ messageId: 'unused' })),
      execute,
      cleanup: vi.fn(),
      ...checkpoint,
    });

    expect(result).toMatchObject({
      status: 'failed',
      reason: expect.stringContaining('dubbing-before-checkpoint-identity-mismatch'),
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('uses one scoped rollback receipt for an exact postcondition rollback', async () => {
    const store = new MemoryStore();
    const { jobId } = await resolved(store);
    const job = store.jobs.get(jobId)!;
    Object.assign(job, { status: 'queued', progress: { stage: 'commit', generatedAssetIds: [] } });
    const checkpoint = createCheckpointHarness(job);

    const writerIssuedReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId: 'proj-1',
      revision: {
        schemaVersion: 1,
        value: 3,
        compatibilityUpdatedAt: '2026-07-23T00:00:02.000Z',
      },
      committedAt: '2026-07-23T00:00:02.000Z',
    };

    const result = await runChatDubbingJob({ jobId, projectId: 'proj-1', userId: 'user-1' }, {
      store,
      loadProject: vi.fn(async () => project),
      buildProjectRevision: vi.fn(() => 'revision-1'),
      buildCheckpointId,
      now: () => now,
      publish: vi.fn(async () => ({ messageId: 'unused' })),
      execute: vi.fn(async () => ({
        status: 'completed' as const,
        result: { committed: true, projectMutationReceipt: writerIssuedReceipt },
      })),
      cleanup: vi.fn(),
      ...checkpoint,
    });

    expect(result).toMatchObject({
      status: 'failed',
      reason: expect.stringContaining('dubbing-postcondition-failed'),
    });
    expect(checkpoint.checkpointService.recordRollbackExpectedRevision).toHaveBeenCalledWith(
      job.beforeCheckpointId,
      'user-1',
      'proj-1',
      `chat-dubbing:${job._id}:run:1`,
      writerIssuedReceipt,
    );
    expect(checkpoint.checkpointService.restoreProjectCheckpoint).toHaveBeenCalledWith(
      job.beforeCheckpointId,
      'user-1',
      { projectId: 'proj-1', expectedRevision: writerIssuedReceipt.revision, actorKind: 'SYSTEM' },
    );
    expect(checkpoint.checkpointService.getRollbackReceipt).not.toHaveBeenCalled();
  });

  it('captures the writer receipt when the provider throws after its project write', async () => {
    const store = new MemoryStore();
    const { jobId } = await resolved(store);
    const job = store.jobs.get(jobId)!;
    Object.assign(job, { status: 'queued', progress: { stage: 'commit', generatedAssetIds: [] } });
    const checkpoint = createCheckpointHarness(job);
    const writerIssuedReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId: 'proj-1',
      revision: {
        schemaVersion: 1,
        value: 3,
        compatibilityUpdatedAt: '2026-07-23T00:00:02.000Z',
      },
      committedAt: '2026-07-23T00:00:02.000Z',
    };

    const result = await runChatDubbingJob({ jobId, projectId: 'proj-1', userId: 'user-1' }, {
      store,
      loadProject: vi.fn(async () => project),
      buildProjectRevision: vi.fn(() => 'revision-1'),
      buildCheckpointId,
      now: () => now,
      publish: vi.fn(async () => ({ messageId: 'unused' })),
      execute: vi.fn(async () => {
        throw new Error('provider crashed after its project write');
      }),
      captureMutationReceipts: async <T,>(
        callback: () => Promise<T> | T,
        onSettled?: (receipts: readonly ProjectMutationReceiptV1[]) => void,
      ) => {
        const receipts = [writerIssuedReceipt];
        try {
          return { value: await callback(), receipts };
        } finally {
          onSettled?.(receipts);
        }
      },
      cleanup: vi.fn(),
      ...checkpoint,
    });

    expect(result).toMatchObject({ status: 'failed' });
    expect(checkpoint.checkpointService.recordRollbackExpectedRevision).toHaveBeenCalledWith(
      job.beforeCheckpointId,
      'user-1',
      'proj-1',
      `chat-dubbing:${job._id}:run:1`,
      writerIssuedReceipt,
    );
    expect(checkpoint.checkpointService.restoreProjectCheckpoint).toHaveBeenCalledWith(
      job.beforeCheckpointId,
      'user-1',
      { projectId: 'proj-1', expectedRevision: writerIssuedReceipt.revision, actorKind: 'SYSTEM' },
    );
  });

  it('fails closed when a provider crashes after a project write without a writer receipt', async () => {
    const store = new MemoryStore();
    const { jobId } = await resolved(store);
    const job = store.jobs.get(jobId)!;
    Object.assign(job, { status: 'queued', progress: { stage: 'commit', generatedAssetIds: [] } });
    const checkpoint = createCheckpointHarness(job);
    const cleanup = vi.fn();

    const result = await runChatDubbingJob({ jobId, projectId: 'proj-1', userId: 'user-1' }, {
      store,
      loadProject: vi.fn(async () => project),
      buildProjectRevision: vi.fn(() => 'revision-1'),
      buildCheckpointId,
      now: () => now,
      publish: vi.fn(async () => ({ messageId: 'unused' })),
      execute: vi.fn(async () => {
        throw new Error('provider crashed after its project write');
      }),
      cleanup,
      ...checkpoint,
    });

    expect(result).toMatchObject({
      status: 'failed',
      reason: expect.stringContaining('dubbing-writer-receipt-missing:provider crashed after its project write'),
    });
    expect(checkpoint.checkpointService.recordRollbackExpectedRevision).not.toHaveBeenCalled();
    expect(checkpoint.checkpointService.getRollbackReceipt).not.toHaveBeenCalled();
    expect(checkpoint.checkpointService.restoreProjectCheckpoint).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
    expect(checkpoint.checkpoints.get(job.beforeCheckpointId!)).toMatchObject({
      operationStatus: 'failed',
      mutatingToolNames: ['dub_selected_dialogue'],
      operationError: expect.stringContaining('rollback-not-attempted:writer-issued-receipt-missing'),
    });
    expect(await store.find(jobId, 'user-1')).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('dubbing-writer-receipt-missing'),
    });
  });

  it('rejects a provider receipt that disagrees with the writer-issued receipt', async () => {
    const store = new MemoryStore();
    const { jobId } = await resolved(store);
    const job = store.jobs.get(jobId)!;
    Object.assign(job, { status: 'queued', progress: { stage: 'commit', generatedAssetIds: [] } });
    const checkpoint = createCheckpointHarness(job);
    const writerIssuedReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId: 'proj-1',
      revision: {
        schemaVersion: 1,
        value: 3,
        compatibilityUpdatedAt: '2026-07-23T00:00:02.000Z',
      },
      committedAt: '2026-07-23T00:00:02.000Z',
    };
    const conflictingReceipt: ProjectMutationReceiptV1 = {
      ...writerIssuedReceipt,
      revision: { ...writerIssuedReceipt.revision, value: 4 },
    };

    const result = await runChatDubbingJob({ jobId, projectId: 'proj-1', userId: 'user-1' }, {
      store,
      loadProject: vi.fn(async () => project),
      buildProjectRevision: vi.fn(() => 'revision-1'),
      buildCheckpointId,
      now: () => now,
      publish: vi.fn(async () => ({ messageId: 'unused' })),
      execute: vi.fn(async () => ({
        status: 'completed' as const,
        result: { committed: true, projectMutationReceipt: conflictingReceipt },
      })),
      captureMutationReceipts: async <T,>(
        callback: () => Promise<T> | T,
        onSettled?: (receipts: readonly ProjectMutationReceiptV1[]) => void,
      ) => {
        const value = await callback();
        const receipts = [writerIssuedReceipt];
        onSettled?.(receipts);
        return { value, receipts };
      },
      cleanup: vi.fn(),
      ...checkpoint,
    });

    expect(result).toMatchObject({
      status: 'failed',
      reason: expect.stringContaining('dubbing-writer-receipt-mismatch'),
    });
    expect(checkpoint.checkpointService.recordRollbackExpectedRevision).toHaveBeenCalledWith(
      job.beforeCheckpointId,
      'user-1',
      'proj-1',
      `chat-dubbing:${job._id}:run:1`,
      writerIssuedReceipt,
    );
  });

  it('keeps a valid mutation completed but explicitly unverified when render dispatch fails', async () => {
    const store = new MemoryStore();
    const { jobId } = await resolved(store, { operationId: 'operation-dispatch-failure' });
    const job = store.jobs.get(jobId)!;
    Object.assign(job, { status: 'queued', progress: { stage: 'commit', generatedAssetIds: [] } });
    const checkpoint = createCheckpointHarness(job);
    checkpoint.dispatchRenderEvidence.mockRejectedValueOnce(new Error('qstash unavailable'));
    type TestProject = Omit<typeof project, 'overlays'> & { overlays: Array<Record<string, unknown>> };
    let currentProject: TestProject = structuredClone(project);

    const result = await runChatDubbingJob({ jobId, projectId: 'proj-1', userId: 'user-1' }, {
      store,
      loadProject: vi.fn(async () => currentProject),
      buildProjectRevision: vi.fn(() => 'revision-1'),
      buildCheckpointId,
      now: () => now,
      publish: vi.fn(async () => ({ messageId: 'unused' })),
      execute: vi.fn(async () => {
        currentProject = {
          ...structuredClone(project),
          overlays: [{ ...project.overlays[0], sourceAudioMuted: true }],
        };
        return {
          status: 'completed' as const,
          result: { committed: true, projectMutationReceipt: WRITER_ISSUED_RECEIPT },
        };
      }),
      cleanup: vi.fn(),
      ...checkpoint,
    });

    expect(result).toMatchObject({
      status: 'completed',
      result: {
        committed: true,
        renderVerification: {
          dispatched: false,
          reason: expect.stringContaining('dubbing-render-verification-dispatch-failed'),
        },
      },
    });
    expect(await store.find(jobId, 'user-1')).toMatchObject({
      status: 'completed',
      failureCount: 0,
      renderVerification: { dispatched: false },
    });
  });
});
