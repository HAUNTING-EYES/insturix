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

export const runtime = 'nodejs';
export const maxDuration = 30;

const STUCK_THRESHOLD_MS = 30 * 60 * 1000;

const ACTIVE_STATES: ProjectStatus[] = [
  'scripting',
  'storyboarding',
  'generating',
  'editing',
  'reviewing',
  'rendering',
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
        status: { $in: ACTIVE_STATES },
        updatedAt: { $lt: cutoff },
      })
      .project({ projectId: 1, userId: 1, status: 1, updatedAt: 1, _id: 0 })
      .limit(50)
      .toArray();

    if (stuckProjects.length === 0) {
      return NextResponse.json({ ok: true, recovered: 0 });
    }

    let recovered = 0;
    const details: Array<{ projectId: string; from: string }> = [];

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
        details.push({ projectId: project.projectId, from: project.status });
        console.log(`[StuckRecovery] ${project.projectId}: ${project.status} → failed`);
      }
    }

    return NextResponse.json({ ok: true, recovered, found: stuckProjects.length, details });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[StuckRecovery] Error:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
