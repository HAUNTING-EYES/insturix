import { NextRequest, NextResponse } from 'next/server';
import { recoverStalledThinkForgeObserverJobs } from '@/lib/thinkforge/events/observer-job';
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
    const [refinery, observer] = await Promise.allSettled([
      recoverStalledThinkForgeRefineryJobs(),
      recoverStalledThinkForgeObserverJobs(),
    ]);
    const failures = [refinery, observer].filter((result) => result.status === 'rejected');
    return NextResponse.json({
      ok: failures.length === 0,
      recovery: {
        refinery: settledValue(refinery),
        observer: settledValue(observer),
      },
      timestamp: new Date().toISOString(),
    }, { status: failures.length === 0 ? 200 : 500 });
  } catch (error) {
    console.error('[cron/process-thinkforge-refinery] recovery failed:', error);
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown recovery failure.',
    }, { status: 500 });
  }
}

function settledValue<T>(result: PromiseSettledResult<T>): T | { error: string } {
  return result.status === 'fulfilled'
    ? result.value
    : { error: result.reason instanceof Error ? result.reason.message : 'Unknown recovery failure.' };
}
