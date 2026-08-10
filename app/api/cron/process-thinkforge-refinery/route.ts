import { NextRequest, NextResponse } from 'next/server';
import { recoverStalledThinkForgeRefineryJobs } from '@/lib/thinkforge/refinery/refinery-job';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const recovery = await recoverStalledThinkForgeRefineryJobs();
    return NextResponse.json({ ok: true, recovery, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[cron/process-thinkforge-refinery] recovery failed:', error);
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown recovery failure.',
    }, { status: 500 });
  }
}
