/**
 * GET /api/services/editron/checkpoints/list
 * Get checkpoints for a session
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkpointService } from '@/lib/editron/services/checkpoint-service';
import { ProjectNotFoundOrForbiddenError } from '@/lib/editron/services/project-service';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    const sessionId = searchParams.get('sessionId');
    const projectId = searchParams.get('projectId');

    if (!sessionId || !projectId) {
      return NextResponse.json(
        { success: false, error: 'sessionId and projectId are required' },
        { status: 400 }
      );
    }

    const checkpoints = await checkpointService.getCheckpoints(sessionId, userId, projectId);

    return NextResponse.json({
      success: true,
      checkpoints,
    });
  } catch (error: unknown) {
    if (error instanceof ProjectNotFoundOrForbiddenError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: 404 },
      );
    }
    console.error('Error listing checkpoints:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list checkpoints' },
      { status: 500 }
    );
  }
}
