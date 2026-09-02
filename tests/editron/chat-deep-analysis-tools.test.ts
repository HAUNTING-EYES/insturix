import { describe, expect, it, vi } from 'vitest';

import {
  createChatDeepAnalysisTools,
  filterChatLegacyDeepAnalysisTools,
} from '@/lib/editron/agent/chat-deep-analysis-tools';
import {
  CHAT_DEEP_ANALYSIS_JOB_VERSION,
  type ChatDeepAnalysisJob,
} from '@/lib/editron/services/chat-deep-analysis-job';

const TARGET = {
  overlayId: 'overlay-1',
  overlayType: 'video',
  assetId: 'asset-1',
  displayName: 'Interview.mp4',
  fps: 30,
  timeline: { startFrame: 90, endFrame: 390 },
  source: { startFrame: 30, endFrame: 330 },
  sourceSelection: { kind: 'DIRECT_ASSET_SOURCE_UNVERSIONED' as const },
};

function toolNamed(
  tools: ReturnType<typeof createChatDeepAnalysisTools>,
  name: string,
) {
  const selected = tools.find((candidate) => candidate.name === name);
  if (!selected) throw new Error(`Missing tool ${name}`);
  return selected as unknown as {
    invoke(input: Record<string, unknown>): Promise<string>;
  };
}

function parseEnvelope(raw: unknown) {
  return JSON.parse(String(raw)) as {
    status: string;
    data: any;
    error: string | null;
    nextAction: string;
  };
}

function storedJob(overrides: Partial<ChatDeepAnalysisJob> = {}): ChatDeepAnalysisJob {
  const now = new Date('2026-07-18T12:00:00.000Z');
  return {
    _id: 'chat_analysis_job_1',
    version: CHAT_DEEP_ANALYSIS_JOB_VERSION,
    status: 'completed',
    projectId: 'project-1',
    userId: 'user-1',
    projectRevision: 'revision-1',
    modality: 'video',
    targetMode: 'overlay',
    target: TARGET,
    attemptCount: 1,
    result: { summary: 'The speaker points to the product.' },
    createdAt: now,
    updatedAt: now,
    completedAt: now,
    expiresAt: new Date('2026-07-19T12:00:00.000Z'),
    ...overrides,
  };
}

describe('chat durable deep-analysis tools', () => {
  it('filters only the synchronous legacy provider tools from live chat', () => {
    expect(filterChatLegacyDeepAnalysisTools([
      { name: 'read_project_file' },
      { name: 'analyze_clip_audio' },
      { name: 'analyze_clip_video' },
      { name: 'apply_editorial_intent' },
    ])).toEqual([
      { name: 'read_project_file' },
      { name: 'apply_editorial_intent' },
    ]);
  });

  it('resolves an exact target without queueing or running a provider', async () => {
    const resolveJobs = vi.fn(async (request) => ({
      status: 'resolved' as const,
      batch: false,
      jobs: [{ jobId: 'chat_analysis_job_1', created: true, status: 'resolved' as const, target: TARGET }],
      request,
    }));
    const queueJob = vi.fn();
    const tools = createChatDeepAnalysisTools(
      { userId: 'user-1', projectId: 'project-1' },
      { resolveJobs, queueJob, findJob: vi.fn() },
    );

    const output = parseEnvelope(await toolNamed(tools, 'resolve_clip_analysis').invoke({
      modality: 'video',
      targetMode: 'overlay',
      overlayId: 'overlay-1',
      windowSeconds: 10,
    }));

    expect(output.status).toBe('success');
    expect(output.data.jobs[0].jobId).toBe('chat_analysis_job_1');
    expect(resolveJobs).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      projectId: 'project-1',
      overlayId: 'overlay-1',
    }));
    expect(queueJob).not.toHaveBeenCalled();
    expect(output.nextAction).toContain('queue_resolved_clip_analysis');
  });

  it('queues only the explicit job IDs, once each and in order', async () => {
    const calls: string[] = [];
    const tools = createChatDeepAnalysisTools(
      { userId: 'user-1', projectId: 'project-1' },
      {
        resolveJobs: vi.fn(),
        queueJob: vi.fn(async ({ jobId }) => {
          calls.push(jobId);
          return { status: 'queued' as const, jobId };
        }),
        findJob: vi.fn(),
      },
    );

    const output = parseEnvelope(await toolNamed(tools, 'queue_resolved_clip_analysis').invoke({
      jobIds: ['chat_analysis_job_1', 'chat_analysis_job_2'],
    }));

    expect(output.status).toBe('success');
    expect(calls).toEqual(['chat_analysis_job_1', 'chat_analysis_job_2']);
    expect(output.nextAction).toContain('processing');
  });

  it('refuses to present a pending job as completed evidence', async () => {
    const tools = createChatDeepAnalysisTools(
      { userId: 'user-1', projectId: 'project-1' },
      {
        resolveJobs: vi.fn(),
        queueJob: vi.fn(),
        findJob: vi.fn(async () => storedJob({ status: 'running', result: null })),
      },
    );

    const output = parseEnvelope(await toolNamed(tools, 'get_clip_analysis_result').invoke({
      jobIds: ['chat_analysis_job_1'],
    }));

    expect(output.status).toBe('advisory');
    expect(output.data.jobs[0].result).toBeNull();
    expect(output.nextAction).toContain('Do not claim findings');
  });

  it('returns completed evidence only for a job owned by the current project', async () => {
    const findJob = vi.fn(async () => storedJob());
    const tools = createChatDeepAnalysisTools(
      { userId: 'user-1', projectId: 'project-1' },
      { resolveJobs: vi.fn(), queueJob: vi.fn(), findJob },
    );

    const output = parseEnvelope(await toolNamed(tools, 'get_clip_analysis_result').invoke({
      jobIds: ['chat_analysis_job_1'],
    }));

    expect(output.status).toBe('success');
    expect(output.data.jobs[0]).toMatchObject({
      jobId: 'chat_analysis_job_1',
      status: 'completed',
      result: { summary: 'The speaker points to the product.' },
    });
    expect(findJob).toHaveBeenCalledWith('chat_analysis_job_1', 'user-1');
  });

  it('does not leak a job from another project', async () => {
    const tools = createChatDeepAnalysisTools(
      { userId: 'user-1', projectId: 'project-1' },
      {
        resolveJobs: vi.fn(),
        queueJob: vi.fn(),
        findJob: vi.fn(async () => storedJob({ projectId: 'project-2' })),
      },
    );

    const output = parseEnvelope(await toolNamed(tools, 'get_clip_analysis_result').invoke({
      jobIds: ['chat_analysis_job_1'],
    }));

    expect(output.status).toBe('error');
    expect(output.data.missingJobIds).toEqual(['chat_analysis_job_1']);
    expect(output.data.jobs).toEqual([]);
  });
});
