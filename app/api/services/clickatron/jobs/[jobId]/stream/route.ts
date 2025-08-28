import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getJob, validateJobOwnership, isTerminalStatus } from '@/lib/clickatron-jobs';
import { JobStatusEvent } from '@/types/clickatron';

// GET /api/services/clickatron/jobs/:jobId/stream - SSE stream for job status
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

    // Validate job exists and user owns it
    const job = await getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const isOwner = await validateJobOwnership(jobId, userId);
    if (!isOwner) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Set up SSE response
    const responseStream = new ReadableStream({
      async start(controller) {
        // Send initial job status
        const initialEvent: JobStatusEvent = {
          type: 'status',
          data: job,
          timestamp: Date.now(),
        };
        controller.enqueue(`event: status\ndata: ${JSON.stringify(initialEvent)}\n\n`);

        // Poll for updates (fallback for environments without Redis pub/sub)
        let lastStatus = job.status;
        let lastProgress = job.progress;
        let lastStage = job.stage;
        let isConnected = true;

        const pollInterval = setInterval(async () => {
          if (!isConnected) return;

          try {
            const currentJob = await getJob(jobId);
            if (!currentJob) {
              controller.enqueue(`event: error\ndata: ${JSON.stringify({ message: 'Job not found' })}\n\n`);
              controller.close();
              clearInterval(pollInterval);
              return;
            }

            // Send updates only if something changed
            let hasChanges = false;
            const events: JobStatusEvent[] = [];

            if (currentJob.status !== lastStatus) {
              events.push({
                type: currentJob.status as 'completed' | 'failed' | 'canceled',
                data: { status: currentJob.status },
                timestamp: Date.now(),
              });
              lastStatus = currentJob.status;
              hasChanges = true;
            }

            if (currentJob.progress !== lastProgress) {
              events.push({
                type: 'progress',
                data: { progress: currentJob.progress, stage: currentJob.stage },
                timestamp: Date.now(),
              });
              lastProgress = currentJob.progress;
              hasChanges = true;
            }

            if (currentJob.stage !== lastStage) {
              lastStage = currentJob.stage;
              hasChanges = true;
            }

            // Send status update if any changes
            if (hasChanges) {
              events.push({
                type: 'status',
                data: currentJob,
                timestamp: Date.now(),
              });
            }

            // Send all events
            for (const event of events) {
              controller.enqueue(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
            }

            // Close stream if job is terminal
            if (isTerminalStatus(currentJob.status)) {
              controller.close();
              clearInterval(pollInterval);
            }
          } catch (error) {
            console.error('Error polling job status:', error);
            controller.enqueue(`event: error\ndata: ${JSON.stringify({ message: 'Failed to poll job status' })}\n\n`);
          }
        }, 1000); // Poll every second

        // Set timeout for long-running connections (95 seconds max)
        const timeout = setTimeout(() => {
          if (isConnected) {
            controller.close();
            clearInterval(pollInterval);
          }
        }, 95 * 1000);

        // Handle client disconnect
        request.signal.addEventListener('abort', () => {
          isConnected = false;
          clearInterval(pollInterval);
          clearTimeout(timeout);
          controller.close();
        });
      },
    });

    return new Response(responseStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      },
    });
  } catch (error) {
    console.error('Error setting up job stream:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}