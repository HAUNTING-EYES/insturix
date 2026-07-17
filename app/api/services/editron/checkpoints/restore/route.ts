/**
 * POST /api/services/editron/checkpoints/restore
 * Restore verified editor-owned project state from a checkpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkpointService } from '@/lib/editron/services/checkpoint-service';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    const body = await request.json() as { checkpointId?: unknown; projectId?: unknown };
    const checkpointId = typeof body.checkpointId === 'string' ? body.checkpointId.trim() : '';
    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : '';

    if (!checkpointId || !projectId) {
      return NextResponse.json(
        { success: false, error: 'checkpointId and projectId are required' },
        { status: 400 }
      );
    }

    const checkpoint = await checkpointService.getCheckpoint(checkpointId, userId);
    if (!checkpoint) {
      return NextResponse.json(
        { success: false, error: 'Checkpoint not found' },
        { status: 404 }
      );
    }
    if (checkpoint.projectId !== projectId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Checkpoint belongs to a different project',
          code: 'CHECKPOINT_PROJECT_MISMATCH',
        },
        { status: 409 }
      );
    }

    const verification = await checkpointService.restoreProjectCheckpoint(checkpointId, userId);
    if (!verification.restored) {
      console.error('[CheckpointRestore] Full-state restore was not verified', {
        checkpointId,
        projectId,
        reason: verification.reason,
        expectedStateHash: verification.expectedStateHash,
        actualStateHash: verification.actualStateHash,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Checkpoint restore could not be verified',
          code: 'CHECKPOINT_RESTORE_NOT_VERIFIED',
          reason: verification.reason,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      checkpointId,
      projectId,
      restoredFields: checkpoint.projectState?.presentFields ?? [],
      reloadProject: true,
      verification: {
        expectedStateHash: verification.expectedStateHash,
        actualStateHash: verification.actualStateHash,
      },
    });
  } catch (error: unknown) {
    console.error('Error restoring checkpoint:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to restore checkpoint',
      },
      { status: 500 }
    );
  }
}
