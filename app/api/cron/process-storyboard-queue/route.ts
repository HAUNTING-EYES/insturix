/**
 * GET /api/cron/process-storyboard-queue
 *
 * Cron job that processes the storyboard image generation queue.
 * Runs every minute via Vercel Cron. Processes up to 4 scenes in parallel.
 */

import { NextRequest, NextResponse } from 'next/server';
import { processNextStoryboardJob, getStoryboardQueueLength } from '@/lib/pipeline/storyboard-queue-service';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

export async function GET(request: NextRequest) {
  try {
    const ua = request.headers.get('user-agent') || '';
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}` && !ua.includes('vercel-cron')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const queueLength = await getStoryboardQueueLength();
    if (queueLength === 0) {
      return NextResponse.json({ message: 'Storyboard queue empty', queueLength: 0, processed: 0 });
    }

    console.log(`[storyboard-queue-cron] Queue length: ${queueLength}. Processing...`);

    const results = await Promise.allSettled([
      processNextStoryboardJob(),
      processNextStoryboardJob(),
      processNextStoryboardJob(),
      processNextStoryboardJob(),
    ]);

    const processed = results.filter(r => r.status === 'fulfilled' && r.value.processed).length;
    const errors = results.filter(r => r.status === 'fulfilled' && r.value.error).map(r => (r as any).value.error);

    console.log(`[storyboard-queue-cron] Processed ${processed} jobs. Errors: ${errors.length}`);

    return NextResponse.json({
      message: `Processed ${processed} storyboard jobs`,
      queueLength: queueLength - processed,
      processed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('[storyboard-queue-cron] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
