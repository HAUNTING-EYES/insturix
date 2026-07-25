import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getRenderHistoryForProject: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.auth,
}));

vi.mock('@/lib/editron/services/render-job-service', () => ({
  getRenderHistoryForProject: mocks.getRenderHistoryForProject,
}));

import { GET } from '@/app/api/services/editron/render/history/route';

describe('Editron render history route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user_1' });
    mocks.getRenderHistoryForProject.mockResolvedValue([]);
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
