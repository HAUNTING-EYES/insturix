import { describe, expect, it, vi } from 'vitest';

const providerMocks = vi.hoisted(() => ({
  analyzeClipAudioService: vi.fn(),
  sampleVideoClip: vi.fn(),
  sendVideoToGemini: vi.fn(),
}));

vi.mock('@/lib/editron/services/media', () => ({
  analyzeClipAudioService: providerMocks.analyzeClipAudioService,
}));

vi.mock('@/lib/editron/services/media/analysis-service', () => ({
  sampleVideoClip: providerMocks.sampleVideoClip,
  sendVideoToGemini: providerMocks.sendVideoToGemini,
}));

import {
  queueChatDeepAnalysisJob,
  resolveChatDeepAnalysisJobs,
  runChatDeepAnalysisJob,
  executeChatDeepAnalysisProvider,
  type ChatDeepAnalysisJob,
  type ChatDeepAnalysisJobStore,
} from '@/lib/editron/services/chat-deep-analysis-job';

const NOW = new Date('2026-07-18T12:00:00.000Z');
const REVISION = 'revision-a';

const PROJECT = {
  fps: 30,
  overlays: [
    { id: 'clip-a', type: 'video', assetId: 'asset-a', name: 'Angle A.mp4', from: 0, durationInFrames: 300 },
    {
      id: 'clip-b',
      type: 'video',
      assetId: 'asset-b',
      name: 'Interview closeup.mp4',
      from: 300,
      durationInFrames: 300,
      videoStartTime: 120,
    },
    { id: 'audio-a', type: 'sound', assetId: 'audio-a', name: 'Interview.wav', from: 0, durationInFrames: 600 },
  ],
};

class MemoryStore implements ChatDeepAnalysisJobStore {
  readonly jobs = new Map<string, ChatDeepAnalysisJob>();

  async createOrGet(job: ChatDeepAnalysisJob) {
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
    const job = this.jobs.get(jobId);
    if (!job || job.userId !== userId || !['resolved', 'dispatch_failed'].includes(job.status)) return false;
    job.status = 'dispatching';
    job.updatedAt = now;
    return true;
  }

  async markPublished(jobId: string, userId: string, messageId: string | undefined, now: Date) {
    const job = this.require(jobId, userId);
    job.status = 'queued';
    job.dispatchMessageId = messageId ?? null;
    job.updatedAt = now;
  }

  async markDispatchFailed(jobId: string, userId: string, error: string, now: Date) {
    const job = this.require(jobId, userId);
    job.status = 'dispatch_failed';
    job.error = error;
    job.updatedAt = now;
  }

  async claimRun(jobId: string, userId: string, leaseId: string, now: Date) {
    const job = this.jobs.get(jobId);
    const staleLease = job?.status === 'running' && Boolean(job.leaseExpiresAt && job.leaseExpiresAt < now);
    if (
      !job
      || job.userId !== userId
      || (!['queued', 'retry_wait'].includes(job.status) && !staleLease)
      || job.attemptCount >= 2
    ) return null;
    job.status = 'running';
    job.attemptCount += 1;
    job.leaseId = leaseId;
    job.leaseExpiresAt = new Date(now.getTime() + 300_000);
    job.updatedAt = now;
    return structuredClone(job);
  }

  async markCompleted(jobId: string, userId: string, result: Record<string, unknown>, now: Date) {
    const job = this.require(jobId, userId);
    job.status = 'completed';
    job.result = structuredClone(result);
    job.completedAt = now;
    job.updatedAt = now;
  }

  async markRetry(jobId: string, userId: string, error: string, now: Date) {
    const job = this.require(jobId, userId);
    job.status = 'retry_wait';
    job.error = error;
    job.updatedAt = now;
  }

  async markFailed(jobId: string, userId: string, status: 'failed' | 'stale', error: string, now: Date) {
    const job = this.require(jobId, userId);
    job.status = status;
    job.error = error;
    job.completedAt = now;
    job.updatedAt = now;
  }

  private require(jobId: string, userId: string) {
    const job = this.jobs.get(jobId);
    if (!job || job.userId !== userId) throw new Error('job-not-found');
    return job;
  }
}

function resolutionDeps(store = new MemoryStore(), project: typeof PROJECT | null = PROJECT, revision = REVISION) {
  return {
    store,
    loadProject: vi.fn(async () => structuredClone(project)),
    buildProjectRevision: vi.fn(() => revision),
    now: () => NOW,
  };
}

