/**
 * GET /api/cron/process-video-queue
 *
 * Cron job that processes the video generation queue.
 * Runs every minute via Vercel Cron. Processes up to 4 scenes in parallel.
 *
 * Add to vercel.json crons:
 * { "path": "/api/cron/process-video-queue", "schedule": "* * * * *" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { processNextVideoJob, getVideoQueueLength } from '@/lib/pipeline/video-queue-service';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes — enough for 1-2 video generations

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret (Vercel sends this header)
    const authHeader = request.headers.get('authorization');
    if (
      process.env.CRON_SECRET &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      // Allow Vercel cron user agent
      const ua = request.headers.get('user-agent') || '';
      if (!ua.includes('vercel-cron')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const queueLength = await getVideoQueueLength();
    if (queueLength === 0) {
      return NextResponse.json({
        message: 'Video queue empty',
        queueLength: 0,
        processed: 0,
      });
    }

    console.log(`[video-queue-cron] Queue length: ${queueLength}. Processing...`);

    // Process multiple jobs in parallel (up to 4)
    const results = await Promise.allSettled([
      processNextVideoJob(),
      processNextVideoJob(),
      processNextVideoJob(),
      processNextVideoJob(),
    ]);

    const processed = results.filter(
      (r) => r.status === 'fulfilled' && r.value.processed,
    ).length;
    const errors = results
      .filter((r) => r.status === 'fulfilled' && r.value.error)
      .map((r) => (r as any).value.error);

    console.log(`[video-queue-cron] Processed ${processed} jobs. Errors: ${errors.length}`);

    return NextResponse.json({
      message: `Processed ${processed} video jobs`,
      queueLength: queueLength - processed,
      processed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('[video-queue-cron] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Queue processing failed' },
      { status: 500 },
    );
  }
}
