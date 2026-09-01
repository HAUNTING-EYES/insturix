import { NextResponse } from 'next/server';
import { renderMediaOnLambda } from '@remotion/lambda/client';
import { auth } from '@clerk/nextjs/server';
import { nanoid } from 'nanoid';
import {
  abandonStaleProjectRenderJobAdmissionV1,
  calculateExpectedRenderDurationMs,
  createProjectRenderJobAuthorizationV1,
  createProjectRenderDispatchIdentityV1,
  failProjectRenderJobV1,
  markProjectRenderDispatchAttemptingV1,
  markProjectRenderJobStartedV1,
  quarantineProjectRenderBillingV1,
  quarantineProjectRenderDispatchV1,
  recordProjectRenderJobBillingV1,
  reserveProjectRenderJobV1,
  type ProjectRenderJobAuthorizationV1,
} from '@/lib/editron/services/render-job-service';
import {
  assetResolver,
  ProjectAssetSourceUnverifiableErrorV1,
} from '@/lib/editron/services/asset-resolver';
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
  buildContainedVideoTargetsV1,
  buildProjectRenderSourceSnapshotV1,
  createProjectRenderSnapshotBindingV1,
} from '@/lib/editron/services/project-render-snapshot-binding-v1';
import {
  sameProjectArtifactRevisionV1,
} from '@/lib/editron/services/project-artifact-invalidation-v1';
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
import {
  checkCredits,
  CreditDeductionRejectedError,
  type CreditCheckResult,
} from '@/lib/services/creditsMiddleware';
import { resolveBillingOwner } from '@/lib/editron/services/project-ownership';
import { isOrgWalletBillingEnabled } from '@/lib/services/org-wallet-flag';

