import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeMocks = vi.hoisted(() => ({
  auth: vi.fn(),
  renderMediaOnLambda: vi.fn(),
  createJob: vi.fn(),
  resolveProjectAssets: vi.fn(),
  loadProject: vi.fn(),
  verifyAudioRights: vi.fn(),
  assertRemotionSiteFresh: vi.fn(),
  checkCredits: vi.fn(),
  deduct: vi.fn(),
  refund: vi.fn(),
  setAwsCredentials: vi.fn(),
  shouldUseChapterRendering: vi.fn(),
  startChapterRender: vi.fn(),
  transitionProjectStatus: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: routeMocks.auth,
}));

vi.mock('@remotion/lambda/client', () => ({
  renderMediaOnLambda: routeMocks.renderMediaOnLambda,
}));

vi.mock('@/lib/editron/services/render-job-service', () => ({
  createJob: routeMocks.createJob,
}));

vi.mock('@/lib/editron/services/asset-resolver', () => ({
  assetResolver: {
    resolveProjectAssets: routeMocks.resolveProjectAssets,
  },
}));

vi.mock('@/lib/editron/services/project-service', () => ({
  projectService: {
    loadProject: routeMocks.loadProject,
  },
}));

vi.mock('@/lib/editron/services/render-audio-rights-authority', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/editron/services/render-audio-rights-authority')>();
  return {
    ...actual,
    verifyRenderAudioRightsAuthority: routeMocks.verifyAudioRights,
  };
});

vi.mock('@/lib/editron/services/remotion-site-version', () => ({
  assertRemotionSiteFresh: routeMocks.assertRemotionSiteFresh,
}));

vi.mock('@/lib/services/creditsMiddleware', () => ({
  checkCredits: routeMocks.checkCredits,
}));

vi.mock('@/lib/editron/utils/aws-credentials', () => ({
  setAWSCredentials: routeMocks.setAwsCredentials,
}));

vi.mock('@/lib/editron/services/chapter-renderer', () => ({
  shouldUseChapterRendering: routeMocks.shouldUseChapterRendering,
  startChapterRender: routeMocks.startChapterRender,
}));

vi.mock('@/lib/shared/project-status', () => ({
  transitionProjectStatus: routeMocks.transitionProjectStatus,
}));

import { POST } from '@/app/api/services/editron/cloudrun/render/route';

describe('Editron render startup boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('REMOTION_LAMBDA_FUNCTION_NAME', 'editron-render-test');
    vi.stubEnv('REMOTION_LAMBDA_SERVE_URL', 'https://remotion.example.test/site');
    routeMocks.auth.mockResolvedValue({ userId: 'user_1' });
    routeMocks.assertRemotionSiteFresh.mockReturnValue({ reason: 'verified' });
    routeMocks.setAwsCredentials.mockResolvedValue(undefined);
    routeMocks.loadProject.mockResolvedValue({
      userId: 'user_1',
      overlays: [{
        id: 'video_1',
        type: 'video',
        from: 0,
        durationInFrames: 90,
        assetId: 'asset_video_1',
        src: '/api/assets/asset_video_1',
      }],
      durationInFrames: 90,
      fps: 30,
      playerDimensions: { width: 1920, height: 1080 },
    });
    routeMocks.verifyAudioRights.mockResolvedValue(undefined);
    routeMocks.resolveProjectAssets.mockImplementation(async (overlays: Array<Record<string, unknown>>) =>
      overlays.map((overlay) => ({
        ...overlay,
        src: 'https://cdn.example.test/video_1.mp4',
      })));
    routeMocks.shouldUseChapterRendering.mockReturnValue(false);
    routeMocks.checkCredits.mockResolvedValue({
      allowed: true,
      deduct: routeMocks.deduct,
      refund: routeMocks.refund,
    });
    routeMocks.deduct.mockResolvedValue(undefined);
    routeMocks.refund.mockResolvedValue(undefined);
    routeMocks.renderMediaOnLambda.mockResolvedValue({
      renderId: 'render_1',
      bucketName: 'bucket_1',
    });
    routeMocks.createJob.mockResolvedValue(undefined);
    routeMocks.transitionProjectStatus.mockResolvedValue(undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('dispatches Lambda with hydrated assets and persists the resulting job', async () => {
    const response = await POST(renderRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      type: 'success',
      data: {
        renderId: 'render_1',
        bucketName: 'bucket_1',
      },
    });
    expect(routeMocks.checkCredits).toHaveBeenCalledTimes(1);
    expect(routeMocks.deduct).toHaveBeenCalledTimes(1);
    expect(routeMocks.renderMediaOnLambda).toHaveBeenCalledWith(expect.objectContaining({
      inputProps: expect.objectContaining({
        overlays: [
          expect.objectContaining({
            id: 'video_1',
            src: 'https://cdn.example.test/video_1.mp4',
          }),
        ],
      }),
    }));
    expect(routeMocks.createJob).toHaveBeenCalledWith(
      'render_1',
      'user_1',
      'project_1',
      'bucket_1',
      expect.objectContaining({
        primaryArtifact: expect.objectContaining({ renderId: 'render_1' }),
      }),
    );
  });

  it('CRITICAL: asset hydration failure stops before credits and every render dispatcher', async () => {
    routeMocks.resolveProjectAssets.mockRejectedValue(
      new Error('controlled asset URL could not be resolved'),
    );

    const response = await POST(renderRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      type: 'error',
      code: 'RENDER_ASSET_HYDRATION_FAILED',
      message: 'Unable to prepare all project assets for rendering.',
    });
    expect(routeMocks.resolveProjectAssets).toHaveBeenCalledTimes(1);
    expect(routeMocks.checkCredits).not.toHaveBeenCalled();
    expect(routeMocks.deduct).not.toHaveBeenCalled();
    expect(routeMocks.refund).not.toHaveBeenCalled();
    expect(routeMocks.shouldUseChapterRendering).not.toHaveBeenCalled();
    expect(routeMocks.startChapterRender).not.toHaveBeenCalled();
    expect(routeMocks.renderMediaOnLambda).not.toHaveBeenCalled();
    expect(routeMocks.createJob).not.toHaveBeenCalled();
  });
});

function renderRequest(): Request {
  return new Request(
    'https://app.example.test/api/services/editron/cloudrun/render',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'project_1',
        compositionId: 'TestComponent',
        inputProps: { overlays: [] },
      }),
    },
  );
}
