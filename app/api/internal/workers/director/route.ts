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
import {
  runCanonicalDirectorV1,
  type CanonicalDirectorRunInputV1,
} from '@/lib/editron/services/canonical-director-run';

export const runtime = 'nodejs';
// 800 (not 300): a 20-min+ video's Director (load + Creative Brief + Path D + EDL execute + save) runs right
// at ~300s and 504'd mid-EDL before persisting (0.3% over). Siblings video-analysis + tribe-analysis are
// already 800 for long videos; the Director was the outlier left at 300.
export const maxDuration = 800;

async function handler(request: NextRequest) {
  try {
    const payload: CanonicalDirectorRunInputV1 = await request.json();
    if (!payload.projectId || !payload.userId || !payload.profileId) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const result = await runCanonicalDirectorV1(payload);
    if (result.disposition === 'ALREADY_PROCESSED') {
      return NextResponse.json({ success: true, skipped: true, reason: 'already_processed' });
    }
    if (result.disposition === 'DISPATCH_PENDING') {
      return NextResponse.json(
        { success: false, error: { code: 'DIRECTOR_DISPATCH_PENDING', projectId: result.projectId } },
        { status: 503 },
      );
    }
    if (result.disposition === 'ASSIST_READY') {
      return NextResponse.json({
        success: true,
        projectId: result.projectId,
        status: result.status,
        directorSkipped: true,
      });
    }
    if (result.disposition === 'OWNERSHIP_LOST') {
      return NextResponse.json({
        success: true,
        projectId: result.projectId,
        skipped: true,
        reason: 'ownership_lost',
      });
    }
    return NextResponse.json({ success: true, totalMs: result.directorMs, ...result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[DirectorWorker] Failed: ${msg}`);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export const POST = withInternalQStashWorkerAuth(handler, 'director');
