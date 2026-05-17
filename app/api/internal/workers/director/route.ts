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

    await db.collection('projects').updateOne(
      { projectId },
      { $set: { autoEditStatus: 'directing' } },
    );

    const projectDoc = await db.collection('projects').findOne({ projectId });
    if (!projectDoc) {
      throw new Error(`Project ${projectId} not found`);
    }

    const rawFootageAnalysis = projectDoc.rawFootageAnalysis;
    const syntheticStoryboard = projectDoc.syntheticStoryboard;

    if (!rawFootageAnalysis) {
      console.warn(`[DirectorWorker] rawFootageAnalysis is null for ${projectId} — Stage 1 data may not have replicated. Director will run with degraded profile detection.`);
    }

    // ─── Profile detection ────────────────────────────────────────
    let profileId = initialProfileId;
    if (rawFootageAnalysis?.contentTypeDetection?.confidence >= 0.5) {
      profileId = rawFootageAnalysis.contentTypeDetection.profileId;
      console.log(`[DirectorWorker] Profile from content-type detector: ${profileId} (${rawFootageAnalysis.contentTypeDetection.contentType}, confidence=${rawFootageAnalysis.contentTypeDetection.confidence.toFixed(2)})`);
    } else {
      try {
        const { getAutoSelectedProfile } = await import('@/lib/editron/services/profile-detection-service');
        const { profile } = getAutoSelectedProfile({
          title: syntheticStoryboard?.title || title || '',
          contentType: syntheticStoryboard?.contentType || 'video',
          platform: syntheticStoryboard?.platform || 'youtube',
          scenes: syntheticStoryboard?.scenes?.map((s: any) => ({
            narration: s.descriptor?.narration,
            visualDescription: s.descriptor?.visualDescription,
            mood: s.descriptor?.mood,
            editDirections: s.descriptor?.editDirections,
          })) || [],
          globalEditDirections: syntheticStoryboard?.globalEditDirections,
          overallMusicPrompt: syntheticStoryboard?.overallMusicPrompt,
        });
        if (profile?.profileId) profileId = profile.profileId;
        console.log(`[DirectorWorker] Profile from SyntheticStoryboard: ${profileId}`);
      } catch {
        console.warn(`[DirectorWorker] Profile detection failed, using ${profileId}`);
      }
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
    await db.collection('projects').updateOne(
      { projectId },
      {
        $set: {
          autoEditStatus: 'complete',
          autoEditCompletedAt: new Date(),
          autoEditDurationMs: totalPipelineMs,
          directorDurationMs: directorMs,
          directorProfileUsed: profileId,
        },
      },
    );

    console.log(`[DirectorWorker] Complete: ${projectId} in ${totalMs}ms (${directorResult.actionsExecuted} actions)`);

    // ─── Bandit outcome recording ─────────────────────────────────
    try {
      const projectAfterDirector = await db.collection('projects').findOne(
        { projectId },
        { projection: { 'qualityReview.overallScore': 1, 'qualityReview.criticalCount': 1 } },
      );
      const qualityScore = projectAfterDirector?.qualityReview?.overallScore ?? 50;
      const criticalCount = projectAfterDirector?.qualityReview?.criticalCount ?? 0;

      if (criticalCount > 5) {
        console.log(`[DirectorWorker] Bandit: skipping — ${criticalCount} critical issues suggests system failure`);
      } else {
        const { recordProjectOutcome } = await import('@/lib/editron/services/genre-parameter-bandit');
        await recordProjectOutcome(userId, projectId, qualityScore, false, false);
      }
    } catch (banditErr: unknown) {
      const msg = banditErr instanceof Error ? banditErr.message : String(banditErr);
      console.warn(`[DirectorWorker] Bandit outcome recording failed (non-fatal): ${msg}`);
    }

    return NextResponse.json({ success: true, totalMs, actionsExecuted: directorResult.actionsExecuted });

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
      } catch { /* best-effort status update */ }
    }

    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export const POST = process.env.QSTASH_CURRENT_SIGNING_KEY
  ? verifySignatureAppRouter(handler)
  : handler;
