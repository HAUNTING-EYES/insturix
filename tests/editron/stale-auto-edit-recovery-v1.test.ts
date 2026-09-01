import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadProjectForMutation: vi.fn(),
  failProjectAnalysisRunV1: vi.fn(),
  failDirectorRunV1: vi.fn(),
  recordDirectorDeliveryFailureV1: vi.fn(),
}));

vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: mocks,
}));

import { recoverStaleAutoEditProjectV1 } from '@/lib/editron/services/stale-auto-edit-recovery-v1';

const REVISION_7 = {
  schemaVersion: 1 as const,
  value: 7,
  compatibilityUpdatedAt: '2026-09-02T00:00:00.000Z',
};
const STALE_BEFORE = new Date('2026-09-02T00:20:00.000Z');

function staleProject(overrides: Record<string, unknown> = {}) {
  return {
    projectId: 'project_1',
    userId: 'user_1',
    editMode: 'auto',
    autoEditStatus: 'analyzing',
    autoEditAnalysisRunV1: {
      schemaVersion: 1,
      runId: 'analysis_run_1',
      sourceAssetId: 'asset_1',
      lane: 'auto',
      state: 'analyzing',
    },
    updatedAt: new Date('2026-09-02T00:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadProjectForMutation.mockResolvedValue({
    project: staleProject(),
    revision: REVISION_7,
  });
  mocks.failProjectAnalysisRunV1.mockResolvedValue({ disposition: 'RECORDED' });
  mocks.failDirectorRunV1.mockResolvedValue({ disposition: 'RECORDED' });
  mocks.recordDirectorDeliveryFailureV1.mockResolvedValue({ disposition: 'RECORDED' });
});

describe('stale auto-edit recovery V1', () => {
  it('fails only the exact current analysis run and revision', async () => {
    const result = await recoverStaleAutoEditProjectV1({
      userId: 'user_1',
      projectId: 'project_1',
      staleBefore: STALE_BEFORE,
      now: new Date('2026-09-02T00:40:00.000Z'),
    });

    expect(result).toEqual({
      disposition: 'RECOVERED',
      priorStatus: 'analyzing',
      ownerKind: 'ANALYSIS_RUN',
    });
    expect(mocks.failProjectAnalysisRunV1).toHaveBeenCalledWith(
      'user_1',
      'project_1',
      expect.objectContaining({
        expectedRevision: REVISION_7,
        runId: 'analysis_run_1',
        sourceAssetId: 'asset_1',
      }),
    );
  });

  it('does not mutate a project that became fresh after the cron query', async () => {
    mocks.loadProjectForMutation.mockResolvedValueOnce({
      project: staleProject({ updatedAt: new Date('2026-09-02T00:25:00.000Z') }),
      revision: REVISION_7,
    });

    await expect(recoverStaleAutoEditProjectV1({
      userId: 'user_1',
      projectId: 'project_1',
      staleBefore: STALE_BEFORE,
    })).resolves.toMatchObject({ disposition: 'NOT_STALE' });
    expect(mocks.failProjectAnalysisRunV1).not.toHaveBeenCalled();
  });

  it('fails an active Director only through its exact run token', async () => {
    mocks.loadProjectForMutation.mockResolvedValueOnce({
      project: staleProject({
        autoEditStatus: 'directing',
        directorRunToken: 'director_run_12345678901234567890',
      }),
      revision: REVISION_7,
    });

    const result = await recoverStaleAutoEditProjectV1({
      userId: 'user_1',
      projectId: 'project_1',
      staleBefore: STALE_BEFORE,
    });
    expect(result.ownerKind).toBe('DIRECTOR_RUN');
    expect(mocks.failDirectorRunV1).toHaveBeenCalledWith(
      'user_1',
      'project_1',
      expect.objectContaining({ directorRunToken: 'director_run_12345678901234567890' }),
    );
  });

  it('uses the persisted message and dispatch token for queued delivery recovery', async () => {
    mocks.loadProjectForMutation.mockResolvedValueOnce({
      project: staleProject({
        autoEditStatus: 'directing_queued',
        directorMessageId: 'message_1',
        pipelineDirectorDispatch: {
          schemaVersion: 1,
          dispatchToken: 'pipeline_director_dispatch_12345678901234567890',
        },
      }),
      revision: REVISION_7,
    });

    const result = await recoverStaleAutoEditProjectV1({
      userId: 'user_1',
      projectId: 'project_1',
      staleBefore: STALE_BEFORE,
    });
    expect(result.ownerKind).toBe('DIRECTOR_DELIVERY');
    expect(mocks.recordDirectorDeliveryFailureV1).toHaveBeenCalledWith(
      'user_1',
      'project_1',
      expect.objectContaining({
        sourceMessageId: 'message_1',
        pipelineDirectorDispatchToken: 'pipeline_director_dispatch_12345678901234567890',
      }),
    );
  });

  it('leaves a stale legacy state untouched when no durable owner exists', async () => {
    mocks.loadProjectForMutation.mockResolvedValueOnce({
      project: staleProject({ autoEditAnalysisRunV1: undefined }),
      revision: REVISION_7,
    });

    await expect(recoverStaleAutoEditProjectV1({
      userId: 'user_1',
      projectId: 'project_1',
      staleBefore: STALE_BEFORE,
    })).resolves.toEqual({
      disposition: 'UNVERIFIABLE_OWNER',
      priorStatus: 'analyzing',
      ownerKind: null,
    });
    expect(mocks.failProjectAnalysisRunV1).not.toHaveBeenCalled();
    expect(mocks.failDirectorRunV1).not.toHaveBeenCalled();
  });

  it('keeps the cron outside raw project mutation ownership', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/api/cron/recover-stuck-projects/route.ts'),
      'utf8',
    );
    expect(source).toContain('recoverStaleAutoEditProjectV1({');
    expect(source).not.toContain('collection(COLLECTIONS.PROJECTS).updateOne');
  });
});
