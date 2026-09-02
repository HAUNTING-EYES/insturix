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
  buildChatEditorialIntentProjectBrief,
  queueChatEditorialIntentJob,
  reconcileChatEditorialIntentMgChild,
  runChatEditorialIntentJob,
  type ChatEditorialIntentJob,
  type ChatEditorialIntentJobStore,
} from '@/lib/editron/services/chat-editorial-intent-job';
import type {
  Checkpoint,
  CheckpointRollbackReceiptV1,
  RestorableProjectState,
  RestoreProjectCheckpointResult,
} from '@/lib/editron/services/checkpoint-service';
import type {
  ProjectMutationReceiptV1,
  ProjectRevisionV1,
} from '@/lib/editron/services/project-service';
import { planUnifiedDecisionBundleFromCandidates } from '@/lib/editron/services/unified-decision-bundle';

const NOW = new Date('2026-07-24T10:00:00.000Z');
const CAPTURED_REVISION: ProjectRevisionV1 = {
  schemaVersion: 1,
  value: 7,
  compatibilityUpdatedAt: '2026-07-24T10:00:01.000Z',
};
const ROLLBACK_RECEIPT: CheckpointRollbackReceiptV1 = {
  schemaVersion: 1,
  receiptId: 'test-editorial-rollback-receipt',
  expectedRevision: CAPTURED_REVISION,
};

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
    const writerIssuedReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId: 'project-1',
      revision: { ...CAPTURED_REVISION, value: 8 },
      committedAt: '2026-07-24T10:00:02.000Z',
    };

    const result = await runChatEditorialIntentJob(workerPayload(), {
      store,
      loadProject: async () => structuredClone(currentProject),
      executeDirector: async () => {
        order.push('director');
        currentProject = project('after');
        return directorResult(1);
      },
      captureMutationReceipts: async <T,>(
        callback: () => Promise<T> | T,
        onSettled?: (receipts: readonly ProjectMutationReceiptV1[]) => void,
      ) => {
        const receipts = [writerIssuedReceipt];
        const value = await callback();
        onSettled?.(receipts);
        return { value, receipts };
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
    const attemptOperationId = checkpoint.claimChatEditOperation.mock.calls[0]?.[0].operationId;
    expect(attemptOperationId).toBe('operation-intent-1:editorial-intent:attempt:1');
    expect(checkpoint.createCheckpoint.mock.calls[0]?.[0].operationId).toBe(attemptOperationId);
    expect(checkpoint.createCheckpoint.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      capturedWriterReceipt: writerIssuedReceipt,
    }));
    expect(checkpoint.recordRollbackExpectedRevision).toHaveBeenCalledWith(
      'job-intent-1:before:attempt:1',
      'user-1',
      'project-1',
      'chat-editorial-intent:job-intent-1:attempt:1',
      writerIssuedReceipt,
    );
    expect(dispatchRenderEvidence).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      userId: 'user-1',
      chatEditVerification: expect.objectContaining({
        operationId: attemptOperationId,
        subjectReceipt: writerIssuedReceipt,
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

  it('fails closed without restoring when a Director timeout has no writer receipt', async () => {
    const store = new MemoryStore(queuedJob());
    const checkpoint = checkpointRuntime([]);

    const result = await runChatEditorialIntentJob(workerPayload(), {
      store,
      loadProject: async () => project('before'),
      executeDirector: async () => {
        throw new Error('Gemini timeout while planning');
      },
      dispatchRenderEvidence: vi.fn(),
      ...checkpoint.dependencies,
      now: () => NOW,
    });

    expect(result).toMatchObject({
      status: 'failed',
      reason: expect.stringContaining('Rollback was not attempted because no writer-issued mutation receipt was captured'),
    });
    expect(checkpoint.restoreProjectCheckpoint).not.toHaveBeenCalled();
    expect(checkpoint.recordRollbackExpectedRevision).not.toHaveBeenCalled();
    expect(store.jobs.get('job-intent-1')).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('Gemini timeout while planning'),
    });
  });

  it('binds a Director error-after-write rollback to the writer-issued revision', async () => {
    const store = new MemoryStore(queuedJob());
    const checkpoint = checkpointRuntime([]);
    const writerIssuedReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId: 'project-1',
      revision: { ...CAPTURED_REVISION, value: 8 },
      committedAt: '2026-07-24T10:00:02.000Z',
    };
    const result = await runChatEditorialIntentJob(workerPayload(), {
      store,
      loadProject: async () => project('before'),
      executeDirector: async () => {
        throw new Error('Director crashed after its project write');
      },
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
      dispatchRenderEvidence: vi.fn(),
      ...checkpoint.dependencies,
      now: () => NOW,
    });

    expect(result).toMatchObject({ status: 'failed' });
    expect(checkpoint.recordRollbackExpectedRevision).toHaveBeenCalledWith(
      'job-intent-1:before:attempt:1',
      'user-1',
      'project-1',
      'chat-editorial-intent:job-intent-1:attempt:1',
      writerIssuedReceipt,
    );
    expect(checkpoint.restoreProjectCheckpoint).toHaveBeenCalledWith(
      'job-intent-1:before:attempt:1',
      'user-1',
      { projectId: 'project-1', expectedRevision: writerIssuedReceipt.revision, actorKind: 'SYSTEM' },
    );
  });

  it('refuses a stale post-Director rollback receipt without a second mutation', async () => {
    const store = new MemoryStore(queuedJob());
    const checkpoint = checkpointRuntime([]);
    const writerIssuedReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId: 'project-1',
      revision: { ...CAPTURED_REVISION, value: 8 },
      committedAt: '2026-07-24T10:00:02.000Z',
    };
    checkpoint.restoreProjectCheckpoint.mockResolvedValueOnce({
      restored: false,
      checkpointId: 'job-intent-1:before:attempt:1',
      expectedStateHash: 'before',
      reason: 'project-revision-conflict',
      beforeRevision: ROLLBACK_RECEIPT.expectedRevision,
      currentRevision: { ...ROLLBACK_RECEIPT.expectedRevision, value: 8 },
    });

    const result = await runChatEditorialIntentJob(workerPayload(), {
      store,
      loadProject: async () => project('before'),
      executeDirector: async () => directorResult(1),
      captureMutationReceipts: captureWriterReceipt(writerIssuedReceipt),
      dispatchRenderEvidence: vi.fn(),
      ...checkpoint.dependencies,
      now: () => NOW,
    });

    expect(result).toMatchObject({
      status: 'failed',
      reason: expect.stringContaining('editorial-intent-rollback-failed:project-revision-conflict'),
    });
    expect(checkpoint.recordRollbackExpectedRevision).toHaveBeenCalledWith(
      'job-intent-1:before:attempt:1',
      'user-1',
      'project-1',
      'chat-editorial-intent:job-intent-1:attempt:1',
      writerIssuedReceipt,
    );
    expect(checkpoint.restoreProjectCheckpoint).toHaveBeenCalledWith(
      'job-intent-1:before:attempt:1',
      'user-1',
      { projectId: 'project-1', expectedRevision: writerIssuedReceipt.revision, actorKind: 'SYSTEM' },
    );
    expect(store.jobs.get('job-intent-1')).toMatchObject({ status: 'failed' });
  });

  it('persists completed-unverified when rendered evidence cannot be dispatched', async () => {
    const store = new MemoryStore(queuedJob());
    let currentProject = project('before');
    const checkpoint = checkpointRuntime([]);
    const writerIssuedReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId: 'project-1',
      revision: { ...CAPTURED_REVISION, value: 8 },
      committedAt: '2026-07-24T10:00:02.000Z',
    };

    const result = await runChatEditorialIntentJob(workerPayload(), {
      store,
      loadProject: async () => structuredClone(currentProject),
      executeDirector: async () => {
        currentProject = project('after');
        return directorResult(1);
      },
      captureMutationReceipts: captureWriterReceipt(writerIssuedReceipt),
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

  it('waits for durable MG children instead of falsely declining an asynchronous render', async () => {
    const store = new MemoryStore(queuedJob());
    let loadCount = 0;
    const checkpoint = checkpointRuntime([]);

    const result = await runChatEditorialIntentJob(workerPayload(), {
      store,
      loadProject: async () => {
        loadCount += 1;
        return loadCount === 1
          ? project('before')
          : {
            ...project('before'),
            intelligence: {
              mgCodegenRun: {
                outcomes: [
                  { status: 'queued', jobId: 'mgr_bbbbbbbbbbbbbbbbbbbbbbbb' },
                  { status: 'queued', jobId: 'mgr_aaaaaaaaaaaaaaaaaaaaaaaa' },
                  { status: 'queued', jobId: 'mgr_bbbbbbbbbbbbbbbbbbbbbbbb' },
                ],
              },
            },
          };
      },
      executeDirector: async () => directorResult(0),
      loadChildJobs: async (jobIds) => jobIds.map((jobId) => ({
        _id: jobId,
        status: 'queued' as const,
        result: null,
        lastError: null,
      })),
      ...checkpoint.dependencies,
      now: () => NOW,
    });

    expect(result).toEqual({
      status: 'waiting_children',
      jobId: 'job-intent-1',
      reason: 'waiting-for-async-mg-render:2',
    });
    expect(store.jobs.get('job-intent-1')).toMatchObject({
      status: 'waiting_children',
      pendingChildJobIds: [
        'mgr_aaaaaaaaaaaaaaaaaaaaaaaa',
        'mgr_bbbbbbbbbbbbbbbbbbbbbbbb',
      ],
      result: {
        overlaysModified: 0,
        lifecycle: 'waiting-for-async-mg-render',
      },
    });
    expect(store.jobs.get('job-intent-1')?.completedAt).toBeUndefined();
    expect(checkpoint.dependencies.checkpointService.updateChatEditOperationScoped).not.toHaveBeenCalled();
  });

  it('leaves a generated MG child unverified until it has its own writer receipt', async () => {
    const parent = waitingParentJob(['mgr_aaaaaaaaaaaaaaaaaaaaaaaa']);
    const store = new MemoryStore(parent);
    const checkpoint = checkpointRuntime([]);
    checkpoint.seedBeforeCheckpoint(parent, project('before'));
    const afterProject = {
      ...project('before'),
      overlays: [
        ...project('before').overlays,
        {
          id: 'mg-sequence-1',
          type: 'motion-graphic',
          from: 90,
          durationInFrames: 90,
          row: 3,
          metadata: { mgRenderJobId: 'mgr_aaaaaaaaaaaaaaaaaaaaaaaa' },
        },
      ],
    };
    const dispatchRenderEvidence = vi.fn(async () => ({
      dispatched: true,
      messageId: 'render-mg-parent-1',
    }));
    const loadChildJobs = vi.fn(async () => [{
      _id: 'mgr_aaaaaaaaaaaaaaaaaaaaaaaa',
      status: 'completed' as const,
      result: {
        status: 'generated',
        sequence: { address: { sequenceId: 'seq-1' } },
        receipt: {
          outcome: 'generated',
          promptHash: 'prompt-hash-1',
          attempts: 1,
          compiled: true,
          scans: [{ passed: true }],
          judgeScore: 8.75,
          judgeIssues: [],
        },
      },
      lastError: null,
    }]);

    const first = await reconcileChatEditorialIntentMgChild({
      jobId: 'mgr_aaaaaaaaaaaaaaaaaaaaaaaa',
      projectId: 'project-1',
      userId: 'user-1',
    }, {
      store,
      loadChildJobs,
      loadProject: async () => structuredClone(afterProject),
      dispatchRenderEvidence,
      ...checkpoint.dependencies,
      now: () => NOW,
    });
    const replay = await reconcileChatEditorialIntentMgChild({
      jobId: 'mgr_aaaaaaaaaaaaaaaaaaaaaaaa',
      projectId: 'project-1',
      userId: 'user-1',
    }, {
      store,
      loadChildJobs,
      loadProject: async () => structuredClone(afterProject),
      dispatchRenderEvidence,
      ...checkpoint.dependencies,
      now: () => NOW,
    });

    expect(first).toEqual({ reconciled: 1, waiting: 0 });
    expect(replay).toEqual({ reconciled: 0, waiting: 0 });
    expect(store.jobs.get(parent._id)).toMatchObject({
      status: 'completed_unverified',
      afterCheckpointId: undefined,
      error: 'editorial-intent-mg-child-writer-receipt-missing',
      renderVerification: {
        dispatched: false,
        reason: 'editorial-intent-mg-child-writer-receipt-missing',
      },
      result: {
        lifecycle: 'async-mg-render-reconciled',
        generatedChildJobIds: ['mgr_aaaaaaaaaaaaaaaaaaaaaaaa'],
        childOutcomes: [{
          jobId: 'mgr_aaaaaaaaaaaaaaaaaaaaaaaa',
          jobStatus: 'completed',
          outcome: 'generated',
          receipt: {
            promptHash: 'prompt-hash-1',
            attempts: 1,
            compiled: true,
            scans: [{ passed: true }],
            judgeScore: 8.75,
          },
        }],
      },
    });
    expect(checkpoint.createCheckpoint).not.toHaveBeenCalled();
    expect(dispatchRenderEvidence).not.toHaveBeenCalled();
  });

  it('declines only after every MG child is terminal and none changed canonical project state', async () => {
    const parent = waitingParentJob([
      'mgr_aaaaaaaaaaaaaaaaaaaaaaaa',
      'mgr_bbbbbbbbbbbbbbbbbbbbbbbb',
    ]);
    const store = new MemoryStore(parent);
    const checkpoint = checkpointRuntime([]);
    checkpoint.seedBeforeCheckpoint(parent, project('before'));
    const children = [
      {
        _id: 'mgr_aaaaaaaaaaaaaaaaaaaaaaaa',
        status: 'completed' as const,
        result: { status: 'declined', reason: 'not visually explainable' },
        lastError: null,
      },
      {
        _id: 'mgr_bbbbbbbbbbbbbbbbbbbbbbbb',
        status: 'failed' as const,
        result: null,
        lastError: 'terminal provider failure',
      },
    ];

    const result = await reconcileChatEditorialIntentMgChild({
      jobId: 'mgr_bbbbbbbbbbbbbbbbbbbbbbbb',
      projectId: 'project-1',
      userId: 'user-1',
    }, {
      store,
      loadChildJobs: async () => children,
      loadProject: async () => project('before'),
      dispatchRenderEvidence: vi.fn(),
      ...checkpoint.dependencies,
      now: () => NOW,
    });

    expect(result).toEqual({ reconciled: 1, waiting: 0 });
    expect(store.jobs.get(parent._id)).toMatchObject({
      status: 'declined',
      result: {
        lifecycle: 'async-mg-render-reconciled',
        childOutcomes: [
          expect.objectContaining({ outcome: 'declined', reason: 'not visually explainable' }),
          expect.objectContaining({ outcome: 'failed', error: 'terminal provider failure' }),
        ],
      },
    });
    expect(checkpoint.createCheckpoint).not.toHaveBeenCalled();
    expect(
      checkpoint.dependencies.checkpointService.updateChatEditOperationScoped,
    ).toHaveBeenCalledWith(
      parent.beforeCheckpointId,
      'user-1',
      'project-1',
      'operation-intent-1:editorial-intent:attempt:1',
      { operationStatus: 'no-op', mutatingToolNames: [] },
    );
  });

  it('tracks the deferred MG design job as a pending child instead of declining mid-chain', async () => {
    const store = new MemoryStore(queuedJob());
    const checkpoint = checkpointRuntime([]);

    const result = await runChatEditorialIntentJob(workerPayload(), {
      store,
      loadProject: async () => project('before'),
      executeDirector: async () => ({
        ...directorResult(0),
        pendingAsyncChildJobIds: ['mgd_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
      }),
      loadChildJobs: async (jobIds) => jobIds.map((jobId) => ({
        _id: jobId,
        status: 'queued' as const,
        result: null,
        lastError: null,
        kind: 'design' as const,
      })),
      ...checkpoint.dependencies,
      now: () => NOW,
    });

    expect(result).toEqual({
      status: 'waiting_children',
      jobId: 'job-intent-1',
      reason: 'waiting-for-async-mg-render:1',
    });
    expect(store.jobs.get('job-intent-1')).toMatchObject({
      status: 'waiting_children',
      pendingChildJobIds: ['mgd_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    });
  });

  it('adopts the render jobs a completed MG design child queued', async () => {
    const parent = waitingParentJob(['mgd_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']);
    const store = new MemoryStore(parent);
    const checkpoint = checkpointRuntime([]);
    checkpoint.seedBeforeCheckpoint(parent, project('before'));

    const result = await reconcileChatEditorialIntentMgChild({
      jobId: 'mgd_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      projectId: 'project-1',
      userId: 'user-1',
    }, {
      store,
      loadChildJobs: async () => [{
        _id: 'mgd_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        status: 'completed' as const,
        result: { renderJobsQueued: 1, approvedCount: 1 },
        lastError: null,
        kind: 'design' as const,
      }],
      loadProject: async () => ({
        ...project('before'),
        intelligence: {
          mgCodegenRun: {
            outcomes: [{ status: 'queued', jobId: 'mgr_bbbbbbbbbbbbbbbbbbbbbbbbbbbb' }],
          },
        },
      }),
      dispatchRenderEvidence: vi.fn(),
      ...checkpoint.dependencies,
      now: () => NOW,
    });

    expect(result).toEqual({ reconciled: 0, waiting: 1 });
    expect(store.jobs.get(parent._id)).toMatchObject({
      status: 'waiting_children',
      pendingChildJobIds: [
        'mgd_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'mgr_bbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      ],
    });
  });

  it('declines when the design child completes without queueing any render job', async () => {
    const parent = waitingParentJob(['mgd_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']);
    const store = new MemoryStore(parent);
    const checkpoint = checkpointRuntime([]);
    checkpoint.seedBeforeCheckpoint(parent, project('before'));

    const result = await reconcileChatEditorialIntentMgChild({
      jobId: 'mgd_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      projectId: 'project-1',
      userId: 'user-1',
    }, {
      store,
      loadChildJobs: async () => [{
        _id: 'mgd_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        status: 'completed' as const,
        result: { renderJobsQueued: 0, approvedCount: 0, declinedCount: 1 },
        lastError: null,
        kind: 'design' as const,
      }],
      loadProject: async () => project('before'),
      dispatchRenderEvidence: vi.fn(),
      ...checkpoint.dependencies,
      now: () => NOW,
    });

    expect(result).toEqual({ reconciled: 1, waiting: 0 });
    expect(store.jobs.get(parent._id)).toMatchObject({
      status: 'declined',
      result: { lifecycle: 'async-mg-render-reconciled' },
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
    const executionScope = {
      version: 'editorial-execution-scope-v1' as const,
      source: 'chat-editorial-intent' as const,
      mode: 'explicit-families-only' as const,
      families: ['motionGraphics' as const],
    };
    const motionGraphicsBrief = buildChatEditorialIntentProjectBrief({
      ...request().intent,
      executionScope,
      editorialPreferences: {
        families: {
          motionGraphics: { mode: 'prefer', frequency: 0.5, intensity: 0.7 },
        },
        notes: 'Keep the composition restrained.',
      },
    });

    expect(motionGraphicsBrief.executionScope).toEqual(executionScope);
    expect(motionGraphicsBrief.editorialPreferences).toEqual({
      families: {
        motionGraphics: { mode: 'prefer', frequency: 0.5, intensity: 0.7 },
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
      executionScope: {
        version: 'editorial-execution-scope-v1',
        source: 'chat-editorial-intent',
        mode: 'explicit-families-only',
        families: ['motionGraphics'],
      },
      editorialPreferences: {
        families: { motionGraphics: { mode: 'prefer' } },
      },
    }).executionScope;

    for (const effect of [
      'canonical-captions',
      'auto-bgm',
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
    expect(source).toContain("effect: 'canonical-captions'");
    expect(source).toContain("effect: 'auto-bgm'");
    expect(source).toContain("effect: 'transition-dedup'");
    expect(source).toContain("effect: 'beat-sync'");
    expect(source).toContain("effect: 'transition-sfx'");
    expect(source).toContain("effect: 'audio-ducking'");
    expect(source).toContain('Legacy intelligence fallback disabled for scoped chat execution');
  });

  it('keeps unrequested planner families as audited evidence instead of executable edits', () => {
    const executionScope = {
      version: 'editorial-execution-scope-v1' as const,
      source: 'chat-editorial-intent' as const,
      mode: 'explicit-families-only' as const,
      families: ['motionGraphics' as const],
    };
    const bundle = planUnifiedDecisionBundleFromCandidates([{
      source: 'signal-driven',
      edl: {
        projectId: 'project-1',
        decisions: [{
          type: 'transition',
          frame: 90,
          durationFrames: 12,
          priority: 0.8,
          source: 'test-boundary',
          signal: 'topic_shift',
          reason: 'A real cut boundary exists.',
          confidence: 0.9,
          params: {},
        }],
      },
    }], { executionScope });

    expect(bundle?.edl.decisions).toEqual([]);
    expect(bundle?.evidence.signalDecisionAudit.byReason).toMatchObject({
      'execution-scope-unrequested:transitions': { count: 1 },
    });
    const directorSource = readFileSync(
      resolve(process.cwd(), 'lib/editron/agent/director-agent.ts'),
      'utf8',
    );
    expect(directorSource).toContain('executionScope: editorialExecutionScope');
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

  async markWaitingChildren(
    jobId: string,
    userId: string,
    childJobIds: string[],
    result: Record<string, unknown>,
    now: Date,
  ) {
    Object.assign(this.owned(jobId, userId), {
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
    return Array.from(this.jobs.values())
      .filter((job) => (
        job.projectId === projectId
        && job.userId === userId
        && ['waiting_children', 'reconciling_children'].includes(job.status)
        && job.pendingChildJobIds?.includes(childJobId)
      ))
      .map((job) => structuredClone(job));
  }

  async claimChildReconciliation(jobId: string, userId: string, leaseId: string, now: Date) {
    const job = this.owned(jobId, userId);
    const reclaimable = job.status === 'waiting_children'
      || (job.status === 'reconciling_children' && Boolean(job.leaseExpiresAt && job.leaseExpiresAt <= now));
    if (!reclaimable) return null;
    Object.assign(job, {
      status: 'reconciling_children',
      leaseId,
      leaseExpiresAt: new Date(now.getTime() + 60_000),
      error: null,
      updatedAt: now,
    });
    return structuredClone(job);
  }

  async releaseChildReconciliation(
    jobId: string,
    userId: string,
    leaseId: string,
    error: string,
    now: Date,
  ) {
    const job = this.owned(jobId, userId);
    if (job.status !== 'reconciling_children' || job.leaseId !== leaseId) {
      throw new Error('lost child reconciliation lease');
    }
    Object.assign(job, {
      status: 'waiting_children',
      leaseId: null,
      leaseExpiresAt: null,
      error,
      updatedAt: now,
    });
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
    afterCheckpointId?: string;
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

function waitingParentJob(pendingChildJobIds: string[]): ChatEditorialIntentJob {
  const job = queuedJob();
  return {
    ...job,
    status: 'waiting_children',
    attemptCount: 1,
    beforeCheckpointId: `${job._id}:before:attempt:1`,
    pendingChildJobIds,
    result: {
      overlaysModified: 0,
      lifecycle: 'waiting-for-async-mg-render',
    },
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
    projectRevision: content === 'before' ? 7 : 8,
    updatedAt: new Date(CAPTURED_REVISION.compatibilityUpdatedAt),
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

function captureWriterReceipt(receipt: ProjectMutationReceiptV1) {
  return async <T>(
    callback: () => Promise<T> | T,
    onSettled?: (receipts: readonly ProjectMutationReceiptV1[]) => void,
  ): Promise<{ value: T; receipts: ProjectMutationReceiptV1[] }> => {
    const receipts = [receipt];
    try {
      return { value: await callback(), receipts };
    } finally {
      onSettled?.(receipts);
    }
  };
}

function checkpointRuntime(order: string[]) {
  const checkpoints = new Map<string, Checkpoint>();
  const seedBeforeCheckpoint = (
    job: ChatEditorialIntentJob,
    value: Record<string, unknown>,
  ) => {
    if (!job.beforeCheckpointId) throw new Error('waiting parent requires a before checkpoint id');
    const projectState: RestorableProjectState = {
      presentFields: ['overlays', 'fps', 'durationInFrames'],
      fields: {
        overlays: value.overlays ?? [],
        fps: value.fps,
        durationInFrames: value.durationInFrames,
      },
    };
    checkpoints.set(
      job.beforeCheckpointId,
      checkpoint(job.beforeCheckpointId, attemptOperationId(job), projectState),
    );
  };
  const claimChatEditOperation = vi.fn(async (input: Parameters<CheckpointRuntime['claimChatEditOperation']>[0]) => {
    order.push('before-checkpoint');
    const value = checkpoint(input.checkpointId, input.operationId, input.projectState);
    checkpoints.set(input.checkpointId, value);
    return {
      claimed: true,
      checkpoint: value,
    };
  });
  const createCheckpoint = vi.fn(async (input: Parameters<CheckpointRuntime['createCheckpoint']>[0]) => {
    order.push('after-checkpoint');
    const value = checkpoint(input.checkpointId!, input.operationId!, input.projectState!);
    checkpoints.set(value.checkpointId, value);
    return value;
  });
  const getCheckpoint = vi.fn(async (checkpointId: string, userId: string, projectId?: string) => {
    const value = checkpoints.get(checkpointId);
    return value?.userId === userId && (!projectId || value.projectId === projectId)
      ? structuredClone(value)
      : null;
  });
  const recordRollbackExpectedRevision = vi.fn(async (
    checkpointId: string,
    userId: string,
    projectId: string,
    receiptId: string,
    writerIssuedReceipt: ProjectMutationReceiptV1,
  ) => {
    const value = checkpoints.get(checkpointId);
    if (!value || value.userId !== userId || value.projectId !== projectId) {
      throw new Error('checkpoint-not-found-for-rollback-receipt');
    }
    if (!writerIssuedReceipt) {
      throw new Error('writer-issued-mutation-receipt-required-for-rollback');
    }
    return {
      ...ROLLBACK_RECEIPT,
      receiptId,
      expectedRevision: writerIssuedReceipt.revision,
    };
  });
  const updateChatEditOperationScoped = vi.fn(async () => undefined);
  const restoreProjectCheckpoint = vi.fn(async (
    checkpointId: string,
    _userId: string,
    options: { projectId: string; expectedRevision: ProjectRevisionV1 },
  ): Promise<RestoreProjectCheckpointResult> => ({
    restored: true,
    checkpointId,
    expectedStateHash: 'before',
    actualStateHash: 'before',
    beforeRevision: options.expectedRevision,
    restoredRevision: options.expectedRevision,
  }));
  const checkpointService = {
    claimChatEditOperation,
    createCheckpoint,
    getCheckpoint,
    recordRollbackExpectedRevision,
    updateChatEditOperationScoped,
    restoreProjectCheckpoint,
  };
  return {
    claimChatEditOperation,
    createCheckpoint,
    recordRollbackExpectedRevision,
    seedBeforeCheckpoint,
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
        subjectReceipt?: ProjectMutationReceiptV1;
      }) => ({
        version: 'editron-chat-render-verification-v1' as const,
        operationId: input.transaction.operationId,
        sessionId: input.transaction.sessionId,
        beforeCheckpointId: input.transaction.beforeCheckpointId,
        afterCheckpointId: input.afterCheckpointId,
        subjectReceipt: input.subjectReceipt,
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

function attemptOperationId(job: ChatEditorialIntentJob) {
  return `${job.operationId}:editorial-intent:attempt:${job.attemptCount}`;
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
    capturedWriterReceipt?: ProjectMutationReceiptV1;
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
    capturedProjectRevision: CAPTURED_REVISION,
    operationId,
    operationStatus: 'running',
    timestamp: NOW,
    description: 'test checkpoint',
    type: checkpointId.includes(':after:') ? 'after-llm' : 'before-llm',
    createdAt: NOW,
  };
}
