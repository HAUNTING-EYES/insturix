import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeMocks = vi.hoisted(() => ({
  auth: vi.fn(),
  renderMediaOnLambda: vi.fn(),
  validateWebhookSignature: vi.fn(),
  createJob: vi.fn(),
  calculateExpectedRenderDurationMs: vi.fn(),
  reserveJob: vi.fn(),
  markJobStarted: vi.fn(),
  failJob: vi.fn(),
  claimJobFinalization: vi.fn(),
  releaseJobFinalizationClaim: vi.fn(),
  getJob: vi.fn(),
  claimFailedJobFinalizationRetry: vi.fn(),
  releaseFailedJobFinalizationRetryClaim: vi.fn(),
  reconcileProviderTerminalEvent: vi.fn(),
  getActiveRendersForUser: vi.fn(),
  resolveProjectAssets: vi.fn(),
  loadProject: vi.fn(),
  admitNativeMediaFinalRender: vi.fn(),
  readNativeMediaFinalRenderProjectRevision: vi.fn(),
  verifyAudioRights: vi.fn(),
  assertRemotionSiteFresh: vi.fn(),
  checkCredits: vi.fn(),
  deduct: vi.fn(),
  refund: vi.fn(),
  setAwsCredentials: vi.fn(),
  shouldUseChapterRendering: vi.fn(),
  startChapterRender: vi.fn(),
  transitionProjectStatus: vi.fn(),
  dbFindOne: vi.fn(),
  dbFindOneAndUpdate: vi.fn(),
  dbUpdateOne: vi.fn(),
  dbInsertOne: vi.fn(),
  publishJSON: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: routeMocks.auth,
}));

vi.mock('@remotion/lambda/client', () => ({
  renderMediaOnLambda: routeMocks.renderMediaOnLambda,
  validateWebhookSignature: routeMocks.validateWebhookSignature,
}));

vi.mock('@upstash/qstash', () => ({
  Client: vi.fn(() => ({ publishJSON: routeMocks.publishJSON })),
}));