async function resolvedJob(store = new MemoryStore()) {
  const result = await resolveChatDeepAnalysisJobs({
    projectId: 'proj-analysis',
    userId: 'user-analysis',
    modality: 'video',
    targetMode: 'overlay',
    overlayId: 'clip-b',
  }, resolutionDeps(store));
  return { store, result, jobId: result.jobs[0].jobId };
}

describe('durable chat deep-analysis contracts', () => {
  it('resolves an explicit selected overlay into immutable timeline and source coordinates', async () => {
    const result = await resolveChatDeepAnalysisJobs({
      projectId: 'proj-analysis',
      userId: 'user-analysis',
      modality: 'video',
      targetMode: 'overlay',
      overlayId: 'clip-b',
    }, resolutionDeps());

    expect(result).toMatchObject({
      status: 'resolved',
      batch: false,
      jobs: [{
        created: true,
        status: 'resolved',
        target: {
          overlayId: 'clip-b',
          assetId: 'asset-b',
          timeline: { startFrame: 300, endFrame: 600 },
          source: { startFrame: 120, endFrame: 420 },
        },
      }],
    });
  });

  it('maps an asset-source range to the edited timeline exactly once', async () => {
    const result = await resolveChatDeepAnalysisJobs({
      projectId: 'proj-analysis',
      userId: 'user-analysis',
      modality: 'video',
      targetMode: 'asset',
      assetId: 'asset-b',
      rangeSpace: 'source',
      startSeconds: 5,
      endSeconds: 8,
    }, resolutionDeps());

    expect(result.jobs[0].target).toMatchObject({
      timeline: { startFrame: 330, endFrame: 420 },
      source: { startFrame: 150, endFrame: 240 },
    });
  });

  it('uses a timeline range to select the only overlapping clip', async () => {
    const result = await resolveChatDeepAnalysisJobs({
      projectId: 'proj-analysis',
      userId: 'user-analysis',
      modality: 'video',
      targetMode: 'timeline',
      startSeconds: 12,
      endSeconds: 14,
    }, resolutionDeps());

    expect(result.jobs[0].target).toMatchObject({
      overlayId: 'clip-b',
      timeline: { startFrame: 360, endFrame: 420 },
      source: { startFrame: 180, endFrame: 240 },
    });
  });

  it('fails ambiguous search instead of selecting a first clip', async () => {
    const duplicateNames = {
      ...PROJECT,
      overlays: PROJECT.overlays.map((overlay) => overlay.type === 'video'
        ? { ...overlay, name: 'Interview angle.mp4' }
        : overlay),
    };
    await expect(resolveChatDeepAnalysisJobs({
      projectId: 'proj-analysis',
      userId: 'user-analysis',
      modality: 'video',
      targetMode: 'search',
      target: 'interview',
    }, resolutionDeps(new MemoryStore(), duplicateNames))).rejects.toThrow('Multiple media overlays match');
  });

  it('rejects incompatible target modes before any job is stored', async () => {
    const store = new MemoryStore();
    await expect(resolveChatDeepAnalysisJobs({
      projectId: 'proj-analysis',
      userId: 'user-analysis',
      modality: 'video',
      targetMode: 'timeline',
      assetId: 'asset-b',
      startSeconds: 1,
      endSeconds: 2,
    }, resolutionDeps(store))).rejects.toThrow('assetId is valid only for asset targetMode');
    expect(store.jobs.size).toBe(0);
  });

  it('creates an explicit idempotent batch without running providers', async () => {
    const store = new MemoryStore();
    const request = {
      projectId: 'proj-analysis',
      userId: 'user-analysis',
      modality: 'video' as const,
      targetMode: 'all' as const,
    };
    const first = await resolveChatDeepAnalysisJobs(request, resolutionDeps(store));
    const duplicate = await resolveChatDeepAnalysisJobs(request, resolutionDeps(store));

    expect(first.batch).toBe(true);
    expect(first.jobs).toHaveLength(2);
    expect(first.jobs.every((job) => job.created)).toBe(true);
    expect(duplicate.jobs.map((job) => job.jobId)).toEqual(first.jobs.map((job) => job.jobId));
    expect(duplicate.jobs.every((job) => !job.created)).toBe(true);
    expect(store.jobs.size).toBe(2);
  });

  it('does not dispatch a job after the material project revision changes', async () => {
    const { store, jobId } = await resolvedJob();
    const publish = vi.fn();
    const result = await queueChatDeepAnalysisJob({
      jobId,
      projectId: 'proj-analysis',
      userId: 'user-analysis',
    }, {
      ...resolutionDeps(store, PROJECT, 'revision-b'),
      publish,
    });

    expect(result).toMatchObject({ status: 'stale', reason: 'project-revision-changed-before-analysis' });
    expect(publish).not.toHaveBeenCalled();
    expect(store.jobs.get(jobId)?.status).toBe('stale');
  });

  it('publishes one job once and reports duplicate queue attempts safely', async () => {
    const { store, jobId } = await resolvedJob();
    const publish = vi.fn(async () => ({ messageId: 'qstash-message-1' }));
    const deps = { ...resolutionDeps(store), publish };

    const first = await queueChatDeepAnalysisJob({ jobId, projectId: 'proj-analysis', userId: 'user-analysis' }, deps);
    const duplicate = await queueChatDeepAnalysisJob({ jobId, projectId: 'proj-analysis', userId: 'user-analysis' }, deps);

    expect(first).toEqual({ status: 'queued', jobId, messageId: 'qstash-message-1' });
    expect(duplicate).toEqual({ status: 'already-queued', jobId, messageId: 'qstash-message-1' });
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('executes the provider once and makes duplicate worker delivery a no-op', async () => {
    const { store, jobId } = await resolvedJob();
    await queueChatDeepAnalysisJob({ jobId, projectId: 'proj-analysis', userId: 'user-analysis' }, {
      ...resolutionDeps(store),
      publish: async () => ({ messageId: 'qstash-message-1' }),
    });
    const execute = vi.fn(async () => ({ summary: 'one bounded provider result' }));
    const deps = { ...resolutionDeps(store), execute };

    const first = await runChatDeepAnalysisJob({ jobId, projectId: 'proj-analysis', userId: 'user-analysis' }, deps);
    const duplicate = await runChatDeepAnalysisJob({ jobId, projectId: 'proj-analysis', userId: 'user-analysis' }, deps);

    expect(first).toMatchObject({ status: 'completed', result: { summary: 'one bounded provider result' } });
    expect(duplicate).toMatchObject({ status: 'skipped', reason: 'job-not-claimable' });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('retries one provider failure and then completes from the same immutable contract', async () => {
    const { store, jobId } = await resolvedJob();
    await queueChatDeepAnalysisJob({ jobId, projectId: 'proj-analysis', userId: 'user-analysis' }, {
      ...resolutionDeps(store),
      publish: async () => ({ messageId: 'qstash-message-1' }),
    });
    const execute = vi.fn()
      .mockRejectedValueOnce(new Error('provider temporarily unavailable'))
      .mockResolvedValueOnce({ summary: 'recovered' });
    const deps = { ...resolutionDeps(store), execute };

    const first = await runChatDeepAnalysisJob({ jobId, projectId: 'proj-analysis', userId: 'user-analysis' }, deps);
    const second = await runChatDeepAnalysisJob({ jobId, projectId: 'proj-analysis', userId: 'user-analysis' }, deps);

    expect(first).toMatchObject({ status: 'retrying', reason: 'provider temporarily unavailable' });
    expect(second).toMatchObject({ status: 'completed', result: { summary: 'recovered' } });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('maps a provider video result back to edited-timeline frames', async () => {
    const { store, jobId } = await resolvedJob();
    const job = store.jobs.get(jobId)!;
    providerMocks.sampleVideoClip.mockResolvedValueOnce('D:/tmp/sample.mp4');
    providerMocks.sendVideoToGemini.mockResolvedValueOnce({
      sceneChanges: [1, 4, 99],
      deadVisualRanges: [[2, 3], [7, 6]],
      gestures: ['hand moves at frame 2'],
      onScreenText: ['SALE at frame 3'],
      summary: 'A product demonstration.',
      theme: 'demo',
    });

    const result = await executeChatDeepAnalysisProvider(job);

    expect(providerMocks.sampleVideoClip).toHaveBeenCalledWith({
      projectId: 'proj-analysis',
      userId: 'user-analysis',
      source: 'asset',
      assetId: 'asset-b',
      startFrame: 120,
      endFrame: 420,
      fps: 30,
      targetSampleFps: 1,
      maxDurationSec: 120,
    });
    expect(result).toMatchObject({
      modality: 'video',
      vision: {
        sceneChanges: [330, 420],
        deadVisualRanges: [[360, 390]],
        summary: 'A product demonstration.',
      },
    });
  });
});
