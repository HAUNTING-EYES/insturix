import { NextRequest, NextResponse } from 'next/server';
import { recoverStalledPostMortemJobs } from '@/lib/thinkforge/post-mortem/post-mortem-job';
import { safePostMortemJobErrorMessage } from '@/lib/thinkforge/post-mortem/post-mortem-job-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron/process-thinkforge-post-mortems] CRON_SECRET is not configured.');
    return NextResponse.json({ ok: false, error: 'Cron authentication is not configured.' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const recovery = await recoverStalledPostMortemJobs();
    return NextResponse.json({ ok: true, recovery, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[cron/process-thinkforge-post-mortems] recovery failed:', {
      error: safePostMortemJobErrorMessage(error),
    });
    return NextResponse.json({ ok: false, error: 'Post-mortem recovery failed.' }, { status: 500 });
  }
}
