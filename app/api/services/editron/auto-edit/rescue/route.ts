/**
 * POST /api/services/editron/auto-edit/rescue
 *
 * Director Mode rescue (CEO plan Lane E): reopen a FAILED auto-edit as a
 * Director Mode project the user can direct via chat, instead of dead-ending.
 * The scans and the laid-down timeline are already there (a director-stage
 * failure keeps them) — so this is FREE and just flips the lane:
 *
 *   auto {failed|needs_input} + timeline + scan evidence ──► assist ready_for_chat
 *
 * Gated by canRescueToDirectorMode (same predicate the client uses to show the
 * CTA), the server-side feature flag, and an atomic transition so a double-click
 * or a race can only rescue once.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import {
  ASSIST_STATUS_READY,
  canRescueToDirectorMode,
  isAssistIntakeEnabled,
} from '@/lib/editron/services/assist-lane';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAssistIntakeEnabled()) {
      return NextResponse.json({ success: false, error: 'Director Mode is not available.' }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const projectId = typeof body?.projectId === 'string' ? body.projectId.trim() : '';
    if (!projectId) {
      return NextResponse.json({ success: false, error: 'projectId is required' }, { status: 400 });
    }

    const db = await getDatabase();
    const project = await db.collection(COLLECTIONS.PROJECTS).findOne(
      { projectId, userId },
      { projection: { editMode: 1, autoEditStatus: 1, overlays: 1, rawFootageAnalysis: 1, segmentAnalysis: 1 } },
    );
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }
    // Already in Director Mode — idempotent success (a double-click after the flip).
    if (project.editMode === 'assist' && project.autoEditStatus === ASSIST_STATUS_READY) {
      return NextResponse.json({ success: true, projectId, status: ASSIST_STATUS_READY, alreadyRescued: true });
    }
    if (!canRescueToDirectorMode(project)) {
      return NextResponse.json(
        { success: false, error: 'This project can\'t be reopened in Director Mode.', code: 'not_rescuable' },
        { status: 409 },
      );
    }

    // Atomic: only the request that still sees a rescuable failure status performs
    // the flip. FREE — the scans were already paid for on the original auto edit.
    const result = await db.collection(COLLECTIONS.PROJECTS).updateOne(
      { projectId, userId, autoEditStatus: { $in: ['failed', 'needs_input'] } },
      {
        $set: {
          editMode: 'assist',
          autoEditStatus: ASSIST_STATUS_READY,
          assistRescuedFrom: project.autoEditStatus,
          assistRescuedAt: new Date(),
          updatedAt: new Date(),
        },
        $unset: { autoEditError: '' },
      },
    );
    if (result.modifiedCount !== 1) {
      // Lost the race (another request flipped it, or status changed) — report the
      // outcome without a second write.
      return NextResponse.json({ success: true, projectId, status: ASSIST_STATUS_READY, alreadyRescued: true });
    }

    console.log(`[DirectorMode] Rescued failed auto project ${projectId} into Director Mode (free).`);
    return NextResponse.json({ success: true, projectId, status: ASSIST_STATUS_READY });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[DirectorMode] Rescue failed: ${msg}`);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
