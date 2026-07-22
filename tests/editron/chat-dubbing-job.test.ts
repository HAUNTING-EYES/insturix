import { describe, expect, it, vi } from 'vitest';

import {
  TerminalDubbingError,
  queueChatDubbingJob,
  resolveChatDubbingJob,
  runChatDubbingJob,
  type ChatDubbingJob,
  type ChatDubbingJobStore,
  type ChatDubbingProgress,
} from '@/lib/editron/services/chat-dubbing-job';

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
  async markCompleted(jobId: string, _userId: string, result: Record<string, unknown>, now: Date) { Object.assign(this.jobs.get(jobId)!, { status: 'completed', result, updatedAt: now }); }
  async markRetry(jobId: string, _userId: string, error: string, now: Date) { const job = this.jobs.get(jobId)!; Object.assign(job, { status: 'retry_wait', failureCount: job.failureCount + 1, error, updatedAt: now }); }
  async markFailed(jobId: string, _userId: string, status: 'failed' | 'stale', error: string, now: Date) { Object.assign(this.jobs.get(jobId)!, { status, error, updatedAt: now }); }
}

const now = new Date('2026-07-23T00:00:00.000Z');
const project = {
  projectId: 'proj-1',
  userId: 'user-1',
  fps: 30,
  overlays: [{ id: 11, type: 'video', assetId: 'asset-1', from: 60, durationInFrames: 300, videoStartTime: 90, speed: 1 }],
};

async function resolved(store: MemoryStore) {
  return resolveChatDubbingJob({ projectId: 'proj-1', userId: 'user-1', overlayId: 11, targetLanguage: 'English' }, {
    store,
    loadProject: vi.fn(async () => project),
    buildProjectRevision: vi.fn(() => 'revision-1'),
    now: () => now,
  });
}

describe('durable chat dubbing job', () => {
  it('pins selected clip, source coordinates, language, and project revision idempotently', async () => {
    const store = new MemoryStore();
    const first = await resolved(store);
    const second = await resolved(store);
    expect(first).toMatchObject({ created: true, status: 'resolved' });
    expect(second).toMatchObject({ jobId: first.jobId, created: false, status: 'resolved' });
    expect(await store.find(first.jobId, 'user-1')).toMatchObject({
      overlayId: '11', assetId: 'asset-1', targetLanguage: 'English', projectRevision: 'revision-1',
      timelineStartFrame: 60, timelineEndFrame: 360, sourceStartFrame: 90, sourceEndFrame: 390,
    });
  });

  it('rejects unsupported languages and retimed clips before provider work', async () => {
    await expect(resolveChatDubbingJob({ projectId: 'proj-1', userId: 'user-1', overlayId: 11, targetLanguage: 'Hindi' }, {
      store: new MemoryStore(), loadProject: async () => project, buildProjectRevision: () => 'r', now: () => now,
    })).rejects.toMatchObject({ code: 'unsupported-target-language' });
    await expect(resolveChatDubbingJob({ projectId: 'proj-1', userId: 'user-1', overlayId: 11 }, {
      store: new MemoryStore(), loadProject: async () => ({ ...project, overlays: [{ ...project.overlays[0], speed: 1.2 }] }), buildProjectRevision: () => 'r', now: () => now,
    })).rejects.toMatchObject({ code: 'retimed-clip-unsupported' });
  });

  it('continues resumable stages without spending failure budget', async () => {
    const store = new MemoryStore();
    const { jobId } = await resolved(store);
    const publish = vi.fn(async () => ({ messageId: 'msg-1' }));
    const deps = { store, loadProject: vi.fn(async () => project), buildProjectRevision: vi.fn(() => 'revision-1'), now: () => now, publish };
    expect(await queueChatDubbingJob({ jobId, projectId: 'proj-1', userId: 'user-1' }, deps)).toMatchObject({ status: 'queued' });
    const result = await runChatDubbingJob({ jobId, projectId: 'proj-1', userId: 'user-1' }, {
      ...deps,
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
      now: () => now,
      publish,
    });
    expect(result).toEqual({ status: 'failed', jobId, reason: 'no-spoken-dialogue' });
    expect(publish).not.toHaveBeenCalled();
  });

  it('retries transient provider failures but terminal failures clean up and stop', async () => {
    const transientStore = new MemoryStore();
    const { jobId } = await resolved(transientStore);
    const shared = { loadProject: vi.fn(async () => project), buildProjectRevision: vi.fn(() => 'revision-1'), now: () => now, publish: vi.fn(async () => ({ messageId: 'msg' })) };
    await queueChatDubbingJob({ jobId, projectId: 'proj-1', userId: 'user-1' }, { ...shared, store: transientStore });
    const retry = await runChatDubbingJob({ jobId, projectId: 'proj-1', userId: 'user-1' }, {
      ...shared, store: transientStore, execute: vi.fn(async () => { const error = Object.assign(new Error('provider timeout'), { status: 503 }); throw error; }), cleanup: vi.fn(),
    });
    expect(retry.status).toBe('retrying');
    expect(await transientStore.find(jobId, 'user-1')).toMatchObject({ status: 'retry_wait', failureCount: 1 });

    const terminalStore = new MemoryStore();
    const terminal = await resolved(terminalStore);
    await queueChatDubbingJob({ jobId: terminal.jobId, projectId: 'proj-1', userId: 'user-1' }, { ...shared, store: terminalStore });
    const cleanup = vi.fn(async () => undefined);
    const failed = await runChatDubbingJob({ jobId: terminal.jobId, projectId: 'proj-1', userId: 'user-1' }, {
      ...shared, store: terminalStore, execute: vi.fn(async () => { throw new TerminalDubbingError('no-spoken-dialogue', 'nothing to dub'); }), cleanup,
    });
    expect(failed.status).toBe('failed');
    expect(cleanup).toHaveBeenCalledOnce();
    expect(await terminalStore.find(terminal.jobId, 'user-1')).toMatchObject({ status: 'failed', failureCount: 0 });
  });

  it('marks a job stale and cleans generated assets if the project changes', async () => {
    const store = new MemoryStore();
    const { jobId } = await resolved(store);
    const publish = vi.fn(async () => ({ messageId: 'msg' }));
    await queueChatDubbingJob({ jobId, projectId: 'proj-1', userId: 'user-1' }, { store, loadProject: async () => project, buildProjectRevision: () => 'revision-1', now: () => now, publish });
    const cleanup = vi.fn(async () => undefined);
    const result = await runChatDubbingJob({ jobId, projectId: 'proj-1', userId: 'user-1' }, {
      store, loadProject: async () => project, buildProjectRevision: () => 'revision-2', now: () => now, publish, execute: vi.fn(), cleanup,
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
      .mockRejectedValueOnce(new Error('qstash unavailable'));
    await queueChatDubbingJob({ jobId, projectId: 'proj-1', userId: 'user-1' }, {
      store, loadProject, buildProjectRevision, now: () => now, publish,
    });
    const result = await runChatDubbingJob({ jobId, projectId: 'proj-1', userId: 'user-1' }, {
      store,
      loadProject,
      buildProjectRevision,
      now: () => now,
      publish,
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
      now: () => now,
      publish,
      execute: vi.fn(async () => ({ status: 'completed' as const, result: { committed: true } })),
      cleanup: vi.fn(),
    });
    expect(retry).toMatchObject({ status: 'completed', result: { committed: true } });
  });
});
