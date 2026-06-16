/**
 * POST /api/internal/workers/director
 *
 * QStash worker — Stage 2 of two-stage pipeline.
 *
 * Stage 1 (video-analysis) handles:
 *   transcription → cuts → VU → V-JEPA + Wav2Vec → store to MongoDB
 *
 * Stage 2 (this) handles:
 *   profile detection → Creative Brief → Director execution → quality review
 *
 * All analysis data is read from MongoDB (stored by Stage 1).
 * Critical path: ~120s (Creative Brief 60s + execution 30s + captions 30s).
 *
 * Why this exists: a 20-min video's analysis + directing exceeds 800s in
 * one function. proj_YH4AyxeGMWvY placed 31 transitions then died at 800s —
 * captions, zooms, quality review never ran. Splitting guarantees both
 * stages complete with headroom.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { resolveEditronLearningOutcome } from '@/lib/editron/services/editron-learning-gate';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface DirectorWorkerPayload {
  projectId: string;
  userId: string;
  profileId: string;
  title?: string;
  platform?: string;
  userIntent?: string;
  captionStyle?: string;
  transitionPreference?: string;
  zoomBehavior?: string;
  motionGraphics?: string;
  pacingFeel?: string;
  musicPreference?: string;
}

interface DirectorQualityReviewSnapshot {
  overallScore?: unknown;
  criticalCount?: unknown;
}

interface DirectorCompletionHealth {
  hasQualityReview: boolean;
  qualityScore: number;
  criticalCount: number;
  needsQualityAttention: boolean;
  warning?: string;
}

export function resolveDirectorCompletionHealth(
  qualityReview: DirectorQualityReviewSnapshot | null | undefined,
): DirectorCompletionHealth {
  const hasQualityReview = !!qualityReview;
  const qualityScore = readFiniteNumber(qualityReview?.overallScore, 0);
  const criticalCount = Math.max(0, Math.round(readFiniteNumber(qualityReview?.criticalCount, 0)));
  const learningDecision = resolveEditronLearningOutcome({
    hasQualityReview,
    qualityScore,
    criticalCount,
  });
  const needsQualityAttention = !learningDecision.shouldRecord;

  return {
    hasQualityReview,
    qualityScore,
    criticalCount,
    needsQualityAttention,
    ...(needsQualityAttention && {
      warning: !hasQualityReview
        ? 'Director completed without a persisted quality review.'
        : `Director completed with quality score ${qualityScore} and ${criticalCount} critical issue(s).`,
    }),
  };
}

async function handler(request: NextRequest) {
  const startMs = Date.now();
  console.log('[DirectorWorker] Started');
  let trackedProjectId: string | undefined;

  try {
    const payload: DirectorWorkerPayload = await request.json();
    const {
      projectId, userId, profileId: initialProfileId,
      title, platform, userIntent,
      captionStyle, transitionPreference, zoomBehavior,
      motionGraphics, pacingFeel, musicPreference,
    } = payload;
    trackedProjectId = projectId;

    if (!projectId || !userId) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();

    const lockResult = await db.collection('projects').findOneAndUpdate(
      { projectId, autoEditStatus: { $in: ['analysis_complete', 'directing_queued'] } },
      { $set: { autoEditStatus: 'directing', updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!lockResult) {
      const current = await db.collection('projects').findOne({ projectId }, { projection: { autoEditStatus: 1 } });
      console.log(`[DirectorWorker] Skipping ${projectId}: status is '${current?.autoEditStatus}' (not directing_queued/analysis_complete). Already processed or in progress.`);
      return NextResponse.json({ success: true, skipped: true, reason: 'already_processed' });
    }

    const projectDoc = lockResult;
    if (!projectDoc) {
      throw new Error(`Project ${projectId} not found`);
    }

    const rawFootageAnalysis = projectDoc.rawFootageAnalysis;
    const syntheticStoryboard = projectDoc.syntheticStoryboard;

    if (!rawFootageAnalysis) {
      console.warn(`[DirectorWorker] rawFootageAnalysis is null for ${projectId} — Stage 1 data may not have replicated. Director will run with degraded profile detection.`);
    }

    // D-016: Profile selection removed — signal system + Utility AI drive all editing decisions.
    const profileId = initialProfileId;
    if (rawFootageAnalysis?.contentTypeDetection) {
      console.log(`[DirectorWorker] Content type: ${rawFootageAnalysis.contentTypeDetection.contentType} (confidence=${rawFootageAnalysis.contentTypeDetection.confidence.toFixed(2)}, profile=${profileId})`);
    }

    // ─── Build brief from preferences + editDNA (from MongoDB) ────
    const editDNA = projectDoc.referenceEditDNA;
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

    let brief: any = undefined;
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

    // ─── Execute Director ─────────────────────────────────────────
    const { executeDirectorPlan } = await import('@/lib/editron/agent/director-agent');
    const directorResult = await executeDirectorPlan(
      projectId, userId, profileId, brief,
      (step, total, desc) => console.log(`[DirectorWorker] Director ${step}/${total}: ${desc}`),
    );

    // ─── Mark complete ────────────────────────────────────────────
    const directorMs = Date.now() - startMs;
    const pipelineStartedAt = projectDoc.autoEditStartedAt;
    const totalPipelineMs = pipelineStartedAt
      ? Date.now() - new Date(pipelineStartedAt).getTime()
      : directorMs;
    const directorDecisionAuthority = directorResult.decisionAuthority;
    const projectAfterDirector = await db.collection('projects').findOne(
      { projectId },
      { projection: { 'qualityReview.overallScore': 1, 'qualityReview.criticalCount': 1 } },
    );
    const completionHealth = resolveDirectorCompletionHealth(projectAfterDirector?.qualityReview);
    const completionSet: Record<string, unknown> = {
      autoEditStatus: 'complete',
      autoEditCompletedAt: new Date(),
      autoEditDurationMs: totalPipelineMs,
      directorDurationMs: directorMs,
      directorProfileUsed: profileId,
      ...(directorDecisionAuthority ? { 'intelligence.decisionAuthority': directorDecisionAuthority } : {}),
    };
    const completionUpdate: Record<string, unknown> = { $set: completionSet };
    if (completionHealth.needsQualityAttention) {
      completionSet.projectStatus = 'needs-attention';
      completionSet.autoEditHealth = 'needs_review';
      completionSet.autoEditWarning = completionHealth.warning;
    } else {
      completionUpdate.$unset = { autoEditHealth: '', autoEditWarning: '' };
    }

    await db.collection('projects').updateOne({ projectId }, completionUpdate);

    if (directorDecisionAuthority) {
      console.log(
        `[DirectorWorker] Decision authority: source=${directorDecisionAuthority.source}, ` +
        `executable=${directorDecisionAuthority.executableProducer}, ` +
        `signal-role=${directorDecisionAuthority.signalDecisionRole}, ` +
        `added=${directorDecisionAuthority.addedSignalDecisionCount}`
      );
    }
    console.log(`[DirectorWorker] Complete: ${projectId} in ${directorMs}ms (${directorResult.actionsExecuted} actions)`);
    if (completionHealth.needsQualityAttention) {
      console.warn(`[DirectorWorker] Needs attention: ${projectId} qualityScore=${completionHealth.qualityScore} criticalCount=${completionHealth.criticalCount}`);
    }

    // ─── Bandit outcome recording ─────────────────────────────────
    try {
      if (completionHealth.needsQualityAttention) {
        console.log(`[DirectorWorker] Bandit: skipping — ${completionHealth.criticalCount} critical issues suggests system failure`);
      } else {
        const { recordProjectOutcome } = await import('@/lib/editron/services/genre-parameter-bandit');
        await recordProjectOutcome(userId, projectId, completionHealth.qualityScore, false, false);
      }
    } catch (banditErr: unknown) {
      const msg = banditErr instanceof Error ? banditErr.message : String(banditErr);
      console.warn(`[DirectorWorker] Bandit outcome recording failed (non-fatal): ${msg}`);
    }

    return NextResponse.json({
      success: true,
      totalMs: directorMs,
      actionsExecuted: directorResult.actionsExecuted,
      decisionAuthority: directorDecisionAuthority,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[DirectorWorker] Failed: ${msg}`);

    if (trackedProjectId) {
      try {
        const { getDatabase } = await import('@/lib/editron/db/mongodb');
        const db = await getDatabase();
        await db.collection('projects').updateOne(
          { projectId: trackedProjectId },
          { $set: { autoEditStatus: 'failed', autoEditError: `Director: ${msg}` } },
        );
      } catch (err: unknown) { console.warn('[DirectorWorker] best-effort status update failed:', err instanceof Error ? err.message : err); }
    }

    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export const POST = process.env.QSTASH_CURRENT_SIGNING_KEY
  ? verifySignatureAppRouter(handler)
  : handler;

function readFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
