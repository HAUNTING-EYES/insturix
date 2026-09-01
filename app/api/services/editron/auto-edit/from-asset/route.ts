/**
 * POST /api/services/editron/auto-edit/from-asset
 *
 * Mode 2: User uploads footage → AI edits it.
 * Accepts an existing media_assets assetId (already uploaded via Asset Library).
 * Creates an Editron project, adds the video as a single overlay, auto-detects
 * the best edit profile, and runs the Director Agent.
 *
 * The Director's 5-Track analysis runs on the REAL video (not storyboard metadata)
 * because isAIProject = false (no sourceStoryboardId). This produces accurate
 * motion, subject, composition, and speech data for the intelligence layer.
 *
 * Cost: ~$0.05-0.15 (Gemini 5-Track + Deepgram transcription). No video generation.
 *
 * Future upgrade: Add video-understanding-service.ts (SyntheticStoryboard) to give
 * the Director richer scene context (narration, mood, edit directions).
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { projectService } from '@/lib/editron/services/project-service';
import { assetResolver } from '@/lib/editron/services/asset-resolver';
import { ROW } from '@/lib/pipeline/scene-to-editron';
import { validateReferenceVideoUrlForAutoEditIntake } from '@/lib/editron/reference-video/reference-video-source';
import { checkCredits, type CreditCheckResult } from '@/lib/services/creditsMiddleware';
import { resolveBillingOwner, resolveCreationVisibility } from '@/lib/editron/services/project-ownership';
import { isOrgWalletBillingEnabled } from '@/lib/services/org-wallet-flag';
import { normalizeEditorialPreferences, type EditorialPreferences } from '@/lib/editron/production-brief/editorial-preferences';
import {
  admitAssistScanCharge,
  isAssistIntakeEnabled,
  parseEditMode,
  settleAssistScanFailure,
} from '@/lib/editron/services/assist-lane';
import { readStoredNativeVideoAudioRights } from '@/lib/editron/services/native-video-audio-rights';
import { activateProjectAnalysisDirectorInlineV1 } from '@/lib/editron/services/project-analysis-director-publication';
import {
  activateProjectAnalysisIntakeInlineV1,
  ProjectAnalysisIntakePublicationError,
  publishProjectAnalysisIntakeDispatchV1,
} from '@/lib/editron/services/project-analysis-intake-publication';
import {
  isInternalQStashDispatchConfigured,
  isInternalQStashWorkerAuthConfigured,
  isInternalWorkerInlineFallbackAllowed,
} from '@/lib/editron/security/internal-worker-auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface FromAssetRequest {
  assetId: string;
  title?: string;
  aspectRatio?: string;
  // Item 2: Multi-path entry — all optional, each creates a different flow
  script?: string;           // User-provided narration/script text → used as scene narration
  referenceAssetId?: string; // Reference video asset -> extract EditDNA (style transfer)
  referenceVideoUrl?: string; // Direct public video or supported YouTube reference URL
  imageAssetIds?: string[];  // Reference images → IP-adapter consistency
  userIntent?: string;       // "gym promo for Instagram" → guides content type + platform detection
  platform?: string;         // Explicit platform override (youtube/instagram/tiktok/linkedin)
  brandId?: string;          // Brand ID for brand-aware editing
  // Creative Brief preferences (Director's Cut architecture)
  captionStyle?: string;
  transitionPreference?: string;
  zoomBehavior?: string;
  motionGraphics?: string;
  pacingFeel?: string;
  musicPreference?: string;
  editorialPreferences?: EditorialPreferences;
  editMode?: string;         // Director Mode (assist lane): 'assist' = scans only, user directs via chat
}

export async function POST(request: NextRequest) {
  const startMs = Date.now();
  let autoEditCreditCheck: CreditCheckResult | null = null;
  let autoEditAnalysisStarted = false;
  let autoEditCreditTransactionId: string | undefined;
  let autoEditChargedCredits: number | undefined;
  let analysisRunId: string | undefined;
  let assistRun: { projectId: string; userId: string; creditTransactionId: string } | null = null;
  let assistSettlementDb: Parameters<typeof settleAssistScanFailure>[0] | null = null;
  let assistReadyCommitted = false;

  try {
    const { userId, orgId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body: FromAssetRequest = await request.json();
    const { assetId, title, aspectRatio = '16:9', script, referenceAssetId, referenceVideoUrl, imageAssetIds, userIntent, platform, brandId, captionStyle, transitionPreference, zoomBehavior, motionGraphics, pacingFeel, musicPreference } = body;
    const editorialPreferences = normalizeEditorialPreferences(body.editorialPreferences);

    if (!assetId) {
      return NextResponse.json({ success: false, error: 'assetId is required' }, { status: 400 });
    }

    // Director Mode (assist lane): enum-validated, server-side flag enforced —
    // hiding the toggle in the UI alone would not make the lane dark.
    const requestedEditMode = parseEditMode(body.editMode) ?? 'auto';
    if (requestedEditMode === 'assist' && !isAssistIntakeEnabled()) {
      return NextResponse.json({ success: false, error: 'Director Mode is not available.' }, { status: 403 });
    }

    const trimmedReferenceVideoUrl = referenceVideoUrl?.trim();
    let normalizedReferenceVideoUrl: string | undefined;
    let referenceVideoUrlMetadata: { kind: 'remote-url' | 'youtube-url' | 'instagram-url'; sourceLabel: string; sourceFingerprint: string } | undefined;

    if (referenceAssetId && trimmedReferenceVideoUrl) {
      return NextResponse.json({
        success: false,
        error: 'Provide either referenceAssetId or referenceVideoUrl, not both.',
        reason: 'conflicting_reference_video_sources',
      }, { status: 400 });
    }

    if (trimmedReferenceVideoUrl) {
      const validation = validateReferenceVideoUrlForAutoEditIntake(trimmedReferenceVideoUrl);
      if (!validation.ok) {
        return NextResponse.json({
          success: false,
          error: validation.diagnostics[0] ?? validation.reason,
          reason: validation.reason,
          diagnostics: validation.diagnostics,
        }, { status: 400 });
      }
      normalizedReferenceVideoUrl = validation.url.toString();
      referenceVideoUrlMetadata = {
        kind: validation.sourceKind,
        sourceLabel: validation.sourceLabel,
        sourceFingerprint: validation.sourceFingerprint,
      };
    }

    // 1. Resolve asset — validates it exists + belongs to user
    const asset = await assetResolver.getAsset(assetId, userId);
    if (!asset) {
      return NextResponse.json({ success: false, error: 'Asset not found or not owned by user' }, { status: 404 });
    }

    if (asset.type !== 'video') {
      return NextResponse.json({ success: false, error: 'Asset must be a video' }, { status: 400 });
    }

    // 2. Get playable URL for the video overlay (Worker URL for browser)
    const videoUrl = await assetResolver.resolveAssetUrl(assetId, userId);
    if (!videoUrl) {
      return NextResponse.json({ success: false, error: 'Could not resolve video URL' }, { status: 500 });
    }

    // 2b. Get server-side URL for AI services (presigned direct R2 — bypasses Cloudflare Worker)
    // Worker URL causes 429 when Gemini, xAI, fal.ai all download simultaneously through the proxy.
    // Presigned GET goes direct to R2 storage — no Worker concurrency limit, no 429.
    let serverVideoUrl = videoUrl; // default: same as browser URL
    try {
      const { isR2Available, getR2PresignedReadUrl } = await import('@/lib/editron/services/r2-service');
      if (isR2Available()) {
        serverVideoUrl = await getR2PresignedReadUrl(assetId, 3600); // 1hr expiry
      }
    } catch (err: unknown) {
      // R2 not configured — use Worker URL (existing behavior)
      console.warn('[FromAsset] R2 presigned URL failed:', err instanceof Error ? err.message : err);
    }

    // 3. Compute dimensions from aspect ratio
    const fps = 30;
    let durationSec = asset.duration;
    if (!durationSec || durationSec <= 0) {
      console.warn(`[auto-edit/from-asset] Asset ${assetId} missing duration — attempting server-side MP4 extraction`);
      try {
        const { extractMP4Duration } = await import('@/lib/editron/services/mp4-duration-service');
        const parsedDuration = await extractMP4Duration(serverVideoUrl);
        if (parsedDuration && parsedDuration > 0) {
          durationSec = parsedDuration;
        }
      } catch (durErr: any) {
        console.error(`[auto-edit/from-asset] MP4 duration extraction failed: ${durErr.message}`);
      }
      if (!durationSec || durationSec <= 0) {
        return NextResponse.json(
          { success: false, error: `Asset ${assetId} has no duration and server-side extraction failed. Please re-upload the video.` },
          { status: 400 }
        );
      }
    }
    const durationInFrames = Math.round(durationSec * fps);
    const qstashToken = process.env.QSTASH_TOKEN?.trim();
    if (qstashToken && !isInternalQStashWorkerAuthConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Auto-edit queue is unavailable because its signing keys are not configured.' },
        { status: 503 },
      );
    }
    if (!isInternalWorkerInlineFallbackAllowed() && !isInternalQStashDispatchConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Auto-edit queue is unavailable because its publisher token or signing keys are not configured.' },
        { status: 503 },
      );
    }

    const autoEditCreditOptions = {
      durationMinutes: getBillableAutoEditMinutes(durationSec),
      requestType: getAutoEditAnalysisRequestType({ durationSec, referenceAssetId, imageAssetIds }),
    };
    // Org-wallet routing (P2): this project is created (below) org-owned when the user is in an
    // org context and the flag is on, so derive the billing wallet from that same ownership. The
    // deduct AND the refund-on-failure both use it. Flag off / no org => personal, exactly as before.
    const orgWalletEnabled = isOrgWalletBillingEnabled();
    const billingWallet = resolveBillingOwner(
      userId,
      { orgId: orgId ?? null, visibility: resolveCreationVisibility(orgId ?? null, orgWalletEnabled) },
      orgWalletEnabled,
    );
    autoEditCreditCheck = await checkCredits(userId, 'editron', 'auto_edit_analysis', autoEditCreditOptions, billingWallet);
    if (!autoEditCreditCheck.allowed) {
      return autoEditCreditCheck.errorResponse!;
    }

    try {
      const deductResult = await autoEditCreditCheck.deduct();
      autoEditCreditTransactionId = deductResult.transactionId;
      const { getCreditCost } = await import('@/lib/config/creditCosts');
      autoEditChargedCredits = getCreditCost('editron', 'auto_edit_analysis', autoEditCreditOptions);
    } catch (error) {
      console.error('[auto-edit/from-asset] auto-edit analysis credit deduction failed:', error);
      return NextResponse.json(
        { success: false, error: 'Unable to deduct credits for auto-edit analysis.' },
        { status: 402 },
      );
    }
    const [w, h] = aspectRatio === '9:16' ? [1080, 1920]
      : aspectRatio === '1:1' ? [1080, 1080]
      : [1920, 1080];

    // 4. Create Editron project
    const projectName = title || `Auto-Edit: ${asset.filename}`;
    const project = await projectService.createProject(userId, projectName, { brandId, orgId: orgId ?? null });
    const projectId = project.projectId;

    // 5. Add the video as a single overlay spanning the full duration
    // Use CDN Worker URL for overlay src (never expires, has CORS).
    // resolveAssetUrl can return stale/expiring GCS URLs or Vercel proxy URLs
    // that fail when the browser tries to load the video.
    let overlaySrc = videoUrl;
    try {
      const { isR2Available, getR2PublicUrl } = await import('@/lib/editron/services/r2-service');
      if (isR2Available()) {
        overlaySrc = getR2PublicUrl(assetId);
      }
    } catch (err: unknown) {
      // R2 not available — use resolveAssetUrl result
      console.warn('[FromAsset] R2 public URL failed:', err instanceof Error ? err.message : err);
    }

    const nativeVideoAudioRights = readStoredNativeVideoAudioRights(asset);
    const videoOverlay = {
      id: Date.now(),
      type: 'video' as const,
      from: 0,
      durationInFrames,
      row: ROW.VIDEO,
      left: 0,
      top: 0,
      width: w,
      height: h,
      isDragging: false,
      rotation: 0,
      src: overlaySrc,
      assetId,
      ...(nativeVideoAudioRights && { audioRights: nativeVideoAudioRights }),
      // videoStartTime: 0 is explicit — silence removal uses this to calculate
      // source offsets when splitting the overlay into segments.
      // Without it, every segment plays from frame 0 (start of video).
      videoStartTime: 0,
      styles: { opacity: 1, objectFit: 'cover' as const },
    };

    const projectSaveReceipt = await projectService.saveProjectWithReceipt(userId, projectId, {
      overlays: [videoOverlay],
      aspectRatio,
      playerDimensions: { width: w, height: h },
      fps,
      durationInFrames,
    } as Parameters<typeof projectService.saveProjectWithReceipt>[2]);

    // 5b. Pre-warm Modal GPU containers (fire-and-forget).
    // V-JEPA + Wav2Vec run at worker Step 3.5, ~150s after QStash dispatch.
    // Cold start takes 60-90s. Warming now gives the containers time to load
    // model weights while the worker is doing transcription + editorial intent.
    try {
      const { warmupVjepa } = await import('@/lib/editron/services/vjepa-service');
      const { warmupWav2Vec } = await import('@/lib/editron/services/wav2vec-service');
      warmupVjepa();
      warmupWav2Vec();
    } catch (err: unknown) {
      // Non-fatal — GPU analysis is optional
      console.warn('[FromAsset] GPU warmup failed:', err instanceof Error ? err.message : err);
    }

    // 6. Mark project + dispatch heavy processing to QStash worker.
    // Worker handles: video understanding → SyntheticStoryboard → profile detection → Director.
    // Runs async — from-asset returns immediately with projectId.
    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();

    assistSettlementDb = db;
    if (!autoEditCreditTransactionId || autoEditChargedCredits === undefined) {
      throw new Error('Auto-edit analysis deduction identity is missing after charge.');
    }

    // Establish lane + paid-run identity in one CAS BEFORE any status or worker
    // dispatch. A stale/pre-used project cannot be silently repurposed.
    if (requestedEditMode === 'assist') {
      const admission = await admitAssistScanCharge(db, {
        projectId,
        userId,
        creditTransactionId: autoEditCreditTransactionId,
        chargedCredits: autoEditChargedCredits,
      });
      if (admission.disposition !== 'admitted' && admission.disposition !== 'already-admitted') {
        throw new Error(`Assist scan admission was rejected: ${admission.disposition}`);
      }
      assistRun = { projectId, userId, creditTransactionId: autoEditCreditTransactionId };
    }

    const analysisAdmission = await projectService.admitProjectAnalysisRunV1(userId, projectId, {
      expectedRevision: projectSaveReceipt.revision,
      sourceAssetId: assetId,
      creditTransactionId: autoEditCreditTransactionId,
      chargedCredits: autoEditChargedCredits,
      lane: requestedEditMode,
      queueFacts: {
        ...(referenceAssetId && { referenceAssetId }),
        ...(referenceVideoUrlMetadata && { referenceVideoSource: referenceVideoUrlMetadata }),
        ...(imageAssetIds?.length && { referenceImageAssetIds: imageAssetIds }),
        ...(editorialPreferences && { editorialPreferences: { ...editorialPreferences } }),
      },
    });
    if (
      analysisAdmission.disposition !== 'ADMITTED'
      && analysisAdmission.disposition !== 'ALREADY_ADMITTED'
    ) {
      throw new Error(`Auto-edit analysis admission was rejected: ${analysisAdmission.disposition}`);
    }
    const admittedAnalysisRunId = analysisAdmission.run.runId;
    analysisRunId = admittedAnalysisRunId;
    const intakeDispatch = analysisAdmission.run.intakeDispatch;
    if (!intakeDispatch) {
      throw new Error('Auto-edit analysis admission returned no intake dispatch identity.');
    }

    if (qstashToken) {
      try {
        await publishProjectAnalysisIntakeDispatchV1({
          projectId,
          userId,
          analysisRunId: admittedAnalysisRunId,
          sourceAssetId: assetId,
          dispatch: intakeDispatch,
          onProviderAccepted: () => { autoEditAnalysisStarted = true; },
          workerPayload: {
            orgId: orgId || undefined,
            videoUrl: serverVideoUrl,
            durationSec,
            title: projectName,
            profileId: 'A-01',
            userIntent,
            referenceAssetId,
            referenceVideoUrl: normalizedReferenceVideoUrl,
            script,
            platform,
            captionStyle,
            transitionPreference,
            zoomBehavior,
            motionGraphics,
            pacingFeel,
            musicPreference,
            editorialPreferences,
            creditTransactionId: autoEditCreditTransactionId,
            chargedCredits: autoEditChargedCredits,
          },
        });
      } catch (error: unknown) {
        const providerAccepted = error instanceof ProjectAnalysisIntakePublicationError
          && error.providerAccepted;
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[auto-edit/from-asset] ${errMsg}`);
        if (providerAccepted) {
          return NextResponse.json({
            success: true,
            projectId,
            status: 'processing',
            publicationReceipt: 'reconciliation_pending',
            message: 'Video analysis was queued; its local provider receipt is awaiting reconciliation.',
          }, { status: 202 });
        }
        if (assistRun) {
          await settleAssistScanFailure(db, {
            ...assistRun,
            reason: errMsg,
          });
        } else {
          await failAdmittedAutoAnalysisRun({
            projectId,
            userId,
            analysisRunId: admittedAnalysisRunId,
            sourceAssetId: assetId,
            errorMessage: errMsg,
          });
        }
        if (!assistRun && autoEditCreditCheck) {
          await refundAutoEditAnalysisCredits(autoEditCreditCheck, 'Auto-edit analysis dispatch failed before worker queueing');
        }
        return NextResponse.json({ success: false, error: errMsg }, { status: 502 });
      }
    } else {
      // No QStash → run inline (dev mode)
      const { analyzeVideo } = await import('@/lib/editron/services/video-understanding-service');
      await activateProjectAnalysisIntakeInlineV1({
        projectId,
        userId,
        analysisRunId: admittedAnalysisRunId,
        sourceAssetId: assetId,
        dispatch: intakeDispatch,
      });
      autoEditAnalysisStarted = true;
      const ssb = await analyzeVideo(serverVideoUrl, durationSec, userIntent || projectName);
      await commitInlineAssetAnalysisPhase1({
        projectId,
        userId,
        analysisRunId: admittedAnalysisRunId,
        sourceAssetId: assetId,
        syntheticStoryboard: ssb,
      });
      const directorPayload = {
        projectId,
        userId,
        analysisRunId: admittedAnalysisRunId,
        profileId: 'A-01',
        platform,
        userIntent,
        captionStyle,
        transitionPreference,
        zoomBehavior,
        motionGraphics,
        pacingFeel,
        musicPreference,
        editorialPreferences,
      };
      const { runCanonicalDirectorV1 } = await import('@/lib/editron/services/canonical-director-run');
      if (requestedEditMode === 'assist') {
        const completion = await runCanonicalDirectorV1(directorPayload);
        if (completion.disposition !== 'ASSIST_READY') {
          throw new Error(`Assist completion was rejected: ${completion.disposition}.`);
        }
        assistReadyCommitted = true;
      } else {
        const snapshot = await projectService.loadProjectForMutation(userId, projectId);
        const prepared = await projectService.prepareProjectAnalysisDirectorDispatchV1(userId, projectId, {
          expectedRevision: snapshot.revision,
          runId: admittedAnalysisRunId,
          sourceAssetId: assetId,
        });
        if (prepared.disposition !== 'ADVANCED' && prepared.disposition !== 'ALREADY_ADVANCED') {
          throw new Error(`Inline Director dispatch preparation was rejected: ${prepared.disposition}.`);
        }
        const dispatch = prepared.run.directorDispatch;
        if (!dispatch) throw new Error('Inline Director dispatch preparation returned no identity.');
        await activateProjectAnalysisDirectorInlineV1({
          projectId,
          userId,
          analysisRunId: admittedAnalysisRunId,
          sourceAssetId: assetId,
          dispatch,
        });
        const completion = await runCanonicalDirectorV1({
          ...directorPayload,
          analysisDirectorDispatchId: dispatch.deduplicationId,
        });
        if (completion.disposition !== 'COMPLETED') {
          throw new Error(`Inline Director execution did not complete: ${completion.disposition}.`);
        }
      }
    }

    const totalMs = Date.now() - startMs;

    return NextResponse.json({
      success: true,
      projectId,
      status: 'processing',
      message: 'Video analysis + AI editing started. Check project for results.',
      totalMs,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (assistRun && !assistReadyCommitted) {
      try {
        const db = assistSettlementDb ?? await (await import('@/lib/editron/db/mongodb')).getDatabase();
        await settleAssistScanFailure(db, { ...assistRun, reason: msg });
      } catch (settlementError: unknown) {
        console.error('[auto-edit/from-asset] Assist failure settlement could not be started:', settlementError);
      }
    } else if (autoEditCreditCheck && !autoEditAnalysisStarted) {
      await refundAutoEditAnalysisCredits(autoEditCreditCheck, 'Auto-edit analysis failed before analysis start');
    }
    console.error(`[auto-edit/from-asset] Failed: ${msg}`);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

async function commitInlineAssetAnalysisPhase1(input: {
  projectId: string;
  userId: string;
  analysisRunId: string;
  sourceAssetId: string;
  syntheticStoryboard: unknown;
}): Promise<void> {
  const transitions = [
    { fromState: 'queued', toState: 'analyzing' },
    { fromState: 'analyzing', toState: 'transcribing' },
  ] as const;
  for (const transition of transitions) {
    const snapshot = await projectService.loadProjectForMutation(input.userId, input.projectId);
    const advanced = await projectService.advanceProjectAnalysisRunV1(input.userId, input.projectId, {
      expectedRevision: snapshot.revision,
      runId: input.analysisRunId,
      sourceAssetId: input.sourceAssetId,
      ...transition,
    });
    if (advanced.disposition !== 'ADVANCED' && advanced.disposition !== 'ALREADY_ADVANCED') {
      throw new Error(
        `Inline analysis transition ${transition.fromState} → ${transition.toState} was rejected: ${advanced.disposition}.`,
      );
    }
  }

  const phase1Snapshot = await projectService.loadProjectForMutation(input.userId, input.projectId);
  const committed = await projectService.commitProjectAnalysisPhase1V1(input.userId, input.projectId, {
    expectedRevision: phase1Snapshot.revision,
    runId: input.analysisRunId,
    sourceAssetId: input.sourceAssetId,
    fromState: 'transcribing',
    evidence: {
      ...(input.syntheticStoryboard != null
        ? { syntheticStoryboard: input.syntheticStoryboard }
        : {}),
    },
  });
  if (committed.disposition !== 'ADVANCED' && committed.disposition !== 'ALREADY_ADVANCED') {
    throw new Error(`Inline Phase-1 evidence commit was rejected: ${committed.disposition}.`);
  }
}

async function failAdmittedAutoAnalysisRun(input: {
  projectId: string;
  userId: string;
  analysisRunId: string;
  sourceAssetId: string;
  errorMessage: string;
}): Promise<void> {
  const snapshot = await projectService.loadProjectForMutation(input.userId, input.projectId);
  const failed = await projectService.failProjectAnalysisRunV1(input.userId, input.projectId, {
    expectedRevision: snapshot.revision,
    runId: input.analysisRunId,
    sourceAssetId: input.sourceAssetId,
    errorMessage: input.errorMessage,
  });
  if (failed.disposition !== 'RECORDED' && failed.disposition !== 'ALREADY_RECORDED') {
    throw new Error(`Auto-edit analysis failure lost run ownership: ${failed.disposition}.`);
  }
}

type AutoEditAnalysisRequestType = 'standard' | 'reference_guided' | 'long_form';

function getBillableAutoEditMinutes(durationSec: number): number {
  const sourceMinutes = durationSec > 0 ? durationSec / 60 : 1;
  return Math.max(1, Math.ceil(sourceMinutes * 100) / 100);
}

function getAutoEditAnalysisRequestType(options: {
  durationSec: number;
  referenceAssetId?: string;
  imageAssetIds?: string[];
}): AutoEditAnalysisRequestType {
  if (options.durationSec >= 600) return 'long_form';
  if (options.referenceAssetId || (options.imageAssetIds?.length || 0) > 0) return 'reference_guided';
  return 'standard';
}

async function refundAutoEditAnalysisCredits(creditCheck: CreditCheckResult, reason: string): Promise<void> {
  try {
    await creditCheck.refund(reason);
  } catch (error) {
    console.error('[auto-edit/from-asset] auto-edit analysis credit refund failed:', error);
  }
}
