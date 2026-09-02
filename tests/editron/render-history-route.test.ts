import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getProjectRenderHistoryV1: vi.fn(),
  getRenderHistoryForProject: vi.fn(),
  loadProjectForRenderSnapshot: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.auth,
}));

vi.mock('@/lib/editron/services/render-job-service', () => ({
  getProjectRenderHistoryV1: mocks.getProjectRenderHistoryV1,
  getRenderHistoryForProject: mocks.getRenderHistoryForProject,
  MAX_RENDER_FINALIZATION_ATTEMPTS: 3,
}));

vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: {
    loadProjectForRenderSnapshot: mocks.loadProjectForRenderSnapshot,
  },
}));

import { GET } from '@/app/api/services/editron/render/history/route';
import { parseRenderHistoryItem } from '@/components/editron/editor/version-7.0.0/components/rendering/render-delivery-ui';

describe('Editron render history route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user_1' });
    mocks.loadProjectForRenderSnapshot.mockResolvedValue({
      project: {},
      ownerId: 'user_1',
      revision: {
        schemaVersion: 1,
        value: 7,
        compatibilityUpdatedAt: '2026-09-01T00:00:00.000Z',
      },
    });
    mocks.getProjectRenderHistoryV1.mockResolvedValue({
      ok: true,
      status: 'HISTORY',
      jobs: [],
    });
    mocks.getRenderHistoryForProject.mockResolvedValue([]);
  });

  it('returns integrity-validated strict history to an access-authorized collaborator', async () => {
    mocks.auth.mockResolvedValue({ userId: 'collaborator_1' });
    mocks.loadProjectForRenderSnapshot.mockResolvedValueOnce({
      project: {},
      ownerId: 'owner_1',
      revision: {
        schemaVersion: 1,
        value: 9,
        compatibilityUpdatedAt: '2026-09-01T00:05:00.000Z',
      },
    });
    mocks.getProjectRenderHistoryV1.mockResolvedValueOnce({
      ok: true,
      status: 'HISTORY',
      jobs: [{
        _id: 'strict_render_1',
        userId: 'owner_1',
        requestedByUserId: 'collaborator_1',
        projectId: 'project_1',
        status: 'done',
        outputUrl: 'https://video.example/strict.mp4',
        outputSize: 2_048,
        startedAt: new Date('2026-07-26T00:00:00.000Z'),
        completedAt: new Date('2026-07-26T00:05:00.000Z'),
      }],
    });

    const response = await GET(new NextRequest(
      'http://localhost/api/services/editron/render/history?projectId=project_1',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getProjectRenderHistoryV1).toHaveBeenCalledWith({
      ownerId: 'owner_1',
      requestedByUserId: 'collaborator_1',
      projectId: 'project_1',
      limit: 10,
    });
    expect(mocks.getRenderHistoryForProject).toHaveBeenCalledWith(
      'project_1',
      'owner_1',
      10,
    );
    expect(body.data.renders).toHaveLength(1);
    expect(body.data.renders[0]).toMatchObject({
      id: 'strict_render_1',
      url: 'https://video.example/strict.mp4',
    });
  });

  it('does not disclose history after project access is revoked', async () => {
    mocks.loadProjectForRenderSnapshot.mockResolvedValueOnce(null);

    const response = await GET(new NextRequest(
      'http://localhost/api/services/editron/render/history?projectId=project_1',
    ));

    expect(response.status).toBe(404);
    expect(mocks.getProjectRenderHistoryV1).not.toHaveBeenCalled();
    expect(mocks.getRenderHistoryForProject).not.toHaveBeenCalled();
  });

  it('returns owner-scoped delivery manifests with completed renders', async () => {
    const deliveryManifest = {
      version: 'editron-render-delivery-manifest-v1',
      mode: 'platform-native',
      primaryArtifact: {
        kind: 'clean-master',
        status: 'ready',
        url: 'https://video.example/clean.mp4',
      },
      music: {
        embedded: false,
        handoff: {
          timing: {
            platformTrackSourceOffsetMs: null,
            cueStatus: 'manual-cue-required',
          },
        },
      },
    };
    mocks.getRenderHistoryForProject.mockResolvedValue([{
      _id: 'render_1',
      status: 'done',
      outputUrl: 'https://video.example/clean.mp4',
      outputSize: 1_024,
      deliveryManifest,
      startedAt: new Date('2026-07-26T00:00:00.000Z'),
      completedAt: new Date('2026-07-26T00:05:00.000Z'),
      expiresAt: new Date('2026-08-02T00:05:00.000Z'),
    }]);

    const response = await GET(new NextRequest(
      'http://localhost/api/services/editron/render/history?projectId=project_1',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getRenderHistoryForProject).toHaveBeenCalledWith(
      'project_1',
      'user_1',
      10,
    );
    expect(body.data.renders[0]).toMatchObject({
      id: 'render_1',
      url: 'https://video.example/clean.mp4',
      deliveryManifest,
      finalizationState: null,
      canRetryFinalization: false,
      startedAt: '2026-07-26T00:00:00.000Z',
      completedAt: '2026-07-26T00:05:00.000Z',
    });
  });

  it('marks a failed finalization with preserved source evidence as retryable', async () => {
    mocks.getRenderHistoryForProject.mockResolvedValue([{
      _id: 'render_retryable',
      status: 'error',
      expectedDurationMs: 38_000,
      startedAt: new Date('2026-07-26T00:00:00.000Z'),
      finalization: {
        state: 'failed',
        attempts: 2,
        sourceOutputUrl: 'https://private-provider.example/raw.mp4',
        sourceOutputSize: 44_583_988,
        claimToken: 'rfl_secret_claim',
      },
    }]);

    const response = await GET(new NextRequest(
      'http://localhost/api/services/editron/render/history?projectId=project_1',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.renders[0]).toMatchObject({
      id: 'render_retryable',
      status: 'error',
      finalizationState: 'failed',
      canRetryFinalization: true,
    });
    expect(JSON.stringify(body)).not.toContain('https://private-provider.example/raw.mp4');
    expect(JSON.stringify(body)).not.toContain('rfl_secret_claim');
  });

  it.each([
    {
      name: 'attempt budget is exhausted',
      finalization: {
        state: 'failed',
        attempts: 3,
        sourceOutputUrl: 'https://private-provider.example/raw.mp4',
        sourceOutputSize: 44_583_988,
      },
      expectedDurationMs: 38_000,
    },
    {
      name: 'source evidence is incomplete',
      finalization: {
        state: 'failed',
        attempts: 1,
        sourceOutputUrl: 'https://private-provider.example/raw.mp4',
      },
      expectedDurationMs: 38_000,
    },
    {
      name: 'duration contract is missing',
      finalization: {
        state: 'failed',
        attempts: 1,
        sourceOutputUrl: 'https://private-provider.example/raw.mp4',
        sourceOutputSize: 44_583_988,
      },
      expectedDurationMs: undefined,
    },
  ])('does not offer retry when $name', async ({ finalization, expectedDurationMs }) => {
    mocks.getRenderHistoryForProject.mockResolvedValue([{
      _id: 'render_not_retryable',
      status: 'error',
      expectedDurationMs,
      startedAt: new Date('2026-07-26T00:00:00.000Z'),
      finalization,
    }]);

    const response = await GET(new NextRequest(
      'http://localhost/api/services/editron/render/history?projectId=project_1',
    ));
    const body = await response.json();

    expect(body.data.renders[0].canRetryFinalization).toBe(false);
  });

  it('represents an active finalization without offering another retry', async () => {
    mocks.getRenderHistoryForProject.mockResolvedValue([{
      _id: 'render_finalizing',
      status: 'finalizing',
      expectedDurationMs: 38_000,
      startedAt: new Date('2026-07-26T00:00:00.000Z'),
      finalization: {
        state: 'running',
        attempts: 2,
        sourceOutputUrl: 'https://private-provider.example/raw.mp4',
        sourceOutputSize: 44_583_988,
        claimToken: 'rfl_active_secret',
      },
    }]);

    const response = await GET(new NextRequest(
      'http://localhost/api/services/editron/render/history?projectId=project_1',
    ));
    const body = await response.json();

    expect(body.data.renders[0]).toMatchObject({
      id: 'render_finalizing',
      status: 'finalizing',
      finalizationState: 'running',
      canRetryFinalization: false,
      startedAt: '2026-07-26T00:00:00.000Z',
    });
    expect(JSON.stringify(body)).not.toContain('https://private-provider.example/raw.mp4');
    expect(JSON.stringify(body)).not.toContain('rfl_active_secret');
  });

  it('hydrates finalizing and retryable history rows for the editor controls', () => {
    expect(parseRenderHistoryItem({
      id: 'render_finalizing',
      status: 'finalizing',
      startedAt: '2026-07-26T00:00:00.000Z',
      finalizationState: 'running',
      canRetryFinalization: false,
    })).toMatchObject({
      id: 'render_finalizing',
      status: 'finalizing',
      timestamp: new Date('2026-07-26T00:00:00.000Z'),
    });
    expect(parseRenderHistoryItem({
      id: 'render_retryable',
      status: 'error',
      startedAt: '2026-07-26T00:00:00.000Z',
      completedAt: '2026-07-26T00:05:00.000Z',
      finalizationState: 'failed',
      canRetryFinalization: true,
    })).toMatchObject({
      id: 'render_retryable',
      status: 'error',
      canRetryFinalization: true,
      timestamp: new Date('2026-07-26T00:05:00.000Z'),
    });
  });

  it('rejects unauthenticated and malformed history requests', async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    const unauthorized = await GET(new NextRequest(
      'http://localhost/api/services/editron/render/history?projectId=project_1',
    ));

    expect(unauthorized.status).toBe(401);
    expect(mocks.getRenderHistoryForProject).not.toHaveBeenCalled();

    mocks.auth.mockResolvedValue({ userId: 'user_1' });
    const malformed = await GET(new NextRequest(
      'http://localhost/api/services/editron/render/history',
    ));

    expect(malformed.status).toBe(400);
    expect(mocks.getRenderHistoryForProject).not.toHaveBeenCalled();
  });
});
