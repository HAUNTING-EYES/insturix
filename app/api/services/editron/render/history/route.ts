import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getRenderHistoryForProject } from '@/lib/editron/services/render-job-service';

/**
 * GET /api/services/editron/render/history?projectId=xxx
 * Returns render history for a project (completed and failed renders)
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { type: 'error', message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json(
        { type: 'error', message: 'Missing projectId parameter' },
        { status: 400 }
      );
    }

    const history = await getRenderHistoryForProject(projectId, userId, 10);

    return NextResponse.json({
      type: 'success',
      data: {
        renders: history.map(job => ({
          id: job._id,
          status: job.status,
          url: job.outputUrl,
          size: job.outputSize,
          error: job.error,
          completedAt: job.completedAt,
          expiresAt: job.expiresAt,
        })),
      }
    });
  } catch (error: any) {
    console.error('Error fetching render history:', error);
    return NextResponse.json(
      { type: 'error', message: error.message || 'Failed to fetch render history' },
      { status: 500 }
    );
  }
}
