/**
 * POST /api/services/editron/auto-edit/rescue
 *
 * Director Mode rescue (CEO plan Lane E): reopen a FAILED auto-edit as a
 * Director Mode project the user can direct via chat, instead of dead-ending.
 * The scans and the laid-down timeline are already there (a director-stage
 * failure keeps them) — so this is FREE and just flips the lane:
 *
 *   auto failed + timeline + scan evidence ──► assist ready_for_chat
 *
 * Gated by canRescueToDirectorMode (same predicate the client uses to show the
 * CTA), the server-side feature flag, and an atomic transition so a double-click
 * or a race can only rescue once.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  ASSIST_STATUS_READY,
  isAssistIntakeEnabled,
} from '@/lib/editron/services/assist-lane';
import {
  ProjectMutationConflictError,
  ProjectNotFoundOrForbiddenError,
  projectService,
} from '@/lib/editron/services/project-service';

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

    const snapshot = await projectService.loadProjectForMutation(userId, projectId);
    const result = await projectService.rescueFailedAutoEditToAssistV1(userId, projectId, {
      expectedRevision: snapshot.revision,
    });
    if (result.disposition === 'PROJECT_NOT_FOUND') {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }
    if (result.disposition === 'NOT_ELIGIBLE') {
      return NextResponse.json(
        { success: false, error: 'This project can\'t be reopened in Director Mode.', code: 'not_rescuable' },
        { status: 409 },
      );
    }
    if (result.disposition === 'ALREADY_RESCUED') {
      return NextResponse.json({ success: true, projectId, status: ASSIST_STATUS_READY, alreadyRescued: true });
    }
    return NextResponse.json({ success: true, projectId, status: ASSIST_STATUS_READY });
  } catch (error: unknown) {
    if (error instanceof ProjectNotFoundOrForbiddenError) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }
    if (error instanceof ProjectMutationConflictError) {
      return NextResponse.json(
        { success: false, error: 'The project changed before it could be reopened.', code: 'project_changed' },
        { status: 409 },
      );
    }
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[DirectorMode] Rescue failed: ${msg}`);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
