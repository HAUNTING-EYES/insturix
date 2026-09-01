import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getActiveProjectRenderJobsV1: vi.fn(),
  getActiveRendersForUser: vi.fn(),
  loadProjectForRenderSnapshot: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));

vi.mock('@/lib/editron/services/render-job-service', () => ({
  getActiveProjectRenderJobsV1: mocks.getActiveProjectRenderJobsV1,
  getActiveRendersForUser: mocks.getActiveRendersForUser,
}));

vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: {
    loadProjectForRenderSnapshot: mocks.loadProjectForRenderSnapshot,
  },
}));

import { GET } from '@/app/api/services/editron/render/active/route';

const REVISION = {
  schemaVersion: 1 as const,
  value: 7,
  compatibilityUpdatedAt: '2026-09-01T00:00:00.000Z',
};

describe('Editron active render route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user_1' });
    mocks.loadProjectForRenderSnapshot.mockResolvedValue({
      project: {},
      ownerId: 'owner_1',
      revision: REVISION,
    });
    mocks.getActiveProjectRenderJobsV1.mockResolvedValue({
      ok: true,
      status: 'CURRENT',
      jobs: [],
    });
    mocks.getActiveRendersForUser.mockResolvedValue([]);
  });

  it('returns current strict renders for an access-authorized collaborator', async () => {
    mocks.getActiveProjectRenderJobsV1.mockResolvedValueOnce({
      ok: true,
      status: 'CURRENT',
      jobs: [{
        _id: 'strict_admission',
        providerRenderId: 'strict_provider',
        userId: 'owner_1',
        requestedByUserId: 'user_1',
        projectId: 'project_1',
        status: 'rendering',
        progress: 0.42,
        bucketName: 'render-bucket',
        region: 'ap-south-1',
        startedAt: new Date('2026-09-01T00:01:00.000Z'),
        projectRenderSnapshotBinding: { scope: 'PROJECT_SNAPSHOT' },
      }],
    });

    const response = await GET(new Request(
      'http://localhost/api/services/editron/render/active?projectId=project_1',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getActiveProjectRenderJobsV1).toHaveBeenCalledWith({
      ownerId: 'owner_1',
      requestedByUserId: 'user_1',
      projectId: 'project_1',
      currentProjectRevision: REVISION,
      limit: 10,
    });
    expect(mocks.getActiveRendersForUser).toHaveBeenCalledWith('owner_1');
    expect(body.data.renders).toEqual([expect.objectContaining({
      renderId: 'strict_provider',
      projectId: 'project_1',
      status: 'rendering',
      progress: 42,
      bucketName: 'render-bucket',
      region: 'ap-south-1',
    })]);
  });

  it('keeps the unscoped compatibility path legacy-only', async () => {
    mocks.getActiveRendersForUser.mockResolvedValueOnce([
      {
        _id: 'legacy_render',
        userId: 'user_1',
        projectId: 'project_1',
        status: 'rendering',
        progress: 0.5,
        startedAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      {
        _id: 'strict_render',
        userId: 'user_1',
        requestedByUserId: 'user_1',
        projectId: 'project_1',
        status: 'rendering',
        startedAt: new Date('2026-09-01T00:01:00.000Z'),
        projectRenderSnapshotBinding: { scope: 'PROJECT_SNAPSHOT' },
      },
    ]);

    const response = await GET(new Request(
      'http://localhost/api/services/editron/render/active',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.renders).toHaveLength(1);
    expect(body.data.renders[0]).toMatchObject({
      renderId: 'legacy_render',
      progress: 50,
    });
    expect(mocks.loadProjectForRenderSnapshot).not.toHaveBeenCalled();
    expect(mocks.getActiveProjectRenderJobsV1).not.toHaveBeenCalled();
  });

  it('does not disclose active renders without current project access', async () => {
    mocks.loadProjectForRenderSnapshot.mockResolvedValueOnce(null);

    const response = await GET(new Request(
      'http://localhost/api/services/editron/render/active?projectId=project_1',
    ));

    expect(response.status).toBe(404);
    expect(mocks.getActiveProjectRenderJobsV1).not.toHaveBeenCalled();
    expect(mocks.getActiveRendersForUser).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated active-render requests', async () => {
    mocks.auth.mockResolvedValueOnce({ userId: null });

    const response = await GET(new Request(
      'http://localhost/api/services/editron/render/active?projectId=project_1',
    ));

    expect(response.status).toBe(401);
    expect(mocks.loadProjectForRenderSnapshot).not.toHaveBeenCalled();
  });
});
