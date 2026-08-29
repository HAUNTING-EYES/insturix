import { NextResponse } from 'next/server';
import { renderMediaOnLambda } from '@remotion/lambda/client';
import { auth } from '@clerk/nextjs/server';
import { nanoid } from 'nanoid';
import {
  calculateExpectedRenderDurationMs,
  failJob,
  markJobStarted,
  reserveJob,
} from '@/lib/editron/services/render-job-service';
import { assetResolver } from '@/lib/editron/services/asset-resolver';
import { projectService } from '@/lib/editron/services/project-service';
import {
  RenderAudioRightsAuthorityError,
  verifyRenderAudioRightsAuthority,
} from '@/lib/editron/services/render-audio-rights-authority';
import {
  buildChapterRenderApiData,
  buildLambdaRenderInputProps,
  buildProjectRenderInputProps,
  resolveRenderableAudioInputProps,
  UnlicensedAudioInRenderError,
} from '@/lib/editron/shared/render-request-payload';
import {
  REMOTION_AUDIO_CODEC,
  REMOTION_COMPOSITION_ID,
  REMOTION_FRAMES_PER_LAMBDA,
} from '@/lib/editron/services/remotion-constants';
import { assertRemotionSiteFresh } from '@/lib/editron/services/remotion-site-version';
import {
  buildRenderDeliveryManifest,
  RenderDeliveryContractError,
  resolveRenderDeliveryPlan,
} from '@/lib/editron/services/render-delivery-manifest';
import { resolveRenderFinalizationPipelineConfig } from '@/lib/editron/services/render-finalization-dispatch';
import {
  admitNativeMediaFinalRenderUsingRuntimeV1,
  readNativeMediaFinalRenderProjectRevisionV1,
} from '@/lib/editron/services/native-media-final-render-admission-v1';
import { checkCredits, type CreditCheckResult } from '@/lib/services/creditsMiddleware';
import { resolveBillingOwner } from '@/lib/editron/services/project-ownership';
import { isOrgWalletBillingEnabled } from '@/lib/services/org-wallet-flag';

