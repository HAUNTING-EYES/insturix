/**
 * POST /api/internal/workers/tribe-analysis
 *
 * QStash worker for TRIBE Phase 2 deep analysis.
 * Stage 2 of three-stage QStash pipeline:
 *   Stage 1: /api/internal/workers/video-analysis (transcription, cuts, VU, genre params)
 *   Stage 2: THIS (V-JEPA, Wav2Vec, Essentia, moment weights, segment analysis)
 *   Stage 3: /api/internal/workers/director (profile detection, Creative Brief, Director execution)
 *
 * Split from video-analysis to prevent 800s Vercel timeout on long videos.
 * video-analysis (Steps 1-3) ~215s + tribe-analysis (Steps 3.5-3.7) ~500s.
 *
 * Flow:
 * 3.5  V-JEPA + Wav2Vec + Essentia GPU analysis (parallel, Modal)
 * 3.6  Moment weight map (Phase 2: 50% gemini + 30% vjepa + 20% wav2vec)
 * 3.7  Unified SegmentAnalysis
 * 4b   Store Phase 2 results on project doc
 * 5    Dispatch Director worker via QStash (or run inline in dev)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  INTERNAL_WORKER_DISPATCH_NOT_CONFIGURED,
  isInternalQStashDispatchConfigured,
  isInternalWorkerInlineFallbackAllowed,
  withInternalQStashWorkerAuth,
} from '@/lib/editron/security/internal-worker-auth';
import { encodeProjectAnalysisAssetKey, persistProjectAssetAnalysis } from '@/lib/editron/services/project-analysis-storage';
import {
  recordProviderCostEvent,
  type ProviderCostEventStatus,
} from '@/lib/financials/provider-cost-events';
import type { ProviderCostBasis, ProviderCostUnits } from '@/lib/financials/provider-cost-estimates';
import type { ProjectAnalysisDirectorDispatchV1 } from '@/lib/editron/services/project-service';

export const runtime = 'nodejs';
export const maxDuration = 800; // GPU analysis can take 5-8min for long videos

interface TribeAnalysisPayload {
  projectId: string;
  userId: string;
  orgId?: string;
  assetId: string;
  analysisRunId: string;
  videoUrl: string;
  segmentInputs: { startMs: number; endMs: number }[];
  visualSegmentInputs?: { startMs: number; endMs: number }[];
  directorPayload: Record<string, unknown>;
  creditTransactionId?: string;
  chargedCredits?: number;
}

class TribeAnalysisOwnershipLostError extends Error {
  readonly code = 'TRIBE_ANALYSIS_OWNERSHIP_LOST';

  constructor(message: string) {
    super(message);
    this.name = 'TribeAnalysisOwnershipLostError';
  }
}

async function handler(request: NextRequest) {
  const startMs = Date.now();
  let trackedScan: Pick<
    TribeAnalysisPayload,
    'projectId' | 'userId' | 'assetId' | 'analysisRunId' | 'creditTransactionId'
  > | undefined;
  let directorDispatched = false;

  try {
    const payload: TribeAnalysisPayload = await request.json();
    const {
      projectId, userId, assetId, analysisRunId, videoUrl,
      segmentInputs, visualSegmentInputs, directorPayload,
    } = payload;
    const sourceAssetId = typeof assetId === 'string' ? assetId.trim() : '';

    if (
      !projectId
      || !userId
      || !sourceAssetId
      || !analysisRunId
      || !videoUrl
      || directorPayload.projectId !== projectId
      || directorPayload.userId !== userId
      || directorPayload.analysisRunId !== analysisRunId
    ) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }
    trackedScan = {
      projectId,
      userId,
      assetId: sourceAssetId,
      analysisRunId,
      creditTransactionId: payload.creditTransactionId,
    };

    if (!isInternalWorkerInlineFallbackAllowed() && !isInternalQStashDispatchConfigured()) {
      console.error('[TribeWorker] Dependent worker dispatch is not configured outside development.');
      return NextResponse.json(
        {
          success: false,
          error: {
            code: INTERNAL_WORKER_DISPATCH_NOT_CONFIGURED,
            routeId: 'tribe-analysis',
          },
        },
        { status: 503 },
      );
    }

    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();
    const { projectService } = await import('@/lib/editron/services/project-service');
    const claimSnapshot = await projectService.loadProjectForMutation(userId, projectId);
    const claim = await projectService.claimProjectAnalysisDeepRunV1(userId, projectId, {
      expectedRevision: claimSnapshot.revision,
      runId: analysisRunId,
      sourceAssetId,
    });
    if (claim.disposition === 'DUPLICATE_ACTIVE') {
      return NextResponse.json({ success: true, skipped: 'duplicate-delivery', stage: 'tribe-analysis' });
    }
    if (claim.disposition === 'DIRECTOR_DISPATCH_PUBLISHED') {
      return NextResponse.json({ success: true, skipped: 'director-already-dispatched', stage: 'tribe-analysis' });
    }
    if (claim.disposition === 'DIRECTOR_DISPATCH_PENDING') {
      if (!isInternalQStashDispatchConfigured()) {
        throw new TribeAnalysisOwnershipLostError(
          'A prepared Director dispatch cannot resume without the configured production queue.',
        );
      }
      await publishPreparedDirectorDispatch({
        payload,
        sourceAssetId,
        directorPayload,
        dispatch: claim.run.directorDispatch!,
        onProviderAccepted: () => { directorDispatched = true; },
      });
      return NextResponse.json({ success: true, totalMs: Date.now() - startMs, stage: 'tribe-analysis' });
    }
    if (claim.disposition !== 'CLAIMED') {
      throw new TribeAnalysisOwnershipLostError(
        `TRIBE deep-analysis claim lost current run ownership (${claim.disposition}).`,
      );
    }
    const deepAnalysisLeaseId = claim.lease.leaseId;

    const precomputedProjectDoc = await db.collection('projects').findOne(
      {
        projectId,
        userId,
        'autoEditAnalysisRunV1.runId': analysisRunId,
        'autoEditAnalysisRunV1.deepAnalysisLease.leaseId': deepAnalysisLeaseId,
      },
      { projection: { vjepaAnalysis: 1 } },
    );
    if (!precomputedProjectDoc) {
      throw new TribeAnalysisOwnershipLostError('TRIBE lease disappeared before GPU analysis began.');
    }
    const precomputedVjepaAnalysis = precomputedProjectDoc.vjepaAnalysis;

    // ─── Step 3.5: V-JEPA + Wav2Vec + Essentia GPU analysis ────────
    // Run visual significance (V-JEPA), vocal emotion (Wav2Vec), and music
    // analysis (Essentia) in parallel. All are non-fatal — pipeline falls
    // back to Phase 0 (Gemini-only) weights if GPU analysis fails.
    let vjepaAnalysis: any = Array.isArray(precomputedVjepaAnalysis?.segments) && precomputedVjepaAnalysis.segments.length > 0
      ? precomputedVjepaAnalysis
      : null;
    let wav2vecAnalysis: any = null;
    let musicAnalysis: any = null;

    if (segmentInputs?.length > 0) {
      try {
        const vjepaSegmentInputs = Array.isArray(visualSegmentInputs) && visualSegmentInputs.length > 0
          ? visualSegmentInputs
          : segmentInputs;
        const reusedPrecomputedVjepa = Boolean(vjepaAnalysis);
        const vjepaRequestedSeconds = sumSegmentSeconds(vjepaSegmentInputs);
        const speechRequestedSeconds = sumSegmentSeconds(segmentInputs);

        const [vjepaResult, wav2vecResult, musicResult] = await Promise.allSettled([
          vjepaAnalysis
            ? Promise.resolve(vjepaAnalysis)
            : (async () => {
                const { analyzeVideoWithVjepa } = await import('@/lib/editron/services/vjepa-service');
                return analyzeVideoWithVjepa(videoUrl, vjepaSegmentInputs);
              })(),
          (async () => {
            const { analyzeAudioWithWav2Vec } = await import('@/lib/editron/services/wav2vec-service');
            const { resolveCanonicalWav2VecAnalysis } = await import('@/lib/editron/services/canonical-wav2vec-analysis');
            return resolveCanonicalWav2VecAnalysis({
              db,
              assetId: sourceAssetId,
              userId,
              audioUrl: videoUrl,
              segments: segmentInputs,
              analyze: analyzeAudioWithWav2Vec,
            });
          })(),
          (async () => {
            const { analyzeMusicContent } = await import('@/lib/editron/services/music-analysis-service');
            return analyzeMusicContent(videoUrl);
          })(),
        ]);

        // Handle V-JEPA result
        if (vjepaResult.status === 'fulfilled' && vjepaResult.value) {
          vjepaAnalysis = vjepaResult.value;
        } else {
          const msg = vjepaResult.status === 'rejected' ? (vjepaResult.reason?.message || String(vjepaResult.reason)) : 'returned null';
          console.warn(`[TribeWorker] V-JEPA skipped: ${msg}`);
        }
        if (reusedPrecomputedVjepa) {
          await recordTribeCostEvent(payload, {
            stage: 'vjepa_modal',
            status: 'skipped',
            provider: 'modal',
            model: 'vjepa-2',
            operation: 'gpu_video_analysis',
            estimatedCostUsd: 0,
            costBasis: 'provider_usage',
            units: { requestCount: 0, mediaSeconds: vjepaRequestedSeconds },
            metadata: { reason: 'precomputed_vjepa_reused', requestedSegmentCount: vjepaSegmentInputs.length },
          });
        } else if (vjepaResult.status === 'fulfilled' && vjepaResult.value) {
          await recordTribeCostEvent(payload, {
            stage: 'vjepa_modal',
            status: 'success',
            provider: 'modal',
            model: vjepaResult.value.modelVersion || 'vjepa-2',
            operation: 'gpu_video_analysis',
            units: {
              requestCount: 1,
              mediaSeconds: vjepaRequestedSeconds,
              functionMs: vjepaResult.value.processingTimeMs,
              gpuSeconds: msToSeconds(vjepaResult.value.processingTimeMs),
            },
            metadata: {
              requestedSegmentCount: vjepaSegmentInputs.length,
              analyzedSegmentCount: vjepaResult.value.segments?.length ?? 0,
              partial: Boolean(vjepaResult.value.partial),
              failedBatchCount: vjepaResult.value.failedBatchCount ?? 0,
            },
          });
        } else {
          await recordTribeCostEvent(payload, {
            stage: 'vjepa_modal',
            status: 'failed',
            provider: 'modal',
            model: 'vjepa-2',
            operation: 'gpu_video_analysis',
            units: { requestCount: 1, mediaSeconds: vjepaRequestedSeconds },
            metadata: {
              requestedSegmentCount: vjepaSegmentInputs.length,
              resultStatus: vjepaResult.status,
              errorClass: settledErrorClass(vjepaResult),
            },
          });
        }

        // Handle Wav2Vec result
        const wav2vecResolution = wav2vecResult.status === 'fulfilled' ? wav2vecResult.value : null;
        if (wav2vecResolution?.analysis) {
          wav2vecAnalysis = wav2vecResolution.analysis;
        } else {
          const msg = wav2vecResult.status === 'rejected'
            ? (wav2vecResult.reason?.message || String(wav2vecResult.reason))
            : wav2vecResolution?.provenance || 'returned null';
          console.warn(`[TribeWorker] Wav2Vec skipped: ${msg}`);
        }
        await recordTribeCostEvent(payload, wav2vecResolution?.analysis
          ? {
              stage: 'wav2vec_modal',
              status: wav2vecResolution.providerInvoked ? 'success' : 'skipped',
              provider: 'modal',
              model: wav2vecResolution.analysis.modelVersion || 'wav2vec-2.0',
              operation: 'gpu_audio_analysis',
              ...(wav2vecResolution.providerInvoked ? {} : { estimatedCostUsd: 0, costBasis: 'provider_usage' as const }),
              units: {
                requestCount: wav2vecResolution.providerInvoked ? 1 : 0,
                mediaSeconds: speechRequestedSeconds,
                ...(wav2vecResolution.providerInvoked ? {
                  functionMs: wav2vecResolution.providerProcessingTimeMs,
                  gpuSeconds: msToSeconds(wav2vecResolution.providerProcessingTimeMs),
                } : {}),
              },
              metadata: {
                requestedSegmentCount: segmentInputs.length,
                analyzedSegmentCount: wav2vecResolution.analyzedSegmentCount,
                uncoveredSegmentCount: wav2vecResolution.uncoveredSegmentCount,
                provenance: wav2vecResolution.provenance,
                waitedMs: wav2vecResolution.waitedMs,
              },
            }
          : {
              stage: 'wav2vec_modal',
              status: wav2vecResolution?.provenance === 'owner-pending-timeout' ? 'skipped' : 'failed',
              provider: 'modal',
              model: 'wav2vec-2.0',
              operation: 'gpu_audio_analysis',
              ...(wav2vecResolution?.providerInvoked ? {} : { estimatedCostUsd: 0, costBasis: 'provider_usage' as const }),
              units: { requestCount: wav2vecResolution?.providerInvoked ? 1 : 0, mediaSeconds: speechRequestedSeconds },
              metadata: {
                requestedSegmentCount: segmentInputs.length,
                resultStatus: wav2vecResult.status,
                errorClass: settledErrorClass(wav2vecResult),
                provenance: wav2vecResolution?.provenance,
                waitedMs: wav2vecResolution?.waitedMs,
              },
            });

        // Handle Music Analysis result
        if (musicResult.status === 'fulfilled' && musicResult.value) {
          musicAnalysis = musicResult.value;
        } else {
          const msg = musicResult.status === 'rejected' ? (musicResult.reason?.message || String(musicResult.reason)) : 'returned null';
          console.warn(`[TribeWorker] Music analysis skipped: ${msg}`);
        }
        await recordTribeCostEvent(payload, musicResult.status === 'fulfilled' && musicResult.value
          ? {
              stage: 'essentia_modal',
              status: 'success',
              provider: 'modal',
              model: 'essentia',
              operation: 'music_analysis',
              units: {
                requestCount: 1,
                mediaSeconds: msToSeconds(musicResult.value.durationMs) ?? speechRequestedSeconds,
                functionMs: musicResult.value.processingTimeMs,
                gpuSeconds: msToSeconds(musicResult.value.processingTimeMs),
              },
              metadata: {
                beatCount: musicResult.value.beats?.length ?? 0,
                sectionCount: musicResult.value.sections?.length ?? 0,
                musicPresence: musicResult.value.musicPresence,
              },
            }
          : {
              stage: 'essentia_modal',
              status: 'failed',
              provider: 'modal',
              model: 'essentia',
              operation: 'music_analysis',
              units: { requestCount: 1, mediaSeconds: speechRequestedSeconds },
              metadata: {
                resultStatus: musicResult.status,
                errorClass: settledErrorClass(musicResult),
              },
            });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[TribeWorker] TRIBE Phase 2 analysis failed (non-fatal): ${msg}`);
      }
    }

    // ─── Step 3.6: Build enriched moment weight map ──────────────────
    // If V-JEPA/Wav2Vec data is available, build Phase 2 weights:
    //   50% gemini + 30% vjepa + 20% wav2vec + thompson_adjustment
    // Otherwise falls back to Phase 0 flat weights.
    // Reads rawFootageAnalysis from project doc (stored by video-analysis worker).
    const projectDoc = await db.collection('projects').findOne(
      {
        projectId,
        userId,
        'autoEditAnalysisRunV1.runId': analysisRunId,
        'autoEditAnalysisRunV1.deepAnalysisLease.leaseId': deepAnalysisLeaseId,
      },
      { projection: { rawFootageAnalysis: 1, rawFootageAnalysisByAsset: 1, syntheticStoryboard: 1, referenceEditDNA: 1, referenceVideoAnalysis: 1 } },
    );
    if (!projectDoc) {
      throw new TribeAnalysisOwnershipLostError('TRIBE lease disappeared before Phase-2 evidence was built.');
    }
    const keyedRawFootageAnalysis = projectDoc
      .rawFootageAnalysisByAsset?.[encodeProjectAnalysisAssetKey(sourceAssetId)];
    const rawFootageAnalysis = keyedRawFootageAnalysis ?? projectDoc?.rawFootageAnalysis;
    const syntheticStoryboard = projectDoc?.syntheticStoryboard;

    let momentWeightMap: any = null;
    if (vjepaAnalysis || wav2vecAnalysis) {
      try {
        const { buildMomentWeightMap, integrateVjepaScores, integrateWav2vecScores } =
          await import('@/lib/editron/services/moment-weight-service');
        const { toVjepaWeightFormat } = await import('@/lib/editron/services/vjepa-service');
        const { toWav2VecWeightFormat } = await import('@/lib/editron/services/wav2vec-service');

        // Start with flat weights (Phase 0)
        let weightMap = buildMomentWeightMap(null, rawFootageAnalysis);

        // Integrate V-JEPA visual significance (30% weight)
        if (vjepaAnalysis) {
          const vjepaWeights = toVjepaWeightFormat(vjepaAnalysis);
          weightMap = integrateVjepaScores(weightMap, vjepaWeights);
        }

        // Integrate Wav2Vec vocal emotion (20% weight)
        if (wav2vecAnalysis) {
          const wav2vecWeights = toWav2VecWeightFormat(wav2vecAnalysis);
          weightMap = integrateWav2vecScores(weightMap, wav2vecWeights);
        }

        momentWeightMap = weightMap;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[TribeWorker] Moment weight computation failed (non-fatal): ${msg}`);
      }
    }

    // ─── Step 3.7: Build unified SegmentAnalysis ───────────────────
    // One source of truth merging all 5 analysis sources per segment.
    let segmentAnalysis: any = null;
    if (rawFootageAnalysis?.segments?.length > 0) {
      try {
        const { buildSegmentAnalysis } = await import('@/lib/editron/services/segment-analysis-builder');
        segmentAnalysis = buildSegmentAnalysis(
          rawFootageAnalysis, syntheticStoryboard,
          vjepaAnalysis, wav2vecAnalysis, momentWeightMap,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[TribeWorker] SegmentAnalysis build failed (non-fatal): ${msg}`);
      }
    }

    // ─── Step 4b: Store Phase 2 results on project doc ────────────
    const phase2Snapshot = await projectService.loadProjectForMutation(userId, projectId);
    const phase2Commit = await projectService.commitProjectAnalysisPhase2V1(userId, projectId, {
      expectedRevision: phase2Snapshot.revision,
      runId: analysisRunId,
      sourceAssetId,
      leaseId: deepAnalysisLeaseId,
      evidence: {
        ...(vjepaAnalysis ? { vjepaAnalysis } : {}),
        ...(wav2vecAnalysis ? { wav2vecAnalysis } : {}),
        ...(musicAnalysis ? { musicAnalysis } : {}),
        ...(momentWeightMap ? { momentWeightMap } : {}),
        ...(segmentAnalysis ? { segmentAnalysis } : {}),
      },
    });
    if (phase2Commit.disposition !== 'ADVANCED' && phase2Commit.disposition !== 'ALREADY_ADVANCED') {
      throw new TribeAnalysisOwnershipLostError(
        `TRIBE Phase-2 commit lost current run ownership (${phase2Commit.disposition}).`,
      );
    }
    const preparedDispatch = phase2Commit.run.directorDispatch;
    if (!preparedDispatch) {
      throw new Error('TRIBE Phase-2 commit did not prepare its Director dispatch.');
    }
    const phase2UpdatedAt = new Date(
      phase2Commit.run.phase2EvidenceCommittedAt ?? phase2Commit.run.updatedAt,
    );

    try {
      await persistProjectAssetAnalysis(db, projectId, sourceAssetId, {
        vjepaAnalysis,
        wav2vecAnalysis,
        musicAnalysis,
        momentWeightMap,
        segmentAnalysis,
      }, phase2UpdatedAt);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[TribeWorker] Phase 2 per-asset analysis document write failed (non-fatal): ${msg}`);
    }

    // ─── Step 5: Dispatch Director to separate worker ─────────────
    if (isInternalQStashDispatchConfigured()) {
      await publishPreparedDirectorDispatch({
        payload,
        sourceAssetId,
        directorPayload,
        dispatch: preparedDispatch,
        onProviderAccepted: () => { directorDispatched = true; },
      });
      const totalMs = Date.now() - startMs;
      return NextResponse.json({ success: true, totalMs, stage: 'tribe-analysis' });
    }

    // ─── Dev fallback: no QStash → run Director inline ────────────
    console.warn(`[TribeWorker] No QSTASH_TOKEN — running Director inline`);
    const { runCanonicalDirectorV1 } = await import('@/lib/editron/services/canonical-director-run');
    const directorResult = await runCanonicalDirectorV1({
      projectId,
      userId,
      profileId: typeof directorPayload.profileId === 'string' ? directorPayload.profileId : 'G-01',
      platform: typeof directorPayload.platform === 'string' ? directorPayload.platform : 'youtube',
      userIntent: typeof directorPayload.userIntent === 'string' ? directorPayload.userIntent : undefined,
      captionStyle: directorPayload.captionStyle,
      transitionPreference: directorPayload.transitionPreference,
      zoomBehavior: directorPayload.zoomBehavior,
      motionGraphics: directorPayload.motionGraphics,
      pacingFeel: directorPayload.pacingFeel,
      musicPreference: directorPayload.musicPreference,
      editorialPreferences: directorPayload.editorialPreferences,
    }, {
      onClaimed: () => { directorDispatched = true; },
    });
    const totalMs = Date.now() - startMs;
    if (directorResult.disposition === 'ASSIST_READY') {
      return NextResponse.json({ success: true, totalMs, status: directorResult.status, directorSkipped: true });
    }
    if (directorResult.disposition === 'ALREADY_PROCESSED' || directorResult.disposition === 'OWNERSHIP_LOST') {
      return NextResponse.json({ success: true, totalMs, skipped: true, reason: 'director-ownership-lost' });
    }
    return NextResponse.json({ success: true, totalMs });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    const ownershipLost = error instanceof TribeAnalysisOwnershipLostError;
    console.error(`[TribeWorker] Failed: ${msg}`);

    // Mark project as failed — but only if Director hasn't already been dispatched
    // (if dispatched, the Director worker owns the final status)
    if (trackedScan && !directorDispatched && !ownershipLost) {
      try {
        const { getDatabase } = await import('@/lib/editron/db/mongodb');
        const db = await getDatabase();
        const { settleAssistScanFailure } = await import('@/lib/editron/services/assist-lane');
        // Assist lane: a TRIBE-stage failure must refund (from-asset deducted at
        // intake) and surface scan_failed — not silently keep the charge as 'failed'.
        const settlement = await settleAssistScanFailure(db, {
          projectId: trackedScan.projectId,
          userId: trackedScan.userId,
          reason: msg,
          creditTransactionId: trackedScan.creditTransactionId,
        });
        if (settlement === 'not-assist') {
          const { projectService } = await import('@/lib/editron/services/project-service');
          const snapshot = await projectService.loadProjectForMutation(
            trackedScan.userId,
            trackedScan.projectId,
          );
          const failed = await projectService.failProjectAnalysisRunV1(
            trackedScan.userId,
            trackedScan.projectId,
            {
              expectedRevision: snapshot.revision,
              runId: trackedScan.analysisRunId,
              sourceAssetId: trackedScan.assetId,
              errorMessage: msg,
            },
          );
          if (failed.disposition !== 'RECORDED' && failed.disposition !== 'ALREADY_RECORDED') {
            throw new Error(`TRIBE failure lost current run ownership (${failed.disposition}).`);
          }
        }
      } catch (e) { console.warn(`[TribeWorker] Status update failed:`, e instanceof Error ? e.message : e); }
    }

    return NextResponse.json(
      { success: false, error: msg },
      { status: ownershipLost ? 409 : 500 },
    );
  }
}

async function publishPreparedDirectorDispatch(input: {
  payload: TribeAnalysisPayload;
  sourceAssetId: string;
  directorPayload: Record<string, unknown>;
  dispatch: ProjectAnalysisDirectorDispatchV1;
  onProviderAccepted(): void;
}): Promise<void> {
  const qstashBaseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
  const directorUrl = `${qstashBaseUrl}/api/internal/workers/director`;
  const qstashUrl = `${process.env.QSTASH_URL || 'https://qstash.upstash.io'}/v2/publish/${directorUrl}`;
  const dispatchRes = await fetch(qstashUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.QSTASH_TOKEN}`,
      'Content-Type': 'application/json',
      'Upstash-Retries': '0',
      'Upstash-Delay': '3s',
      'Upstash-Deduplication-Id': input.dispatch.deduplicationId,
    },
    body: JSON.stringify(input.directorPayload),
  });
  if (dispatchRes.ok) input.onProviderAccepted();
  await recordTribeCostEvent(input.payload, {
    stage: 'director_qstash',
    status: dispatchRes.ok ? 'success' : 'failed',
    provider: 'upstash-qstash',
    operation: 'queue_message',
    units: { queueMessages: 1, requestCount: 1 },
    metadata: { httpStatus: dispatchRes.status, deduplicationId: input.dispatch.deduplicationId },
  });
  if (!dispatchRes.ok) {
    const errBody = await dispatchRes.text().catch(() => 'no body');
    throw new Error(`Director QStash dispatch failed: HTTP ${dispatchRes.status} — ${errBody}`);
  }
  const dispatchData = await dispatchRes.json() as { messageId?: unknown };
  if (typeof dispatchData.messageId !== 'string' || dispatchData.messageId.length === 0) {
    throw new Error('Director QStash dispatch succeeded without a provider message receipt.');
  }

  const { projectService } = await import('@/lib/editron/services/project-service');
  const snapshot = await projectService.loadProjectForMutation(input.payload.userId, input.payload.projectId);
  const recorded = await projectService.recordProjectAnalysisDirectorDispatchPublishedV1(
    input.payload.userId,
    input.payload.projectId,
    {
      expectedRevision: snapshot.revision,
      runId: input.payload.analysisRunId,
      sourceAssetId: input.sourceAssetId,
      deduplicationId: input.dispatch.deduplicationId,
      providerMessageId: dispatchData.messageId,
    },
  );
  if (recorded.disposition !== 'ADVANCED' && recorded.disposition !== 'ALREADY_ADVANCED') {
    throw new TribeAnalysisOwnershipLostError(
      `Director publication receipt lost current run ownership (${recorded.disposition}).`,
    );
  }
}

async function recordTribeCostEvent(
  payload: TribeAnalysisPayload,
  event: {
    stage: string;
    status: ProviderCostEventStatus;
    provider: string;
    operation: string;
    model?: string;
    estimatedCostUsd?: number;
    costBasis?: ProviderCostBasis;
    units?: ProviderCostUnits;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const orgId = payload.orgId || (typeof payload.directorPayload?.orgId === 'string'
    ? payload.directorPayload.orgId
    : undefined);

  await recordProviderCostEvent({
    idempotencyKey: `editron:tribe-analysis:${payload.projectId}:${payload.analysisRunId}:${event.stage}:${event.status}`,
    status: event.status,
    userId: payload.userId,
    orgId,
    projectId: payload.projectId,
    creditTransactionId: payload.creditTransactionId,
    service: 'editron',
    action: 'auto_edit_analysis',
    route: '/api/internal/workers/tribe-analysis',
    provider: event.provider,
    model: event.model,
    operation: event.operation,
    estimatedCostUsd: event.estimatedCostUsd,
    costBasis: event.costBasis,
    units: event.units,
    metadata: {
      stage: event.stage,
      segmentCount: payload.segmentInputs?.length ?? 0,
      visualSegmentCount: payload.visualSegmentInputs?.length ?? 0,
      ...event.metadata,
    },
  });
}

function sumSegmentSeconds(segments: Array<{ startMs: number; endMs: number }> = []): number | undefined {
  const seconds = segments.reduce((sum, segment) => {
    const durationMs = Math.max(0, (segment.endMs ?? 0) - (segment.startMs ?? 0));
    return sum + durationMs / 1000;
  }, 0);
  return seconds > 0 ? seconds : undefined;
}

function msToSeconds(ms: unknown): number | undefined {
  return typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 ? ms / 1000 : undefined;
}

function settledErrorClass(result: PromiseSettledResult<unknown>): string | undefined {
  if (result.status !== 'rejected') return undefined;
  return result.reason instanceof Error ? result.reason.name : 'Error';
}

export const POST = withInternalQStashWorkerAuth(handler, 'tribe-analysis');
