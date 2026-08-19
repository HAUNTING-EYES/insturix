import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  commitPostMortemPlan: vi.fn(),
  preparePostMortemPlan: vi.fn(),
  purgeThinkForgeSession: vi.fn(),
  publishJSON: vi.fn(),
  store: {
    claim: vi.fn(),
    complete: vi.fn(),
    createOrGet: vi.fn(),
    getAuthorized: vi.fn(),
    heartbeat: vi.fn(),
    listRecoverable: vi.fn(),
    markDispatchFailed: vi.fn(),
    retryOrDeadLetter: vi.fn(),
    saveCheckpoint: vi.fn(),
    saveResult: vi.fn(),
    setQueueMessage: vi.fn(),
  },
}));

vi.mock('@upstash/qstash', () => ({ Client: class { publishJSON = mocks.publishJSON; } }));
vi.mock('@/lib/thinkforge/agents/post-mortem-agent', () => ({ commitPostMortemPlan: mocks.commitPostMortemPlan }));
vi.mock('@/lib/thinkforge/post-mortem/post-mortem-planner', () => ({ preparePostMortemPlan: mocks.preparePostMortemPlan }));
vi.mock('@/lib/thinkforge/session-deletion/session-deletion', () => ({
  purgeThinkForgeSession: mocks.purgeThinkForgeSession,
}));
vi.mock('@/lib/thinkforge/post-mortem/post-mortem-job-store', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/thinkforge/post-mortem/post-mortem-job-store')>();
  return { ...original, postMortemJobStore: mocks.store };
});

const plan = {
  version: 1,
  userId: 'user_1',
  orgId: 'org_1',
  sessionId: 'session_1',
  projectId: null,
  brandId: 'brand_1',
  projectTitle: null,
  qualityScore: null,
  userPublished: false,
  sourceEvidenceFingerprint: 'a'.repeat(64),
  sourceEventIds: [],
  sourceEntryIds: [],
  output: null,
};
const result = { summaryEntryId: null, lessonsExtracted: 0, eventsDeleted: 0, entriesDeleted: 0 };

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: 'postmortem_123',
    version: 1,
    dedupeKey: 'dedupe',
    userId: 'user_1',
    orgId: 'org_1',
    input: {
      userId: 'user_1', orgId: 'org_1', sessionId: 'session_1', brandId: 'brand_1',
      deleteSessionOnCompletion: false,
    },
    status: 'running',
    attemptCount: 1,
    maxAttempts: 3,
    leaseExpiresAt: '2026-08-16T11:00:00.000Z',
    queueMessageId: null,
    checkpoint: null,
    checkpointHash: null,
    result: null,
    resultHash: null,
    error: null,
    createdAt: '2026-08-16T10:00:00.000Z',
    updatedAt: '2026-08-16T10:00:00.000Z',
    expiresAt: '2026-08-30T10:00:00.000Z',
    ...overrides,
  };
}