export async function POST(request: Request) {
  let renderCreditCheck: CreditCheckResult | null = null;
  let creditsDeducted = false;
  let renderStarted = false;
  let renderAdmissionId: string | null = null;
  let renderDeliveryManifest: ReturnType<typeof buildRenderDeliveryManifest> | null = null;
  let standardWebhook: ReturnType<typeof buildRemotionRenderWebhook> | null = null;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { type: 'error', message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { inputProps, compositionId, projectId, musicDeliveryMode } = body;
    if (typeof projectId !== 'string' || !projectId.trim()) {
      return NextResponse.json(
        { type: 'error', message: 'A persisted projectId is required for rendering' },
        { status: 400 },
      );
    }
    const canonicalProjectId = projectId.trim();

    // AWS Lambda configuration from environment
    const functionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME;
    const serveUrl = process.env.REMOTION_LAMBDA_SERVE_URL;
    const region = (process.env.REMOTION_AWS_REGION || 'us-east-1') as 
      'us-east-1' | 'us-east-2' | 'us-west-1' | 'us-west-2' | 
      'eu-central-1' | 'eu-west-1' | 'eu-west-2' | 'ap-south-1' | 
      'ap-southeast-1' | 'ap-southeast-2' | 'ap-northeast-1';

    if (!functionName) {
      throw new Error('REMOTION_LAMBDA_FUNCTION_NAME is not defined');
    }
    if (!serveUrl) {
      throw new Error('REMOTION_LAMBDA_SERVE_URL is not defined');
    }
    const finalizationConfig = resolveRenderFinalizationPipelineConfig();
    if (!finalizationConfig.configured) {
      console.error(`[Render] Verified finalization is unavailable: ${finalizationConfig.reason}`);
      return NextResponse.json(
        {
          type: 'error',
          code: 'RENDER_FINALIZATION_UNAVAILABLE',
          message: 'Verified render finalization is temporarily unavailable.',
        },
        { status: 503 },
      );
    }
    const remotionSiteFreshness = assertRemotionSiteFresh({ serveUrl, env: process.env });
    if (remotionSiteFreshness.reason === 'unverified_no_app_commit') {
      console.warn('[Render] Remotion site version could not be verified because app commit metadata is missing');
    }

    // Phase D W5: Use STS AssumeRole for short-lived credentials
    // Falls back to env var credentials if STS fails (backward compat)
    const { setAWSCredentials } = await import('@/lib/editron/utils/aws-credentials');
    await setAWSCredentials();

    // Resolve asset URLs before sending to Lambda - ensure all overlays have valid URLs.
    // Uses CDN proxy URLs (default) which Lambda was successfully using before.
    // forceGCS is NOT used - many assets lack gcsPath and would get empty URLs.
    const project = await projectService.loadProject(userId, canonicalProjectId);
    if (!project) {
      return NextResponse.json(
        { type: 'error', message: 'Project not found' },
        { status: 404 }
      );
    }
    // Route the render/export charge to the org wallet when this project is org-owned AND the flag
    // is on (P2). resolveBillingOwner reads the project's persisted ownership only — flag off, or a
    // personal/grandfathered project, bills the member's personal wallet exactly as before. Deduct
    // and the refund-on-early-fail below both use this same wallet.
    const billingWallet = resolveBillingOwner(userId, project, isOrgWalletBillingEnabled());
    // MG delivery integrity preflight (brief §16, Fix-4): an expected-but-undelivered codegen MG must NEVER silently
    // vanish. This surfaces missingMGs; it NEVER inserts a plain card / deterministic replacement (non-negotiable
    // §3.2/§3.3). strict → block; preview / degraded_allowed → proceed with the warning surfaced in `mgIntegrity`.
    let mgIntegrity: unknown = null;
    try {
      const { computeMGRenderPreflight, renderIntegrityPolicy } = await import('@/lib/editron/motion-graphics/codegen/mg-delivery');
      const mgPreflight = computeMGRenderPreflight(project as never, { policy: renderIntegrityPolicy() });
      mgIntegrity = {
        missingMGs: mgPreflight.missingMGs,
        policy: mgPreflight.policy,
        degraded: mgPreflight.degraded,
        computedAt: mgPreflight.lastPreflightAt,
      };
      if (mgPreflight.missingMGs.length > 0) {
        console.warn(
          `[Render] MG preflight: ${mgPreflight.missingMGs.length} expected MG(s) undelivered (${mgPreflight.missingMGs.map((m: { jobId?: string }) => m.jobId).join(',')}); policy=${mgPreflight.policy}; NO replacement inserted.`,
        );
        if (mgPreflight.policy === 'strict') {
          return NextResponse.json(
            {
              type: 'error',
              code: 'MG_RENDER_INTEGRITY',
              message: 'render blocked (strict): expected motion graphics not delivered before render',
              missingMGs: mgPreflight.missingMGs,
            },
            { status: 409 },
          );
        }
      }
    } catch (preflightErr) {
      console.warn('[Render] MG preflight unavailable (non-blocking):', preflightErr instanceof Error ? preflightErr.message : preflightErr);
    }
    let resolvedProps = buildProjectRenderInputProps(project, inputProps || {});
    const deliveryPlan = resolveRenderDeliveryPlan({
      requestedMode: musicDeliveryMode,
      overlays: resolvedProps.overlays,
      fps: resolvedProps.fps,
      durationInFrames: resolvedProps.durationInFrames,
      destinationPlatform: readProjectDestinationPlatform(project),
    });
    // The delivery plan owns the artifact contents. Reference-only music stays
    // in its handoff receipt but is not export audio and must not be authorized
    // as though Lambda will render it.
    await verifyRenderAudioRightsAuthority({
      userId,
      projectId: canonicalProjectId,
      projectOwnerId: project.userId,
      overlays: deliveryPlan.overlays,
    });

    resolvedProps = resolveRenderableAudioInputProps({
      ...resolvedProps,
      overlays: deliveryPlan.overlays,
    });
    let renderOverlays = Array.isArray(resolvedProps.overlays)
      ? resolvedProps.overlays as any[]
      : [];

    const nativeMediaAdmission = await admitNativeMediaFinalRenderUsingRuntimeV1({
      userId,
      projectId: canonicalProjectId,
      sequenceId: 'main',
      projectRevision: readNativeMediaFinalRenderProjectRevisionV1(project),
      overlays: renderOverlays,
    });
    if (nativeMediaAdmission.disposition === 'UNVERIFIABLE') {
      return NextResponse.json(
        {
          type: 'error',
          code: 'NATIVE_MEDIA_FINAL_RENDER_NOT_READY',
          message: 'This project contains video that is not ready for an exact final render.',
          details: {
            reason: nativeMediaAdmission.reason,
            overlayId: nativeMediaAdmission.overlayId,
            assetId: nativeMediaAdmission.assetId,
            diagnostic: nativeMediaAdmission.diagnostic,
          },
        },
        { status: 409 },
      );
    }
    if (nativeMediaAdmission.disposition === 'EXACT_SOURCES_REQUIRED') {
      const first = nativeMediaAdmission.exactSourceRequests[0]!;
      return NextResponse.json(
        {
          type: 'error',
          code: 'NATIVE_MEDIA_FINAL_RENDER_NOT_READY',
          message: 'This project contains video that is not ready for an exact final render.',
          details: {
            reason: 'EXACT_TIMESTAMP_RENDER_SOURCE_REQUIRED',
            overlayId: first.overlayId,
            assetId: first.assetId,
            diagnostic: null,
          },
        },
        { status: 409 },
      );
    }

    if (renderOverlays.length > 0) {
      try {
        renderOverlays = await assetResolver.resolveProjectAssets(renderOverlays);
        resolvedProps = { ...resolvedProps, overlays: renderOverlays };
      } catch (error) {
        console.error('[Render] Asset URL resolution failed:', error);
        throw new RenderAssetHydrationError();
      }
    }

    // Phase D W6: Auto-detect long videos and use chapter-based rendering
    const totalFrames = Math.max(Number(resolvedProps.durationInFrames) || 0, 0);
    const renderFps = Math.max(Number(resolvedProps.fps) || 30, 1);
    const { shouldUseChapterRendering, startChapterRender } = await import('@/lib/editron/services/chapter-renderer');
    const usesChapterRendering = shouldUseChapterRendering(totalFrames, renderFps);
    const lambdaRenderProps = buildLambdaRenderInputProps({ ...resolvedProps, isRendering: true });

    renderCreditCheck = await checkCredits(userId, 'editron', 'render_export', {
      durationMinutes: getBillableRenderMinutes(totalFrames, renderFps),
      requestType: getRenderExportRequestType(resolvedProps, usesChapterRendering),
    }, billingWallet);
    if (!renderCreditCheck.allowed) {
      return renderCreditCheck.errorResponse!;
    }

    const admissionId = `${usesChapterRendering ? 'chr' : 'rnd'}_${nanoid(12)}`;
    const deliveryManifest = buildRenderDeliveryManifest({
      plan: deliveryPlan,
      renderId: admissionId,
    });
    const webhook = usesChapterRendering
      ? null
      : buildRemotionRenderWebhook(request, admissionId);
    await reserveJob(
      admissionId,
      userId,
      canonicalProjectId,
      region,
      calculateExpectedRenderDurationMs(totalFrames, renderFps),
      deliveryManifest,
    );
    renderAdmissionId = admissionId;
    renderDeliveryManifest = deliveryManifest;
    standardWebhook = webhook;

    try {
      await renderCreditCheck.deduct();
      creditsDeducted = true;
    } catch (error) {
      console.error('[Render] render/export credit deduction failed:', error);
      if (renderAdmissionId) {
        await markRenderAdmissionFailed(
          renderAdmissionId,
          'Render/export credit deduction failed before provider dispatch',
        );
      }
      return NextResponse.json(
        { type: 'error', message: 'Unable to deduct credits for render/export.' },
        { status: 402 },
      );
    }

    if (usesChapterRendering) {
      const fps = renderFps;
      const width = Number(resolvedProps.width) || 1920;
      const height = Number(resolvedProps.height) || 1080;

      const { jobId, chapters } = await startChapterRender(
        renderAdmissionId!,
        canonicalProjectId,
        userId,
        (lambdaRenderProps.overlays || []) as any[],
        totalFrames,
        fps,
        width,
        height,
        serveUrl,
        functionName,
      );
      renderStarted = true;

      let trackingStatus: 'durable' | 'degraded' = 'durable';
      try {
        await markJobStarted(
          renderAdmissionId!,
          userId,
          jobId,
          'chapter-render',
          region,
          renderDeliveryManifest!,
        );
      } catch (dbError) {
        trackingStatus = 'degraded';
        console.error('CRITICAL: chapter render started but admission binding failed:', {
          renderAdmissionId,
          error: dbError,
        });
      }

      const mgInt = mgIntegrity as { degraded?: boolean } | null;
      const finalTracking: 'durable' | 'degraded' = mgInt?.degraded === true ? 'degraded' : trackingStatus;
      return NextResponse.json({
        type: 'success',
        data: {
          ...buildChapterRenderApiData({ jobId, region, chapters }),
          renderAdmissionId,
          deliveryManifest: renderDeliveryManifest!,
          trackingStatus: finalTracking,
          ...(mgIntegrity ? { mgIntegrity } : {}),
        },
      });
    }

    // Standard single-Lambda render (videos under 3 minutes)
    const { bucketName, renderId } = await renderMediaOnLambda({
      region,
      functionName,
      serveUrl,
      composition: compositionId || REMOTION_COMPOSITION_ID,
      // isRendering=true → composition uses OffthreadVideo (ffmpeg) not Html5Video; without it a
      // large/slow-proxied clip hangs delayRender on the browser <video> element → 598s render timeout.
      inputProps: lambdaRenderProps,
      codec: 'h264',
      audioCodec: REMOTION_AUDIO_CODEC,
      privacy: 'public', // Make the video publicly accessible
      // Distributed rendering settings — chunk size centralized in remotion-constants.
      framesPerLambda: REMOTION_FRAMES_PER_LAMBDA,
      timeoutInMilliseconds: 600000, // 10 minutes - AI videos need longer download time
      metadata: {
        editronRenderAdmissionId: renderAdmissionId!,
      },
      webhook: standardWebhook!,
    });

    renderStarted = true;
    let trackingStatus: 'durable' | 'degraded' = 'durable';
    try {
      await markJobStarted(
        renderAdmissionId!,
        userId,
        renderId,
        bucketName,
        region,
        renderDeliveryManifest!,
      );
    } catch (dbError) {
      trackingStatus = 'degraded';
      console.error('CRITICAL: render started but provider binding failed:', {
        renderAdmissionId,
        renderId,
        error: dbError,
      });
    }

    // Threshold calibration: process decision outcomes (async, non-blocking)
    // Filter to editing overlays only - exclude video clips and audio tracks
    // which would corrupt bandit feedback via type-blind proximity matching.
    if (renderOverlays.length > 0) {
      const editingOverlays = renderOverlays.filter(
        (o: any) => o.type !== 'video' && o.type !== 'sound',
      );
      if (editingOverlays.length > 0) {
        import('@/lib/editron/services/threshold-bandit')
          .then(({ processDecisionOutcomes }) =>
            processDecisionOutcomes(canonicalProjectId, userId, editingOverlays))
          .catch((err: any) =>
            console.warn(`[Render] Decision outcome processing failed: ${err.message}`));
      }
    }

    // Brand Intelligence: transition to rendering
    try {
      const { transitionProjectStatus } = await import('@/lib/shared/project-status');
      await transitionProjectStatus(canonicalProjectId, userId, 'rendering', 'render_started');
    } catch (brandErr: any) {
      console.warn(`[Render] Status transition failed: ${brandErr.message}`);
    }

    // Return the render ID and bucket info
    const mgInt = mgIntegrity as { degraded?: boolean } | null;
    const finalTracking: 'durable' | 'degraded' = mgInt?.degraded === true ? 'degraded' : trackingStatus;
    return NextResponse.json({
      type: 'success',
      data: {
        renderId,
        bucketName,
        region,
        functionName,
        deliveryManifest: renderDeliveryManifest!,
        renderAdmissionId,
        trackingStatus: finalTracking,
        ...(mgIntegrity ? { mgIntegrity } : {}),
        // Progress endpoint for polling
        progressUrl: `/api/services/editron/cloudrun/progress?renderId=${renderId}&bucketName=${bucketName}&region=${region}`,
      }
    });
  } catch (error: any) {
    if (renderAdmissionId && !renderStarted) {
      await markRenderAdmissionFailed(
        renderAdmissionId,
        error instanceof Error ? error.message : 'Render failed before provider dispatch',
      );
    }
    if (renderCreditCheck && creditsDeducted && !renderStarted) {
      await refundRenderExportCredits(renderCreditCheck, 'Render/export failed before render start');
    }
    console.error('Lambda render error:', error);
    const rightsError = (
      error instanceof UnlicensedAudioInRenderError
      || error instanceof RenderAudioRightsAuthorityError
    );
    const deliveryError = error instanceof RenderDeliveryContractError;
    const hydrationError = error instanceof RenderAssetHydrationError;
    return NextResponse.json(
      {
        type: 'error',
        message: error.message || 'Failed to trigger render',
        ...((rightsError || deliveryError || hydrationError) ? { code: error.code } : {}),
        ...(error instanceof RenderAudioRightsAuthorityError
          ? { details: error.diagnostic }
          : {}),
      },
      { status: rightsError ? 422 : deliveryError ? 400 : 500 }
    );
  }
}

