import { describe, expect, it, vi } from 'vitest';
const persistence = vi.hoisted(() => ({
  applyCommand: vi.fn(),
  getSession: vi.fn(),
  getScript: vi.fn(),
}));

vi.mock('@/lib/thinkforge/services/command-service', () => ({
  applyCommand: persistence.applyCommand,
}));
vi.mock('@/lib/thinkforge/services/db', () => ({
  getSession: persistence.getSession,
  getScript: persistence.getScript,
}));

import {
  LongFormScriptJobLeaseLostError,
  type ClaimLongFormScriptJobResult,
  type LongFormScriptGenerationJobSnapshot,
} from '@/lib/thinkforge/long-form/script-generation-job-store';
import {
  processLongFormScriptJob,
  type LongFormScriptJobDependencies,
} from '@/lib/thinkforge/long-form/script-generation-job';
import {
  LongFormScriptNonRetryableError,
  executeLongFormScriptAction,
} from '@/lib/thinkforge/long-form/script-generation-execution';

function job(overrides: Partial<LongFormScriptGenerationJobSnapshot> = {}): LongFormScriptGenerationJobSnapshot {
  return {
    id: 'longscript_ab12',
    version: 1,
    dedupeKey: 'd'.repeat(64),
    userId: 'user_1',
    orgId: 'org_1',
    sessionId: 'session_1',
    generationId: 'generation_1',
    input: {} as LongFormScriptGenerationJobSnapshot['input'],
    status: 'running',
    stage: 'planning',
    dispatchCount: 1,
    stageFailureCount: 0,
    maxStageFailures: 3,
    leaseExpiresAt: '2026-08-20T12:08:00.000Z',
    queueMessageId: null,
    plan: null,
    planHash: null,
    chapterArtifacts: {},
    chapterArtifactHashes: {},
    assembledResult: null,
    assembledResultHash: null,
    commitReceipt: null,
    error: null,
    createdAt: '2026-08-20T12:00:00.000Z',
    updatedAt: '2026-08-20T12:00:00.000Z',
    expiresAt: '2026-08-22T12:00:00.000Z',
    ...overrides,
  };
}

function dependencies(claim: ClaimLongFormScriptJobResult): Required<LongFormScriptJobDependencies> {
  return {
    store: {
      createOrGet: vi.fn(),
      claim: vi.fn().mockResolvedValue(claim),
      heartbeat: vi.fn().mockResolvedValue(undefined),
      savePlan: vi.fn().mockResolvedValue(undefined),
      saveChapterArtifact: vi.fn().mockResolvedValue(undefined),
      saveAssembledResult: vi.fn().mockResolvedValue(undefined),
      saveCommitReceipt: vi.fn().mockResolvedValue(undefined),
      yieldLease: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockResolvedValue(undefined),
      retryOrDeadLetter: vi.fn().mockResolvedValue('queued'),
      setQueueMessage: vi.fn(),
      listRecoverable: vi.fn(),
    },
    execute: vi.fn(),
    dispatch: vi.fn().mockResolvedValue('message_1'),
  };
}

