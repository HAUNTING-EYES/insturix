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
import { projectService } from '@/lib/editron/services/project-service';

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

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function validProjectStartMs(value: unknown): number | null {
  const date = value instanceof Date
    ? value
    : typeof value === 'string'
      ? new Date(value)
      : null;
  const milliseconds = date?.getTime();
  return milliseconds !== undefined && Number.isFinite(milliseconds)
    ? milliseconds
    : null;
}

async function handler(request: NextRequest) {
  const startMs = Date.now();
  console.log('[DirectorWorker] Started');
  let trackedDirectorRun: { projectId: string; userId: string; runToken: string } | undefined;
  let trackedAssistProject: { projectId: string; userId: string } | undefined;

  try {
    const payload: DirectorWorkerPayload = await request.json();
    const {
      projectId, userId, profileId: initialProfileId,
      title, platform, userIntent,
      captionStyle, transitionPreference, zoomBehavior,
      motionGraphics, pacingFeel, musicPreference, editorialPreferences: payloadEditorialPreferences,
    } = payload;
    if (!projectId || !userId) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const runClaim = await projectService.claimDirectorRunV1(userId, projectId);
    if (runClaim.disposition === 'PROJECT_NOT_FOUND' || runClaim.disposition === 'NOT_ELIGIBLE') {
      console.log(`[DirectorWorker] Skipping ${projectId}: Director run claim is ${runClaim.disposition}.`);
      return NextResponse.json({ success: true, skipped: true, reason: 'already_processed' });
    }

    // Director Mode (assist lane): scans are complete — hand the pen to the user.
    // The Director never runs, and post-director bookkeeping (quality review,
    // learning gate, bandit) evaluates Director output, so it is skipped with it.
    const { isAssistProject, ASSIST_STATUS_READY } = await import('@/lib/editron/services/assist-lane');
    if (runClaim.disposition === 'ASSIST_PROJECT') {
      const projectDoc = runClaim.project;
      if (!isAssistProject(projectDoc)) {
        throw new Error(`ProjectService returned an invalid assist Director claim for ${projectId}.`);
      }
      trackedAssistProject = { projectId, userId };
      const { getDatabase } = await import('@/lib/editron/db/mongodb');
      const db = await getDatabase();
      await db.collection('projects').updateOne(
        // Cancel wins: a user-cancelled (scan_failed, refunded) project is never resurrected.
        { projectId, userId, autoEditStatus: { $ne: 'scan_failed' } },
        { $set: { autoEditStatus: ASSIST_STATUS_READY, autoEditCompletedAt: new Date() } },
      );
      console.log(`[DirectorMode] Assist scan complete — director skipped (project ${projectId}).`);
      return NextResponse.json({ success: true, projectId, status: ASSIST_STATUS_READY, directorSkipped: true });
    }

    const projectDoc = asRecord(runClaim.project);
    if (!projectDoc) {
      throw new Error(`ProjectService returned an invalid claimed Director project for ${projectId}.`);
    }
    trackedDirectorRun = { projectId, userId, runToken: runClaim.runToken };

    const rawFootageAnalysis = asRecord(projectDoc.rawFootageAnalysis);
    const contentTypeDetection = rawFootageAnalysis
      ? asRecord(rawFootageAnalysis.contentTypeDetection)
      : null;

    if (!rawFootageAnalysis) {
      console.warn(`[DirectorWorker] rawFootageAnalysis is null for ${projectId} — Stage 1 data may not have replicated. Director will run with degraded profile detection.`);
    }

    // D-016: Profile selection removed — signal system + Utility AI drive all editing decisions.
    const profileId = initialProfileId;
    if (
      typeof contentTypeDetection?.contentType === 'string'
      && typeof contentTypeDetection.confidence === 'number'
      && Number.isFinite(contentTypeDetection.confidence)
    ) {
      console.log(`[DirectorWorker] Content type: ${contentTypeDetection.contentType} (confidence=${contentTypeDetection.confidence.toFixed(2)}, profile=${profileId})`);
    }

    // ─── Build brief from preferences + editDNA (from MongoDB) ────
    const editDNA = asRecord(projectDoc.referenceEditDNA);
    const editDnaPacing = editDNA ? asRecord(editDNA.pacing) : null;
    const editDnaCutRhythm = editDNA ? asRecord(editDNA.cutRhythm) : null;
    const editDnaTransitions = editDNA ? asRecord(editDNA.transitions) : null;
    const productionBrief = asRecord(projectDoc.productionBrief);
    const editorialPreferences = normalizeEditorialPreferences(payloadEditorialPreferences)
      ?? normalizeEditorialPreferences(projectDoc.editorialPreferences)
      ?? normalizeEditorialPreferences(productionBrief?.editorialPreferences);
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
          ...(editDnaPacing?.overall ? { pacing: editDnaPacing.overall } : {}),
          ...(editDnaCutRhythm?.avgCutsPerMinute ? { cutsPerMinute: editDnaCutRhythm.avgCutsPerMinute } : {}),
          ...(editDnaTransitions?.dominant ? { defaultTransition: editDnaTransitions.dominant } : {}),
          ...(editDNA.graphicsDensity ? { graphicsDensity: editDNA.graphicsDensity } : {}),
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
        deferProjectStatusTransitions: true,
        onProgress: emitProgress,
      },
    );
    if (!directorResult.success || !directorResult.terminalProjectReceipt) {
      throw new Error('Director completed without a terminal ProjectService receipt.');
    }

    // ─── Mark complete ────────────────────────────────────────────
    const directorMs = Date.now() - startMs;
    const pipelineStartedAtMs = validProjectStartMs(projectDoc.autoEditStartedAt);
    const totalPipelineMs = pipelineStartedAtMs === null
      ? directorMs
      : Math.max(directorMs, Date.now() - pipelineStartedAtMs);
    const directorDecisionAuthority = directorResult.decisionAuthority;
    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const db = await getDatabase();
    const projectAfterDirector = await db.collection('projects').findOne(
      { projectId, userId },
      { projection: { 'qualityReview.overallScore': 1, 'qualityReview.criticalCount': 1, 'intelligence.renderedQualityEvidence': 1 } },
    );
    const renderedQualityEvidence = projectAfterDirector?.intelligence?.renderedQualityEvidence;
    const completionHealth = resolveDirectorCompletionHealth(
      projectAfterDirector?.qualityReview,
      renderedQualityEvidence,
    );
    const completion = await projectService.completeDirectorRunV1(userId, projectId, {
      directorRunToken: trackedDirectorRun.runToken,
      expectedRevision: directorResult.terminalProjectReceipt.revision,
      terminalReceipt: directorResult.terminalProjectReceipt,
      totalPipelineMs,
      directorMs,
      profileId,
      autoEditStatus: completionHealth.autoEditStatus,
      needsQualityAttention: completionHealth.needsQualityAttention,
      ...(completionHealth.warning ? { autoEditWarning: completionHealth.warning } : {}),
      ...(directorDecisionAuthority ? { decisionAuthority: directorDecisionAuthority } : {}),
    });
    if (completion.disposition !== 'RECORDED') {
      console.warn(`[DirectorWorker] ${projectId}: completion skipped — Director run ownership is ${completion.disposition}.`);
      return NextResponse.json({ success: true, projectId, skipped: true, reason: 'ownership_lost' });
    }
    trackedDirectorRun = undefined;

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

    if (trackedDirectorRun) {
      try {
        const failure = await projectService.failDirectorRunV1(
          trackedDirectorRun.userId,
          trackedDirectorRun.projectId,
          {
            directorRunToken: trackedDirectorRun.runToken,
            errorMessage: `Director: ${msg}`,
          },
        );
        if (failure.disposition !== 'RECORDED') {
          console.warn(`[DirectorWorker] ${trackedDirectorRun.projectId}: failure terminalization skipped — ${failure.disposition}.`);
        }
      } catch (err: unknown) { console.warn('[DirectorWorker] ProjectService failure terminalization failed:', err instanceof Error ? err.message : err); }
    } else if (trackedAssistProject) {
      try {
        const { getDatabase } = await import('@/lib/editron/db/mongodb');
        const db = await getDatabase();
        const { settleAssistScanFailure } = await import('@/lib/editron/services/assist-lane');
        await settleAssistScanFailure(db, trackedAssistProject.projectId, `Director: ${msg}`);
      } catch (err: unknown) { console.warn('[DirectorWorker] Assist failure settlement failed:', err instanceof Error ? err.message : err); }
    }

    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export const POST = withInternalQStashWorkerAuth(handler, 'director');
