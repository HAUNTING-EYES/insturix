/**
 * POST /api/services/editron/director/execute
 *
 * Execute a Director Agent plan on an Editron project.
 * Applies an edit profile's action sequence deterministically.
 *
 * Body: { projectId, editProfileId, brief? }
 * Returns: DirectorResult
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { executeDirectorPlan } from '@/lib/editron/agent/director-agent';

export const runtime = 'nodejs';
export const maxDuration = 120; // Director Agent should complete within 2 minutes

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, editProfileId, brief } = body;

    if (!projectId) {
      return NextResponse.json({ success: false, error: 'projectId is required' }, { status: 400 });
    }
    if (!editProfileId) {
      return NextResponse.json({ success: false, error: 'editProfileId is required' }, { status: 400 });
    }

    console.log(`[Director] Executing profile ${editProfileId} on project ${projectId}`);

    const result = await executeDirectorPlan(
      projectId,
      userId,
      editProfileId,
      brief,
    );

    return NextResponse.json({
      success: result.success,
      ...result,
    });
  } catch (error: any) {
    console.error('[Director] Route error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Director Agent execution failed' },
      { status: 500 },
    );
  }
}
