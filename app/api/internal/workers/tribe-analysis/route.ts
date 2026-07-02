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
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { resolveEditronLearningOutcome } from '@/lib/editron/services/editron-learning-gate';
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
  videoUrl: string;
  segmentInputs: { startMs: number; endMs: number }[];
  visualSegmentInputs?: { startMs: number; endMs: number }[];
  directorPayload: Record<string, unknown>;
  creditTransactionId?: string;
  chargedCredits?: number;
}

async function handler(request: NextRequest) {
  const startMs = Date.now();
  console.log('[TribeWorker] Started');
  let trackedProjectId: string | undefined;
  let directorDispatched = false;

  try {
    const payload: TribeAnalysisPayload = await request.json();
    const { projectId, userId, videoUrl, segmentInputs, visualSegmentInputs, directorPayload } = payload;
    trackedProjectId = projectId;

    if (!projectId || !userId || !videoUrl) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
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
      console.log(`[TribeWorker] ${projectId} already claimed by a concurrent worker (duplicate QStash delivery) — skipping to avoid GPU contention`);
      return NextResponse.json({ success: true, skipped: 'duplicate-delivery', stage: 'tribe-analysis' });
    }
    console.log(`[TribeWorker] Claimed ${projectId} (tribe lock acquired)`);

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

        console.log(
          `[TribeWorker] TRIBE Phase 2: ${
            vjepaAnalysis
              ? `reusing pre-cut V-JEPA (${vjepaAnalysis.segments.length} segments)`
              : `dispatching V-JEPA for ${vjepaSegmentInputs.length} visual segments`
          }; Wav2Vec for ${segmentInputs.length} speech segments...`
        );

        const [vjepaResult, wav2vecResult, musicResult] = await Promise.allSettled([
          vjepaAnalysis
            ? Promise.resolve(vjepaAnalysis)
            : (async () => {
                const { analyzeVideoWithVjepa } = await import('@/lib/editron/services/vjepa-service');
                return analyzeVideoWithVjepa(videoUrl, vjepaSegmentInputs);
              })(),
          (async () => {
            const { analyzeAudioWithWav2Vec } = await import('@/lib/editron/services/wav2vec-service');
            return analyzeAudioWithWav2Vec(videoUrl, segmentInputs);
          })(),
          (async () => {
            const { analyzeMusicContent } = await import('@/lib/editron/services/music-analysis-service');
            return analyzeMusicContent(videoUrl);
          })(),
        ]);

        // Handle V-JEPA result
        if (vjepaResult.status === 'fulfilled' && vjepaResult.value) {
          vjepaAnalysis = vjepaResult.value;
          const avgSig = vjepaAnalysis.segments.reduce((s: number, r: any) => s + r.visualSignificance, 0) / vjepaAnalysis.segments.length;
          console.log(`[TribeWorker] V-JEPA: ${vjepaAnalysis.segments.length} segments analyzed (avg significance=${avgSig.toFixed(2)}, ${vjepaAnalysis.processingTimeMs}ms)`);
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
        if (wav2vecResult.status === 'fulfilled' && wav2vecResult.value) {
          wav2vecAnalysis = wav2vecResult.value;
          const avgEmo = wav2vecAnalysis.segments.reduce((s: number, r: any) => s + r.emotionIntensity, 0) / wav2vecAnalysis.segments.length;
          console.log(`[TribeWorker] Wav2Vec: ${wav2vecAnalysis.segments.length} segments analyzed (avg emotion=${avgEmo.toFixed(2)}, ${wav2vecAnalysis.processingTimeMs}ms)`);
        } else {
          const msg = wav2vecResult.status === 'rejected' ? (wav2vecResult.reason?.message || String(wav2vecResult.reason)) : 'returned null';
          console.warn(`[TribeWorker] Wav2Vec skipped: ${msg}`);
        }
        await recordTribeCostEvent(payload, wav2vecResult.status === 'fulfilled' && wav2vecResult.value
          ? {
              stage: 'wav2vec_modal',
              status: 'success',
              provider: 'modal',
              model: wav2vecResult.value.modelVersion || 'wav2vec-2.0',
              operation: 'gpu_audio_analysis',
              units: {
                requestCount: 1,
                mediaSeconds: speechRequestedSeconds,
                functionMs: wav2vecResult.value.processingTimeMs,
                gpuSeconds: msToSeconds(wav2vecResult.value.processingTimeMs),
              },
              metadata: {
                requestedSegmentCount: segmentInputs.length,
                analyzedSegmentCount: wav2vecResult.value.segments?.length ?? 0,
              },
            }
          : {
              stage: 'wav2vec_modal',
              status: 'failed',
              provider: 'modal',
              model: 'wav2vec-2.0',
              operation: 'gpu_audio_analysis',
              units: { requestCount: 1, mediaSeconds: speechRequestedSeconds },
              metadata: {
                requestedSegmentCount: segmentInputs.length,
                resultStatus: wav2vecResult.status,
                errorClass: settledErrorClass(wav2vecResult),
              },
            });

        // Handle Music Analysis result
        let musicAnalysis: any = null;
        if (musicResult.status === 'fulfilled' && musicResult.value) {
          musicAnalysis = musicResult.value;
          console.log(`[TribeWorker] Music: BPM=${musicAnalysis.bpm}, ${musicAnalysis.beats.length} beats, presence=${musicAnalysis.musicPresence.toFixed(2)}, ${musicAnalysis.processingTimeMs}ms`);
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
            await db.collection('projects').updateOne(
              { projectId },
              { $set: { musicAnalysis } },
            );
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
      { projection: { rawFootageAnalysis: 1, syntheticStoryboard: 1, referenceEditDNA: 1, referenceVideoAnalysis: 1 } },
    );
    const rawFootageAnalysis = projectDoc?.rawFootageAnalysis;
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
        console.log(`[TribeWorker] Moment weights: Phase ${weightMap.computation_phase}, ${weightMap.weights.length} segments, avg=${(weightMap.weights.reduce((s: number, w: any) => s + w.final_weight, 0) / Math.max(weightMap.weights.length, 1)).toFixed(2)}`);
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
        if (segmentAnalysis) {
          console.log(`[TribeWorker] SegmentAnalysis: ${segmentAnalysis.meta.segmentCount} segments, vjepa=${segmentAnalysis.meta.hasVjepa}, wav2vec=${segmentAnalysis.meta.hasWav2vec}, phase=${segmentAnalysis.meta.momentWeightPhase}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[TribeWorker] SegmentAnalysis build failed (non-fatal): ${msg}`);
      }
    }

    // ─── Step 4b: Store Phase 2 results on project doc ────────────
    await db.collection('projects').updateOne(
      { projectId },
      {
        $set: {
          autoEditStatus: 'analysis_complete',
          ...(vjepaAnalysis && { vjepaAnalysis }),
          ...(wav2vecAnalysis && { wav2vecAnalysis }),
          ...(momentWeightMap && { momentWeightMap }),
          ...(segmentAnalysis && { segmentAnalysis }),
          updatedAt: new Date(),
        },
      },
    );

    // ─── Step 5: Dispatch Director to separate worker ─────────────
    if (process.env.QSTASH_TOKEN) {
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
      const dispatchData = await dispatchRes.json().catch(() => ({}));
      const totalMs = Date.now() - startMs;
      console.log(`[TribeWorker] TRIBE complete: ${projectId} in ${totalMs}ms. Director dispatched (messageId=${dispatchData.messageId || 'unknown'}).`);
      return NextResponse.json({ success: true, totalMs, stage: 'tribe-analysis' });
    }

    // ─── Dev fallback: no QStash → run Director inline ────────────
    console.warn(`[TribeWorker] No QSTASH_TOKEN — running Director inline`);
    await db.collection('projects').updateOne(
      { projectId },
      { $set: { autoEditStatus: 'directing' } },
    );

    const initialProfileId = (directorPayload.profileId as string) || 'G-01';
    const title = (directorPayload.title as string) || '';
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
    if (rawFootageAnalysis?.contentTypeDetection) {
      console.log(`[TribeWorker] Content type: ${rawFootageAnalysis.contentTypeDetection.contentType} (confidence=${rawFootageAnalysis.contentTypeDetection.confidence.toFixed(2)}, profile=${profileId})`);
    }

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
    const directorResult = await executeDirectorPlan(
      projectId, userId, profileId, brief,
      (step, total, desc) => console.log(`[TribeWorker] Director ${step}/${total}: ${desc}`),
    );

    const totalMs = Date.now() - startMs;
    const projectAfterDirector = await db.collection('projects').findOne(
      { projectId },
      { projection: { 'qualityReview.overallScore': 1, 'qualityReview.criticalCount': 1 } },
    );
    const learningDecision = resolveEditronLearningOutcome({
      hasQualityReview: !!projectAfterDirector?.qualityReview,
      qualityScore: projectAfterDirector?.qualityReview?.overallScore,
      criticalCount: projectAfterDirector?.qualityReview?.criticalCount,
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

    console.log(`[TribeWorker] Complete (inline): ${projectId} in ${totalMs}ms (${directorResult.actionsExecuted} actions)`);

    try {
      if (learningDecision.shouldRecord && learningDecision.qualityScore !== null) {
        const { recordProjectOutcome } = await import('@/lib/editron/services/genre-parameter-bandit');
        await recordProjectOutcome(userId, projectId, learningDecision.qualityScore, false, false);
      } else {
        console.log(`[TribeWorker] Bandit: skipping inline Director outcome (${learningDecision.reason ?? 'not_recordable'})`);
      }
    } catch (e) { console.warn(`[TribeWorker] Non-fatal error:`, e instanceof Error ? e.message : e); }

    return NextResponse.json({ success: true, totalMs });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[TribeWorker] Failed: ${msg}`);

    // Mark project as failed — but only if Director hasn't already been dispatched
    // (if dispatched, the Director worker owns the final status)
    if (trackedProjectId && !directorDispatched) {
      try {
        const { getDatabase } = await import('@/lib/editron/db/mongodb');
        const db = await getDatabase();
        await db.collection('projects').updateOne(
          { projectId: trackedProjectId },
          { $set: { autoEditStatus: 'failed', autoEditError: msg } },
        );
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

// QStash signature verification — skip in dev if signing keys not set
export const POST = process.env.QSTASH_CURRENT_SIGNING_KEY
  ? verifySignatureAppRouter(handler)
  : handler;
