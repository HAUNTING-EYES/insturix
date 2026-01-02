import { NextResponse } from 'next/server';
import { processQueue, getQueueLength } from '@/lib/editron/services/render-queue-service';

/**
 * POST /api/cron/process-render-queue
 * Called by Vercel Cron to process queued render jobs
 * 
 * Add to vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/process-render-queue",
 *     "schedule": "* * * * *"
 *   }]
 * }
 */
export async function POST(request: Request) {
  try {
    // Verify cron secret (optional but recommended)
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const queueLength = await getQueueLength();
    console.log(`Processing render queue. Current length: ${queueLength}`);

    if (queueLength === 0) {
      return NextResponse.json({ 
        processed: false, 
        message: 'Queue is empty' 
      });
    }

    const result = await processQueue();

    return NextResponse.json({
      processed: result.processed,
      renderId: result.renderId,
      remainingQueue: await getQueueLength(),
    });
  } catch (error: any) {
    console.error('Error processing render queue:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process queue' },
      { status: 500 }
    );
  }
}

// Also support GET for manual triggering
export async function GET(request: Request) {
  return POST(request);
}