describe('durable post-mortem job orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.QSTASH_TOKEN = 'qstash_test';
    process.env.APP_ENV = 'development';
    mocks.store.heartbeat.mockResolvedValue(undefined);
    mocks.store.listRecoverable.mockResolvedValue([]);
    mocks.store.saveCheckpoint.mockResolvedValue(undefined);
    mocks.store.saveResult.mockResolvedValue(undefined);
    mocks.store.complete.mockResolvedValue(undefined);
    mocks.store.retryOrDeadLetter.mockResolvedValue('queued');
    mocks.preparePostMortemPlan.mockResolvedValue(plan);
    mocks.commitPostMortemPlan.mockResolvedValue(result);
    mocks.purgeThinkForgeSession.mockResolvedValue({ sessionDeleted: true });
    mocks.store.getAuthorized.mockResolvedValue(job());
  });

  it('checkpoints model output and committed result before completion', async () => {
    mocks.store.claim.mockResolvedValue({ kind: 'claimed', job: job(), leaseToken: 'lease_1' });
    const { processPostMortemJob } = await import('@/lib/thinkforge/post-mortem/post-mortem-job');

    await expect(processPostMortemJob('postmortem_123')).resolves.toEqual({ status: 'completed' });

    expect(mocks.preparePostMortemPlan).toHaveBeenCalledTimes(1);
    expect(mocks.store.saveCheckpoint).toHaveBeenCalledWith('postmortem_123', 'lease_1', plan);
    expect(mocks.commitPostMortemPlan).toHaveBeenCalledWith(plan);
    expect(mocks.store.saveResult).toHaveBeenCalledWith('postmortem_123', 'lease_1', result);
    expect(mocks.store.saveResult.mock.invocationCallOrder[0]).toBeLessThan(mocks.store.complete.mock.invocationCallOrder[0]);
  });

  it('resumes from a committed result without another model call after a crash', async () => {
    const committed = job({ result, resultHash: 'result_hash' });
    mocks.store.claim.mockResolvedValue({ kind: 'claimed', job: committed, leaseToken: 'lease_2' });
    mocks.store.getAuthorized.mockResolvedValue(job({
      result,
      resultHash: 'result_hash',
      input: { ...committed.input, deleteSessionOnCompletion: true },
    }));
    const { processPostMortemJob } = await import('@/lib/thinkforge/post-mortem/post-mortem-job');

    await expect(processPostMortemJob('postmortem_123')).resolves.toEqual({ status: 'completed' });

    expect(mocks.preparePostMortemPlan).not.toHaveBeenCalled();
    expect(mocks.commitPostMortemPlan).not.toHaveBeenCalled();
    expect(mocks.purgeThinkForgeSession).toHaveBeenCalledWith({
      sessionId: 'session_1',
      userId: 'user_1',
      orgId: 'org_1',
      deletionJobId: 'postmortem_123',
      deletionJobLeaseToken: 'lease_2',
    });
    expect(mocks.store.complete).toHaveBeenCalledWith('postmortem_123', 'lease_2');
  });

  it('purges a session without an LLM call only after the deterministic result is durable', async () => {
    const pendingBase = job();
    const pending = job({
      input: { ...pendingBase.input, deleteSessionOnCompletion: true },
    });
    mocks.store.claim.mockResolvedValue({ kind: 'claimed', job: pending, leaseToken: 'lease_3' });
    mocks.store.getAuthorized.mockResolvedValue(pending);
    const { processPostMortemJob } = await import('@/lib/thinkforge/post-mortem/post-mortem-job');

    await processPostMortemJob('postmortem_123');

    expect(mocks.preparePostMortemPlan).not.toHaveBeenCalled();
    expect(mocks.commitPostMortemPlan).not.toHaveBeenCalled();
    expect(mocks.store.saveCheckpoint).not.toHaveBeenCalled();
    expect(mocks.store.saveResult).toHaveBeenCalledWith('postmortem_123', 'lease_3', result);
    expect(mocks.store.saveResult.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.purgeThinkForgeSession.mock.invocationCallOrder[0],
    );
    expect(mocks.purgeThinkForgeSession.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.store.complete.mock.invocationCallOrder[0],
    );
  });

  it('requeues a failed attempt without swallowing the durable error state', async () => {
    mocks.store.claim.mockResolvedValue({ kind: 'claimed', job: job(), leaseToken: 'lease_4' });
    mocks.preparePostMortemPlan.mockRejectedValue(new Error('provider unavailable'));
    const { processPostMortemJob } = await import('@/lib/thinkforge/post-mortem/post-mortem-job');

    await expect(processPostMortemJob('postmortem_123')).resolves.toEqual({
      status: 'queued', error: 'provider unavailable',
    });
    expect(mocks.store.retryOrDeadLetter).toHaveBeenCalledWith('postmortem_123', 'lease_4', expect.any(Error));
    expect(mocks.store.complete).not.toHaveBeenCalled();
  });

  it('defers a duplicate delivery while another worker owns the lease', async () => {
    mocks.store.claim.mockResolvedValue({ kind: 'skipped', reason: 'lease_held' });
    const { processPostMortemJob } = await import('@/lib/thinkforge/post-mortem/post-mortem-job');

    await expect(processPostMortemJob('postmortem_123')).resolves.toEqual({
      status: 'deferred', reason: 'lease_held',
    });
    expect(mocks.preparePostMortemPlan).not.toHaveBeenCalled();
  });

  it('records dispatch failure while leaving the durable job recoverable', async () => {
    mocks.store.createOrGet.mockResolvedValue({ job: job({ status: 'queued' }), created: true });
    mocks.publishJSON.mockRejectedValue(new Error('qstash unavailable'));
    const { enqueuePostMortemJob } = await import('@/lib/thinkforge/post-mortem/post-mortem-job');

    await expect(enqueuePostMortemJob({
      userId: 'user_1',
      orgId: 'org_1',
      sessionId: 'session_1',
      brandId: 'brand_1',
    }, {})).rejects.toThrow('qstash unavailable');
    expect(mocks.store.markDispatchFailed).toHaveBeenCalledWith('postmortem_123', expect.any(Error));
  });

  it('redelivers stale jobs through the same fenced worker boundary', async () => {
    const now = new Date('2026-08-16T12:00:00.000Z');
    mocks.store.listRecoverable.mockResolvedValue([
      job({ id: 'postmortem_123', status: 'queued' }),
      job({ id: 'postmortem_456', status: 'running', leaseExpiresAt: '2026-08-16T11:50:00.000Z' }),
    ]);
    mocks.publishJSON
      .mockResolvedValueOnce({ messageId: 'queue_1' })
      .mockResolvedValueOnce({ messageId: 'queue_2' });
    const { recoverStalledPostMortemJobs } = await import('@/lib/thinkforge/post-mortem/post-mortem-job');

    await expect(recoverStalledPostMortemJobs(250, now)).resolves.toEqual({
      candidates: 2,
      dispatched: 2,
      failed: 0,
    });
    expect(mocks.store.listRecoverable).toHaveBeenCalledWith(
      new Date('2026-08-16T11:58:00.000Z'),
      100,
    );
    expect(mocks.publishJSON).toHaveBeenCalledTimes(2);
  });

  it('keeps recovery failures visible and recoverable', async () => {
    mocks.store.listRecoverable.mockResolvedValue([job({ status: 'queued' })]);
    mocks.publishJSON.mockRejectedValue(new Error('queue unavailable'));
    const { recoverStalledPostMortemJobs } = await import('@/lib/thinkforge/post-mortem/post-mortem-job');

    await expect(recoverStalledPostMortemJobs()).resolves.toEqual({
      candidates: 1,
      dispatched: 0,
      failed: 1,
    });
    expect(mocks.store.markDispatchFailed).toHaveBeenCalledWith('postmortem_123', expect.any(Error));
  });
});
