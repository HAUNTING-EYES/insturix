import { NextResponse } from 'next/server';

import {
  dispatchMgRenderJob,
} from '@/lib/editron/motion-graphics/codegen/mg-render-job-runner';
import { findStaleMgRenderJobs } from '@/lib/editron/motion-graphics/codegen/mg-render-job-service';

export const runtime = 'nodejs';
export const maxDuration = 60;

// One re-dispatch per lease window (15 min): a job stalled within a window is dispatched once; the next window
// re-fires it if it is still stalled. Keeps a QStash content-dedup from swallowing the re-dispatch while
// preventing a per-minute cron from hammering the same job.
const LEASE_WINDOW_MS = 15 * 60 * 1_000;

/**
 * Watchdog for durable MG render jobs. The async render pipeline dispatches a job then returns; a worker renders
 * it and attaches the overlay. If a QStash message is lost, or a worker is killed mid-render (leaving the job
 * `running` with an expired lease), nothing re-triggers it — the render is silently dropped. This cron finds
 * those stalled-but-still-runnable jobs and re-dispatches them so a worker re-claims (claimMgRenderJob only
 * matches this exact set, and increments attemptCount; jobs past maxAttempts are excluded and terminally failed
 * by the runner, so this never loops forever). Mirrors cron/check-task-timeouts.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization');
  const userAgent = request.headers.get('user-agent') || '';
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = userAgent.includes('vercel-cron');
  const hasValidSecret = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
  if (!isVercelCron && !hasValidSecret) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const now = new Date();
  const dedupSalt = `sweep:${Math.floor(now.getTime() / LEASE_WINDOW_MS)}`;
  const result = { scanned: 0, redispatched: 0, errors: 0, details: [] as string[] };

  try {
    const stale = await findStaleMgRenderJobs({ now });
    result.scanned = stale.length;
    for (const job of stale) {
      try {
        await dispatchMgRenderJob(job, process.env, dedupSalt);
        result.redispatched += 1;
      } catch (error) {
        result.errors += 1;
        const message = error instanceof Error ? error.message : String(error);
        result.details.push(`${job._id} (${job.status}, attempt ${job.attemptCount}/${job.maxAttempts}): ${message}`);
        console.error(`[MGRenderSweep] re-dispatch failed for ${job._id}:`, message);
      }
    }
    console.log(`[MGRenderSweep] scanned=${result.scanned} redispatched=${result.redispatched} errors=${result.errors}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[MGRenderSweep] sweep failed:', message);
    return NextResponse.json({ success: false, error: message, ...result }, { status: 500 });
  }

  return NextResponse.json({ success: true, ...result });
}
