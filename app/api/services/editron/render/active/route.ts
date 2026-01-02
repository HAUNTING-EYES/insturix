import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getActiveRendersForUser } from '@/lib/editron/services/render-job-service';

/**
 * GET /api/services/editron/render/active
 * Returns all active renders for the current user (for resume-on-refresh)
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { type: 'error', message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const activeRenders = await getActiveRendersForUser(userId);

    return NextResponse.json({
      type: 'success',
      data: {
        renders: activeRenders.map(job => ({
          renderId: job._id,
          projectId: job.projectId,
          status: job.status,
          progress: job.progress,
          bucketName: job.bucketName,
          region: job.region,
          startedAt: job.startedAt,
        })),
      }
    });
  } catch (error: any) {
    console.error('Error fetching active renders:', error);
    return NextResponse.json(
      { type: 'error', message: error.message || 'Failed to fetch active renders' },
      { status: 500 }
    );
  }
}