vi.mock('@/lib/editron/services/render-job-service', () => ({
  createJob: routeMocks.createJob,
  calculateExpectedRenderDurationMs: routeMocks.calculateExpectedRenderDurationMs,
  reserveJob: routeMocks.reserveJob,
  markJobStarted: routeMocks.markJobStarted,
  failJob: routeMocks.failJob,
  claimJobFinalization: routeMocks.claimJobFinalization,
  releaseJobFinalizationClaim: routeMocks.releaseJobFinalizationClaim,
  getJob: routeMocks.getJob,
  claimFailedJobFinalizationRetry: routeMocks.claimFailedJobFinalizationRetry,
  releaseFailedJobFinalizationRetryClaim: routeMocks.releaseFailedJobFinalizationRetryClaim,
  reconcileProviderTerminalEvent: routeMocks.reconcileProviderTerminalEvent,
  getActiveRendersForUser: routeMocks.getActiveRendersForUser,
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  getDatabase: vi.fn(async () => ({
    collection: () => ({
      findOne: routeMocks.dbFindOne,
      findOneAndUpdate: routeMocks.dbFindOneAndUpdate,
      updateOne: routeMocks.dbUpdateOne,
      insertOne: routeMocks.dbInsertOne,
    }),
  })),
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

vi.mock('@/lib/editron/services/native-media-final-render-admission-v1', () => ({
  admitNativeMediaFinalRenderUsingRuntimeV1: routeMocks.admitNativeMediaFinalRender,
  readNativeMediaFinalRenderProjectRevisionV1:
    routeMocks.readNativeMediaFinalRenderProjectRevision,
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
import { GET as GET_ACTIVE_RENDERS } from '@/app/api/services/editron/render/active/route';
import { POST as POST_FINALIZATION_RETRY } from '@/app/api/services/editron/render/finalization/retry/route';
import { POST as POST_RENDER_WEBHOOK } from '@/app/api/services/editron/cloudrun/render/webhook/route';
import { RenderAudioRightsAuthorityError } from '@/lib/editron/services/render-audio-rights-authority';
import { beginRenderFinalization } from '@/lib/editron/services/render-finalization-dispatch';

describe('Editron render startup boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('REMOTION_LAMBDA_FUNCTION_NAME', 'editron-render-test');
    vi.stubEnv('REMOTION_LAMBDA_SERVE_URL', 'https://remotion.example.test/site');
    vi.stubEnv('REMOTION_WEBHOOK_SECRET', 'test-remotion-webhook-secret');
    vi.stubEnv('EDITRON_RENDER_FINALIZER_ENDPOINT', 'https://finalizer.example.test/finalize');
    vi.stubEnv('EDITRON_RENDER_FINALIZER_TOKEN', 'finalizer-secret');
    vi.stubEnv('QSTASH_TOKEN', 'qstash-secret');
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'current-signing-key');
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'next-signing-key');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.test');
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
    routeMocks.readNativeMediaFinalRenderProjectRevision.mockReturnValue({
      schemaVersion: 1,
      value: 7,
      compatibilityUpdatedAt: '2026-08-29T00:00:00.000Z',
    });
    routeMocks.admitNativeMediaFinalRender.mockResolvedValue({
      disposition: 'ADMITTED_ORDINARY_MEDIA',
      receipt: { receiptSha256: 'a'.repeat(64) },
    });
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
    routeMocks.calculateExpectedRenderDurationMs.mockImplementation(
      (totalFrames: number, fps: number) => Math.round((totalFrames / fps) * 1000),
    );
    routeMocks.reserveJob.mockResolvedValue(undefined);
    routeMocks.markJobStarted.mockResolvedValue(undefined);
    routeMocks.failJob.mockResolvedValue(undefined);
    routeMocks.releaseJobFinalizationClaim.mockResolvedValue(true);
    routeMocks.releaseFailedJobFinalizationRetryClaim.mockResolvedValue(true);
    routeMocks.publishJSON.mockResolvedValue({ messageId: 'msg_finalizer_1' });
    routeMocks.reconcileProviderTerminalEvent.mockResolvedValue(undefined);
    routeMocks.getActiveRendersForUser.mockResolvedValue([]);
    routeMocks.transitionProjectStatus.mockResolvedValue(undefined);
    routeMocks.dbFindOne.mockResolvedValue(null);
    routeMocks.dbFindOneAndUpdate.mockResolvedValue(null);
    routeMocks.dbUpdateOne.mockResolvedValue({ matchedCount: 1 });
    routeMocks.dbInsertOne.mockResolvedValue({ acknowledged: true });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('reserves before billing, then dispatches and binds the provider render', async () => {
    const response = await POST(renderRequest());
    const admissionId = routeMocks.reserveJob.mock.calls[0]?.[0];

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      type: 'success',
      data: {
        renderId: 'render_1',
        bucketName: 'bucket_1',
        renderAdmissionId: admissionId,
        trackingStatus: 'durable',
      },
    });
    expect(admissionId).toMatch(/^rnd_[A-Za-z0-9_-]{12}$/);
    expect(routeMocks.checkCredits).toHaveBeenCalledTimes(1);
    expect(routeMocks.admitNativeMediaFinalRender).toHaveBeenCalledWith({
      userId: 'user_1',
      projectId: 'project_1',
      sequenceId: 'main',
      projectRevision: {
        schemaVersion: 1,
        value: 7,
        compatibilityUpdatedAt: '2026-08-29T00:00:00.000Z',
      },
      overlays: [expect.objectContaining({ id: 'video_1', assetId: 'asset_video_1' })],
    });
    expect(routeMocks.admitNativeMediaFinalRender.mock.invocationCallOrder[0])
      .toBeLessThan(routeMocks.resolveProjectAssets.mock.invocationCallOrder[0]);
    expect(routeMocks.admitNativeMediaFinalRender.mock.invocationCallOrder[0])
      .toBeLessThan(routeMocks.checkCredits.mock.invocationCallOrder[0]);
    expect(routeMocks.deduct).toHaveBeenCalledTimes(1);
    expect(routeMocks.reserveJob).toHaveBeenCalledWith(
      admissionId,
      'user_1',
      'project_1',
      'us-east-1',
      3_000,
      expect.objectContaining({
        primaryArtifact: expect.objectContaining({ renderId: admissionId }),
      }),
    );
    expect(routeMocks.reserveJob.mock.invocationCallOrder[0])
      .toBeLessThan(routeMocks.deduct.mock.invocationCallOrder[0]);
    expect(routeMocks.deduct.mock.invocationCallOrder[0])
      .toBeLessThan(routeMocks.renderMediaOnLambda.mock.invocationCallOrder[0]);
    expect(routeMocks.renderMediaOnLambda).toHaveBeenCalledWith(expect.objectContaining({
      audioCodec: 'aac',
      metadata: {
        editronRenderAdmissionId: admissionId,
      },
      webhook: {
        url: 'https://app.example.test/api/services/editron/cloudrun/render/webhook',
        secret: 'test-remotion-webhook-secret',
        customData: {
          editronRenderAdmissionId: admissionId,
        },
      },
      inputProps: expect.objectContaining({
        overlays: [
          expect.objectContaining({
            id: 'video_1',
            src: 'https://cdn.example.test/video_1.mp4',
          }),
        ],
      }),
    }));
    expect(routeMocks.markJobStarted).toHaveBeenCalledWith(
      admissionId,
      'user_1',
      'render_1',
      'bucket_1',
      'us-east-1',
      expect.objectContaining({
        primaryArtifact: expect.objectContaining({ renderId: admissionId }),
      }),
    );
    expect(routeMocks.createJob).not.toHaveBeenCalled();
    expect(routeMocks.refund).not.toHaveBeenCalled();
  });

  it('CRITICAL: preserves the reference-track handoff while excluding it from Lambda input', async () => {
    routeMocks.loadProject.mockResolvedValue({
      userId: 'user_1',
      overlays: [
        {
          id: 'video_1',
          type: 'video',
          from: 0,
          durationInFrames: 240,
          assetId: 'asset_video_1',
          src: '/api/assets/asset_video_1',
        },
        {
          id: 'reference_music_1',
          type: 'sound',
          row: 1,
          from: 30,
          durationInFrames: 150,
          assetId: 'bgm_reference_1',
          src: '/api/assets/bgm_reference_1',
          audioRights: {
            mediaRole: 'music',
            source: 'preview-only',
            userChoice: 'no-music',
            licensed: false,
          },
          musicRights: {
            mediaRole: 'music',
            source: 'preview-only',
            userChoice: 'no-music',
            licensed: false,
          },
          metadata: {
            assignment: { usageMode: 'reference-only' },
            referenceTrack: {
              provider: 'user-upload',
              title: 'Reference Track',
              artists: ['Reference Artist'],
              sourceAssetId: 'bgm_source_1',
              bpm: 120,
            },
            beatGrid: {
              beats: [{ frame: 15, isDownbeat: true }],
            },
          },
        },
      ],
      durationInFrames: 240,
      fps: 30,
      playerDimensions: { width: 1920, height: 1080 },
    });

    const response = await POST(renderRequest({ musicDeliveryMode: 'embedded' }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.deliveryManifest).toMatchObject({
      mode: 'platform-native',
      primaryArtifact: { kind: 'clean-master' },
      music: {
        embedded: false,
        removedOverlayIds: ['reference_music_1'],
        handoff: {
          track: {
            status: 'reference-ready',
            title: 'Reference Track',
            artists: ['Reference Artist'],
            sourceAssetId: 'bgm_source_1',
            bpm: 120,
          },
          timing: {
            timelineStartFrame: 30,
            timelineEndFrame: 180,
            timelineBeatEntryFrame: 45,
          },
        },
      },
    });
    expect(routeMocks.verifyAudioRights).toHaveBeenCalledWith(
      expect.objectContaining({
        overlays: [expect.objectContaining({ id: 'video_1' })],
      }),
    );
    expect(routeMocks.renderMediaOnLambda).toHaveBeenCalledWith(
      expect.objectContaining({
        inputProps: expect.objectContaining({
          overlays: [
            expect.objectContaining({ id: 'video_1' }),
          ],
        }),
      }),
    );
  });

  it('CRITICAL: reserves a chapter admission before billing and child Lambda dispatch', async () => {
    routeMocks.shouldUseChapterRendering.mockReturnValue(true);
    routeMocks.startChapterRender.mockImplementation(async (jobId: string) => ({
      jobId,
      chapters: 3,
    }));

    const response = await POST(renderRequest());
    const admissionId = routeMocks.reserveJob.mock.calls[0]?.[0];

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      type: 'success',
      data: {
        renderId: admissionId,
        bucketName: 'chapter-render',
        renderAdmissionId: admissionId,
        isChapterRender: true,
        chapters: 3,
        trackingStatus: 'durable',
        deliveryManifest: {
          primaryArtifact: { renderId: admissionId },
        },
      },
    });
    expect(admissionId).toMatch(/^chr_[A-Za-z0-9_-]{12}$/);
    expect(routeMocks.reserveJob.mock.invocationCallOrder[0])
      .toBeLessThan(routeMocks.deduct.mock.invocationCallOrder[0]);
    expect(routeMocks.deduct.mock.invocationCallOrder[0])
      .toBeLessThan(routeMocks.startChapterRender.mock.invocationCallOrder[0]);
    expect(routeMocks.startChapterRender).toHaveBeenCalledWith(
      admissionId,
      'project_1',
      'user_1',
      expect.any(Array),
      90,
      30,
      1920,
      1080,
      'https://remotion.example.test/site',
      'editron-render-test',
    );
    expect(routeMocks.markJobStarted).toHaveBeenCalledWith(
      admissionId,
      'user_1',
      admissionId,
      'chapter-render',
      'us-east-1',
      expect.objectContaining({
        primaryArtifact: expect.objectContaining({ renderId: admissionId }),
      }),
    );
    expect(routeMocks.renderMediaOnLambda).not.toHaveBeenCalled();
    expect(routeMocks.createJob).not.toHaveBeenCalled();
    expect(routeMocks.refund).not.toHaveBeenCalled();
  });

  it('CRITICAL: missing webhook authentication stops before admission, billing, and dispatch', async () => {
    vi.stubEnv('REMOTION_WEBHOOK_SECRET', '');

    const response = await POST(renderRequest());

    expect(response.status).toBe(500);
    expect(routeMocks.reserveJob).not.toHaveBeenCalled();
    expect(routeMocks.deduct).not.toHaveBeenCalled();
    expect(routeMocks.renderMediaOnLambda).not.toHaveBeenCalled();
  });

  it('CRITICAL: incomplete finalization infrastructure stops before credits and render work', async () => {
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', '');

    const response = await POST(renderRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      type: 'error',
      code: 'RENDER_FINALIZATION_UNAVAILABLE',
      message: 'Verified render finalization is temporarily unavailable.',
    });
    expect(routeMocks.setAwsCredentials).not.toHaveBeenCalled();
    expect(routeMocks.loadProject).not.toHaveBeenCalled();
    expect(routeMocks.checkCredits).not.toHaveBeenCalled();
    expect(routeMocks.deduct).not.toHaveBeenCalled();
    expect(routeMocks.reserveJob).not.toHaveBeenCalled();
    expect(routeMocks.renderMediaOnLambda).not.toHaveBeenCalled();
  });

  it('CRITICAL: admission persistence failure spends no credits and starts no render', async () => {
    routeMocks.reserveJob.mockRejectedValue(new Error('database unavailable'));

    const response = await POST(renderRequest());

    expect(response.status).toBe(500);
    expect(routeMocks.reserveJob).toHaveBeenCalledTimes(1);
    expect(routeMocks.deduct).not.toHaveBeenCalled();
    expect(routeMocks.renderMediaOnLambda).not.toHaveBeenCalled();
    expect(routeMocks.refund).not.toHaveBeenCalled();
  });

  it('repairs a lost provider binding from a signed success webhook', async () => {
    const payload = {
      type: 'success',
      renderId: 'render_provider_1',
      bucketName: 'bucket_1',
      outputFile: 'https://bucket.example.test/render.mp4',
      outputSizeInBytes: 44_583_988,
      customData: {
        editronRenderAdmissionId: 'rnd_admission_1',
      },
    };

    const response = await POST_RENDER_WEBHOOK(renderWebhookRequest(payload));

    expect(response.status).toBe(200);
    expect(routeMocks.validateWebhookSignature).toHaveBeenCalledWith({
      secret: 'test-remotion-webhook-secret',
      body: payload,
      signatureHeader: 'sha512=test-signature',
    });
    expect(routeMocks.claimJobFinalization).toHaveBeenCalledWith({
      renderId: 'rnd_admission_1',
      providerRenderId: 'render_provider_1',
      bucketName: 'bucket_1',
      sourceOutputUrl: 'https://bucket.example.test/render.mp4',
      sourceOutputSize: 44_583_988,
    });
    expect(routeMocks.reconcileProviderTerminalEvent).not.toHaveBeenCalled();
  });

  it('CRITICAL: rejects forged render callbacks before durable state changes', async () => {
    routeMocks.validateWebhookSignature.mockImplementation(() => {
      throw new Error('Signatures do not match');
    });

    const response = await POST_RENDER_WEBHOOK(renderWebhookRequest({
      type: 'timeout',
      renderId: 'render_forged',
      bucketName: 'bucket_forged',
      customData: {
        editronRenderAdmissionId: 'rnd_admission_1',
      },
    }));

    expect(response.status).toBe(401);
    expect(routeMocks.claimJobFinalization).not.toHaveBeenCalled();
    expect(routeMocks.reconcileProviderTerminalEvent).not.toHaveBeenCalled();
  });

  it('keeps provider failures terminal without invoking finalization', async () => {
    const response = await POST_RENDER_WEBHOOK(renderWebhookRequest({
      type: 'timeout',
      renderId: 'render_provider_1',
      bucketName: 'bucket_1',
      customData: { editronRenderAdmissionId: 'rnd_admission_1' },
    }));

    expect(response.status).toBe(200);
    expect(routeMocks.claimJobFinalization).not.toHaveBeenCalled();
    expect(routeMocks.reconcileProviderTerminalEvent).toHaveBeenCalledWith({
      jobId: 'rnd_admission_1',
      providerRenderId: 'render_provider_1',
      bucketName: 'bucket_1',
      event: { type: 'timeout', error: 'Remotion render timed out' },
    });
  });

  it('atomically binds and completes the real durable job from a terminal callback', async () => {
    const actualJobService = await vi.importActual<
      typeof import('@/lib/editron/services/render-job-service')
    >('@/lib/editron/services/render-job-service');
    routeMocks.dbFindOne.mockResolvedValue({
      _id: 'rnd_admission_1',
      status: 'pending',
      deliveryManifest: renderDeliveryManifest('rnd_admission_1'),
    });

    await actualJobService.reconcileProviderTerminalEvent({
      jobId: 'rnd_admission_1',
      providerRenderId: 'render_provider_1',
      bucketName: 'bucket_1',
      event: {
        type: 'success',
        outputUrl: 'https://bucket.example.test/render.mp4',
      },
    });

    expect(routeMocks.dbUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'rnd_admission_1',
        $or: [
          { providerRenderId: { $exists: false } },
          { providerRenderId: 'render_provider_1' },
        ],
      }),
      {
        $set: expect.objectContaining({
          providerRenderId: 'render_provider_1',
          bucketName: 'bucket_1',
          status: 'done',
          progress: 1,
          outputUrl: 'https://bucket.example.test/render.mp4',
          deliveryManifest: expect.objectContaining({
            completedAt: expect.any(String),
            primaryArtifact: expect.objectContaining({
              renderId: 'rnd_admission_1',
              status: 'ready',
              url: 'https://bucket.example.test/render.mp4',
            }),
          }),
        }),
      },
    );
  });

  it('CRITICAL: the real reconciler rejects provider substitution and late failure regression', async () => {
    const actualJobService = await vi.importActual<
      typeof import('@/lib/editron/services/render-job-service')
    >('@/lib/editron/services/render-job-service');
    routeMocks.dbFindOne.mockResolvedValueOnce({
      _id: 'rnd_admission_1',
      status: 'rendering',
      providerRenderId: 'render_original',
    });

    await expect(actualJobService.reconcileProviderTerminalEvent({
      jobId: 'rnd_admission_1',
      providerRenderId: 'render_forged',
      bucketName: 'bucket_1',
      event: { type: 'timeout', error: 'timeout' },
    })).rejects.toThrow('belongs to another provider render');
    expect(routeMocks.dbUpdateOne).not.toHaveBeenCalled();

    routeMocks.dbFindOne.mockResolvedValueOnce({
      _id: 'rnd_admission_1',
      status: 'done',
      providerRenderId: 'render_original',
      outputUrl: 'https://bucket.example.test/render.mp4',
    });
    await actualJobService.reconcileProviderTerminalEvent({
      jobId: 'rnd_admission_1',
      providerRenderId: 'render_original',
      bucketName: 'bucket_1',
      event: { type: 'error', error: 'late provider error' },
    });
    expect(routeMocks.dbUpdateOne).not.toHaveBeenCalled();
  });

  it('atomically leases exact-duration finalization to only one completion observer', async () => {
    const actualJobService = await vi.importActual<
      typeof import('@/lib/editron/services/render-job-service')
    >('@/lib/editron/services/render-job-service');
    const now = new Date('2026-08-02T00:00:00.000Z');
    routeMocks.dbFindOneAndUpdate.mockResolvedValueOnce({
      _id: 'rnd_admission_1',
      providerRenderId: 'render_provider_1',
      status: 'finalizing',
      expectedDurationMs: 38_000,
    });

    expect(actualJobService.calculateExpectedRenderDurationMs(1_140, 30)).toBe(38_000);
    const claim = await actualJobService.claimJobFinalization({
      renderId: 'render_provider_1',
      sourceOutputUrl: 'https://bucket.s3.us-east-1.amazonaws.com/raw.mp4',
      sourceOutputSize: 44_583_988,
      claimToken: 'rfl_claim_1',
      leaseMs: 60_000,
      now,
    });

    expect(claim).toEqual({
      jobId: 'rnd_admission_1',
      providerRenderId: 'render_provider_1',
      claimToken: 'rfl_claim_1',
      sourceOutputUrl: 'https://bucket.s3.us-east-1.amazonaws.com/raw.mp4',
      sourceOutputSize: 44_583_988,
      expectedDurationMs: 38_000,
    });
    expect(routeMocks.dbFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        $and: expect.arrayContaining([
          expect.objectContaining({
            $or: [
              { _id: 'render_provider_1' },
              { providerRenderId: 'render_provider_1' },
            ],
          }),
        ]),
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'finalizing',
          progress: 0.99,
          'finalization.claimToken': 'rfl_claim_1',
          'finalization.sourceOutputUrl': 'https://bucket.s3.us-east-1.amazonaws.com/raw.mp4',
          'finalization.leaseExpiresAt': new Date('2026-08-02T00:01:00.000Z'),
        }),
        $inc: { 'finalization.attempts': 1 },
      }),
      { returnDocument: 'after' },
    );

    routeMocks.dbFindOneAndUpdate.mockResolvedValueOnce(null);
    await expect(actualJobService.claimJobFinalization({
      renderId: 'render_provider_1',
      sourceOutputUrl: 'https://bucket.s3.us-east-1.amazonaws.com/raw.mp4',
      sourceOutputSize: 44_583_988,
      claimToken: 'rfl_loser',
      now,
    })).resolves.toBeNull();
  });

  it('repairs provider binding in the claim and releases it when durable dispatch fails', async () => {
    const actualJobService = await vi.importActual<
      typeof import('@/lib/editron/services/render-job-service')
    >('@/lib/editron/services/render-job-service');
    routeMocks.dbFindOneAndUpdate.mockResolvedValueOnce({
      _id: 'rnd_admission_1',
      providerRenderId: 'render_provider_1',
      status: 'finalizing',
      expectedDurationMs: 38_000,
    });

    await actualJobService.claimJobFinalization({
      renderId: 'rnd_admission_1',
      providerRenderId: 'render_provider_1',
      bucketName: 'bucket_1',
      sourceOutputUrl: 'https://bucket.example.test/raw.mp4',
      sourceOutputSize: 44_583_988,
      claimToken: 'rfl_claim_1',
    });
    expect(routeMocks.dbFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        $and: expect.arrayContaining([
          {
            $or: [
              { providerRenderId: { $exists: false } },
              { providerRenderId: 'render_provider_1' },
            ],
          },
          expect.objectContaining({
            $or: expect.arrayContaining([{ status: 'pending' }]),
          }),
        ]),
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          providerRenderId: 'render_provider_1',
          bucketName: 'bucket_1',
        }),
      }),
      { returnDocument: 'after' },
    );

    const claim = {
      jobId: 'rnd_admission_1',
      providerRenderId: 'render_provider_1',
      claimToken: 'rfl_claim_1',
      sourceOutputUrl: 'https://bucket.example.test/raw.mp4',
      sourceOutputSize: 44_583_988,
      expectedDurationMs: 38_000,
    };
    routeMocks.claimJobFinalization.mockResolvedValueOnce(claim);
    routeMocks.publishJSON.mockRejectedValueOnce(new Error('QStash unavailable'));

    await expect(beginRenderFinalization({
      renderId: 'rnd_admission_1',
      providerRenderId: 'render_provider_1',
      bucketName: 'bucket_1',
      sourceOutputUrl: claim.sourceOutputUrl,
      sourceOutputSize: claim.sourceOutputSize,
    })).rejects.toThrow('QStash unavailable');
    expect(routeMocks.releaseJobFinalizationClaim).toHaveBeenCalledWith({
      jobId: claim.jobId,
      claimToken: claim.claimToken,
    });
  });

  it('atomically re-leases a preserved failed artifact with a bounded no-credit retry', async () => {
    const actualJobService = await vi.importActual<
      typeof import('@/lib/editron/services/render-job-service')
    >('@/lib/editron/services/render-job-service');
    const now = new Date('2026-08-03T00:00:00.000Z');
    routeMocks.dbFindOneAndUpdate.mockResolvedValueOnce({
      _id: 'rnd_admission_1',
      userId: 'user_1',
      providerRenderId: 'render_provider_1',
      status: 'finalizing',
      expectedDurationMs: 38_000,
      finalization: {
        state: 'running',
        sourceOutputUrl: 'https://bucket.example.test/raw.mp4',
        sourceOutputSize: 44_583_988,
      },
    });

    await expect(actualJobService.claimFailedJobFinalizationRetry({
      jobId: 'rnd_admission_1',
      userId: 'user_1',
      claimToken: 'rfl_retry_1',
      leaseMs: 60_000,
      now,
    })).resolves.toEqual({
      jobId: 'rnd_admission_1',
      providerRenderId: 'render_provider_1',
      claimToken: 'rfl_retry_1',
      sourceOutputUrl: 'https://bucket.example.test/raw.mp4',
      sourceOutputSize: 44_583_988,
      expectedDurationMs: 38_000,
    });
    expect(routeMocks.dbFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'rnd_admission_1',
        userId: 'user_1',
        status: 'error',
        'finalization.state': 'failed',
        'finalization.attempts': { $lt: 3 },
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'finalizing',
          'finalization.state': 'running',
          'finalization.claimToken': 'rfl_retry_1',
          'finalization.leaseExpiresAt': new Date('2026-08-03T00:01:00.000Z'),
        }),
        $inc: { 'finalization.attempts': 1 },
      }),
      { returnDocument: 'after' },
    );

    routeMocks.dbUpdateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    await expect(actualJobService.releaseFailedJobFinalizationRetryClaim({
      jobId: 'rnd_admission_1',
      claimToken: 'rfl_retry_1',
      error: new Error('QStash unavailable'),
      now,
    })).resolves.toBe(true);
    expect(routeMocks.dbUpdateOne).toHaveBeenCalledWith(
      {
        _id: 'rnd_admission_1',
        status: 'finalizing',
        'finalization.state': 'running',
        'finalization.claimToken': 'rfl_retry_1',
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'error',
          'finalization.state': 'failed',
        }),
      }),
    );
    const retryReleaseUpdate = routeMocks.dbUpdateOne.mock.calls.at(-1)?.[1];
    expect(retryReleaseUpdate?.$set).not.toHaveProperty('finalization.sourceOutputUrl');
    expect(retryReleaseUpdate?.$unset).not.toHaveProperty('finalization.sourceOutputUrl');
  });

  it('queues owner-scoped finalization recovery without invoking or billing the renderer', async () => {
    const claim = {
      jobId: 'rnd_admission_1',
      providerRenderId: 'render_provider_1',
      claimToken: 'rfl_retry_1',
      sourceOutputUrl: 'https://bucket.example.test/raw.mp4',
      sourceOutputSize: 44_583_988,
      expectedDurationMs: 38_000,
    };
    routeMocks.getJob.mockResolvedValue({
      _id: claim.jobId,
      userId: 'user_1',
      status: 'error',
      finalization: { state: 'failed' },
    });
    routeMocks.claimFailedJobFinalizationRetry.mockResolvedValue(claim);

    const response = await POST_FINALIZATION_RETRY(new Request(
      'http://localhost/api/services/editron/render/finalization/retry',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: claim.jobId }),
      },
    ));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      type: 'success',
      data: { state: 'enqueued', jobId: claim.jobId, messageId: 'msg_finalizer_1' },
    });
    expect(routeMocks.claimFailedJobFinalizationRetry).toHaveBeenCalledWith({
      jobId: claim.jobId,
      userId: 'user_1',
    });
    expect(routeMocks.publishJSON).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({ jobId: claim.jobId, claimToken: claim.claimToken }),
      deduplicationId: claim.claimToken,
    }));
    expect(routeMocks.checkCredits).not.toHaveBeenCalled();
    expect(routeMocks.deduct).not.toHaveBeenCalled();
    expect(routeMocks.renderMediaOnLambda).not.toHaveBeenCalled();
  });

  it('keeps failed recovery retryable when queue publication fails and hides foreign jobs', async () => {
    const failedJob = {
      _id: 'rnd_admission_1',
      userId: 'user_1',
      status: 'error',
      finalization: { state: 'failed' },
    };
    const claim = {
      jobId: failedJob._id,
      claimToken: 'rfl_retry_1',
      sourceOutputUrl: 'https://bucket.example.test/raw.mp4',
      sourceOutputSize: 44_583_988,
      expectedDurationMs: 38_000,
    };
    routeMocks.getJob.mockResolvedValue(failedJob);
    routeMocks.claimFailedJobFinalizationRetry.mockResolvedValue(claim);
    routeMocks.publishJSON.mockRejectedValueOnce(new Error('QStash unavailable'));

    const failed = await POST_FINALIZATION_RETRY(retryFinalizationRequest(failedJob._id));
    expect(failed.status).toBe(503);
    expect(routeMocks.releaseFailedJobFinalizationRetryClaim).toHaveBeenCalledWith({
      jobId: claim.jobId,
      claimToken: claim.claimToken,
      error: expect.any(Error),
    });

    routeMocks.getJob.mockResolvedValueOnce({ ...failedJob, userId: 'user_2' });
    const hidden = await POST_FINALIZATION_RETRY(retryFinalizationRequest(failedJob._id));
    expect(hidden.status).toBe(404);
    expect(routeMocks.claimFailedJobFinalizationRetry).toHaveBeenCalledTimes(1);
  });

  it('makes retry authorization and terminal/idempotent states explicit', async () => {
    routeMocks.auth.mockResolvedValueOnce({ userId: null });
    const unauthorized = await POST_FINALIZATION_RETRY(retryFinalizationRequest('rnd_admission_1'));
    expect(unauthorized.status).toBe(401);

    routeMocks.getJob.mockResolvedValueOnce({
      _id: 'rnd_admission_1',
      userId: 'user_1',
      status: 'done',
    });
    const done = await POST_FINALIZATION_RETRY(retryFinalizationRequest('rnd_admission_1'));
    expect(done.status).toBe(200);
    await expect(done.json()).resolves.toMatchObject({ data: { state: 'already_done' } });

    routeMocks.getJob.mockResolvedValueOnce({
      _id: 'rnd_admission_1',
      userId: 'user_1',
      status: 'finalizing',
    });
    const finalizing = await POST_FINALIZATION_RETRY(retryFinalizationRequest('rnd_admission_1'));
    expect(finalizing.status).toBe(202);
    await expect(finalizing.json()).resolves.toMatchObject({ data: { state: 'already_finalizing' } });

    routeMocks.getJob.mockResolvedValueOnce({
      _id: 'rnd_admission_1',
      userId: 'user_1',
      status: 'error',
      error: 'Provider render itself failed',
    });
    const notRetryable = await POST_FINALIZATION_RETRY(retryFinalizationRequest('rnd_admission_1'));
    expect(notRetryable.status).toBe(409);
    await expect(notRetryable.json()).resolves.toMatchObject({
      code: 'FINALIZATION_NOT_RETRYABLE',
    });
    expect(routeMocks.claimFailedJobFinalizationRetry).not.toHaveBeenCalled();
  });

  it('leases completion effects only from a verified finalized job', async () => {
    const actualJobService = await vi.importActual<
      typeof import('@/lib/editron/services/render-job-service')
    >('@/lib/editron/services/render-job-service');
    const now = new Date('2026-08-02T00:03:00.000Z');
    routeMocks.dbFindOneAndUpdate.mockResolvedValueOnce({
      _id: 'rnd_admission_1',
      userId: 'user_1',
      projectId: 'project_1',
      providerRenderId: 'render_provider_1',
      status: 'done',
      outputUrl: 'https://bucket.example.test/finalized.mp4',
      outputSize: 44_500_000,
    });

    await expect(actualJobService.claimRenderCompletionEffects({
      renderId: 'render_provider_1',
      claimToken: 'rce_claim_1',
      leaseMs: 60_000,
      now,
    })).resolves.toEqual({
      jobId: 'rnd_admission_1',
      userId: 'user_1',
      projectId: 'project_1',
      providerRenderId: 'render_provider_1',
      outputUrl: 'https://bucket.example.test/finalized.mp4',
      outputSize: 44_500_000,
      claimToken: 'rce_claim_1',
    });
    expect(routeMocks.dbFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        $and: expect.arrayContaining([
          { status: 'done' },
          { 'finalization.state': 'done' },
          { 'finalization.receipt': { $exists: true } },
        ]),
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          'completionEffects.state': 'running',
          'completionEffects.claimToken': 'rce_claim_1',
          'completionEffects.leaseExpiresAt': new Date('2026-08-02T00:04:00.000Z'),
        }),
      }),
      { returnDocument: 'after' },
    );

    routeMocks.dbFindOneAndUpdate.mockResolvedValueOnce(null);
    await expect(actualJobService.claimRenderCompletionEffects({
      renderId: 'render_provider_1',
      claimToken: 'rce_loser',
      now,
    })).resolves.toBeNull();
  });

  it('publishes only the verified finalizer artifact held by the active lease', async () => {
    const actualJobService = await vi.importActual<
      typeof import('@/lib/editron/services/render-job-service')
    >('@/lib/editron/services/render-job-service');
    routeMocks.dbFindOne.mockResolvedValueOnce({
      _id: 'rnd_admission_1',
      status: 'finalizing',
      expectedDurationMs: 38_000,
      finalization: { claimToken: 'rfl_claim_1' },
      deliveryManifest: renderDeliveryManifest('rnd_admission_1'),
    });
    routeMocks.dbUpdateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });

    const completed = await actualJobService.completeJobFinalization({
      jobId: 'rnd_admission_1',
      claimToken: 'rfl_claim_1',
      now: new Date('2026-08-02T00:02:00.000Z'),
      result: exactFinalizerResult(),
    });

    expect(completed).toBe(true);
    expect(routeMocks.dbUpdateOne).toHaveBeenCalledWith(
      {
        _id: 'rnd_admission_1',
        status: 'finalizing',
        'finalization.claimToken': 'rfl_claim_1',
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'done',
          progress: 1,
          outputUrl: 'https://bucket.s3.us-east-1.amazonaws.com/editron-finalized/rnd_admission_1.mp4',
          'finalization.state': 'done',
          'finalization.receipt': expect.objectContaining({
            audioDurationMs: 38_000,
            videoDurationMs: 38_000,
          }),
          deliveryManifest: expect.objectContaining({
            primaryArtifact: expect.objectContaining({
              status: 'ready',
              url: 'https://bucket.s3.us-east-1.amazonaws.com/editron-finalized/rnd_admission_1.mp4',
            }),
          }),
        }),
      }),
    );

    await expect(actualJobService.completeJobFinalization({
      jobId: 'rnd_admission_1',
      claimToken: 'rfl_claim_1',
      result: {
        ...exactFinalizerResult(),
        receipt: {
          ...exactFinalizerResult().receipt,
          audioDurationMs: 38_080,
        },
      },
    })).rejects.toThrow('audioDurationMs exceeds the verified duration tolerance');
  });

  it('reports degraded tracking without claiming a paid render failed', async () => {
    routeMocks.markJobStarted.mockRejectedValue(new Error('ambiguous database write'));

    const response = await POST(renderRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      type: 'success',
      data: {
        renderId: 'render_1',
        trackingStatus: 'degraded',
      },
    });
    expect(routeMocks.renderMediaOnLambda).toHaveBeenCalledTimes(1);
    expect(routeMocks.refund).not.toHaveBeenCalled();
    expect(routeMocks.failJob).not.toHaveBeenCalled();
  });

  it('returns provider render IDs for durable admissions during resume lookup', async () => {
    routeMocks.getActiveRendersForUser.mockResolvedValue([{
      _id: 'rnd_admission_1',
      providerRenderId: 'render_provider_1',
      userId: 'user_1',
      projectId: 'project_1',
      status: 'rendering',
      progress: 0.25,
      bucketName: 'bucket_1',
      region: 'us-east-1',
      startedAt: new Date('2026-07-28T00:00:00.000Z'),
    }]);

    const response = await GET_ACTIVE_RENDERS();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      type: 'success',
      data: {
        renders: [{
          renderId: 'render_provider_1',
          projectId: 'project_1',
          progress: 25,
        }],
      },
    });
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
    expect(routeMocks.reserveJob).not.toHaveBeenCalled();
    expect(routeMocks.markJobStarted).not.toHaveBeenCalled();
    expect(routeMocks.createJob).not.toHaveBeenCalled();
  });

  it('CRITICAL: exact timestamp media without a render source stops before spend and dispatch', async () => {
    routeMocks.admitNativeMediaFinalRender.mockResolvedValueOnce({
      disposition: 'UNVERIFIABLE',
      reason: 'EXACT_TIMESTAMP_RENDER_SOURCE_REQUIRED',
      overlayId: 'video_1',
      assetId: 'asset_video_1',
      diagnostic: null,
    });

    const response = await POST(renderRequest());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      type: 'error',
      code: 'NATIVE_MEDIA_FINAL_RENDER_NOT_READY',
      message: 'This project contains video that is not ready for an exact final render.',
      details: {
        reason: 'EXACT_TIMESTAMP_RENDER_SOURCE_REQUIRED',
        overlayId: 'video_1',
        assetId: 'asset_video_1',
        diagnostic: null,
      },
    });
    expect(routeMocks.resolveProjectAssets).not.toHaveBeenCalled();
    expect(routeMocks.checkCredits).not.toHaveBeenCalled();
    expect(routeMocks.reserveJob).not.toHaveBeenCalled();
    expect(routeMocks.deduct).not.toHaveBeenCalled();
    expect(routeMocks.refund).not.toHaveBeenCalled();
    expect(routeMocks.shouldUseChapterRendering).not.toHaveBeenCalled();
    expect(routeMocks.startChapterRender).not.toHaveBeenCalled();
    expect(routeMocks.renderMediaOnLambda).not.toHaveBeenCalled();
  });

  it('returns redacted structured details for an audio-rights authority rejection', async () => {
    routeMocks.verifyAudioRights.mockRejectedValue(new RenderAudioRightsAuthorityError({
      overlayId: 'voiceover_1',
      overlayType: 'sound',
      mediaRole: 'voiceover',
      renderAssetId: 'asset_voiceover_1',
      sourceAssetId: null,
      rightsReceipt: {
        state: 'missing',
        aliases: 'none',
        source: null,
        evidenceKind: null,
      },
      reason: 'audio rights metadata is missing',
    }));

    const response = await POST(renderRequest());
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toEqual({
      type: 'error',
      code: 'AUDIO_RIGHTS_EVIDENCE_UNVERIFIED',
      message: 'Cannot verify render audio rights for overlay voiceover_1: audio rights metadata is missing',
      details: {
        overlayId: 'voiceover_1',
        overlayType: 'sound',
        mediaRole: 'voiceover',
        renderAssetId: 'asset_voiceover_1',
        sourceAssetId: null,
        rightsReceipt: {
          state: 'missing',
          aliases: 'none',
          source: null,
          evidenceKind: null,
        },
        reason: 'audio rights metadata is missing',
      },
    });
    expect(JSON.stringify(body)).not.toContain('https://');
    expect(routeMocks.checkCredits).not.toHaveBeenCalled();
    expect(routeMocks.renderMediaOnLambda).not.toHaveBeenCalled();
  });
});

