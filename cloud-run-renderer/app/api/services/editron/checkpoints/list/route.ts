/**
 * GET /api/services/editron/checkpoints/list
 * Get checkpoints for a session
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkpointService } from '@/lib/services/checkpoint-service';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'sessionId is required' },
        { status: 400 }
      );
    }

    const checkpoints = await checkpointService.getCheckpoints(sessionId);

    return NextResponse.json({
      success: true,
      checkpoints,
    });
  } catch (error: any) {
    console.error('Error listing checkpoints:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to list checkpoints' },
      { status: 500 }
    );
  }
}
