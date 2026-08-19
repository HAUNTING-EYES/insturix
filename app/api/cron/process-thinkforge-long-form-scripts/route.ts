import { NextRequest, NextResponse } from 'next/server';
import { recoverStalledLongFormScriptJobs } from '@/lib/thinkforge/long-form/script-generation-job';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron/process-thinkforge-long-form-scripts] CRON_SECRET is not configured.');
    return NextResponse.json({ ok: false, error: 'Cron authentication is not configured.' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const recovery = await recoverStalledLongFormScriptJobs();
    return NextResponse.json({ ok: true, recovery, timestamp: new Date().toISOString() });
  } catch {
    console.error('[cron/process-thinkforge-long-form-scripts] recovery failed.');
    return NextResponse.json({ ok: false, error: 'Long-form script recovery failed.' }, { status: 500 });
  }
}
