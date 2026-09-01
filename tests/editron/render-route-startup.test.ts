import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeMocks = vi.hoisted(() => ({
  abandonStaleProjectRenderJobAdmission: vi.fn(),
  auth: vi.fn(),
  renderMediaOnLambda: vi.fn(),
  validateWebhookSignature: vi.fn(),
  createJob: vi.fn(),
  calculateExpectedRenderDurationMs: vi.fn(),
  createProjectRenderJobAuthorization: vi.fn(),
  reserveJob: vi.fn(),
  reserveProjectRenderJob: vi.fn(),
  recordProjectRenderJobBilling: vi.fn(),
  markProjectRenderDispatchAttempting: vi.fn(),
  quarantineProjectRenderDispatch: vi.fn(),
  quarantineProjectRenderBilling: vi.fn(),
  markJobStarted: vi.fn(),
  markProjectRenderJobStarted: vi.fn(),
  startChapterParentOrchestration: vi.fn(),
  beginChapterParentOrchestrationRunning: vi.fn(),
  quarantineChapterParentOrchestration: vi.fn(),
  failJob: vi.fn(),
  failProjectRenderJob: vi.fn(),
  failProjectRenderJobFromProviderTransaction: vi.fn(),
  claimJobFinalization: vi.fn(),
  claimProjectRenderJobFinalizationTransaction: vi.fn(),
  releaseJobFinalizationClaim: vi.fn(),
  releaseProjectRenderJobFinalizationClaimTransaction: vi.fn(),
  getJob: vi.fn(),
  getCurrentProjectRenderJob: vi.fn(),
  getProjectRenderJobAuthorizationByAdmission: vi.fn(),
  claimFailedJobFinalizationRetry: vi.fn(),
  claimFailedProjectRenderJobFinalizationRetryTransaction: vi.fn(),
  releaseFailedJobFinalizationRetryClaim: vi.fn(),
  releaseFailedProjectRenderJobFinalizationRetryClaimTransaction: vi.fn(),
  reconcileProviderTerminalEvent: vi.fn(),
  getActiveRendersForUser: vi.fn(),
  resolveProjectAssets: vi.fn(),
  loadProject: vi.fn(),
  loadProjectForRenderSnapshot: vi.fn(),
  getProjectRevision: vi.fn(),
  admitNativeMediaFinalRender: vi.fn(),
  readNativeMediaFinalRenderProjectRevision: vi.fn(),
  verifyAudioRights: vi.fn(),
  assertRemotionSiteFresh: vi.fn(),
  checkCredits: vi.fn(),
  CreditDeductionRejectedError: class CreditDeductionRejectedError extends Error {},
  deduct: vi.fn(),
  refund: vi.fn(),
  setAwsCredentials: vi.fn(),
  shouldUseChapterRendering: vi.fn(),
  detectChapterBoundaries: vi.fn(),
  createChapterLayoutManifestForRender: vi.fn(),
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

vi.mock('@/lib/editron/services/render-job-service', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/editron/services/render-job-service')>(),
  abandonStaleProjectRenderJobAdmissionV1:
    routeMocks.abandonStaleProjectRenderJobAdmission,
  createJob: routeMocks.createJob,
  calculateExpectedRenderDurationMs: routeMocks.calculateExpectedRenderDurationMs,
  createProjectRenderJobAuthorizationV1: routeMocks.createProjectRenderJobAuthorization,
  reserveJob: routeMocks.reserveJob,
  reserveProjectRenderJobV1: routeMocks.reserveProjectRenderJob,
  recordProjectRenderJobBillingV1: routeMocks.recordProjectRenderJobBilling,
  markProjectRenderDispatchAttemptingV1: routeMocks.markProjectRenderDispatchAttempting,
  quarantineProjectRenderDispatchV1: routeMocks.quarantineProjectRenderDispatch,
  quarantineProjectRenderBillingV1: routeMocks.quarantineProjectRenderBilling,
  markJobStarted: routeMocks.markJobStarted,
  markProjectRenderJobStartedV1: routeMocks.markProjectRenderJobStarted,
  failJob: routeMocks.failJob,
  failProjectRenderJobV1: routeMocks.failProjectRenderJob,
  claimJobFinalization: routeMocks.claimJobFinalization,
  releaseJobFinalizationClaim: routeMocks.releaseJobFinalizationClaim,
  getJob: routeMocks.getJob,
  getCurrentProjectRenderJobV1: routeMocks.getCurrentProjectRenderJob,
  getProjectRenderJobAuthorizationByAdmissionV1:
    routeMocks.getProjectRenderJobAuthorizationByAdmission,
  claimFailedJobFinalizationRetry: routeMocks.claimFailedJobFinalizationRetry,
  releaseFailedJobFinalizationRetryClaim: routeMocks.releaseFailedJobFinalizationRetryClaim,
  reconcileProviderTerminalEvent: routeMocks.reconcileProviderTerminalEvent,
  getActiveRendersForUser: routeMocks.getActiveRendersForUser,
}));

vi.mock('@/lib/editron/services/chapter-parent-orchestration-v1', () => ({
  startChapterParentOrchestrationV1: routeMocks.startChapterParentOrchestration,
  beginChapterParentOrchestrationRunningV1: routeMocks.beginChapterParentOrchestrationRunning,
  quarantineChapterParentOrchestrationV1: routeMocks.quarantineChapterParentOrchestration,
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

vi.mock('@/lib/editron/services/asset-resolver', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/editron/services/asset-resolver')>();
  return {
    assetResolver: {
      resolveProjectAssets: routeMocks.resolveProjectAssets,
    },
    ProjectAssetSourceUnverifiableErrorV1: actual.ProjectAssetSourceUnverifiableErrorV1,
  };
});

vi.mock('@/lib/editron/services/project-service', () => ({
  ProjectNotFoundOrForbiddenError: class ProjectNotFoundOrForbiddenError extends Error {},
  projectService: {
    loadProject: routeMocks.loadProject,
    loadProjectForRenderSnapshot: routeMocks.loadProjectForRenderSnapshot,
    getProjectRevision: routeMocks.getProjectRevision,
    failProjectRenderJobFromProviderTransactionV1:
      routeMocks.failProjectRenderJobFromProviderTransaction,
    claimProjectRenderJobFinalizationTransactionV1:
      routeMocks.claimProjectRenderJobFinalizationTransaction,
    releaseProjectRenderJobFinalizationClaimTransactionV1:
      routeMocks.releaseProjectRenderJobFinalizationClaimTransaction,
    claimFailedProjectRenderJobFinalizationRetryTransactionV1:
      routeMocks.claimFailedProjectRenderJobFinalizationRetryTransaction,
    releaseFailedProjectRenderJobFinalizationRetryClaimTransactionV1:
      routeMocks.releaseFailedProjectRenderJobFinalizationRetryClaimTransaction,
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
  CreditDeductionRejectedError: routeMocks.CreditDeductionRejectedError,
  checkCredits: routeMocks.checkCredits,
}));

vi.mock('@/lib/editron/utils/aws-credentials', () => ({
  setAWSCredentials: routeMocks.setAwsCredentials,
}));

vi.mock('@/lib/editron/services/chapter-renderer', () => ({
  shouldUseChapterRendering: routeMocks.shouldUseChapterRendering,
  detectChapterBoundaries: routeMocks.detectChapterBoundaries,
  createChapterLayoutManifestForRenderV1: routeMocks.createChapterLayoutManifestForRender,
  startChapterRender: routeMocks.startChapterRender,
}));

vi.mock('@/lib/shared/project-status', () => ({
  transitionProjectStatus: routeMocks.transitionProjectStatus,
}));

import { POST } from '@/app/api/services/editron/cloudrun/render/route';
import { GET as GET_ACTIVE_RENDERS } from '@/app/api/services/editron/render/active/route';
import { POST as POST_FINALIZATION_RETRY } from '@/app/api/services/editron/render/finalization/retry/route';
import { POST as POST_RENDER_WEBHOOK } from '@/app/api/services/editron/cloudrun/render/webhook/route';
import { POST as POST_CHAPTER_RENDER_WEBHOOK } from '@/app/api/services/editron/cloudrun/render/chapter-webhook/route';
import { RenderAudioRightsAuthorityError } from '@/lib/editron/services/render-audio-rights-authority';
import { beginRenderFinalization } from '@/lib/editron/services/render-finalization-dispatch';
import {
  createChapterChildDispatchIdentityV1,
  createChapterChildDispatchV1,
} from '@/lib/editron/services/chapter-render-dispatch-v1';
import {
  buildContainedVideoTargetsV1,
  buildProjectRenderSourceSnapshotV1,
  createProjectRenderSnapshotBindingV1,
} from '@/lib/editron/services/project-render-snapshot-binding-v1';

describe('Editron render startup boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('REMOTION_LAMBDA_FUNCTION_NAME', 'editron-render-test');
    vi.stubEnv('REMOTION_LAMBDA_SERVE_URL', 'https://remotion.example.test/site');
    vi.stubEnv('EDITRON_REMOTION_BUNDLE_SHA', 'a'.repeat(64));
    vi.stubEnv('REMOTION_LAMBDA_SERVE_BUNDLE_SHA', 'a'.repeat(64));
    vi.stubEnv('REMOTION_WEBHOOK_SECRET', 'test-remotion-webhook-secret');
    vi.stubEnv('EDITRON_RENDER_FINALIZER_ENDPOINT', 'https://finalizer.example.test/finalize');
    vi.stubEnv('EDITRON_RENDER_FINALIZER_TOKEN', 'finalizer-secret');
    vi.stubEnv('QSTASH_TOKEN', 'qstash-secret');
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'current-signing-key');
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'next-signing-key');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.test');
    routeMocks.auth.mockResolvedValue({ userId: 'user_1' });
    routeMocks.assertRemotionSiteFresh.mockReturnValue({
      ok: true,
      reason: 'verified_env_bundle',
      serveUrl: 'https://remotion.example.test/site',
      expectedBundle: 'a'.repeat(64),
      serveBundle: 'a'.repeat(64),
      source: 'env',
    });
    routeMocks.setAwsCredentials.mockResolvedValue(undefined);
    const project = {
      projectId: 'project_1',
      userId: 'user_1',
      visibility: 'private',
      updatedAt: new Date('2026-08-29T00:00:00.000Z'),
      projectRevision: 7,
      overlays: [{
        id: 1,
        type: 'video',
        from: 0,
        durationInFrames: 90,
        assetId: 'asset_video_1',
        src: '/api/assets/asset_video_1',
      }],
      durationInFrames: 90,
      fps: 30,
      playerDimensions: { width: 1920, height: 1080 },
    };
    routeMocks.loadProject.mockResolvedValue(project);
    routeMocks.loadProjectForRenderSnapshot.mockResolvedValue({
      project,
      revision: projectRevision(),
      ownerId: 'user_1',
    });
    routeMocks.getProjectRevision.mockResolvedValue(projectRevision());
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
    routeMocks.detectChapterBoundaries.mockReturnValue([{ startFrame: 0, endFrame: 90 }]);
    routeMocks.createChapterLayoutManifestForRender.mockImplementation((input: {
      parentAdmissionId: string;
      bindingHash: string;
      projectId: string;
      totalFrames: number;
      fps: number;
      boundaries: Array<{ startFrame: number; endFrame: number }>;
    }) => ({
      schemaVersion: 1,
      scope: 'EDITRON_CHAPTER_LAYOUT',
      parentAdmissionId: input.parentAdmissionId,
      bindingHash: input.bindingHash,
      totalFrames: input.totalFrames,
      projectTimebase: {
        timebaseId: `${input.projectId}:timeline`,
        version: 'LEGACY_NUMERIC_DECIMAL_V1:READ_COMPATIBILITY_ONLY',
        rate: input.fps === 29.97
          ? { numerator: '2997', denominator: '100' }
          : { numerator: String(input.fps), denominator: '1' },
      },
      policy: {
        policyId: 'chapter-layout-scene-gap-v1',
        policyVersion: '1',
        splitThresholdFrames: Math.ceil(900 * input.fps),
        targetFrames: Math.ceil(150 * input.fps),
        minimumFrames: Math.ceil(30 * input.fps),
      },
      chapterCount: input.boundaries.length,
      chapters: input.boundaries.map((boundary, index) => ({
        index,
        startFrame: boundary.startFrame,
        endFrame: boundary.endFrame,
        durationFrames: boundary.endFrame - boundary.startFrame,
      })),
      layoutManifestHash: 'c'.repeat(64),
    }));
    routeMocks.startChapterParentOrchestration.mockResolvedValue({
      ok: true,
      status: 'CURRENT',
      state: 'STARTING',
    });
    routeMocks.beginChapterParentOrchestrationRunning.mockResolvedValue({
      ok: true,
      status: 'CURRENT',
      state: 'RUNNING',
    });
    routeMocks.quarantineChapterParentOrchestration.mockResolvedValue({
      ok: true,
      status: 'CURRENT',
      state: 'UNKNOWN',
    });
    routeMocks.checkCredits.mockResolvedValue({
      allowed: true,
      deduct: routeMocks.deduct,
      refund: routeMocks.refund,
    });
    routeMocks.deduct.mockResolvedValue({ transactionId: 'txn_render_1' });
    routeMocks.refund.mockResolvedValue(undefined);
    routeMocks.recordProjectRenderJobBilling.mockResolvedValue({ ok: true, status: 'CURRENT' });
    routeMocks.markProjectRenderDispatchAttempting.mockResolvedValue({ ok: true, status: 'CURRENT' });
    routeMocks.quarantineProjectRenderDispatch.mockResolvedValue({ ok: true, status: 'CURRENT' });
    routeMocks.quarantineProjectRenderBilling.mockResolvedValue({ ok: true, status: 'CURRENT' });
    routeMocks.renderMediaOnLambda.mockResolvedValue({
      renderId: 'render_1',
      bucketName: 'bucket_1',
    });
    routeMocks.createJob.mockResolvedValue(undefined);
    routeMocks.createProjectRenderJobAuthorization.mockImplementation((input: {
      jobId: string;
      requestedByUserId: string;
      ownerId: string;
      projectId: string;
      projectRevision: unknown;
      binding: { bindingHash: string };
    }) => ({
      schemaVersion: 1,
      jobId: input.jobId,
      requestedByUserId: input.requestedByUserId,
      ownerId: input.ownerId,
      projectId: input.projectId,
      projectRevision: input.projectRevision,
      bindingHash: input.binding.bindingHash,
    }));
    routeMocks.calculateExpectedRenderDurationMs.mockImplementation(
      (totalFrames: number, fps: number) => Math.round((totalFrames / fps) * 1000),
    );
    routeMocks.reserveJob.mockResolvedValue(undefined);
    routeMocks.reserveProjectRenderJob.mockResolvedValue(undefined);
    routeMocks.markJobStarted.mockResolvedValue(undefined);
    routeMocks.markProjectRenderJobStarted.mockResolvedValue({
      ok: true,
      status: 'CURRENT',
      job: {},
    });
    routeMocks.failJob.mockResolvedValue(undefined);
    routeMocks.failProjectRenderJob.mockResolvedValue({ ok: true, status: 'CURRENT' });
    routeMocks.abandonStaleProjectRenderJobAdmission.mockResolvedValue({
      ok: true,
      status: 'STALE',
    });
    routeMocks.releaseJobFinalizationClaim.mockResolvedValue(true);
    routeMocks.releaseProjectRenderJobFinalizationClaimTransaction.mockResolvedValue({
      ok: true,
      status: 'CURRENT',
    });
    routeMocks.releaseFailedJobFinalizationRetryClaim.mockResolvedValue(true);
    routeMocks.releaseFailedProjectRenderJobFinalizationRetryClaimTransaction.mockResolvedValue({
      ok: true,
      status: 'CURRENT',
    });
    routeMocks.getJob.mockResolvedValue({
      _id: 'rnd_admission_1',
      userId: 'user_1',
      projectId: 'project_1',
      status: 'rendering',
    });
    routeMocks.getProjectRenderJobAuthorizationByAdmission.mockImplementation(
      async ({ jobId }: { jobId: string }) => {
        const job = await routeMocks.getJob(jobId);
        return job
          ? { ok: false, status: 'NOT_PROJECT_RENDER_JOB', job }
          : {
              ok: false,
              status: 'NON_CURRENT',
              code: 'PROJECT_ARTIFACT_NOT_CURRENT',
              reason: 'JOB_NOT_CURRENT',
            };
      },
    );
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

  it('reserves before deduction, then dispatches and binds the provider render', async () => {
    const response = await POST(renderRequest());
    const reservation = routeMocks.reserveProjectRenderJob.mock.calls[0]?.[0];
    const admissionId = reservation?.jobId;
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      type: 'success',
      data: {
        renderId: 'render_1',
        bucketName: 'bucket_1',
        renderAdmissionId: admissionId,
        trackingStatus: 'durable',
      },
    });
    expect(payload.data.renderAuthorization).toBeUndefined();
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
      overlays: [expect.objectContaining({ id: 1, assetId: 'asset_video_1' })],
    });
    expect(routeMocks.admitNativeMediaFinalRender.mock.invocationCallOrder[0])
      .toBeLessThan(routeMocks.resolveProjectAssets.mock.invocationCallOrder[0]);
    expect(routeMocks.admitNativeMediaFinalRender.mock.invocationCallOrder[0])
      .toBeLessThan(routeMocks.checkCredits.mock.invocationCallOrder[0]);
    expect(routeMocks.deduct).toHaveBeenCalledTimes(1);
    expect(routeMocks.reserveProjectRenderJob).toHaveBeenCalledWith(expect.objectContaining({
      jobId: admissionId,
      requestedByUserId: 'user_1',
      ownerId: 'user_1',
      projectId: 'project_1',
      currentProjectRevision: projectRevision(),
      expectedDurationMs: 3_000,
      deliveryManifest: expect.objectContaining({
        primaryArtifact: expect.objectContaining({ renderId: admissionId }),
      }),
      binding: expect.objectContaining({
        scope: 'PROJECT_SNAPSHOT',
        artifactId: admissionId,
        ownerId: 'user_1',
        projectId: 'project_1',
        projectRevision: projectRevision(),
        sequenceId: 'main',
        compositionId: 'TestComponent',
        durationInFrames: 90,
        fps: 30,
        width: 1920,
        height: 1080,
        containedVideoTargets: [expect.objectContaining({
          overlayId: 1,
          expectedAssetId: 'asset_video_1',
          exactFrameRange: { startFrame: 0, endFrame: 90 },
        })],
        projectRenderSourceSnapshotHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        bindingHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    }));
    expect(routeMocks.reserveProjectRenderJob.mock.invocationCallOrder[0])
      .toBeLessThan(routeMocks.resolveProjectAssets.mock.invocationCallOrder[0]);
    expect(routeMocks.reserveProjectRenderJob.mock.invocationCallOrder[0])
      .toBeLessThan(routeMocks.deduct.mock.invocationCallOrder[0]);
    expect(routeMocks.deduct.mock.invocationCallOrder[0])
      .toBeLessThan(routeMocks.renderMediaOnLambda.mock.invocationCallOrder[0]);
    expect(routeMocks.renderMediaOnLambda).toHaveBeenCalledWith(expect.objectContaining({
      audioCodec: 'aac',
      metadata: {
        editronRenderAdmissionId: admissionId,
        projectRenderBindingHash: expect.any(String),
        renderRegion: 'us-east-1',
        editronRenderAttemptToken: expect.stringMatching(/^editron_attempt_v1_[a-f0-9]{64}$/),
      },
      webhook: {
        url: 'https://app.example.test/api/services/editron/cloudrun/render/webhook',
        secret: 'test-remotion-webhook-secret',
        customData: {
          editronRenderAdmissionId: admissionId,
          projectRenderBindingHash: expect.any(String),
          renderRegion: 'us-east-1',
          editronRenderAttemptToken: expect.stringMatching(/^editron_attempt_v1_[a-f0-9]{64}$/),
        },
      },
      inputProps: expect.objectContaining({
        overlays: [
          expect.objectContaining({
            id: 1,
            src: 'https://cdn.example.test/video_1.mp4',
          }),
        ],
        src: '',
        isRendering: true,
      }),
    }));
    expect(routeMocks.getProjectRevision).toHaveBeenCalledTimes(3);
    expect(routeMocks.markProjectRenderJobStarted).toHaveBeenCalledWith(expect.objectContaining({
      authorization: expect.objectContaining({
        jobId: admissionId,
        requestedByUserId: 'user_1',
        ownerId: 'user_1',
        projectId: 'project_1',
      }),
      currentProjectRevision: projectRevision(),
      providerRenderId: 'render_1',
      bucketName: 'bucket_1',
      region: 'us-east-1',
      deliveryManifest: expect.objectContaining({
        primaryArtifact: expect.objectContaining({ renderId: admissionId }),
      }),
      attemptToken: expect.stringMatching(/^editron_attempt_v1_[a-f0-9]{64}$/),
    }));
    expect(routeMocks.markJobStarted).not.toHaveBeenCalled();
    expect(routeMocks.createJob).not.toHaveBeenCalled();
    expect(routeMocks.refund).not.toHaveBeenCalled();
  });

  it('CRITICAL: preserves the reference-track handoff while excluding it from Lambda input', async () => {
    routeMocks.loadProjectForRenderSnapshot.mockResolvedValue({
      project: {
        projectId: 'project_1',
        userId: 'user_1',
        visibility: 'private',
        updatedAt: new Date('2026-08-29T00:00:00.000Z'),
        projectRevision: 7,
        overlays: [
        {
          id: 1,
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
      },
      revision: projectRevision(),
      ownerId: 'user_1',
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
        overlays: [expect.objectContaining({ id: 1 })],
      }),
    );
    expect(routeMocks.renderMediaOnLambda).toHaveBeenCalledWith(
      expect.objectContaining({
        inputProps: expect.objectContaining({
          overlays: [
            expect.objectContaining({ id: 1 }),
          ],
        }),
      }),
    );
  });

  it('CRITICAL: reserves a chapter admission before billing and child Lambda dispatch', async () => {
    routeMocks.shouldUseChapterRendering.mockReturnValue(true);
    routeMocks.detectChapterBoundaries.mockReturnValueOnce([
      { startFrame: 0, endFrame: 30 },
      { startFrame: 30, endFrame: 60 },
      { startFrame: 60, endFrame: 90 },
    ]);
    routeMocks.startChapterRender.mockImplementation(async (jobId: string) => ({
      jobId,
      chapterCount: 3,
      chapterLayoutManifestHash: 'c'.repeat(64),
    }));

    const response = await POST(renderRequest());
    const reservation = routeMocks.reserveProjectRenderJob.mock.calls[0]?.[0];
    const admissionId = reservation?.jobId;
    const manifest = routeMocks.createChapterLayoutManifestForRender.mock.results[0]?.value;

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData).toMatchObject({
      type: 'success',
      data: {
        executionKind: 'CHAPTER_ORCHESTRATION',
        orchestrationId: admissionId,
        renderId: admissionId,
        region: 'us-east-1',
        renderAdmissionId: admissionId,
        chapters: 3,
        message: 'Split into 3 chapters for parallel rendering',
        trackingStatus: 'durable',
        deliveryManifest: {
          primaryArtifact: { renderId: admissionId },
        },
      },
    });
    expect(admissionId).toMatch(/^chr_[A-Za-z0-9_-]{12}$/);
    expect(routeMocks.reserveProjectRenderJob.mock.invocationCallOrder[0])
      .toBeLessThan(routeMocks.deduct.mock.invocationCallOrder[0]);
    expect(routeMocks.deduct.mock.invocationCallOrder[0])
      .toBeLessThan(routeMocks.startChapterRender.mock.invocationCallOrder[0]);
    expect(reservation).toEqual(expect.objectContaining({
      chapterOrchestration: expect.objectContaining({
        version: 1,
        scope: 'CHAPTER_ORCHESTRATION',
        aggregateJobId: admissionId,
        bindingHash: reservation.binding.bindingHash,
        selectedRegion: 'us-east-1',
        state: 'NOT_STARTED',
        reservedAt: expect.any(Date),
      }),
    }));
    expect(routeMocks.createChapterLayoutManifestForRender).toHaveBeenCalledWith({
      parentAdmissionId: admissionId,
      bindingHash: reservation.binding.bindingHash,
      projectId: 'project_1',
      totalFrames: 90,
      fps: 30,
      boundaries: [
        { startFrame: 0, endFrame: 30 },
        { startFrame: 30, endFrame: 60 },
        { startFrame: 60, endFrame: 90 },
      ],
    });
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
      {
        region: 'us-east-1',
        authorization: expect.objectContaining({
          schemaVersion: 1,
          jobId: admissionId,
          requestedByUserId: 'user_1',
          ownerId: 'user_1',
          projectId: 'project_1',
          projectRevision: projectRevision(),
          bindingHash: reservation.binding.bindingHash,
        }),
        binding: expect.objectContaining({
          scope: 'PROJECT_SNAPSHOT',
          artifactId: admissionId,
          ownerId: 'user_1',
          projectId: 'project_1',
          projectRevision: projectRevision(),
          bindingHash: reservation.binding.bindingHash,
        }),
        chapterWebhook: {
          url: 'https://app.example.test/api/services/editron/cloudrun/render/chapter-webhook',
          secret: 'test-remotion-webhook-secret',
        },
        chapterLayoutManifest: manifest,
      },
    );
    expect(routeMocks.startChapterParentOrchestration).toHaveBeenCalledWith({
      authorization: expect.objectContaining({
        jobId: admissionId,
        requestedByUserId: 'user_1',
        ownerId: 'user_1',
        projectId: 'project_1',
      }),
      currentProjectRevision: projectRevision(),
      selectedRegion: 'us-east-1',
    });
    expect(routeMocks.beginChapterParentOrchestrationRunning).toHaveBeenCalledWith({
      authorization: expect.objectContaining({ jobId: admissionId }),
      currentProjectRevision: projectRevision(),
      selectedRegion: 'us-east-1',
      chapterCount: 3,
      chapterLayoutManifestHash: 'c'.repeat(64),
    });
    expect(routeMocks.startChapterParentOrchestration.mock.invocationCallOrder[0])
      .toBeLessThan(routeMocks.startChapterRender.mock.invocationCallOrder[0]);
    expect(routeMocks.startChapterRender.mock.invocationCallOrder[0])
      .toBeLessThan(routeMocks.beginChapterParentOrchestrationRunning.mock.invocationCallOrder[0]);
    expect(routeMocks.markProjectRenderDispatchAttempting).not.toHaveBeenCalled();
    expect(routeMocks.markProjectRenderJobStarted).not.toHaveBeenCalled();
    expect(routeMocks.quarantineProjectRenderDispatch).not.toHaveBeenCalled();
    expect(routeMocks.markJobStarted).not.toHaveBeenCalled();
    expect(routeMocks.renderMediaOnLambda).not.toHaveBeenCalled();
    expect(routeMocks.createJob).not.toHaveBeenCalled();
    expect(routeMocks.refund).not.toHaveBeenCalled();
    expect(responseData.data).not.toHaveProperty('bucketName');
    expect(responseData.data).not.toHaveProperty('isChapterRender');
  });

  it('quarantines a chapter parent when the STARTING response is lost', async () => {
    routeMocks.shouldUseChapterRendering.mockReturnValue(true);
    routeMocks.startChapterParentOrchestration.mockRejectedValueOnce(
      new Error('chapter parent STARTING response lost'),
    );

    const response = await POST(renderRequest());
    const reservation = routeMocks.reserveProjectRenderJob.mock.calls[0]?.[0];
    const admissionId = reservation?.jobId;

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      type: 'error',
      code: 'CHAPTER_ORCHESTRATION_UNKNOWN',
      recoveryRequired: true,
      renderAdmissionId: admissionId,
    });
    expect(routeMocks.startChapterParentOrchestration).toHaveBeenCalledTimes(1);
    expect(routeMocks.startChapterRender).not.toHaveBeenCalled();
    expect(routeMocks.beginChapterParentOrchestrationRunning).not.toHaveBeenCalled();
    expect(routeMocks.quarantineChapterParentOrchestration).toHaveBeenCalledWith({
      authorization: expect.objectContaining({ jobId: admissionId }),
      currentProjectRevision: projectRevision(),
      selectedRegion: 'us-east-1',
      error: expect.any(Error),
    });
    expect(routeMocks.markProjectRenderDispatchAttempting).not.toHaveBeenCalled();
    expect(routeMocks.markProjectRenderJobStarted).not.toHaveBeenCalled();
    expect(routeMocks.quarantineProjectRenderDispatch).not.toHaveBeenCalled();
    expect(routeMocks.refund).not.toHaveBeenCalled();
  });

  it('quarantines a chapter parent when child start throws after STARTING', async () => {
    routeMocks.shouldUseChapterRendering.mockReturnValue(true);
    routeMocks.startChapterRender.mockRejectedValueOnce(new Error('child start response lost'));

    const response = await POST(renderRequest());
    const reservation = routeMocks.reserveProjectRenderJob.mock.calls[0]?.[0];
    const admissionId = reservation?.jobId;

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      type: 'error',
      code: 'CHAPTER_ORCHESTRATION_UNKNOWN',
      recoveryRequired: true,
      renderAdmissionId: admissionId,
    });
    expect(routeMocks.startChapterParentOrchestration).toHaveBeenCalledTimes(1);
    expect(routeMocks.startChapterRender).toHaveBeenCalledTimes(1);
    expect(routeMocks.beginChapterParentOrchestrationRunning).not.toHaveBeenCalled();
    expect(routeMocks.quarantineChapterParentOrchestration).toHaveBeenCalledWith({
      authorization: expect.objectContaining({ jobId: admissionId }),
      currentProjectRevision: projectRevision(),
      selectedRegion: 'us-east-1',
      error: expect.any(Error),
    });
    expect(routeMocks.markProjectRenderDispatchAttempting).not.toHaveBeenCalled();
    expect(routeMocks.markProjectRenderJobStarted).not.toHaveBeenCalled();
    expect(routeMocks.quarantineProjectRenderDispatch).not.toHaveBeenCalled();
    expect(routeMocks.refund).not.toHaveBeenCalled();
  });

  it('quarantines a chapter parent when the child-start count does not match the manifest', async () => {
    routeMocks.shouldUseChapterRendering.mockReturnValue(true);
    routeMocks.detectChapterBoundaries.mockReturnValueOnce([
      { startFrame: 0, endFrame: 30 },
      { startFrame: 30, endFrame: 60 },
      { startFrame: 60, endFrame: 90 },
    ]);
    routeMocks.startChapterRender.mockImplementationOnce(async (jobId: string) => ({
      jobId,
      chapterCount: 2,
      chapterLayoutManifestHash: 'c'.repeat(64),
    }));

    const response = await POST(renderRequest());
    const reservation = routeMocks.reserveProjectRenderJob.mock.calls[0]?.[0];
    const admissionId = reservation?.jobId;

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      type: 'error',
      code: 'CHAPTER_ORCHESTRATION_UNKNOWN',
      recoveryRequired: true,
      renderAdmissionId: admissionId,
    });
    expect(routeMocks.startChapterParentOrchestration).toHaveBeenCalledTimes(1);
    expect(routeMocks.startChapterRender).toHaveBeenCalledTimes(1);
    expect(routeMocks.beginChapterParentOrchestrationRunning).not.toHaveBeenCalled();
    expect(routeMocks.quarantineChapterParentOrchestration).toHaveBeenCalledWith({
      authorization: expect.objectContaining({ jobId: admissionId }),
      currentProjectRevision: projectRevision(),
      selectedRegion: 'us-east-1',
      error: expect.any(Error),
    });
    expect(routeMocks.markProjectRenderDispatchAttempting).not.toHaveBeenCalled();
    expect(routeMocks.markProjectRenderJobStarted).not.toHaveBeenCalled();
    expect(routeMocks.quarantineProjectRenderDispatch).not.toHaveBeenCalled();
    expect(routeMocks.refund).not.toHaveBeenCalled();
  });

  it('quarantines a chapter parent when the child-start manifest hash does not match', async () => {
    routeMocks.shouldUseChapterRendering.mockReturnValue(true);
    routeMocks.detectChapterBoundaries.mockReturnValueOnce([
      { startFrame: 0, endFrame: 30 },
      { startFrame: 30, endFrame: 60 },
      { startFrame: 60, endFrame: 90 },
    ]);
    routeMocks.startChapterRender.mockImplementationOnce(async (jobId: string) => ({
      jobId,
      chapterCount: 3,
      chapterLayoutManifestHash: 'd'.repeat(64),
    }));

    const response = await POST(renderRequest());
    const reservation = routeMocks.reserveProjectRenderJob.mock.calls[0]?.[0];
    const admissionId = reservation?.jobId;

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      type: 'error',
      code: 'CHAPTER_ORCHESTRATION_UNKNOWN',
      recoveryRequired: true,
      renderAdmissionId: admissionId,
    });
    expect(routeMocks.startChapterParentOrchestration).toHaveBeenCalledTimes(1);
    expect(routeMocks.startChapterRender).toHaveBeenCalledTimes(1);
    expect(routeMocks.beginChapterParentOrchestrationRunning).not.toHaveBeenCalled();
    expect(routeMocks.quarantineChapterParentOrchestration).toHaveBeenCalledWith({
      authorization: expect.objectContaining({ jobId: admissionId }),
      currentProjectRevision: projectRevision(),
      selectedRegion: 'us-east-1',
      error: expect.any(Error),
    });
    expect(routeMocks.markProjectRenderDispatchAttempting).not.toHaveBeenCalled();
    expect(routeMocks.markProjectRenderJobStarted).not.toHaveBeenCalled();
    expect(routeMocks.quarantineProjectRenderDispatch).not.toHaveBeenCalled();
    expect(routeMocks.refund).not.toHaveBeenCalled();
  });

  it('quarantines and fails closed when chapter RUNNING CAS is rejected', async () => {
    routeMocks.shouldUseChapterRendering.mockReturnValue(true);
    routeMocks.detectChapterBoundaries.mockReturnValueOnce([
      { startFrame: 0, endFrame: 30 },
      { startFrame: 30, endFrame: 60 },
      { startFrame: 60, endFrame: 90 },
    ]);
    routeMocks.startChapterRender.mockImplementation(async (jobId: string) => ({
      jobId,
      chapterCount: 3,
      chapterLayoutManifestHash: 'c'.repeat(64),
    }));
    routeMocks.beginChapterParentOrchestrationRunning.mockResolvedValueOnce({
      ok: false,
      status: 'NON_CURRENT',
      reason: 'CAS_CONFLICT',
    });

    const response = await POST(renderRequest());
    const reservation = routeMocks.reserveProjectRenderJob.mock.calls[0]?.[0];
    const admissionId = reservation?.jobId;

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      type: 'error',
      code: 'CHAPTER_ORCHESTRATION_UNKNOWN',
      recoveryRequired: true,
      renderAdmissionId: admissionId,
    });
    expect(routeMocks.quarantineChapterParentOrchestration).toHaveBeenCalledTimes(1);
    expect(routeMocks.markProjectRenderDispatchAttempting).not.toHaveBeenCalled();
    expect(routeMocks.markProjectRenderJobStarted).not.toHaveBeenCalled();
    expect(routeMocks.quarantineProjectRenderDispatch).not.toHaveBeenCalled();
    expect(routeMocks.refund).not.toHaveBeenCalled();
  });

  it('accepts a signed child success, binds the exact ATTEMPTING tuple, and never calls a provider', async () => {
    const fixture = chapterChildFixture('ATTEMPTING');
    routeMocks.validateWebhookSignature.mockImplementation(() => undefined);
    routeMocks.dbFindOne.mockResolvedValue(fixture.job);
    routeMocks.dbUpdateOne.mockResolvedValue({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
    });

    const response = await POST_CHAPTER_RENDER_WEBHOOK(
      chapterWebhookRequest(chapterWebhookPayload(fixture)),
    );

    expect(response.status).toBe(200);
    expect(routeMocks.validateWebhookSignature).toHaveBeenCalledWith({
      secret: 'test-remotion-webhook-secret',
      body: expect.objectContaining({ type: 'success' }),
      signatureHeader: 'sha512=test-signature',
    });
    expect(routeMocks.dbUpdateOne).toHaveBeenCalledTimes(2);
    expect(routeMocks.renderMediaOnLambda).not.toHaveBeenCalled();
    expect(routeMocks.deduct).not.toHaveBeenCalled();
    expect(routeMocks.refund).not.toHaveBeenCalled();
  });

  it('accepts the provider success shape without size but waits for output proof', async () => {
    const fixture = chapterChildFixture('ATTEMPTING');
    const payload = chapterWebhookPayload(fixture);
    delete (payload as { outputSizeInBytes?: number }).outputSizeInBytes;
    routeMocks.validateWebhookSignature.mockImplementation(() => undefined);
    routeMocks.dbFindOne.mockResolvedValue(fixture.job);
    routeMocks.dbUpdateOne.mockResolvedValue({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
    });

    const response = await POST_CHAPTER_RENDER_WEBHOOK(chapterWebhookRequest(payload));

    expect(response.status).toBe(200);
    expect(routeMocks.dbUpdateOne).toHaveBeenCalledOnce();
    expect(routeMocks.dbUpdateOne.mock.calls[0]?.[1]).not.toMatchObject({
      $set: expect.objectContaining({ 'chapters.$.status': 'completed' }),
    });
    expect(routeMocks.renderMediaOnLambda).not.toHaveBeenCalled();
  });

  it('binds a retained UNKNOWN tuple, records failure, and makes an exact replay read-only', async () => {
    const fixture = chapterChildFixture('UNKNOWN');
    const terminalFixture = chapterChildFixture('BOUND', {
      status: 'failed',
      error: 'Remotion chapter render timed out',
    });
    routeMocks.validateWebhookSignature.mockImplementation(() => undefined);
    routeMocks.dbFindOne
      .mockResolvedValueOnce(fixture.job)
      .mockResolvedValueOnce(terminalFixture.job);
    routeMocks.dbUpdateOne
      .mockResolvedValueOnce({ acknowledged: true, matchedCount: 1, modifiedCount: 0 })
      .mockResolvedValueOnce({ acknowledged: true, matchedCount: 1, modifiedCount: 1 })
      .mockResolvedValueOnce({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });

    const payload = chapterWebhookPayload(fixture, { type: 'timeout' });
    const first = await POST_CHAPTER_RENDER_WEBHOOK(chapterWebhookRequest(payload));
    const second = await POST_CHAPTER_RENDER_WEBHOOK(chapterWebhookRequest(payload));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(routeMocks.dbUpdateOne).toHaveBeenCalledTimes(3);
    expect(routeMocks.renderMediaOnLambda).not.toHaveBeenCalled();
    expect(routeMocks.reconcileProviderTerminalEvent).not.toHaveBeenCalled();
  });

  it('accepts the installed Remotion structured error payload', async () => {
    const fixture = chapterChildFixture('ATTEMPTING');
    routeMocks.validateWebhookSignature.mockImplementation(() => undefined);
    routeMocks.dbFindOne.mockResolvedValue(fixture.job);
    routeMocks.dbUpdateOne.mockResolvedValue({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
    });
    const base = chapterWebhookPayload(fixture);
    const payload = {
      type: 'error' as const,
      renderId: base.renderId,
      bucketName: base.bucketName,
      customData: base.customData,
      errors: [{
        type: 'renderer' as const,
        message: 'Renderer failed',
        name: 'Error',
        stack: 'Error: Renderer failed',
        frame: 10,
        chunk: 0,
        isFatal: true,
        attempt: 1,
        willRetry: false,
        totalAttempts: 1,
        tmpDir: { files: [{ filename: 'stderr.log', size: 12 }], total: 12 },
        s3Location: '',
        explanation: null,
      }],
    };

    const response = await POST_CHAPTER_RENDER_WEBHOOK(chapterWebhookRequest(payload));

    expect(response.status).toBe(200);
    expect(routeMocks.dbUpdateOne).toHaveBeenCalledTimes(2);
    expect(routeMocks.renderMediaOnLambda).not.toHaveBeenCalled();
  });

  it('rejects forged, malformed, and mismatched child callbacks before mutation', async () => {
    const fixture = chapterChildFixture('UNKNOWN');
    routeMocks.validateWebhookSignature.mockImplementation(() => undefined);

    const malformed = await POST_CHAPTER_RENDER_WEBHOOK(chapterWebhookRequest(
      chapterWebhookPayload(fixture, {
        type: 'success',
        outputFile: 'http://bucket.example.test/render.mp4',
      }),
    ));
    expect(malformed.status).toBe(400);
    expect(routeMocks.dbFindOne).not.toHaveBeenCalled();

    routeMocks.validateWebhookSignature.mockImplementationOnce(() => {
      throw new Error('forged');
    });
    const forged = await POST_CHAPTER_RENDER_WEBHOOK(
      chapterWebhookRequest(chapterWebhookPayload(fixture)),
    );
    expect(forged.status).toBe(409);
    expect(routeMocks.dbFindOne).not.toHaveBeenCalled();

    routeMocks.validateWebhookSignature.mockImplementation(() => undefined);
    routeMocks.dbFindOne.mockResolvedValue(fixture.job);
    const wrongToken = await POST_CHAPTER_RENDER_WEBHOOK(chapterWebhookRequest(
      chapterWebhookPayload(fixture, {
        customData: {
          ...chapterWebhookPayload(fixture).customData,
          editronChapterAttemptToken: `editron_chapter_child_attempt_v1_${'a'.repeat(64)}`,
        },
      }),
    ));
    expect(wrongToken.status).toBe(409);
    expect(routeMocks.dbFindOne).not.toHaveBeenCalled();

    const wrongBinding = 'f'.repeat(64);
    const wrongBindingToken = createChapterChildDispatchIdentityV1({
      parentAdmissionId: fixture.parentAdmissionId,
      childIndex: fixture.childIndex,
      bindingHash: wrongBinding,
    }).attemptToken;
    const bindingMismatch = await POST_CHAPTER_RENDER_WEBHOOK(chapterWebhookRequest(
      chapterWebhookPayload(fixture, {
        customData: {
          ...chapterWebhookPayload(fixture).customData,
          editronChapterBindingHash: wrongBinding,
          editronChapterAttemptToken: wrongBindingToken,
        },
      }),
    ));
    expect(bindingMismatch.status).toBe(409);
    expect(routeMocks.dbUpdateOne).not.toHaveBeenCalled();

    const tupleMismatch = await POST_CHAPTER_RENDER_WEBHOOK(chapterWebhookRequest(
      chapterWebhookPayload(fixture, { renderId: 'different-child-render' }),
    ));
    expect(tupleMismatch.status).toBe(409);
    expect(routeMocks.dbUpdateOne).not.toHaveBeenCalled();
  });

  it('CRITICAL: rejects unverified renderer bundles and client-owned render form', async () => {
    routeMocks.assertRemotionSiteFresh.mockReturnValueOnce({
      ok: true,
      reason: 'unverified_no_app_commit',
      serveUrl: 'https://remotion.example.test/site',
      expectedBundle: null,
      serveBundle: null,
      source: 'none',
    });

    const unverified = await POST(renderRequest());
    expect(unverified.status).toBe(503);
    await expect(unverified.json()).resolves.toMatchObject({
      code: 'RENDER_SITE_VERSION_UNVERIFIED',
    });

    const wrongComposition = await POST(renderRequest({ compositionId: 'ClientComposition' }));
    expect(wrongComposition.status).toBe(400);
    await expect(wrongComposition.json()).resolves.toMatchObject({
      code: 'INVALID_RENDER_COMPOSITION',
    });

    const injectedOverlay = await POST(renderRequest({
      inputProps: { overlays: [{ id: 999, type: 'video' }] },
    }));
    expect(injectedOverlay.status).toBe(400);
    await expect(injectedOverlay.json()).resolves.toMatchObject({
      code: 'INVALID_RENDER_INPUT_PROPS',
    });

    const unknownProp = await POST(renderRequest({
      inputProps: { overlays: [], clientRenderMode: 'override' },
    }));
    expect(unknownProp.status).toBe(400);
    await expect(unknownProp.json()).resolves.toMatchObject({
      code: 'INVALID_RENDER_INPUT_PROPS',
    });

    expect(routeMocks.loadProjectForRenderSnapshot).not.toHaveBeenCalled();
    expect(routeMocks.reserveProjectRenderJob).not.toHaveBeenCalled();
    expect(routeMocks.deduct).not.toHaveBeenCalled();
    expect(routeMocks.renderMediaOnLambda).not.toHaveBeenCalled();
  });

  it('CRITICAL: treats client timing and dimensions as non-authoritative hints', async () => {
    const response = await POST(renderRequest({
      inputProps: {
        overlays: [],
        durationInFrames: 9_999,
        fps: 120,
        width: 8_192,
        height: 4_320,
        src: '',
      },
    }));

    expect(response.status).toBe(200);
    expect(routeMocks.reserveProjectRenderJob).toHaveBeenCalledWith(expect.objectContaining({
      expectedDurationMs: 3_000,
      binding: expect.objectContaining({
        durationInFrames: 90,
        fps: 30,
        width: 1920,
        height: 1080,
      }),
    }));
    expect(routeMocks.renderMediaOnLambda).toHaveBeenCalledWith(expect.objectContaining({
      inputProps: expect.objectContaining({
        durationInFrames: 90,
        fps: 30,
        width: 1920,
        height: 1080,
      }),
    }));
  });

  it('CRITICAL: refunds and stops when the project revision changes before dispatch', async () => {
    const staleRevision = {
      ...projectRevision(),
      value: projectRevision().value + 1,
    };
    routeMocks.getProjectRevision.mockResolvedValue(staleRevision);

    const response = await POST(renderRequest());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'PROJECT_RENDER_REVISION_STALE',
    });
    expect(routeMocks.reserveProjectRenderJob).toHaveBeenCalledTimes(1);
    expect(routeMocks.deduct).toHaveBeenCalledTimes(1);
    expect(routeMocks.refund).toHaveBeenCalledTimes(1);
    expect(routeMocks.abandonStaleProjectRenderJobAdmission).toHaveBeenCalledWith({
      authorization: expect.objectContaining({
        requestedByUserId: 'user_1',
        ownerId: 'user_1',
        projectId: 'project_1',
        projectRevision: projectRevision(),
      }),
      currentProjectRevision: staleRevision,
      error: 'Project changed after render admission and before provider dispatch',
    });
    expect(routeMocks.failProjectRenderJob).not.toHaveBeenCalled();
    expect(routeMocks.setAwsCredentials).not.toHaveBeenCalled();
    expect(routeMocks.renderMediaOnLambda).not.toHaveBeenCalled();
  });

  it('keeps the requesting collaborator distinct from the persisted project owner', async () => {
    const ownerId = 'project_owner_1';
    const project = {
      projectId: 'project_1',
      userId: ownerId,
      visibility: 'shared',
      sharedWith: ['user_1'],
      updatedAt: new Date('2026-08-29T00:00:00.000Z'),
      projectRevision: 7,
      overlays: [{
        id: 1,
        type: 'video',
        from: 0,
        durationInFrames: 90,
        assetId: 'asset_video_1',
        src: '/api/assets/asset_video_1',
      }],
      durationInFrames: 90,
      fps: 30,
      playerDimensions: { width: 1920, height: 1080 },
    };
    routeMocks.loadProjectForRenderSnapshot.mockResolvedValue({
      project,
      revision: projectRevision(),
      ownerId,
    });

    const response = await POST(renderRequest());

    expect(response.status).toBe(200);
    expect(routeMocks.reserveProjectRenderJob).toHaveBeenCalledWith(expect.objectContaining({
      requestedByUserId: 'user_1',
      ownerId,
      projectId: 'project_1',
    }));
    expect(routeMocks.getProjectRevision).toHaveBeenCalledWith(ownerId, 'project_1');
    expect(routeMocks.markProjectRenderJobStarted).toHaveBeenCalledWith(expect.objectContaining({
      authorization: expect.objectContaining({ requestedByUserId: 'user_1', ownerId }),
    }));
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
    routeMocks.reserveProjectRenderJob.mockRejectedValue(new Error('database unavailable'));

    const response = await POST(renderRequest());

    expect(response.status).toBe(500);
    expect(routeMocks.reserveProjectRenderJob).toHaveBeenCalledTimes(1);
    expect(routeMocks.deduct).not.toHaveBeenCalled();
    expect(routeMocks.renderMediaOnLambda).not.toHaveBeenCalled();
    expect(routeMocks.refund).not.toHaveBeenCalled();
  });

  it('returns a normal billing rejection only for a definite credit-owner refusal', async () => {
    routeMocks.deduct.mockRejectedValueOnce(
      new routeMocks.CreditDeductionRejectedError('insufficient credits'),
    );

    const response = await POST(renderRequest());

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({
      type: 'error',
      message: 'Unable to deduct credits for render/export.',
    });
    expect(routeMocks.failProjectRenderJob).toHaveBeenCalledTimes(1);
    expect(routeMocks.quarantineProjectRenderBilling).not.toHaveBeenCalled();
    expect(routeMocks.refund).not.toHaveBeenCalled();
    expect(routeMocks.markProjectRenderDispatchAttempting).not.toHaveBeenCalled();
    expect(routeMocks.renderMediaOnLambda).not.toHaveBeenCalled();
  });

  it('durably quarantines an ambiguous credit exception without refund or dispatch', async () => {
    routeMocks.deduct.mockRejectedValueOnce(new Error('wallet response lost'));

    const response = await POST(renderRequest());
    const reservation = routeMocks.reserveProjectRenderJob.mock.calls[0]?.[0];

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      type: 'error',
      code: 'RENDER_BILLING_UNKNOWN',
      renderAdmissionId: reservation?.jobId,
      recoveryRequired: true,
    });
    expect(routeMocks.quarantineProjectRenderBilling).toHaveBeenCalledWith({
      authorization: expect.objectContaining({ jobId: reservation?.jobId }),
      attemptToken: expect.stringMatching(/^editron_attempt_v1_[a-f0-9]{64}$/),
      error: expect.any(Error),
    });
    expect(routeMocks.failProjectRenderJob).not.toHaveBeenCalled();
    expect(routeMocks.refund).not.toHaveBeenCalled();
    expect(routeMocks.markProjectRenderDispatchAttempting).not.toHaveBeenCalled();
    expect(routeMocks.renderMediaOnLambda).not.toHaveBeenCalled();
  });

  it('refunds after a returned attempt CAS rejection because no provider call occurred', async () => {
    routeMocks.markProjectRenderDispatchAttempting.mockResolvedValueOnce({
      ok: false,
      status: 'NON_CURRENT',
      code: 'PROJECT_ARTIFACT_NOT_CURRENT',
      reason: 'DISPATCH_NOT_READY',
    });

    const response = await POST(renderRequest());

    expect(response.status).toBe(500);
    expect(routeMocks.markProjectRenderDispatchAttempting).toHaveBeenCalledTimes(1);
    expect(routeMocks.renderMediaOnLambda).not.toHaveBeenCalled();
    expect(routeMocks.quarantineProjectRenderDispatch).not.toHaveBeenCalled();
    expect(routeMocks.failProjectRenderJob).toHaveBeenCalledTimes(1);
    expect(routeMocks.refund).toHaveBeenCalledTimes(1);
  });

  it('quarantines a thrown attempt CAS because its commit outcome is unknown', async () => {
    routeMocks.markProjectRenderDispatchAttempting.mockRejectedValueOnce(
      new Error('attempt response lost'),
    );

    const response = await POST(renderRequest());

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      code: 'RENDER_DISPATCH_UNKNOWN',
      recoveryRequired: true,
      renderAdmissionId: expect.any(String),
    });
    expect(routeMocks.quarantineProjectRenderDispatch).toHaveBeenCalledWith({
      authorization: expect.objectContaining({ jobId: expect.any(String) }),
      attemptToken: expect.stringMatching(/^editron_attempt_v1_[a-f0-9]{64}$/),
      attemptMarkerUncertain: true,
      error: expect.any(Error),
    });
    expect(routeMocks.quarantineProjectRenderBilling).not.toHaveBeenCalled();
    expect(routeMocks.refund).not.toHaveBeenCalled();
    expect(routeMocks.renderMediaOnLambda).not.toHaveBeenCalled();
  });

  it('quarantines a provider exception after the attempt boundary without refund', async () => {
    routeMocks.renderMediaOnLambda.mockRejectedValueOnce(new Error('provider timeout'));

    const response = await POST(renderRequest());

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      code: 'RENDER_DISPATCH_UNKNOWN',
      recoveryRequired: true,
      renderAdmissionId: expect.any(String),
    });
    expect(routeMocks.quarantineProjectRenderDispatch).toHaveBeenCalledWith({
      authorization: expect.objectContaining({ jobId: expect.any(String) }),
      attemptToken: expect.stringMatching(/^editron_attempt_v1_[a-f0-9]{64}$/),
      attemptMarkerUncertain: false,
      error: expect.any(Error),
    });
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

  it('binds signed project-render success through the exact current snapshot owner', async () => {
    const lookup = strictProjectRenderLookup('rendering', false);
    const claim = strictProjectRenderClaim();
    routeMocks.getProjectRenderJobAuthorizationByAdmission.mockResolvedValueOnce(lookup);
    routeMocks.getCurrentProjectRenderJob.mockResolvedValueOnce({
      ok: true,
      status: 'CURRENT',
      job: lookup.job,
    });
    routeMocks.claimProjectRenderJobFinalizationTransaction.mockResolvedValueOnce(claim);
    const payload = {
      type: 'success',
      renderId: 'render_provider_1',
      bucketName: 'bucket_1',
      outputFile: 'https://bucket.example.test/render.mp4',
      outputSizeInBytes: 44_583_988,
      customData: {
        editronRenderAdmissionId: 'rnd_admission_1',
        projectRenderBindingHash: 'b'.repeat(64),
        renderRegion: 'us-east-1',
      },
    };

    const response = await POST_RENDER_WEBHOOK(renderWebhookRequest(payload));

    expect(response.status).toBe(200);
    expect(routeMocks.getProjectRevision).toHaveBeenCalledWith('user_1', 'project_1');
    expect(routeMocks.getCurrentProjectRenderJob).toHaveBeenCalledWith({
      authorization: lookup.authorization,
      currentProjectRevision: projectRevision(),
    });
    expect(routeMocks.claimProjectRenderJobFinalizationTransaction).toHaveBeenCalledWith({
      authorization: lookup.authorization,
      providerRenderId: 'render_provider_1',
      bucketName: 'bucket_1',
      region: 'us-east-1',
      sourceOutputUrl: 'https://bucket.example.test/render.mp4',
      sourceOutputSize: 44_583_988,
    });
    expect(routeMocks.claimJobFinalization).not.toHaveBeenCalled();
    expect(routeMocks.publishJSON).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({
        jobId: 'rnd_admission_1',
        projectRenderAuthorization: lookup.authorization,
      }),
    }));
  });

  it('rejects missing, forged, and stale project-render webhook bindings without fallback', async () => {
    const lookup = strictProjectRenderLookup('rendering');
    routeMocks.getProjectRenderJobAuthorizationByAdmission.mockResolvedValueOnce(lookup);
    const missingHash = await POST_RENDER_WEBHOOK(renderWebhookRequest({
      type: 'timeout',
      renderId: 'render_provider_1',
      bucketName: 'bucket_1',
      customData: { editronRenderAdmissionId: 'rnd_admission_1' },
    }));
    expect(missingHash.status).toBe(400);
    expect(routeMocks.getCurrentProjectRenderJob).not.toHaveBeenCalled();

    routeMocks.getProjectRenderJobAuthorizationByAdmission.mockResolvedValueOnce(lookup);
    const missingRegion = await POST_RENDER_WEBHOOK(renderWebhookRequest({
      type: 'timeout',
      renderId: 'render_provider_1',
      bucketName: 'bucket_1',
      customData: {
        editronRenderAdmissionId: 'rnd_admission_1',
        projectRenderBindingHash: 'b'.repeat(64),
      },
    }));
    expect(missingRegion.status).toBe(400);
    expect(routeMocks.getCurrentProjectRenderJob).not.toHaveBeenCalled();

    routeMocks.getProjectRenderJobAuthorizationByAdmission.mockResolvedValueOnce({
      ok: false,
      status: 'NON_CURRENT',
      code: 'PROJECT_ARTIFACT_NOT_CURRENT',
      reason: 'JOB_NOT_CURRENT',
    });
    const forged = await POST_RENDER_WEBHOOK(renderWebhookRequest({
      type: 'timeout',
      renderId: 'render_provider_1',
      bucketName: 'bucket_1',
      customData: {
        editronRenderAdmissionId: 'rnd_admission_1',
        projectRenderBindingHash: 'f'.repeat(64),
        renderRegion: 'us-east-1',
      },
    }));
    expect(forged.status).toBe(409);

    routeMocks.getProjectRenderJobAuthorizationByAdmission.mockResolvedValueOnce(lookup);
    routeMocks.getCurrentProjectRenderJob.mockResolvedValueOnce({
      ok: false,
      status: 'NON_CURRENT',
      code: 'PROJECT_ARTIFACT_NOT_CURRENT',
      reason: 'PROJECT_REVISION_STALE',
    });
    const stale = await POST_RENDER_WEBHOOK(renderWebhookRequest({
      type: 'success',
      renderId: 'render_provider_1',
      bucketName: 'bucket_1',
      outputFile: 'https://bucket.example.test/render.mp4',
      customData: {
        editronRenderAdmissionId: 'rnd_admission_1',
        projectRenderBindingHash: 'b'.repeat(64),
        renderRegion: 'us-east-1',
      },
    }));
    expect(stale.status).toBe(409);
    expect(routeMocks.claimProjectRenderJobFinalizationTransaction).not.toHaveBeenCalled();
    expect(routeMocks.claimJobFinalization).not.toHaveBeenCalled();
    expect(routeMocks.reconcileProviderTerminalEvent).not.toHaveBeenCalled();
  });

  it('binds signed project-render provider failure without generic reconciliation', async () => {
    const lookup = strictProjectRenderLookup('rendering');
    routeMocks.getProjectRenderJobAuthorizationByAdmission.mockResolvedValueOnce(lookup);
    routeMocks.getCurrentProjectRenderJob.mockResolvedValueOnce({
      ok: true,
      status: 'CURRENT',
      job: lookup.job,
    });
    routeMocks.failProjectRenderJobFromProviderTransaction.mockResolvedValueOnce({
      ok: true,
      status: 'CURRENT',
    });

    const response = await POST_RENDER_WEBHOOK(renderWebhookRequest({
      type: 'timeout',
      renderId: 'render_provider_1',
      bucketName: 'bucket_1',
      customData: {
        editronRenderAdmissionId: 'rnd_admission_1',
        projectRenderBindingHash: 'b'.repeat(64),
        renderRegion: 'us-east-1',
      },
    }));

    expect(response.status).toBe(200);
    expect(routeMocks.failProjectRenderJobFromProviderTransaction).toHaveBeenCalledWith({
      authorization: lookup.authorization,
      providerRenderId: 'render_provider_1',
      bucketName: 'bucket_1',
      region: 'us-east-1',
      error: 'Remotion render timed out',
    });
    expect(routeMocks.reconcileProviderTerminalEvent).not.toHaveBeenCalled();
  });

  it('rejects conflicting duplicate output and artifact-bound fallback', async () => {
    const finalizingLookup = strictProjectRenderLookup('finalizing');
    routeMocks.getProjectRenderJobAuthorizationByAdmission.mockResolvedValueOnce(finalizingLookup);
    routeMocks.getCurrentProjectRenderJob.mockResolvedValueOnce({
      ok: true,
      status: 'CURRENT',
      job: finalizingLookup.job,
    });
    const conflictingReplay = await POST_RENDER_WEBHOOK(renderWebhookRequest({
      type: 'success',
      renderId: 'render_provider_1',
      bucketName: 'bucket_1',
      outputFile: 'https://bucket.example.test/different.mp4',
      outputSizeInBytes: 44_583_988,
      customData: {
        editronRenderAdmissionId: 'rnd_admission_1',
        projectRenderBindingHash: 'b'.repeat(64),
        renderRegion: 'us-east-1',
      },
    }));
    expect(conflictingReplay.status).toBe(409);
    expect(routeMocks.claimProjectRenderJobFinalizationTransaction).not.toHaveBeenCalled();

    const artifactBoundResult = {
      ok: false,
      status: 'NON_CURRENT',
      code: 'PROJECT_ARTIFACT_NOT_CURRENT',
      reason: 'JOB_NOT_CURRENT',
    };
    routeMocks.getProjectRenderJobAuthorizationByAdmission.mockResolvedValueOnce(
      artifactBoundResult,
    );
    const artifactWebhook = await POST_RENDER_WEBHOOK(renderWebhookRequest({
      type: 'timeout',
      renderId: 'render_provider_1',
      bucketName: 'bucket_1',
      customData: {
        editronRenderAdmissionId: 'rnd_admission_1',
        projectRenderBindingHash: 'b'.repeat(64),
        renderRegion: 'us-east-1',
      },
    }));
    expect(artifactWebhook.status).toBe(409);
    expect(routeMocks.reconcileProviderTerminalEvent).not.toHaveBeenCalled();

    routeMocks.getProjectRenderJobAuthorizationByAdmission.mockResolvedValueOnce(
      artifactBoundResult,
    );
    const artifactRetry = await POST_FINALIZATION_RETRY(
      retryFinalizationRequest('rnd_admission_1'),
    );
    expect(artifactRetry.status).toBe(404);
    expect(routeMocks.claimFailedJobFinalizationRetry).not.toHaveBeenCalled();
  });

  it('rejects a stale signed webhook inside the ProjectService transaction owner', async () => {
    const lookup = strictProjectRenderLookup('rendering');
    routeMocks.getProjectRenderJobAuthorizationByAdmission.mockResolvedValueOnce(lookup);
    routeMocks.getCurrentProjectRenderJob.mockResolvedValueOnce({
      ok: true,
      status: 'CURRENT',
      job: lookup.job,
    });
    routeMocks.failProjectRenderJobFromProviderTransaction.mockResolvedValueOnce({
      ok: false,
      status: 'NON_CURRENT',
      code: 'PROJECT_ARTIFACT_NOT_CURRENT',
      reason: 'PROJECT_REVISION_STALE',
    });

    const response = await POST_RENDER_WEBHOOK(renderWebhookRequest({
      type: 'timeout',
      renderId: 'render_provider_1',
      bucketName: 'bucket_1',
      customData: {
        editronRenderAdmissionId: 'rnd_admission_1',
        projectRenderBindingHash: 'b'.repeat(64),
        renderRegion: 'us-east-1',
      },
    }));

    expect(response.status).toBe(409);
    expect(routeMocks.getProjectRevision).toHaveBeenCalledTimes(1);
    expect(routeMocks.failProjectRenderJobFromProviderTransaction).toHaveBeenCalledOnce();
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
        projectRenderSnapshotBinding: { $exists: false },
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

  it('queues collaborator-authorized strict recovery with server-owned authorization', async () => {
    const lookup = strictProjectRenderLookup('error');
    const claim = strictProjectRenderClaim();
    routeMocks.auth.mockResolvedValueOnce({ userId: 'user_collaborator' });
    routeMocks.getProjectRenderJobAuthorizationByAdmission.mockResolvedValueOnce(lookup);
    routeMocks.getCurrentProjectRenderJob.mockResolvedValueOnce({
      ok: true,
      status: 'CURRENT',
      job: lookup.job,
    });
    routeMocks.claimFailedProjectRenderJobFinalizationRetryTransaction.mockResolvedValueOnce(claim);

    const response = await POST_FINALIZATION_RETRY(
      retryFinalizationRequest('rnd_admission_1'),
    );

    expect(response.status).toBe(202);
    expect(routeMocks.loadProjectForRenderSnapshot).toHaveBeenCalledWith(
      'user_collaborator',
      'project_1',
    );
    expect(routeMocks.claimFailedProjectRenderJobFinalizationRetryTransaction).toHaveBeenCalledWith({
      authorization: lookup.authorization,
    });
    expect(routeMocks.claimFailedJobFinalizationRetry).not.toHaveBeenCalled();
    expect(routeMocks.publishJSON).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({
        jobId: 'rnd_admission_1',
        projectRenderAuthorization: lookup.authorization,
      }),
    }));
  });

  it('restores strict recovery through the exact claim when queue publication fails', async () => {
    const lookup = strictProjectRenderLookup('error');
    const claim = strictProjectRenderClaim();
    routeMocks.getProjectRenderJobAuthorizationByAdmission.mockResolvedValueOnce(lookup);
    routeMocks.getCurrentProjectRenderJob.mockResolvedValueOnce({
      ok: true,
      status: 'CURRENT',
      job: lookup.job,
    });
    routeMocks.claimFailedProjectRenderJobFinalizationRetryTransaction.mockResolvedValueOnce(claim);
    routeMocks.publishJSON.mockRejectedValueOnce(new Error('QStash unavailable'));

    const failed = await POST_FINALIZATION_RETRY(
      retryFinalizationRequest('rnd_admission_1'),
    );

    expect(failed.status).toBe(503);
    expect(routeMocks.releaseFailedProjectRenderJobFinalizationRetryClaimTransaction).toHaveBeenCalledWith({
      authorization: claim.authorization,
      claimToken: claim.claimToken,
      error: expect.any(Error),
    });
    expect(routeMocks.releaseFailedJobFinalizationRetryClaim).not.toHaveBeenCalled();
  });

  it('rejects a stale strict retry inside the ProjectService transaction owner', async () => {
    const lookup = strictProjectRenderLookup('error');
    routeMocks.getProjectRenderJobAuthorizationByAdmission.mockResolvedValueOnce(lookup);
    routeMocks.getCurrentProjectRenderJob.mockResolvedValueOnce({
      ok: true,
      status: 'CURRENT',
      job: lookup.job,
    });
    routeMocks.claimFailedProjectRenderJobFinalizationRetryTransaction.mockResolvedValueOnce({
      ok: false,
      status: 'NON_CURRENT',
      code: 'PROJECT_ARTIFACT_NOT_CURRENT',
      reason: 'PROJECT_REVISION_STALE',
    });

    const stale = await POST_FINALIZATION_RETRY(
      retryFinalizationRequest('rnd_admission_1'),
    );

    expect(stale.status).toBe(409);
    expect(routeMocks.loadProjectForRenderSnapshot).toHaveBeenCalledTimes(1);
    expect(routeMocks.claimFailedProjectRenderJobFinalizationRetryTransaction).toHaveBeenCalledOnce();
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
        projectRenderSnapshotBinding: { $exists: false },
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

  it('reports recovery-required tracking without claiming a paid render failed', async () => {
    routeMocks.markProjectRenderJobStarted.mockRejectedValue(
      new Error('ambiguous database write'),
    );

    const response = await POST(renderRequest());

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      type: 'success',
      data: {
        renderId: 'render_1',
        trackingStatus: 'recovery_required',
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

    const response = await GET_ACTIVE_RENDERS(new Request(
      'http://localhost/api/services/editron/render/active',
    ));

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
    expect(routeMocks.checkCredits).toHaveBeenCalledTimes(1);
    expect(routeMocks.deduct).not.toHaveBeenCalled();
    expect(routeMocks.refund).not.toHaveBeenCalled();
    expect(routeMocks.shouldUseChapterRendering).toHaveBeenCalledWith(90, 30);
    expect(routeMocks.startChapterRender).not.toHaveBeenCalled();
    expect(routeMocks.renderMediaOnLambda).not.toHaveBeenCalled();
    expect(routeMocks.reserveJob).not.toHaveBeenCalled();
    expect(routeMocks.markJobStarted).not.toHaveBeenCalled();
    expect(routeMocks.createJob).not.toHaveBeenCalled();
  });

  it('CRITICAL: exact timestamp media without a render source stops before spend and dispatch', async () => {
    routeMocks.admitNativeMediaFinalRender.mockResolvedValueOnce({
      disposition: 'EXACT_SOURCES_REQUIRED',
      receipt: { receiptSha256: 'b'.repeat(64) },
      exactSourceRequests: [{
        overlayId: 'video_1',
        assetId: 'asset_video_1',
      }],
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

function projectRevision() {
  return {
    schemaVersion: 1 as const,
    value: 7,
    compatibilityUpdatedAt: '2026-08-29T00:00:00.000Z',
  };
}

function strictProjectRenderAuthorization() {
  return {
    schemaVersion: 1 as const,
    jobId: 'rnd_admission_1',
    ownerId: 'user_1',
    requestedByUserId: 'user_1',
    projectId: 'project_1',
    projectRevision: projectRevision(),
    bindingHash: 'b'.repeat(64),
  };
}

function strictProjectRenderBinding() {
  return {
    scope: 'PROJECT_SNAPSHOT' as const,
    artifactId: 'rnd_admission_1',
    ownerId: 'user_1',
    projectId: 'project_1',
    projectRevision: projectRevision(),
    bindingHash: 'b'.repeat(64),
  };
}

function strictProjectRenderLookup(
  status: 'rendering' | 'finalizing' | 'done' | 'error',
  withProviderIdentity = true,
) {
  const authorization = strictProjectRenderAuthorization();
  return {
    ok: true as const,
    status: 'BOUND' as const,
    authorization,
    job: {
      _id: authorization.jobId,
      userId: authorization.ownerId,
      requestedByUserId: authorization.requestedByUserId,
      projectId: authorization.projectId,
      status,
      ...(withProviderIdentity
        ? {
            providerRenderId: 'render_provider_1',
            bucketName: 'bucket_1',
            region: 'us-east-1',
          }
        : {}),
      ...(!withProviderIdentity ? { region: 'us-east-1' } : {}),
      ...(status === 'error'
        ? {
            finalization: {
              state: 'failed' as const,
              sourceOutputUrl: 'https://bucket.example.test/raw.mp4',
              sourceOutputSize: 44_583_988,
              attempts: 1,
            },
          }
        : status === 'finalizing'
          ? {
              finalization: {
                state: 'running' as const,
                sourceOutputUrl: 'https://bucket.example.test/raw.mp4',
                sourceOutputSize: 44_583_988,
                attempts: 1,
              },
            }
        : {}),
      projectRenderSnapshotBinding: strictProjectRenderBinding(),
    },
  };
}

function strictProjectRenderClaim() {
  return {
    ok: true as const,
    status: 'CURRENT' as const,
    jobId: 'rnd_admission_1',
    providerRenderId: 'render_provider_1',
    claimToken: 'rfl_strict_claim_1',
    sourceOutputUrl: 'https://bucket.example.test/raw.mp4',
    sourceOutputSize: 44_583_988,
    expectedDurationMs: 38_000,
    authorization: strictProjectRenderAuthorization(),
    binding: strictProjectRenderBinding(),
  };
}

function chapterChildFixture(
  phase: 'ATTEMPTING' | 'UNKNOWN' | 'BOUND',
  terminal: {
    status?: 'rendering' | 'completed' | 'failed';
    error?: string;
  } = {},
) {
  const parentAdmissionId = 'chr_123456789012';
  const childIndex = 0;
  const ownerId = 'chapter-child-owner';
  const projectId = 'chapter-child-project';
  const provider = {
    providerRenderId: 'child-render-1',
    bucketName: 'remotion-child-output',
    region: 'us-east-1',
  };
  const project = {
    overlays: [],
    durationInFrames: 120,
    fps: 30,
    playerDimensions: { width: 1920, height: 1080 },
  };
  const source = buildProjectRenderSourceSnapshotV1({
    project,
    inputProps: { renderMode: 'preview' },
  });
  const binding = createProjectRenderSnapshotBindingV1({
    artifactKind: 'RENDERED_PREVIEW',
    artifactId: parentAdmissionId,
    ownerId,
    projectId,
    projectRevision: projectRevision(),
    sequenceId: 'sequence-1',
    compositionId: 'composition-1',
    renderContract: { renderer: 'remotion-lambda', codec: 'h264' },
    durationInFrames: 120,
    fps: 30,
    width: 1920,
    height: 1080,
    projectRenderSource: source,
    containedVideoTargets: buildContainedVideoTargetsV1(project.overlays),
  });
  const identity = createChapterChildDispatchIdentityV1({
    parentAdmissionId,
    childIndex,
    bindingHash: binding.bindingHash,
  });
  const baseDispatch = createChapterChildDispatchV1({
    parentAdmissionId,
    childIndex,
    bindingHash: binding.bindingHash,
  });
  const attemptStartedAt = new Date('2026-09-01T00:00:01.000Z');
  const providerAcceptedAt = new Date('2026-09-01T00:00:02.000Z');
  const providerBoundAt = new Date('2026-09-01T00:00:03.000Z');
  const dispatch = phase === 'ATTEMPTING'
    ? { ...baseDispatch, phase, attemptStartedAt }
    : phase === 'UNKNOWN'
      ? {
          ...baseDispatch,
          phase,
          attemptStartedAt,
          providerAcceptedAt,
          unknownAt: new Date('2026-09-01T00:00:03.000Z'),
          unknownReason: 'provider response/write boundary was ambiguous',
          providerRenderId: provider.providerRenderId,
          providerBucketName: provider.bucketName,
          providerRegion: provider.region,
        }
      : {
          ...baseDispatch,
          phase,
          attemptStartedAt,
          providerAcceptedAt,
          providerBoundAt,
          providerRenderId: provider.providerRenderId,
          providerBucketName: provider.bucketName,
          providerRegion: provider.region,
        };
  const status = terminal.status ?? 'rendering';
  const chapter = {
    index: childIndex,
    status,
    ...(phase === 'ATTEMPTING' ? {} : {
      renderId: provider.providerRenderId,
      bucketName: provider.bucketName,
      region: provider.region,
    }),
    ...(status === 'failed' ? { error: terminal.error ?? 'Remotion chapter render timed out' } : {}),
    ...(status === 'completed' ? {
      outputUrl: 'https://bucket.example.test/render.mp4',
      outputSize: 44_583_988,
    } : {}),
    dispatch,
  };
  return {
    parentAdmissionId,
    childIndex,
    bindingHash: binding.bindingHash,
    attemptToken: identity.attemptToken,
    ...provider,
    binding,
    dispatch,
    job: {
      _id: parentAdmissionId,
      projectRenderSnapshotBinding: binding,
      chapters: [chapter],
    },
  };
}

function chapterWebhookPayload(
  fixture: ReturnType<typeof chapterChildFixture>,
  overrides: {
    type?: 'success' | 'timeout';
    renderId?: string;
    customData?: Record<string, unknown>;
    outputFile?: string;
    outputSizeInBytes?: number;
  } = {},
) {
  const customData = {
    editronChapterParentAdmissionId: fixture.parentAdmissionId,
    editronChapterIndex: String(fixture.childIndex),
    editronChapterAttemptToken: fixture.attemptToken,
    editronChapterBindingHash: fixture.bindingHash,
    editronChapterRegion: fixture.region,
    ...overrides.customData,
  };
  if (overrides.type === 'timeout') {
    return {
      type: 'timeout' as const,
      renderId: overrides.renderId ?? fixture.providerRenderId,
      bucketName: fixture.bucketName,
      customData,
    };
  }
  return {
    type: 'success' as const,
    renderId: overrides.renderId ?? fixture.providerRenderId,
    bucketName: fixture.bucketName,
    outputFile: overrides.outputFile ?? 'https://bucket.example.test/render.mp4',
    outputSizeInBytes: overrides.outputSizeInBytes ?? 44_583_988,
    customData,
  };
}

function chapterWebhookRequest(payload: unknown): Request {
  return new Request(
    'https://app.example.test/api/services/editron/cloudrun/render/chapter-webhook',
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
