import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadProjectForMutation: vi.fn(),
  recordPublished: vi.fn(),
  recordInlineReady: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@/lib/editron/services/project-service', () => {
  class ProjectMutationConflictError extends Error {
    readonly code = 'PROJECT_REVISION_CONFLICT';

    constructor(readonly currentRevision: unknown) {
      super('revision conflict');
      this.name = 'ProjectMutationConflictError';
    }
  }
  return {
    ProjectMutationConflictError,
    projectService: {
      loadProjectForMutation: mocks.loadProjectForMutation,
      recordProjectAnalysisIntakeDispatchPublishedV1: mocks.recordPublished,
      recordProjectAnalysisIntakeDispatchInlineReadyV1: mocks.recordInlineReady,
    },
  };
});

const REVISION_7 = {
  schemaVersion: 1 as const,
  value: 7,
  compatibilityUpdatedAt: '2026-09-01T12:00:00.000Z',
};
const REVISION_8 = {
  ...REVISION_7,
  value: 8,
  compatibilityUpdatedAt: '2026-09-01T12:00:01.000Z',
};
const DISPATCH = {
  schemaVersion: 1 as const,
  deduplicationId: 'editron_analysis_dispatch_exact',
  status: 'pending' as const,
  preparedAt: '2026-09-01T12:00:00.000Z',
};

function input() {
  return {
    projectId: 'project_1',
    userId: 'user_1',
    analysisRunId: 'analysis_run_12345678901234567890',
    sourceAssetId: 'asset_1',
    workerPayload: {
      projectId: 'forged_project',
      userId: 'forged_user',
      assetId: 'forged_asset',
      analysisRunId: 'forged_run',
      videoUrl: 'https://media.example.test/video.mp4',
    },
    dispatch: DISPATCH,
  };
}

function qstashResponse(status: number, body: Record<string, unknown> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => body),
    text: vi.fn(async () => JSON.stringify(body)),
  };
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  vi.stubEnv('QSTASH_TOKEN', 'qstash-token');
  vi.stubEnv('VERCEL_URL', 'editron.example.test');
  vi.stubEnv('QSTASH_URL', 'https://qstash.example.test');
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.loadProjectForMutation.mockResolvedValue({ revision: REVISION_7 });
  mocks.recordPublished.mockResolvedValue({ disposition: 'ADVANCED' });
  mocks.recordInlineReady.mockResolvedValue({ disposition: 'ADVANCED' });
  mocks.fetch.mockResolvedValue(qstashResponse(202, { messageId: 'qstash_message_1' }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('project analysis intake publication', () => {
  it('publishes the exact owner-issued dispatch and records its provider receipt', async () => {
    const { publishProjectAnalysisIntakeDispatchV1 } = await import(
      '@/lib/editron/services/project-analysis-intake-publication'
    );
    await expect(publishProjectAnalysisIntakeDispatchV1(input())).resolves.toEqual({
      deduplicationId: DISPATCH.deduplicationId,
      providerMessageId: 'qstash_message_1',
      httpStatus: 202,
    });

    expect(mocks.fetch).toHaveBeenCalledWith(
      'https://qstash.example.test/v2/publish/https://editron.example.test/api/internal/workers/video-analysis',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Upstash-Deduplication-Id': DISPATCH.deduplicationId,
          'Upstash-Retries': '3',
          'Upstash-Timeout': '800s',
        }),
      }),
    );
    const request = mocks.fetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      projectId: 'project_1',
      userId: 'user_1',
      assetId: 'asset_1',
      analysisRunId: 'analysis_run_12345678901234567890',
      analysisIntakeDispatchId: DISPATCH.deduplicationId,
      videoUrl: 'https://media.example.test/video.mp4',
    });
    expect(mocks.recordPublished).toHaveBeenCalledWith('user_1', 'project_1', {
      expectedRevision: REVISION_7,
      runId: 'analysis_run_12345678901234567890',
      sourceAssetId: 'asset_1',
      deduplicationId: DISPATCH.deduplicationId,
      providerMessageId: 'qstash_message_1',
    });
  });

  it('retries only the local receipt after a revision conflict', async () => {
    const { ProjectMutationConflictError } = await import('@/lib/editron/services/project-service');
    const { publishProjectAnalysisIntakeDispatchV1 } = await import(
      '@/lib/editron/services/project-analysis-intake-publication'
    );
    mocks.recordPublished
      .mockRejectedValueOnce(new ProjectMutationConflictError(REVISION_8))
      .mockResolvedValueOnce({ disposition: 'ALREADY_ADVANCED' });

    await expect(publishProjectAnalysisIntakeDispatchV1(input())).resolves.toMatchObject({
      providerMessageId: 'qstash_message_1',
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.recordPublished).toHaveBeenCalledTimes(2);
    expect(mocks.recordPublished.mock.calls[1]?.[2]).toMatchObject({ expectedRevision: REVISION_8 });
  });

  it('distinguishes provider rejection from accepted publication without a receipt', async () => {
    const { publishProjectAnalysisIntakeDispatchV1 } = await import(
      '@/lib/editron/services/project-analysis-intake-publication'
    );
    mocks.fetch.mockResolvedValueOnce(qstashResponse(503, { error: 'unavailable' }));
    await expect(publishProjectAnalysisIntakeDispatchV1(input())).rejects.toMatchObject({
      providerAccepted: false,
      httpStatus: 503,
    });
    expect(mocks.recordPublished).not.toHaveBeenCalled();

    mocks.fetch.mockResolvedValueOnce(qstashResponse(202, {}));
    await expect(publishProjectAnalysisIntakeDispatchV1(input())).rejects.toMatchObject({
      providerAccepted: true,
      httpStatus: 202,
    });
  });

  it('records inline activation without publishing', async () => {
    const { activateProjectAnalysisIntakeInlineV1 } = await import(
      '@/lib/editron/services/project-analysis-intake-publication'
    );
    await expect(activateProjectAnalysisIntakeInlineV1({
      projectId: 'project_1',
      userId: 'user_1',
      analysisRunId: 'analysis_run_12345678901234567890',
      sourceAssetId: 'asset_1',
      dispatch: DISPATCH,
    })).resolves.toBeUndefined();
    expect(mocks.recordInlineReady).toHaveBeenCalledWith('user_1', 'project_1', {
      expectedRevision: REVISION_7,
      runId: 'analysis_run_12345678901234567890',
      sourceAssetId: 'asset_1',
      deduplicationId: DISPATCH.deduplicationId,
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
