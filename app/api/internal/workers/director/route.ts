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
import { withInternalQStashWorkerAuth } from '@/lib/editron/security/internal-worker-auth';
import { resolveDirectorCompletionHealth } from '@/lib/editron/services/editron-learning-gate';
import {
  normalizeEditorialPreferences,
  type EditorialPreferences,
} from '@/lib/editron/production-brief/editorial-preferences';

export const runtime = 'nodejs';
// 800 (not 300): a 20-min+ video's Director (load + Creative Brief + Path D + EDL execute + save) runs right
// at ~300s and 504'd mid-EDL before persisting (0.3% over). Siblings video-analysis + tribe-analysis are
// already 800 for long videos; the Director was the outlier left at 300.
export const maxDuration = 800;

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
  editorialPreferences?: EditorialPreferences;
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
      motionGraphics, pacingFeel, musicPreference, editorialPreferences: payloadEditorialPreferences,
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

    // Director Mode (assist lane): scans are complete — hand the pen to the user.
    // The Director never runs, and post-director bookkeeping (quality review,
    // learning gate, bandit) evaluates Director output, so it is skipped with it.
    const { isAssistProject, ASSIST_STATUS_READY } = await import('@/lib/editron/services/assist-lane');
    if (isAssistProject(projectDoc)) {
      await db.collection('projects').updateOne(
        // Cancel wins: a user-cancelled (scan_failed, refunded) project is never resurrected.
        { projectId, autoEditStatus: { $ne: 'scan_failed' } },
        { $set: { autoEditStatus: ASSIST_STATUS_READY, autoEditCompletedAt: new Date() } },
      );
      console.log(`[DirectorMode] Assist scan complete — director skipped (project ${projectId}).`);
      return NextResponse.json({ success: true, projectId, status: ASSIST_STATUS_READY, directorSkipped: true });
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
    const editorialPreferences = normalizeEditorialPreferences(payloadEditorialPreferences)
      ?? normalizeEditorialPreferences(projectDoc.editorialPreferences)
      ?? normalizeEditorialPreferences(projectDoc.productionBrief?.editorialPreferences);
    const userPrefs = {
      ...(captionStyle && { captionStyle }),
      ...(transitionPreference && { transitionPreference }),
      ...(zoomBehavior && { zoomBehavior }),
      ...(motionGraphics && { motionGraphics }),
      ...(pacingFeel && { pacingFeel }),
      ...(musicPreference && { musicPreference }),
      ...(platform && { platform }),
      ...(userIntent && { intent: userIntent }),
      ...(editorialPreferences && { editorialPreferences }),
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
    // ProjectService owns durable stage state. This route only observes progress;
    // the Director carries the writer-issued revision/lease through every stage.
    // The client reads it through GET /api/services/editron/projects/[id].
    const emitProgress = (step: number, total: number, desc: string) => {
      console.log(`[DirectorWorker] Director ${step}/${total}: ${desc}`);
    };
    const directorResult = await executeDirectorPlan(
      projectId, userId, profileId, brief, {
        persistProjectProgress: true,
        onProgress: emitProgress,
      },
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
      { projection: { 'qualityReview.overallScore': 1, 'qualityReview.criticalCount': 1, 'intelligence.renderedQualityEvidence': 1 } },
    );
    const renderedQualityEvidence = projectAfterDirector?.intelligence?.renderedQualityEvidence;
    const completionHealth = resolveDirectorCompletionHealth(
      projectAfterDirector?.qualityReview,
      renderedQualityEvidence,
    );
    const completionSet: Record<string, unknown> = {
      autoEditStatus: completionHealth.autoEditStatus,
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

    // Ownership guard (Director Mode rescue seam): the director owns this project
    // ONLY while autoEditStatus === 'directing' — the lock it claimed at the top,
    // which executeDirectorPlan never moves off 'directing'. If the stuck-recovery
    // cron declared this (still-running) worker failed and the user RESCUED the
    // project into Director Mode (editMode=assist, ready_for_chat) before we
    // finished, resurrecting it to 'complete' would apply a full auto-edit to a
    // project the user chose to hand-direct — violating the assist lane's zero-edit
    // invariant AND giving away a free edit. Commit only while still 'directing';
    // if we lost ownership, skip the completion AND the post-director bookkeeping.
    const completionWrite = await db.collection('projects').updateOne(
      { projectId, autoEditStatus: 'directing' },
      completionUpdate,
    );
    if (completionWrite.matchedCount !== 1) {
      console.warn(`[DirectorWorker] ${projectId}: completion skipped — no longer 'directing' (recovered/rescued/cancelled mid-run). Not resurrecting.`);
      return NextResponse.json({ success: true, projectId, skipped: true, reason: 'ownership_lost' });
    }

    if (directorDecisionAuthority) {
      const signalAuditTotal = directorDecisionAuthority.signalAudit?.totalCount ?? 0;
      console.log(
        `[DirectorWorker] Decision authority: source=${directorDecisionAuthority.source}, ` +
        `mode=${directorDecisionAuthority.decisionMode ?? 'unknown'}, ` +
        `executable=${directorDecisionAuthority.executableProducer}, ` +
        `signal-role=${directorDecisionAuthority.signalDecisionRole}, ` +
        `added=${directorDecisionAuthority.addedSignalDecisionCount}, ` +
        `audit=${signalAuditTotal}`
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
        const outcome = await recordProjectOutcome(userId, projectId, completionHealth.qualityScore, false, false, {
          evidenceSource: renderedQualityEvidence?.qualityEvidenceSource,
          renderedAestheticStatus:
            renderedQualityEvidence?.renderedAestheticStatus ??
            renderedQualityEvidence?.renderedQualityStatus ??
            renderedQualityEvidence?.artifactStatus,
        });
        if (!outcome.recorded) {
          console.log(`[DirectorWorker] Bandit: skipped (${outcome.reason ?? 'not_recorded'})`);
        }
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
      completionHealth,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[DirectorWorker] Failed: ${msg}`);

    if (trackedProjectId) {
      try {
        const { getDatabase } = await import('@/lib/editron/db/mongodb');
        const db = await getDatabase();
        const { settleAssistScanFailure } = await import('@/lib/editron/services/assist-lane');
        // Assist lane: scan_failed + refund-where-deducted; auto → plain 'failed'.
        const settlement = await settleAssistScanFailure(db, trackedProjectId, `Director: ${msg}`);
        if (settlement === 'not-assist') {
          await db.collection('projects').updateOne(
            { projectId: trackedProjectId },
            { $set: { autoEditStatus: 'failed', autoEditError: `Director: ${msg}` } },
          );
        }
      } catch (err: unknown) { console.warn('[DirectorWorker] best-effort status update failed:', err instanceof Error ? err.message : err); }
    }

    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export const POST = withInternalQStashWorkerAuth(handler, 'director');
