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
import { resolveEditronLearningOutcome } from '@/lib/editron/services/editron-learning-gate';
import { buildProjectAnalysisAssetSet, encodeProjectAnalysisAssetKey, persistProjectAssetAnalysis } from '@/lib/editron/services/project-analysis-storage';
import {
  recordProviderCostEvent,
  type ProviderCostEventStatus,
} from '@/lib/financials/provider-cost-events';
import type { ProviderCostBasis, ProviderCostUnits } from '@/lib/financials/provider-cost-estimates';

export const runtime = 'nodejs';
export const maxDuration = 800; // GPU analysis can take 5-8min for long videos

interface TribeAnalysisPayload {
  projectId: string;
  userId: string;
  orgId?: string;
  assetId?: string;
  videoUrl: string;
  segmentInputs: { startMs: number; endMs: number }[];
  visualSegmentInputs?: { startMs: number; endMs: number }[];
  directorPayload: Record<string, unknown>;
  creditTransactionId?: string;
  chargedCredits?: number;
}

async function handler(request: NextRequest) {
  const startMs = Date.now();
  let trackedScan: Pick<TribeAnalysisPayload, 'projectId' | 'userId' | 'creditTransactionId'> | undefined;
  let directorDispatched = false;

  try {
    const payload: TribeAnalysisPayload = await request.json();
    const { projectId, userId, assetId, videoUrl, segmentInputs, visualSegmentInputs, directorPayload } = payload;
    const sourceAssetId = typeof assetId === 'string' && assetId.trim().length > 0 ? assetId.trim() : null;
    trackedScan = { projectId, userId, creditTransactionId: payload.creditTransactionId };

    if (!projectId || !userId || !videoUrl) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

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

    // ─── Idempotency guard ─────────────────────────────────────────
    // QStash can redeliver this message (the worker runs ~8min, longer than QStash's effective
    // response wait even with Upstash-Timeout), spawning a SECOND concurrent tribe worker that
    // fights this one over the Modal GPU → V-JEPA/Wav2Vec abort (confirmed on real runs). Atomically
    // CLAIM the project so a duplicate delivery bails instead of double-running. Stale claims (>15min,
    // a crashed worker) are reclaimable; 15min > this route's maxDuration (800s) so a still-running
    // worker keeps the lock.
    const TRIBE_LOCK_STALE_MS = 15 * 60 * 1000;
    const claim = await db.collection('projects').updateOne(
      {
        projectId,
        $or: [
          { tribeLockAt: { $exists: false } },
          { tribeLockAt: null },
          { tribeLockAt: { $lt: new Date(Date.now() - TRIBE_LOCK_STALE_MS) } },
        ],
      },
      { $set: { tribeLockAt: new Date() } },
    );
    if (claim.matchedCount === 0) {
      return NextResponse.json({ success: true, skipped: 'duplicate-delivery', stage: 'tribe-analysis' });
    }

    const precomputedProjectDoc = await db.collection('projects').findOne(
      { projectId },
      { projection: { vjepaAnalysis: 1 } },
    );
    const precomputedVjepaAnalysis = precomputedProjectDoc?.vjepaAnalysis;

    // ─── Step 3.5: V-JEPA + Wav2Vec + Essentia GPU analysis ────────
    // Run visual significance (V-JEPA), vocal emotion (Wav2Vec), and music
    // analysis (Essentia) in parallel. All are non-fatal — pipeline falls
    // back to Phase 0 (Gemini-only) weights if GPU analysis fails.
    let vjepaAnalysis: any = Array.isArray(precomputedVjepaAnalysis?.segments) && precomputedVjepaAnalysis.segments.length > 0
      ? precomputedVjepaAnalysis
      : null;
    let wav2vecAnalysis: any = null;

    if (segmentInputs?.length > 0) {
      try {
        await db.collection('projects').updateOne(
          { projectId },
          { $set: { autoEditStatus: 'analyzing_deep' } },
        );

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
        let musicAnalysis: any = null;
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

        // Store music analysis on project for Director to read
        if (musicAnalysis) {
          try {
            const musicUpdatedAt = new Date();
            await db.collection('projects').updateOne(
              { projectId },
              {
                $set: {
                  musicAnalysis,
                  ...(sourceAssetId ? buildProjectAnalysisAssetSet(sourceAssetId, { musicAnalysis }, musicUpdatedAt) : {}),
                },
              },
            );

            if (sourceAssetId) {
              try {
                await persistProjectAssetAnalysis(db, projectId, sourceAssetId, { musicAnalysis }, musicUpdatedAt);
              } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(`[TribeWorker] Music per-asset analysis document write failed (non-fatal): ${msg}`);
              }
            }
          } catch (e) { console.warn(`[TribeWorker] Non-fatal error:`, e instanceof Error ? e.message : e); }
        }
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
      { projectId },
      { projection: { rawFootageAnalysis: 1, rawFootageAnalysisByAsset: 1, syntheticStoryboard: 1, referenceEditDNA: 1, referenceVideoAnalysis: 1 } },
    );
    const keyedRawFootageAnalysis = sourceAssetId
      ? projectDoc?.rawFootageAnalysisByAsset?.[encodeProjectAnalysisAssetKey(sourceAssetId)]
      : null;
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
    const phase2UpdatedAt = new Date();
    const phase2PerAssetSet = sourceAssetId
      ? buildProjectAnalysisAssetSet(sourceAssetId, {
        vjepaAnalysis,
        wav2vecAnalysis,
        momentWeightMap,
        segmentAnalysis,
      }, phase2UpdatedAt)
      : {};
    if (!sourceAssetId) {
      console.warn(`[TribeWorker] Missing assetId for per-asset analysis storage on ${projectId}; writing compatibility project fields only.`);
    }

    await db.collection('projects').updateOne(
      { projectId },
      {
        $set: {
          autoEditStatus: 'analysis_complete',
          ...(vjepaAnalysis && { vjepaAnalysis }),
          ...(wav2vecAnalysis && { wav2vecAnalysis }),
          ...(momentWeightMap && { momentWeightMap }),
          ...(segmentAnalysis && { segmentAnalysis }),
          ...phase2PerAssetSet,
          updatedAt: phase2UpdatedAt,
        },
      },
    );

    if (sourceAssetId) {
      try {
        await persistProjectAssetAnalysis(db, projectId, sourceAssetId, {
          vjepaAnalysis,
          wav2vecAnalysis,
          momentWeightMap,
          segmentAnalysis,
        }, phase2UpdatedAt);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[TribeWorker] Phase 2 per-asset analysis document write failed (non-fatal): ${msg}`);
      }
    }

    // ─── Step 5: Dispatch Director to separate worker ─────────────
    if (isInternalQStashDispatchConfigured()) {
      await db.collection('projects').updateOne(
        { projectId },
        { $set: { autoEditStatus: 'directing_queued' } },
      );

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
        },
        body: JSON.stringify(directorPayload),
      });

      const directorDispatchStatus: ProviderCostEventStatus = dispatchRes.ok ? 'success' : 'failed';
      await recordTribeCostEvent(payload, {
        stage: 'director_qstash',
        status: directorDispatchStatus,
        provider: 'upstash-qstash',
        operation: 'queue_message',
        units: { queueMessages: 1, requestCount: 1 },
        metadata: { httpStatus: dispatchRes.status },
      });

      if (!dispatchRes.ok) {
        const errBody = await dispatchRes.text().catch(() => 'no body');
        throw new Error(`Director QStash dispatch failed: HTTP ${dispatchRes.status} — ${errBody}`);
      }

      directorDispatched = true;
      const totalMs = Date.now() - startMs;
      return NextResponse.json({ success: true, totalMs, stage: 'tribe-analysis' });
    }

    // ─── Dev fallback: no QStash → run Director inline ────────────
    console.warn(`[TribeWorker] No QSTASH_TOKEN — running Director inline`);
    await db.collection('projects').updateOne(
      { projectId },
      { $set: { autoEditStatus: 'directing' } },
    );

    const initialProfileId = (directorPayload.profileId as string) || 'G-01';
    const platform = (directorPayload.platform as string) || 'youtube';
    const userIntent = directorPayload.userIntent as string | undefined;
    const captionStyle = directorPayload.captionStyle as string | undefined;
    const transitionPreference = directorPayload.transitionPreference as string | undefined;
    const zoomBehavior = directorPayload.zoomBehavior as string | undefined;
    const motionGraphics = directorPayload.motionGraphics as string | undefined;
    const pacingFeel = directorPayload.pacingFeel as string | undefined;
    const musicPreference = directorPayload.musicPreference as string | undefined;

    // D-016: Profile selection removed — signal system + Utility AI drive all editing decisions.
    const profileId = initialProfileId;

    const editDNA = projectDoc?.referenceEditDNA;
    let brief: any = undefined;
    const userPrefs = {
      ...(captionStyle && { captionStyle }),
      ...(transitionPreference && { transitionPreference }),
      ...(zoomBehavior && { zoomBehavior }),
      ...(motionGraphics && { motionGraphics }),
      ...(pacingFeel && { pacingFeel }),
      ...(musicPreference && { musicPreference }),
      ...(platform && { platform }),
      ...(userIntent && { intent: userIntent }),
    };
    if (editDNA) {
      brief = {
        ...userPrefs,
        overrides: {
          ...(editDNA.pacing?.overall && { pacing: editDNA.pacing.overall }),
          ...(editDNA.cutRhythm?.avgCutsPerMinute && { cutsPerMinute: editDNA.cutRhythm.avgCutsPerMinute }),
          ...(editDNA.transitions?.dominant && { defaultTransition: editDNA.transitions.dominant }),
          ...(editDNA.graphicsDensity && { graphicsDensity: editDNA.graphicsDensity }),
        },
      };
    } else if (Object.keys(userPrefs).length > 0) {
      brief = { ...userPrefs, modifiers: [] };
    }

    const { executeDirectorPlan } = await import('@/lib/editron/agent/director-agent');
    await executeDirectorPlan(projectId, userId, profileId, brief);

    const totalMs = Date.now() - startMs;
    const projectAfterDirector = await db.collection('projects').findOne(
      { projectId },
      { projection: { 'qualityReview.overallScore': 1, 'qualityReview.criticalCount': 1, 'intelligence.renderedQualityEvidence': 1 } },
    );
    const renderedQualityEvidence = projectAfterDirector?.intelligence?.renderedQualityEvidence;
    const learningDecision = resolveEditronLearningOutcome({
      hasQualityReview: !!projectAfterDirector?.qualityReview,
      qualityScore: projectAfterDirector?.qualityReview?.overallScore,
      criticalCount: projectAfterDirector?.qualityReview?.criticalCount,
      qualityEvidenceSource: renderedQualityEvidence?.qualityEvidenceSource,
      renderedQualityStatus: renderedQualityEvidence?.renderedQualityStatus,
      renderedAestheticStatus: renderedQualityEvidence?.renderedAestheticStatus,
      artifactStatus: renderedQualityEvidence?.artifactStatus,
      renderedAestheticFailFrameCount: renderedQualityEvidence?.renderedAestheticFailFrameCount,
    });
    const completionSet: Record<string, unknown> = {
      autoEditStatus: learningDecision.shouldRecord ? 'complete' : 'needs_review',
      autoEditCompletedAt: new Date(),
      autoEditDurationMs: totalMs,
      directorProfileUsed: profileId,
    };
    const completionUpdate: Record<string, unknown> = { $set: completionSet };
    if (!learningDecision.shouldRecord) {
      completionSet.projectStatus = 'needs-attention';
      completionSet.autoEditHealth = 'needs_review';
      completionSet.autoEditWarning = learningDecision.reason === 'missing_quality_review'
        ? 'Director completed without a persisted quality review.'
        : `Director completed with quality score ${learningDecision.qualityScore ?? 0} and ${projectAfterDirector?.qualityReview?.criticalCount ?? 0} critical issue(s).`;
    } else {
      completionUpdate.$unset = { autoEditHealth: '', autoEditWarning: '' };
    }
    await db.collection('projects').updateOne(
      { projectId },
      completionUpdate,
    );

    try {
      if (learningDecision.shouldRecord && learningDecision.qualityScore !== null) {
        const { recordProjectOutcome } = await import('@/lib/editron/services/genre-parameter-bandit');
        await recordProjectOutcome(userId, projectId, learningDecision.qualityScore, false, false, {
          evidenceSource: renderedQualityEvidence?.qualityEvidenceSource,
          renderedAestheticStatus:
            renderedQualityEvidence?.renderedAestheticStatus ??
            renderedQualityEvidence?.renderedQualityStatus ??
            renderedQualityEvidence?.artifactStatus,
        });
      }
    } catch (e) { console.warn(`[TribeWorker] Non-fatal error:`, e instanceof Error ? e.message : e); }

    return NextResponse.json({ success: true, totalMs });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[TribeWorker] Failed: ${msg}`);

    // Mark project as failed — but only if Director hasn't already been dispatched
    // (if dispatched, the Director worker owns the final status)
    if (trackedScan && !directorDispatched) {
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
          await db.collection('projects').updateOne(
            { projectId: trackedScan.projectId, userId: trackedScan.userId },
            { $set: { autoEditStatus: 'failed', autoEditError: msg } },
          );
        }
      } catch (e) { console.warn(`[TribeWorker] Status update failed:`, e instanceof Error ? e.message : e); }
    }

    return NextResponse.json({ success: false, error: msg }, { status: 500 });
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
    idempotencyKey: `editron:tribe-analysis:${payload.projectId}:${event.stage}:${event.status}`,
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
