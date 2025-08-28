import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getJob, validateJobOwnership, isTerminalStatus } from '@/lib/clickatron-jobs';
import { JobStatusResponse } from '@/types/clickatron';

// GET /api/services/clickatron/jobs/:jobId - Get job status
export async function GET(
  request: Request,
  { params }: { params: { jobId: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId } = params;

    if (!jobId || typeof jobId !== 'string') {
      return NextResponse.json({ error: 'Invalid Job ID' }, { status: 400 });
    }

    // Get job from Redis
    const job = await getJob(jobId);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Validate ownership
    const isOwner = await validateJobOwnership(jobId, userId);
    if (!isOwner) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const response: JobStatusResponse = {
      job,
      isTerminal: isTerminalStatus(job.status),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching job status:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// DELETE /api/services/clickatron/jobs/:jobId - Cancel job
export async function DELETE(
  request: Request,
  { params }: { params: { jobId: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId } = params;

    if (!jobId || typeof jobId !== 'string') {
      return NextResponse.json({ error: 'Invalid Job ID' }, { status: 400 });
    }

    // Get current job
    const job = await getJob(jobId);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Validate ownership
    const isOwner = await validateJobOwnership(jobId, userId);
    if (!isOwner) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check if job can be canceled
    if (isTerminalStatus(job.status)) {
      return NextResponse.json(
        { error: 'Job is already in terminal state', previousStatus: job.status },
        { status: 400 }
      );
    }

    // Import cancel function
    const { cancelJob } = await import('@/lib/clickatron-jobs');

    // Cancel the job
    const updatedJob = await cancelJob(jobId);

    if (!updatedJob) {
      return NextResponse.json({ error: 'Failed to cancel job' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      previousStatus: job.status,
      job: updatedJob,
    });
  } catch (error) {
    console.error('Error canceling job:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}