import { NextResponse } from 'next/server';

import { sweepChatReferenceStyleJobs } from '@/lib/editron/services/chat-reference-style-job';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SWEEP_WINDOW_MS = 15 * 60 * 1_000;

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
  try {
    const result = await sweepChatReferenceStyleJobs({
      now,
      dedupSalt: `sweep:${Math.floor(now.getTime() / SWEEP_WINDOW_MS)}`,
    });
    console.log(
      `[ReferenceStyleSweep] scanned=${result.scanned} redispatched=${result.redispatched} terminalized=${result.terminalized} errors=${result.errors}`,
    );
    return NextResponse.json({ success: result.errors === 0, ...result }, {
      status: result.errors === 0 ? 200 : 207,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[ReferenceStyleSweep] sweep failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