class RenderAssetHydrationError extends Error {
  readonly code = 'RENDER_ASSET_HYDRATION_FAILED';

  constructor() {
    super('Unable to prepare all project assets for rendering.');
    this.name = 'RenderAssetHydrationError';
  }
}

type RenderExportRequestType = 'standard' | 'chapter' | 'uhd';

function getBillableRenderMinutes(totalFrames: number, fps: number): number {
  const outputMinutes = totalFrames > 0 && fps > 0 ? totalFrames / fps / 60 : 1;
  return Math.max(1, Math.ceil(outputMinutes * 100) / 100);
}

function getRenderExportRequestType(
  inputProps: Record<string, any>,
  usesChapterRendering: boolean,
): RenderExportRequestType {
  const width = Number(inputProps.width) || 1920;
  const height = Number(inputProps.height) || 1080;
  const isUhd = width >= 3840 || height >= 2160 || width * height >= 3840 * 2160;
  if (isUhd) return 'uhd';
  return usesChapterRendering ? 'chapter' : 'standard';
}

async function refundRenderExportCredits(creditCheck: CreditCheckResult, reason: string): Promise<void> {
  try {
    await creditCheck.refund(reason);
  } catch (error) {
    console.error('[Render] render/export credit refund failed:', error);
  }
}

async function markRenderAdmissionFailed(jobId: string, reason: string): Promise<void> {
  try {
    await failJob(jobId, reason);
  } catch (error) {
    console.error('[Render] failed to mark render admission as failed:', error);
  }
}

function readProjectDestinationPlatform(project: unknown): unknown {
  const record = asRecord(project);
  const productionBrief = asRecord(record?.productionBrief);
  const productionBriefOutput = asRecord(productionBrief?.output);
  const intake = asRecord(record?.productionBriefIntake);
  const intakeOutput = asRecord(intake?.output);
  return productionBriefOutput?.platform ?? intakeOutput?.platform ?? record?.platform;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function buildRemotionRenderWebhook(request: Request, admissionId: string) {
  const secret = process.env.REMOTION_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error('REMOTION_WEBHOOK_SECRET is required for durable rendering');
  }
  const webhookUrl = new URL(
    '/api/services/editron/cloudrun/render/webhook',
    request.url,
  );
  if (webhookUrl.protocol !== 'https:' && webhookUrl.hostname !== 'localhost') {
    throw new Error('Remotion render webhook must use HTTPS');
  }
  return {
    url: webhookUrl.toString(),
    secret,
    customData: {
      editronRenderAdmissionId: admissionId,
    },
  };
}