export async function POST(request: Request) {
  let renderCreditCheck: CreditCheckResult | null = null;
  let creditsDeducted = false;
  let renderAdmissionId: string | null = null;
  let renderAuthorization: ProjectRenderJobAuthorizationV1 | null = null;
  let renderAttemptToken: string | null = null;
  let dispatchPhase: 'NOT_ATTEMPTED' | 'ATTEMPTING' | 'UNKNOWN' | 'BOUND' = 'NOT_ATTEMPTED';
  let dispatchTransitionInFlight = false;
  let billingLedgerUncertain = false;

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
    if (compositionId !== undefined && compositionId !== REMOTION_COMPOSITION_ID) {
      return NextResponse.json(
        {
          type: 'error',
          code: 'INVALID_RENDER_COMPOSITION',
          message: `compositionId must be ${REMOTION_COMPOSITION_ID}.`,
        },
        { status: 400 },
      );
    }
    const trustedInputProps = normalizeClientRenderInputProps(inputProps);

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
    if (
      remotionSiteFreshness.reason !== 'verified_env_bundle'
      && remotionSiteFreshness.reason !== 'verified_url_bundle'
    ) {
      console.error(`[Render] Verified renderer bundle is unavailable: ${remotionSiteFreshness.reason}`);
      return NextResponse.json(
        {
          type: 'error',
          code: 'RENDER_SITE_VERSION_UNVERIFIED',
          message: 'A verified Remotion renderer bundle is required for rendering.',
        },
        { status: 503 },
      );
    }
    const rendererBundleSha = remotionSiteFreshness.serveBundle
      ?? remotionSiteFreshness.expectedBundle;
    if (!rendererBundleSha) {
      return NextResponse.json(
        {
          type: 'error',
          code: 'RENDER_SITE_VERSION_UNVERIFIED',
          message: 'A verified Remotion renderer bundle is required for rendering.',
        },
        { status: 503 },
      );
    }

    // Read one access-authorized persisted project snapshot. Asset URLs stay
    // unresolved until after the binding source hash has been computed.
    const projectSnapshot = await projectService.loadProjectForRenderSnapshot(
      userId,
      canonicalProjectId,
    );
    if (!projectSnapshot) {
      return NextResponse.json(
        { type: 'error', message: 'Project not found' },
        { status: 404 }
      );
    }
    const { project, revision, ownerId } = projectSnapshot;
    if (project.projectId !== canonicalProjectId || ownerId !== project.userId) {
      throw new Error('PROJECT_RENDER_SNAPSHOT_SCOPE_MISMATCH');
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
    let resolvedProps = buildProjectRenderInputProps(project, trustedInputProps);
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

    const nativeMediaProjectRevision = readNativeMediaFinalRenderProjectRevisionV1(project);
    if (!sameProjectArtifactRevisionV1(nativeMediaProjectRevision, revision)) {
      return NextResponse.json(
        {
          type: 'error',
          code: 'PROJECT_RENDER_REVISION_STALE',
          message: 'The project changed before render admission could complete.',
        },
        { status: 409 },
      );
    }
    const nativeMediaAdmission = await admitNativeMediaFinalRenderUsingRuntimeV1({
      userId,
      projectId: canonicalProjectId,
      sequenceId: 'main',
      projectRevision: revision,
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

    const totalFrames = readPositiveInteger(
      resolvedProps.durationInFrames,
      'PROJECT_RENDER_DURATION_INVALID',
    );
    const renderFps = readPositiveNumber(resolvedProps.fps, 'PROJECT_RENDER_FPS_INVALID');
    const width = readPositiveInteger(resolvedProps.width, 'PROJECT_RENDER_WIDTH_INVALID');
    const height = readPositiveInteger(resolvedProps.height, 'PROJECT_RENDER_HEIGHT_INVALID');
    const { shouldUseChapterRendering, startChapterRender, detectChapterBoundaries } =
      await import('@/lib/editron/services/chapter-renderer');
    const usesChapterRendering = shouldUseChapterRendering(totalFrames, renderFps);
    const preHydrationRenderOverlays = [...renderOverlays];
    const chapterBoundaries = usesChapterRendering
      ? detectChapterBoundaries(preHydrationRenderOverlays as any[], totalFrames, renderFps)
      : null;
    const projectRenderSource = buildProjectRenderSourceSnapshotV1({
      project: {
        ...project,
        overlays: preHydrationRenderOverlays,
        durationInFrames: totalFrames,
        fps: renderFps,
        playerDimensions: { width, height },
      },
      inputProps: trustedInputProps,
    });
    const containedVideoTargets = buildContainedVideoTargetsV1(preHydrationRenderOverlays);
    const admissionId = `${usesChapterRendering ? 'chr' : 'rnd'}_${nanoid(12)}`;
    const renderContract = buildProjectRenderContract({
      usesChapterRendering,
      rendererBundleSha,
      deliveryPlan,
      chapterBoundaries,
    });
    const binding = createProjectRenderSnapshotBindingV1({
      artifactKind: 'RENDERED_PREVIEW',
      artifactId: admissionId,
      ownerId,
      projectId: canonicalProjectId,
      projectRevision: revision,
      sequenceId: 'main',
      compositionId: REMOTION_COMPOSITION_ID,
      renderContract,
      durationInFrames: totalFrames,
      fps: renderFps,
      width,
      height,
      projectRenderSource,
      containedVideoTargets,
    });
    renderAuthorization = createProjectRenderJobAuthorizationV1({
      jobId: admissionId,
      requestedByUserId: userId,
      ownerId,
      projectId: canonicalProjectId,
      projectRevision: revision,
      binding,
    });
    const deliveryManifest = buildRenderDeliveryManifest({
      plan: deliveryPlan,
      renderId: admissionId,
    });
    const dispatchIdentity = createProjectRenderDispatchIdentityV1({
      jobId: admissionId,
      bindingHash: binding.bindingHash,
    });
    renderAttemptToken = dispatchIdentity.attemptToken;
    const webhook = usesChapterRendering
      ? null
      : buildRemotionRenderWebhook(
          request,
          admissionId,
          region,
          binding.bindingHash,
          dispatchIdentity.attemptToken,
        );
    renderCreditCheck = await checkCredits(userId, 'editron', 'render_export', {
      durationMinutes: getBillableRenderMinutes(totalFrames, renderFps),
      requestType: getRenderExportRequestType(resolvedProps, usesChapterRendering),
      taskId: admissionId,
      idempotencyKey: dispatchIdentity.creditIdempotencyKey,
    }, billingWallet);
    if (!renderCreditCheck.allowed) {
      return renderCreditCheck.errorResponse!;
    }
    await reserveProjectRenderJobV1({
      jobId: admissionId,
      requestedByUserId: userId,
      ownerId,
      projectId: canonicalProjectId,
      currentProjectRevision: revision,
      region,
      expectedDurationMs: calculateExpectedRenderDurationMs(totalFrames, renderFps),
      deliveryManifest,
      binding,
      billingWallet,
    });
    renderAdmissionId = admissionId;

    // Resolve asset URLs only after the immutable source snapshot and durable
    // admission have been created. Uses CDN proxy URLs (default) which Lambda
    // was successfully using before. forceGCS is NOT used - many assets lack
    // gcsPath and would get empty URLs.
    if (renderOverlays.length > 0) {
      try {
        renderOverlays = await assetResolver.resolveProjectAssets(
          renderOverlays,
          { projectId: canonicalProjectId },
        );
        resolvedProps = { ...resolvedProps, overlays: renderOverlays };
      } catch (error) {
        console.error('[Render] Asset URL resolution failed:', error);
        throw new RenderAssetHydrationError(error);
      }
    }

    const lambdaRenderProps = buildLambdaRenderInputProps({ ...resolvedProps, isRendering: true });

    let creditTransactionId: string | null = null;
    try {
      const deduction = await renderCreditCheck.deduct();
      if (
        !deduction
        || typeof deduction.transactionId !== 'string'
        || deduction.transactionId.trim().length === 0
      ) {
        throw new Error('Credit owner returned no durable transaction ID');
      }
      creditTransactionId = deduction.transactionId.trim();
      creditsDeducted = true;
    } catch (error) {
      console.error('[Render] render/export credit deduction failed:', error);
      if (error instanceof CreditDeductionRejectedError) {
        if (renderAdmissionId && renderAuthorization) {
          await markRenderAdmissionFailed(
            renderAuthorization,
            'Render/export credit deduction was rejected before provider dispatch',
          );
        }
        return NextResponse.json(
          { type: 'error', message: 'Unable to deduct credits for render/export.' },
          { status: 402 },
        );
      }
      if (renderAdmissionId && renderAuthorization && renderAttemptToken) {
        await quarantineRenderBilling({
          authorization: renderAuthorization,
          attemptToken: renderAttemptToken,
          error,
        });
      }
      billingLedgerUncertain = true;
      return NextResponse.json(
        {
          type: 'error',
          code: 'RENDER_BILLING_UNKNOWN',
          message: 'Render billing could not be confirmed; recovery is required before retry.',
          renderAdmissionId,
          recoveryRequired: true,
        },
        { status: 202 },
      );
    }

    let billingResult: Awaited<ReturnType<typeof recordProjectRenderJobBillingV1>>;
    try {
      billingResult = await recordProjectRenderJobBillingV1({
        authorization: renderAuthorization!,
        currentProjectRevision: revision,
        billingWallet,
        creditTransactionId: creditTransactionId!,
      });
    } catch (error) {
      billingLedgerUncertain = true;
      throw error;
    }
    if (!billingResult.ok) {
      throw new Error(`Render billing admission rejected: ${billingResult.reason}`);
    }

    const currentProjectRevision = await projectService.getProjectRevision(
      ownerId,
      canonicalProjectId,
    );
    if (!sameProjectArtifactRevisionV1(currentProjectRevision, revision)) {
      if (renderAuthorization) {
        await markRenderAdmissionFailed(
          renderAuthorization,
          'Project changed after render admission and before provider dispatch',
        );
      }
      await refundRenderExportCredits(
        renderCreditCheck,
        'Project changed before render provider dispatch',
      );
      return NextResponse.json(
        {
          type: 'error',
          code: 'PROJECT_RENDER_REVISION_STALE',
          message: 'The project changed before render could start.',
        },
        { status: 409 },
      );
    }

    // Credentials are loaded only after the durable admission and credit
    // deduction, immediately before a provider dispatch.
    const { setAWSCredentials } = await import('@/lib/editron/utils/aws-credentials');
    await setAWSCredentials();

    // The attempt marker is the last durable boundary before invoking the
    // provider. A thrown CAS is intentionally left uncertain: it may have
    // committed before the response was lost, so the outer handler quarantines
    // the admission instead of refunding or retrying it.
    const dispatchRevision = await projectService.getProjectRevision(
      ownerId,
      canonicalProjectId,
    );
    if (!sameProjectArtifactRevisionV1(dispatchRevision, revision)) {
      throw new Error('Project changed after render admission and before provider dispatch');
    }
    dispatchTransitionInFlight = true;
    const attemptResult = await markProjectRenderDispatchAttemptingV1({
      authorization: renderAuthorization!,
      currentProjectRevision: dispatchRevision,
      attemptToken: renderAttemptToken!,
    });
    // A returned rejection proves the CAS did not advance the durable attempt
    // state. Only a thrown/lost response leaves the commit outcome ambiguous.
    dispatchTransitionInFlight = false;
    if (!attemptResult.ok) {
      throw new Error(`Render dispatch admission rejected: ${attemptResult.reason}`);
    }
    dispatchPhase = 'ATTEMPTING';

    if (usesChapterRendering) {
      const fps = renderFps;

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
        {
          region,
          authorization: renderAuthorization!,
          binding,
        },
      );

      let trackingStatus: 'durable' | 'recovery_required' = 'durable';
      try {
        const startedProjectRevision = await projectService.getProjectRevision(
          ownerId,
          canonicalProjectId,
        );
        const started = await markProjectRenderJobStartedV1({
          authorization: renderAuthorization!,
          currentProjectRevision: startedProjectRevision,
          providerRenderId: jobId,
          bucketName: 'chapter-render',
          region,
          deliveryManifest,
          attemptToken: renderAttemptToken!,
        });
        if (!started.ok) {
          trackingStatus = 'recovery_required';
          dispatchPhase = 'UNKNOWN';
          await quarantineRenderDispatch({
            authorization: renderAuthorization!,
            attemptToken: renderAttemptToken!,
            providerRenderId: jobId,
            bucketName: 'chapter-render',
            region,
            error: 'Chapter provider started but durable provider binding was rejected',
          });
          console.error('CRITICAL: chapter render started but admission binding failed:', started);
        } else {
          dispatchPhase = 'BOUND';
        }
      } catch (dbError) {
        trackingStatus = 'recovery_required';
        dispatchPhase = 'UNKNOWN';
        await quarantineRenderDispatch({
          authorization: renderAuthorization!,
          attemptToken: renderAttemptToken!,
          providerRenderId: jobId,
          bucketName: 'chapter-render',
          region,
          error: dbError,
        });
        console.error('CRITICAL: chapter render started but admission binding failed:', {
          renderAdmissionId,
          error: dbError,
        });
      }

      const mgInt = mgIntegrity as { degraded?: boolean } | null;
      const finalTracking = trackingStatus === 'recovery_required'
        ? 'recovery_required' as const
        : mgInt?.degraded === true
          ? 'degraded' as const
          : 'durable' as const;
      return NextResponse.json({
        type: 'success',
        data: {
          ...buildChapterRenderApiData({ jobId, region, chapters }),
          renderAdmissionId,
          deliveryManifest,
          trackingStatus: finalTracking,
          ...(mgIntegrity ? { mgIntegrity } : {}),
        },
      }, { status: finalTracking === 'recovery_required' ? 202 : 200 });
    }

    // Standard single-Lambda render (videos under 3 minutes)
    const { bucketName, renderId } = await renderMediaOnLambda({
      region,
      functionName,
      serveUrl,
      composition: REMOTION_COMPOSITION_ID,
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
        projectRenderBindingHash: renderAuthorization!.bindingHash,
        renderRegion: region,
        editronRenderAttemptToken: renderAttemptToken!,
      },
      webhook: webhook!,
    });

    let trackingStatus: 'durable' | 'recovery_required' = 'durable';
    try {
      const startedProjectRevision = await projectService.getProjectRevision(
        ownerId,
        canonicalProjectId,
      );
      const started = await markProjectRenderJobStartedV1({
        authorization: renderAuthorization!,
        currentProjectRevision: startedProjectRevision,
        providerRenderId: renderId,
        bucketName,
        region,
        deliveryManifest,
        attemptToken: renderAttemptToken!,
      });
      if (!started.ok) {
        trackingStatus = 'recovery_required';
        dispatchPhase = 'UNKNOWN';
        await quarantineRenderDispatch({
          authorization: renderAuthorization!,
          attemptToken: renderAttemptToken!,
          providerRenderId: renderId,
          bucketName,
          region,
          error: 'Provider started but durable provider binding was rejected',
        });
        console.error('CRITICAL: render started but provider binding failed:', started);
      } else {
        dispatchPhase = 'BOUND';
      }
    } catch (dbError) {
      trackingStatus = 'recovery_required';
      dispatchPhase = 'UNKNOWN';
      await quarantineRenderDispatch({
        authorization: renderAuthorization!,
        attemptToken: renderAttemptToken!,
        providerRenderId: renderId,
        bucketName,
        region,
        error: dbError,
      });
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
    const finalTracking = trackingStatus === 'recovery_required'
      ? 'recovery_required' as const
      : mgInt?.degraded === true
        ? 'degraded' as const
        : 'durable' as const;
    return NextResponse.json({
      type: 'success',
      data: {
        renderId,
        bucketName,
        region,
        functionName,
        deliveryManifest,
        renderAdmissionId,
        trackingStatus: finalTracking,
        ...(mgIntegrity ? { mgIntegrity } : {}),
        // Progress endpoint for polling
        progressUrl: `/api/services/editron/cloudrun/progress?renderId=${renderId}&bucketName=${bucketName}&region=${region}`,
      }
    }, { status: finalTracking === 'recovery_required' ? 202 : 200 });
  } catch (error: any) {
    const attemptBoundaryUncertain = dispatchTransitionInFlight || dispatchPhase !== 'NOT_ATTEMPTED';
    if (renderAdmissionId && renderAuthorization) {
      if (billingLedgerUncertain && renderAttemptToken) {
        await quarantineRenderBilling({
          authorization: renderAuthorization,
          attemptToken: renderAttemptToken,
          error,
        });
      } else if (attemptBoundaryUncertain && renderAttemptToken) {
        await quarantineRenderDispatch({
          authorization: renderAuthorization,
          attemptToken: renderAttemptToken,
          attemptMarkerUncertain: dispatchTransitionInFlight,
          error,
        });
      } else {
        await markRenderAdmissionFailed(
          renderAuthorization,
          error instanceof Error ? error.message : 'Render failed before provider dispatch',
        );
      }
    }
    if (renderCreditCheck && creditsDeducted && !attemptBoundaryUncertain && !billingLedgerUncertain) {
      await refundRenderExportCredits(renderCreditCheck, 'Render/export failed before render start');
    }
    console.error('Lambda render error:', error);
    const rightsError = (
      error instanceof UnlicensedAudioInRenderError
      || error instanceof RenderAudioRightsAuthorityError
    );
    const deliveryError = error instanceof RenderDeliveryContractError;
    const sourceError = error instanceof ProjectAssetSourceUnverifiableErrorV1;
    const hydrationError = error instanceof RenderAssetHydrationError;
    const inputPropsError = error instanceof RenderInputPropsError;
    const assetPreparationError = sourceError || hydrationError;
    const recoveryRequired = attemptBoundaryUncertain || billingLedgerUncertain;
    const recoveryCode = billingLedgerUncertain
      ? 'RENDER_BILLING_UNKNOWN'
      : attemptBoundaryUncertain
        ? 'RENDER_DISPATCH_UNKNOWN'
        : null;
    const responseMessage = billingLedgerUncertain
      ? 'Render billing could not be confirmed; recovery is required before retry.'
      : attemptBoundaryUncertain
        ? 'Render provider dispatch could not be confirmed; recovery is required before retry.'
        : error.message || 'Failed to trigger render';
    return NextResponse.json(
      {
        type: 'error',
        message: responseMessage,
        ...((rightsError || deliveryError || assetPreparationError || inputPropsError)
          ? { code: error.code }
          : {}),
        ...(recoveryCode ? { code: recoveryCode } : {}),
        ...(error instanceof RenderAudioRightsAuthorityError
          ? { details: error.diagnostic }
          : assetPreparationError && error.diagnostic
            ? { details: error.diagnostic }
            : {}),
        ...(recoveryRequired
          ? { recoveryRequired: true, renderAdmissionId }
          : {}),
      },
      {
        status: recoveryRequired
          ? 202
          : rightsError
          ? 422
          : deliveryError
            ? 400
          : sourceError
              ? 409
              : hydrationError
              ? error.status
              : inputPropsError
                ? error.status
              : 500,
      }
    );
  }
}

class RenderAssetHydrationError extends Error {
  readonly code: 'RENDER_ASSET_HYDRATION_FAILED' | 'PROJECT_VIDEO_SOURCE_UNVERIFIABLE';
  readonly diagnostic: ProjectAssetSourceUnverifiableErrorV1['diagnostic'] | null;
  readonly status: 409 | 500;

  constructor(cause: unknown) {
    const sourceError = cause instanceof ProjectAssetSourceUnverifiableErrorV1
      ? cause
      : null;
    super(sourceError?.message ?? 'Unable to prepare all project assets for rendering.');
    this.name = 'RenderAssetHydrationError';
    this.code = sourceError?.code ?? 'RENDER_ASSET_HYDRATION_FAILED';
    this.diagnostic = sourceError?.diagnostic ?? null;
    this.status = sourceError ? 409 : 500;
  }
}

class RenderInputPropsError extends Error {
  readonly code = 'INVALID_RENDER_INPUT_PROPS';
  readonly status = 400 as const;

  constructor(message: string) {
    super(message);
    this.name = 'RenderInputPropsError';
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

async function quarantineRenderBilling(input: {
  authorization: ProjectRenderJobAuthorizationV1;
  attemptToken: string;
  error: unknown;
}): Promise<void> {
  try {
    const result = await quarantineProjectRenderBillingV1(input);
    if (!result.ok) {
      console.error('[Render] failed to durably quarantine uncertain billing:', result);
    }
  } catch (quarantineError) {
    console.error('[Render] billing quarantine write failed:', {
      renderAdmissionId: input.authorization.jobId,
      error: quarantineError,
    });
  }
}

async function quarantineRenderDispatch(input: {
  authorization: ProjectRenderJobAuthorizationV1;
  attemptToken: string;
  error: unknown;
  providerRenderId?: string;
  bucketName?: string;
  region?: string;
  attemptMarkerUncertain?: boolean;
}): Promise<void> {
  try {
    const result = await quarantineProjectRenderDispatchV1(input);
    if (!result.ok) {
      console.error('[Render] failed to durably quarantine an uncertain provider dispatch:', result);
    }
  } catch (quarantineError) {
    console.error('[Render] provider dispatch quarantine write failed:', {
      renderAdmissionId: input.authorization.jobId,
      error: quarantineError,
    });
  }
}

async function markRenderAdmissionFailed(
  authorization: ProjectRenderJobAuthorizationV1,
  reason: string,
): Promise<void> {
  try {
    const currentProjectRevision = await projectService.getProjectRevision(
      authorization.ownerId,
      authorization.projectId,
    );
    if (!sameProjectArtifactRevisionV1(
      currentProjectRevision,
      authorization.projectRevision,
    )) {
      const abandoned = await abandonStaleProjectRenderJobAdmissionV1({
        authorization,
        currentProjectRevision,
        error: reason,
      });
      if (!abandoned.ok) {
        console.error('[Render] failed to close stale pre-dispatch admission:', abandoned);
      }
      return;
    }
    const result = await failProjectRenderJobV1({
      authorization,
      currentProjectRevision,
      error: reason,
    });
    if (!result.ok) {
      console.error('[Render] failed to mark render admission as current failure:', result);
    }
  } catch (error) {
    console.error('[Render] failed to mark render admission as failed:', error);
  }
}

function normalizeClientRenderInputProps(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) {
    return { src: '', isRendering: true };
  }
  const props = asRecord(value);
  if (!props) {
    throw new RenderInputPropsError('inputProps must be a JSON object.');
  }
  const allowedKeys = new Set([
    'overlays',
    'durationInFrames',
    'width',
    'height',
    'fps',
    'src',
  ]);
  const unknownKey = Object.keys(props).find((key) => !allowedKeys.has(key));
  if (unknownKey) {
    throw new RenderInputPropsError(`inputProps.${unknownKey} is not accepted.`);
  }
  if (
    props.overlays !== undefined
    && (!Array.isArray(props.overlays) || props.overlays.length > 0)
  ) {
    throw new RenderInputPropsError('inputProps.overlays must be empty; persisted project overlays are authoritative.');
  }
  if (
    props.src !== undefined
    && props.src !== null
    && (typeof props.src !== 'string' || props.src.trim().length > 0)
  ) {
    throw new RenderInputPropsError('inputProps.src is not accepted; the render source is server-owned.');
  }
  return {
    overlays: [],
    src: '',
    isRendering: true,
  };
}

function readPositiveInteger(value: unknown, code: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(code);
  }
  return value;
}

function readPositiveNumber(value: unknown, code: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(code);
  }
  return value;
}