describe('processLongFormScriptJob', () => {
  it('checkpoints one action, releases its lease, and dispatches the next action', async () => {
    const claimedJob = job();
    const deps = dependencies({ kind: 'claimed', job: claimedJob, leaseToken: 'lease_1' });
    const plan = { title: 'Master plan' } as NonNullable<LongFormScriptGenerationJobSnapshot['plan']>;
    vi.mocked(deps.execute).mockResolvedValue({ kind: 'plan', plan });

    await expect(processLongFormScriptJob(claimedJob.id, deps)).resolves.toEqual({
      status: 'queued', reason: 'next_action',
    });
    expect(deps.store.savePlan).toHaveBeenCalledWith(claimedJob.id, 'lease_1', plan);
    expect(deps.store.yieldLease).toHaveBeenCalledWith(claimedJob.id, 'lease_1');
    expect(deps.dispatch).toHaveBeenCalledWith(claimedJob.id);
    expect(deps.store.complete).not.toHaveBeenCalled();
  });

  it('completes atomically after the durable commit receipt without another dispatch', async () => {
    const claimedJob = job({
      plan: { acts: [] } as unknown as NonNullable<LongFormScriptGenerationJobSnapshot['plan']>,
      assembledResult: {} as NonNullable<LongFormScriptGenerationJobSnapshot['assembledResult']>,
      stage: 'committing',
    });
    const deps = dependencies({ kind: 'claimed', job: claimedJob, leaseToken: 'lease_2' });
    const receipt = {
      documentVersion: 4,
      contentHash: 'a'.repeat(64),
      committedAt: '2026-08-20T12:01:00.000Z',
    };
    vi.mocked(deps.execute).mockResolvedValue({ kind: 'commit', receipt });

    await expect(processLongFormScriptJob(claimedJob.id, deps)).resolves.toEqual({ status: 'completed' });
    expect(deps.store.saveCommitReceipt).toHaveBeenCalledWith(claimedJob.id, 'lease_2', receipt);
    expect(deps.store.complete).toHaveBeenCalledWith(claimedJob.id, 'lease_2');
    expect(deps.store.yieldLease).not.toHaveBeenCalled();
    expect(deps.dispatch).not.toHaveBeenCalled();
  });

  it('dead-letters deterministic failures instead of repeatedly spending model credits', async () => {
    const claimedJob = job();
    const deps = dependencies({ kind: 'claimed', job: claimedJob, leaseToken: 'lease_3' });
    vi.mocked(deps.execute).mockRejectedValue(new LongFormScriptNonRetryableError('version conflict'));
    vi.mocked(deps.store.retryOrDeadLetter).mockResolvedValue('dead_letter');

    await expect(processLongFormScriptJob(claimedJob.id, deps)).resolves.toEqual({
      status: 'dead_letter', error: 'version conflict',
    });
    expect(deps.store.retryOrDeadLetter).toHaveBeenCalledWith(
      claimedJob.id, 'lease_3', expect.any(LongFormScriptNonRetryableError), false,
    );
  });

  it('defers when cancellation or another worker invalidates the lease', async () => {
    const claimedJob = job();
    const deps = dependencies({ kind: 'claimed', job: claimedJob, leaseToken: 'lease_4' });
    vi.mocked(deps.execute).mockResolvedValue({ kind: 'plan', plan: {} as never });
    vi.mocked(deps.store.heartbeat).mockRejectedValue(new LongFormScriptJobLeaseLostError());
    vi.mocked(deps.store.retryOrDeadLetter).mockRejectedValue(new LongFormScriptJobLeaseLostError());

    await expect(processLongFormScriptJob(claimedJob.id, deps)).resolves.toEqual({
      status: 'deferred', reason: 'lease_lost',
    });
    expect(deps.store.savePlan).not.toHaveBeenCalled();
  });

  it('surfaces a failed redispatch while preserving the durable checkpoint', async () => {
    const claimedJob = job();
    const deps = dependencies({ kind: 'claimed', job: claimedJob, leaseToken: 'lease_5' });
    vi.mocked(deps.execute).mockResolvedValue({ kind: 'plan', plan: {} as never });
    vi.mocked(deps.dispatch).mockRejectedValue(new Error('queue unavailable'));

    await expect(processLongFormScriptJob(claimedJob.id, deps)).resolves.toEqual({
      status: 'queued', reason: 'dispatch_failed', error: 'queue unavailable',
    });
    expect(deps.store.savePlan).toHaveBeenCalledOnce();
    expect(deps.store.yieldLease).toHaveBeenCalledOnce();
  });

  it('does not execute terminal or concurrently leased jobs', async () => {
    const terminal = dependencies({ kind: 'skipped', reason: 'terminal' });
    await expect(processLongFormScriptJob('longscript_ab12', terminal)).resolves.toEqual({
      status: 'skipped', reason: 'terminal',
    });
    expect(terminal.execute).not.toHaveBeenCalled();

    const leased = dependencies({ kind: 'skipped', reason: 'lease_held' });
    await expect(processLongFormScriptJob('longscript_ab12', leased)).resolves.toEqual({
      status: 'deferred', reason: 'lease_held',
    });
    expect(leased.execute).not.toHaveBeenCalled();
  });
});

describe('long-form canonical commit recovery', () => {
  function commitJob(baseVersion = 3): LongFormScriptGenerationJobSnapshot {
    return job({
      plan: { title: 'Durable story' } as NonNullable<LongFormScriptGenerationJobSnapshot['plan']>,
      assembledResult: {
        content: '# Durable story\n\nComplete script.',
      } as NonNullable<LongFormScriptGenerationJobSnapshot['assembledResult']>,
      input: {
        userId: 'user_1',
        orgId: 'org_1',
        sessionId: 'session_1',
        generationId: 'generation_1',
        scriptId: 'default',
        baseVersion,
        authoringInput: {
          authoringRequest: {
            contentContract: { outputKind: 'video_script' },
          },
        },
      } as LongFormScriptGenerationJobSnapshot['input'],
    });
  }

  it('recovers the receipt only for the exact already-committed generation and content', async () => {
    const current = commitJob();
    persistence.getSession.mockResolvedValue({ _id: 'session_1' });
    persistence.getScript.mockResolvedValue({
      version: 4,
      content: current.assembledResult!.content,
      updatedAt: new Date('2026-08-20T12:05:00.000Z'),
      metadata: {
        writerOutput: { generationTrace: { operation: { id: current.generationId } } },
      },
    });

    await expect(executeLongFormScriptAction({
      job: current,
      action: { kind: 'commit' },
    })).resolves.toEqual({
      kind: 'commit',
      receipt: expect.objectContaining({
        documentVersion: 4,
        committedAt: '2026-08-20T12:05:00.000Z',
      }),
    });
    expect(persistence.applyCommand).not.toHaveBeenCalled();
  });

  it('rejects a competing document version instead of overwriting it', async () => {
    const current = commitJob();
    persistence.getSession.mockResolvedValue({ _id: 'session_1' });
    persistence.getScript.mockResolvedValue({
      version: 5,
      content: 'A user edit made while generation was running.',
      updatedAt: new Date('2026-08-20T12:06:00.000Z'),
      metadata: {},
    });

    await expect(executeLongFormScriptAction({
      job: current,
      action: { kind: 'commit' },
    })).rejects.toThrow('Document changed during long-form generation (5/3).');
    expect(persistence.applyCommand).not.toHaveBeenCalled();
  });
});
