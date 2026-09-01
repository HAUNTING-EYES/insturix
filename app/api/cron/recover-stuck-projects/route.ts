/**
 * GET /api/cron/recover-stuck-projects
 *
 * Recovers projects stuck in active states (generating, rendering, etc.)
 * for longer than 30 minutes. Transitions them to 'failed' with an
 * appropriate error message so users can retry.
 *
 * Called by Vercel cron every 15 minutes.
 */

import { NextResponse } from 'next/server';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import { transitionProjectStatus, type ProjectStatus } from '@/lib/shared/project-status';
import { recoverAssistScanSettlements } from '@/lib/editron/services/assist-refund-recovery';

export const runtime = 'nodejs';
export const maxDuration = 30;

const STUCK_THRESHOLD_MS = 30 * 60 * 1000;
// The heaviest auto-edit workers (video-analysis, tribe-analysis, director) run to
// maxDuration = 800s / 13.3 min on long videos, and can be legitimately SILENT for
// most of it — a single long operation only bumps updatedAt when it emits progress.
// The threshold MUST exceed 800s or the cron flips a still-ALIVE worker to `failed`.
// For `directing` that is not a cosmetic false-failure: a failed auto-edit is
// Director-Mode-rescuable, so the premature flip opens a rescue window and the
// finishing director then resurrects the rescued project (see the ownership guard in
// workers/director/route.ts). 20 min = 800s worker budget + margin for clock skew
// and the post-executor completion writes (quality review + bandit).
const AUTO_EDIT_STUCK_THRESHOLD_MS = 20 * 60 * 1000; // ← director maxDuration 800s (workers/director/route.ts:33) + margin

const ACTIVE_STATES: ProjectStatus[] = [
  'scripting',
  'storyboarding',
  'generating',
  'editing',
  'reviewing',
  'rendering',
];

const ACTIVE_AUTO_EDIT_STATES = [
  'queued',
  'analyzing',
  'transcribing',
  'cleaning',
  'computing_params',
  'analyzing_deep',
  'analysis_complete',
  'directing_queued',
  'directing',
];

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = await getDatabase();
    const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);

    const stuckProjects = await db
      .collection(COLLECTIONS.PROJECTS)
      .find({
        editMode: { $ne: 'assist' },
        status: { $in: ACTIVE_STATES },
        updatedAt: { $lt: cutoff },
      })
      .project({ projectId: 1, userId: 1, status: 1, updatedAt: 1, _id: 0 })
      .limit(50)
      .toArray();

    let recovered = 0;
    const details: Array<{ projectId: string; from: string; field: string }> = [];

    for (const project of stuckProjects) {
      const result = await transitionProjectStatus(
        project.projectId,
        project.userId,
        'failed',
        'cron:stuck-recovery',
        { message: `Stuck in '${project.status}' for over 30 minutes`, service: 'cron' },
      );

      if (result.success) {
        recovered++;
        details.push({ projectId: project.projectId, from: project.status, field: 'status' });
        console.log(`[StuckRecovery] ${project.projectId}: status=${project.status} → failed`);
      }
    }

    const assistRecovery = await recoverAssistScanSettlements(db, {
      staleBefore: new Date(Date.now() - AUTO_EDIT_STUCK_THRESHOLD_MS),
      limit: 10,
    });
    recovered += assistRecovery.recovered;
    details.push(...assistRecovery.details.map((detail) => ({
      projectId: detail.projectId,
      from: detail.outcome,
      field: 'assistSettlement',
    })));

    // ── Auto-edit pipeline recovery ──────────────────────────────
    // autoEditStatus is a separate field from status. Projects stuck in
    // analyzing/directing states are invisible to the status query above.
    // Without this, a Vercel timeout during directing leaves the project
    // permanently stuck — the error handler never runs when the function is killed.
    const stuckAutoEdits = await db
      .collection(COLLECTIONS.PROJECTS)
      .find({
        editMode: { $ne: 'assist' },
        autoEditStatus: { $in: ACTIVE_AUTO_EDIT_STATES },
        updatedAt: { $lt: new Date(Date.now() - AUTO_EDIT_STUCK_THRESHOLD_MS) },
      })
      .project({ projectId: 1, userId: 1, autoEditStatus: 1, updatedAt: 1, _id: 0 })
      .limit(50)
      .toArray();

    for (const project of stuckAutoEdits) {
      await db.collection(COLLECTIONS.PROJECTS).updateOne(
        { projectId: project.projectId, autoEditStatus: { $in: ACTIVE_AUTO_EDIT_STATES } },
        {
          $set: {
            autoEditStatus: 'failed',
            autoEditError: `Stuck in '${project.autoEditStatus}' for over 10 minutes (recovered by cron)`,
            updatedAt: new Date(),
          },
        },
      );
      recovered++;
      details.push({ projectId: project.projectId, from: project.autoEditStatus, field: 'autoEditStatus' });
      console.log(`[StuckRecovery] ${project.projectId}: autoEditStatus=${project.autoEditStatus} → failed`);
    }

    return NextResponse.json({
      ok: true,
      recovered,
      found: stuckProjects.length + assistRecovery.found + stuckAutoEdits.length,
      assistRefundPending: assistRecovery.pending,
      details,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[StuckRecovery] Error:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
