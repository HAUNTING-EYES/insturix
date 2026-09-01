import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CHAT_REFERENCE_STYLE_MAX_ATTEMPTS,
  CHAT_REFERENCE_STYLE_JOB_VERSION,
  applyReferenceStyleProfileThroughUnifiedPlanner,
  buildReferenceStyleProjectBrief,
  queueChatReferenceStyleJob,
  runChatReferenceStyleJob,
  sweepChatReferenceStyleJobs,
  type ChatReferenceStyleJob,
  type ChatReferenceStyleJobStore,
} from '@/lib/editron/services/chat-reference-style-job';
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

const NOW = new Date('2026-07-18T10:00:00.000Z');
const ROLLBACK_RECEIPT: CheckpointRollbackReceiptV1 = {
  schemaVersion: 1,
  receiptId: 'test-style-receipt',
  expectedRevision: {
    schemaVersion: 1,
    value: 4,
    compatibilityUpdatedAt: '2026-07-18T10:00:01.000Z',
  },
};

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
    const writerIssuedReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId: 'project-1',
      revision: { ...ROLLBACK_RECEIPT.expectedRevision, value: 5 },
      committedAt: '2026-07-18T10:00:02.000Z',
    };

    const result = await runChatReferenceStyleJob(workerPayload(), {
      store,
      loadProject: async () => structuredClone(currentProject),
      extractProfile,
      applyProfile,
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
    expect(store.jobs.get('job-style-1')?.renderOperationId).toBe(attemptOperationId);
    expect(checkpoint.createCheckpoint.mock.calls[0]?.[0].operationId).toBe(attemptOperationId);
    const afterCheckpointInput = checkpoint.createCheckpoint.mock.calls[0]?.[0];
    expect(afterCheckpointInput).toEqual(expect.objectContaining({
      capturedWriterReceipt: writerIssuedReceipt,
    }));
    expect(checkpoint.recordRollbackExpectedRevision).toHaveBeenCalledWith(
      expect.any(String),
      'user-1',
      'project-1',
      'chat-reference-style:job-style-1:attempt:1',
      writerIssuedReceipt,
    );
    expect(dispatchRenderEvidence).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      userId: 'user-1',
      chatEditVerification: expect.objectContaining({
        operationId: attemptOperationId,
        subjectReceipt: writerIssuedReceipt,
        modalities: ['visual'],
        targets: [expect.objectContaining({ overlayId: 'title-1', state: 'updated' })],
      }),
    }));
  });

  it('binds a style error-after-write rollback to the writer-issued revision', async () => {
    const store = new MemoryStore(queuedJob());
    const checkpoint = installCheckpointSpies([]);
    const writerIssuedReceipt: ProjectMutationReceiptV1 = {
      schemaVersion: 1,
      projectId: 'project-1',
      revision: { ...ROLLBACK_RECEIPT.expectedRevision, value: 5 },
      committedAt: '2026-07-18T10:00:02.000Z',
    };

    const result = await runChatReferenceStyleJob(workerPayload(), {
      store,
      loadProject: async () => project('before'),
      extractProfile: async () => 'style-profile-1',
      applyProfile: async () => {
        throw new Error('Style application crashed after its project write');
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
      expect.any(String),
      'user-1',
      'project-1',
      'chat-reference-style:job-style-1:attempt:1',
      writerIssuedReceipt,
    );
    expect(checkpoint.restoreProjectCheckpoint).toHaveBeenCalledWith(
      expect.any(String),
      'user-1',
      { projectId: 'project-1', expectedRevision: writerIssuedReceipt.revision, actorKind: 'SYSTEM' },
    );
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
    expect(checkpoint.updateChatEditOperationScoped).toHaveBeenCalledWith(
      expect.any(String),
      'user-1',
      'project-1',
      expect.any(String),
      { operationStatus: 'no-op', mutatingToolNames: [] },
    );
    expect(dispatchRenderEvidence).not.toHaveBeenCalled();
  });

  it('applies a reference profile inside its owning durable transaction without nesting apply_style', async () => {
    const job = queuedJob();
    const loadProfile = vi.fn(async () => referenceProfile());
    const executeDirector = vi.fn(async () => ({
      success: true,
      overlaysModified: 3,
      warnings: [],
      actionsSkipped: [],
      decisionAuthority: { executableProducer: 'unified-planner' },
    }));

    const result = await applyReferenceStyleProfileThroughUnifiedPlanner(
      job,
      'style-profile-1',
      { loadProfile, executeDirector },
    );

    expect(result).toMatchObject({
      status: 'mutated',
      data: {
        profileId: 'style-profile-1',
        overlaysModified: 3,
        appliedThrough: 'director-unified-planner',
      },
    });
    expect(executeDirector).toHaveBeenCalledWith(
      'project-1',
      'user-1',
      'style-profile-1',
      expect.objectContaining({
        intent: expect.stringContaining('observation, not a forced form'),
        editorialPreferences: expect.objectContaining({
          families: expect.objectContaining({
            transitions: { mode: 'prefer' },
            music: { mode: 'prefer' },
          }),
        }),
      }),
    );
  });

  it('keeps reference measurements as context instead of concrete renderer forms', () => {
    const brief = buildReferenceStyleProjectBrief(referenceProfile(), 0.65);

    expect(brief.intent).toContain('Reference influence is 0.65');
    expect(brief.intent).toContain('family planners must resolve readable forms');
    expect(brief.editorialPreferences).not.toHaveProperty('transitionType');
    expect(brief.editorialPreferences).not.toHaveProperty('graphicType');
  });

  it('retries a transient extraction failure without creating or restoring a mutation checkpoint', async () => {
    const store = new MemoryStore(queuedJob());
    const checkpoint = installCheckpointSpies([]);

    const run = runChatReferenceStyleJob(workerPayload(), {
      store,
      loadProject: async () => project('before'),
      extractProfile: async () => { throw new Error('Gemini 429 RESOURCE_EXHAUSTED'); },
      applyProfile: vi.fn(),
      dispatchRenderEvidence: vi.fn(),
      ...checkpoint.dependencies,
      now: () => NOW,
    });

    await expect(run).rejects.toMatchObject({
      name: 'ChatReferenceStyleRetryableError',
      retryAt: expect.any(Date),
    });

    const persisted = store.jobs.get('job-style-1');
    expect(persisted).toMatchObject({
      status: 'retry_wait',
      attemptCount: 1,
      beforeCheckpointId: null,
      nextAttemptAt: expect.any(Date),
    });
    expect(persisted!.nextAttemptAt!.getTime()).toBeGreaterThanOrEqual(NOW.getTime() + 60_000);
    expect(checkpoint.claimChatEditOperation).not.toHaveBeenCalled();
    expect(checkpoint.restoreProjectCheckpoint).not.toHaveBeenCalled();
  });

  it('does not consume an attempt when a QStash retry arrives before the durable retry time', async () => {
    const pendingRetry = {
      ...queuedJob(),
      status: 'retry_wait' as const,
      attemptCount: 1,
      nextAttemptAt: new Date(NOW.getTime() + 60_000),
    };
    const store = new MemoryStore(pendingRetry);
    const checkpoint = installCheckpointSpies([]);
    const extractProfile = vi.fn();

    const result = await runChatReferenceStyleJob(workerPayload(), {
      store,
      loadProject: async () => project('before'),
      extractProfile,
      applyProfile: vi.fn(),
      dispatchRenderEvidence: vi.fn(),
      ...checkpoint.dependencies,
      now: () => NOW,
    });

    expect(result).toEqual({
      status: 'retrying',
      jobId: 'job-style-1',
      reason: 'job-not-claimable:retry_wait',
      retryAt: new Date(NOW.getTime() + 60_000).toISOString(),
    });
    expect(store.jobs.get('job-style-1')?.attemptCount).toBe(1);
    expect(extractProfile).not.toHaveBeenCalled();
  });

  it('restores an interrupted attempt before reclaiming an expired lease', async () => {
    const interrupted = {
      ...queuedJob(),
      status: 'running' as const,
      attemptCount: 1,
      leaseId: 'expired-lease',
      leaseExpiresAt: new Date(NOW.getTime() - 1),
      beforeCheckpointId: 'ckpt-interrupted',
    };
    const store = new MemoryStore(interrupted);
    let currentProject = project('before');
    const order: string[] = [];
    const checkpoint = installCheckpointSpies(order);
    checkpoint.seedCheckpoint(
      'ckpt-interrupted',
      'style_17f18699eb3b408d0d81bcf234f73a4c',
      'chat-reference-style:job-style-1:attempt:1',
    );
    checkpoint.restoreProjectCheckpoint.mockImplementationOnce(async () => {
      order.push('restore-interrupted');
      return {
        restored: true,
        checkpointId: 'ckpt-interrupted',
        expectedStateHash: 'before',
        actualStateHash: 'before',
      };
    });

    const result = await runChatReferenceStyleJob(workerPayload(), {
      store,
      loadProject: async () => structuredClone(currentProject),
      extractProfile: async () => 'style-profile-1',
      applyProfile: async () => {
        currentProject = project('after');
        return { status: 'mutated', rawOutput: '{}', data: {} };
      },
      captureMutationReceipts: captureWriterReceipt,
      dispatchRenderEvidence: async () => ({ dispatched: true, messageId: 'render-recovered' }),
      ...checkpoint.dependencies,
      now: () => NOW,
    });

    expect(result.status).toBe('completed');
    expect(order).toEqual(['restore-interrupted', 'before-checkpoint', 'after-checkpoint']);
    const completed = store.jobs.get('job-style-1');
    expect(completed).toMatchObject({
      status: 'completed',
      attemptCount: 2,
    });
    expect(completed?.beforeCheckpointId).toMatch(/^ckpt_chat_style_before_/);
    expect(completed?.beforeCheckpointId).not.toBe('ckpt-interrupted');
    expect(checkpoint.restoreProjectCheckpoint).toHaveBeenCalledWith(
      'ckpt-interrupted',
      'user-1',
      { projectId: 'project-1', expectedRevision: ROLLBACK_RECEIPT.expectedRevision, actorKind: 'SYSTEM' },
    );
  });

  it('fails an interrupted attempt without a persisted writer receipt and never restores it', async () => {
    const interrupted = {
      ...queuedJob(),
      status: 'running' as const,
      attemptCount: 1,
      leaseId: 'expired-lease',
      leaseExpiresAt: new Date(NOW.getTime() - 1),
      beforeCheckpointId: 'ckpt-interrupted',
    };
    const store = new MemoryStore(interrupted);
    const checkpoint = installCheckpointSpies([]);
    const extractProfile = vi.fn();
    checkpoint.seedCheckpoint(
      'ckpt-interrupted',
      'style_17f18699eb3b408d0d81bcf234f73a4c',
      'chat-reference-style:job-style-1:attempt:1',
      false,
    );

    const result = await runChatReferenceStyleJob(workerPayload(), {
      store,
      loadProject: async () => project('before'),
      extractProfile,
      applyProfile: vi.fn(),
      dispatchRenderEvidence: vi.fn(),
      ...checkpoint.dependencies,
      now: () => NOW,
    });

    expect(result).toEqual({
      status: 'failed',
      jobId: 'job-style-1',
      reason: 'reference-style-interrupted-attempt-rollback-not-attempted:writer-issued-receipt-missing',
    });
    expect(extractProfile).not.toHaveBeenCalled();
    expect(checkpoint.recordRollbackExpectedRevision).not.toHaveBeenCalled();
    expect(checkpoint.restoreProjectCheckpoint).not.toHaveBeenCalled();
    expect(store.jobs.get('job-style-1')).toMatchObject({ status: 'failed' });
  });

  it('fails loudly when a pending job has exhausted its retry deadline', async () => {
    const expired = {
      ...queuedJob(),
      status: 'retry_wait' as const,
      attemptCount: 1,
      nextAttemptAt: new Date(NOW.getTime() + 60_000),
      retryDeadlineAt: NOW,
    };
    const store = new MemoryStore(expired);
    const checkpoint = installCheckpointSpies([]);

    const result = await runChatReferenceStyleJob(workerPayload(), {
      store,
      loadProject: async () => project('before'),
      extractProfile: vi.fn(),
      applyProfile: vi.fn(),
      dispatchRenderEvidence: vi.fn(),
      ...checkpoint.dependencies,
      now: () => NOW,
    });

    expect(result).toEqual({
      status: 'failed',
      jobId: 'job-style-1',
      reason: 'reference-style-retry-deadline-exhausted',
    });
    expect(store.jobs.get('job-style-1')?.status).toBe('failed');
  });

  it('redispatches due jobs and terminalizes exhausted jobs in one bounded watchdog pass', async () => {
    const due = {
      ...queuedJob(),
      status: 'retry_wait' as const,
      attemptCount: 2,
      nextAttemptAt: new Date(NOW.getTime() - 1),
    };
    const exhausted = {
      ...queuedJob(),
      _id: 'job-style-exhausted',
      idempotencyKey: 'idem-exhausted',
      status: 'running' as const,
      attemptCount: CHAT_REFERENCE_STYLE_MAX_ATTEMPTS,
      leaseExpiresAt: new Date(NOW.getTime() - 1),
    };
    const dispatch = vi.fn(async () => ({ messageId: 'qstash-recovered' }));
    const markTerminal = vi.fn(async () => true);

    const result = await sweepChatReferenceStyleJobs({
      now: NOW,
      limit: 25,
      dedupSalt: 'test-window',
    }, {
      findCandidates: async () => [due, exhausted],
      dispatch,
      markTerminal,
    });

    expect(result).toEqual({
      scanned: 2,
      redispatched: 1,
      terminalized: 1,
      errors: 0,
      details: [],
    });
    expect(dispatch).toHaveBeenCalledWith(due, 'test-window', NOW);
    expect(markTerminal).toHaveBeenCalledWith(
      exhausted,
      'reference-style-attempts-exhausted',
      NOW,
    );
  });

  it('keeps watchdog dispatch failures observable without aborting the pass', async () => {
    const due = {
      ...queuedJob(),
      status: 'retry_wait' as const,
      nextAttemptAt: new Date(NOW.getTime() - 1),
    };

    const result = await sweepChatReferenceStyleJobs({ now: NOW }, {
      findCandidates: async () => [due],
      dispatch: async () => { throw new Error('QStash unavailable'); },
      markTerminal: vi.fn(),
    });

    expect(result).toMatchObject({ scanned: 1, redispatched: 0, terminalized: 0, errors: 1 });
    expect(result.details).toEqual(['job-style-1:redispatch:QStash unavailable']);
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
      captureMutationReceipts: captureWriterReceipt,
      dispatchRenderEvidence,
      ...checkpoint.dependencies,
      now: () => NOW,
    });

    expect(result).toMatchObject({ status: 'failed', reason: expect.stringContaining('reference-style-postcondition-failed') });
    expect(checkpoint.restoreProjectCheckpoint).toHaveBeenCalledTimes(1);
    expect(checkpoint.recordRollbackExpectedRevision).toHaveBeenCalledWith(
      expect.any(String),
      'user-1',
      'project-1',
      'chat-reference-style:job-style-1:attempt:1',
      writerIssuedReceipt(),
    );
    expect(checkpoint.restoreProjectCheckpoint).toHaveBeenCalledWith(
      expect.any(String),
      'user-1',
      { projectId: 'project-1', expectedRevision: writerIssuedReceipt().revision, actorKind: 'SYSTEM' },
    );
    expect(store.jobs.get('job-style-1')?.status).toBe('rolled_back');
    expect(dispatchRenderEvidence).not.toHaveBeenCalled();
  });

  it('fails closed when a style write has no captured receipt and never records or restores a guessed revision', async () => {
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

    expect(result).toEqual({
      status: 'failed',
      jobId: 'job-style-1',
      reason: 'reference-style-rollback-not-attempted:writer-issued-receipt-missing',
    });
    expect(checkpoint.recordRollbackExpectedRevision).not.toHaveBeenCalled();
    expect(checkpoint.restoreProjectCheckpoint).not.toHaveBeenCalled();
    expect(checkpoint.createCheckpoint).not.toHaveBeenCalled();
    expect(checkpoint.updateChatEditOperationScoped).toHaveBeenCalledWith(
      expect.any(String),
      'user-1',
      'project-1',
      expect.any(String),
      expect.objectContaining({
        operationStatus: 'failed',
        operationError: expect.stringContaining('reference-style-writer-issued-receipt-missing'),
      }),
    );
    expect(store.jobs.get('job-style-1')).toMatchObject({ status: 'failed' });
    expect(dispatchRenderEvidence).not.toHaveBeenCalled();
  });

  it('refuses a stale rollback receipt without a second restore or mutation retry', async () => {
    const store = new MemoryStore(queuedJob());
    const checkpoint = installCheckpointSpies([]);
    checkpoint.restoreProjectCheckpoint.mockResolvedValueOnce({
      restored: false,
      checkpointId: 'stale',
      expectedStateHash: 'before',
      reason: 'project-revision-conflict',
      beforeRevision: ROLLBACK_RECEIPT.expectedRevision,
      currentRevision: {
        ...ROLLBACK_RECEIPT.expectedRevision,
        value: ROLLBACK_RECEIPT.expectedRevision.value + 1,
      },
    });

    const result = await runChatReferenceStyleJob(workerPayload(), {
      store,
      loadProject: async () => project('before'),
      extractProfile: async () => 'style-profile-1',
      applyProfile: async () => ({ status: 'mutated', rawOutput: '{}', data: {} }),
      captureMutationReceipts: captureWriterReceipt,
      dispatchRenderEvidence: vi.fn(),
      ...checkpoint.dependencies,
      now: () => NOW,
    });

    expect(result).toMatchObject({
      status: 'failed',
      reason: expect.stringContaining('reference-style-rollback-failed:project-revision-conflict'),
    });
    expect(checkpoint.restoreProjectCheckpoint).toHaveBeenCalledTimes(1);
    expect(checkpoint.restoreProjectCheckpoint).toHaveBeenCalledWith(
      expect.any(String),
      'user-1',
      { projectId: 'project-1', expectedRevision: writerIssuedReceipt().revision, actorKind: 'SYSTEM' },
    );
    expect(store.jobs.get('job-style-1')).toMatchObject({ status: 'failed' });
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
      captureMutationReceipts: captureWriterReceipt,
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
    expect(source).toContain('Retry-After');
    expect(source).toContain('Upstash-NonRetryable-Error');
  });

  it('keeps the reference-style watchdog authenticated and scheduled', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/api/cron/sweep-chat-reference-style-jobs/route.ts'),
      'utf8',
    );
    const vercel = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
      crons?: Array<{ path?: string; schedule?: string }>;
    };

    expect(source).toContain("userAgent.includes('vercel-cron')");
    expect(source).toContain('CRON_SECRET');
    expect(source).toContain('sweepChatReferenceStyleJobs');
    expect(vercel.crons).toContainEqual({
      path: '/api/cron/sweep-chat-reference-style-jobs',
      schedule: '*/15 * * * *',
    });
  });

  it('rejects unauthenticated watchdog requests before touching durable jobs', async () => {
    const { GET } = await import('@/app/api/cron/sweep-chat-reference-style-jobs/route');
    const response = await GET(new Request('http://localhost/api/cron/sweep-chat-reference-style-jobs'));

    expect(response.status).toBe(401);
    expect(await response.text()).toBe('Unauthorized');
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
    if (job.attemptCount >= CHAT_REFERENCE_STYLE_MAX_ATTEMPTS) return null;
    if (job.retryDeadlineAt && job.retryDeadlineAt.getTime() <= now.getTime()) return null;
    const claimable = ['created', 'dispatch_failed', 'dispatching', 'queued'].includes(job.status)
      || (job.status === 'retry_wait' && (!job.nextAttemptAt || job.nextAttemptAt.getTime() <= now.getTime()))
      || (job.status === 'running' && Boolean(job.leaseExpiresAt && job.leaseExpiresAt.getTime() <= now.getTime()));
    if (!claimable) return null;
    job.status = 'running';
    job.leaseId = leaseId;
    job.leaseExpiresAt = new Date(now.getTime() + (15 * 60_000));
    job.nextAttemptAt = null;
    job.attemptCount += 1;
    return structuredClone(job);
  }

  async markProfileExtracted(jobId: string, userId: string, profileId: string, now: Date) {
    Object.assign(this.owned(jobId, userId), { profileId, updatedAt: now });
  }

  async markCheckpointStarted(jobId: string, userId: string, checkpointId: string, now: Date) {
    Object.assign(this.owned(jobId, userId), { beforeCheckpointId: checkpointId, updatedAt: now });
  }

  async clearInterruptedAttempt(jobId: string, userId: string, now: Date) {
    Object.assign(this.owned(jobId, userId), { beforeCheckpointId: null, updatedAt: now });
  }

  async markDeclined(jobId: string, userId: string, result: Record<string, unknown>, now: Date) {
    Object.assign(this.owned(jobId, userId), { status: 'declined', result, completedAt: now, updatedAt: now });
  }

  async markCompleted(input: {
    jobId: string;
    userId: string;
    afterCheckpointId: string;
    renderOperationId: string;
    renderVerification: { dispatched: boolean; messageId?: string; reason?: string };
    result: Record<string, unknown>;
    now: Date;
  }) {
    Object.assign(this.owned(input.jobId, input.userId), {
      status: input.renderVerification.dispatched ? 'completed' : 'completed_unverified',
      afterCheckpointId: input.afterCheckpointId,
      renderOperationId: input.renderOperationId,
      renderVerification: input.renderVerification,
      result: input.result,
      error: input.renderVerification.dispatched ? null : input.renderVerification.reason,
      completedAt: input.now,
      updatedAt: input.now,
    });
  }

  async markRetry(jobId: string, userId: string, error: string, nextAttemptAt: Date, now: Date) {
    Object.assign(this.owned(jobId, userId), {
      status: 'retry_wait',
      leaseId: null,
      leaseExpiresAt: null,
      beforeCheckpointId: null,
      nextAttemptAt,
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
    sessionId: 'session-style-1',
    operationId: 'operation-style-1',
    referenceAssetId: 'asset-reference',
    strength: 0.65,
  };
}

function workerPayload() {
  return { jobId: 'job-style-1', projectId: 'project-1', userId: 'user-1' };
}

function referenceProfile() {
  return {
    profileId: 'style-profile-1',
    sourceName: 'reference.mp4',
    cutRhythm: {
      avgCutsPerMinute: 18,
      pattern: 'building' as const,
      avgClipDuration: 3.3,
    },
    transitions: {
      dominant: 'zoom_punch' as const,
      frequency: 12,
    },
    colorGrade: {
      temperature: 'neutral' as const,
      saturation: 'normal' as const,
      contrast: 'high' as const,
      dominantColors: ['#111111'],
    },
    textStyle: {
      fontWeight: 'bold' as const,
      position: 'lower_third' as const,
      animation: 'slide' as const,
      frequency: 'moderate' as const,
    },
    musicStyle: {
      tempo: 'medium' as const,
      genre: 'electronic',
      energyLevel: 'medium' as const,
    },
    pacing: {
      overall: 'medium' as const,
      hookSpeed: 'fast' as const,
      mainSpeed: 'medium' as const,
    },
    graphicsDensity: 'moderate' as const,
  };
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
    nextAttemptAt: NOW,
    retryDeadlineAt: new Date(NOW.getTime() + (45 * 60_000)),
    createdAt: NOW,
    updatedAt: NOW,
    expiresAt: new Date(NOW.getTime() + 86_400_000),
  };
}

function project(content: 'before' | 'after') {
  return {
    projectId: 'project-1',
    userId: 'user-1',
    projectRevision: content === 'before' ? 4 : 5,
    updatedAt: new Date(ROLLBACK_RECEIPT.expectedRevision.compatibilityUpdatedAt),
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
  const checkpoints = new Map<string, Checkpoint>();
  const claimChatEditOperation = vi.fn(async (input: Parameters<CheckpointRuntime['claimChatEditOperation']>[0]) => {
    order.push('before-checkpoint');
    const value = checkpoint(input.checkpointId, input.operationId, input.projectState);
    checkpoints.set(value.checkpointId, value);
    return { claimed: true, checkpoint: value };
  });
  const createCheckpoint = vi.fn(async (input: Parameters<CheckpointRuntime['createCheckpoint']>[0]) => {
    order.push('after-checkpoint');
    const value = checkpoint(input.checkpointId!, input.operationId!, input.projectState!);
    checkpoints.set(value.checkpointId, value);
    return value;
  });
  const getCheckpoint = vi.fn(async (checkpointId: string, userId: string, projectId: string) => {
    const value = checkpoints.get(checkpointId);
    return value?.userId === userId && value.projectId === projectId ? structuredClone(value) : null;
  });
  const rollbackReceipts = new Map<string, CheckpointRollbackReceiptV1>();
  const recordRollbackExpectedRevision = vi.fn(async (
    checkpointId: string,
    userId: string,
    projectId: string,
    receiptId: string,
    writerIssuedReceipt: ProjectMutationReceiptV1,
  ) => {
    const value = checkpoints.get(checkpointId);
    if (!value || value.userId !== userId || value.projectId !== projectId) {
      throw new Error('checkpoint identity mismatch');
    }
    const existing = rollbackReceipts.get(receiptId);
    if (existing) return existing;
    if (!writerIssuedReceipt) throw new Error('writer-issued rollback receipt is required');
    const receipt = {
      ...ROLLBACK_RECEIPT,
      receiptId,
      expectedRevision: writerIssuedReceipt.revision,
    };
    rollbackReceipts.set(receiptId, receipt);
    return receipt;
  });
  const getRollbackReceipt = vi.fn(async (
    checkpointId: string,
    userId: string,
    projectId: string,
    receiptId: string,
  ) => {
    const value = checkpoints.get(checkpointId);
    if (!value || value.userId !== userId || value.projectId !== projectId) return null;
    return rollbackReceipts.get(receiptId) ?? null;
  });
  const updateChatEditOperationScoped = vi.fn(async () => undefined);
  const restoreProjectCheckpoint = vi.fn(async (
    checkpointId: string,
    _userId: string,
    options: { projectId?: string; expectedRevision?: ProjectRevisionV1 },
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
    getRollbackReceipt,
    recordRollbackExpectedRevision,
    updateChatEditOperationScoped,
    restoreProjectCheckpoint,
  };
  return {
    ...checkpointService,
    seedCheckpoint: (
      checkpointId: string,
      operationId: string,
      receiptId: string,
      withRollbackReceipt = true,
    ) => {
      const value = checkpoint(checkpointId, operationId, {
        presentFields: ['overlays'],
        fields: { overlays: project('before').overlays },
      });
      checkpoints.set(checkpointId, value);
      if (withRollbackReceipt) rollbackReceipts.set(receiptId, { ...ROLLBACK_RECEIPT, receiptId });
    },
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

function writerIssuedReceipt(): ProjectMutationReceiptV1 {
  return {
    schemaVersion: 1,
    projectId: 'project-1',
    revision: { ...ROLLBACK_RECEIPT.expectedRevision, value: 5 },
    committedAt: '2026-07-18T10:00:02.000Z',
  };
}

async function captureWriterReceipt<T>(
  callback: () => Promise<T> | T,
  onSettled?: (receipts: readonly ProjectMutationReceiptV1[]) => void,
): Promise<{ value: T; receipts: ProjectMutationReceiptV1[] }> {
  const receipts = [writerIssuedReceipt()];
  try {
    return { value: await callback(), receipts };
  } finally {
    onSettled?.(receipts);
  }
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
    capturedProjectRevision: ROLLBACK_RECEIPT.expectedRevision,
    operationId,
    operationStatus: 'running',
    timestamp: NOW,
    description: 'test checkpoint',
    type: checkpointId.includes('_after_') ? 'after-llm' : 'before-llm',
    createdAt: NOW,
  };
}