function buildProjectRenderContract(input: {
  usesChapterRendering: boolean;
  rendererBundleSha: string;
  deliveryPlan: ReturnType<typeof resolveRenderDeliveryPlan>;
  chapterBoundaries: readonly { startFrame: number; endFrame: number }[] | null;
}): Record<string, unknown> {
  if (input.usesChapterRendering && !input.chapterBoundaries) {
    throw new Error('PROJECT_RENDER_CHAPTER_POLICY_INVALID');
  }
  return {
    schemaVersion: 1,
    routeMode: input.usesChapterRendering ? 'chapter' : 'standard',
    compositionId: REMOTION_COMPOSITION_ID,
    codec: 'h264',
    audioCodec: REMOTION_AUDIO_CODEC,
    framesPerLambda: REMOTION_FRAMES_PER_LAMBDA,
    privacy: 'public',
    timeoutInMilliseconds: 600000,
    rendererBundleSha: input.rendererBundleSha,
    renderInput: {
      isRendering: true,
      src: '',
    },
    delivery: {
      manifestVersion: 'editron-render-delivery-manifest-v1',
      mode: input.deliveryPlan.mode,
      primaryArtifactKind: input.deliveryPlan.mode === 'platform-native'
        ? 'clean-master'
        : 'mixed-master',
      music: input.deliveryPlan.music,
    },
    chapterPolicy: input.chapterBoundaries === null
      ? null
      : { boundaries: input.chapterBoundaries },
  };
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

function buildRemotionRenderWebhook(
  request: Request,
  admissionId: string,
  region: string,
  bindingHash: string,
  attemptToken: string,
) {
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
      renderRegion: region,
      projectRenderBindingHash: bindingHash,
      editronRenderAttemptToken: attemptToken,
    },
  };
}
