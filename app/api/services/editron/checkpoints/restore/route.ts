/**
 * POST /api/services/editron/checkpoints/restore
 * Restore verified editor-owned project state from a checkpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkpointService } from '@/lib/editron/services/checkpoint-service';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';

export const runtime = 'nodejs';

const RestoreCheckpointSchema = z.object({
  checkpointId: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  expectedRevision: z.object({
    schemaVersion: z.literal(1),
    value: z.number().int().nonnegative(),
    compatibilityUpdatedAt: z.string().datetime(),
  }).strict(),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    const validation = RestoreCheckpointSchema.safeParse(await request.json());
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid checkpoint restore request', details: validation.error.issues },
        { status: 400 }
      );
    }
    const { checkpointId, projectId, expectedRevision } = validation.data;

    const checkpoint = await checkpointService.getCheckpoint(checkpointId, userId, projectId);
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

    const verification = await checkpointService.restoreProjectCheckpoint(checkpointId, userId, {
      projectId,
      expectedRevision,
      actorKind: 'USER',
    });
    if (!verification.restored) {
      return NextResponse.json(
        {
          success: false,
          error: 'Checkpoint restore is unsafe or could not be verified',
          code: 'CHECKPOINT_RESTORE_UNSAFE_UNDO',
          reason: verification.reason,
          currentRevision: verification.currentRevision,
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
      revision: verification.restoredRevision,
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