function renderRequest(overrides: Record<string, unknown> = {}): Request {
  return new Request(
    'https://app.example.test/api/services/editron/cloudrun/render',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: 'project_1',
        compositionId: 'TestComponent',
        inputProps: { overlays: [] },
        ...overrides,
      }),
    },
  );
}

function renderWebhookRequest(payload: unknown): Request {
  return new Request(
    'https://app.example.test/api/services/editron/cloudrun/render/webhook',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-remotion-mode': 'production',
        'x-remotion-signature': 'sha512=test-signature',
      },
      body: JSON.stringify(payload),
    },
  );
}

function retryFinalizationRequest(jobId: string): Request {
  return new Request(
    'https://app.example.test/api/services/editron/render/finalization/retry',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId }),
    },
  );
}

function renderDeliveryManifest(renderId: string) {
  return {
    version: 'editron-render-delivery-manifest-v1' as const,
    mode: 'embedded' as const,
    createdAt: '2026-07-28T00:00:00.000Z',
    completedAt: null,
    primaryArtifact: {
      kind: 'mixed-master' as const,
      renderId,
      status: 'rendering' as const,
      url: null,
    },
    music: {
      embedded: true,
      removedOverlayIds: [],
      handoff: null,
    },
  };
}

function exactFinalizerResult() {
  return {
    url: 'https://bucket.s3.us-east-1.amazonaws.com/editron-finalized/rnd_admission_1.mp4',
    sizeBytes: 44_500_000,
    expectedDurationMs: 38_000,
    receipt: {
      expectedDurationMs: 38_000,
      formatDurationMs: 38_000,
      videoDurationMs: 38_000,
      audioDurationMs: 38_000,
      videoCodec: 'h264',
      audioCodec: 'aac',
      width: 1920,
      height: 1080,
      fps: 30,
      sampleRate: 48_000,
      channels: 2,
      verificationToleranceMs: 1,
    },
  };
}
