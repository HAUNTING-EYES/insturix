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
      recordProjectAnalysisDeepDispatchPublishedV1: mocks.recordPublished,
      recordProjectAnalysisDeepDispatchInlineReadyV1: mocks.recordInlineReady,
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
  deduplicationId: 'editron_tribe_dispatch_exact',
  status: 'pending' as const,
  preparedAt: '2026-09-01T12:00:00.000Z',
};

function input(overrides: Record<string, unknown> = {}) {
  return {
    projectId: 'project_1',
    userId: 'user_1',
    analysisRunId: 'analysis_run_12345678901234567890',
    sourceAssetId: 'asset_1',
    tribePayload: {
      projectId: 'forged_project',
      userId: 'forged_user',
      assetId: 'forged_asset',
      analysisRunId: 'forged_run',
      deepAnalysisDispatchId: 'forged_dispatch',
      videoUrl: 'https://media.example.test/video.mp4',
      segmentInputs: [{ startMs: 0, endMs: 1_000 }],
      directorPayload: { profileId: 'G-01' },
    },
    dispatch: DISPATCH,
    ...overrides,
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

describe('project analysis deep publication', () => {
  it('publishes one exact run-bound TRIBE message and records its provider receipt', async () => {
    const onProviderAccepted = vi.fn();
    const { publishProjectAnalysisDeepDispatchV1 } = await import(
      '@/lib/editron/services/project-analysis-deep-publication'
    );

    await expect(publishProjectAnalysisDeepDispatchV1({
      ...input(),
      onProviderAccepted,
    })).resolves.toEqual({
      deduplicationId: DISPATCH.deduplicationId,
      providerMessageId: 'qstash_message_1',
      httpStatus: 202,
    });

    expect(mocks.fetch).toHaveBeenCalledWith(
      'https://qstash.example.test/v2/publish/https://editron.example.test/api/internal/workers/tribe-analysis',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer qstash-token',
          'Upstash-Retries': '3',
          'Upstash-Delay': '2s',
          'Upstash-Timeout': '800s',
          'Upstash-Deduplication-Id': DISPATCH.deduplicationId,
        }),
      }),
    );
    const request = mocks.fetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      projectId: 'project_1',
      userId: 'user_1',
      assetId: 'asset_1',
      analysisRunId: 'analysis_run_12345678901234567890',
      deepAnalysisDispatchId: DISPATCH.deduplicationId,
      videoUrl: 'https://media.example.test/video.mp4',
    });
    expect(onProviderAccepted).toHaveBeenCalledTimes(1);
    expect(mocks.recordPublished).toHaveBeenCalledWith('user_1', 'project_1', {
      expectedRevision: REVISION_7,
      runId: 'analysis_run_12345678901234567890',
      sourceAssetId: 'asset_1',
      deduplicationId: DISPATCH.deduplicationId,
      providerMessageId: 'qstash_message_1',
    });
  });

  it('retries only the local publication receipt without republishing', async () => {
    const { ProjectMutationConflictError } = await import('@/lib/editron/services/project-service');
    const { publishProjectAnalysisDeepDispatchV1 } = await import(
      '@/lib/editron/services/project-analysis-deep-publication'
    );
    mocks.recordPublished
      .mockRejectedValueOnce(new ProjectMutationConflictError(REVISION_8))
      .mockResolvedValueOnce({ disposition: 'ALREADY_ADVANCED' });

    await expect(publishProjectAnalysisDeepDispatchV1(input())).resolves.toMatchObject({
      providerMessageId: 'qstash_message_1',
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.recordPublished).toHaveBeenCalledTimes(2);
    expect(mocks.recordPublished.mock.calls[1]?.[2]).toMatchObject({ expectedRevision: REVISION_8 });
  });

  it('activates one exact inline dispatch and retries only its revision receipt', async () => {
    const { ProjectMutationConflictError } = await import('@/lib/editron/services/project-service');
    const { activateProjectAnalysisDeepInlineV1 } = await import(
      '@/lib/editron/services/project-analysis-deep-publication'
    );
    mocks.recordInlineReady
      .mockRejectedValueOnce(new ProjectMutationConflictError(REVISION_8))
      .mockResolvedValueOnce({ disposition: 'ALREADY_ADVANCED' });

    await expect(activateProjectAnalysisDeepInlineV1({
      projectId: 'project_1',
      userId: 'user_1',
      analysisRunId: 'analysis_run_12345678901234567890',
      sourceAssetId: 'asset_1',
      dispatch: DISPATCH,
    })).resolves.toBeUndefined();
    expect(mocks.recordInlineReady).toHaveBeenNthCalledWith(2, 'user_1', 'project_1', {
      expectedRevision: REVISION_8,
      runId: 'analysis_run_12345678901234567890',
      sourceAssetId: 'asset_1',
      deduplicationId: DISPATCH.deduplicationId,
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('fails before project reads when the provider rejects publication', async () => {
    const { publishProjectAnalysisDeepDispatchV1 } = await import(
      '@/lib/editron/services/project-analysis-deep-publication'
    );
    mocks.fetch.mockResolvedValueOnce(qstashResponse(503, { error: 'unavailable' }));

    await expect(publishProjectAnalysisDeepDispatchV1(input())).rejects.toMatchObject({
      name: 'ProjectAnalysisDeepPublicationError',
      providerAccepted: false,
      httpStatus: 503,
    });
    expect(mocks.loadProjectForMutation).not.toHaveBeenCalled();
    expect(mocks.recordPublished).not.toHaveBeenCalled();
  });

  it('preserves provider acceptance when the receipt is missing or project reload fails', async () => {
    const { publishProjectAnalysisDeepDispatchV1 } = await import(
      '@/lib/editron/services/project-analysis-deep-publication'
    );
    mocks.fetch.mockResolvedValueOnce(qstashResponse(202, {}));
    await expect(publishProjectAnalysisDeepDispatchV1(input())).rejects.toMatchObject({
      providerAccepted: true,
      httpStatus: 202,
    });

    mocks.fetch.mockResolvedValueOnce(qstashResponse(202, { messageId: 'qstash_message_2' }));
    mocks.loadProjectForMutation.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(publishProjectAnalysisDeepDispatchV1(input())).rejects.toMatchObject({
      providerAccepted: true,
      message: 'database unavailable',
    });
  });
});
