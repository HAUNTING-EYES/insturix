/**
 * POST /api/services/editron/checkpoints/restore
 * Restore from checkpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkpointService } from '@/lib/services/checkpoint-service';
import { getUserId } from '@/components/editor/version-7.0.0/utils/user-id';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const userId = getUserId();
    const body = await request.json();
    const { checkpointId } = body;

    if (!checkpointId) {
      return NextResponse.json(
        { success: false, error: 'checkpointId is required' },
        { status: 400 }
      );
    }

    const overlays = await checkpointService.restoreCheckpoint(checkpointId, userId);

    if (!overlays) {
      return NextResponse.json(
        { success: false, error: 'Checkpoint not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      overlays,
    });
  } catch (error: any) {
    console.error('Error restoring checkpoint:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to restore checkpoint' },
      { status: 500 }
    );
  }
}
